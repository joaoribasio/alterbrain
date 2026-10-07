import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { analyse, checkDraft, detectLanguage, percentile, splitSentences, tokens } from '../../system/scripts/voice-stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'system', 'scripts', 'voice-stats.mjs');
const FIX = join(HERE, '..', 'fixtures', 'text');
const f = (name) => join(FIX, name);
const read = (name) => readFileSync(f(name), 'utf8');
const EM = '—';

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const ENGLISH = ['voice-en-1.md', 'voice-en-2.md', 'voice-en-3.md'].map((n) => ({ name: n, text: read(n) }));

test('percentile interpolates', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([], 0.9), 0);
  assert.equal(percentile([10], 0.9), 10);
});

test('splitSentences handles abbreviations, decimals and initials', () => {
  const s = splitSentences('Prof. Smith met J. Doe at 3.5 percent growth, e.g. in Rotterdam. Was it good? Yes! It was...');
  assert.equal(s.length, 4);
  assert.equal(s[0].end, '.');
  assert.equal(s[1].end, '?');
  assert.equal(s[2].end, '!');
  assert.equal(s[3].end, '…');
});

test('tokens keep contractions and hyphens together', () => {
  assert.deepEqual(tokens("I can't say load-bearing words."), ["I", "can't", 'say', 'load-bearing', 'words']);
});

test('detectLanguage: English, Dutch, and short text falls back to English', () => {
  assert.equal(detectLanguage(read('voice-en-1.md') + read('voice-en-2.md')), 'en');
  assert.equal(detectLanguage(read('voice-nl-1.md') + read('voice-nl-2.md')), 'nl');
  assert.equal(detectLanguage('Hoi'), 'en');
});

test('analyse: sentence and paragraph distribution', () => {
  const s = analyse(ENGLISH, { lang: 'en' });
  assert.equal(s.file_count, 3);
  assert.ok(s.sentences >= 15);
  assert.ok(s.sentence_length.mean > 3 && s.sentence_length.mean < 15);
  assert.ok(s.sentence_length.p90 >= s.sentence_length.p50);
  assert.ok(s.paragraph_length.mean_words > 0);
  assert.ok(s.openers.length > 0 && s.openers[0].count >= 1);
});

test('analyse: sign-offs and closers are found and removed from prose', () => {
  const s = analyse(ENGLISH, { lang: 'en' });
  const names = s.sign_offs.map((x) => x.text);
  assert.ok(names.includes('best'));
  assert.ok(names.includes('thanks'));
  assert.equal(s.sign_offs.find((x) => x.text === 'best').count, 2);
  // "Alex" (the name under the sign-off) must not show up as an opener.
  assert.ok(!s.openers.some((o) => o.text === 'alex'));
  assert.ok(s.closers.top.length > 0);
});

test('analyse: contractions, punctuation, emoji', () => {
  const s = analyse(ENGLISH, { lang: 'en' });
  assert.equal(s.contractions.ratio, 1);
  assert.ok(s.contractions.per_1000_words > 50);
  assert.equal(s.punctuation.counts.em_dash, 0);
  assert.ok(s.punctuation.counts.question >= 3);
  assert.equal(s.emoji.count, 0);
  const e = analyse([{ name: 'e', text: 'Great news \u{1F389} today \u{1F680} everyone. Really.' }], { lang: 'en' });
  assert.equal(e.emoji.count, 2);
  assert.ok(e.emoji.per_1000_words > 100);
});

test('analyse: contraction ratio uses full forms too', () => {
  const s = analyse([{ name: 'x', text: 'I do not know. It is fine. We are late. I can\'t go.' }], { lang: 'en' });
  assert.equal(s.contractions.count, 1);
  assert.equal(s.contractions.full_forms, 3);
  assert.equal(s.contractions.ratio, 0.25);
});

test('analyse: markdown, code, frontmatter and wikilinks do not pollute the text', () => {
  const md = [
    '---',
    'title: "Not prose"',
    '---',
    '# A heading that is skipped',
    '',
    'See [[Porter Five Forces|the forces]] and [a link](https://example.com/very/long/path).',
    '',
    '```js',
    'const x = 1; // semicolon here',
    '```',
    '',
    '- a list item',
    '- another item',
  ].join('\n');
  const s = analyse([{ name: 'm', text: md }], { lang: 'en' });
  assert.equal(s.punctuation.counts.semicolon, 0);
  assert.equal(s.punctuation.counts.colon, 0);
  assert.equal(s.sentences, 1);
  assert.ok(s.words === 11, `words=${s.words}`);
  assert.equal(s.shapes.headings, 1);
});

test('analyse: top phrases skip stopword-only pairs and need two uses', () => {
  const text = 'Market share matters. Market share grew. The cost of capital fell. The cost of capital rose.';
  const s = analyse([{ name: 'p', text }], { lang: 'en' });
  const two = s.top_phrases.two_word.map((p) => p.phrase);
  assert.ok(two.includes('market share'));
  assert.ok(two.includes('cost of'));
  assert.ok(!two.includes('of the'));
  assert.ok(s.top_phrases.three_word.map((p) => p.phrase).includes('cost of capital'));
});

test('analyse: watch list counts, and extra watch words', () => {
  const s = analyse([{ name: 'w', text: 'We delve into it. A robust plan, simply put. Synergy again, synergy twice.' }], { lang: 'en', watch: ['synergy'] });
  assert.equal(s.watch.delve.count, 1);
  assert.equal(s.watch.robust.count, 1);
  assert.equal(s.watch.simply.count, 1);
  assert.equal(s.watch.synergy.count, 2);
  assert.ok(s.watch.synergy.per_1000_words > 0);
});

test('analyse: non-English has no contraction or English shape stats', () => {
  const s = analyse([{ name: 'n', text: read('voice-nl-1.md') }], { lang: 'nl' });
  assert.equal(s.contractions, null);
  assert.equal(s.shapes.verdict_endings, undefined);
  assert.ok(s.sign_offs.some((x) => x.text === 'groet'));
  assert.deepEqual(s.watch, {}); // English watch list is not applied
});

test('checkDraft: a formal AI-style draft is flagged', () => {
  const baseline = analyse(ENGLISH, { lang: 'en' });
  const r = checkDraft(read('draft-formal.md'), baseline, { lang: 'en' });
  assert.equal(r.ok, false);
  const metrics = r.flags.map((x) => x.metric);
  for (const m of ['punctuation.em_dash', 'punctuation.semicolon', 'contractions', 'watch.delve', 'watch.leverage', 'shape.kickers', 'closer.question']) {
    assert.ok(metrics.includes(m), `${m} missing from ${metrics.join(', ')}`);
  }
  assert.ok(r.flags.every((x) => typeof x.message === 'string' && x.message.length > 0));
  assert.ok(r.flags.some((x) => x.metric === 'sign_off' && x.severity === 'note'));
});

test('checkDraft: a draft in the writer\'s own style passes', () => {
  const baseline = analyse(ENGLISH, { lang: 'en' });
  const r = checkDraft(read('draft-like-me.md'), baseline, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.flags));
});

test('checkDraft: baseline with the same habit does not flag it', () => {
  const dashy = [{ name: 'd', text: `One thing ${EM} then another. Two things ${EM} and more. Three ${EM} done. ${'Plain words here. '.repeat(15)}` }];
  const baseline = analyse(dashy, { lang: 'en' });
  const r = checkDraft(`A line ${EM} with a dash. ${'Plain words here. '.repeat(15)}`, baseline, { lang: 'en' });
  assert.ok(!r.flags.some((x) => x.metric === 'punctuation.em_dash'));
});

test('checkDraft: very short drafts skip rate checks but still check words', () => {
  const baseline = analyse(ENGLISH, { lang: 'en' });
  const r = checkDraft(`We delve ${EM} now.`, baseline, { lang: 'en' });
  assert.ok(r.skipped.some((s) => /under 30 words/.test(s)));
  assert.ok(!r.flags.some((x) => x.metric === 'punctuation.em_dash'));
  assert.ok(r.flags.some((x) => x.metric === 'watch.delve'));
});

test('CLI census: groups files by language and prints JSON', () => {
  const r = run([f('voice-en-1.md'), f('voice-en-2.md'), f('voice-nl-1.md'), f('voice-nl-2.md')]);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.schema, 1);
  assert.deepEqual(Object.keys(j.languages).sort(), ['en', 'nl']);
  assert.equal(j.languages.en.file_count, 2);
  assert.equal(j.languages.nl.file_count, 2);
});

test('CLI census: --lang forces one language and --out writes the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  try {
    const out = join(dir, 'sub', 'stats.json');
    const r = run([f('voice-nl-1.md'), '--lang', 'en', '--out', out]);
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(out));
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(out, 'utf8')).languages), ['en']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI census: a folder is walked for text files only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  try {
    writeFileSync(join(dir, 'a.md'), 'Hello there. This is a note about pricing.\n');
    writeFileSync(join(dir, 'b.txt'), 'Another note. It has two sentences.\n');
    writeFileSync(join(dir, 'c.png'), 'not text');
    const j = JSON.parse(run([dir, '--lang', 'en']).out);
    assert.equal(j.languages.en.file_count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI check: flags give exit 1, a clean draft exit 0, and the baseline can be a census file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  try {
    const base = join(dir, 'stats.json');
    assert.equal(run([f('voice-en-1.md'), f('voice-en-2.md'), f('voice-en-3.md'), '--lang', 'en', '--out', base]).code, 0);
    const bad = run(['--check', f('draft-formal.md'), '--baseline', base, '--lang', 'en']);
    assert.equal(bad.code, 1);
    const jb = JSON.parse(bad.out);
    assert.equal(jb.ok, false);
    assert.ok(jb.flags.length >= 5);
    const good = run(['--check', f('draft-like-me.md'), '--baseline', base]);
    assert.equal(good.code, 0, good.out + good.err);
    assert.equal(JSON.parse(good.out).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: usage errors exit 2', () => {
  assert.equal(run([]).code, 2);
  assert.equal(run(['--nope']).code, 2);
  assert.equal(run([join(FIX, 'nothing-here.md')]).code, 2);
  assert.equal(run(['--check', f('draft-like-me.md'), '--baseline', join(FIX, 'no-baseline.json')]).code, 2);
  assert.equal(run(['--check', join(FIX, 'no-draft.md')]).code, 2);
  assert.equal(run([f('voice-en-1.md'), '--tolerance', '0.5']).code, 2);
});
