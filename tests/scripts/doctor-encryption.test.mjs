// doctor.mjs checks for the optional encryption of private notes (ADR 0019). Quiet when it is off; four plain checks
// with one-line fixes when it is on. Uses the stand-in for git-crypt, so it runs anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { release } from '../fixtures/scripts/release.mjs';
import {
  FAKE_GIT_CRYPT, NOTES, REPO, childEnv, cleanup, git, makeVaultProject, runVk, write,
} from '../fixtures/scripts/vaultkey-helpers.mjs';

function doctor(root, { tool = 'fake', args = [] } = {}) {
  const toolEnv = tool === 'fake' ? { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT } : { ALTERBRAIN_GIT_CRYPT: join(root, 'no-such-tool.exe') };
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'doctor.mjs'), '--json', ...args], {
    cwd: root, encoding: 'utf8', env: childEnv(root, toolEnv), windowsHide: true, timeout: 180_000,
  });
  return JSON.parse(res.stdout);
}
const check = (out, id) => out.checks.find((c) => c.id === id);
const encryptionChecks = (out) => out.checks.filter((c) => c.id.startsWith('encryption-'));

test('doctor stays quiet about encryption when it is off', release(), () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.deepEqual(encryptionChecks(doctor(root)), []);
  } finally {
    cleanup(parent);
  }
});

test('doctor reports a computer that is on but locked, with a one-line fix for each problem', release(), () => {
  const { parent, root } = makeVaultProject({ enabled: true });
  try {
    const out = doctor(root);
    assert.equal(check(out, 'encryption-tool').status, 'ok');
    const locked = check(out, 'encryption-unlocked');
    assert.equal(locked.status, 'warn');
    assert.match(locked.fix, /vault-key\.mjs unlock --key/);
    assert.equal(check(out, 'encryption-files').status, 'fail', 'the settings that choose the encrypted notes are missing');
    assert.match(check(out, 'encryption-files').fix, /vault-key\.mjs setup/);
    assert.equal(check(out, 'encryption-backup').status, 'warn');

    const noTool = doctor(root, { tool: 'none' });
    const tool = check(noTool, 'encryption-tool');
    assert.equal(tool.status, 'warn');
    assert.match(tool.fix, /^Run: /);
    for (const c of encryptionChecks(noTool)) assert.ok(c.status === 'ok' || (c.fix && !/\n/.test(c.fix)), `${c.id} has a one-line fix`);
  } finally {
    cleanup(parent);
  }
});

test('doctor: set up, then a stored plain note, then the key backup tested', release(), () => {
  const { parent, root } = makeVaultProject();
  try {
    write(root, NOTES.person, '# Jamie\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'notes']);
    assert.equal(runVk(root, ['setup']).code, 0);

    let out = doctor(root);
    assert.equal(check(out, 'encryption-tool').status, 'ok');
    assert.equal(check(out, 'encryption-unlocked').status, 'ok');
    assert.equal(check(out, 'encryption-files').status, 'ok');
    assert.match(check(out, 'encryption-files').detail, /1 of 1 saved private notes are encrypted/);
    const backup = check(out, 'encryption-backup');
    assert.equal(backup.status, 'warn');
    assert.match(backup.fix, /vault-key\.mjs export/);

    write(root, 'vault/60_people/Sam.md', '# Sam\n');
    git(root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'add', 'vault/60_people/Sam.md']);
    out = doctor(root);
    assert.equal(check(out, 'encryption-files').status, 'fail');
    assert.match(check(out, 'encryption-files').detail, /1 saved private note\(s\) are stored without encryption/);
    assert.equal(runVk(root, ['setup']).code, 0);

    const key = join(parent, 'keys', 'vault-key-test.key');
    assert.equal(runVk(root, ['export', '--out', key]).code, 0);
    assert.equal(runVk(root, ['check', '--key', key]).code, 0);
    out = doctor(root);
    assert.equal(check(out, 'encryption-backup').status, 'ok');
    assert.match(check(out, 'encryption-backup').detail, /Last tested on \d{4}-\d{2}-\d{2}/);
    assert.equal(encryptionChecks(out).every((c) => c.status === 'ok'), true);
  } finally {
    cleanup(parent);
  }
});

test('doctor --ci does not look at this computer\'s encryption', release(), () => {
  const { parent, root } = makeVaultProject({ enabled: true });
  try {
    assert.deepEqual(encryptionChecks(doctor(root, { args: ['--ci'] })), []);
  } finally {
    cleanup(parent);
  }
});
