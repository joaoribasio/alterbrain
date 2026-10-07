// The SessionEnd hook with a push that needs more time than a hook may wait (ADR 0020). A slow upload must not become a
// "could not save or back up your work" task, and must not be stopped half way on every save.
// Part 1 uses a stand-in for git-auto (it sleeps on the first push); part 2 runs the real hook, git-auto and Git LFS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, runHook } from '../fixtures/hooks/helpers.mjs';
import {
  SKIP, blobAt, bytes, cleanup, exists, git, isPointer, lfsObjectPath, logOf, makeProject as makeRealProject, runSessionEnd, sha256, tasksOf, write,
} from '../fixtures/scripts/lfs-helpers.mjs';

const END = { hook_event_name: 'SessionEnd', reason: 'other' };

// Stand-in for git-auto: records "<command> <how the hook asked for the background>" and sleeps on a push that is not the hand-over.
const STUB = [
  "import { appendFileSync, mkdirSync } from 'node:fs';",
  "import { join } from 'node:path';",
  "const command = process.argv[2] || '';",
  "const how = process.env.ALTERBRAIN_PUSH_BACKGROUND || '-';",
  "const dir = join(process.env.CLAUDE_PROJECT_DIR, 'state', 'local', 'tmp');",
  'mkdirSync(dir, { recursive: true });',
  "appendFileSync(join(dir, 'git-calls.log'), `${command} ${how}\\n`);",
  "const sleepMs = Number(process.env['STUB_SLEEP_' + command.toUpperCase() + (how === 'now' ? '_NOW' : '')] || 0);",
  'if (sleepMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);',
  "process.exit(Number(process.env['STUB_EXIT_' + command.toUpperCase() + (how === 'now' ? '_NOW' : '')] || 0));",
  '',
].join('\n');

function stubProject() {
  const p = makeProject({ gitAuto: true });
  p.write('system/scripts/git-auto.mjs', STUB);
  return p;
}
const SHORT = { ALTERBRAIN_HOOK_PUSH_TIMEOUT_MS: '1500' };

test('a push that runs out of the hook\'s time is not a crash: no task, a log line, and the upload is handed to the background', (t) => {
  const p = stubProject();
  t.after(p.cleanup);
  const r = runHook(p, 'session_end', END, { env: { ...SHORT, STUB_SLEEP_PUSH: '20000' } });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.deepEqual(p.gitCalls(), ['commit -', 'push 1', 'push now'], 'asked for the background, ran out of time, handed over');
  const tasks = p.read('vault/00_inbox/Tasks.md');
  assert.ok(!/#ab\/git/.test(tasks), 'no "could not save or back up your work" task');
  const log = p.read('state/local/git.log');
  assert.match(log, /push hook-timeout the step needed more than 2 s/);
  assert.ok(!/hook-error/.test(log));
});

test('a push that finishes in time is asked for once, with the background offer, and nothing is handed over', (t) => {
  const p = stubProject();
  t.after(p.cleanup);
  runHook(p, 'session_end', END, { env: SHORT });
  assert.deepEqual(p.gitCalls(), ['commit -', 'push 1']);
  assert.equal(p.exists('state/local/git.log'), false);
});

test('a hand-over that itself crashes is reported like any crash, and one that runs out of time is not', (t) => {
  const p = stubProject();
  t.after(p.cleanup);
  runHook(p, 'session_end', END, { env: { ...SHORT, STUB_SLEEP_PUSH: '20000', STUB_EXIT_PUSH_NOW: '3' } });
  assert.match(p.read('state/local/git.log'), /push hook-error code=3/);
  assert.match(p.read('vault/00_inbox/Tasks.md'), /#ab\/git/);

  const q = stubProject();
  t.after(q.cleanup);
  runHook(q, 'session_end', END, { env: { ...SHORT, STUB_SLEEP_PUSH: '20000' } });
  assert.ok(!/#ab\/git/.test(q.read('vault/00_inbox/Tasks.md')));
});

test('a push that exits with a failure git-auto already reported (exit 1) is not handed over', (t) => {
  const p = stubProject();
  t.after(p.cleanup);
  runHook(p, 'session_end', END, { env: { ...SHORT, STUB_EXIT_PUSH: '1' } });
  assert.deepEqual(p.gitCalls(), ['commit -', 'push 1']);
  assert.equal(p.exists('state/local/git.log'), false);
});

test('a commit that runs out of time is still reported, because nothing was saved, and the push is not tried', (t) => {
  const p = stubProject();
  t.after(p.cleanup);
  const r = runHook(p, 'session_end', END, { env: { ALTERBRAIN_HOOK_COMMIT_TIMEOUT_MS: '1000', STUB_SLEEP_COMMIT: '20000' } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(p.gitCalls(), ['commit -']);
  assert.match(p.read('state/local/git.log'), /commit hook-error code=-1/);
  assert.match(p.read('vault/00_inbox/Tasks.md'), /#ab\/git/);
});

/* ---------------- the real thing ---------------- */

async function waitFor(check, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail(`timed out waiting for ${what}`);
}

test('a big file: the real hook returns at once, silently, and the upload finishes in the background', { skip: SKIP }, async () => {
  const { parent, root, bare } = makeRealProject({ remote: true, framework: true });
  try {
    const mov = bytes(6000);
    write(root, 'vault/40_sources/raw/2026/lecture recording.mov', mov);
    write(root, 'vault/Ideas.md', '# Ideas\n');
    const r = runSessionEnd(root, { env: { ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '1000' } }); // "big" for this test = 1000 bytes
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/raw/2026/lecture recording.mov')), true);

    await waitFor(() => git(bare, ['rev-parse', 'main']) === git(root, ['rev-parse', 'HEAD']) && !exists(root, 'state/local/lfs-upload.lock'), 'the upload');
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))), 'the file itself reached the online copy');
    assert.match(logOf(root), /push background-upload finished: ok/);
    assert.doesNotMatch(tasksOf(root), /#ab\/git/, 'nothing needs the user');

    // A note written meanwhile goes up with the next save, quickly and in the foreground.
    write(root, 'vault/Later.md', '# Later\n');
    const again = runSessionEnd(root, { env: { ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '1000' } });
    assert.equal(again.code, 0, again.stderr);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
  } finally {
    cleanup(parent);
  }
});

test('a big upload that is already running is not started again by the next save, and the notes are still saved', { skip: SKIP }, async () => {
  const { parent, root, bare } = makeRealProject({ remote: true, framework: true });
  try {
    write(root, 'vault/recordings/week 1.mov', bytes(6000));
    const first = runSessionEnd(root, { env: { ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '1000' } });
    assert.equal(first.code, 0, first.stderr);
    // Whether the first upload is still running or already done, a second save never fails and never makes a task.
    write(root, 'vault/Later.md', '# Later\n');
    const second = runSessionEnd(root, { env: { ALTERBRAIN_BACKGROUND_UPLOAD_BYTES: '1000' } });
    assert.equal(second.code, 0, second.stderr);
    assert.equal(second.stdout, '');
    await waitFor(() => !exists(root, 'state/local/lfs-upload.lock'), 'the background upload to end');
    const last = runSessionEnd(root);
    assert.equal(last.code, 0, last.stderr);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']), 'everything, notes included, is online');
    assert.doesNotMatch(tasksOf(root), /#ab\/git/);
  } finally {
    cleanup(parent);
  }
});
