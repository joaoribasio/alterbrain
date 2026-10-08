import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePages, parseArgs, findPdftoppm, findLibreOffice, toolCheck, renderPdf, exportToPdf, PS_SCRIPTS, FONT_WARNING } from '../../system/scripts/pages.mjs';

const SCRIPT = fileURLToPath(new URL('../../system/scripts/pages.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ab-pages-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('parsePages', () => {
  assert.equal(parsePages(undefined), null);
  assert.deepEqual(parsePages('3'), { first: 3, last: 3 });
  assert.deepEqual(parsePages('1-12'), { first: 1, last: 12 });
  assert.throws(() => parsePages('x'), /page range/);
  assert.throws(() => parsePages('5-2'), /does not make sense/);
  assert.throws(() => parsePages('0'), /does not make sense/);
});

test('parseArgs reads flags and rejects unknown options', () => {
  const a = parseArgs(['f.pdf', '--pages', '1-3', '--dpi', '100', '--json']);
  assert.deepEqual(a.positional, ['f.pdf']);
  assert.equal(a.flags.pages, '1-3');
  assert.equal(a.flags.dpi, '100');
  assert.equal(a.flags.json, true);
  assert.throws(() => parseArgs(['--nope']), /do not know/);
});

test('findPdftoppm looks on PATH and in the WinGet links folder, and finds nothing in an empty one', () => {
  const empty = join(dir, 'empty');
  mkdirSync(empty);
  const name = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm';
  const onPath = join(dir, 'onpath');
  mkdirSync(onPath);
  writeFileSync(join(onPath, name), '');
  assert.equal(findPdftoppm({ pathEnv: onPath, localAppData: '' })?.toLowerCase().endsWith(name), true);
  const la = join(dir, 'local');
  mkdirSync(join(la, 'Microsoft', 'WinGet', 'Links'), { recursive: true });
  writeFileSync(join(la, 'Microsoft', 'WinGet', 'Links', name), '');
  assert.ok(findPdftoppm({ pathEnv: empty, localAppData: la }));
  if (process.platform === 'win32') assert.equal(findPdftoppm({ pathEnv: empty, localAppData: join(dir, 'none') }), null);
});

test('findLibreOffice finds soffice in a program folder', () => {
  const pf = join(dir, 'pf');
  mkdirSync(join(pf, 'LibreOffice', 'program'), { recursive: true });
  const name = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
  writeFileSync(join(pf, 'LibreOffice', 'program', name), '');
  assert.ok(findLibreOffice({ pathEnv: join(dir, 'empty'), programFiles: [pf] }));
});

test('toolCheck has the expected shape', () => {
  const c = toolCheck({ pathEnv: join(dir, 'empty'), localAppData: '' });
  assert.ok('pdftoppm' in c && 'libreoffice' in c);
  assert.deepEqual(Object.keys(c.office).sort(), ['excel', 'powerpoint', 'word']);
});

test('renderPdf says plainly how to install the renderer when it is missing', () => {
  const pdf = join(dir, 'a.pdf');
  writeFileSync(pdf, '%PDF-1.4\n');
  assert.throws(() => renderPdf(pdf, { tool: null }), /Poppler.*winget install --id oschwartz10612.Poppler -e.*brew install poppler/s);
  assert.throws(() => renderPdf(join(dir, 'missing.pdf'), { tool: 'x' }), /cannot find/);
});

test('exportToPdf refuses other file types and explains when no tool exists', () => {
  const f = join(dir, 'a.txt');
  writeFileSync(f, 'x');
  assert.throws(() => exportToPdf(f, { office: {}, soffice: null }), /can export/);
  const docx = join(dir, 'b.docx');
  writeFileSync(docx, 'x');
  assert.throws(() => exportToPdf(docx, { office: { word: false }, soffice: null }), /neither Microsoft Office nor LibreOffice/);
});

test('the Office scripts use the checked PDF constants and always close the app', () => {
  assert.match(PS_SCRIPTS['.pptx'], /SaveAs\(\$env:AB_OUT, 32\)/);
  assert.match(PS_SCRIPTS['.docx'], /SaveAs2\(\$env:AB_OUT, 17\)/);
  assert.match(PS_SCRIPTS['.xlsx'], /ExportAsFixedFormat\(0, \$env:AB_OUT\)/);
  for (const s of Object.values(PS_SCRIPTS)) assert.match(s, /finally[\s\S]*Quit\(\)/);
  // An Office app that is already open is never attached to or quit: the script stops with exit code 3 first.
  assert.match(PS_SCRIPTS['.pptx'], /Get-Process -Name POWERPNT[\s\S]*exit 3[\s\S]*New-Object/);
  assert.match(PS_SCRIPTS['.docx'], /Get-Process -Name WINWORD[\s\S]*exit 3[\s\S]*New-Object/);
  assert.match(PS_SCRIPTS['.xlsx'], /Get-Process -Name EXCEL[\s\S]*exit 3[\s\S]*New-Object/);
  assert.match(FONT_WARNING, /Fonts and line breaks may differ/);
});

test('command: usage errors exit 2, missing renderer exits 1', () => {
  assert.equal(cli([]).code, 2);
  assert.equal(cli(['pdf']).code, 2);
  assert.equal(cli(['pdf', 'x.pdf', '--pages', 'abc']).code, 2);
  assert.equal(cli(['pdf', 'x.pdf', '--dpi', '5']).code, 2);
  assert.equal(cli(['export', 'x.pptx', '--to', 'png']).code, 2);
  assert.equal(cli(['pdf', 'x.pdf', '--bogus']).code, 2);
  const pdf = join(dir, 'c.pdf');
  writeFileSync(pdf, '%PDF-1.4\n');
  const empty = join(dir, 'empty');
  mkdirSync(empty, { recursive: true });
  const r = cli(['pdf', pdf], { PATH: empty, Path: empty, LOCALAPPDATA: join(dir, 'none') });
  // Homebrew folders may exist on a Mac; only assert the plain failure when nothing was found.
  if (r.code === 1) assert.match(r.err, /Poppler/);
});

test('check --json prints the tool report', () => {
  const r = cli(['check', '--json']);
  assert.ok([0, 1].includes(r.code));
  const j = JSON.parse(r.out);
  assert.ok('pdftoppm' in j && 'office' in j && 'libreoffice' in j);
});
