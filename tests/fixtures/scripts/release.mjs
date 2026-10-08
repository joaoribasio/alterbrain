// Release tests: the slow ones (2 s or more each). They are skipped in the regular run and run
// only when ALTERBRAIN_SLOW_TESTS=1, which is how the checks are run before a release:
//   PowerShell:  $env:ALTERBRAIN_SLOW_TESTS = '1'; node --test "tests/**/*.test.mjs"
//   bash:        ALTERBRAIN_SLOW_TESTS=1 node --test "tests/**/*.test.mjs"
// Use it as the options argument of node:test: test(name, release(), fn), or release({ skip: ... }) when
// the test already has options. A skip the test already had still wins and keeps its own reason.

export const RELEASE_SKIP_REASON = 'release test: run with ALTERBRAIN_SLOW_TESTS=1 before a release';

export function runReleaseTests(env = process.env) {
  return env.ALTERBRAIN_SLOW_TESTS === '1';
}

/** Options for a release test. Existing options are kept; an existing truthy `skip` takes precedence. */
export function release(options = {}, env = process.env) {
  if (runReleaseTests(env) || options.skip) return { ...options };
  return { ...options, skip: RELEASE_SKIP_REASON };
}
