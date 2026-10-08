// Guided upgrades (system/scripts/migrations/NNNN-*.md): listed, answered and recorded by update.mjs, never run.
// Documented fallback covered here (SPEC 15a.5, school display): an install whose guided upgrade 0003 was skipped or
// never answered keeps its school block in config/brain.json, and the code keeps reading it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO, abs, changedPaths, cleanup, copyFixture, exists, read, readJsonIn, snapshot } from '../../fixtures/migrations/helpers.mjs';
import { release } from '../../fixtures/scripts/release.mjs';

after(cleanup);

const ID = '0003-programme-note.md';
const REL = `system/scripts/migrations/${ID}`;
const SCRIPT = '0001-remove-canvas.mjs';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function update(root, args) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'update.mjs'), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000, env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/**
 * A copy of the v0.1.0 fixture with a 0.2.0 manifest installed that lists the real guided file and one script, both on
 * disk. An install that has run an upgrade before has a record; a fresh install has none (record: false).
 */
function make({ record = true } = {}) {
  const root = copyFixture('v0.1.0');
  mkdirSync(abs(root, 'system/scripts/migrations'), { recursive: true });
  const files = {};
  for (const rel of [REL, `system/scripts/migrations/${SCRIPT}`]) {
    const buf = readFileSync(join(REPO, ...rel.split('/')));
    writeFileSync(abs(root, rel), buf);
    files[rel] = { class: 'code', sha256: sha(buf) };
  }
  writeFileSync(abs(root, 'system/release.json'), JSON.stringify({ name: 'alterbrain', version: '0.2.0', tag: 'v0.2.0', repo: 'example/alterbrain' }, null, 2) + '\n');
  writeFileSync(abs(root, 'system/manifest.json'), JSON.stringify({ schema: 1, version: '0.2.0', tag: 'v0.2.0', files }, null, 2));
  if (record) {
    writeFileSync(abs(root, 'state/migrations.json'), JSON.stringify({ schema: 1, applied: [{ id: SCRIPT, at: '2026-10-01T10:00:00.000Z', tag: 'v0.2.0' }] }, null, 2));
  }
  return root;
}

test('guided list shows an upgrade question that is listed, matches its checksum and has no answer yet', () => {
  const root = make();
  const r = update(root, ['guided', 'list', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.pending, 1);
  assert.deepEqual(out.guided.map((g) => [g.id, g.status]), [[ID, 'pending']]);
  assert.match(out.guided[0].summary, /^If your settings name a school or programme, /);
  assert.match(update(root, ['guided', 'list']).stdout, /^- 0003-programme-note\.md \(pending\): If your settings name a school/);
});

test('skip records the outcome, hides it from the list, and --all shows it; done replaces the skip', () => {
  const root = make();
  const before = snapshot(root);
  const skip = update(root, ['guided', 'skip', ID]);
  assert.equal(skip.code, 0, skip.stderr);
  assert.match(skip.stdout, /Recorded 0003-programme-note\.md as skipped\./);
  const rec = readJsonIn(root, 'state/migrations.json').applied;
  const entry = rec.find((a) => a.id === ID);
  assert.deepEqual(Object.keys(entry).sort(), ['at', 'id', 'kind', 'outcome', 'tag']);
  assert.equal(entry.kind, 'guided');
  assert.equal(entry.outcome, 'skipped');
  assert.equal(entry.tag, 'v0.2.0');
  assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(rec.filter((a) => a.id === SCRIPT).length, 1, 'the script entry is untouched');
  assert.deepEqual(changedPaths(before, snapshot(root)), ['state/migrations.json'], 'only the record changes');

  assert.equal(JSON.parse(update(root, ['guided', 'list', '--json']).stdout).guided.length, 0);
  const all = JSON.parse(update(root, ['guided', 'list', '--all', '--json']).stdout);
  assert.deepEqual(all.guided.map((g) => [g.id, g.status]), [[ID, 'skipped']]);
  assert.equal(all.pending, 0);

  // Run it later: the answer is replaced, not duplicated.
  assert.equal(update(root, ['guided', 'done', ID]).code, 0);
  const again = readJsonIn(root, 'state/migrations.json').applied.filter((a) => a.id === ID);
  assert.equal(again.length, 1);
  assert.equal(again[0].outcome, 'done');
  assert.deepEqual(JSON.parse(update(root, ['guided', 'list', '--all', '--json']).stdout).guided.map((g) => g.status), ['done']);
  // The id also works without the extension.
  assert.equal(update(root, ['guided', 'skip', '0003-programme-note']).code, 0);
  assert.equal(readJsonIn(root, 'state/migrations.json').applied.find((a) => a.id === ID).outcome, 'skipped');
});

test('a fresh install already has its upgrade questions answered: nothing is pending, and the record says baseline', () => {
  const root = make({ record: false });
  assert.equal(exists(root, 'state/migrations.json'), false);
  assert.equal(JSON.parse(update(root, ['guided', 'list', '--json']).stdout).guided.length, 0);
  const all = JSON.parse(update(root, ['guided', 'list', '--all', '--json']).stdout);
  assert.deepEqual(all.guided.map((g) => [g.id, g.status]), [[ID, 'done']]);
  assert.equal(exists(root, 'state/migrations.json'), false, 'listing writes nothing');

  // A later answer first writes the baseline, so the scripts that came with the install are not treated as pending.
  assert.equal(update(root, ['guided', 'skip', ID]).code, 0);
  const rec = readJsonIn(root, 'state/migrations.json').applied;
  const script = rec.find((a) => a.id === SCRIPT);
  assert.equal(script.baseline, true);
  assert.equal(script.kind, undefined, 'a script entry keeps its old shape');
  assert.equal(rec.find((a) => a.id === ID).outcome, 'skipped');
});

test('a changed or unlisted file is never an upgrade question, and done or skip refuse it', () => {
  const root = make();
  writeFileSync(abs(root, REL), read(root, REL) + '\nsomebody added a line\n');
  assert.equal(JSON.parse(update(root, ['guided', 'list', '--all', '--json']).stdout).guided.length, 0);
  const before = snapshot(root);
  for (const sub of ['done', 'skip']) {
    const r = update(root, ['guided', sub, ID]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /is not an upgrade question that came with this release, so nothing was recorded\./);
  }
  const json = update(root, ['guided', 'done', '0042-stray.md', '--json']);
  assert.equal(json.code, 1);
  assert.equal(JSON.parse(json.stdout).ok, false);
  assert.deepEqual(changedPaths(before, snapshot(root)), []);
});

test('the 0003 file follows the guided format, and an unanswered or skipped one leaves the school block in place', () => {
  const text = readFileSync(join(REPO, ...REL.split('/')), 'utf8');
  assert.match(text, /^---\ntype: "guided-migration"\nid: "0003-programme-note"\nsummary: "If your settings name a school or programme, .+\."\nsince: "0\.2\.0"\n---\n/);
  assert.deepEqual(text.split('\n').filter((l) => /^## /.test(l)), ['## Who this is for', '## Evaluate', '## Propose', '## Apply', '## If skipped', '## Never']);
  const root = make();
  update(root, ['guided', 'skip', ID]);
  assert.equal(readJsonIn(root, 'config/brain.json').school.name, 'Example Business School');
  assert.equal(exists(root, 'vault/20_areas/programmes'), false);
});

test('guided savepoint reuses the update tag, makes a new one when it is gone, and refuses without Git', release(), () => {
  const root = make();
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8', windowsHide: true });
  git('init', '-q');
  git('config', 'user.email', 'a@example.com');
  git('config', 'user.name', 'A');
  git('add', '-A');
  git('commit', '-q', '-m', 'x');
  const none = JSON.parse(update(root, ['guided', 'savepoint', '--json', '--no-commit']).stdout);
  assert.equal(none.ok, true);
  assert.equal(none.created, true);
  assert.match(none.restore_point, /^pre-guided-v0\.2\.0-/);
  git('tag', 'pre-update-v0.2.0');
  const reuse = JSON.parse(update(root, ['guided', 'savepoint', '--json', '--no-commit']).stdout);
  assert.deepEqual([reuse.ok, reuse.restore_point, reuse.created], [true, 'pre-update-v0.2.0', false]);
  assert.equal(update(root, ['guided', 'savepoint', '--all']).code, 2);

  const bare = make();
  const r = update(bare, ['guided', 'savepoint', '--no-commit']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no restore point/);
});
