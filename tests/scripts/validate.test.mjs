import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
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
