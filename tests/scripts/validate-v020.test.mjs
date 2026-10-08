// validate.mjs, release 0.2.0 additions: guided upgrades (NNNN-*.md), the named helper of each routing class, and the
// helper lint (a skill, pack or deliverable text that asks a generic subagent for a model or effort names no helper).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, copyFixture, makeProject, read, runScript, write } from '../fixtures/scripts/helpers.mjs';

function check(mutate) {
  const p = makeProject();
  try {
    copyFixture('validate/good', p);
    if (mutate) mutate(p);
    const r = runScript('validate.mjs', ['--json'], p);
    return { status: r.status, out: r.json() };
  } finally {
    p.cleanup();
  }
}
const has = (list, re) => list.some((m) => re.test(m));

// ------------------------------------------------------------- guided upgrades
const GOOD_GUIDED = readFileSync(join(FIXTURES, 'validate', 'guided', '0001-first-question.md'), 'utf8');
const GUIDED = (name) => `system/scripts/migrations/${name}`;
const GOOD_MJS = '#!/usr/bin/env node\n// ab-migration: Moves a setting to its new place.\nconsole.log("Nothing to do.");\n';

test('guided: a well-formed upgrade passes, is counted and needs no test file', () => {
  const { status, out } = check((p) => {
    write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED);
    write(p, 'tests/scripts/other.test.mjs', '// a tests folder exists\n');
  });
  assert.equal(status, 0, JSON.stringify(out));
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
  assert.equal(out.checked.migrations, 1);
});

test('guided: front matter must carry type, id (= file name), a one-sentence summary and since', () => {
  const cases = [
    ['type: "guided-migration"', 'type: "migration"', /type must be "guided-migration"/],
    ['id: "0001-first-question"', 'id: "0001-other"', /id must be "0001-first-question"/],
    ['summary: "If you keep a notes folder called Old, offers to tidy it into your areas folder."', 'summary: "No full stop"', /summary must be one sentence that ends with a full stop/],
    ['summary: "If you keep a notes folder called Old, offers to tidy it into your areas folder."', 'summary: "First sentence. And a second one."', /summary must be one sentence/],
    ['summary: "If you keep a notes folder called Old, offers to tidy it into your areas folder."', 'summary: ""', /summary is missing/],
    ['since: "0.2.0"', 'since: "soon"', /since must be the release number/],
  ];
  for (const [from, to, re] of cases) {
    const { status, out } = check((p) => write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED.replace(from, to)));
    assert.equal(status, 1, to);
    assert.ok(has(out.errors, re), `${to}: ${out.errors}`);
  }
  const bare = check((p) => write(p, GUIDED('0001-first-question.md'), '# No front matter\n'));
  assert.ok(has(bare.out.errors, /must start with front matter/));
});

test('guided: the six sections must all be there, in order', () => {
  let r = check((p) => write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED.replace('## Never', '## Not ever')));
  assert.ok(has(r.out.errors, /missing section "## Never"/), JSON.stringify(r.out.errors));
  r = check((p) => write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED.replace('## Evaluate', '## Zed').replace('## Propose', '## Evaluate').replace('## Zed', '## Propose')));
  assert.ok(has(r.out.errors, /section "## Propose" is out of order/), JSON.stringify(r.out.errors));
  r = check((p) => write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED.replace(/## If skipped[\s\S]*?(?=## Never)/, '')));
  assert.ok(has(r.out.errors, /missing section "## If skipped"/));
});

test('guided: the file name rule, and one number is one file of either kind', () => {
  for (const bad of ['001-short.md', '0002-Upper.md', '0002_under.md', 'first.md']) {
    const { status, out } = check((p) => write(p, GUIDED(bad), GOOD_GUIDED));
    assert.equal(status, 1, bad);
    assert.ok(has(out.errors, new RegExp(`${bad.replace(/[.\s]/g, '.')}: the file name must look like 0001-short-name\\.md`)), `${bad}: ${out.errors}`);
  }
  const dup = check((p) => {
    write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED);
    write(p, GUIDED('0001-first-change.mjs'), GOOD_MJS);
    write(p, 'tests/scripts/migrations/0001-first-change.test.mjs', '// test\n');
  });
  assert.equal(dup.status, 1);
  assert.ok(has(dup.out.errors, /the number 0001 is used by 0001-first-change\.mjs and 0001-first-question\.md/), JSON.stringify(dup.out.errors));
  const readme = check((p) => write(p, GUIDED('README.md'), '# Upgrades\n'));
  assert.equal(readme.status, 0, JSON.stringify(readme.out));
  assert.equal(readme.out.checked.migrations, 0);
});

test('guided: a release must describe it under "### Upgrades" like a script', () => {
  const run = (changelog, args) => {
    const p = makeProject();
    try {
      copyFixture('validate/good', p);
      write(p, GUIDED('0001-first-question.md'), GOOD_GUIDED);
      write(p, 'CHANGELOG.md', changelog);
      return runScript('validate.mjs', ['--json', ...args], p).json();
    } finally {
      p.cleanup();
    }
  };
  const missing = run('# Changelog\n\n## [Unreleased]\n\n### Added\n- Something.\n', []);
  assert.ok(has(missing.warnings, /CHANGELOG\.md: the upgrade script 0001-first-question is not described under "### Upgrades"/), JSON.stringify(missing.warnings));
  const described = run('# Changelog\n\n## [Unreleased]\n\n### Upgrades\n- `0001-first-question` asks first.\n', []);
  assert.ok(!has(described.warnings, /0001-first-question/), JSON.stringify(described.warnings));
});

// ------------------------------------------------------------- routing: the named helper of each class
test('routing: each class helper must exist as an agent with the same model and effort', () => {
  const rel = 'system/catalogue/routing.json';
  const edit = (fn) => (p) => {
    const j = JSON.parse(read(p, rel));
    fn(j);
    write(p, rel, JSON.stringify(j));
  };
  assert.equal(check().status, 0);
  let r = check(edit((j) => (j.classes.triage.helper = 'helper-nobody')));
  assert.ok(has(r.out.errors, /class "triage": helper "helper-nobody" has no agent file/), JSON.stringify(r.out.errors));
  r = check(edit((j) => (j.classes.review.effort = 'medium')));
  assert.ok(has(r.out.errors, /class "review": helper "helper-review" runs on sonnet\/high but the class says sonnet\/medium/), JSON.stringify(r.out.errors));
  r = check(edit((j) => (j.classes.judgement.model = 'sonnet')));
  assert.ok(has(r.out.errors, /class "judgement": helper "helper-judgement" runs on opus\/high/));
  r = check(edit((j) => (j.classes.work.helper = null)));
  assert.ok(has(r.out.errors, /class "work": helper must name an agent/));
  r = check(edit((j) => (j.classes.work.helper = 'Not A Name')));
  assert.ok(has(r.out.errors, /class "work": helper must be an agent name/));
  // an older routing.json without helper keys is still read
  r = check(edit((j) => Object.values(j.classes).forEach((c) => delete c.helper)));
  assert.equal(r.status, 0, JSON.stringify(r.out.errors));
});

test('agents: the lens agent stays valid (read-only tools, a Never list)', () => {
  const r = check((p) => write(p, '.claude/agents/lens.md', '---\nname: lens\ndescription: Blind critique of one document. Kept as an alias until 0.4.0.\nmodel: opus\neffort: high\ntools: Read, Grep, Glob\n---\n\nYou read one document and critique it.\n\nNever edit files.\n'));
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.warnings, []);
});

// ------------------------------------------------------------- helper lint
const SKILL_REL = '.claude/skills/demo/SKILL.md';
const withLine = (rel, line) => (p) => write(p, rel, `${read(p, rel)}\n${line}\n`);
const MSG = /asks for a subagent with a model or effort but names no helper/;

test('helper lint: a skill asking for "a haiku subagent" is an error that names the line', () => {
  for (const line of [
    'Give each file to a haiku / low subagent.',
    '- Run a general-purpose agent on sonnet for the draft.',
    'Spawn helpers with opus and high effort.',
    'A sub-agent at low effort scores each advert.',
  ]) {
    const { status, out } = check(withLine(SKILL_REL, line));
    assert.equal(status, 1, line);
    assert.ok(has(out.errors, new RegExp(`demo/SKILL\\.md: line \\d+ ${MSG.source}`)), `${line}: ${out.errors}`);
  }
  const lines = readFileSync(join(FIXTURES, 'validate', 'good', 'claude', 'skills', 'demo', 'SKILL.md'), 'utf8').split('\n').length;
  const r = check(withLine(SKILL_REL, 'A haiku subagent does it.'));
  assert.ok(has(r.out.errors, new RegExp(`line ${lines + 1} `)), `${r.out.errors}`);
});

test('helper lint: naming a helper (or a named agent) in the same paragraph or item passes', () => {
  for (const line of [
    'Give each file to a `helper-triage` subagent.',
    'Run the helper-review agent; it uses sonnet and high effort.',
    '- A subagent (the researcher) on sonnet reads the page.',
    'The lens subagent (opus) reads the draft.',
    'The ghostwriter helper drafts it on sonnet.',
  ]) {
    const r = check(withLine(SKILL_REL, line));
    assert.equal(r.status, 0, `${line}: ${JSON.stringify(r.out.errors)}`);
  }
});

test('helper lint: only the same paragraph or list item counts, and code blocks and front matter are ignored', () => {
  const ok = [
    'Ask a subagent to read the files.\n\nThe main session runs on sonnet.',
    '- Use a helper for the list.\n- Main session: sonnet, medium effort.',
    '```\nspawn a haiku subagent\n```',
    'The main thread runs sonnet / medium.',
  ];
  for (const text of ok) {
    const r = check(withLine(SKILL_REL, text));
    assert.equal(r.status, 0, `${text}: ${JSON.stringify(r.out.errors)}`);
  }
  // a model in the front matter beside a description that says "helper" is configuration, not an instruction
  const fm = check((p) => swap(p, SKILL_REL, 'description: Shows a tiny example skill so the validator has something good to check.', 'description: Runs a helper for the example, on the cheap side.'));
  assert.equal(fm.status, 0, JSON.stringify(fm.out.errors));
});

const swap = (p, rel, from, to) => {
  const text = read(p, rel);
  assert.ok(text.includes(from), `fixture should contain ${from}`);
  write(p, rel, text.replace(from, to));
};

test('helper lint: reaches reference files, packs and deliverable texts; vendored skills are left alone', () => {
  const line = 'Hand the batch to a haiku subagent.';
  for (const rel of ['.claude/skills/demo/workflows/x.md', 'system/packs/mba/notes.md', 'system/deliverables/rehearsal.md']) {
    const r = check((p) => write(p, rel, `# Text\n\n${line}\n`));
    assert.equal(r.status, 1, rel);
    assert.ok(has(r.out.errors, new RegExp(`${rel.replace(/[./]/g, '.')}: line 3 `)), `${rel}: ${r.out.errors}`);
  }
  const vendored = check((p) => write(p, '.claude/skills/defuddle/SKILL.md', `---\nname: defuddle\ndescription: Vendored.\nmodel: sonnet\neffort: low\n---\n\n${line}\n`));
  assert.ok(!has(vendored.out.errors, MSG), JSON.stringify(vendored.out.errors));
});

test('helper lint: a person\'s own my-* skill only gets a warning', () => {
  const body = (line) => `---\nname: my-thing\ndescription: A skill the person built.\nmodel: sonnet\neffort: low\n---\n\n# My thing\n\n## When to use\n\nx\n\n## Before you start\n\nx\n\n## Steps\n\n${line}\n\n## Outputs\n\nx\n\n## Safety\n\nx\n`;
  const r = check((p) => write(p, '.claude/skills/my-thing/SKILL.md', body('Ask a haiku subagent to sort the list.')));
  assert.equal(r.status, 0, JSON.stringify(r.out.errors));
  assert.ok(has(r.out.warnings, new RegExp(`my-thing/SKILL\\.md: line \\d+ ${MSG.source}`)), JSON.stringify(r.out.warnings));
  const named = check((p) => write(p, '.claude/skills/my-thing/SKILL.md', body('Ask helper-triage to sort the list.')));
  assert.deepEqual(named.out.warnings, []);
});
