// The upload check inside git (ADR 0019): the hook file in .git/hooks/pre-push and system/scripts/git-hooks/pre-push.mjs.
// It closes the gap the automatic save cannot: Obsidian Git uploads on its own through the git command line, and git runs a
// pre-push hook for it. These tests use real git, a bare folder as the "online copy" and the stand-in for git-crypt
// (tests/fixtures/scripts/fake-git-crypt.mjs). Git LFS is real where it is installed. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  GITCRYPT_HEADER, PRE_PUSH_MARKER, PUSH_HOOK_TEXT, PUSH_PLAIN_TASK_TEXT, PUSH_REFUSED_PREFIX, PUSH_UNCHECKED_TASK_TEXT, classifyPrePush,
  ensurePrePushHook, getStatus, prePushHookStatus, prePushShim, writeAttributeFiles,
} from '../../system/lib/vaultkey.mjs';
import { lfsInstallCommand } from '../../system/lib/git.mjs';
import { checkPush, parsePushLines } from '../../system/scripts/git-hooks/pre-push.mjs';
import {
  FAKE_GIT_CRYPT, NOTES, blobAt, childEnv, cleanup, git, gitTry, makeVaultProject, read, runVk, write,
} from '../fixtures/scripts/vaultkey-helpers.mjs';

// Windows spells it Path; setting PATH next to it would give the child two competing values.
const PATH_KEY = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
const hookFile = (root) => join(root, '.git', 'hooks', 'pre-push');
const hookText = (root) => readFileSync(hookFile(root), 'utf8');
const startsEncrypted = (buf) => buf.subarray(0, GITCRYPT_HEADER.length).equals(GITCRYPT_HEADER);
const encryptedBytes = (text = 'secret') => Buffer.concat([GITCRYPT_HEADER, Buffer.alloc(12, 7), Buffer.from(text)]);
function putBytes(root, rel, bytes) {
  const file = join(root, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
const tasks = (root) => read(root, NOTES.task);
const countIn = (text, needle) => text.split(needle).length - 1;
const PLAIN = new RegExp(`^${PUSH_REFUSED_PREFIX} because (one|\\d+) of your private notes would have been sent without encryption\\. Nothing was sent\\. Open Claude and type /health-check$`, 'm'); // git adds its own "failed to push" line after ours

/** Notes saved as plain text, as a vault is before encryption is switched on. */
function seedNotes(root) {
  write(root, NOTES.fact, '# Facts\n\nNationality: Exampleland (private)\n');
  write(root, NOTES.user, '# About me\n\nA short profile.\n');
  write(root, NOTES.person, '# Jamie Example\n\nMet at a careers event.\n');
  write(root, NOTES.journal, '# 2026-10-07\n\nA private journal entry.\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'notes']);
}

/** Plain notes pushed, then encryption turned on by vault-key setup (which installs the hook). Returns the project. */
function encryptedProject() {
  const p = makeVaultProject({ remote: true });
  seedNotes(p.root);
  git(p.root, ['push', '-q']);
  const r = runVk(p.root, ['setup']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  return p;
}

/** A computer that has never seen the key: a fresh clone of the online copy, with the upload check installed. */
function lockedClone(p, name = 'other') {
  const clone = join(p.parent, name);
  git(p.parent, ['clone', '-q', p.bare, clone]);
  git(clone, ['config', 'user.name', 'Alex Doe']);
  git(clone, ['config', 'user.email', 'alex@example.invalid']);
  git(clone, ['config', 'commit.gpgsign', 'false']);
  return clone;
}

const onlineHead = (p, branch = 'main') => git(p.bare, ['rev-parse', branch]);
const branchesOnline = (p) => git(p.bare, ['branch', '--format=%(refname:short)']).split('\n').filter(Boolean).sort();

/* ------------------------------ what the hook file is ------------------------------ */

const LFS_HOOK = [
  '#!/bin/sh',
  'command -v git-lfs >/dev/null 2>&1 || { printf >&2 "\\n%s\\n\\n" "This repository is configured for Git LFS but \'git-lfs\' was not found on your path. If you no longer wish to use Git LFS, remove this hook by deleting the \'pre-push\' file in the hooks directory (set by \'core.hookspath\'; usually \'.git/hooks\')."; exit 2; }',
  'git lfs pre-push "$@"',
  '',
].join('\n');
const LFS_HOOK_V2 = [
  '#!/bin/sh',
  'command -v git-lfs >/dev/null 2>&1 || { echo >&2 "\\nThis repository is configured for Git LFS but \'git-lfs\' was not found on your path. If you no longer wish to use Git LFS, remove this hook by deleting .git/hooks/pre-push file in your repository.\\n"; exit 2; }',
  'git lfs pre-push "$@"',
  '',
].join('\n');

test('classifyPrePush: ours, the standard Git LFS hook in its versions, empty, and everything else is someone else\'s', () => {
  assert.equal(classifyPrePush(prePushShim('C:/Program Files/nodejs/node.exe')), 'ours');
  assert.equal(classifyPrePush(prePushShim('')), 'ours');
  assert.equal(classifyPrePush(LFS_HOOK), 'lfs');
  assert.equal(classifyPrePush(LFS_HOOK_V2), 'lfs');
  assert.equal(classifyPrePush(LFS_HOOK.replace(/\n/g, '\r\n')), 'lfs', 'a file saved with Windows line endings');
  assert.equal(classifyPrePush('#!/bin/sh\ngit lfs pre-push "$@"\n'), 'lfs', 'the oldest form');
  assert.equal(classifyPrePush(''), 'empty');
  assert.equal(classifyPrePush('  \n\n'), 'empty');
  assert.equal(classifyPrePush(null), 'empty');
  // Anything that does more than the LFS lines is not LFS's, and is never replaced
  assert.equal(classifyPrePush(`${LFS_HOOK}echo "my own check"\n`), 'foreign');
  assert.equal(classifyPrePush('#!/bin/sh\nnpx husky pre-push\n'), 'foreign');
  assert.equal(classifyPrePush('#!/bin/sh\n# only a comment\n'), 'foreign');
  assert.equal(classifyPrePush('#!/bin/sh\nexit 0\n'), 'foreign');
  assert.equal(classifyPrePush('#!/bin/sh\ngit lfs pre-push "$@" && ./extra.sh\n'), 'foreign');
});

test('the hook text: shell script with LF endings, our marker, the LFS step with the same input, and no way to skip the check quietly', () => {
  const text = prePushShim('C:\\Program Files\\nodejs\\node.exe');
  assert.ok(text.startsWith('#!/bin/sh\n'));
  assert.ok(text.endsWith('\n') && !text.includes('\r'));
  assert.ok(text.split('\n').includes(PRE_PUSH_MARKER));
  assert.ok(text.includes("'C:/Program Files/nodejs/node.exe'"), 'the node program is remembered, with forward slashes and quoted');
  assert.ok(text.includes('git rev-parse --show-toplevel'), 'the project folder comes from git');
  assert.ok(text.includes('system/scripts/git-hooks/pre-push.mjs'));
  assert.ok(text.includes('input=$(cat)'), 'standard input is read once');
  assert.equal(countIn(text, 'git lfs pre-push "$@"'), 1);
  assert.ok(text.indexOf('pre-push.mjs"') < text.indexOf('git lfs pre-push'), 'our check runs first');
  for (const f of ['vault/80_me', 'vault/60_people', 'vault/70_journal']) assert.ok(text.includes(`$root/${f}/.gitattributes`), f);
  assert.ok(text.includes('exit 1'), 'a check that cannot run refuses when encryption is on');
  assert.ok(text.includes('exit 2') && text.includes('filter=lfs'), 'a folder that uses Git LFS is refused when Git LFS cannot be found, as the standard LFS hook did');
  assert.ok(text.indexOf('git lfs pre-push') < text.indexOf('exit 2'), 'the refusal is only for the case where the LFS step cannot run');
  assert.ok(!text.includes('\t'), 'no tab characters');
  // A path with an apostrophe cannot break out of the quotes
  assert.ok(prePushShim("C:/Users/O'Brien/node.exe").includes("'C:/Users/O'\\''Brien/node.exe'"));
});

test('the hook text runs under a POSIX shell (syntax check)', () => {
  // Git for Windows has its own sh next to git; elsewhere sh is on PATH.
  const candidates = ['sh'];
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8', windowsHide: true });
  const gitExe = (where.stdout || '').split(/\r?\n/)[0];
  if (gitExe) candidates.unshift(join(dirname(gitExe), '..', 'usr', 'bin', 'sh.exe'), join(dirname(gitExe), '..', 'bin', 'sh.exe'));
  const sh = candidates.find((c) => spawnSync(c, ['-c', 'exit 0'], { windowsHide: true }).status === 0);
  if (!sh) return; // no shell to ask: the push tests below run the hook through git's own shell anyway
  for (const node of ['', 'C:/Program Files/nodejs/node.exe', "/home/o'brien/node"]) {
    const res = spawnSync(sh, ['-n', '-c', prePushShim(node)], { encoding: 'utf8', windowsHide: true });
    assert.equal(res.status, 0, res.stderr);
  }
});

/* ------------------------------ installing it ------------------------------ */

test('ensurePrePushHook installs our hook, and a second call changes nothing and costs one small read', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(prePushHookStatus(root).state, 'missing');
    const first = ensurePrePushHook(root);
    assert.equal(first.state, 'active');
    assert.equal(first.changed, true);
    assert.equal(first.replaced, 'absent');
    assert.equal(classifyPrePush(hookText(root)), 'ours');
    assert.ok(!hookText(root).includes('\r'));
    if (process.platform !== 'win32') assert.ok(statSync(hookFile(root)).mode & 0o111, 'executable');
    assert.deepEqual(readdirSync(join(root, '.git', 'hooks')).filter((f) => f.includes('alterbrain-new')), [], 'no temporary file is left');
    assert.deepEqual(prePushHookStatus(root), { state: 'active', path: hookFile(root), outdated: false });

    const before = statSync(hookFile(root)).mtimeMs;
    const second = ensurePrePushHook(root);
    assert.equal(second.state, 'active');
    assert.equal(second.changed, false);
    assert.equal(statSync(hookFile(root)).mtimeMs, before, 'the file was not written again');
  } finally {
    cleanup(parent);
  }
});

test('ensurePrePushHook works when the hooks folder is gone, and refreshes a hook of ours that is out of date', () => {
  const { parent, root } = makeVaultProject();
  try {
    rmSync(join(root, '.git', 'hooks'), { recursive: true, force: true });
    assert.equal(ensurePrePushHook(root).state, 'active');
    // Out of date: an older text of ours (another version marker line is kept, other lines changed)
    writeFileSync(hookFile(root), `${hookText(root)}echo old\n`);
    assert.equal(prePushHookStatus(root).outdated, true);
    const again = ensurePrePushHook(root);
    assert.equal(again.changed, true);
    assert.equal(again.replaced, 'ours');
    assert.equal(hookText(root), prePushShim(process.execPath), 'the current text, with the node program that wrote it');
    assert.equal(prePushHookStatus(root).outdated, false);
  } finally {
    cleanup(parent);
  }
});

test('a hook that is not ours and not the standard Git LFS one is never touched; the status says so', () => {
  const { parent, root } = makeVaultProject({ enabled: true });
  try {
    mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
    const theirs = '#!/bin/sh\n# the user\'s own check\nnpx husky pre-push\n';
    writeFileSync(hookFile(root), theirs);
    const res = ensurePrePushHook(root);
    assert.equal(res.state, 'foreign');
    assert.equal(res.changed, false);
    assert.equal(hookText(root), theirs, 'byte for byte');
    assert.equal(prePushHookStatus(root).state, 'foreign');
    const st = getStatus(root);
    assert.equal(st.pre_push_hook, 'foreign');
    const problem = st.problems.find((p) => p.id === 'push-hook-foreign');
    assert.ok(problem, 'status reports it as a problem');
    assert.equal(problem.message, PUSH_HOOK_TEXT.foreign);
    assert.match(problem.fix, /\/health-check/);
    assert.ok(!problem.message.includes('husky'), 'the other tool is not described');
  } finally {
    cleanup(parent);
  }
});

test('when git is set to use a shared hooks folder, nothing is written there or here', () => {
  const { parent, root } = makeVaultProject({ enabled: true });
  try {
    const shared = join(parent, 'shared-hooks');
    mkdirSync(shared, { recursive: true });
    git(root, ['config', 'core.hooksPath', shared]);
    const res = ensurePrePushHook(root);
    assert.equal(res.state, 'hooks-path');
    assert.deepEqual(readdirSync(shared), [], 'the shared folder is left alone');
    assert.ok(!existsSync(hookFile(root)));
    assert.equal(getStatus(root).problems.find((p) => p.id === 'push-hook-shared-folder').message, PUSH_HOOK_TEXT['hooks-path']);
  } finally {
    cleanup(parent);
  }
});

test('an empty hook file is replaced; the status of a missing hook is a fixable problem', () => {
  const { parent, root } = makeVaultProject({ enabled: true });
  try {
    mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
    writeFileSync(hookFile(root), '\n');
    const st = getStatus(root);
    assert.equal(st.pre_push_hook, 'missing');
    const problem = st.problems.find((p) => p.id === 'push-hook-missing');
    assert.ok(problem);
    assert.match(problem.fix, /vault-key\.mjs setup/);
    assert.equal(ensurePrePushHook(root).replaced, 'empty');
    assert.equal(getStatus(root).problems.find((p) => p.id.startsWith('push-hook-')), undefined);
  } finally {
    cleanup(parent);
  }
});

test('encryption off: nothing about the hook in the status', () => {
  const { parent, root } = makeVaultProject();
  try {
    const st = getStatus(root);
    assert.equal(st.enabled, false);
    assert.equal(st.pre_push_hook, null);
    assert.deepEqual(st.problems, []);
  } finally {
    cleanup(parent);
  }
});

/* ------------------------------ vault-key setup, status and unlock ------------------------------ */

test('setup installs the upload check; status reports it; running setup again leaves it alone', () => {
  const p = encryptedProject();
  try {
    assert.equal(classifyPrePush(hookText(p.root)), 'ours');
    const status = runVk(p.root, ['status']);
    assert.equal(status.code, 0, status.stdout);
    assert.match(status.stdout, /Upload check for Obsidian Git and other Git tools: installed/);
    assert.equal(JSON.parse(runVk(p.root, ['status', '--json']).stdout).status.pre_push_hook, 'active');
    const before = statSync(hookFile(p.root)).mtimeMs;
    const again = runVk(p.root, ['setup']);
    assert.equal(again.code, 0, again.stdout);
    assert.match(again.stdout, /upload check for Obsidian Git and other Git tools was already in place/);
    assert.equal(statSync(hookFile(p.root)).mtimeMs, before);
  } finally {
    cleanup(p.parent);
  }
});

test('the first setup says it installed the check, in plain words', () => {
  const p = makeVaultProject({ remote: true });
  try {
    seedNotes(p.root);
    const r = runVk(p.root, ['setup']);
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /Installed a check that stops any Git tool, including Obsidian Git, from uploading a private note without encryption\./);
    assert.ok(!/hook|pre-push/i.test(r.stdout), 'no jargon in what the user reads');
  } finally {
    cleanup(p.parent);
  }
});

test('status on a computer without the hook says what to run, and setup puts it back', () => {
  const p = encryptedProject();
  try {
    rmSync(hookFile(p.root));
    const r = runVk(p.root, ['status']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /Upload check for Obsidian Git and other Git tools: NOT installed/);
    assert.match(r.stdout, /Problem: The upload check that protects your private notes from Obsidian Git and other Git tools is not installed\./);
    assert.match(r.stdout, /Fix: Run: node system\/scripts\/vault-key\.mjs setup/);
    const fixed = runVk(p.root, ['setup']);
    assert.equal(fixed.code, 0, fixed.stdout);
    assert.equal(runVk(p.root, ['status']).code, 0);
  } finally {
    cleanup(p.parent);
  }
});

test('setup still turns encryption on when another tool owns the hook, leaves that hook alone and says so', () => {
  const p = makeVaultProject({ remote: true });
  try {
    seedNotes(p.root);
    mkdirSync(join(p.root, '.git', 'hooks'), { recursive: true });
    const theirs = '#!/bin/sh\nnpx husky pre-push\n';
    writeFileSync(hookFile(p.root), theirs);
    const r = runVk(p.root, ['setup']);
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /Encryption of your private notes is on\./);
    assert.match(r.stdout, /Warning: Another tool already has a check that runs before every upload/);
    assert.match(r.stdout, /keep Obsidian Git switched off/);
    assert.equal(hookText(p.root), theirs);
    const j = JSON.parse(runVk(p.root, ['setup', '--json']).stdout);
    assert.equal(j.ok, true);
    assert.equal(j.pre_push_hook, 'foreign');
    const status = runVk(p.root, ['status']);
    assert.equal(status.code, 1, 'the gap stays visible until someone deals with it');
    assert.match(status.stdout, /NOT installed/);
  } finally {
    cleanup(p.parent);
  }
});

test('unlock on a new computer installs the check; unlocking again refreshes it', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const key = join(p.parent, 'keys', 'vault-key-test.key');
    assert.equal(runVk(p.root, ['export', '--out', key]).code, 0);
    const clone = lockedClone(p);
    assert.ok(!existsSync(hookFile(clone)), 'hooks are not part of a download');
    const u = runVk(clone, ['unlock', '--key', key]);
    assert.equal(u.code, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /Installed the check that stops any Git tool, including Obsidian Git, from uploading a private note without encryption\./);
    assert.equal(classifyPrePush(hookText(clone)), 'ours');
    // Already unlocked, hook removed: unlock puts it back
    rmSync(hookFile(clone));
    const again = runVk(clone, ['unlock', '--key', key]);
    assert.equal(again.code, 0);
    assert.match(again.stdout, /already unlocked/);
    assert.equal(classifyPrePush(hookText(clone)), 'ours');
    assert.equal(JSON.parse(runVk(clone, ['unlock', '--key', key, '--json']).stdout).pre_push_hook, 'active');
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ the check itself, as git runs it ------------------------------ */

test('an upload of encrypted notes and ordinary files goes through, and the online copy holds the encrypted versions', () => {
  const p = encryptedProject();
  try {
    write(p.root, 'vault/60_people/Sam Example.md', '# Sam Example\n');
    write(p.root, NOTES.scan, 'pretend pdf bytes\n');
    write(p.root, 'vault/00_inbox/a.md', 'an ordinary note\n');
    write(p.root, 'vault/30_wiki/x.pdf', 'an ordinary pdf, not private\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    const pushed = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(pushed.ok, true, pushed.stderr);
    assert.ok(!pushed.stderr.includes(PUSH_REFUSED_PREFIX));
    for (const path of [NOTES.fact, 'vault/60_people/Sam Example.md', NOTES.scan]) assert.equal(startsEncrypted(blobAt(p.bare, 'main', path)), true, path);
    assert.equal(blobAt(p.bare, 'main', 'vault/30_wiki/x.pdf').toString(), 'an ordinary pdf, not private\n');
    assert.equal(onlineHead(p), git(p.root, ['rev-parse', 'HEAD']));
    assert.doesNotMatch(tasks(p.root), /stopped the online backup/);
  } finally {
    cleanup(p.parent);
  }
});

test('Obsidian Git on a computer that cannot encrypt: a private note saved as plain text is refused, nothing is sent, and one task is left', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = lockedClone(p); // a new computer: it has not been unlocked, so git has no encryption step here
    assert.equal(ensurePrePushHook(clone).state, 'active');
    const head = onlineHead(p);

    write(clone, 'vault/60_people/New Contact.md', '# New Contact\n\nPhone number and address.\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'Obsidian Git: vault backup']);
    assert.equal(startsEncrypted(blobAt(clone, 'HEAD', 'vault/60_people/New Contact.md')), false, 'git stored it as plain text, as it does without the encryption step');

    const refused = gitTry(clone, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    const line = refused.stderr.split(/\r?\n/).find((l) => l.startsWith(PUSH_REFUSED_PREFIX));
    assert.ok(line, refused.stderr);
    assert.match(line, PLAIN);
    assert.equal(line, `${PUSH_REFUSED_PREFIX} because one of your private notes would have been sent without encryption. Nothing was sent. Open Claude and type /health-check`);
    assert.ok(!refused.stderr.includes('New Contact'), 'the note is not named');
    assert.equal(onlineHead(p), head, 'nothing reached the online copy');

    // Obsidian Git tries again ten minutes later: still refused, and the task list gets the warning once
    assert.equal(gitTry(clone, ['push', 'origin', 'main']).ok, false);
    assert.equal(countIn(tasks(clone), PUSH_PLAIN_TASK_TEXT), 1);
    assert.match(tasks(clone), /#ab\/git/);
    assert.match(tasks(clone), /⏫/);
  } finally {
    cleanup(p.parent);
  }
});

test('a document saved as plain text in a private folder is refused too, and two notes are counted', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = lockedClone(p);
    ensurePrePushHook(clone);
    write(clone, 'vault/70_journal/receipts/hotel.pdf', 'pretend pdf bytes\n');
    write(clone, 'vault/60_people/photo.png', 'pretend png bytes\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'save']);
    const refused = gitTry(clone, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, /because 2 of your private notes would have been sent without encryption/);
  } finally {
    cleanup(p.parent);
  }
});

test('a plain note in an earlier commit still blocks a new branch, even when the last commit holds the encrypted version', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = lockedClone(p);
    ensurePrePushHook(clone);
    git(clone, ['checkout', '-q', '-b', 'feature']);
    write(clone, 'vault/60_people/Pat Example.md', 'Plain contact details\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'plain']);
    putBytes(clone, 'vault/60_people/Pat Example.md', encryptedBytes('contact'));
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'now encrypted']);
    const refused = gitTry(clone, ['push', '-u', 'origin', 'feature']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, PLAIN);
    assert.deepEqual(branchesOnline(p), ['main'], 'the branch was not created online');
  } finally {
    cleanup(p.parent);
  }
});

test('old plain notes that are already online do not block later uploads, but they do when the branch is pushed by address', () => {
  const p = encryptedProject(); // the plain notes were pushed before encryption was turned on
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    // The history holds plain private notes, and the online copy already has them: a normal upload is fine
    assert.equal(gitTry(p.root, ['push', 'origin', 'main']).ok, true);
    git(p.root, ['checkout', '-q', '-b', 'side']);
    write(p.root, 'vault/00_inbox/side.md', 'ordinary\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'side']);
    assert.equal(gitTry(p.root, ['push', 'origin', 'side']).ok, true, 'a new branch sends only what the online copy lacks');
    // A push to a bare address (not a named remote) cannot tell what the other side has, so it reads everything it would send
    const other = join(p.parent, 'elsewhere.git');
    mkdirSync(other, { recursive: true });
    git(other, ['init', '-q', '--bare', '-b', 'main']);
    const byAddress = gitTry(p.root, ['push', other, 'main']);
    assert.equal(byAddress.ok, false);
    assert.match(byAddress.stderr, PLAIN);
    assert.deepEqual(readdirSync(join(other, 'refs', 'heads')), []);
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ merges ------------------------------ */

test('a plain note that a phone already put online does not block the upload after Obsidian Git merges it in', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['config', 'pull.rebase', 'false']); // Obsidian Git's default pull is a merge
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '--allow-empty', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const phone = lockedClone(p, 'phone'); // no upload check on a phone: it sends what it saved, plain
    write(phone, 'vault/60_people/Phone.md', '# Phone\n\nSaved on a phone, so stored as plain text.\n');
    git(phone, ['add', '-A']);
    git(phone, ['commit', '-q', '-m', 'phone']);
    git(phone, ['push', '-q', 'origin', 'main']);
    assert.equal(startsEncrypted(blobAt(p.bare, 'main', 'vault/60_people/Phone.md')), false, 'it is already online as plain text');

    // The computer saves something of its own, then pulls: a merge commit joins the two
    write(p.root, 'vault/00_inbox/local.md', 'an ordinary note\n');
    write(p.root, 'vault/60_people/Sam Example.md', '# Sam Example\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'local']);
    git(p.root, ['pull', '-q', '--no-rebase', '--no-edit']);
    assert.equal(git(p.root, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').length, 3, 'HEAD is a merge commit');

    const pushed = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(pushed.ok, true, pushed.stderr);
    assert.ok(!pushed.stderr.includes(PUSH_REFUSED_PREFIX));
    assert.equal(onlineHead(p), git(p.root, ['rev-parse', 'HEAD']));
    assert.equal(startsEncrypted(blobAt(p.bare, 'main', 'vault/60_people/Sam Example.md')), true, 'the computer\'s own note went up encrypted');
    assert.doesNotMatch(tasks(p.root), /stopped the online backup/);
  } finally {
    cleanup(p.parent);
  }
});

test('a plain note of the computer\'s own is still refused when a merge sits on top of it', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['config', 'pull.rebase', 'false']);
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '--allow-empty', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const phone = lockedClone(p, 'phone');
    write(phone, 'vault/00_inbox/from-phone.md', 'ordinary\n');
    git(phone, ['add', '-A']);
    git(phone, ['commit', '-q', '-m', 'phone']);
    git(phone, ['push', '-q', 'origin', 'main']);

    const clone = lockedClone(p); // a computer that cannot encrypt
    ensurePrePushHook(clone);
    write(clone, 'vault/60_people/New Contact.md', 'plain by mistake\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'plain']);
    git(clone, ['config', 'pull.rebase', 'false']);
    git(clone, ['pull', '-q', '--no-rebase', '--no-edit']);
    const head = onlineHead(p);
    const refused = gitTry(clone, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, PLAIN);
    assert.equal(onlineHead(p), head, 'nothing was sent');
  } finally {
    cleanup(p.parent);
  }
});

test('a plain private note that only the merge commit itself holds (a conflict settled by hand) is refused', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '--allow-empty', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = lockedClone(p);
    ensurePrePushHook(clone);
    git(clone, ['checkout', '-q', '-b', 'side']);
    write(clone, 'vault/00_inbox/side.md', 'ordinary\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'side']);
    git(clone, ['checkout', '-q', 'main']);
    write(clone, 'vault/00_inbox/main.md', 'ordinary\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'main']);
    git(clone, ['merge', '-q', '--no-commit', '--no-ff', 'side']);
    write(clone, 'vault/60_people/Settled By Hand.md', 'typed in while settling the merge\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'merge']);
    assert.equal(git(clone, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').length, 3, 'HEAD is a merge commit');
    const refused = gitTry(clone, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, PLAIN);
  } finally {
    cleanup(p.parent);
  }
});

test('deleting an online branch and pushing several branches at once', () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    assert.equal(gitTry(p.root, ['push', 'origin', 'main']).ok, true);
    git(p.root, ['branch', 'one']);
    assert.equal(gitTry(p.root, ['push', 'origin', 'one']).ok, true);
    assert.equal(gitTry(p.root, ['push', 'origin', '--delete', 'one']).ok, true, 'a deletion sends no commits');
    assert.deepEqual(branchesOnline(p), ['main']);
    // Two branches in one upload: the plain note in the second one blocks both
    git(p.root, ['checkout', '-q', '-b', 'good']);
    write(p.root, 'vault/00_inbox/good.md', 'ordinary\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'good']);
    git(p.root, ['checkout', '-q', '-b', 'bad', 'main']);
    write(p.root, 'vault/60_people/Plain Person.md', 'plain\n');
    git(p.root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'plain']);
    const refused = gitTry(p.root, ['push', 'origin', 'good', 'bad']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, PLAIN);
    assert.deepEqual(branchesOnline(p), ['main'], 'neither branch went up');
  } finally {
    cleanup(p.parent);
  }
});

test('encryption off: the hook lets everything through', () => {
  const p = makeVaultProject({ remote: true });
  try {
    assert.equal(ensurePrePushHook(p.root).state, 'active');
    write(p.root, NOTES.person, 'Plain, and that is the user\'s choice when encryption is off.\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    const pushed = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(pushed.ok, true, pushed.stderr);
    assert.equal(blobAt(p.bare, 'main', NOTES.person).toString(), 'Plain, and that is the user\'s choice when encryption is off.\n');
  } finally {
    cleanup(p.parent);
  }
});

test('it fails closed: when the check cannot run, nothing is sent while encryption is on, and it stays out of the way when it is off', () => {
  const p = encryptedProject();
  const off = makeVaultProject({ remote: true });
  try {
    ensurePrePushHook(off.root);
    for (const root of [p.root, off.root]) {
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '--allow-empty', '-m', 'save']);
      rmSync(join(root, 'system', 'scripts', 'git-hooks', 'pre-push.mjs'));
    }
    const refused = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, new RegExp(`^${PUSH_REFUSED_PREFIX} because it could not run its check for private notes`, 'm'));
    assert.notEqual(onlineHead(p), git(p.root, ['rev-parse', 'HEAD']));
    assert.equal(gitTry(off.root, ['push', 'origin', 'main']).ok, true, 'no encryption, no check');

    // A check that crashes is a refusal too
    write(p.root, 'system/scripts/git-hooks/pre-push.mjs', 'this is not javascript (\n');
    const crashed = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(crashed.ok, false);
    assert.notEqual(onlineHead(p), git(p.root, ['rev-parse', 'HEAD']));
  } finally {
    cleanup(p.parent, off.parent);
  }
});

test('the check finds node itself when the hook\'s PATH does not list it (a desktop app started from a menu)', (t) => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = lockedClone(p);
    // The hook is written by a process that runs node, so it remembers where node is
    assert.equal(ensurePrePushHook(clone).state, 'active');
    assert.match(hookText(clone), /\[ -x '[^']*node(\.exe)?' \]/, 'the node program is remembered');

    write(clone, 'vault/60_people/New Contact.md', 'plain\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-q', '-m', 'save']);

    // The same PATH, minus every folder that holds a node program
    const sep = process.platform === 'win32' ? ';' : ':';
    const withoutNode = (process.env[PATH_KEY] || '').split(sep).filter(Boolean).filter((d) => !['node', 'node.exe'].some((n) => existsSync(join(d, n)))).join(sep);
    const nodeVisible = spawnSync('node', ['-v'], { env: { ...process.env, [PATH_KEY]: withoutNode }, windowsHide: true });
    if (nodeVisible.status === 0) {
      t.skip('node is still found on a PATH with the node folders removed, so this cannot be tested here');
      return;
    }
    const refused = gitTry(clone, ['push', 'origin', 'main'], { [PATH_KEY]: withoutNode });
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, PLAIN, 'the check ran with the remembered node, not the "node not found" message');
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ Git LFS keeps working ------------------------------ */

const hasLfs = spawnSync('git', ['lfs', 'version'], { windowsHide: true }).status === 0;
const lfsObjectsOnline = (bare) => {
  const dir = join(bare, 'lfs', 'objects');
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else out.push(e.name);
    }
  };
  walk(dir);
  return out.sort();
};

test('Git LFS: our hook replaces the standard LFS hook, runs its upload step with the same input, and big files still reach the online copy', { skip: !hasLfs && 'Git LFS is not installed' }, () => {
  const p = makeVaultProject({ remote: true });
  try {
    // The project as the installer leaves it: Git LFS installed in the folder, one big-file rule
    assert.equal(gitTry(p.root, ['lfs', 'install', '--local']).ok, true);
    assert.equal(classifyPrePush(hookText(p.root)), 'lfs', 'the real text that "git lfs install" writes is recognised');
    write(p.root, '.gitattributes', `${read(p.root, '.gitattributes')}*.big filter=lfs diff=lfs merge=lfs -text\n`);
    write(p.root, 'vault/30_wiki/first.big', 'x'.repeat(2000));
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'lfs']);
    assert.equal(gitTry(p.root, ['push', 'origin', 'main']).ok, true);
    const before = lfsObjectsOnline(p.bare);
    assert.equal(before.length, 1, 'LFS uploads through its own hook before ours is installed');

    seedNotes(p.root);
    assert.equal(gitTry(p.root, ['push', 'origin', 'main']).ok, true, 'the plain notes of before encryption go up through the LFS hook, as they did before');
    const setup = runVk(p.root, ['setup']);
    assert.equal(setup.code, 0, setup.stdout + setup.stderr);
    assert.equal(classifyPrePush(hookText(p.root)), 'ours', 'the LFS hook was replaced by ours, which carries the LFS step');
    assert.ok(hookText(p.root).includes('git lfs pre-push "$@"'));
    assert.ok(existsSync(join(p.root, '.git', 'hooks', 'post-commit')), 'the other LFS hooks are untouched');

    // A new big file and a new private note in one upload
    write(p.root, 'vault/30_wiki/second.big', 'y'.repeat(3000));
    write(p.root, 'vault/60_people/Sam Example.md', '# Sam Example\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'big file and a private note']);
    const pushed = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(pushed.ok, true, pushed.stderr);
    assert.equal(lfsObjectsOnline(p.bare).length, 2, 'the new big file reached the online copy through the LFS step in our hook');
    assert.equal(startsEncrypted(blobAt(p.bare, 'main', 'vault/60_people/Sam Example.md')), true);

    // A refused upload sends no big files either
    write(p.root, 'vault/30_wiki/third.big', 'z'.repeat(4000));
    write(p.root, 'vault/60_people/Plain Person.md', 'plain\n');
    git(p.root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'add', '-A']);
    git(p.root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'commit', '-q', '-m', 'plain']);
    const refused = gitTry(p.root, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, PLAIN);
    assert.equal(lfsObjectsOnline(p.bare).length, 2, 'the big file was not uploaded either');
  } finally {
    cleanup(p.parent);
  }
});

test('Git LFS step is given exactly the lines git gave the hook, and its failure stops the upload', (t) => {
  const p = makeVaultProject({ remote: true });
  try {
    // A stand-in for git-lfs earlier on PATH than the real one: it records what it was given
    const bin = join(p.parent, 'bin');
    const log = join(p.parent, 'lfs.log');
    mkdirSync(bin, { recursive: true });
    const script = join(bin, 'git-lfs');
    writeFileSync(script, `#!/bin/sh\nprintf 'ARGS:%s\\n' "$*" >> '${log.replace(/\\/g, '/')}'\ncat >> '${log.replace(/\\/g, '/')}'\nif [ -f '${join(p.parent, 'lfs-fails').replace(/\\/g, '/')}' ]; then exit 3; fi\nexit 0\n`);
    chmodSync(script, 0o755);
    const withFake = { [PATH_KEY]: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env[PATH_KEY]}` };
    assert.equal(ensurePrePushHook(p.root).state, 'active');

    write(p.root, 'vault/00_inbox/a.md', 'ordinary\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    const head = git(p.root, ['rev-parse', 'HEAD']);
    const pushed = gitTry(p.root, ['push', 'origin', 'main'], withFake);
    assert.equal(pushed.ok, true, pushed.stderr);
    if (!existsSync(log)) {
      t.skip('this computer does not run a script named git-lfs without an extension');
      return;
    }
    const recorded = readFileSync(log, 'utf8').replace(/\r\n/g, '\n');
    assert.match(recorded, /^ARGS:pre-push origin /, 'same arguments as git gives the hook: remote name and address');
    assert.ok(recorded.includes(`refs/heads/main ${head} refs/heads/main `), recorded);
    assert.equal(recorded.split('\n').filter((l) => l.startsWith('refs/')).length, 1, 'one line of input');

    // The step fails: the upload stops with its exit code
    writeFileSync(join(p.parent, 'lfs-fails'), 'x');
    write(p.root, 'vault/00_inbox/b.md', 'ordinary again\n');
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save again']);
    const stopped = gitTry(p.root, ['push', 'origin', 'main'], withFake);
    assert.equal(stopped.ok, false);
    assert.equal(onlineHead(p), head);
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ Git LFS cannot be found ------------------------------ */

// The standard LFS hook stops an upload when Git LFS is not on the PATH, because big-file placeholders would reach the online
// copy without their files. Our hook replaces it, so it keeps that rule for a folder that uses LFS. These tests run the hook file
// itself under a shell whose PATH holds only wrappers for git, cat and grep, so git-lfs cannot be found. (A real push cannot test
// this on Windows: Git for Windows puts its own folder, which holds git-lfs, on the PATH of every hook.)

/** A program by name: the PATH first, then next to Git (Git for Windows keeps its shell tools under usr/bin). null when not found. */
function findProgram(name) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const dirs = (process.env[PATH_KEY] || '').split(sep).filter(Boolean);
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8', windowsHide: true });
  let up = dirname((where.stdout || '').split(/\r?\n/)[0] || '');
  for (let i = 0; up && i < 4; i++, up = dirname(up)) dirs.push(join(up, 'usr', 'bin'), join(up, 'bin'));
  return dirs.map((d) => join(d, exe)).find((f) => existsSync(f)) || null;
}

/**
 * Set up the restricted PATH. Returns { sh, bin } or null when this computer lacks a shell or a tool to wrap.
 * With `lfsLog`, a program called git-lfs exists on that PATH and "git lfs ..." is answered by the wrapper (it writes what it was
 * given to the log), so the test does not depend on how a particular Git finds its LFS program.
 */
function restrictedShell(parent, { lfsLog = null } = {}) {
  const sh = findProgram('sh');
  const tools = Object.fromEntries(['git', 'cat', 'grep'].map((n) => [n, findProgram(n)]));
  if (!sh || Object.values(tools).some((f) => !f)) return null;
  const bin = join(parent, 'restricted-path');
  mkdirSync(bin, { recursive: true });
  const forward = (f) => f.replace(/\\/g, '/');
  for (const [name, abs] of Object.entries(tools)) {
    const lines = ['#!/bin/sh'];
    if (lfsLog && name === 'git') {
      lines.push(`if [ "$1" = "lfs" ]; then printf 'RAN:%s\\n' "$*" >> '${forward(lfsLog)}'; cat >> '${forward(lfsLog)}'; exit 0; fi`);
    }
    lines.push(`exec '${forward(abs)}' "$@"`, '');
    writeFileSync(join(bin, name), lines.join('\n'));
    chmodSync(join(bin, name), 0o755);
  }
  if (lfsLog) {
    writeFileSync(join(bin, 'git-lfs'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'git-lfs'), 0o755);
  }
  return { sh, bin };
}

/** Run the hook file for a push of main, as git would, with only `bin` on the PATH. */
function runHookWithout(p, shell) {
  const hook = join(p.parent, 'hook.sh');
  writeFileSync(hook, prePushShim('')); // no remembered node: this folder does not use encryption, so none is needed
  const head = git(p.root, ['rev-parse', 'HEAD']);
  const res = spawnSync(shell.sh, [hook.replace(/\\/g, '/'), 'origin', p.bare.replace(/\\/g, '/')], {
    cwd: p.root,
    input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`,
    encoding: 'utf8',
    env: { ...process.env, [PATH_KEY]: shell.bin },
    windowsHide: true,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

const LFS_RULE = '"vault/30_wiki/big scan.pdf" filter=lfs diff=lfs merge=lfs -text\n'; // the shape of the rules Alterbrain adds

test('Git LFS cannot be found: a folder that keeps big files in LFS is not uploaded, as with the standard LFS hook', (t) => {
  const p = makeVaultProject({ remote: true });
  try {
    const shell = restrictedShell(p.parent);
    if (!shell) {
      t.skip('this computer has no shell or tool to build a PATH without git-lfs');
      return;
    }
    // The folder as Alterbrain leaves it after routing a big file: a rule in vault/.gitattributes (not yet saved)
    write(p.root, 'vault/.gitattributes', `# Big files (Git LFS). Alterbrain adds one line here for each file that is too big.\n${LFS_RULE}`);
    const refused = runHookWithout(p, shell);
    assert.equal(refused.code, 2, refused.stderr);
    assert.match(refused.stderr, new RegExp(`^${PUSH_REFUSED_PREFIX} because this folder keeps its big files in Git LFS`));
    assert.ok(refused.stderr.includes(lfsInstallCommand()), 'the message says how to install it');
    assert.equal(refused.stdout, '');
    assert.doesNotMatch(refused.stderr, /private note/, 'it is not mistaken for the encryption refusal');

    // Saved with the notes, the rule is found just the same
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'rules']);
    assert.equal(runHookWithout(p, shell).code, 2);
    // A rule in the root file counts too (installs from before the rules moved to vault/.gitattributes)
    git(p.root, ['rm', '-q', '-f', 'vault/.gitattributes']);
    write(p.root, '.gitattributes', `${read(p.root, '.gitattributes')}*.big filter=lfs diff=lfs merge=lfs -text\n`);
    assert.equal(runHookWithout(p, shell).code, 2);
  } finally {
    cleanup(p.parent);
  }
});

test('Git LFS cannot be found: LFS set up in this folder\'s own settings is enough to refuse', (t) => {
  const p = makeVaultProject({ remote: true });
  try {
    const shell = restrictedShell(p.parent);
    if (!shell) {
      t.skip('this computer has no shell or tool to build a PATH without git-lfs');
      return;
    }
    assert.equal(runHookWithout(p, shell).code, 0, 'nothing says the folder uses LFS');
    git(p.root, ['config', '--local', 'filter.lfs.clean', 'git-lfs clean -- %f']);
    assert.equal(runHookWithout(p, shell).code, 2);
  } finally {
    cleanup(p.parent);
  }
});

test('Git LFS cannot be found: a folder that does not use LFS uploads as before, even with LFS mentioned in a comment', (t) => {
  const p = makeVaultProject({ remote: true });
  try {
    const shell = restrictedShell(p.parent);
    if (!shell) {
      t.skip('this computer has no shell or tool to build a PATH without git-lfs');
      return;
    }
    const plainFolder = runHookWithout(p, shell);
    assert.equal(plainFolder.code, 0, plainFolder.stderr);
    assert.equal(plainFolder.stderr, '');
    write(p.root, 'vault/.gitattributes', '# Big files (Git LFS) would use filter=lfs here, but none are tracked yet.\n*.md text\n"a filter=lfs-not.pdf" text\n');
    const commentOnly = runHookWithout(p, shell);
    assert.equal(commentOnly.code, 0, commentOnly.stderr);
    assert.equal(commentOnly.stderr, '');
  } finally {
    cleanup(p.parent);
  }
});

test('Git LFS can be found: the upload step runs with the lines git gave the hook, and the upload goes ahead', (t) => {
  const p = makeVaultProject({ remote: true });
  try {
    const log = join(p.parent, 'lfs-stub.log');
    const shell = restrictedShell(p.parent, { lfsLog: log });
    if (!shell) {
      t.skip('this computer has no shell or tool to build a PATH for the stand-in');
      return;
    }
    write(p.root, 'vault/.gitattributes', LFS_RULE);
    const res = runHookWithout(p, shell);
    assert.equal(res.code, 0, res.stderr);
    assert.equal(res.stderr, '');
    const recorded = readFileSync(log, 'utf8').replace(/\r\n/g, '\n');
    assert.match(recorded, /^RAN:lfs pre-push origin /, 'the step ran with the arguments git gave the hook');
    assert.ok(recorded.includes(`refs/heads/main ${git(p.root, ['rev-parse', 'HEAD'])} refs/heads/main `), 'and with its input');
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ the script on its own ------------------------------ */

test('parsePushLines reads git\'s lines and ignores blank or short ones', () => {
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  const zeros = '0'.repeat(40);
  assert.deepEqual(parsePushLines(`refs/heads/main ${a} refs/heads/main ${b}\n\nshort line\nrefs/heads/x ${a} refs/heads/x ${zeros}\r\n`), [
    { localRef: 'refs/heads/main', localSha: a, remoteRef: 'refs/heads/main', remoteSha: b },
    { localRef: 'refs/heads/x', localSha: a, remoteRef: 'refs/heads/x', remoteSha: zeros },
  ]);
  assert.deepEqual(parsePushLines(''), []);
  assert.deepEqual(parsePushLines(undefined), []);
});

test('checkPush: off, nothing to send, a deletion, a line it does not understand, and a clean push', () => {
  const off = makeVaultProject();
  const on = makeVaultProject({ enabled: true });
  try {
    const head = git(off.root, ['rev-parse', 'HEAD']);
    const zeros = '0'.repeat(40);
    const line = `refs/heads/main ${head} refs/heads/main ${zeros}\n`;
    assert.equal(checkPush(off.root, 'origin', line).reason, 'off');
    assert.equal(checkPush(on.root, 'origin', '').reason, 'nothing');
    assert.equal(checkPush(on.root, 'origin', `(delete) ${zeros} refs/heads/old ${head}\n`).reason, 'nothing');
    const odd = checkPush(on.root, 'origin', 'refs/heads/main HEAD refs/heads/main abc\n');
    assert.equal(odd.ok, false);
    assert.equal(odd.reason, 'unchecked');
    assert.match(odd.message, new RegExp(`^${PUSH_REFUSED_PREFIX} because it could not check`));
    const onHead = git(on.root, ['rev-parse', 'HEAD']);
    const clean = checkPush(on.root, 'origin', `refs/heads/main ${onHead} refs/heads/main ${zeros}\n`);
    assert.equal(clean.ok, true);
    assert.equal(clean.reason, 'clean');
    const gone = checkPush(on.root, 'origin', `refs/heads/main ${'f'.repeat(40)} refs/heads/main ${zeros}\n`);
    assert.equal(gone.ok, false, 'a commit that is not here cannot be vouched for');
    assert.equal(gone.reason, 'unchecked');
    assert.notEqual(PUSH_PLAIN_TASK_TEXT, PUSH_UNCHECKED_TASK_TEXT);
  } finally {
    cleanup(off.parent, on.parent);
  }
});

test('the script run by hand, with no input and outside any folder, does nothing and says nothing', () => {
  const p = makeVaultProject({ enabled: true });
  const nowhere = mkdtempSync(join(tmpdir(), 'ab-nogit-'));
  try {
    const script = join(p.root, 'system', 'scripts', 'git-hooks', 'pre-push.mjs');
    const res = spawnSync(process.execPath, [script, 'origin', 'x'], { cwd: p.root, input: '', encoding: 'utf8', env: childEnv(p.root), windowsHide: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout + res.stderr, '');
    writeAttributeFiles(p.root);
    assert.equal(spawnSync(process.execPath, [script], { cwd: p.root, input: '', encoding: 'utf8', env: childEnv(p.root), windowsHide: true }).status, 0);
    const outside = spawnSync(process.execPath, [script, 'origin', 'x'], { cwd: nowhere, input: '', encoding: 'utf8', env: childEnv(p.root), windowsHide: true });
    assert.equal(outside.status, 0, 'outside a working folder there is nothing private to protect');
    assert.equal(outside.stdout + outside.stderr, '');
  } finally {
    cleanup(p.parent, nowhere);
  }
});

test('the stand-in for git-crypt is what these tests encrypt with', () => {
  assert.ok(existsSync(FAKE_GIT_CRYPT));
});
