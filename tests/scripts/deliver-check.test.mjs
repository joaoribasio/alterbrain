import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPdftotext } from '../../system/scripts/release-scan.mjs';
import { checkFiles, checkTitle, checkSlides, qmdSlides, isDeckQmd } from '../../system/scripts/deliver-check.mjs';
import { zipTool } from '../../system/lib/ooxml.mjs';
import { makeDocx, makePptx, makeXlsx, cleanSheets } from '../fixtures/scripts/deliverables/builders.mjs';

const SCRIPT = fileURLToPath(new URL('../../system/scripts/deliver-check.mjs', import.meta.url));
const skip = zipTool() ? false : 'no bsdtar on this computer';
const root = mkdtempSync(join(tmpdir(), 'ab-dcheck-'));
test.after(() => rmSync(root, { recursive: true, force: true }));
let counter = 0;
const fresh = () => {
  const d = join(root, `set${counter++}`);
  mkdirSync(d);
  return d;
};

const goodDeck = (f, over = []) =>
  makePptx(f, [
    { title: 'Team Alpha, MBA programme', texts: ['Strategy case'] },
    { title: 'Freight costs explain the margin fall', texts: ['Point', 'Source: company reports, 2025'], chart: true },
    ...over,
  ]);

test('checkTitle: sentences of 4+ words and 90 characters at most', () => {
  assert.deepEqual(checkTitle('Freight costs explain the margin fall', 2), []);
  assert.equal(checkTitle('Margin overview here', 2).length, 1);
  assert.equal(checkTitle('', 2)[0].detail, 'The slide has no title.');
  assert.equal(checkTitle('Appendix', 5).length, 0);
  assert.equal(checkTitle('word '.repeat(30).trim(), 2).length, 1);
});

test('checkSlides: cover is exempt, chart without source fails', () => {
  const p = checkSlides([
    { n: 1, title: 'Cover', texts: [], hasChart: false, hasTable: false },
    { n: 2, title: 'Costs fell by a fifth in a year', texts: ['x'], hasChart: true, hasTable: false },
  ]);
  assert.deepEqual(p.map((x) => x.check), ['source-line']);
});

test('qmd deck: the first content slide is checked, there is no cover slide to hide behind', () => {
  const t = ['---', 'title: "Strategy case"', 'format: pptx', '---', '## Margins', 'x', '## Costs fell by a fifth in a year', '| a | b |', '|---|---|', '| 1 | 2 |', '## Revenue grew faster than costs', '![chart](c.png)', '*Source: annual report*'].join('\n');
  assert.equal(isDeckQmd(t), true);
  const s = qmdSlides(t);
  assert.equal(s.length, 3);
  assert.equal(s[1].hasTable, true);
  const p = checkSlides(s, { coverFirst: false });
  assert.deepEqual(p.map((x) => `${x.check}@${x.location}`), ['slide-title@slide 1', 'source-line@slide 2']);
  assert.equal(isDeckQmd('---\nformat: pdf\n---\n## x'), false);
});

test('qmd deck: a .title-slide heading is the cover and is exempt', () => {
  const t = ['---', 'format: pptx', '---', '## Strategy {.title-slide}', '## Costs fell by a fifth in a year'].join('\n');
  assert.deepEqual(checkSlides(qmdSlides(t), { coverFirst: false }), []);
});

test('checkTitle: structural titles are fine, an allow pattern covers a rubric', () => {
  for (const t of ['Executive summary', 'Agenda', 'Next steps', 'Questions', 'Thank you', 'Summary', 'Appendix A: Data tables', 'References']) {
    assert.deepEqual(checkTitle(t, 3), [], t);
  }
  assert.equal(checkTitle('Sources of margin', 3).length, 1);
  assert.equal(checkTitle('Analysis', 3).length, 1);
  assert.deepEqual(checkTitle('Analysis', 3, /^(Introduction|Analysis|Conclusion)$/i), []);
});

test('a clean set passes', { skip }, () => {
  const d = fresh();
  const files = [
    makeDocx(join(d, 'Team5_Case.docx'), ['Cover: Team Alpha, MBA', 'Body text']),
    goodDeck(join(d, 'Team5_Case.pptx')),
    makeXlsx(join(d, 'Team5_Case.xlsx'), cleanSheets()),
  ];
  const r = checkFiles(files, { maxMb: 10, baseName: true, namePattern: '^Team5_' });
  assert.deepEqual(r.files.flatMap((f) => f.problems), []);
  assert.equal(r.ok, true);
});

test('a placeholder fails', { skip }, () => {
  const d = fresh();
  const f = makeDocx(join(d, 'a.docx'), ['Team: [Teammate name]']);
  const r = checkFiles([f]);
  assert.equal(r.ok, false);
  assert.equal(r.files[0].problems[0].check, 'release-scan');
});

test('an oversize file fails', { skip }, () => {
  const d = fresh();
  const f = join(d, 'big.md');
  writeFileSync(f, 'x'.repeat(2 * 1048576));
  const r = checkFiles([f], { maxMb: 1 });
  assert.equal(r.files[0].problems[0].check, 'size');
});

test('mismatched base names and a file-name rule fail', { skip }, () => {
  const d = fresh();
  const a = join(d, 'Report_v1.md');
  const b = join(d, 'Deck_final.md');
  writeFileSync(a, 'ok');
  writeFileSync(b, 'ok');
  const r = checkFiles([a, b], { baseName: true, namePattern: '^Report' });
  assert.equal(r.set[0].check, 'base-name');
  assert.equal(r.files[1].problems[0].check, 'file-name');
});

test('an error cell fails', { skip }, () => {
  const d = fresh();
  const sheets = cleanSheets();
  sheets[0].cells.push({ ref: 'E1', f: 'B1/0', v: '#DIV/0!', t: 'e' });
  const r = checkFiles([makeXlsx(join(d, 'm.xlsx'), sheets)]);
  assert.equal(r.files[0].problems[0].check, 'workbook:error-cell');
});

test('a three-word title and a chart slide with no Source line fail', { skip }, () => {
  const d = fresh();
  const f = makePptx(join(d, 'd.pptx'), [
    { title: 'Cover', texts: [] },
    { title: 'Margin overview here', texts: ['x'] },
    { title: 'Freight costs explain the margin fall', texts: ['x'], chart: true },
  ]);
  const checks = checkFiles([f]).files[0].problems.map((p) => `${p.check}@${p.location}`);
  assert.deepEqual(checks, ['slide-title@slide 2', 'source-line@slide 3']);
});

test('command: exit codes and json', { skip }, () => {
  const d = fresh();
  const ok = makeDocx(join(d, 'ok.docx'), ['fine']);
  assert.equal(spawnSync(process.execPath, [SCRIPT, ok], { encoding: 'utf8' }).status, 0);
  const bad = makeDocx(join(d, 'bad.docx'), ['[TODO]']);
  const r = spawnSync(process.execPath, [SCRIPT, bad, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).ok, false);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, ok, '--max-mb', 'x'], { encoding: 'utf8' }).status, 2);
});

test('a PDF that cannot be read fails as not-checked, never as a pass', { skip }, () => {
  const d = fresh();
  const pdf = join(d, 'r.pdf');
  writeFileSync(pdf, '%PDF-1.4 [Inference] [TBD]');
  const r = checkFiles([pdf], { pdftotext: null });
  assert.equal(r.ok, false);
  assert.equal(r.files[0].problems[0].check, 'not-checked');
});

test('a PDF is covered by --source when the source passes, and fails when the source does not', { skip }, () => {
  const d = fresh();
  const pdf = join(d, 'r.pdf');
  writeFileSync(pdf, '%PDF-1.4');
  const good = makeDocx(join(d, 'r.docx'), ['Fine text']);
  assert.equal(checkFiles([pdf], { pdftotext: null, sources: [good] }).ok, true);
  const bad = makeDocx(join(d, 'bad.docx'), ['Team: [Company]']);
  const r = checkFiles([pdf], { pdftotext: null, sources: [bad] });
  assert.equal(r.ok, false);
  assert.match(r.files[0].problems[0].location, /^source bad\.docx/);
  const miss = checkFiles([pdf], { pdftotext: null, sources: [join(d, 'none.docx')] });
  assert.equal(miss.files[0].problems[0].check, 'not-checked');
});

test('a real PDF with a label in its text fails', { skip: findPdftotext() ? false : 'no pdftotext on this computer' }, () => {
  const d = fresh();
  const pdf = join(d, 'real.pdf');
  const stream = 'BT /F1 12 Tf 72 700 Td (Result [TBD] here) Tj ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let body = '%PDF-1.4\n';
  objs.forEach((o, i) => (body += `${i + 1} 0 obj\n${o}\nendobj\n`));
  body += 'trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n';
  writeFileSync(pdf, body, 'latin1');
  const r = checkFiles([pdf]);
  assert.equal(r.ok, false);
  assert.equal(r.files[0].problems[0].check, 'release-scan');
});

test('a placeholder in the cover details of a report qmd fails', { skip }, () => {
  const d = fresh();
  const f = join(d, 'report.qmd');
  writeFileSync(f, ['---', 'title: "[TBD] Strategy case"', 'author: "[Your name]"', 'format: pdf', '---', '{{< pagebreak >}}', 'Body.'].join('\n'));
  const r = checkFiles([f]);
  assert.deepEqual(r.files[0].problems.map((p) => p.location), ['line 2', 'line 3']);
});

test('--allow-titles and --skip-checks waive a check and say so', { skip }, () => {
  const d = fresh();
  const f = makePptx(join(d, 'd.pptx'), [
    { title: 'Cover', texts: [] },
    { title: 'Introduction', texts: ['x'] },
    { title: 'Analysis', texts: ['x'], chart: true },
  ]);
  assert.equal(checkFiles([f]).ok, false);
  assert.equal(checkFiles([f], { allowTitles: '^(Introduction|Analysis)$' }).files[0].problems.map((p) => p.check).join(), 'source-line');
  const r = checkFiles([f], { skipChecks: ['slide-title', 'source-line'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.waived, ['slide-title', 'source-line']);
  const cmd = spawnSync(process.execPath, [SCRIPT, f, '--skip-checks', 'slide-title,source-line'], { encoding: 'utf8' });
  assert.equal(cmd.status, 0);
  assert.match(cmd.stdout, /Waived checks: slide-title, source-line/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, f, '--skip-checks', 'nonsense'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, f, '--allow-titles', '('], { encoding: 'utf8' }).status, 2);
});

test('typed numbers in a workbook are advice and do not fail the gate', { skip }, () => {
  const d = fresh();
  const sheets = cleanSheets();
  sheets[0].cells.push({ ref: 'F1', f: 'B1*1.2', v: '120' });
  const r = checkFiles([makeXlsx(join(d, 'm.xlsx'), sheets)]);
  assert.equal(r.ok, true);
  assert.equal(r.files[0].warnings[0].check, 'workbook:literal-in-formula');
});
