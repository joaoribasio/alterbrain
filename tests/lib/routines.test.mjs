import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  applyRecord, cleanResult, digestLine, graceMs, intervalMs, nextDue, overdueRoutines, overdueStatus, parseCadence, parseStamp,
  readRoutines, toRoutine, validateRoutine,
} from '../../system/lib/routines.mjs';

const GOOD = {
  type: 'routine', status: 'active', schedule: 'Mondays 08:00', cadence: 'weekly:mon@08:00', host: 'laptop', runs: '/people due',
  may: 'draft only', data: ['vault/60_people'], model: 'sonnet', effort: 'medium', last_run: '', last_result: '', created: '2026-10-01',
};
const mk = (over = {}) => toRoutine('Test', 'x.md', { ...GOOD, ...over });
const at = (s) => parseStamp(s);

test('parseCadence accepts the three forms and rejects the rest', () => {
  assert.deepEqual(parseCadence('daily@07:30'), { kind: 'daily', hour: 7, minute: 30 });
  assert.deepEqual(parseCadence('weekly:fri@16:00'), { kind: 'weekly', dow: 5, hour: 16, minute: 0 });
  assert.deepEqual(parseCadence('monthly:28@00:05'), { kind: 'monthly', dom: 28, hour: 0, minute: 5 });
  for (const bad of ['monthly:29@08:00', 'monthly:0@08:00', 'daily@24:00', 'weekly:monday@08:00', 'hourly', '', null, 'daily@8:00']) {
    assert.equal(parseCadence(bad), null, String(bad));
  }
});

test('nextDue is strictly after the given time, in local time', () => {
  assert.deepEqual(nextDue('daily@08:00', at('2026-10-05 07:00')), at('2026-10-05 08:00'));
  assert.deepEqual(nextDue('daily@08:00', at('2026-10-05 08:00')), at('2026-10-06 08:00'));
  // 2026-10-05 is a Monday
  assert.deepEqual(nextDue('weekly:mon@08:00', at('2026-10-05 09:00')), at('2026-10-12 08:00'));
  assert.deepEqual(nextDue('weekly:wed@08:00', at('2026-10-05 09:00')), at('2026-10-07 08:00'));
  assert.deepEqual(nextDue('monthly:1@08:00', at('2026-10-05 09:00')), at('2026-11-01 08:00'));
  assert.deepEqual(nextDue('monthly:28@08:00', at('2026-12-29 09:00')), at('2027-01-28 08:00'));
  assert.equal(nextDue('nonsense', new Date()), null);
});

test('interval and grace: half an interval, never under two hours', () => {
  assert.equal(intervalMs('daily@08:00'), 86_400_000);
  assert.equal(graceMs('daily@08:00'), 43_200_000);
  assert.equal(graceMs('weekly:mon@08:00'), 3.5 * 86_400_000);
  assert.equal(graceMs('bad'), null);
});

test('parseStamp rejects impossible times', () => {
  assert.ok(parseStamp('2026-10-05 08:01'));
  assert.ok(parseStamp('2026-10-05'));
  for (const bad of ['2026-02-30 08:00', '2026-10-05 25:00', 'soon', '']) assert.equal(parseStamp(bad), null, bad);
});

test('a good note is valid; each bad field is named', () => {
  assert.deepEqual(validateRoutine(GOOD), []);
  assert.ok(validateRoutine({ ...GOOD, may: 'send emails' }).some((p) => /draft only/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, may: '' }).length);
  assert.ok(validateRoutine({ ...GOOD, status: 'running' }).some((p) => /status/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, cadence: 'every monday' }).some((p) => /cadence/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, host: 'phone' }).some((p) => /host/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, model: 'gpt' }).some((p) => /model/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, effort: 'max' }).some((p) => /effort/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, last_run: 'yesterday' }).some((p) => /last_run/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, created: '' }).some((p) => /created/.test(p)));
  assert.ok(validateRoutine({ ...GOOD, data: ['../secrets'] }).length);
  assert.ok(validateRoutine({ ...GOOD, data: ['C:\\Users\\x'] }).length);
  assert.ok(validateRoutine({ ...GOOD, data: 'vault' }).length);
  assert.ok(validateRoutine({ ...GOOD, runs: '' }).length);
});

test('an empty last_run written without quotes is still fine', () => {
  assert.deepEqual(validateRoutine({ ...GOOD, last_run: [], last_result: [] }), []);
});

test('overdue: a run older than interval plus grace', () => {
  // weekly: interval 7 d, grace 3.5 d -> overdue after 10.5 days
  const r = mk({ last_run: '2026-10-05 08:01' });
  assert.equal(overdueStatus(r, at('2026-10-15 20:00')).overdue, false);
  assert.equal(overdueStatus(r, at('2026-10-15 21:00')).overdue, true);
  assert.equal(overdueStatus(r, at('2026-10-15 21:00')).since.getTime(), at('2026-10-05 08:01').getTime());
});

test('overdue: daily routine, grace is half a day', () => {
  const r = mk({ cadence: 'daily@08:00', last_run: '2026-10-05 08:00' });
  assert.equal(overdueStatus(r, at('2026-10-06 19:59')).overdue, false);
  assert.equal(overdueStatus(r, at('2026-10-06 20:01')).overdue, true);
});

test('overdue: a never-run routine is overdue only after its first due time has passed', () => {
  // created Thursday 2026-10-01; first Monday 08:00 is 2026-10-05; grace 3.5 d
  const r = mk({ created: '2026-10-01' });
  assert.equal(overdueStatus(r, at('2026-10-04 12:00')).overdue, false);
  assert.equal(overdueStatus(r, at('2026-10-05 09:00')).overdue, false);
  assert.equal(overdueStatus(r, at('2026-10-08 21:00')).overdue, true);
});

test('overdue: paused, suggested and invalid routines are never overdue', () => {
  const now = at('2027-01-01 12:00');
  assert.equal(overdueStatus(mk({ status: 'paused' }), now).overdue, false);
  assert.equal(overdueStatus(mk({ status: 'suggested' }), now).overdue, false);
  assert.equal(overdueStatus(mk({ may: 'anything' }), now).overdue, false);
  assert.equal(overdueStatus(mk({ status: 'active' }), now).overdue, true);
});

test('overdueRoutines sorts the longest wait first', () => {
  const a = toRoutine('A', 'a', { ...GOOD, last_run: '2026-09-20 08:00' });
  const b = toRoutine('B', 'b', { ...GOOD, last_run: '2026-09-01 08:00' });
  const c = toRoutine('C', 'c', { ...GOOD, last_run: '2026-10-10 08:00' });
  const list = overdueRoutines([a, b, c], at('2026-10-12 12:00'));
  assert.deepEqual(list.map((x) => x.routine.name), ['B', 'A']);
});

test('digest line: none, one, several', () => {
  assert.equal(digestLine([]), null);
  const a = toRoutine('Keep in touch', 'a', { ...GOOD, last_run: '2026-10-05 08:01' });
  const one = digestLine(overdueRoutines([a], at('2026-10-30 12:00')));
  assert.equal(one, "Keep in touch has not run since Monday 2026-10-05. Check the Claude app's Routines page, or say 'check my routines'.");
  const b = toRoutine('B', 'b', { ...GOOD, last_run: '2026-09-01 08:00' });
  assert.equal(digestLine(overdueRoutines([a, b], at('2026-10-30 12:00'))), "2 routines are overdue: say 'check my routines'.");
});

test('cleanResult strips what would break a frontmatter line', () => {
  assert.equal(cleanResult('sent "3" drafts #ab\\x\nnext'), "sent '3' drafts ab/x next");
  assert.equal(cleanResult('x'.repeat(500)).length, 200);
});

test('applyRecord sets last_run and last_result, keeps CRLF and everything else', () => {
  const lf = '---\ntype: "routine"\nmodel: "sonnet"\neffort: "low"\nlast_run: ""\nlast_result: ""\ncreated: "2026-10-01"\n---\n# Body\n\ntext\n';
  const now = new Date(2026, 9, 5, 8, 1);
  const out = applyRecord(lf, 'two drafts', now);
  assert.match(out, /last_run: "2026-10-05 08:01"\n/);
  assert.match(out, /last_result: "two drafts"\n/);
  assert.ok(out.endsWith('# Body\n\ntext\n'));
  const crlf = lf.replace(/\n/g, '\r\n');
  const out2 = applyRecord(crlf, 'ok', now);
  assert.ok(!/[^\r]\n/.test(out2), 'no bare LF in a CRLF note');
  assert.match(out2, /last_run: "2026-10-05 08:01"\r\n/);
  const bare = '---\ntype: "routine"\neffort: "low"\n---\nbody\n';
  assert.match(applyRecord(bare, 'x', now), /last_run: "2026-10-05 08:01"\nlast_result: "x"\n---/);
  assert.equal(applyRecord('no frontmatter', 'x', now), 'no frontmatter');
});

test('readRoutines: no folder means no routines; readme and foreign notes are ignored; broken notes are listed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-routines-'));
  try {
    assert.deepEqual(readRoutines(join(dir, 'missing')), { routines: [], unreadable: [], folder_exists: false, truncated: false });
    const folder = join(dir, '90_routines');
    mkdirSync(folder);
    writeFileSync(join(folder, 'README.md'), '---\ntype: "readme"\n---\n# R\n');
    writeFileSync(join(folder, 'Idea.md'), '---\ntype: "note"\n---\nhello\n');
    writeFileSync(join(folder, 'Good.md'), '---\ntype: "routine"\ncreated: "2026-10-01"\nstatus: "active"\nschedule: "Mondays 08:00"\ncadence: "weekly:mon@08:00"\nhost: "laptop"\nruns: "/people due"\nmay: "draft only"\ndata:\n  - "vault/60_people"\nmodel: "sonnet"\neffort: "medium"\nlast_run: ""\nlast_result: ""\n---\n# Good\n');
    writeFileSync(join(folder, 'Bad.md'), '---\ntype: "routine"\nstatus: "active"\ncadence: "weekly:mon@08:00"\nmay: "send"\n---\n# Bad\n');
    const { routines, folder_exists } = readRoutines(folder);
    assert.equal(folder_exists, true);
    assert.deepEqual(routines.map((r) => [r.name, r.valid]), [['Bad', false], ['Good', true]]);
    assert.deepEqual(routines[1].problems, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readRoutines: notes that cannot be recognised are listed as unreadable with a reason, never dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-routines-'));
  try {
    writeFileSync(join(dir, 'README.md'), 'no frontmatter, but a readme\n');
    writeFileSync(join(dir, 'Idea.md'), '---\ntype: "note"\n---\nhello\n');
    writeFileSync(join(dir, 'NoBlock.md'), '# Just a heading\n\nschedule: weekly\n');
    writeFileSync(join(dir, 'Unclosed.md'), '---\ntype: "routine"\nstatus: "active"\n# never closed\n');
    writeFileSync(join(dir, 'Garbled.md'), '---\nthis is not yaml at all\n---\n# G\n');
    writeFileSync(join(dir, 'NoType.md'), '---\nstatus: "active"\n---\n# T\n');
    const { routines, unreadable } = readRoutines(dir);
    assert.deepEqual(routines, []);
    assert.deepEqual(unreadable.map((u) => u.name), ['Garbled', 'NoBlock', 'NoType', 'Unclosed']);
    const why = Object.fromEntries(unreadable.map((u) => [u.name, u.reason]));
    assert.match(why.NoBlock, /no settings block/);
    assert.match(why.Unclosed, /not closed/);
    assert.match(why.Garbled, /no "key: value" lines/);
    assert.match(why.NoType, /"type" line is missing/);
    // an unreadable note is never overdue and never reaches the digest
    assert.equal(digestLine(overdueRoutines(routines, new Date())), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('never run: a routine set up after its own due time that day is not expected to have run yet', () => {
  // created Thursday 2026-10-08, after 07:30; first real run is Friday 07:30; grace 12 h
  const daily = mk({ cadence: 'daily@07:30', created: '2026-10-08' });
  assert.equal(overdueStatus(daily, at('2026-10-08 20:00')).overdue, false);
  assert.equal(overdueStatus(daily, at('2026-10-09 19:00')).overdue, false);
  assert.equal(overdueStatus(daily, at('2026-10-09 20:00')).overdue, true);
  // weekly:mon@08:00 created Monday 2026-10-05 10:00 (date only): first run Monday 2026-10-12 08:00, grace 3.5 d
  const weekly = mk({ created: '2026-10-05' });
  assert.equal(overdueStatus(weekly, at('2026-10-08 20:00')).overdue, false);
  assert.equal(overdueStatus(weekly, at('2026-10-15 19:00')).overdue, false);
  assert.equal(overdueStatus(weekly, at('2026-10-15 21:00')).overdue, true);
  // monthly:5@08:00 created on the 5th: first run next month
  const monthly = mk({ cadence: 'monthly:5@08:00', created: '2026-10-05' });
  assert.equal(overdueStatus(monthly, at('2026-10-30 12:00')).overdue, false);
  assert.equal(overdueStatus(monthly, at('2026-11-21 12:00')).overdue, true);
  // a full stamp is used as given: created Monday 07:00, before the 08:00 due time
  const stamped = mk({ created: '2026-10-05 07:00' });
  assert.equal(overdueStatus(stamped, at('2026-10-05 07:30')).overdue, false);
  assert.equal(overdueStatus(stamped, at('2026-10-08 21:00')).overdue, true);
});

test('never run is flagged and worded as not yet run, not as a last run', () => {
  const r = mk({ created: '2026-10-01' });
  const st = overdueStatus(r, at('2026-10-30 12:00'));
  assert.equal(st.never_run, true);
  assert.equal(overdueStatus(mk({ last_run: '2026-10-05 08:01' }), at('2026-10-30 12:00')).never_run, false);
  const line = digestLine(overdueRoutines([toRoutine('Brief', 'b', { ...GOOD, created: '2026-10-01' })], at('2026-10-30 12:00')));
  assert.equal(line, "Brief has not run yet (set up Thursday 2026-10-01). Check the Claude app's Routines page, or say 'check my routines'.");
});

for (const [label, tz, nowExpr, expectOverdue] of [
  // 36 elapsed hours (one interval plus grace) after a 07:30 run the evening before the change cross the change itself
  ['spring forward 2026-03-29', 'Europe/Amsterdam', '2026-03-29 20:00', false],
  ['spring forward, just past grace', 'Europe/Amsterdam', '2026-03-29 20:45', true],
  ['fall back 2026-10-25', 'Europe/Amsterdam', '2026-10-25 18:15', false],
  ['fall back, just past grace', 'Europe/Amsterdam', '2026-10-25 18:45', true],
]) {
  test(`overdue across a clock change (${label})`, () => {
    const code = `
      import { toRoutine, overdueStatus, nextDue, parseStamp } from ${JSON.stringify(new URL('../../system/lib/routines.mjs', import.meta.url).href)};
      const r = toRoutine('D', 'd', { type: 'routine', status: 'active', schedule: 'x', cadence: 'daily@07:30', host: 'laptop', runs: 'prompt', may: 'draft only', model: 'sonnet', effort: 'low', created: '2026-01-01', last_run: process.argv[1] });
      const n = nextDue('daily@07:30', parseStamp(process.argv[1]));
      console.log(JSON.stringify({ overdue: overdueStatus(r, parseStamp(process.argv[2])).overdue, hour: n.getHours(), minute: n.getMinutes() }));`;
    const last = label.startsWith('spring') ? '2026-03-28 07:30' : '2026-10-24 07:30';
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', code, last, nowExpr], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    const res = JSON.parse(out.stdout);
    assert.equal(res.hour, 7);
    assert.equal(res.minute, 30);
    assert.equal(res.overdue, expectOverdue);
  });
}
