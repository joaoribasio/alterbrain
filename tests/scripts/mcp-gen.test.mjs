import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { FIXTURES, makeProject, runScript, read, write } from '../fixtures/scripts/helpers.mjs';
import { buildMcpConfig, extractEntries, isPlaceholder, isSafeEnvValue, placeholderNames, wrapCommand } from '../../system/scripts/mcp-gen.mjs';

function setup(selected) {
  const p = makeProject();
  mkdirSync(p.path('system', 'catalogue'), { recursive: true });
  mkdirSync(p.path('config'), { recursive: true });
  cpSync(join(FIXTURES, 'mcp-gen', 'catalogue.json'), p.path('system', 'catalogue', 'mcp.json'));
  if (selected === undefined) cpSync(join(FIXTURES, 'mcp-gen', 'selected.json'), p.path('config', 'mcp.selected.json'));
  else if (selected !== null) write(p, 'config/mcp.selected.json', JSON.stringify({ schema: 1, enabled: selected }));
  return p;
}

test('Windows wraps npx and uvx as cmd /c, other commands stay as they are', () => {
  const p = setup();
  try {
    const r = runScript('mcp-gen.mjs', ['--platform=win32', '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const out = r.json();
    assert.deepEqual(out.servers, ['playwright', 'markitdown', 'adzuna']);
    assert.deepEqual(out.unknown, []);
    assert.deepEqual(out.info.map((i) => i.id), ['gmail']);
    const cfg = JSON.parse(read(p, '.mcp.json'));
    assert.deepEqual(cfg.mcpServers.playwright, { command: 'cmd', args: ['/c', 'npx', '-y', '@example/playwright-mcp@1.2.3'] });
    assert.deepEqual(cfg.mcpServers.markitdown, { command: 'cmd', args: ['/c', 'uvx', 'markitdown-mcp==0.0.1'] });
    assert.deepEqual(cfg.mcpServers.adzuna, { command: 'node', args: ['server.mjs'], env: { ADZUNA_APP_KEY: '${ADZUNA_APP_KEY}' } });
    assert.ok(!('gmail' in cfg.mcpServers), 'connectors are not written to .mcp.json');
  } finally {
    p.cleanup();
  }
});

test('macOS and Linux leave npx alone', () => {
  const p = setup();
  try {
    assert.equal(runScript('mcp-gen.mjs', ['--platform=darwin'], p).status, 0);
    const cfg = JSON.parse(read(p, '.mcp.json'));
    assert.deepEqual(cfg.mcpServers.playwright, { command: 'npx', args: ['-y', '@example/playwright-mcp@1.2.3'] });
    assert.equal(cfg.mcpServers.markitdown.command, 'uvx');
  } finally {
    p.cleanup();
  }
});

test('the real platform is used by default', () => {
  const p = setup();
  try {
    runScript('mcp-gen.mjs', [], p);
    const cfg = JSON.parse(read(p, '.mcp.json'));
    const expected = process.platform === 'win32' ? 'cmd' : 'npx';
    assert.equal(cfg.mcpServers.playwright.command, expected);
  } finally {
    p.cleanup();
  }
});

test('unknown ids are reported and exit 1, known ones are still written', () => {
  const p = setup(['playwright', 'does-not-exist']);
  try {
    const r = runScript('mcp-gen.mjs', ['--platform=darwin', '--json'], p);
    assert.equal(r.status, 1);
    const out = r.json();
    assert.equal(out.ok, false);
    assert.deepEqual(out.unknown, ['does-not-exist']);
    assert.deepEqual(Object.keys(JSON.parse(read(p, '.mcp.json')).mcpServers), ['playwright']);
    const human = runScript('mcp-gen.mjs', ['--platform=darwin'], p);
    assert.match(human.stdout, /Not in the catalogue, so skipped: does-not-exist/);
  } finally {
    p.cleanup();
  }
});

test('tools marked "avoid" are never written', () => {
  const p = setup(['shady', 'markitdown']);
  try {
    const r = runScript('mcp-gen.mjs', ['--platform=darwin', '--json'], p);
    assert.equal(r.status, 1);
    assert.deepEqual(r.json().skipped.map((s) => s.id), ['shady']);
    assert.deepEqual(Object.keys(JSON.parse(read(p, '.mcp.json')).mcpServers), ['markitdown']);
  } finally {
    p.cleanup();
  }
});

test('--dry-run writes nothing and prints the result', () => {
  const p = setup();
  try {
    const r = runScript('mcp-gen.mjs', ['--dry-run', '--platform=darwin'], p);
    assert.equal(r.status, 0);
    assert.equal(existsSync(p.path('.mcp.json')), false);
    assert.match(r.stdout, /Dry run/);
    assert.match(r.stdout, /"mcpServers"/);
    const j = runScript('mcp-gen.mjs', ['--dry-run', '--json', '--platform=darwin'], p).json();
    assert.equal(j.written, false);
    assert.equal(j.changed, true);
  } finally {
    p.cleanup();
  }
});

test('running twice changes nothing the second time', () => {
  const p = setup();
  try {
    runScript('mcp-gen.mjs', ['--platform=darwin'], p);
    const second = runScript('mcp-gen.mjs', ['--platform=darwin', '--json'], p).json();
    assert.equal(second.changed, false);
    assert.equal(second.written, false);
    assert.match(runScript('mcp-gen.mjs', ['--platform=darwin'], p).stdout, /already up to date/);
  } finally {
    p.cleanup();
  }
});

test('an empty selection writes an empty server list', () => {
  const p = setup([]);
  try {
    assert.equal(runScript('mcp-gen.mjs', ['--platform=darwin'], p).status, 0);
    assert.deepEqual(JSON.parse(read(p, '.mcp.json')), { mcpServers: {} });
  } finally {
    p.cleanup();
  }
});

test('missing or broken inputs exit 1 without writing', () => {
  const none = setup(null);
  try {
    assert.equal(runScript('mcp-gen.mjs', [], none).status, 1);
    assert.equal(existsSync(none.path('.mcp.json')), false);
    write(none, 'config/mcp.selected.json', '{ not json');
    assert.equal(runScript('mcp-gen.mjs', [], none).status, 1);
    write(none, 'config/mcp.selected.json', '{"schema":1,"enabled":[]}');
    write(none, 'system/catalogue/mcp.json', 'oops');
    assert.equal(runScript('mcp-gen.mjs', [], none).status, 1);
  } finally {
    none.cleanup();
  }
});

test('usage errors exit 2', () => {
  const p = setup();
  try {
    assert.equal(runScript('mcp-gen.mjs', ['--nope'], p).status, 2);
    assert.equal(runScript('mcp-gen.mjs', ['stray'], p).status, 2);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- unit tests
test('secret-looking env values that are not ${VAR} placeholders are dropped with a warning', () => {
  const entries = [
    {
      id: 'x', tier: 'optional', transport: 'stdio', command: 'node', args: ['a.mjs'],
      env: { GOOD: '${GOOD}', SERVICE_TOKEN: 'literal-value', PLAIN_LOOKING: 'sk-' + 'abc123', TIMEOUT: '300', LOCAL: 'true' },
    },
  ];
  const r = buildMcpConfig({ enabled: ['x'], entries, platform: 'linux' });
  assert.deepEqual(r.servers.x.env, { GOOD: '${GOOD}', TIMEOUT: '300', LOCAL: 'true' });
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings.join('\n'), /SERVICE_TOKEN/);
  assert.match(r.warnings.join('\n'), /PLAIN_LOOKING/);
  assert.ok(!JSON.stringify(r).includes('literal-value'));
  assert.ok(!JSON.stringify(r).includes('abc123'));
});

test('isSafeEnvValue: placeholders and short plain settings only', () => {
  assert.equal(isSafeEnvValue('ANY_NAME', '${ANY_NAME}'), true);
  assert.equal(isSafeEnvValue('ZOTERO_LOCAL', 'true'), true);
  assert.equal(isSafeEnvValue('API_KEY', 'true'), false, 'secret-looking names need a placeholder');
  assert.equal(isSafeEnvValue('SETTING', 'has spaces here'), false);
  assert.equal(isSafeEnvValue('SETTING', 'a'.repeat(65)), false);
  assert.equal(isSafeEnvValue('SETTING', 'ab'.repeat(20)), false, 'long hex strings look like secrets');
  assert.equal(isSafeEnvValue('SETTING', 123), false);
});

test('${CLAUDE_PROJECT_DIR} is replaced with the real folder, other placeholders are kept', () => {
  const entries = [
    {
      id: 'vault', tier: 'core', transport: 'stdio', command: 'npx', args: ['-y', 'pkg@1.0.0', '${CLAUDE_PROJECT_DIR}/vault'],
      env: { ROOT: '${CLAUDE_PROJECT_DIR}', TOKEN_X: '${TOKEN_X}' },
    },
  ];
  const r = buildMcpConfig({ enabled: ['vault'], entries, platform: 'darwin', projectDir: '/home/alex/brain' });
  assert.deepEqual(r.servers.vault.args, ['-y', 'pkg@1.0.0', '/home/alex/brain/vault']);
  assert.deepEqual(r.servers.vault.env, { ROOT: '/home/alex/brain', TOKEN_X: '${TOKEN_X}' });
  assert.deepEqual(placeholderNames(r.servers.vault), ['TOKEN_X']);
  const untouched = buildMcpConfig({ enabled: ['vault'], entries, platform: 'darwin' });
  assert.equal(untouched.servers.vault.args[2], '${CLAUDE_PROJECT_DIR}/vault');
});

test('the CLI fills in the project folder and warns about keys that are not set yet', () => {
  const p = makeProject();
  try {
    mkdirSync(p.path('system', 'catalogue'), { recursive: true });
    write(
      p,
      'system/catalogue/mcp.json',
      JSON.stringify({
        schema: 1,
        servers: [
          { id: 'vault', tier: 'core', transport: 'stdio', command: 'node', args: ['serve.mjs', '${CLAUDE_PROJECT_DIR}/vault'], env: {} },
          { id: 'search', tier: 'optional', transport: 'stdio', command: 'node', args: ['s.mjs'], env: { SEARCH_API_KEY: '${SEARCH_API_KEY}', OTHER_KEY: '${OTHER_KEY}' } },
        ],
      }),
    );
    write(p, 'config/mcp.selected.json', JSON.stringify({ schema: 1, enabled: ['vault', 'search'] }));
    write(p, '.env.local', '# keys\nSEARCH_API_KEY=abc\nEMPTY=\n');
    const out = runScript('mcp-gen.mjs', ['--json', '--platform=linux'], p, { OTHER_KEY: '' }).json();
    assert.equal(out.ok, true);
    assert.equal(out.config.mcpServers.vault.args[1], `${p.dir.split(sep).join('/')}/vault`);
    assert.deepEqual(out.warnings, ['search needs OTHER_KEY. Add it to .env.local before using this tool.']);
    assert.ok(!JSON.stringify(out).includes('abc'), 'values from .env.local are never printed');
  } finally {
    p.cleanup();
  }
});

test('remote (http) entries send their key as a header; guide-only entries are skipped', () => {
  const entries = [
    { id: 'rest', tier: 'optional', transport: 'http', endpoint: 'https://127.0.0.1:27124/mcp/', env: { OBSIDIAN_API_KEY: '${OBSIDIAN_API_KEY}' } },
    { id: 'plain', tier: 'optional', transport: 'http', endpoint: 'https://example.com/mcp' },
    { id: 'guide', tier: 'high-risk', transport: 'none', blueprint_only: true, command: null, args: [] },
  ];
  const r = buildMcpConfig({ enabled: ['rest', 'plain', 'guide'], entries, platform: 'linux' });
  assert.deepEqual(r.servers.rest, { type: 'http', url: 'https://127.0.0.1:27124/mcp/', headers: { Authorization: 'Bearer ${OBSIDIAN_API_KEY}' } });
  assert.deepEqual(r.servers.plain, { type: 'http', url: 'https://example.com/mcp' });
  assert.deepEqual(r.skipped.map((s) => s.id), ['guide']);
  assert.match(r.skipped[0].reason, /guide only/);
});

test('http entries need an endpoint', () => {
  const entries = [
    { id: 'remote', tier: 'optional', transport: 'http', endpoint: 'https://example.com/mcp' },
    { id: 'broken', tier: 'optional', transport: 'http' },
  ];
  const r = buildMcpConfig({ enabled: ['remote', 'broken'], entries, platform: 'linux' });
  assert.deepEqual(r.servers.remote, { type: 'http', url: 'https://example.com/mcp' });
  assert.deepEqual(r.skipped.map((s) => s.id), ['broken']);
});

test('extractEntries accepts the common catalogue shapes', () => {
  const a = { id: 'a' };
  assert.deepEqual(extractEntries([a]), [a]);
  assert.deepEqual(extractEntries({ schema: 1, servers: [a] }), [a]);
  assert.deepEqual(extractEntries({ entries: [a] }), [a]);
  assert.deepEqual(extractEntries({ schema: 1, servers: { a: {} } }), [{ id: 'a' }]);
  assert.deepEqual(extractEntries({ schema: 1, a: { name: 'A' } }), [{ id: 'a', name: 'A' }]);
  assert.deepEqual(extractEntries(null), []);
});

test('wrapCommand and isPlaceholder', () => {
  assert.deepEqual(wrapCommand('npx', ['-y', 'pkg@1'], 'win32'), { command: 'cmd', args: ['/c', 'npx', '-y', 'pkg@1'] });
  assert.deepEqual(wrapCommand('NPX.cmd', ['x'], 'win32'), { command: 'cmd', args: ['/c', 'NPX.cmd', 'x'] });
  assert.deepEqual(wrapCommand('node', ['x'], 'win32'), { command: 'node', args: ['x'] });
  assert.deepEqual(wrapCommand('npx', ['x'], 'darwin'), { command: 'npx', args: ['x'] });
  assert.equal(isPlaceholder('${API_KEY}'), true);
  assert.equal(isPlaceholder('sk-live-123'), false);
  assert.equal(isPlaceholder('prefix ${API_KEY}'), false);
  assert.equal(isPlaceholder(''), false);
});
