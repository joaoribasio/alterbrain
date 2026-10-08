// Tests for the template resolver (system/lib/templates.mjs) and system/scripts/template.mjs.
// Run: node --test tests/scripts/templates.test.mjs
// Synthetic fixtures only (tests/fixtures/scripts/templates/project).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTemplate, defaultTone, listTemplates, resolveTemplate, templateWarnings } from '../../system/lib/templates.mjs';
import { missingLayouts, QUARTO_PPTX_LAYOUTS } from '../../system/scripts/template.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const FIXTURE = join(REPO, 'tests', 'fixtures', 'scripts', 'templates', 'project');
const PROJECT_REL = 'vault/10_projects/2026 Strategy Report';
const PROG = 'vault/20_areas/programmes/MBA – Test School.md';
const COURSE = 'vault/20_areas/courses/strategy/course.md';
const ASSIGNMENT = `${PROJECT_REL}/assignment.md`;
const DECK = `${PROJECT_REL}/deck.qmd`;

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'ab-templates-'));
  cpSync(FIXTURE, dir, { recursive: true });
  mkdirSync(join(dir, 'system'), { recursive: true }); // projectRoot() looks for it
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text, 'utf8'); };
  const read = (rel) => readFileSync(join(dir, rel), 'utf8');
  /** Set one front matter line (adds it before the closing dashes if absent). */
  const setKey = (rel, key, value) => {
    let t = read(rel);
    const re = new RegExp(`^${key}:.*$`, 'm');
    t = re.test(t) ? t.replace(re, `${key}: ${value}`) : t.replace(/\n---\n/, `\n${key}: ${value}\n---\n`);
    put(rel, t);
  };
  return { dir, put, read, setKey, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const slugOf = (r) => r.template && r.template.slug;
const resolveDeck = (p, source = DECK, kind = 'deck') => resolveTemplate({ kind, source, root: p.dir });

// ------------------------------------------------------------------ each level wins over the less specific ones

test('programme level: the programme template is used when nothing is more specific', () => {
  const p = project();
  try {
    const r = resolveDeck(p);
    assert.equal(slugOf(r), 'deck-programme');
    assert.equal(r.template.level, 'programme');
    assert.equal(r.template.source, 'custom');
  } finally { p.cleanup(); }
});

test('config default is used when no note names a template', () => {
  const p = project();
  try {
    p.setKey(PROG, 'templates', '[]');
    p.put('config/brain.json', JSON.stringify({ schema: 1, learner: { kind: 'mba' }, templates: { defaults: { deck: 'deck-default' } } }));
    const r = resolveDeck(p);
    assert.equal(slugOf(r), 'deck-default');
    assert.equal(r.template.level, 'config');
  } finally { p.cleanup(); }
});

test('each more specific level beats the ones below it', () => {
  const p = project();
  try {
    p.put('config/brain.json', JSON.stringify({ schema: 1, templates: { defaults: { deck: 'deck-default' } } }));
    assert.equal(resolveDeck(p).template.level, 'programme');
    p.setKey(COURSE, 'templates', '[deck-course]');
    let r = resolveDeck(p);
    assert.deepEqual([slugOf(r), r.template.level], ['deck-course', 'course']);
    p.setKey(ASSIGNMENT, 'templates', '[deck-project]');
    r = resolveDeck(p);
    assert.deepEqual([slugOf(r), r.template.level], ['deck-project', 'project']);
    p.setKey(DECK, 'template', '"deck-deliverable"');
    r = resolveDeck(p);
    assert.deepEqual([slugOf(r), r.template.level], ['deck-deliverable', 'deliverable']);
  } finally { p.cleanup(); }
});

test('a template of another kind is not a candidate', () => {
  const p = project();
  try {
    p.setKey(COURSE, 'templates', '[report-plain]');
    const r = resolveDeck(p);
    assert.equal(slugOf(r), 'deck-programme'); // report-plain is ignored for a deck
    const rep = resolveDeck(p, `${PROJECT_REL}/report.qmd`, 'report');
    assert.deepEqual([slugOf(rep), rep.template.level], ['report-plain', 'course']);
  } finally { p.cleanup(); }
});

test('an assignment note itself resolves at project level and the course is found from it', () => {
  const p = project();
  try {
    p.setKey(ASSIGNMENT, 'templates', '[deck-project]');
    const r = resolveDeck(p, ASSIGNMENT);
    assert.equal(r.template.level, 'project');
  } finally { p.cleanup(); }
});

// ------------------------------------------------------------------ ties

test('two templates of the kind at the same level are a tie', () => {
  const p = project();
  try {
    p.setKey(COURSE, 'templates', '[deck-tie-a, deck-tie-b]');
    const r = resolveDeck(p);
    assert.equal(r.ok, true);
    assert.equal(r.template, null);
    assert.deepEqual(r.tie, ['deck-tie-a', 'deck-tie-b']);
    assert.equal(r.tie_level, 'course');
  } finally { p.cleanup(); }
});

test('a more specific level settles what would have been a tie below it', () => {
  const p = project();
  try {
    p.setKey(COURSE, 'templates', '[deck-tie-a, deck-tie-b]');
    p.setKey(DECK, 'template', '"deck-tie-b"');
    assert.equal(slugOf(resolveDeck(p)), 'deck-tie-b');
  } finally { p.cleanup(); }
});

test('a template name that does not exist is skipped with a note', () => {
  const p = project();
  try {
    p.setKey(DECK, 'template', '"gone"');
    const r = resolveDeck(p);
    assert.equal(slugOf(r), 'deck-programme');
    assert.match(r.warnings.join(' '), /"gone"/);
  } finally { p.cleanup(); }
});

// ------------------------------------------------------------------ documented fallbacks

test('fallback: no templates folder and no templates key gives the built-in template', () => {
  const p = project();
  try {
    rmSync(join(p.dir, 'vault', '80_me'), { recursive: true, force: true });
    p.put('config/brain.json', JSON.stringify({ schema: 1, learner: { kind: 'mba' } }));
    p.setKey(PROG, 'templates', '[]');
    const deck = resolveDeck(p);
    assert.deepEqual([slugOf(deck), deck.template.level, deck.template.source], ['deck', 'built-in', 'built-in']);
    assert.equal(deck.style, 'presenting-deck');
    assert.equal(deck.base, 'deck');
    for (const [kind, builtin] of [['report', 'report'], ['memo', 'report'], ['essay', 'report'], ['one-pager', 'report'], ['letter', 'letter'], ['cv', 'cv']]) {
      assert.equal(slugOf(resolveTemplate({ kind, root: p.dir })), builtin, kind);
    }
    const wb = resolveTemplate({ kind: 'workbook', root: p.dir });
    assert.equal(wb.template, null);
    assert.equal(wb.base, 'none');
    assert.equal(wb.ok, true);
  } finally { p.cleanup(); }
});

test('fallback: no config file, no source and an empty project still resolve', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-templates-empty-'));
  try {
    const r = resolveTemplate({ kind: 'report', root: dir });
    assert.equal(slugOf(r), 'report');
    assert.equal(r.tone, 'professional');
    assert.equal(r.tone_source, 'default');
    assert.equal(resolveTemplate({ kind: 'nonsense', root: dir }).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fallback: notes without the new keys resolve to the built-in', () => {
  const p = project();
  try {
    p.put(PROG, '---\ntype: "programme"\nprovider: "Test School"\n---\n# MBA – Test School\n');
    const r = resolveDeck(p);
    assert.equal(r.template.level, 'built-in');
    assert.equal(r.max_upload_mb, null);
    assert.equal(r.csl, '');
  } finally { p.cleanup(); }
});

test('fallback: the personal brand stays the default when no template is set (render.mjs chooseBrand)', async () => {
  const { chooseBrand } = await import('../../system/quarto/tools/lib.mjs');
  const p = project();
  try {
    p.put('vault/80_me/brand/_brand.yml', 'meta:\n  name: "Alex Doe"\n');
    p.setKey(PROG, 'templates', '[]');
    const r = resolveDeck(p);
    assert.equal(r.template.level, 'built-in');
    assert.equal(r.brand, ''); // the resolver adds no brand of its own
    assert.equal(chooseBrand({ root: p.dir }), join(p.dir, 'vault', '80_me', 'brand', '_brand.yml'));
  } finally { p.cleanup(); }
});

// ------------------------------------------------------------------ tone, csl, upload limit, style

test('tone: the programme sets it, a more specific level overrides it', () => {
  const p = project();
  try {
    let r = resolveDeck(p);
    assert.deepEqual([r.tone, r.tone_source], ['academic', 'programme']);
    p.setKey(COURSE, 'tone', '"conversational"');
    r = resolveDeck(p);
    assert.deepEqual([r.tone, r.tone_source], ['conversational', 'course']);
    p.setKey(ASSIGNMENT, 'tone', '"professional"');
    assert.equal(resolveDeck(p).tone_source, 'project');
    p.setKey(DECK, 'tone', '"academic"');
    const r2 = resolveDeck(p);
    assert.deepEqual([r2.tone, r2.tone_source], ['academic', 'deliverable']);
    p.setKey(DECK, 'tone', '"shouty"');
    assert.equal(resolveDeck(p).tone_source, 'project', 'an unknown tone is ignored');
  } finally { p.cleanup(); }
});

test('tone: the default follows the kind of learner', () => {
  const p = project();
  try {
    p.setKey(PROG, 'tone', '""');
    const tone = (brain, kind = 'report') => {
      p.put('config/brain.json', JSON.stringify(brain));
      return resolveTemplate({ kind, root: p.dir }).tone;
    };
    assert.equal(tone({ learner: { kind: 'mba' } }), 'professional');
    assert.equal(tone({ learner: { kind: 'degree' } }), 'academic');
    assert.equal(tone({ learner: { kind: 'online' } }), 'academic');
    assert.equal(tone({ learner: { kind: 'other' } }), 'academic');
    assert.equal(tone({ learner: { kind: 'professional' } }), 'professional');
    assert.equal(tone({}), 'professional');
    assert.equal(tone({ packs: ['core', 'mba'] }), 'professional', 'an older install with the mba pack counts as mba');
    assert.equal(tone({ learner: { kind: 'degree' } }, 'cv'), 'professional', 'job documents are professional');
    assert.equal(defaultTone({ learnerKind: 'degree', kind: 'letter' }), 'professional');
  } finally { p.cleanup(); }
});

test('csl and the upload limit come from the programme when the template has none', () => {
  const p = project();
  try {
    let r = resolveDeck(p);
    assert.equal(r.max_upload_mb, 20);
    assert.equal(r.csl, 'chicago');
    p.setKey(COURSE, 'templates', '[report-plain]');
    r = resolveDeck(p, `${PROJECT_REL}/report.qmd`, 'report');
    assert.equal(r.max_upload_mb, 5, "the template's own limit wins");
    assert.equal(r.csl, join(p.dir, 'vault', '80_me', 'templates', 'report-plain', 'own.csl'));
  } finally { p.cleanup(); }
});

test('style: a deliverable can override the template style', () => {
  const p = project();
  try {
    assert.equal(resolveDeck(p).style, 'reading-deck');
    p.setKey(DECK, 'style', '"presenting-deck"');
    assert.equal(resolveDeck(p).style, 'presenting-deck');
  } finally { p.cleanup(); }
});

// ------------------------------------------------------------------ check

test('checkTemplate finds the problems in plain sentences', () => {
  const p = project();
  try {
    const dir = join(p.dir, 'vault', '80_me', 'templates', 'broken');
    const yml = (extra) => [
      'schema: 1', 'name: "Broken"', 'slug: "broken"', 'kind: "deck"', 'style: "reading-deck"', 'base: "deck"', 'outputs: [pdf]',
      'brand: ""', 'reference_doc: ""', 'csl: ""', 'quarto_extension: ""', 'source: "custom"', ...extra,
    ].join('\n') + '\n';
    p.put('vault/80_me/templates/broken/template.yml', yml([]));
    assert.deepEqual(checkTemplate(dir), []);

    p.put('vault/80_me/templates/broken/template.yml', yml(['kind: "poster"']).replace('kind: "deck"\n', ''));
    assert.match(checkTemplate(dir).join(' '), /"kind" is "poster"/);

    p.put('vault/80_me/templates/broken/template.yml', yml([]).replace('slug: "broken"', 'slug: "other"'));
    assert.match(checkTemplate(dir).join(' '), /"slug" is "other" but the folder is called "broken"/);

    p.put('vault/80_me/templates/broken/template.yml', yml([]).replace('brand: ""', 'brand: "_brand.yml"').replace('csl: ""', 'csl: "x.csl"').replace('quarto_extension: ""', 'quarto_extension: "ext"'));
    const missing = checkTemplate(dir).join(' ');
    assert.match(missing, /brand file "_brand\.yml"/);
    assert.match(missing, /citation style file "x\.csl"/);
    assert.match(missing, /extension "ext"/);

    // reference document: wrong extension for the kind, a template file, and a fine one
    writeFileSync(join(dir, 'ref.docx'), 'x');
    p.put('vault/80_me/templates/broken/template.yml', yml([]).replace('reference_doc: ""', 'reference_doc: "ref.docx"'));
    assert.match(checkTemplate(dir).join(' '), /A deck needs a \.pptx reference document/);
    writeFileSync(join(dir, 'ref.potx'), 'x');
    p.put('vault/80_me/templates/broken/template.yml', yml([]).replace('reference_doc: ""', 'reference_doc: "ref.potx"'));
    assert.match(checkTemplate(dir).join(' '), /save a copy as \.pptx/);
    writeFileSync(join(dir, 'ref.pptx'), 'x');
    p.put('vault/80_me/templates/broken/template.yml', yml([]).replace('reference_doc: ""', 'reference_doc: "ref.pptx"'));
    assert.deepEqual(checkTemplate(dir), []);

    p.put('vault/80_me/templates/broken/template.yml', yml(['max_upload_mb: -3', 'source: "mystery"']));
    const bad = checkTemplate(dir).join(' ');
    assert.match(bad, /"max_upload_mb" must be a number/);
    assert.match(bad, /"source" is "mystery"/);

    assert.match(checkTemplate(join(p.dir, 'nowhere'))[0], /no template\.yml/);
  } finally { p.cleanup(); }
});

test('the built-in templates and the fixture templates pass the check', () => {
  const p = project();
  try {
    for (const t of listTemplates(p.dir)) assert.deepEqual(checkTemplate(t.dir, { builtin: t.builtin }), [], t.slug);
    assert.deepEqual(listTemplates(p.dir).filter((t) => t.builtin).map((t) => t.slug).sort(), ['cv', 'deck', 'letter', 'report']);
  } finally { p.cleanup(); }
});

// ------------------------------------------------------------------ command line

function run(args, root) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'template.mjs'), ...args], {
    encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root }, windowsHide: true, timeout: 30_000,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

test('template.mjs: list, show, resolve, check and exit codes', release(), () => {
  const p = project();
  try {
    const list = JSON.parse(run(['list', '--json'], p.dir).stdout);
    assert.ok(list.some((t) => t.slug === 'deck-programme'));
    assert.ok(list.some((t) => t.slug === 'report' && t.location === 'built-in'));
    const show = run(['show', 'deck-course', '--json'], p.dir);
    assert.equal(show.status, 0);
    assert.equal(JSON.parse(show.stdout).kind, 'deck');
    assert.equal(run(['show', 'nothing'], p.dir).status, 1);

    const res = run(['resolve', '--kind', 'deck', '--for', DECK, '--json'], p.dir);
    assert.equal(res.status, 0);
    const j = JSON.parse(res.stdout);
    assert.equal(j.template.slug, 'deck-programme');
    assert.equal(j.tone, 'academic');
    for (const key of ['ok', 'kind', 'template', 'tie', 'base', 'format', 'style', 'brand', 'reference_doc', 'csl', 'max_upload_mb', 'page_limit', 'fonts', 'house_rules', 'structure', 'tone', 'tone_source']) {
      assert.ok(key in j, key);
    }
    assert.equal(run(['resolve'], p.dir).status, 2);
    assert.equal(run(['resolve', '--kind', 'poster'], p.dir).status, 2);
    assert.equal(run(['frobnicate'], p.dir).status, 2);

    assert.equal(run(['check', join(p.dir, 'vault', '80_me', 'templates', 'deck-course')], p.dir).status, 0);
    writeFileSync(join(p.dir, 'vault', '80_me', 'templates', 'deck-course', 'template.yml'), 'schema: 1\n');
    assert.equal(run(['check', join(p.dir, 'vault', '80_me', 'templates', 'deck-course')], p.dir).status, 1);
    assert.equal(run(['inspect'], p.dir).status, 2);
    assert.equal(run(['inspect', join(p.dir, 'missing.pptx')], p.dir).status, 1);
    assert.equal(existsSync(join(p.dir, 'missing.pptx')), false);
  } finally { p.cleanup(); }
});

test('missingLayouts compares the names Quarto needs, ignoring case', () => {
  assert.equal(QUARTO_PPTX_LAYOUTS.length, 7);
  assert.deepEqual(missingLayouts(QUARTO_PPTX_LAYOUTS.map((n) => n.toLowerCase())), []);
  assert.deepEqual(missingLayouts(['Title Slide', 'Blank']), ['Title and Content', 'Section Header', 'Two Content', 'Comparison', 'Content with Caption']);
});

// ------------------------------------------------------------------ review fixes

test('links written as vault paths find the course and the programme', () => {
  const p = project();
  try {
    p.setKey(ASSIGNMENT, 'course', '"[[20_areas/courses/strategy/course]]"');
    p.setKey(COURSE, 'programme', '"[[20_areas/programmes/MBA – Test School]]"');
    const r = resolveDeck(p);
    assert.equal(slugOf(r), 'deck-programme');
    assert.equal(r.tone, 'academic');
    assert.equal(r.tone_source, 'programme');
    assert.equal(r.csl, 'chicago');
    assert.equal(r.max_upload_mb, 20);
    assert.deepEqual(r.warnings.filter((w) => /cannot find its/.test(w)), []);
    p.setKey(ASSIGNMENT, 'course', '"[[strategy/course|Strategy]]"');
    assert.equal(slugOf(resolveDeck(p)), 'deck-programme');
  } finally { p.cleanup(); }
});

test('a course or programme link that matches nothing gives a warning', () => {
  const p = project();
  try {
    p.setKey(ASSIGNMENT, 'course', '"[[20_areas/courses/nonexistent/course]]"');
    let r = resolveDeck(p);
    assert.ok(r.warnings.some((w) => /course "nonexistent".*cannot find/.test(w)), r.warnings.join('|'));
    p.setKey(ASSIGNMENT, 'course', '"[[Strategy]]"');
    p.setKey(COURSE, 'programme', '"[[Nowhere]]"');
    r = resolveDeck(p);
    assert.ok(r.warnings.some((w) => /programme "Nowhere".*cannot find/.test(w)), r.warnings.join('|'));
  } finally { p.cleanup(); }
});

test('a report template also serves memos, essays and one-pagers; an exact kind still wins', () => {
  const p = project();
  try {
    p.put('config/brain.json', JSON.stringify({ schema: 1, templates: { defaults: { report: 'report-plain' } } }));
    p.setKey(PROG, 'templates', '[]');
    for (const kind of ['report', 'memo', 'essay', 'one-pager']) {
      const r = resolveDeck(p, `${PROJECT_REL}/report.qmd`, kind);
      assert.equal(slugOf(r), 'report-plain', kind);
      assert.equal(r.template.level, 'config', kind);
    }
    assert.notEqual(slugOf(resolveDeck(p, DECK, 'deck')), 'report-plain', 'a report template is not a deck template');
    p.setKey(COURSE, 'templates', '[report-plain]');
    assert.equal(resolveDeck(p, `${PROJECT_REL}/report.qmd`, 'essay').template.level, 'course');
    // a memo-kind default beats the report default
    p.put('vault/80_me/templates/memo-x/template.yml', readFileSync(join(p.dir, 'vault/80_me/templates/report-plain/template.yml'), 'utf8').replace(/report-plain/g, 'memo-x').replace('kind: "report"', 'kind: "memo"'));
    p.setKey(COURSE, 'templates', '[]');
    p.put('config/brain.json', JSON.stringify({ schema: 1, templates: { defaults: { report: 'report-plain', memo: 'memo-x' } } }));
    assert.equal(slugOf(resolveDeck(p, `${PROJECT_REL}/report.qmd`, 'memo')), 'memo-x');
  } finally { p.cleanup(); }
});

test('programme csl: a style file in the template is returned as a path; a name with no file is reported', () => {
  const p = project();
  try {
    let r = resolveDeck(p);
    assert.equal(r.csl, 'chicago');
    assert.equal(r.csl_missing, true);
    assert.ok(r.warnings.some((w) => /citation style "chicago".*chicago\.csl/.test(w)), r.warnings.join('|'));
    // the built-in report says "apa" but the programme requirement wins over that default
    r = resolveDeck(p, `${PROJECT_REL}/report.qmd`, 'report');
    assert.equal(r.csl, 'chicago');
    p.put('vault/80_me/templates/deck-programme/chicago.csl', '<style/>');
    r = resolveDeck(p);
    assert.equal(r.csl, join(p.dir, 'vault', '80_me', 'templates', 'deck-programme', 'chicago.csl'));
    assert.equal(r.csl_missing, false);
    assert.deepEqual(r.warnings.filter((w) => /citation style/.test(w)), []);
  } finally { p.cleanup(); }
});

test('templateWarnings: a reference document or extension needs a matching format', () => {
  const p = project();
  try {
    const mk = (extra) => {
      const base = readFileSync(join(p.dir, 'vault/80_me/templates/report-plain/template.yml'), 'utf8').replace(/^(format|reference_doc|quarto_extension|csl|kind|outputs):.*\n/gm, '');
      p.put('vault/80_me/templates/report-plain/template.yml', base + extra);
      return templateWarnings(join(p.dir, 'vault/80_me/templates/report-plain'));
    };
    assert.deepEqual(mk('kind: "report"\nformat: ""\n'), []);
    assert.match(mk('kind: "report"\nformat: ""\nreference_doc: "ref.docx"\n')[0], /only used for docx output.*"format" is empty/);
    assert.deepEqual(mk('kind: "report"\nformat: "docx"\nreference_doc: "ref.docx"\n'), []);
    assert.match(mk('kind: "report"\nformat: "typst"\nreference_doc: "ref.docx"\n')[0], /"format" is "typst"/);
    assert.match(mk('kind: "report"\nformat: "docx"\noutputs: [pdf]\nreference_doc: "ref.docx"\n')[0], /"outputs" does not list docx/);
    assert.match(mk('kind: "report"\nformat: ""\nquarto_extension: "school"\n')[0], /extension "school".*format/);
    assert.deepEqual(mk('kind: "report"\nformat: "school-pdf"\nquarto_extension: "school"\n'), []);
  } finally { p.cleanup(); }
});
