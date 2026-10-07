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
const EN = '\u2013';
const ELL = '\u2026';

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
  const three = scanText('The plan is robust. The report is simple. We will leverage it.');
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

// ---------------------------------------------------------------------------------------------
// Framework default anti-AI rules (.claude/rules/writing.md section 2), English only.
// ---------------------------------------------------------------------------------------------
const labels = (r) => r.hard.map((h) => h.label);

test('default rules: notorious single words fail on one hit', () => {
  const cases = {
    'banned word: delve': 'We will delve into the numbers.',
    'banned word: tapestry': 'The case is a rich tapestry of interests.',
    'banned word: testament': 'The turnaround is a testament to the new team.',
  };
  for (const [label, text] of Object.entries(cases)) {
    const r = scanText(text);
    assert.equal(r.status, 'fail', label);
    assert.ok(labels(r).includes(label), `${label} not in ${JSON.stringify(r.hard)}`);
    assert.equal(r.filler.count, 0, `${label} should be a hard tell, not filler`);
  }
});

test('default rules: banned phrases fail on one hit', () => {
  const cases = {
    "banned phrase: in today's": "In today's economy, margins are thin.",
    'banned phrase: in the ever-evolving': 'We work in the ever-evolving retail sector.',
    'banned phrase: it is important to': 'It is important to check the contract first.',
    'banned phrase: this highlights the importance of': 'This highlights the importance of cash flow.',
    'banned phrase: in a world where': 'In a world where rates are zero, bonds behave differently.',
    'banned phrase: when it comes to': 'When it comes to pricing, test early.',
    "banned phrase: I'm excited to": "I'm excited to apply for the role.",
    'banned phrase: comprehensive overview': 'The deck gives a comprehensive overview of the market.',
    'banned phrase: shaping the future of': 'We are shaping the future of retail.',
    'banned phrase: treasure trove': 'The archive is a treasure trove of case data.',
    'banned phrase: in conclusion': 'Costs fell. In conclusion, the plan worked. More text follows here.',
  };
  for (const [label, text] of Object.entries(cases)) {
    const r = scanText(text);
    assert.equal(r.status, 'fail', label);
    assert.ok(labels(r).includes(label), `${label} not in ${JSON.stringify(r.hard)}`);
  }
  assert.ok(labels(scanText('I was thrilled to join the team.')).includes("banned phrase: I'm excited to"));
  assert.ok(labels(scanText('In today’s market, margins are thin.')).includes("banned phrase: in today's"), 'curly apostrophe');
  assert.ok(labels(scanText("It's important to plan ahead.")).includes('banned phrase: it is important to'));
});

test('default rules: "not just about X, it\'s about Y" is caught by the contrast patterns', () => {
  const r = scanText("This is not just about price, it's about trust.");
  assert.equal(r.status, 'fail');
  assert.ok(labels(r).includes("not-X-it's-Y contrast"));
});

test('default rules: banned sentence openers fail', () => {
  for (const word of ['However', 'Furthermore', 'Moreover', 'Additionally', 'Consequently', 'Nevertheless']) {
    const afterStop = scanText(`The plan is fine. ${word}, the cost is high.`);
    assert.equal(afterStop.status, 'fail', word);
    assert.ok(labels(afterStop).includes('banned opener'), word);
  }
  const lineStart = scanText('The plan is fine.\nHowever, the cost is high.');
  assert.equal(lineStart.status, 'fail');
  assert.equal(lineStart.hard[0].line, 2);
  assert.equal(scanText('- Moreover, the cost is high.').status, 'fail', 'list item');
  assert.equal(scanText('Nevertheless, the plan stands.').status, 'fail', 'very start of the text');
});

test('default rules: a spaced en dash fails like an em dash, a range does not', () => {
  const r = scanText(`The plan ${EN} as agreed ${EN} works.`);
  assert.equal(r.status, 'fail');
  assert.ok(labels(r).includes('en dash'));
  assert.equal(scanText(`Revenue for 2020${EN}2022 grew.`).status, 'clear');
});

test('default rules: ellipsis for drama fails, omission marks in brackets do not', () => {
  assert.ok(labels(scanText('We waited... and then left.')).includes('ellipsis'));
  assert.ok(labels(scanText(`We waited ${ELL} and then left.`)).includes('ellipsis'));
  assert.equal(scanText(`The memo says [...] and [${ELL}] twice. See [FACT NEEDED: ${ELL}].`).status, 'clear');
  assert.equal(scanText('He wrote "wait... what" in the margin.').status, 'clear', 'inside quotes');
});

test('default rules: filler words count, they do not fail alone', () => {
  const one = scanText('We want to harness the data.');
  assert.equal(one.status, 'clear');
  assert.equal(one.filler.count, 1);
  const three = scanText('The nuanced, multifaceted plan will bolster sales.');
  assert.equal(three.status, 'fail');
  assert.equal(three.filler.count, 3);
  const verbs = scanText('We endeavour to hone it, embark on it, spearhead it, elevate it, captivate users and underscore value.');
  assert.equal(verbs.status, 'fail');
  assert.ok(verbs.filler.count >= 6, JSON.stringify(verbs.filler.hits));
  for (const word of ['cornerstone', 'groundbreaking', 'revolutionary', 'transformative', 'furthermore', 'moreover', 'notably', 'realm', 'strategically', 'meticulously']) {
    assert.equal(scanText(`A ${word} idea.`).filler.count, 1, word);
  }
  assert.equal(scanText('The deck is showcasing the range.').filler.count, 1);
});

test('default rules: "landscape" only counts as a metaphor', () => {
  assert.equal(scanText('A landscape painting hangs in the hall. Select landscape orientation.').filler.count, 0);
  assert.equal(scanText('The competitive landscape is crowded.').filler.count, 1);
  assert.equal(scanText('We map the landscape of retail banking.').filler.count, 1);
});

test('default rules: particularly and especially are filler only before a stock adjective', () => {
  assert.equal(scanText('Sales grew, particularly in Asia, and especially for retail.').filler.count, 0);
  assert.equal(scanText('The point is particularly valuable.').filler.count, 1);
});

test('default rules: no false positives on ordinary wording', () => {
  const ok = [
    'The plan was fine; however, the cost rose.', // mid-sentence however
    'He found it hard; the cost, however, rose.',
    'However hard the team tried, sales fell.', // no comma after the word
    'In today’s lecture we covered pricing.', // a real time reference
    'The Old Testament is not a case study. Her last will and testament was read.',
    'We were honest about the honey price.', // honest and honey are not "hone"
    'Elevated risk and elevated rates persist.',
    'We showcase nothing, but the showcase opens on Friday.',
    'It is important.', // only "it is important to" is banned
  ];
  for (const text of ok) {
    const r = scanText(text);
    assert.equal(r.status, 'clear', `${text} -> ${JSON.stringify(r.hard)} ${JSON.stringify(r.filler.hits)}`);
  }
});

test('default rules: quoted and backticked banned phrases are ignored', () => {
  const text = [
    'The ghostwriter must never write "In today’s world" or "when it comes to".',
    'The check looks for `delve` and `However,` at the start of a sentence.',
    '```',
    'However, we delve into a rich tapestry ... in conclusion',
    '```',
    '',
    'Next step: ask the owner.',
  ].join('\n');
  assert.equal(scanText(text).status, 'clear');
});

test('default rules: English only, other languages keep the language-neutral checks', () => {
  const nl = scanText(`However, we delve into the tapestry ${EN} in today's world... when it comes to it. I'm excited to start.`, { lang: 'nl' });
  assert.equal(nl.status, 'clear');
  assert.equal(buildRules('nl').hard.every((r) => r.neutral), true);
});

test('default rules: "in conclusion" is reported once, as a recap ending when it opens the last paragraph', () => {
  const r = scanText('The middle part talks about costs.\n\nIn conclusion, costs matter.');
  assert.equal(r.hard.length, 1);
  assert.equal(r.hard[0].label, 'summary-recap ending');
});

test('default rules: CLI fails on a draft full of default tells and passes a plain one', () => {
  const bad = run(['-', '--no-extra'], 'In today’s world we delve into the market.\nHowever, it is a testament to the team.\n');
  assert.equal(bad.code, 1);
  assert.match(bad.out, /banned phrase: in today's/);
  assert.match(bad.out, /banned word: delve/);
  assert.match(bad.out, /banned opener/);
  assert.match(bad.out, /banned word: testament/);
  const good = run(['-', '--no-extra'], 'The team cut costs by 12 percent. I will send the numbers on Friday.\n');
  assert.equal(good.code, 0, good.out);
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
