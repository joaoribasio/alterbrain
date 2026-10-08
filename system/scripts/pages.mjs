#!/usr/bin/env node
// pages: turn a deliverable into page images that Claude can look at.
//
//   pdf <file.pdf> [--pages 1-12] [--dpi 80] [--json]   render PNG pages with pdftoppm (Poppler)
//   export <file.pptx|.docx|.xlsx> [--to pdf] [--json]   export a COPY to PDF (Office first, LibreOffice as the fallback)
//   check [--json]                                        which of these tools this computer has
//
// Pages go to state/local/tmp/pages/<sha8>/page-<n>.png, where <sha8> is the first 8 characters of the file's SHA-256.
// The main session then opens each PNG with the Read tool and looks at it. Whether Claude's Read tool can render PDF
// pages itself depends on pdftoppm and is [Unverified] (community reports only), so Alterbrain renders pages itself.
//
// Export routes, in order:
//   Windows + Office: PowerShell COM. PowerPoint Presentation.SaveAs(path, 32) where 32 = ppSaveAsPDF; Word
//     Document.SaveAs2(path, 17) where 17 = wdFormatPDF; Excel Workbook.ExportAsFixedFormat(0, path) where 0 = xlTypePDF.
//     All three constants checked on learn.microsoft.com (PpSaveAsFileType, WdSaveFormat, XlFixedFormatType).
//   macOS + Office: AppleScript. [Unverified]: written from the apps' scripting dictionaries, not run on a Mac.
//   Otherwise LibreOffice headless: soffice --headless --convert-to pdf. Fonts and line breaks can differ from Office.
// The original file is never opened for writing: a copy is exported.
// Office safety [Unverified: written from how Office automation is known to behave, not tested against a hidden prompt]:
//   * If the app (PowerPoint, Word or Excel) is already running, it is NOT used, because quitting it could close the
//     user's open work. The export falls back to LibreOffice and says why.
//   * Otherwise the app is started hidden and closed again. If the export times out, the Office process this run
//     started is stopped, so no invisible app is left holding the copy.
//
// Exit codes: 0 ok, 1 could not do it (one plain sentence says why), 2 usage error.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, delimiter, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMainModule, rootPath } from '../lib/paths.mjs';

function sha8(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
}

export const FONT_WARNING =
  'This PDF was made with LibreOffice, not Office. Fonts and line breaks may differ from what you will see in PowerPoint or Word, so text may look wider or narrower here than in the real file.';
export const MAC_NOTE = '[Unverified] The macOS export uses AppleScript that has not been run on a Mac yet. If it fails, I will use LibreOffice.';

const EXE = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.com', ''] : [''];

function inDirs(dirs, name, exts = EXE) {
  for (const d of dirs) {
    if (!d) continue;
    for (const e of exts) {
      const p = join(d, name + e);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** pdftoppm (Poppler): on PATH, in the WinGet links folder, or in the usual Homebrew folders. Returns a path or null. */
export function findPdftoppm({ pathEnv = process.env.PATH || process.env.Path || '', localAppData = process.env.LOCALAPPDATA || '' } = {}) {
  const dirs = pathEnv.split(delimiter);
  if (localAppData) dirs.push(join(localAppData, 'Microsoft', 'WinGet', 'Links'));
  dirs.push('/opt/homebrew/bin', '/usr/local/bin');
  return inDirs(dirs, 'pdftoppm');
}

/** LibreOffice (soffice): on PATH or in the default install folders. Returns a path or null. */
export function findLibreOffice({ pathEnv = process.env.PATH || process.env.Path || '', programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']] } = {}) {
  const dirs = pathEnv.split(delimiter);
  for (const pf of programFiles) if (pf) dirs.push(join(pf, 'LibreOffice', 'program'));
  const found = inDirs(dirs, 'soffice');
  if (found) return found;
  for (const p of ['/Applications/LibreOffice.app/Contents/MacOS/soffice', '/usr/bin/soffice', '/usr/local/bin/soffice']) if (existsSync(p)) return p;
  return null;
}

export function winProgIdRegistered(progId) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `if (Test-Path 'Registry::HKEY_CLASSES_ROOT\\${progId}') { 'yes' } else { 'no' }`], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  return r.status === 0 && /yes/.test(r.stdout || '');
}

/** Which Office apps are installed (looked up in the registry on Windows, in /Applications on macOS), without starting them. */
export function officeApps() {
  if (process.platform === 'win32') {
    return { powerpoint: winProgIdRegistered('PowerPoint.Application'), word: winProgIdRegistered('Word.Application'), excel: winProgIdRegistered('Excel.Application') };
  }
  if (process.platform === 'darwin') {
    return {
      powerpoint: existsSync('/Applications/Microsoft PowerPoint.app'),
      word: existsSync('/Applications/Microsoft Word.app'),
      excel: existsSync('/Applications/Microsoft Excel.app'),
    };
  }
  return { powerpoint: false, word: false, excel: false };
}

/** Stop Office processes that started after `since` (a Date). Used after a timeout, when the script's finally block never ran. */
export function killOfficeStartedSince(since) {
  if (process.platform !== 'win32') return;
  const iso = new Date(since.getTime() - 2000).toISOString();
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$t = [datetime]::Parse('${iso}').ToUniversalTime(); Get-Process -Name POWERPNT,WINWORD,EXCEL -ErrorAction SilentlyContinue | Where-Object { $_.StartTime.ToUniversalTime() -ge $t } | Stop-Process -Force`], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
}

export function toolCheck(opts = {}) {
  return { platform: process.platform, pdftoppm: findPdftoppm(opts), office: officeApps(), libreoffice: findLibreOffice(opts) };
}

function usageError(message) {
  return Object.assign(new Error(message), { usage: true });
}

/** "3" -> {first:3,last:3}; "1-12" -> {first:1,last:12}; undefined -> null; bad input -> throws. */
export function parsePages(spec) {
  if (spec === undefined) return null;
  const m = String(spec).match(/^(\d+)(?:-(\d+))?$/);
  if (!m) throw usageError(`I could not read the page range "${spec}". Use a number like 3 or a range like 1-12.`);
  const first = Number(m[1]);
  const last = m[2] ? Number(m[2]) : first;
  if (first < 1 || last < first) throw usageError(`The page range "${spec}" does not make sense. Pages start at 1 and the second number must not be smaller.`);
  return { first, last };
}

/** Options after the command. Returns { positional, flags }. */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--pages' || a === '--dpi' || a === '--to') flags[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) throw usageError(`I do not know the option ${a}.`);
    else positional.push(a);
  }
  return { positional, flags };
}

function pagesDir(file) {
  return rootPath('state', 'local', 'tmp', 'pages', sha8(file));
}

/** Render PDF pages to PNG. Returns { dir, pages: [path] }. Throws an Error with a plain sentence. */
export function renderPdf(file, { pages = null, dpi = 80, tool = findPdftoppm() } = {}) {
  if (!existsSync(file)) throw new Error(`I cannot find ${file}.`);
  if (!tool) {
    throw new Error(
      'I cannot show PDF pages yet because the PDF page renderer (Poppler) is not installed. On Windows: winget install --id oschwartz10612.Poppler -e. On a Mac: brew install poppler. Say yes and I will install it, or tell me if you would rather look at the pages yourself.',
    );
  }
  const dir = pagesDir(file);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^page-\d+\.png$/.test(f)) rmSync(join(dir, f), { force: true });
  const args = ['-png', '-r', String(dpi)];
  if (pages) args.push('-f', String(pages.first), '-l', String(pages.last));
  args.push(file, join(dir, 'page'));
  const r = spawnSync(tool, args, { encoding: 'utf8', timeout: 300_000, windowsHide: true });
  if (r.status !== 0 || r.error) throw new Error(`The page renderer failed. It said: ${(r.stderr || (r.error && r.error.message) || 'nothing').trim().split('\n')[0]}`);
  // pdftoppm pads numbers (page-01.png) when the PDF has 10+ pages. Rename to page-<n>.png.
  const out = [];
  for (const f of readdirSync(dir)) {
    const m = f.match(/^page-0*(\d+)\.png$/);
    if (!m) continue;
    const clean = `page-${Number(m[1])}.png`;
    if (clean !== f) renameSync(join(dir, f), join(dir, clean));
    out.push({ n: Number(m[1]), path: join(dir, clean) });
  }
  out.sort((a, b) => a.n - b.n);
  if (!out.length) throw new Error('The page renderer ran but made no pages. The PDF may be empty or damaged.');
  return { dir, pages: out.map((o) => o.path) };
}

const PS_COMMON = `$ErrorActionPreference = 'Stop'\n`;
export const PS_SCRIPTS = {
  '.pptx': `${PS_COMMON}if (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue) { 'BUSY'; exit 3 }
$a = $null; $p = $null
try {
  $a = New-Object -ComObject PowerPoint.Application
  $p = $a.Presentations.Open($env:AB_IN, -1, 0, 0)
  $p.SaveAs($env:AB_OUT, 32)
} finally {
  if ($p) { $p.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($p) }
  if ($a) { $a.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($a) }
}`,
  '.docx': `${PS_COMMON}if (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) { 'BUSY'; exit 3 }
$a = $null; $d = $null
try {
  $a = New-Object -ComObject Word.Application
  $a.Visible = $false; $a.DisplayAlerts = 0
  $d = $a.Documents.Open($env:AB_IN, $false, $true)
  $d.SaveAs2($env:AB_OUT, 17)
} finally {
  if ($d) { $d.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($d) }
  if ($a) { $a.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($a) }
}`,
  '.xlsx': `${PS_COMMON}if (Get-Process -Name EXCEL -ErrorAction SilentlyContinue) { 'BUSY'; exit 3 }
$a = $null; $w = $null
try {
  $a = New-Object -ComObject Excel.Application
  $a.Visible = $false; $a.DisplayAlerts = $false
  $w = $a.Workbooks.Open($env:AB_IN, 0, $true)
  $w.ExportAsFixedFormat(0, $env:AB_OUT)
} finally {
  if ($w) { $w.Close($false); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($w) }
  if ($a) { $a.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($a) }
}`,
};

// [Unverified] AppleScript, not run on a Mac.
export const APPLESCRIPTS = {
  '.pptx': (inp, out) => [
    'tell application "Microsoft PowerPoint"',
    `open POSIX file "${inp}"`,
    `save active presentation in POSIX file "${out}" as save as PDF`,
    'close active presentation saving no',
    'end tell',
  ],
  '.docx': (inp, out) => [
    'tell application "Microsoft Word"',
    `open POSIX file "${inp}"`,
    `save as active document file name "${out}" file format format PDF`,
    'close active document saving no',
    'end tell',
  ],
};

function appFor(ext, office) {
  return { '.pptx': office.powerpoint, '.docx': office.word, '.xlsx': office.excel }[ext];
}

/** Export a copy to PDF. Returns { pdf, method, warnings[] }. Throws an Error with a plain sentence. */
export function exportToPdf(file, { office = officeApps(), soffice = findLibreOffice() } = {}) {
  const ext = extname(file).toLowerCase();
  if (!existsSync(file)) throw new Error(`I cannot find ${file}.`);
  if (!['.pptx', '.docx', '.xlsx'].includes(ext)) throw new Error(`I can export .pptx, .docx and .xlsx files. ${basename(file)} is a ${ext || 'file without an extension'}.`);
  const dir = join(rootPath('state', 'local', 'tmp', 'pages'), `export-${sha8(file)}`);
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, `deliverable${ext}`);
  copyFileSync(file, copy);
  const pdf = join(dir, 'deliverable.pdf');
  rmSync(pdf, { force: true });
  const warnings = [];
  const tried = [];
  if (appFor(ext, office)) {
    if (process.platform === 'win32') {
      const startedAt = new Date();
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPTS[ext]], {
        encoding: 'utf8',
        timeout: 180_000,
        windowsHide: true,
        env: { ...process.env, AB_IN: copy, AB_OUT: pdf },
      });
      if (r.status === 0 && existsSync(pdf) && statSync(pdf).size > 0) return { pdf, method: 'Office (PowerShell COM)', warnings };
      if (r.status === 3) tried.push('the Office app is already open on this computer, so I did not touch it (closing it could lose your unsaved work)');
      else if (r.error || r.signal) {
        killOfficeStartedSince(startedAt);
        tried.push('Office took too long (it may be waiting on a password or a hidden prompt), so I stopped it');
      } else tried.push('Office did not export it');
    } else if (process.platform === 'darwin' && APPLESCRIPTS[ext]) {
      const lines = APPLESCRIPTS[ext](copy, pdf);
      const r = spawnSync('osascript', lines.flatMap((l) => ['-e', l]), { encoding: 'utf8', timeout: 180_000 });
      if (r.status === 0 && existsSync(pdf) && statSync(pdf).size > 0) return { pdf, method: 'Office (AppleScript)', warnings: [MAC_NOTE] };
      tried.push('the Mac Office export did not work');
      warnings.push(MAC_NOTE);
    }
  }
  if (soffice) {
    const r = spawnSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, copy], { encoding: 'utf8', timeout: 240_000, windowsHide: true });
    if (r.status === 0 && existsSync(pdf) && statSync(pdf).size > 0) return { pdf, method: 'LibreOffice', warnings: [...warnings, FONT_WARNING] };
    tried.push('LibreOffice did not export it');
  }
  const why = tried.length ? `${tried.join(' and ')}.` : 'This computer has neither Microsoft Office nor LibreOffice that I can use.';
  throw new Error(`I could not make a PDF of ${basename(file)}. ${why} Open the file yourself and export it to PDF (File, Save As, PDF), then give me the PDF and I will look at its pages.`);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  let parsed;
  try {
    parsed = parseArgs(rest);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const { positional, flags } = parsed;
  const json = !!flags.json;
  const usage = 'Usage: node system/scripts/pages.mjs pdf <file.pdf> [--pages 1-12] [--dpi 80] | export <file.pptx|.docx|.xlsx> [--to pdf] | check  [--json]';
  try {
    if (cmd === 'check') {
      const c = toolCheck();
      if (json) console.log(JSON.stringify(c, null, 2));
      else {
        console.log(`PDF page renderer (pdftoppm): ${c.pdftoppm || 'not installed'}`);
        console.log(`PowerPoint: ${c.office.powerpoint ? 'yes' : 'no'}, Word: ${c.office.word ? 'yes' : 'no'}, Excel: ${c.office.excel ? 'yes' : 'no'}`);
        console.log(`LibreOffice: ${c.libreoffice || 'not installed'}`);
        if (!c.pdftoppm) console.log('Without the page renderer I cannot look at PDF pages. I will offer to install it once.');
      }
      return c.pdftoppm ? 0 : 1;
    }
    if (cmd === 'pdf') {
      if (positional.length !== 1) {
        console.error(usage);
        return 2;
      }
      const dpi = flags.dpi === undefined ? 80 : Number(flags.dpi);
      if (!Number.isFinite(dpi) || dpi < 20 || dpi > 300) {
        console.error('The dpi must be a number between 20 and 300.');
        return 2;
      }
      const res = renderPdf(positional[0], { pages: parsePages(flags.pages), dpi });
      if (json) console.log(JSON.stringify(res, null, 2));
      else {
        console.log(`${res.pages.length} page(s) rendered. Open each one with the Read tool and look at it:`);
        for (const p of res.pages) console.log(p);
      }
      return 0;
    }
    if (cmd === 'export') {
      if (positional.length !== 1 || (flags.to && flags.to !== 'pdf')) {
        console.error(usage);
        return 2;
      }
      const res = exportToPdf(positional[0]);
      if (json) console.log(JSON.stringify(res, null, 2));
      else {
        console.log(`Exported a copy to PDF with ${res.method}: ${res.pdf}`);
        for (const w of res.warnings) console.log(`Note: ${w}`);
        console.log('Next: node system/scripts/pages.mjs pdf "' + res.pdf + '"');
      }
      return 0;
    }
  } catch (e) {
    console.error(e.message);
    return e.usage ? 2 : 1;
  }
  console.error(usage);
  return 2;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
