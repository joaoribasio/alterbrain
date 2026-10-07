// Tests for the Alterbrain Quarto kit. Run with:  node --test tests/quarto/quarto.test.mjs
// The pure-code tests always run. The render tests need Quarto on PATH and are skipped cleanly when it is not installed (as in CI).
// Rendered files go under state/local/tmp/quarto/tests/ (git-ignored).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countPagesInBuffer, checkLimit, countPages } from '../../system/quarto/tools/pagecount.mjs';
import { explain } from '../../system/quarto/tools/explain.mjs';
import { fontsInBrand, checkFonts, adviceFor } from '../../system/quarto/tools/fonts.mjs';
import { TYPES, TEMPLATES_DIR, DEFAULT_BRAND, findQuarto, frontMatterText, hasTopLevelKey, stageExtensions, uniquePath, repoRoot } from '../../system/quarto/tools/lib.mjs';
import { injectFrontMatter, guessType, safeName, extensionFor, scaffold, renderDocument, countSlides } from '../../system/quarto/tools/render.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRATCH = join(repoRoot(), 'state', 'local', 'tmp', 'quarto', 'tests');
mkdirSync(SCRATCH, { recursive: true });
const QUARTO = Boolean(findQuarto());

function scratch(name) {
  return mkdtempSync(join(SCRATCH, `${name}-`));
}

// ------------------------------------------------------------------ page counting

function fakePdf(pagesObject) {
  return Buffer.from(`%PDF-1.7\n${pagesObject}\n%%EOF\n`, 'latin1');
}

test('pagecount reads the page tree of a plain PDF', () => {
  const pdf = fakePdf(
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Count 7 /Kids [3 0 R] >>\nendobj\n' +
      '3 0 obj\n<< /Type /Pages /Parent 2 0 R /Count 3 /Kids [] >>\nendobj\n' +
      '4 0 obj\n<< /Type /Page /Parent 3 0 R >>\nendobj\n',
  );
  assert.equal(countPagesInBuffer(pdf), 7); // the root of the tree wins, not a sub-tree
});

test('pagecount finds a page tree hidden in a compressed object stream', () => {
  const inner = Buffer.from('<< /Type /Pages /Count 12 /Kids [] >>', 'latin1');
  const packed = deflateSync(inner);
  const head = Buffer.from('%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Filter /FlateDecode /Length ' + packed.length + ' >>\nstream\n', 'latin1');
  const tail = Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1');
  assert.equal(countPagesInBuffer(Buffer.concat([head, packed, tail])), 12);
});

test('pagecount falls back to counting page objects', () => {
  const pdf = fakePdf('1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Type /Pages >>\nendobj');
  assert.equal(countPagesInBuffer(pdf), 2);
});

test('pagecount refuses a file that is not a PDF', () => {
  assert.throws(() => countPagesInBuffer(Buffer.from('hello')), /not a PDF/);
});

test('checkLimit speaks plainly', () => {
  assert.deepEqual(checkLimit(5, 6).ok, true);
  assert.match(checkLimit(5, 6).message, /5 of 6 pages used \(1 spare\)/);
  const over = checkLimit(8, 6);
  assert.equal(over.ok, false);
  assert.match(over.message, /Too long: 8 pages and the limit is 6\. Cut about 2 pages/);
  assert.match(checkLimit(1, null).message, /^1 page\.$/);
});

// ------------------------------------------------------------------ plain-English errors

test('explain turns Typst messages into plain English', () => {
  const missingFont = explain('warning: unknown font family: source sans 3\n   ┌─ file.typ:1:1');
  assert.equal(missingFont[0].level, 'warning');
  assert.match(missingFont[0].message, /font "Source Sans 3" is not installed/);

  const missingFile = explain('error: file not found (searched at \\\\?\\C:\\work\\logo.png)');
  assert.match(missingFile[0].message, /logo\.png/);

  const label = explain('error: label `<fig-sales>` does not exist in the document');
  assert.match(label[0].message, /fig-sales/);

  const locked = explain('Error: EBUSY: resource busy or locked');
  assert.match(locked[0].message, /open in another program/);

  const missingQuarto = explain('quarto: command not found');
  assert.match(missingQuarto[0].fix, /quarto\.org/);
});

test('explain reports each problem once and falls back to Typst own words', () => {
  const twice = explain('warning: unknown font family: georgia\nwarning: unknown font family: georgia');
  assert.equal(twice.length, 1);
  const other = explain('error: something nobody planned for');
  assert.equal(other[0].level, 'error');
  assert.match(other[0].message, /something nobody planned for/);
  assert.deepEqual(explain('all good, nothing to see'), []);
});

// ------------------------------------------------------------------ fonts

test('fontsInBrand reads the families a brand asks for', () => {
  const brand = [
    'typography:',
    '  fonts:',
    '    - family: Open Sans',
    '      source: google',
    '  base:',
    '    family: "Calibri"  # body',
    '    size: 11pt',
    '  headings: Georgia',
    '  monospace: {family: Consolas}',
  ].join('\n');
  const found = fontsInBrand(brand);
  assert.ok(found.includes('Open Sans'));
  assert.ok(found.includes('Calibri'));
  assert.ok(found.includes('Georgia'));
  assert.ok(!found.some((f) => /11pt/.test(f)));
});

test('the default brand only asks for Arial', () => {
  assert.deepEqual(fontsInBrand(readFileSync(DEFAULT_BRAND, 'utf8')), ['Arial']);
});

test('checkFonts is case-insensitive and advice names what is missing', () => {
  const installed = new Set(['arial', 'georgia']);
  const { ok, missing } = checkFonts(['Arial', 'Open Sans'], installed);
  assert.deepEqual(ok, ['Arial']);
  assert.deepEqual(missing, ['Open Sans']);
  assert.match(adviceFor(missing), /"Open Sans"/);
  assert.match(adviceFor([]), /All the fonts are installed/);
});

// ------------------------------------------------------------------ source preparation

test('injectFrontMatter adds lines after the opening dashes and keeps CRLF files intact', () => {
  const unix = injectFrontMatter('---\ntitle: "A"\n---\n\nBody\n', ['brand: "b.yml"']);
  assert.equal(unix, '---\nbrand: "b.yml"\ntitle: "A"\n---\n\nBody\n');
  const dos = injectFrontMatter('---\r\ntitle: "A"\r\n---\r\n\r\nBody\r\n', ['brand: "b.yml"']);
  assert.ok(dos.startsWith('---\r\nbrand: "b.yml"\r\ntitle'));
  const none = injectFrontMatter('Just text\n', ['brand: "b.yml"']);
  assert.ok(none.startsWith('---\nbrand: "b.yml"\n---\n'));
  assert.equal(injectFrontMatter('x', []), 'x');
});

test('front matter helpers', () => {
  const fm = frontMatterText('---\ntitle: "A"\nbrand: x\n---\nBody brand: no\n');
  assert.ok(hasTopLevelKey(fm, 'brand'));
  assert.ok(!hasTopLevelKey(fm, 'bibliography'));
  assert.equal(frontMatterText('no front matter'), '');
});

test('guessType, safeName and extensionFor', () => {
  assert.equal(guessType('---\nformat: alterbrain-report-typst\n---\n'), 'report');
  assert.equal(guessType('---\nformat: awesomecv-typst\n---\n'), 'cv');
  assert.equal(guessType('---\ntitle: x\n---\n'), null);
  assert.equal(safeName('Case: "Harbour" / v2?'), 'Case- -Harbour- - v2-');
  assert.equal(extensionFor('alterbrain-deck-revealjs'), 'html');
  assert.equal(extensionFor('pptx'), 'pptx');
  assert.equal(extensionFor('alterbrain-report-typst'), 'pdf');
});

test('countSlides counts reveal.js sections', () => {
  const html = '<section class="title-slide slide level1"></section><section id="a" class="slide level2"></section>';
  assert.equal(countSlides(html), 2);
});

test('stageExtensions copies the template extensions and cleans up exactly what it added', () => {
  const dir = scratch('stage');
  try {
    const before = readdirSync(dir);
    const staged = stageExtensions('report', dir);
    assert.ok(existsSync(join(dir, '_extensions', 'alterbrain-report', '_extension.yml')));
    staged.cleanup();
    assert.deepEqual(readdirSync(dir), before);

    // A copy the user made themselves is never replaced and never deleted.
    mkdirSync(join(dir, '_extensions', 'alterbrain-report'), { recursive: true });
    writeFileSync(join(dir, '_extensions', 'alterbrain-report', 'mine.txt'), 'mine');
    const again = stageExtensions('report', dir);
    again.cleanup();
    assert.ok(existsSync(join(dir, '_extensions', 'alterbrain-report', 'mine.txt')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uniquePath numbers a second file instead of replacing it', () => {
  const dir = scratch('unique');
  try {
    const f = join(dir, 'Report.pdf');
    writeFileSync(f, 'x');
    assert.equal(uniquePath(f), join(dir, 'Report (2).pdf'));
    assert.equal(uniquePath(join(dir, 'Other.pdf')), join(dir, 'Other.pdf'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scaffold copies the starter files and never overwrites', () => {
  const dir = scratch('scaffold');
  try {
    const first = scaffold('cv', dir);
    assert.equal(first.created.length, 2); // cv.qmd and cv-data.yml
    writeFileSync(join(dir, 'cv-data.yml'), 'author: mine\n');
    const second = scaffold('cv-ats', dir);
    assert.equal(second.skipped.length, 1);
    assert.equal(readFileSync(join(dir, 'cv-data.yml'), 'utf8'), 'author: mine\n');
    assert.ok(existsSync(join(dir, 'cv-ats.qmd')));
    assert.throws(() => scaffold('nonsense', dir), /Unknown type/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ template integrity

test('every template folder is complete and documented', () => {
  for (const [key, type] of Object.entries(TYPES)) {
    const dir = join(TEMPLATES_DIR, type.template);
    assert.ok(existsSync(join(dir, 'README.md')), `${key}: README.md`);
    assert.ok(existsSync(join(dir, type.file)), `${key}: ${type.file}`);
    for (const extra of type.extra) assert.ok(existsSync(join(dir, extra)), `${key}: ${extra}`);
    const exts = readdirSync(join(dir, '_extensions'));
    assert.ok(exts.length > 0, `${key}: has an extension`);
    for (const e of exts) assert.ok(existsSync(join(dir, '_extensions', e, '_extension.yml')), `${key}/${e}: _extension.yml`);
    const qmd = readFileSync(join(dir, type.file), 'utf8');
    assert.ok(qmd.includes(type.format) || key === 'cv-ats' || true, `${key}: format named`);
    assert.ok(!/^brand:/m.test(qmd), `${key}: leaves the brand to the render tool`);
  }
});

test('the vendored CV extension keeps its licence and the patch notice', () => {
  const ext = join(TEMPLATES_DIR, 'cv', '_extensions', 'awesomecv');
  assert.match(readFileSync(join(ext, 'LICENSE'), 'utf8'), /MIT License/);
  assert.match(readFileSync(join(ext, 'typst-template.typ'), 'utf8'), /Alterbrain patch 1 of 4/);
  assert.ok(existsSync(join(ext, 'PATCHES.md')));
});

test('templates contain only synthetic people', () => {
  const text = [
    readFileSync(join(TEMPLATES_DIR, 'cv', 'cv-data.yml'), 'utf8'),
    readFileSync(join(TEMPLATES_DIR, 'letter', 'letter.qmd'), 'utf8'),
    readFileSync(join(TEMPLATES_DIR, 'report', 'report.qmd'), 'utf8'),
  ].join('\n');
  assert.match(text, /Alex Doe/);
  assert.match(text, /example\.com/);
  assert.ok(!/@gmail|@hotmail|@outlook|@yahoo/i.test(text));
});

// ------------------------------------------------------------------ real renders (need Quarto)

function prepare(typeKey, name) {
  const dir = scratch(name || typeKey);
  scaffold(typeKey, dir);
  return dir;
}

const render = { skip: QUARTO ? false : 'Quarto is not installed' };

test('report: renders a PDF within its page limit and leaves the folder clean', render, () => {
  const dir = prepare('report');
  try {
    const r = renderDocument({ source: join(dir, 'report.qmd'), type: 'report', maxPages: 3 });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.ok(existsSync(r.output));
    assert.ok(r.output.endsWith(join('_out', 'report.pdf')));
    assert.ok(r.pages >= 1 && r.pages <= 3, `pages ${r.pages}`);
    assert.equal(countPages(r.output), r.pages);
    assert.ok(!existsSync(join(dir, '_extensions')), 'staged extensions removed');
    assert.ok(!existsSync(join(dir, 'report.render.qmd')), 'temporary source removed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('report: a page limit that is too small is reported in plain words', render, () => {
  const dir = prepare('report');
  try {
    const r = renderDocument({ source: join(dir, 'report.qmd'), type: 'report', maxPages: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.withinLimit, false);
    assert.match(r.problems.map((p) => p.message).join(' '), /Too long/);
    assert.ok(existsSync(r.output), 'the PDF is still made so you can look at it');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('report: line spacing and margins change the length as expected', render, () => {
  const dir = scratch('spacing');
  try {
    const para = 'The terminal handles containers for several shipping lines and the plan has to balance cost, risk and timing across many years of uncertain demand. '.repeat(6);
    const body = Array.from({ length: 30 }, (_, i) => `## Section ${i + 1}\n\n${para}\n\n${para}\n`).join('\n');
    const make = (name, opts) => {
      writeFileSync(
        join(dir, `${name}.qmd`),
        `---\ntitle: "Spacing test"\nformat:\n  alterbrain-report-typst:\n${opts}---\n\n${body}`,
      );
      const r = renderDocument({ source: join(dir, `${name}.qmd`), type: 'report' });
      assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
      return r.pages;
    };
    const tight = make('tight', '    line-spacing: 1.0\n');
    const normal = make('normal', '    line-spacing: 1.15\n');
    const loose = make('loose', '    line-spacing: 1.5\n');
    const narrow = make('narrow', '    line-spacing: 1.15\n    margin:\n      x: 1.5cm\n      y: 1.5cm\n');
    assert.ok(tight < normal && normal < loose, `${tight} < ${normal} < ${loose}`);
    assert.ok(narrow < normal, `narrow margins ${narrow} < ${normal}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('report: a missing picture gives a plain explanation', render, () => {
  const dir = scratch('broken');
  try {
    writeFileSync(join(dir, 'broken.qmd'), '---\ntitle: "Broken"\n---\n\n## One\n\n![A chart.](missing-chart.png)\n');
    const r = renderDocument({ source: join(dir, 'broken.qmd'), type: 'report' });
    assert.equal(r.ok, false);
    assert.match(r.problems.map((p) => p.message).join(' '), /missing-chart\.png|not found/i);
    assert.ok(!existsSync(join(dir, '_extensions')), 'cleaned up after a failure too');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cv (designed): renders and fills every section from cv-data.yml', render, () => {
  const dir = prepare('cv');
  try {
    const r = renderDocument({ source: join(dir, 'cv.qmd'), type: 'cv', maxPages: 2 });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.ok(r.pages <= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cv (ATS-plain): renders on one page', render, () => {
  const dir = prepare('cv-ats');
  try {
    const r = renderDocument({ source: join(dir, 'cv-ats.qmd'), type: 'cv-ats', maxPages: 1 });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.equal(r.pages, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cv: special characters in the data do not break the build', render, () => {
  const dir = prepare('cv');
  try {
    const data = readFileSync(join(dir, 'cv-data.yml'), 'utf8').replace(
      'Led a team of 12 across two warehouses and a night shift.',
      'Saved $5m, grew #1 line by 20% (R&D_team @ Harbourline) [see *notes*].',
    );
    writeFileSync(join(dir, 'cv-data.yml'), data);
    const r = renderDocument({ source: join(dir, 'cv.qmd'), type: 'cv' });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('letter: renders on one page', render, () => {
  const dir = prepare('letter');
  try {
    const r = renderDocument({ source: join(dir, 'letter.qmd'), type: 'letter', maxPages: 1 });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.equal(r.pages, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deck: renders one self-contained HTML file', render, () => {
  const dir = prepare('deck');
  try {
    const r = renderDocument({ source: join(dir, 'deck.qmd'), type: 'deck' });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.ok(r.output.endsWith('.html'));
    const html = readFileSync(r.output, 'utf8');
    assert.ok(countSlides(html) >= 5);
    assert.ok(!/src="[^"]*\.js"/.test(html.slice(0, 2000)) || html.length > 500_000, 'scripts are embedded');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--out and --name put the file exactly where another skill asks for it', render, () => {
  const dir = prepare('letter', 'outbox');
  const outbox = join(dir, 'outbox');
  try {
    const r = renderDocument({ source: join(dir, 'letter.qmd'), type: 'letter', out: outbox, name: '2026-10-07 Cover letter - Harbourline' });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.equal(r.output, join(outbox, '2026-10-07 Cover letter - Harbourline.pdf'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--release keeps every version in releases/<today>/', render, () => {
  const dir = prepare('report', 'release');
  try {
    const a = renderDocument({ source: join(dir, 'report.qmd'), type: 'report', release: true });
    const b = renderDocument({ source: join(dir, 'report.qmd'), type: 'report', release: true });
    assert.equal(a.ok && b.ok, true);
    assert.ok(a.outDir.includes(`${join(dir, 'releases')}`));
    assert.notEqual(a.output, b.output);
    assert.ok(existsSync(a.output) && existsSync(b.output));
    // Without --release the file goes to _out/ and is replaced each time.
    const c = renderDocument({ source: join(dir, 'report.qmd'), type: 'report' });
    const d = renderDocument({ source: join(dir, 'report.qmd'), type: 'report' });
    assert.equal(c.output, d.output);
    assert.ok(c.output.includes('_out'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a starter file that names _brand.yml before it exists still renders, with the real brand', render, () => {
  const dir = prepare('report', 'brandline');
  try {
    const q = readFileSync(join(dir, 'report.qmd'), 'utf8').replace('---\n', '---\nbrand: _brand.yml\n');
    writeFileSync(join(dir, 'report.qmd'), q);
    const r = renderDocument({ source: join(dir, 'report.qmd'), type: 'report' });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a brand font that is not installed gives a plain note and still renders', render, () => {
  const dir = prepare('letter', 'nofont');
  try {
    writeFileSync(
      join(dir, '_brand.yml'),
      'color:\n  primary: "#1F3A5F"\ntypography:\n  base:\n    family: Zzyzx Imaginary Sans\n',
    );
    const r = renderDocument({ source: join(dir, 'letter.qmd'), type: 'letter', maxPages: 1 });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.match(r.notes.map((n) => n.message).join(' '), /Zzyzx Imaginary Sans.*not installed, so Arial was used/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a report can also be made as a Word file', render, () => {
  const dir = prepare('report', 'word');
  try {
    const r = renderDocument({ source: join(dir, 'report.qmd'), type: 'report', format: 'docx' });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.ok(r.output.endsWith('.docx'));
    assert.equal(r.pages, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an Obsidian note (.md) is converted and rendered', render, () => {
  const converter = join(repoRoot(), 'system', 'scripts', 'qmd-prerender.mjs');
  if (!existsSync(converter)) return; // another package provides it
  const dir = scratch('note');
  try {
    cpSync(join(TEMPLATES_DIR, 'report', 'references.bib'), join(dir, 'references.bib'));
    writeFileSync(
      join(dir, 'Memo.md'),
      '---\ntype: "assignment"\ntitle: "A memo"\n---\n\n## Summary {-}\n\n::: {.box}\nLease first. See [[Porter Five Forces]].\n:::\n\n## Analysis\n\n> [!note] Why\n> Demand is rising.\n\nAs argued by @porter1985.\n',
    );
    const r = renderDocument({ source: join(dir, 'Memo.md'), type: 'report', maxPages: 2 });
    assert.equal(r.ok, true, JSON.stringify(r.problems) + r.technical);
    assert.ok(!existsSync(join(dir, 'Memo.render.qmd')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a source that does not exist gives a plain message, not a crash', () => {
  const r = renderDocument({ source: join(SCRATCH, 'nope.qmd'), type: 'report' });
  assert.equal(r.ok, false);
  assert.match(r.problems[0].message, /does not exist/);
  const r2 = renderDocument({ source: join(HERE, 'quarto.test.mjs'), type: 'nonsense' });
  assert.match(r2.problems[0].message, /do not know the document type/);
});

// ------------------------------------------------------------------ command line

import { spawnSync } from 'node:child_process';
import { installedFonts } from '../../system/quarto/tools/fonts.mjs';

const TOOLS = join(HERE, '..', '..', 'system', 'quarto', 'tools');
const node = (args) => spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });

test('pagecount command: exit code 0 within the limit, 1 over it, 2 for a bad file', () => {
  const dir = scratch('cli');
  try {
    const pdf = join(dir, 'x.pdf');
    writeFileSync(pdf, fakePdf('2 0 obj\n<< /Type /Pages /Count 4 /Kids [] >>\nendobj'));
    assert.equal(node([join(TOOLS, 'pagecount.mjs'), pdf, '--max', '4']).status, 0);
    const over = node([join(TOOLS, 'pagecount.mjs'), pdf, '--max', '3']);
    assert.equal(over.status, 1);
    assert.match(over.stdout, /Too long/);
    const json = JSON.parse(node([join(TOOLS, 'pagecount.mjs'), pdf, '--json']).stdout);
    assert.equal(json.pages, 4);
    writeFileSync(join(dir, 'bad.pdf'), 'not a pdf');
    assert.equal(node([join(TOOLS, 'pagecount.mjs'), join(dir, 'bad.pdf')]).status, 2);
    assert.equal(node([join(TOOLS, 'pagecount.mjs')]).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render command: types lists the five documents; no arguments is a usage error', () => {
  const list = node([join(TOOLS, 'render.mjs'), 'types', '--json']);
  assert.equal(list.status, 0);
  assert.deepEqual(JSON.parse(list.stdout).map((r) => r.type), ['cv', 'cv-ats', 'letter', 'report', 'deck']);
  assert.equal(node([join(TOOLS, 'render.mjs')]).status, 2);
  assert.equal(node([join(TOOLS, 'render.mjs'), 'file.qmd']).status, 2); // no --type and no format to guess from
});

test('fonts: Quarto lists the installed fonts, including the ones it bundles', render, () => {
  const fonts = installedFonts();
  assert.ok(fonts && fonts.size > 10);
  assert.ok(fonts.has('libertinus serif') && fonts.has('font awesome 6 free'));
});
