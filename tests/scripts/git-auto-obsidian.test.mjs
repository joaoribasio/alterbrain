// Big files saved by a Git tool other than the automatic save (Obsidian Git saves and uploads by itself every 10
// minutes, ADR 0020). Git runs a small pre-commit hook for every save, whoever starts it; the hook runs
// "git-auto pre-commit", which sends big files to Git LFS before they are stored as ordinary files.
// Real git, real Git LFS, a local bare repository as "origin". The projects hold a copy of the framework (framework: true)
// because the hook file calls the project's own system/scripts/git-auto.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { release } from '../fixtures/scripts/release.mjs';
import {
  SKIP, TEST_LIMIT, blobAt, bytes, childEnv, cleanup, exists, git, gitTry, inHead, isPointer, lfsObjectPath, logOf, makeProject,
  read, readText, runAuto, sha256, tasksOf, write,
} from '../fixtures/scripts/lfs-helpers.mjs';

const HOOK = '.git/hooks/pre-commit';
const RULES = 'vault/.gitattributes';
const LIMIT_ENV = { ALTERBRAIN_LFS_MIN_BYTES: String(TEST_LIMIT) };
const NO_LFS_ENV = { ...LIMIT_ENV, ALTERBRAIN_GIT_LFS: 'none' };
const taskLines = (root, needle) => tasksOf(root).split('\n').filter((l) => l.includes(needle));

/** What Obsidian Git does on every "commit-and-sync": stage everything, then commit. Returns the commit's result. */
function obsidianSave(root, message = 'auto (obsidian)', env = LIMIT_ENV) {
  git(root, ['add', '-A'], env);
  return gitTry(root, ['commit', '-q', '-m', message], env);
}

/** git() in lfs-helpers throws on failure; a commit that git refuses needs the exit code instead. */
function commitCode(root, args, env = LIMIT_ENV) {
  const res = spawnSync('git', ['commit', '-q', ...args], { cwd: root, encoding: 'utf8', env: childEnv(root, env), windowsHide: true });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

test('git-auto hook installs the big-file check, and a second run changes nothing', release(), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    const first = runAuto(root, 'hook');
    assert.equal(first.code, 0, first.stdout + first.stderr);
    assert.equal(first.json.state, 'active');
    assert.equal(first.json.changed, true);
    const text = readText(root, HOOK);
    assert.match(text, /^#!\/bin\/sh\n# alterbrain-pre-commit v1\n/);
    assert.doesNotMatch(text, /\r/, 'Git for Windows runs it through its own shell: LF only');
    assert.match(text, /git-auto\.mjs/);
    const stamp = statSync(join(root, HOOK)).mtimeMs;
    const second = runAuto(root, 'hook');
    assert.equal(second.code, 0);
    assert.equal(second.json.changed, false);
    assert.equal(statSync(join(root, HOOK)).mtimeMs, stamp, 'the file was not rewritten');
  } finally {
    cleanup(parent);
  }
});

test('the automatic save installs the check by itself, but not in developer mode', release(), () => {
  const normal = makeProject({ framework: true });
  const dev = makeProject({ framework: true });
  try {
    assert.equal(exists(normal.root, HOOK), false);
    assert.equal(runAuto(normal.root, 'commit').code, 0);
    assert.match(readText(normal.root, HOOK), /alterbrain-pre-commit/);

    write(dev.root, 'state/local/dev-mode', 'test checkout\n');
    assert.equal(runAuto(dev.root, 'commit').json.status, 'skipped');
    assert.equal(exists(dev.root, HOOK), false, 'a developer checkout is left alone');
    assert.equal(runAuto(dev.root, 'hook').json.state, 'active', 'but the developer can ask for it');
  } finally {
    cleanup(normal.parent, dev.parent);
  }
});

test('Obsidian Git: a big file added by a plain "git add -A" and "git commit" is stored through Git LFS and uploads', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ remote: true, framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    const mov = bytes(6000);
    write(root, 'vault/40_sources/raw/2026/lecture recording.mov', mov); // no rule anywhere: the root rules hold none
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const saved = obsidianSave(root);
    assert.equal(saved.ok, true, saved.stderr);

    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/raw/2026/lecture recording.mov')), true, 'a pointer, not the full copy');
    assert.equal(blobAt(root, 'HEAD', 'vault/Ideas.md').toString(), '# Ideas\n', 'ordinary notes stay ordinary');
    assert.match(git(root, ['show', '--name-only', '--format=', 'HEAD']), /vault\/\.gitattributes/, 'the rule is saved in the same commit');
    assert.match(readText(root, RULES), /"\/40_sources\/raw\/2026\/lecture recording\.mov" filter=lfs/);
    assert.deepEqual(read(root, 'vault/40_sources/raw/2026/lecture recording.mov'), mov, 'the file on disk is untouched');
    assert.equal(git(root, ['status', '--porcelain']), '', 'nothing is left half-staged');
    assert.match(logOf(root), /pre-commit big-file 1 big file\(s\) sent to Git LFS/);

    // The upload that follows (here: the automatic one) sends the pointer and the file itself.
    const up = runAuto(root, 'push');
    assert.equal(up.code, 0, up.stdout + up.stderr);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))));
    assert.doesNotMatch(tasksOf(root), /#ab\/git/);
  } finally {
    cleanup(parent);
  }
});

test('Obsidian Git: a plain "git push" uploads the file too once Git LFS is set up, and GitHub would accept every blob', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ remote: true, framework: true, lfs: 'full' });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    const mov = bytes(9000);
    write(root, 'vault/recordings/week 1.mov', mov);
    assert.equal(obsidianSave(root).ok, true);
    git(root, ['push', '-q']);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))));
    // The online copy holds no full copy of the file as an ordinary object (it would be exactly 9000 bytes).
    const sizes = git(bare, ['cat-file', '--batch-all-objects', '--batch-check=%(objectsize)']).split('\n').map(Number);
    assert.equal(sizes.includes(9000), false, 'no ordinary copy of the recording');
  } finally {
    cleanup(parent);
  }
});

test('"git commit -a" is covered too: a changed big file becomes a pointer again, and the rule is not repeated', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    write(root, 'vault/recordings/week 1.mov', bytes(6000));
    assert.equal(obsidianSave(root).ok, true);
    const second = bytes(7000);
    write(root, 'vault/recordings/week 1.mov', second);
    const r = commitCode(root, ['-a', '-m', 'edited']);
    assert.equal(r.code, 0, r.stderr);
    const stored = blobAt(root, 'HEAD', 'vault/recordings/week 1.mov');
    assert.equal(isPointer(stored), true);
    assert.match(stored.toString(), new RegExp(sha256(second)));
    assert.equal(readText(root, RULES).split('\n').filter((l) => l.includes('week 1.mov')).length, 1);
    assert.equal(git(root, ['status', '--porcelain']), '');
  } finally {
    cleanup(parent);
  }
});

test('names with spaces, brackets and non-ASCII letters are matched exactly, and only those files, in one save with small look-alikes', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    const odd = 'vault/20_areas/Ünï [draft] recording #1.mov';
    write(root, odd, bytes(6000));
    write(root, 'vault/20_areas/Ünï [draft] recording #2.mov', bytes(1000)); // same pattern, small: stays ordinary
    write(root, 'vault/20_areas/Ünï d recording #1.mov', bytes(1000)); // what the unescaped brackets would also have matched
    assert.equal(obsidianSave(root).ok, true);
    assert.equal(isPointer(blobAt(root, 'HEAD', odd)), true);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/20_areas/Ünï [draft] recording #2.mov')), false);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/20_areas/Ünï d recording #1.mov')), false);
    assert.equal(git(root, ['status', '--porcelain']), '');
  } finally {
    cleanup(parent);
  }
});

test('the project folder may have spaces in its name (a Windows user folder such as "Alex Doe")', release({ skip: SKIP }), () => {
  const { parent, root: plain, bare } = makeProject({ remote: true, framework: true });
  const root = join(parent, 'Alex Doe', 'My Alterbrain');
  try {
    mkdirSync(join(parent, 'Alex Doe'), { recursive: true });
    renameSync(plain, root);
    assert.equal(runAuto(root, 'hook').code, 0);
    const mov = bytes(6000);
    write(root, 'vault/recordings/week 1.mov', mov);
    assert.equal(obsidianSave(root).ok, true);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/recordings/week 1.mov')), true);
    assert.equal(runAuto(root, 'push').code, 0);
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))));
  } finally {
    cleanup(parent);
  }
});

test('a rule already covers the file but it was staged without the Git LFS filter: it is staged again through the filter', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    write(root, RULES, '/recordings/week 1.mov filter=lfs diff=lfs merge=lfs -text\n'); // a rule from another computer
    git(root, ['add', RULES]);
    git(root, ['commit', '-q', '-m', 'rule only'], LIMIT_ENV);
    const mov = bytes(6000);
    write(root, 'vault/recordings/week 1.mov', mov);
    // A new clone has no Git LFS filter configured, so git stores the full copy.
    assert.equal(gitTry(root, ['config', '--get', 'filter.lfs.clean']).ok, false);
    const saved = obsidianSave(root);
    assert.equal(saved.ok, true, saved.stderr);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/recordings/week 1.mov')), true);
    assert.match(logOf(root), /big file\(s\) sent to Git LFS/);
  } finally {
    cleanup(parent);
  }
});

test('without Git LFS the big file is left out of the save, the notes are saved, and one task says what to do', release(), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    write(root, 'vault/recordings/week 1.mov', bytes(6000));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const saved = obsidianSave(root, 'auto (obsidian)', NO_LFS_ENV);
    assert.equal(saved.ok, true, saved.stderr);
    assert.equal(inHead(root, 'vault/Ideas.md'), true);
    assert.equal(inHead(root, 'vault/recordings/week 1.mov'), false, 'the big file is not in this save');
    assert.match(git(root, ['ls-files', '--others', '--exclude-standard']), /vault\/recordings\/week 1\.mov/, 'it is still on disk');
    assert.equal(exists(root, RULES), false);
    assert.equal(taskLines(root, 'Git LFS (a free add-on').length, 1);
    obsidianSave(root, 'again', NO_LFS_ENV); // ten minutes later
    assert.equal(taskLines(root, 'Git LFS (a free add-on').length, 1, 'still one task');
  } finally {
    cleanup(parent);
  }
});

test('when the big file is all there is to save, git says there is nothing to save instead of making an empty commit', release(), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    const before = git(root, ['rev-parse', 'HEAD']);
    write(root, 'vault/recordings/week 1.mov', bytes(6000));
    git(root, ['add', '-A'], NO_LFS_ENV);
    const r = commitCode(root, ['-m', 'auto (obsidian)'], NO_LFS_ENV);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /left 1 big file out of this save/);
    assert.match(r.stderr, /Nothing else was waiting to be saved/);
    assert.equal(git(root, ['rev-parse', 'HEAD']), before, 'no empty commit');
  } finally {
    cleanup(parent);
  }
});

test('a big file outside the vault is left out, with a task that names it', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    write(root, 'exports/dataset.csv', bytes(6000));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    assert.equal(obsidianSave(root).ok, true);
    assert.equal(inHead(root, 'exports/dataset.csv'), false);
    assert.equal(inHead(root, 'vault/Ideas.md'), true);
    assert.match(tasksOf(root), /"exports\/dataset\.csv" is a big file outside your vault/);
  } finally {
    cleanup(parent);
  }
});

test('the check never stops a save: if it cannot run, the save goes ahead', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    assert.equal(runAuto(root, 'hook').code, 0);
    write(root, 'system/scripts/git-auto.mjs', 'this is not javascript (\n'); // the script the hook calls is broken
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const saved = obsidianSave(root);
    assert.equal(saved.ok, true, saved.stderr);
    assert.equal(inHead(root, 'vault/Ideas.md'), true);
    // And with the script gone altogether (a copy of the project without the framework folder).
    writeFileSync(join(root, 'system', 'scripts', 'git-auto.mjs'), '');
    write(root, 'vault/More.md', '# More\n');
    assert.equal(obsidianSave(root).ok, true);
  } finally {
    cleanup(parent);
  }
});

test('someone else\'s pre-commit hook is never touched, and a shared hooks folder is left alone', release(), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    const theirs = '#!/bin/sh\necho "their check"\nexit 0\n';
    write(root, HOOK, theirs);
    const r = runAuto(root, 'hook');
    assert.equal(r.code, 1);
    assert.equal(r.json.state, 'foreign');
    assert.match(r.json.message, /Another tool already has a check/);
    assert.equal(readText(root, HOOK), theirs, 'unchanged');
    assert.equal(runAuto(root, 'commit').code, 0, 'the automatic save still works');
    assert.equal(readText(root, HOOK), theirs);
    assert.match(runAuto(root, 'status').json.message, /Another tool already has a check/);
  } finally {
    cleanup(parent);
  }
  const other = makeProject({ framework: true });
  try {
    git(other.root, ['config', 'core.hooksPath', 'shared-hooks']);
    const r = runAuto(other.root, 'hook');
    assert.equal(r.code, 1);
    assert.equal(r.json.state, 'hooks-path');
    assert.equal(exists(other.root, HOOK), false, 'nothing was written');
  } finally {
    cleanup(other.parent);
  }
});

test('an old copy of the hook is refreshed, and an empty hook file is replaced', release(), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    write(root, HOOK, '');
    assert.equal(runAuto(root, 'hook').json.changed, true);
    const good = readText(root, HOOK);
    write(root, HOOK, good.replace('exit 0\n', 'exit 0\n# old\n'));
    const r = runAuto(root, 'hook');
    assert.equal(r.json.changed, true, 'rewritten');
    assert.equal(readText(root, HOOK), good);
  } finally {
    cleanup(parent);
  }
});

test('pre-commit does nothing, quietly, when there is nothing big to deal with', release(), () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    write(root, 'vault/Ideas.md', '# Ideas\n');
    git(root, ['add', '-A']);
    const r = runAuto(root, 'pre-commit');
    assert.equal(r.code, 0);
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.message, '');
    assert.deepEqual(r.json.routed, []);
    assert.equal(logOf(root), '');
    // Without --json it prints nothing at all (git shows a hook's output to whoever saves).
    const quiet = spawnSyncAuto(root, ['pre-commit']);
    assert.equal(quiet.stdout, '');
    assert.equal(quiet.stderr, '');
  } finally {
    cleanup(parent);
  }
});

function spawnSyncAuto(root, args) {
  const res = spawnSync(process.execPath, [join(root, 'system', 'scripts', 'git-auto.mjs'), ...args], { cwd: root, encoding: 'utf8', env: childEnv(root, LIMIT_ENV), windowsHide: true });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

test('the hook file reads like a short plain script and remembers where Node is', () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    runAuto(root, 'hook');
    const text = readText(root, HOOK);
    assert.match(text, /command -v node/);
    assert.match(text, /\[ -x '[^']*node(\.exe)?' \]/, 'a desktop app may start git without node on its path: the path of this node is remembered');
    assert.match(text, /CLAUDE_PROJECT_DIR="\$root"/);
    assert.ok(text.split('\n').length < 20);
    assert.ok(readFileSync(join(root, HOOK)).length < 1500);
  } finally {
    cleanup(parent);
  }
});
