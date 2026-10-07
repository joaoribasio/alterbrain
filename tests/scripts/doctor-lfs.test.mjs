// doctor.mjs checks for big files (ADR 0020): the Git LFS wording, the size of the saved history, and (when
// encryption of private notes is on) the upload check inside git. Real temporary repositories; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  REPO_NOTE_KIB, REPO_WARN_KIB, describeLimit, describeSize, parseCountObjects, renderCheck, repoSizeVerdict,
} from '../../system/scripts/doctor.mjs';
import { REPO, childEnv, cleanup, makeProject, write } from '../fixtures/scripts/lfs-helpers.mjs';
import { FAKE_GIT_CRYPT, makeVaultProject, runVk } from '../fixtures/scripts/vaultkey-helpers.mjs';

function doctor(root, { env = {}, args = [] } = {}) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'doctor.mjs'), '--json', ...args], {
    cwd: root, encoding: 'utf8', env: childEnv(root, env), windowsHide: true, timeout: 180_000,
  });
  return JSON.parse(res.stdout);
}
const check = (out, id) => out.checks.find((c) => c.id === id);
const GIB = 1024 * 1024; // KiB

/* ---------------- the pieces ---------------- */

test('parseCountObjects reads the sizes from "git count-objects -v"', () => {
  const text = 'count: 12\nsize: 48\nin-pack: 900\npacks: 2\nsize-pack: 2048\nprune-packable: 0\ngarbage: 0\nsize-garbage: 0\n';
  assert.deepEqual(parseCountObjects(text), { loose_kib: 48, pack_kib: 2048 });
  assert.deepEqual(parseCountObjects('size-pack: 10\n'), { loose_kib: 0, pack_kib: 10 });
  assert.equal(parseCountObjects(''), null);
  assert.equal(parseCountObjects('fatal: not a git repository'), null);
  assert.equal(parseCountObjects(undefined), null);
});

test('repoSizeVerdict: fine under 1 GB, a gentle tip from 1 GB, a warning from 4 GB, each with at most one plain line of advice', () => {
  assert.equal(REPO_NOTE_KIB, GIB);
  assert.equal(REPO_WARN_KIB, 4 * GIB);
  const small = repoSizeVerdict(300 * 1024);
  assert.deepEqual([small.level, small.status, small.fix, small.tip], ['ok', 'ok', null, null]);
  assert.match(small.detail, /300 MB/);

  const justUnder = repoSizeVerdict(GIB - 1);
  assert.equal(justUnder.level, 'ok');

  const note = repoSizeVerdict(GIB);
  assert.deepEqual([note.level, note.status, note.fix], ['note', 'ok', null], 'a note is not a problem');
  assert.match(note.detail, /1\.0 GB/);
  assert.match(note.tip, /GitHub recommends keeping repositories small/);
  assert.match(note.tip, /vault\/40_sources\/raw\/_local\//);

  const stillNote = repoSizeVerdict(4 * GIB - 1);
  assert.equal(stillNote.level, 'note');

  const warn = repoSizeVerdict(4 * GIB);
  assert.deepEqual([warn.level, warn.status, warn.tip], ['warn', 'warn', null]);
  assert.match(warn.detail, /4\.0 GB/);
  assert.match(warn.fix, /vault\/40_sources\/raw\/_local\//);
  assert.match(warn.fix, /\/health-check/);
  for (const v of [note, warn]) for (const text of [v.tip, v.fix]) if (text) assert.doesNotMatch(text, /\n/, 'one line');
  assert.match(repoSizeVerdict(12.5 * GIB).detail, /12\.5 GB/);
});

test('describeSize and describeLimit', () => {
  assert.equal(describeSize(1), '1 MB');
  assert.equal(describeSize(1536), '2 MB');
  assert.equal(describeSize(GIB * 1.26), '1.3 GB');
  assert.equal(describeLimit(50 * 1024 * 1024), '50 MB');
  assert.equal(describeLimit(1.5 * 1024 * 1024), '1.5 MB');
});

test('renderCheck prints a "Fix:" for a problem and a "Tip:" for advice on a check that is fine', () => {
  assert.deepEqual(renderCheck({ status: 'ok', label: 'Backup size', detail: 'Fine.' }), ['[ok]   Backup size: Fine.']);
  assert.deepEqual(renderCheck({ status: 'ok', label: 'Backup size', detail: 'Big.', tip: 'Trim it.' }), ['[ok]   Backup size: Big.', '       Tip: Trim it.']);
  assert.deepEqual(renderCheck({ status: 'warn', label: 'Backup size', detail: 'Huge.', fix: 'Do this.', tip: 'ignored' }), ['[!]    Backup size: Huge.', '       Fix: Do this.']);
  assert.deepEqual(renderCheck({ status: 'skip', label: 'X', detail: '' }), ['[skip] X']);
});

/* ---------------- the real check ---------------- */

test('doctor: Git LFS is described as the home of files of 50 MB or more, and a missing one is a warning with one fix line', () => {
  const { parent, root } = makeProject();
  try {
    const here = check(doctor(root), 'git-lfs');
    if (here.status === 'ok') assert.match(here.detail, /files of 50 MB or more; everything else is saved as a normal file/);

    const custom = check(doctor(root, { env: { ALTERBRAIN_LFS_MIN_BYTES: String(10 * 1024 * 1024) } }), 'git-lfs');
    if (custom.status === 'ok') assert.match(custom.detail, /files of 10 MB or more/);

    const missing = check(doctor(root, { env: { ALTERBRAIN_GIT_LFS: 'none' } }), 'git-lfs');
    assert.equal(missing.status, 'warn');
    assert.match(missing.detail, /Only files of 50 MB or more need it/);
    assert.match(missing.detail, /your notes and documents are saved normally/);
    assert.doesNotMatch(missing.detail, /PDFs and slides cannot be stored/, 'the old wording is gone');
    assert.match(missing.fix, /^Run: |Install it with/);
    assert.doesNotMatch(missing.fix, /\n/);

    // The limit follows config/brain.json.
    write(root, 'config/brain.json', JSON.stringify({ git: { lfs_min_mb: 20 } }));
    const configured = check(doctor(root, { env: { ALTERBRAIN_GIT_LFS: 'none' } }), 'git-lfs');
    assert.match(configured.detail, /Only files of 20 MB or more/);
  } finally {
    cleanup(parent);
  }
});

test('doctor: the backup size check reads the real repository, and is skipped in CI mode and without a repository', () => {
  const { parent, root } = makeProject();
  try {
    const size = check(doctor(root), 'repo-size');
    assert.equal(size.status, 'ok');
    assert.match(size.detail, /^The saved history of your notes is \d+ MB\.$/);
    assert.equal(size.fix, null);
    assert.equal(check(doctor(root, { args: ['--ci'] }), 'repo-size').status, 'skip');
  } finally {
    cleanup(parent);
  }
  const bare = makeProject();
  try {
    cleanup(join(bare.root, '.git'));
    assert.equal(check(doctor(bare.root), 'repo-size').status, 'skip');
  } finally {
    cleanup(bare.parent);
  }
});

test('doctor: when encryption is on, the upload check inside git is reported, with one line of advice when it is not in place', () => {
  const { parent, root } = makeVaultProject({ enabled: true });
  try {
    const env = { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT };
    const before = check(doctor(root, { env }), 'encryption-push-hook');
    assert.ok(before, 'the row exists once encryption is on');
    assert.equal(before.status, 'warn');
    assert.ok(before.fix && !/\n/.test(before.fix));

    const setup = runVk(root, ['setup']);
    assert.equal(setup.code, 0, setup.stdout + setup.stderr);
    const after = check(doctor(root, { env }), 'encryption-push-hook');
    assert.equal(after.status, 'ok', JSON.stringify(after));
    assert.match(after.detail, /Obsidian Git/);
    assert.equal(check(doctor(root, { env, args: ['--ci'] }), 'encryption-push-hook'), undefined, 'not reported in CI mode (encryption checks are about one computer)');
  } finally {
    cleanup(parent);
  }
});

test('doctor: no row about the upload check while encryption is off', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(check(doctor(root), 'encryption-push-hook'), undefined);
  } finally {
    cleanup(parent);
  }
});
