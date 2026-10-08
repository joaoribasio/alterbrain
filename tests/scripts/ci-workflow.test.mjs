// The CI workflow ships to every learner's notes repository (it is a framework file), where each automatic save is a push.
// These checks keep it from running there: it runs only in the framework's own repository, and pushes that change only notes, settings, progress or docs start no run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const release = JSON.parse(readFileSync(join(ROOT, 'system', 'release.json'), 'utf8'));

test('the CI job runs only in the framework repository named in release.json', () => {
  const guard = ci.match(/^\s+if: github\.repository == '([^']+)'\s*$/m);
  assert.ok(guard, 'the check job has an if: github.repository guard');
  assert.equal(guard[1], release.repo, 'the guard names the same repository as system/release.json');
});

test('a push or pull request starts a run only when framework code, rules, tests or what validate reads change', () => {
  for (const event of ['push', 'pull_request']) {
    const block = ci.match(new RegExp(`^  ${event}:\n((?:    .*\n|      .*\n)+)`, 'm'));
    assert.ok(block, `${event} has its own settings`);
    assert.ok(block[1].startsWith('    paths:\n'), `${event} uses a positive paths filter`);
    assert.ok(!block[1].includes('paths-ignore'), `${event} does not use paths-ignore`);
    for (const path of ['system/**', '.claude/**', 'tests/**', '.github/**', 'CHANGELOG.md', 'CLAUDE.md', '.gitattributes', '.gitignore']) {
      assert.ok(block[1].includes(`- '${path}'`), `${event} runs for ${path}`);
    }
    for (const folder of ['vault/**', 'config/**', 'state/**', 'docs/**']) {
      assert.ok(!block[1].includes(folder), `${event} does not run for ${folder}`);
    }
  }
});

test('CI runs the regular set: the release tests are not switched on', () => {
  assert.ok(!/ALTERBRAIN_SLOW_TESTS: *['"]?1/.test(ci), 'the workflow does not set ALTERBRAIN_SLOW_TESTS=1');
});

test('a newer push cancels a run still going on the same branch', () => {
  assert.match(ci, /^concurrency:\n  group: ci-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m);
});
