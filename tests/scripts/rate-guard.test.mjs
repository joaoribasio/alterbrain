// Tests for rate-guard.mjs (status and the user's reset commands). Run: node --test tests/scripts/rate-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, makeProject, read, runScript, write } from '../fixtures/scripts/helpers.mjs';

const LIMITS = readFileSync(join(REPO, 'system', 'catalogue', 'limits.json'), 'utf8');
const LEDGER = 'state/local/rate-guard/ledger.jsonl';
const STATE = 'state/local/rate-guard/state.json';

function project() {
  const p = makeProject();
  write(p, 'system/catalogue/limits.json', LIMITS);
  return p;
}
const row = (over = {}) => JSON.stringify({ ts: new Date().toISOString(), server: 'linkedin', tool: 'get_person_profile', category: 'profile', outcome: 'ok', ...over });
const inFuture = (hours) => new Date(Date.now() + hours * 3600e3).toISOString();
const run = (p, ...args) => runScript('rate-guard.mjs', args, p);
const stateOf = (p) => JSON.parse(read(p, STATE)).servers.linkedin;

test('status with no rate-limited tool switched on says so and exits 0', () => {
  const p = project();
  try {
    const r = run(p, 'status');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No tool with usage limits is switched on/);
    assert.deepEqual(run(p, 'status', '--json').json().servers, []);
    const all = run(p, 'status', '--all');
    assert.match(all.stdout, /LinkedIn \(not switched on\)/);
  } finally {
    p.cleanup();
  }
});

test('status shows what is used and the rules, in plain words, for a switched-on server', () => {
  const p = project();
  try {
    write(p, 'config/mcp.selected.json', JSON.stringify({ schema: 1, enabled: ['mcpvault', 'linkedin'] }));
    write(p, LEDGER, [row(), row(), row({ tool: 'connect_with_person', category: 'invite' })].join('\n') + '\n');
    const r = run(p, 'status');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^LinkedIn\n/);
    assert.match(r.stdout, /Normal: no warnings\./);
    assert.match(r.stdout, /- profile views: 2 of 40 today \(at least 20 seconds apart\)/);
    assert.match(r.stdout, /- connection requests: 1 of 15 today, 1 of 60 this week \(Monday to Thursday only, at least 30 seconds apart\) \[sends or changes things\]/);
    const j = run(p, 'status', '--json').json();
    assert.equal(j.ok, true);
    const li = j.servers[0];
    assert.equal(li.key, 'linkedin');
    assert.equal(li.enabled, true);
    assert.equal(li.categories.find((c) => c.category === 'profile').used_today, 2);
    assert.equal(li.categories.find((c) => c.category === 'invite').weekly_cap, 60);
  } finally {
    p.cleanup();
  }
});

test('status shows your own lower limits, and says when a raised one was ignored', () => {
  const p = project();
  try {
    write(p, 'config/mcp.selected.json', JSON.stringify({ schema: 1, enabled: ['linkedin'] }));
    write(p, 'config/limits.json', JSON.stringify({ schema: 1, servers: { linkedin: { categories: { invite: { daily_cap: 5 }, profile: { daily_cap: 500 }, nonsense: { daily_cap: 1 } } } } }));
    const r = run(p, 'status');
    assert.match(r.stdout, /connection requests: 0 of 5 today/);
    assert.match(r.stdout, /profile views: 0 of 40 today/);
    assert.match(r.stdout, /Ignored: your setting for profile\.daily_cap in config\/limits\.json is above the default and accept_risk is not switched on\./);
    assert.match(r.stdout, /"nonsense", which is not a known category/);
    write(p, 'config/limits.json', JSON.stringify({ schema: 1, servers: { linkedin: { accept_risk: true, categories: { profile: { daily_cap: 500 } } } } }));
    const accepted = run(p, 'status');
    assert.match(accepted.stdout, /profile views: 0 of 500 today/);
    assert.match(accepted.stdout, /You have accepted the risk/);
  } finally {
    p.cleanup();
  }
});

test('a pause after a warning is shown, makes status exit 1, and reset-throttle ends it', () => {
  const p = project();
  try {
    write(p, STATE, JSON.stringify({ schema: 1, servers: { linkedin: { warnings: [{ ts: new Date().toISOString(), what: 'captcha' }], paused_until: inFuture(20), throttled_until: inFuture(24 * 13) } } }));
    const r = run(p, 'status');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PAUSED until/);
    assert.match(r.stdout, /Limits are halved until/);
    assert.match(r.stdout, /reset-throttle linkedin/);
    assert.match(r.stdout, /- profile views: 0 of 20 today/, 'halved from 40');
    const reset = run(p, 'reset-throttle', 'linkedin');
    assert.equal(reset.status, 0, reset.stderr);
    assert.match(reset.stdout, /LinkedIn is no longer paused and its limits are back to normal/);
    const s = stateOf(p);
    assert.equal(s.paused_until, undefined);
    assert.equal(s.throttled_until, undefined);
    assert.deepEqual(s.warnings, []);
    assert.equal(run(p, 'status').status, 0);
    assert.match(run(p, 'reset-throttle', 'linkedin').stdout, /was not paused or halved/);
  } finally {
    p.cleanup();
  }
});

test('draft-only is shown, survives reset-throttle, and clear-draft-only switches it off', () => {
  const p = project();
  try {
    write(p, STATE, JSON.stringify({ schema: 1, servers: { linkedin: { warnings: [{ ts: new Date().toISOString() }, { ts: new Date().toISOString() }], paused_until: inFuture(2), throttled_until: inFuture(48), draft_only: true } } }));
    const r = run(p, 'status');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /DRAFT-ONLY: LinkedIn showed two warnings/);
    const reset = run(p, 'reset-throttle', 'LinkedIn');
    assert.match(reset.stdout, /still in draft-only mode/);
    assert.equal(stateOf(p).draft_only, true);
    const clear = run(p, 'clear-draft-only', 'linkedin', '--json');
    assert.equal(clear.status, 0);
    assert.deepEqual(clear.json(), { ok: true, server: 'linkedin', was_draft_only: true });
    assert.equal(stateOf(p).draft_only, false);
    assert.match(run(p, 'clear-draft-only', 'linkedin').stdout, /was not in draft-only mode/);
    assert.equal(run(p, 'status').status, 0);
  } finally {
    p.cleanup();
  }
});

test('an action with an unknown outcome is listed so the user can check it', () => {
  const p = project();
  try {
    write(p, LEDGER, row({ tool: 'connect_with_person', category: 'invite', outcome: 'unknown', target: 'jane-doe' }) + '\n');
    const r = run(p, 'status');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Not sure these went through/);
    assert.match(r.stdout, /connect_with_person for jane-doe/);
  } finally {
    p.cleanup();
  }
});

test('a damaged usage log is reported and repair-ledger keeps the good lines', () => {
  const p = project();
  try {
    write(p, LEDGER, `${row()}\nthis line is damaged\n${row()}\n`);
    const r = run(p, 'status', '--all');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Problem: the usage log .* is damaged on line 2; run: node system\/scripts\/rate-guard\.mjs repair-ledger/);
    const fix = run(p, 'repair-ledger');
    assert.equal(fix.status, 0);
    assert.match(fix.stdout, /Removed 1 damaged line from the usage log/);
    assert.equal(read(p, LEDGER).trim().split('\n').length, 2);
    assert.match(run(p, 'repair-ledger').stdout, /usage log is fine/);
    assert.equal(run(p, 'status', '--all').status, 0);
  } finally {
    p.cleanup();
  }
});

test('a damaged warning record is reported, and reset-throttle repairs it', () => {
  const p = project();
  try {
    write(p, STATE, '{{{ nope');
    assert.match(run(p, 'status', '--all').stdout, /warning record .* is damaged/);
    const fix = run(p, 'reset-throttle', 'linkedin');
    assert.equal(fix.status, 0);
    assert.match(fix.stdout, /The warning record was damaged, so it has been reset/);
    assert.equal(run(p, 'status', '--all').status, 0);
  } finally {
    p.cleanup();
  }
});

test('an unreadable limits file makes status report a problem instead of crashing', () => {
  const p = makeProject();
  try {
    write(p, 'system/catalogue/limits.json', '{ not json');
    const r = run(p, 'status');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Problem: .*limits\.json is not valid JSON/);
  } finally {
    p.cleanup();
  }
});

test('usage errors exit 2 and say what is known', () => {
  const p = project();
  try {
    assert.equal(run(p).status, 2);
    assert.equal(run(p, 'frobnicate').status, 2);
    assert.equal(run(p, 'status', '--nope').status, 2);
    const noServer = run(p, 'reset-throttle');
    assert.equal(noServer.status, 2);
    assert.match(noServer.stderr, /Known: linkedin/);
    const unknown = run(p, 'clear-draft-only', 'instagram');
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /"instagram" is not a tool with limits/);
  } finally {
    p.cleanup();
  }
});
