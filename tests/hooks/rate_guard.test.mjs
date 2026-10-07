import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, contextOf, decisionOf, makeProject, reasonOf, runHook } from '../fixtures/hooks/helpers.mjs';
import { applyUser, categoryFor, decideCall, detectWarning, findServer, validateLimits } from '../../system/lib/rateguard.mjs';

const REAL = JSON.parse(readFileSync(join(REPO, 'system', 'catalogue', 'limits.json'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const LEDGER = 'state/local/rate-guard/ledger.jsonl';
const STATE = 'state/local/rate-guard/state.json';
const TASKS = 'vault/00_inbox/Tasks.md';

/** The shipped LinkedIn block with small caps, so the tests stay short. Warning and outcome patterns are the shipped ones. */
function testLimits(mutate) {
  const l = clone(REAL);
  const c = l.servers.linkedin.categories;
  Object.assign(c.invite, { daily_cap: 2, min_gap_seconds: 0 });
  delete c.invite.weekly_cap;
  delete c.invite.weekday_cap;
  Object.assign(c.message, { daily_cap: 5, min_gap_seconds: 3600 });
  delete c.message.weekly_cap;
  Object.assign(c.profile, { daily_cap: 3, min_gap_seconds: 0 });
  Object.assign(c.other, { daily_cap: 2, min_gap_seconds: 0 });
  if (mutate) mutate(l.servers.linkedin, l);
  return l;
}

function project(limits = testLimits(), opts) {
  const p = makeProject(opts);
  if (limits) p.write('system/catalogue/limits.json', typeof limits === 'string' ? limits : JSON.stringify(limits));
  return p;
}

const LI = 'mcp__linkedin__';
const pre = (tool, tool_input = {}, server = LI) => ({ hook_event_name: 'PreToolUse', tool_name: server + tool, tool_input });
const post = (tool, tool_input = {}, tool_response = [{ type: 'text', text: 'ok' }], server = LI) => ({
  hook_event_name: 'PostToolUse',
  tool_name: server + tool,
  tool_input,
  tool_response,
  tool_use_id: 'toolu_1',
  is_error: false,
});
const failed = (tool, tool_input, error, server = LI) => ({ hook_event_name: 'PostToolUseFailure', tool_name: server + tool, tool_input, error, is_error: true, tool_use_id: 'toolu_2' });
const json = (obj) => [{ type: 'text', text: JSON.stringify(obj) }];
const guard = (p, payload, opts) => runHook(p, 'rate_guard', payload, opts);
const ledger = (p) => (p.read(LEDGER) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const state = (p) => JSON.parse(p.read(STATE));
const quiet = (r) => assert.equal(r.stdout, '', `expected no output, got: ${r.stdout}`);
const denied = (r, ...words) => {
  assert.equal(decisionOf(r), 'deny', r.stdout);
  for (const w of words) assert.match(reasonOf(r), w);
};

/* ---------------- pure decisions (explicit dates) ---------------- */

const effective = (mutate) => {
  const def = clone(REAL.servers.linkedin);
  if (mutate) mutate(def.categories);
  return applyUser(def);
};
const rowsAt = (category, ...dates) => dates.map((d) => ({ server: 'linkedin', tool: 'x', category, outcome: 'ok', ts: d.toISOString(), _t: d.getTime() }));
const decide = (def, category, now, rows = [], srv = {}, extra = {}) => decideCall({ key: 'linkedin', def, category, tool: 'connect_with_person', toolInput: {}, now, rows, srv, ...extra });

test('weekday cap: an invite on a Friday is blocked (the author\'s regression), Monday to Thursday are fine', () => {
  const def = effective();
  const friday = new Date(2026, 9, 2, 9, 0, 0);
  const verdict = decide(def, 'invite', friday);
  assert.equal(verdict?.kind, 'weekday');
  assert.match(verdict.reason, /Monday to Thursday/);
  assert.match(verdict.reason, /Friday/);
  assert.match(verdict.reason, /protects your LinkedIn account/);
  assert.match(verdict.reason, /Monday at 00:00/);
  assert.equal(decide(def, 'invite', new Date(2026, 9, 1, 9, 0, 0)), null, 'Thursday');
  assert.equal(decide(def, 'invite', new Date(2026, 9, 5, 9, 0, 0)), null, 'Monday');
  assert.equal(decide(def, 'invite', new Date(2026, 9, 3, 9, 0, 0))?.kind, 'weekday', 'Saturday');
  assert.equal(decide(def, 'invite', new Date(2026, 9, 4, 9, 0, 0))?.kind, 'weekday', 'Sunday');
});

test('weekday cap does not touch categories that do not carry it, and numbers (Monday = 0) work too', () => {
  const def = effective();
  assert.equal(decide(def, 'profile', new Date(2026, 9, 3, 9, 0, 0)), null, 'a profile read on a Saturday');
  const numeric = effective((c) => (c.invite.weekday_cap = [0, 1, 2, 3]));
  assert.equal(decide(numeric, 'invite', new Date(2026, 9, 2, 9, 0, 0))?.kind, 'weekday');
  assert.equal(decide(numeric, 'invite', new Date(2026, 9, 1, 9, 0, 0)), null);
});

test('daily cap resets at local midnight: yesterday does not count', () => {
  const def = effective((c) => ((c.profile.daily_cap = 3), (c.profile.min_gap_seconds = 0)));
  const now = new Date(2026, 9, 6, 12, 0, 0); // Tuesday
  const yesterday = new Date(2026, 9, 5, 23, 30, 0);
  assert.equal(decide(def, 'profile', now, rowsAt('profile', yesterday, yesterday, yesterday, yesterday)), null);
  const today = new Date(2026, 9, 6, 0, 5, 0);
  const verdict = decide(def, 'profile', now, rowsAt('profile', today, today, today));
  assert.equal(verdict?.kind, 'daily');
  assert.match(verdict.reason, /3 of 3 used today/);
  assert.match(verdict.reason, /tomorrow at 00:00/);
  assert.match(verdict.reason, /protects your LinkedIn account/);
});

test('weekly cap blocks after the limit and resets on Monday', () => {
  const def = effective((c) => ((c.invite.daily_cap = 50), (c.invite.weekly_cap = 3), (c.invite.min_gap_seconds = 0), delete c.invite.weekday_cap));
  const monday = new Date(2026, 9, 5, 9, 0, 0);
  const wed = new Date(2026, 9, 7, 9, 0, 0);
  const verdict = decide(def, 'invite', wed, rowsAt('invite', monday, monday, monday));
  assert.equal(verdict?.kind, 'weekly');
  assert.match(verdict.reason, /3 of 3 used this week/);
  assert.match(verdict.reason, /starts again Monday at 00:00/);
  const farOff = decide(def, 'invite', new Date(2026, 9, 7, 9, 0, 0), rowsAt('invite', monday, monday, monday), {});
  assert.equal(farOff?.kind, 'weekly');
  const lastWeek = new Date(2026, 9, 2, 9, 0, 0);
  assert.equal(decide(def, 'invite', wed, rowsAt('invite', lastWeek, lastWeek, lastWeek)), null);
});

test('minimum gap: too soon is blocked, and the reason says how long to wait; after the gap it is fine', () => {
  const def = effective((c) => ((c.message.min_gap_seconds = 60), (c.message.daily_cap = 50)));
  const now = new Date(2026, 9, 6, 12, 0, 30);
  const verdict = decide(def, 'message', now, rowsAt('message', new Date(2026, 9, 6, 12, 0, 0)));
  assert.equal(verdict?.kind, 'gap');
  assert.match(verdict.reason, /Wait 30 more seconds/);
  assert.equal(decide(def, 'message', new Date(2026, 9, 6, 12, 1, 1), rowsAt('message', new Date(2026, 9, 6, 12, 0, 0))), null);
});

test('a warning halves the daily and weekly caps (never below 1)', () => {
  const def = effective((c) => ((c.profile.daily_cap = 20), (c.profile.min_gap_seconds = 0), (c.employees.daily_cap = 1), (c.employees.min_gap_seconds = 0)));
  const now = new Date(2026, 9, 6, 12, 0, 0);
  const srv = { throttled_until: new Date(2026, 9, 20).toISOString() };
  const ten = new Date(2026, 9, 6, 8, 0, 0);
  const halved = decide(def, 'profile', now, rowsAt('profile', ...Array(10).fill(ten)), srv);
  assert.equal(halved?.kind, 'daily');
  assert.match(halved.reason, /10 of 10 used today/);
  assert.match(halved.reason, /halved \(from 20 to 10\)/);
  assert.equal(decide(def, 'profile', now, rowsAt('profile', ...Array(9).fill(ten)), srv), null);
  assert.equal(decide(def, 'profile', now, rowsAt('profile', ...Array(10).fill(ten)), {}), null, 'no throttle: the full 20');
  assert.equal(decide(def, 'employees', now, [], srv), null, 'a cap of 1 stays at 1, not 0');
});

test('an unknown outcome blocks the same action for 24 hours, and no longer', () => {
  const def = effective();
  const sent = new Date(2026, 9, 6, 9, 0, 0);
  const rows = [{ ...rowsAt('invite', sent)[0], tool: 'connect_with_person', target: 'jane-doe', outcome: 'unknown' }];
  const again = (now, target = 'https://www.linkedin.com/in/Jane-Doe/?utm=x') => decide(def, 'invite', now, rows, {}, { toolInput: { url: target } });
  const verdict = again(new Date(2026, 9, 6, 15, 0, 0));
  assert.equal(verdict?.kind, 'unknown');
  assert.match(verdict.reason, /could not confirm/);
  assert.match(verdict.reason, /check on LinkedIn themselves/);
  assert.equal(again(new Date(2026, 9, 7, 9, 1, 0)), null, 'after 24 hours');
  assert.equal(again(new Date(2026, 9, 6, 15, 0, 0), 'someone-else'), null, 'another person');
});

test('paused and draft-only states block; reads still run in draft-only mode', () => {
  const def = effective();
  const now = new Date(2026, 9, 6, 12, 0, 0);
  const paused = decide(def, 'profile', now, [], { paused_until: new Date(2026, 9, 7, 12).toISOString() });
  assert.equal(paused?.kind, 'paused');
  assert.match(paused.reason, /paused until tomorrow at 12:00/);
  assert.match(paused.reason, /reset-throttle linkedin/);
  const draftOnly = { draft_only: true };
  assert.equal(decide(def, 'invite', now, [], draftOnly)?.kind, 'draft-only');
  assert.equal(decide(def, 'message', now, [], draftOnly)?.kind, 'draft-only');
  assert.equal(decide(def, 'other', now, [], draftOnly)?.kind, 'draft-only', 'an unknown tool might write');
  assert.equal(decide(def, 'profile', now, [], draftOnly), null);
  assert.equal(decide(def, 'free', now, [], { draft_only: true }), null, 'housekeeping has no limits');
});

test('warning words: specific phrases count anywhere, common words only in errors or short results', () => {
  const def = REAL.servers.linkedin;
  const longText = 'Senior fraud analyst. Led the checkpoint and restricted-stock programmes, spotting unusual activity. '.repeat(40);
  assert.ok(longText.length > 1000);
  assert.equal(detectWarning(def, longText, false), null, 'a long profile that happens to use the words');
  assert.ok(detectWarning(def, 'Please solve this CAPTCHA to continue', false));
  assert.ok(detectWarning(def, 'We noticed unusual activity on your account', false));
  assert.ok(detectWarning(def, 'Your account has been temporarily restricted', false));
  assert.equal(detectWarning(def, 'Analyst. Restricted stock units and equity plans.', false), null, 'a short profile that says restricted about something else');
  assert.ok(detectWarning(def, 'Your account has been restricted.', false));
  assert.ok(detectWarning(def, 'HTTP 429 too many requests', true));
  assert.ok(detectWarning(def, 'Please verify it\'s you', false));
  assert.ok(detectWarning(def, 'Security verification required', false));
  assert.ok(detectWarning(def, longText + ' https://www.linkedin.com/checkpoint/challenge/abc', false), 'a checkpoint address counts even in a long result');
  assert.ok(detectWarning(def, longText + ' Rate limit detected. Wait 300 seconds.', false));
  assert.ok(detectWarning(def, longText + '\n[Rate limited] LinkedIn blocked this section.', false));
  assert.ok(detectWarning(def, longText, true), 'inside an error even a common word counts');
  assert.equal(detectWarning(def, 'Born in 1429, a chapter on cooking', false), null, '429 must be a whole number');
});

/* ---------------- the hook as Claude Code runs it ---------------- */

test('a server with no limits is never touched: no output, no ledger', (t) => {
  const p = project();
  t.after(p.cleanup);
  for (const payload of [pre('read_note', {}, 'mcp__mcpvault__'), post('read_note', {}, 'ok', 'mcp__mcpvault__'), pre('search', {}, 'mcp__claude_ai_Gmail__'), pre('x', {}, 'mcp__playwright__')]) {
    const r = guard(p, payload);
    assert.equal(r.code, 0);
    quiet(r);
  }
  assert.equal(p.exists(LEDGER), false);
  assert.equal(p.exists(STATE), false);
});

test('not an MCP tool, and malformed input: no output and exit 0 (the hook cannot tell which server it is about)', (t) => {
  const p = project();
  t.after(p.cleanup);
  for (const payload of [{ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, { tool_name: 'Write', tool_input: {} }]) quiet(guard(p, payload));
  for (const raw of ['', 'not json', '[1,2]', '{"tool_name": 5}']) {
    const r = guard(p, null, { raw });
    assert.equal(r.code, 0);
    quiet(r);
  }
});

test('Pre never says allow (that would skip the permission prompt), and counts nothing', (t) => {
  const p = project();
  t.after(p.cleanup);
  for (let i = 0; i < 5; i++) quiet(guard(p, pre('connect_with_person', { linkedin_username: `p${i}` })));
  assert.equal(p.exists(LEDGER), false, 'Pre writes nothing');
});

test('a call is counted only after it ran: Pre alone never uses up the limit', (t) => {
  const p = project();
  t.after(p.cleanup);
  // Three attempts that were declined at the permission prompt: Pre ran, Post never did.
  for (let i = 0; i < 3; i++) quiet(guard(p, pre('connect_with_person', { linkedin_username: 'jane-doe' })));
  // Two that ran.
  quiet(guard(p, post('connect_with_person', { linkedin_username: 'a' }, json({ status: 'sent' }))));
  quiet(guard(p, post('connect_with_person', { linkedin_username: 'b' }, json({ status: 'sent' }))));
  assert.equal(ledger(p).length, 2);
  const r = guard(p, pre('connect_with_person', { linkedin_username: 'c' }));
  denied(r, /Daily limit reached for connection requests on LinkedIn/, /2 of 2 used today/, /tomorrow at 00:00/, /protects your LinkedIn account/);
  assert.equal(r.code, 0);
  // Another category is not affected.
  quiet(guard(p, pre('get_person_profile', { linkedin_username: 'a' })));
});

test('the ledger row has the expected shape and the target is kept', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('get_person_profile', { linkedin_username: 'jane-doe' }, [{ type: 'text', text: 'Jane Doe, Analyst' }]));
  const [row] = ledger(p);
  assert.match(row.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual({ ...row, ts: undefined }, { ts: undefined, server: 'linkedin', tool: 'get_person_profile', category: 'profile', outcome: 'ok', target: 'jane-doe' });
});

test('every tool of mcp-server-linkedin 4.26.2 maps to its category, and a new tool counts as other', () => {
  const def = applyUser(REAL.servers.linkedin);
  const table = {
    connect_with_person: 'invite',
    send_message: 'message',
    get_person_profile: 'profile', get_my_profile: 'profile', get_sidebar_profiles: 'profile',
    get_company_profile: 'company', get_company_posts: 'company',
    search_people: 'search', search_companies: 'search', search_posts: 'search', search_jobs: 'search',
    get_company_employees: 'employees',
    get_inbox: 'inbox', get_conversation: 'inbox', search_conversations: 'inbox', get_feed: 'inbox', get_saved_jobs: 'inbox', get_job_details: 'inbox',
    close_session: 'free',
    brand_new_tool: 'other',
  };
  for (const [tool, cat] of Object.entries(table)) assert.equal(categoryFor(def, tool), cat, tool);
});

test('an unknown tool on a limited server falls in "other", which has its own cap', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('brand_new_tool'));
  guard(p, post('another_new_tool'));
  assert.deepEqual(ledger(p).map((r) => r.category), ['other', 'other']);
  denied(guard(p, pre('yet_another_tool')), /2 of 2 used today/, /other actions/);
});

test('housekeeping tools have no limits and are never blocked', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write(LEDGER, 'this is not a ledger\n');
  quiet(guard(p, pre('close_session')));
});

test('end to end: minimum gap between two messages, other categories unaffected', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('send_message', { linkedin_username: 'a', message: 'hi' }, json({ status: 'sent', sent: true, retry_safe: false })));
  denied(guard(p, pre('send_message', { linkedin_username: 'b', message: 'hi' })), /Wait \d+ more seconds/, /minimum gap is 3600 seconds/);
  quiet(guard(p, pre('get_person_profile', { linkedin_username: 'b' })));
});

test('end to end: a weekday that is not allowed today blocks the whole category', (t) => {
  const today = (new Date().getDay() + 6) % 7;
  const p = project(testLimits((li) => (li.categories.invite.weekday_cap = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today))));
  t.after(p.cleanup);
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'a' })), /only run/, /protects your LinkedIn account/);
});

/* ---------------- warnings ---------------- */

test('a warning: counted, pauses LinkedIn, halves the limits, tells Claude to stop, and adds a task', (t) => {
  const p = project();
  t.after(p.cleanup);
  const r = guard(p, post('get_person_profile', { linkedin_username: 'x' }, [{ type: 'text', text: 'Please solve the CAPTCHA to continue.' }]));
  assert.equal(r.code, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(contextOf(r), /LinkedIn has shown a warning/);
  assert.match(contextOf(r), /Stop every LinkedIn action now/);
  assert.match(contextOf(r), /second warning would switch LinkedIn to draft-only/);
  const [row] = ledger(p);
  assert.equal(row.warning, true);
  const s = state(p).servers.linkedin;
  assert.equal(s.warnings.length, 1);
  assert.ok(Date.parse(s.paused_until) > Date.now() + 23 * 3600e3);
  assert.ok(Date.parse(s.throttled_until) > Date.now() + 13 * 86400e3);
  assert.ok(!s.draft_only);
  assert.match(p.read(TASKS), /- \[ \] LinkedIn showed a security warning.*#ab\/rate-guard/);
  // Everything on LinkedIn is now paused, reads included.
  denied(guard(p, pre('get_person_profile', { linkedin_username: 'y' })), /every LinkedIn action is paused/, /reset-throttle linkedin/, /protects your LinkedIn account/);
});

test('a repeat warning while the pause runs is the same incident and is not counted twice', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('get_person_profile', {}, 'captcha'));
  const second = guard(p, post('get_person_profile', {}, 'captcha'));
  quiet(second);
  assert.equal(state(p).servers.linkedin.warnings.length, 1);
  assert.ok(!state(p).servers.linkedin.draft_only);
});

test('a second warning (after the pause) switches LinkedIn to draft-only, with a task; reads still work', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('get_person_profile', {}, 'Security verification required'));
  const s1 = state(p);
  s1.servers.linkedin.paused_until = new Date(Date.now() - 1000).toISOString(); // the pause is over
  p.write(STATE, JSON.stringify(s1));
  const r = guard(p, post('get_company_profile', {}, [{ type: 'text', text: 'LinkedIn has restricted access to this account and asks for identity verification.' }]));
  assert.match(contextOf(r), /second warning/);
  assert.match(contextOf(r), /draft-only/);
  const s2 = state(p).servers.linkedin;
  assert.equal(s2.warnings.length, 2);
  assert.equal(s2.draft_only, true);
  assert.match(p.read(TASKS), /second warning, so Alterbrain now only drafts for LinkedIn.*clear-draft-only linkedin.*#ab\/rate-guard/);
  // After the pause, draft-only still blocks everything that writes.
  s2.paused_until = new Date(Date.now() - 1000).toISOString();
  p.write(STATE, JSON.stringify({ schema: 1, servers: { linkedin: s2 } }));
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'a' })), /only drafts for LinkedIn/, /clear-draft-only linkedin/);
  denied(guard(p, pre('send_message', { linkedin_username: 'a', message: 'hi' })), /only drafts for LinkedIn/);
  denied(guard(p, pre('some_new_tool')), /only drafts for LinkedIn/);
  quiet(guard(p, pre('get_inbox')));
});

test('a long profile that merely contains the words does not set off a warning', (t) => {
  const p = project();
  t.after(p.cleanup);
  const text = 'Head of fraud. Runs the checkpoint team, restricted access policy, unusual activity monitoring. '.repeat(30);
  quiet(guard(p, post('get_person_profile', { linkedin_username: 'x' }, [{ type: 'text', text }])));
  assert.equal(p.exists(STATE), false);
  assert.equal(ledger(p)[0].warning, undefined);
});

test('a failed call that mentions "429 Too Many Requests" is a warning too', (t) => {
  const p = project();
  t.after(p.cleanup);
  const r = guard(p, failed('search_people', { keywords: 'cfo' }, 'HTTP 429 Too Many Requests'));
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'PostToolUseFailure');
  assert.match(contextOf(r), /warning/);
  assert.equal(ledger(p)[0].outcome, 'error');
  assert.equal(ledger(p)[0].warning, true);
});

/* ---------------- outcome unknown: never retried ---------------- */

test('outcome unknown: recorded, Claude told to check, a task added, and the identical call is blocked', (t) => {
  const p = project();
  t.after(p.cleanup);
  const r = guard(p, post('connect_with_person', { linkedin_username: 'jane-doe', note: 'Hi' }, json({ status: 'outcome_unknown', message: '...' })));
  assert.match(contextOf(r), /result of this LinkedIn action is unknown/);
  assert.match(contextOf(r), /Do not do it again/);
  assert.match(contextOf(r), /jane-doe/);
  assert.equal(ledger(p)[0].outcome, 'unknown');
  assert.match(p.read(TASKS), /Check on LinkedIn whether your connection requests action \(connect_with_person for jane-doe\).*#ab\/rate-guard/);
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'jane-doe', note: 'Hi again' })), /could not confirm whether the earlier connect_with_person for "jane-doe"/, /check on LinkedIn themselves/);
  denied(guard(p, pre('connect_with_person', { url: 'https://www.linkedin.com/in/Jane-Doe/' })), /jane-doe/);
  quiet(guard(p, pre('connect_with_person', { linkedin_username: 'someone-else' })));
  quiet(guard(p, pre('send_message', { linkedin_username: 'jane-doe', message: 'hi' })), 'a different tool is a different call');
});

test('the newer server reports an unconfirmed send as send_unconfirmed or retry_safe false: both count as unknown', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('send_message', { linkedin_username: 'a', message: 'x' }, json({ status: 'send_unconfirmed', sent: false, retry_safe: false })));
  guard(p, post('send_message', { linkedin_username: 'b', message: 'x' }, json({ status: 'something_new', sent: false, retry_safe: false })));
  guard(p, post('send_message', { linkedin_username: 'c', message: 'x' }, json({ status: 'sent', sent: true, retry_safe: false })));
  assert.deepEqual(ledger(p).map((r) => r.outcome), ['unknown', 'unknown', 'ok']);
});

test('a text result that says the outcome is unknown counts, and a plain string result is read too', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('connect_with_person', { linkedin_username: 'a' }, 'The send outcome is unknown. Check the profile.'));
  guard(p, post('connect_with_person', { linkedin_username: 'b' }, json({ status: 'already_connected' })));
  guard(p, post('connect_with_person', { linkedin_username: 'c' }, json({ status: 'connect_unavailable' })));
  assert.deepEqual(ledger(p).map((r) => r.outcome), ['unknown', 'ok', 'failed']);
});

test('a write that times out is unknown; an ordinary error is not, and a read that times out is just an error', (t) => {
  const p = project(testLimits((li) => (li.categories.invite.daily_cap = 10)));
  t.after(p.cleanup);
  guard(p, failed('connect_with_person', { linkedin_username: 'a' }, 'Tool call timed out after 60s'));
  guard(p, failed('connect_with_person', { linkedin_username: 'b' }, 'Profile not found. Check the profile URL is correct.'));
  guard(p, failed('get_person_profile', { linkedin_username: 'c' }, 'Tool call timed out after 60s'));
  assert.deepEqual(ledger(p).map((r) => r.outcome), ['unknown', 'error', 'error']);
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'a' })), /could not confirm/);
  quiet(guard(p, pre('connect_with_person', { linkedin_username: 'b' })), 'b failed before anything was sent');
});

/* ---------------- fail closed ---------------- */

test('corrupt ledger: LinkedIn is blocked with a plain reason, other servers are not', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write(LEDGER, '{"ts":"2026-10-06T10:00:00.000Z","server":"linkedin","category":"invite","outcome":"ok"}\nthis line is damaged\n');
  const r = guard(p, pre('get_person_profile', { linkedin_username: 'a' }));
  denied(r, /could not read its usage log for LinkedIn/, /repair-ledger/);
  quiet(guard(p, pre('read_note', {}, 'mcp__mcpvault__')));
});

test('corrupt limits file: LinkedIn is blocked, a server without limits is not', (t) => {
  const p = project('{ not json');
  t.after(p.cleanup);
  denied(guard(p, pre('get_person_profile')), /could not read its usage limits/, /protect your account/);
  quiet(guard(p, pre('read_note', {}, 'mcp__mcpvault__')));
});

test('missing limits file: LinkedIn is blocked, a server without limits is not', (t) => {
  const p = project(null);
  t.after(p.cleanup);
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'a' })), /could not read its usage limits/);
  quiet(guard(p, pre('read_note', {}, 'mcp__mcpvault__')));
});

test('a limits file with a bad value counts as unreadable (fail closed)', (t) => {
  const bad = testLimits((li) => (li.categories.invite.daily_cap = 'ten'));
  assert.ok(validateLimits(bad).some((m) => /daily_cap/.test(m)));
  const p = project(bad);
  t.after(p.cleanup);
  denied(guard(p, pre('get_person_profile')), /could not read its usage limits/);
});

test('corrupt state file and corrupt user limits file block LinkedIn too', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write(STATE, '{{{');
  denied(guard(p, pre('get_person_profile')), /could not read its warning record/, /reset-throttle linkedin/);
  p.remove(STATE);
  p.write('config/limits.json', '{ "servers": ');
  denied(guard(p, pre('get_person_profile')), /could not read your own limits file \(config\/limits\.json\)/);
  quiet(guard(p, pre('read_note', {}, 'mcp__mcpvault__')));
});

/* ---------------- ledger housekeeping ---------------- */

test('the ledger is pruned to 35 days when a call is written', (t) => {
  const p = project();
  t.after(p.cleanup);
  const old = new Date(Date.now() - 40 * 86400e3).toISOString();
  const recent = new Date(Date.now() - 10 * 86400e3).toISOString();
  const row = (ts) => JSON.stringify({ ts, server: 'linkedin', tool: 'get_person_profile', category: 'profile', outcome: 'ok' });
  p.write(LEDGER, `${row(old)}\n${row(recent)}\n`);
  guard(p, post('get_person_profile', { linkedin_username: 'a' }));
  const rows = ledger(p);
  assert.equal(rows.length, 2);
  assert.ok(!rows.some((r) => r.ts === old));
  assert.ok(rows.some((r) => r.ts === recent));
});

/* ---------------- user overrides ---------------- */

const userLimits = (obj) => JSON.stringify({ schema: 1, servers: { linkedin: obj } });

test('user override: lowering a cap is always allowed', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write('config/limits.json', userLimits({ categories: { invite: { daily_cap: 1 } } }));
  guard(p, post('connect_with_person', { linkedin_username: 'a' }, json({ status: 'sent' })));
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'b' })), /1 of 1 used today/);
});

test('user override: raising a cap without accept_risk is ignored, and the reason says so', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write('config/limits.json', userLimits({ categories: { invite: { daily_cap: 10 } } }));
  guard(p, post('connect_with_person', { linkedin_username: 'a' }, json({ status: 'sent' })));
  guard(p, post('connect_with_person', { linkedin_username: 'b' }, json({ status: 'sent' })));
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'c' })), /2 of 2 used today/, /ignored: it is above the default and accept_risk is not switched on/);
});

test('user override: raising a cap with accept_risk works, and the deny message mentions it', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write('config/limits.json', userLimits({ accept_risk: true, categories: { invite: { daily_cap: 3 } } }));
  for (const name of ['a', 'b']) guard(p, post('connect_with_person', { linkedin_username: name }, json({ status: 'sent' })));
  quiet(guard(p, pre('connect_with_person', { linkedin_username: 'c' })), 'the third is now allowed');
  guard(p, post('connect_with_person', { linkedin_username: 'c' }, json({ status: 'sent' })));
  denied(guard(p, pre('connect_with_person', { linkedin_username: 'd' })), /3 of 3 used today/, /raised this limit above the Alterbrain default and accepted the risk/);
});

test('user override: a shorter minimum gap needs accept_risk, a longer one does not; unknown names are ignored', (t) => {
  const p = project();
  t.after(p.cleanup);
  p.write('config/limits.json', userLimits({ categories: { message: { min_gap_seconds: 0 }, invites: { daily_cap: 99 } } }));
  guard(p, post('send_message', { linkedin_username: 'a', message: 'x' }, json({ status: 'sent' })));
  denied(guard(p, pre('send_message', { linkedin_username: 'b', message: 'x' })), /minimum gap is 3600 seconds/);
  p.write('config/limits.json', userLimits({ accept_risk: true, categories: { message: { min_gap_seconds: 0 } } }));
  quiet(guard(p, pre('send_message', { linkedin_username: 'b', message: 'x' })));
  p.write('config/limits.json', userLimits({ categories: { message: { min_gap_seconds: 7200 } } }));
  denied(guard(p, pre('send_message', { linkedin_username: 'b', message: 'x' })), /minimum gap is 7200 seconds/);
});

test('user override: weekdays can be narrowed freely, but widened only with accept_risk', () => {
  const base = clone(REAL.servers.linkedin);
  const narrowed = applyUser(base, { categories: { invite: { weekday_cap: ['mon', 'tue'] } } });
  assert.deepEqual(narrowed.categories.invite.weekday_cap, [0, 1]);
  const widened = applyUser(base, { categories: { invite: { weekday_cap: ['mon', 'fri'] } } });
  assert.deepEqual(widened.categories.invite.weekday_cap, ['mon', 'tue', 'wed', 'thu']);
  assert.deepEqual(widened._clamped, ['invite.weekday_cap']);
  const accepted = applyUser(base, { accept_risk: true, categories: { invite: { weekday_cap: ['mon', 'fri'] } } });
  assert.deepEqual(accepted.categories.invite.weekday_cap, [0, 4]);
  assert.deepEqual(accepted._raised, ['invite.weekday_cap']);
});

/* ---------------- shipped defaults ---------------- */

test('the shipped limits file is valid, and the defaults are the conservative student ones', () => {
  assert.deepEqual(validateLimits(REAL), []);
  const c = REAL.servers.linkedin.categories;
  const pick = (name) => [c[name].daily_cap, c[name].weekly_cap, c[name].min_gap_seconds];
  assert.deepEqual(pick('invite'), [15, 60, 30]);
  assert.deepEqual(c.invite.weekday_cap, ['mon', 'tue', 'wed', 'thu']);
  assert.deepEqual(pick('message'), [15, 60, 60]);
  assert.deepEqual(pick('profile'), [40, undefined, 20]);
  assert.deepEqual(pick('company'), [20, undefined, 20]);
  assert.deepEqual(pick('search'), [8, undefined, 30]);
  assert.deepEqual(pick('employees'), [5, undefined, 60]);
  assert.deepEqual(pick('inbox'), [30, undefined, 10]);
  assert.deepEqual(pick('other'), [10, undefined, 30]);
  const note = REAL.servers.linkedin._note;
  assert.match(note, /\[Claim: LeadLoft\]/);
  assert.match(note, /\[Unverified/);
  assert.match(note, /leadloft\.com\/blog\/linkedin-limits/);
});

test('servers are matched by name: connector and plugin prefixes still match, other servers do not', () => {
  const servers = REAL.servers;
  for (const name of ['linkedin', 'claude_ai_LinkedIn', 'plugin_x_linkedin_mcp', 'mcp-server-linkedin']) assert.equal(findServer(servers, name)?.key, 'linkedin', name);
  for (const name of ['mcpvault', 'claude_ai_Gmail', 'playwright', 'instagram']) assert.equal(findServer(servers, name), null, name);
});

test('the shipped defaults work end to end through the real hook', (t) => {
  const p = project(REAL);
  t.after(p.cleanup);
  quiet(guard(p, pre('get_person_profile', { linkedin_username: 'a' })));
  guard(p, post('get_person_profile', { linkedin_username: 'a' }, [{ type: 'text', text: 'Jane Doe' }]));
  denied(guard(p, pre('get_person_profile', { linkedin_username: 'b' })), /Wait \d+ more seconds/, /minimum gap is 20 seconds/);
  quiet(guard(p, pre('search_people', { keywords: 'cfo' })));
});

test('a target that looks like task markup cannot add links or tags to the task list', (t) => {
  const p = project();
  t.after(p.cleanup);
  guard(p, post('connect_with_person', { linkedin_username: 'x [[Private note]] #ab/health-check' }, json({ status: 'outcome_unknown' })));
  const task = p.read(TASKS).split('\n').find((l) => l.includes('rate-guard'));
  assert.ok(task, p.read(TASKS));
  assert.doesNotMatch(task.replace(/#ab\/rate-guard/, ''), /\[\[|#ab\//);
});
