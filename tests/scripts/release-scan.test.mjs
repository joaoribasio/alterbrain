import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText, scanFile, skippedLines, findPdftotext } from '../../system/scripts/release-scan.mjs';
import { zipTool } from '../../system/lib/ooxml.mjs';
import { makeDocx, makePptx, makeXlsx, cleanSheets } from '../fixtures/scripts/deliverables/builders.mjs';

const SCRIPT = fileURLToPath(new URL('../../system/scripts/release-scan.mjs', import.meta.url));
const skip = zipTool() ? false : 'no bsdtar on this computer';
const dir = mkdtempSync(join(tmpdir(), 'ab-rscan-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

function cli(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('scanText finds labels and placeholders, not Markdown links', () => {
  const t = [
    'We assume growth. [Inference] this holds.',
    'Owner: [Teammate name]',
    'See [Name](https://example.com) and the [report][r1] and [@smith2020] and [^1].',
    'Cost {{ price }} per unit. Lorem ipsum dolor.',
    '[FACT NEEDED: grade] and [Unverified] and [Speculation] and [TBD]',
  ].join('\n');
  const hits = scanText(t);
  const matches = hits.map((h) => h.match);
  assert.ok(matches.includes('[Inference]'));
  assert.ok(matches.includes('[Teammate name]'));
  assert.ok(matches.includes('{{ price }}'));
  assert.ok(matches.includes('Lorem ipsum'));
  assert.ok(matches.includes('[FACT NEEDED: grade]'));
  assert.ok(matches.includes('[TBD]'));
  assert.equal(hits.some((h) => h.line === 3), false);
  assert.equal(hits.find((h) => h.match === '[Inference]').line, 1);
});

test('labels are found in any case', () => {
  const m = scanText('[fact needed: x] and [UNVERIFIED] and [inference] and [speculation]').map((h) => h.match);
  assert.deepEqual([...m].sort(), ['[UNVERIFIED]', '[fact needed: x]', '[inference]', '[speculation]']);
});

test('placeholders beyond the first eight words are found', () => {
  const cases = [
    'Dear [Hiring manager], I am applying for [Role] at [Company].',
    'Prepared by [Student Name] for [Course name] on [Date]',
    'Growth of XX% and revenue of EUR XXm; budget €XXX',
    'Signature: ___________',
    'Dear <Insert name>,',
    'We found [X] cases.',
    'Please add the [insert here] part.',
  ];
  const expected = [3, 3, 3, 1, 1, 1, 1];
  cases.forEach((c, i) => assert.ok(scanText(c).length >= expected[i], `${c} -> ${JSON.stringify(scanText(c))}`));
  assert.deepEqual(scanText('Dear [Hiring manager], I am applying for [Role] at [Company].').map((h) => h.match), ['[Hiring manager]', '[Role]', '[Company]']);
});

test('working citations and wiki links are found', () => {
  const m = scanText('Margins fell [Source: [[Porter note]] | 2026-10-01 | confidence: medium]. See [[Porter\'s Five Forces]].').map((h) => h.match);
  assert.ok(m.includes('[Source:'));
  assert.ok(m.includes("[[Porter's Five Forces]]"));
  assert.ok(m.includes('[[Porter note]]'));
});

test('Quarto shortcodes, maths, indexes, spans and ordinary brackets are not placeholders', () => {
  const t = [
    '{{< pagebreak >}}',
    '{{< include methods.qmd >}}',
    '{{< meta title >}}',
    '{{< cv summary >}}',
    'The sum is $x_{{i}}$ and $a^{{2}}$.',
    'Use df[col] and x[0] and the range [1-3] and [12, 14] and [sic] and [...].',
    'A [highlighted span]{.mark} and a [link text](https://example.com/a) and ![fig](a.png).',
    '___',
    'Some ___bold italic___ text.',
    'Delta [EUR m] stays in a chart label.',
  ].join('\n');
  assert.deepEqual(scanText(t), []);
});

test('scanText on clean text finds nothing', () => {
  assert.deepEqual(scanText('We assume the market grows. In our reading this is safe.'), []);
});

test('skippedLines ignores hidden front matter keys and nested hidden blocks, not title or author', () => {
  const t = [
    '---',
    'title: "[TODO]"',
    'author: "[Your name]"',
    'facts_used:',
    '  - "[Unverified] x"',
    'status: draft [TBD]',
    '# comment [TBD]',
    'date: 2026-10-01',
    '---',
    'Body',
    '::: {.content-hidden when-format="pdf"}',
    '[TODO] hidden',
    '::: {.callout}',
    'inner',
    ':::',
    '[TBD] still hidden',
    ':::',
    '[TBD] visible',
  ].join('\n');
  const s = skippedLines(t);
  assert.ok(!s.has(2) && !s.has(3) && !s.has(8));
  assert.ok(s.has(1) && s.has(4) && s.has(5) && s.has(6) && s.has(7) && s.has(9));
  assert.ok(s.has(12) && s.has(16));
  assert.ok(!s.has(18));
  const all = skippedLines(t, { frontMatter: 'all' });
  assert.ok(all.has(2) && all.has(3) && all.has(8));
});

test('qmd: a placeholder in title or author fails, hidden keys and hidden blocks pass', () => {
  const f = join(dir, 'a.qmd');
  writeFileSync(f, ['---', 'title: "[TBD] Strategy case"', 'author: "[Your name]"', 'facts_used: ["[Inference] kept in notes"]', 'format: pdf', '---', '::: {.content-hidden}', '[Inference] note to self', ':::', 'Real text [Unverified] here'].join('\n'));
  const r = scanFile(f);
  assert.deepEqual(r.hits.map((h) => `${h.location}:${h.match}`), ['line 2:[TBD]', 'line 3:[Your name]', 'line 10:[Unverified]']);
  const ok = join(dir, 'b.qmd');
  writeFileSync(ok, ['---', 'title: "Strategy case"', 'facts_used: ["[Inference] kept"]', '---', '{{< pagebreak >}}', 'Text.'].join('\n'));
  assert.deepEqual(scanFile(ok).hits, []);
});

test('md: clean file passes through the command', () => {
  const f = join(dir, 'clean.md');
  writeFileSync(f, 'All good here.\n');
  const r = cli([f]);
  assert.equal(r.code, 0);
  assert.match(r.out, /clean/);
});

test('md: a label fails with exit 1 and --json is valid', () => {
  const f = join(dir, 'bad.md');
  writeFileSync(f, 'Margin will rise [Speculation].\n');
  const r = cli([f, '--json']);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, false);
  assert.equal(j.results[0].hits[0].match, '[Speculation]');
});

test('usage errors exit 2', () => {
  assert.equal(cli([]).code, 2);
  assert.equal(cli([join(dir, 'nope.md')]).code, 2);
});

/** A one-page PDF whose text layer holds `text` (hand-written, no tools). */
function makePdf(file, text) {
  const stream = `BT /F1 12 Tf 72 700 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(file, body, 'latin1');
  return file;
}

test('pdf without pdftotext is NOT checked, and the command fails instead of saying clean', () => {
  const f = join(dir, 'x.pdf');
  writeFileSync(f, '%PDF-1.4');
  const r = scanFile(f, { pdftotext: null });
  assert.ok(r.skipped);
  assert.match(r.skipped, /NOT checked/);
  const noTool = { ...process.env, PATH: '', Path: '', LOCALAPPDATA: '' };
  if (!findPdftotext({ pathEnv: '', localAppData: '' })) {
    const c = spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8', env: noTool });
    assert.equal(c.status, 1);
    assert.match(c.stdout, /NOT CHECKED/);
    assert.doesNotMatch(c.stdout, /Nothing to fix/);
  }
});

test('pdf with pdftotext: a label in the text layer is found', { skip: findPdftotext() ? false : 'no pdftotext on this computer' }, () => {
  const bad = makePdf(join(dir, 'bad.pdf'), 'Margin will rise [Inference] and [TBD] too');
  const r = scanFile(bad);
  assert.equal(r.skipped, undefined);
  assert.deepEqual(r.hits.map((h) => h.match).sort(), ['[Inference]', '[TBD]']);
  assert.match(r.hits[0].location, /^page 1/);
  const good = makePdf(join(dir, 'good.pdf'), 'Margins rose in the year');
  assert.deepEqual(scanFile(good).hits, []);
  assert.equal(cli([good]).code, 0);
  assert.equal(cli([bad]).code, 1);
});

test('docx: placeholder found', { skip }, () => {
  const f = makeDocx(join(dir, 'a.docx'), ['Cover', 'Team: [Teammate name]']);
  const r = scanFile(f);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].location, 'paragraph 2');
});

test('pptx: slide text and speaker notes are both read', { skip }, () => {
  const f = makePptx(join(dir, 'a.pptx'), [
    { title: 'Click to add title', texts: [], notes: 'fine' },
    { title: 'Costs fell in Q3', texts: ['ok'], notes: 'Say this [Inference] only' },
  ]);
  const r = scanFile(f);
  const locs = r.hits.map((h) => h.location).sort();
  assert.deepEqual(locs, ['slide 1', 'slide 2 notes']);
});

test('xlsx: text cell label found, numbers ignored', { skip }, () => {
  const sheets = cleanSheets();
  sheets[0].cells.push({ ref: 'F1', s: 'Source: [Unverified] estimate' });
  const f = makeXlsx(join(dir, 'a.xlsx'), sheets);
  const r = scanFile(f);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].location, 'Model!F1');
});
