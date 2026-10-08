import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { makeProject, runScript, copyFixture, write } from '../fixtures/scripts/helpers.mjs';
import { addDays, computeDue, isRealDate } from '../../system/scripts/people.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const TODAY = '2026-10-08';
const names = (res) => res.due.map((d) => d.name);

function project({ withBad = false } = {}) {
  const p = makeProject();
  copyFixture('people', p);
  if (!withBad) rmSync(p.path('vault', '60_people', 'Finley Bad.md'));
  return p;
}

test('due: a follow-up date inside the window and an elapsed cadence are listed; dnc and future dates are not', () => {
  const p = project();
  try {
    const r = runScript('people.mjs', ['due', '--today', TODAY, '--json'], p);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = r.json();
    assert.deepEqual(names(out).sort(), ['Alex Doe', 'Blake Roe', 'Gray Lee']);
    const alex = out.due.find((d) => d.name === 'Alex Doe');
    assert.deepEqual(alex.reasons, ['follow-up']);
    assert.equal(alex.days_from_today, 2);
    const blake = out.due.find((d) => d.name === 'Blake Roe');
    assert.equal(blake.due_date, '2026-09-30', 'last contact 2026-07-01 plus 91 days');
    assert.equal(blake.days_from_today, -8);
    const gray = out.due.find((d) => d.name === 'Gray Lee');
    assert.equal(gray.reasons.length, 2, 'both a follow-up date and an elapsed cadence');
    assert.equal(gray.due_date, '2026-10-01');
    assert.ok(!names(out).includes('Casey Poe'), 'next contact is after the window');
    assert.ok(!names(out).includes('Drew Moe'), 'dnc is never listed');
    assert.deepEqual(names(out), ['Blake Roe', 'Gray Lee', 'Alex Doe'], 'earliest first');
  } finally {
    p.cleanup();
  }
});

test('due: the window widens with --within', () => {
  const p = project();
  try {
    const wide = runScript('people.mjs', ['due', '--within', '30', '--today', TODAY, '--json'], p).json();
    assert.ok(names(wide).includes('Casey Poe'));
    const narrow = runScript('people.mjs', ['due', '--within', '0', '--today', TODAY, '--json'], p).json();
    assert.deepEqual(names(narrow).sort(), ['Blake Roe', 'Gray Lee']);
  } finally {
    p.cleanup();
  }
});

test('fallback: a note without the CRM keys gives no reminder and is not reported', () => {
  const p = project();
  try {
    const out = runScript('people.mjs', ['due', '--today', TODAY, '--json'], p).json();
    assert.ok(!names(out).includes('Emery Old'));
    assert.ok(!out.no_contact_recorded.some((n) => n.name === 'Emery Old'));
    assert.equal(out.problems.length, 0);
    const list = runScript('people.mjs', ['list', '--json'], p).json();
    const emery = list.people.find((x) => x.name === 'Emery Old');
    assert.equal(emery.cadence, 'none');
    assert.equal(emery.next_follow_up, '');
  } finally {
    p.cleanup();
  }
});

test('malformed dates are ignored and reported (exit 1); a cadence with no contact is listed apart', () => {
  const p = project({ withBad: true });
  try {
    const r = runScript('people.mjs', ['due', '--today', TODAY, '--json'], p);
    assert.equal(r.status, 1);
    const out = r.json();
    assert.ok(!names(out).includes('Finley Bad'));
    assert.equal(out.problems.length, 1);
    assert.match(out.problems[0].problem, /next week/);
    assert.deepEqual(out.no_contact_recorded.map((n) => n.name), ['Finley Bad']);
    const text = runScript('people.mjs', ['due', '--today', TODAY], p);
    assert.match(text.stdout, /Things to check/);
    assert.match(text.stdout, /Keep-in-touch set but no contact recorded/);
  } finally {
    p.cleanup();
  }
});

test('list: filters by tag and shows the dnc flag', () => {
  const p = project();
  try {
    const all = runScript('people.mjs', ['list', '--json'], p).json();
    assert.equal(all.count, 6, 'the readme is not a person');
    assert.equal(all.people.find((x) => x.name === 'Drew Moe').dnc, true);
    const tagged = runScript('people.mjs', ['list', '--tag', 'Alumni', '--json'], p).json();
    assert.deepEqual(tagged.people.map((x) => x.name).sort(), ['Alex Doe', 'Gray Lee']);
    assert.match(runScript('people.mjs', ['list', '--tag', 'nobody'], p).stdout, /Nobody is tagged/);
  } finally {
    p.cleanup();
  }
});

test('an empty or missing people folder is fine', () => {
  const p = makeProject();
  try {
    const r = runScript('people.mjs', ['due', '--json'], p);
    assert.equal(r.status, 0);
    assert.deepEqual(r.json().due, []);
    assert.match(runScript('people.mjs', ['list'], p).stdout, /no contacts yet/);
  } finally {
    p.cleanup();
  }
});

test('a note added later is picked up on the next run', () => {
  const p = project();
  try {
    write(p, 'vault/60_people/Hari Doe.md', '---\ntype: "person"\nnext_follow_up: "2026-10-09"\n---\n# Hari Doe\n');
    runScript('people.mjs', ['due', '--today', TODAY], p);
    runScript('people.mjs', ['list'], p);
    const again = runScript('people.mjs', ['list', '--json'], p).json();
    assert.equal(again.count, 7);
  } finally {
    p.cleanup();
  }
});

test('usage errors exit 2', () => {
  const p = makeProject();
  try {
    for (const args of [[], ['nope'], ['due', '--within', 'x'], ['due', '--tag', 'a'], ['list', '--within', '3'], ['due', '--today', '2026-13-40']]) {
      assert.equal(runScript('people.mjs', args, p).status, 2, args.join(' '));
    }
  } finally {
    p.cleanup();
  }
});

test('date helpers: real dates only, calendar arithmetic across month ends', () => {
  assert.equal(isRealDate('2026-02-29'), false);
  assert.equal(isRealDate('2028-02-29'), true);
  assert.equal(addDays('2026-10-28', 7), '2026-11-04');
  assert.equal(addDays('2026-12-30', 365), '2027-12-30');
  const res = computeDue([{ name: 'X Doe', file: 'x', org: '', role: '', dnc: false, tags: [], last_contact: '2026-10-08', next_follow_up: '', cadence: 'yearly' }], TODAY, 7);
  assert.deepEqual(res.due, []);
});

const note = (extra) => `---\ntype: "person"\nnext_follow_up: "2026-10-09"\n${extra}\n---\n# X\n`;

test('dnc fails closed: quoted, yes, True and CRLF all mean do not contact; odd values are reported', () => {
  const p = makeProject();
  try {
    write(p, 'vault/60_people/Q Doe.md', note('dnc: "true"'));
    write(p, 'vault/60_people/Y Doe.md', note('dnc: yes'));
    write(p, 'vault/60_people/T Doe.md', note('dnc: True').replace(/\n/g, '\r\n'));
    write(p, 'vault/60_people/F Doe.md', note('dnc: false'));
    write(p, 'vault/60_people/Odd Doe.md', note('dnc: maybe'));
    const r = runScript('people.mjs', ['due', '--today', TODAY, '--json'], p);
    const out = r.json();
    assert.deepEqual(names(out), ['F Doe'], 'only the explicit false is listed');
    const list = runScript('people.mjs', ['list', '--json'], p).json();
    for (const n of ['Q Doe', 'Y Doe', 'T Doe', 'Odd Doe']) assert.equal(list.people.find((x) => x.name === n).dnc, true, n);
    assert.equal(r.status, 1);
    assert.equal(out.problems.length, 1);
    assert.match(out.problems[0].problem, /maybe/);
  } finally {
    p.cleanup();
  }
});

test('locked (git-crypt) contact notes are reported and exit 1', () => {
  const p = makeProject();
  try {
    write(p, 'vault/60_people/Locked Doe.md', Buffer.concat([Buffer.from([0, 0x47, 0x49, 0x54, 0x43, 0x52, 0x59, 0x50, 0x54, 0]), Buffer.from('xxxxxxxx')]));
    const r = runScript('people.mjs', ['due', '--today', TODAY], p);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /1 contact note is locked/);
  } finally {
    p.cleanup();
  }
});

test('caps: only the first 2000 notes are read, and only the first 16 KiB of a note', release(), () => {
  const p = makeProject();
  try {
    for (let i = 0; i < 2001; i++) write(p, `vault/60_people/N${String(i).padStart(4, '0')}.md`, '---\ntype: "person"\n---\n');
    const r = runScript('people.mjs', ['list', '--json'], p);
    assert.equal(r.status, 1);
    const out = r.json();
    assert.equal(out.scanned, 2000);
    assert.ok(out.problems.some((x) => /more than 2000/.test(x.problem)));
  } finally {
    p.cleanup();
  }
  const q = makeProject();
  try {
    write(q, 'vault/60_people/Big Doe.md', note('dnc: false') + 'x'.repeat(40_000));
    const out = runScript('people.mjs', ['list', '--json'], q).json();
    assert.equal(out.count, 1, 'a long body does not stop the frontmatter being read');
    write(q, 'vault/60_people/Huge Doe.md', `---\ntype: "person"\nnotes: "${'x'.repeat(20_000)}"\ndnc: true\n---\n`);
    const out2 = runScript('people.mjs', ['list', '--json'], q).json();
    assert.equal(out2.count, 1, 'frontmatter beyond 16 KiB is not read, so the note is skipped');
  } finally {
    q.cleanup();
  }
});
