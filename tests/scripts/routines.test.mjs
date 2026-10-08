import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, readdirSync } from 'node:fs';
import {
  makeProject, runScript, write, cleanup, existsSync, join, REPO_ROOT,
} from '../fixtures/ops/helpers.mjs';
import { splitFrontmatter } from '../../system/lib/frontmatter.mjs';
import { validateRoutine } from '../../system/lib/routines.mjs';
import { instructionOf } from '../../system/scripts/routines.mjs';

const note = (over = {}, body = '# Keep\n\nDo the thing.\n\nRecord the run: `node system/scripts/routines.mjs record "Keep"`\n') => {
  const d = {
    type: 'routine', created: '2026-10-01', status: 'active', schedule: 'Mondays 08:00', cadence: 'weekly:mon@08:00', host: 'laptop',
    runs: '/people due', may: 'draft only', model: 'sonnet', effort: 'medium', last_run: '', last_result: '', ...over,
  };
  const lines = Object.entries(d).map(([k, v]) => `${k}: "${v}"`);
  return `---\n${lines.join('\n')}\ndata:\n  - "vault/60_people"\n---\n${body}`;
};

function project(notes = {}, { withTemplates = false, built = null } = {}) {
  const p = makeProject({ repo: false });
  for (const [name, text] of Object.entries(notes)) write(join(p.root, 'vault', '90_routines', `${name}.md`), text);
  if (withTemplates) cpSync(join(REPO_ROOT, 'system', 'templates', 'routines'), join(p.root, 'system', 'templates', 'routines'), { recursive: true });
  if (built) write(join(p.root, 'state', 'built.json'), JSON.stringify({ schema: 1, items: built }));
  return p;
}
const run = (p, args) => runScript('routines.mjs', args, p.root);
const NOW = ['--now', '2026-10-30 12:00'];

test('list: no folder means no routines, exit 0', () => {
  const p = project();
  try {
    const r = run(p, ['list']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /no routines yet/i);
    assert.deepEqual(JSON.parse(run(p, ['list', '--json']).stdout).routines, []);
  } finally {
    cleanup(p.parent);
  }
});

test('list and overdue: a late routine exits 1 and says since when; a fresh one exits 0', () => {
  const p = project({ Keep: note({ last_run: '2026-10-05 08:01', last_result: 'ok' }) });
  try {
    const late = run(p, ['overdue', ...NOW]);
    assert.equal(late.code, 1);
    assert.match(late.stdout, /Keep has not run since Monday 2026-10-05/);
    const json = JSON.parse(run(p, ['overdue', '--json', ...NOW]).stdout);
    assert.equal(json.overdue[0].name, 'Keep');
    const list = run(p, ['list', ...NOW]);
    assert.equal(list.code, 1);
    assert.match(list.stdout, /\[OVERDUE\]/);
    const fresh = run(p, ['overdue', '--now', '2026-10-07 12:00']);
    assert.equal(fresh.code, 0);
    assert.match(fresh.stdout, /No routine is overdue/);
  } finally {
    cleanup(p.parent);
  }
});

test('an invalid note (may is not "draft only") is reported and exits 1', () => {
  const p = project({ Bad: note({ may: 'send emails' }) });
  try {
    const r = run(p, ['list', '--json']);
    assert.equal(r.code, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.routines[0].valid, false);
    assert.match(out.routines[0].problems.join(' '), /draft only/);
    assert.equal(run(p, ['overdue', ...NOW]).code, 1);
  } finally {
    cleanup(p.parent);
  }
});

test('a note with broken frontmatter is listed as unreadable by list and overdue, and show/record say why', () => {
  const p = project({ Keep: note({ last_run: '2026-10-29 08:00' }), Broken: '---\ntype: "routine"\nstatus: "active"\n# never closed\n', Plain: '# no block at all\n' });
  try {
    const list = run(p, ['list', ...NOW]);
    assert.equal(list.code, 1);
    assert.match(list.stdout, /Broken \[UNREADABLE\]: its settings block at the top of the note is not closed/);
    assert.match(list.stdout, /Plain \[UNREADABLE\]: it has no settings block/);
    const json = JSON.parse(run(p, ['list', '--json', ...NOW]).stdout);
    assert.deepEqual(json.unreadable.map((u) => u.name), ['Broken', 'Plain']);
    assert.equal(json.problems, 2);
    assert.equal(json.routines.length, 1);
    const od = run(p, ['overdue', ...NOW]);
    assert.equal(od.code, 1);
    assert.match(od.stdout, /Broken \[UNREADABLE\]/);
    assert.equal(JSON.parse(run(p, ['overdue', '--json', ...NOW]).stdout).unreadable.length, 2);
    const show = run(p, ['show', 'broken']);
    assert.equal(show.code, 1);
    assert.match(show.stderr, /cannot be read as a routine: its settings block at the top of the note is not closed/);
    const rec = run(p, ['record', 'Plain', '--result', 'x']);
    assert.equal(rec.code, 1);
    assert.match(rec.stderr, /cannot be read as a routine/);
    // only unreadable notes: still not "no routines yet"
    const only = project({ Plain: '# no block\n' });
    try {
      const r = run(only, ['list']);
      assert.equal(r.code, 1);
      assert.doesNotMatch(r.stdout, /no routines yet/i);
    } finally {
      cleanup(only.parent);
    }
  } finally {
    cleanup(p.parent);
  }
});

test('show prints the schedule and the instruction; unknown names exit 1', () => {
  const p = project({ Keep: note() });
  try {
    const r = run(p, ['show', 'keep', ...NOW]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /weekly:mon@08:00/);
    assert.match(r.stdout, /Do the thing/);
    assert.equal(run(p, ['show', 'nope']).code, 1);
  } finally {
    cleanup(p.parent);
  }
});

test('record updates last_run and last_result only, and keeps CRLF', () => {
  const lf = note();
  const crlf = note({}, '# Crlf\n\nbody\n').replace(/\n/g, '\r\n');
  const p = project({ Keep: lf, Windows: crlf });
  try {
    const r = run(p, ['record', 'Keep', '--result', 'drafted 2 messages #ab "quoted"', '--now', '2026-10-05 08:03']);
    assert.equal(r.code, 0, r.stderr);
    const after = readFileSync(join(p.root, 'vault', '90_routines', 'Keep.md'), 'utf8');
    assert.match(after, /last_run: "2026-10-05 08:03"\n/);
    assert.match(after, /last_result: "drafted 2 messages ab 'quoted'"\n/);
    assert.equal(after.replace(/last_run: .*\n/, 'last_run: ""\n').replace(/last_result: .*\n/, 'last_result: ""\n'), lf);
    const data = splitFrontmatter(after).data;
    assert.equal(data.last_run, '2026-10-05 08:03');
    assert.equal(data.last_result, "drafted 2 messages ab 'quoted'");
    assert.deepEqual(validateRoutine(data), []);

    const w = run(p, ['record', 'windows', '--result', 'done', '--now', '2026-10-05 09:00']);
    assert.equal(w.code, 0, w.stderr);
    const crlfAfter = readFileSync(join(p.root, 'vault', '90_routines', 'Windows.md'), 'utf8');
    assert.ok(!/[^\r]\n/.test(crlfAfter), 'line endings kept');
    assert.match(crlfAfter, /last_run: "2026-10-05 09:00"\r\n/);

    // after a run it is no longer overdue
    assert.equal(run(p, ['overdue', '--now', '2026-10-07 12:00']).code, 0);
  } finally {
    cleanup(p.parent);
  }
});

test('record refuses unknown names and path tricks, and needs a result', () => {
  const p = project({ Keep: note() });
  try {
    const unknown = run(p, ['record', 'Nope', '--result', 'x']);
    assert.equal(unknown.code, 1);
    assert.equal(existsSync(join(p.root, 'vault', '90_routines', 'Nope.md')), false);
    assert.equal(run(p, ['record', '../Keep', '--result', 'x']).code, 1);
    assert.equal(run(p, ['record', 'Keep']).code, 2);
    assert.equal(run(p, ['record']).code, 2);
  } finally {
    cleanup(p.parent);
  }
});

test('usage errors exit 2', () => {
  const p = project();
  try {
    assert.equal(run(p, []).code, 2);
    assert.equal(run(p, ['frobnicate']).code, 2);
    assert.equal(run(p, ['list', '--wat']).code, 2);
    assert.equal(run(p, ['show']).code, 2);
    assert.equal(run(p, ['list', '--now', 'tomorrow']).code, 2);
  } finally {
    cleanup(p.parent);
  }
});

test('the shipped suggestions are valid routine notes and none is allowed to send', () => {
  const dir = join(REPO_ROOT, 'system', 'templates', 'routines');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 2 && files.length <= 4, 'the list stays short');
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8').replace(/\{\{date\}\}/g, '2026-10-01').replace(/\{\{title\}\}/g, f.replace('.md', ''));
    const { data, body } = splitFrontmatter(text);
    assert.deepEqual(validateRoutine(data), [], f);
    assert.equal(data.status, 'suggested', f);
    assert.match(body, /routines\.mjs record "/, f);
    assert.ok(body.trim().split('\n').filter((l) => l.trim()).pop().includes('routines.mjs record'), `${f} ends with the record step`);
  }
  const t = readFileSync(join(REPO_ROOT, 'system', 'templates', 'notes', 'routine.md'), 'utf8').replace(/\{\{date\}\}/g, '2026-10-01').replace(/\{\{title\}\}/g, 'X');
  assert.deepEqual(validateRoutine(splitFrontmatter(t).data), []);
});

test('suggest lists what is not created yet; Morning brief only when its add-on is built', () => {
  const p = project({}, { withTemplates: true });
  try {
    let out = JSON.parse(run(p, ['suggest', '--json']).stdout).suggestions.map((s) => s.name);
    assert.ok(out.includes('Contacts due') && out.includes('Weekly review reminder'));
    assert.ok(!out.includes('Morning brief'));
    write(join(p.root, 'state', 'built.json'), JSON.stringify({ schema: 1, items: [{ name: 'my-brief', kind: 'blueprint', blueprint: 'morning-brief' }] }));
    out = JSON.parse(run(p, ['suggest', '--json']).stdout).suggestions.map((s) => s.name);
    assert.ok(out.includes('Morning brief'));
    // once created, a suggestion is no longer offered
    assert.equal(run(p, ['enable', 'Contacts due']).code, 0);
    out = JSON.parse(run(p, ['suggest', '--json']).stdout).suggestions.map((s) => s.name);
    assert.ok(!out.includes('Contacts due'));
  } finally {
    cleanup(p.parent);
  }
});

test('enable: active only when the user asked; otherwise suggested; never overwrites; needs the add-on', () => {
  const p = project({}, { withTemplates: true });
  try {
    const quiet = run(p, ['enable', 'contacts due']);
    assert.equal(quiet.code, 0, quiet.stderr);
    const file = join(p.root, 'vault', '90_routines', 'Contacts due.md');
    let data = splitFrontmatter(readFileSync(file, 'utf8')).data;
    assert.equal(data.status, 'suggested');
    assert.match(data.created, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(validateRoutine(data), []);
    assert.equal(run(p, ['enable', 'Contacts due', '--user-asked']).code, 1, 'no overwrite');
    assert.equal(data.requires, undefined);

    const yes = run(p, ['enable', 'Weekly review reminder', '--user-asked', '--json']);
    assert.equal(yes.code, 0, yes.stderr);
    data = splitFrontmatter(readFileSync(join(p.root, 'vault', '90_routines', 'Weekly review reminder.md'), 'utf8')).data;
    assert.equal(data.status, 'active');
    assert.deepEqual(validateRoutine(data), []);

    const brief = run(p, ['enable', 'Morning brief', '--user-asked']);
    assert.equal(brief.code, 1);
    assert.match(brief.stderr, /not built yet/);
    assert.equal(existsSync(join(p.root, 'vault', '90_routines', 'Morning brief.md')), false);
    assert.equal(run(p, ['enable', 'Nonsense']).code, 1);
    assert.equal(run(p, ['enable']).code, 2);
  } finally {
    cleanup(p.parent);
  }
});

test('overdue words a never-run routine as not run yet, not as a last run', () => {
  const p = project({ Fresh: note({ created: '2026-10-01' }) });
  try {
    const r = run(p, ['overdue', ...NOW]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /Fresh has not run yet \(set up Thursday 2026-10-01\)/);
    assert.doesNotMatch(r.stdout, /not run since/);
    const j = JSON.parse(run(p, ['overdue', '--json', ...NOW]).stdout);
    assert.equal(j.overdue[0].never_run, true);
  } finally {
    cleanup(p.parent);
  }
});

test('show --instruction prints only the section the host runs, ending with the record step', () => {
  const body = '# Keep\n\n## What it does\n\nProse that must not reach the host.\n\n## Instruction for the host\n\nDo the thing.\n\n1. Step.\n2. Record the run: `node system/scripts/routines.mjs record "Keep" --result "x"`\n';
  const p = project({ Keep: note({}, body), Bare: note({}, '# Bare\n\nNo section here.\n') });
  try {
    const r = run(p, ['show', 'keep', '--instruction']);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Prose that must not/);
    assert.doesNotMatch(r.stdout, /^## /m);
    assert.match(r.stdout.trim().split('\n').pop(), /routines\.mjs record "Keep"/);
    const none = run(p, ['show', 'bare', '--instruction']);
    assert.equal(none.code, 1);
    assert.match(none.stderr, /Instruction for the host/);
  } finally {
    cleanup(p.parent);
  }
});

test('every shipped routine template has one instruction section that ends with its record step, and no HTML comment', () => {
  const dirs = [join(REPO_ROOT, 'system', 'templates', 'routines'), join(REPO_ROOT, 'system', 'templates', 'notes')];
  const files = [...readdirSync(dirs[0]).map((f) => join(dirs[0], f)), join(dirs[1], 'routine.md')];
  for (const f of files) {
    const body = splitFrontmatter(readFileSync(f, 'utf8')).body;
    const ins = instructionOf(body);
    assert.ok(ins, f);
    assert.ok(ins.trim().split('\n').pop().includes('routines.mjs record "'), `${f} instruction ends with record`);
    assert.doesNotMatch(body, /<!--/, f);
  }
});

test('Contacts due runs without questions: it calls people.mjs directly and never asks', () => {
  const body = splitFrontmatter(readFileSync(join(REPO_ROOT, 'system', 'templates', 'routines', 'Contacts due.md'), 'utf8')).body;
  assert.match(body, /people\.mjs due --within 7 --json/);
  assert.match(body, /Do not ask any question/);
  assert.doesNotMatch(instructionOf(body), /Run `\/people due`/);
});

test('suggest and enable: an unreadable note with the same name is a clash, not a crash', () => {
  const p = project({ 'Contacts due': 'plain text, no settings block\n' }, { withTemplates: true });
  try {
    const out = JSON.parse(run(p, ['suggest', '--json']).stdout).suggestions.map((s) => s.name);
    assert.ok(!out.includes('Contacts due'));
    const r = run(p, ['enable', 'Contacts due', '--user-asked']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /already in vault\/90_routines but cannot be read as a routine/);
    assert.doesNotMatch(r.stderr, /EEXIST|at .*\.mjs:\d+/);
    assert.equal(readFileSync(join(p.root, 'vault', '90_routines', 'Contacts due.md'), 'utf8'), 'plain text, no settings block\n');
  } finally {
    cleanup(p.parent);
  }
});

test('enable: a note of another type with the same file name is refused in plain words', () => {
  const p = project({ 'Contacts due': '---\ntype: "note"\n---\nMine.\n' }, { withTemplates: true });
  try {
    const r = run(p, ['enable', 'Contacts due', '--user-asked']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /already in vault\/90_routines/);
    assert.doesNotMatch(r.stderr, /EEXIST/);
    assert.match(readFileSync(join(p.root, 'vault', '90_routines', 'Contacts due.md'), 'utf8'), /Mine\./);
  } finally {
    cleanup(p.parent);
  }
});
