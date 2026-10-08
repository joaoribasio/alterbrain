#!/usr/bin/env node
// Adzuna job search (official API, free key) for any country Adzuna offers.
//
//   node system/scripts/jobs/adzuna.mjs --what "strategy consultant" --where Rotterdam --results 20 [--country nl] [--json]
//
// The country is --country <cc>, else jobs.country in config/brain.json (two letters), else nl.
// For nl only, each job also gets a Dutch-language guess (the Netherlands country pack, system/packs/country-nl/).
//
// Keys come from ADZUNA_APP_ID / ADZUNA_APP_KEY, read from .env.local at the
// project root (a tiny loader below; real environment variables win).
// Zero dependencies. Exit codes: 0 ok, 1 problem (keys, network, limit), 2 usage error.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, isMainModule } from '../../lib/paths.mjs';
import { readJson, writeJson, ensureDir } from '../../lib/fsx.mjs';

const API_BASE = 'https://api.adzuna.com/v1/api/jobs';
const USER_AGENT = 'Alterbrain/0.1 (personal job-search helper)';
// Free tier: 25 calls/min, 250/day (developer.adzuna.com/docs/terms_of_service).
// 2.5 s between calls keeps us under 25 a minute. We stop at 240 a day.
export const MIN_GAP_MS = 2500;
export const DAILY_STOP = 240;
export const MAX_RESULTS = 50;

// ---------- .env.local loader ----------

/** Parse KEY=VALUE lines. Ignores comments and blanks. Never logs values. */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

/** Read .env.local (if present) and merge under the real environment. */
export function loadEnvLocal(file = rootPath('.env.local'), env = process.env) {
  let fromFile = {};
  try {
    if (existsSync(file)) fromFile = parseEnv(readFileSync(file, 'utf8'));
  } catch {
    fromFile = {};
  }
  return { ...fromFile, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== '')) };
}

// ---------- Dutch-language signal (see system/packs/country-nl/dutch-language.md) ----------
// Used for the Netherlands only (country nl). Exported for the tests and for the Dutch-language check.
// Heuristic list. Keep in step with dutch-language.md. [Unverified]

export const REQUIRED_PATTERNS = [
  /vloeiend(?:e)?\s+(?:in\s+(?:het\s+)?)?nederlands/,
  /beheersing\s+van\s+(?:de\s+)?nederlandse\s+taal/,
  /nederlandse\s+taal\s+in\s+woord\s+en\s+geschrift/,
  /in\s+woord\s+en\s+geschrift/,
  /nederlands\s+(?:als\s+)?moedertaal/,
  /moedertaal\s+nederlands/,
  /native\s+dutch/,
  /nederlandstalig/,
  /\bnt2\b/,
  /taalniveau\s+(?:nederlands\s+)?(?:b2|c1|c2)/,
  /nederlands\s+(?:op\s+)?(?:b2|c1|c2)/,
  /(?:b2|c1|c2)[-\s]niveau\s+nederlands/,
  /fluent\s+(?:in\s+)?dutch/,
  /dutch\s+(?:is\s+)?(?:required|mandatory|essential|a\s+must)/,
  /(?:excellent|good|strong|very\s+good)\s+(?:command|knowledge)\s+of\s+(?:the\s+)?dutch/,
  /dutch[-\s]speaking/,
];

export const PREFERRED_PATTERNS = [
  /nederlands\s+(?:is\s+)?(?:een\s+)?(?:pre|plus|voordeel)\b/,
  /kennis\s+van\s+(?:het\s+)?nederlands\s+(?:is\s+)?(?:een\s+)?(?:pre|plus|voordeel)\b/,
  /dutch\s+(?:is\s+)?(?:a\s+|an\s+)?(?:plus|pre|advantage|nice\s+to\s+have|bonus)/,
  /knowledge\s+of\s+dutch\s+(?:is\s+)?(?:a\s+|an\s+)?(?:plus|advantage|bonus)/,
];

export const NOT_REQUIRED_PATTERNS = [
  /english\s+(?:is\s+)?(?:the\s+)?(?:working|company|office|corporate)\s+language/,
  /working\s+language\s+is\s+english/,
  /no\s+dutch\s+(?:is\s+)?required/,
  /dutch\s+(?:is\s+)?not\s+(?:required|needed|necessary)/,
  /geen\s+(?:kennis\s+van\s+(?:het\s+)?)?nederlands/,
];

function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Very small guess at the language of an advert: 'nl', 'en' or 'unknown'. */
export function guessLanguage(text) {
  const words = fold(text).match(/[a-z]+/g) || [];
  if (words.length < 12) return 'unknown';
  const nl = new Set(['de', 'het', 'een', 'van', 'voor', 'met', 'je', 'jij', 'wij', 'ons', 'bij', 'ook', 'naar', 'zijn', 'als', 'wat', 'jouw', 'onze']);
  const en = new Set(['the', 'and', 'of', 'to', 'you', 'we', 'our', 'with', 'for', 'your', 'will', 'are', 'is', 'in', 'a']);
  let a = 0;
  let b = 0;
  for (const w of words) {
    if (nl.has(w)) a++;
    if (en.has(w)) b++;
  }
  if (a >= 3 && a > b * 1.2) return 'nl';
  if (b >= 3 && b > a * 1.2) return 'en';
  return 'unknown';
}

/**
 * Label how much Dutch an advert seems to need.
 * Returns { signal: required|likely|preferred|not_required|unknown, language, matches: [] }.
 */
export function dutchSignal(text) {
  const t = fold(text);
  const hit = (list) => list.filter((re) => re.test(t)).map((re) => (t.match(re) || [''])[0].trim());
  const notReq = hit(NOT_REQUIRED_PATTERNS);
  const req = hit(REQUIRED_PATTERNS);
  const pref = hit(PREFERRED_PATTERNS);
  const language = guessLanguage(text);
  let signal = 'unknown';
  if (notReq.length) signal = 'not_required';
  else if (req.length) signal = 'required';
  else if (pref.length) signal = 'preferred';
  else if (language === 'nl') signal = 'likely';
  return { signal, language, matches: [...notReq, ...req, ...pref] };
}

// ---------- normalising ----------

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Turn one Adzuna result into the Alterbrain job shape.
 * `opts.country` is the lower-case country code. The Dutch-language guess (`dutch`) is added for nl only.
 * Called without a country (or with something that is not an options object, as Array.map does) it behaves as for nl.
 */
export function normaliseJob(r, opts) {
  const country = String((opts && typeof opts === 'object' && opts.country) || 'nl').toLowerCase();
  const snippet = stripHtml(r.description).slice(0, 300);
  const title = stripHtml(r.title);
  const job = {
    title,
    company: stripHtml(r.company?.display_name) || null,
    location: stripHtml(r.location?.display_name) || null,
    url: r.redirect_url || null,
    created: r.created || null,
    salary_min: num(r.salary_min),
    salary_max: num(r.salary_max),
    description_snippet: snippet,
    source: 'adzuna',
    // Extras (not in the minimum shape):
    id: r.id !== undefined ? String(r.id) : null,
    salary_predicted: String(r.salary_is_predicted) === '1',
  };
  if (country === 'nl') job.dutch = dutchSignal(`${title}. ${snippet}`);
  return job;
}

// ---------- rate limiting and daily counter ----------

export function usageFile(cacheDir = rootPath('state', 'local', 'cache')) {
  return join(cacheDir, 'adzuna-usage.json');
}

function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Count one call for today. Throws a friendly error past the daily stop. */
export function bumpDailyUsage({ cacheDir, now = new Date() } = {}) {
  const file = usageFile(cacheDir);
  const day = dayKey(now);
  const cur = readJson(file, null);
  const count = cur && cur.date === day ? Number(cur.count) || 0 : 0;
  if (count >= DAILY_STOP) {
    const err = new Error(`Adzuna daily limit reached (${count} calls today). The free plan allows 250 a day. Try again tomorrow.`);
    err.code = 'DAILY_LIMIT';
    throw err;
  }
  ensureDir(cacheDir || rootPath('state', 'local', 'cache'));
  writeJson(file, { date: day, count: count + 1 });
  return count + 1;
}

let lastCallAt = 0;

/** Wait so that calls are at least MIN_GAP_MS apart. `sleep` and `clock` are injectable for tests. */
export async function politeWait({ sleep = (ms) => new Promise((r) => setTimeout(r, ms)), clock = () => Date.now(), gap = MIN_GAP_MS } = {}) {
  const wait = lastCallAt + gap - clock();
  if (lastCallAt && wait > 0) await sleep(wait);
  lastCallAt = clock();
}

export function resetRateLimiter() {
  lastCallAt = 0;
}

// ---------- the search ----------

export function buildUrl({ country = 'nl', page = 1, appId, appKey, what, where, results = 20, maxDaysOld, salaryMin }) {
  const q = new URLSearchParams();
  q.set('app_id', appId);
  q.set('app_key', appKey);
  q.set('results_per_page', String(Math.min(Math.max(1, results), MAX_RESULTS)));
  if (what) q.set('what', what);
  if (where) q.set('where', where);
  if (maxDaysOld) q.set('max_days_old', String(maxDaysOld));
  if (salaryMin) q.set('salary_min', String(salaryMin));
  q.set('content-type', 'application/json');
  return `${API_BASE}/${encodeURIComponent(country)}/search/${Math.max(1, page)}?${q.toString()}`;
}

/** Run one search. Returns { count, jobs }. Throws Error with a friendly message. */
export async function searchJobs(opts, deps = {}) {
  const { fetch: fetchFn = globalThis.fetch, env = loadEnvLocal(), cacheDir, now = new Date(), sleep, clock } = deps;
  const appId = env.ADZUNA_APP_ID;
  const appKey = env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    const err = new Error(
      'Adzuna keys are missing. Register for free at https://developer.adzuna.com/ , then add these two lines to the file .env.local in your Alterbrain folder:\nADZUNA_APP_ID=...\nADZUNA_APP_KEY=...'
    );
    err.code = 'NO_KEYS';
    throw err;
  }
  const country = String(opts.country || 'nl').toLowerCase();
  const url = buildUrl({ ...opts, country, appId, appKey });
  let attempt = 0;
  for (;;) {
    attempt++;
    bumpDailyUsage({ cacheDir, now });
    await politeWait({ sleep, clock });
    let res;
    try {
      res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch (e) {
      throw new Error(`Could not reach Adzuna (${e.message}). Check your internet connection.`);
    }
    if (res.status === 401 || res.status === 403) {
      const err = new Error('Adzuna rejected the keys. Check ADZUNA_APP_ID and ADZUNA_APP_KEY in .env.local.');
      err.code = 'BAD_KEYS';
      throw err;
    }
    if (res.status === 429) {
      throw new Error('Adzuna says we are going too fast (limit reached). Wait a minute and try again.');
    }
    // [Unverified] Adzuna's exact reply for a country it does not offer; 400 and 404 are the likely ones.
    if (res.status === 400 || res.status === 404) {
      const err = new Error(`Adzuna refused this search (HTTP ${res.status}). It may not offer the country "${country}". Check jobs.country in config/brain.json, or use company careers pages instead.`);
      err.code = 'BAD_COUNTRY';
      throw err;
    }
    if (res.status >= 500 && attempt < 2) continue; // one polite retry
    if (!res.ok) throw new Error(`Adzuna returned an error (HTTP ${res.status}).`);
    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error('Adzuna sent a reply we could not read.');
    }
    const results = Array.isArray(body?.results) ? body.results : [];
    return { count: Number(body?.count) || results.length, jobs: results.map((r) => normaliseJob(r, { country })) };
  }
}

// ---------- CLI ----------

const HELP = `Adzuna job search (official API, free key)

Usage:
  node system/scripts/jobs/adzuna.mjs --what "<keywords>" [--where "<city>"] [--results 20] [--page 1]
                                       [--max-days-old 14] [--salary-min 40000] [--country <cc>] [--json]

--country is a two-letter code such as nl or gb. Without it, jobs.country in config/brain.json is used, and nl if that is empty.
For nl each job also gets a Dutch-language guess (the Netherlands country pack).

Needs ADZUNA_APP_ID and ADZUNA_APP_KEY in .env.local (free keys: https://developer.adzuna.com/).`;

export function parseArgs(argv) {
  const out = { json: false, help: false };
  const take = (i) => argv[i + 1];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--what') out.what = take(i++);
    else if (a === '--where') out.where = take(i++);
    else if (a === '--results') out.results = Number(take(i++));
    else if (a === '--page') out.page = Number(take(i++));
    else if (a === '--country') out.country = take(i++);
    else if (a === '--max-days-old') out.maxDaysOld = Number(take(i++));
    else if (a === '--salary-min') out.salaryMin = Number(take(i++));
    else out.unknown = [...(out.unknown || []), a];
  }
  return out;
}

// Adzuna reports salaries in the country's own currency. EUR is named only for nl; other countries get plain numbers.
function money(j, country) {
  if (j.salary_min == null && j.salary_max == null) return 'salary not shown';
  const unit = country === 'nl' ? 'EUR ' : '';
  const f = (n) => (n == null ? '?' : `${unit}${n.toLocaleString('en-GB')}`);
  return `${f(j.salary_min)} to ${f(j.salary_max)} a year${country === 'nl' ? '' : ' (local currency)'}${j.salary_predicted ? ' (estimated by Adzuna)' : ''}`;
}

/** The default country: jobs.country from config/brain.json when it is two letters, else nl. */
export function defaultCountry(brainFile = rootPath('config', 'brain.json')) {
  const c = readJson(brainFile, null)?.jobs?.country;
  const cc = typeof c === 'string' ? c.trim().toLowerCase() : '';
  return /^[a-z]{2}$/.test(cc) ? cc : 'nl';
}

/** Testable entry point. Returns { code, stdout, stderr }. */
export async function main(argv, deps = {}) {
  const args = parseArgs(argv);
  const out = [];
  const err = [];
  if (args.help) return { code: 0, stdout: HELP + '\n', stderr: '' };
  if (args.unknown?.length || (!args.what && !args.where)) {
    return { code: 2, stdout: '', stderr: `${args.unknown?.length ? `I did not understand: ${args.unknown.join(' ')}\n` : 'Give me at least --what or --where.\n'}${HELP}\n` };
  }
  for (const k of ['results', 'page', 'maxDaysOld', 'salaryMin']) {
    if (args[k] !== undefined && !Number.isFinite(args[k])) return { code: 2, stdout: '', stderr: `The value for ${k} must be a number.\n${HELP}\n` };
  }
  const country = String(args.country || defaultCountry(deps.brainFile)).toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) return { code: 2, stdout: '', stderr: 'The country must be a two-letter code, such as nl.\n' };
  try {
    const { count, jobs } = await searchJobs({ country, what: args.what, where: args.where, results: args.results || 20, page: args.page || 1, maxDaysOld: args.maxDaysOld, salaryMin: args.salaryMin }, deps);
    if (args.json) {
      out.push(JSON.stringify({ source: 'adzuna', country, query: { what: args.what || null, where: args.where || null }, total: count, jobs, credit: 'Jobs by Adzuna (https://www.adzuna.com)' }, null, 2));
    } else if (!jobs.length) {
      out.push('No jobs found. Try fewer words or a wider place.');
    } else {
      out.push(`Found ${count} jobs, showing ${jobs.length}.`, '');
      jobs.forEach((j, i) => {
        out.push(`${i + 1}. ${j.title} - ${j.company || 'company not shown'} (${j.location || 'place not shown'})`);
        out.push(`   ${money(j, country)}. Posted ${j.created ? j.created.slice(0, 10) : 'date unknown'}.${j.dutch ? ` Dutch: ${j.dutch.signal}.` : ''}`);
        out.push(`   ${j.url}`);
      });
      out.push('', 'Jobs by Adzuna (https://www.adzuna.com)');
    }
    return { code: 0, stdout: out.join('\n') + '\n', stderr: '' };
  } catch (e) {
    err.push(e.message);
    return { code: 1, stdout: '', stderr: err.join('\n') + '\n' };
  }
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(({ code, stdout, stderr }) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    process.exitCode = code;
  });
}
