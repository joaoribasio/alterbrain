// The session digest and the "New material?" nudge (system/lib/courses.mjs): the lines appear once, not again on the
// next session, and never push anything else out. Each hook run is its own process, as Claude Code starts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, makeProject, runHook } from '../fixtures/hooks/helpers.mjs';
import { composeDigest, nudgeRoom } from '../../system/hooks/session_start.mjs';
import { today } from '../../system/lib/fsx.mjs';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATE = 'state/local/course-nudges.json';

/** A day relative to today, in local time: iso, short weekday code and the words used in the digest ("Tue 13 Oct"). */
function day(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return { iso: today(d), code: WEEKDAYS[d.getDay()].toLowerCase(), words: `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` };
}

/** `created` is relative to today (a note made 30 days ago), so the tests keep their meaning whenever they run. */
function addCourse(p, slug, fields, title = slug, created = day(-30).iso) {
  p.write(`vault/20_areas/courses/${slug}/course.md`, `---\ntype: "course"\ncreated: "${created}"\nstatus: "active"\n${fields}\n---\n# ${title}\n\n## Overview\n\nSynthetic.\n`);
}
const start = (p, source = 'startup', opts) => runHook(p, 'session_start', { hook_event_name: 'SessionStart', source }, opts);
const nudgeLines = (text) => text.split('\n').filter((l) => l.startsWith('New material?'));

test('a class yesterday: the line appears once, the next session does not repeat it', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const yesterday = day(-1);
  addCourse(p, 'corporate-finance', `session_dates: ["${yesterday.iso}"]`, 'Corporate Finance');
  assert.equal(p.exists('state/local'), false, 'no state folder yet');

  const first = start(p);
  assert.equal(first.code, 0, first.stderr);
  const lines = nudgeLines(contextOf(first));
  assert.equal(lines.length, 1, contextOf(first));
  assert.ok(lines[0].startsWith(`New material? Corporate Finance had class on ${yesterday.words}. Say 'add to Corporate Finance' and give me the slides or your notes.`), lines[0]);
  const state = JSON.parse(p.read(STATE));
  assert.deepEqual(state, { schema: 1, courses: { 'corporate-finance': { last_class: yesterday.iso, nudged_on: today() } } });

  for (const source of ['startup', 'resume', 'clear']) {
    assert.deepEqual(nudgeLines(contextOf(start(p, source))), [], `${source}: already said`);
  }
});

test('class_days work the same way, and a finished term gives nothing', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const yesterday = day(-1);
  addCourse(p, 'strategy', `class_days: ["${yesterday.code}"]\nterm_end: "${day(40).iso}"`, 'Strategy');
  addCourse(p, 'ended', `class_days: ["${yesterday.code}"]\nterm_end: "${day(-30).iso}"`, 'Ended Course');
  const lines = nudgeLines(contextOf(start(p)));
  assert.equal(lines.length, 1);
  assert.match(lines[0], new RegExp(`^New material\\? Strategy had class on ${yesterday.words}\\.`));
  assert.deepEqual(nudgeLines(contextOf(start(p))), []);
});

test('a course made today gets no line for classes before today; a course whose term is long over gets none', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const every = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => `"${d}"`).join(', ');
  // made today, meets every day: every class of the last two weeks is from before the note existed
  addCourse(p, 'new-course', `class_days: [${every}]\nterm_end: "${day(60).iso}"`, 'New Course', day(0).iso);
  // made 200 days ago, never marked completed, no term_end: the 16 weeks are over
  addCourse(p, 'old-course', `class_days: [${every}]`, 'Old Course', day(-200).iso);
  const r = start(p);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(nudgeLines(contextOf(r)), []);
  assert.equal(p.exists(STATE), false, 'nothing nudged, nothing written');
});

test('a syllabus handed over after the first classes: those classes are not asked about, the next one is', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  // set up two days ago with a syllabus that lists the classes of the days before it and the one yesterday
  addCourse(p, 'strategy', `session_dates: ["${day(-4).iso}", "${day(-3).iso}", "${day(-2).iso}", "${day(-1).iso}"]`, 'Strategy', day(-2).iso);
  const lines = nudgeLines(contextOf(start(p)));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes(`Strategy had class on ${day(-1).words}.`), lines[0]);
  assert.deepEqual(nudgeLines(contextOf(start(p))), [], 'said once');
});

test('the state file is created on first use and is the only thing written', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-2).iso}"]`, 'CF');
  const before = p.read('vault/20_areas/courses/cf/course.md');
  start(p);
  assert.ok(p.exists(STATE));
  assert.equal(p.read('vault/20_areas/courses/cf/course.md'), before, 'the course note is not touched');
});

test('corrupt state or corrupt notes never break the digest; a bad state file counts as nothing nudged', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-1).iso}"]`, 'CF');
  p.write('vault/20_areas/courses/broken/course.md', '\u0000\u0001 not a note');
  p.write('vault/20_areas/courses/halfway/course.md', '---\nstatus: "active"\nclass_days: ["tue"]\n');
  p.write(STATE, '{ nope');
  const r = start(p);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(nudgeLines(contextOf(r)).length, 1);
  assert.deepEqual(JSON.parse(p.read(STATE)).courses.cf.last_class, day(-1).iso, 'the bad file was replaced');
  assert.deepEqual(nudgeLines(contextOf(start(p))), []);
});

test('a state file that names a date older than 14 days never brings an old class back', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-20).iso}", "${day(-3).iso}"]`, 'CF');
  p.write(STATE, '\u0000\u0000');
  const lines = nudgeLines(contextOf(start(p)));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes(day(-3).words), lines[0]);
  assert.ok(!lines[0].includes(day(-20).words));
});

test('old classes (more than 14 days back) are not mentioned', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-15).iso}"]`, 'CF');
  assert.deepEqual(nudgeLines(contextOf(start(p))), []);
  assert.equal(p.exists(STATE), false, 'nothing nudged, nothing written');
});

test('more than three courses: one summary line; three or fewer: one line each, newest class first', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'a', `session_dates: ["${day(-5).iso}"]`, 'Alpha');
  addCourse(p, 'b', `session_dates: ["${day(-1).iso}"]`, 'Bravo');
  addCourse(p, 'c', `session_dates: ["${day(-3).iso}"]`, 'Charlie');
  const three = nudgeLines(contextOf(start(p)));
  assert.equal(three.length, 3);
  assert.deepEqual(three.map((l) => /^New material\? (\w+)/.exec(l)[1]), ['Bravo', 'Charlie', 'Alpha']);

  const q = makeProject();
  t.after(q.cleanup);
  for (const [slug, offset, title] of [['a', -5, 'Alpha'], ['b', -1, 'Bravo'], ['c', -3, 'Charlie'], ['d', -2, 'Delta']]) addCourse(q, slug, `session_dates: ["${day(offset).iso}"]`, title);
  const summary = nudgeLines(contextOf(start(q)));
  assert.equal(summary.length, 1);
  assert.match(summary[0], /^New material\? 4 courses had class recently: Bravo, Delta, Charlie, Alpha\./);
  assert.deepEqual(nudgeLines(contextOf(start(q))), []);
});

test('the nudge never pushes out a warning and keeps the digest within 25 lines', (t) => {
  const p = makeProject({ devMode: true });
  t.after(p.cleanup);
  const tasks = Array.from({ length: 60 }, (_, i) => `- [ ] Task number ${i} #ab/reply 📅 2020-01-${String((i % 28) + 1).padStart(2, '0')}`);
  p.write('vault/00_inbox/Tasks.md', `---\ntype: "tasks"\nstatus: "active"\n---\n# Tasks\n\n## Inbox\n${tasks.join('\n')}\n\n## Today\n\n## This week\n\n## Waiting on others\n\n## Someday\n\n## Done (archive weekly)\n`);
  for (let i = 0; i < 5; i++) addCourse(p, `c${i}`, `session_dates: ["${day(-1).iso}"]`, `Course ${i}`);
  const full = contextOf(runHook(p, 'session_start', { hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5' }, { env: { CLAUDE_CODE_VERSION: '1.0.0' } }));
  const all = full.split('\n');
  assert.ok(all.length <= 25, `${all.length} lines`);
  assert.equal(nudgeLines(full).length, 1, 'five courses: one summary line');
  assert.ok(all.indexOf('Warnings:') > all.findIndex((l) => l.startsWith('New material?')), 'the nudge comes before the warnings');
  assert.match(full, /Main model is claude-opus-5/);
  assert.match(full, /Claude Code is version 1\.0\.0/);
  assert.match(full, /Developer mode is on/);
  assert.match(full, /Tasks: 60 overdue/);
  assert.match(full, /Onboarding not finished/);
});

test('nudgeRoom: at most three lines, and only what the other lines and the warnings leave of the 25', () => {
  assert.equal(nudgeRoom(9, 4), 3);
  assert.equal(nudgeRoom(20, 2), 3);
  assert.equal(nudgeRoom(20, 3), 2);
  assert.equal(nudgeRoom(21, 3), 1);
  assert.equal(nudgeRoom(22, 3), 0);
  assert.equal(nudgeRoom(24, 5), 0, 'never negative');
  assert.equal(nudgeRoom(30, 0), 0);
  assert.equal(nudgeRoom(2, 0), 3);
});

test('on compact (the conversation is already running) nothing is added or remembered', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-1).iso}"]`, 'CF');
  assert.deepEqual(nudgeLines(contextOf(start(p, 'compact'))), []);
  assert.equal(p.exists(STATE), false);
  assert.equal(nudgeLines(contextOf(start(p, 'startup'))).length, 1, 'the next real start still gets it');
});

test('composeDigest writes nothing until commit(); a digest that fails to build leaves no trace', (t) => {
  const p = makeProject({ devMode: true });
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-1).iso}"]`, 'CF');
  const saved = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = p.root;
  t.after(() => {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  });
  const built = composeDigest({ source: 'startup' });
  assert.equal(nudgeLines(built.text).length, 1);
  assert.equal(p.exists(STATE), false, 'building the text writes nothing');
  assert.equal(p.exists('state/local/course-nudges.json'), false);

  // a build that throws never hands back a commit(), so nothing can be written
  const hostile = {
    source: 'startup',
    get model() {
      throw new Error('boom');
    },
  };
  assert.throws(() => composeDigest(hostile), /boom/);
  assert.equal(p.exists(STATE), false);

  assert.equal(built.commit(), true);
  assert.ok(p.exists(STATE));
  assert.equal(built.commit(), false, 'committing twice writes nothing more');
  assert.equal(nudgeLines(composeDigest({ source: 'startup' }).text).length, 0, 'said once');
});

test('non-ASCII course names reach the digest intact', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  addCourse(p, 'économie-internationale', `session_dates: ["${day(-1).iso}"]`, 'Économie Internationale');
  const lines = nudgeLines(contextOf(start(p)));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^New material\? Économie Internationale had class on /);
  assert.match(lines[0], /Say 'add to Économie Internationale'/);
  assert.deepEqual(nudgeLines(contextOf(start(p))), []);
});

test('a project folder with spaces works', (t) => {
  const p = makeProject({ spaces: true });
  t.after(p.cleanup);
  addCourse(p, 'cf', `session_dates: ["${day(-1).iso}"]`, 'CF');
  assert.equal(nudgeLines(contextOf(start(p))).length, 1);
  assert.deepEqual(nudgeLines(contextOf(start(p))), []);
});

test('a note without the new fields, and a completed course, get no nudge', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('vault/20_areas/courses/old/course.md', '---\ntype: "course"\nstatus: "active"\ncode: "X1"\n---\n# Old Note\n');
  p.write('vault/20_areas/courses/finished/course.md', `---\ntype: "course"\nstatus: "completed"\nsession_dates: ["${day(-1).iso}"]\n---\n# Finished\n`);
  assert.deepEqual(nudgeLines(contextOf(start(p))), []);
  assert.equal(p.exists(STATE), false);
});

test('many courses stay quick', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (let i = 0; i < 40; i++) addCourse(p, `course-${i}`, `class_days: ["${day(-1).code}"]`, `Course ${i}`);
  const r = start(p);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(nudgeLines(contextOf(r)).length, 1);
  assert.ok(r.ms < 3000, `took ${r.ms} ms`);
});
