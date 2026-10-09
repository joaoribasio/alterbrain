import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { FIXTURES, REPO, changedPaths, cleanup, copyFixture, exists, read, runMigration, snapshot, write } from '../../fixtures/migrations/helpers.mjs';
import { CI_REL, FRAMEWORK_CI_SHA256, sha256Lf } from '../../../system/lib/frameworkci.mjs';

after(cleanup);
const FILE = '0008-remove-framework-ci.mjs';
const CI_DIR = join(FIXTURES, 'framework-ci');
const released = (tag) => readFileSync(join(CI_DIR, `${tag}-ci.yml`), 'utf8');
const TAGS = ['v0.2.0', 'v0.2.1', 'v0.2.2'];
const taskLines = (root) => read(root, 'vault/00_inbox/Tasks.md').split(/\r?\n/).filter((l) => l.includes('check workflow'));

const gitIn = (root, args) => spawnSync('git', args, {
  cwd: root, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'), GIT_TERMINAL_PROMPT: '0' },
});

test('the hash list in the migration covers every released version of the workflow, and no more', () => {
  const script = readFileSync(join(REPO, 'system', 'scripts', 'migrations', FILE), 'utf8');
  const embedded = [...script.matchAll(/'([0-9a-f]{64})'/g)].map((m) => m[1]);
  assert.deepEqual(embedded, FRAMEWORK_CI_SHA256, 'the installer list and the frozen migration list agree');
  const onDisk = new Set(TAGS.map((t) => sha256Lf(Buffer.from(released(t)))));
  assert.deepEqual([...onDisk].sort(), [...FRAMEWORK_CI_SHA256].sort());
});

test('0008: every released version is deleted, with LF or CRLF on disk, and the empty folders go too', () => {
  for (const tag of TAGS) {
    for (const eol of ['\n', '\r\n']) {
      const root = copyFixture('v0.2-professional');
      write(root, CI_REL, released(tag).replace(/\r?\n/g, eol));
      const before = snapshot(root);
      const r = runMigration(FILE, root);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /^Deleted the Alterbrain check workflow \(\.github\/workflows\/ci\.yml\) from your copy\./, `${tag} ${JSON.stringify(eol)}`);
      assert.equal(exists(root, CI_REL), false);
      assert.equal(exists(root, '.github'), false, 'the empty .github folder is gone');
      assert.deepEqual(changedPaths(before, snapshot(root)), [CI_REL], 'nothing else changed');
    }
  }
});

test('0008: a second run says "Nothing to do." and changes nothing', () => {
  const root = copyFixture('v0.2-professional');
  write(root, CI_REL, released('v0.2.0'));
  assert.equal(runMigration(FILE, root).code, 0);
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0008: a copy without the workflow has nothing to do', () => {
  const root = copyFixture('v0.2-online');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0008: other files in .github stay, and so do the folders that hold them', () => {
  const root = copyFixture('v0.2-professional');
  write(root, CI_REL, released('v0.2.1'));
  write(root, '.github/workflows/deploy.yml', 'name: Deploy\n');
  write(root, '.github/dependabot.yml', 'version: 2\n');
  assert.equal(runMigration(FILE, root).code, 0);
  assert.equal(exists(root, CI_REL), false);
  assert.equal(exists(root, '.github/workflows/deploy.yml'), true);
  assert.equal(exists(root, '.github/dependabot.yml'), true);

  const root2 = copyFixture('v0.2-professional');
  write(root2, CI_REL, released('v0.2.1'));
  write(root2, '.github/dependabot.yml', 'version: 2\n');
  assert.equal(runMigration(FILE, root2).code, 0);
  assert.equal(exists(root2, '.github/workflows'), false, 'the empty workflows folder is gone');
  assert.equal(exists(root2, '.github/dependabot.yml'), true, 'the folder with a file in it stays');
});

test('0008: a workflow the person changed is kept, with one plain sentence and one task that is not added twice', () => {
  const root = copyFixture('v0.2-professional');
  const custom = released('v0.2.2') + '  # my own step\n';
  write(root, CI_REL, custom);
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim().split(/\r?\n/).length, 1, 'one sentence');
  assert.match(r.stdout, /^Left \.github\/workflows\/ci\.yml alone because it is not an Alterbrain version/);
  assert.equal(read(root, CI_REL), custom, 'the file is untouched');
  assert.deepEqual(changedPaths(before, snapshot(root)), ['vault/00_inbox/Tasks.md']);
  const tasks = taskLines(root);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /Actions minutes/);
  assert.match(tasks[0], /delete the file yourself/);
  assert.doesNotMatch(tasks[0], /delete my check workflow/, 'Claude cannot delete a protected system file');
  assert.match(tasks[0], /keep it/);
  assert.match(tasks[0], /#ab\/update-alterbrain/);

  const after1 = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), after1);
  assert.equal(taskLines(root).length, 1, 'the task is not added twice');
});

test('0008: a workflow that is a folder, not a file, is treated as the person\'s own and kept', () => {
  const root = copyFixture('v0.2-professional');
  write(root, '.github/workflows/ci.yml/inside.txt', 'x');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Left /);
  assert.equal(exists(root, '.github/workflows/ci.yml/inside.txt'), true);
});

test('0008: a dry run says what it would do and changes nothing', () => {
  const root = copyFixture('v0.2-professional');
  write(root, CI_REL, released('v0.2.0'));
  const before = snapshot(root);
  const r = runMigration(FILE, root, ['--dry-run']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Would: Deleted the Alterbrain check workflow/);
  assert.deepEqual(snapshot(root), before);

  const custom = copyFixture('v0.2-professional');
  write(custom, CI_REL, 'name: mine\n');
  const beforeCustom = snapshot(custom);
  const c = runMigration(FILE, custom, ['--dry-run']);
  assert.match(c.stdout, /^Would: Left /);
  assert.deepEqual(snapshot(custom), beforeCustom);
});

test('0008: developer mode is a no-op, whatever the workflow holds', () => {
  const root = copyFixture('v0.2-professional');
  write(root, 'state/local/dev-mode', '');
  write(root, CI_REL, released('v0.2.2'));
  write(root, '.github/workflows/other.yml', 'name: other\n');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0008: a copy whose origin is the framework repository is a no-op; one with another origin is not', () => {
  const setup = (origin) => {
    const root = copyFixture('v0.2-professional');
    write(root, 'system/release.json', JSON.stringify({ name: 'alterbrain', version: '0.2.3', tag: 'v0.2.3', repo: 'example/alterbrain' }));
    write(root, CI_REL, released('v0.2.2'));
    assert.equal(gitIn(root, ['init', '-q', '-b', 'main']).status, 0);
    if (origin) assert.equal(gitIn(root, ['remote', 'add', 'origin', origin]).status, 0);
    return root;
  };
  for (const origin of ['https://github.com/example/alterbrain.git', 'git@github.com:Example/Alterbrain.git', 'https://github.com/example/alterbrain']) {
    const root = setup(origin);
    const before = snapshot(root);
    const r = runMigration(FILE, root);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'Nothing to do.', origin);
    assert.equal(exists(root, CI_REL), true, origin);
    assert.deepEqual(snapshot(root), before);
  }
  for (const origin of [null, 'https://github.com/alex-doe/my-alterbrain.git', 'https://github.com/alex-doe/alterbrain.git']) {
    const root = setup(origin);
    const r = runMigration(FILE, root);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^Deleted the Alterbrain check workflow/, String(origin));
    assert.equal(exists(root, CI_REL), false, String(origin));
  }
});

test('0008: a copy inside another repository never reads that repository\'s origin', () => {
  // The fixture copies live under the framework repository, whose origin is the framework. Without a .git of their own
  // they must still be treated as a learner\'s copy.
  const root = copyFixture('v0.2-professional');
  write(root, 'system/release.json', JSON.stringify({ name: 'alterbrain', version: '0.2.3', tag: 'v0.2.3', repo: 'joaoribasio/alterbrain' }));
  write(root, CI_REL, released('v0.2.0'));
  const r = runMigration(FILE, root);
  assert.match(r.stdout, /^Deleted /);
  assert.equal(exists(root, CI_REL), false);
});
