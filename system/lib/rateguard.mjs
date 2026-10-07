// Rate guard core (spec sections 14 and 16): limits, usage ledger, throttle state.
//
// Ported and generalised from the framework author's own LinkedIn guard (linkedin_guard.py and limits.json): same caps,
// same "count after it ran" rule, same warning rule (halve, then draft-only) and "never retry an unknown outcome".
//
// Used by system/hooks/rate_guard.mjs (PreToolUse, PostToolUse, PostToolUseFailure) and
// system/scripts/rate-guard.mjs (status and the user's reset commands). Zero dependencies.
//
// Data:
//   system/catalogue/limits.json   framework defaults per server (code class, protected)
//   config/limits.json             optional, the user's own: may LOWER caps; raising needs accept_risk
//   state/local/rate-guard/ledger.jsonl   one line per call that ran (pruned to 35 days; gitignored)
//   state/local/rate-guard/state.json     per server: warnings, throttle, pause, draft-only (gitignored)
//
// Fail rules: a server with no entry in the limits is never touched. A server WITH limits is blocked
// (fail closed) when the limits, the user's override file, the ledger or the state cannot be read.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootPath } from './paths.mjs';
import { readJsonChecked } from './fsx.mjs';
import { addTask } from './tasks.mjs';

export const LEDGER_DAYS = 35;
export const UNKNOWN_BLOCK_HOURS = 24;
// When the limits file itself cannot be read we cannot know which servers are limited. These are the
// ones the framework ships limits for; they stay blocked until the file is fixed.
const FALLBACK_SERVERS = ['linkedin'];
const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CAP_FIELDS = ['daily_cap', 'weekly_cap', 'min_gap_seconds', 'weekday_cap'];

export const stateDir = () => rootPath('state', 'local', 'rate-guard');
export const ledgerFile = () => join(stateDir(), 'ledger.jsonl');
export const stateFile = () => join(stateDir(), 'state.json');
export const frameworkLimitsFile = () => rootPath('system', 'catalogue', 'limits.json');
export const userLimitsFile = () => rootPath('config', 'limits.json');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const clone = (v) => JSON.parse(JSON.stringify(v));
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ------------------------------------------------------------------ */
/* Time helpers (local time: caps reset at local midnight / Monday)    */
/* ------------------------------------------------------------------ */

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
/** Monday = 0 ... Sunday = 6 (the author's convention). */
export const weekdayIndex = (d) => (d.getDay() + 6) % 7;
const startOfWeek = (d) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - weekdayIndex(x));
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const pad2 = (n) => String(n).padStart(2, '0');

/** "today at 14:05", "tomorrow at 00:00", "Monday at 00:00", "Monday 12 October at 00:00". */
export function fmtWhen(target, now) {
  const t = target instanceof Date ? target : new Date(target);
  const diff = Math.round((startOfDay(t) - startOfDay(now)) / DAY_MS);
  const time = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  if (diff === 0) return `today at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  if (diff > 1 && diff < 7) return `${WEEKDAYS[weekdayIndex(t)]} at ${time}`;
  return `${WEEKDAYS[weekdayIndex(t)]} ${t.getDate()} ${MONTHS[t.getMonth()]} at ${time}`;
}

const fmtDate = (t) => {
  const d = t instanceof Date ? t : new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** [0,1,2,3] -> "Monday to Thursday"; [0,2] -> "Monday and Wednesday". */
export function dayList(indices) {
  const days = [...new Set(indices)].sort((a, b) => a - b);
  if (days.length >= 3 && days[days.length - 1] - days[0] === days.length - 1) return `${WEEKDAYS[days[0]]} to ${WEEKDAYS[days[days.length - 1]]}`;
  const names = days.map((i) => WEEKDAYS[i]);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Monday=0 index of a day token: 0-6, or "mon", "Monday" ...; -1 when invalid. */
export function parseDay(v) {
  if (Number.isInteger(v)) return v >= 0 && v <= 6 ? v : -1;
  if (typeof v === 'string') return DAY_NAMES.indexOf(v.trim().slice(0, 3).toLowerCase());
  return -1;
}

/* ------------------------------------------------------------------ */
/* Limits: validation, loading, user overrides                         */
/* ------------------------------------------------------------------ */

const compiles = (p) => {
  try {
    new RegExp(p, 'i');
    return true;
  } catch {
    return false;
  }
};

/** Problems in a limits file (framework or user shape of the server block), as plain strings. Empty = fine. */
export function validateLimits(json) {
  const out = [];
  if (!isObj(json)) return ['the file must be a JSON object'];
  if (json.schema !== 1) out.push('schema must be 1');
  if (!isObj(json.servers)) return [...out, '"servers" must be an object'];
  for (const [key, def] of Object.entries(json.servers)) {
    const at = `servers.${key}`;
    if (!isObj(def)) {
      out.push(`${at} must be an object`);
      continue;
    }
    if (def.match !== undefined && !(Array.isArray(def.match) && def.match.every((m) => typeof m === 'string' && m.trim()))) out.push(`${at}.match must be a list of words`);
    if (def.target_keys !== undefined && !(Array.isArray(def.target_keys) && def.target_keys.every((m) => typeof m === 'string'))) out.push(`${at}.target_keys must be a list of names`);
    if (!isObj(def.categories) || Object.keys(def.categories).length === 0) {
      out.push(`${at}.categories must be an object with at least one category`);
      continue;
    }
    for (const [cname, cat] of Object.entries(def.categories)) {
      const cat_at = `${at}.categories.${cname}`;
      if (!isObj(cat)) {
        out.push(`${cat_at} must be an object`);
        continue;
      }
      if (cat.tools !== undefined && !(Array.isArray(cat.tools) && cat.tools.every((t) => typeof t === 'string'))) out.push(`${cat_at}.tools must be a list of tool names`);
      for (const f of ['daily_cap', 'weekly_cap']) {
        if (cat[f] !== undefined && !(Number.isInteger(cat[f]) && cat[f] >= 0)) out.push(`${cat_at}.${f} must be a whole number of 0 or more`);
      }
      if (cat.min_gap_seconds !== undefined && !(typeof cat.min_gap_seconds === 'number' && cat.min_gap_seconds >= 0)) out.push(`${cat_at}.min_gap_seconds must be a number of 0 or more`);
      if (cat.weekday_cap !== undefined && !(Array.isArray(cat.weekday_cap) && cat.weekday_cap.every((d) => parseDay(d) >= 0))) out.push(`${cat_at}.weekday_cap must be a list of days such as "mon", "tue"`);
      if (cat.writes !== undefined && typeof cat.writes !== 'boolean') out.push(`${cat_at}.writes must be true or false`);
    }
    const w = def.warnings;
    if (w !== undefined) {
      if (!isObj(w)) out.push(`${at}.warnings must be an object`);
      else {
        for (const f of ['phrases', 'weak']) {
          if (w[f] === undefined) continue;
          if (!Array.isArray(w[f]) || !w[f].every((p) => typeof p === 'string' && compiles(p))) out.push(`${at}.warnings.${f} must be a list of valid patterns`);
        }
        if (w.weak_max_chars !== undefined && !(Number.isInteger(w.weak_max_chars) && w.weak_max_chars > 0)) out.push(`${at}.warnings.weak_max_chars must be a whole number above 0`);
      }
    }
    const u = def.outcome_unknown;
    if (u !== undefined) {
      if (!isObj(u)) out.push(`${at}.outcome_unknown must be an object`);
      else {
        if (u.statuses !== undefined && !(Array.isArray(u.statuses) && u.statuses.every((s) => typeof s === 'string'))) out.push(`${at}.outcome_unknown.statuses must be a list`);
        for (const f of ['patterns', 'error_patterns']) {
          if (u[f] !== undefined && !(Array.isArray(u[f]) && u[f].every((p) => typeof p === 'string' && compiles(p)))) out.push(`${at}.outcome_unknown.${f} must be a list of valid patterns`);
        }
      }
    }
    for (const f of ['throttle_days', 'pause_hours', 'draft_only_window_days']) {
      if (def[f] !== undefined && !(typeof def[f] === 'number' && def[f] > 0)) out.push(`${at}.${f} must be a number above 0`);
    }
  }
  return out;
}

/** { ok, servers } or { ok:false, missing?, problems? }. */
export function loadFramework() {
  const r = readJsonChecked(frameworkLimitsFile());
  if (!r.exists) return { ok: false, missing: true, problems: ['system/catalogue/limits.json is missing'] };
  if (!r.ok) return { ok: false, problems: ['system/catalogue/limits.json is not valid JSON'] };
  const problems = validateLimits(r.value);
  if (problems.length) return { ok: false, problems };
  return { ok: true, servers: r.value.servers };
}

/** { ok, exists, servers }. A missing file is fine; a file that does not parse is not. */
export function loadUser() {
  const r = readJsonChecked(userLimitsFile());
  if (!r.exists) return { ok: true, exists: false, servers: {} };
  if (!r.ok || !isObj(r.value)) return { ok: false, exists: true, servers: {} };
  const servers = r.value.servers === undefined ? {} : r.value.servers;
  if (!isObj(servers)) return { ok: false, exists: true, servers: {} };
  return { ok: true, exists: true, servers };
}

/** The framework server block whose match words appear in this server's name, as { key, def }, or null. */
export function findServer(servers, serverName) {
  const id = norm(serverName);
  for (const [key, def] of Object.entries(servers)) {
    const words = (Array.isArray(def.match) && def.match.length ? def.match : [key]).map(norm).filter(Boolean);
    if (words.some((w) => id.includes(w))) return { key, def };
  }
  return null;
}

/** Is this server one the framework ships limits for? Used only when the limits file cannot be read. */
export const fallbackLimited = (serverName) => FALLBACK_SERVERS.some((w) => norm(serverName).includes(w));

/**
 * Apply the user's overrides to a server block (a copy). Lowering is always allowed. Raising a cap, shortening the
 * minimum gap or adding allowed weekdays needs "accept_risk": true on that server; without it the default stays and the
 * attempt is listed in _clamped. Returns the copy with _notes (plain strings), _raised and _clamped ("invite.daily_cap").
 */
export function applyUser(def, userEntry) {
  const eff = clone(def);
  eff._notes = [];
  eff._raised = [];
  eff._clamped = [];
  if (userEntry === undefined) return eff;
  if (!isObj(userEntry)) {
    eff._notes.push('your entry in config/limits.json must be an object, so it was ignored');
    return eff;
  }
  const accept = userEntry.accept_risk === true;
  const cats = userEntry.categories;
  if (cats === undefined) return eff;
  if (!isObj(cats)) {
    eff._notes.push('"categories" in config/limits.json must be an object, so it was ignored');
    return eff;
  }
  for (const [cname, uc] of Object.entries(cats)) {
    const base = eff.categories[cname];
    if (!base) {
      eff._notes.push(`config/limits.json mentions "${cname}", which is not a known category (known: ${Object.keys(eff.categories).join(', ')})`);
      continue;
    }
    if (!isObj(uc)) {
      eff._notes.push(`"${cname}" in config/limits.json must be an object, so it was ignored`);
      continue;
    }
    for (const f of CAP_FIELDS) {
      const v = uc[f];
      if (v === undefined) continue;
      const at = `${cname}.${f}`;
      if (f === 'daily_cap' || f === 'weekly_cap') {
        if (!(Number.isInteger(v) && v >= 0)) {
          eff._notes.push(`${at} in config/limits.json must be a whole number, so it was ignored`);
          continue;
        }
        if (base[f] === undefined || v <= base[f]) base[f] = v;
        else if (accept) {
          base[f] = v;
          eff._raised.push(at);
        } else eff._clamped.push(at);
      } else if (f === 'min_gap_seconds') {
        if (!(typeof v === 'number' && v >= 0)) {
          eff._notes.push(`${at} in config/limits.json must be a number, so it was ignored`);
          continue;
        }
        if (base[f] === undefined || v >= base[f]) base[f] = v;
        else if (accept) {
          base[f] = v;
          eff._raised.push(at);
        } else eff._clamped.push(at);
      } else {
        if (!(Array.isArray(v) && v.length && v.every((d) => parseDay(d) >= 0))) {
          eff._notes.push(`${at} in config/limits.json must be a list of days such as "mon", so it was ignored`);
          continue;
        }
        const wanted = [...new Set(v.map(parseDay))];
        const allowed = Array.isArray(base[f]) && base[f].length ? base[f].map(parseDay) : null;
        if (!allowed || wanted.every((d) => allowed.includes(d))) base[f] = wanted;
        else if (accept) {
          base[f] = wanted;
          eff._raised.push(at);
        } else eff._clamped.push(at);
      }
    }
  }
  return eff;
}

/** Category name for a tool, or null when the server has no such category and no "other". */
export function categoryFor(def, tool) {
  const t = String(tool).toLowerCase();
  for (const [name, c] of Object.entries(def.categories)) {
    if (Array.isArray(c.tools) && c.tools.some((x) => String(x).toLowerCase() === t)) return name;
  }
  return def.categories.other ? 'other' : null;
}

/** Does this category have anything to enforce? ("free" housekeeping tools do not.) */
export const hasLimits = (cat) =>
  Boolean(cat && (cat.writes || cat.daily_cap !== undefined || cat.weekly_cap !== undefined || cat.min_gap_seconds || (Array.isArray(cat.weekday_cap) && cat.weekday_cap.length)));

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

/** The first non-empty target argument of a call (a username, URL, id, search words), or ''. */
export function targetOf(def, toolInput) {
  const keys = Array.isArray(def.target_keys) && def.target_keys.length ? def.target_keys : ['url', 'username', 'id', 'query'];
  const input = isObj(toolInput) ? toolInput : {};
  for (const k of keys) {
    const v = input[k];
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v).trim().slice(0, 200);
  }
  return '';
}

/** Comparable form of a target: "https://www.linkedin.com/in/Jane-Doe/?x=1" and "jane-doe" are the same. */
export function normTarget(v) {
  let s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s) || /^www\./.test(s)) s = s.split('/').filter(Boolean).pop() || s;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as is */
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

/** { ok, rows, bad }. A missing file is an empty ledger. Any line that is not a valid row makes the ledger damaged. */
export function readLedger() {
  const file = ledgerFile();
  if (!existsSync(file)) return { ok: true, rows: [], bad: [] };
  let text;
  try {
    text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch {
    return { ok: false, rows: [], bad: [], reason: 'unreadable' };
  }
  const rows = [];
  const bad = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line);
      const t = isObj(row) ? Date.parse(row.ts) : NaN;
      if (!isObj(row) || Number.isNaN(t) || typeof row.server !== 'string' || typeof row.category !== 'string') throw new Error('bad row');
      row._t = t;
      rows.push(row);
    } catch {
      bad.push(i + 1);
    }
  });
  return bad.length ? { ok: false, rows, bad, reason: 'damaged' } : { ok: true, rows, bad };
}

const writeAtomic = (file, text) => {
  mkdirSync(stateDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
};

/** Drop rows older than LEDGER_DAYS (lines that are not valid rows are kept, so damage is never hidden). Returns how many were removed. */
export function pruneLedger(now = new Date()) {
  const file = ledgerFile();
  if (!existsSync(file)) return 0;
  const cutoff = now.getTime() - LEDGER_DAYS * DAY_MS;
  const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const keep = lines.filter((l) => {
    try {
      const t = Date.parse(JSON.parse(l).ts);
      return Number.isNaN(t) || t >= cutoff;
    } catch {
      return true;
    }
  });
  if (keep.length === lines.length) return 0;
  writeAtomic(file, keep.length ? keep.join('\n') + '\n' : '');
  return lines.length - keep.length;
}

/** Add one row to the ledger (after pruning old ones). */
export function appendLedger(row, now = new Date()) {
  mkdirSync(stateDir(), { recursive: true });
  pruneLedger(now);
  appendFileSync(ledgerFile(), JSON.stringify(row) + '\n', 'utf8');
}

/** Remove the lines that are not valid rows. Returns how many were dropped. */
export function repairLedger() {
  const file = ledgerFile();
  if (!existsSync(file)) return 0;
  const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const good = lines.filter((l) => {
    try {
      const row = JSON.parse(l);
      return isObj(row) && !Number.isNaN(Date.parse(row.ts)) && typeof row.server === 'string' && typeof row.category === 'string';
    } catch {
      return false;
    }
  });
  if (good.length !== lines.length) writeAtomic(file, good.length ? good.join('\n') + '\n' : '');
  return lines.length - good.length;
}

/* ------------------------------------------------------------------ */
/* State: warnings, throttle, pause, draft-only                         */
/* ------------------------------------------------------------------ */

const emptyState = () => ({ schema: 1, servers: {} });

/** { ok, state }. A missing file is an empty state. */
export function loadState() {
  const r = readJsonChecked(stateFile());
  if (!r.exists) return { ok: true, state: emptyState() };
  if (!r.ok || !isObj(r.value) || !isObj(r.value.servers)) return { ok: false, state: emptyState() };
  return { ok: true, state: r.value };
}

export function saveState(state) {
  writeAtomic(stateFile(), JSON.stringify(state, null, 2) + '\n');
}

const until = (srv, field) => (srv && srv[field] ? Date.parse(srv[field]) : NaN);
export const isPaused = (srv, now) => until(srv, 'paused_until') > now.getTime();
export const isThrottled = (srv, now) => until(srv, 'throttled_until') > now.getTime();

/** A cap after the warning throttle: halved, never below 1 (a cap of 0 stays 0). */
export const throttledCap = (cap) => (cap === 0 ? 0 : Math.max(1, Math.floor(cap / 2)));

function note(text, tag, priority) {
  try {
    addTask({ text, tag, priority });
  } catch {
    /* a task is a nice-to-have: the guard works without it */
  }
}

/**
 * Record a platform warning for a server (call only for a server that has limits).
 * First warning: pause all calls for pause_hours and halve the caps for throttle_days.
 * A second warning inside draft_only_window_days: draft-only (all calls that write are blocked until the user clears it).
 * A repeat while the pause is still running is the same incident and is not counted.
 * Returns { repeat, count, draftOnly, pausedUntil, throttledUntil }.
 */
export function registerWarning(key, def, excerpt, now = new Date()) {
  const loaded = loadState();
  const state = loaded.state; // a damaged state file is replaced: a warning must always be recorded
  const srv = (state.servers[key] ||= {});
  const name = def.name || key;
  if (isPaused(srv, now)) return { repeat: true, count: (srv.warnings || []).length, draftOnly: Boolean(srv.draft_only), pausedUntil: srv.paused_until, throttledUntil: srv.throttled_until };
  const windowMs = (def.draft_only_window_days ?? 60) * DAY_MS;
  const history = (Array.isArray(srv.warnings) ? srv.warnings : []).filter((w) => now.getTime() - Date.parse(w.ts) < windowMs);
  history.push({ ts: now.toISOString(), what: String(excerpt || '').slice(0, 80) });
  srv.warnings = history;
  srv.paused_until = new Date(now.getTime() + (def.pause_hours ?? 24) * HOUR_MS).toISOString();
  srv.throttled_until = new Date(now.getTime() + (def.throttle_days ?? 14) * DAY_MS).toISOString();
  const draftOnly = history.length >= 2;
  if (draftOnly && !srv.draft_only) {
    srv.draft_only = true;
    srv.draft_only_since = now.toISOString();
  }
  saveState(state);
  if (draftOnly) {
    note(
      `${name} showed a second warning, so Alterbrain now only drafts for ${name}: it will not send anything there. Check your ${name} account yourself. When you are happy it is fine, ask Alterbrain to run: node system/scripts/rate-guard.mjs clear-draft-only ${key}`,
      'rate-guard',
      'high',
    );
  } else {
    note(
      `${name} showed a security warning, so Alterbrain paused ${name} until ${fmtWhen(srv.paused_until, now)} and halved its limits until ${fmtDate(srv.throttled_until)}. Open ${name} in your own browser and check that your account is fine.`,
      'rate-guard',
      'high',
    );
  }
  return { repeat: false, count: history.length, draftOnly, pausedUntil: srv.paused_until, throttledUntil: srv.throttled_until };
}

/** User command: end the pause and the halved caps (and forget the warnings). Draft-only stays until it is cleared separately. */
export function resetThrottle(key) {
  const { state } = loadState();
  const srv = state.servers[key];
  if (srv) {
    delete srv.paused_until;
    delete srv.throttled_until;
    srv.warnings = [];
  }
  saveState(state);
}

/** User command: switch draft-only off for a server. Returns true if it was on. */
export function clearDraftOnly(key) {
  const { state } = loadState();
  const srv = state.servers[key];
  const was = Boolean(srv && srv.draft_only);
  if (srv) {
    srv.draft_only = false;
    delete srv.draft_only_since;
  }
  saveState(state);
  return was;
}

/* ------------------------------------------------------------------ */
/* Deciding a call (PreToolUse)                                        */
/* ------------------------------------------------------------------ */

const effectiveDaily = (cat, throttled) => (cat.daily_cap === undefined ? null : throttled ? throttledCap(cat.daily_cap) : cat.daily_cap);
const effectiveWeekly = (cat, throttled) => (cat.weekly_cap === undefined ? null : throttled ? throttledCap(cat.weekly_cap) : cat.weekly_cap);

/**
 * Pure decision. Returns null to allow, or { reason, kind } to deny.
 * rows: ledger rows of THIS server (with _t). srv: this server's state. now: a Date.
 */
export function decideCall({ key, def, category, tool, toolInput, now, rows, srv = {} }) {
  const cat = def.categories[category];
  if (!hasLimits(cat)) return null;
  const name = def.name || key;
  const label = cat.label || category;
  const t = now.getTime();
  const throttled = isThrottled(srv, now);
  const raised = (f) => ((def._raised || []).includes(`${category}.${f}`) ? ' (You raised this limit above the Alterbrain default and accepted the risk.)' : '');
  const clamped = (f) => ((def._clamped || []).includes(`${category}.${f}`) ? ' (Your setting in config/limits.json was ignored: it is above the default and accept_risk is not switched on.)' : '');
  const same = rows.filter((r) => r.category === category);

  if (isPaused(srv, now)) {
    return {
      kind: 'paused',
      reason: `${name} showed Alterbrain a warning, so every ${name} action is paused until ${fmtWhen(srv.paused_until, now)}. This protects your ${name} account. Tell the user and do not try again before then. Only the user can end the pause early: node system/scripts/rate-guard.mjs reset-throttle ${key}`,
    };
  }
  if (srv.draft_only && cat.writes) {
    return {
      kind: 'draft-only',
      reason: `${name} showed two warnings, so Alterbrain now only drafts for ${name} and will not send or change anything there. This protects your ${name} account. Save what you wanted to send as a draft for the user to send themselves. Only the user can switch this off: node system/scripts/rate-guard.mjs clear-draft-only ${key}`,
    };
  }
  if (cat.writes) {
    const target = normTarget(targetOf(def, toolInput));
    if (target) {
      const hit = same.find((r) => r.outcome === 'unknown' && String(r.tool).toLowerCase() === String(tool).toLowerCase() && normTarget(r.target) === target && t - r._t < UNKNOWN_BLOCK_HOURS * HOUR_MS);
      if (hit) {
        const retryAt = new Date(hit._t + UNKNOWN_BLOCK_HOURS * HOUR_MS);
        return {
          kind: 'unknown',
          reason: `Alterbrain could not confirm whether the earlier ${tool} for "${hit.target}" went through, so it will not repeat the same action until ${fmtWhen(retryAt, now)}. Doing it twice could send it twice and looks suspicious to ${name}. Ask the user to check on ${name} themselves first.`,
        };
      }
    }
  }
  if (Array.isArray(cat.weekday_cap) && cat.weekday_cap.length) {
    const allowed = cat.weekday_cap.map(parseDay);
    const today = weekdayIndex(now);
    if (!allowed.includes(today)) {
      let next = 1;
      while (next < 8 && !allowed.includes(weekdayIndex(addDays(now, next)))) next++;
      const nextDay = startOfDay(addDays(now, next));
      return {
        kind: 'weekday',
        reason: `${cap1(label)} on ${name} only run ${dayList(allowed)}, and today is ${WEEKDAYS[today]}, so none are allowed today. They can start again ${fmtWhen(nextDay, now)}. This keeps the pattern looking normal and protects your ${name} account.${raised('weekday_cap')}${clamped('weekday_cap')} Tell the user and stop until then.`,
      };
    }
  }
  const half = (n) => (throttled ? ` The limit is halved (from ${n} to ${throttledCap(n)}) until ${fmtDate(srv.throttled_until)} because ${name} showed a warning.` : '');
  const daily = effectiveDaily(cat, throttled);
  if (daily !== null) {
    const dayStart = startOfDay(now).getTime();
    const used = same.filter((r) => r._t >= dayStart).length;
    if (used >= daily) {
      return {
        kind: 'daily',
        reason: `Daily limit reached for ${label} on ${name}: ${used} of ${daily} used today. The count starts again ${fmtWhen(addDays(startOfDay(now), 1), now)}. This limit protects your ${name} account from being restricted.${half(cat.daily_cap)}${raised('daily_cap')}${clamped('daily_cap')} Tell the user and stop these until then; do not look for a way round it.`,
      };
    }
  }
  const weekly = effectiveWeekly(cat, throttled);
  if (weekly !== null) {
    const weekStart = startOfWeek(now).getTime();
    const used = same.filter((r) => r._t >= weekStart).length;
    if (used >= weekly) {
      return {
        kind: 'weekly',
        reason: `Weekly limit reached for ${label} on ${name}: ${used} of ${weekly} used this week. The count starts again ${fmtWhen(addDays(startOfWeek(now), 7), now)}. This limit protects your ${name} account from being restricted.${half(cat.weekly_cap)}${raised('weekly_cap')}${clamped('weekly_cap')} Tell the user and stop these until then; do not look for a way round it.`,
      };
    }
  }
  const gap = cat.min_gap_seconds || 0;
  if (gap && same.length) {
    const last = Math.max(...same.map((r) => r._t));
    const wait = Math.ceil(gap - (t - last) / 1000);
    if (wait > 0) {
      return {
        kind: 'gap',
        reason: `Too soon: the last ${name} action of this kind (${label}) was only moments ago and the minimum gap is ${gap} seconds. Wait ${wait} more seconds, do other work meanwhile, then try once more. The slow pace protects your ${name} account.${raised('min_gap_seconds')}${clamped('min_gap_seconds')}`,
      };
    }
  }
  return null;
}

const MSG = {
  limits: (server) =>
    `Alterbrain could not read its usage limits for ${server} (system/catalogue/limits.json), so it blocked this action to be safe. These limits protect your account. Ask me to run the health check.`,
  user: (name) =>
    `Alterbrain could not read your own limits file (config/limits.json), so it blocked this ${name} action to be safe. The file is not valid JSON. Fix it, or delete it to use the standard limits.`,
  ledger: (name) =>
    `Alterbrain could not read its usage log for ${name} (state/local/rate-guard/ledger.jsonl), so it cannot tell how much has been used and blocked this action to be safe. Ask the user to run: node system/scripts/rate-guard.mjs repair-ledger`,
  state: (name) =>
    `Alterbrain could not read its warning record for ${name} (state/local/rate-guard/state.json), so it blocked this action to be safe. Ask the user to run: node system/scripts/rate-guard.mjs reset-throttle ${name.toLowerCase()} (this also repairs the file).`,
};
export const CRASH_REASON = 'Alterbrain could not check the usage limits for this action, so it was blocked to be safe. Ask me to run the health check.';

/**
 * PreToolUse check for one MCP call. Reads the limits, the ledger and the state.
 * Returns null (allow, or not a rate-limited server) or { reason, kind }. Sets ctx.limited once the server is known to have limits,
 * so a crash afterwards can still fail closed.
 */
export function preCheck(serverName, tool, toolInput, now = new Date(), ctx = {}) {
  const fw = loadFramework();
  if (!fw.ok) {
    if (!fallbackLimited(serverName)) return null;
    ctx.limited = true;
    return { kind: 'unreadable-limits', reason: MSG.limits(serverName) };
  }
  const hit = findServer(fw.servers, serverName);
  if (!hit) return null;
  ctx.limited = true;
  const user = loadUser();
  const name = hit.def.name || hit.key;
  if (!user.ok) return { kind: 'unreadable-user', reason: MSG.user(name) };
  const def = applyUser(hit.def, user.servers[hit.key]);
  const category = categoryFor(def, tool);
  if (!category || !hasLimits(def.categories[category])) return null;
  const led = readLedger();
  if (!led.ok) return { kind: 'unreadable-ledger', reason: MSG.ledger(name) };
  const st = loadState();
  if (!st.ok) return { kind: 'unreadable-state', reason: MSG.state(name) };
  const rows = led.rows.filter((r) => r.server === hit.key);
  return decideCall({ key: hit.key, def, category, tool, toolInput, now, rows, srv: st.state.servers[hit.key] || {} });
}

/* ------------------------------------------------------------------ */
/* Reading a result (PostToolUse)                                      */
/* ------------------------------------------------------------------ */

/** All the text inside a tool result, whatever shape it has (a string, content blocks, an object). Capped. */
export function resultText(value) {
  const out = [];
  let size = 0;
  const walk = (v, depth) => {
    if (depth > 6 || size > 60000 || v == null) return;
    if (typeof v === 'string') {
      out.push(v);
      size += v.length;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(value, 0);
  return out.join('\n');
}

/** The first object in a result that carries "status" or "retry_safe" (the result may be JSON inside a text block). */
export function statusObject(value, depth = 0) {
  if (depth > 6 || value == null) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return statusObject(JSON.parse(s), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = statusObject(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isObj(value)) {
    if ('status' in value || 'retry_safe' in value) return value;
    for (const v of Object.values(value)) {
      const r = statusObject(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

const firstMatch = (patterns, text) => {
  for (const p of patterns || []) {
    try {
      const m = new RegExp(p, 'i').exec(text);
      if (m) return m[0];
    } catch {
      /* validated at load; skip a bad pattern */
    }
  }
  return null;
};

/**
 * Does a result look like a platform warning? Specific phrases count anywhere. Common words (captcha, restricted, 429 ...)
 * count only in an error or a short result, because a long profile page can contain them innocently.
 * Returns the matched words, or null.
 */
export function detectWarning(def, text, isError) {
  const w = def.warnings;
  if (!w || !text) return null;
  const strong = firstMatch(w.phrases, text);
  if (strong) return strong;
  if (isError || text.length <= (w.weak_max_chars ?? 1000)) return firstMatch(w.weak, text);
  return null;
}

/** 'ok' | 'failed' | 'error' | 'unknown' for a finished call (a warning is reported separately). */
export function classifyOutcome(def, cat, { text, isError, status }) {
  const u = def.outcome_unknown || {};
  if (cat.writes) {
    const st = status && typeof status.status === 'string' ? status.status.toLowerCase() : '';
    if (st && (u.statuses || []).map((s) => s.toLowerCase()).includes(st)) return 'unknown';
    if (status && status.retry_safe === false && status.sent !== true) return 'unknown';
    if (firstMatch(u.patterns, text)) return 'unknown';
    if (isError && firstMatch(u.error_patterns, text)) return 'unknown';
  }
  if (isError) return 'error';
  const st = status && typeof status.status === 'string' ? status.status.toLowerCase() : '';
  if (st && (def.failed_statuses || []).map((s) => s.toLowerCase()).includes(st)) return 'failed';
  return 'ok';
}

/**
 * PostToolUse / PostToolUseFailure for one MCP call: count it, spot warnings and unknown outcomes.
 * Returns null for a server with no limits, else { row, warning, notes } where notes are plain sentences for Claude.
 */
export function recordCall({ serverName, tool, toolInput, response, error, isError, now = new Date() }) {
  const fw = loadFramework();
  if (!fw.ok) return null; // the call could not have passed the Pre check without readable limits
  const hit = findServer(fw.servers, serverName);
  if (!hit) return null;
  const { key } = hit;
  const user = loadUser();
  const def = applyUser(hit.def, user.ok ? user.servers[key] : undefined);
  const category = categoryFor(def, tool) || 'other';
  const cat = def.categories[category] || {};
  const failed = isError === true || (response === undefined && error != null);
  const parts = [response, error].filter((v) => v !== undefined && v !== null);
  const text = parts.map(resultText).join('\n');
  const status = statusObject(response) || statusObject(error);
  const warningWords = detectWarning(def, text, failed);
  const outcome = classifyOutcome(def, cat, { text, isError: failed, status });
  const row = { ts: now.toISOString(), server: key, tool: String(tool), category, outcome };
  const target = targetOf(def, toolInput);
  if (target) row.target = target;
  if (warningWords) row.warning = true;
  appendLedger(row, now);

  const name = def.name || key;
  const notes = [];
  let warning = null;
  if (warningWords) {
    warning = registerWarning(key, def, warningWords, now);
    if (!warning.repeat) {
      notes.push(
        warning.draftOnly
          ? `${name} has shown a second warning. Stop every ${name} action now and tell the user in plain words. Alterbrain has switched ${name} to draft-only: it will not send or change anything there until the user switches that off themselves.`
          : `${name} has shown a warning ("${warningWords}"). Stop every ${name} action now and tell the user in plain words. Alterbrain has paused ${name} until ${fmtWhen(warning.pausedUntil, now)} and halved its limits until ${fmtDate(warning.throttledUntil)}. A second warning would switch ${name} to draft-only.`,
      );
    }
  }
  if (outcome === 'unknown') {
    notes.push(
      `The result of this ${name} action is unknown: ${name} did not confirm whether it went through. Do not do it again. Tell the user to check on ${name} themselves${target ? ` (${target})` : ''}. Alterbrain blocks the same action for ${UNKNOWN_BLOCK_HOURS} hours.`,
    );
    const shown = target.replace(/[\[\]#<>`]/g, '').slice(0, 80);
    note(`Check on ${name} whether your ${cat.label || category} action (${tool}${shown ? ` for ${shown}` : ''}) went through: Alterbrain could not tell. Do not repeat it until you have looked.`, 'rate-guard', 'medium');
  }
  return { row, warning, notes, key, name };
}

/* ------------------------------------------------------------------ */
/* Status (for the script and /health-check)                           */
/* ------------------------------------------------------------------ */

/** Servers listed in config/mcp.selected.json (ids as written there), or []. */
function enabledServers() {
  const r = readJsonChecked(rootPath('config', 'mcp.selected.json'));
  return r.ok && r.value && Array.isArray(r.value.enabled) ? r.value.enabled.map(String) : [];
}

/** Everything `status` shows. Never throws. */
export function statusReport(now = new Date()) {
  const fw = loadFramework();
  const report = { ok: true, problems: [], servers: [] };
  if (!fw.ok) {
    report.ok = false;
    report.problems.push(...(fw.problems || ['the limits file cannot be read']));
    return report;
  }
  const user = loadUser();
  if (!user.ok) {
    report.ok = false;
    report.problems.push('config/limits.json is not valid JSON (the standard limits are being enforced; fix or delete the file)');
  }
  const led = readLedger();
  if (!led.ok) {
    report.ok = false;
    report.problems.push(led.reason === 'damaged' ? `the usage log (state/local/rate-guard/ledger.jsonl) is damaged on line ${led.bad.join(', ')}; run: node system/scripts/rate-guard.mjs repair-ledger` : 'the usage log (state/local/rate-guard/ledger.jsonl) cannot be read');
  }
  const st = loadState();
  if (!st.ok) {
    report.ok = false;
    report.problems.push('the warning record (state/local/rate-guard/state.json) is damaged; run reset-throttle for the server to repair it');
  }
  const enabled = enabledServers();
  for (const [key, base] of Object.entries(fw.servers)) {
    const def = applyUser(base, user.ok ? user.servers[key] : undefined);
    const srv = st.state.servers[key] || {};
    const rows = led.rows.filter((r) => r.server === key);
    const throttled = isThrottled(srv, now);
    const dayStart = startOfDay(now).getTime();
    const weekStart = startOfWeek(now).getTime();
    const words = (Array.isArray(base.match) && base.match.length ? base.match : [key]).map(norm).filter(Boolean);
    const entry = {
      key,
      name: def.name || key,
      enabled: enabled.some((id) => words.some((w) => norm(id).includes(w))),
      activity: rows.length > 0 || Object.keys(srv).length > 0,
      paused_until: isPaused(srv, now) ? srv.paused_until : null,
      throttled_until: throttled ? srv.throttled_until : null,
      warnings: Array.isArray(srv.warnings) ? srv.warnings.length : 0,
      draft_only: Boolean(srv.draft_only),
      accept_risk: Boolean(user.ok && user.servers[key] && user.servers[key].accept_risk === true),
      raised: def._raised,
      clamped: def._clamped,
      notes: def._notes,
      unknown: rows.filter((r) => r.outcome === 'unknown' && now.getTime() - r._t < UNKNOWN_BLOCK_HOURS * HOUR_MS).map((r) => ({ tool: r.tool, target: r.target || '', ts: r.ts })),
      categories: [],
    };
    for (const [cname, cat] of Object.entries(def.categories)) {
      if (!hasLimits(cat)) continue;
      const same = rows.filter((r) => r.category === cname);
      entry.categories.push({
        category: cname,
        label: cat.label || cname,
        writes: Boolean(cat.writes),
        used_today: same.filter((r) => r._t >= dayStart).length,
        daily_cap: effectiveDaily(cat, throttled),
        used_week: same.filter((r) => r._t >= weekStart).length,
        weekly_cap: effectiveWeekly(cat, throttled),
        days: Array.isArray(cat.weekday_cap) && cat.weekday_cap.length ? dayList(cat.weekday_cap.map(parseDay)) : null,
        min_gap_seconds: cat.min_gap_seconds || 0,
      });
    }
    if (entry.paused_until || entry.draft_only || entry.unknown.length) report.ok = false;
    report.servers.push(entry);
  }
  return report;
}

export { fmtDate };
