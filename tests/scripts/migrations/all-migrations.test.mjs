// The shared harness for every upgrade script in system/scripts/migrations/ (policy: .claude/rules/framework-dev.md).
// New migrations are found automatically: this test needs no edit when one is added.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_NAMES, MIGRATIONS_DIR, cleanup, copyFixture, listGuided, listMigrations, runMigration, snapshot } from '../../fixtures/migrations/helpers.mjs';
import { release } from '../../fixtures/scripts/release.mjs';

after(cleanup);

const migrations = listMigrations();

test('there are upgrade scripts to test', () => {
  assert.ok(migrations.length >= 4, migrations.join(', '));
});

test('guided upgrades (.md) are not scripts: the harness never runs them, and they share the number space', () => {
  assert.ok(listGuided().length >= 1);
  assert.ok(migrations.every((n) => n.endsWith('.mjs')));
  const numbers = [...migrations, ...listGuided()].map((n) => n.slice(0, 4));
  assert.equal(new Set(numbers).size, numbers.length, 'one number is one file, of either kind');
});

for (const name of FIXTURE_NAMES) {
  test(`every upgrade runs twice on ${name}: first without errors, then with "Nothing to do." and no change`, name === 'v0.2-online' ? release() : {}, () => {
    const root = copyFixture(name);
    const fresh = name.startsWith('v0.2');
    const start = snapshot(root);

    for (const file of migrations) {
      const r = runMigration(file, root);
      assert.equal(r.code, 0, `${file}: ${r.stderr}`);
      assert.equal(r.stderr, '', `${file} wrote to standard error`);
    }
    // update.mjs records a fresh install's upgrades as done without running them, but a script can still meet new-shape
    // data (a re-run, a hand edit, a copy that lost its record): it must leave 0.2 data exactly as it is.
    if (fresh) assert.deepEqual(snapshot(root), start, 'a 0.2 install is changed by an upgrade');

    const afterFirst = snapshot(root);
    for (const file of migrations) {
      const r = runMigration(file, root);
      assert.equal(r.code, 0, `${file}: ${r.stderr}`);
      assert.equal(r.stdout.trim(), 'Nothing to do.', `${file} is not idempotent`);
      assert.deepEqual(snapshot(root), afterFirst, `${file} changed something on its second run`);
    }
    assert.deepEqual(snapshot(root).filter(([p]) => p.endsWith('.ab-tmp')), [], 'a temporary file was left behind');
  });
}

test('every upgrade stays in step with a dry run: it says what it would do and writes nothing', release(), () => {
  for (const name of FIXTURE_NAMES) {
    const root = copyFixture(name);
    const before = snapshot(root);
    for (const file of migrations) {
      const r = runMigration(file, root, ['--dry-run']);
      assert.equal(r.code, 0, `${file}: ${r.stderr}`);
      for (const line of r.stdout.trim().split(/\r?\n/)) assert.match(line, /^(Would: .+|Nothing to do\.)$/, `${file}: ${line}`);
    }
    assert.deepEqual(snapshot(root), before, `${name}: a dry run changed a file`);
  }
});

test('an upgrade script refuses a command line it does not know', () => {
  const root = copyFixture('v0.2-professional');
  for (const file of migrations) {
    const r = runMigration(file, root, ['--nope']);
    assert.equal(r.code, 2, file);
    assert.match(r.stderr, /Usage:/);
  }
});

test('every upgrade script follows the house rules: header lines, imports and no direct writes', () => {
  for (const file of migrations) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const lines = text.split(/\r?\n/);
    assert.equal(lines[0], '#!/usr/bin/env node', `${file}: line 1`);
    assert.match(lines[1], /^\/\/ ab-migration: \S.+\.$/, `${file}: line 2 is one sentence`);
    for (const m of text.matchAll(/^import .* from '([^']+)';?$/gm)) {
      assert.match(m[1], /^(node:[a-z_:/]+|\.\.\/\.\.\/lib\/[a-z]+\.mjs)$/, `${file}: imports only node: modules and ../../lib/*.mjs (${m[1]})`);
    }
    assert.match(text, /runMigration\(/, `${file} runs through system/lib/migrate.mjs`);
    assert.doesNotMatch(text, /\b(writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|copyFileSync|writeText|writeJson)\b/, `${file} writes only through the migrate.mjs helpers or tasks.mjs`);
  }
});
