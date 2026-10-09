// The framework's own check workflow in a person's copy (ADR 0031): the shared list, and the installer step in
// setup-github.mjs that removes it from a brand-new copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeProject, runScript, git, write, cleanup, existsSync, join } from '../fixtures/ops/helpers.mjs';
import { CI_REL, FRAMEWORK_CI_SHA256, frameworkCiState, removeFrameworkCi, sha256Lf } from '../../system/lib/frameworkci.mjs';
import { REPO } from '../fixtures/migrations/helpers.mjs';

const RELEASE = { name: 'alterbrain', version: '0.2.3', tag: 'v0.2.3', repo: 'joaoribasio/alterbrain' };
const released = (tag) => readFileSync(join(REPO, 'tests', 'fixtures', 'migrations', 'framework-ci', `${tag}-ci.yml`), 'utf8');

/** A fresh copy as the installer leaves it before the first update: public origin, framework workflow in place. */
function freshCopy({ ci = released('v0.2.2'), dev = false } = {}) {
  const p = makeProject({ dev });
  write(join(p.root, 'system', 'release.json'), JSON.stringify(RELEASE));
  if (ci !== null) write(join(p.root, CI_REL), ci);
  git(p.root, ['add', '-A']);
  git(p.root, ['commit', '-m', 'release']);
  git(p.root, ['remote', 'add', 'origin', 'https://github.com/joaoribasio/alterbrain.git']);
  return p;
}

test('the workflow in this repository is a version the list knows (change the list when the workflow changes)', () => {
  const current = sha256Lf(readFileSync(join(REPO, ...CI_REL.split('/'))));
  assert.ok(FRAMEWORK_CI_SHA256.includes(current), `add ${current} to FRAMEWORK_CI_SHA256 in system/lib/frameworkci.mjs, and a fixture, when the workflow changes`);
});

test('frameworkCiState and removeFrameworkCi: released, changed and missing files', () => {
  const p = freshCopy();
  try {
    assert.equal(frameworkCiState(p.root), 'framework');
    assert.equal(removeFrameworkCi(p.root, { dryRun: true }), 'framework');
    assert.equal(existsSync(join(p.root, CI_REL)), true, 'a dry run deletes nothing');
    assert.equal(removeFrameworkCi(p.root), 'framework');
    assert.equal(existsSync(join(p.root, '.github')), false);
    assert.equal(removeFrameworkCi(p.root), 'absent');
    write(join(p.root, CI_REL), released('v0.2.2').replace(/\n/g, '\r\n'));
    assert.equal(frameworkCiState(p.root), 'framework', 'CRLF on disk still matches');
    write(join(p.root, CI_REL), 'name: mine\n');
    assert.equal(removeFrameworkCi(p.root), 'custom');
    assert.equal(existsSync(join(p.root, CI_REL)), true, 'a changed file is never deleted');
  } finally {
    cleanup(p.parent);
  }
});

test('a new copy loses the framework workflow when the installer disconnects the public repo; the deletion is left for the next save', () => {
  const p = freshCopy();
  try {
    const dry = JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--dry-run', '--json'], p.root).stdout);
    assert.deepEqual(dry.steps.map((s) => s.id), ['record-origin', 'remove-origin', 'framework-ci']);
    assert.equal(existsSync(join(p.root, CI_REL)), true, 'a dry run deletes nothing');

    const r = runScript('setup-github.mjs', ['--detach-only', '--json'], p.root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.steps.map((s) => [s.id, s.status]), [['record-origin', 'done'], ['remove-origin', 'done'], ['framework-ci', 'done']]);
    assert.equal(existsSync(join(p.root, CI_REL)), false);
    assert.equal(existsSync(join(p.root, '.github')), false);
    assert.equal(git(p.root, ['remote']), '', 'the public origin is gone');
    assert.match(git(p.root, ['status', '--porcelain']), /D \.github\/workflows\/ci\.yml/, 'the deletion waits for the next save');
  } finally {
    cleanup(p.parent);
  }
});

test('the installer step leaves a workflow the person changed alone, says so, and never touches developer mode', () => {
  const custom = freshCopy({ ci: 'name: Mine\n' });
  const dev = freshCopy({ dev: true });
  try {
    const out = JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--json'], custom.root).stdout);
    const step = out.steps.find((s) => s.id === 'framework-ci');
    assert.equal(step.status, 'skipped');
    assert.match(step.text, /not an Alterbrain version, so it was left alone/);
    assert.equal(existsSync(join(custom.root, CI_REL)), true);

    const devOut = JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--json'], dev.root).stdout);
    assert.deepEqual(devOut.steps.map((s) => s.id), ['dev-mode']);
    assert.equal(existsSync(join(dev.root, CI_REL)), true, 'the framework folder keeps its workflow');
  } finally {
    cleanup(custom.parent, dev.parent);
  }
});

test('a copy without the workflow, or already on its own repo, gets no extra step', () => {
  const none = freshCopy({ ci: null });
  const own = freshCopy();
  try {
    git(own.root, ['remote', 'set-url', 'origin', 'https://github.com/alex-doe/my-alterbrain.git']);
    assert.deepEqual(JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--json'], none.root).stdout).steps.map((s) => s.id), ['record-origin', 'remove-origin']);
    assert.deepEqual(JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--json'], own.root).stdout).steps.map((s) => s.id), ['no-public-origin']);
    assert.equal(existsSync(join(own.root, CI_REL)), true, 'upgrade 0008 handles an older copy, not the installer');
  } finally {
    cleanup(none.parent, own.parent);
  }
});
