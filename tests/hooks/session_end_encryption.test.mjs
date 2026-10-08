// The automatic save (session_end hook -> git-auto) when encryption of private notes is on (ADR 0019).
//
// Each test builds a throw-away project with the real hook, library and git-auto script, a local bare repository
// as "origin", and a stand-in for git-crypt (tests/fixtures/scripts/fake-git-crypt.mjs). The checks:
//   - a copy that cannot encrypt (locked, or the tool missing) never stages private notes, saves the rest, adds one task;
//   - a private note that would be stored as plain text is left out of the save;
//   - a push is refused while a commit about to go up holds a private note as plain text, and when the check cannot run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GITCRYPT_HEADER, SCOPE_LABELS, writeAttributeFiles } from '../../system/lib/vaultkey.mjs';
import { release } from '../fixtures/scripts/release.mjs';
import {
  NOTES, blobAt, cleanup, git, gitTry, makeVaultProject, read, runInProject, runVk, write,
} from '../fixtures/scripts/vaultkey-helpers.mjs';

const END = JSON.stringify({ hook_event_name: 'SessionEnd', reason: 'other' });
const sessionEnd = (root, opts = {}) => runInProject(root, 'system/hooks/session_end.mjs', [], { input: END, ...opts });
const gitAuto = (root, args, opts = {}) => runInProject(root, 'system/scripts/git-auto.mjs', args, opts);
const startsEncrypted = (buf) => buf.subarray(0, GITCRYPT_HEADER.length).equals(GITCRYPT_HEADER);

const PRIVATE = ['vault/60_people/Jamie Example.md', 'vault/70_journal/daily/2026-10-07.md', 'vault/80_me/fact-sheet.md'];
const PUBLIC_NOTE = 'vault/30_wiki/concepts/Porter Five Forces.md';

/** A project where encryption is switched on (settings and attribute files are saved and uploaded) but this copy has no key. */
function lockedProject() {
  const p = makeVaultProject({ remote: true, framework: true, enabled: true });
  writeAttributeFiles(p.root);
  git(p.root, ['add', '-A']);
  git(p.root, ['commit', '-q', '-m', 'encryption settings']);
  git(p.root, ['push', '-q']);
  return p;
}

/** A project where setup has run, so this copy can encrypt. */
function unlockedProject() {
  const p = makeVaultProject({ remote: true, framework: true });
  const r = runVk(p.root, ['setup']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  git(p.root, ['add', '-A']);
  git(p.root, ['commit', '-q', '-m', 'encryption on']);
  git(p.root, ['push', '-q']);
  return p;
}

const tasks = (root) => read(root, NOTES.task);
const countOf = (text, needle) => text.split(needle).length - 1;
const remoteHead = (p) => git(p.bare, ['rev-parse', 'main']);
const everInHistory = (root, path) => git(root, ['log', '--all', '--name-only', '--format=']).split('\n').includes(path);

test('a locked copy saves everything except the private notes, uploads, and leaves one task', release(), () => {
  const p = lockedProject();
  try {
    for (const f of PRIVATE) write(p.root, f, 'Private text.\n');
    write(p.root, PUBLIC_NOTE, '# Porter\n');
    const r = sessionEnd(p.root);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), '', 'the hook prints nothing');

    const files = git(p.root, ['show', '--name-only', '--format=', 'HEAD']).split('\n');
    assert.ok(files.includes(PUBLIC_NOTE), 'the public note was saved');
    for (const f of PRIVATE) {
      assert.ok(!everInHistory(p.root, f), `${f} was not saved`);
      assert.equal(read(p.root, f), 'Private text.\n', 'and it is still there, untouched');
    }
    assert.equal(git(p.root, ['rev-parse', 'HEAD']), remoteHead(p), 'the rest was uploaded');
    const text = tasks(p.root);
    assert.match(text, /Your private notes are locked on this computer, so I did not save changes to them\. Unlock with: `node system\/scripts\/vault-key\.mjs unlock --key <your key file>` #ab\/git ⏫/);
    assert.equal(countOf(text, '#ab/git'), 1);

    // Another session with more changes: still one task.
    write(p.root, PRIVATE[0], 'Private text, edited.\n');
    write(p.root, 'vault/30_wiki/concepts/Another.md', '# Another\n');
    sessionEnd(p.root);
    assert.equal(countOf(tasks(p.root), '#ab/git'), 1, 'the task is not repeated');
    assert.ok(!everInHistory(p.root, PRIVATE[0]));
    assert.ok(read(p.root, 'state/local/git.log').includes('locked'));
  } finally {
    cleanup(p.parent);
  }
});

test('a locked copy with no private changes adds no task', release(), () => {
  const p = lockedProject();
  try {
    write(p.root, PUBLIC_NOTE, '# Porter\n');
    sessionEnd(p.root);
    assert.ok(!tasks(p.root).includes('#ab/git'));
    assert.equal(git(p.root, ['rev-parse', 'HEAD']), remoteHead(p));
  } finally {
    cleanup(p.parent);
  }
});

test('with git-crypt missing the private notes are left out too, and the task says how to install it', release(), () => {
  const p = unlockedProject();
  try {
    for (const f of PRIVATE) write(p.root, f, 'Private text.\n');
    write(p.root, PUBLIC_NOTE, '# Porter\n');
    // The key and the settings are there, but the tool has been uninstalled.
    const r = sessionEnd(p.root, { tool: 'none' });
    assert.equal(r.code, 0);
    for (const f of PRIVATE) assert.ok(!everInHistory(p.root, f), f);
    assert.ok(git(p.root, ['show', '--name-only', '--format=', 'HEAD']).split('\n').includes(PUBLIC_NOTE));
    const text = tasks(p.root);
    assert.match(text, /The encryption tool \(git-crypt\) is not installed on this computer, so I did not save changes to your private notes\./);
    assert.match(text, /Install it with: `[^`]+`, then unlock with/);
    assert.equal(countOf(text, '#ab/git'), 1);
  } finally {
    cleanup(p.parent);
  }
});

test('an unlocked copy saves private notes encrypted, and what is uploaded is encrypted', release(), () => {
  const p = unlockedProject();
  try {
    for (const f of PRIVATE) write(p.root, f, 'Private text.\n');
    write(p.root, PUBLIC_NOTE, '# Porter\n');
    const r = sessionEnd(p.root);
    assert.equal(r.code, 0, r.stderr);
    for (const f of PRIVATE) {
      assert.equal(startsEncrypted(blobAt(p.root, 'HEAD', f)), true, `${f} is encrypted in the commit`);
      assert.equal(startsEncrypted(blobAt(p.bare, 'main', f)), true, `${f} is encrypted online`);
      assert.equal(read(p.root, f), 'Private text.\n', 'still plain on this computer');
    }
    assert.equal(blobAt(p.bare, 'main', PUBLIC_NOTE).toString(), '# Porter\n');
    assert.equal(git(p.root, ['rev-parse', 'HEAD']), remoteHead(p));
    assert.ok(!tasks(p.root).includes('#ab/git'), 'nothing to tell the user');
  } finally {
    cleanup(p.parent);
  }
});

test('a private note that would be stored as plain text is left out of the save, and the rest goes up', release(), () => {
  const p = unlockedProject();
  try {
    // The encryption step stops working (a broken setting): git would store the text as it is.
    git(p.root, ['config', 'filter.git-crypt.clean', 'cat']);
    git(p.root, ['config', 'filter.git-crypt.required', 'false']);
    write(p.root, PRIVATE[0], 'Private text.\n');
    write(p.root, PUBLIC_NOTE, '# Porter\n');
    const r = sessionEnd(p.root);
    assert.equal(r.code, 0);
    assert.ok(!everInHistory(p.root, PRIVATE[0]), 'the private note never reached a commit');
    assert.ok(git(p.root, ['show', '--name-only', '--format=', 'HEAD']).split('\n').includes(PUBLIC_NOTE));
    assert.equal(git(p.root, ['rev-parse', 'HEAD']), remoteHead(p));
    assert.match(tasks(p.root), /Some of your private notes would have been saved without encryption, so I left them out of the backup\./);
    assert.ok(read(p.root, 'state/local/git.log').includes('unencrypted'));
    assert.ok(!tasks(p.root).includes('Jamie'), 'no note name in the task');
  } finally {
    cleanup(p.parent);
  }
});

test('a plain private note in a commit stops the upload, adds a high-priority task, and the rest waits', release(), () => {
  const p = unlockedProject();
  try {
    const before = remoteHead(p);
    write(p.root, PRIVATE[0], 'Private text.\n');
    git(p.root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'add', PRIVATE[0]]);
    git(p.root, ['commit', '-q', '-m', 'saved by another tool']);
    write(p.root, PUBLIC_NOTE, '# Porter\n');

    const r = sessionEnd(p.root);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), '');
    assert.equal(remoteHead(p), before, 'nothing was uploaded');
    assert.notEqual(git(p.root, ['rev-parse', 'HEAD']), before, 'the work is saved on this computer');
    const text = tasks(p.root);
    assert.match(text, /stopped the online backup because some of your private notes were about to be uploaded without encryption\. Nothing was uploaded\./);
    assert.match(text, /#ab\/git ⏫/);
    assert.ok(read(p.root, 'state/local/git.log').includes('upload refused'));

    // It stays stopped, without piling up tasks, and without rewriting anything.
    const head = git(p.root, ['rev-parse', 'HEAD']);
    sessionEnd(p.root);
    assert.equal(remoteHead(p), before);
    assert.equal(countOf(tasks(p.root), 'stopped the online backup'), 1);
    git(p.root, ['merge-base', '--is-ancestor', head, 'HEAD']); // history only grows (this throws if it was rewritten)
  } finally {
    cleanup(p.parent);
  }
});

test('a plain note that a later commit replaced still stops the upload, because the history goes up too', release(), () => {
  const p = unlockedProject();
  try {
    const before = remoteHead(p);
    write(p.root, PRIVATE[1], 'Private text.\n');
    git(p.root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'add', PRIVATE[1]]);
    git(p.root, ['commit', '-q', '-m', 'plain']);
    git(p.root, ['add', '--renormalize', PRIVATE[1]]); // now through the working encryption step
    git(p.root, ['commit', '-q', '-m', 'encrypted again']);
    assert.equal(startsEncrypted(blobAt(p.root, 'HEAD', PRIVATE[1])), true);
    sessionEnd(p.root);
    assert.equal(remoteHead(p), before);
    assert.match(tasks(p.root), /stopped the online backup/);
  } finally {
    cleanup(p.parent);
  }
});

test('the upload check fails closed: if it cannot run, nothing is uploaded', release(), () => {
  const p = unlockedProject();
  try {
    const before = remoteHead(p);
    write(p.root, PRIVATE[0], 'Private text.\n');
    git(p.root, ['add', PRIVATE[0]]);
    git(p.root, ['commit', '-q', '-m', 'encrypted note']);
    // Lose the stored copy of the encrypted note: the check cannot read it.
    const oid = git(p.root, ['rev-parse', `HEAD:${PRIVATE[0]}`]);
    const loose = join(p.root, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
    assert.ok(existsSync(loose), 'the object is stored loose');
    chmodSync(loose, 0o666);
    rmSync(loose, { force: true });

    const r = gitAuto(p.root, ['push', '--json']);
    assert.equal(r.code, 1);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(out.status, 'failed');
    assert.equal(out.kind, 'encryption');
    assert.equal(remoteHead(p), before);
    assert.match(tasks(p.root), /could not check that your private notes are encrypted, so it did not back up online/);
    assert.match(tasks(p.root), /#ab\/git ⏫/);
  } finally {
    cleanup(p.parent);
  }
});

test('with encryption off nothing changes: notes are saved and uploaded as before', release(), () => {
  const p = makeVaultProject({ remote: true, framework: true });
  try {
    write(p.root, PRIVATE[0], 'Private text.\n');
    write(p.root, PUBLIC_NOTE, '# Porter\n');
    const r = sessionEnd(p.root);
    assert.equal(r.code, 0);
    assert.equal(blobAt(p.bare, 'main', PRIVATE[0]).toString(), 'Private text.\n');
    assert.ok(!tasks(p.root).includes('#ab/git'));
  } finally {
    cleanup(p.parent);
  }
});

test('joining the online copy on a locked computer does not save the private notes either', release(), () => {
  const p = lockedProject();
  try {
    const other = join(p.parent, 'other');
    git(p.parent, ['clone', '-q', p.bare, other]);
    git(other, ['config', 'user.name', 'Alex Doe']);
    git(other, ['config', 'user.email', 'alex@example.invalid']);
    write(other, PUBLIC_NOTE, '# From the other computer\n');
    git(other, ['add', '-A']);
    git(other, ['commit', '-q', '-m', 'other']);
    git(other, ['push', '-q']);

    write(p.root, PRIVATE[0], 'Private text.\n'); // new private note here, which a locked copy cannot encrypt
    write(p.root, 'vault/30_wiki/concepts/Local.md', '# Local\n');
    const r = gitAuto(p.root, ['pull', '--json']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).status, 'ok');
    assert.equal(read(p.root, PUBLIC_NOTE), '# From the other computer\n', 'the other computer\'s change arrived');
    assert.equal(read(p.root, PRIVATE[0]), 'Private text.\n');
    assert.ok(!everInHistory(p.root, PRIVATE[0]), 'and the private note was not saved while joining');
    assert.ok(git(p.root, ['show', '--name-only', '--format=', 'HEAD']).includes('Local.md'));
  } finally {
    cleanup(p.parent);
  }
});

test('git-auto status mentions a locked copy', release(), () => {
  const p = lockedProject();
  try {
    const r = gitAuto(p.root, ['status', '--json']);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.info.encryption.enabled, true);
    assert.equal(out.info.encryption.unlocked, false);
    assert.match(out.message, /private notes are locked on this computer/);
    const off = makeVaultProject({ framework: true });
    try {
      assert.equal(JSON.parse(gitAuto(off.root, ['status', '--json']).stdout.trim()).info.encryption.enabled, false);
    } finally {
      cleanup(off.parent);
    }
  } finally {
    cleanup(p.parent);
  }
});

test('the settings record only paths, never key material', release(), () => {
  const p = unlockedProject();
  try {
    const text = readFileSync(join(p.root, 'config', 'brain.json'), 'utf8');
    const brain = JSON.parse(text);
    assert.deepEqual(brain.privacy.encryption.scope, SCOPE_LABELS);
    const key = readFileSync(join(p.root, '.git', 'git-crypt', 'keys', 'default'));
    assert.ok(!text.includes(key.toString('base64')) && !text.includes(key.toString('hex')));
    assert.equal(gitTry(p.root, ['grep', '-F', '-l', key.toString('base64').slice(0, 20), 'HEAD']).ok, false, 'the key is not in any saved file');
  } finally {
    cleanup(p.parent);
  }
});
