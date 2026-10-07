// A big Git LFS upload can take far longer than a hook may wait, and Git LFS cannot resume a stopped upload. git-auto therefore
// starts it as a separate process (push --detached) that carries on by itself, one at a time (state/local/lfs-upload.lock).
// Real git, real Git LFS, a local bare repository as "origin". The size from which an upload goes to the background is
// injected (ALTERBRAIN_BACKGROUND_UPLOAD_BYTES) so that the files stay small.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKIP, blobAt, bytes, cleanup, exists, git, isPointer, lfsObjectPath, logOf, makeProject, runAuto, sha256, tasksOf, write,
} from '../fixtures/scripts/lfs-helpers.mjs';

const LOCK = 'state/local/lfs-upload.lock';
const ASK = { ALTERBRAIN_PUSH_BACKGROUND: '1', ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '1000' };

async function waitFor(check, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail(`timed out waiting for ${what}`);
}

/** A project with one big file saved as a Git LFS pointer, not uploaded yet. */
function projectWithPendingUpload(size = 6000) {
  const p = makeProject({ remote: true });
  const mov = bytes(size);
  write(p.root, 'vault/recordings/week 1.mov', mov);
  const saved = runAuto(p.root, 'commit');
  assert.equal(saved.code, 0, saved.stdout + saved.stderr);
  assert.equal(isPointer(blobAt(p.root, 'HEAD', 'vault/recordings/week 1.mov')), true);
  return { ...p, mov };
}

const online = (p) => git(p.bare, ['rev-parse', 'main']) === git(p.root, ['rev-parse', 'HEAD']);
const uploaded = (p) => existsSync(lfsObjectPath(join(p.bare, 'lfs'), sha256(p.mov)));

test('a big upload is started in the background, finishes by itself, and gives the lock back', { skip: SKIP }, async () => {
  const p = projectWithPendingUpload();
  try {
    const started = Date.now();
    const r = runAuto(p.root, 'push', { env: ASK });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.background, true);
    assert.equal(r.json.started, true);
    assert.equal(r.json.pending.count, 1);
    assert.match(r.json.message, /running in the background/);
    assert.ok(Date.now() - started < 30_000);

    await waitFor(() => online(p) && uploaded(p) && !exists(p.root, LOCK), 'the background upload to finish');
    const log = logOf(p.root);
    assert.match(log, /push background-upload started: 1 big file\(s\)/);
    assert.match(log, /push background-upload finished: ok/);
    assert.doesNotMatch(tasksOf(p.root), /#ab\/git/, 'nothing needs the user');
    assert.equal(runAuto(p.root, 'push').json.status, 'ok', 'and the next push has nothing left to do');
  } finally {
    cleanup(p.parent);
  }
});

test('a small upload is done right away, not in the background', { skip: SKIP }, () => {
  const p = projectWithPendingUpload();
  try {
    const r = runAuto(p.root, 'push', { env: { ALTERBRAIN_PUSH_BACKGROUND: '1' } }); // the real limit is 16 MB: 6000 bytes is quick
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.background, undefined);
    assert.equal(online(p), true, 'it was uploaded before git-auto returned');
    assert.equal(uploaded(p), true);
    assert.equal(exists(p.root, LOCK), false);
  } finally {
    cleanup(p.parent);
  }
});

test('without a request for the background, a big upload is done in the foreground, as a person running it by hand expects', { skip: SKIP }, () => {
  const p = projectWithPendingUpload();
  try {
    const r = runAuto(p.root, 'push', { env: { ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '1' } });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.background, undefined);
    assert.equal(online(p) && uploaded(p), true);
  } finally {
    cleanup(p.parent);
  }
});

test('while an upload is running, another push waits instead of starting a second upload', { skip: SKIP }, () => {
  const p = projectWithPendingUpload();
  try {
    // This test process stands in for the running upload: its process number is alive.
    mkdirSync(join(p.root, 'state', 'local'), { recursive: true });
    writeFileSync(join(p.root, LOCK), JSON.stringify({ pid: process.pid, started: Date.now(), token: 'someone' }));
    for (const env of [{}, ASK]) {
      const r = runAuto(p.root, 'push', { env });
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.equal(r.json.status, 'skipped');
      assert.equal(r.json.running, true);
      assert.match(r.json.message, /already running in the background/);
    }
    assert.equal(online(p), false, 'nothing was sent by the second push');
    assert.equal(exists(p.root, LOCK), true, 'and the running upload keeps its lock');
    const status = runAuto(p.root, 'status');
    assert.equal(status.json.info.upload_running, true);
    assert.match(status.json.message, /big upload is running in the background/);
  } finally {
    cleanup(p.parent);
  }
});

test('a lock left behind by a process that is gone, one that is far too old, and a broken one are ignored and removed', { skip: SKIP }, () => {
  const gone = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  assert.ok(gone.pid > 0);
  const cases = {
    'a process that is gone': () => JSON.stringify({ pid: gone.pid, started: Date.now(), token: 'x' }),
    'a lock older than the time limit': () => JSON.stringify({ pid: process.pid, started: Date.now() - 4 * 60 * 60 * 1000, token: 'x' }),
    'a lock that cannot be read': () => '{ this is not json',
  };
  for (const [name, content] of Object.entries(cases)) {
    const p = projectWithPendingUpload();
    try {
      mkdirSync(join(p.root, 'state', 'local'), { recursive: true });
      const file = join(p.root, LOCK);
      writeFileSync(file, content());
      const old = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(file, old, old); // for the broken one: it is judged by its age
      const r = runAuto(p.root, 'push');
      assert.equal(r.code, 0, `${name}: ${r.stdout}${r.stderr}`);
      assert.equal(r.json.status, 'ok', name);
      assert.equal(online(p), true, `${name}: the push went ahead`);
      assert.equal(exists(p.root, LOCK), false, name);
    } finally {
      cleanup(p.parent);
    }
  }
});

test('"now" starts the background upload whatever the size (used when a push ran out of time)', { skip: SKIP }, async () => {
  const p = makeProject({ remote: true });
  try {
    write(p.root, 'vault/Ideas.md', '# Ideas\n');
    assert.equal(runAuto(p.root, 'commit').code, 0);
    const r = runAuto(p.root, 'push', { env: { ALTERBRAIN_PUSH_BACKGROUND: 'now' } });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.background, true);
    assert.equal(r.json.started, true);
    assert.match(r.json.message, /The upload is running in the background/);
    await waitFor(() => online(p) && !exists(p.root, LOCK), 'the upload to finish');
    assert.match(logOf(p.root), /push background-upload started: the upload ran out of time here/);
    assert.match(logOf(p.root), /push background-upload finished: ok/);
  } finally {
    cleanup(p.parent);
  }
});

test('a file GitHub would refuse is reported at once, not in a background process that nobody reads', { skip: SKIP }, () => {
  const p = makeProject({ remote: true });
  try {
    write(p.root, 'vault/recordings/week 1.mov', bytes(6000));
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'saved by a phone']);
    const r = runAuto(p.root, 'push', { env: { ...ASK, ALTERBRAIN_PUSH_BACKGROUND: 'now', ALTERBRAIN_BLOB_LIMIT_BYTES: '4000' } });
    assert.equal(r.code, 1);
    assert.equal(r.json.kind, 'big-blob');
    assert.equal(exists(p.root, LOCK), false);
  } finally {
    cleanup(p.parent);
  }
});

test('when the background upload fails, the lock is still given back and the failure is reported as usual', { skip: SKIP }, async () => {
  const p = projectWithPendingUpload();
  try {
    // The online copy refuses every change (a server-side check says no): the background push cannot succeed.
    writeFileSync(join(p.bare, 'hooks', 'pre-receive'), ['#!/bin/sh', 'echo "declined for the test" >&2', 'exit 1', ''].join('\n'), { mode: 0o755 });
    const r = runAuto(p.root, 'push', { env: { ALTERBRAIN_PUSH_BACKGROUND: 'now' } });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.background, true);
    await waitFor(() => !exists(p.root, LOCK) && /background-upload finished: failed/.test(logOf(p.root)), 'the failed upload to finish');
    assert.equal(tasksOf(p.root).split('#ab/git').length - 1, 1, 'one task, like any other failed backup');
    assert.equal(online(p), false);
  } finally {
    cleanup(p.parent);
  }
});
