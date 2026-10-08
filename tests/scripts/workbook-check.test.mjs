import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWorkbook, literalsIn } from '../../system/scripts/workbook-check.mjs';
import { zipTool } from '../../system/lib/ooxml.mjs';
import { makeXlsx, cleanSheets } from '../fixtures/scripts/deliverables/builders.mjs';

const SCRIPT = fileURLToPath(new URL('../../system/scripts/workbook-check.mjs', import.meta.url));
const skip = zipTool() ? false : 'no bsdtar on this computer';
const dir = mkdtempSync(join(tmpdir(), 'ab-wbc-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('literalsIn ignores references, functions, names, text, 0 and 1', () => {
  assert.deepEqual(literalsIn('B1*Assumptions!B2'), []);
  assert.deepEqual(literalsIn("SUM($A$1:B10)+1-0"), []);
  assert.deepEqual(literalsIn("LOG10(Q1_sales)*'Sheet 2'!C3"), []);
  assert.deepEqual(literalsIn('IF(A1="N/A 5",1,0)'), []);
  assert.deepEqual(literalsIn('B1*1.2'), ['1.2']);
  assert.deepEqual(literalsIn('A1+500-B2'), ['500']);
  assert.deepEqual(literalsIn('A1*0.5%'), ['0.5%']);
});

test('literalsIn ignores normal constants: settings, exponents and unit factors', () => {
  for (const ok of ['ROUND(A1,2)', 'ROUND(A1*B2,0)', 'VLOOKUP(A1,Sheet2!A:B,2,FALSE)', 'INDEX(A1:A9,3)', 'A1*100', 'B2/12', 'A1*12/365', 'A1^2', 'DATE(2025,1,1)', 'OFFSET(A1,2,3)', 'A1/1000']) {
    assert.deepEqual(literalsIn(ok), [], ok);
  }
  assert.deepEqual(literalsIn('ROUND(A1*1.2,2)'), ['1.2']);
  assert.deepEqual(literalsIn('IF(A1>5,1,0)'), ['5']);
  assert.deepEqual(literalsIn('A1*7+ROUND(B1,2)'), ['7']);
});

test('clean workbook has one literal-free pass except the allowed +1', { skip }, () => {
  const f = makeXlsx(join(dir, 'clean.xlsx'), cleanSheets());
  const r = checkWorkbook(f);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.sheets.map((s) => s.name), ['Model', 'Assumptions']);
  assert.equal(r.sheets[0].formulas, 2);
});

test('error cell and uncalculated formula fail; a typed number is advice only', { skip }, () => {
  const sheets = cleanSheets();
  sheets[0].cells.push({ ref: 'E1', f: 'B1/0', v: '#DIV/0!', t: 'e' });
  sheets[0].cells.push({ ref: 'F1', f: 'B1*1.2', v: '120' });
  sheets[0].cells.push({ ref: 'G1', f: 'B1+C1' });
  const f = makeXlsx(join(dir, 'bad.xlsx'), sheets);
  const r = checkWorkbook(f);
  assert.deepEqual(r.problems.map((p) => `${p.ref}:${p.kind}`).sort(), ['E1:error-cell', 'G1:not-calculated']);
  assert.deepEqual(r.warnings.map((p) => `${p.ref}:${p.kind}`), ['F1:literal-in-formula']);
});

test('a formula that returns an empty string is not "not calculated"', { skip }, () => {
  const sheets = cleanSheets();
  sheets[0].cells.push({ ref: 'E1', f: 'IF(A1="","",B1)', t: 'str', v: '' });
  const f = makeXlsx(join(dir, 'empty.xlsx'), sheets);
  assert.deepEqual(checkWorkbook(f).problems, []);
});

test('command: exit codes and json', { skip }, () => {
  const good = makeXlsx(join(dir, 'g.xlsx'), cleanSheets());
  const r = spawnSync(process.execPath, [SCRIPT, good, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).ok, true);
  const sheets = cleanSheets();
  sheets[1].cells.push({ ref: 'C2', f: 'B2+5', v: '6.2' });
  const advice = makeXlsx(join(dir, 'a.xlsx'), sheets);
  const ar = spawnSync(process.execPath, [SCRIPT, advice], { encoding: 'utf8' });
  assert.equal(ar.status, 0);
  assert.match(ar.stdout, /Advice/);
  sheets[1].cells.push({ ref: 'D2', f: 'B2+C2' });
  const bad = makeXlsx(join(dir, 'b.xlsx'), sheets);
  assert.equal(spawnSync(process.execPath, [SCRIPT, bad], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, join(dir, 'missing.xlsx')], { encoding: 'utf8' }).status, 2);
});
