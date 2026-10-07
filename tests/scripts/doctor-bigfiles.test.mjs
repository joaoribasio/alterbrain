// doctor.mjs and the big-file safety net for Obsidian Git (ADR 0020): is the check that Git runs before every save in
// place, and is a saved file too big for GitHub waiting to be uploaded? Real temporary repositories; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO, bytes, childEnv, cleanup, git, makeProject, runAuto, write } from '../fixtures/scripts/lfs-helpers.mjs';

function doctor(root, { env = {}, args = [] } = {}) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'doctor.mjs'), '--json', ...args], {
    cwd: root, encoding: 'utf8', env: childEnv(root, env), windowsHide: true, timeout: 180_000,
  });
  return JSON.parse(res.stdout);
}
const check = (out, id) => out.checks.find((c) => c.id === id);

test('doctor: the big-file check for Obsidian Git is a warning with one fix line until it is installed, then ok', () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    const before = check(doctor(root), 'big-file-hook');
    assert.equal(before.status, 'warn');
    assert.match(before.detail, /not installed/);
    assert.equal(before.fix, 'Run: node system/scripts/git-auto.mjs hook');

    assert.equal(runAuto(root, 'hook').code, 0);
    const after = check(doctor(root), 'big-file-hook');
    assert.equal(after.status, 'ok');
    assert.match(after.detail, /Obsidian Git and other Git tools send files of 50 MB or more to Git LFS/);
    assert.equal(after.fix, null);
    assert.equal(check(doctor(root, { args: ['--ci'] }), 'big-file-hook').status, 'skip', 'about one computer, not the repository');
  } finally {
    cleanup(parent);
  }
});

test('doctor: someone else\'s pre-commit hook, and a shared hooks folder, are warnings that say what is at stake', () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    write(root, '.git/hooks/pre-commit', '#!/bin/sh\nexit 0\n');
    const foreign = check(doctor(root), 'big-file-hook');
    assert.equal(foreign.status, 'warn');
    assert.match(foreign.detail, /Another tool already has a check/);
    assert.ok(foreign.fix && !/\n/.test(foreign.fix));
  } finally {
    cleanup(parent);
  }
  const other = makeProject({ framework: true });
  try {
    git(other.root, ['config', 'core.hooksPath', 'shared-hooks']);
    const shared = check(doctor(other.root), 'big-file-hook');
    assert.equal(shared.status, 'warn');
    assert.match(shared.detail, /shared folder/);
  } finally {
    cleanup(other.parent);
  }
});

test('doctor: in developer mode a missing check is fine, and a folder without Git is skipped', () => {
  const { parent, root } = makeProject({ framework: true });
  try {
    write(root, 'state/local/dev-mode', 'test checkout\n');
    assert.equal(check(doctor(root), 'big-file-hook').status, 'ok');
    cleanup(join(root, '.git'));
    assert.equal(check(doctor(root), 'big-file-hook').status, 'skip');
    assert.equal(check(doctor(root), 'big-blobs').status, 'skip');
  } finally {
    cleanup(parent);
  }
});

test('doctor: a saved file that GitHub would refuse is a failure with a fix, and it is gone once the repair is done', () => {
  const { parent, root } = makeProject({ remote: true });
  try {
    const env = { ALTERBRAIN_BLOB_LIMIT_BYTES: '4000' };
    assert.equal(check(doctor(root, { env }), 'big-blobs').status, 'ok');
    assert.equal(check(doctor(root, { env, args: ['--ci'] }), 'big-blobs').status, 'skip');

    write(root, 'vault/recordings/week 1.mov', bytes(6000));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'saved by a phone']);
    const bad = check(doctor(root, { env }), 'big-blobs');
    assert.equal(bad.status, 'fail');
    assert.match(bad.detail, /One saved file is stored as an ordinary file and too big for GitHub/);
    assert.match(bad.detail, /Your work is safe on this computer/);
    assert.doesNotMatch(bad.detail, /week 1/, 'no file name');
    assert.match(bad.fix, /\/health-check/);
    assert.doesNotMatch(bad.fix, /\n/);

    write(root, 'vault/recordings/week 2.mov', bytes(6000));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'again']);
    assert.match(check(doctor(root, { env }), 'big-blobs').detail, /^2 saved files are stored/);

    // The repair: nothing was uploaded yet, so the saved changes are folded into the next save.
    git(root, ['reset', '--soft', '@{u}']);
    assert.equal(runAuto(root, 'commit', { env }).code, 0);
    assert.equal(check(doctor(root, { env }), 'big-blobs').status, 'ok');
  } finally {
    cleanup(parent);
  }
});

test('doctor: no online copy means nothing to check for upload', () => {
  const { parent, root } = makeProject();
  try {
    const c = check(doctor(root), 'big-blobs');
    assert.equal(c.status, 'skip');
  } finally {
    cleanup(parent);
  }
});
