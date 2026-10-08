import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, abs, changedPaths, cleanup, copyFixture, read, runMigration, snapshot, write } from '../../fixtures/migrations/helpers.mjs';

after(cleanup);
const FILE = '0005-moved-file-edits.mjs';
const GRADER = 'system/packs/mba/lenses/grader.md';
const SALARY = 'system/packs/mba/jobs-nl/salary-thresholds.md';
const taskLines = (root) => read(root, 'vault/00_inbox/Tasks.md').split(/\r?\n/).filter((l) => l.startsWith('- [ ]'));

/** An install after "apply-safe" with the 14 old files still in place, exactly as release 0.1.1 shipped them. */
function withOldFiles(fixture = 'v0.1.1') {
  const root = copyFixture(fixture);
  cpSync(join(FIXTURES, 'moved-files'), root, { recursive: true });
  return root;
}
const edit = (root, rel, extra = '\nMy own extra line.\n') => write(root, rel, read(root, rel) + extra);
const OLD_FILES = [
  'system/packs/mba/jobs-nl/dutch-language.md', SALARY, 'system/packs/mba/jobs-nl/sources.md', 'system/packs/mba/jobs-nl/visa-and-sponsorship.md',
  'system/packs/mba/lenses/board.md', 'system/packs/mba/lenses/consolidation.md', 'system/packs/mba/lenses/devils-advocate.md', GRADER,
  'system/packs/mba/lenses/premortem.md', 'system/packs/mba/lenses/specialists.md',
  'system/packs/mba/templates/assignment.md', 'system/packs/mba/templates/critique.md', 'system/packs/mba/templates/decisions.md', 'system/packs/mba/templates/rubric.md',
];

test('0005: the copies you never edited are not mentioned (this also checks all 14 checksums)', () => {
  const root = withOldFiles();
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0005: other line endings, a byte order mark and trailing blank lines are not an edit', () => {
  const root = withOldFiles();
  OLD_FILES.forEach((rel) => write(root, rel, read(root, rel).replace(/\n/g, '\r\n')));
  write(root, GRADER, `\uFEFF${read(root, GRADER)}`);
  write(root, SALARY, `${read(root, SALARY)}\n\n   \n`);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
});

test('0005: an edited copy gets one plain sentence and one task, and no file is changed or moved', () => {
  const root = withOldFiles();
  edit(root, GRADER);
  edit(root, SALARY, '\n| hsm_30_plus | 6100 | my own January update |\n');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(
    r.stdout.trim(),
    'You edited 2 Alterbrain files that have a new place (salary-thresholds.md and grader.md). Your edits are still in the old copies, which Alterbrain no longer reads. I added a task to carry them over; nothing was changed.',
  );
  const tasks = taskLines(root);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /Carry over your edits to 2 Alterbrain files that moved \(salary-thresholds\.md and grader\.md\)/);
  assert.match(tasks[0], /carry over my edits to the moved files/);
  assert.match(tasks[0], /CHANGELOG under Moved/);
  assert.match(tasks[0], /#ab\/update-alterbrain/);
  // Only the task list changed: the edited copies and the untouched ones are byte-identical.
  assert.deepEqual(changedPaths(before, snapshot(root)), ['vault/00_inbox/Tasks.md']);
});

test('0005: a second run says "Nothing to do." and adds no second task', () => {
  const root = withOldFiles();
  edit(root, GRADER);
  assert.equal(runMigration(FILE, root).code, 0);
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.equal(taskLines(root).length, 1);
  assert.deepEqual(snapshot(root), before);
});

test('0005: one, two, three and many edited copies are worded correctly', () => {
  const one = withOldFiles();
  edit(one, GRADER);
  assert.equal(
    runMigration(FILE, one).stdout.trim(),
    'You edited 1 Alterbrain file that has a new place (grader.md). Your edits are still in the old copy, which Alterbrain no longer reads. I added a task to carry them over; nothing was changed.',
  );
  assert.match(taskLines(one)[0], /Carry over your edits to 1 Alterbrain file that moved \(grader\.md\): they are still in the old copy, which/);

  const three = withOldFiles();
  ['system/packs/mba/lenses/board.md', GRADER, 'system/packs/mba/templates/rubric.md'].forEach((rel) => edit(three, rel));
  assert.match(runMigration(FILE, three).stdout, /^You edited 3 Alterbrain files that have a new place \(board\.md, grader\.md and rubric\.md\)\./);

  const all = withOldFiles();
  OLD_FILES.forEach((rel) => edit(all, rel));
  const r = runMigration(FILE, all);
  assert.match(r.stdout, /^You edited 14 Alterbrain files that have a new place \(dutch-language\.md, salary-thresholds\.md, sources\.md and 11 more\)\./);
  assert.equal(taskLines(all).length, 1);
});

test('0005: an edited copy that the old update skill put in state/local/archive is found too', () => {
  const root = copyFixture('v0.1.1');
  cpSync(join(FIXTURES, 'moved-files'), join(abs(root, 'state/local/archive/v0.2.0')), { recursive: true });
  write(root, `state/local/archive/v0.2.0/${GRADER}`, `${read(root, `state/local/archive/v0.2.0/${GRADER}`)}\nMy own extra line.\n`);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^You edited 1 Alterbrain file that has a new place \(grader\.md\)\./);
  assert.equal(taskLines(root).length, 1);
  assert.match(taskLines(root)[0], /Copies that were moved to the archive are in state\/local\/archive\./);
});

test('0005: the same file edited in the old place and in the archive is counted once', () => {
  const root = withOldFiles();
  edit(root, GRADER);
  write(root, `state/local/archive/v0.2.0/${GRADER}`, 'My earlier version of the grader.\n');
  assert.match(runMigration(FILE, root).stdout, /^You edited 1 Alterbrain file that has a new place \(grader\.md\)\./);
  assert.doesNotMatch(taskLines(root)[0], /archive/, 'the copy in the old place is the one to use, so there is no archive hint');
});

test('0005: files that did not move are left alone, wherever you edited them', () => {
  const root = withOldFiles();
  write(root, 'system/packs/mba/templates/case.md', 'My own case template.\n');
  write(root, 'system/packs/mba/README.md', 'My notes.\n');
  write(root, 'system/packs/mba/frameworks/SWOT.md', 'My SWOT.\n');
  write(root, 'system/templates/notes/rubric.md', 'My rubric in the new place.\n');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
});

test('0005: a folder where a file should be is skipped without an error', () => {
  const root = copyFixture('v0.1.1');
  mkdirSync(abs(root, GRADER), { recursive: true });
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
});

test('0005: a file over 1 MB cannot be a copy of the shipped text, so it counts as edited', () => {
  const root = copyFixture('v0.1.1');
  write(root, GRADER, 'x'.repeat(2 * 1024 * 1024));
  assert.match(runMigration(FILE, root).stdout, /^You edited 1 Alterbrain file that has a new place \(grader\.md\)\./);
});

test('0005: a missing or empty task list still gets the task', () => {
  const missing = withOldFiles();
  edit(missing, GRADER);
  rmSync(abs(missing, 'vault/00_inbox/Tasks.md'));
  assert.equal(runMigration(FILE, missing).code, 0);
  assert.equal(taskLines(missing).length, 1);

  const empty = withOldFiles();
  edit(empty, GRADER);
  write(empty, 'vault/00_inbox/Tasks.md', '');
  const r = runMigration(FILE, empty);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(taskLines(empty).length, 1);
});

test('0005: --dry-run says what would happen and writes nothing', () => {
  const root = withOldFiles();
  edit(root, GRADER);
  const before = snapshot(root);
  const r = runMigration(FILE, root, ['--dry-run']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Would: You edited 1 Alterbrain file that has a new place \(grader\.md\)\./);
  assert.deepEqual(snapshot(root), before);
});

test('0005: a 0.2 install, which never had the old files, has nothing to do', () => {
  for (const fixture of ['v0.2-professional', 'v0.2-online']) {
    const root = copyFixture(fixture);
    const before = snapshot(root);
    const r = runMigration(FILE, root);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'Nothing to do.');
    assert.deepEqual(snapshot(root), before);
  }
});
