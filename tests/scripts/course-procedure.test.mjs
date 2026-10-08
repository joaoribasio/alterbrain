// The course procedure (.claude/skills/course/references/course-setup.md) and the files that repeat its rules.
// These are text checks on the wording that decides what Alterbrain does, plus one check against the real code
// (system/lib/courses.mjs) for the date form the procedure demands. Synthetic data only; temp files under state/local/tmp/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCourse, parseIsoDate } from '../../system/lib/courses.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (rel) => readFileSync(join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const SETUP = '.claude/skills/course/references/course-setup.md';
const setup = text(SETUP);

/** Everything between a line starting with `from` and the next line starting with `to` (or the end). */
function section(src, from, to) {
  const start = src.indexOf(from);
  assert.notEqual(start, -1, `missing: ${from}`);
  const end = to ? src.indexOf(to, start + from.length) : -1;
  return src.slice(start, end === -1 ? undefined : end);
}

/* ---------------- 1. same short name, different course ---------------- */

test('a title, code or slug match is only a candidate: the programme or provider decides', () => {
  const s0 = section(setup, '- **Does the course exist?**', '- **The programme.**');
  assert.doesNotMatch(s0, /A match on title, code or slug means it exists/, 'the old rule made the clash suffix unreachable');
  assert.match(s0, /candidate, not yet the same course/);
  assert.match(s0, /compare the programme or provider/i);
  assert.match(s0, /`programme` link or `provider`/);
  // all three outcomes are written down
  assert.match(s0, /The same programme or provider[^\n]*it exists/);
  assert.match(s0, /A different programme or provider[^\n]*a clash[^\n]*`strategy-coursera`, "Strategy \(Coursera\)"/);
  assert.match(s0, /ask one question[^\n]*Is the existing|Yes, my existing <Title> \(<programme or provider>\)/);
  // the clash suffix is the one place a programme name may enter a slug
  assert.match(setup, /put the programme name in a course slug \(the clash suffix of §0 is the one exception\)/);
});

test('the course skill and the ingest procedure apply the same check', () => {
  const skill = text('.claude/skills/course/SKILL.md');
  assert.match(skill, /A name that matches an existing course note is not yet that course/);
  assert.match(skill, /compares the programme or provider/);
  assert.match(skill, /two notes share the name/);

  const ingest = text('.claude/skills/ingest/references/course-material.md');
  const step1 = section(ingest, '## 1. Which course?', '## 2.');
  assert.match(step1, /A name is a candidate, not proof/);
  assert.match(step1, /`programme` link or the `provider`/);
  assert.match(step1, /Another course with this name/);
  assert.match(step1, /Strategy \(Coursera\)/);
  assert.doesNotMatch(step1, /the name matches your Strategy course/, 'an identical name must not be enough on its own');
  assert.doesNotMatch(ingest, /Course titles are unique:/, 'titles are unique only because course setup makes them so');

  const ingestSkill = text('.claude/skills/ingest/SKILL.md');
  assert.doesNotMatch(ingestSkill, /which is unique:/);
  assert.match(ingestSkill, /A matching name is a candidate, not proof/);
});

/* ---------------- 2. none-stated only claims what was read ---------------- */

test('none-stated for an online course never says the provider was checked unless its terms were read', () => {
  const rule = section(setup, '   - `none-stated`:', '\n\n');
  assert.doesNotMatch(rule, /were checked and none states a rule/);
  assert.match(rule, /does not mean the provider was checked/);

  const quiet = section(setup, '   **No rule found in what I read.**', '\n\n');
  assert.doesNotMatch(quiet, /No AI rule is stated for <course> or by <provider>/);
  assert.match(quiet, /I have not read <provider>'s terms or honour code/);
  assert.match(quiet, /Paste those terms if you want me to check/);
  assert.match(quiet, /Never say that the provider "states no rule" unless its terms were read/);
  // the wording that does name the provider's terms is tied to terms the user gave
  assert.match(quiet, /<provider> terms you gave me/);

  assert.match(setup, /Never say a provider's terms were checked unless they were among the inputs/);
  assert.doesNotMatch(setup, /`none-stated` needs a checked online or provider course/);
});

test('the course template describes none-stated the same way', () => {
  const tpl = text('system/templates/notes/course.md');
  assert.doesNotMatch(tpl, /programme and provider were checked and none states a rule/);
  assert.match(tpl, /it does not mean the provider was checked/);
});

/* ---------------- 3. term dates are ISO or empty ---------------- */

/** A course note on disk with the given front matter lines, read by the real digest code. */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});
function readWith(lines) {
  const base = join(REPO, 'state', 'local', 'tmp');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'course-proc-'));
  made.push(dir);
  const file = join(dir, 'course.md');
  writeFileSync(file, `---\ntype: "course"\ncreated: "2026-10-08"\nstatus: "active"\nclass_days: ["tue", "thu"]\n${lines}\n---\n# Strategy\n`);
  return readCourse(file, 'strategy');
}

test('the digest reads term dates only as YYYY-MM-DD, so the procedure must write nothing else', () => {
  for (const loose of ['12 October 2026', '12 Oct 2026', 'Week 40', '2026-10', '10/12/2026', '2026-13-40']) {
    const c = readWith(`term_start: "${loose}"\nterm_end: "${loose}"`);
    assert.equal(c.termStart, null, `"${loose}" is dropped without a word`);
    assert.equal(c.termEnd, null);
  }
  const ok = readWith('term_start: "2026-10-12"\nterm_end: "2026-12-18"');
  assert.deepEqual([ok.termStart, ok.termEnd], ['2026-10-12', '2026-12-18']);
});

test('the procedure converts or leaves empty, and says so', () => {
  // the programme note's Terms table is written in ISO form, not as the user typed it
  assert.doesNotMatch(setup, /Dates in `## Terms` stay as the user or the document gives them/);
  const write = section(setup, '**Write the note** with what you have.', '**What a course takes');
  assert.match(write, /Dates in `## Terms`[^\n]*written as `YYYY-MM-DD`/);
  assert.match(write, /"Week 40"[^\n]*goes in the Term cell[^\n]*Start and End stay empty/);
  assert.match(write, /If a date is ambiguous[^\n]*ask/);

  // the course note takes only a real ISO date from the row (and from the syllabus)
  assert.match(setup, /only when the cell holds a real `YYYY-MM-DD` date/);
  const step5 = section(setup, '   - Frontmatter: `type: "course"`', '   - **Class dates**');
  const rule = /Write only values that match `(\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$)` and are real dates/.exec(step5);
  assert.ok(rule, 'step 5 gives the pattern the digest accepts');
  const pattern = new RegExp(rule[1].replace(/\\\\/g, '\\'));
  assert.ok(pattern.test('2026-10-12'));
  assert.ok(!pattern.test('12 Oct 2026') && !pattern.test('Week 40'));
  // the pattern alone is not enough ("real dates"): the code also refuses 2026-13-40
  assert.ok(pattern.test('2026-13-40') && !parseIsoDate('2026-13-40'));
  assert.match(step5, /I have no usable start and end dates for <term>, so the after-class reminder cannot follow the term/);
  assert.match(step5, /class dates in `session_dates` need no term dates/);

  const prog = text('system/templates/notes/programme.md');
  assert.match(prog, /Start and End hold YYYY-MM-DD only/);
});

/* ---------------- 4. the course value alone decides ---------------- */

test('edit-voice reads the course note only, like framework and assignment', () => {
  const ev = text('.claude/skills/edit-voice/SKILL.md');
  assert.doesNotMatch(ev, /the rules that apply \(course, programme or provider\)/);
  assert.match(ev, /The course note's value alone decides/);
  assert.match(ev, /`restricted`, `banned` or `unknown`/);
  assert.match(ev, /`allowed-with-disclosure`, offer a one-line disclosure sentence/);
  assert.match(ev, /say nothing for `allowed` or `none-stated`/);
});

test('no skill or agent combines the course, programme and provider rules for the coursework notice', () => {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.md')) files.push(full);
    }
  })(join(REPO, '.claude'));
  assert.ok(files.length > 20, 'the walk found the skills and agents');
  const combined = /rules that apply \(course, programme or provider\)|ai_policy[^\n.]*\(course, programme or provider\)/;
  const hits = files.filter((f) => combined.test(readFileSync(f, 'utf8'))).map((f) => f.slice(REPO.length + 1));
  assert.deepEqual(hits, []);
});
