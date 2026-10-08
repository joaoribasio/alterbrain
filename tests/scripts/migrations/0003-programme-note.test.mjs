import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { cleanup, copyFixture, abs, exists, read, readJsonIn, runMigration, snapshot, changedPaths, write } from '../../fixtures/migrations/helpers.mjs';
import { today } from '../../../system/lib/fsx.mjs';

after(cleanup);
const FILE = '0003-programme-note.mjs';
const EN = '–';
const TITLE = `Full-time MBA ${EN} Example Business School`;
const NOTE = `vault/20_areas/programmes/${TITLE}.md`;
const COURSE = (slug) => `vault/20_areas/courses/${slug}/course.md`;
const LINK = `programme: "[[${TITLE}]]"`;
const lines = (text) => text.split(/\r?\n/);
const programmes = (root) => readdirSync(abs(root, 'vault/20_areas/programmes'));

/** The v0.1.0 brain.json school block, replaced by `school`. */
function withSchool(school, fixture = 'v0.1.0') {
  const root = copyFixture(fixture);
  const brain = readJsonIn(root, 'config/brain.json');
  brain.school = school;
  write(root, 'config/brain.json', JSON.stringify(brain, null, 2) + '\n');
  return root;
}

test('0003: an old install gets a programme note and its courses are linked, and only that', () => {
  const root = copyFixture('v0.1.0');
  // finance is stored with LF in the repository; the person's computer may have CRLF
  write(root, COURSE('finance'), read(root, COURSE('finance')).replace(/\n/g, '\r\n'));
  const strategyBefore = read(root, COURSE('strategy'));
  const financeBefore = read(root, COURSE('finance'));
  const before = snapshot(root);

  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`Created your programme note "${TITLE}"`));
  assert.match(r.stdout, /Linked 2 courses to it\./);
  assert.match(r.stdout, /Left 1 course alone because it names a different school\./);

  // The note: the frozen keys in order, the six headings, LF endings.
  const note = read(root, NOTE);
  assert.equal(note.includes('\r'), false);
  const block = note.split('\n---\n')[0].split('\n').slice(1);
  assert.deepEqual(block.map((l) => l.split(':')[0]), ['type', 'created', 'status', 'provider', 'level', 'start', 'end', 'ai_policy', 'ai_policy_quote', 'grading_scale']);
  assert.deepEqual(block, [
    'type: "programme"', `created: "${today()}"`, 'status: "active"', 'provider: "Example Business School"', 'level: ""', 'start: ""', 'end: ""',
    'ai_policy: "unknown"', 'ai_policy_quote: ""', 'grading_scale: ""',
  ]);
  assert.match(note, new RegExp(`\n# ${TITLE}\n`));
  assert.deepEqual(lines(note).filter((l) => l.startsWith('## ')), ['## Terms', '## AI rule', '## Grading', '## Submission conventions', '## Career services', '## Courses']);
  assert.match(note, /\| Term \| Start \| End \|/);
  assert.match(note, /Courses link here with the programme property\./);

  // The courses: one line added after school, every other byte the same, line endings kept.
  assert.equal(read(root, COURSE('strategy')), strategyBefore.replace('school: "Example Business School"\n', `school: "Example Business School"\n${LINK}\n`));
  assert.equal(read(root, COURSE('finance')), financeBefore.replace('school: ""\r\n', `school: ""\r\n${LINK}\r\n`));
  assert.ok(read(root, COURSE('finance')).includes('\r\n'));

  // Nothing else changed: not ethics (another school), not the folder without a course note, not the settings.
  assert.deepEqual(changedPaths(before, snapshot(root)), [NOTE, COURSE('finance'), COURSE('strategy')].sort());
  assert.deepEqual(readJsonIn(root, 'config/brain.json').school, { name: 'Example Business School', programme: 'Full-time MBA', lms: 'canvas' });
});

test('0003: a second run says "Nothing to do." and changes nothing', () => {
  const root = copyFixture('v0.1.0');
  assert.equal(runMigration(FILE, root).code, 0);
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0003: a note that already exists (other capitals) is used as it is, never rewritten', () => {
  const root = copyFixture('v0.1.0');
  const existing = `vault/20_areas/programmes/full-time mba ${EN} example business school.md`;
  write(root, existing, '---\ntype: "programme"\n---\n# My own text\n');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Created/);
  assert.match(r.stdout, /Linked 2 courses to it\./);
  assert.equal(programmes(root).length, 1);
  assert.equal(read(root, existing), '---\ntype: "programme"\n---\n# My own text\n');
  assert.ok(read(root, COURSE('strategy')).includes(`programme: "[[full-time mba ${EN} example business school]]"`));
});

test('0003: courses that already name a programme or a provider are not touched', () => {
  const root = copyFixture('v0.1.1'); // strategy already has programme "[[Something]]"
  write(root, COURSE('ethics'), read(root, COURSE('ethics')).replace('school: "Other School"', 'school: ""\nprovider: "Coursera"'));
  const strategy = read(root, COURSE('strategy'));
  const ethics = read(root, COURSE('ethics'));
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(root, COURSE('strategy')), strategy);
  assert.equal(read(root, COURSE('ethics')), ethics);
  assert.match(r.stdout, /Linked 1 course to it\./);
  assert.ok(read(root, COURSE('finance')).includes('programme: "[[Example Business School]]"'), 'only the programme name is set, so the note is named after the school');
  assert.deepEqual(programmes(root), ['Example Business School.md']);
});

test('0003: the note is named from whichever of programme and school is set', () => {
  const onlyProgramme = withSchool({ name: '', programme: 'Full-time MBA' });
  const r = runMigration(FILE, onlyProgramme);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(programmes(onlyProgramme), ['Full-time MBA.md']);
  assert.match(read(onlyProgramme, 'vault/20_areas/programmes/Full-time MBA.md'), /^provider: ""$/m);
  // without a school name nothing says another school is different, so every course is linked
  assert.match(r.stdout, /Linked 3 courses to it\./);
  assert.doesNotMatch(r.stdout, /Left/);
  assert.ok(read(onlyProgramme, COURSE('ethics')).includes('programme: "[[Full-time MBA]]"'));

  const odd = withSchool({ name: 'A/B: School?', programme: '' });
  assert.equal(runMigration(FILE, odd).code, 0);
  assert.deepEqual(programmes(odd), ['A B School.md']);
  assert.match(read(odd, 'vault/20_areas/programmes/A B School.md'), /^# A B School$/m);
});

test('0003: school names are compared without caring about capitals or spaces', () => {
  const root = copyFixture('v0.1.0');
  write(root, COURSE('strategy'), read(root, COURSE('strategy')).replace('school: "Example Business School"', 'school: "  example   BUSINESS school "'));
  const r = runMigration(FILE, root);
  assert.match(r.stdout, /Linked 2 courses to it\./);
  assert.ok(read(root, COURSE('strategy')).includes(LINK));
});

test('0003: characters that do not belong in a file name are replaced, and a long name is cut at a word', () => {
  const root = withSchool({ name: `Rotterdam: "School" of #Business [[A]]^x | y *? <z> \\ w.`, programme: '' });
  assert.equal(runMigration(FILE, root).code, 0);
  const [file] = programmes(root);
  assert.equal(file, 'Rotterdam School of Business A x y z w.md');
  // the provider keeps the real name, written safely inside quotes
  assert.match(read(root, `vault/20_areas/programmes/${file}`), /^provider: "Rotterdam: \\"School\\" of #Business \[\[A\]\]\^x \| y \*\? <z> \\\\ w\."$/m);

  const long = withSchool({ name: Array.from({ length: 30 }, (_, i) => `word${i}`).join(' '), programme: '' });
  assert.equal(runMigration(FILE, long).code, 0);
  const [name] = programmes(long);
  assert.ok(name.length <= 103, name);
  assert.match(name, /^word0 word1 .* word\d+\.md$/);
  assert.doesNotMatch(name, /word\d+\.\.md|\s\.md$/);
});

test('0003: a name that cannot be a file name makes no note and says so', () => {
  for (const name of ['???', '...', 'CON']) {
    const root = withSchool({ name, programme: '' });
    const before = snapshot(root);
    const r = runMigration(FILE, root);
    assert.equal(r.code, 0, name);
    assert.equal(r.stdout.trim(), 'Your school name cannot be used as a file name, so no programme note was made.', name);
    assert.deepEqual(snapshot(root), before, name);
  }
});

test('0003: a note without a frontmatter block, or of another type, is left alone; a byte order mark is kept', () => {
  const root = copyFixture('v0.1.0');
  write(root, COURSE('finance'), '# Finance\n\nschool: ""\nNo frontmatter here.\n');
  write(root, COURSE('ethics'), read(root, COURSE('ethics')).replace('type: "course"', 'type: "session"').replace('school: "Other School"', 'school: ""'));
  const finance = read(root, COURSE('finance'));
  const ethics = read(root, COURSE('ethics'));
  write(root, COURSE('strategy'), `﻿${read(root, COURSE('strategy'))}`);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Linked 1 course to it\./);
  assert.equal(read(root, COURSE('finance')), finance);
  assert.equal(read(root, COURSE('ethics')), ethics);
  const strategy = read(root, COURSE('strategy'));
  assert.equal(strategy.charCodeAt(0), 0xfeff);
  assert.ok(strategy.includes(`school: "Example Business School"\n${LINK}\n`));
});

test('0003: 0.2 installs have no school block and nothing happens', () => {
  for (const name of ['v0.2-professional', 'v0.2-online']) {
    const root = copyFixture(name);
    const before = snapshot(root);
    const r = runMigration(FILE, root);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), 'Nothing to do.', name);
    assert.deepEqual(snapshot(root), before, name);
  }
  const empty = withSchool({ name: '  ', programme: '' });
  assert.equal(runMigration(FILE, empty).stdout.trim(), 'Nothing to do.');
  assert.equal(exists(empty, 'vault/20_areas/programmes'), false);
  const odd = withSchool('not a block');
  assert.equal(runMigration(FILE, odd).stdout.trim(), 'Nothing to do.');
});

test('0003: settings that cannot be read stop it and write nothing', () => {
  const root = copyFixture('v0.1.0');
  write(root, 'config/brain.json', '{oops');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^Your settings file config\/brain\.json could not be read, so I changed nothing\./);
  assert.deepEqual(snapshot(root), before);
});

test('0003: --dry-run says what would happen and writes nothing', () => {
  const root = copyFixture('v0.1.0');
  const before = snapshot(root);
  const r = runMigration(FILE, root, ['--dry-run']);
  assert.equal(r.code, 0);
  const out = lines(r.stdout.trim());
  assert.ok(out.length >= 2);
  for (const l of out) assert.match(l, /^Would: /);
  assert.deepEqual(snapshot(root), before);
});
