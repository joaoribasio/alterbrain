// The core critique library: lens briefs, named helpers, procedure files and the deprecated lens agent.
// Text checks on the repository's own files; no temp files needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlatYaml, splitFrontmatter } from '../../system/lib/frontmatter.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const LENS_DIR = '.claude/skills/critique/references/lenses';
const HELPERS = ['helper-triage', 'helper-draft', 'helper-review', 'helper-judgement'];
const EXPECTED_LENSES = [
  'board', 'consolidation', 'devils-advocate', 'grader', 'premortem', 'specialists',
  'fact-check', 'structure', 'signature', 'production', 'model-audit', 'recruiter',
];
const DELIVERABLES = ['report', 'essay', 'memo', 'proposal', 'deck', 'workbook', 'cv', 'cover-letter', 'one-pager', 'any'];

const lensFiles = readdirSync(join(REPO, LENS_DIR)).filter((f) => f.endsWith('.md'));
const lenses = Object.fromEntries(lensFiles.map((f) => [f.replace(/\.md$/, ''), splitFrontmatter(read(`${LENS_DIR}/${f}`))]));
const agent = (name) => splitFrontmatter(read(`.claude/agents/${name}.md`)).data;

test('the twelve lenses exist in the core library and the old folder is gone', () => {
  assert.deepEqual(Object.keys(lenses).sort(), [...EXPECTED_LENSES].sort());
  assert.equal(existsSync(join(REPO, '.claude/skills/assignment/references/lenses')), false);
});

test('every lens brief has the required frontmatter', () => {
  for (const [id, { data }] of Object.entries(lenses)) {
    assert.equal(data.type, 'lens', id);
    assert.equal(data.name, id, `${id}: name equals file name`);
    assert.ok(HELPERS.includes(data.helper) && data.helper !== 'helper-triage' && data.helper !== 'helper-draft', `${id}: helper is helper-review or helper-judgement`);
    assert.equal(typeof data.model, 'string', id);
    assert.equal(typeof data.effort, 'string', id);
    assert.ok(Number.isInteger(data.word_cap) && data.word_cap > 0, `${id}: word_cap`);
    assert.ok(Array.isArray(data.panels) && data.panels.length > 0, `${id}: panels`);
    assert.ok(Array.isArray(data.deliverables) && data.deliverables.length > 0, `${id}: deliverables`);
    for (const d of data.deliverables) assert.ok(DELIVERABLES.includes(d), `${id}: unknown deliverable ${d}`);
    assert.ok(['none', 'rubric', 'workbook', 'voice-profile'].includes(data.needs), `${id}: needs ${data.needs}`);
  }
});

test('each helper exists and every lens model and effort equal its helper', () => {
  for (const h of HELPERS) {
    const a = agent(h);
    assert.equal(a.name, h);
    assert.ok(a.description && a.model && a.effort && a.tools, `${h}: frontmatter`);
  }
  for (const [id, { data }] of Object.entries(lenses)) {
    const a = agent(data.helper);
    assert.equal(data.model, a.model, `${id}: model`);
    assert.equal(data.effort, a.effort, `${id}: effort`);
  }
  assert.equal(lenses['devils-advocate'].data.helper, 'helper-judgement');
  assert.equal(lenses.consolidation.data.helper, 'helper-judgement');
  for (const id of EXPECTED_LENSES.filter((x) => !['devils-advocate', 'consolidation'].includes(x))) {
    assert.equal(lenses[id].data.helper, 'helper-review', id);
  }
});

test('helper tools follow least privilege', () => {
  const tools = (n) => String(agent(n).tools).split(',').map((s) => s.trim()).sort();
  assert.deepEqual(tools('helper-triage'), ['Glob', 'Grep', 'Read']);
  assert.deepEqual(tools('helper-review'), ['Glob', 'Grep', 'Read']);
  assert.deepEqual(tools('helper-draft'), ['Edit', 'Glob', 'Grep', 'Read', 'Write']);
  assert.deepEqual(tools('helper-judgement'), ['Glob', 'Grep', 'Read', 'Write']);
  assert.deepEqual([agent('helper-triage').model, agent('helper-triage').effort], ['haiku', 'low']);
  assert.deepEqual([agent('helper-draft').model, agent('helper-draft').effort], ['sonnet', 'medium']);
  assert.deepEqual([agent('helper-review').model, agent('helper-review').effort], ['sonnet', 'high']);
  assert.deepEqual([agent('helper-judgement').model, agent('helper-judgement').effort], ['opus', 'high']);
});

test('routing.json names each class helper and the helper matches the class', () => {
  const routing = JSON.parse(read('system/catalogue/routing.json'));
  assert.equal(routing.classes.deterministic.helper, null);
  const want = { triage: 'helper-triage', work: 'helper-draft', review: 'helper-review', judgement: 'helper-judgement' };
  for (const [cls, helper] of Object.entries(want)) {
    assert.equal(routing.classes[cls].helper, helper, cls);
    const a = agent(helper);
    assert.equal(a.model, routing.classes[cls].model, `${cls}: model`);
    assert.equal(a.effort, routing.classes[cls].effort, `${cls}: effort`);
  }
  assert.ok(routing.reviewed);
});

test('panels contain only full and quick; no brief, procedure or template says lite (lens-choice.md names it once as the read-as-quick fallback)', () => {
  for (const [id, { data }] of Object.entries(lenses)) {
    for (const p of data.panels) assert.ok(['full', 'quick'].includes(p), `${id}: panel ${p}`);
  }
  const shipped = [
    ...lensFiles.map((f) => `${LENS_DIR}/${f}`),
    '.claude/skills/critique/SKILL.md',
    '.claude/skills/critique/references/panel.md',
    '.claude/skills/critique/references/protocol.md',
    'system/packs/mba/critique-presets.md',
    'system/templates/notes/critique.md',
  ];
  for (const f of shipped) assert.doesNotMatch(read(f), /\blite\b/i, `${f} still says lite`);
});

test('lens-choice.md names only existing lenses, and quick panels only use lenses that allow quick', () => {
  const src = read('.claude/skills/critique/references/lens-choice.md');
  const rows = src.split('\n').filter((l) => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l)).slice(1);
  assert.ok(rows.length >= 8, 'a row per deliverable type');
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1);
    for (const [i, cell] of cells.entries()) {
      for (const m of cell.matchAll(/`([^`]+)`/g)) {
        assert.ok(lenses[m[1]], `unknown lens ${m[1]} in: ${row.slice(0, 60)}`);
        if (i === 1) assert.ok(lenses[m[1]].data.panels.includes('quick'), `${m[1]} is not allowed in a quick panel`);
        if (i === 1 || i === 2) assert.notEqual(m[1], 'consolidation', 'consolidation is not a chosen lens');
      }
    }
    const quick = [...cells[1].matchAll(/`([^`]+)`/g)].length;
    assert.ok(quick >= 2 && quick <= 3, `quick panel size 2 to 3: ${row.slice(0, 60)}`);
  }
  // the rules name the conditional lenses
  assert.match(src, /`grader` only when a rubric exists/);
  assert.match(src, /`recruiter` only for a CV or a cover letter/);
  assert.match(src, /`model-audit` only for a workbook/);
});

test('panel.md and protocol.md exist and the critique skill references them', () => {
  for (const f of ['panel.md', 'protocol.md', 'lens-choice.md']) {
    assert.ok(existsSync(join(REPO, '.claude/skills/critique/references', f)), f);
  }
  const skill = read('.claude/skills/critique/SKILL.md');
  assert.match(skill, /references\/panel\.md/);
  assert.match(skill, /protocol\.md/);
  assert.match(skill, /lens-choice\.md/);
  const fm = parseFlatYaml(splitFrontmatter(skill).raw);
  assert.equal(fm.name, 'critique');
  assert.equal(fm.model, 'sonnet');
  assert.equal(fm.effort, 'medium');
  assert.equal(fm['argument-hint'], '[file or folder] [quick|full]');
  assert.ok(skill.split('\n').length <= 250, 'SKILL.md is at most 250 lines');
  for (const h of ['## When to use', '## Before you start', '## Steps', '## Outputs', '## Safety']) {
    assert.ok(skill.includes(h), h);
  }
  const panel = read('.claude/skills/critique/references/panel.md');
  for (const needle of ['helper-review', 'helper-judgement', 'Storage folder', 'Consolidation target', 'Grader or stop rule', 'Round card path', 'Panel list']) {
    assert.ok(panel.includes(needle), `panel.md: ${needle}`);
  }
  assert.match(panel, /noticeably more of your plan/);
});

test('every lens carries the label rule and every brief and the skill use named helpers only', () => {
  for (const [id, { body }] of Object.entries(lenses)) {
    assert.match(body, /Labels like \[Unverified\] are for your (report|critique) only; never propose them as text for the deliverable; propose plain wording \(we assume, in our reading\)\./, id);
  }
  for (const f of ['.claude/skills/critique/SKILL.md', '.claude/skills/critique/references/panel.md']) {
    assert.doesNotMatch(read(f), /general-purpose subagent/i, f);
  }
});

test('the lens agent stays as the documented fallback: read-only, with the deprecation line', () => {
  const src = read('.claude/agents/lens.md');
  const { data, body } = splitFrontmatter(src);
  assert.equal(data.name, 'lens');
  assert.equal(String(data.tools).split(',').map((s) => s.trim()).sort().join(','), 'Glob,Grep,Read');
  assert.match(body, /^\s*# Lens\n\nKept for older skills that call it\. Alterbrain's own skills use helper-review and helper-judgement with \.claude\/skills\/critique\/references\/protocol\.md; this agent will be removed no earlier than 0\.4\.0\./);
  assert.match(body, /\.claude\/skills\/critique\/references\/lenses\/<lens>\.md/);
  assert.doesNotMatch(body, /assignment\/references\/lenses/);
});

test('the model-routing rules and the jobs skill use the named helpers', () => {
  const rules = read('.claude/rules/model-routing.md');
  assert.match(rules, /\| Helper \|/);
  assert.match(rules, /Delegate through a named helper/);
  assert.match(rules, /never reported done on a helper's word/i);
  assert.match(rules, /main session does the pass and says so/);
  for (const f of ['.claude/skills/jobs/SKILL.md', '.claude/skills/jobs/workflows/scan.md', '.claude/skills/jobs/workflows/apply.md']) {
    const s = read(f);
    assert.doesNotMatch(s, /\bhaiku\b/i, `${f} still names a model`);
    assert.doesNotMatch(s, /`lens` agent/, `${f} still calls the lens agent`);
  }
  assert.match(read('.claude/skills/jobs/workflows/scan.md'), /helper-triage/);
  assert.match(read('.claude/skills/jobs/workflows/apply.md'), /system\/deliverables\/delivery-gate\.md/);
  assert.match(read('.claude/skills/jobs/SKILL.md'), /recruiter, signature/);
});

test('apply.md scans source files, never PDFs, and a critique sends the flow back through the fact check', () => {
  const s = read('.claude/skills/jobs/workflows/apply.md');
  assert.match(s, /Scan the sources, not the PDFs/);
  assert.match(s, /cv-data-<slug>\.txt/);
  assert.doesNotMatch(s, /deliver-check\.mjs <CV pdf>/);
  assert.match(s, /Anything a critique changes goes back through step 6/);
  assert.match(s, /working render, not the final version/);
  assert.match(read('.claude/skills/critique/SKILL.md'), /back to its no-fabrication check/);
});

test('the .txt copy of cv-data.yml that apply.md scans does catch a label (release-scan skips .yml itself)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-cv-'));
  try {
    const body = 'name: "A"\nlanguages:\n  - "Dutch [FACT NEEDED: level]"\n';
    writeFileSync(join(dir, 'cv-data.yml'), body);
    writeFileSync(join(dir, 'cv-data-x.txt'), body);
    const scan = (f) => spawnSync(process.execPath, [join(REPO, 'system/scripts/release-scan.mjs'), join(dir, f)], { encoding: 'utf8' });
    assert.equal(scan('cv-data-x.txt').status, 1);
    const yml = scan('cv-data.yml');
    assert.match(yml.stdout + yml.stderr, /NOT CHECKED/, 'a .yml file is reported as not checked, which is why the text copy is needed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recruiter, fact-check and signature briefs never propose a non-public fact', () => {
  for (const id of ['recruiter', 'fact-check', 'signature']) {
    const src = read(`${LENS_DIR}/${id}.md`);
    assert.match(src, /Visibility is not `public`/, id);
    assert.match(src, /private fact, needs the author's OK/, id);
  }
});

test('reference files reach the reviewers: card block, protocol and helper wording agree', () => {
  assert.match(read('.claude/skills/critique/references/panel.md'), /## Reference files/);
  assert.match(read('.claude/skills/critique/references/protocol.md'), /paths your lens brief names/);
  assert.match(read('.claude/agents/helper-review.md'), /house files your lens brief names/);
});

test('panel.md: storage rules for assignments, outside-vault and Office files; quoted paths; mapped kinds; no shell redirect', () => {
  const p = read('.claude/skills/critique/references/panel.md');
  assert.match(p, /Never inside an assignment folder/);
  assert.match(p, /Files outside the vault/);
  assert.match(p, /never edited in place/);
  assert.match(p, /--for "<deliverable source>"/);
  assert.match(p, /a proposal uses `report`, a cover letter uses `letter`/);
  assert.doesNotMatch(p, /--json > /);
  const skill = read('.claude/skills/critique/SKILL.md');
  assert.match(skill, /assignment\.md.*\/assignment critique/s);
  assert.match(skill, /proposal: report; cover letter: letter/);
});

test('lens-choice.md keeps the lite to quick fallback sentence', () => {
  assert.match(read('.claude/skills/critique/references/lens-choice.md'), /A user's own copy that says `lite` is read as `quick`\./);
});

// Needs CHANGELOG.md "Moved" lines to be updated by its owner (they still name the retired assignment/references/lenses path).
test('every "is now" path in the CHANGELOG Moved list resolves to a shipped file', () => {
  const src = read('CHANGELOG.md');
  const moved = src.slice(src.indexOf('### Moved'), src.indexOf('### Upgrades'));
  for (const m of moved.matchAll(/is now `([^`]+)`/g)) assert.ok(existsSync(join(REPO, m[1])), m[1]);
});
