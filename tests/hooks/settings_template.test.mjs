import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, bash, makeProject, mcp, write } from '../fixtures/hooks/helpers.mjs';

const settings = JSON.parse(readFileSync(join(REPO, 'system', 'templates', 'claude-settings.json'), 'utf8'));
const entries = (event) => settings.hooks[event].flatMap((group) => group.hooks.map((h) => ({ matcher: group.matcher, ...h })));

test('model, effort and safety switches', () => {
  assert.equal(settings.model, 'sonnet');
  assert.equal(settings.effortLevel, 'medium');
  assert.equal(settings.disableSkillShellExecution, true);
  assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
});

test('autoMemoryDirectory is left out: Claude Code only accepts an absolute or ~/ path there', () => {
  // A relative value such as "vault/80_me/.auto-memory" is not allowed by Claude Code, so it must not appear.
  assert.ok(!('autoMemoryDirectory' in settings) || /^(\/|[A-Za-z]:[\\/]|~\/)/.test(settings.autoMemoryDirectory));
});

test('permission rules use valid syntax and cover the Gmail send tools', () => {
  const { deny, ask, allow } = settings.permissions;
  for (const rule of [...deny, ...allow]) assert.match(rule, /^(Bash|PowerShell|Read)\(.+\)$/, rule);
  for (const rule of ask) assert.match(rule, /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_*-]+$/, rule);
  assert.deepEqual(
    [...ask].sort(),
    ['mcp__claude_ai_Gmail__forward', 'mcp__claude_ai_Gmail__reply', 'mcp__claude_ai_Gmail__send_message'],
  );
  for (const rule of ['Read(./.env.local)', 'Read(./.env)', 'Read(./**/.env)']) assert.ok(deny.includes(rule), rule);
  for (const rule of [
    'Bash(node system/scripts/tasks.mjs *)', 'Bash(node system/scripts/doctor.mjs *)', 'Bash(node system/scripts/ingest.mjs *)',
    'Bash(node system/quarto/tools/render.mjs *)', 'PowerShell(node system/scripts/tasks.mjs *)', 'PowerShell(node system/quarto/tools/render.mjs *)',
  ]) assert.ok(allow.includes(rule), rule);
  // Only the documented trailing-wildcard forms: a space before the star.
  for (const rule of allow.filter((r) => /^(Bash|PowerShell)\(git /.test(r))) assert.match(rule, / \*\)$/, rule);
  // Nothing in "allow" may be a blanket rule.
  for (const rule of allow) assert.ok(!/^(Bash|PowerShell)(\(\*\))?$/.test(rule), rule);
});

/** Does a permission rule such as "Bash(node system/scripts/tasks.mjs *)" match this command? ("x *" also matches a bare "x".) */
function ruleMatches(rule, shell, command) {
  const m = /^(Bash|PowerShell)\((.*)\)$/.exec(rule);
  if (!m || m[1] !== shell) return false;
  const body = m[2];
  const esc = (t) => t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const rx = body.endsWith(' *') ? new RegExp(`^${esc(body.slice(0, -2))}( .*)?$`) : new RegExp(`^${esc(body)}$`);
  return rx.test(command);
}

test('the allow list is exact: nothing that replaces code, publishes or runs arbitrary files is auto-approved', () => {
  const { allow } = settings.permissions;
  const mustPrompt = [
    'node system/scripts/update.mjs apply-safe v1',
    'node system/scripts/update.mjs plan v1 --source-dir C:/stage',
    'node system/scripts/update.mjs finish v1',
    'node system/scripts/setup-github.mjs --name x',
    'node system/scripts/built.mjs add gmail-send-approval',
    'node system/scripts/rate-guard.mjs reset-throttle linkedin',
    'node system/scripts/rate-guard.mjs clear-draft-only linkedin',
    'node system/scripts/rate-guard.mjs repair-ledger',
    'node system/scripts/obsidian-setup.mjs',
    'node system/scripts/../../anything.js',
    'node system/scripts/tasks.mjs/../../evil.js',
    'node system/quarto/tools/../../x.js',
    'node system/scripts/newthing.mjs',
    'quarto run x.ts',
    'quarto publish netlify',
    'quarto add https://example.com/ext.zip',
    'quarto install tinytex',
    'quarto render x.qmd',
    'git push',
    'git commit -m x',
  ];
  for (const shell of ['Bash', 'PowerShell']) {
    for (const cmd of mustPrompt) {
      const hit = allow.find((r) => ruleMatches(r, shell, cmd));
      assert.equal(hit, undefined, `${shell}: "${cmd}" must prompt, but ${hit} allows it`);
    }
    for (const cmd of ['node system/scripts/tasks.mjs add "x"', 'node system/scripts/doctor.mjs --json', 'node system/scripts/git-auto.mjs status', 'node system/scripts/git-auto.mjs commit --json', 'node system/scripts/update.mjs check --json', 'node system/scripts/built.mjs list', 'node system/scripts/rate-guard.mjs status', 'node system/scripts/rate-guard.mjs status --json', 'node system/quarto/tools/render.mjs note.md', 'git status', 'git log --oneline -5']) {
      assert.ok(allow.some((r) => ruleMatches(r, shell, cmd)), `${shell}: "${cmd}" should be allowed`);
    }
  }
  // No rule is a bare program or ends in a directory glob that ".." could escape.
  for (const rule of allow) assert.doesNotMatch(rule, /\/\*\)$/, rule);
  // The shells are matched by the hooks too, so the read-only git rules are safe only together with them.
  assert.ok(entries('PreToolUse').some((h) => h.matcher === 'Bash|PowerShell' && /block_dangerous_git/.test(h.args[0])));
});

test('keys files are denied for reading, including the other .env names and the ssh and aws folders', () => {
  const { deny } = settings.permissions;
  for (const rule of ['Read(./.env.production)', 'Read(./.env.development)', 'Read(./**/.env.*.local)', 'Read(~/.ssh/**)', 'Read(~/.aws/**)']) assert.ok(deny.includes(rule), rule);
});

test('vault key files (encryption of private notes, ADR 0019) are denied for reading', () => {
  const { deny } = settings.permissions;
  for (const rule of ['Read(./**/*.abkey)', 'Read(./**/vault-key-*.key)', 'Read(./.git/git-crypt/**)', 'Read(~/Documents/Alterbrain/**)']) assert.ok(deny.includes(rule), rule);
  const live = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(live.permissions.deny, deny, 'the live settings and the template agree');
});

test('every hook is in exec form and points at a file that exists', () => {
  const all = Object.keys(settings.hooks).flatMap(entries);
  assert.ok(all.length >= 8);
  for (const h of all) {
    assert.equal(h.type, 'command');
    assert.equal(h.command, 'node', 'exec form: the command is just node');
    assert.ok(Array.isArray(h.args) && h.args.length >= 1);
    assert.match(h.args[0], /^\$\{CLAUDE_PROJECT_DIR\}\/system\/hooks\/[a-z_]+\.mjs$/);
    const file = join(REPO, ...h.args[0].replace('${CLAUDE_PROJECT_DIR}/', '').split('/'));
    assert.ok(existsSync(file), file);
    assert.ok(Number.isInteger(h.timeout) && h.timeout > 0 && h.timeout <= 60, `timeout ${h.timeout}`);
  }
});

test('events, matchers and hooks match the spec', () => {
  assert.deepEqual(Object.keys(settings.hooks).sort(), ['PostToolUse', 'PostToolUseFailure', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Stop']);
  const pre = settings.hooks.PreToolUse;
  const byMatcher = Object.fromEntries(pre.map((g) => [g.matcher, g.hooks.map((h) => h.args[0].split('/').pop())]));
  assert.deepEqual(byMatcher, {
    'Write|Edit|MultiEdit|NotebookEdit': ['protect_paths.mjs', 'block_secrets.mjs'],
    'Bash|PowerShell': ['block_dangerous_git.mjs', 'block_secrets.mjs', 'protect_paths.mjs', 'outbound_guard.mjs'],
    'mcp__.*': ['outbound_guard.mjs', 'protect_paths.mjs', 'rate_guard.mjs'],
  });
  // The rate guard also counts calls after they ran (PostToolUse) and calls that failed or timed out (PostToolUseFailure).
  for (const event of ['PostToolUse', 'PostToolUseFailure']) {
    assert.deepEqual(entries(event).map((h) => [h.matcher, h.args]), [['mcp__.*', ['${CLAUDE_PROJECT_DIR}/system/hooks/rate_guard.mjs']]], event);
  }
  assert.deepEqual(entries('SessionStart').map((h) => h.args), [['${CLAUDE_PROJECT_DIR}/system/hooks/session_start.mjs']]);
  assert.deepEqual(entries('Stop').map((h) => h.args.slice(1)), [['--stop']]);
  const end = entries('SessionEnd');
  assert.equal(end.length, 1);
  assert.equal(end[0].args.length, 1);
  assert.equal(end[0].timeout, 30);
  // The mcp matcher is a regex that reaches Gmail tools; the file-edit matchers are plain lists.
  assert.ok(new RegExp('mcp__.*').test('mcp__claude_ai_Gmail__send_message'));
});

test('the hooks run exactly as the template starts them', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const probes = {
    SessionStart: { source: 'startup', model: 'sonnet' },
    'Write|Edit|MultiEdit|NotebookEdit': write(p.path('system', 'core.md')),
    'Bash|PowerShell': bash('git push --force'),
    'mcp__.*': mcp('mcp__claude_ai_Gmail__send_message'),
  };
  const run = (h, payload) => {
    const args = h.args.map((a) => a.replace('${CLAUDE_PROJECT_DIR}', p.root));
    return spawnSync(process.execPath, args, {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: p.root },
      cwd: p.root,
      windowsHide: true,
    });
  };
  for (const h of entries('SessionStart')) {
    const r = run(h, probes.SessionStart);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /"hookEventName":"SessionStart"/);
  }
  for (const h of entries('PreToolUse')) {
    const r = run(h, probes[h.matcher]);
    assert.equal(r.status, 0, `${h.args[0]}: ${r.stderr}`);
  }
  // Each hook is shown the one probe that it exists to refuse.
  const refused = {
    'protect_paths.mjs': probes['Write|Edit|MultiEdit|NotebookEdit'],
    'block_dangerous_git.mjs': probes['Bash|PowerShell'],
    'outbound_guard.mjs': probes['mcp__.*'],
  };
  for (const h of entries('PreToolUse')) {
    const probe = refused[h.args[0].split('/').pop()];
    if (probe && probe.tool_name === probes[h.matcher].tool_name) assert.match(run(h, probe).stdout, /"permissionDecision":"deny"/, h.args[0]);
  }
  // protect_paths also sits in the shell and MCP groups: it must refuse a shell write to a protected file there too.
  const shellProtect = entries('PreToolUse').find((h) => h.matcher === 'Bash|PowerShell' && /protect_paths/.test(h.args[0]));
  assert.match(run(shellProtect, bash('echo hi > system/core.md')).stdout, /"permissionDecision":"deny"/);
});

test('the rate guard runs exactly as the template starts it: Pre, Post and PostToolUseFailure', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('system/catalogue/limits.json', readFileSync(join(REPO, 'system', 'catalogue', 'limits.json'), 'utf8'));
  const run = (h, payload) =>
    spawnSync(process.execPath, h.args.map((a) => a.replace('${CLAUDE_PROJECT_DIR}', p.root)), {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: p.root },
      cwd: p.root,
      windowsHide: true,
    });
  const rate = (event) => entries(event).find((h) => /rate_guard/.test(h.args[0]));
  const tool = 'mcp__linkedin__get_person_profile';
  let r = run(rate('PreToolUse'), { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { linkedin_username: 'a' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '', 'under the limits: no output');
  r = run(rate('PostToolUse'), { hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { linkedin_username: 'a' }, tool_response: [{ type: 'text', text: 'Jane' }] });
  assert.equal(r.status, 0, r.stderr);
  r = run(rate('PostToolUseFailure'), { hook_event_name: 'PostToolUseFailure', tool_name: tool, tool_input: { linkedin_username: 'b' }, error: 'boom', is_error: true });
  assert.equal(r.status, 0, r.stderr);
  const rows = p.read('state/local/rate-guard/ledger.jsonl').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((x) => x.outcome), ['ok', 'error']);
  // The second profile view is now inside the minimum gap, so the same hook, started the same way, refuses it.
  r = run(rate('PreToolUse'), { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { linkedin_username: 'c' } });
  assert.match(r.stdout, /"permissionDecision":"deny"/);
  // A server with no limits is left alone.
  r = run(rate('PreToolUse'), { hook_event_name: 'PreToolUse', tool_name: 'mcp__mcpvault__read_note', tool_input: {} });
  assert.equal(r.stdout.trim(), '');
});
