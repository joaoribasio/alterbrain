// Routines: the registry of scheduled jobs (one note per routine in vault/90_routines/).
//
// Alterbrain does not run a scheduler. The jobs run on a host the user already has (a Claude desktop scheduled
// task, a Claude cloud routine, or a server's own scheduler). A routine note makes the job visible, portable and
// fail-visible: its body is the exact instruction the host runs, and each run records itself in the note.
//
// This module is pure where it can be: parsing, validating, due times and overdue checks take plain values and a
// `now` date. The only file access is readRoutines() (cheap reads, never throws) and the folder constants.
// Documented fallback: no vault/90_routines folder (or no notes in it) means no routines.
// All times are local (the same clock as the session digest). Stamps are "YYYY-MM-DD HH:MM".
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { splitFrontmatter } from './frontmatter.mjs';
import { setFrontmatterLine } from './migrate.mjs';
import { vaultPath } from './paths.mjs';
import { nowStamp, today } from './fsx.mjs';

export const ROUTINES_FOLDER = '90_routines';
export const STATUSES = ['active', 'paused', 'suggested'];
export const HOSTS = ['laptop', 'cloud', 'server'];
export const MODELS = ['haiku', 'sonnet', 'opus', 'inherit'];
export const EFFORTS = ['low', 'medium', 'high'];
export const MAY = 'draft only';
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MAX_NOTES = 200;
export const MAX_BYTES = 32 * 1024;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const MIN_GRACE_MS = 2 * HOUR_MS;

/** Folder that holds the routine notes of the current project (it may not exist). */
export function routinesDir() {
  return vaultPath(ROUTINES_FOLDER);
}

/** The cadence in machine form -> { kind, dow, dom, hour, minute } or null. daily@HH:MM, weekly:mon@HH:MM, monthly:15@HH:MM. */
export function parseCadence(value) {
  const s = String(value ?? '').trim().toLowerCase();
  const time = '([01]\\d|2[0-3]):([0-5]\\d)';
  let m = new RegExp(`^daily@${time}$`).exec(s);
  if (m) return { kind: 'daily', hour: Number(m[1]), minute: Number(m[2]) };
  m = new RegExp(`^weekly:(sun|mon|tue|wed|thu|fri|sat)@${time}$`).exec(s);
  if (m) return { kind: 'weekly', dow: DAYS.indexOf(m[1]), hour: Number(m[2]), minute: Number(m[3]) };
  m = new RegExp(`^monthly:(\\d{1,2})@${time}$`).exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 28) return { kind: 'monthly', dom: Number(m[1]), hour: Number(m[2]), minute: Number(m[3]) };
  return null;
}

/** Nominal length of one cycle in milliseconds (a month counts as 30 days). */
export function intervalMs(cadence) {
  const c = typeof cadence === 'object' && cadence ? cadence : parseCadence(cadence);
  if (!c) return null;
  return c.kind === 'daily' ? DAY_MS : c.kind === 'weekly' ? 7 * DAY_MS : 30 * DAY_MS;
}

/** Half an interval after the due time, and never less than two hours. */
export function graceMs(cadence) {
  const i = intervalMs(cadence);
  return i === null ? null : Math.max(i / 2, MIN_GRACE_MS);
}

/** "YYYY-MM-DD HH:MM" (also "YYYY-MM-DD") -> a local Date, or null when it is not a real time. */
export function parseStamp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = m[4] === undefined ? 0 : Number(m[4]);
  const mi = m[5] === undefined ? 0 : Number(m[5]);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== mi) return null;
  return date;
}

/** The first moment the cadence is due strictly after `after`. Local time. */
export function nextDue(cadence, after) {
  const c = typeof cadence === 'object' && cadence ? cadence : parseCadence(cadence);
  if (!c || !(after instanceof Date) || Number.isNaN(after.getTime())) return null;
  const y = after.getFullYear();
  const mo = after.getMonth();
  const d = after.getDate();
  if (c.kind === 'daily') {
    let t = new Date(y, mo, d, c.hour, c.minute, 0, 0);
    if (t <= after) t = new Date(y, mo, d + 1, c.hour, c.minute, 0, 0);
    return t;
  }
  if (c.kind === 'weekly') {
    const ahead = (c.dow - after.getDay() + 7) % 7;
    let t = new Date(y, mo, d + ahead, c.hour, c.minute, 0, 0);
    if (t <= after) t = new Date(y, mo, d + ahead + 7, c.hour, c.minute, 0, 0);
    return t;
  }
  let t = new Date(y, mo, c.dom, c.hour, c.minute, 0, 0);
  if (t <= after) t = new Date(y, mo + 1, c.dom, c.hour, c.minute, 0, 0);
  return t;
}

const text = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());
/** A blank value written without quotes reads as an empty list; treat it as empty text. */
const scalar = (v) => (Array.isArray(v) && v.length === 0 ? '' : v);

function dataProblem(item) {
  if (typeof item !== 'string' || !item.trim()) return 'a data entry is empty';
  const p = item.trim();
  if (/^([a-zA-Z]:|[\\/])/.test(p) || p.split(/[\\/]/).includes('..')) return `data path "${p}" must be a path inside the vault, without ".."`;
  return null;
}

/** The problems with a routine's frontmatter, as plain sentences. An empty list means valid. */
export function validateRoutine(data) {
  const d = data && typeof data === 'object' ? data : {};
  const problems = [];
  if (text(d.type) !== 'routine') problems.push('type must be "routine"');
  if (!STATUSES.includes(text(d.status))) problems.push(`status must be one of ${STATUSES.join(', ')}`);
  if (!text(scalar(d.schedule))) problems.push('schedule is empty (write it in plain words, for example "Mondays 08:00")');
  if (!parseCadence(scalar(d.cadence))) problems.push('cadence must look like daily@08:00, weekly:mon@08:00 or monthly:1@08:00');
  if (!HOSTS.includes(text(d.host))) problems.push(`host must be one of ${HOSTS.join(', ')}`);
  if (!text(scalar(d.runs))) problems.push('runs is empty (a skill such as "/people due", or "prompt")');
  if (text(d.may) !== MAY) problems.push(`may must be "${MAY}" (routines only ever draft)`);
  if (d.data !== undefined && !Array.isArray(d.data)) problems.push('data must be a list of vault paths');
  else for (const item of d.data || []) {
    const p = dataProblem(item);
    if (p) problems.push(p);
  }
  if (!MODELS.includes(text(d.model))) problems.push(`model must be one of ${MODELS.join(', ')}`);
  if (!EFFORTS.includes(text(d.effort))) problems.push(`effort must be one of ${EFFORTS.join(', ')}`);
  const lastRun = text(scalar(d.last_run));
  if (lastRun && !parseStamp(lastRun)) problems.push('last_run must be empty or a local time such as 2026-10-05 08:01');
  if (!parseStamp(text(d.created))) problems.push('created must be a date such as 2026-10-05');
  return problems;
}

/** Turn a parsed note into the routine shape used everywhere else. */
export function toRoutine(name, file, data) {
  const problems = validateRoutine(data);
  const lastRun = text(scalar(data.last_run));
  return {
    name,
    file,
    status: text(data.status),
    schedule: text(scalar(data.schedule)),
    cadence: text(scalar(data.cadence)),
    host: text(data.host),
    runs: text(scalar(data.runs)),
    model: text(data.model),
    effort: text(data.effort),
    last_run: lastRun,
    last_result: text(scalar(data.last_result)),
    created: text(data.created),
    valid: problems.length === 0,
    problems,
  };
}

/** Why a note in the routines folder cannot be recognised as a routine, or null when it says it is some other type. */
function unreadableReason(raw, data, type) {
  const t = raw.replace(/^\uFEFF/, '');
  if (!t.startsWith('---')) return 'it has no settings block at the top of the note (between two --- lines)';
  if (t.indexOf('\n---', 3) === -1) return 'its settings block at the top of the note is not closed with a second --- line';
  if (Object.keys(data).length === 0) return 'its settings block at the top of the note has no "key: value" lines I can read';
  if (!type) return 'the "type" line is missing (it should say type: "routine")';
  return null;
}

/**
 * Read every routine note. Cheap and never throws. Returns { routines, unreadable, folder_exists, truncated }.
 * `dir` is for tests; the default is vault/90_routines of the current project. README files and notes that say
 * they are another type are ignored; a note of type "routine" with wrong values is listed in `routines` with problems.
 * A note that cannot be recognised at all (unreadable, no frontmatter block, a block that is not closed, no `type`
 * line) is listed in `unreadable` as { name, file, reason } so it is never dropped silently.
 */
export function readRoutines(dir = routinesDir()) {
  const out = { routines: [], unreadable: [], folder_exists: false, truncated: false };
  if (!existsSync(dir)) return out;
  out.folder_exists = true;
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')).sort((a, b) => a.localeCompare(b));
  } catch {
    return out;
  }
  if (files.length > MAX_NOTES) {
    files = files.slice(0, MAX_NOTES);
    out.truncated = true;
  }
  for (const f of files) {
    const name = basename(f, '.md');
    const file = join(dir, f);
    try {
      const raw = readFileSync(file, 'utf8').slice(0, MAX_BYTES);
      const { data } = splitFrontmatter(raw);
      const type = text(data.type);
      if (type === 'readme' || name.toLowerCase() === 'readme') continue;
      if (type !== 'routine' && !(data.cadence || data.schedule || data.runs)) {
        const reason = unreadableReason(raw, data, type);
        if (reason) out.unreadable.push({ name, file, reason });
        continue;
      }
      out.routines.push(toRoutine(name, file, data));
    } catch {
      out.unreadable.push({ name, file, reason: 'the note could not be read (check that the file opens and is not locked)' });
    }
  }
  return out;
}

/** Find a routine (or an unreadable note: anything with a `name`) by name, ignoring case. */
export function findRoutine(routines, name) {
  const k = String(name ?? '').trim().toLowerCase();
  return routines.find((r) => r.name.toLowerCase() === k) || null;
}

/**
 * Is an active routine overdue? Returns { overdue, since, due_at }.
 * - Has run before: overdue when the last run is older than one interval plus the grace (half an interval, at least two hours).
 * - Never run: overdue only once its first due time after set-up has passed, plus the same grace. A date-only
 *   `created` counts as the end of that day (the job may have been set up after that day's due time); a full
 *   "YYYY-MM-DD HH:MM" stamp is used as it is. `never_run` is true, and `since` is the set-up date.
 * Paused, suggested and invalid routines are never overdue.
 */
export function overdueStatus(routine, now = new Date()) {
  const none = { overdue: false, since: null, due_at: null, never_run: false };
  if (!routine || routine.status !== 'active' || !routine.valid) return none;
  const grace = graceMs(routine.cadence);
  const interval = intervalMs(routine.cadence);
  if (grace === null || interval === null) return none;
  const last = routine.last_run ? parseStamp(routine.last_run) : null;
  if (last) {
    const dueAt = new Date(last.getTime() + interval + grace);
    return { overdue: now > dueAt, since: last, due_at: dueAt, never_run: false };
  }
  const created = parseStamp(routine.created);
  if (!created) return none;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(routine.created.trim());
  const base = dateOnly ? new Date(created.getFullYear(), created.getMonth(), created.getDate() + 1, 0, 0, 0, 0) : created;
  const first = nextDue(routine.cadence, base);
  if (!first) return none;
  const dueAt = new Date(first.getTime() + grace);
  return { overdue: now > dueAt, since: created, due_at: dueAt, never_run: true };
}

/** Active, valid routines that are overdue, the one waiting longest first: [{ routine, since, due_at }]. */
export function overdueRoutines(routines, now = new Date()) {
  return routines
    .map((routine) => ({ routine, ...overdueStatus(routine, now) }))
    .filter((x) => x.overdue)
    .sort((a, b) => a.since - b.since || a.routine.name.localeCompare(b.routine.name));
}

/** "Monday 2026-10-05". */
export function describeDay(date) {
  return `${WEEKDAY_NAMES[date.getDay()]} ${today(date)}`;
}

/** "has not run since Monday 2026-10-05", or for a routine that never ran "has not run yet (set up Thursday 2026-10-08)". */
export function lateText({ since, never_run: neverRun }) {
  return neverRun ? `has not run yet (set up ${describeDay(since)})` : `has not run since ${describeDay(since)}`;
}

/** The one digest line for overdue routines, or null when none are. */
export function digestLine(overdue) {
  if (!overdue || overdue.length === 0) return null;
  if (overdue.length === 1) {
    const { routine } = overdue[0];
    return `${routine.name} ${lateText(overdue[0])}. Check the Claude app's Routines page, or say 'check my routines'.`;
  }
  return `${overdue.length} routines are overdue: say 'check my routines'.`;
}

/** The digest line for the current project (reads the notes), or null. Never throws. */
export function routineDigestLine(now = new Date(), dir = routinesDir()) {
  try {
    return digestLine(overdueRoutines(readRoutines(dir).routines, now));
  } catch {
    return null;
  }
}

/** One plain line the user can read: when it last ran and what happened. */
export function describeLastRun(routine) {
  if (!routine.last_run) return 'never run';
  return routine.last_result ? `${routine.last_run} (${routine.last_result})` : routine.last_run;
}

/** Make a result safe for one frontmatter line: no quotes, backslashes, hash signs or line breaks; at most 200 characters. */
export function cleanResult(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\\/g, '/')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * The note text after a run: last_run and last_result set, everything else untouched (line endings and a leading
 * byte order mark are kept). Returns the new text; the text is returned unchanged when the note has no frontmatter.
 */
export function applyRecord(noteText, result, now = new Date()) {
  let t = setFrontmatterLine(noteText, 'last_run', `"${nowStamp(now)}"`, { after: ['model', 'effort', 'data', 'may'] });
  t = setFrontmatterLine(t, 'last_result', `"${cleanResult(result)}"`, { after: ['last_run'] });
  return t;
}

/** Set (or add) the status line of a note, keeping everything else. */
export function applyStatus(noteText, status) {
  return setFrontmatterLine(noteText, 'status', `"${status}"`, { after: ['type'] });
}
