import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { scanText, buildRules, stripQuoted, loadExtra, exemptPath } from '../../system/scripts/slop-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'system', 'scripts', 'slop-check.mjs');
const FIX = join(HERE, '..', 'fixtures', 'text');
const EM = '\u2014';

function run(args, input) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', input });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('hard tell: one em dash fails in English', () => {
  const r = scanText(`The plan ${EM} as agreed ${EM} works.`);
  assert.equal(r.status, 'fail');
  assert.ok(r.hard.some((h) => h.label === 'em dash'));
});

test('hard tells: each named family is caught on a single hit', () => {
  const cases = {
    'honesty framing': 'Honestly, the plan works.',
    "not-X-it's-Y contrast": "It's not about speed, it's about trust.",
    'X-not-Y contrast': 'We built a test, not a permission.',
    'rhetorical heading': '# The bottom line\n\nText here.',
    'The <Noun> heading': '## The Wedge\n\nText here.',
    'verdict kicker': 'We cut the cost. That is the point.',
    'fake-profound closer': 'Think about it. Let that sink in.',
    'throat-clearing': "Here's the thing about pricing.",
    sycophancy: 'Great question about pricing.',
    'emoji heading': '## \u{1F680} Results\n\nText here.',
  };
  for (const [label, text] of Object.entries(cases)) {
    const r = scanText(text);
    assert.equal(r.status, 'fail', label);
    assert.ok(r.hard.some((h) => h.label === label), `${label} not found in ${JSON.stringify(r.hard)}`);
  }
});

test('recap ending only counts in the last paragraph', () => {
  const mid = scanText('Overall, the start was fine.\n\nThe middle part talks about costs.\n\nNext step: call the owner.');
  assert.equal(mid.status, 'clear');
  const end = scanText('The middle part talks about costs.\n\nIn conclusion, costs matter.');
  assert.equal(end.status, 'fail');
  assert.ok(end.hard.some((h) => h.label === 'summary-recap ending'));
});

test('filler: two words pass, three fail', () => {
  const two = scanText('The plan is robust. The report is simple.');
  assert.equal(two.status, 'clear');
  assert.equal(two.filler.count, 2);
  const three = scanText('The plan is robust. The report is simple. We will delve into it.');
  assert.equal(three.status, 'fail');
  assert.equal(three.filler.count, 3);
  assert.equal(three.tells.filter((t) => t.tier === 'filler').length, 3);
});

test('"leveraged buyout" is not filler, "leverage" is', () => {
  assert.equal(scanText('A leveraged buyout is a common deal.').filler.count, 0);
  assert.equal(scanText('We leverage the data.').filler.count, 1);
});

test('quoted, backticked and fenced spans are stripped', () => {
  const text = [
    `He said "honestly it's fine ${EM} really" in class.`,
    'The word `honestly` is inline code.',
    '```',
    `code ${EM} here. Honestly.`,
    '```',
    `\u201CCurly ${EM} quote\u201D is ignored.`,
    '',
    'Done.',
  ].join('\n');
  assert.equal(scanText(text).status, 'clear');
});

test('stripQuoted keeps line numbers', () => {
  const out = stripQuoted('a\n```\nb\n```\nc "x" d');
  assert.equal(out.split('\n').length, 5);
  assert.ok(!out.includes('b'));
});

test('hit lines are reported', () => {
  const r = scanText(`Line one.\nLine two.\nLine three ${EM} here.`);
  assert.equal(r.hard[0].line, 3);
});

test('slop-ok marker exempts the whole text', () => {
  const r = scanText(`<!-- slop-ok: example -->\nHonestly ${EM} yes.`);
  assert.equal(r.status, 'exempt');
});

test('frontmatter and HTML comments are ignored', () => {
  const r = scanText(`---\ntitle: "A ${EM} B"\n---\n<!-- Honestly -->\nPlain text.`);
  assert.equal(r.status, 'clear');
});

test('non-English: English tells are not run, em dash density is', () => {
  const nl = scanText('Eerlijk gezegd is het plan robuust. Honestly, simple and robust and seamless.', { lang: 'nl' });
  assert.equal(nl.status, 'clear');
  const few = scanText(`Een zin ${EM} met een streep. ${'Gewone zin. '.repeat(100)}`, { lang: 'nl' });
  assert.equal(few.status, 'clear');
  const dense = scanText(`A ${EM} b. C ${EM} d. E ${EM} f. G ${EM} h.`, { lang: 'nl' });
  assert.equal(dense.status, 'fail');
  assert.ok(dense.hard[0].label.startsWith('em dash density'));
});

test('non-English: emoji heading and recap endings still fail', () => {
  assert.equal(scanText('## \u{1F680} Resultaten\n\nTekst.', { lang: 'nl' }).status, 'fail');
  assert.equal(scanText('Tekst over prijzen.\n\nTot slot: prijzen tellen.', { lang: 'nl' }).status, 'fail');
  assert.equal(scanText('Tekst over prijzen.\n\nTot slot: prijzen tellen.', { lang: 'xx' }).status, 'clear');
});

test('extra rules extend and override the lists', () => {
  const extra = {
    soft_limit: 2,
    hard: [{ label: 'synergy', pattern: '\\bsynergy\\b', flags: 'i' }],
    filler: ['holistic', 'stakeholder*'],
    disable: ['em dash'],
    languages: { nl: { filler: ['uitdaging*'] } },
  };
  assert.equal(scanText('There is synergy here.', { extra }).status, 'fail');
  assert.equal(scanText(`Dash ${EM} allowed now.`, { extra }).status, 'clear');
  const two = scanText('A holistic view for every stakeholder.', { extra });
  assert.equal(two.status, 'fail');
  assert.equal(two.filler.limit, 2);
  assert.equal(scanText('Een uitdaging en nog een uitdaging.', { lang: 'nl', extra }).status, 'fail');
});

test('a bad extra pattern is skipped with a warning, not a crash', () => {
  const rules = buildRules('en', { hard: [{ label: 'broken', pattern: '(' }] });
  assert.ok(rules.warnings.length >= 1);
  assert.equal(scanText('Plain text.', { rules }).status, 'clear');
});

test('loadExtra tolerates missing and invalid files', () => {
  assert.equal(loadExtra(join(FIX, 'does-not-exist.json')).extra, null);
  const dir = mkdtempSync(join(tmpdir(), 'slop-'));
  try {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ not json');
    const r = loadExtra(bad);
    assert.equal(r.extra, null);
    assert.ok(r.warning);
    assert.ok(loadExtra(join(FIX, 'slop-extra.json')).extra.soft_limit === 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exemptPath skips non-prose files', () => {
  assert.equal(exemptPath('C:\\x\\image.png'), true);
  assert.equal(exemptPath('notes/a.md'), false);
  assert.equal(exemptPath('vault/80_me/voice/slop-extra.json'), true);
});

test('CLI: clear file exits 0', () => {
  const r = run([join(FIX, 'slop-clean.md'), '--no-extra']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /clear/);
});

test('CLI: hard-tell file exits 1 and prints lines', () => {
  const r = run([join(FIX, 'slop-hard.md'), '--no-extra']);
  assert.equal(r.code, 1);
  assert.match(r.out, /line \d+ \[/);
  assert.match(r.out, /slop-ok/);
});

test('CLI: filler fixtures', () => {
  assert.equal(run([join(FIX, 'slop-filler-two.md'), '--no-extra']).code, 0);
  assert.equal(run([join(FIX, 'slop-filler-three.md'), '--no-extra']).code, 1);
});

test('CLI: exempt fixture exits 0', () => {
  const r = run([join(FIX, 'slop-exempt.md'), '--no-extra']);
  assert.equal(r.code, 0);
  assert.match(r.out, /skipped/);
});

test('CLI: --json is valid and carries the verdict', () => {
  const r = run([join(FIX, 'slop-hard.md'), '--json', '--no-extra']);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, false);
  assert.equal(j.files[0].status, 'fail');
  assert.ok(j.files[0].hard.length >= 4);
});

test('CLI: --lang nl on Dutch fixtures', () => {
  assert.equal(run([join(FIX, 'slop-nl-clean.md'), '--lang', 'nl', '--no-extra']).code, 0);
  assert.equal(run([join(FIX, 'slop-nl-dashes.md'), '--lang', 'nl', '--no-extra']).code, 1);
  assert.equal(run([join(FIX, 'slop-nl-recap.md'), '--lang', 'nl', '--no-extra']).code, 1);
});

test('CLI: --extra file is used', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-'));
  try {
    const f = join(dir, 'a.md');
    writeFileSync(f, 'There is synergy in the team.\n');
    assert.equal(run([f, '--no-extra']).code, 0);
    assert.equal(run([f, '--extra', join(FIX, 'slop-extra.json')]).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: stdin and usage errors', () => {
  assert.equal(run(['-', '--no-extra'], `Plain text ${EM} bad.`).code, 1);
  assert.equal(run(['-', '--no-extra'], 'Plain text. Fine.').code, 0);
  assert.equal(run([]).code, 2);
  assert.equal(run(['--nope']).code, 2);
  assert.equal(run([join(FIX, 'missing.md')]).code, 2);
});
