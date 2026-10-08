// Class dates for the after-class nudge (system/lib/courses.mjs): which dates count, what was already said, and the
// digest lines. Synthetic course notes only; temp folders under state/local/tmp/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO } from '../fixtures/hooks/helpers.mjs';
import { splitFrontmatter } from '../../system/lib/frontmatter.mjs';
import {
  EVENING_HOUR,
  GENERATE_MAX_BACK_DAYS,
  GENERATE_TERM_DAYS,
  WINDOW_DAYS,
  formatClassDate,
  generateClassDates,
  listCourses,
  normalizeClassDays,
  normalizeDates,
  parseIsoDate,
  pastClassDates,
  planNudges,
  readCourse,
  readState,
  scheduleBounds,
  stateFile,
} from '../../system/lib/courses.mjs';

const TMP = join(REPO, 'state', 'local', 'tmp', 'courses');
const roots = [];

function makeRoot(prefix = 'c-') {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(join(TMP, prefix));
  roots.push(root);
  return root;
}
process.on('exit', () => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/** Local time on a given day: at(2026, 10, 14, 9, 30) is Wednesday 14 October 2026, 09:30. */
const at = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min, 0);
const put = (root, rel, text) => {
  const file = join(root, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  return file;
};
const courseFile = (slug) => `vault/20_areas/courses/${slug}/course.md`;

/** Write a course note. `fields` is raw front matter text (lines), `title` the heading. */
function addCourse(root, slug, fields = '', { title = slug, status = 'active', eol = '\n', created = '2026-09-01' } = {}) {
  const fm = [`type: "course"`, created === null ? null : `created: "${created}"`, status === null ? null : `status: "${status}"`, ...fields.split('\n').filter(Boolean)].filter((l) => l !== null);
  const text = ['---', ...fm, '---', `# ${title}`, '', '## Overview', '', 'Synthetic.', ''].join(eol);
  return put(root, courseFile(slug), text);
}
const nudge = (root, now, maxLines) => planNudges({ root, now, ...(maxLines === undefined ? {} : { maxLines }) });

/* ---------------- parsing ---------------- */

test('parseIsoDate accepts real dates only', () => {
  assert.ok(parseIsoDate('2026-10-13'));
  assert.equal(parseIsoDate('2026-10-13').getDay(), 2); // Tuesday
  assert.ok(parseIsoDate('2028-02-29'));
  assert.ok(parseIsoDate(' 2026-10-13 '));
  for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-10-32', '26-10-13', '2026-1-3', 'tomorrow', '', '13/10/2026', '2026-10-13T10:00:00', 20261013, null, undefined, {}, [], '0050-01-01']) {
    assert.equal(parseIsoDate(bad), null, String(bad));
  }
});

test('formatClassDate gives English weekday, day and month', () => {
  assert.equal(formatClassDate('2026-10-13'), 'Tue 13 Oct');
  assert.equal(formatClassDate('2026-01-01'), 'Thu 1 Jan');
  assert.equal(formatClassDate('2026-12-31'), 'Thu 31 Dec');
  assert.equal(formatClassDate('nonsense'), 'nonsense');
});

test('normalizeDates sorts, de-duplicates and drops anything that is not a real date', () => {
  assert.deepEqual(normalizeDates(['2026-10-15', '2026-10-13', '2026-10-13', 'Week 6', 'TBC', '2026-02-30', 7, null, {}]), ['2026-10-13', '2026-10-15']);
  assert.deepEqual(normalizeDates('2026-10-15, 2026-10-13; 2026-10-14'), ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.deepEqual(normalizeDates([]), []);
  assert.deepEqual(normalizeDates(''), []);
  assert.deepEqual(normalizeDates(undefined), []);
  assert.deepEqual(normalizeDates(42), []);
});

test('normalizeClassDays reads weekday codes and names, in week order', () => {
  assert.deepEqual(normalizeClassDays(['tue', 'thu']), [2, 4]);
  assert.deepEqual(normalizeClassDays(['Thu', 'TUE']), [2, 4]);
  assert.deepEqual(normalizeClassDays(['Tuesday', 'thursday', 'Tues', 'Thurs', 'thur']), [2, 4]);
  assert.deepEqual(normalizeClassDays('Tuesday, Thursday'), [2, 4]);
  assert.deepEqual(normalizeClassDays(['sun', 'sat', 'mon']), [0, 1, 6]);
  assert.deepEqual(normalizeClassDays(['dinsdag', 'x', '', 3, null]), []);
  assert.deepEqual(normalizeClassDays([]), []);
  assert.deepEqual(normalizeClassDays(undefined), []);
});

/* ---------------- which class dates count ---------------- */

test('session_dates: strictly before today, plus today from 18:00', () => {
  const course = { sessionDates: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'], classDays: [], termEnd: null };
  assert.equal(EVENING_HOUR, 18);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 9, 0)), ['2026-10-12', '2026-10-13']);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 17, 59)), ['2026-10-12', '2026-10-13']);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 18, 0)), ['2026-10-12', '2026-10-13', '2026-10-14']);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 23, 59)), ['2026-10-12', '2026-10-13', '2026-10-14']);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 0, 0)), ['2026-10-12', '2026-10-13'], 'just after midnight is still "before 18:00"');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 12, 8, 0)), [], 'a class later today or in the future never counts');
});

test('only the last 14 days count; the 14th day back still does', () => {
  assert.equal(WINDOW_DAYS, 14);
  const course = { sessionDates: ['2026-09-29', '2026-09-30', '2026-10-13'], classDays: [], termEnd: null };
  // today is Wed 14 Oct: 14 days back is Wed 30 Sep
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 9)), ['2026-09-30', '2026-10-13']);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 15, 9)), ['2026-10-13'], 'a day later 30 Sep has dropped out');
  assert.deepEqual(pastClassDates({ sessionDates: ['2026-01-05'], classDays: [], termEnd: null }, at(2026, 10, 14)), []);
});

test('class_days generate dates in the window, newest last', () => {
  const course = { sessionDates: [], classDays: [2, 4], termEnd: null, created: '2026-09-01' };
  // Fri 16 Oct, morning: the window is 2 Oct to 15 Oct
  assert.deepEqual(pastClassDates(course, at(2026, 10, 16, 9)), ['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
  // Thu 15 Oct: today's class (Thursday) is not over before 18:00 ...
  assert.deepEqual(pastClassDates(course, at(2026, 10, 15, 9)), ['2026-10-01', '2026-10-06', '2026-10-08', '2026-10-13']);
  // ... and counts from 18:00
  assert.deepEqual(pastClassDates(course, at(2026, 10, 15, 18, 0)), ['2026-10-01', '2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
});

test('term_end stops generated dates, and has no effect once it is in the future', () => {
  const noEnd = { sessionDates: [], classDays: [2, 4], termEnd: null, created: '2026-09-01' };
  const now = at(2026, 10, 16, 9);
  assert.deepEqual(pastClassDates({ ...noEnd, termEnd: '2026-10-08' }, now), ['2026-10-06', '2026-10-08']);
  assert.deepEqual(pastClassDates({ ...noEnd, termEnd: '2026-10-07' }, now), ['2026-10-06']);
  assert.deepEqual(pastClassDates({ ...noEnd, termEnd: '2026-10-01' }, now), [], 'the term ended before the window');
  assert.deepEqual(pastClassDates({ ...noEnd, termEnd: '2026-12-18' }, now), pastClassDates(noEnd, now));
});

test('without term_end a generated schedule reaches back at most 8 weeks; with it, up to term_end', () => {
  assert.equal(GENERATE_MAX_BACK_DAYS, 56);
  const daily = [0, 1, 2, 3, 4, 5, 6];
  const to = at(2026, 10, 16);
  const open = generateClassDates(daily, { from: at(2026, 1, 1), to });
  assert.equal(open[0], '2026-08-21'); // 56 days before 16 Oct
  assert.equal(open.at(-1), '2026-10-16');
  assert.equal(open.length, 57);
  const closed = generateClassDates(daily, { from: at(2026, 9, 1), to, termEnd: '2026-10-16' });
  assert.equal(closed[0], '2026-09-01', 'a known term end replaces the 8-week limit');
  assert.equal(closed.length, 46);
  assert.deepEqual(generateClassDates(daily, { from: at(2026, 10, 16), to: at(2026, 10, 10) }), [], 'an empty range');
  assert.deepEqual(generateClassDates([], { from: at(2026, 10, 1), to }), []);
  assert.deepEqual(generateClassDates([2], { from: null, to }), []);
});

test('generated dates are one per calendar day across a daylight-saving change', () => {
  const days = generateClassDates([0, 1, 2, 3, 4, 5, 6], { from: at(2026, 10, 20), to: at(2026, 11, 2), termEnd: '2026-11-30' });
  assert.equal(days.length, 14);
  assert.equal(new Set(days).size, 14);
  assert.equal(days[0], '2026-10-20');
  assert.equal(days.at(-1), '2026-11-02');
  const spring = generateClassDates([0, 1, 2, 3, 4, 5, 6], { from: at(2026, 3, 25), to: at(2026, 4, 2), termEnd: '2026-06-01' });
  assert.deepEqual(spring, ['2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']);
});

test('session_dates win over class_days', () => {
  const course = { sessionDates: ['2026-10-12'], classDays: [2, 4], termEnd: null, created: '2026-09-01' };
  assert.deepEqual(pastClassDates(course, at(2026, 10, 16, 9)), ['2026-10-12']);
});

/* ---------------- where a schedule can start and end ---------------- */

test('a generated schedule never reaches back before the note was made (class_days, created today)', () => {
  // Created Mon 26 Oct 2026 with class on Monday and Tuesday: the classes of the week before never existed for this note.
  const course = { sessionDates: [], classDays: [1, 2], termStart: null, termEnd: '2026-12-18', created: '2026-10-26' };
  assert.deepEqual(pastClassDates(course, at(2026, 10, 26, 9)), [], 'same morning: nothing from last week');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 26, 19)), [], 'the day the note was made is never asked about, even after 18:00');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 27, 9)), [], 'Monday 26 Oct is the setup day itself');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 27, 18)), ['2026-10-27'], 'the first class after setup counts');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 28, 9)), ['2026-10-27']);
  assert.deepEqual(pastClassDates(course, at(2026, 11, 3, 9)), ['2026-10-27', '2026-11-02'], 'later weeks fill in');
});

test('term_start: a schedule set up before the term starts is silent until the term has started', () => {
  const course = { sessionDates: [], classDays: [2], termStart: '2027-01-12', termEnd: '2027-03-12', created: '2026-12-01' };
  assert.deepEqual(pastClassDates(course, at(2026, 12, 9, 9)), [], 'a December Tuesday is before the term');
  assert.deepEqual(pastClassDates(course, at(2027, 1, 5, 9)), [], 'the week before the term');
  assert.deepEqual(pastClassDates(course, at(2027, 1, 12, 9)), [], 'first class is today, not over yet');
  assert.deepEqual(pastClassDates(course, at(2027, 1, 13, 9)), ['2027-01-12'], 'term_start itself is a class day');
  assert.deepEqual(pastClassDates(course, at(2027, 1, 27, 9)), ['2027-01-19', '2027-01-26']);
  // a term that started before the note was made: the note date still wins as the lower bound
  const late = { sessionDates: [], classDays: [2], termStart: '2026-09-01', termEnd: '2026-12-18', created: '2026-10-20' };
  assert.deepEqual(pastClassDates(late, at(2026, 10, 21, 9)), [], 'Tue 20 Oct is the day the note was made');
  assert.deepEqual(pastClassDates(late, at(2026, 10, 28, 9)), ['2026-10-27']);
});

test('without term_end a generated schedule ends 16 weeks after term_start, or after the note was made', () => {
  assert.equal(GENERATE_TERM_DAYS, 112);
  const fromCreated = { sessionDates: [], classDays: [2, 4], termStart: null, termEnd: null, created: '2026-09-01' };
  // 1 Sep + 112 days = 22 Dec 2026 (a Tuesday): the last class that can count
  assert.deepEqual(pastClassDates(fromCreated, at(2026, 12, 23, 9)), ['2026-12-10', '2026-12-15', '2026-12-17', '2026-12-22']);
  assert.deepEqual(pastClassDates(fromCreated, at(2026, 12, 25, 9)), ['2026-12-15', '2026-12-17', '2026-12-22'], 'Thu 24 Dec is past the end');
  assert.deepEqual(pastClassDates(fromCreated, at(2027, 1, 12, 9)), [], 'January: the term is long over, whatever its status says');
  assert.deepEqual(pastClassDates(fromCreated, at(2027, 3, 9, 9)), []);
  const fromStart = { ...fromCreated, termStart: '2027-01-12', created: '2026-12-01' };
  // 12 Jan + 112 days = 4 May 2027 (a Tuesday)
  assert.deepEqual(pastClassDates(fromStart, at(2027, 5, 5, 9)).slice(-2), ['2027-04-29', '2027-05-04']);
  assert.deepEqual(pastClassDates(fromStart, at(2027, 5, 7, 9)), ['2027-04-27', '2027-04-29', '2027-05-04'], 'Thursday 6 May is past the end');
  assert.deepEqual(pastClassDates(fromStart, at(2027, 6, 1, 9)), []);
});

test('an explicit term_end is used as written, even beyond 16 weeks; a schedule with no anchor at all is not generated', () => {
  const long = { sessionDates: [], classDays: [2], termStart: null, termEnd: '2027-06-30', created: '2026-09-01' };
  assert.equal(pastClassDates(long, at(2027, 3, 10, 9)).length, 2, 'term_end says the course still runs in March');
  const nothing = { sessionDates: [], classDays: [2], termStart: null, termEnd: null, created: null };
  assert.deepEqual(pastClassDates(nothing, at(2026, 10, 16, 9)), [], 'no created, no term_start, no term_end: the reminder would never end');
  assert.deepEqual(pastClassDates({ ...nothing, termEnd: '2026-12-18' }, at(2026, 10, 16, 9)), ['2026-10-06', '2026-10-13'], 'a term_end alone is enough to bound it');
  assert.deepEqual(pastClassDates({ ...nothing, created: 'garbage', termStart: 'soon', termEnd: 'later' }, at(2026, 10, 16, 9)), []);
});

test('session_dates on or before the day the note was made are not asked about; later ones are', () => {
  // Set up Thursday 8 Oct with a syllabus that lists 6, 7, 8, 13 and 15 Oct.
  const course = { sessionDates: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-13', '2026-10-15'], classDays: [], termStart: null, termEnd: null, created: '2026-10-08' };
  assert.deepEqual(pastClassDates(course, at(2026, 10, 9, 9)), [], 'the classes before setup were handed over with the slides');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 8, 19)), [], 'the setup day itself');
  assert.deepEqual(pastClassDates(course, at(2026, 10, 14, 9)), ['2026-10-13']);
  assert.deepEqual(pastClassDates(course, at(2026, 10, 16, 9)), ['2026-10-13', '2026-10-15']);
  // no created date (a hand-made note): the syllabus's dates all count, as before
  assert.deepEqual(pastClassDates({ ...course, created: null }, at(2026, 10, 9, 9)), ['2026-10-06', '2026-10-07', '2026-10-08']);
  assert.deepEqual(pastClassDates({ ...course, created: 'last week' }, at(2026, 10, 9, 9)), ['2026-10-06', '2026-10-07', '2026-10-08']);
});

test('scheduleBounds', () => {
  assert.deepEqual(scheduleBounds({ created: '2026-10-08', termStart: null, termEnd: null }), { sessions: { first: '2026-10-09', last: null }, generated: { first: '2026-10-09', last: '2027-01-28' } });
  assert.deepEqual(scheduleBounds({ created: '2026-10-08', termStart: '2026-10-19', termEnd: '2026-12-18' }), { sessions: { first: '2026-10-09', last: null }, generated: { first: '2026-10-19', last: '2026-12-18' } });
  assert.deepEqual(scheduleBounds({ created: '2026-10-08', termStart: '2026-09-01', termEnd: null }), { sessions: { first: '2026-10-09', last: null }, generated: { first: '2026-10-09', last: '2026-12-22' } }, 'the end counts from term_start');
  assert.deepEqual(scheduleBounds({ created: null, termStart: null, termEnd: null }), { sessions: { first: null, last: null }, generated: { first: null, last: null } });
  assert.deepEqual(scheduleBounds({ created: '2026-12-31', termStart: null, termEnd: '2027-02-01' }).generated, { first: '2027-01-01', last: '2027-02-01' }, 'across a year end');
  assert.deepEqual(scheduleBounds(null), { sessions: { first: null, last: null }, generated: { first: null, last: null } });
  assert.deepEqual(scheduleBounds({}), { sessions: { first: null, last: null }, generated: { first: null, last: null } });
});

/* ---------------- reading course notes ---------------- */

test('readCourse reads the schedule from front matter in every list style', () => {
  const root = makeRoot();
  const inline = addCourse(root, 'a', 'session_dates: ["2026-10-13", "2026-10-15"]\nclass_days: []\nterm_end: ""', { title: 'Corporate Finance' });
  assert.deepEqual(readCourse(inline, 'a'), { slug: 'a', title: 'Corporate Finance', sessionDates: ['2026-10-13', '2026-10-15'], classDays: [], termStart: null, termEnd: null, created: '2026-09-01' });
  const block = addCourse(root, 'b', 'session_dates:\n  - 2026-10-15\n  - "2026-10-13"\nclass_days:\n  - tue');
  assert.deepEqual(readCourse(block, 'b').sessionDates, ['2026-10-13', '2026-10-15']);
  assert.deepEqual(readCourse(block, 'b').classDays, [2]);
  const days = addCourse(root, 'c', 'class_days: ["tue","thu"]\nterm_end: "2026-12-18"');
  assert.deepEqual(readCourse(days, 'c'), { slug: 'c', title: 'c', sessionDates: [], classDays: [2, 4], termStart: null, termEnd: '2026-12-18', created: '2026-09-01' });
  const bare = addCourse(root, 'd', 'class_days: [Mon, Wed]\nterm_end: 2026-12-18');
  assert.deepEqual(readCourse(bare, 'd').classDays, [1, 3]);
  assert.equal(readCourse(bare, 'd').termEnd, '2026-12-18');
});

test('readCourse reads term_start and created, and drops values that are not real dates', () => {
  const root = makeRoot();
  const ok = addCourse(root, 'ok', 'class_days: ["tue"]\nterm_start: "2026-10-12"\nterm_end: "2026-12-18"', { created: '2026-10-08' });
  assert.deepEqual(readCourse(ok, 'ok'), { slug: 'ok', title: 'ok', sessionDates: [], classDays: [2], termStart: '2026-10-12', termEnd: '2026-12-18', created: '2026-10-08' });
  const bad = addCourse(root, 'bad', 'class_days: ["tue"]\nterm_start: "next month"\nterm_end: 7', { created: '08/10/2026' });
  assert.deepEqual(readCourse(bad, 'bad'), { slug: 'bad', title: 'bad', sessionDates: [], classDays: [2], termStart: null, termEnd: null, created: null });
  const none = addCourse(root, 'none', 'class_days: ["tue"]', { created: null });
  assert.equal(readCourse(none, 'none').created, null);
  const empty = addCourse(root, 'empty-start', 'class_days: ["tue"]\nterm_start:\nclass_days_asked: "2026-10-08"');
  assert.equal(readCourse(empty, 'empty-start').termStart, null, 'an empty value is no date');
  const unquoted = addCourse(root, 'unq', 'class_days: ["tue"]\nterm_start: 2026-10-12', { created: '2026-10-08' });
  assert.equal(readCourse(unquoted, 'unq').termStart, '2026-10-12');
});

test('readCourse skips notes without a usable schedule, inactive notes and bad front matter', () => {
  const root = makeRoot();
  assert.equal(readCourse(addCourse(root, 'none', ''), 'none'), null, 'no schedule fields');
  assert.equal(readCourse(addCourse(root, 'empty', 'session_dates: []\nclass_days: []\nterm_end: ""'), 'empty'), null, 'template defaults');
  assert.equal(readCourse(addCourse(root, 'junk', 'session_dates: ["Week 6", "TBC", "2026-02-30"]\nclass_days: ["someday"]'), 'junk'), null, 'nothing usable');
  assert.equal(readCourse(addCourse(root, 'done', 'class_days: ["tue"]', { status: 'completed' }), 'done'), null, 'completed');
  assert.equal(readCourse(addCourse(root, 'nostatus', 'class_days: ["tue"]', { status: null }), 'nostatus'), null, 'no status');
  assert.ok(readCourse(addCourse(root, 'upper', 'class_days: ["tue"]', { status: 'Active' }), 'upper'), 'status is not case sensitive');
  // malformed front matter
  assert.equal(readCourse(put(root, courseFile('open'), '---\nstatus: "active"\nclass_days: ["tue"]\n# never closed\n'), 'open'), null);
  assert.equal(readCourse(put(root, courseFile('nofm'), '# Title\n\nclass_days: ["tue"]\nstatus: "active"\n'), 'nofm'), null);
  assert.equal(readCourse(put(root, courseFile('empty-file'), ''), 'empty-file'), null);
  assert.equal(readCourse(put(root, courseFile('binary'), '\u0000\u0001\u0002 not a note'), 'binary'), null);
  assert.equal(readCourse(join(root, 'does', 'not', 'exist.md'), 'x'), null);
  // odd lines inside valid front matter are ignored, the rest still reads
  const odd = put(root, courseFile('odd'), '---\nstatus: "active"\n: : :\nclass_days: ["tue"\nsession_dates: ["2026-10-13"]\n!!! garbage\n---\n# Odd\n');
  assert.deepEqual(readCourse(odd, 'odd').sessionDates, ['2026-10-13']);
});

test('readCourse: CRLF files, BOM, a title that is missing, a template placeholder and a very long note', () => {
  const root = makeRoot();
  const crlf = addCourse(root, 'crlf', 'class_days: ["tue"]', { title: 'Strategy', eol: '\r\n' });
  assert.deepEqual(readCourse(crlf, 'crlf'), { slug: 'crlf', title: 'Strategy', sessionDates: [], classDays: [2], termStart: null, termEnd: null, created: '2026-09-01' });
  const bom = put(root, courseFile('bom'), '﻿---\nstatus: "active"\nclass_days: ["thu"]\n---\n# Marketing\n');
  assert.deepEqual(readCourse(bom, 'bom').classDays, [4]);
  assert.equal(readCourse(bom, 'bom').title, 'Marketing');
  const noTitle = put(root, courseFile('data-analytics'), '---\nstatus: "active"\nclass_days: ["thu"]\n---\n\nNo heading here.\n');
  assert.equal(readCourse(noTitle, 'data-analytics').title, 'data analytics');
  const placeholder = put(root, courseFile('pl'), '---\nstatus: "active"\nclass_days: ["thu"]\n---\n# {{title}}\n');
  assert.equal(readCourse(placeholder, 'pl').title, 'pl');
  const big = put(root, courseFile('big'), `---\nstatus: "active"\nclass_days: ["thu"]\n---\n# Big course\n\n${'filler line\n'.repeat(50_000)}`);
  assert.equal(readCourse(big, 'big').title, 'Big course');
});

test('titles are cleaned for the digest: one line, no control characters, at most 60 characters', () => {
  const root = makeRoot();
  const long = addCourse(root, 'long', 'class_days: ["tue"]', { title: `Advanced\tCorporate  Finance ${'x'.repeat(100)}` });
  const t = readCourse(long, 'long').title;
  assert.ok(t.length <= 60, t);
  assert.ok(t.startsWith('Advanced Corporate Finance xxx'), t);
  assert.ok(!/[\t\n\r]/.test(t));
});

test('non-ASCII course names and folders', () => {
  const root = makeRoot();
  addCourse(root, 'économie-internationale', 'class_days: ["tue"]', { title: 'Économie Internationale' });
  addCourse(root, 'финансы', 'class_days: ["thu"]', { title: 'Финансы и учёт' });
  addCourse(root, '会計学', 'session_dates: ["2026-10-13"]', { title: '会計学入門' });
  const list = listCourses(root);
  assert.deepEqual(list.map((c) => c.title).sort(), ['Économie Internationale', 'Финансы и учёт', '会計学入門'].sort());
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.equal(plan.lines.length, 3);
  assert.ok(plan.lines.some((l) => l.includes("New material? Économie Internationale had class on Tue 13 Oct. Say 'add to Économie Internationale' and give me")));
  assert.ok(plan.commit());
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'));
  assert.deepEqual(Object.keys(state.courses).sort(), ['économie-internationale', 'финансы', '会計学'].sort());
  assert.deepEqual(nudge(root, at(2026, 10, 14, 10)).lines, [], 'remembered by folder name, non-ASCII or not');
});

test('listCourses: only active notes with a schedule, in folder order; stray files and folders are ignored', () => {
  const root = makeRoot();
  addCourse(root, 'b-strategy', 'class_days: ["tue"]', { title: 'Strategy' });
  addCourse(root, 'a-accounting', 'class_days: ["wed"]', { title: 'Accounting' });
  addCourse(root, 'c-old', 'class_days: ["wed"]', { title: 'Old', status: 'completed' });
  addCourse(root, 'd-nodates', '', { title: 'No dates' });
  put(root, 'vault/20_areas/courses/stray.md', '---\nstatus: "active"\nclass_days: ["mon"]\n---\n# Stray\n');
  mkdirSync(join(root, 'vault', '20_areas', 'courses', 'e-no-note'), { recursive: true });
  mkdirSync(join(root, 'vault', '20_areas', 'courses', 'f-dir', 'course.md'), { recursive: true }); // a folder named course.md
  assert.deepEqual(listCourses(root).map((c) => c.title), ['Accounting', 'Strategy']);
  assert.deepEqual(listCourses(join(root, 'nothing-here')), []);
});

test('the course template carries the class-date fields, empty', () => {
  const { data } = splitFrontmatter(readFileSync(join(REPO, 'system', 'templates', 'notes', 'course.md'), 'utf8'));
  assert.deepEqual(data.session_dates, []);
  assert.deepEqual(data.class_days, []);
  assert.equal(data.term_start, '');
  assert.equal(data.term_end, '');
  assert.equal(data.class_days_asked, '');
  assert.equal(data.status, 'active');
  const filled = join(makeRoot(), 'course.md');
  writeFileSync(filled, readFileSync(join(REPO, 'system', 'templates', 'notes', 'course.md'), 'utf8').replace('{{title}}', 'Template Course').replace('{{date}}', '2026-10-08'));
  assert.equal(readCourse(filled, 'template-course'), null, 'empty defaults mean no reminder');
});

/* ---------------- the nudge ---------------- */

test('a class yesterday gives one line in the agreed words; nothing is written until commit()', () => {
  const root = makeRoot();
  addCourse(root, 'corporate-finance', 'session_dates: ["2026-10-13"]', { title: 'Corporate Finance' });
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.equal(plan.lines.length, 1);
  assert.match(plan.lines[0], /^New material\? Corporate Finance had class on Tue 13 Oct\. Say 'add to Corporate Finance' and give me the slides or your notes\./);
  assert.match(plan.lines[0], /once, after the user's request/);
  assert.ok(!existsSync(stateFile(root)), 'planning writes nothing');
  assert.equal(plan.commit(), true);
  assert.equal(plan.commit(), false, 'committing twice does nothing the second time');
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'));
  assert.deepEqual(state, { schema: 1, courses: { 'corporate-finance': { last_class: '2026-10-13', nudged_on: '2026-10-14' } } });
});

test('each class is nudged once: the same day, the next day, and again only for a newer class', () => {
  const root = makeRoot();
  addCourse(root, 'cf', 'class_days: ["tue","thu"]', { title: 'CF' });
  const first = nudge(root, at(2026, 10, 14, 9)); // Wed: Tue 13 is the newest class
  assert.match(first.lines[0], /CF had class on Tue 13 Oct/);
  first.commit();
  assert.deepEqual(nudge(root, at(2026, 10, 14, 15)).lines, []);
  assert.deepEqual(nudge(root, at(2026, 10, 14, 22)).lines, []);
  assert.deepEqual(nudge(root, at(2026, 10, 15, 9)).lines, [], 'Thursday morning: Thursday class is not over yet');
  const evening = nudge(root, at(2026, 10, 15, 18, 0)); // Thursday 18:00: today's class is over
  assert.match(evening.lines[0], /CF had class on Thu 15 Oct/);
  evening.commit();
  assert.deepEqual(nudge(root, at(2026, 10, 15, 23, 0)).lines, []);
  assert.deepEqual(nudge(root, at(2026, 10, 16, 9)).lines, [], 'already said at 18:00 the day before');
  assert.deepEqual(nudge(root, at(2026, 10, 20, 9)).lines, [], 'Tuesday morning: nothing new has finished since Thursday');
  assert.match(nudge(root, at(2026, 10, 20, 18, 0)).lines[0], /CF had class on Tue 20 Oct/, 'a newer class is due after the Tuesday evening');
});

test('two classes since the last nudge give one line for the newest, and the older one is not mentioned later', () => {
  const root = makeRoot();
  addCourse(root, 'cf', 'session_dates: ["2026-10-08", "2026-10-13"]', { title: 'CF' });
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.equal(plan.lines.length, 1);
  assert.match(plan.lines[0], /Tue 13 Oct/);
  plan.commit();
  assert.deepEqual(nudge(root, at(2026, 10, 15, 9)).lines, []);
});

test('today at 18:00 or later: counted once, then not again', () => {
  const root = makeRoot();
  addCourse(root, 'cf', 'session_dates: ["2026-10-14"]', { title: 'CF' });
  assert.deepEqual(nudge(root, at(2026, 10, 14, 17, 59)).lines, []);
  const plan = nudge(root, at(2026, 10, 14, 18, 0));
  assert.match(plan.lines[0], /CF had class on Wed 14 Oct/);
  plan.commit();
  assert.deepEqual(nudge(root, at(2026, 10, 14, 19, 0)).lines, []);
  assert.deepEqual(nudge(root, at(2026, 10, 15, 8, 0)).lines, []);
});

test('at most three lines, most recent class first; more courses than that give one summary line', () => {
  const root = makeRoot();
  addCourse(root, 'a', 'session_dates: ["2026-10-09"]', { title: 'Alpha' });
  addCourse(root, 'b', 'session_dates: ["2026-10-13"]', { title: 'Bravo' });
  addCourse(root, 'c', 'session_dates: ["2026-10-12"]', { title: 'Charlie' });
  const three = nudge(root, at(2026, 10, 14, 9));
  assert.equal(three.lines.length, 3);
  assert.deepEqual(three.lines.map((l) => /New material\? (\w+) had class on (.+?)\./.exec(l).slice(1)), [['Bravo', 'Tue 13 Oct'], ['Charlie', 'Mon 12 Oct'], ['Alpha', 'Fri 9 Oct']]);

  addCourse(root, 'd', 'session_dates: ["2026-10-13"]', { title: 'Delta' });
  const four = nudge(root, at(2026, 10, 14, 9));
  assert.equal(four.lines.length, 1);
  assert.match(four.lines[0], /^New material\? 4 courses had class recently: Bravo, Delta, Charlie, Alpha\. Say 'add to <course>' and give me the slides or your notes\./);
  four.commit();
  assert.deepEqual(nudge(root, at(2026, 10, 14, 10)).lines, [], 'every course named in the summary counts as nudged');
});

test('a long summary names six courses and counts the rest', () => {
  const root = makeRoot();
  for (let i = 1; i <= 9; i++) addCourse(root, `c${i}`, 'session_dates: ["2026-10-13"]', { title: `Course ${i}` });
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.equal(plan.lines.length, 1);
  assert.match(plan.lines[0], /9 courses had class recently: Course 1, Course 2, Course 3, Course 4, Course 5, Course 6 and 3 more\./);
});

test('maxLines is the room the digest has left: fewer lines than courses means the summary line, 0 means nothing', () => {
  const root = makeRoot();
  addCourse(root, 'a', 'session_dates: ["2026-10-13"]', { title: 'Alpha' });
  addCourse(root, 'b', 'session_dates: ["2026-10-12"]', { title: 'Bravo' });
  addCourse(root, 'c', 'session_dates: ["2026-10-09"]', { title: 'Charlie' });
  const now = at(2026, 10, 14, 9);
  assert.equal(nudge(root, now, 3).lines.length, 3);
  assert.equal(nudge(root, now, 9).lines.length, 3, 'never more than three');
  const two = nudge(root, now, 2);
  assert.equal(two.lines.length, 1);
  assert.match(two.lines[0], /3 courses had class recently/);
  assert.equal(nudge(root, now, 1).lines.length, 1);
  for (const none of [0, -1, NaN, 0.5, 'x']) {
    const plan = nudge(root, now, none);
    assert.deepEqual(plan.lines, [], String(none));
    assert.equal(plan.commit(), false);
  }
  assert.ok(!existsSync(stateFile(root)));
});

test('a course nudged earlier does not hold back the others', () => {
  const root = makeRoot();
  addCourse(root, 'a', 'session_dates: ["2026-10-13"]', { title: 'Alpha' });
  nudge(root, at(2026, 10, 14, 9)).commit();
  addCourse(root, 'b', 'session_dates: ["2026-10-13"]', { title: 'Bravo' });
  const plan = nudge(root, at(2026, 10, 14, 10));
  assert.equal(plan.lines.length, 1);
  assert.match(plan.lines[0], /Bravo/);
  plan.commit();
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'));
  assert.deepEqual(Object.keys(state.courses), ['a', 'b']);
});

test('a completed course, a course without fields and a course whose term has ended are never nudged', () => {
  const root = makeRoot();
  addCourse(root, 'done', 'session_dates: ["2026-10-13"]', { title: 'Done', status: 'completed' });
  addCourse(root, 'plain', '', { title: 'Plain' });
  addCourse(root, 'ended', 'class_days: ["tue"]\nterm_end: "2026-09-18"', { title: 'Ended' });
  addCourse(root, 'future', 'session_dates: ["2026-10-20"]', { title: 'Future' });
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.deepEqual(plan.lines, []);
  assert.equal(plan.commit(), false);
  assert.ok(!existsSync(stateFile(root)), 'nothing nudged, nothing written');
});

test('a course made today with class_days covering yesterday gets no nudge for a class it never had', () => {
  const root = makeRoot();
  // made on Mon 26 Oct 2026, meets Monday and Tuesday, term ends 18 December
  addCourse(root, 'strategy', 'class_days: ["mon","tue"]\nterm_end: "2026-12-18"', { title: 'Strategy', created: '2026-10-26' });
  const morning = nudge(root, at(2026, 10, 26, 9));
  assert.deepEqual(morning.lines, [], 'no "had class on Tue 20 Oct" for a note that did not exist then');
  assert.equal(morning.commit(), false);
  assert.ok(!existsSync(stateFile(root)));
  assert.deepEqual(nudge(root, at(2026, 10, 26, 20)).lines, [], 'the setup day itself');
  assert.match(nudge(root, at(2026, 10, 28, 9)).lines[0], /Strategy had class on Tue 27 Oct/);
});

test('a syllabus handed over after the first classes: those classes are not asked about the next morning', () => {
  const root = makeRoot();
  addCourse(root, 'strategy', 'session_dates: ["2026-10-06", "2026-10-07", "2026-10-13"]', { title: 'Strategy', created: '2026-10-08' });
  assert.deepEqual(nudge(root, at(2026, 10, 9, 9)).lines, []);
  assert.match(nudge(root, at(2026, 10, 14, 9)).lines[0], /Strategy had class on Tue 13 Oct/);
});

test('a course whose term has ended but was never marked completed stops being nudged (no term_end)', () => {
  const root = makeRoot();
  addCourse(root, 'cf', 'class_days: ["tue","thu"]', { title: 'CF', created: '2026-09-01' });
  assert.match(nudge(root, at(2026, 12, 16, 9)).lines[0], /CF had class on Tue 15 Dec/, 'still inside 16 weeks');
  for (const [y, m, d] of [[2027, 1, 12], [2027, 2, 3], [2027, 3, 9], [2027, 6, 1]]) {
    const plan = nudge(root, at(y, m, d, 9));
    assert.deepEqual(plan.lines, [], `${y}-${m}-${d}`);
    assert.equal(plan.commit(), false);
  }
  assert.ok(!existsSync(stateFile(root)));
});

test('a schedule with neither created, term_start nor term_end is not generated', () => {
  const root = makeRoot();
  addCourse(root, 'x', 'class_days: ["tue"]', { title: 'X', created: null });
  assert.deepEqual(nudge(root, at(2026, 10, 14, 9)).lines, []);
  addCourse(root, 'y', 'class_days: ["tue"]\nterm_end: "2026-12-18"', { title: 'Y', created: null });
  assert.match(nudge(root, at(2026, 10, 14, 9)).lines[0], /Y had class on Tue 13 Oct/, 'a term_end is enough');
});

test('missing, corrupt or odd state means nothing was nudged, but never reaches past 14 days', () => {
  const root = makeRoot();
  addCourse(root, 'cf', 'session_dates: ["2026-09-20", "2026-10-13"]', { title: 'CF' });
  const now = at(2026, 10, 14, 9);
  const expectLine = (why) => {
    const plan = nudge(root, now);
    assert.equal(plan.lines.length, 1, why);
    assert.match(plan.lines[0], /CF had class on Tue 13 Oct/, why);
    assert.ok(!/20 Sep/.test(plan.lines[0]), `${why}: 20 Sep is older than 14 days`);
  };
  expectLine('no state file');
  for (const [why, content] of [
    ['empty file', ''],
    ['broken json', '{ nope'],
    ['binary', '\u0000\u0001\u0002'],
    ['a list', '[]'],
    ['null', 'null'],
    ['courses is a list', '{"schema":1,"courses":[]}'],
    ['courses is a string', '{"schema":1,"courses":"x"}'],
    ['entry is a string', '{"schema":1,"courses":{"cf":"2026-10-13"}}'],
    ['bad date', '{"schema":1,"courses":{"cf":{"last_class":"yesterday"}}}'],
    ['impossible date', '{"schema":1,"courses":{"cf":{"last_class":"2026-02-30"}}}'],
    ['date as a number', '{"schema":1,"courses":{"cf":{"last_class":20261013}}}'],
    ['a date in the future', '{"schema":1,"courses":{"cf":{"last_class":"2099-01-01"}}}'],
  ]) {
    put(root, 'state/local/course-nudges.json', content);
    expectLine(why);
  }
  // after a bad file, a commit repairs it
  put(root, 'state/local/course-nudges.json', '{ nope');
  nudge(root, now).commit();
  assert.deepEqual(readState(root, now).get('cf'), { last_class: '2026-10-13', nudged_on: '2026-10-14' });
  assert.deepEqual(nudge(root, now).lines, []);
});

test('the state file is a plain object, keys sorted, and old entries are dropped on the next write', () => {
  const root = makeRoot();
  addCourse(root, 'zeta', 'session_dates: ["2026-10-13"]', { title: 'Zeta' });
  addCourse(root, 'alpha', 'session_dates: ["2026-10-13"]', { title: 'Alpha' });
  put(root, 'state/local/course-nudges.json', JSON.stringify({ schema: 1, courses: { removed: { last_class: '2026-05-05', nudged_on: '2026-05-06' }, recent: { last_class: '2026-10-05', nudged_on: '2026-10-06' }, bad: 'x' } }));
  nudge(root, at(2026, 10, 14, 9)).commit();
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'));
  assert.equal(state.schema, 1);
  assert.deepEqual(Object.keys(state.courses), ['alpha', 'recent', 'zeta'], 'sorted; the old and the odd entries are gone');
  assert.deepEqual(state.courses.recent, { last_class: '2026-10-05', nudged_on: '2026-10-06' });
  assert.ok(readFileSync(stateFile(root), 'utf8').endsWith('\n'));
  assert.ok(!readFileSync(stateFile(root), 'utf8').includes('\r'), 'LF line endings');
});

test('a note edited after a nudge: a new, later class date is still nudged', () => {
  const root = makeRoot();
  const file = addCourse(root, 'cf', 'session_dates: ["2026-10-06"]', { title: 'CF' });
  nudge(root, at(2026, 10, 7, 9)).commit();
  writeFileSync(file, readFileSync(file, 'utf8').replace('["2026-10-06"]', '["2026-10-06", "2026-10-13"]'), 'utf8');
  assert.match(nudge(root, at(2026, 10, 14, 9)).lines[0], /Tue 13 Oct/);
});

test('Windows-style locations: a project folder with spaces and non-ASCII letters', () => {
  const root = makeRoot('my project é ');
  addCourse(root, 'cf', 'session_dates: ["2026-10-13"]', { title: 'CF' });
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.equal(plan.lines.length, 1);
  assert.ok(plan.commit());
  assert.ok(stateFile(root).includes('state'));
  assert.ok(existsSync(join(root, 'state', 'local', 'course-nudges.json')));
  assert.deepEqual(nudge(root, at(2026, 10, 14, 10)).lines, []);
  if (process.platform === 'win32') {
    // the same folder reached with forward slashes and with different drive-letter case
    const alt = root.replace(/\\/g, '/');
    assert.deepEqual(nudge(alt, at(2026, 10, 14, 11)).lines, [], 'the same state file is found');
  }
});

test('any folder name works as a key, even one that looks like a JavaScript internal', () => {
  const root = makeRoot();
  addCourse(root, '__proto__', 'session_dates: ["2026-10-13"]', { title: 'Proto' });
  addCourse(root, 'constructor', 'session_dates: ["2026-10-13"]', { title: 'Constructor' });
  nudge(root, at(2026, 10, 14, 9)).commit();
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'));
  assert.deepEqual(Object.keys(state.courses).sort(), ['__proto__', 'constructor']);
  assert.deepEqual(nudge(root, at(2026, 10, 14, 10)).lines, []);
});

test('titles with regex or replacement characters stay as written', () => {
  const root = makeRoot();
  addCourse(root, 'x', 'session_dates: ["2026-10-13"]', { title: "Finance $& $1 $` Dad's \"course\"" });
  const line = nudge(root, at(2026, 10, 14, 9)).lines[0];
  assert.ok(line.startsWith("New material? Finance $& $1 $` Dad's \"course\" had class on Tue 13 Oct. Say 'add to Finance $& $1 $` Dad's \"course\"' and give me"), line);
});

test('fails open: odd roots and unreadable pieces give no lines and no crash', () => {
  const root = makeRoot();
  assert.deepEqual(planNudges({ root: join(root, 'missing') }).lines, []);
  const file = put(root, 'a-file.txt', 'x');
  assert.deepEqual(planNudges({ root: file }).lines, []);
  addCourse(root, 'cf', 'session_dates: ["2026-10-13"]', { title: 'CF' });
  assert.deepEqual(planNudges({ root, now: new Date('invalid') }).lines, []);
  assert.deepEqual(planNudges({ root, now: null }).lines, []);
  assert.ok(Array.isArray(planNudges({ root: null }).lines));
  // a state path that is a folder cannot be written: commit reports false and does not throw
  mkdirSync(stateFile(root), { recursive: true });
  const plan = nudge(root, at(2026, 10, 14, 9));
  assert.equal(plan.lines.length, 1, 'a state path that cannot be read counts as nothing nudged');
  assert.equal(plan.commit(), false);
});

test('cheap: 60 courses are read in well under a second', () => {
  const root = makeRoot();
  for (let i = 0; i < 70; i++) addCourse(root, `course-${String(i).padStart(2, '0')}`, 'class_days: ["tue","thu"]', { title: `Course ${i}` });
  const t0 = Date.now();
  const plan = nudge(root, at(2026, 10, 14, 9));
  const ms = Date.now() - t0;
  assert.equal(plan.lines.length, 1, 'many courses: one summary line');
  assert.match(plan.lines[0], /60 courses had class recently/, 'at most 60 course folders are read');
  assert.ok(ms < 1500, `took ${ms} ms`);
});
