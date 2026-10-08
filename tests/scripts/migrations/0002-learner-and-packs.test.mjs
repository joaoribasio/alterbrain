import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { abs, cleanup, copyFixture, readJsonIn, runMigration, snapshot, write } from '../../fixtures/migrations/helpers.mjs';

after(cleanup);
const FILE = '0002-learner-and-packs.mjs';

/** The v0.1.0 brain.json, changed by `edit(json)`, written back into a fresh copy. */
function oldInstall(edit, fixture = 'v0.1.0') {
  const root = copyFixture(fixture);
  const brain = readJsonIn(root, 'config/brain.json');
  edit(brain);
  write(root, 'config/brain.json', JSON.stringify(brain, null, 2) + '\n');
  return root;
}

test('0002: an old install is recorded as an MBA and gets the packs it already uses', () => {
  const root = copyFixture('v0.1.0');
  const original = readJsonIn(root, 'config/brain.json');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Recorded that you are doing an MBA/);
  assert.match(r.stdout, /Switched on: the Netherlands job-search pack\./);

  const brain = readJsonIn(root, 'config/brain.json');
  const keys = Object.keys(brain);
  assert.deepEqual(brain.learner, { kind: 'mba', detail: '' });
  assert.equal(keys[keys.indexOf('plan_tier') + 1], 'learner', 'learner sits right after plan_tier');
  assert.deepEqual(brain.packs, ['core', 'mba', 'country-nl']);
  assert.deepEqual(keys.filter((k) => k !== 'learner'), Object.keys(original), 'every other key stays where it was');
  // The school block (with its leftover lms), jobs and the rest are not touched.
  for (const key of Object.keys(original).filter((k) => k !== 'packs')) assert.deepEqual(brain[key], original[key], key);
});

test('0002: a second run says "Nothing to do." and changes nothing', () => {
  const root = copyFixture('v0.1.0');
  assert.equal(runMigration(FILE, root).code, 0);
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0002: the Netherlands pack follows jobs.country, whatever the capitals', () => {
  const cases = [['nl', ['core', 'mba', 'country-nl']], [' NL ', ['core', 'mba', 'country-nl']], ['DE', ['core', 'mba']], ['', ['core', 'mba']]];
  for (const [country, packs] of cases) {
    const root = oldInstall((b) => {
      b.jobs.country = country;
      b.packs = ['core'];
    });
    assert.equal(runMigration(FILE, root).code, 0);
    assert.deepEqual(readJsonIn(root, 'config/brain.json').packs, packs, JSON.stringify(country));
  }
  // The MBA pack is reported when it is new, and the Netherlands pack only when jobs.country asks for it.
  const fresh = oldInstall((b) => {
    b.packs = ['core'];
    b.jobs.country = 'DE';
  });
  assert.match(runMigration(FILE, fresh).stdout, /Switched on: the MBA pack\./);
  const both = oldInstall((b) => {
    b.packs = ['core'];
  });
  assert.match(runMigration(FILE, both).stdout, /Switched on: the MBA pack and the Netherlands job-search pack\./);
});

test('0002: a missing or broken packs setting becomes a list', () => {
  const missing = oldInstall((b) => {
    delete b.packs;
    b.jobs.country = 'NL';
  });
  assert.equal(runMigration(FILE, missing).code, 0);
  assert.deepEqual(readJsonIn(missing, 'config/brain.json').packs, ['core', 'mba', 'country-nl']);
  const notAList = oldInstall((b) => {
    b.packs = 'mba';
    b.jobs.country = 'DE';
  });
  assert.equal(runMigration(FILE, notAList).code, 0);
  assert.deepEqual(readJsonIn(notAList, 'config/brain.json').packs, ['core', 'mba']);
});

test('0002: without plan_tier, learner goes at the end; extra packs are kept', () => {
  const root = oldInstall((b) => {
    delete b.plan_tier;
    b.packs = ['core', 'my-own-pack'];
  });
  assert.equal(runMigration(FILE, root).code, 0);
  const brain = readJsonIn(root, 'config/brain.json');
  assert.equal(Object.keys(brain).at(-1), 'learner');
  assert.deepEqual(brain.packs, ['core', 'my-own-pack', 'mba', 'country-nl']);
});

test('0002: an existing learner object with an empty kind keeps its other keys', () => {
  const root = oldInstall((b) => {
    b.learner = { kind: '  ', detail: 'from an earlier try', extra: 1 };
  });
  assert.equal(runMigration(FILE, root).code, 0);
  assert.deepEqual(readJsonIn(root, 'config/brain.json').learner, { kind: 'mba', detail: 'from an earlier try', extra: 1 });
});

test('0002: 0.2 installs and fresh templates are left alone', () => {
  for (const name of ['v0.2-professional', 'v0.2-online']) {
    const root = copyFixture(name);
    const before = snapshot(root);
    const r = runMigration(FILE, root);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), 'Nothing to do.', name);
    assert.deepEqual(snapshot(root), before, name);
  }
  // The shape of a fresh template: an empty learner kind and no school key.
  const fresh = oldInstall((b) => {
    delete b.school;
    b.learner = { kind: '', detail: '' };
  });
  const before = snapshot(fresh);
  assert.equal(runMigration(FILE, fresh).stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(fresh), before);
});

test('0002: a learner who already chose a kind is left alone, even with a school block', () => {
  const root = oldInstall((b) => {
    b.learner = { kind: 'degree', detail: '' };
  });
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0002: settings that cannot be read stop it with one sentence; no settings means nothing to do', () => {
  const broken = copyFixture('v0.1.0');
  write(broken, 'config/brain.json', '{oops');
  const before = snapshot(broken);
  const r = runMigration(FILE, broken);
  assert.equal(r.code, 1);
  assert.equal(r.stderr.trim(), 'Your settings file config/brain.json could not be read, so I changed nothing. Run /health-check, then finish the update again.');
  assert.deepEqual(snapshot(broken), before);

  const notAnObject = copyFixture('v0.1.0');
  write(notAnObject, 'config/brain.json', '[1, 2]');
  assert.equal(runMigration(FILE, notAnObject).code, 1);

  const none = copyFixture('v0.1.0');
  write(none, 'config/brain.json', '{}');
  assert.equal(runMigration(FILE, none).stdout.trim(), 'Nothing to do.', 'an empty object has no school block');
  const missing = copyFixture('v0.1.0');
  rmSync(abs(missing, 'config/brain.json'));
  const before2 = snapshot(missing);
  const rm = runMigration(FILE, missing);
  assert.equal(rm.code, 0);
  assert.equal(rm.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(missing), before2);
});

test('0002: --dry-run says what would change and writes nothing', () => {
  const root = copyFixture('v0.1.0');
  const before = snapshot(root);
  const r = runMigration(FILE, root, ['--dry-run']);
  assert.equal(r.code, 0);
  for (const l of r.stdout.trim().split(/\r?\n/)) assert.match(l, /^Would: /);
  assert.deepEqual(snapshot(root), before);
});
