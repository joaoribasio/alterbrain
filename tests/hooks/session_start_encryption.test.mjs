// The session digest when encryption of private notes is on (ADR 0019): one warning line when this copy is locked or
// the tool is missing, one reminder line while the key backup is untested. Silent when encryption is off.
// It also keeps git's upload check for private notes in place (quietly) and speaks up only when another tool's hook is in the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyPrePush, writeAttributeFiles } from '../../system/lib/vaultkey.mjs';
import { cleanup, makeVaultProject, runInProject, runVk, git } from '../fixtures/scripts/vaultkey-helpers.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const START = JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' });

function digest(root, opts = {}) {
  const r = runInProject(root, 'system/hooks/session_start.mjs', [], { input: START, ...opts });
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  return out.hookSpecificOutput.additionalContext;
}

test('encryption off: the digest says nothing about it', release(), () => {
  const p = makeVaultProject({ framework: true });
  try {
    const text = digest(p.root);
    assert.ok(!/vault key|private notes|git-crypt|encrypt/i.test(text), text);
  } finally {
    cleanup(p.parent);
  }
});

test('encryption on but the tool is missing: one warning with the install command', release(), () => {
  const p = makeVaultProject({ framework: true, enabled: true });
  try {
    const text = digest(p.root, { tool: 'none' });
    const lines = text.split('\n').filter((l) => /git-crypt/.test(l));
    assert.equal(lines.length, 1, text);
    assert.match(lines[0], /The encryption tool \(git-crypt\) is missing on this computer, so changes to private notes are not being saved\. Install it: /);
    assert.ok(!/key backup/.test(text), 'no reminder while the copy cannot be used');
    assert.ok(text.indexOf('Warnings:') !== -1 && text.indexOf('Warnings:') < text.indexOf('git-crypt'));
  } finally {
    cleanup(p.parent);
  }
});

test('encryption on, tool installed, no key here: one warning with the unlock command', release(), () => {
  const p = makeVaultProject({ framework: true, enabled: true });
  try {
    const text = digest(p.root);
    const lines = text.split('\n').filter((l) => /locked/.test(l));
    assert.equal(lines.length, 1, text);
    assert.match(lines[0], /Private notes are locked on this computer, so changes to them are not being saved and their text is unreadable\. Unlock: node system\/scripts\/vault-key\.mjs unlock --key <your key file>/);
    assert.ok(!/key backup/.test(text));
  } finally {
    cleanup(p.parent);
  }
});

test('unlocked but the key backup is untested: one reminder, no warning; after the check, silence', release(), () => {
  const p = makeVaultProject({ framework: true });
  try {
    assert.equal(runVk(p.root, ['setup']).code, 0);
    let text = digest(p.root);
    const reminders = text.split('\n').filter((l) => /vault key backup/.test(l));
    assert.equal(reminders.length, 1, text);
    assert.match(reminders[0], /^Your vault key backup has not been tested\. After handling the user's request, remind them once to run the key check: node system\/scripts\/vault-key\.mjs check --key <their key file>$/);
    assert.ok(!/locked|missing/.test(text), 'no warning on a working copy');

    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    const out = `${p.parent}/keys/vault-key-test.key`;
    assert.equal(runVk(p.root, ['export', '--out', out]).code, 0);
    assert.equal(runVk(p.root, ['check', '--key', out]).code, 0);
    text = digest(p.root);
    assert.ok(!/vault key backup|locked|git-crypt/.test(text), text);
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ the upload check inside git ------------------------------ */

const hookFile = (root) => join(root, '.git', 'hooks', 'pre-push');
const hookKind = (root) => (existsSync(hookFile(root)) ? classifyPrePush(readFileSync(hookFile(root), 'utf8')) : 'absent');

test('encryption off: no upload check is written and the digest says nothing about it', release(), () => {
  const p = makeVaultProject({ framework: true });
  try {
    const text = digest(p.root);
    assert.equal(hookKind(p.root), 'absent');
    assert.ok(!/upload|Obsidian/i.test(text), text);
  } finally {
    cleanup(p.parent);
  }
});

test('encryption on: the session start puts the upload check in place without a word, and does not rewrite it next time', release(), () => {
  const p = makeVaultProject({ framework: true, enabled: true });
  try {
    const text = digest(p.root);
    assert.equal(hookKind(p.root), 'ours');
    assert.ok(!/upload|Obsidian|pre-push/i.test(text), text);
    const before = statSync(hookFile(p.root)).mtimeMs;
    digest(p.root);
    assert.equal(statSync(hookFile(p.root)).mtimeMs, before, 'the file is left alone when it is already right');
  } finally {
    cleanup(p.parent);
  }
});

test('the setting files alone (a fresh download of an encrypted vault) are enough to put the upload check in place', release(), () => {
  const p = makeVaultProject({ framework: true });
  try {
    writeAttributeFiles(p.root);
    assert.equal(hookKind(p.root), 'absent');
    digest(p.root, { tool: 'none' });
    assert.equal(hookKind(p.root), 'ours');
  } finally {
    cleanup(p.parent);
  }
});

test('the standard Git LFS hook is replaced by ours, which carries the LFS step; another tool\'s hook is left alone and the digest says so once', release(), () => {
  const p = makeVaultProject({ framework: true, enabled: true });
  try {
    mkdirSync(join(p.root, '.git', 'hooks'), { recursive: true });
    writeFileSync(hookFile(p.root), '#!/bin/sh\ncommand -v git-lfs >/dev/null 2>&1 || { echo >&2 "no lfs"; exit 2; }\ngit lfs pre-push "$@"\n');
    digest(p.root);
    assert.equal(hookKind(p.root), 'ours');

    const theirs = '#!/bin/sh\nnpx husky pre-push\n';
    writeFileSync(hookFile(p.root), theirs);
    const text = digest(p.root);
    assert.equal(readFileSync(hookFile(p.root), 'utf8'), theirs, 'left alone, byte for byte');
    const lines = text.split('\n').filter((l) => /Another tool already has a check/.test(l));
    assert.equal(lines.length, 1, text);
    assert.match(lines[0], /^- Another tool already has a check that runs before every upload \(the file \.git\/hooks\/pre-push\), so Alterbrain's own check is not installed\./);
    assert.match(lines[0], /Obsidian Git or another Git tool could upload a private note without encryption/);
    assert.match(lines[0], /\/health-check/);
    assert.ok(text.indexOf('Warnings:') !== -1 && text.indexOf('Warnings:') < text.indexOf('Another tool'));
  } finally {
    cleanup(p.parent);
  }
});

test('a shared hooks folder in the git settings: nothing is written, one warning', release(), () => {
  const p = makeVaultProject({ framework: true, enabled: true });
  try {
    const shared = join(p.parent, 'shared-hooks');
    mkdirSync(shared, { recursive: true });
    git(p.root, ['config', 'core.hooksPath', shared]);
    const text = digest(p.root);
    assert.deepEqual(readdirSync(shared), []);
    assert.equal(hookKind(p.root), 'absent');
    assert.equal(text.split('\n').filter((l) => /shared folder for its upload checks/.test(l)).length, 1, text);
  } finally {
    cleanup(p.parent);
  }
});
