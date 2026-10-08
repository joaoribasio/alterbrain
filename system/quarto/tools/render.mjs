// Make a CV, cover letter, report or slide deck with Quarto. Zero dependencies (Node 20+).
//
//   node system/quarto/tools/render.mjs <source.qmd|source.md> --type cv|cv-ats|letter|report|deck [options]
//   node system/quarto/tools/render.mjs scaffold <type> <folder> [--name <file name>] [--json]
//   node system/quarto/tools/render.mjs types
//
// Options for rendering:
//   --out <folder>       Where the finished file goes. Default: _out/ next to the source (scratch space, replaced each time).
//   --release            Put the file in releases/<today>/ next to the source instead (every version is kept).
//   --name <name>        File name without extension. Default: the source file name.
//   --max-pages <n>      Report a problem when a PDF is longer than this.
//   --pdf                For a deck: also save a PDF (needs Microsoft Edge or Google Chrome).
//   --format <name>      Advanced: use another Quarto format, for example pptx for a PowerPoint file. Without it, a format the
//                        document names itself (format: x) is used when an extension next to it (or in the template) provides it;
//                        a name nothing provides stops with a plain message. A document that names none gets the Typst default.
//   --brand <file>       Use this brand file. Default: the template's brand, else vault/80_me/brand/_brand.yml, else the built-in one.
//   --template <folder>  Use this template folder (template.yml, optional brand, reference document, citation style and
//                        Quarto extension). Only what the document does not set itself is added. Find the folder with
//                        "node system/scripts/template.mjs resolve --kind <kind> --for <source>".
//   --reference-doc <f>  Word or PowerPoint file whose styles the .docx or .pptx output uses (beats the template's).
//   --csl <file>         Citation style file (beats the template's). "apa" or an empty value changes nothing.
//   --keep               Keep the temporary files (for debugging).
//   --json               Machine-readable result.
//
// A source ending in .md is treated as an Obsidian note and first converted by system/scripts/qmd-prerender.mjs.
// Exit code: 0 = made it, 1 = something went wrong or the page limit was passed, 2 = usage problem.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  IS_WINDOWS, TEMPLATES_DIR, TYPES, chooseBrand, documentFormats, extensionFormats, findQuarto, frontMatterText, hasTopLevelKey, moveFile,
  readTextSafe, relativeForQuarto, repoRoot, runQuarto, stageExtensions, stageExtensionsFrom, uniquePath,
} from './lib.mjs';
import { checkTemplate, readTemplate } from '../../lib/templates.mjs';
import { countPages, checkLimit } from './pagecount.mjs';
import { today } from '../../lib/fsx.mjs';
import { explain } from './explain.mjs';
import { checkFonts, fontsInBrand, installedFonts } from './fonts.mjs';
import { isMainModule } from '../../lib/paths.mjs';

// ---------------------------------------------------------------- helpers

/** Is `file` inside `dir`? */
function isInside(dir, file) {
  const rel = relative(resolve(dir), resolve(file));
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Remove characters Windows does not allow in file names. */
export function safeName(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'document';
}

export function extensionFor(format) {
  if (/revealjs|html/i.test(format)) return 'html';
  if (/pptx/i.test(format)) return 'pptx';
  if (/docx/i.test(format)) return 'docx';
  return 'pdf';
}

/**
 * Add the lines Alterbrain needs to the front matter of a Quarto document, without touching
 * anything the author already set. `lines` are YAML lines such as: brand: "../x/_brand.yml".
 */
export function injectFrontMatter(text, lines) {
  if (!lines.length) return text;
  const t = text.replace(/^﻿/, '');
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  if (/^---\r?\n/.test(t)) {
    const first = t.indexOf('\n') + 1;
    return t.slice(0, first) + lines.join(nl) + nl + t.slice(first);
  }
  return ['---', ...lines, '---', '', t].join(nl);
}

/**
 * The front matter lines a template, a citation style or a reference document add. A key the author already set is never
 * touched. Paths are written relative to the source folder. "apa" and an empty csl add nothing (the report template
 * already formats references in APA).
 */
export function templateLines(fm, { srcDir, csl = '', referenceDoc = '', outExt = 'pdf' } = {}) {
  const lines = [];
  if (csl && csl !== 'apa' && !hasTopLevelKey(fm, 'csl') && existsSync(csl)) lines.push(`csl: "${relativeForQuarto(srcDir, csl)}"`);
  if ((outExt === 'docx' || outExt === 'pptx') && referenceDoc && !hasTopLevelKey(fm, 'reference-doc') && existsSync(referenceDoc)) {
    lines.push(`reference-doc: "${relativeForQuarto(srcDir, referenceDoc)}"`);
  }
  return lines;
}

/** Load a template folder for render: its fields as paths. Returns { ok, error, dir, data }. */
export function loadTemplateFolder(folder) {
  const dir = resolve(folder);
  const { data, errors } = readTemplate(dir);
  if (!data) return { ok: false, error: errors[0], dir };
  const problems = checkTemplate(dir, { builtin: dir.toLowerCase().startsWith(TEMPLATES_DIR.toLowerCase()) });
  if (problems.length) return { ok: false, error: `The template "${dir}" has a problem: ${problems[0]}`, dir };
  const pick = (v) => (typeof v === 'string' && v.trim() ? join(dir, v.trim()) : '');
  const csl = typeof data.csl === 'string' ? data.csl.trim() : '';
  return {
    ok: true, dir, data,
    brand: pick(data.brand), referenceDoc: pick(data.reference_doc), csl: csl === 'apa' ? 'apa' : pick(csl),
    format: typeof data.format === 'string' ? data.format.trim() : '',
    extensions: typeof data.quarto_extension === 'string' && data.quarto_extension.trim() ? join(dir, '_extensions') : '',
  };
}

const QUARTO_FORMATS = [
  'html', 'pdf', 'typst', 'docx', 'pptx', 'revealjs', 'beamer', 'latex', 'odt', 'epub', 'gfm', 'commonmark', 'markdown', 'md',
  'ipynb', 'rtf', 'asciidoc', 'plain', 'native', 'dashboard', 'jats', 'tei', 'docbook', 'opml', 'org', 'rst', 'texinfo',
  'slidy', 'slideous', 'dzslides', 's5', 'ms', 'man', 'fb2', 'icml', 'mediawiki', 'textile', 'xwiki', 'zimwiki',
  'jira', 'haddock', 'context', 'djot', 'bibtex', 'biblatex', 'csljson', 'openxml', 'html5', 'hugo-md',
];

/**
 * The format a document asks for in its own front matter, if an extension provides it. Looks in <srcDir>/_extensions and in
 * the template's extensions folder. Returns { format } when one is provided, { missing } when the document names an extension
 * format that nothing provides (so Quarto could not build it), else {} (no format, one of ours, or one Quarto has built in).
 */
export function documentFormat(fm, { srcDir, templateExtensions = '' } = {}) {
  const names = documentFormats(fm);
  if (!names.length) return {};
  const provided = new Set([...extensionFormats(join(srcDir, '_extensions')), ...extensionFormats(templateExtensions)]);
  const found = names.find((n) => provided.has(n));
  if (found) return { format: found };
  const known = new Set([...Object.values(TYPES).map((t) => t.format), ...QUARTO_FORMATS]);
  // Only a hyphenated name can be an extension format (<extension>-<base>). Quarto accepts many other Pandoc formats
  // (commonmark_x, epub3, chunkedhtml, gfm-raw_html) and reports an unknown one itself, so those are left to it.
  const other = names.find((n) => !known.has(n) && n.includes('-') && !known.has(n.split('-')[0]));
  return other ? { missing: other } : {};
}

/** Which of our types does this source seem to be, judging by its `format:` line? */
export function guessType(text) {
  const fm = frontMatterText(text);
  for (const [key, def] of Object.entries(TYPES)) {
    if (fm.includes(def.format)) return key;
  }
  return null;
}

function findBrowser() {
  const candidates = [];
  if (process.env.ALTERBRAIN_BROWSER) candidates.push(process.env.ALTERBRAIN_BROWSER);
  if (IS_WINDOWS) {
    const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const base of pf) {
      candidates.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      candidates.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    candidates.push('/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }
  return candidates.find((c) => existsSync(c)) || null;
}

/** How many slides a revealjs HTML file has. */
export function countSlides(html) {
  return (html.match(/<section[^>]*class="[^"]*\bslide\b/g) || []).length;
}
/** One try at printing a deck to PDF. Returns { written, complete, pages, detail }. */
function printOnce(browser, htmlFile, expected, outFile) {
  const profile = mkdtempSync(join(tmpdir(), 'alterbrain-pdf-'));
  try {
    // Print from a copy with a plain name (the deck is one self-contained HTML file, so a copy is enough).
    const plain = join(profile, 'deck.html');
    copyFileSync(htmlFile, plain);
    const tmpPdf = join(profile, 'out.pdf');
    const res = spawnSync(
      browser,
      [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer',
        `--user-data-dir=${profile}`, `--print-to-pdf=${tmpPdf}`, '--virtual-time-budget=20000',
        pathToFileURL(plain).href + '?print-pdf',
      ],
      { timeout: 120_000, windowsHide: true, encoding: 'utf8' },
    );
    // Edge and Chrome hand the work to another process: wait for the file, then check it has a page per slide.
    const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const started = Date.now();
    let last = -1;
    let pages = 0;
    let stableSince = 0;
    while (Date.now() - started < 40_000) {
      const size = existsSync(tmpPdf) ? statSync(tmpPdf).size : 0;
      if (size > 0) {
        try { pages = countPages(tmpPdf); } catch { pages = 0; }
        if (pages >= Math.max(1, expected) && size === last) {
          copyFileSync(tmpPdf, outFile);
          return { written: true, complete: true, pages, detail: 'ok' };
        }
        if (size === last) stableSince = stableSince || Date.now();
        else stableSince = 0;
        // The file stopped changing but has too few pages: this try printed a blank deck, so give up on it.
        if (stableSince && Date.now() - stableSince > 6_000) break;
      }
      last = size;
      sleep(500);
    }
    if (existsSync(tmpPdf) && statSync(tmpPdf).size > 0) {
      copyFileSync(tmpPdf, outFile);
      return { written: true, complete: false, pages, detail: 'too few pages' };
    }
    return { written: false, complete: false, pages: 0, detail: res.error ? res.error.message : `exit ${res.status}` };
  } finally {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 }); } catch { /* the browser may still be closing; the OS cleans the temp folder later */ }
  }
}

/**
 * Save a revealjs HTML deck as PDF using a headless browser (Edge or Chrome).
 * Browsers sometimes print a blank deck, so it tries up to three times.
 * Returns { ok, message, pages, complete }.
 */
export function deckToPdf(htmlFile, pdfFile) {
  const browser = findBrowser();
  if (!browser) return { ok: false, message: 'No Edge or Chrome browser was found.' };
  const expected = countSlides(readFileSync(htmlFile, 'utf8'));
  mkdirSync(dirname(pdfFile), { recursive: true });
  let best = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = printOnce(browser, htmlFile, expected, pdfFile);
    if (r.complete) return { ok: true, complete: true, pages: r.pages, message: 'ok' };
    if (r.written && (!best || r.pages > best.pages)) best = r;
    if (!r.written && attempt === 3) return { ok: false, message: `The browser did not write a PDF (${r.detail}).` };
  }
  return {
    ok: true,
    complete: false,
    pages: best ? best.pages : 0,
    message: `The PDF has ${best ? best.pages : 0} page(s) but the deck has ${expected} slides, so it may be incomplete.`,
  };
}

// ---------------------------------------------------------------- scaffold

/** Copy a template's starter files into a folder. Never overwrites a file that exists. */
export function scaffold(typeKey, folder, name) {
  const type = TYPES[typeKey];
  if (!type) throw new Error(`Unknown type "${typeKey}". Choose one of: ${Object.keys(TYPES).join(', ')}.`);
  const dest = resolve(folder);
  mkdirSync(dest, { recursive: true });
  const created = [];
  const skipped = [];
  const copy = (from, toName) => {
    const to = join(dest, toName);
    if (existsSync(to)) { skipped.push(to); return; }
    copyFileSync(from, to);
    created.push(to);
  };
  const dir = join(TEMPLATES_DIR, type.template);
  copy(join(dir, type.file), name ? `${safeName(name)}.qmd` : type.file);
  for (const extra of type.extra) copy(join(dir, extra), extra);
  return { created, skipped };
}

// ---------------------------------------------------------------- render

/** The last `n` non-empty lines of some program output. */
function lastLines(text, n) {
  return String(text).split(/\r?\n/).filter((l) => l.trim()).slice(-n).join('\n');
}

function plainFailure(res) {
  const all = `${res.stdout}\n${res.stderr}`;
  const items = explain(all);
  const tail = all.split(/\r?\n/).filter((l) => l.trim()).slice(-14).join('\n');
  return { items, tail };
}

export function renderDocument(opts) {
  const root = repoRoot();
  const result = {
    ok: false, type: opts.type, format: null, source: opts.source, output: null, pdf: null, pages: null, maxPages: opts.maxPages ?? null,
    withinLimit: null, outDir: null, notes: [], problems: [], technical: '',
  };
  const fail = (message, fix) => { result.problems.push({ level: 'error', message, fix: fix || '' }); return result; };

  const type = TYPES[opts.type];
  if (!type) return fail(`I do not know the document type "${opts.type}".`, `Choose one of: ${Object.keys(TYPES).join(', ')}.`);
  const source = resolve(opts.source);
  if (!existsSync(source)) return fail(`The file ${source} does not exist.`, 'Check the path and the file name.');
  if (!findQuarto()) {
    return fail('Quarto, the program that makes the document, is not installed.', 'Install it from quarto.org (Windows: winget install --id Posit.Quarto -e).');
  }

  let tpl = null;
  if (opts.template) {
    tpl = loadTemplateFolder(opts.template);
    if (!tpl.ok) return fail(tpl.error, 'Run "node system/scripts/template.mjs check <folder>" for the list of problems.');
  }
  const srcDir = dirname(source);
  const srcExt = extname(source).toLowerCase();
  const stem = basename(source, extname(source));
  let format = opts.format || (tpl && tpl.format) || type.format;
  let outExt = extensionFor(format);
  const cleanup = [];
  const cleanAll = () => { for (const fn of cleanup.reverse()) { try { fn(); } catch { /* ignore */ } } };

  try {
    // 1. Obsidian note -> .qmd
    const renderFile = join(srcDir, `${stem}.render.qmd`);
    let text;
    if (srcExt === '.md') {
      const pre = join(root, 'system', 'scripts', 'qmd-prerender.mjs');
      if (!existsSync(pre)) {
        return fail('The note converter (system/scripts/qmd-prerender.mjs) is missing.', 'Update Alterbrain, or save the note as a .qmd file and try again.');
      }
      const r = spawnSync(process.execPath, [pre, source, '--out', renderFile], { encoding: 'utf8', timeout: 60_000, windowsHide: true });
      if ((r.status ?? 2) > 1 || !existsSync(renderFile)) {
        return fail('The note could not be converted for printing.', `The converter said: ${(r.stderr || r.stdout || 'nothing').trim().split(/\r?\n/).pop()}`);
      }
      if (r.status === 1) {
        result.notes.push({ level: 'warning', message: `The note converter had a small problem: ${lastLines(r.stderr || r.stdout, 3).replace(/\n/g, ' ')}`, fix: 'Check that every embedded note and picture exists.' });
      }
      text = readFileSync(renderFile, 'utf8');
    } else if (srcExt === '.qmd') {
      text = readFileSync(source, 'utf8');
    } else {
      return fail(`I can only make documents from .qmd or .md files, not ${srcExt || 'this kind of file'}.`, 'Save the text as a .qmd file.');
    }
    cleanup.push(() => rmSync(renderFile, { force: true }));
    // 2. Brand, bibliography and (Word, PowerPoint) reference style: add only what the author did not set.
    let fm = frontMatterText(text);
    // A format the document names itself wins over our default, when an extension next to it (or in the template) provides it.
    if (!opts.format) {
      const pick = documentFormat(fm, { srcDir, templateExtensions: tpl?.extensions || '' });
      if (pick.format) {
        format = pick.format;
        outExt = extensionFor(format);
        result.notes.push({ level: 'info', message: `Used the document's own format "${format}", from the extension next to it.`, fix: '' });
      } else if (pick.missing) {
        return fail(`The document asks for the format "${pick.missing}", but no extension next to it provides that format.`, `Put the extension in an _extensions folder next to the document (the one that gives "${pick.missing}"), or take the format: line out to use ${format}.`);
      }
    }
    result.format = format;
    const localBrand = existsSync(join(srcDir, '_brand.yml'));
    const brandLine = /^brand[ \t]*:[ \t]*["']?_brand\.yml["']?[ \t]*\r?\n/m;
    if (!localBrand && fm && brandLine.test(fm)) {
      // A starter file names "_brand.yml" before that file exists next to it. Drop the line and use the real brand.
      const headEnd = text.indexOf(fm) + fm.length;
      text = text.slice(0, headEnd).replace(brandLine, '') + text.slice(headEnd);
      fm = frontMatterText(text);
    }
    const lines = [];
    const brandFile = opts.brand || !(tpl && tpl.brand) ? chooseBrand({ explicit: opts.brand, root }) : tpl.brand;
    let usedBrand = localBrand ? join(srcDir, '_brand.yml') : null;
    if (!hasTopLevelKey(fm, 'brand') && !localBrand && existsSync(brandFile)) {
      lines.push(`brand: "${relativeForQuarto(srcDir, brandFile)}"`);
      usedBrand = brandFile;
    }
    if (opts.type === 'report' && !hasTopLevelKey(fm, 'bibliography') && existsSync(join(srcDir, 'references.bib'))) {
      lines.push('bibliography: references.bib');
    }
    // Reference document: --reference-doc, then the template's, then reference.docx/.pptx beside the brand file.
    const referenceDoc = opts.referenceDoc ? resolve(opts.referenceDoc) : tpl?.referenceDoc || join(dirname(brandFile), `reference.${outExt}`);
    // Typst refuses files outside the project root, so a citation style from another folder is copied in under a
    // temporary name (removed afterwards) and the front matter points at the copy.
    let csl = opts.csl ? resolve(opts.csl) : tpl?.csl || '';
    if (csl && csl !== 'apa' && existsSync(csl) && !hasTopLevelKey(fm, 'csl') && !isInside(srcDir, csl)) {
      const stagedCsl = join(srcDir, `${stem}.render-style.csl`);
      copyFileSync(csl, stagedCsl);
      cleanup.push(() => rmSync(stagedCsl, { force: true }));
      csl = stagedCsl;
    }
    const tl = templateLines(fm, { srcDir, csl, referenceDoc, outExt });
    lines.push(...tl);
    if (tpl) result.notes.push({ level: 'info', message: `Template: ${basename(tpl.dir)}.`, fix: '' });
    writeFileSync(renderFile, injectFrontMatter(text, lines), 'utf8');

    // A missing brand font is not an error, but the page count can shift, so say so.
    if (outExt === 'pdf' && usedBrand) {
      const installed = installedFonts(root);
      if (installed) {
        const { missing } = checkFonts(fontsInBrand(readTextSafe(usedBrand)), installed);
        if (missing.length) {
          const names = missing.map((m) => `"${m}"`).join(', ');
          result.notes.push({
            level: 'warning',
            message: `The font${missing.length > 1 ? 's' : ''} ${names} ${missing.length > 1 ? 'are' : 'is'} not installed, so Arial was used instead. The page count may differ slightly.`,
            fix: 'Install the font (double-click the .ttf file), or drop it into system/quarto/fonts/. See system/quarto/README.md.',
          });
        }
      }
    }

    // 3. Template extensions next to the source.
    const stagedTpl = stageExtensionsFrom(tpl?.extensions || '', srcDir);
    cleanup.push(() => stagedTpl.cleanup());
    const staged = stageExtensions(opts.type, srcDir);
    cleanup.push(() => staged.cleanup());
    const filesDir = join(srcDir, `${stem}.render_files`);
    const hadFilesDir = existsSync(filesDir);
    cleanup.push(() => { if (!hadFilesDir) rmSync(filesDir, { recursive: true, force: true }); });
    const hadQuartoDir = existsSync(join(srcDir, '.quarto'));
    cleanup.push(() => { if (!hadQuartoDir) rmSync(join(srcDir, '.quarto'), { recursive: true, force: true }); });

    // 4. Where the result goes: _out/ (scratch, replaced each time), or releases/<today>/ with --release,
    //    or any folder with --out. A folder named "releases" keeps every version.
    const outDir = opts.out
      ? resolve(opts.out)
      : opts.release
        ? join(srcDir, 'releases', today())
        : join(srcDir, '_out');
    mkdirSync(outDir, { recursive: true });
    result.outDir = outDir;
    const stamped = safeName(opts.name || stem);

    // 5. Run Quarto.
    const built = `${stem}.render-output.${outExt}`;
    const args = ['render', basename(renderFile), '--to', format, '--output', built];
    const res = runQuarto(args, { cwd: srcDir, root });
    const builtPath = join(srcDir, built);
    const technical = `${res.stdout}\n${res.stderr}`;
    // Warnings (for example a missing font) are worth showing even when the render worked.
    const items = explain(technical);
    if (!res.ok || !existsSync(builtPath)) {
      result.technical = lastLines(technical, 25);
      const f = plainFailure(res);
      result.problems.push(...(f.items.length ? f.items : [{ level: 'error', message: 'The document could not be made.', fix: 'See the technical details below.' }]));
      return result;
    }
    result.notes.push(...items.map((i) => ({ ...i, level: 'warning' })));

    // 6. Move into place.
    // releases/ keeps every version (a second file gets "(2)"); _out/ is scratch space and is replaced.
    const keepAll = outDir.split(/[\\/]/).some((part) => part.toLowerCase() === 'releases');
    const place = (p) => (keepAll ? uniquePath(p) : p);
    const finalPath = place(join(outDir, `${stamped}.${outExt}`));
    moveFile(builtPath, finalPath);
    result.output = finalPath;

    // 7. Deck as PDF.
    if (opts.pdf && outExt === 'html') {
      const pdfPath = place(join(outDir, `${stamped}.pdf`));
      const p = deckToPdf(finalPath, pdfPath);
      if (p.ok) {
        result.pdf = pdfPath;
        if (!p.complete) result.notes.push({ level: 'warning', message: p.message, fix: 'Open the PDF and check every slide is there. If not, run it again.' });
      } else {
        result.notes.push(...explain('pdf-print'));
        result.notes.push({ level: 'warning', message: p.message, fix: '' });
      }
    }

    // 8. Page count.
    const pdfToCheck = outExt === 'pdf' ? finalPath : result.pdf;
    if (pdfToCheck) {
      try {
        result.pages = countPages(pdfToCheck);
        const verdict = checkLimit(result.pages, opts.maxPages ?? null);
        result.withinLimit = verdict.ok;
        result.notes.push({ level: verdict.ok ? 'info' : 'error', message: verdict.message, fix: verdict.ok ? '' : 'Shorten the text, make figures smaller, or (only if the brief allows) narrow the margins. Do not shrink the font below the limit.' });
        if (!verdict.ok) result.problems.push({ level: 'error', message: verdict.message, fix: 'See the notes on page limits in system/quarto/README.md.' });
      } catch (err) {
        result.notes.push({ level: 'warning', message: `The pages could not be counted: ${err.message}`, fix: '' });
      }
    }
    result.ok = result.problems.every((p) => p.level !== 'error');
    return result;
  } catch (err) {
    const known = explain(`${err.code || ''} ${err.message}`).find((i) => i.level === 'error');
    if (known) return fail(known.message, known.fix);
    return fail(`Something unexpected went wrong: ${err.message}`, 'Try again. If it keeps happening, ask Claude to look at the technical details.');
  } finally {
    if (!opts.keep) cleanAll();
  }
}

// ---------------------------------------------------------------- command line

function usage() {
  console.error(
    [
      'Usage:',
      '  node system/quarto/tools/render.mjs <source.qmd|source.md> --type cv|cv-ats|letter|report|deck [--out <folder>]',
      '       [--name <name>] [--max-pages <n>] [--release] [--pdf] [--format <name>] [--brand <file>] [--template <folder>] [--reference-doc <file>] [--csl <file>] [--keep] [--json]',
      '  node system/quarto/tools/render.mjs scaffold <type> <folder> [--name <file name>] [--json]',
      '  node system/quarto/tools/render.mjs types',
    ].join('\n'),
  );
}

function printHuman(r) {
  if (r.ok) {
    console.log(`Done. ${r.output}`);
    if (r.pdf) console.log(`PDF copy: ${r.pdf}`);
  } else {
    console.log('The document could not be finished.');
  }
  const lines = [...r.notes, ...r.problems].filter((n, i, a) => a.findIndex((x) => x.message === n.message) === i);
  for (const n of lines) {
    const tag = n.level === 'error' ? 'Problem' : n.level === 'info' ? 'Info' : 'Note';
    console.log(`${tag}: ${n.message}${n.fix ? ' ' + n.fix : ''}`);
  }
  if (!r.ok && r.technical) console.log(`\nTechnical details (for Claude):\n${r.technical}`);
}

function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) { usage(); return 2; }
  const json = args.includes('--json');

  if (args[0] === 'types') {
    const rows = Object.entries(TYPES).map(([k, t]) => ({ type: k, label: t.label, format: t.format, starter: `system/quarto/templates/${t.template}/${t.file}` }));
    console.log(json ? JSON.stringify(rows, null, 2) : rows.map((r) => `${r.type.padEnd(8)} ${r.label}  (${r.starter})`).join('\n'));
    return 0;
  }

  const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

  if (args[0] === 'scaffold') {
    const [, typeKey, folder] = args;
    if (!typeKey || !folder) { usage(); return 2; }
    try {
      const out = scaffold(typeKey, folder, flag('--name'));
      if (json) console.log(JSON.stringify(out));
      else {
        for (const f of out.created) console.log(`Created: ${f}`);
        for (const f of out.skipped) console.log(`Left as it was (already there): ${f}`);
      }
      return 0;
    } catch (err) {
      console.error(err.message);
      return 2;
    }
  }

  const positional = [];
  const valueFlags = new Set(['--type', '--out', '--name', '--max-pages', '--format', '--brand', '--template', '--reference-doc', '--csl']);
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) { i++; continue; }
    if (args[i].startsWith('--')) continue;
    positional.push(args[i]);
  }
  if (positional.length !== 1) { usage(); return 2; }
  const source = positional[0];
  let type = flag('--type');
  if (!type && existsSync(source)) type = guessType(readFileSync(source, 'utf8'));
  if (!type && flag('--template')) {
    const base = readTemplate(resolve(flag('--template'))).data?.base;
    if (base && TYPES[base]) type = base;
  }
  if (!type) {
    console.error('Which kind of document is this? Add --type cv, cv-ats, letter, report or deck.');
    return 2;
  }
  const maxPagesRaw = flag('--max-pages');
  if (maxPagesRaw !== null && !(Number(maxPagesRaw) > 0)) { console.error('--max-pages needs a number, for example --max-pages 6.'); return 2; }

  const result = renderDocument({
    source, type, out: flag('--out'), name: flag('--name'), maxPages: maxPagesRaw ? Number(maxPagesRaw) : null,
    pdf: args.includes('--pdf'), format: flag('--format'), brand: flag('--brand'), template: flag('--template'), referenceDoc: flag('--reference-doc'), csl: flag('--csl'), keep: args.includes('--keep'), release: args.includes('--release'),
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  return result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv);
}
