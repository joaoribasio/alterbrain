#!/usr/bin/env node
// ab-migration: Checks the skills and helpers you built, and your identity notes, for links to Alterbrain files that moved.
//
// Release 0.2.0 moved some framework files out of system/packs/mba/ (see "Moved" in the CHANGELOG). Files the person owns
// may still point to the old places: the skills and helpers they built (my-*, every text file inside whatever its
// extension: .md, .py, .yml, .sh ...) and the notes under vault/80_me (CLAUDE.md loads SOUL, IDENTITY, USER and MEMORY at
// the start of every session). They belong to the person, so this only reports: it adds a task and never writes any of
// them. Files it cannot check (over 1 MB, unreadable, links it does not follow, anything past the file limit) are said out
// loud and get a task of their own, so it never ends with "Nothing to do." after skipping work. Pictures, PDFs and other
// binary files are not text and are left out, as are third-party folders (node_modules, .git, .venv, venv, __pycache__).
// A private note that is locked (encrypted, key not on this computer) cannot be read: that stops the upgrade with a plain
// sentence, because this script never opens an encrypted file it cannot decrypt.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { runMigration, MigrationStop } from '../../lib/migrate.mjs';
import { addTask, formatTask, TASKS_FILE } from '../../lib/tasks.mjs';
import { readText } from '../../lib/fsx.mjs';

// Slashes and backslashes are both accepted (a backslash in JSON is written twice, so runs of them count as one).
const MOVED = /system\/packs\/mba\/(?:course-setup\.md|lenses\/|templates\/(?:assignment|rubric|decisions|critique)\.md|jobs-nl\/)/i;
const MAX_FILES = 2000;
const MAX_BYTES = 1024 * 1024;
const SHOWN = 3;
const VENDOR_FOLDERS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv']);
// Every file git-crypt writes starts with these ten bytes. A locked copy holds them where a private note should be.
const ENCRYPTED_HEADER = Buffer.from([0x00, 0x47, 0x49, 0x54, 0x43, 0x52, 0x59, 0x50, 0x54, 0x00]);

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const entries = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).sort(byName);
  } catch {
    return [];
  }
};
const posix = (p) => p.split(sep).join('/');

/** 'file', 'dir', 'link' or 'other' for a folder entry (a file system that gives no type is asked directly). */
function kindOf(entry, full) {
  if (entry.isSymbolicLink()) return 'link';
  if (entry.isDirectory()) return 'dir';
  if (entry.isFile()) return 'file';
  try {
    const stat = lstatSync(full);
    return stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other';
  } catch {
    return 'other';
  }
}

/** The text of a file, or why it cannot be searched: 'too-big', 'unreadable', 'binary' or 'locked'. */
function textOf(file) {
  let size;
  try {
    size = lstatSync(file).size;
  } catch {
    return { problem: 'unreadable' };
  }
  if (size > MAX_BYTES) return { problem: 'too-big' };
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    return { problem: 'unreadable' };
  }
  if (buf.subarray(0, ENCRYPTED_HEADER.length).equals(ENCRYPTED_HEADER)) return { problem: 'locked' };
  // Windows PowerShell saves scripts as UTF-16 by default: read those as text, not as a binary file.
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.toString('utf16le') };
  if (buf[0] === 0xfe && buf[1] === 0xff) return { text: Buffer.from(buf.subarray(0, buf.length - (buf.length % 2))).swap16().toString('utf16le') };
  if (buf.subarray(0, 8000).includes(0)) return { problem: 'binary' };
  return { text: buf.toString('utf8') };
}

await runMigration(async ({ root, dryRun, report }) => {
  const budget = { left: MAX_FILES, capped: false };
  const moved = { skills: new Set(), notes: new Set() };
  const unchecked = []; // { name, why }

  /** Look through one file or folder. `owner` is who it belongs to; `name` is how the person knows the file. */
  const examine = (file, owner, name, bucket) => {
    if (budget.left <= 0) {
      budget.capped = true;
      return;
    }
    budget.left--;
    const got = textOf(file);
    if (got.problem === 'binary') return;
    if (got.problem === 'locked') {
      throw new MigrationStop('Some of your private notes are locked on this computer, so I could not check them for links to files that moved. Unlock them with your key file (see the guide "Encrypting your private notes"), then finish the update again.');
    }
    if (got.problem) {
      unchecked.push({ name, why: got.problem });
      return;
    }
    if (MOVED.test(got.text.replace(/\\+/g, '/'))) bucket.add(owner);
  };

  const walk = (dir, owner, nameBase, bucket) => {
    for (const e of entries(dir)) {
      if (budget.capped) return;
      const full = join(dir, e.name);
      const name = `${nameBase}/${e.name}`;
      const kind = kindOf(e, full);
      if (kind === 'link') unchecked.push({ name, why: 'link' });
      else if (kind === 'dir') {
        if (!VENDOR_FOLDERS.has(e.name.toLowerCase())) walk(full, owner, name, bucket);
      } else if (kind === 'file') examine(full, owner, name, bucket);
    }
  };

  // 1. .claude/skills/my-*/ : every file inside, links not followed.
  const skillsDir = join(root, '.claude', 'skills');
  for (const e of entries(skillsDir)) {
    if (!e.name.startsWith('my-') || budget.capped) continue;
    const full = join(skillsDir, e.name);
    const kind = kindOf(e, full);
    if (kind === 'link') unchecked.push({ name: e.name, why: 'link' });
    else if (kind === 'dir') walk(full, e.name, e.name, moved.skills);
  }

  // 2. .claude/agents/my-*.md
  const agentsDir = join(root, '.claude', 'agents');
  for (const e of entries(agentsDir)) {
    if (!e.name.startsWith('my-') || !e.name.endsWith('.md') || budget.capped) continue;
    const full = join(agentsDir, e.name);
    const kind = kindOf(e, full);
    if (kind === 'link') unchecked.push({ name: e.name, why: 'link' });
    else if (kind === 'file') examine(full, e.name.slice(0, -3), e.name, moved.skills);
  }

  // 3. The notes under vault/80_me (the ones CLAUDE.md loads, and the folders beside them).
  const meDir = join(root, 'vault', '80_me');
  if (existsSync(meDir)) {
    const walkNotes = (dir) => {
      for (const e of entries(dir)) {
        if (budget.capped) return;
        const full = join(dir, e.name);
        const name = posix(relative(meDir, full));
        const kind = kindOf(e, full);
        if (kind === 'link') unchecked.push({ name: `vault/80_me/${name}`, why: 'link' });
        else if (kind === 'dir') walkNotes(full);
        else if (kind === 'file') examine(full, name, `vault/80_me/${name}`, moved.notes);
      }
    };
    walkNotes(meDir);
  }

  /** Add a task once: a run that finds the same task already on the list adds nothing and says nothing. */
  const addOnce = (task, sentence) => {
    if (existsSync(TASKS_FILE()) && readText(TASKS_FILE()).includes(formatTask(task))) return;
    if (!dryRun) addTask(task);
    report(sentence);
  };
  const list = (names) => {
    const sorted = [...names].sort();
    return sorted.length <= SHOWN ? sorted.join(', ') : `${sorted.slice(0, SHOWN).join(', ')} and ${sorted.length - SHOWN} more`;
  };

  // The files that point to moved places.
  const skills = [...moved.skills].sort();
  const notes = [...moved.notes].sort();
  if (skills.length + notes.length > 0) {
    const subjects = [];
    if (skills.length) subjects.push(`skills or helpers (${skills.join(', ')})`);
    if (notes.length) subjects.push(`notes (${notes.join(', ')})`);
    const total = skills.length + notes.length;
    const counted = [];
    if (skills.length) counted.push(`${skills.length} of your own skills or helpers`);
    if (notes.length) counted.push(`${notes.length} of your notes`);
    addOnce(
      {
        text: `Your own ${subjects.join(' and ')} point to Alterbrain files that moved in this update. Ask me to "fix the moved paths in my skills${notes.length ? ' and notes' : ''}"; the old and new places are in the CHANGELOG under Moved.`,
        tag: 'update-alterbrain',
        priority: 'medium',
      },
      `${counted.join(' and ')} ${total === 1 ? 'points' : 'point'} to files that moved. I added a task; nothing in them was changed.`,
    );
  }

  // The files this script could not search. Saying nothing here would pass them off as clean.
  const count = (why) => unchecked.filter((u) => u.why === why).length;
  const reasons = [];
  if (count('too-big')) reasons.push(`${count('too-big')} over 1 MB`);
  if (count('unreadable')) reasons.push(`${count('unreadable')} could not be read`);
  if (count('link')) reasons.push(`${count('link')} ${count('link') === 1 ? 'is a link' : 'are links'}, which I do not follow`);
  if (budget.capped) reasons.push(`I stopped after ${MAX_FILES} files`);
  if (reasons.length) {
    const names = unchecked.map((u) => u.name);
    const where = names.length ? ` (${list(names)}${budget.capped ? ' and everything after the first ' + MAX_FILES + ' files' : ''})` : ` (everything after the first ${MAX_FILES} files)`;
    const them = names.length === 1 && !budget.capped ? 'it' : 'them';
    addOnce(
      {
        text: `I could not check everything in your own skills and notes for links to Alterbrain files that moved${where}. Look through ${them} for "system/packs/mba/" paths, or ask me to go through ${them}; the old and new places are in the CHANGELOG under Moved.`,
        tag: 'update-alterbrain',
        priority: 'medium',
      },
      `I could not check every file in your own skills and notes for links to files that moved (${reasons.join('; ')}). I added a task so you can look at ${them} yourself.`,
    );
  }
});
