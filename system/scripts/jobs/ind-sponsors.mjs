#!/usr/bin/env node
// IND register of recognised sponsors (erkende referenten) - download, cache, look up.
// Also reads the salary threshold table from the Netherlands country pack, system/packs/country-nl/salary-thresholds.md (never hard-coded here).
// This script is part of the country-nl pack but stays in system/scripts/jobs/, so permissions and self-built copies keep working.
//
//   node system/scripts/jobs/ind-sponsors.mjs lookup --company "Example Netherlands B.V." [--json] [--no-update]
//   node system/scripts/jobs/ind-sponsors.mjs update [--force] [--json]
//   node system/scripts/jobs/ind-sponsors.mjs status [--json]
//   node system/scripts/jobs/ind-sponsors.mjs thresholds [--age-band under30|30plus] [--reduced]
//                                                        [--annual 52000 | --annual-min 48000 --annual-max 60000] [--json]
//
// The register is one HTML table on ind.nl (Organisation + KVK number, about 13,000 rows),
// updated by the IND once a month. We save the page to state/local/cache/ind-sponsors.html
// and refresh it at most once a week. Zero dependencies.
// Exit codes: 0 ok, 1 problem (no network and no cache, bad threshold file), 2 usage error.
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, isMainModule } from '../../lib/paths.mjs';
import { ensureDir, readJson, readText, writeJson, writeText } from '../../lib/fsx.mjs';
import { splitFrontmatter } from '../../lib/frontmatter.mjs';

export const REGISTER_URL = 'https://ind.nl/en/public-register-recognised-sponsors/public-register-work';
export const MAX_AGE_DAYS = 7;
export const MIN_EXPECTED_ROWS = 1000; // the real register has ~13,000; fewer means the page is broken
const USER_AGENT = 'Alterbrain/0.1 (personal job-search helper; weekly download of a public register)';
export const THRESHOLD_DOC = () => rootPath('system', 'packs', 'country-nl', 'salary-thresholds.md');
// Release 0.2.0 moved the table here from system/packs/mba/jobs-nl/. An update archives an old copy the person never edited
// and leaves an edited one in place, where nothing reads it. The thresholds report names it so the edit is not lost silently.
// Expand, then contract: remove this notice (and OLD_THRESHOLD_DOC) two releases after 0.2.0, together with a migration that
// archives what is left.
export const OLD_THRESHOLD_DOC = () => rootPath('system', 'packs', 'mba', 'jobs-nl', 'salary-thresholds.md');
export const cacheDirDefault = () => rootPath('state', 'local', 'cache');

// ---------- parsing the register ----------

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Words that say nothing about which company it is. */
const NOISE = new Set([
  'bv', 'nv', 'vof', 'cv', 'ltd', 'limited', 'inc', 'llc', 'gmbh', 'ag', 'sa', 'sarl', 'plc', 'co',
  'holding', 'holdings', 'beheer', 'group', 'groep', 'nederland', 'netherlands', 'nl', 'the',
]);

const LEGAL = new Set(['bv', 'nv', 'vof', 'cv', 'ltd', 'limited', 'inc', 'llc', 'gmbh', 'ag', 'sa', 'sarl', 'plc', 'co']);

function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Tokens of a company name with legal forms and filler words removed. */
export function nameTokens(name) {
  let t = fold(name).replace(/&/g, ' and ');
  t = t.replace(/\.(com|nl|io|eu|org|net|ai)\b/g, ' '); // "Booking.com" -> "booking"
  t = t.replace(/['’`"]/g, '').replace(/\./g, '');
  const raw = t.split(/[^a-z0-9]+/).filter(Boolean);
  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    // "b v" / "n v" written with spaces (from "B. V.")
    if ((raw[i] === 'b' || raw[i] === 'n') && raw[i + 1] === 'v') {
      merged.push(raw[i] + 'v');
      i++;
    } else merged.push(raw[i]);
  }
  const kept = merged.filter((w) => !NOISE.has(w));
  if (kept.length) return kept;
  // only filler words left (for example "Holding B.V."): keep them, minus the legal form
  return merged.filter((w) => !LEGAL.has(w));
}

/** Normalised comparison key: "Example Holding B.V." -> "example". */
export function normaliseName(name) {
  return nameTokens(name).join(' ');
}

/** Parse the register page into [{ name, kvk, norm, tokens }]. */
export function parseRegister(html) {
  const entries = [];
  const re = /<tr>\s*<th[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
  let m;
  while ((m = re.exec(html))) {
    const name = decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/""/g, '"').replace(/\s+/g, ' ').trim();
    const kvk = decodeEntities(m[2].replace(/<[^>]*>/g, '')).trim();
    if (!name) continue;
    const tokens = nameTokens(name);
    entries.push({ name, kvk, norm: tokens.join(' '), tokens });
  }
  return entries;
}

export function updatedText(html) {
  return html.match(/last updated on ([^<]{3,40}?\d{4})/i)?.[1]?.trim() || html.match(/laatst bijgewerkt op ([^<]{3,40}?\d{4})/i)?.[1]?.trim() || null;
}

// ---------- cache and weekly download ----------

export function cachePaths(cacheDir = cacheDirDefault()) {
  return { html: join(cacheDir, 'ind-sponsors.html'), meta: join(cacheDir, 'ind-sponsors.meta.json') };
}

export function cacheAgeDays(cacheDir, now = new Date()) {
  const { html, meta } = cachePaths(cacheDir);
  if (!existsSync(html)) return null;
  const m = readJson(meta, null);
  const t = m?.fetched ? Date.parse(m.fetched) : statSync(html).mtimeMs;
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

/**
 * Make sure a usable copy of the register is on disk.
 * Downloads when missing, older than 7 days, or `force`. If the download fails but an
 * older copy exists, the old copy is used and a warning is returned.
 * Returns { html, meta, downloaded, warning }.
 */
export async function ensureRegister({ force = false, offline = false, cacheDir = cacheDirDefault(), fetch: fetchFn = globalThis.fetch, now = new Date() } = {}) {
  const { html: htmlFile, meta: metaFile } = cachePaths(cacheDir);
  const age = cacheAgeDays(cacheDir, now);
  const have = age !== null;
  const fresh = have && age < MAX_AGE_DAYS;
  if (have && (offline || (fresh && !force))) {
    return { html: readText(htmlFile), meta: readJson(metaFile, {}), downloaded: false, warning: null };
  }
  if (offline && !have) throw new Error('No saved copy of the IND register yet. Run the update once while online.');
  try {
    const res = await fetchFn(REGISTER_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
    if (!res.ok) throw new Error(`the IND website answered with HTTP ${res.status}`);
    const html = await res.text();
    const rows = parseRegister(html).length;
    if (rows < MIN_EXPECTED_ROWS) throw new Error(`the page did not look like the register (only ${rows} rows found)`);
    ensureDir(cacheDir);
    writeText(htmlFile, html);
    const meta = { fetched: now.toISOString(), url: REGISTER_URL, updated_text: updatedText(html), count: rows, bytes: Buffer.byteLength(html) };
    writeJson(metaFile, meta);
    return { html, meta, downloaded: true, warning: null };
  } catch (e) {
    if (have) {
      return { html: readText(htmlFile), meta: readJson(metaFile, {}), downloaded: false, warning: `Could not refresh the IND register (${e.message}). Using the copy saved ${Math.floor(age)} days ago.` };
    }
    throw new Error(`Could not download the IND register (${e.message}).`);
  }
}

// ---------- lookup ----------

function bigrams(s) {
  const t = s.replace(/\s+/g, '');
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

export function dice(a, b) {
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [, n] of A) total += n;
  for (const [, n] of B) total += n;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return total ? (2 * inter) / total : 0;
}

const subset = (small, big) => small.length > 0 && small.every((t) => big.includes(t));

/**
 * Look a company up in parsed register entries.
 * status: 'recognised' (name matches exactly after tidying), 'possible' (close matches,
 * check the KvK number), or 'not_found'.
 */
export function lookup(entries, company, { limit = 10 } = {}) {
  const qTokens = nameTokens(company);
  const qNorm = qTokens.join(' ');
  if (!qNorm) return { status: 'not_found', query: company, normalised: '', matches: [] };

  const exact = entries.filter((e) => e.norm === qNorm).map((e) => ({ name: e.name, kvk: e.kvk, match: 'exact', score: 1 }));
  if (exact.length) return { status: 'recognised', query: company, normalised: qNorm, matches: exact.slice(0, limit) };

  const close = [];
  const longEnough = qNorm.replace(/\s/g, '').length >= 4;
  if (longEnough) {
    for (const e of entries) {
      let score = 0;
      if (subset(qTokens, e.tokens) || subset(e.tokens, qTokens)) {
        const common = e.tokens.filter((t) => qTokens.includes(t)).length;
        score = common / new Set([...e.tokens, ...qTokens]).size;
        score = Math.max(score, 0.6);
      }
      const d = dice(qNorm, e.norm);
      if (d >= 0.82) score = Math.max(score, d);
      if (score > 0) close.push({ name: e.name, kvk: e.kvk, match: 'close', score: Math.round(score * 100) / 100 });
    }
    close.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }
  return { status: close.length ? 'possible' : 'not_found', query: company, normalised: qNorm, matches: close.slice(0, limit) };
}

// ---------- salary thresholds (read from the country-nl pack doc) ----------

/** Parse the thresholds table between <!-- thresholds:start --> and <!-- thresholds:end -->. */
export function parseThresholds(markdown) {
  const { data, body } = splitFrontmatter(markdown);
  const m = body.match(/<!--\s*thresholds:start\s*-->([\s\S]*?)<!--\s*thresholds:end\s*-->/);
  if (!m) throw new Error('The salary threshold table was not found in salary-thresholds.md.');
  const amounts = {};
  for (const line of m[1].split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const [, key, amount, applies] = cells;
    if (!/^[a-z0-9_]+$/.test(key) || key === 'key') continue;
    const n = Number(amount.replace(/[, ]/g, ''));
    if (Number.isFinite(n) && n > 0) amounts[key] = { monthly_eur: n, applies_to: applies };
  }
  if (!Object.keys(amounts).length) throw new Error('The salary threshold table in salary-thresholds.md is empty.');
  return { valid_year: Number(data.valid_year) || null, amounts };
}

export function loadThresholds(file = THRESHOLD_DOC()) {
  if (!existsSync(file)) throw new Error(`Salary threshold file not found: ${file}`);
  return parseThresholds(readText(file));
}

/** Pick the threshold key: reduced criterion beats age band. */
export function pickThresholdKey({ reduced = false, ageBand = null } = {}) {
  if (reduced) return 'hsm_reduced';
  if (ageBand === 'under30') return 'hsm_under_30';
  if (ageBand === '30plus') return 'hsm_30_plus';
  return null;
}

/** Compare one annual figure with a monthly threshold (holiday allowance is not in the threshold). */
export function annualVerdict(annual, monthlyThreshold) {
  if (annual == null) return 'unknown';
  if (annual / 12 / 1.08 >= monthlyThreshold) return 'meets';
  if (annual / 12 >= monthlyThreshold) return 'unclear';
  return 'below';
}

/** Verdict for a salary range: meets | unclear | below | unknown. */
export function salaryVerdict(min, max, monthlyThreshold) {
  if (min == null && max == null) return 'unknown';
  const lo = min ?? max;
  const hi = max ?? min;
  const vLo = annualVerdict(lo, monthlyThreshold);
  const vHi = annualVerdict(hi, monthlyThreshold);
  if (vLo === 'meets') return 'meets';
  if (vLo === 'unclear' || vHi === 'meets' || vHi === 'unclear') return 'unclear';
  return 'below';
}

// ---------- CLI ----------

const HELP = `IND recognised-sponsor register and salary thresholds

Usage:
  ind-sponsors.mjs lookup --company "<name>" [--json] [--no-update]
  ind-sponsors.mjs update [--force] [--json]
  ind-sponsors.mjs status [--json]
  ind-sponsors.mjs thresholds [--age-band under30|30plus] [--reduced] [--annual N | --annual-min N --annual-max N] [--json]

The register is refreshed at most once a week and saved in state/local/cache/.`;

export function parseArgs(argv) {
  const out = { cmd: null, json: false, force: false, offline: false, reduced: false };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) out.cmd = args.shift();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') out.json = true;
    else if (a === '--force') out.force = true;
    else if (a === '--no-update') out.offline = true;
    else if (a === '--reduced') out.reduced = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--company') out.company = args[++i];
    else if (a === '--age-band') out.ageBand = args[++i];
    else if (a === '--annual') out.annual = Number(args[++i]);
    else if (a === '--annual-min') out.annualMin = Number(args[++i]);
    else if (a === '--annual-max') out.annualMax = Number(args[++i]);
    else out.unknown = [...(out.unknown || []), a];
  }
  if (!out.cmd && out.company) out.cmd = 'lookup';
  return out;
}

const CAVEAT =
  'The register lists legal entities, not brands. A match is a hint: confirm the KvK number and which company would sign your contract.';

function thresholdsReport(args, now) {
  const t = loadThresholds();
  const year = now.getFullYear();
  const key = pickThresholdKey({ reduced: args.reduced, ageBand: args.ageBand });
  const report = { valid_year: t.valid_year, stale: t.valid_year != null && year > t.valid_year, amounts: t.amounts, selected: null, note: null, old_copy: null };
  const notes = [];
  if (report.stale) notes.push(`These amounts are for ${t.valid_year}. It is now ${year}, so they may be out of date. Check https://ind.nl/en/required-amounts-income-requirements`);
  if (existsSync(OLD_THRESHOLD_DOC())) {
    report.old_copy = 'system/packs/mba/jobs-nl/salary-thresholds.md';
    notes.push(`An older salary table is still at ${report.old_copy}. I no longer read it, so any amounts you changed there do not count. Ask me to carry your changes over to system/packs/country-nl/salary-thresholds.md.`);
  }
  report.note = notes.length ? notes.join(' ') : null;
  const min = Number.isFinite(args.annual) ? args.annual : Number.isFinite(args.annualMin) ? args.annualMin : null;
  const max = Number.isFinite(args.annual) ? args.annual : Number.isFinite(args.annualMax) ? args.annualMax : null;
  if (key) {
    const row = t.amounts[key];
    if (!row) throw new Error(`The threshold "${key}" is missing from salary-thresholds.md.`);
    report.selected = {
      key,
      monthly_eur: row.monthly_eur,
      annual_without_holiday_allowance: row.monthly_eur * 12,
      annual_with_holiday_allowance: Math.round(row.monthly_eur * 12 * 1.08),
      verdict: min != null || max != null ? salaryVerdict(min, max, row.monthly_eur) : null,
    };
  }
  return report;
}

/** Testable entry point. Returns { code, stdout, stderr }. */
export async function main(argv, deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now || new Date();
  const cacheDir = deps.cacheDir || cacheDirDefault();
  const line = [];
  if (args.help || !args.cmd) return { code: args.help ? 0 : 2, stdout: args.help ? HELP + '\n' : '', stderr: args.help ? '' : HELP + '\n' };
  if (args.unknown?.length) return { code: 2, stdout: '', stderr: `I did not understand: ${args.unknown.join(' ')}\n${HELP}\n` };
  const json = (o) => JSON.stringify(o, null, 2) + '\n';

  try {
    if (args.cmd === 'lookup') {
      if (!args.company || !args.company.trim()) return { code: 2, stdout: '', stderr: `Give me a company with --company "<name>".\n` };
      const reg = await ensureRegister({ force: args.force, offline: args.offline, cacheDir, fetch: deps.fetch, now });
      const result = lookup(parseRegister(reg.html), args.company);
      const out = { ...result, register: { updated: reg.meta.updated_text || null, fetched: reg.meta.fetched || null, rows: reg.meta.count || null, source: REGISTER_URL }, warning: reg.warning, caveat: CAVEAT };
      if (args.json) return { code: 0, stdout: json(out), stderr: '' };
      if (reg.warning) line.push(`Note: ${reg.warning}`);
      if (result.status === 'recognised') {
        line.push(`Yes: "${args.company}" matches a recognised sponsor.`);
        result.matches.forEach((m) => line.push(`  - ${m.name} (KvK ${m.kvk})`));
      } else if (result.status === 'possible') {
        line.push(`Not an exact match for "${args.company}", but these look close:`);
        result.matches.forEach((m) => line.push(`  - ${m.name} (KvK ${m.kvk})`));
      } else {
        line.push(`No match for "${args.company}" in the IND register.`);
      }
      line.push(`Register last updated by the IND: ${reg.meta.updated_text || 'date unknown'}. ${CAVEAT}`);
      return { code: 0, stdout: line.join('\n') + '\n', stderr: '' };
    }

    if (args.cmd === 'update') {
      const reg = await ensureRegister({ force: args.force, cacheDir, fetch: deps.fetch, now });
      const out = { downloaded: reg.downloaded, ...reg.meta, warning: reg.warning };
      if (args.json) return { code: 0, stdout: json(out), stderr: '' };
      const msg = reg.downloaded ? `Saved the IND register (${reg.meta.count} organisations, IND update: ${reg.meta.updated_text || 'date unknown'}).` : `The saved register is less than ${MAX_AGE_DAYS} days old, so I kept it (${reg.meta.count} organisations). Use --force to download again.`;
      return { code: 0, stdout: [reg.warning ? `Note: ${reg.warning}` : null, msg].filter(Boolean).join('\n') + '\n', stderr: '' };
    }

    if (args.cmd === 'status') {
      const age = cacheAgeDays(cacheDir, now);
      const meta = readJson(cachePaths(cacheDir).meta, {});
      const out = { cached: age !== null, age_days: age === null ? null : Math.round(age * 10) / 10, due_for_refresh: age === null || age >= MAX_AGE_DAYS, ...meta };
      if (args.json) return { code: 0, stdout: json(out), stderr: '' };
      return { code: 0, stdout: (out.cached ? `Saved ${out.age_days} days ago (${meta.count} organisations; IND update: ${meta.updated_text || 'unknown'}).${out.due_for_refresh ? ' A refresh is due.' : ''}` : 'No saved copy yet.') + '\n', stderr: '' };
    }

    if (args.cmd === 'thresholds') {
      if (args.ageBand && !['under30', '30plus'].includes(args.ageBand)) return { code: 2, stdout: '', stderr: 'Use --age-band under30 or --age-band 30plus.\n' };
      const rep = thresholdsReport(args, now);
      if (args.json) return { code: 0, stdout: json(rep), stderr: '' };
      if (rep.note) line.push(`Warning: ${rep.note}`);
      if (rep.selected) {
        const s = rep.selected;
        line.push(`Amount for you (${s.key}): EUR ${s.monthly_eur} a month, without holiday allowance (${s.annual_without_holiday_allowance} a year; about ${s.annual_with_holiday_allowance} a year with 8% holiday allowance).`);
        if (s.verdict) line.push(`This salary: ${s.verdict}.`);
      } else {
        line.push(`Amounts for ${rep.valid_year}, gross per month without holiday allowance:`);
        for (const [k, v] of Object.entries(rep.amounts)) line.push(`  ${k}: EUR ${v.monthly_eur} - ${v.applies_to}`);
      }
      return { code: 0, stdout: line.join('\n') + '\n', stderr: '' };
    }

    return { code: 2, stdout: '', stderr: `Unknown command "${args.cmd}".\n${HELP}\n` };
  } catch (e) {
    return { code: 1, stdout: '', stderr: `${e.message}\n` };
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
