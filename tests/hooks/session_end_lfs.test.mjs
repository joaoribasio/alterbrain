// The SessionEnd hook with a big file in the vault (ADR 0020): the hook runs git-auto, which stores the file through
// Git LFS and uploads it. Real hook, real git-auto, real Git LFS, a local bare repository as "origin".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKIP, blobAt, bytes, cleanup, git, inHead, isPointer, lfsObjectPath, logOf, makeProject, runSessionEnd, sha256, tasksOf, write,
} from '../fixtures/scripts/lfs-helpers.mjs';

test('SessionEnd stores a big file through Git LFS, uploads it, and stays silent', { skip: SKIP }, () => {
  const { parent, root, bare } = makeProject({ remote: true, framework: true });
  try {
    const mov = bytes(6000);
    write(root, 'vault/40_sources/raw/2026/lecture recording.mov', mov);
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runSessionEnd(root);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/raw/2026/lecture recording.mov')), true);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']), 'the commit reached the online copy');
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))), 'and so did the file itself');
    assert.doesNotMatch(tasksOf(root), /#ab\/git/, 'nothing needs the user');
  } finally {
    cleanup(parent);
  }
});

test('SessionEnd without Git LFS saves and uploads the rest, leaves the big file out and adds one task', { skip: SKIP }, () => {
  const { parent, root, bare } = makeProject({ remote: true, framework: true });
  try {
    write(root, 'vault/40_sources/raw/2026/lecture recording.mov', bytes(6000));
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const noLfs = { env: { ALTERBRAIN_GIT_LFS: 'none' } };
    for (let i = 0; i < 2; i++) {
      const r = runSessionEnd(root, noLfs);
      assert.equal(r.code, 0, r.stderr);
      assert.equal(r.stdout, '');
    }
    assert.equal(inHead(root, 'vault/Ideas.md'), true);
    assert.equal(inHead(root, 'vault/40_sources/raw/2026/lecture recording.mov'), false);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']), 'the rest was uploaded');
    assert.equal(tasksOf(root).split('\n').filter((l) => l.includes('Git LFS (a free add-on')).length, 1, 'one task for two sessions');
    assert.match(logOf(root), /commit big-file no-lfs/);
  } finally {
    cleanup(parent);
  }
});
