// The real upgrade scripts, run the way a person's update runs them: update.mjs plan, apply-safe and finish
// against a release folder that holds the framework's own migrations and the library they import.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { REPO, abs, changedPaths, cleanup, copyFixture, listGuided, listMigrations, read, readJsonIn, snapshot } from '../../fixtures/migrations/helpers.mjs';

const TAG = 'v0.2.0';
const LIBS = ['migrate.mjs', 'paths.mjs', 'fsx.mjs', 'tasks.mjs', 'frontmatter.mjs'];
const releases = [];
after(() => {
  cleanup();
  for (const dir of releases) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const FAKE_NEW = '0099-example-change.mjs';
const FAKE_NEW_BODY = '#!/usr/bin/env node\n// ab-migration: Writes a marker file for the test.\nimport { writeFileSync } from \'node:fs\';\nwriteFileSync(\'state/marker-0099.txt\', \'done\\n\');\nconsole.log(\'Did the new thing.\');\n';

/**
 * A release folder with the real migrations, the library files they import, and a manifest that lists them.
 * `extraMigrations` adds upgrade scripts that only exist in this test, as { name: body }.
 */
function makeRelease(root, { version = '0.2.0', tag = TAG, extraMigrations = {} } = {}) {
  const dir = join(root, '..', `release-${Math.random().toString(16).slice(2, 10)}`);
  releases.push(dir);
  const files = {};
  const add = (rel, buf) => {
    mkdirSync(dirname(join(dir, ...rel.split('/'))), { recursive: true });
    writeFileSync(join(dir, ...rel.split('/')), buf);
    files[rel] = { class: 'code', sha256: sha(buf) };
  };
  for (const lib of LIBS) add(`system/lib/${lib}`, readFileSync(join(REPO, 'system', 'lib', lib)));
  for (const name of listMigrations()) add(`system/scripts/migrations/${name}`, readFileSync(join(REPO, 'system', 'scripts', 'migrations', name)));
  for (const name of listGuided()) add(`system/scripts/migrations/${name}`, readFileSync(join(REPO, 'system', 'scripts', 'migrations', name)));
  for (const [name, body] of Object.entries(extraMigrations)) add(`system/scripts/migrations/${name}`, body);
  add('system/release.json', JSON.stringify({ name: 'alterbrain', version, tag, repo: 'example/alterbrain' }, null, 2) + '\n');
  writeFileSync(join(dir, 'system', 'manifest.json'), JSON.stringify({ schema: 1, version, tag, files }, null, 2));
  return dir;
}

const git = (root, args) => spawnSync('git', ['-c', 'user.name=Alex Doe', '-c', 'user.email=alex@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
  cwd: root, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'), GIT_TERMINAL_PROMPT: '0' },
});

/** Make the project a git repository with one commit, as every real install is (that is what makes the restore point). */
function initRepo(root) {
  assert.equal(git(root, ['init', '-q', '-b', 'main']).status, 0);
  assert.equal(git(root, ['add', '-A']).status, 0);
  assert.equal(git(root, ['commit', '-q', '-m', 'start']).status, 0);
  return root;
}

/** The project as it is before the update: release 0.1.1 installed (its manifest lists no upgrade scripts). */
function installOld(fixture, { repo = true } = {}) {
  const root = copyFixture(fixture);
  writeFileSync(abs(root, 'system/release.json'), JSON.stringify({ name: 'alterbrain', version: '0.1.1', tag: 'v0.1.1', repo: 'example/alterbrain' }, null, 2) + '\n');
  writeFileSync(abs(root, 'system/manifest.json'), JSON.stringify({ schema: 1, version: '0.1.1', tag: 'v0.1.1', files: {} }, null, 2));
  return repo ? initRepo(root) : root;
}

/**
 * A fresh 0.2.0 install: its manifest lists the upgrade scripts the release came with, but nothing has ever run one,
 * so there is no state/migrations.json. Its notes and settings already have the new shape.
 */
function installFresh(fixture, { repo = true } = {}) {
  const root = copyFixture(fixture);
  const files = {};
  for (const name of [...listMigrations(), ...listGuided()]) {
    const buf = readFileSync(join(REPO, 'system', 'scripts', 'migrations', name));
    files[`system/scripts/migrations/${name}`] = { class: 'code', sha256: sha(buf) };
    mkdirSync(abs(root, 'system/scripts/migrations'), { recursive: true });
    writeFileSync(abs(root, `system/scripts/migrations/${name}`), buf); // a fresh install has the scripts on disk
  }
  writeFileSync(abs(root, 'system/release.json'), JSON.stringify({ name: 'alterbrain', version: '0.2.0', tag: 'v0.2.0', repo: 'example/alterbrain' }, null, 2) + '\n');
  writeFileSync(abs(root, 'system/manifest.json'), JSON.stringify({ schema: 1, version: '0.2.0', tag: 'v0.2.0', files }, null, 2));
  return repo ? initRepo(root) : root;
}

function update(root, args) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'update.mjs'), ...args, '--no-commit'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ALTERBRAIN_ALLOW_CUSTOM_SOURCE: '1' },
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

test('an MBA install from 0.1.0 is upgraded by the real migrations, and the plan listed them first', () => {
  const root = installOld('v0.1.0');
  const release = makeRelease(root);

  const plan = update(root, ['plan', TAG, '--source-dir', release]);
  assert.equal(plan.code, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Upgrades to your notes and settings \(run at the end\):\n {2}- Removes the retired Canvas connection from your tools list, if you had switched it on\.\n {2}- If you started on Alterbrain 0\.1, records that you are doing an MBA and switches on the MBA and Netherlands packs you already use\.\n {2}- Checks the skills and helpers you built, and your identity notes, for links to Alterbrain files that moved\.\n/);
  assert.match(plan.stdout, /Upgrades I will ask you about after the update:\n {2}- If your settings name a school or programme, offers to make a programme note from them and link your courses to it\.\n/);
  assert.deepEqual(JSON.parse(update(root, ['plan', TAG, '--json', '--source-dir', release]).stdout).guided_pending.map((g) => g.id), listGuided());
  // planning changes nothing in the notes and settings
  assert.equal(readJsonIn(root, 'config/mcp.selected.json').enabled.includes('canvas-mcp'), true);

  assert.equal(update(root, ['apply-safe', TAG]).code, 0);
  const before = snapshot(root);
  const fin = update(root, ['finish', TAG, '--json', '--no-doctor']);
  assert.equal(fin.code, 0, fin.stdout + fin.stderr);
  const out = JSON.parse(fin.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.safety_tag, `pre-update-${TAG}`, 'the restore point is named so the skill can tell the person');
  assert.deepEqual(out.migrations_run, listMigrations());
  assert.deepEqual(out.migrations_skipped, []);
  assert.match(out.migration_notes['0001-remove-canvas.mjs'], /^Removed the retired Canvas connection from your tools list\.\nAdded a task to remove the Canvas sync you built\.$/);
  assert.match(out.migration_notes['0002-learner-and-packs.mjs'], /^Recorded that you are doing an MBA/);
  assert.deepEqual(out.guided_pending.map((g) => g.id), listGuided(), 'the guided upgrade is listed, never run');
  assert.equal(out.migration_notes['0003-programme-note.md'], undefined);
  assert.match(out.migration_notes['0004-old-pack-paths.mjs'], /^2 of your own skills or helpers point to files that moved\./);

  assert.deepEqual(readJsonIn(root, 'config/mcp.selected.json').enabled, ['mcpvault', 'playwright', 'context7']);
  assert.equal(readJsonIn(root, 'config/brain.json').learner.kind, 'mba');
  assert.equal(readJsonIn(root, 'state/migrations.json').applied.length, listMigrations().length);
  assert.ok(readJsonIn(root, 'state/migrations.json').applied.every((a) => !a.baseline), 'these upgrades really ran');
  const tasks = read(root, 'vault/00_inbox/Tasks.md').split('\n').filter((l) => l.startsWith('- [ ]'));
  assert.equal(tasks.length, 3, 'one task for the Canvas sync, one for the skills that point to moved files, one for the upgrade question');
  const n = listGuided().length;
  assert.equal(tasks.filter((l) => l.includes(`Alterbrain has ${n} upgrade question${n === 1 ? '' : 's'} for you. Say "run the pending upgrades". #ab/update-alterbrain`)).length, 1);
  assert.equal(readJsonIn(root, 'config/brain.json').school.name, 'Example Business School', 'a guided upgrade changes nothing by itself');

  // Only settings, notes and the update's own records changed; the person's own skills did not.
  const changed = changedPaths(before, snapshot(root));
  assert.deepEqual(changed.filter((p) => p.startsWith('.claude/')), []);
  assert.deepEqual(changed.filter((p) => p.startsWith('vault/') || p.startsWith('config/') || p.startsWith('state/')).sort(), [
    'config/brain.json', 'config/mcp.selected.json', 'state/local/update/v0.2.0/finished.json', 'state/migrations.json',
    'vault/00_inbox/Tasks.md',
  ].sort());

  // Finishing again runs nothing twice.
  const again = JSON.parse(update(root, ['finish', TAG, '--json', '--no-doctor']).stdout);
  assert.deepEqual(again.migrations_run, []);
  assert.equal(again.ok, true);
  const tasksAgain = read(root, 'vault/00_inbox/Tasks.md').split('\n').filter((l) => l.includes('upgrade question'));
  assert.equal(tasksAgain.length, 1, 'the upgrade task is not added twice');
});

test('a fresh 0.2 install is told about no upgrade: the plan is silent and finish runs and prints nothing', () => {
  for (const fixture of ['v0.2-professional', 'v0.2-online']) {
    const root = installFresh(fixture);
    const release = makeRelease(root, { version: '0.2.1', tag: 'v0.2.1' });

    // The plan must not promise upgrades to data they never touch (this was the bug: "Records that you are doing an MBA...").
    const plan = update(root, ['plan', 'v0.2.1', '--source-dir', release]);
    assert.equal(plan.code, 0, plan.stdout + plan.stderr);
    assert.doesNotMatch(plan.stdout, /Upgrades to your notes and settings/, fixture);
    assert.doesNotMatch(plan.stdout, /MBA|programme note|Canvas/, fixture);
    const planJson = JSON.parse(update(root, ['plan', 'v0.2.1', '--json', '--source-dir', release]).stdout);
    assert.deepEqual(planJson.migrations_pending, [], fixture);
    assert.deepEqual(planJson.migrations_baseline, listMigrations(), `${fixture}: the plan says what it treats as already in place`);
    assert.deepEqual(planJson.guided_pending, [], fixture);
    assert.equal(existsSync(abs(root, 'state/migrations.json')), false, 'planning writes nothing');

    assert.equal(update(root, ['apply-safe', 'v0.2.1']).code, 0);
    const before = snapshot(root);
    const fin = update(root, ['finish', 'v0.2.1', '--no-doctor']);
    assert.equal(fin.code, 0, fin.stdout + fin.stderr);
    assert.doesNotMatch(fin.stdout, /Upgrades run|Nothing to do/, fixture);
    assert.deepEqual(
      changedPaths(before, snapshot(root)).filter((p) => !p.startsWith('system/') && !p.startsWith('state/')),
      [],
      `${fixture}: an upgrade changed the person's notes or settings`,
    );
    // The record says they were already in place, so a later release does not list them either.
    const record = readJsonIn(root, 'state/migrations.json').applied;
    assert.deepEqual(record.map((a) => a.id).sort(), [...listMigrations(), ...listGuided()].sort());
    assert.ok(record.every((a) => a.baseline === true));
    assert.ok(record.filter((a) => a.id.endsWith('.md')).every((a) => a.kind === 'guided' && a.outcome === 'done'));
    assert.doesNotMatch(read(root, 'vault/00_inbox/Tasks.md'), /upgrade question/, fixture);
  }
});

test('a fresh 0.2 install that gets one new upgrade is told about that one only, and it runs alone', () => {
  const root = installFresh('v0.2-online');
  const release = makeRelease(root, { version: '0.2.1', tag: 'v0.2.1', extraMigrations: { [FAKE_NEW]: FAKE_NEW_BODY } });

  const plan = update(root, ['plan', 'v0.2.1', '--source-dir', release]);
  assert.equal(plan.code, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Upgrades to your notes and settings \(run at the end\):\n {2}- Writes a marker file for the test\.\n/);
  assert.doesNotMatch(plan.stdout, /MBA|programme note|Canvas/);

  assert.equal(update(root, ['apply-safe', 'v0.2.1']).code, 0);
  const fin = JSON.parse(update(root, ['finish', 'v0.2.1', '--json', '--no-doctor']).stdout);
  assert.equal(fin.ok, true);
  assert.deepEqual(fin.migrations_run, [FAKE_NEW]);
  assert.deepEqual(fin.migration_notes, { [FAKE_NEW]: 'Did the new thing.' });
  assert.equal(read(root, 'state/marker-0099.txt'), 'done\n');
  const record = readJsonIn(root, 'state/migrations.json').applied;
  assert.deepEqual(record.map((a) => a.id).sort(), [...listMigrations(), ...listGuided(), FAKE_NEW].sort());
  assert.deepEqual(record.filter((a) => a.baseline).map((a) => a.id).sort(), [...listMigrations(), ...listGuided()].sort());

  // The release after that sees all of them as done.
  const next = makeRelease(root, { version: '0.2.2', tag: 'v0.2.2', extraMigrations: { [FAKE_NEW]: FAKE_NEW_BODY } });
  assert.deepEqual(JSON.parse(update(root, ['plan', 'v0.2.2', '--json', '--source-dir', next]).stdout).migrations_pending, []);
});

test('an install from 0.1 is never mistaken for a fresh one, even when its record is missing', () => {
  const root = installOld('v0.2-online');
  const release = makeRelease(root);
  const plan = JSON.parse(update(root, ['plan', TAG, '--json', '--source-dir', release]).stdout);
  assert.deepEqual(plan.migrations_pending.map((m) => m.id), listMigrations());
  assert.deepEqual(plan.migrations_baseline, []);
});

test('no restore point, no upgrade: apply-safe refuses before it changes anything when the folder has no Git', () => {
  const root = installOld('v0.1.0', { repo: false });
  const release = makeRelease(root);
  assert.equal(update(root, ['plan', TAG, '--source-dir', release]).code, 0);
  const before = snapshot(root);
  const a = update(root, ['apply-safe', TAG, '--json']);
  assert.equal(a.code, 1);
  const out = JSON.parse(a.stdout);
  assert.equal(out.ok, false);
  assert.match(out.error, /restore point/);
  assert.match(out.error, /changed nothing/);
  assert.match(out.error, /\/health-check/);
  assert.deepEqual(changedPaths(before, snapshot(root)), [], 'no file was touched');
  assert.equal(readJsonIn(root, 'system/release.json').version, '0.1.1');
});

test('finish does not touch notes or settings when the restore point is gone', () => {
  const root = installOld('v0.1.0');
  const release = makeRelease(root);
  assert.equal(update(root, ['plan', TAG, '--source-dir', release]).code, 0);
  const a = JSON.parse(update(root, ['apply-safe', TAG, '--json']).stdout);
  assert.equal(a.safety_tag, `pre-update-${TAG}`);

  // The tag is deleted (or never made), then finish is run: it must not rewrite brain.json or the course notes.
  assert.equal(git(root, ['tag', '-d', `pre-update-${TAG}`]).status, 0);
  const before = snapshot(root);
  const f = update(root, ['finish', TAG, '--json', '--no-doctor']);
  assert.equal(f.code, 1);
  const out = JSON.parse(f.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.no_restore_point, true);
  assert.match(out.error, /no restore point, so I did not change your notes/);
  assert.match(out.error, /\/health-check/);
  assert.equal(out.safety_tag, null);
  assert.deepEqual(changedPaths(before, snapshot(root)), [], 'nothing at all changed');
  assert.equal(existsSync(abs(root, 'state/migrations.json')), false);
  assert.equal(readJsonIn(root, 'system/manifest.json').version, '0.1.1', 'the update is not marked finished');

  // Text for a person: one sentence and the one thing to do.
  const text = update(root, ['finish', TAG, '--no-doctor']);
  assert.equal(text.code, 1);
  assert.match(text.stdout, /^! I have no restore point, so I did not change your notes/);

  // With the restore point back, the same finish goes through.
  assert.equal(git(root, ['tag', `pre-update-${TAG}`]).status, 0);
  const ok = JSON.parse(update(root, ['finish', TAG, '--json', '--no-doctor']).stdout);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.migrations_run, listMigrations());
});

test('an update with no upgrades to run does not need a restore point', () => {
  const root = installFresh('v0.2-professional', { repo: false });
  const release = makeRelease(root, { version: '0.2.1', tag: 'v0.2.1' });
  assert.equal(update(root, ['plan', 'v0.2.1', '--source-dir', release]).code, 0);
  const a = JSON.parse(update(root, ['apply-safe', 'v0.2.1', '--json']).stdout);
  assert.equal(a.ok, true);
  assert.equal(a.safety_tag, null);
  assert.ok(a.notes.some((n) => /no restore point/i.test(n)), 'the person is told, in a note');
  const fin = JSON.parse(update(root, ['finish', 'v0.2.1', '--json', '--no-doctor']).stdout);
  assert.equal(fin.ok, true);
  assert.equal(fin.safety_tag, null);
});

test('apply-safe run again after a stopped finish keeps the first restore point', () => {
  const root = installOld('v0.1.0');
  writeFileSync(abs(root, 'config/brain.json'), '{oops');
  const release = makeRelease(root);
  assert.equal(update(root, ['plan', TAG, '--source-dir', release]).code, 0);
  assert.equal(JSON.parse(update(root, ['apply-safe', TAG, '--json']).stdout).safety_tag, `pre-update-${TAG}`);
  const firstCommit = git(root, ['rev-parse', `pre-update-${TAG}`]).stdout.trim();
  assert.equal(update(root, ['finish', TAG, '--no-doctor']).code, 1);

  // Run again: the tag exists already, so it is kept (at the first, untouched state) and reported, not lost.
  const again = JSON.parse(update(root, ['apply-safe', TAG, '--json']).stdout);
  assert.equal(again.ok, true);
  assert.equal(again.safety_tag, `pre-update-${TAG}`);
  assert.equal(git(root, ['rev-parse', `pre-update-${TAG}`]).stdout.trim(), firstCommit);
});

test('an upgrade that cannot read the settings stops the update and the person sees why', () => {
  const root = installOld('v0.1.0');
  writeFileSync(abs(root, 'config/brain.json'), '{oops');
  const release = makeRelease(root);
  assert.equal(update(root, ['plan', TAG, '--source-dir', release]).code, 0);
  assert.equal(update(root, ['apply-safe', TAG]).code, 0);
  const fin = update(root, ['finish', TAG, '--no-doctor']);
  assert.equal(fin.code, 1);
  // 0001 (tools list) and then 0002 stops on the unreadable settings file
  assert.match(fin.stdout, /! The upgrade 0002-learner-and-packs\.mjs stopped, so the update is not finished\.\n {2}Your settings file config\/brain\.json could not be read, so I changed nothing\. Run \/health-check, then finish the update again\.\n {2}Already done: 0001-remove-canvas\.mjs\n/);
  assert.equal(readJsonIn(root, 'state/migrations.json').applied.map((a) => a.id).join(','), '0001-remove-canvas.mjs');
  assert.equal(readJsonIn(root, 'system/manifest.json').version, '0.1.1', 'the update is not marked finished');

  // The person fixes the file; finish continues where it stopped and does not repeat 0001.
  cpSync(abs(copyFixture('v0.1.0'), 'config/brain.json'), abs(root, 'config/brain.json'));
  const retry = JSON.parse(update(root, ['finish', TAG, '--json', '--no-doctor']).stdout);
  assert.equal(retry.ok, true);
  assert.deepEqual(retry.migrations_run, listMigrations().slice(1), 'every upgrade after 0001, in order');
  assert.equal(readJsonIn(root, 'system/manifest.json').version, '0.2.0');
});
