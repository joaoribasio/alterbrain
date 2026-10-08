#!/usr/bin/env node
// ab-migration: Looks for edits you made to Alterbrain files that have a new place, and adds a task to carry them over if there are any.
//
// Release 0.2.0 moved 14 framework files (see "Moved" in the CHANGELOG): the six reviewer briefs, four note templates and
// the four Netherlands job guides. The update archives an old copy you never edited, but a copy you did edit is left where
// it is, and nothing reads it any more, so the edit would stop applying without a word. This only looks and reports: it adds
// one task and never changes or moves a file, because framework files are not a migration's to write.
//
// Where it looks for an edited old copy:
//   - the old place itself (the update leaves an edited file there);
//   - state/local/archive/<tag>/<old path>, where the update skill of release 0.1.1 and earlier moved removed files if
//     you agreed. That skill never carried an edit across, so an edited copy there is still waiting.
// A copy counts as "not edited" when it matches the text shipped in 0.1.0 and 0.1.1 (the same in both), ignoring line
// endings, a leading byte order mark and trailing blank space. The checksums below are that text's, so this script does
// not read any framework file that a later release may change.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { runMigration } from '../../lib/migrate.mjs';
import { addTask, formatTask, TASKS_FILE } from '../../lib/tasks.mjs';
import { readText } from '../../lib/fsx.mjs';

// [old path, checksum of the shipped text]
const MOVED = [
  ['system/packs/mba/jobs-nl/dutch-language.md', 'dfb8919e87ce61ddb92689b64a69def52a07dfefdcf1407066e078f0049facdb'],
  ['system/packs/mba/jobs-nl/salary-thresholds.md', '74faedec450c0afed368af08a4e206a96aaeba7a98376feac03e7366542e1bd8'],
  ['system/packs/mba/jobs-nl/sources.md', '463277acbff9b2e4629911ef264e02ab3a1da2801830eb0f76b16efe6acfd3b9'],
  ['system/packs/mba/jobs-nl/visa-and-sponsorship.md', '9b5c20b87aeb2a5162e69f81b8ce006afedf9c7cd6ca2f7ddb05427af3dae268'],
  ['system/packs/mba/lenses/board.md', '1fde99b85a62d701713e3f3682c1fa14012b80e9ca471cf0cf4e048b654da9c4'],
  ['system/packs/mba/lenses/consolidation.md', 'ef2b886abab2ec01808d874284a7fba5ebc43bce6089b1348afbcd74389aaad0'],
  ['system/packs/mba/lenses/devils-advocate.md', 'f32a31f4165d77b8fb379a9e34f643227f534debb697de19b54b6eed116c0c8b'],
  ['system/packs/mba/lenses/grader.md', '23ec6adbf516bdf6e3325f055e96850c39806ef935d142bd9a623d9d245f10fd'],
  ['system/packs/mba/lenses/premortem.md', 'd05be544b5ec10ba0ac8e8ea4671df78dba995438bfa38c5fd810d5c8460f2bf'],
  ['system/packs/mba/lenses/specialists.md', 'f5ac45423ef0cee7e6de814ef9b3d597dc758f34555f2420aeebcde4e41726dc'],
  ['system/packs/mba/templates/assignment.md', 'b4882217267842c99bb7a45f0d0cd94754734c66d90680f6bbe7e644a8651b0d'],
  ['system/packs/mba/templates/critique.md', '5e5e977f64c248889f576fcad24b234ea642ae42fe100864004a5743c9a6ed61'],
  ['system/packs/mba/templates/decisions.md', 'd017c16f6ac75d3d4cbcde392b6d3a951f613abd39f7273d7963c331bccba88d'],
  ['system/packs/mba/templates/rubric.md', '6f54add19a7278310cca16d14f5336ee52cbb4d8acac8e1e2d1360b273850c69'],
];

const MAX_BYTES = 1024 * 1024; // the shipped files are under 10 KB, so a bigger file is certainly not a copy of one
const MAX_ARCHIVE_FOLDERS = 50;
const SHOWN_NAMES = 3;

const fingerprint = (text) =>
  createHash('sha256').update(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '')).digest('hex');

const subfolders = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
};

/** Is this file there, and is it something other than the text that was shipped? Links, folders and unreadable files: no. */
function isEditedCopy(file, shipped) {
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) return false;
    if (stat.size > MAX_BYTES) return true;
    return fingerprint(readFileSync(file, 'utf8')) !== shipped;
  } catch {
    return false;
  }
}

/** "a.md", "a.md and b.md", "a.md, b.md and c.md", "a.md, b.md, c.md and 11 more" */
function nameList(names) {
  if (names.length <= SHOWN_NAMES) return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, SHOWN_NAMES).join(', ')} and ${names.length - SHOWN_NAMES} more`;
}

await runMigration(async ({ root, dryRun, report }) => {
  const archived = subfolders(join(root, 'state', 'local', 'archive'))
    .slice(0, MAX_ARCHIVE_FOLDERS)
    .map((tag) => ['state', 'local', 'archive', tag]);
  const places = [[], ...archived];

  const edited = [];
  for (const [path, shipped] of MOVED) {
    const at = places.findIndex((prefix) => isEditedCopy(join(root, ...prefix, ...path.split('/')), shipped));
    if (at !== -1) edited.push({ name: basename(path), archived: at > 0 });
  }
  if (edited.length === 0) return;

  const n = edited.length;
  const names = nameList(edited.map((e) => e.name));
  const inArchive = edited.some((e) => e.archived) ? ' Copies that were moved to the archive are in state/local/archive.' : '';
  const task = {
    text: `Carry over your edits to ${n} Alterbrain ${n === 1 ? 'file' : 'files'} that moved (${names}): they are still in the old ${n === 1 ? 'copy' : 'copies'}, which Alterbrain no longer reads. Ask me to "carry over my edits to the moved files". The old and new places are in the CHANGELOG under Moved.${inArchive} If you already did this, tick it.`,
    tag: 'update-alterbrain',
    priority: 'medium',
  };
  if (existsSync(TASKS_FILE()) && readText(TASKS_FILE()).includes(formatTask(task))) return;
  if (!dryRun) addTask(task);
  report(
    `You edited ${n} Alterbrain ${n === 1 ? 'file' : 'files'} that ${n === 1 ? 'has' : 'have'} a new place (${names}). Your edits are still in the old ${n === 1 ? 'copy' : 'copies'}, which Alterbrain no longer reads. I added a task to carry them over; nothing was changed.`,
  );
});
