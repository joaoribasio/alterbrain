// Tests for the onboarding helpers (onboard-seed.mjs, onboard-progress.mjs).
// Run: node --test tests/scripts/onboard-helpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seed, fillPlaceholders } from '../../system/scripts/onboard-seed.mjs';
import {
  emptyState, setStatus, overall, nextModule, resolveModule, load, learnerKind, estimateMinutes, MODULES,
} from '../../system/scripts/onboard-progress.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function put(root, rel, text) {
  const f = join(root, ...rel.split('/'));
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text, 'utf8');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ab-onboard-'));
  put(root, 'system/templates/vault/Home.md', '---\ncreated: "{{date}}"\n---\n# {{title}}\n');
  put(root, 'system/templates/vault/00_inbox/Tasks.md', '# Tasks\n');
  put(root, 'system/templates/vault/10_projects/.gitkeep', '');
  put(root, 'system/templates/config/brain.json', '{"schema":1}\n');
  put(root, 'system/templates/config/notes.txt', 'not json');
  put(root, 'system/templates/identity/USER.md', '---\ncreated: "{{date}}"\n---\n');
  put(root, 'system/packs/mba/frameworks/SWOT.md', '# SWOT\n');
  return root;
}

test('fillPlaceholders replaces date and title', () => {
  assert.equal(fillPlaceholders('{{date}} {{title}}', 'x/My Note.md', '2026-10-07'), '2026-10-07 My Note');
  assert.equal(fillPlaceholders('---\ncreated: ""\n---\n', 'USER.md', '2026-10-07'), '---\ncreated: "2026-10-07"\n---\n');
  assert.equal(fillPlaceholders('created: "2025-01-01"\n', 'x.md', '2026-10-07'), 'created: "2025-01-01"\n');
});

test('seed copies missing files, fills placeholders, never overwrites', () => {
  const root = fixture();
  try {
    put(root, 'vault/00_inbox/Tasks.md', 'MINE\n');
    const res = seed({ root, date: '2026-10-07', packs: ['core', 'mba'] });
    assert.deepEqual(res.missingSources, []);
    assert.ok(res.created.includes('vault/Home.md'));
    assert.ok(res.created.includes('config/brain.json'));
    assert.ok(res.created.includes('vault/80_me/USER.md'));
    assert.ok(res.created.includes('vault/30_wiki/frameworks/SWOT.md'));
    assert.ok(res.created.includes('vault/10_projects/.gitkeep'));
    assert.ok(!existsSync(join(root, 'config', 'notes.txt')), 'only .json config files are copied');
    assert.ok(res.kept.includes('vault/00_inbox/Tasks.md'));
    assert.equal(readFileSync(join(root, 'vault', '00_inbox', 'Tasks.md'), 'utf8'), 'MINE\n');
    assert.match(readFileSync(join(root, 'vault', 'Home.md'), 'utf8'), /created: "2026-10-07"\n---\n# Home/);
    const again = seed({ root, date: '2026-10-08' });
    assert.equal(again.created.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed dry run writes nothing and reports missing sources', () => {
  const root = fixture();
  try {
    rmSync(join(root, 'system', 'templates', 'identity'), { recursive: true });
    const res = seed({ root, dryRun: true });
    assert.ok(res.created.length > 0);
    assert.ok(!existsSync(join(root, 'vault')));
    assert.deepEqual(res.missingSources, ['system/templates/identity']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('progress: overall status, next module and aliases', () => {
  const s = emptyState();
  assert.equal(overall(s), 'not_started');
  assert.equal(nextModule(s), 'M0');
  setStatus(s, 'M0', 'in_progress', { now: '2026-10-07T10:00:00.000Z' });
  assert.equal(s.status, 'in_progress');
  assert.equal(s.modules.M0.started, '2026-10-07T10:00:00.000Z');
  for (const id of ['M0', 'M1', 'M2', 'M3']) setStatus(s, id, 'done');
  setStatus(s, 'M4', 'later', { note: 'wants to think' });
  assert.equal(nextModule(s), 'M4', 'later still counts as open');
  setStatus(s, 'M4', 'done');
  assert.equal(s.status, 'minimum_done');
  assert.equal(nextModule(s), 'M5');
  for (const id of ['M5', 'M6', 'M7', 'M8']) setStatus(s, id, 'done');
  setStatus(s, 'M9', 'skipped');
  assert.equal(s.status, 'complete');
  assert.equal(nextModule(s), null);
  setStatus(s, 'M5', 'reset');
  assert.equal(s.modules.M5.status, 'todo');
  assert.equal(resolveModule('voice'), 'M5');
  assert.equal(resolveModule('m3'), 'M3');
  assert.equal(resolveModule('7'), 'M7');
  assert.equal(resolveModule('banana'), null);
});

test('progress CLI writes state/onboarding.json under CLAUDE_PROJECT_DIR', () => {
  const root = mkdtempSync(join(tmpdir(), 'ab-progress-'));
  try {
    mkdirSync(join(root, 'system'), { recursive: true });
    const cli = join(HERE, '..', '..', 'system', 'scripts', 'onboard-progress.mjs');
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    let r = spawnSync(process.execPath, [cli, 'start', 'setup'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    r = spawnSync(process.execPath, [cli, 'later', 'M0', '--note', 'GitHub tomorrow'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const state = load(join(root, 'state', 'onboarding.json'));
    assert.equal(state.modules.M0.status, 'later');
    assert.equal(state.modules.M0.note, 'GitHub tomorrow');
    assert.ok(state.started);
    r = spawnSync(process.execPath, [cli, 'done', 'M42'], { env, encoding: 'utf8' });
    assert.equal(r.status, 2);
    r = spawnSync(process.execPath, [cli, 'next', '--json'], { env, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(r.stdout), { next: 'M0', title: 'Setup', file: 'workflows/M0-setup.md' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- packs

const BRAIN = (extra) => JSON.stringify({ schema: 1, ...extra }) + '\n';
const FRAMEWORKS = 'vault/30_wiki/frameworks/';

test('seed: packs [] copies no frameworks, ["core","mba"] copies them, core itself needs no folder', () => {
  const root = fixture();
  try {
    const none = seed({ root, date: '2026-10-07', packs: [] });
    assert.deepEqual(none.missingSources, []);
    assert.ok(!none.created.some((p) => p.startsWith(FRAMEWORKS)));
    assert.ok(!existsSync(join(root, 'vault', '30_wiki', 'frameworks')));
    const core = seed({ root, date: '2026-10-07', packs: ['core'] });
    assert.deepEqual(core.missingSources, [], '"core" is always on and has no pack folder');
    assert.ok(!existsSync(join(root, 'vault', '30_wiki', 'frameworks')));
    const mba = seed({ root, date: '2026-10-07', packs: ['core', 'mba'] });
    assert.ok(mba.created.includes(FRAMEWORKS + 'SWOT.md'));
    assert.equal(readFileSync(join(root, 'vault', '30_wiki', 'frameworks', 'SWOT.md'), 'utf8'), '# SWOT\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed: a frameworks file the user changed is never overwritten', () => {
  const root = fixture();
  try {
    put(root, 'vault/30_wiki/frameworks/SWOT.md', 'MY SWOT\n');
    const res = seed({ root, packs: ['mba'] });
    assert.ok(res.kept.includes(FRAMEWORKS + 'SWOT.md'));
    assert.equal(readFileSync(join(root, 'vault', '30_wiki', 'frameworks', 'SWOT.md'), 'utf8'), 'MY SWOT\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed: a pack folder without frameworks adds nothing and is not an error', () => {
  const root = fixture();
  try {
    put(root, 'system/packs/country-nl/README.md', '# NL\n');
    const res = seed({ root, packs: ['country-nl'] });
    assert.deepEqual(res.missingSources, []);
    assert.ok(!res.created.some((p) => p.startsWith(FRAMEWORKS)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed: pack names that are not folder names are ignored, a missing pack folder is reported', () => {
  const root = fixture();
  try {
    put(root, 'system/frameworks/Evil.md', '# evil\n');
    const res = seed({ root, packs: ['../x', '..\\x', 'a/b', 'MBA', '', 42, null, '.', '..'] });
    assert.deepEqual(res.missingSources, []);
    assert.ok(!existsSync(join(root, 'vault', '30_wiki', 'frameworks')));
    const missing = seed({ root, packs: ['mba', 'country-de', 'mba'] });
    assert.deepEqual(missing.missingSources, ['system/packs/country-de']);
    assert.ok(missing.created.includes(FRAMEWORKS + 'SWOT.md'), 'the other packs are still seeded');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed reads the packs from config/brain.json after copying the settings', () => {
  const root = fixture();
  const fresh = fixture();
  try {
    put(root, 'system/templates/config/brain.json', BRAIN({ packs: ['core'] }));
    const first = seed({ root });
    assert.ok(!first.created.some((p) => p.startsWith(FRAMEWORKS)), 'the template says core only');
    assert.deepEqual(first.notes, []);
    // The learner question switches the MBA pack on; a second run adds the frameworks.
    put(root, 'config/brain.json', BRAIN({ learner: { kind: 'mba', detail: '' }, packs: ['core', 'mba'] }));
    const second = seed({ root });
    assert.ok(second.created.includes(FRAMEWORKS + 'SWOT.md'));
    // A dry run with no config yet reads the template instead.
    put(fresh, 'system/templates/config/brain.json', BRAIN({ packs: ['core', 'mba'] }));
    const dry = seed({ root: fresh, dryRun: true });
    assert.ok(dry.created.includes(FRAMEWORKS + 'SWOT.md'));
    assert.ok(!existsSync(join(fresh, 'vault')));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(fresh, { recursive: true, force: true });
  }
});

test('seed: packs missing or not a list means core only; an unreadable brain.json is said in one line', () => {
  const root = fixture();
  try {
    put(root, 'config/brain.json', BRAIN({ packs: 'mba' }));
    const odd = seed({ root });
    assert.ok(!odd.created.some((p) => p.startsWith(FRAMEWORKS)));
    assert.deepEqual(odd.notes, []);
    put(root, 'config/brain.json', '{ "packs": ["mba"] ');
    const broken = seed({ root });
    assert.ok(!broken.created.some((p) => p.startsWith(FRAMEWORKS)));
    assert.equal(broken.notes.length, 1);
    assert.match(broken.notes[0], /config\/brain\.json could not be read/);
    assert.equal(readFileSync(join(root, 'config', 'brain.json'), 'utf8'), '{ "packs": ["mba"] ', 'the broken file is left alone');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed CLI: names a missing pack folder in plain words and exits 1', () => {
  const root = fixture();
  try {
    put(root, 'config/brain.json', BRAIN({ packs: ['core', 'country-nl'] }));
    const cli = join(HERE, '..', '..', 'system', 'scripts', 'onboard-seed.mjs');
    const r = spawnSync(process.execPath, [cli], { env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /Missing pack folder: country-nl\. Run \/health-check, or \/update-alterbrain to restore it\./);
    assert.ok(!existsSync(join(root, 'vault', '30_wiki', 'frameworks')), 'mba is not listed, so no frameworks');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- titles, kinds and times

test('progress: titles always come from the code, not from an older state file', () => {
  const root = mkdtempSync(join(tmpdir(), 'ab-titles-'));
  try {
    const old = emptyState();
    old.modules.M3.title = 'Programme and courses';
    old.modules.M6.title = 'Career in the Netherlands';
    old.modules.M6.status = 'later';
    old.modules.M6.note = 'wants to do it at the weekend';
    put(root, 'state/onboarding.json', JSON.stringify(old));
    const s = load(join(root, 'state', 'onboarding.json'));
    assert.equal(s.modules.M3.title, 'Courses and projects');
    assert.equal(s.modules.M6.title, 'Career and job search');
    assert.equal(s.modules.M6.status, 'later', 'status and note are kept');
    assert.equal(s.modules.M6.note, 'wants to do it at the weekend');
    // The same through the command line.
    const cli = join(HERE, '..', '..', 'system', 'scripts', 'onboard-progress.mjs');
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    mkdirSync(join(root, 'system'), { recursive: true });
    const r = spawnSync(process.execPath, [cli, 'show'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /M6 Career and job search/);
    assert.match(r.stdout, /M3 Courses and projects/);
    assert.doesNotMatch(r.stdout, /Netherlands|Programme and courses/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('progress: new aliases and module times', () => {
  for (const alias of ['projects', 'learning', 'work', 'courses', 'programme', 'school']) assert.equal(resolveModule(alias), 'M3', alias);
  for (const alias of ['job-search', 'career', 'jobs']) assert.equal(resolveModule(alias), 'M6', alias);
  assert.equal(MODULES.find((m) => m.id === 'M1').minutes, 2);
  assert.equal(MODULES.find((m) => m.id === 'M3').minutes, 6, 'the default for an unknown kind');
});

test('progress: learnerKind reads the stored kind, then the rule for older installs', () => {
  for (const kind of ['mba', 'degree', 'online', 'professional', 'other']) {
    assert.equal(learnerKind({ learner: { kind, detail: '' } }), kind);
  }
  assert.equal(learnerKind({ learner: { kind: ' Online ' } }), 'online', 'case and spaces do not matter');
  assert.equal(learnerKind({ learner: { kind: 'professional' }, packs: ['core', 'mba'] }), 'professional', 'a stored kind wins');
  // Older installs: no learner, or an empty one.
  assert.equal(learnerKind({ packs: ['core', 'mba'] }), 'mba');
  assert.equal(learnerKind({ school: { name: '', programme: '' } }), 'mba');
  assert.equal(learnerKind({ learner: { kind: '', detail: '' }, packs: ['core', 'mba'] }), 'mba');
  assert.equal(learnerKind({ learner: { kind: '' }, school: {} }), 'mba');
  // Nothing to go on: the question has not been asked.
  assert.equal(learnerKind({ learner: { kind: '', detail: '' }, packs: ['core'] }), null);
  assert.equal(learnerKind({ schema: 1 }), null);
  assert.equal(learnerKind({ learner: { kind: 'astronaut' }, packs: ['core'] }), null);
  assert.equal(learnerKind({ learner: 'mba', packs: ['core'] }), null);
  assert.equal(learnerKind(null), null);
  assert.equal(learnerKind('x'), null);
});

test('progress: the time for the essentials depends on the kind of learner', () => {
  const s = emptyState();
  const min = (kind) => estimateMinutes(s, kind).minimum;
  assert.equal(min('mba'), 24);
  assert.equal(min('degree'), 24);
  assert.equal(min('online'), 22);
  assert.equal(min('professional'), 21);
  assert.equal(min('other'), 24);
  assert.equal(min(null), 24, 'unknown kind: the default course time');
  assert.equal(min('astronaut'), 24);
  setStatus(s, 'M0', 'done');
  setStatus(s, 'M1', 'done');
  setStatus(s, 'M2', 'later');
  assert.deepEqual(estimateMinutes(s, 'professional'), { minimum: 21, remaining: 11 });
  assert.deepEqual(estimateMinutes(s, 'online'), { minimum: 22, remaining: 12 });
  for (const id of ['M2', 'M3', 'M4']) setStatus(s, id, 'done');
  assert.deepEqual(estimateMinutes(s, 'mba'), { minimum: 24, remaining: 0 });
});

test('progress CLI: show --json gives learner_kind and estimate_minutes', () => {
  const root = mkdtempSync(join(tmpdir(), 'ab-estimate-'));
  try {
    mkdirSync(join(root, 'system'), { recursive: true });
    const cli = join(HERE, '..', '..', 'system', 'scripts', 'onboard-progress.mjs');
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    const show = () => JSON.parse(spawnSync(process.execPath, [cli, 'show', '--json'], { env, encoding: 'utf8' }).stdout);
    let out = show();
    assert.equal(out.learner_kind, null, 'no brain.json yet');
    assert.deepEqual(out.estimate_minutes, { minimum: 24, remaining: 24 });
    put(root, 'config/brain.json', BRAIN({ learner: { kind: 'professional', detail: '' }, packs: ['core'] }));
    out = show();
    assert.equal(out.learner_kind, 'professional');
    assert.deepEqual(out.estimate_minutes, { minimum: 21, remaining: 21 });
    assert.equal(out.modules.M3.title, 'Courses and projects');
    spawnSync(process.execPath, [cli, 'done', 'M0'], { env, encoding: 'utf8' });
    assert.deepEqual(show().estimate_minutes, { minimum: 21, remaining: 13 });
    // An older install: no learner, MBA pack on.
    put(root, 'config/brain.json', BRAIN({ packs: ['core', 'mba'], school: { name: 'X', programme: 'Y' } }));
    out = show();
    assert.equal(out.learner_kind, 'mba');
    assert.deepEqual(out.estimate_minutes, { minimum: 24, remaining: 16 });
    // A broken settings file is not an error: the kind is simply unknown.
    put(root, 'config/brain.json', '{ nope');
    assert.equal(show().learner_kind, null);
    const plain = spawnSync(process.execPath, [cli, 'show'], { env, encoding: 'utf8' });
    assert.match(plain.stdout, /About 16 minutes left/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the brain.json template has a learner, core-only packs and no school block', () => {
  const brain = JSON.parse(readFileSync(join(HERE, '..', '..', 'system', 'templates', 'config', 'brain.json'), 'utf8'));
  assert.deepEqual(brain.learner, { kind: '', detail: '' });
  assert.deepEqual(brain.packs, ['core']);
  assert.ok(!('school' in brain));
  assert.equal(brain.user.timezone, '');
  assert.equal(brain.jobs.country, '');
  const keys = Object.keys(brain);
  assert.equal(keys[keys.indexOf('plan_tier') + 1], 'learner', 'learner comes right after plan_tier');
  assert.equal(learnerKind(brain), null);
});

// ---------------------------------------------------------------- switching the MBA frameworks on later

const REPO = join(HERE, '..', '..');
const readDoc = (rel) => readFileSync(join(REPO, ...rel.split('/')), 'utf8');

test('a degree learner can switch the MBA frameworks on and off without the kind changing', () => {
  const root = fixture();
  try {
    const brainPath = join(root, 'config', 'brain.json');
    const read = () => JSON.parse(readFileSync(brainPath, 'utf8'));
    const write = (b) => writeFileSync(brainPath, JSON.stringify(b) + '\n', 'utf8');
    const swot = join(root, 'vault', '30_wiki', 'frameworks', 'SWOT.md');

    put(root, 'config/brain.json', BRAIN({ learner: { kind: 'degree', detail: '' }, packs: ['core'] }));
    assert.ok(!seed({ root }).created.some((p) => p.startsWith(FRAMEWORKS)), 'a degree learner starts without the frameworks');

    // What the /reconfigure row does: add "mba" to packs, leave learner alone, run the seed.
    const on = read();
    on.packs.push('mba');
    write(on);
    assert.ok(seed({ root }).created.includes(FRAMEWORKS + 'SWOT.md'), 'switching the pack on copies the frameworks');
    assert.equal(learnerKind(read()), 'degree', 'a stored kind wins over the pack');
    assert.deepEqual(read().learner, { kind: 'degree', detail: '' });

    // The user edits a framework; switching off and on again must not touch it.
    writeFileSync(swot, 'MY SWOT\n', 'utf8');
    const off = read();
    off.packs = off.packs.filter((p) => p !== 'mba');
    write(off);
    const afterOff = seed({ root });
    assert.ok(!afterOff.created.some((p) => p.startsWith(FRAMEWORKS)));
    assert.equal(readFileSync(swot, 'utf8'), 'MY SWOT\n', 'switching off deletes and changes nothing');
    assert.equal(learnerKind(read()), 'degree');

    const again = read();
    again.packs.push('mba');
    write(again);
    const afterOn = seed({ root });
    assert.ok(afterOn.kept.includes(FRAMEWORKS + 'SWOT.md'));
    assert.equal(readFileSync(swot, 'utf8'), 'MY SWOT\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs: the switch-on-later promise is backed by a /reconfigure row and by M2 keeping the pack', () => {
  const m2 = readDoc('.claude/skills/onboard/workflows/M2-you-and-facts.md');
  const reconfigure = readDoc('.claude/skills/reconfigure/SKILL.md');
  const readme = readDoc('system/packs/README.md');
  const menu = readDoc('.claude/skills/menu/references/groups.md');

  // M2 step 3: the pack follows an MBA answer, but a re-run no longer strips a pack the user switched on.
  assert.match(m2, /answer equals the stored kind[^\n]*leave `packs` as it is/);
  assert.match(m2, /answer is `mba`: add `mba` if it is missing/);
  assert.match(m2, /old kind was `mba` and the answer is another kind: remove `mba`/);
  assert.match(m2, /Anything else[^\n]*leave `mba` exactly as it is/);
  assert.match(m2, /\| A university degree \|[^\n]*switch it on any time/);

  // /reconfigure: a row that edits only packs, never learner, in both directions.
  const row = reconfigure.split('\n').find((l) => /^\s*\| Switch the MBA frameworks on or off/.test(l));
  assert.ok(row, 'reconfigure has a row "Switch the MBA frameworks on or off"');
  assert.match(row, /Edit only `packs`/);
  assert.match(row, /do not touch `learner`/);
  assert.match(row, /\*\*On:\*\*[^|]*onboard-seed\.mjs/);
  assert.match(row, /\*\*Off:\*\*[^|]*already in your wiki stay/);
  assert.match(reconfigure, /argument-hint:[^\n]*frameworks/);

  // The pack README and the menu say the same thing.
  assert.match(readme, /Switch the MBA frameworks on or off/);
  assert.match(readme, /stays on when they answer the learner question again/);
  assert.match(menu, /Switch the MBA frameworks on or off/);
});

test('docs: no onboarding, reconfigure or pack file still says the MBA pack exists only for the kind mba', () => {
  const stale = [
    /removes it for every other kind/i,
    /For every other kind, remove `mba`/,
    /`mba` in `packs` only for the kind/i,
    /`mba` listed only for kind/i,
    /only when the kind is `mba`/i,
  ];
  const files = [
    '.claude/skills/reconfigure/SKILL.md',
    '.claude/skills/menu/SKILL.md',
    '.claude/skills/menu/references/groups.md',
    '.claude/skills/onboard/SKILL.md',
    '.claude/skills/onboard/references/state.md',
    ...['M0-setup', 'M1-identity', 'M2-you-and-facts', 'M3-programme', 'M4-autonomy', 'M5-voice', 'M7-integrations', 'M8-brand', 'M9-import']
      .map((m) => `.claude/skills/onboard/workflows/${m}.md`),
    'system/packs/README.md',
  ];
  for (const f of files) {
    const text = readDoc(f);
    for (const re of stale) assert.doesNotMatch(text, re, `${f} still says: ${re}`);
  }
});
