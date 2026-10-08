// The weekly update check (system/lib/updatecheck.mjs): stubbed fetcher for the rules, one real hook run against a
// local server for the wiring. No test touches the real network.
// Documented fallback covered here (SPEC 15a.5): state/local/update-check.json missing or unreadable means "check now".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, contextOf, makeProject, runHook } from '../fixtures/hooks/helpers.mjs';
import { checkForUpdate } from '../../system/lib/updatecheck.mjs';

const BASE = join(REPO, 'state', 'local', 'tmp', 'updatecheck');
mkdirSync(BASE, { recursive: true });
const made = [];
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const NOW = new Date(2026, 9, 8, 12, 0); // 2026-10-08
const LINE = (tag) => `Alterbrain ${tag} is available. Say 'update Alterbrain' when you're not mid-assignment.`;

function project({ tag = 'v0.2.0', repo = 'example/alterbrain', state } = {}) {
  const root = mkdtempSync(join(BASE, 'p-'));
  made.push(root);
  mkdirSync(join(root, 'system'), { recursive: true });
  writeFileSync(join(root, 'system', 'release.json'), JSON.stringify({ name: 'alterbrain', version: tag.replace(/^v/, ''), tag, repo }));
  if (state !== undefined) {
    mkdirSync(join(root, 'state', 'local'), { recursive: true });
    writeFileSync(join(root, 'state', 'local', 'update-check.json'), typeof state === 'string' ? state : JSON.stringify(state));
  }
  return root;
}
const stateOf = (root) => {
  const f = join(root, 'state', 'local', 'update-check.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const stub = (tag) => {
  const calls = [];
  const fn = async (arg) => {
    calls.push(arg);
    if (tag instanceof Error) throw tag;
    return tag;
  };
  fn.calls = calls;
  return fn;
};

test('no state yet: asks, writes the date and the latest tag, and shows the line when newer', async () => {
  const root = project();
  const fetchLatest = stub('v0.3.0');
  const r = await checkForUpdate({ root, now: NOW, fetchLatest });
  assert.equal(r.line, LINE('v0.3.0'));
  assert.equal(fetchLatest.calls.length, 1);
  assert.equal(fetchLatest.calls[0].repo, 'example/alterbrain');
  assert.deepEqual(stateOf(root), { schema: 1, checked: '2026-10-08', latest: 'v0.3.0' });
});

test('a check 7 or more days old runs again; one under 7 days old does not touch the network', async () => {
  for (const [checked, runs] of [['2026-10-01', true], ['2026-09-01', true], ['2026-10-02', false], ['2026-10-08', false]]) {
    const root = project({ state: { schema: 1, checked, latest: null } });
    const fetchLatest = stub('v0.3.0');
    const r = await checkForUpdate({ root, now: NOW, fetchLatest });
    assert.equal(fetchLatest.calls.length, runs ? 1 : 0, checked);
    assert.equal(r.line, runs ? LINE('v0.3.0') : null, checked);
    if (!runs) assert.equal(stateOf(root).checked, checked, 'a fresh state is left as it is');
  }
});

test('the same or an older release: no line, but the check is recorded', async () => {
  for (const latest of ['v0.2.0', 'v0.1.9']) {
    const root = project();
    const r = await checkForUpdate({ root, now: NOW, fetchLatest: stub(latest) });
    assert.equal(r.line, null, latest);
    assert.deepEqual(stateOf(root), { schema: 1, checked: '2026-10-08', latest });
  }
});

test('offline, a failure or a timeout: no line, nothing written, so the next session tries again', async () => {
  for (const fetchLatest of [stub(new Error('getaddrinfo ENOTFOUND')), () => new Promise(() => {}), stub(null), stub('not a tag'), stub('v0.3.0-beta')]) {
    const root = project();
    const r = await checkForUpdate({ root, now: NOW, fetchLatest, timeoutMs: 60 });
    assert.equal(r.line, null);
    assert.equal(stateOf(root), null);
  }
});

test('an unreadable or odd state file is treated as stale', async () => {
  for (const state of ['{ nope', '\u0000\u0001', '[]', JSON.stringify({ checked: 'yesterday' }), JSON.stringify({ checked: '2099-01-01' }), JSON.stringify(null)]) {
    const root = project({ state });
    const fetchLatest = stub('v0.3.0');
    const r = await checkForUpdate({ root, now: NOW, fetchLatest });
    assert.equal(fetchLatest.calls.length, 1, state);
    assert.equal(r.line, LINE('v0.3.0'));
  }
});

test('developer mode, a compact, the off switch, and a release file with no repo all skip the check', async () => {
  const fetchLatest = stub('v0.3.0');
  const root = project();
  assert.equal((await checkForUpdate({ root, now: NOW, fetchLatest, devMode: true })).line, null);
  assert.equal((await checkForUpdate({ root, now: NOW, fetchLatest, source: 'compact' })).line, null);
  const previous = process.env.ALTERBRAIN_UPDATE_CHECK;
  process.env.ALTERBRAIN_UPDATE_CHECK = 'off';
  try {
    assert.equal((await checkForUpdate({ root, now: NOW, fetchLatest })).line, null);
  } finally {
    if (previous === undefined) delete process.env.ALTERBRAIN_UPDATE_CHECK;
    else process.env.ALTERBRAIN_UPDATE_CHECK = previous;
  }
  assert.equal((await checkForUpdate({ root: project({ repo: 'not a repo' }), now: NOW, fetchLatest })).line, null);
  assert.equal(fetchLatest.calls.length, 0);
  assert.equal(stateOf(root), null);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

/** A tiny GitHub stand-in in its own process, because runHook blocks this process while the hook runs. */
function startServer(body, status = 200) {
  const code = `
    const http = require('node:http');
    const s = http.createServer((req, res) => {
      console.error('REQ ' + req.method + ' ' + req.url + ' ' + (req.headers['user-agent'] || ''));
      res.writeHead(${status}, { 'content-type': 'application/json' });
      res.end(${JSON.stringify(JSON.stringify(body))});
    });
    s.listen(0, '127.0.0.1', () => console.log(s.address().port));
  `;
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let requests = '';
  child.stderr.on('data', (d) => { requests += d; });
  return new Promise((resolve, reject) => {
    child.stdout.once('data', (d) => resolve({ port: Number(String(d).trim()), requests: () => requests, stop: () => child.kill() }));
    child.once('error', reject);
  });
}

test('the hook asks once, shows the line in the digest, and stays quiet the next time', async (t) => {
  const server = await startServer({ tag_name: 'v9.9.9' });
  t.after(server.stop);
  const p = makeProject();
  t.after(p.cleanup);
  p.write('system/release.json', JSON.stringify({ name: 'alterbrain', version: '0.2.0', tag: 'v0.2.0', repo: 'example/alterbrain', min_claude_code: '2.1.283' }));
  const env = { ALTERBRAIN_UPDATE_CHECK_URL: `http://127.0.0.1:${server.port}/releases/latest`, ALTERBRAIN_UPDATE_CHECK: undefined };

  const first = runHook(p, 'session_start', { hook_event_name: 'SessionStart', source: 'startup' }, { env });
  assert.equal(first.code, 0, first.stderr);
  const text = contextOf(first);
  assert.ok(text.includes(LINE('v9.9.9')), text);
  await settle(); // the child's output is read on the event loop, which runHook blocked
  assert.match(server.requests(), /REQ GET \/releases\/latest alterbrain-update/);
  assert.equal(JSON.parse(p.read('state/local/update-check.json')).latest, 'v9.9.9');

  // The line belongs to the session that ran the check.
  const second = runHook(p, 'session_start', { hook_event_name: 'SessionStart', source: 'startup' }, { env });
  assert.ok(!contextOf(second).includes('is available'), 'not repeated within the week');
  await settle();
  assert.equal(server.requests().match(/REQ /g).length, 1, 'no second request');
});

test('the hook is silent when the server fails, and writes no state', async (t) => {
  const server = await startServer({ message: 'rate limited' }, 403);
  t.after(server.stop);
  const p = makeProject();
  t.after(p.cleanup);
  p.write('system/release.json', JSON.stringify({ name: 'alterbrain', version: '0.2.0', tag: 'v0.2.0', repo: 'example/alterbrain' }));
  const r = runHook(p, 'session_start', { hook_event_name: 'SessionStart', source: 'startup' }, { env: { ALTERBRAIN_UPDATE_CHECK_URL: `http://127.0.0.1:${server.port}/x` } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(contextOf(r), /Today is /);
  assert.ok(!contextOf(r).includes('is available'));
  assert.equal(p.exists('state/local/update-check.json'), false);
});

test('the hook does not ask on a compact or in developer mode', async (t) => {
  const server = await startServer({ tag_name: 'v9.9.9' });
  t.after(server.stop);
  const url = { ALTERBRAIN_UPDATE_CHECK_URL: `http://127.0.0.1:${server.port}/x` };
  const release = JSON.stringify({ name: 'alterbrain', version: '0.2.0', tag: 'v0.2.0', repo: 'example/alterbrain' });
  const a = makeProject();
  t.after(a.cleanup);
  a.write('system/release.json', release);
  assert.ok(!contextOf(runHook(a, 'session_start', { hook_event_name: 'SessionStart', source: 'compact' }, { env: url })).includes('is available'));
  const b = makeProject({ devMode: true });
  t.after(b.cleanup);
  b.write('system/release.json', release);
  assert.ok(!contextOf(runHook(b, 'session_start', { hook_event_name: 'SessionStart', source: 'startup' }, { env: url })).includes('is available'));
  await settle();
  assert.equal(server.requests(), '', 'the server was never asked');
});
