// A phone's Git does not run hooks, so an ordinary file that GitHub would refuse (about 100 MB) can still reach the saved
// history. The upload must then stop early with a clear reason instead of failing on every try (ADR 0020).
// The size limit is injected (ALTERBRAIN_BLOB_LIMIT_BYTES) so that the files stay small. Real git, real Git LFS, a local
// bare repository as "origin".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SKIP, blobAt, bytes, cleanup, git, gitTry, isPointer, lfsObjectPath, logOf, makeProject, runAuto, sha256, tasksOf, write } from '../fixtures/scripts/lfs-helpers.mjs';
import { unpushedOversizedBlobs } from '../../system/lib/git.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const BLOB_ENV = { ALTERBRAIN_BLOB_LIMIT_BYTES: '4000' };
const taskLines = (root, needle) => tasksOf(root).split('\n').filter((l) => l.includes(needle));

/** Another Git tool (one that does not run hooks) saves a recording as an ordinary file. */
function saveAsOrdinaryFile(root, rel = 'vault/recordings/week 1.mov', size = 6000) {
  write(root, rel, bytes(size));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'auto (obsidian on a phone)']);
}

test('an ordinary file too big for GitHub in a saved change stops the upload with a clear task, before anything is sent', release(), () => {
  const { parent, root, bare } = makeProject({ remote: true });
  try {
    const onlineBefore = git(bare, ['rev-parse', 'main']);
    saveAsOrdinaryFile(root);
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runAuto(root, 'push', { env: BLOB_ENV });
    assert.equal(r.code, 1, r.stdout + r.stderr);
    assert.equal(r.json.status, 'failed');
    assert.equal(r.json.kind, 'big-blob');
    assert.match(r.json.message, /too big for GitHub/);
    assert.equal(git(bare, ['rev-parse', 'main']), onlineBefore, 'nothing was sent');

    const lines = taskLines(root, 'very big file was saved as an ordinary file');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /GitHub refuses/);
    assert.match(lines[0], /Nothing is lost/);
    assert.match(lines[0], /\/health-check/);
    assert.doesNotMatch(tasksOf(root), /week 1\.mov/, 'file names are not encrypted and Tasks.md is backed up in clear');
    assert.match(logOf(root), / push big-blob /);
    assert.match(logOf(root), /week 1\.mov/, 'the local log names the file');

    runAuto(root, 'push', { env: BLOB_ENV });
    assert.equal(taskLines(root, 'very big file was saved as an ordinary file').length, 1, 'one task, however often it runs');
  } finally {
    cleanup(parent);
  }
});

test('the repair for commits that were never uploaded: fold them into the next save, and the file goes through Git LFS', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ remote: true });
  try {
    const mov = bytes(6000);
    write(root, 'vault/recordings/week 1.mov', mov);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'auto (obsidian on a phone)']);
    assert.equal(runAuto(root, 'push', { env: BLOB_ENV }).json.kind, 'big-blob');
    const notesOnlyHere = bytes(300).toString('hex');
    write(root, 'vault/Ideas.md', `${notesOnlyHere}\n`);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'a note written later']);

    // The commands in .claude/skills/health-check/references/fixes.md: nothing online is touched, no file on disk changes.
    git(root, ['reset', '--soft', '@{u}']);
    const saved = runAuto(root, 'commit', { env: BLOB_ENV });
    assert.equal(saved.code, 0, saved.stdout + saved.stderr);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/recordings/week 1.mov')), true);
    assert.equal(blobAt(root, 'HEAD', 'vault/Ideas.md').toString(), `${notesOnlyHere}\n`, 'the later note is kept');
    assert.equal(git(root, ['status', '--porcelain']), '');

    const pushed = runAuto(root, 'push', { env: BLOB_ENV });
    assert.equal(pushed.code, 0, pushed.stdout + pushed.stderr);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))));
    assert.equal(unpushedOversizedBlobs(root).files.length, 0);
  } finally {
    cleanup(parent);
  }
});

test('a file stored through Git LFS is never flagged, and neither is a big file that is already online', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ remote: true });
  try {
    // Already online as an ordinary file (it was uploaded back when it was allowed): not in the changes that are about to go up.
    saveAsOrdinaryFile(root, 'vault/recordings/old.mov', 6000);
    assert.equal(runAuto(root, 'push').json.status, 'ok'); // the real limit is far above 6000 bytes
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
    const again = runAuto(root, 'push', { env: BLOB_ENV });
    assert.equal(again.code, 0, again.stdout + again.stderr);
    assert.equal(again.json.status, 'ok');

    // A new big file saved by the automatic save is a pointer: tiny, not flagged.
    write(root, 'vault/recordings/new.mov', bytes(7000));
    assert.equal(runAuto(root, 'commit').code, 0);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/recordings/new.mov')), true);
    const up = runAuto(root, 'push', { env: BLOB_ENV });
    assert.equal(up.code, 0, up.stdout + up.stderr);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
  } finally {
    cleanup(parent);
  }
});

test('unpushedOversizedBlobs: lists the files, with sizes, for a folder whose branch was never uploaded and for one that was', release(), () => {
  const { parent, root } = makeProject({ remote: true });
  try {
    const saved = process.env.ALTERBRAIN_BLOB_LIMIT_BYTES;
    process.env.ALTERBRAIN_BLOB_LIMIT_BYTES = BLOB_ENV.ALTERBRAIN_BLOB_LIMIT_BYTES;
    try {
      assert.deepEqual(unpushedOversizedBlobs(root), { files: [], error: null }, 'nothing new');
      saveAsOrdinaryFile(root, 'vault/a b/c d.mov', 5000);
      const one = unpushedOversizedBlobs(root);
      assert.deepEqual(one.files, [{ path: 'vault/a b/c d.mov', size: 5000 }]);

      // A branch with no upstream yet: everything that no remote branch holds is looked at.
      gitTry(root, ['branch', '--unset-upstream']);
      const none = unpushedOversizedBlobs(root);
      assert.deepEqual(none.files.map((f) => f.path), ['vault/a b/c d.mov']);
    } finally {
      if (saved === undefined) delete process.env.ALTERBRAIN_BLOB_LIMIT_BYTES;
      else process.env.ALTERBRAIN_BLOB_LIMIT_BYTES = saved;
    }
  } finally {
    cleanup(parent);
  }
});

test('the limit is about 100 MB for GitHub: a file below it is never flagged', release(), () => {
  const { parent, root } = makeProject({ remote: true });
  try {
    saveAsOrdinaryFile(root, 'vault/recordings/week 1.mov', 6000);
    const r = runAuto(root, 'push'); // no injected limit
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
  } finally {
    cleanup(parent);
  }
});
