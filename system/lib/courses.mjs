// Class dates for the session digest: which classes have taken place since the user was last asked about new material.
//
// Course notes (vault/20_areas/courses/<slug>/course.md, status "active") may carry, in their front matter:
//   session_dates: ["2026-10-13", "2026-10-15"]   dates the syllabus states (never invented)
//   class_days:    ["tue", "thu"]                  weekdays of class, used only when session_dates is empty
//   term_start:    "2026-10-12"                    first day of the term; generated class days start there
//   term_end:      "2026-12-18"                    last day of the term; generated class days stop there
// and, from the note's own front matter, `created` (YYYY-MM-DD). A note without session_dates or class_days is never nudged.
//
// Which dates can count (see scheduleBounds): a class on or before the day the note was made is never asked about (the
// student was bringing that course in on that day). Generated dates also start at term_start and stop at term_end; without
// term_end they stop 16 weeks after term_start (or after `created`), and a schedule with neither anchor is not nudged, so
// the reminder always ends. session_dates are the syllabus's own dates and are only cut at `created`.
//
// planNudges() reads those notes (cheap: at most 60 small reads, no process is started) and returns the digest lines
// plus a commit() that remembers what was said in state/local/course-nudges.json (never committed). Nothing is
// written until the caller calls commit(), so a digest that fails to build leaves no trace. Everything fails open:
// any problem gives no lines and a commit() that does nothing.
import { closeSync, existsSync, openSync, readdirSync, readSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './paths.mjs';
import { readJson, today, writeJson } from './fsx.mjs';
import { splitFrontmatter } from './frontmatter.mjs';

/** Only classes from the last 14 days are ever mentioned, whatever the state file says. */
export const WINDOW_DAYS = 14;
/** From this local hour a class held today counts as over. */
export const EVENING_HOUR = 18;
/** A schedule generated from class_days reaches back at most 8 weeks when no term_end is given to generateClassDates. */
export const GENERATE_MAX_BACK_DAYS = 56;
/** Without term_end, generated class days stop this long (16 weeks) after term_start, or after the note was made. */
export const GENERATE_TERM_DAYS = 112;
/** The most digest lines the nudge may take. More courses than this get one summary line. */
export const MAX_NUDGE_LINES = 3;

const MAX_COURSES = 60;
const MAX_NAMES_IN_SUMMARY = 6;
const HEAD_BYTES = 8192;
const TITLE_MAX = 60;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_WORDS = /^(sun(day)?|mon(day)?|tue(s|sday)?|wed(s|nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?)$/;

/* ------------------------------------------------------------------ */
/* dates (all local time; never toISOString)                           */
/* ------------------------------------------------------------------ */

/** A local Date at midnight for a strict YYYY-MM-DD string, or null when it is not a real date. */
export function parseIsoDate(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return today(d) === t ? d : null;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "Tue 13 Oct" from a YYYY-MM-DD string (English, fixed names, no locale). */
export function formatClassDate(iso) {
  const d = parseIsoDate(iso);
  return d ? `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` : String(iso);
}

/* ------------------------------------------------------------------ */
/* front matter fields                                                 */
/* ------------------------------------------------------------------ */

function asList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(/[\s,;]+/).filter(Boolean);
  return [];
}

/** Sorted, de-duplicated list of the real YYYY-MM-DD dates in a front matter value. Anything else is dropped. */
export function normalizeDates(v) {
  const out = new Set();
  for (const item of asList(v)) {
    if (typeof item === 'string' && parseIsoDate(item)) out.add(item.trim());
  }
  return [...out].sort();
}

/** Weekday numbers (0 = Sunday) from class_days such as ["tue","thu"], "Tuesday" or "tue, thu". Unknown words are dropped. */
export function normalizeClassDays(v) {
  const out = new Set();
  for (const item of asList(v)) {
    if (typeof item !== 'string') continue;
    const word = item.trim().toLowerCase();
    if (!DAY_WORDS.test(word)) continue;
    out.add(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3)));
  }
  return [...out].sort((a, b) => a - b);
}

/** The trimmed YYYY-MM-DD string when the value is a real date, otherwise null. */
function isoOrNull(v) {
  return typeof v === 'string' && parseIsoDate(v) ? v.trim() : null;
}

/** A course title safe to put in the digest: one line, no control characters, at most 60 characters. */
function cleanTitle(s) {
  // eslint-disable-next-line no-control-regex
  const t = String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX).trim() : t;
}

/* ------------------------------------------------------------------ */
/* reading the course notes                                            */
/* ------------------------------------------------------------------ */

/** First `n` bytes of a file as text. Throws if the file cannot be read (callers catch). */
function readHead(file, n = HEAD_BYTES) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = readSync(fd, buf, 0, n, 0);
    return buf.toString('utf8', 0, got);
  } finally {
    closeSync(fd);
  }
}

/**
 * What the digest needs from one course note, or null when the note is not an active course with a usable schedule.
 * Never throws.
 */
export function readCourse(file, slug) {
  try {
    const { data, body, raw } = splitFrontmatter(readHead(file));
    if (!raw) return null; // no front matter, or not closed within the first 8 KB
    if (String(data.status || '').trim().toLowerCase() !== 'active') return null;
    const sessionDates = normalizeDates(data.session_dates);
    const classDays = normalizeClassDays(data.class_days);
    if (!sessionDates.length && !classDays.length) return null;
    const heading = /^#[ \t]+(.+?)[ \t]*$/m.exec(body || '');
    let title = heading ? cleanTitle(heading[1]) : '';
    if (!title || title.includes('{{')) title = cleanTitle(slug.replace(/[-_]+/g, ' '));
    return { slug, title, sessionDates, classDays, termStart: isoOrNull(data.term_start), termEnd: isoOrNull(data.term_end), created: isoOrNull(data.created) };
  } catch {
    return null;
  }
}

/** The active courses that have a schedule, in folder order. */
export function listCourses(root = projectRoot()) {
  const dir = join(root, 'vault', '20_areas', 'courses');
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .slice(0, MAX_COURSES);
  const out = [];
  for (const slug of folders) {
    const file = join(dir, slug, 'course.md');
    if (!existsSync(file)) continue;
    const course = readCourse(file, slug);
    if (course) out.push(course);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* which class dates count                                             */
/* ------------------------------------------------------------------ */

/**
 * Dates from class_days between `from` and `to` (local Dates, both included). Stops at `termEnd` (YYYY-MM-DD) when
 * known; without it the schedule reaches back at most 8 weeks from `ref` (default `to`).
 */
export function generateClassDates(classDays, { from, to, termEnd = null, ref = to } = {}) {
  const days = new Set(classDays);
  if (!days.size || !(from instanceof Date) || !(to instanceof Date)) return [];
  let start = startOfDay(from);
  let end = startOfDay(to);
  const termEndDate = termEnd ? parseIsoDate(termEnd) : null;
  if (termEndDate) {
    if (termEndDate < end) end = termEndDate;
  } else {
    const floor = addDays(startOfDay(ref), -GENERATE_MAX_BACK_DAYS);
    if (floor > start) start = floor;
  }
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (days.has(d.getDay())) out.push(today(d));
  }
  return out;
}

/**
 * The first and last class dates (YYYY-MM-DD, both included, either may be null) that can ever count for a course.
 *   sessions    for session_dates: only the day after the note was made onwards.
 *   generated   for class_days: from the later of term_start and the day after the note was made, to term_end, or 16 weeks
 *               after term_start (or after the note was made) when term_end is not known. With no anchor at all (no term_end,
 *               no term_start, no valid created date) the schedule has no end, so `last` is null and nothing is generated.
 * Never throws.
 */
export function scheduleBounds(course) {
  const created = parseIsoDate(course && course.created);
  const termStart = parseIsoDate(course && course.termStart);
  const termEnd = parseIsoDate(course && course.termEnd);
  const afterCreated = created ? addDays(created, 1) : null;
  const sessions = { first: afterCreated ? today(afterCreated) : null, last: null };
  let genFirst = afterCreated;
  if (termStart && (!genFirst || termStart > genFirst)) genFirst = termStart;
  const anchor = termStart || created;
  const genLast = termEnd || (anchor ? addDays(anchor, GENERATE_TERM_DAYS) : null);
  return { sessions, generated: { first: genFirst ? today(genFirst) : null, last: genLast ? today(genLast) : null } };
}

/**
 * Class dates of one course that count for a nudge at `now`: from the last 14 days, strictly before today, or
 * including today from 18:00 local time, and inside scheduleBounds(). session_dates win; class_days are used only
 * when there are none.
 */
export function pastClassDates(course, now = new Date()) {
  const t = startOfDay(now);
  const last = now.getHours() >= EVENING_HOUR ? t : addDays(t, -1);
  const first = addDays(t, -WINDOW_DAYS);
  const bounds = scheduleBounds(course);
  if (course.sessionDates.length) {
    const lo = bounds.sessions.first && bounds.sessions.first > today(first) ? bounds.sessions.first : today(first);
    const hi = today(last);
    return course.sessionDates.filter((d) => d >= lo && d <= hi);
  }
  if (!bounds.generated.last) return [];
  const from = bounds.generated.first && parseIsoDate(bounds.generated.first) > first ? parseIsoDate(bounds.generated.first) : first;
  return generateClassDates(course.classDays, { from, to: last, termEnd: bounds.generated.last, ref: t });
}

/* ------------------------------------------------------------------ */
/* what was already said (state/local/course-nudges.json)              */
/* ------------------------------------------------------------------ */

export function stateFile(root = projectRoot()) {
  return join(root, 'state', 'local', 'course-nudges.json');
}

/**
 * Per course folder: the newest class date already mentioned. A missing, unreadable or odd file means nothing was
 * mentioned (the 14-day window still limits what can come back). A date in the future cannot have been mentioned.
 */
export function readState(root = projectRoot(), now = new Date()) {
  const out = new Map();
  try {
    const parsed = readJson(stateFile(root), null);
    const courses = parsed && typeof parsed === 'object' ? parsed.courses : null;
    if (!courses || typeof courses !== 'object' || Array.isArray(courses)) return out;
    const todayIso = today(now);
    for (const [slug, entry] of Object.entries(courses)) {
      const last = entry && typeof entry === 'object' ? entry.last_class : null;
      if (typeof last !== 'string' || !parseIsoDate(last) || last > todayIso) continue;
      const on = typeof entry.nudged_on === 'string' && parseIsoDate(entry.nudged_on) ? entry.nudged_on : null;
      out.set(slug, { last_class: last, nudged_on: on });
    }
  } catch {
    /* nothing mentioned */
  }
  return out;
}

/** Write the state file (temporary file, then rename). Returns true when it was written. Never throws. */
export function writeState(root, now, previous, nudged) {
  try {
    const floor = today(addDays(startOfDay(now), -WINDOW_DAYS));
    // A Map and Object.fromEntries, so that any folder name (even "__proto__") is stored as an ordinary key.
    const entries = new Map();
    // Older entries cannot change what the window lets through, so they are dropped here.
    for (const [slug, entry] of previous) {
      if (entry.last_class >= floor) entries.set(slug, { last_class: entry.last_class, nudged_on: entry.nudged_on });
    }
    for (const n of nudged) entries.set(n.slug, { last_class: n.date, nudged_on: today(now) });
    const data = { schema: 1, courses: Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
    const file = stateFile(root);
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      writeJson(tmp, data);
      renameSync(tmp, file);
    } catch {
      writeJson(file, data);
    } finally {
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* nothing to remove */
      }
    }
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* the digest lines                                                    */
/* ------------------------------------------------------------------ */

const tail = (course) => `Say 'add to ${course}' and give me the slides or your notes. (Mention it once, after the user's request.)`;

/**
 * The after-class nudge for the session digest.
 *   maxLines  how many digest lines there is room for (0 to 3). More qualifying courses than that: one summary line.
 * Returns { lines, courses, commit }. `lines` is at most `maxLines` long, most recent class first. `commit()` writes the
 * state file and returns true; call it only after the digest has been delivered.
 */
export function planNudges({ root = projectRoot(), now = new Date(), maxLines = MAX_NUDGE_LINES } = {}) {
  const none = { lines: [], courses: [], commit: () => false };
  try {
    const limit = Math.min(MAX_NUDGE_LINES, Math.floor(Number(maxLines)));
    if (!(limit >= 1)) return none;
    const courses = listCourses(root);
    if (!courses.length) return none;
    const state = readState(root, now);
    const due = [];
    for (const course of courses) {
      const known = state.get(course.slug);
      const last = known ? known.last_class : '';
      const fresh = pastClassDates(course, now).filter((d) => d > last);
      if (fresh.length) due.push({ slug: course.slug, title: course.title, date: fresh[fresh.length - 1] });
    }
    if (!due.length) return none;
    due.sort((a, b) => (a.date === b.date ? (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) : a.date < b.date ? 1 : -1));

    let lines;
    if (due.length <= limit) {
      lines = due.map((c) => `New material? ${c.title} had class on ${formatClassDate(c.date)}. ${tail(c.title)}`);
    } else {
      const names = due.slice(0, MAX_NAMES_IN_SUMMARY).map((c) => c.title);
      const more = due.length - names.length;
      const list = more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ');
      lines = [`New material? ${due.length} courses had class recently: ${list}. ${tail('<course>')}`];
    }
    let done = false;
    return {
      lines,
      courses: due,
      commit: () => {
        if (done) return false;
        done = true;
        return writeState(root, now, state, due);
      },
    };
  } catch {
    return none;
  }
}
