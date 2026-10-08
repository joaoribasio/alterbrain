import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, runHook } from '../fixtures/hooks/helpers.mjs';
import { THROTTLE_MS } from '../../system/hooks/session_end.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const STAMP = 'state/local/last-auto-commit';
const STOP = { hook_event_name: 'Stop', stop_hook_active: false };
const END = { hook_event_name: 'SessionEnd', reason: 'other' };

const sessionEnd = (p, input = END, opts) => runHook(p, 'session_end', input, opts);
const stop = (p, opts = {}) => runHook(p, 'session_end', STOP, { ...opts, args: ['--stop'] });

test('SessionEnd commits, then pushes, and prints nothing', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  const r = sessionEnd(p);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.deepEqual(p.gitCalls(), ['commit', 'push']);
  assert.ok(Number(p.read(STAMP)) > 0, 'a timestamp is stored');
});

test('SessionEnd always tries, even right after a Stop run', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  stop(p);
  assert.deepEqual(p.gitCalls(), ['commit', 'push']);
  sessionEnd(p);
  assert.deepEqual(p.gitCalls(), ['commit', 'push', 'commit', 'push']);
});

test('Stop is throttled to once every 10 minutes', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  assert.equal(THROTTLE_MS, 10 * 60 * 1000);

  stop(p);
  assert.deepEqual(p.gitCalls(), ['commit', 'push']);

  stop(p); // straight away: skipped
  assert.deepEqual(p.gitCalls(), ['commit', 'push']);

  p.write(STAMP, String(Date.now() - 9 * 60 * 1000)); // 9 minutes ago: still skipped
  stop(p);
  assert.equal(p.gitCalls().length, 2);

  p.write(STAMP, String(Date.now() - 11 * 60 * 1000)); // 11 minutes ago: runs
  stop(p);
  assert.deepEqual(p.gitCalls(), ['commit', 'push', 'commit', 'push']);
  assert.ok(Date.now() - Number(p.read(STAMP)) < 60_000, 'the stamp moves forward after a run');
});

test('Stop is recognised from the payload as well as from --stop', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  runHook(p, 'session_end', STOP); // no --stop flag
  runHook(p, 'session_end', STOP);
  assert.equal(p.gitCalls().length, 2, 'second Stop was throttled');
});

test('a future stamp is ignored and a broken stamp falls back to the file time', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  p.write(STAMP, String(Date.now() + 24 * 3600 * 1000));
  stop(p);
  assert.equal(p.gitCalls().length, 2);
  p.write(STAMP, 'garbage');
  p.remove('state/local/tmp/git-calls.log');
  stop(p); // falls back to the file time, which is "just now": throttled
  assert.equal(p.gitCalls().length, 0);
});

test('does nothing in dev mode', (t) => {
  const p = makeProject({ gitAuto: true, devMode: true });
  t.after(p.cleanup);
  const r = sessionEnd(p);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(p.gitCalls(), []);
  assert.equal(p.exists(STAMP), false);
  stop(p);
  assert.deepEqual(p.gitCalls(), []);
});

test('does nothing when git.auto_commit is false', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  p.write('config/brain.json', JSON.stringify({ schema: 1, git: { auto_commit: false, auto_push: true } }));
  sessionEnd(p);
  stop(p);
  assert.deepEqual(p.gitCalls(), []);
});

test('still saves when brain.json is missing or broken', (t) => {
  const missing = makeProject({ gitAuto: true });
  t.after(missing.cleanup);
  missing.remove('config/brain.json');
  sessionEnd(missing);
  assert.deepEqual(missing.gitCalls(), ['commit', 'push']);

  const broken = makeProject({ gitAuto: true });
  t.after(broken.cleanup);
  broken.write('config/brain.json', '{ nope');
  sessionEnd(broken);
  assert.deepEqual(broken.gitCalls(), ['commit', 'push']);
});

test('skips quietly when git-auto.mjs does not exist', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = sessionEnd(p);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(p.exists(STAMP), false);
  assert.equal(stop(p).code, 0);
});

test('a failure that git-auto already reported (exit 1) adds nothing extra', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  const r = sessionEnd(p, END, { env: { FAKE_GIT_EXIT_COMMIT: '1', FAKE_GIT_EXIT_PUSH: '1' } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(p.gitCalls(), ['commit', 'push'], 'push is still attempted after a failed commit');
  assert.equal(p.exists('state/local/git.log'), false);
  assert.ok(!/#ab\/git/.test(p.read('vault/00_inbox/Tasks.md')));
});

test('a crash of git-auto itself is logged and becomes a plain-language task', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  const r = sessionEnd(p, END, { env: { FAKE_GIT_EXIT_COMMIT: '3' } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  const log = p.read('state/local/git.log');
  assert.match(log, /commit hook-error code=3/);
  const tasks = p.read('vault/00_inbox/Tasks.md');
  assert.match(tasks, /- \[ \] Alterbrain could not save or back up your work\. .* #ab\/git/);
  // Running again does not pile up identical tasks.
  sessionEnd(p, END, { env: { FAKE_GIT_EXIT_COMMIT: '3' } });
  assert.equal(p.read('vault/00_inbox/Tasks.md').match(/#ab\/git/g).length, 1);
});

test('malformed input is not an error and does not stop the save', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  for (const raw of ['', 'garbage', '[]']) {
    const r = runHook(p, 'session_end', null, { raw, args: ['--stop'] });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.ok(p.gitCalls().length >= 2);
});

test('never prints, whatever happens', release(), (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  for (const env of [{}, { FAKE_GIT_EXIT_COMMIT: '1' }, { FAKE_GIT_EXIT_PUSH: '2' }, { FAKE_GIT_MESSAGE: 'x'.repeat(5000) }]) {
    p.remove(STAMP);
    const r = sessionEnd(p, END, { env });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
});
