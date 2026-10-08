#!/usr/bin/env node
// deliver-check: the mechanical part of the delivery gate (system/deliverables/delivery-gate.md).
// Run it on the final files before telling the user to upload anything. It checks:
//   * the release scan: no honesty labels or placeholders (release-scan.mjs). A file that could not be read (for
//     example a PDF when pdftotext is not installed) FAILS as "not-checked"; it is never reported as clean. Pass the
//     file the PDF was made from with --source <file> to have that checked instead.
//   * the size of each file against --max-mb
//   * the shared base name (--base-name) and a file-name rule given as a regular expression (--name-pattern <regex>)
//   * every .xlsx: error cells and uncalculated formulas (blocking), typed numbers in formulas (advice only)
//   * every .pptx and deck .qmd: each slide title (after the cover) is a sentence of 4 or more words and at most 90
//     characters, and a slide with a chart or table has a line starting "Source"
// It does NOT check page limits or fonts (the main session reads the template's house rules and looks at the pages) and
// cannot judge the story or compare the numbers across files.
//
// When a rubric or template contradicts a check, the main session says so to the user, records one line in the
// hand-over and reruns with --allow-titles <regex> (titles the rubric prescribes) or --skip-checks <names>
// (slide-title, source-line, file-name, base-name, size, workbook). The result lists every waived check.
//
// Usage: node system/scripts/deliver-check.mjs <file...> [--max-mb N] [--base-name] [--name-pattern <regex>]
//        [--source <file>]... [--allow-titles <regex>] [--skip-checks a,b] [--json]
// Exit codes: 0 pass, 1 problems, 2 usage error.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { isMainModule } from '../lib/paths.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { pptxSlides } from '../lib/ooxml.mjs';
import { scanFile, skippedLines } from './release-scan.mjs';
import { checkWorkbook } from './workbook-check.mjs';

export const TITLE_MIN_WORDS = 4;
export const TITLE_MAX_CHARS = 90;
export const CHECK_NAMES = ['slide-title', 'source-line', 'file-name', 'base-name', 'size', 'workbook'];
// Titles that are fine as they are: the structural slides a deck needs, and appendix-style slides.
const EXEMPT_TITLE =
  /^(?:(?:appendix|annex|backup)(?:\s+[A-Z0-9]+)?|executive summary|summary|in brief|agenda|contents|next steps|questions(?: and answers)?|q&a|thank you|references|sources|bibliography)(?:\s*[:\-–—(].*)?$/i;
const SOURCE_LINE = /^\s*[*_>#\-\s]*(<small>)?\s*\*{0,2}Sources?\*{0,2}\s*[:\-.]/i;

/** Problems for one slide title. `n` is the slide number. `allow` is an optional RegExp for titles the rubric prescribes. */
export function checkTitle(title, n, allow = null) {
  const t = String(title || '').trim();
  if (!t) return [{ check: 'slide-title', location: `slide ${n}`, detail: 'The slide has no title.' }];
  if (EXEMPT_TITLE.test(t) || (allow && allow.test(t))) return [];
  const out = [];
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < TITLE_MIN_WORDS) out.push({ check: 'slide-title', location: `slide ${n}`, detail: `Title "${t}" has ${words} word${words === 1 ? '' : 's'}. State the takeaway as a sentence of ${TITLE_MIN_WORDS} or more words.` });
  if (t.length > TITLE_MAX_CHARS) out.push({ check: 'slide-title', location: `slide ${n}`, detail: `Title is ${t.length} characters. Keep it to ${TITLE_MAX_CHARS} so it fits on two lines.` });
  return out;
}

/**
 * Deck checks on slides shaped like pptxSlides output: [{ n, title, texts[], hasChart, hasTable, cover? }].
 * opts.coverFirst (default true): the first slide is the cover, which a .pptx has. A deck .qmd builds its cover from
 * the front matter, so its first slide is content: pass coverFirst false (a slide marked cover: true is exempt too).
 */
export function checkSlides(slides, { coverFirst = true, allow = null } = {}) {
  const problems = [];
  slides.forEach((s, i) => {
    const isCover = s.cover === true || (coverFirst && i === 0);
    if (!isCover) problems.push(...checkTitle(s.title, s.n, allow));
    if ((s.hasChart || s.hasTable) && !(s.texts || []).some((t) => SOURCE_LINE.test(t) || /^\s*Sources?\b/i.test(t))) {
      problems.push({ check: 'source-line', location: `slide ${s.n}`, detail: 'The slide shows a chart or table but has no line starting "Source".' });
    }
  });
  return problems;
}

/** True when a .qmd is a deck: its front matter asks for slides. */
export function isDeckQmd(text) {
  const { raw, data } = splitFrontmatter(text);
  return /\b(pptx|revealjs|beamer)\b/.test(raw) || /deck/.test(String(data.style || ''));
}

/** Slides of a deck .qmd: each level-2 heading starts one. A heading with .title-slide is the cover (cover: true). */
export function qmdSlides(text) {
  const skip = skippedLines(text, { frontMatter: 'all' });
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const slides = [];
  let cur = null;
  let inCode = false;
  lines.forEach((line, i) => {
    if (skip.has(i + 1)) return;
    if (/^```/.test(line)) {
      if (!inCode && cur && /^```\{/.test(line)) cur.hasChart = true;
      inCode = !inCode;
      return;
    }
    if (inCode) return;
    const h = line.match(/^##\s+(.*?)\s*(\{[^}]*\})?\s*$/);
    if (h) {
      cur = { n: slides.length + 1, title: h[1], texts: [], hasChart: false, hasTable: false, cover: /\.title-slide/.test(h[2] || '') };
      slides.push(cur);
      return;
    }
    if (!cur) return;
    if (/^!\[/.test(line)) cur.hasChart = true;
    if (/^\s*\|?\s*:?-{3,}:?\s*\|/.test(line)) cur.hasTable = true;
    if (line.trim()) cur.texts.push(line.trim());
  });
  return slides;
}

const stem = (f) => basename(f, extname(f));

/** Content checks on one readable file: release scan, workbook, deck. Returns { problems, warnings }. */
function inspect(file, opts, allow) {
  const problems = [];
  const warnings = [];
  const scan = scanFile(file, { pdftotext: opts.pdftotext });
  if (scan.error) problems.push({ check: 'release-scan', location: '', detail: `Could not check for labels and placeholders. ${scan.error}` });
  else if (scan.skipped) problems.push({ check: 'not-checked', location: '', detail: scan.skipped, skipped: true });
  for (const h of scan.hits) problems.push({ check: 'release-scan', location: h.location, detail: `${h.label} ${h.match} (${h.excerpt})` });
  const ext = extname(file).toLowerCase();
  try {
    if (ext === '.xlsx') {
      const wb = checkWorkbook(file);
      for (const p of wb.problems) problems.push({ check: `workbook:${p.kind}`, location: `${p.sheet}!${p.ref}`, detail: p.detail });
      for (const w of wb.warnings || []) warnings.push({ check: `workbook:${w.kind}`, location: `${w.sheet}!${w.ref}`, detail: w.detail });
    } else if (ext === '.pptx') {
      problems.push(...checkSlides(pptxSlides(file), { coverFirst: true, allow }));
    } else if (ext === '.qmd') {
      const text = readFileSync(file, 'utf8');
      if (isDeckQmd(text)) problems.push(...checkSlides(qmdSlides(text), { coverFirst: false, allow }));
    }
  } catch (e) {
    problems.push({ check: 'open', location: '', detail: e.message });
  }
  return { problems, warnings };
}

/**
 * Run every check. opts: { maxMb, baseName, namePattern, sources[], allowTitles, skipChecks[], pdftotext }.
 * Returns { ok, files: [{ file, sizeMb, problems, warnings }], set: problems, waived: [names] }.
 */
export function checkFiles(files, opts = {}) {
  const set = [];
  const skipChecks = new Set(opts.skipChecks || []);
  const allow = opts.allowTitles ? new RegExp(opts.allowTitles, 'i') : null;
  const waived = new Set();
  const results = files.map((file) => {
    let problems = [];
    let warnings = [];
    let sizeMb = null;
    if (!existsSync(file)) return { file, sizeMb, problems: [{ check: 'exists', location: '', detail: 'File not found.' }], warnings };
    sizeMb = Math.round((statSync(file).size / 1048576) * 100) / 100;
    if (opts.maxMb != null && statSync(file).size > opts.maxMb * 1048576) {
      problems.push({ check: 'size', location: '', detail: `${sizeMb} MB is over the ${opts.maxMb} MB upload limit.` });
    }
    if (opts.namePattern && !new RegExp(opts.namePattern).test(basename(file))) {
      problems.push({ check: 'file-name', location: '', detail: `The name does not follow the rule ${opts.namePattern}.` });
    }
    const own = inspect(file, opts, allow);
    problems.push(...own.problems);
    warnings.push(...own.warnings);
    // A file that could not be read is covered only when the files it was made from pass the same checks.
    if (problems.some((p) => p.skipped) && (opts.sources || []).length) {
      problems = problems.filter((p) => !p.skipped);
      for (const src of opts.sources) {
        if (!existsSync(src)) {
          problems.push({ check: 'not-checked', location: '', detail: `The source file ${src} was not found, so ${basename(file)} was NOT checked.` });
          continue;
        }
        const s = inspect(src, opts, allow);
        for (const p of s.problems) problems.push({ ...p, location: `source ${basename(src)}${p.location ? ` ${p.location}` : ''}` });
        for (const w of s.warnings) warnings.push({ ...w, location: `source ${basename(src)}${w.location ? ` ${w.location}` : ''}` });
      }
    }
    problems = problems.map(({ skipped, ...p }) => p);
    return { file, sizeMb, problems, warnings };
  });
  if (opts.baseName) {
    const stems = new Set(files.map((f) => stem(f)));
    if (stems.size > 1) set.push({ check: 'base-name', location: '', detail: `The files do not share one base name: ${[...stems].join(', ')}.` });
  }
  const isSkipped = (check) => skipChecks.has(check) || (check.startsWith('workbook') && skipChecks.has('workbook'));
  const drop = (list) =>
    list.filter((p) => {
      if (isSkipped(p.check)) {
        waived.add(p.check.startsWith('workbook') ? 'workbook' : p.check);
        return false;
      }
      return true;
    });
  for (const r of results) r.problems = drop(r.problems);
  const setKept = drop(set);
  const ok = results.every((r) => r.problems.length === 0) && setKept.length === 0;
  return { ok, files: results, set: setKept, waived: [...waived].sort(), skippedChecks: [...skipChecks].sort() };
}

const USAGE =
  'Usage: node system/scripts/deliver-check.mjs <file...> [--max-mb N] [--base-name] [--name-pattern <regex>] [--source <file>]... [--allow-titles <regex>] [--skip-checks a,b] [--json]';

function main(argv) {
  const files = [];
  const opts = { sources: [], skipChecks: [] };
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--base-name') opts.baseName = true;
    else if (a === '--max-mb') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error('--max-mb needs a number above 0.');
        return 2;
      }
      opts.maxMb = n;
    } else if (a === '--name-pattern' || a === '--allow-titles') {
      const v = argv[++i];
      try {
        new RegExp(v);
      } catch {
        console.error(`${a} needs a valid regular expression.`);
        return 2;
      }
      if (a === '--name-pattern') opts.namePattern = v;
      else opts.allowTitles = v;
    } else if (a === '--source') {
      const v = argv[++i];
      if (!v) {
        console.error('--source needs a file.');
        return 2;
      }
      opts.sources.push(v);
    } else if (a === '--skip-checks') {
      const names = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
      const bad = names.filter((n) => !CHECK_NAMES.includes(n));
      if (!names.length || bad.length) {
        console.error(`--skip-checks needs names from: ${CHECK_NAMES.join(', ')}.${bad.length ? ` I do not know: ${bad.join(', ')}.` : ''}`);
        return 2;
      }
      opts.skipChecks.push(...names);
    } else if (a.startsWith('--')) {
      console.error(`I do not know the option ${a}.`);
      return 2;
    } else files.push(a);
  }
  if (files.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const res = checkFiles(files, opts);
  if (json) console.log(JSON.stringify(res, null, 2));
  else {
    for (const r of res.files) {
      if (r.problems.length === 0) console.log(`${r.file}: passes the mechanical checks${r.sizeMb != null ? ` (${r.sizeMb} MB)` : ''}.`);
      else {
        console.log(`${r.file}: ${r.problems.length} to fix.`);
        for (const p of r.problems) console.log(`  [${p.check}]${p.location ? ` ${p.location}:` : ''} ${p.detail}`);
      }
      if (r.warnings.length) {
        console.log(`  Advice (does not fail the check), ${r.warnings.length}:`);
        for (const w of r.warnings.slice(0, 10)) console.log(`    [${w.check}] ${w.location}: ${w.detail}`);
        if (r.warnings.length > 10) console.log(`    ... and ${r.warnings.length - 10} more (use --json for all).`);
      }
    }
    for (const p of res.set) console.log(`[${p.check}] ${p.detail}`);
    if (res.skippedChecks.length) console.log(`Waived checks: ${res.skippedChecks.join(', ')}. Tell the user which rule you followed instead and record it in the hand-over.`);
    if (opts.allowTitles) console.log(`Titles matching ${opts.allowTitles} were allowed. Tell the user which rubric or template asks for them.`);
    console.log(res.ok ? 'Mechanical checks passed. The main session still has to look at every page, check the template house rules (page limit, fonts) and compare the numbers across files.' : 'Fix these before telling the user to upload.');
  }
  return res.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
