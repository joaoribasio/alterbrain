#!/usr/bin/env node
// Adapted from COG-second-brain (MIT) — https://github.com/huytieu/COG-second-brain @ c6cb32807254254abff0a04a8a59df2ac9e39eb9
// voice-stats: measure how someone writes, so a draft can be compared with their own habits.
//
// Idea adapted from COG-second-brain voice-baseline (MIT, Copyright (c) 2025 Huy Tieu)
//   https://github.com/huytieu/COG-second-brain @ c6cb32807254254abff0a04a8a59df2ac9e39eb9
//   (.claude/skills/voice-baseline/scripts/census.py, blob 35334fdd7642d9dcae11f90bc453571c555ade57)
// Re-written in Node (zero dependencies). The watch list and the "verdict" and "kicker" sentence
// shapes come from that script; everything else (per-language statistics, sign-offs, punctuation
// habits, contractions, emoji, phrases, --check against a saved baseline) is new.
//
// Usage:
//   node system/scripts/voice-stats.mjs <file|folder>... [--lang en|nl|auto] [--watch "a,b"] [--out stats.json]
//   node system/scripts/voice-stats.mjs --check <draft> [--baseline stats.json] [--lang en] [--tolerance 1.5]
//
// Census mode prints JSON (and writes it to --out when given). Files are grouped by language.
// Check mode prints JSON too. Exit codes: 0 fine, 1 the draft has flags, 2 usage error.
// Default baseline for --check: vault/80_me/voice/<lang>/stats.json

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vaultPath, isMainModule } from '../lib/paths.mjs';
import { writeJson } from '../lib/fsx.mjs';

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------
/** Words an agent reaches for as praise or emphasis. Counted, never banned. (From COG voice-baseline.) */
export const WATCH_EN = [
  'actually', 'just', 'simply', 'really', 'quite', 'very', 'genuinely', 'honestly', 'quietly', 'clean',
  'plain', 'simple', 'cheap', 'small', 'elegant', 'powerful', 'robust', 'seamless', 'leverage', 'delve',
  'ship', 'shipped', 'earn', 'earns', 'the whole', 'the real', "here's", 'at the end of the day', 'load-bearing',
];

const STOPWORDS = {
  en: 'the a an and or but if of to in on at by for with from as is are was were be been it its this that these those i you he she we they my your our their me him her us them not no so do does did have has had will would can could should there here than then what which who when where how about into over also'.split(' '),
  nl: 'de het een en of maar als van te in op aan bij voor met uit is zijn was waren ben ik je jij hij zij ze wij we jullie mijn jouw onze hun niet geen dat dit die deze er dan ook nog wel naar om over door heeft hebben had worden wordt wat wie waar hoe'.split(' '),
  de: 'der die das ein eine und oder aber wenn von zu in auf an bei für mit aus ist sind war waren bin ich du er sie es wir ihr nicht kein dass dies diese dann auch noch nach um über durch hat haben hatte wird was wer wo wie'.split(' '),
  fr: 'le la les un une des et ou mais si de du à en dans sur au aux par pour avec est sont était suis je tu il elle nous vous ils elles ne pas que qui ce cette ces il y a aussi encore plus'.split(' '),
  es: 'el la los las un una y o pero si de del a en por para con es son era soy yo tú él ella nosotros no que se lo su sus este esta estos también más como'.split(' '),
  pt: 'o a os as um uma e ou mas se de do da em por para com é são era sou eu tu ele ela nós não que se seu sua este esta também mais como'.split(' '),
  it: 'il lo la i gli le un una e o ma se di del a in per con è sono era io tu lui lei noi non che si suo sua questo questa anche più come'.split(' '),
};

const SIGN_OFFS = {
  en: ['best regards', 'best wishes', 'best', 'kind regards', 'warm regards', 'regards', 'cheers', 'thanks', 'thank you', 'many thanks', 'sincerely', 'yours sincerely', 'yours faithfully', 'take care', 'talk soon', 'speak soon', 'see you soon', 'all the best', 'with thanks', 'thanks again'],
  nl: ['met vriendelijke groet', 'met vriendelijke groeten', 'vriendelijke groet', 'vriendelijke groeten', 'hartelijke groet', 'hartelijke groeten', 'groet', 'groeten', 'mvg', 'tot snel', 'bedankt', 'alvast bedankt', 'dank u wel', 'dank je wel'],
  de: ['mit freundlichen grüßen', 'freundliche grüße', 'viele grüße', 'beste grüße', 'liebe grüße', 'grüße', 'lg', 'danke', 'vielen dank'],
  fr: ['cordialement', 'bien cordialement', 'salutations', 'bien à vous', 'merci', 'à bientôt', 'amicalement'],
  es: ['saludos', 'un saludo', 'atentamente', 'cordialmente', 'gracias', 'un abrazo'],
  pt: ['atenciosamente', 'cumprimentos', 'obrigado', 'obrigada', 'abraços', 'um abraço'],
  it: ['cordiali saluti', 'distinti saluti', 'saluti', 'grazie', 'a presto', 'un abbraccio'],
};

const ABBREVIATIONS = [
  'e.g', 'i.e', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'no', 'fig', 'approx', 'inc', 'ltd', 'co', 'cf', 'al', 'jr', 'sr',
  'bijv', 'enz', 'o.a', 'd.w.z', 'm.b.t', 'z.g', 'nr', 'ca', 'resp', 'evt', 'bzw', 'usw', 'z.b', 'd.h', 'etc',
];

/** Words that are worth flagging on a single use when the writer never uses them. */
const SHARP_WATCH = new Set(['delve', 'leverage', 'seamless', 'robust', 'genuinely', 'honestly', 'quietly', 'load-bearing', 'at the end of the day', 'elegant', 'powerful']);

const FILE_EXT = new Set(['.md', '.markdown', '.txt', '.qmd', '.mdx']);
const DEFAULTS = { tolerance: 1.5, minWords: 30 };

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function normLang(lang) {
  return String(lang || 'en').toLowerCase().split(/[-_]/)[0] || 'en';
}

export function tokens(text) {
  return text.match(WORD_RE) || [];
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function dist(values) {
  if (!values.length) return { mean: 0, p50: 0, p90: 0, max: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { mean: r1(mean), p50: r1(percentile(s, 0.5)), p90: r1(percentile(s, 0.9)), max: s[s.length - 1] };
}

function top(counter, n, minCount = 1) {
  return [...counter.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n);
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

/** Guess the language from stopwords. Falls back to English for short or unclear text. */
export function detectLanguage(text) {
  const words = tokens(text.toLowerCase());
  if (words.length < 20) return 'en';
  let best = 'en';
  let bestScore = -1;
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    let score = 0;
    for (const w of words) if (set.has(w)) score++;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Turning a note into prose
// ---------------------------------------------------------------------------------------------
function stripFences(text) {
  const out = [];
  let open = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (open) {
      if (m && m[1][0] === open.ch && m[1].length >= open.len) open = null;
      continue;
    }
    if (m) {
      open = { ch: m[1][0], len: m[1].length };
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function cleanLine(line) {
  return line
    .replace(/^\s*(?:>\s?)+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g, (_m, target, alias) => alias || target.split('/').pop())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<?https?:\/\/[^\s>)]+>?/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/<[^>\n]+>/g, '')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/(^|\s)#[\p{L}][\p{L}\p{N}_/-]*/gu, '$1')
    .replace(/\s\^[A-Za-z0-9-]+\s*$/, '')
    .replace(/\*\*|__|~~|==/g, '')
    .replace(/\*/g, '')
    .replace(/(^|[\s(])_+(?=\S)/g, '$1')
    .replace(/(?<=\S)_+(?=[\s).,;:!?]|$)/g, '')
    .trim();
}

/** Returns { items: [{text, list}|null(break)], headings }. */
function prepareLines(raw) {
  let t = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  t = t.replace(/^---\n[\s\S]*?\n---(?=\n|$)/, '');
  t = stripFences(t);
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/%%[\s\S]*?%%/g, '').replace(/\$\$[\s\S]*?\$\$/g, ' ');
  const items = [];
  let headings = 0;
  for (const line of t.split('\n')) {
    if (!line.trim()) {
      items.push(null);
    } else if (/^\s*#{1,6}\s/.test(line)) {
      headings++;
      items.push(null);
    } else if (/^\s*\|/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) || /^\s*!\[/.test(line) || /^\s*(?:>\s?)*\[![\w-]+\]/.test(line)) {
      items.push(null);
    } else {
      const text = cleanLine(line);
      if (!text) items.push(null);
      else items.push({ text, list: /^\s*(?:[-*+]|\d+[.)])\s+/.test(line.replace(/^\s*(?:>\s?)+/, '')) });
    }
  }
  return { items, headings };
}

function detectSignOff(items, lang) {
  const phrases = [...(SIGN_OFFS[lang] || [])].sort((a, b) => b.length - a.length);
  if (!phrases.length) return { index: -1, text: null };
  const lineIdx = [];
  items.forEach((it, i) => it && lineIdx.push(i));
  const lastSix = lineIdx.slice(-6).reverse(); // closest to the end first
  for (const i of lastSix) {
    const norm = items[i].text.toLowerCase().replace(/[\s,.!:;-]+$/g, '').replace(/\s+/g, ' ');
    // A sign-off is the phrase alone, or the phrase plus one word ("Thanks, Alex").
    const hit = phrases.find((p) => {
      if (norm === p) return true;
      if (!norm.startsWith(`${p} `)) return false;
      const rest = norm.slice(p.length).trim().split(' ');
      return rest.length === 1 && !STOPWORDS[lang]?.includes(rest[0]);
    });
    if (hit) return { index: i, text: hit };
  }
  return { index: -1, text: null };
}

function protectAbbreviations(text) {
  let t = text;
  for (const a of ABBREVIATIONS) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(a)}\\.`, 'giu'), (m) => m.replace(/\./g, '\u0001'));
  }
  t = t.replace(/(?<![\p{L}\p{N}])(\p{Lu})\.(?=\s+\p{Lu})/gu, '$1\u0001'); // initials: "J. Smith"
  t = t.replace(/(\d)\.(?=\d)/g, '$1\u0001');
  return t;
}

/** Split prose into sentences: [{ text, end }] where end is '.', '?', '!', '…' or ''. */
export function splitSentences(text) {
  const t = protectAbbreviations(text.replace(/\.{3,}/g, '…'));
  const parts = t.split(/(?<=[.!?…]+["'”’)\]»]*)\s+/u);
  const out = [];
  for (const p of parts) {
    const s = p.replace(/\u0001/g, '.').trim();
    if (!/[\p{L}\p{N}]/u.test(s)) continue;
    const m = s.replace(/["'”’)\]»]+$/u, '').match(/([.!?…])$/);
    out.push({ text: s, end: m ? m[1] : '' });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------------------------
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}⭐⭕⌚⌛⏩-⏳✅❌✨]/gu;
const CONTRACTED_RE = /\b[A-Za-z]+n['’]t\b|['’](?:re|ve|ll|d|m)\b|\b(?:it|that|he|she|there|here|what|let|who|where|how|when)['’]s\b/gi;
const FULL_FORM_RE = /\b(?:do|does|did|is|are|was|were|have|has|had|would|could|should|will|can|must)\s+not\b|\bcannot\b|\b(?:it|that|he|she|there|here|what|who)\s+(?:is|has)\b|\b(?:i|you|we|they)\s+(?:am|are|have|will|would|had)\b|\blet us\b/gi;
const VERDICT_RE = /(?:^|\. )The [a-z][a-z-]{2,14} (?:was|were|is|are|went|took|did|does|fell|lives|sits|stays|goes|came|holds|catches|kills|works|stops|moves|breaks)\b[^.\n]{0,40}\.\s*$/gm;
const KICKER_RE = /\bThat (?:is|was|'s) (?:the|all|it|what|why)\b[^.\n]{0,40}\./gi;

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function countPhrase(text, phrase) {
  const p = escapeRegex(phrase.toLowerCase()).replace(/\\? /g, '\\s+');
  return countMatches(text.toLowerCase(), new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, 'gu'));
}

/**
 * Analyse documents that share one language.
 * docs: [{ name, text }]. Returns the stats object described in the header.
 */
export function analyse(docs, { lang = 'en', watch = [] } = {}) {
  const code = normLang(lang);
  const stop = new Set(STOPWORDS[code] || []);
  const watchList = [...new Set([...(code === 'en' ? WATCH_EN : []), ...watch.map((w) => w.toLowerCase())])];

  const sentenceLens = [];
  const paraWords = [];
  const paraSentences = [];
  const openers = new Map();
  const closers = new Map();
  const signOffs = new Map();
  const bigrams = new Map();
  const trigrams = new Map();
  const watchCounts = new Map();
  const watchDocs = new Map();
  const punct = { em_dash: 0, en_dash: 0, semicolon: 0, colon: 0, exclamation: 0, question: 0, parenthesis: 0, ellipsis: 0, comma: 0 };
  let words = 0;
  let proseSentences = 0;
  let endQuestion = 0;
  let endExclaim = 0;
  let contracted = 0;
  let fullForms = 0;
  let emoji = 0;
  let verdicts = 0;
  let kickers = 0;
  let docsEndingQuestion = 0;
  let docsEndingExclaim = 0;
  let docsWithClosers = 0;
  let headings = 0;

  for (const doc of docs) {
    const { items, headings: h } = prepareLines(doc.text);
    headings += h;
    const sign = detectSignOff(items, code);
    if (sign.index >= 0) {
      bump(signOffs, sign.text);
      items.length = sign.index; // drop the sign-off and the name under it
    }

    // Group lines into paragraphs.
    const paragraphs = [];
    let cur = [];
    const flush = () => {
      if (cur.length) paragraphs.push(cur);
      cur = [];
    };
    for (const it of items) (it ? cur.push(it) : flush());
    flush();

    const allText = paragraphs.map((p) => p.map((l) => l.text).join(' ')).join('\n');
    const docTokens = tokens(allText);
    words += docTokens.length;

    // Character-level habits across the whole cleaned text.
    punct.em_dash += countMatches(allText, /—| -- /g);
    punct.en_dash += countMatches(allText, /–/g);
    punct.semicolon += countMatches(allText, /;/g);
    punct.colon += countMatches(allText, /:/g);
    punct.exclamation += countMatches(allText, /!/g);
    punct.question += countMatches(allText, /\?/g);
    punct.parenthesis += countMatches(allText, /\(/g);
    punct.ellipsis += countMatches(allText, /…|\.{3}/g);
    punct.comma += countMatches(allText, /,/g);
    emoji += countMatches(allText, EMOJI_RE);
    if (code === 'en') {
      contracted += countMatches(allText, CONTRACTED_RE);
      fullForms += countMatches(allText, FULL_FORM_RE);
      verdicts += countMatches(allText, VERDICT_RE);
      kickers += countMatches(allText, KICKER_RE);
    }
    const lower = allText.toLowerCase();
    for (const w of watchList) {
      const n = countPhrase(lower, w);
      if (n) {
        bump(watchCounts, w, n);
        bump(watchDocs, w, 1);
      }
    }

    // Phrases never cross a sentence boundary.
    const docSentences = [];
    for (const para of paragraphs) {
      const isList = para.every((l) => l.list);
      let sents;
      if (isList) {
        sents = para.flatMap((l) => splitSentences(l.text));
      } else {
        sents = splitSentences(para.map((l) => l.text).join(' '));
        const ws = tokens(para.map((l) => l.text).join(' ')).length;
        paraWords.push(ws);
        paraSentences.push(sents.length);
        docSentences.push(...sents);
        proseSentences += sents.length;
        for (const s of sents) {
          const toks = tokens(s.text);
          sentenceLens.push(toks.length);
          if (toks[0]) bump(openers, toks[0].toLowerCase());
          if (s.end === '?') endQuestion++;
          if (s.end === '!') endExclaim++;
        }
      }
      for (const s of sents) {
        const toks = tokens(s.text.toLowerCase());
        for (let i = 0; i + 1 < toks.length; i++) {
          const a = toks[i];
          const b = toks[i + 1];
          if (/^\d+$/.test(a) || /^\d+$/.test(b)) continue;
          if (!(stop.has(a) && stop.has(b))) bump(bigrams, `${a} ${b}`);
          const c = toks[i + 2];
          if (c && !/^\d+$/.test(c) && !(stop.has(a) && stop.has(c)) && !(stop.has(a) && stop.has(b) && stop.has(c))) bump(trigrams, `${a} ${b} ${c}`);
        }
      }
    }

    const last = docSentences[docSentences.length - 1];
    if (last) {
      docsWithClosers++;
      const first4 = tokens(last.text.toLowerCase()).slice(0, 4).join(' ');
      if (first4) bump(closers, first4);
      if (last.end === '?') docsEndingQuestion++;
      if (last.end === '!') docsEndingExclaim++;
    }
  }

  const per1000 = (n) => (words ? r2((n / words) * 1000) : 0);
  const minOpen = proseSentences >= 100 ? 2 : 1;
  const watchOut = {};
  for (const [w, n] of [...watchCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    watchOut[w] = { count: n, files: watchDocs.get(w), per_1000_words: per1000(n) };
  }

  const stats = {
    file_count: docs.length,
    files: docs.map((d) => d.name),
    words,
    sentences: proseSentences,
    paragraphs: paraWords.length,
    sentence_length: dist(sentenceLens),
    paragraph_length: {
      ...(() => {
        const d = dist(paraWords);
        return { mean_words: d.mean, p50_words: d.p50, p90_words: d.p90 };
      })(),
      mean_sentences: paraSentences.length ? r1(paraSentences.reduce((a, b) => a + b, 0) / paraSentences.length) : 0,
    },
    openers: top(openers, 10, minOpen).map(([text, count]) => ({ text, count, share: proseSentences ? r3(count / proseSentences) : 0 })),
    closers: {
      top: top(closers, 8).map(([text, count]) => ({ text, count })),
      ends_with_question: docsWithClosers ? r3(docsEndingQuestion / docsWithClosers) : 0,
      ends_with_exclamation: docsWithClosers ? r3(docsEndingExclaim / docsWithClosers) : 0,
    },
    sign_offs: top(signOffs, 8).map(([text, count]) => ({ text, count })),
    punctuation: {
      per_1000_words: Object.fromEntries(Object.entries(punct).map(([k, v]) => [k, per1000(v)])),
      counts: punct,
      question_sentence_rate: proseSentences ? r3(endQuestion / proseSentences) : 0,
      exclamation_sentence_rate: proseSentences ? r3(endExclaim / proseSentences) : 0,
    },
    contractions:
      code === 'en'
        ? { per_1000_words: per1000(contracted), count: contracted, full_forms: fullForms, ratio: contracted + fullForms ? r3(contracted / (contracted + fullForms)) : null }
        : null,
    emoji: { per_1000_words: per1000(emoji), count: emoji },
    top_phrases: {
      two_word: top(bigrams, 10, 2).map(([phrase, count]) => ({ phrase, count })),
      three_word: top(trigrams, 10, 2).map(([phrase, count]) => ({ phrase, count })),
    },
    watch_list: watchList,
    watch: watchOut,
    shapes:
      code === 'en'
        ? { verdict_endings: verdicts, kickers, headings }
        : { headings },
    notes: [],
  };
  if (words < 200) stats.notes.push('Small sample (under 200 words). Treat these numbers as rough.');
  return stats;
}

// ---------------------------------------------------------------------------------------------
// Check a draft against a baseline
// ---------------------------------------------------------------------------------------------
function above(draftRate, baseRate, tol, minAbs) {
  return draftRate > baseRate * tol && draftRate - baseRate >= minAbs;
}

/**
 * Compare a draft with a baseline (stats for the same language).
 * Returns { ok, flags: [{ metric, severity, draft, baseline, message }], skipped: [...] }
 */
export function checkDraft(draftText, baseline, { lang = 'en', tolerance = DEFAULTS.tolerance, minWords = DEFAULTS.minWords, watch = [] } = {}) {
  const code = normLang(lang);
  const extraWatch = [...new Set([...(baseline.watch_list || []), ...watch])];
  const d = analyse([{ name: 'draft', text: draftText }], { lang: code, watch: extraWatch });
  const flags = [];
  const skipped = [];
  if ((baseline.words || 0) < 500) skipped.push(`Your saved baseline is small (${baseline.words || 0} words), so the comparison is rough. Add more of your own writing to sharpen it.`);
  const add = (metric, severity, draftValue, baseValue, message) => flags.push({ metric, severity, draft: draftValue, baseline: baseValue, message });
  const enough = d.words >= minWords;
  if (!enough) skipped.push(`The draft is under ${minWords} words, so rate checks were skipped. Word and shape checks still ran.`);

  if (enough && d.sentences >= 5 && baseline.sentence_length) {
    const b = baseline.sentence_length.mean;
    if (b > 0 && d.sentence_length.mean > b * tolerance) {
      add('sentence_length', 'flag', d.sentence_length.mean, b, `Sentences average ${d.sentence_length.mean} words. Yours average ${b}. Shorten them.`);
    }
  }

  const labels = {
    em_dash: ['em dashes', 0.5],
    en_dash: ['spaced dashes', 0.5],
    semicolon: ['semicolons', 0.5],
    colon: ['colons', 2],
    exclamation: ['exclamation marks', 1],
    question: ['question marks', 1],
    parenthesis: ['brackets', 2],
    ellipsis: ['ellipses', 0.5],
  };
  if (enough && baseline.punctuation?.per_1000_words) {
    for (const [key, [label, minAbs]] of Object.entries(labels)) {
      const dr = d.punctuation.per_1000_words[key];
      const br = baseline.punctuation.per_1000_words[key] ?? 0;
      const minCount = ['em_dash', 'semicolon', 'ellipsis'].includes(key) ? 1 : 2; // one stray ! or ? is noise
      if (d.punctuation.counts[key] >= minCount && above(dr, br, tolerance, minAbs)) {
        add(`punctuation.${key}`, 'flag', dr, br, `Too many ${label}: ${dr} per 1000 words here, against ${br} in your writing.`);
      }
    }
    for (const [key, label] of [['question_sentence_rate', 'questions'], ['exclamation_sentence_rate', 'exclamations']]) {
      const dr = d.punctuation[key];
      const br = baseline.punctuation[key] ?? 0;
      if (d.sentences >= 5 && Math.round(dr * d.sentences) >= 2 && above(dr, br, tolerance, 0.05)) {
        add(`punctuation.${key}`, 'flag', dr, br, `More sentences end as ${label} than in your writing (${Math.round(dr * 100)}% against ${Math.round(br * 100)}%).`);
      }
    }
  }

  if (enough && d.emoji.count >= 1 && baseline.emoji && above(d.emoji.per_1000_words, baseline.emoji.per_1000_words ?? 0, tolerance, 1)) {
    add('emoji', 'flag', d.emoji.per_1000_words, baseline.emoji.per_1000_words ?? 0, 'The draft uses more emoji than you normally do.');
  }

  if (code === 'en' && d.contractions && baseline.contractions && baseline.contractions.ratio != null) {
    const opp = d.contractions.count + d.contractions.full_forms;
    if (opp >= 3 && d.contractions.ratio != null && d.contractions.ratio < baseline.contractions.ratio / tolerance) {
      add('contractions', 'flag', d.contractions.ratio, baseline.contractions.ratio, `The draft sounds more formal than you. It contracts ${Math.round(d.contractions.ratio * 100)}% of the time, you do ${Math.round(baseline.contractions.ratio * 100)}%.`);
    }
  }

  // Watch words.
  for (const [w, info] of Object.entries(d.watch)) {
    const base = baseline.watch?.[w];
    const br = base ? base.per_1000_words : 0;
    const flagged = br === 0 ? info.count >= (SHARP_WATCH.has(w) ? 1 : 2) : info.count >= 2 && above(info.per_1000_words, br, tolerance, 1);
    if (flagged) {
      add(`watch.${w}`, 'flag', info.per_1000_words, br, br === 0 ? `"${w}" appears ${info.count} time${info.count === 1 ? '' : 's'}. You rarely or never use it.` : `"${w}" appears ${info.count} times (${info.per_1000_words} per 1000 words). You use it ${br} per 1000.`);
    }
  }

  // Openers.
  if (d.sentences >= 8) {
    for (const o of d.openers) {
      const b = baseline.openers?.find((x) => x.text === o.text);
      const bs = b ? b.share : 0;
      if (o.count >= 3 && o.share - bs >= 0.08 && o.share > bs * tolerance) {
        add(`opener.${o.text}`, 'flag', o.share, bs, `${o.count} sentences start with "${o.text}" (${Math.round(o.share * 100)}%). In your writing it is ${Math.round(bs * 100)}%.`);
      }
    }
  }

  // Shapes (English).
  if (code === 'en') {
    if (d.shapes.verdict_endings > 1) add('shape.verdict_endings', 'flag', d.shapes.verdict_endings, 1, `${d.shapes.verdict_endings} paragraphs end on a short verdict sentence. Keep one at most.`);
    if (d.shapes.kickers > 0) add('shape.kickers', 'flag', d.shapes.kickers, 0, 'The draft has a "That is the point" style closing line. Cut it.');
  }
  if (d.closers.ends_with_question > 0 && (baseline.closers?.ends_with_question ?? 0) < 0.2) {
    add('closer.question', 'flag', 1, baseline.closers?.ends_with_question ?? 0, 'The draft ends on a question. You rarely do.');
  }

  // Sign-off (information only).
  if (d.sign_offs[0] && baseline.sign_offs?.length >= 2 && !baseline.sign_offs.some((s) => s.text === d.sign_offs[0].text)) {
    add('sign_off', 'note', d.sign_offs[0].text, baseline.sign_offs.map((s) => s.text), `You usually sign off with: ${baseline.sign_offs.slice(0, 3).map((s) => `"${s.text}"`).join(', ')}.`);
  }

  const bad = flags.filter((f) => f.severity === 'flag');
  return {
    ok: bad.length === 0,
    draft: { words: d.words, sentences: d.sentences },
    flags,
    skipped,
    summary: bad.length ? `${bad.length} thing${bad.length === 1 ? '' : 's'} to fix before this sounds like you.` : 'Nothing is above your usual habits.',
  };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
const HELP = `voice-stats: measure how you write, or check a draft against your own habits.

Measure (census):
  node system/scripts/voice-stats.mjs <file|folder>... [--lang en|nl|auto] [--watch "word,word"] [--out stats.json]

Check a draft:
  node system/scripts/voice-stats.mjs --check <draft> [--baseline stats.json] [--lang en] [--tolerance 1.5]

Options:
  --lang <code>     Language of the files. "auto" (default) guesses per file from common words.
  --watch <list>    Extra words or phrases to count, comma separated.
  --out <file>      Also write the JSON to this file (census mode).
  --check <draft>   Compare a draft with a saved baseline.
  --baseline <file> Baseline JSON (default: vault/80_me/voice/<lang>/stats.json).
  --tolerance <x>   How far above your habit counts as a flag (default 1.5 = 50% more).
  --min-words <n>   Skip rate checks for drafts shorter than this (default 30).
  -h, --help        Show this help.

Exit codes: 0 fine, 1 the draft has flags, 2 usage error.
`;

function parseArgs(argv) {
  const o = { inputs: [], lang: 'auto', watch: [], out: null, check: null, baseline: null, tolerance: DEFAULTS.tolerance, minWords: DEFAULTS.minWords, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) o.error = `${a} needs a value.`;
      return v;
    };
    if (a === '--') continue;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--lang') o.lang = next() ?? o.lang;
    else if (a === '--watch') o.watch = (next() || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') o.out = next();
    else if (a === '--check') o.check = next();
    else if (a === '--baseline') o.baseline = next();
    else if (a === '--tolerance') {
      const n = Number(next());
      if (!(n > 1)) o.error = '--tolerance needs a number above 1.';
      else o.tolerance = n;
    } else if (a === '--min-words') {
      const n = Number(next());
      if (!Number.isInteger(n) || n < 0) o.error = '--min-words needs a whole number.';
      else o.minWords = n;
    } else if (a.startsWith('-')) o.error = `Unknown option ${a}.`;
    else o.inputs.push(a);
  }
  return o;
}

function collectFiles(inputs) {
  const files = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        walk(join(p, name));
      }
    } else if (FILE_EXT.has(extname(p).toLowerCase())) files.push(p);
  };
  for (const input of inputs) {
    const abs = resolve(input);
    if (!existsSync(abs)) throw new Error(`I cannot find: ${input}`);
    if (statSync(abs).isFile()) files.push(abs);
    else walk(abs);
  }
  return files;
}

export function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (o.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (o.error) {
    process.stderr.write(`${o.error}\n\n${HELP}`);
    return 2;
  }

  // Check mode
  if (o.check) {
    const draftPath = resolve(o.check);
    if (!existsSync(draftPath)) {
      process.stderr.write(`I cannot find the draft: ${o.check}\n`);
      return 2;
    }
    const text = readFileSync(draftPath, 'utf8');
    const lang = o.lang === 'auto' ? detectLanguage(text) : normLang(o.lang);
    const basePath = o.baseline ? resolve(o.baseline) : vaultPath('80_me', 'voice', lang, 'stats.json');
    if (!existsSync(basePath)) {
      process.stderr.write(`I cannot find a saved baseline at ${basePath}. Run voice-stats on some of your own writing first, and save it with --out.\n`);
      return 2;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(basePath, 'utf8'));
    } catch (err) {
      process.stderr.write(`The baseline file is not valid JSON (${err.message}).\n`);
      return 2;
    }
    const baseline = parsed.languages ? parsed.languages[lang] : parsed;
    if (!baseline) {
      process.stderr.write(`The baseline has no "${lang}" section. It has: ${Object.keys(parsed.languages || {}).join(', ') || 'nothing'}.\n`);
      return 2;
    }
    const result = checkDraft(text, baseline, { lang, tolerance: o.tolerance, minWords: o.minWords, watch: o.watch });
    process.stdout.write(`${JSON.stringify({ lang, baseline: basePath, ...result }, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }

  // Census mode
  if (!o.inputs.length) {
    process.stderr.write(`Please give me at least one file or folder.\n\n${HELP}`);
    return 2;
  }
  let files;
  try {
    files = collectFiles(o.inputs);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 2;
  }
  if (!files.length) {
    process.stderr.write('I found no .md, .txt or .qmd files in what you gave me.\n');
    return 2;
  }
  const groups = new Map();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const lang = o.lang === 'auto' ? detectLanguage(text) : normLang(o.lang);
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push({ name: basename(f), text });
  }
  const languages = {};
  for (const [lang, docs] of [...groups.entries()].sort()) languages[lang] = analyse(docs, { lang, watch: o.watch });
  const result = { schema: 1, tool: 'voice-stats', generated: new Date().toISOString(), languages };
  if (o.out) writeJson(resolve(o.out), result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main();
