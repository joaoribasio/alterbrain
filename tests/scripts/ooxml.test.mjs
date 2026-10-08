import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipTool, listParts, readPart, docxText, pptxSlides, xlsxCells, theme, slideLayouts, decodeXml } from '../../system/lib/ooxml.mjs';
import { makeDocx, makePptx, makeXlsx, cleanSheets } from '../fixtures/scripts/deliverables/builders.mjs';

const tool = zipTool();
const skip = tool ? false : 'no bsdtar on this computer';
const dir = mkdtempSync(join(tmpdir(), 'ab-ooxml-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('decodeXml handles named and numeric references', () => {
  assert.equal(decodeXml('a &amp; b &lt;c&gt; &#65;&#x42;'), 'a & b <c> AB');
});

test('docxText reads body and footer, with a placeholder visible', { skip }, () => {
  const f = makeDocx(join(dir, 'a.docx'), ['Intro line', 'Team: [Teammate name]'], { footer: ['Page footer'] });
  const t = docxText(f);
  assert.match(t, /Intro line/);
  assert.match(t, /\[Teammate name\]/);
  assert.match(t, /Page footer/);
  assert.ok(listParts(f).includes('word/document.xml'));
  assert.equal(readPart(f, 'word/nothing.xml'), null);
});

test('pptxSlides gives title, texts, notes, chart and table flags', { skip }, () => {
  const f = makePptx(join(dir, 'a.pptx'), [
    { title: 'Margins fell because freight costs rose', texts: ['Point one'], notes: 'Say this slowly', chart: true },
    { title: 'Next steps', texts: ['Do it'], table: true },
  ]);
  const s = pptxSlides(f);
  assert.equal(s.length, 2);
  assert.equal(s[0].title, 'Margins fell because freight costs rose');
  assert.deepEqual(s[0].texts, ['Point one']);
  assert.equal(s[0].notes, 'Say this slowly');
  assert.equal(s[0].hasChart, true);
  assert.equal(s[0].hasTable, false);
  assert.equal(s[1].hasTable, true);
  assert.equal(s[1].notes, '');
  assert.deepEqual(slideLayouts(f), ['Title Slide', 'Title and Content']);
  const th = theme(f);
  assert.equal(th.colours.accent1, '0B6E4F');
  assert.equal(th.colours.dk1, '000000');
  assert.equal(th.fonts.major, 'Georgia');
  assert.equal(th.fonts.minor, 'Calibri');
});

test('xlsxCells reads shared strings, formulas, cached values and errors', { skip }, () => {
  const sheets = cleanSheets();
  sheets[0].cells.push({ ref: 'E1', f: 'B1/0', v: '#DIV/0!', t: 'e' });
  const f = makeXlsx(join(dir, 'a.xlsx'), sheets);
  const r = xlsxCells(f);
  assert.deepEqual(r.sheets.map((s) => s.name), ['Model', 'Assumptions']);
  const cells = r.sheets[0].cells;
  assert.deepEqual(cells[0], { ref: 'A1', formula: null, value: 'Revenue', type: 'string' });
  assert.equal(cells[2].formula, 'B1*Assumptions!B2');
  assert.equal(cells[2].value, '120');
  assert.equal(cells[4].type, 'error');
});

test('a file that is not a zip throws a plain sentence', { skip }, () => {
  const bad = join(dir, 'bad.docx');
  writeFileSync(bad, 'not a zip');
  assert.throws(() => docxText(bad), /cannot open/);
});

test('missing zip tool throws a plain sentence', () => {
  const r = import('node:child_process').then(({ spawnSync }) =>
    spawnSync(process.execPath, ['-e', "import('./system/lib/ooxml.mjs').then(m=>{try{m.listParts('x.docx')}catch(e){console.log(e.message)}})"], {
      encoding: 'utf8',
      cwd: join(import.meta.dirname, '..', '..'),
      env: { ...process.env, ALTERBRAIN_NO_ZIP_TOOL: '1' },
    }),
  );
  return r.then((x) => assert.match(x.stdout, /no zip tool/));
});
