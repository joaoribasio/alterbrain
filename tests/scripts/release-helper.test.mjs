// The release-test switch (tests/fixtures/scripts/release.mjs): slow tests run only with ALTERBRAIN_SLOW_TESTS=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_SKIP_REASON, release } from '../fixtures/scripts/release.mjs';

test('release tests are skipped with the stated reason unless ALTERBRAIN_SLOW_TESTS is 1', () => {
  assert.deepEqual(release({}, {}), { skip: RELEASE_SKIP_REASON });
  assert.deepEqual(release({}, { ALTERBRAIN_SLOW_TESTS: '0' }), { skip: RELEASE_SKIP_REASON });
  assert.deepEqual(release({}, { ALTERBRAIN_SLOW_TESTS: '1' }), {});
  assert.match(RELEASE_SKIP_REASON, /ALTERBRAIN_SLOW_TESTS=1 before a release/);
});

test('a skip the test already had wins and keeps its reason; other options pass through', () => {
  assert.deepEqual(release({ skip: 'no Quarto' }, {}), { skip: 'no Quarto' });
  assert.deepEqual(release({ skip: 'no Quarto' }, { ALTERBRAIN_SLOW_TESTS: '1' }), { skip: 'no Quarto' });
  assert.deepEqual(release({ skip: false, timeout: 5 }, {}), { skip: RELEASE_SKIP_REASON, timeout: 5 });
  assert.deepEqual(release({ timeout: 5 }, { ALTERBRAIN_SLOW_TESTS: '1' }), { timeout: 5 });
});
