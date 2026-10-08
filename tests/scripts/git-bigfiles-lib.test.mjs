// The pieces of system/lib/git.mjs behind the big-file safety net (ADR 0020): the hook text, how an existing hook is
// recognised, the wording of "ran out of time", the amount of Git LFS data waiting, and a push that is stopped by its time limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GITHUB_BLOB_LIMIT_BYTES, PRE_COMMIT_MARKER, backgroundUploadBytes, blobLimitBytes, classifyError, classifyPreCommit,
  ensurePreCommitHook, lfsPendingUpload, preCommitHookStatus, preCommitShim, pushCurrent,
} from '../../system/lib/git.mjs';
import { SKIP, bytes, cleanup, git, makeProject, runAuto, write } from '../fixtures/scripts/lfs-helpers.mjs';
import { release } from '../fixtures/scripts/release.mjs';

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('classifyError: a step stopped by its time limit is "timeout", and git\'s own wording for a slow network stays "network"', () => {
  assert.equal(classifyError('spawnSync git ETIMEDOUT'), 'timeout');
  assert.equal(classifyError('spawnSync C:\\Program Files\\Git\\cmd\\git.exe ETIMEDOUT'), 'timeout');
  assert.equal(classifyError('ssh: connect to host github.com port 22: Connection timed out'), 'network');
  assert.equal(classifyError('fatal: unable to access: Could not resolve host: github.com'), 'network');
  assert.equal(classifyError('! [rejected] main -> main (fetch first)'), 'rejected');
  assert.equal(classifyError('remote: error: File x.mov is 123.00 MB; this exceeds GitHub\'s file size limit of 100.00 MB'), 'other', 'the dedicated check comes before this ever happens');
});

test('the hook text: plain shell, the marker, the remembered node path (quoted), and the one exit code that stops a save', () => {
  const text = preCommitShim("C:\\Program Files\\node's folder\\node.exe");
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.ok(text.split('\n').includes(PRE_COMMIT_MARKER));
  assert.match(text, /\[ -x 'C:\/Program Files\/node'\\''s folder\/node\.exe' \]/, 'forward slashes, and an apostrophe cannot break out of the quotes');
  assert.match(text, /if \[ "\$\?" -eq 3 \]; then exit 1; fi/, 'only "nothing else to save" (exit code 3) stops a save');
  assert.match(text, /exit 0\n$/, 'every other outcome lets the save go ahead');
  assert.doesNotMatch(text, /\r/);
  assert.match(preCommitShim(''), /\[ -x '' \]/);
});

test('classifyPreCommit: empty, ours, or someone else\'s', () => {
  assert.equal(classifyPreCommit(''), 'empty');
  assert.equal(classifyPreCommit('  \n\n'), 'empty');
  assert.equal(classifyPreCommit(null), 'empty');
  assert.equal(classifyPreCommit(preCommitShim('')), 'ours');
  assert.equal(classifyPreCommit(preCommitShim('').replace(/\n/g, '\r\n')), 'ours', 'Windows line endings');
  assert.equal(classifyPreCommit('#!/bin/sh\necho hi\n'), 'foreign');
  assert.equal(classifyPreCommit('#!/bin/sh\n# something about alterbrain-pre-commit\n'), 'foreign', 'the marker must be a whole line');
});

test('limits: GitHub\'s is 95 MiB for the check, the background threshold is 16 MiB, and test overrides are read', () => {
  withEnv({ ALTERBRAIN_BLOB_LIMIT_BYTES: undefined, ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: undefined }, () => {
    assert.equal(GITHUB_BLOB_LIMIT_BYTES, 95 * 1024 * 1024);
    assert.equal(blobLimitBytes(), GITHUB_BLOB_LIMIT_BYTES);
    assert.equal(backgroundUploadBytes(), 16 * 1024 * 1024);
  });
  withEnv({ ALTERBRAIN_BLOB_LIMIT_BYTES: '4000', ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '0' }, () => {
    assert.equal(blobLimitBytes(), 4000);
    assert.equal(backgroundUploadBytes(), 0);
  });
  withEnv({ ALTERBRAIN_BLOB_LIMIT_BYTES: 'nonsense', ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '-5' }, () => {
    assert.equal(blobLimitBytes(), GITHUB_BLOB_LIMIT_BYTES);
    assert.equal(backgroundUploadBytes(), 16 * 1024 * 1024);
  });
});

test('ensurePreCommitHook and preCommitHookStatus agree, a stale copy is refreshed, and a folder that is not a repository is never written into', release(), () => {
  const { parent, root } = makeProject();
  try {
    assert.equal(preCommitHookStatus(root).state, 'missing');
    const first = ensurePreCommitHook(root);
    assert.deepEqual([first.state, first.changed], ['active', true]);
    assert.deepEqual(preCommitHookStatus(root), { state: 'active', path: first.path, outdated: false });
    assert.deepEqual(ensurePreCommitHook(root), { state: 'active', changed: false, path: first.path });

    writeFileSync(first.path, `${preCommitShim('')}# a hand edit\n`);
    assert.equal(preCommitHookStatus(root).outdated, true, 'ours, but not the current text');
    assert.equal(ensurePreCommitHook(root).changed, true);
    assert.equal(preCommitHookStatus(root).outdated, false);

    writeFileSync(first.path, '#!/bin/sh\necho theirs\n');
    assert.equal(preCommitHookStatus(root).state, 'foreign');
    assert.equal(ensurePreCommitHook(root).state, 'foreign');
    assert.equal(ensurePreCommitHook(join(parent, 'not-a-repo-at-all')).state === 'active', false, 'never writes into a folder that is not a repository');
  } finally {
    cleanup(parent);
  }
});

test('lfsPendingUpload: counts the Git LFS files that are saved but not online yet, and is quiet when there are none', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ remote: true });
  try {
    withEnv({ ALTERBRAIN_GIT_LFS: undefined }, () => {
      assert.deepEqual(lfsPendingUpload(root), { count: 0, bytes: 0 }, 'nothing saved yet');
    });
    write(root, 'vault/recordings/week 1.mov', bytes(6000));
    write(root, 'vault/recordings/week 2.mov', bytes(7000));
    write(root, 'vault/Short.md', `${'a note about the size of a pointer. '.repeat(4)}\n`); // about 150 bytes of ordinary text: not a pointer
    assert.equal(runAuto(root, 'commit').code, 0);
    withEnv({ ALTERBRAIN_GIT_LFS: undefined }, () => {
      assert.deepEqual(lfsPendingUpload(root), { count: 2, bytes: 13000 });
    });
    withEnv({ ALTERBRAIN_GIT_LFS: 'none' }, () => {
      assert.deepEqual(lfsPendingUpload(root), { count: 0, bytes: 0 }, 'without Git LFS there is nothing to ask');
    });
    assert.equal(runAuto(root, 'push').code, 0);
    withEnv({ ALTERBRAIN_GIT_LFS: undefined }, () => {
      assert.deepEqual(lfsPendingUpload(root), { count: 0, bytes: 0 }, 'uploaded');
    });
  } finally {
    cleanup(parent);
  }
});

test('pushCurrent: a push stopped by its time limit comes back as "timeout", which is only logged and tried again later', release(), () => {
  const { parent, root, bare } = makeProject({ remote: true });
  try {
    // The online copy takes a long time to answer (a server-side check that sleeps).
    writeFileSync(join(bare, 'hooks', 'pre-receive'), ['#!/bin/sh', 'sleep 3', 'exit 0', ''].join('\n'), { mode: 0o755 });
    write(root, 'vault/Ideas.md', '# Ideas\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'a note']);
    const started = Date.now();
    const res = withEnv({ ALTERBRAIN_GIT_LFS: 'none' }, () => pushCurrent(root, { timeoutMs: 1000 }));
    assert.equal(res.ok, false);
    assert.equal(res.kind, 'timeout', res.error);
    assert.ok(Date.now() - started < 2900, 'stopped by the limit, not by the end of the sleep');
  } finally {
    // The server-side process that was left sleeping must end before its folder can be removed.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3500);
    cleanup(parent);
  }
});
