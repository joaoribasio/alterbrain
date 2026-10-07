#!/usr/bin/env node
// vault-key: optional encryption of your most private notes before they reach GitHub (ADR 0019).
//
//   node system/scripts/vault-key.mjs status [--json]
//   node system/scripts/vault-key.mjs setup [--json]
//   node system/scripts/vault-key.mjs export [--out <file>] [--password] [--overwrite] [--json]
//   node system/scripts/vault-key.mjs check --key <file> [--json]
//   node system/scripts/vault-key.mjs unlock --key <file> [--json]
//
// status  Is encryption on, is the tool installed, is this computer unlocked, are the saved private notes encrypted.
// setup   Turns encryption on with git-crypt (which must already be installed; nothing is downloaded here), and installs
//         the upload check that also covers Obsidian Git (a git pre-push hook; see lib/vaultkey.mjs).
// export  Saves a copy of the key file outside the project, optionally protected by a password you type.
// check   The recovery drill: opens a key copy and proves it matches the key on this computer.
// unlock  For a new computer: uses a key copy to decrypt the notes after a fresh download (and installs the upload check).
//
// A password is typed by a person at a keyboard. It is never read from an argument, an environment variable or a
// pipe, so it cannot pass through Claude. Key bytes and passwords are never printed or logged.
// Exit codes: 0 = ok, 1 = a problem (or a refusal), 2 = wrong usage.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isMainModule, projectRoot } from '../lib/paths.mjs';
import { today } from '../lib/fsx.mjs';
import { IS_WINDOWS } from '../lib/proc.mjs';
import { commitAll, git, identityArgs, changedCount, isRepo, withLockRetry } from '../lib/git.mjs';
import {
  CancelledError, KEY_LOSS_WARNING, KeyFileError, NoTerminalError, PASSWORD_EXPLANATION, PASSWORD_ONLY_NOTE, PUSH_HOOK_TEXT, SCOPE_DIRS, SCOPE_LABELS,
  attributeFileRel, auditIndex, defaultKeyPath, encryptionEnabled, ensurePrePushHook, excludePathspecs, expandHome, getStatus, hasKeyboard, installCommand, isEncryptedPath,
  isInsideProject, keyFileOf, lockState, looksWrapped, parseWrapped, passwordProblem, readEncryptionConfig, readHidden, resolveGitCrypt, runGitCrypt,
  sameKey, suggestPassphrase, tempKeyPath, unwrapKey, updateEncryptionConfig, wrapKey, writeAttributeFiles, ENCRYPTED_SCOPE, GITCRYPT_HEADER,
} from '../lib/vaultkey.mjs';
import { findSecret } from '../hooks/block_secrets.mjs';
import { originIsFramework } from './git-auto.mjs';

const USAGE = [
  'Usage: node system/scripts/vault-key.mjs <command> [options]',
  '  status [--json]                                 show whether your private notes are encrypted',
  '  setup [--json]                                  turn encryption on (needs git-crypt installed)',
  '  export [--out <file>] [--password] [--overwrite] [--json]',
  '                                                  save a copy of the key file outside this folder',
  '  check --key <file> [--json]                     prove a key copy works (the recovery drill)',
  '  unlock --key <file> [--json]                    decrypt your notes on a new computer',
].join('\n');

const COMMANDS = new Set(['status', 'setup', 'export', 'check', 'unlock']);
const MAX_PASSWORD_TRIES = 3;

/* ------------------------------ small helpers ------------------------------ */

class Usage extends Error {}

/** Parse the command line. Throws Usage with a plain sentence. */
export function parseArgs(argv) {
  const out = { command: null, json: false, out: null, key: null, password: false, overwrite: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--password') out.password = true;
    else if (a === '--overwrite') out.overwrite = true;
    else if (a === '--out' || a === '--key') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Usage(`${a} needs a file name after it.`);
      out[a.slice(2)] = v;
      i++;
    } else if (/^--(out|key)=/.test(a)) {
      out[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
    } else if (/^--password=/i.test(a)) {
      throw new Usage('A password is never given on the command line. Add --password and type it when you are asked.');
    } else if (a.startsWith('--')) {
      throw new Usage(`I don't know the option ${a}.`);
    } else rest.push(a);
  }
  if (rest.length === 0) throw new Usage('Say what to do: status, setup, export, check or unlock.');
  if (rest.length > 1) throw new Usage("I don't understand the extra word after the command. If you meant a password, never type it here: it is asked for separately.");
  if (!COMMANDS.has(rest[0])) throw new Usage(`I don't know the command "${rest[0]}".`);
  out.command = rest[0];
  const allowed = { status: [], setup: [], export: ['out', 'password', 'overwrite'], check: ['key'], unlock: ['key'] }[out.command];
  for (const k of ['out', 'key', 'password', 'overwrite']) {
    const given = k === 'password' || k === 'overwrite' ? out[k] : out[k] !== null;
    if (given && !allowed.includes(k)) throw new Usage(`--${k} does not belong with "${out.command}".`);
  }
  if ((out.command === 'check' || out.command === 'unlock') && !out.key) throw new Usage(`"${out.command}" needs --key <your key file>.`);
  return out;
}

const result = (ok, lines, data = {}) => ({ ok, code: ok ? 0 : 1, lines: Array.isArray(lines) ? lines : [lines], data });

/** The command to type in a separate terminal, for the refusal message. */
const terminalCommand = (args) => `node system/scripts/vault-key.mjs ${args}`;

function needsTerminalResult(args) {
  return result(false, [
    'Type the password in your own terminal window, not through Claude.',
    `Run: ${terminalCommand(args)}`,
    'In the Claude desktop app, open the Terminal panel next to this conversation. Otherwise open a separate terminal window in this folder.',
  ], { error: 'needs-terminal', run: terminalCommand(args) });
}

const quote = (p) => (/\s/.test(p) ? `"${p}"` : p);

/** Ask for a password once. Resolves with { password }, or { stop: result } when there is no keyboard or the person cancelled. */
async function askPassword(ctx, prompt) {
  try {
    return { password: await ctx.getPassword(prompt) };
  } catch (e) {
    if (e instanceof NoTerminalError) return { stop: needsTerminalResult(ctx.terminalArgs || '') };
    if (e instanceof CancelledError) return { stop: result(false, 'Cancelled. Nothing was changed.', { error: 'cancelled' }) };
    throw e;
  }
}

/** Remove a temporary key file: overwrite first, then delete. Never throws. */
function wipe(file) {
  try {
    if (existsSync(file)) {
      try {
        writeFileSync(file, Buffer.alloc(Math.max(1, readFileSync(file).length)));
      } catch {
        /* deleting is what matters */
      }
      rmSync(file, { force: true });
    }
  } catch {
    /* nothing more can be done */
  }
}

/** Read a key file the user points at. Returns { bytes } or { stop }. */
function readKeyFile(file) {
  const abs = resolve(expandHome(file));
  if (!existsSync(abs)) return { stop: result(false, `I can't find the key file ${abs}. Check the name and the folder.`, { error: 'not-found' }) };
  try {
    const bytes = readFileSync(abs);
    if (bytes.length === 0) return { stop: result(false, `The key file ${abs} is empty.`, { error: 'empty' }) };
    return { bytes, abs };
  } catch {
    return { stop: result(false, `I can't read the key file ${abs}. Check that it is not open in another program.`, { error: 'unreadable' }) };
  }
}

/** Raw key bytes from a key file, asking for the password when the copy is protected. Returns { key, abs, wrapped } or { stop }. */
async function openKeyFile(ctx, file, wrappedNeeds) {
  const read = readKeyFile(file);
  if (read.stop) return read;
  if (!looksWrapped(read.bytes)) return { key: read.bytes, abs: read.abs, wrapped: false };
  try {
    parseWrapped(read.bytes); // a damaged or unknown file is reported before any password is asked for
  } catch (e) {
    if (e instanceof KeyFileError) return { stop: result(false, e.message, { error: e.code }) };
    throw e;
  }
  ctx.terminalArgs = wrappedNeeds;
  for (let attempt = 1; attempt <= MAX_PASSWORD_TRIES; attempt++) {
    const asked = await askPassword(ctx, 'Password for this key file: ');
    if (asked.stop) return asked;
    try {
      return { key: unwrapKey(read.bytes, asked.password), abs: read.abs, wrapped: true };
    } catch (e) {
      if (!(e instanceof KeyFileError)) throw e;
      if (e.code !== 'password' || attempt === MAX_PASSWORD_TRIES) return { stop: result(false, e.message, { error: e.code }) };
      ctx.print(e.message);
    }
  }
  return { stop: result(false, 'Too many wrong passwords. Nothing was changed.', { error: 'password' }) };
}

/* ------------------------------ status ------------------------------ */

const yesNo = (v, yes, no) => (v ? yes : no);

export function cmdStatus(ctx) {
  const st = getStatus(ctx.root);
  if (!st.enabled) {
    return result(true, [
      'Encryption of private notes is off.',
      'It is optional. To turn it on, open Claude and type /reconfigure.',
    ], { status: st });
  }
  const lines = [
    'Encryption of private notes is on.',
    `- Encryption tool (git-crypt): ${yesNo(st.git_crypt_installed, `installed${st.git_crypt_version ? ` (version ${st.git_crypt_version})` : ''}`, 'NOT installed')}`,
    `- This computer: ${yesNo(st.unlocked, 'unlocked (the key is here)', 'LOCKED (no key here)')}`,
    `- Saved private notes: ${st.encrypted} of ${st.tracked_in_scope} are encrypted${st.plain.length ? `, ${st.plain.length} are NOT` : ''}`,
    `- Key backup: ${st.key_backup_checked ? `last tested on ${st.key_backup_checked}` : 'never tested'}`,
    `- Upload check for Obsidian Git and other Git tools: ${yesNo(st.pre_push_hook === 'active', 'installed', 'NOT installed')}`,
  ];
  for (const p of st.problems) lines.push('', `Problem: ${p.message}`, `  Fix: ${p.fix}`);
  for (const n of st.notes) lines.push('', n);
  return { ...result(st.problems.length === 0, lines, { status: st }) };
}

/* ------------------------------ setup ------------------------------ */

/** Tracked files in the encrypted paths (from the index), as paths. */
function trackedInScope(root) {
  const r = git(['ls-files', '-z', '--', ...SCOPE_DIRS], { cwd: root });
  return r.ok && r.stdout ? r.stdout.split('\0').filter((p) => p && isEncryptedPath(p)) : [];
}

/** True when this folder already holds notes encrypted with a key that is not on this computer. */
function encryptedElsewhere(root) {
  const attrs = ENCRYPTED_SCOPE.map(attributeFileRel);
  const grep = git(['grep', '-l', '-e', 'filter=git-crypt', 'HEAD', '--', ...attrs], { cwd: root });
  if (grep.ok && grep.stdout) return true;
  const idx = auditIndex(root);
  return !idx.error && idx.tracked.length > idx.plain.length;
}

export async function cmdSetup(ctx) {
  const { root } = ctx;
  if (!isRepo(root)) return result(false, 'This folder is not under version control yet, so there is nowhere to encrypt for. Run onboarding step 1 first.', { error: 'no-repo' });
  if (originIsFramework(root)) {
    return result(false, 'This folder still points at the public Alterbrain page. Connect your own private GitHub backup first (open Claude and type /onboard setup), then turn encryption on.', { error: 'public-origin' });
  }
  const tool = resolveGitCrypt();
  if (!tool) {
    return result(false, [
      'The encryption tool (git-crypt) is not installed on this computer. I do not install it myself.',
      `Install it with: ${installCommand()}`,
      IS_WINDOWS
        ? 'Then run this again. (I look in the folder where Windows puts it, so a restart should not be needed. If I still cannot find it, close and reopen the Claude app.)'
        : 'Then run this again.',
    ], { error: 'tool-missing', install: installCommand() });
  }

  const before = lockState(root);
  if (!before.key_present && encryptedElsewhere(root)) {
    return result(false, [
      'This folder already holds encrypted notes, made with a key that is not on this computer.',
      'Setting it up again would create a second, different key and could make your notes unreadable.',
      'Unlock it with your key copy instead:',
      '  node system/scripts/vault-key.mjs unlock --key <your key file>',
    ], { error: 'encrypted-elsewhere' });
  }

  const steps = [];
  if (!before.key_present) {
    const init = runGitCrypt(['init'], { cwd: root });
    if (!init.ok) {
      return result(false, ['The encryption tool could not start.', firstLine(init.stderr || init.stdout) || 'It gave no reason.'], { error: 'init-failed' });
    }
    steps.push('Created a new key on this computer (inside the hidden .git folder).');
  } else {
    steps.push('A key already exists on this computer, so I kept it.');
  }

  // 1. The settings files go in first, and are saved on their own before any private note is re-saved.
  const changed = writeAttributeFiles(root);
  const attrFiles = ENCRYPTED_SCOPE.map(attributeFileRel);
  git(['add', '--', ...attrFiles], { cwd: root });
  const pending = git(['diff', '--cached', '--name-only', '--', ...attrFiles], { cwd: root });
  if (pending.ok && pending.stdout) {
    const commit = withLockRetry(() => git([...identityArgs(root), 'commit', '-m', 'Encrypt private notes: add the encryption settings', '--', ...attrFiles], { cwd: root }));
    if (!commit.ok) return result(false, ['The encryption settings could not be saved.', firstLine(commit.stderr || commit.stdout)], { error: 'commit-failed' });
    steps.push('Saved the encryption settings.');
  } else if (changed.length === 0) {
    steps.push('The encryption settings were already in place.');
  }

  // 2. Notes that are already saved are staged again, now through the encryption step.
  const tracked = trackedInScope(root);
  for (let i = 0; i < tracked.length; i += 100) {
    const add = git(['add', '--renormalize', '--', ...tracked.slice(i, i + 100)], { cwd: root });
    if (!add.ok) return result(false, ['Your existing private notes could not be prepared for encryption.', firstLine(add.stderr)], { error: 'renormalize-failed' });
  }
  if (tracked.length) steps.push(`Prepared ${tracked.length} existing private note${tracked.length === 1 ? '' : 's'} to be saved encrypted at the next save.`);

  // 3. The upload check inside git, so Obsidian Git (which uploads by itself) cannot send a plain private note.
  const hook = ensurePrePushHook(root);
  if (hook.state === 'active') {
    steps.push(hook.changed ? 'Installed a check that stops any Git tool, including Obsidian Git, from uploading a private note without encryption.' : 'The upload check for Obsidian Git and other Git tools was already in place.');
  }

  // 4. Prove it. A hook that someone else owns does not stop encryption from working: it is reported below instead.
  const st = getStatus(root);
  const blocking = st.problems.filter((p) => !p.id.startsWith('push-hook-'));
  if (blocking.length) {
    return result(false, ['Encryption is not working yet:', ...blocking.flatMap((p) => [`- ${p.message}`, `  Fix: ${p.fix}`])], { error: 'verify-failed', status: st });
  }
  try {
    updateEncryptionConfig(root, { enabled: true, tool: 'git-crypt', scope: SCOPE_LABELS });
  } catch (e) {
    return result(false, [`Encryption works, but I could not record it in your settings. ${e.message}`], { error: 'config-failed' });
  }

  const hookWarning = hook.state === 'active' ? [] : [`Warning: ${hook.message || PUSH_HOOK_TEXT[hook.state] || PUSH_HOOK_TEXT.error}`, 'Ask Claude to run /health-check, and keep Obsidian Git switched off until then.', ''];
  return result(true, [
    'Encryption of your private notes is on.',
    ...steps.map((s) => `- ${s}`),
    '- Checked: every saved private note is encrypted.',
    '',
    ...hookWarning,
    'What stays plain: on this computer your notes are normal files, so Claude and Obsidian read them as usual. Only the copy that goes to GitHub is encrypted. File and folder names are not encrypted.',
    '',
    `Important: ${KEY_LOSS_WARNING}`,
    '',
    'Next: save a copy of the key outside this folder, with:',
    '  node system/scripts/vault-key.mjs export --out <a folder outside this project>',
  ], { status: st, steps, pre_push_hook: hook.state });
}

const firstLine = (text) => String(text || '').split(/\r?\n/).find((l) => l.trim()) || '';

/* ------------------------------ export ------------------------------ */

export async function cmdExport(ctx) {
  const { root } = ctx;
  const wrapped = Boolean(ctx.password);
  const out = resolve(expandHome(ctx.out || defaultKeyPath(root, wrapped)));
  ctx.terminalArgs = `export --out ${quote(out)} --password`;

  if (isInsideProject(root, out)) {
    return result(false, [
      'The key file cannot be saved inside this project folder, because the folder is backed up to GitHub and the key would go with it.',
      `Choose a folder outside it, for example: ${defaultKeyPath(root, wrapped)}`,
    ], { error: 'inside-project' });
  }
  if (existsSync(out) && !ctx.overwrite) {
    return result(false, [`There is already a file at ${out}.`, 'Choose another name, or add --overwrite to replace it.'], { error: 'exists' });
  }
  // A password is typed by a person at a keyboard, never through Claude: refuse before anything else happens.
  if (wrapped && !(ctx.hasKeyboard ?? hasKeyboard)()) return needsTerminalResult(ctx.terminalArgs);
  const lock = lockState(root);
  if (!lock.installed) return result(false, ['The encryption tool (git-crypt) is not installed on this computer.', `Install it with: ${installCommand()}`], { error: 'tool-missing' });
  if (!lock.key_present) return result(false, ['This computer has no key to copy, because your private notes are locked here (or encryption is not set up).', 'To set it up, run: node system/scripts/vault-key.mjs setup'], { error: 'locked' });

  // The password is asked for before anything is exported.
  let password = null;
  if (wrapped) {
    ctx.print(PASSWORD_EXPLANATION);
    ctx.print('Choose a password for the backup copy of your key file (at least 10 characters).');
    ctx.print(`A good one is four unrelated words. For example: ${suggestPassphrase()}   (made up just now as an example, so choose your own)`);
    ctx.print('Write it in your password manager. If you forget it, you can export a new copy from this computer, but only while this computer works.');
    for (let attempt = 1; ; attempt++) {
      const first = await askPassword(ctx, 'New password: ');
      if (first.stop) return first.stop;
      const problem = passwordProblem(first.password);
      if (problem) {
        ctx.print(problem);
      } else {
        const second = await askPassword(ctx, 'Type it again: ');
        if (second.stop) return second.stop;
        if (second.password === first.password) {
          password = first.password;
          break;
        }
        ctx.print('The two passwords did not match.');
      }
      if (attempt >= MAX_PASSWORD_TRIES) return result(false, 'No password was set, so no key file was saved.', { error: 'password' });
    }
  }

  const tmp = tempKeyPath(root);
  try {
    mkdirSync(dirname(tmp), { recursive: true });
    const exported = runGitCrypt(['export-key', tmp], { cwd: root });
    if (!exported.ok || !existsSync(tmp)) {
      return result(false, ['The key could not be exported.', firstLine(exported.stderr || exported.stdout) || 'The encryption tool gave no reason.'], { error: 'export-failed' });
    }
    const raw = readFileSync(tmp);
    if (raw.length === 0) return result(false, 'The exported key was empty, so nothing was saved.', { error: 'export-failed' });
    const bytes = wrapped ? Buffer.from(`${JSON.stringify(wrapKey(raw, password, ctx.kdf))}\n`, 'utf8') : raw;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes, { mode: 0o600, flag: ctx.overwrite ? 'w' : 'wx' });
    try {
      chmodSync(out, 0o600);
    } catch {
      /* Windows keeps its own permissions */
    }
    // Read it back, so a damaged copy is found now and not on the day it is needed.
    const back = readFileSync(out);
    const opened = wrapped ? unwrapKey(back, password) : back;
    if (!sameKey(opened, raw)) {
      wipe(out);
      return result(false, 'The saved copy did not read back correctly, so I removed it. Try again, and choose a different folder if it happens again.', { error: 'readback-failed' });
    }
  } catch (e) {
    if (e instanceof KeyFileError) return result(false, e.message, { error: e.code });
    return result(false, [`The key file could not be saved to ${out}.`, firstLine(e && e.message)], { error: 'write-failed' });
  } finally {
    wipe(tmp);
  }

  const lines = [
    `Saved a copy of your key file: ${out}`,
    wrapped ? 'It is protected by the password you chose.' : 'It has no password, so keep it somewhere only you can open (your password manager is best).',
    '',
    `Important: ${KEY_LOSS_WARNING}`,
    PASSWORD_ONLY_NOTE,
    '',
    'Next: prove the copy works. This is the recovery drill, and it takes a minute:',
    `  node system/scripts/vault-key.mjs check --key ${quote(out)}`,
    'On a new computer you would use:',
    `  node system/scripts/vault-key.mjs unlock --key ${quote(out)}`,
  ];
  return result(true, lines, { out, wrapped });
}

/* ------------------------------ check ------------------------------ */

export async function cmdCheck(ctx) {
  const { root } = ctx;
  const opened = await openKeyFile(ctx, ctx.key, `check --key ${quote(ctx.key)}`);
  if (opened.stop) return opened.stop;
  const localFile = keyFileOf(root);
  if (!localFile || !existsSync(localFile)) {
    return result(true, [
      `The key file opens${opened.wrapped ? ' with that password' : ''}, but this computer is locked, so I cannot compare it with the key here.`,
      'The real test is to unlock with it: node system/scripts/vault-key.mjs unlock --key <your key file>',
    ], { compared: false, opened: true });
  }
  const local = readFileSync(localFile);
  if (!sameKey(opened.key, local)) {
    return result(false, [
      'This key file does not match the key on this computer. It would not unlock your notes.',
      'It may belong to another project, or an older key. Export a fresh copy from this computer, then check that one.',
    ], { error: 'mismatch', compared: true });
  }
  let recorded = false;
  if (readEncryptionConfig(root).readable && encryptionEnabled(root)) {
    try {
      updateEncryptionConfig(root, { key_backup_checked: today() });
      recorded = true;
    } catch {
      /* the check itself still succeeded */
    }
  }
  return result(true, [
    'Your key backup works.',
    `It matches the key on this computer${opened.wrapped ? ' and the password is right' : ''}. File: ${opened.abs}`,
    recorded ? `I noted today (${today()}) as the date of the last test.` : 'I could not note the date in your settings, but the check itself passed.',
  ], { compared: true, opened: true, recorded });
}

/* ------------------------------ unlock ------------------------------ */

/** How many of these files on disk still start with the encrypted header (so they are still locked). */
function stillEncryptedOnDisk(root, paths) {
  let n = 0;
  for (const p of paths) {
    try {
      const buf = readFileSync(resolve(root, p)).subarray(0, GITCRYPT_HEADER.length);
      if (buf.equals(GITCRYPT_HEADER)) n++;
    } catch {
      /* a file that is gone is not locked */
    }
  }
  return n;
}

export async function cmdUnlock(ctx) {
  const { root } = ctx;
  if (!isRepo(root)) return result(false, 'This folder is not under version control, so there is nothing to unlock.', { error: 'no-repo' });
  if (!resolveGitCrypt()) {
    return result(false, ['The encryption tool (git-crypt) is not installed on this computer.', `Install it with: ${installCommand()}`, 'Then run this again.'], { error: 'tool-missing' });
  }
  if (lockState(root).unlocked) {
    const hook = ensurePrePushHook(root); // a computer that was unlocked before this check existed gets it now
    const warn = hook.state === 'active' ? [] : [hook.message || PUSH_HOOK_TEXT[hook.state] || PUSH_HOOK_TEXT.error];
    return result(true, ['This computer is already unlocked. Nothing to do.', ...warn], { already: true, pre_push_hook: hook.state });
  }

  const opened = await openKeyFile(ctx, ctx.key, `unlock --key ${quote(ctx.key)}`);
  if (opened.stop) return opened.stop;

  // The unlock tool needs a tidy folder. Save everything that is not private first (private notes stay as they are).
  const notes = [];
  if (changedCount(root) > 0) {
    const saved = commitAll(root, 'auto: save before unlocking', {}, { scan: (t) => { const h = findSecret(t); return h && h.level === 'high' ? h : null; }, exclude: excludePathspecs() });
    if (saved.ok && !saved.nothing) notes.push(`Saved ${saved.files} other changed file${saved.files === 1 ? '' : 's'} first, so unlocking could run.`);
  }

  const tmp = tempKeyPath(root);
  let unlocked;
  try {
    mkdirSync(dirname(tmp), { recursive: true });
    writeFileSync(tmp, opened.key, { mode: 0o600 });
    unlocked = runGitCrypt(['unlock', tmp], { cwd: root });
  } finally {
    wipe(tmp);
  }
  if (!unlocked.ok) {
    const why = firstLine(unlocked.stderr || unlocked.stdout);
    const tidy = /not clean|uncommitted|working directory/i.test(`${unlocked.stderr}${unlocked.stdout}`);
    return result(false, [
      'Unlocking did not work.',
      why || 'The encryption tool gave no reason.',
      tidy ? 'The folder has unsaved changes. Close your Claude session (it saves them), or ask Claude to check the backup, then try again.' : 'Check that this is the key file for this project (the recovery drill, "check", works on the computer that made it).',
    ], { error: 'unlock-failed' });
  }

  const st = getStatus(root);
  const tracked = trackedInScope(root);
  const locked = stillEncryptedOnDisk(root, tracked);
  if (!st.unlocked || locked > 0) {
    return result(false, [
      locked ? `${locked} private note${locked === 1 ? ' is' : 's are'} still encrypted on this computer.` : 'The key was accepted, but this computer does not show as unlocked.',
      'Run: node system/scripts/vault-key.mjs status   to see what is wrong.',
    ], { error: 'still-locked', status: st });
  }
  const hook = ensurePrePushHook(root);
  const hookLines = hook.state === 'active' ? (hook.changed ? ['- Installed the check that stops any Git tool, including Obsidian Git, from uploading a private note without encryption.'] : []) : [`Warning: ${hook.message || PUSH_HOOK_TEXT[hook.state] || PUSH_HOOK_TEXT.error}`, 'Ask Claude to run /health-check, and keep Obsidian Git switched off until then.'];
  return result(true, [
    'Unlocked. Your private notes are readable on this computer.',
    ...notes.map((n) => `- ${n}`),
    `- ${tracked.length} private note${tracked.length === 1 ? '' : 's'} decrypted.`,
    ...hookLines,
    'From now on Alterbrain saves them encrypted automatically.',
  ], { unlocked: true, decrypted: tracked.length, pre_push_hook: hook.state });
}

/* ------------------------------ main ------------------------------ */

/** Build the context for a command. `io` lets tests inject the password, the terminal check and the printing. */
function makeContext(args, io) {
  return {
    root: io.root || projectRoot(),
    out: args.out,
    key: args.key,
    password: args.password,
    overwrite: args.overwrite,
    kdf: io.kdf,
    hasKeyboard: io.hasKeyboard,
    getPassword: io.getPassword || ((prompt) => readHidden(prompt)),
    // Progress lines appear straight away (a prompt must come after its explanation). JSON mode keeps stdout clean.
    print: io.print || ((text) => (args.json ? process.stderr : process.stdout).write(`${text}\n`)),
    terminalArgs: '',
  };
}

export async function runVaultKey(argv, io = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    return { code: 2, stdout: '', stderr: `${e.message}\n${USAGE}\n`, result: null };
  }
  const ctx = makeContext(args, io);
  let res;
  try {
    if (args.command === 'status') res = cmdStatus(ctx);
    else if (args.command === 'setup') res = await cmdSetup(ctx);
    else if (args.command === 'export') res = await cmdExport(ctx);
    else if (args.command === 'check') res = await cmdCheck(ctx);
    else res = await cmdUnlock(ctx);
  } catch (e) {
    res = result(false, ['Something unexpected went wrong. Nothing secret was shown.', firstLine(e && e.message)], { error: 'unexpected' });
  }
  const stdout = args.json
    ? `${JSON.stringify({ ok: res.ok, command: args.command, message: res.lines.join('\n'), ...res.data })}\n`
    : `${res.lines.join('\n')}\n`;
  return { code: res.code, stdout, stderr: '', result: res };
}

async function main(argv) {
  const run = await runVaultKey(argv);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.stdout) process.stdout.write(run.stdout);
  return run.code;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
