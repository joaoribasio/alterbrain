import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decisionOf, edit, makeProject, multiEdit, notebookEdit, reasonOf, runHook, write } from '../fixtures/hooks/helpers.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const PROTECTED = 'This is a protected Alterbrain system file. Ask me to propose a change instead.';

function ask(project, input, opts) {
  return runHook(project, 'protect_paths', input, opts);
}

test('denies edits to the always-protected framework files', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const protectedFiles = [
    '.claude/settings.json',
    'system/core.md',
    'system/release.json',
    'system/hooks/brand_new_hook.mjs',
    'system/scripts/anything.mjs',
    'system/lib/anything.mjs',
    'system/catalogue/mcp.json',
    'system/catalogue/routing.json',
  ];
  for (const rel of protectedFiles) {
    const r = ask(p, write(p.path(...rel.split('/'))));
    assert.equal(r.code, 0, rel);
    assert.equal(decisionOf(r), 'deny', rel);
    assert.equal(reasonOf(r), PROTECTED, rel);
  }
});

test('denies code-class files from the manifest, allows text-class and unlisted files', release(), (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(decisionOf(ask(p, write(p.path('tests', 'example.test.mjs')))), 'deny');
  assert.equal(decisionOf(ask(p, write(p.path('.github', 'workflows', 'ci.yml')))), 'deny');

  const allowed = [
    '.claude/skills/ask/SKILL.md',
    'system/templates/notes/Example Note.md',
    'system/docs/guides/Notes.md',
    '.claude/skills/my-budget/SKILL.md',
    '.claude/agents/my-helper.md',
    'system/catalogue/MCP-CATALOGUE.md',
    'vault/Home.md',
    'vault/00_inbox/Tasks.md',
    'vault/40_sources/text/2026/note.md',
    'vault/40_sources/notes/Source Note.md',
    'config/brain.json',
    'state/onboarding.json',
  ];
  for (const rel of allowed) {
    const r = ask(p, write(p.path(...rel.split('/'))));
    assert.equal(r.code, 0, rel);
    assert.equal(r.stdout, '', rel);
  }
});

test('denies writes into raw sources, allows the rest of 40_sources', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const rel of ['vault/40_sources/raw/2026/2026-10-07 Case.pdf', 'vault/40_sources/raw/_local/big.zip', 'vault/40_sources/raw/x.md']) {
    const r = ask(p, write(p.path(...rel.split('/'))));
    assert.equal(decisionOf(r), 'deny', rel);
    assert.match(reasonOf(r), /original copies/);
    assert.match(reasonOf(r), /never edited/);
  }
  assert.equal(ask(p, write(p.path('vault', '40_sources', 'manifest.jsonl'))).stdout, '');
});

test('works for Edit, MultiEdit and NotebookEdit too', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(decisionOf(ask(p, edit(p.path('system', 'core.md')))), 'deny');
  assert.equal(decisionOf(ask(p, multiEdit(p.path('system', 'lib', 'paths.mjs'), ['a', 'b']))), 'deny');
  assert.equal(decisionOf(ask(p, notebookEdit(p.path('vault', '40_sources', 'raw', 'nb.ipynb')))), 'deny');
  assert.equal(ask(p, notebookEdit(p.path('vault', '10_projects', 'nb.ipynb'))).stdout, '');
});

test('understands relative paths, odd slashes, traversal and letter case', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(decisionOf(ask(p, write('system/core.md'))), 'deny');
  assert.equal(decisionOf(ask(p, write('system\\core.md'))), 'deny');
  assert.equal(decisionOf(ask(p, write('./system/core.md'))), 'deny');
  assert.equal(decisionOf(ask(p, write('vault/../system/core.md'))), 'deny');
  assert.equal(decisionOf(ask(p, write('SYSTEM/Core.MD'))), 'deny');
  assert.equal(decisionOf(ask(p, write('vault/40_sources/RAW/x.md'))), 'deny');
  assert.equal(ask(p, write('vault/Notes/system/core.md')).stdout, '');
});

test('leaves files outside the project alone', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = ask(p, write(join(tmpdir(), 'somewhere', 'system', 'core.md')));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('dev mode allows everything', (t) => {
  const p = makeProject({ devMode: true });
  t.after(p.cleanup);
  for (const rel of ['system/core.md', '.claude/settings.json', 'system/hooks/x.mjs', 'tests/example.test.mjs', 'vault/40_sources/raw/a.md']) {
    const r = ask(p, write(p.path(...rel.split('/'))));
    assert.equal(r.code, 0, rel);
    assert.equal(r.stdout, '', rel);
  }
});

test('still protects the always-list when the manifest is missing or broken', (t) => {
  const missing = makeProject({ manifest: false });
  t.after(missing.cleanup);
  assert.equal(decisionOf(ask(missing, write(missing.path('system', 'core.md')))), 'deny');
  assert.equal(ask(missing, write(missing.path('tests', 'example.test.mjs'))).stdout, '');

  const broken = makeProject();
  t.after(broken.cleanup);
  broken.write('system/manifest.json', '{ not json');
  assert.equal(decisionOf(ask(broken, write(broken.path('system', 'lib', 'x.mjs')))), 'deny');
  assert.equal(ask(broken, write(broken.path('vault', 'Home.md'))).stdout, '');
});

test('ignores tools that are not file edits', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const input of [
    { tool_name: 'Read', tool_input: { file_path: p.path('system', 'core.md') } },
    { tool_name: 'Bash', tool_input: { command: 'echo hi' } },
    { tool_name: 'Write', tool_input: {} },
  ]) {
    const r = ask(p, input);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
});

test('fails open on malformed input', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const raw of ['', 'not json at all', '[1,2,3]', 'null', '{"tool_name":', '\u0000\u0001']) {
    const r = ask(p, null, { raw });
    assert.equal(r.code, 0, JSON.stringify(raw));
    assert.equal(r.stdout, '', JSON.stringify(raw));
  }
});

test('finds the project from its own location when CLAUDE_PROJECT_DIR is not set', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = ask(p, write('system/core.md'), { useEnv: false, cwd: tmpdir() });
  assert.equal(decisionOf(r), 'deny');
});

test('the rate guard\'s usage log and warning record cannot be edited by an agent, but may be by the owner in dev mode', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const rel of ['state/local/rate-guard/ledger.jsonl', 'state/local/rate-guard/state.json']) {
    const r = ask(p, write(p.path(...rel.split('/'))));
    assert.equal(decisionOf(r), 'deny', rel);
    assert.match(reasonOf(r), /usage limits record protects your accounts/, rel);
  }
  // Shell writes and deleting the whole folder are caught too.
  for (const command of ['echo {} > state/local/rate-guard/state.json', 'rm -rf state/local/rate-guard', 'rm state/local/rate-guard/ledger.jsonl']) {
    assert.equal(decisionOf(ask(p, { tool_name: 'Bash', tool_input: { command } })), 'deny', command);
  }
  // Reading it through the script is not a write.
  assert.equal(ask(p, { tool_name: 'Bash', tool_input: { command: 'node system/scripts/rate-guard.mjs status --json' } }).stdout, '');
  // Other state/local files stay editable.
  assert.equal(ask(p, write(p.path('state', 'local', 'model-check.json'))).stdout, '');
  const dev = makeProject({ devMode: true });
  t.after(dev.cleanup);
  assert.equal(ask(dev, write(dev.path('state', 'local', 'rate-guard', 'ledger.jsonl'))).stdout, '');
});
