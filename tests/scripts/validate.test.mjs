import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { copyFixture, makeProject, read, runScript, write } from '../fixtures/scripts/helpers.mjs';
import {
  buildManifest,
  classify,
  codePaths,
  isExcluded,
  listFrameworkFiles,
  manifestEntries,
  sha256Normalised,
} from '../../system/lib/manifest.mjs';

/** A valid project, optionally changed by `mutate(project)`, then validated. */
function check(mutate) {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    if (mutate) mutate(p);
    const r = runScript('validate.mjs', ['--json'], p);
    return { status: r.status, out: r.json(), p };
  } finally {
    p.cleanup();
  }
}
const has = (list, re) => list.some((m) => re.test(m));

const SKILL = '.claude/skills/demo/SKILL.md';
const AGENT = '.claude/agents/helper.md';
const swap = (p, rel, from, to) => {
  const text = read(p, rel);
  assert.ok(text.includes(from), `fixture should contain ${from}`);
  write(p, rel, text.replace(from, to));
};

test('a valid project passes with no errors or warnings', () => {
  const { status, out } = check();
  assert.equal(status, 0, JSON.stringify(out));
  assert.equal(out.ok, true);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
  assert.equal(out.checked.skills, 1);
  assert.equal(out.checked.agents, 2);
  assert.equal(out.checked.blueprints, 1);
  assert.equal(out.checked.mcp_entries, 5);
});

test('human output is readable and exits 0 when fine', () => {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    const r = runScript('validate.mjs', [], p);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Checked 1 skill\(s\), 2 agent\(s\)/);
    assert.match(r.stdout, /All good\./);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- skills
test('skill: name must match the folder', () => {
  const { status, out } = check((p) => swap(p, SKILL, 'name: demo', 'name: other'));
  assert.equal(status, 1);
  assert.ok(has(out.errors, /demo\/SKILL\.md: name "other" must match the folder name "demo"/));
});

test('skill: required keys', () => {
  for (const key of ['name', 'description', 'model', 'effort']) {
    const { out } = check((p) => {
      const lines = read(p, SKILL).split('\n').filter((l) => !l.startsWith(`${key}:`));
      write(p, SKILL, lines.join('\n'));
    });
    assert.ok(has(out.errors, new RegExp(`missing required key "${key}"`)), `${key}: ${out.errors}`);
  }
});

test('skill: model and effort values', () => {
  let r = check((p) => swap(p, SKILL, 'model: sonnet', 'model: claude-sonnet-4-5'));
  assert.ok(has(r.out.errors, /model must be one of haiku, sonnet, opus, fable, inherit.*short name/));
  r = check((p) => swap(p, SKILL, 'model: sonnet', 'model: inherit'));
  assert.equal(r.status, 0, 'inherit is allowed');
  r = check((p) => swap(p, SKILL, 'effort: medium', 'effort: extreme'));
  assert.ok(has(r.out.errors, /effort must be one of low, medium, high/));
  for (const e of ['xhigh', 'max']) {
    r = check((p) => swap(p, SKILL, 'effort: medium', `effort: ${e}`));
    assert.equal(r.status, 0, `${e} is only a warning`);
    assert.ok(has(r.out.warnings, new RegExp(`effort "${e}"`)));
  }
});

test('skill: unknown frontmatter keys are errors', () => {
  const { out } = check((p) => swap(p, SKILL, 'effort: medium', 'effort: medium\nallowed-tools: Read'));
  assert.ok(has(out.errors, /unknown frontmatter key "allowed-tools"/));
});

test('skill: no frontmatter, missing SKILL.md, multi-line description', () => {
  let r = check((p) => write(p, SKILL, '# Demo\n\nNo frontmatter here.\n'));
  assert.ok(has(r.out.errors, /no frontmatter found/));
  r = check((p) => write(p, '.claude/skills/empty/notes.txt', 'x'));
  assert.ok(has(r.out.errors, /empty\/SKILL\.md: SKILL\.md is missing/));
  r = check((p) => swap(p, SKILL, 'description: Shows a tiny example skill so the validator has something good to check.', 'description: >\n  Folded text'));
  assert.ok(has(r.out.errors, /single line/));
});

test('skill: more than 250 lines is an error', () => {
  const { out } = check((p) => write(p, SKILL, read(p, SKILL) + '\nfiller line\n'.repeat(260)));
  assert.ok(has(out.errors, /lines\. SKILL\.md must be 250 lines or fewer/));
});

test('skill: body sections are checked as warnings', () => {
  const { status, out } = check((p) => swap(p, SKILL, '## Safety', '## Danger'));
  assert.equal(status, 0);
  assert.ok(has(out.warnings, /missing section "## Safety"/));
  const r = check((p) => {
    swap(p, SKILL, '## Steps', '## Zed');
    swap(p, SKILL, '## Outputs', '## Steps');
    swap(p, SKILL, '## Zed', '## Outputs');
  });
  assert.ok(has(r.out.warnings, /out of order/));
});

test('skill: user-built my-* skills are checked too', () => {
  const { out } = check((p) => write(p, '.claude/skills/my-thing/SKILL.md', '---\nname: my-thing\ndescription: A user skill without a model or effort set.\n---\n# My thing\n'));
  assert.ok(has(out.errors, /my-thing\/SKILL\.md: missing required key "model"/));
});

// ------------------------------------------------------------- agents
test('agent: tools are required and name must match the file', () => {
  let r = check((p) => swap(p, AGENT, 'tools: Read, Grep, Glob\n', ''));
  assert.ok(has(r.out.errors, /helper\.md: agents must declare "tools"/));
  r = check((p) => swap(p, AGENT, 'name: helper', 'name: assistant'));
  assert.ok(has(r.out.errors, /name "assistant" must match the file name "helper"/));
});

test('agent: model and effort values, and a Never list', () => {
  let r = check((p) => swap(p, AGENT, 'model: haiku', 'model: gpt'));
  assert.ok(has(r.out.errors, /model must be one of/));
  r = check((p) => swap(p, AGENT, 'effort: low', 'effort: huge'));
  assert.ok(has(r.out.errors, /effort must be one of/));
  r = check((p) => swap(p, AGENT, 'Never edit files. Never browse the web.', 'Be careful.'));
  assert.equal(r.status, 0);
  assert.ok(has(r.out.warnings, /no "Never" list/));
});

const MAIL_READER = '.claude/agents/mail-reader.md';
const MAIL_READER_BLOCKED = /^disallowedTools: .*$/m;

test('agent: mail-reader may inherit tools if disallowedTools blocks every write, send and web tool', () => {
  const { status, out } = check();
  assert.equal(status, 0, JSON.stringify(out));
  assert.deepEqual(out.errors, []);
});

test('agent: mail-reader with a tools list must not allow write, send or web tools', () => {
  const { status, out } = check((p) => write(p, MAIL_READER, read(p, MAIL_READER).replace(MAIL_READER_BLOCKED, 'tools: Read, Grep, WebFetch, Write, mcp__claude_ai_Gmail__send_message')));
  assert.equal(status, 1);
  assert.ok(has(out.errors, /mail-reader must stay quarantined.*WebFetch, Write, mcp__claude_ai_Gmail__send_message/));
});

test('agent: mail-reader with a safe tools list passes', () => {
  const { status, out } = check((p) => write(p, MAIL_READER, read(p, MAIL_READER).replace(MAIL_READER_BLOCKED, 'tools: Read, Grep')));
  assert.equal(status, 0, JSON.stringify(out));
});

test('agent: mail-reader without tools must block every write, send and web tool', () => {
  let r = check((p) => swap(p, MAIL_READER, ', WebFetch', ''));
  assert.equal(r.status, 1);
  assert.ok(has(r.out.errors, /mail-reader has no "tools" list.*Add: WebFetch/));
  r = check((p) => swap(p, MAIL_READER, ', mcp__claude_ai_Gmail__create_draft', ''));
  assert.equal(r.status, 1);
  assert.ok(has(r.out.errors, /mail-reader has no "tools" list.*Add: mcp__claude_ai_Gmail__create_draft/));
  r = check((p) => write(p, MAIL_READER, read(p, MAIL_READER).replace(MAIL_READER_BLOCKED, '')));
  assert.equal(r.status, 1);
  assert.ok(has(r.out.errors, /mail-reader must declare "tools"|agents must declare "tools"/));
});

test('agent: other agents still need a tools list, disallowedTools is not enough', () => {
  const r = check((p) => swap(p, AGENT, 'tools: Read, Grep, Glob\n', 'disallowedTools: Write\n'));
  assert.ok(has(r.out.errors, /helper\.md: agents must declare "tools"/));
});

test('agent: files saved with Windows line endings are read in full', () => {
  const { status, out } = check((p) => write(p, AGENT, read(p, AGENT).split('\n').join('\r\n')));
  assert.equal(status, 0, JSON.stringify(out));
  assert.deepEqual(out.errors, []);
});

test('agent: tools can be written as a list', () => {
  const { status } = check((p) => swap(p, AGENT, 'tools: Read, Grep, Glob', 'tools: [Read, Grep]'));
  assert.equal(status, 0);
});

// ------------------------------------------------------------- blueprints
test('blueprint: missing section and frontmatter are errors', () => {
  let r = check((p) => swap(p, 'system/blueprints/example.md', '## How to undo', '## Rollback'));
  assert.ok(has(r.out.errors, /missing section "## How to undo"/));
  r = check((p) => swap(p, 'system/blueprints/example.md', 'risk: "low"\n', ''));
  assert.ok(has(r.out.errors, /missing frontmatter key "risk"/));
  r = check((p) => swap(p, 'system/blueprints/example.md', 'type: "blueprint"', 'type: "note"'));
  assert.ok(has(r.out.errors, /type must be "blueprint"/));
});

test("blueprint: curly apostrophes in headings are accepted", () => {
  const { status } = check((p) => {
    swap(p, 'system/blueprints/example.md', "## You'll need", '## You’ll need');
    swap(p, 'system/blueprints/example.md', "## Questions I'll ask you", '## Questions I’ll ask you');
  });
  assert.equal(status, 0);
});

// ------------------------------------------------------------- routing
test('routing: schema, classes, caps', () => {
  const rel = 'system/catalogue/routing.json';
  const edit = (fn) => (p) => {
    const j = JSON.parse(read(p, rel));
    fn(j);
    write(p, rel, JSON.stringify(j));
  };
  let r = check(edit((j) => delete j.classes.judgement));
  assert.ok(has(r.out.errors, /missing class "judgement"/));
  r = check(edit((j) => (j.classes.work.model = 'claude-sonnet-4')));
  assert.ok(has(r.out.errors, /class "work": model must be/));
  r = check(edit((j) => (j.caps.max = 1)));
  assert.ok(has(r.out.errors, /caps\.max must not be lower/));
  r = check(edit((j) => (j.schema = 2)));
  assert.ok(has(r.out.errors, /schema must be 1/));
  r = check((p) => write(p, rel, '{ broken'));
  assert.ok(has(r.out.errors, /routing\.json: not valid JSON/));
});

// ------------------------------------------------------------- catalogue
test('catalogue: entry rules', () => {
  const rel = 'system/catalogue/mcp.json';
  const edit = (fn) => (p) => {
    const j = JSON.parse(read(p, rel));
    fn(j.servers);
    write(p, rel, JSON.stringify(j));
  };
  let r = check(edit((s) => (s[0].tier = 'wild')));
  assert.ok(has(r.out.errors, /\[playwright\]: tier must be one of core, optional, high-risk, avoid/));
  r = check(edit((s) => (s[1].id = 'playwright')));
  assert.ok(has(r.out.errors, /duplicate id/));
  r = check(edit((s) => (s[2].env.ADZUNA_APP_KEY = 'real-secret-value')));
  assert.ok(has(r.out.errors, /ADZUNA_APP_KEY must be a \$\{VAR\} placeholder/));
  assert.ok(!r.out.errors.join('\n').includes('real-secret-value'), 'never echo the value');
  r = check(edit((s) => (s[0].url = 'http://insecure.example')));
  assert.ok(has(r.out.errors, /"url" must be an https link/));
  r = check(edit((s) => delete s[0].command));
  assert.ok(has(r.out.errors, /stdio entries need a "command"/));
  r = check(edit((s) => (s[0].verified = 'yesterday')));
  assert.ok(has(r.out.errors, /"verified" must be a date/));
});

test('catalogue: real-world shapes are accepted (underscore ids, avoid entries, guide-only entries, plain settings)', () => {
  const rel = 'system/catalogue/mcp.json';
  const { status, out } = check((p) => {
    const j = JSON.parse(read(p, rel));
    const base = { url: 'https://example.com/x', licence: 'MIT', what: 'Something.', auth: 'none', cost: 'free', tos_risk: 'low', writes: false, channel: null, verified: '2026-10-07' };
    j.servers.push(
      { ...base, id: 'google_workspace_mcp', name: 'A', tier: 'optional', transport: 'stdio', command: 'uvx', args: ['pkg==1.0.0'], env: {} },
      { ...base, id: 'dead-project', name: 'B', tier: 'avoid', transport: 'stdio', command: null, args: [], env: {} },
      { ...base, id: 'guide', name: 'C', tier: 'high-risk', transport: 'none', command: null, args: [], env: {}, blueprint_only: true },
      { ...base, id: 'settings', name: 'D', tier: 'optional', transport: 'stdio', command: 'node', args: ['a.mjs'], env: { ZOTERO_LOCAL: 'true', UV_HTTP_TIMEOUT: '300' } },
      { ...base, id: 'remote', name: 'E', tier: 'optional', transport: 'http', endpoint: 'https://127.0.0.1:27124/mcp/', env: { API_KEY: '${API_KEY}' } },
    );
    write(p, rel, JSON.stringify(j));
  });
  assert.equal(status, 0, JSON.stringify(out.errors));
});

test('catalogue: transport "none" needs blueprint_only; avoid entries still need a name and url', () => {
  const rel = 'system/catalogue/mcp.json';
  const { out } = check((p) => {
    const j = JSON.parse(read(p, rel));
    j.servers.push({ id: 'odd', name: 'Odd', url: 'https://example.com', licence: 'MIT', what: 'x', tier: 'optional', transport: 'none', auth: 'none' });
    write(p, rel, JSON.stringify(j));
  });
  assert.ok(has(out.errors, /\[odd\]: transport "none" is only for entries marked blueprint_only/));
});

test('vendored skills are only checked for frontmatter, not for body sections', () => {
  const { status, out } = check((p) =>
    write(p, '.claude/skills/obsidian-markdown/SKILL.md', '---\nname: obsidian-markdown\ndescription: Create and edit Obsidian Flavored Markdown notes with links and callouts.\nmodel: sonnet\neffort: low\n---\n\nUpstream body.\n'),
  );
  assert.equal(status, 0);
  assert.deepEqual(out.warnings, []);
});

test('catalogue: unpinned packages are a warning, not an error', () => {
  const rel = 'system/catalogue/mcp.json';
  const { status, out } = check((p) => {
    const j = JSON.parse(read(p, rel));
    j.servers[0].args = ['-y', '@example/playwright-mcp@latest'];
    write(p, rel, JSON.stringify(j));
  });
  assert.equal(status, 0);
  assert.ok(has(out.warnings, /\[playwright\]: package version is not pinned/));
});

test('catalogue: missing file is an error; settings.json must be valid JSON', () => {
  let r = check((p) => write(p, 'system/catalogue/mcp.json', '[]'));
  assert.ok(has(r.out.errors, /no catalogue entries found/));
  r = check((p) => write(p, '.claude/settings.json', '{ nope'));
  assert.ok(has(r.out.errors, /settings\.json: not valid JSON/));
});

test('usage errors exit 2', () => {
  const p = makeProject();
  try {
    assert.equal(runScript('validate.mjs', ['--bogus'], p).status, 2);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- manifest
test('--write-manifest writes system/manifest.json with classes and LF-normalised hashes', () => {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    write(p, 'system/release.json', '{"name":"alterbrain","version":"9.9.9","tag":"v9.9.9"}\n');
    write(p, 'system/core.md', 'core line 1\r\ncore line 2\r\n'); // CRLF on purpose
    write(p, 'system/hooks/hook.mjs', 'export {};\n');
    write(p, 'system/scripts/tool.mjs', 'export {};\n');
    write(p, 'system/lib/lib.mjs', 'export {};\n');
    write(p, 'system/templates/note.md', 'template\n');
    write(p, 'system/catalogue/MCP-CATALOGUE.md', 'human view\n');
    write(p, 'tests/a.test.mjs', 'x\n');
    write(p, '.github/workflows/ci.yml', 'name: ci\n');
    write(p, 'README.md', 'readme\n');
    write(p, 'CLAUDE.md', '@system/core.md\n');
    write(p, '.claude/rules/vault.md', 'rule\n');
    write(p, '.claude/skills/demo/references/more.md', 'more\n');
    // user and generated files that must stay out of the manifest
    write(p, 'vault/Home.md', 'home\n');
    write(p, 'config/brain.json', '{}\n');
    write(p, 'state/onboarding.json', '{}\n');
    write(p, '.mcp.json', '{}\n');
    write(p, '.claude/settings.local.json', '{}\n');
    write(p, '.claude/skills/my-thing/SKILL.md', 'mine\n');
    write(p, '.claude/agents/my-agent.md', 'mine\n');
    write(p, '.git/config', 'git\n');
    write(p, 'node_modules/pkg/index.js', 'x\n');
    write(p, 'tests/node_modules/pkg/index.js', 'x\n');
    write(p, '.env.local', 'SECRET=1\n');
    write(p, '.DS_Store', 'junk');

    const r = runScript('validate.mjs', ['--write-manifest', '--json'], p);
    // my-* files are not valid skills/agents, so lint fails, but the manifest is written all the same.
    assert.equal(r.status, 1);
    const out = r.json();
    assert.equal(out.errors.length, 2);
    assert.equal(out.manifest.path, 'system/manifest.json');

    const m = JSON.parse(read(p, 'system/manifest.json'));
    assert.equal(m.schema, 1);
    assert.equal(m.version, '9.9.9');
    assert.equal(m.tag, 'v9.9.9');
    assert.equal(out.manifest.files, m.files.length);
    const byPath = Object.fromEntries(m.files.map((f) => [f.path, f]));
    const paths = Object.keys(byPath);
    assert.deepEqual(paths, [...paths].sort(), 'sorted and stable');

    const codeExpected = [
      '.claude/settings.json', 'system/core.md', 'system/release.json', 'system/hooks/hook.mjs', 'system/scripts/tool.mjs',
      'system/lib/lib.mjs', 'system/catalogue/mcp.json', 'system/catalogue/routing.json', 'tests/a.test.mjs', '.github/workflows/ci.yml',
    ];
    for (const c of codeExpected) assert.equal(byPath[c]?.class, 'code', c);
    const textExpected = [
      'README.md', 'CLAUDE.md', '.claude/rules/vault.md', '.claude/skills/demo/SKILL.md', '.claude/skills/demo/references/more.md',
      '.claude/agents/helper.md', 'system/templates/note.md', 'system/catalogue/MCP-CATALOGUE.md', 'system/blueprints/example.md',
    ];
    for (const t of textExpected) assert.equal(byPath[t]?.class, 'text', t);

    const excluded = [
      'system/manifest.json', 'vault/Home.md', 'config/brain.json', 'state/onboarding.json', '.mcp.json', '.claude/settings.local.json',
      '.claude/skills/my-thing/SKILL.md', '.claude/agents/my-agent.md', '.git/config', 'node_modules/pkg/index.js',
      'tests/node_modules/pkg/index.js', '.env.local', '.DS_Store',
    ];
    for (const x of excluded) assert.equal(byPath[x], undefined, `${x} must not be listed`);

    // CRLF content hashes the same as its LF form.
    assert.equal(byPath['system/core.md'].sha256, sha256Normalised(Buffer.from('core line 1\ncore line 2\n')));
    assert.match(byPath['README.md'].sha256, /^[0-9a-f]{64}$/);

    // Running again gives byte-identical output (stable, no timestamps).
    const first = read(p, 'system/manifest.json');
    runScript('validate.mjs', ['--write-manifest'], p);
    assert.equal(read(p, 'system/manifest.json'), first);
    assert.ok(!first.includes('\r'), 'manifest uses LF');
  } finally {
    p.cleanup();
  }
});

test('--write-manifest still writes when there are lint errors (and exits 1)', () => {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    swap(p, SKILL, 'name: demo', 'name: other');
    const r = runScript('validate.mjs', ['--write-manifest'], p);
    assert.equal(r.status, 1);
    assert.match(read(p, 'system/manifest.json'), /"files"/);
  } finally {
    p.cleanup();
  }
});

test('manifest lib: classify, isExcluded, hashing, entries', () => {
  assert.equal(classify('system/catalogue/mcp.json'), 'code');
  assert.equal(classify('system/catalogue/MCP-CATALOGUE.md'), 'text');
  assert.equal(classify('system/catalogue/sub/x.json'), 'text');
  assert.equal(classify('system/docs/guides/a.md'), 'text');
  assert.equal(classify('system/hooks/x.mjs'), 'code');
  assert.equal(classify('system\\hooks\\x.mjs'), 'code', 'backslashes are normalised');
  assert.equal(classify('.claude/settings.json'), 'code');
  assert.equal(classify('.claude/settings.local.json'), 'text'); // never listed, but not "code"
  assert.equal(classify('docs/SPEC.md'), 'text');
  // Executable files are code wherever they live, not only under system/scripts.
  assert.equal(classify('system/quarto/tools/render.mjs'), 'code');
  assert.equal(classify('system/quarto/tools/lib.mjs'), 'code');
  assert.equal(classify('system/templates/vault/x.js'), 'code');
  assert.equal(classify('some/dir/run.ps1'), 'code');
  assert.equal(classify('some/dir/run.SH'), 'code');
  assert.equal(classify('system/quarto/templates/cv/_extensions/awesomecv/cv.lua'), 'text');
  assert.equal(classify('system/quarto/README.md'), 'text');
  assert.equal(classify('docs/notes.mjs.md'), 'text');

  assert.equal(isExcluded('vault/00_inbox/Tasks.md'), true);
  assert.equal(isExcluded('.claude/skills/my-x/SKILL.md'), true);
  assert.equal(isExcluded('.claude/skills/mythology/SKILL.md'), false, 'only the my- prefix is user-owned');
  assert.equal(isExcluded('.claude/agents/my-x.md'), true);
  assert.equal(isExcluded('.env.example'), false);
  assert.equal(isExcluded('.env'), true);
  assert.equal(isExcluded('system/lib/x.mjs'), false);

  // CRLF and LF hash the same; binary content is hashed as it is.
  assert.equal(sha256Normalised(Buffer.from('a\r\nb')), sha256Normalised(Buffer.from('a\nb')));
  const bin = Buffer.from([0, 13, 10, 1]);
  assert.notEqual(sha256Normalised(bin), sha256Normalised(Buffer.from([0, 10, 1])));
  // Non-ASCII text survives normalisation.
  assert.equal(sha256Normalised(Buffer.from('café\r\n')), sha256Normalised(Buffer.from('café\n')));

  assert.deepEqual(manifestEntries({ files: { 'a.md': { class: 'text', sha256: 'x' } } }), [{ path: 'a.md', class: 'text', sha256: 'x' }]);
  assert.deepEqual(manifestEntries(null), []);
  assert.deepEqual(codePaths({ files: [{ path: 'a', class: 'code' }, { path: 'b', class: 'text' }] }), ['a']);
});

test('manifest lib: listFrameworkFiles and buildManifest work on an explicit root', () => {
  const p = makeProject();
  try {
    mkdirSync(p.path('system', 'lib'), { recursive: true });
    writeFileSync(p.path('system', 'lib', 'a.mjs'), 'a\n');
    writeFileSync(p.path('system', 'manifest.json'), '{}');
    writeFileSync(p.path('system', 'release.json'), '{"version":"1.2.3","tag":"v1.2.3"}');
    mkdirSync(p.path('vault', 'x'), { recursive: true });
    writeFileSync(p.path('vault', 'x', 'n.md'), 'n');
    assert.deepEqual(listFrameworkFiles(p.dir), ['system/lib/a.mjs', 'system/release.json']);
    assert.deepEqual(listFrameworkFiles(p.dir, { includeManifest: true }), ['system/lib/a.mjs', 'system/manifest.json', 'system/release.json']);
    const m = buildManifest(p.dir);
    assert.equal(m.version, '1.2.3');
    assert.deepEqual(m.files.map((f) => [f.path, f.class]), [['system/lib/a.mjs', 'code'], ['system/release.json', 'code']]);
  } finally {
    p.cleanup();
  }
});

test('catalogue: the risk word on MCP-CATALOGUE.md must match tos_risk in mcp.json', () => {
  const page = (risk) => `| Name | What it does | Risk |\n|---|---|---|\n| \`playwright\` | Opens pages | ${risk} |\n`;
  const rel = 'system/catalogue/MCP-CATALOGUE.md';
  const tos = (p) => JSON.parse(read(p, 'system/catalogue/mcp.json')).servers.find((s) => s.id === 'playwright').tos_risk;
  let r = check((p) => write(p, rel, page({ low: 'Medium', medium: 'Low', high: 'Low' }[tos(p)])));
  assert.ok(has(r.out.errors, /MCP-CATALOGUE\.md: playwright: the page says risk/), JSON.stringify(r.out.errors));
  r = check((p) => write(p, rel, page(tos(p)[0].toUpperCase() + tos(p).slice(1))));
  assert.ok(!has(r.out.errors, /MCP-CATALOGUE/), JSON.stringify(r.out.errors));
});

test('attribution: files UPSTREAM-SYNC.md lists as adapted must carry an "Adapted from" line; verbatim files need none', () => {
  const table = (mode) => `| Our file | Source path | Mode | Notes |\n|---|---|---|---|\n| \`docs/x.md\` | \`x.md\` | ${mode} | |\n`;
  let r = check((p) => {
    write(p, 'UPSTREAM-SYNC.md', table('adapted'));
    write(p, 'docs/x.md', '# Something\n');
  });
  assert.ok(has(r.out.errors, /docs\/x\.md: listed as adapted/), JSON.stringify(r.out.errors));
  r = check((p) => {
    write(p, 'UPSTREAM-SYNC.md', table('adapted'));
    write(p, 'docs/x.md', '# Something\n\nAdapted from example/project (MIT) — https://example.com/p @ 0123456789012345678901234567890123456789\n');
  });
  assert.ok(!has(r.out.errors, /listed as adapted/), JSON.stringify(r.out.errors));
  r = check((p) => {
    write(p, 'UPSTREAM-SYNC.md', table('verbatim'));
    write(p, 'docs/x.md', '# Something\n');
  });
  assert.ok(!has(r.out.errors, /listed as adapted/), JSON.stringify(r.out.errors));
});

/* ---------------- code-safety hardening ---------------- */

test('--write-manifest --sign-key signs the manifest, and the signature is kept out of the manifest', async () => {
  const { generateKeyPairSync, verify } = await import('node:crypto');
  const { manifestSignatureOk } = await import('../../system/scripts/update.mjs');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    write(p, 'system/release.json', '{"name":"alterbrain","version":"1.0.0","tag":"v1.0.0"}\n');
    write(p, 'keys/release.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }));
    const r = runScript('validate.mjs', ['--write-manifest', '--sign-key', p.path('keys', 'release.pem'), '--json'], p);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json().manifest.signed, 'system/manifest.sig');
    const sig = read(p, 'system/manifest.sig').trim();
    const bytes = Buffer.from(read(p, 'system/manifest.json'));
    assert.equal(verify(null, bytes, publicKey, Buffer.from(sig, 'base64')), true);
    const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    assert.equal(manifestSignatureOk(bytes, sig, raw), true, 'the updater accepts what the release tool signs');
    const listed = JSON.parse(read(p, 'system/manifest.json')).files.map((f) => f.path);
    assert.ok(!listed.includes('system/manifest.sig'), 'a manifest cannot list its own signature');
    // Run again: the signature file on disk does not change the manifest.
    const again = runScript('validate.mjs', ['--write-manifest', '--sign-key', p.path('keys', 'release.pem'), '--json'], p);
    assert.equal(again.status, 0);
    assert.equal(read(p, 'system/manifest.json'), bytes.toString('utf8'));
    // Usage errors
    assert.equal(runScript('validate.mjs', ['--sign-key', p.path('keys', 'release.pem')], p).status, 2);
    assert.equal(runScript('validate.mjs', ['--write-manifest', '--sign-key'], p).status, 2);
    assert.equal(runScript('validate.mjs', ['--write-manifest', '--sign-key', p.path('keys', 'missing.pem')], p).status, 1);
  } finally {
    p.cleanup();
  }
});

test('limits.json: a valid file passes, and a bad cap or pattern is an error (the rate guard fails closed on it)', () => {
  const good = JSON.stringify({ schema: 1, servers: { demo: { match: ['demo'], categories: { read: { tools: ['get_x'], daily_cap: 5, min_gap_seconds: 10 } }, warnings: { phrases: ['captcha'] } } } });
  const ok = check((p) => write(p, 'system/catalogue/limits.json', good));
  assert.equal(ok.status, 0, JSON.stringify(ok.out));
  assert.equal(ok.out.checked.limits_servers, 1);
  const bad = JSON.stringify({ schema: 1, servers: { demo: { categories: { read: { daily_cap: 'five', weekday_cap: ['funday'] } }, warnings: { weak: ['(unclosed'] } } } });
  const r = check((p) => write(p, 'system/catalogue/limits.json', bad));
  assert.equal(r.status, 1);
  assert.ok(has(r.out.errors, /limits\.json.*daily_cap must be a whole number/));
  assert.ok(has(r.out.errors, /limits\.json.*weekday_cap must be a list of days/));
  assert.ok(has(r.out.errors, /limits\.json.*warnings\.weak must be a list of valid patterns/));
  const broken = check((p) => write(p, 'system/catalogue/limits.json', '{ nope'));
  assert.equal(broken.status, 1);
  assert.ok(has(broken.out.errors, /limits\.json.*not valid JSON/));
});

// ------------------------------------------------------------- upgrade scripts (migrations)
const MIG = (name) => `system/scripts/migrations/${name}`;
const GOOD_MIG = '#!/usr/bin/env node\n// ab-migration: Moves a setting to its new place.\nconsole.log("Nothing to do.");\n';
/** One valid upgrade with its test, then `more(p)` for the case under test. */
const withMigration = (more) => (p) => {
  write(p, MIG('0001-first-change.mjs'), GOOD_MIG);
  write(p, 'tests/scripts/migrations/0001-first-change.test.mjs', '// test\n');
  if (more) more(p);
};

test('migrations: a well-formed upgrade with its test passes and is counted', () => {
  const { status, out } = check(withMigration());
  assert.equal(status, 0, JSON.stringify(out));
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
  assert.equal(out.checked.migrations, 1);
  assert.equal(check().out.checked.migrations, 0, 'no migrations folder: nothing to check');
});

test('migrations: the file name must be four digits, a dash and lower-case words', () => {
  for (const bad of ['001-short.mjs', '00001-long.mjs', '0002_underscore.mjs', '0002-Upper.mjs', '0002-two--dashes.mjs', '0002-.mjs', 'first.mjs', '0002 space.mjs']) {
    const { status, out } = check(withMigration((p) => {
      write(p, MIG(bad), GOOD_MIG);
      write(p, `tests/scripts/migrations/${bad.replace(/\.mjs$/, '')}.test.mjs`, '// test\n');
    }));
    assert.equal(status, 1, bad);
    assert.ok(has(out.errors, new RegExp(`${bad.replace(/[.\s]/g, '.')}: the file name must look like 0001-short-name\\.mjs`)), `${bad}: ${out.errors}`);
  }
});

test('migrations: a number used twice is an error that names both files', () => {
  const { status, out } = check(withMigration((p) => {
    write(p, MIG('0001-second-change.mjs'), GOOD_MIG);
    write(p, 'tests/scripts/migrations/0001-second-change.test.mjs', '// test\n');
  }));
  assert.equal(status, 1);
  assert.ok(has(out.errors, /the number 0001 is used by 0001-first-change\.mjs and 0001-second-change\.mjs\. Each upgrade needs its own number/), JSON.stringify(out.errors));
});

test('migrations: the "// ab-migration:" description must be in the first three lines', () => {
  for (const [body, ok] of [
    ['console.log("x");\n', false],
    ['#!/usr/bin/env node\n// ab-migration:\nconsole.log("x");\n', false],
    ['#!/usr/bin/env node\n// just a comment\nconsole.log("x");\n// ab-migration: Too late to count.\n', false],
    ['// ab-migration: On the first line.\nconsole.log("x");\n', true],
    ['#!/usr/bin/env node\r\n// ab-migration: Windows line endings.\r\nconsole.log("x");\r\n', true],
    ['#!/usr/bin/env node\n//\n// ab-migration: On the third line.\n', true],
  ]) {
    const r = check(withMigration((p) => write(p, MIG('0001-first-change.mjs'), body)));
    if (ok) assert.equal(r.status, 0, JSON.stringify(r.out.errors));
    else assert.ok(has(r.out.errors, /0001-first-change\.mjs: the first three lines must include a comment like "\/\/ ab-migration:/), JSON.stringify(r.out.errors));
  }
});

test('migrations: with a tests folder, every upgrade needs tests/scripts/migrations/<name>.test.mjs', () => {
  const missing = check((p) => {
    write(p, MIG('0001-first-change.mjs'), GOOD_MIG);
    write(p, 'tests/scripts/other.test.mjs', '// a tests folder exists\n');
  });
  assert.equal(missing.status, 1);
  assert.ok(has(missing.out.errors, /0001-first-change\.mjs: this upgrade has no test\. Add tests\/scripts\/migrations\/0001-first-change\.test\.mjs/), JSON.stringify(missing.out.errors));
  // a project without a tests folder (a person's own copy) has nothing to check
  const bare = check((p) => write(p, MIG('0001-first-change.mjs'), GOOD_MIG));
  assert.equal(bare.status, 0, JSON.stringify(bare.out.errors));
});

test('migrations: a file that would never run is a warning, a README is fine', () => {
  const { status, out } = check(withMigration((p) => {
    write(p, MIG('0002-script.js'), 'x');
    write(p, MIG('README.md'), '# Upgrades\n');
  }));
  assert.equal(status, 0);
  assert.ok(has(out.warnings, /0002-script\.js: only \.mjs files are run as upgrades/));
  assert.ok(!has(out.warnings, /README/));
});

// ------------------------------------------------------------- release notes (CHANGELOG)
// The release gate: every upgrade script is described under "### Upgrades", every framework file of the previous
// release that is gone is listed under "### Moved". The previous release is the manifest at the newest v* git tag.

const gitIn = (p, args) => {
  const res = spawnSync('git', ['-c', 'user.name=Alex Doe', '-c', 'user.email=alex@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd: p.dir, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: p.path('..', 'no-such-gitconfig') },
  });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
};
const OLD_FILES = ['system/packs/lenses/board.md', 'system/packs/lenses/grader.md', 'system/packs/templates/rubric.md', 'tests/old.test.mjs', '.github/workflows/ci.yml'];
const manifestOf = (version, paths) => JSON.stringify({ schema: 1, version, tag: `v${version}`, files: paths.map((path) => ({ path, class: 'text', sha256: 'x' })) });

/**
 * A project that was released as v0.1.1 (a git tag with its manifest) and has been developed on since: release.json
 * says 0.2.0, the old framework files are gone, and `more(p)` makes the case under test.
 */
function releaseCheck(more, args = []) {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    write(p, 'system/release.json', '{"name":"alterbrain","version":"0.1.1","tag":"v0.1.1"}\n');
    write(p, 'system/manifest.json', manifestOf('0.1.1', OLD_FILES));
    for (const f of OLD_FILES) write(p, f, 'old\n');
    gitIn(p, ['init', '-q', '-b', 'main']);
    gitIn(p, ['add', '-A']);
    gitIn(p, ['commit', '-q', '-m', 'release 0.1.1']);
    gitIn(p, ['tag', 'v0.1.1']);
    write(p, 'system/release.json', '{"name":"alterbrain","version":"0.2.0","tag":"v0.2.0"}\n');
    for (const f of OLD_FILES) rmSync(p.path(...f.split('/')), { force: true });
    if (more) more(p);
    const r = runScript('validate.mjs', ['--json', ...args], p);
    return { status: r.status, out: r.json() };
  } finally {
    p.cleanup();
  }
}
const LISTED_ALL_MOVED = '### Moved\n- `system/packs/lenses/board.md` is now `system/packs/mba/lenses/board.md`\n- `system/packs/lenses/grader.md` is now `system/packs/mba/lenses/grader.md`\n- `system/packs/templates/rubric.md` was removed\n';
const changelog = (...blocks) => (p) => write(p, 'CHANGELOG.md', `# Changelog\n\n## [Unreleased]\n\n${blocks.join('\n')}\n## [0.1.1] - 2026-10-07\n\n### Added\n- The first thing.\n`);

test('release notes: with the notes in place there is nothing to say', () => {
  const r = releaseCheck((p) => {
    withMigration()(p);
    changelog('### Upgrades\n- `0001-first-change`: Moves a setting to its new place.\n', LISTED_ALL_MOVED)(p);
  });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.errors, []);
  assert.deepEqual(r.out.warnings, []);
  assert.deepEqual(r.out.release_blockers, []);
});

test('release notes: an upgrade script nobody described is a warning while developing and an error for a release', () => {
  const setup = (p) => {
    withMigration()(p);
    changelog('### Added\n- Something new.\n', LISTED_ALL_MOVED)(p);
  };
  const dev = releaseCheck(setup);
  assert.equal(dev.status, 0, 'developing is not blocked');
  assert.ok(has(dev.out.warnings, /CHANGELOG\.md: the upgrade script 0001-first-change is not described under "### Upgrades"\. Add one plain line for each, naming it/), JSON.stringify(dev.out.warnings));
  assert.deepEqual(dev.out.release_blockers, []);

  const rel = releaseCheck(setup, ['--release']);
  assert.equal(rel.status, 1);
  assert.ok(has(rel.out.errors, /CHANGELOG\.md: the upgrade script 0001-first-change is not described under "### Upgrades"/), JSON.stringify(rel.out.errors));
  assert.equal(rel.out.release_blockers.length, 1);
  assert.deepEqual(rel.out.warnings, []);
});

test('release notes: a mention of the script in the wrong part of the changelog does not count', () => {
  const r = releaseCheck((p) => {
    withMigration()(p);
    changelog('### Added\n- `0001-first-change` was added.\n', LISTED_ALL_MOVED)(p);
  }, ['--release']);
  assert.equal(r.status, 1);
  assert.ok(has(r.out.errors, /0001-first-change is not described/));
});

test('release notes: a framework file of the last release that is gone must be listed under "### Moved"', () => {
  const none = releaseCheck(changelog('### Added\n- Something new.\n'), ['--release']);
  assert.equal(none.status, 1);
  assert.ok(has(none.out.errors, /CHANGELOG\.md: 3 framework files of v0\.1\.1 are gone but not listed under "### Moved" \(system\/packs\/lenses\/board\.md, system\/packs\/lenses\/grader\.md, system\/packs\/templates\/rubric\.md\)/), JSON.stringify(none.out.errors));
  assert.ok(!has(none.out.errors, /tests\/old|ci\.yml/), 'tests and CI files are nobody\'s links, so they need no line');

  const some = releaseCheck(changelog('### Moved\n- `system/packs/lenses/board.md` is now `system/packs/mba/lenses/board.md`\n'), ['--release']);
  assert.ok(has(some.out.errors, /2 framework files of v0\.1\.1 are gone/), JSON.stringify(some.out.errors));
  assert.ok(!has(some.out.errors, /board\.md/));

  const all = releaseCheck(changelog(LISTED_ALL_MOVED), ['--release']);
  assert.equal(all.status, 0, JSON.stringify(all.out));
});

test('release notes: a folder listed under "### Moved" covers what is inside it, and Windows slashes and capitals do not matter', () => {
  const folder = releaseCheck(changelog('### Moved\n- The `system/packs/lenses/` folder is now `system/packs/mba/lenses/`.\n- `system/packs/templates/rubric.md` was removed.\n'), ['--release']);
  assert.equal(folder.status, 0, JSON.stringify(folder.out));
  const windows = releaseCheck(changelog('### Moved\n- `System\\packs\\Lenses\\board.md`, `system/packs/lenses/grader.md` and `system/packs/templates/rubric.md` moved.\n'), ['--release']);
  assert.equal(windows.status, 0, JSON.stringify(windows.out));
  // "system/" alone is not a folder anyone would list: it must not cover everything
  const tooBroad = releaseCheck(changelog('### Moved\n- Most things under system/ moved.\n'), ['--release']);
  assert.equal(tooBroad.status, 1);
});

test('release notes: only the sections newer than the previous release count for "### Moved"', () => {
  const r = releaseCheck((p) => write(p, 'CHANGELOG.md', `# Changelog\n\n## [Unreleased]\n\n### Added\n- Something.\n\n## [0.1.1] - 2026-10-07\n\n${LISTED_ALL_MOVED}`), ['--release']);
  assert.equal(r.status, 1, 'a Moved list from a release that is already out does not cover this one');
  const newer = releaseCheck((p) => write(p, 'CHANGELOG.md', `# Changelog\n\n## [0.2.0] - 2026-10-20\n\n${LISTED_ALL_MOVED}\n## [0.1.1] - 2026-10-07\n\n### Added\n- Old.\n`), ['--release']);
  assert.equal(newer.status, 0, JSON.stringify(newer.out));
});

test('release notes: nothing is asked for when there is nothing to describe, or no CHANGELOG while developing', () => {
  // no upgrade scripts, nothing removed: even a missing CHANGELOG is fine
  const calm = releaseCheck((p) => {
    for (const f of OLD_FILES) write(p, f, 'old\n'); // nothing is gone
  }, ['--release']);
  assert.equal(calm.status, 0, JSON.stringify(calm.out));
  // things to describe but no CHANGELOG: silent while developing, an error for a release
  const dev = releaseCheck(withMigration());
  assert.deepEqual(dev.out.warnings, []);
  const rel = releaseCheck(withMigration(), ['--release']);
  assert.equal(rel.status, 1);
  assert.ok(has(rel.out.errors, /CHANGELOG\.md: the file is missing/), JSON.stringify(rel.out.errors));
});

test('release notes: a project without git history is not asked about moved files', () => {
  const r = check(withMigration((p) => write(p, 'CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n### Upgrades\n- `0001-first-change`: Moves a setting.\n')));
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.warnings, []);
});

test('release notes: signing is refused, and nothing is written, until the notes are complete', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('ed25519');
  const sign = (p) => ['--write-manifest', '--sign-key', p.path('keys', 'release.pem')];
  const setup = (p) => {
    write(p, 'keys/release.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }));
    changelog('### Added\n- Something new.\n')(p);
  };
  // run the signing step in a project with the gaps, and look at what it left behind
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    write(p, 'system/release.json', '{"name":"alterbrain","version":"0.2.0","tag":"v0.2.0"}\n');
    write(p, 'system/manifest.json', manifestOf('0.1.1', OLD_FILES));
    for (const f of OLD_FILES) write(p, f, 'old\n');
    gitIn(p, ['init', '-q', '-b', 'main']);
    gitIn(p, ['add', '-A']);
    gitIn(p, ['commit', '-q', '-m', 'release 0.1.1']);
    gitIn(p, ['tag', 'v0.1.1']);
    for (const f of OLD_FILES) rmSync(p.path(...f.split('/')), { force: true });
    setup(p);
    const before = read(p, 'system/manifest.json');
    const refused = runScript('validate.mjs', [...sign(p), '--json'], p);
    assert.equal(refused.status, 1);
    assert.equal(read(p, 'system/manifest.json'), before, 'the manifest was not rewritten');
    assert.throws(() => read(p, 'system/manifest.sig'), 'nothing was signed');
    assert.ok(refused.json().release_blockers.length >= 1);
    assert.equal(refused.json().manifest, undefined);
    const text = runScript('validate.mjs', sign(p), p);
    assert.match(text.stdout, /Nothing was written or signed: the release notes in CHANGELOG\.md are incomplete/);

    // Complete the notes: now it signs.
    changelog(LISTED_ALL_MOVED)(p);
    const done = runScript('validate.mjs', [...sign(p), '--json'], p);
    assert.equal(done.status, 0, done.stdout + done.stderr);
    assert.equal(done.json().manifest.signed, 'system/manifest.sig');

    // Writing the manifest alone (development) is never blocked by the notes.
    changelog('### Added\n- Nothing about moves.\n')(p);
    rmSync(p.path('system', 'manifest.sig'), { force: true });
    const dev = runScript('validate.mjs', ['--write-manifest', '--json'], p);
    assert.equal(dev.status, 0, dev.stdout + dev.stderr);
    assert.ok(dev.json().manifest);
  } finally {
    p.cleanup();
  }
});

/** Like check(), with extra command-line arguments. */
function checkArgs(args, mutate) {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    if (mutate) mutate(p);
    const r = runScript('validate.mjs', ['--json', ...args], p);
    return { status: r.status, out: r.json() };
  } finally {
    p.cleanup();
  }
}

test('release documents: an ADR that a rule or script cites must exist', () => {
  const setup = (cited) => (p) => {
    write(p, 'docs/adr/0001-first-decision.md', '# ADR 0001\n');
    write(p, '.claude/rules/framework-dev.md', `The policy is binding (ADR ${cited}).\n`);
    write(p, 'system/lib/migrate.mjs', `// policy: see ADR ${cited}\n`);
  };
  const fine = checkArgs(['--release'], setup('0001'));
  assert.equal(fine.status, 0, JSON.stringify(fine.out));
  assert.deepEqual(fine.out.warnings, []);

  const dev = checkArgs([], setup('0024'));
  assert.equal(dev.status, 0, 'a dangling citation is only a warning while developing');
  assert.ok(has(dev.out.warnings, /docs\/adr: ADR 0024 is cited in \.claude\/rules\/framework-dev\.md, system\/lib\/migrate\.mjs but there is no docs\/adr\/0024-\*\.md/), JSON.stringify(dev.out.warnings));

  const rel = checkArgs(['--release'], setup('0024'));
  assert.equal(rel.status, 1);
  assert.ok(has(rel.out.errors, /ADR 0024 is cited in/));
  assert.equal(rel.out.release_blockers.length, 1);
  // no docs/adr folder at all (a person's own copy): nothing to check
  const bare = checkArgs(['--release'], (p) => write(p, '.claude/rules/framework-dev.md', 'See ADR 0099.\n'));
  assert.equal(bare.status, 0, JSON.stringify(bare.out));
});

test('release documents: with upgrade scripts the SPEC must describe the mechanism', () => {
  const setup = (spec) => withMigration((p) => {
    write(p, 'CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n### Upgrades\n- `0001-first-change`: Moves a setting to its new place.\n');
    if (spec !== null) write(p, 'docs/SPEC.md', spec);
  });
  const missing = checkArgs(['--release'], setup('# Spec\n\nNothing about upgrades.\n'));
  assert.equal(missing.status, 1);
  assert.ok(has(missing.out.errors, /docs\/SPEC\.md: the SPEC \(the binding contract\) does not mention state\/migrations\.json/), JSON.stringify(missing.out.errors));
  const dev = checkArgs([], setup('# Spec\n'));
  assert.equal(dev.status, 0);
  assert.ok(has(dev.out.warnings, /docs\/SPEC\.md: the SPEC/));
  const ok = checkArgs(['--release'], setup('# Spec\n\nUpgrades are recorded in `state/migrations.json`.\n'));
  assert.equal(ok.status, 0, JSON.stringify(ok.out));
  // no SPEC file (a person's own copy), or no upgrade scripts: nothing to check
  assert.equal(checkArgs(['--release'], setup(null)).status, 0);
  assert.equal(checkArgs(['--release'], (p) => write(p, 'docs/SPEC.md', '# Spec\n')).status, 0);
});

test('release notes: changelogSections reads sections and parts', async () => {
  const { changelogSections } = await import('../../system/scripts/validate.mjs');
  const sections = changelogSections('# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Upgrades\n- one\n\n### Moved\n- two\n\n## [0.1.1] - 2026-10-07\n\n### Added\n- three\n\n## 0.1.0\n\n### Moved\n- four\r\n');
  assert.deepEqual(sections.map((s) => s.version), ['Unreleased', '0.1.1', '0.1.0']);
  assert.match(sections[0].parts.Upgrades, /- one/);
  assert.match(sections[0].parts.Moved, /- two/);
  assert.equal(sections[1].parts.Moved, undefined);
  assert.match(sections[2].parts.Moved, /- four/);
});
