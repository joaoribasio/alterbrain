#!/usr/bin/env node
// Adapted from COG-second-brain (MIT) — https://github.com/huytieu/COG-second-brain @ c6cb32807254254abff0a04a8a59df2ac9e39eb9
// slop-check: a deterministic scan for "AI slop" tells in text that is about to be sent or published.
//
// Adapted from COG-second-brain slop-gate (MIT, Copyright (c) 2025 Huy Tieu)
//   https://github.com/huytieu/COG-second-brain @ c6cb32807254254abff0a04a8a59df2ac9e39eb9
//   (.claude/skills/slop-gate/scripts/scan.py, blob e8a64f55df1992d8d6d6f16dbb303ccb1638941b)
// Re-written in Node with zero dependencies. Changes from the original: word lists are data
// (see DEFAULT_LISTS and the optional extra file), line numbers in hits, --lang, --json, and the
// "recap ending" rule only looks at the final paragraph.
//
// Rules in plain words:
//   * A HARD tell fails the text on one hit.
//   * FILLER words fail the text only when there are three or more (one is a word choice).
//   * Text in quotes, backticks and code blocks is ignored (it is an example, not your voice).
//   * A file that contains "slop-ok: <reason>" is skipped on purpose.
//   * For languages other than English only language-neutral checks run.
//
// Usage:
//   node system/scripts/slop-check.mjs <file|-> [more files] [--lang en] [--json] [--extra path] [--soft-limit n]
// Exit codes: 0 clear, 1 tells found, 2 usage error.
//
// Extra rules (optional): vault/80_me/voice/slop-extra.json
//   {
//     "soft_limit": 3,
//     "hard":   [ { "label": "my pet hate", "pattern": "\\bsynergy\\b", "flags": "i" } ],
//     "filler": [ "synerg*", "holistic" ],          // plain words; a trailing * matches any ending
//     "filler_patterns": [ "\\bmoving forward\\b" ], // regex sources, matched case-insensitively
//     "disable": [ "em dash" ],                      // labels of built-in rules to switch off
//     "languages": { "nl": { "hard": [], "filler": [], "recap": ["tot slot"] } }
//   }
// Top-level "hard", "filler" and "filler_patterns" apply to English. Use "languages.<code>" for others.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vaultPath, isMainModule } from '../lib/paths.mjs';

// ---------------------------------------------------------------------------------------------
// Word lists (data). Regex sources are strings so they can be listed, extended and tested.
// ---------------------------------------------------------------------------------------------
export const DEFAULT_LISTS = {
  soft_limit: 3,

  // Language-neutral limits (used for every language).
  neutral: {
    emdash_per_1000_words: 2, // non-English: fail when density is above this AND there are 3+ dashes
    emdash_min_count: 3,
  },

  // Hard tells for English. `neutral: true` rules also run for other languages (see code).
  hard: [
    { label: 'em dash', pattern: '—', flags: '', neutral: true },
    {
      label: 'honesty framing',
      pattern: "\\b(honestly|to be honest|if I'm being honest|the honest (part|truth|answer|reason)|I'll be honest)\\b",
      flags: 'i',
    },
    {
      label: "not-X-it's-Y contrast",
      pattern:
        "\\b(it'?s|this is|that'?s|the (question|point|problem|issue)) (is )?not (just |only |about )?[^.\\n]{2,60}[.,;] ?(it'?s|but|it is) ",
      flags: 'i',
    },
    { label: "not-X-it's-Y contrast", pattern: "\\bnot just [^.\\n]{2,40}, (it'?s|but) ", flags: 'i' },
    {
      label: "not-X-it's-Y contrast",
      pattern: '\\b(it|this|that) (is|was) not (about |just |only )?[^.,;\\n]{2,50}, (it|this|that) (is|was) ',
      flags: 'i',
    },
    { label: 'X-not-Y contrast', pattern: '\\b[a-z][a-z-]+, not (a |an |the |just |only )?[a-z][a-z -]{1,30}[.;:]', flags: '' },
    { label: 'X-not-Y contrast', pattern: '\\b(rather than|instead of) [a-z][a-z -]{1,30}[.;]', flags: 'i' },
    {
      label: 'rhetorical heading',
      pattern:
        "^\\s*(#{1,6}|<h[1-6][^>]*>)\\s*(why (this|it) matters|the (key|real) (insight|point|opportunity|truth)|what this is not|the bottom line|the deeper point|the uncomfortable truth|here'?s the thing|the takeaway|so what|what comes next|what'?s next|where (it|this|we) go(es)? (from here|next))\\b",
      flags: 'im',
    },
    {
      label: 'The <Noun> heading',
      pattern: '^\\s*(#{1,6}|<h[1-6][^>]*>)\\s*The [A-Z][a-z]+\\s*(</h[1-6]>)?\\s*$',
      flags: 'm',
    },
    {
      label: 'verdict kicker',
      pattern: "\\bThat (is|was|'s) (the (point|lie|whole (point|thing)|part [a-z ]{3,30})|all [a-z ]{2,30} is for)\\.",
      flags: 'i',
    },
    {
      label: 'fake-profound closer',
      pattern:
        "\\b(let that sink in|this changes everything|what nobody (tells|talks about)|the part (everyone|most people) miss(es)?|and that'?s not nothing)\\b",
      flags: 'i',
    },
    {
      label: 'throat-clearing',
      pattern:
        "\\b(here'?s the thing|let me be clear|it'?s worth noting|it is worth noting|it'?s important to note|at the end of the day|in today'?s (fast-paced|ever-evolving|digital))\\b",
      flags: 'i',
    },
    {
      label: 'sycophancy',
      pattern: "\\b(great question|you'?re (absolutely )?right to push back|that'?s on me|you were right to)\\b",
      flags: 'i',
    },
    {
      label: 'emoji heading',
      pattern: '^\\s*#{1,6}\\s*[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]',
      flags: 'mu',
      neutral: true,
    },
  ],

  // "Recap ending" openers: only the last paragraph is checked. Add languages freely.
  recap: {
    en: ['in conclusion', 'ultimately', 'overall', 'to sum up', 'in summary'],
    nl: ['tot slot', 'kortom', 'samenvattend', 'concluderend', 'conclusie', 'al met al'],
    de: ['zusammenfassend', 'abschließend', 'fazit', 'insgesamt', 'zum schluss'],
    fr: ['en conclusion', 'en résumé', 'pour conclure', 'en somme', 'au final'],
    es: ['en conclusión', 'en resumen', 'para concluir', 'en definitiva'],
    pt: ['em conclusão', 'em resumo', 'em suma', 'para concluir'],
    it: ['in conclusione', 'in sintesi', 'in definitiva', 'per concludere'],
  },

  // Counted, not banned. Regex sources, matched case-insensitively with word boundaries around the group.
  filler_patterns: [
    'delve|delves|delving',
    'leverag(e|es|ing)',
    'utiliz(e|es|ing)',
    'seamless(ly)?',
    'robust(ly)?',
    'tapestry',
    'game[- ]changer',
    'paradigm shift',
    'cutting-edge',
    'empower(s|ing)?',
    'streamlin(e|es|ing)',
    'load-bearing',
    'unlock the (potential|power)',
    'genuinely',
    'quietly',
    'deep dive',
    'dive in(to)?',
    'clean',
    'plain',
    'simple',
    'elegant',
    'powerful',
    'lightweight',
  ],
};

const TEXT_EXT = new Set(['.md', '.mdx', '.markdown', '.qmd', '.html', '.htm', '.txt', '.svg', '.rst', '']);
const SKIP_PATH = ['/node_modules/', '/.git/'];
const MAX_LISTED = 12;
const MAX_FILLER_LISTED = 6;

// ---------------------------------------------------------------------------------------------
// Extra rules
// ---------------------------------------------------------------------------------------------
export function defaultExtraPath() {
  return vaultPath('80_me', 'voice', 'slop-extra.json');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn a plain word ("synerg*", "moving forward") into a regex source. */
function wordToSource(word) {
  const w = String(word).trim();
  if (!w) return null;
  const wild = w.endsWith('*');
  const core = escapeRegex(wild ? w.slice(0, -1) : w).replace(/\\? /g, '\\s+');
  return wild ? `${core}\\w*` : core;
}

function compileRule(rule, extraFlags = '') {
  const flags = new Set(String(rule.flags || '').split(''));
  for (const f of extraFlags) flags.add(f);
  flags.add('g');
  return new RegExp(rule.pattern, [...flags].join(''));
}

/** Load the optional extra file. Never throws: returns { extra, warning }. */
export function loadExtra(path) {
  if (!path || !existsSync(path)) return { extra: null, warning: null };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('top level must be an object');
    return { extra: parsed, warning: null };
  } catch (err) {
    return { extra: null, warning: `Could not read ${path} (${err.message}). Using the built-in lists only.` };
  }
}

export function normLang(lang) {
  return String(lang || 'en').toLowerCase().split(/[-_]/)[0] || 'en';
}

/**
 * Build the active rule set for a language.
 * Returns { hard: [{label, re, scope}], filler: RegExp|null, softLimit, recap: RegExp|null, warnings }.
 */
export function buildRules(lang = 'en', extra = null, overrides = {}) {
  const code = normLang(lang);
  const english = code === 'en';
  const warnings = [];
  const disabled = new Set((extra?.disable || []).map((s) => String(s).toLowerCase()));
  // Top-level keys are English. "languages.<code>" holds any other language (and may add to English).
  const pick = (key) => [...(english ? extra?.[key] || [] : []), ...(extra?.languages?.[code]?.[key] || [])];
  const langExtra = { hard: pick('hard'), filler: pick('filler'), filler_patterns: pick('filler_patterns'), recap: pick('recap') };

  const hard = [];
  const addHard = (rule, source) => {
    if (!rule || !rule.pattern || disabled.has(String(rule.label).toLowerCase())) return;
    try {
      hard.push({ label: rule.label || 'custom rule', re: compileRule(rule), neutral: !!rule.neutral });
    } catch (err) {
      warnings.push(`Skipped a bad pattern in ${source} ("${rule.label || rule.pattern}"): ${err.message}`);
    }
  };

  for (const r of DEFAULT_LISTS.hard) {
    if (english || r.neutral) {
      if (r.label === 'em dash' && !english) continue; // handled as a density check
      addHard(r, 'built-in rules');
    }
  }
  for (const r of langExtra.hard || []) addHard(r, 'the extra file');

  // Recap endings (last paragraph only).
  const recapWords = [...(DEFAULT_LISTS.recap[code] || []), ...(langExtra.recap || [])].filter(Boolean);
  const recap = recapWords.length
    ? new RegExp(`^\\s*(?:${recapWords.map((w) => escapeRegex(String(w)).replace(/\\? /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'iu')
    : null;

  // Filler (English built-ins plus extras for the language).
  const sources = [];
  if (english) for (const p of DEFAULT_LISTS.filler_patterns) sources.push(p);
  for (const p of langExtra.filler_patterns || []) sources.push(String(p));
  for (const w of langExtra.filler || []) {
    const s = wordToSource(w);
    if (s) sources.push(s);
  }
  let filler = null;
  if (sources.length) {
    try {
      filler = new RegExp(`(?<![\\p{L}\\p{N}])(?:${sources.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    } catch (err) {
      warnings.push(`Skipped the filler list: ${err.message}`);
    }
  }

  const limitFromExtra = Number(extra?.soft_limit);
  const softLimit = Number.isFinite(overrides.softLimit)
    ? overrides.softLimit
    : Number.isFinite(limitFromExtra) && limitFromExtra > 0
      ? limitFromExtra
      : DEFAULT_LISTS.soft_limit;

  return {
    lang: code,
    english,
    hard,
    recap,
    filler,
    softLimit,
    emdashDisabled: disabled.has('em dash'),
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------
// Stripping quoted material (keeps offsets and line numbers by blanking, not deleting)
// ---------------------------------------------------------------------------------------------
const blank = (s) => s.replace(/[^\n]/g, ' ');

function blankFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/);
  return m ? blank(m[0]) + text.slice(m[0].length) : text;
}

function blankFences(text) {
  const lines = text.split('\n');
  let open = null; // { ch, len }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (open) {
      if (m && m[1][0] === open.ch && m[1].length >= open.len && /^\s*(`{3,}|~{3,})\s*$/.test(line)) open = null;
      lines[i] = blank(line);
    } else if (m) {
      open = { ch: m[1][0], len: m[1].length };
      lines[i] = blank(line);
    }
  }
  return lines.join('\n');
}

/** Quoted, fenced, code-formatted, comment and frontmatter spans are exhibits, not the author's voice. */
export function stripQuoted(text) {
  let t = text.replace(/\r\n/g, '\n');
  t = blankFrontmatter(t);
  t = blankFences(t);
  t = t.replace(/<!--[\s\S]*?-->/g, blank);
  t = t.replace(/`[^`\n]*`/g, blank);
  t = t.replace(/"[^"\n]{0,160}"/g, blank);
  t = t.replace(/“[^”\n]{0,160}”/g, blank);
  return t;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function excerpt(text, start, end) {
  return text
    .slice(Math.max(0, start - 28), end + 28)
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

function lastParagraph(masked) {
  // Returns { text, offset } of the final non-empty paragraph.
  const re = /\n\s*\n/g;
  let lastEnd = 0;
  let m;
  while ((m = re.exec(masked)) !== null) {
    if (masked.slice(m.index + m[0].length).trim()) lastEnd = m.index + m[0].length;
  }
  return { text: masked.slice(lastEnd), offset: lastEnd };
}

// ---------------------------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------------------------
/** True when the text carries the "slop-ok:" marker. */
export function hasExemptionMarker(text) {
  return /slop-ok:/.test(text);
}

/**
 * Scan text. Returns:
 *  { status: 'clear'|'fail'|'exempt', lang, hard: [...], filler: {count, limit, hits}, total_hard, tells: [...flat], warnings }
 */
export function scanText(text, opts = {}) {
  const rules = opts.rules || buildRules(opts.lang || 'en', opts.extra || null, { softLimit: opts.softLimit });
  const base = { lang: rules.lang, hard: [], total_hard: 0, filler: { count: 0, limit: rules.softLimit, hits: [] }, tells: [], warnings: [...rules.warnings] };

  if (hasExemptionMarker(text)) return { ...base, status: 'exempt' };

  const body = stripQuoted(text);
  const hard = [];
  let totalHard = 0;
  const push = (label, index, length) => {
    totalHard++;
    if (hard.length < MAX_LISTED) hard.push({ label, line: lineOf(body, index), excerpt: excerpt(body, index, index + length) });
  };

  for (const rule of rules.hard) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(body)) !== null) {
      push(rule.label, m.index, m[0].length);
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }

  // Recap ending: final paragraph only.
  if (rules.recap) {
    const last = lastParagraph(body);
    const m = last.text.match(rules.recap);
    if (m) push('summary-recap ending', last.offset + m.index, m[0].length);
  }

  // Em dash density for languages other than English (English: one dash fails, see hard list).
  if (!rules.english && !rules.emdashDisabled) {
    const dashes = [...body.matchAll(/—/g)];
    const words = Math.max(countWords(body), 1);
    const perThousand = (dashes.length / words) * 1000;
    if (dashes.length >= DEFAULT_LISTS.neutral.emdash_min_count && perThousand > DEFAULT_LISTS.neutral.emdash_per_1000_words) {
      const d = dashes[0];
      totalHard++;
      hard.push({
        label: `em dash density (${perThousand.toFixed(1)} per 1000 words)`,
        line: lineOf(body, d.index),
        excerpt: excerpt(body, d.index, d.index + 1),
      });
    }
  }

  // Filler.
  const fillerHits = [];
  if (rules.filler) {
    rules.filler.lastIndex = 0;
    let m;
    while ((m = rules.filler.exec(body)) !== null) {
      fillerHits.push({ word: m[0].toLowerCase(), line: lineOf(body, m.index), excerpt: excerpt(body, m.index, m.index + m[0].length) });
      if (m[0].length === 0) rules.filler.lastIndex++;
    }
  }
  const fillerFails = fillerHits.length >= rules.softLimit;

  hard.sort((a, b) => a.line - b.line);
  const tells = [
    ...hard.map((h) => ({ tier: 'hard', ...h })),
    ...(fillerFails ? fillerHits.slice(0, MAX_FILLER_LISTED).map((h, i) => ({ tier: 'filler', label: `filler word, ${i + 1} of ${rules.softLimit} allowed`, line: h.line, excerpt: h.excerpt })) : []),
  ];

  return {
    ...base,
    status: totalHard > 0 || fillerFails ? 'fail' : 'clear',
    hard,
    total_hard: totalHard,
    filler: { count: fillerHits.length, limit: rules.softLimit, hits: fillerHits.slice(0, MAX_FILLER_LISTED) },
    tells,
  };
}

/** True when a path should not be scanned (not text, or build output). */
export function exemptPath(path) {
  if (!path) return false;
  const norm = path.replace(/\\/g, '/');
  if (SKIP_PATH.some((s) => norm.includes(s))) return true;
  if (/slop-extra\.json$/i.test(norm)) return true;
  const ext = extname(norm).toLowerCase();
  return !!ext && !TEXT_EXT.has(ext);
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
const HELP = `slop-check: look for "AI slop" tells in text before you send or publish it.

Usage:
  node system/scripts/slop-check.mjs <file|-> [more files] [options]

Options:
  --lang <code>        Language of the text (default en). For languages other than English only
                       language-neutral checks run (em dash density, emoji headings, recap endings).
  --json               Print machine-readable JSON.
  --extra <path>       Extra rules file (default: vault/80_me/voice/slop-extra.json if it exists).
  --no-extra           Ignore the extra rules file.
  --soft-limit <n>     Filler words allowed before the text fails (default 3).
  -h, --help           Show this help.

Use "-" to read text from standard input.
To keep a deliberate example, put "slop-ok: <reason>" anywhere in the file.
Exit codes: 0 clear, 1 tells found, 2 usage error.
`;

function parseArgs(argv) {
  const out = { files: [], lang: 'en', json: false, extra: undefined, noExtra: false, softLimit: undefined, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => {
      const v = argv[++i];
      if (v === undefined) out.error = `${a} needs a value.`;
      return v;
    };
    if (a === '--') continue;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '--lang') out.lang = need() ?? out.lang;
    else if (a === '--extra') out.extra = need();
    else if (a === '--no-extra') out.noExtra = true;
    else if (a === '--soft-limit') {
      const n = Number(need());
      if (!Number.isInteger(n) || n < 1) out.error = '--soft-limit needs a whole number of 1 or more.';
      else out.softLimit = n;
    } else if (a.startsWith('--lang=')) out.lang = a.slice(7);
    else if (a !== '-' && a.startsWith('-')) out.error = `Unknown option ${a}.`;
    else out.files.push(a);
  }
  return out;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.error || args.files.length === 0) {
    process.stderr.write(`${args.error || 'Please give me at least one file to check.'}\n\n${HELP}`);
    return 2;
  }

  let extra = null;
  const warnings = [];
  if (!args.noExtra) {
    const loaded = loadExtra(args.extra ? resolve(args.extra) : defaultExtraPath());
    extra = loaded.extra;
    if (loaded.warning) warnings.push(loaded.warning);
    if (args.extra && !existsSync(resolve(args.extra))) {
      process.stderr.write(`Extra rules file not found: ${args.extra}\n`);
      return 2;
    }
  }
  const rules = buildRules(args.lang, extra, { softLimit: args.softLimit });
  warnings.push(...rules.warnings);

  const results = [];
  for (const f of args.files) {
    if (f === '-') {
      const text = readStdin();
      results.push({ path: 'stdin', ...scanText(text, { rules }) });
      continue;
    }
    const abs = resolve(f);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      process.stderr.write(`I cannot find the file: ${f}\n`);
      return 2;
    }
    if (exemptPath(abs)) {
      results.push({ path: f, status: 'exempt', reason: 'not a prose file', lang: rules.lang, hard: [], total_hard: 0, filler: { count: 0, limit: rules.softLimit, hits: [] }, tells: [], warnings: [] });
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    results.push({ path: f, ...scanText(text, { rules }) });
  }

  const failed = results.some((r) => r.status === 'fail');

  if (args.json) {
    const clean = results.map(({ warnings: _w, ...r }) => r);
    process.stdout.write(`${JSON.stringify({ ok: !failed, lang: rules.lang, warnings, files: clean }, null, 2)}\n`);
    return failed ? 1 : 0;
  }

  for (const w of warnings) process.stderr.write(`Note: ${w}\n`);
  for (const r of results) {
    if (r.status === 'exempt') {
      process.stdout.write(`${r.path}: skipped${r.reason ? ` (${r.reason})` : ' (slop-ok marker)'}\n`);
    } else if (r.status === 'clear') {
      process.stdout.write(`${r.path}: clear\n`);
    } else {
      process.stdout.write(`${r.path}: ${r.tells.length} tell${r.tells.length === 1 ? '' : 's'} found\n`);
      for (const t of r.tells) process.stdout.write(`  line ${t.line} [${t.label}] ...${t.excerpt}...\n`);
      if (r.total_hard > r.hard.length) process.stdout.write(`  (and ${r.total_hard - r.hard.length} more)\n`);
    }
  }
  if (failed) {
    process.stdout.write('\nRewrite the lines above, then run the check again.\nFor a deliberate example, add "slop-ok: <reason>" to the file.\n');
  }
  return failed ? 1 : 0;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main();
