import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { abs, changedPaths, cleanup, copyFixture, read, runMigration, snapshot, write } from '../../fixtures/migrations/helpers.mjs';

after(cleanup);
const FILE = '0004-old-pack-paths.mjs';
const taskLines = (root) => read(root, 'vault/00_inbox/Tasks.md').split(/\r?\n/).filter((l) => l.startsWith('- [ ]'));
const writeBytes = (root, rel, buf) => {
  mkdirSync(dirname(abs(root, rel)), { recursive: true });
  writeFileSync(abs(root, rel), buf);
};
const OLD = 'system/packs/mba/lenses/grader.md';

test('0004: your own skills and helpers that point to moved files get one task, and are not changed', () => {
  const root = copyFixture('v0.1.0');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /2 of your own skills or helpers point to files that moved\. I added a task; nothing in them was changed\./);

  const tasks = taskLines(root);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /\(my-jobs-scan, my-reviewer\)/);
  assert.match(tasks[0], /#ab\/update-alterbrain/);
  assert.match(tasks[0], /fix the moved paths in my skills"/);
  assert.doesNotMatch(tasks[0], /my-canvas-sync/, 'a skill that points nowhere old is not named');

  // Only the task list changed: every my-* file, and the framework's own jobs skill, are byte-identical.
  assert.deepEqual(changedPaths(before, snapshot(root)), ['vault/00_inbox/Tasks.md']);
});

test('0004: a second run says "Nothing to do." and adds no second task', () => {
  const root = copyFixture('v0.1.0');
  assert.equal(runMigration(FILE, root).code, 0);
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.equal(taskLines(root).length, 1);
  assert.deepEqual(snapshot(root), before);
});

test('0004: a path written with backslashes is found, in text and in JSON', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-slashes/SKILL.md', 'Read system\\packs\\mba\\course-setup.md first.\n');
  write(root, '.claude/skills/my-json/config.json', JSON.stringify({ file: 'system\\packs\\mba\\templates\\rubric.md' }));
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^2 of your own skills or helpers point to files that moved\./);
  assert.match(taskLines(root)[0], /\(my-json, my-slashes\)/);
});

test('0004: every old place is recognised, and the files that stayed are not', () => {
  const root = copyFixture('v0.1.1');
  const moved = [
    'system/packs/mba/course-setup.md', 'system/packs/mba/lenses/devils-advocate.md', 'system/packs/mba/templates/assignment.md',
    'system/packs/mba/templates/rubric.md', 'system/packs/mba/templates/decisions.md', 'system/packs/mba/templates/critique.md',
    'system/packs/mba/jobs-nl/salary-thresholds.md',
  ];
  moved.forEach((p, i) => write(root, `.claude/skills/my-moved-${i}/notes.txt`, `see ${p}`));
  const stayed = ['system/packs/mba/frameworks/swot.md', 'system/packs/mba/templates/case.md', 'system/packs/mba/README.md', 'system/packs/twin/drafting.md'];
  stayed.forEach((p, i) => write(root, `.claude/skills/my-stayed-${i}/notes.txt`, `see ${p}`));
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^${moved.length} of your own skills`));
  assert.doesNotMatch(taskLines(root)[0], /my-stayed/);
});

test('0004: one affected skill is reported in the singular; helpers are named without .md', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/agents/my-grader.md', 'Use system/packs/mba/lenses/grader.md.\n');
  const r = runMigration(FILE, root);
  assert.equal(r.stdout.trim(), '1 of your own skills or helpers points to files that moved. I added a task; nothing in them was changed.');
  assert.match(taskLines(root)[0], /\(my-grader\)/);
});

test('0004: nothing built by the person means nothing to do', () => {
  const root = copyFixture('v0.1.1');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
  // not even a .claude folder
  rmSync(abs(root, '.claude'), { recursive: true, force: true });
  assert.equal(runMigration(FILE, root).stdout.trim(), 'Nothing to do.');
});

// ---- the scan is as wide as the policy: every text file in a built skill, whatever its extension, and the identity notes

test('0004: scripts and settings of any kind are searched, not only .md, .mjs, .json and .txt', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-x/run.py', `PATH = "${OLD}"\n`);
  write(root, '.claude/skills/my-y/config.yml', 'rubric: system/packs/mba/templates/rubric.md\n');
  write(root, '.claude/skills/my-z/helpers/go.sh', `cat ${OLD}\n`);
  write(root, '.claude/skills/my-w/Run.ps1', `Get-Content ${OLD}\n`);
  write(root, '.claude/skills/my-v/notes.xyz', `see ${OLD}`);
  write(root, '.claude/skills/my-u/Makefile', `lens:\n\tcat ${OLD}\n`);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^6 of your own skills or helpers point to files that moved\./);
  assert.match(taskLines(root)[0], /\(my-u, my-v, my-w, my-x, my-y, my-z\)/);
});

test('0004: a script saved as UTF-16 (the Windows PowerShell default) is searched too', () => {
  const root = copyFixture('v0.1.1');
  writeBytes(root, '.claude/skills/my-wide/Run.ps1', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`Get-Content ${OLD}\r\n`, 'utf16le')]));
  const r = runMigration(FILE, root);
  assert.match(r.stdout, /^1 of your own skills or helpers points to files that moved\./);
  assert.match(taskLines(root)[0], /\(my-wide\)/);
});

test('0004: binary files are not text and are left out; third-party folders are too', () => {
  const root = copyFixture('v0.1.1');
  // a real picture starts with bytes that include a NUL, whatever the file is called
  writeBytes(root, '.claude/skills/my-image/pic.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]), Buffer.from(OLD)]));
  writeBytes(root, '.claude/skills/my-data/blob.bin', Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), Buffer.from(OLD)]));
  write(root, '.claude/skills/my-deps/node_modules/pkg/index.js', `// ${OLD}\n`);
  write(root, '.claude/skills/my-deps/.venv/lib/site.py', `# ${OLD}\n`);
  write(root, '.claude/skills/my-nested/deep/er/notes.md', 'see system/packs/mba/lenses/board.md');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^1 of your own skills or helpers points/);
  assert.equal(r.stdout.trim().split(/\r?\n/).length, 1, 'binary files and third-party folders are not reported as unchecked');
  assert.match(taskLines(root)[0], /\(my-nested\)/);
});

test('0004: the notes CLAUDE.md loads (MEMORY.md, USER.md, SOUL.md, IDENTITY.md) are searched, and named in the task', () => {
  const root = copyFixture('v0.1.1');
  write(root, 'vault/80_me/MEMORY.md', `# Memory\n\n- Always use ${OLD} first.\n`);
  write(root, 'vault/80_me/voice/en/profile.md', 'See system/packs/mba/jobs-nl/sources.md for the sources.\n');
  write(root, 'vault/80_me/USER.md', '# User\n\nNothing old here.\n');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), '2 of your notes point to files that moved. I added a task; nothing in them was changed.');
  const tasks = taskLines(root);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /Your own notes \(MEMORY\.md, voice\/en\/profile\.md\) point to Alterbrain files that moved/);
  assert.match(tasks[0], /fix the moved paths in my skills and notes"/);
  assert.doesNotMatch(tasks[0], /USER\.md/);
  assert.deepEqual(changedPaths(before, snapshot(root)), ['vault/00_inbox/Tasks.md'], 'the notes themselves are untouched');

  // and the run after that finds the task already there
  assert.equal(runMigration(FILE, root).stdout.trim(), 'Nothing to do.');
});

test('0004: skills and notes that both point to old places are one task and one sentence', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-a/run.py', `x = "${OLD}"\n`);
  write(root, 'vault/80_me/MEMORY.md', `Use ${OLD}.\n`);
  const r = runMigration(FILE, root);
  assert.equal(r.stdout.trim(), '1 of your own skills or helpers and 1 of your notes point to files that moved. I added a task; nothing in them was changed.');
  assert.equal(taskLines(root).length, 1);
  assert.match(taskLines(root)[0], /Your own skills or helpers \(my-a\) and notes \(MEMORY\.md\) point to/);
});

test('0004: a file it cannot search is said out loud with a task, never "Nothing to do."', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-big/huge.md', `${'x'.repeat(2 * 1024 * 1024)}\nsystem/packs/mba/jobs-nl/sources.md\n`);
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.notEqual(r.stdout.trim(), 'Nothing to do.');
  assert.equal(r.stdout.trim(), 'I could not check every file in your own skills and notes for links to files that moved (1 over 1 MB). I added a task so you can look at it yourself.');
  const tasks = taskLines(root);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /I could not check everything in your own skills and notes for links to Alterbrain files that moved \(my-big\/huge\.md\)/);
  assert.match(tasks[0], /#ab\/update-alterbrain/);
  assert.deepEqual(changedPaths(before, snapshot(root)), ['vault/00_inbox/Tasks.md']);

  // the run after that finds the task already there
  const again = runMigration(FILE, root);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.equal(taskLines(root).length, 1);
});

test('0004: a big file next to a real hit gives both tasks', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-a/run.py', `x = "${OLD}"\n`);
  write(root, '.claude/skills/my-big/huge.md', 'y'.repeat(1024 * 1024 + 1));
  write(root, '.claude/agents/my-b.md', 'Nothing old.\n');
  const r = runMigration(FILE, root);
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^1 of your own skills or helpers points to files that moved\./);
  assert.match(lines[1], /^I could not check every file .*\(1 over 1 MB\)/);
  assert.equal(taskLines(root).length, 2);
});

test('0004: more than 2000 files is said out loud, and the files before the limit are still searched', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-a/a-first.md', `x = "${OLD}"\n`);
  for (let i = 0; i < 2001; i++) write(root, `.claude/skills/my-a/f${String(i).padStart(4, '0')}.txt`, 'plain\n');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.match(lines[0], /^1 of your own skills or helpers points to files that moved\./);
  assert.match(lines[1], /\(I stopped after 2000 files\)/);
  assert.match(taskLines(root).join('\n'), /everything after the first 2000 files/);
});

test('0004: a link is not followed, and it is said out loud', (t) => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-link/SKILL.md', 'Nothing old here.\n');
  write(root, 'elsewhere/notes.md', `see ${OLD}\n`);
  try {
    symlinkSync(abs(root, 'elsewhere'), abs(root, '.claude/skills/my-link/shared'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    t.skip('links cannot be created here');
    return;
  }
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /1 is a link, which I do not follow/);
  assert.match(taskLines(root)[0], /my-link\/shared/);
});

test('0004: a locked private note stops the upgrade with one plain sentence and changes nothing', () => {
  const root = copyFixture('v0.1.1');
  write(root, '.claude/skills/my-a/run.py', `x = "${OLD}"\n`);
  writeBytes(root, 'vault/80_me/MEMORY.md', Buffer.concat([Buffer.from([0x00, 0x47, 0x49, 0x54, 0x43, 0x52, 0x59, 0x50, 0x54, 0x00]), Buffer.from('cipher text')]));
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^Some of your private notes are locked on this computer, so I could not check them for links to files that moved\. Unlock them with your key file/);
  assert.deepEqual(snapshot(root), before, 'nothing, not even a task, was written');
});

test('0004: --dry-run says what would happen and writes nothing', () => {
  const root = copyFixture('v0.1.0');
  write(root, '.claude/skills/my-big/huge.md', 'z'.repeat(1024 * 1024 + 1));
  const before = snapshot(root);
  const r = runMigration(FILE, root, ['--dry-run']);
  assert.equal(r.code, 0);
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.match(lines[0], /^Would: 2 of your own skills or helpers point to files that moved\./);
  assert.match(lines[1], /^Would: I could not check every file/);
  assert.deepEqual(snapshot(root), before);
});
