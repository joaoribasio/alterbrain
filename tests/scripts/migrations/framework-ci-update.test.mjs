// A copy installed from release 0.2.0 holds the framework's check workflow. An update must leave it with no workflow and
// with a clean health check (ADR 0031): updates never write under .github/, so upgrade 0008 deletes the file, and the
// health check does not compare files that updates do not deliver.
//
// The release source is the current tree of this repository, copied to a folder with a manifest built at run time (the
// committed manifest is only written at release time), and run through update.mjs plan, apply-safe and finish.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { REPO, FIXTURES, abs, cleanup, copyFixture, exists, read, readJsonIn, write } from '../../fixtures/migrations/helpers.mjs';
import { release } from '../../fixtures/scripts/release.mjs';
import { buildManifest, listFrameworkFiles } from '../../../system/lib/manifest.mjs';

const NEXT = { version: '0.2.3', tag: 'v0.2.3' };
const CI_REL = '.github/workflows/ci.yml';
const dirs = [];
after(() => {
  cleanup();
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const tmpDir = (name) => {
  const base = join(REPO, 'state', 'local', 'tmp');
  mkdirSync(base, { recursive: true });
  const dir = join(base, `${name}-${randomBytes(6).toString('hex')}`);
  dirs.push(dir);
  return dir;
};

let releaseDir = null;
/** The current tree as a release folder (built once): every framework file plus a manifest that lists them. */
function currentRelease() {
  if (releaseDir) return releaseDir;
  const dir = tmpDir('release-tree');
  for (const rel of listFrameworkFiles(REPO)) {
    const to = join(dir, ...rel.split('/'));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(REPO, ...rel.split('/')), to);
  }
  const rel = JSON.parse(readFileSync(join(REPO, 'system', 'release.json'), 'utf8'));
  writeFileSync(join(dir, 'system', 'release.json'), JSON.stringify({ ...rel, ...NEXT }, null, 2) + '\n');
  writeFileSync(join(dir, 'system', 'manifest.json'), JSON.stringify(buildManifest(dir), null, 2));
  releaseDir = dir;
  return dir;
}

const git = (root, args) => spawnSync('git', ['-c', 'user.name=Alex Doe', '-c', 'user.email=alex@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
  cwd: root, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'), GIT_TERMINAL_PROMPT: '0' },
});

/**
 * A copy as release 0.2.0 left it: the workflow of that release on disk and in its manifest, the upgrade scripts that
 * release came with (0001 to 0007) listed and on disk, and no record of any upgrade having run.
 */
function installV020({ ci = readFileSync(join(FIXTURES, 'framework-ci', 'v0.2.0-ci.yml')), fixture = 'v0.2-professional' } = {}) {
  const root = copyFixture(fixture);
  const files = {};
  const migrations = join(REPO, 'system', 'scripts', 'migrations');
  for (const name of numbered(migrations).filter((n) => !n.startsWith('0008-'))) {
    const buf = readFileSync(join(migrations, name));
    files[`system/scripts/migrations/${name}`] = { class: 'code', sha256: sha(buf) };
    write(root, `system/scripts/migrations/${name}`, buf);
  }
  if (ci) {
    files[CI_REL] = { class: 'code', sha256: sha(readFileSync(join(FIXTURES, 'framework-ci', 'v0.2.0-ci.yml'))) };
    mkdirSync(dirname(abs(root, CI_REL)), { recursive: true });
    writeFileSync(abs(root, CI_REL), ci);
  }
  writeFileSync(abs(root, 'system/release.json'), JSON.stringify({ name: 'alterbrain', version: '0.2.0', tag: 'v0.2.0', repo: 'joaoribasio/alterbrain' }, null, 2) + '\n');
  writeFileSync(abs(root, 'system/manifest.json'), JSON.stringify({ schema: 1, version: '0.2.0', tag: 'v0.2.0', files }, null, 2));
  assert.equal(git(root, ['init', '-q', '-b', 'main']).status, 0);
  assert.equal(git(root, ['add', '-A']).status, 0);
  assert.equal(git(root, ['commit', '-q', '-m', 'start']).status, 0);
  return root;
}

const numbered = (dir) => readdirSync(dir).filter((n) => /^\d{4}-/.test(n)).sort();

function update(root, args) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'update.mjs'), ...args, '--no-commit'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 300_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ALTERBRAIN_ALLOW_CUSTOM_SOURCE: '1' },
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/** Run the updated copy's own health check and return the "Framework files" result. */
function frameworkFilesCheck(root) {
  const res = spawnSync(process.execPath, [join(root, 'system', 'scripts', 'doctor.mjs'), '--json'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 300_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const out = JSON.parse(res.stdout);
  return out.checks.find((c) => c.id === 'manifest');
}

function runUpdate(root) {
  const source = currentRelease();
  const plan = JSON.parse(update(root, ['plan', NEXT.tag, '--json', '--source-dir', source]).stdout);
  assert.equal(update(root, ['apply-safe', NEXT.tag]).code, 0);
  const fin = update(root, ['finish', NEXT.tag, '--json', '--no-doctor']);
  assert.equal(fin.code, 0, fin.stdout + fin.stderr);
  return { plan, fin: JSON.parse(fin.stdout) };
}

test('a copy from 0.2.0 that is updated ends with no check workflow and a clean health check', release(), () => {
  const root = installV020();
  assert.equal(exists(root, CI_REL), true);

  const { plan, fin } = runUpdate(root);
  const ci = plan.files.find((f) => f.path === CI_REL);
  assert.equal(ci.action, 'unchanged', 'the plan does not deliver the workflow');
  assert.deepEqual(plan.migrations_pending.map((m) => m.id), ['0008-remove-framework-ci.mjs'], 'only the new upgrade is pending');
  assert.equal(fin.ok, true);
  assert.deepEqual(fin.migrations_run, ['0008-remove-framework-ci.mjs']);
  assert.match(fin.migration_notes['0008-remove-framework-ci.mjs'], /^Deleted the Alterbrain check workflow/);

  assert.equal(exists(root, CI_REL), false, 'the workflow is gone');
  assert.equal(exists(root, '.github'), false, 'and so is the empty folder');
  assert.equal(readJsonIn(root, 'system/release.json').version, NEXT.version);
  const check = frameworkFilesCheck(root);
  assert.equal(check.status, 'ok', check.detail);
  assert.doesNotMatch(check.detail, /ci\.yml/);
});

test('a copy with a workflow of its own keeps it: one task, and the health check does not fail on it', release(), () => {
  const root = installV020({ ci: Buffer.from('name: Mine\non: workflow_dispatch\n') });
  const { fin } = runUpdate(root);
  assert.equal(fin.ok, true);
  assert.match(fin.migration_notes['0008-remove-framework-ci.mjs'], /^Left \.github\/workflows\/ci\.yml alone/);
  assert.equal(read(root, CI_REL), 'name: Mine\non: workflow_dispatch\n');
  assert.equal(read(root, 'vault/00_inbox/Tasks.md').split(/\r?\n/).filter((l) => l.includes('check workflow')).length, 1);
  const check = frameworkFilesCheck(root);
  assert.equal(check.status, 'ok', check.detail);
});

test('a copy whose workflow was deleted earlier is not reported as missing files', release(), () => {
  const root = installV020({ ci: null });
  // the old manifest lists the workflow, the person already deleted it
  const manifest = readJsonIn(root, 'system/manifest.json');
  manifest.files[CI_REL] = { class: 'code', sha256: sha(readFileSync(join(FIXTURES, 'framework-ci', 'v0.2.0-ci.yml'))) };
  writeFileSync(abs(root, 'system/manifest.json'), JSON.stringify(manifest, null, 2));
  const { plan, fin } = runUpdate(root);
  assert.equal(plan.files.find((f) => f.path === CI_REL).action, 'unchanged');
  assert.equal(fin.ok, true);
  assert.deepEqual(fin.migrations_run, ['0008-remove-framework-ci.mjs']);
  assert.equal(exists(root, '.github'), false, 'nothing was added under .github');
  const check = frameworkFilesCheck(root);
  assert.equal(check.status, 'ok', check.detail);
});

test('doctor: the Framework files check ignores any path that updates do not deliver', release(), () => {
  const root = installV020();
  runUpdate(root);
  // a workflow written by hand after the update, in any shape, is not a framework-file problem
  write(root, CI_REL, 'name: Anything\n');
  assert.equal(frameworkFilesCheck(root).status, 'ok');
  // a real framework file that differs is still a failure
  const target = 'system/lib/fsx.mjs';
  write(root, target, read(root, target) + '\n// edited\n');
  const bad = frameworkFilesCheck(root);
  assert.equal(bad.status, 'fail');
  assert.match(bad.detail, /fsx\.mjs/);
  assert.doesNotMatch(bad.detail, /ci\.yml/);
  assert.equal(existsSync(abs(root, CI_REL)), true);
});
