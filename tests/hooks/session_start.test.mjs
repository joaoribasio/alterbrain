import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, contextOf, makeProject, runHook } from '../fixtures/hooks/helpers.mjs';
import { describeNow, onboardingUnfinished } from '../../system/hooks/session_start.mjs';
import { today } from '../../system/lib/fsx.mjs';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayOffset = (n) => today(new Date(Date.now() + n * 86_400_000));

function start(project, input = { hook_event_name: 'SessionStart', source: 'startup' }, opts) {
  return runHook(project, 'session_start', input, opts);
}

function tasksFile(lines) {
  return `---\ntype: "tasks"\nstatus: "active"\n---\n# Tasks\n\n## Inbox\n${lines.join('\n')}\n\n## Today\n\n## This week\n\n## Waiting on others\n\n## Someday\n\n## Done (archive weekly)\n- [x] Old thing #ab/reply 📅 2020-01-01\n`;
}

test('emits a SessionStart context with the date, weekday and time', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = start(p);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart');
  const text = contextOf(r);
  const now = new Date();
  assert.match(text, new RegExp(`Today is ${WEEKDAYS[now.getDay()]} ${today(now)}, \\d{2}:\\d{2}`));
  assert.match(text, /never guess dates/);
  assert.match(describeNow(new Date(2026, 9, 7, 14, 5)), /^Today is Wednesday 2026-10-07, 14:05 \(/);
});

test('counts overdue, due-today and agent tasks', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write(
    'vault/00_inbox/Tasks.md',
    tasksFile([
      '- [ ] Review reply to Prof. Example #ab/reply 📅 2020-01-01 🔼 [[outbox/Draft one]]',
      '- [ ] Overdue by hand 📅 2021-03-04',
      `- [ ] Due today item #ab/study 📅 ${dayOffset(0)}`,
      `- [ ] Due later 📅 ${dayOffset(30)}`,
      '- [ ] No date at all',
      '- [x] Finished 📅 2020-01-01',
    ]),
  );
  const text = contextOf(start(p));
  assert.match(text, /Tasks: 2 overdue, 1 due today, 2 agent tasks open\./);
  assert.match(text, /\(overdue\) Review reply to Prof\. Example/);
  assert.match(text, /\(today\) Due today item/);
  assert.ok(!text.includes('[[outbox'), 'wikilinks are stripped from the list');
});

test('a missing Tasks.md is not a problem', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.remove('vault/00_inbox/Tasks.md');
  assert.match(contextOf(start(p)), /Tasks: 0 overdue, 0 due today, 0 agent tasks open\./);
});

test('reports outbox drafts and open proposals', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const text = contextOf(start(p));
  assert.match(text, /Outbox: 1 draft waiting/);
  assert.match(text, /Proposals: 1 open, waiting for approval\./);
  p.remove('vault/00_inbox/outbox');
  p.remove('vault/00_inbox/proposals');
  const empty = contextOf(start(p));
  assert.ok(!/Outbox:/.test(empty));
  assert.ok(!/Proposals:/.test(empty));
});

test('onboarding: missing or unfinished suggests /onboard, finished does not', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const hint = /Onboarding not finished: after handling the user's request, offer \/onboard\./;
  assert.match(contextOf(start(p)), hint); // no state/onboarding.json
  for (const status of ['not_started', 'in_progress']) {
    p.write('state/onboarding.json', JSON.stringify({ schema: 1, status }));
    assert.match(contextOf(start(p)), hint, status);
  }
  p.write('state/onboarding.json', '{ broken json');
  assert.match(contextOf(start(p)), hint);
  for (const status of ['minimum_done', 'complete']) {
    p.write('state/onboarding.json', JSON.stringify({ schema: 1, status }));
    assert.ok(!hint.test(contextOf(start(p))), status);
  }
  assert.equal(onboardingUnfinished(null), true);
  assert.equal(onboardingUnfinished({ status: 'complete' }), false);
});

test('warns when the main model is not Sonnet', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const warn = /Main model is claude-opus-5; Alterbrain recommends Sonnet to save your usage — \/model sonnet/;
  assert.match(contextOf(start(p, { source: 'startup', model: 'claude-opus-5' })), warn);
  assert.ok(!/Main model/.test(contextOf(start(p, { source: 'startup', model: 'claude-sonnet-5-5' }))));
  assert.ok(!/Main model/.test(contextOf(start(p, { source: 'startup', model: 'sonnet' }))));
  assert.ok(!/Main model/.test(contextOf(start(p, { source: 'startup' }))), 'no model in the payload: no warning');
  assert.match(contextOf(start(p, { source: 'startup', model: { id: 'claude-haiku-5' } })), /Main model is claude-haiku-5/);
});

test('warns when Claude Code is older than the minimum, only if the version is known', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const old = contextOf(start(p, undefined, { env: { CLAUDE_CODE_VERSION: '2.1.200' } }));
  assert.match(old, /Claude Code is version 2\.1\.200, but Alterbrain needs 2\.1\.283 or newer/);
  assert.ok(!/Claude Code is version/.test(contextOf(start(p, undefined, { env: { CLAUDE_CODE_VERSION: '2.1.284' } }))));
  assert.ok(!/Claude Code is version/.test(contextOf(start(p, undefined, { env: { CLAUDE_CODE_VERSION: '2.1.283' } }))));
  assert.ok(!/Claude Code is version/.test(contextOf(start(p))), 'unknown version: skipped');
  assert.match(contextOf(start(p, { source: 'startup', claude_code_version: '2.0.1' })), /Claude Code is version 2\.0\.1/);
});

test('dev mode: notice shown and git is not touched', (t) => {
  const p = makeProject({ devMode: true, gitAuto: true });
  t.after(p.cleanup);
  const text = contextOf(start(p));
  assert.match(text, /Developer mode is on/);
  assert.deepEqual(p.gitCalls(), []);
});

test('pulls with git-auto on startup, resume and clear, but not on compact', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  start(p, { source: 'startup' });
  assert.deepEqual(p.gitCalls(), ['pull --json']);
  start(p, { source: 'resume' });
  start(p, { source: 'clear' });
  assert.equal(p.gitCalls().length, 3);
  start(p, { source: 'compact' });
  assert.equal(p.gitCalls().length, 3);
});

test('does not pull when auto saving is switched off', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  p.write('config/brain.json', JSON.stringify({ schema: 1, git: { auto_commit: false, auto_push: false } }));
  start(p);
  assert.deepEqual(p.gitCalls(), []);
});

test('works without git-auto.mjs, quickly', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(p.exists('system/scripts/git-auto.mjs'), false);
  const r = start(p);
  assert.equal(r.code, 0);
  assert.ok(contextOf(r));
  assert.ok(r.ms < 3000, `took ${r.ms} ms`);
});

test('a failed pull becomes a warning and the digest is still delivered', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  const r = start(p, { source: 'startup' }, { env: { FAKE_GIT_EXIT_PULL: '1', FAKE_GIT_MESSAGE: 'Could not reach GitHub (are you offline?). Your local work is untouched.' } });
  assert.equal(r.code, 0);
  assert.match(contextOf(r), /Warnings:/);
  assert.match(contextOf(r), /Online sync problem: Could not reach GitHub/);
  assert.match(contextOf(r), /Today is /);
});

test('a skipped or crashing pull never breaks the digest', (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  const skipped = start(p, { source: 'startup' }, { env: { FAKE_GIT_STATUS_PULL: 'skipped' } });
  assert.ok(!/Online sync/.test(contextOf(skipped)));
  const crashed = start(p, { source: 'startup' }, { env: { FAKE_GIT_EXIT_PULL: '2', FAKE_GIT_STATUS_PULL: 'weird' } });
  assert.equal(crashed.code, 0);
  assert.ok(contextOf(crashed));
});

test('a slow pull is cut off after about 5 seconds', { timeout: 40_000 }, (t) => {
  const p = makeProject({ gitAuto: true });
  t.after(p.cleanup);
  const r = start(p, { source: 'startup' }, { env: { FAKE_GIT_SLEEP_MS: '15000' } });
  assert.equal(r.code, 0);
  assert.ok(r.ms < 12_000, `took ${r.ms} ms`);
  assert.match(contextOf(r), /took too long/);
});

test('the digest never exceeds 25 lines', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const many = Array.from({ length: 60 }, (_, i) => `- [ ] Task number ${i} #ab/reply 📅 2020-01-${String((i % 28) + 1).padStart(2, '0')}`);
  p.write('vault/00_inbox/Tasks.md', tasksFile(many));
  const text = contextOf(start(p, { source: 'startup', model: 'claude-opus-5' }, { env: { CLAUDE_CODE_VERSION: '1.0.0' } }));
  assert.ok(text.split('\n').length <= 25, `${text.split('\n').length} lines`);
  assert.match(text, /Tasks: 60 overdue/);
});

test('survives corrupt files without throwing', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('state/onboarding.json', '\u0000\u0001 not json');
  p.write('config/brain.json', '{ nope');
  p.write('system/release.json', '{ nope');
  p.write('vault/00_inbox/Tasks.md', '\u0000\u0000 garbage without sections');
  p.write('vault/00_inbox/outbox/Binary.md', '\u0000\u0001\u0002');
  const r = start(p, { source: 'startup', model: 'claude-opus-5' }, { env: { CLAUDE_CODE_VERSION: '1.0.0' } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(contextOf(r), /Today is /);
});

test('fails open on malformed input', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const raw of ['', 'nonsense', '[1]', '{"source":']) {
    const r = runHook(p, 'session_start', null, { raw });
    assert.equal(r.code, 0, JSON.stringify(raw));
    assert.equal(r.stdout, '', JSON.stringify(raw));
  }
});

test('finds the project from its own location when CLAUDE_PROJECT_DIR is not set', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('vault/00_inbox/Tasks.md', tasksFile(['- [ ] Overdue one #ab/reply 📅 2020-01-01']));
  const r = start(p, undefined, { useEnv: false });
  assert.match(contextOf(r), /Tasks: 1 overdue/);
});

/* ---------------- code-safety hardening ---------------- */

test('F22: .mcp.json is not saved to git, and a stale one is rebuilt for this folder when Claude starts', (t) => {
  assert.match(readFileSync(join(REPO, '.gitignore'), 'utf8'), /^\.mcp\.json$/m, '.mcp.json holds this computer\'s folder paths');
  const p = makeProject();
  t.after(p.cleanup);
  mkdirSync(p.path('system', 'scripts'), { recursive: true });
  cpSync(join(REPO, 'system', 'scripts', 'mcp-gen.mjs'), p.path('system', 'scripts', 'mcp-gen.mjs'));
  cpSync(join(REPO, 'tests', 'fixtures', 'scripts', 'mcp-gen', 'catalogue.json'), p.path('system', 'catalogue', 'mcp.json'));
  p.write('config/mcp.selected.json', JSON.stringify({ schema: 1, enabled: ['playwright'] }));
  p.write('.mcp.json', JSON.stringify({ mcpServers: { vault: { command: 'node', args: ['C:/Users/someone-else/OneDrive/Alterbrain/vault'] } } }));
  const r = start(p);
  assert.equal(r.code, 0, r.stderr);
  const rebuilt = JSON.parse(p.read('.mcp.json'));
  assert.deepEqual(Object.keys(rebuilt.mcpServers), ['playwright']);
  assert.doesNotMatch(p.read('.mcp.json'), /someone-else/);
  // Without a selection nothing is touched.
  const q = makeProject();
  t.after(q.cleanup);
  q.write('.mcp.json', '{"mcpServers":{}}\n');
  start(q);
  assert.equal(q.read('.mcp.json'), '{"mcpServers":{}}\n');
});
