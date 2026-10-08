// Big files (ADR 0020): ordinary documents go to ordinary git, and only a file at or above the size limit goes through
// Git LFS. The tests use the real Git LFS program, real temporary repositories and a local bare repository as "origin".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { release } from '../fixtures/scripts/release.mjs';
import {
  OLD_ROOT_RULES, REPO, SKIP, TEST_LIMIT, blobAt, bytes, cleanup, exists, git, gitTry, inHead, isPointer, lfsObjectPath,
  logOf, makeProject, newRootRules, read, readText, runAuto, sha256, tasksOf, write,
} from '../fixtures/scripts/lfs-helpers.mjs';

const RULES = 'vault/.gitattributes';
const ruleLines = (root) => (exists(root, RULES) ? readText(root, RULES).split(/\r?\n/).filter((l) => l && !l.startsWith('#')) : []);
const pointerCount = (root) => git(root, ['lfs', 'ls-files', '--name-only']).split(/\r?\n/).filter(Boolean).length;
const filterOf = (root, path) => git(root, ['check-attr', 'filter', '--', path]).split(': ').pop();

test('the root .gitattributes holds no LFS rules, and marks binary documents as binary', () => {
  const rules = newRootRules();
  assert.doesNotMatch(rules, /filter=lfs/);
  assert.match(rules, /^\* text=auto eol=lf$/m);
  assert.match(rules, /^vault\/\.obsidian\/plugins\/\*\* -text$/m);
  assert.match(rules, /^vault\/40_sources\/manifest\.jsonl merge=union$/m);
  for (const ext of ['pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpg', 'mp4', 'zip']) assert.match(rules, new RegExp(`^\\*\\.${ext}\\s+binary$`, 'm'), ext);
});

test('everyday documents are saved as ordinary files, byte for byte', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    // A "PDF" with line endings inside, which git must never convert.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\r\nline\r\n'), bytes(500), Buffer.from('\r\n%%EOF\r\n')]);
    write(root, 'vault/20_areas/courses/finance/slides.pdf', pdf);
    write(root, 'vault/10_projects/report.docx', bytes(3000));
    write(root, 'vault/40_sources/raw/2026/photo.png', bytes(2000));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runAuto(root, 'commit');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
    assert.deepEqual(blobAt(root, 'HEAD', 'vault/20_areas/courses/finance/slides.pdf'), pdf, 'no line-ending conversion');
    for (const p of ['vault/10_projects/report.docx', 'vault/40_sources/raw/2026/photo.png']) {
      const stored = blobAt(root, 'HEAD', p);
      assert.equal(isPointer(stored), false, p);
      assert.deepEqual(stored, read(root, p), p);
    }
    assert.equal(exists(root, RULES), false, 'no LFS rule is written when nothing is big');
    assert.equal(pointerCount(root), 0);
    assert.equal(gitTry(root, ['config', '--get', 'filter.lfs.clean']).ok, false, 'Git LFS is not even switched on for a folder without big files');
    assert.equal(git(root, ['check-attr', 'text', '--', 'vault/a.pdf']).split(': ').pop(), 'unset');
  } finally {
    cleanup(parent);
  }
});

test('a file at or above the limit goes through Git LFS with an exact-path rule, whatever its type', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    const mov = bytes(TEST_LIMIT + 1000);
    const csv = bytes(TEST_LIMIT);
    const justUnder = bytes(TEST_LIMIT - 1);
    write(root, 'vault/40_sources/raw/2026/big talk.mov', mov);
    write(root, 'vault/20_areas/data.csv', csv);
    write(root, 'vault/20_areas/small.pdf', justUnder);
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runAuto(root, 'commit');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.big.routed.length, 2);

    const rules = ruleLines(root);
    assert.deepEqual(rules.sort(), [
      '"/40_sources/raw/2026/big talk.mov" filter=lfs diff=lfs merge=lfs -text',
      '/20_areas/data.csv filter=lfs diff=lfs merge=lfs -text',
    ]);
    assert.match(readText(root, RULES), /^# .*Git LFS/, 'the file explains itself');
    for (const [p, content] of [['vault/40_sources/raw/2026/big talk.mov', mov], ['vault/20_areas/data.csv', csv]]) {
      const stored = blobAt(root, 'HEAD', p);
      assert.equal(isPointer(stored), true, `${p} is a pointer`);
      assert.match(stored.toString(), new RegExp(`oid sha256:${sha256(content)}`));
      assert.ok(existsSync(lfsObjectPath(join(root, '.git', 'lfs'), sha256(content))), `${p} sits in the local LFS store`);
      assert.deepEqual(read(root, p), content, 'the file on disk is untouched');
    }
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/20_areas/small.pdf')), false, 'one byte under the limit is an ordinary file');
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/Ideas.md')), false);
    assert.equal(pointerCount(root), 2);
    assert.match(git(root, ['show', '--name-only', '--format=', 'HEAD']), /vault\/\.gitattributes/, 'the rule is saved in the same commit as the file');
    assert.equal(git(root, ['status', '--porcelain']), '');
    assert.equal(gitTry(root, ['config', '--get', 'filter.lfs.clean']).ok, true, 'the LFS filter was switched on for this folder');

    // Nothing new: nothing changes, no rule is repeated.
    assert.equal(runAuto(root, 'commit').json.files, 0);
    assert.equal(ruleLines(root).length, 2);

    // The big file changes: a new pointer, still one rule.
    const mov2 = bytes(TEST_LIMIT + 2000);
    write(root, 'vault/40_sources/raw/2026/big talk.mov', mov2);
    assert.equal(runAuto(root, 'commit').json.status, 'ok');
    assert.match(blobAt(root, 'HEAD', 'vault/40_sources/raw/2026/big talk.mov').toString(), new RegExp(sha256(mov2)));
    assert.equal(ruleLines(root).length, 2);
  } finally {
    cleanup(parent);
  }
});

test('file names with spaces, brackets and non-ASCII letters are matched exactly, and only those files', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    const big = [
      'vault/70_x/Ünï cødé report [final] #1.pdf',
      'vault/sub dir/日本語 file.zip',
      'vault/!lead (copy).mp4',
      'vault/top level.zip',
    ];
    for (const p of big) write(root, p, bytes(TEST_LIMIT + 10));
    // Look-alikes that must stay ordinary: same name one folder deeper, another letter in a [..] position.
    write(root, 'vault/sub/top level.zip', bytes(100));
    write(root, 'vault/70_x/Ünï cødé report f.pdf', bytes(100));
    write(root, 'vault/sub dir/日本語 file.txt', bytes(100));
    const r = runAuto(root, 'commit');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.big.routed.length, 4);
    for (const p of big) {
      assert.equal(filterOf(root, p), 'lfs', p);
      assert.equal(isPointer(blobAt(root, 'HEAD', p)), true, p);
    }
    for (const p of ['vault/sub/top level.zip', 'vault/70_x/Ünï cødé report f.pdf', 'vault/sub dir/日本語 file.txt']) {
      assert.equal(filterOf(root, p), 'unspecified', p);
      assert.equal(isPointer(blobAt(root, 'HEAD', p)), false, p);
    }
    assert.equal(pointerCount(root), 4);
  } finally {
    cleanup(parent);
  }
});

/* ---------------- files that cannot be stored through Git LFS ---------------- */

const taskLines = (root, needle) => tasksOf(root).split('\n').filter((l) => l.includes(needle));

test('a big file outside the vault is left out with one task, and is saved once it moves into the vault', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    write(root, 'state/lecture-recording.bin', bytes(TEST_LIMIT + 500));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runAuto(root, 'commit');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
    assert.match(r.json.message, /1 big file was left out of the backup/);
    assert.equal(inHead(root, 'state/lecture-recording.bin'), false);
    assert.equal(inHead(root, 'vault/Ideas.md'), true, 'the rest was saved');
    assert.match(git(root, ['status', '--porcelain', '--untracked-files=all']), /\?\? state\/lecture-recording\.bin/, 'the file is still on this computer');
    assert.equal(exists(root, RULES), false, 'there is no user-owned place for a rule outside the vault');
    assert.equal(taskLines(root, 'lecture-recording.bin').length, 1);
    assert.match(taskLines(root, 'lecture-recording.bin')[0], /big file outside your vault/);
    assert.match(taskLines(root, 'lecture-recording.bin')[0], /#ab\/git/);
    runAuto(root, 'commit');
    assert.equal(taskLines(root, 'lecture-recording.bin').length, 1, 'the same task is not added twice');
    assert.match(logOf(root), /big-file outside-vault state\/lecture-recording\.bin/);

    // Moved into the vault, it is saved through Git LFS.
    write(root, 'vault/40_sources/lecture-recording.bin', read(root, 'state/lecture-recording.bin'));
    assert.equal(runAuto(root, 'commit').json.big.routed.length, 1);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/lecture-recording.bin')), true);
  } finally {
    cleanup(parent);
  }
});

test('without Git LFS a big file stays out of the save, one task says how to fix it, and a later save picks it up', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    const noLfs = { env: { ALTERBRAIN_GIT_LFS: 'none' } };
    const mov = bytes(TEST_LIMIT + 1);
    write(root, 'vault/40_sources/raw/clip.mov', mov);
    write(root, 'vault/20_areas/small.pdf', bytes(300));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runAuto(root, 'commit', noLfs);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
    assert.equal(inHead(root, 'vault/40_sources/raw/clip.mov'), false);
    assert.equal(inHead(root, 'vault/20_areas/small.pdf'), true, 'small documents never need Git LFS');
    assert.equal(inHead(root, 'vault/Ideas.md'), true);
    assert.equal(exists(root, RULES), false, 'no rule is written for a file that cannot be stored');
    assert.equal(gitTry(root, ['config', '--get', 'filter.lfs.clean']).ok, false);
    const lines = taskLines(root, 'Git LFS (a free add-on');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /not installed on this computer/);
    assert.match(lines[0], process.platform === 'win32' ? /winget install --id GitHub\.GitLFS -e/ : process.platform === 'darwin' ? /brew install git-lfs/ : /git-lfs/);
    assert.doesNotMatch(lines[0], /clip\.mov/, 'the task does not need the file name');
    runAuto(root, 'commit', noLfs);
    assert.equal(taskLines(root, 'Git LFS (a free add-on').length, 1, 'one task, however many saves');

    // "Installed" again: the file is stored through Git LFS.
    const fixed = runAuto(root, 'commit');
    assert.equal(fixed.json.big.routed.length, 1, fixed.stdout);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/raw/clip.mov')), true);
    assert.equal(git(root, ['status', '--porcelain']), '');
  } finally {
    cleanup(parent);
  }
});

test('a file of 2 GB or more (here: the injected maximum) is left out with a task that names it', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    write(root, 'vault/40_sources/raw/huge.mov', bytes(12_000));
    write(root, 'vault/40_sources/raw/big.mov', bytes(6000));
    const r = runAuto(root, 'commit', { env: { ALTERBRAIN_LFS_MAX_BYTES: '10000' } });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(inHead(root, 'vault/40_sources/raw/huge.mov'), false);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/raw/big.mov')), true, 'a file under the maximum still goes to Git LFS');
    assert.equal(ruleLines(root).length, 1);
    assert.doesNotMatch(readText(root, RULES), /huge/);
    const lines = taskLines(root, 'huge.mov');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /2 GB or more/);
    assert.match(lines[0], /kept only on this computer/);
    assert.match(git(root, ['status', '--porcelain', '--untracked-files=all']), /\?\? vault\/40_sources\/raw\/huge\.mov/);
  } finally {
    cleanup(parent);
  }
});

test('when the rule does not take effect, the file is left out instead of being saved as an ordinary copy', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    // A deeper attribute file wins over vault/.gitattributes, so the LFS rule cannot apply here.
    write(root, 'vault/20_areas/.gitattributes', '*.dat filter=somethingelse\n');
    write(root, 'vault/20_areas/stuck.dat', bytes(TEST_LIMIT + 5));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runAuto(root, 'commit');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(inHead(root, 'vault/20_areas/stuck.dat'), false);
    assert.equal(inHead(root, 'vault/Ideas.md'), true);
    assert.match(taskLines(root, 'stuck.dat')[0], /could not set up storage for the big file/);
  } finally {
    cleanup(parent);
  }
});

test('a copy that was staged by hand as an ordinary file is stored through Git LFS instead', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    const mov = bytes(TEST_LIMIT + 77);
    write(root, 'vault/40_sources/hand.mov', mov);
    git(root, ['add', 'vault/40_sources/hand.mov']); // no LFS rule and no filter yet: the full file is staged
    assert.equal(git(root, ['cat-file', '-s', ':vault/40_sources/hand.mov']), String(mov.length));
    const r = runAuto(root, 'commit');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/hand.mov')), true);
    assert.deepEqual(read(root, 'vault/40_sources/hand.mov'), mov);
  } finally {
    cleanup(parent);
  }
});

test('the size limit comes from git.lfs_min_mb in config/brain.json when no test override is set', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ brain: { git: { auto_commit: true, auto_push: true, lfs_min_mb: 1 } } });
  try {
    const over = bytes(1024 * 1024 + 10);
    const under = bytes(1024 * 1024 - 10);
    write(root, 'vault/40_sources/over.zip', over);
    write(root, 'vault/40_sources/under.zip', under);
    const r = runAuto(root, 'commit', { limit: null });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/over.zip')), true);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/under.zip')), false);
    assert.deepEqual(blobAt(root, 'HEAD', 'vault/40_sources/under.zip'), under);
  } finally {
    cleanup(parent);
  }
});

test('the default limit is 50 MB: a file well under it is an ordinary file', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    write(root, 'vault/40_sources/deck.pptx', bytes(3 * 1024 * 1024));
    const r = runAuto(root, 'commit', { limit: null });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/deck.pptx')), false);
    assert.equal(exists(root, RULES), false);
  } finally {
    cleanup(parent);
  }
});
