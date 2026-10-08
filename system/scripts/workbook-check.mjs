#!/usr/bin/env node
// workbook-check: a light check of an .xlsx before it is handed in. No dependencies, no Excel needed.
//
// It lists the sheets and flags:
//   * error cells (#REF!, #DIV/0!, #N/A, #VALUE!, #NAME?, #NUM!, #NULL!)
//   * formulas with no stored value at all (the workbook was never recalculated, so a reader may see blanks or zeros).
//     A formula that returns an empty string is stored with an empty value and is fine.
//   * ADVICE only, never a failure: numbers typed inside formulas (a hard-coded input hiding in a calculation).
//     Normal constants are not listed: 0 and 1, exponents, unit factors (12, 52, 100, 365, 1000, 1000000) and the
//     fixed arguments of ROUND, INDEX, MATCH, VLOOKUP, HLOOKUP, OFFSET, DATE and similar functions.
// With --recalc, on Windows with Excel installed, it also recalculates a COPY (in state/local/tmp) and reports circular
// references. That step is optional; without Excel it says so and carries on.
// What a script cannot judge (does every number in the report map to a cell, are inputs kept apart from calculations,
// are units and periods consistent) belongs to the model-audit lens.
//
// Usage: node system/scripts/workbook-check.mjs <file.xlsx> [--recalc] [--json]
// Exit codes: 0 clean (advice may be printed), 1 problems, 2 usage error.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMainModule, rootPath } from '../lib/paths.mjs';
import { xlsxCells } from '../lib/ooxml.mjs';
import { winProgIdRegistered, killOfficeStartedSince } from './pages.mjs';

export const ERROR_VALUES = ['#REF!', '#DIV/0!', '#N/A', '#VALUE!', '#NAME?', '#NUM!', '#NULL!'];

const UNIT_FACTORS = new Set([12, 52, 100, 365, 1000, 1000000]);
// Functions whose number arguments are settings (decimals, column index, offsets, date parts), not inputs.
const SETTING_FUNCTIONS = new Set(['ROUND', 'ROUNDUP', 'ROUNDDOWN', 'MROUND', 'INDEX', 'MATCH', 'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'XMATCH', 'OFFSET', 'DATE', 'EDATE', 'EOMONTH', 'TEXT', 'LARGE', 'SMALL', 'RANK', 'CHOOSE', 'FIXED', 'TRUNC', 'PERCENTILE', 'QUARTILE', 'SUBTOTAL', 'AGGREGATE']);

/**
 * Numbers typed inside a formula that may be hidden inputs. Cell references, sheet names, function names and defined
 * names are removed first, so A1, Sheet2!B3, LOG10( and Q1_sales do not count. Text in quotes does not count. Also
 * ignored: 0 and 1, exponents (A1^2), unit factors (12, 52, 100, 365, 1000, 1000000) and a bare number that is an
 * argument of ROUND, INDEX, MATCH, VLOOKUP, HLOOKUP, OFFSET, DATE and similar functions.
 */
export function literalsIn(formula) {
  let f = String(formula);
  f = f.replace(/"(?:[^"]|"")*"/g, '""'); // text literals
  f = f.replace(/'(?:[^']|'')+'!/g, ''); // quoted sheet names
  f = f.replace(/\[[^\]]*\]/g, ''); // table columns and workbook links
  f = f.replace(/\$/g, '');
  f = f.replace(/\d+:\d+/g, ''); // whole-row ranges
  const found = [];
  const stack = [];
  const re = /([A-Za-z_\\][A-Za-z0-9_.]*)(\s*\()?|(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(%)?|([(),^])/g;
  let prev = '';
  let m;
  while ((m = re.exec(f))) {
    if (m[1] !== undefined) {
      if (m[2]) {
        stack.push(m[1].toUpperCase());
        prev = '(';
      } else prev = 'name';
      continue;
    }
    if (m[5] !== undefined) {
      if (m[5] === '(') stack.push('');
      else if (m[5] === ')') stack.pop();
      prev = m[5];
      continue;
    }
    const text = m[0];
    const n = Number(text.replace('%', ''));
    const before = prev;
    const after = f.slice(m.index + text.length).match(/^\s*(.)/)?.[1] || '';
    prev = 'num';
    if (m[4]) {
      found.push(text);
      continue;
    }
    if (n === 0 || n === 1) continue;
    if (before === '^') continue; // exponent
    if (UNIT_FACTORS.has(n)) continue;
    const fn = stack[stack.length - 1];
    if (fn && SETTING_FUNCTIONS.has(fn) && (before === '(' || before === ',') && (after === ',' || after === ')')) continue;
    found.push(text);
  }
  return found;
}

/** Check one workbook. Returns { file, sheets: [{ name, cells, formulas }], problems: [{ sheet, ref, kind, detail }], warnings: [same shape, advice only] }. */
export function checkWorkbook(file) {
  const wb = xlsxCells(file);
  const problems = [];
  const warnings = [];
  const sheets = wb.sheets.map((sh) => {
    let formulas = 0;
    for (const c of sh.cells) {
      const isError = c.type === 'error' || (c.type === 'string' && ERROR_VALUES.includes(c.value)) || ERROR_VALUES.includes(c.value);
      if (c.formula !== null) formulas++;
      if (isError) {
        problems.push({ sheet: sh.name, ref: c.ref, kind: 'error-cell', detail: `Shows ${c.value}.` });
        continue;
      }
      if (c.formula !== null && c.value === null) {
        problems.push({ sheet: sh.name, ref: c.ref, kind: 'not-calculated', detail: 'Has a formula but no stored value at all. Open the workbook in Excel and save it.' });
      }
      if (c.formula) {
        const lits = literalsIn(c.formula);
        if (lits.length) warnings.push({ sheet: sh.name, ref: c.ref, kind: 'literal-in-formula', detail: `Typed number${lits.length > 1 ? 's' : ''} ${lits.join(', ')} inside =${c.formula}. If it is an input, put it in its own cell; if it is a normal constant, ignore this.` });
      }
    }
    return { name: sh.name, cells: sh.cells.length, formulas };
  });
  return { file, sheets, problems, warnings };
}

const PS_PREFIX = ['-NoProfile', '-NonInteractive', '-Command'];

function ps(script, env = {}, timeout = 120_000) {
  return spawnSync('powershell.exe', [...PS_PREFIX, script], { encoding: 'utf8', timeout, windowsHide: true, env: { ...process.env, ...env } });
}

/** True when Excel is installed (looked up in the registry on Windows, without starting it). */
export function excelAvailable() {
  if (process.platform !== 'win32') return false;
  return winProgIdRegistered('Excel.Application');
}

const RECALC_SCRIPT = `
$ErrorActionPreference = 'Stop'
if (Get-Process -Name EXCEL -ErrorAction SilentlyContinue) { 'BUSY'; exit 3 }
$x = $null; $wb = $null
try {
  $x = New-Object -ComObject Excel.Application
  $x.Visible = $false; $x.DisplayAlerts = $false
  $wb = $x.Workbooks.Open($env:AB_FILE, 0, $false)
  $x.CalculateFull()
  $circ = @()
  foreach ($ws in $wb.Worksheets) {
    $c = $ws.CircularReference
    if ($c -ne $null) { $circ += ($ws.Name + '!' + $c.Address($false, $false)) }
  }
  $wb.Save()
  'CIRC:' + ($circ -join ',')
} finally {
  if ($wb) { $wb.Close($false); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($x) { $x.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x) }
}
`;

/** Recalculate a copy through Excel and check that. Returns { available, note, circular[], result? }. */
export function recalcCheck(file) {
  if (process.platform !== 'win32') return { available: false, note: 'Recalculation through Excel is only offered on Windows. I checked the stored values instead.' };
  if (!excelAvailable()) return { available: false, note: 'Excel is not available here, so I did not recalculate. I checked the stored values instead.' };
  const tmp = rootPath('state', 'local', 'tmp', 'workbook-check');
  mkdirSync(tmp, { recursive: true });
  const copy = join(tmp, `${Date.now()}-${basename(file, extname(file))}${extname(file)}`);
  copyFileSync(file, copy);
  try {
    const startedAt = new Date();
    const r = ps(RECALC_SCRIPT, { AB_FILE: copy });
    if (r.status === 3) return { available: true, note: 'Excel is already open on this computer, so I did not recalculate (closing it could lose your unsaved work). I checked the stored values instead.', circular: [] };
    if (r.error || r.signal) {
      killOfficeStartedSince(startedAt);
      return { available: true, note: 'Excel took too long (it may be waiting on a password or a hidden prompt), so I stopped it and checked the stored values instead.', circular: [] };
    }
    if (r.status !== 0) return { available: true, note: 'Excel could not open or recalculate the copy, so I checked the stored values instead.', circular: [] };
    const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('CIRC:')) || 'CIRC:';
    const circular = line.slice(5).split(',').filter(Boolean);
    return { available: true, note: 'Recalculated a copy in Excel; your file was not changed.', circular, result: checkWorkbook(copy) };
  } finally {
    try {
      rmSync(copy, { force: true });
    } catch {
      /* leave it in state/local/tmp */
    }
  }
}

function main(argv) {
  const json = argv.includes('--json');
  const recalc = argv.includes('--recalc');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length !== 1 || argv.includes('--help')) {
    console.error('Usage: node system/scripts/workbook-check.mjs <file.xlsx> [--recalc] [--json]');
    return 2;
  }
  const file = files[0];
  if (!existsSync(file) || extname(file).toLowerCase() !== '.xlsx') {
    console.error(`I need an existing .xlsx file. Got: ${file}`);
    return 2;
  }
  let report;
  try {
    report = checkWorkbook(file);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  if (recalc) {
    const rc = recalcCheck(file);
    report.recalc = { available: rc.available, note: rc.note, circular: rc.circular || [] };
    for (const ref of rc.circular || []) report.problems.push({ sheet: ref.split('!')[0], ref: ref.split('!')[1], kind: 'circular-reference', detail: 'Part of a circular reference.' });
    if (rc.result) {
      // Errors that only appear after a full recalculation.
      const known = new Set(report.problems.map((p) => `${p.sheet}!${p.ref}!${p.kind}`));
      for (const p of rc.result.problems) {
        if (p.kind === 'error-cell' && !known.has(`${p.sheet}!${p.ref}!${p.kind}`)) report.problems.push({ ...p, detail: `${p.detail} (after recalculation)` });
      }
    }
  }
  const ok = report.problems.length === 0;
  if (json) console.log(JSON.stringify({ ok, ...report }, null, 2));
  else {
    console.log(`${file}: ${report.sheets.length} sheet(s): ${report.sheets.map((s) => `${s.name} (${s.formulas} formulas)`).join(', ')}`);
    if (report.recalc) console.log(report.recalc.note);
    if (ok) console.log('No error cells or uncalculated formulas found. The model-audit lens still needs to judge the logic.');
    else {
      const byKind = {};
      for (const p of report.problems) (byKind[p.kind] ||= []).push(p);
      for (const [kind, list] of Object.entries(byKind)) {
        console.log(`${kind}: ${list.length}`);
        for (const p of list.slice(0, 20)) console.log(`  ${p.sheet}!${p.ref}: ${p.detail}`);
        if (list.length > 20) console.log(`  ... and ${list.length - 20} more (use --json for all).`);
      }
    }
  }
  const advice = report.warnings || [];
  if (!json && advice.length) {
    console.log(`Advice (does not fail the check): ${advice.length} formula(s) contain typed numbers. Check that none is a hidden input.`);
    for (const p of advice.slice(0, 10)) console.log(`  ${p.sheet}!${p.ref}: ${p.detail}`);
    if (advice.length > 10) console.log(`  ... and ${advice.length - 10} more (use --json for all).`);
  }
  return ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
