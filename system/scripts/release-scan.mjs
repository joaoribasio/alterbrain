#!/usr/bin/env node
// release-scan: finds working labels and placeholders in anything that is about to leave the computer.
//
// Honesty labels ([Inference], [Unverified], [Speculation], [FACT NEEDED: ...]) belong in chat and working notes.
// A report, deck, workbook or message the user hands in must use plain wording instead ("we assume", "in our
// reading"). Placeholders such as [Teammate name], [Company] or "Click to add title" must be filled in. Working
// citations such as [Source: [[note]] | date | confidence: high] and [[wiki links]] must become real references.
//
// Reads .md, .qmd, .txt (including the YAML front matter, because title, author and date are printed on the cover;
// only keys that are never printed are skipped, plus ::: {.content-hidden} blocks), .docx, .pptx (slides and speaker
// notes), .xlsx (text cells) through system/lib/ooxml.mjs, and .pdf through pdftotext (Poppler) when it is installed.
// A file this script cannot read is reported as NOT CHECKED and the exit code is 1: it never counts as clean.
//
// Usage: node system/scripts/release-scan.mjs <file...> [--json]
// Exit codes: 0 clean, 1 labels or placeholders found (or a file could not be read or was not checked), 2 usage error.
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMainModule } from '../lib/paths.mjs';
import { docxText, pptxSlides, xlsxCells } from '../lib/ooxml.mjs';

/** Honesty labels. Lists are data: other scripts and tests import them. Matching ignores case. */
export const LABEL_PATTERNS = [
  { label: 'honesty label', source: /\[(?:Inference|Unverified|Speculation|Claim)\]/.source, flags: 'gi' },
  { label: 'honesty label', source: /\[FACT NEEDED[^\]]*\]/.source, flags: 'gi' },
  { label: 'working citation', source: /\[Source:/.source, flags: 'gi' },
];

// Words that start a bracketed gap, in any case: [todo], [Insert date], [Hiring manager], [Company].
const GAP_WORDS =
  'Teammate|Team member|Name|Your|Student|Insert|Enter|Add|TODO|TBD|TBC|Company|Role|Position|Date|Hiring|Course|Programme|Program|Lecturer|Professor|Recipient|Address|Title|Number|Topic|Link|Reference|Citation|Source|Figure|Table|Amount|Year';

// A bracket that is not part of a link, an index or a wiki link: not after a word character, ")" or "]", and not
// followed by "]", "(" or "{" (Markdown link, reference link, Quarto span).
const B_OPEN = String.raw`(?<![\[\w)\]])\[`;
const B_CLOSE = String.raw`\](?![\](\{])`;

/**
 * Placeholders. Not placeholders: a Markdown link [Name](url) or [text][ref], a footnote [^1], a citation [@key],
 * a Quarto span [text]{.class}, a number or range [12], an index x[i], and [sic] or [...]. Quarto shortcodes
 * {{< pagebreak >}} and maths such as x_{{i}} are not placeholders either.
 */
export const PLACEHOLDER_PATTERNS = [
  { label: 'placeholder', source: `${B_OPEN}(?:${GAP_WORDS})\\b[^\\[\\]]*${B_CLOSE}`, flags: 'gi' },
  { label: 'placeholder', source: `${B_OPEN}[^\\[\\]]{0,40}\\b(?:name|here|details|number)${B_CLOSE}`, flags: 'gi' },
  { label: 'placeholder', source: `${B_OPEN}X{1,3}${B_CLOSE}`, flags: 'g' },
  { label: 'wiki link', source: /\[\[[^\]]+\]\]/.source, flags: 'g' },
  { label: 'placeholder', source: /(?<![_^{\\])\{\{\s*[A-Za-z_][\w. -]*\s*\}\}/.source, flags: 'g' },
  { label: 'placeholder', source: /<\s*(?:insert|your|enter|add)\b[^<>]*>/.source, flags: 'gi' },
  { label: 'placeholder', source: /(?<![\w_])_{3,}(?![\w_])/.source, flags: 'g' },
  { label: 'placeholder', source: /\bX{2,}\s?(?:%|m\b|k\b|bn\b)|[€$£]\s?X{2,}\b/.source, flags: 'g' },
  { label: 'placeholder', source: /Lorem ipsum/.source, flags: 'gi' },
  { label: 'placeholder', source: /Click to (?:add|edit) (?:title|text|subtitle|master[^.\n]*)/.source, flags: 'gi' },
];

const TEXT_EXT = new Set(['.md', '.qmd', '.txt']);

function excerptOf(line, index, length) {
  const from = Math.max(0, index - 30);
  const to = Math.min(line.length, index + length + 30);
  return (from > 0 ? '...' : '') + line.slice(from, to).trim() + (to < line.length ? '...' : '');
}

/**
 * Scan plain text. Returns [{ line, label, match, excerpt }] (line is 1-based).
 * Lines in `skip` (a Set of 1-based line numbers) are ignored. A line that is only a horizontal rule is ignored.
 */
export function scanText(text, skip = new Set()) {
  const hits = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (skip.has(i + 1)) return;
    if (/^\s*([_*-])\1{2,}\s*$/.test(line)) return;
    const seen = new Set();
    for (const p of [...LABEL_PATTERNS, ...PLACEHOLDER_PATTERNS]) {
      const re = new RegExp(p.source, p.flags);
      for (const m of line.matchAll(re)) {
        if (seen.has(m.index)) continue;
        seen.add(m.index);
        hits.push({ line: i + 1, label: p.label, match: m[0], excerpt: excerptOf(line, m.index, m[0].length) });
      }
    }
  });
  return hits;
}

/** Front matter keys whose values are never printed in the rendered file. Every other key is scanned. */
export const HIDDEN_KEYS = new Set(
  [
    'facts_used', 'facts_flagged', 'status', 'slop_check', 'format', 'bibliography', 'csl', 'reference-doc', 'reference_doc', 'type', 'style',
    'template', 'voice', 'tone', 'kind', 'tags', 'class', 'recipient_class', 'lang', 'execute', 'engine', 'jupyter', 'filters', 'toc',
    'number-sections', 'output-file', 'project', 'template-partials', 'include-in-header', 'include-before-body', 'include-after-body',
    'theme', 'css', 'fontsize', 'geometry', 'mainfont', 'documentclass', 'classoption', 'papersize', 'links-as-notes', 'keep-tex', 'keep-md',
    'cite-method', 'link-citations', 'crossref', 'knitr',
  ],
);

/**
 * Line numbers to ignore in a Markdown/Quarto file: ::: {.content-hidden} blocks, and part of the front matter.
 * frontMatter 'hidden-keys' (default) skips the delimiters, comments and the keys in HIDDEN_KEYS, so title, subtitle,
 * author, date and the like are scanned. 'all' skips the whole front matter.
 */
export function skippedLines(text, { frontMatter = 'hidden-keys' } = {}) {
  const skip = new Set();
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  let start = 0;
  if (lines[0] && /^---\s*$/.test(lines[0])) {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) {
      let hiding = false;
      for (let i = 0; i <= end; i++) {
        const l = lines[i];
        if (frontMatter === 'all' || i === 0 || i === end || /^\s*#/.test(l)) {
          skip.add(i + 1);
          continue;
        }
        const key = l.match(/^([A-Za-z_][\w-]*)\s*:/);
        if (key) hiding = HIDDEN_KEYS.has(key[1].toLowerCase());
        if (hiding) skip.add(i + 1);
      }
      start = end + 1;
    }
  }
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (depth === 0) {
      if (/^:{3,}\s*\{[^}]*content-hidden/.test(l)) {
        depth = 1;
        skip.add(i + 1);
      }
    } else {
      skip.add(i + 1);
      if (/^:{3,}\s*$/.test(l)) depth--;
      else if (/^:{3,}\s*\S/.test(l)) depth++;
    }
  }
  return skip;
}

/** pdftotext (Poppler): on PATH, in the WinGet links folder or in the usual Homebrew folders. Returns a path or null. */
export function findPdftotext({ pathEnv = process.env.PATH || process.env.Path || '', localAppData = process.env.LOCALAPPDATA || '' } = {}) {
  const dirs = pathEnv.split(delimiter);
  if (localAppData) dirs.push(join(localAppData, 'Microsoft', 'WinGet', 'Links'));
  dirs.push('/opt/homebrew/bin', '/usr/local/bin');
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of dirs) {
    if (!d) continue;
    for (const e of exts) {
      const p = join(d, 'pdftotext' + e);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export const PDF_NOT_CHECKED =
  'I cannot read the text of a PDF here because pdftotext (part of Poppler, the PDF page renderer) is not installed, so this PDF was NOT checked. Install Poppler once (see delivery-gate.md, "The page renderer"), or give deliver-check.mjs the file the PDF was made from with --source.';

/** Text of a PDF, one string per page. Returns null when pdftotext is missing. Throws an Error with a plain sentence. */
export function pdfPages(file, tool = findPdftotext()) {
  if (!tool) return null;
  const r = spawnSync(tool, ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8', timeout: 120_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`pdftotext could not read the PDF. It said: ${(r.stderr || (r.error && r.error.message) || 'nothing').trim().split('\n')[0]}`);
  const pages = r.stdout.split('\f');
  if (pages.length && pages[pages.length - 1].trim() === '') pages.pop();
  return pages;
}

/** Scan one file. Returns { file, hits: [{ location, label, match, excerpt }], error?, skipped? }. `pdftotext`: a path, or null to simulate none. */
export function scanFile(file, { pdftotext } = {}) {
  const ext = extname(file).toLowerCase();
  const out = { file, hits: [] };
  if (!existsSync(file)) return { ...out, error: 'File not found.' };
  try {
    if (TEXT_EXT.has(ext)) {
      const text = readFileSync(file, 'utf8');
      const skip = ext === '.txt' ? new Set() : skippedLines(text);
      out.hits = scanText(text, skip).map((h) => ({ location: `line ${h.line}`, label: h.label, match: h.match, excerpt: h.excerpt }));
    } else if (ext === '.pdf') {
      const pages = pdfPages(file, pdftotext === undefined ? findPdftotext() : pdftotext);
      if (pages === null) return { ...out, skipped: PDF_NOT_CHECKED };
      if (!pages.some((p) => p.trim())) return { ...out, skipped: 'This PDF has no text I can read (it may be scanned images), so it was NOT checked. Check the file it was made from.' };
      pages.forEach((p, i) => {
        for (const h of scanText(p)) out.hits.push({ location: `page ${i + 1} line ${h.line}`, label: h.label, match: h.match, excerpt: h.excerpt });
      });
    } else if (ext === '.docx') {
      out.hits = scanText(docxText(file)).map((h) => ({ location: `paragraph ${h.line}`, label: h.label, match: h.match, excerpt: h.excerpt }));
    } else if (ext === '.pptx') {
      for (const s of pptxSlides(file)) {
        const parts = [
          ['', [s.title, ...s.texts].join('\n')],
          [' notes', s.notes],
        ];
        for (const [suffix, text] of parts) {
          for (const h of scanText(text)) out.hits.push({ location: `slide ${s.n}${suffix}`, label: h.label, match: h.match, excerpt: h.excerpt });
        }
      }
    } else if (ext === '.xlsx') {
      for (const sh of xlsxCells(file).sheets) {
        for (const c of sh.cells) {
          if (c.type !== 'string' || !c.value) continue;
          for (const h of scanText(c.value)) out.hits.push({ location: `${sh.name}!${c.ref}`, label: h.label, match: h.match, excerpt: h.excerpt });
        }
      }
    } else {
      return { ...out, skipped: `I do not read ${ext || 'this kind of'} files, so this file was NOT checked. Scan the source file it was made from.` };
    }
  } catch (e) {
    return { ...out, error: e.message };
  }
  return out;
}

export function scanFiles(files, opts) {
  return files.map((f) => scanFile(f, opts));
}

function usage() {
  return [
    'Usage: node system/scripts/release-scan.mjs <file...> [--json]',
    'Finds honesty labels ([Inference], [Unverified], [FACT NEEDED ...]), working citations ([Source: ...], [[wiki links]]) and',
    'placeholders ([Teammate name], [Company], Lorem ipsum, ...) in .md, .qmd, .txt, .docx, .pptx, .xlsx and .pdf files.',
    'A file I cannot read is reported as not checked and fails. Exit 0 clean, 1 found or not checked, 2 usage error.',
  ].join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (argv.includes('--help') || files.length === 0) {
    console.error(usage());
    return 2;
  }
  const results = scanFiles(files);
  const total = results.reduce((n, r) => n + r.hits.length, 0);
  const problems = results.filter((r) => r.error).length;
  const unchecked = results.filter((r) => r.skipped).length;
  const notFound = results.some((r) => r.error === 'File not found.');
  const ok = total === 0 && problems === 0 && unchecked === 0;
  if (json) {
    console.log(JSON.stringify({ ok, total, results }, null, 2));
  } else {
    for (const r of results) {
      if (r.error) console.log(`${r.file}: I could not check this file. ${r.error}`);
      else if (r.skipped) console.log(`${r.file}: NOT CHECKED. ${r.skipped}`);
      else if (r.hits.length === 0) console.log(`${r.file}: clean.`);
      else {
        console.log(`${r.file}: ${r.hits.length} to fix.`);
        for (const h of r.hits) console.log(`  ${h.location}: ${h.label} ${h.match}  (${h.excerpt})`);
      }
    }
    if (ok) console.log('Nothing to fix. No working labels or placeholders found.');
    else {
      if (total) console.log('Replace each label with plain wording ("we assume", "in our reading") and fill in each placeholder before this leaves the computer.');
      if (unchecked) console.log(`${unchecked} file(s) were NOT checked, so this is not a pass.`);
    }
  }
  if (notFound && total === 0 && results.every((r) => r.error === 'File not found.')) return 2;
  return ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
