#!/usr/bin/env node
// git-auto: invisible backup. pull | commit | push | status
// Never forces anything. Skips itself in dev mode or when config/brain.json
// says git.auto_commit is false. On a real problem it adds a plain-language
// task (tag "git") and writes one line to state/local/git.log.
//
// Safety rules (all of them stop quietly, with a plain-language message):
//   - never pulls from or pushes to the public Alterbrain repo (a fresh clone still points there);
//   - never saves while a file is half-merged, and joins the online copy by committing first, never by stashing;
//   - takes a file out of a save when it looks like it holds a password or key, and leaves a task about it;
//   - when config/brain.json exists but cannot be read, the online backup is paused instead of guessing;
//   - big files (ADR 0020): ordinary documents go to ordinary git. A file at or above the size limit (50 MB by default,
//     git.lfs_min_mb in config/brain.json) gets an exact-path rule in vault/.gitattributes and goes through Git LFS. A file
//     that cannot be stored that way (no Git LFS, an encrypted folder, 2 GB or more, outside the vault) is left out of the
//     save, with a task. Files that were stored through the old root rules keep their rule. Git LFS files are uploaded
//     before the commits that point to them;
//   - the same big-file rule holds for Obsidian Git and every other Git tool on a computer: a small pre-commit hook
//     (installed by this script, node system/scripts/git-auto.mjs hook) runs "git-auto pre-commit" before each save and
//     sends big files to Git LFS. It never stops a save. A phone's Git does not run hooks, so `push` also refuses early,
//     with a clear task, when a saved ordinary file is too big for GitHub (about 100 MB);
//   - a big Git LFS upload can take longer than a hook may wait, so `push --background` (or ALTERBRAIN_PUSH_BACKGROUND=1,
//     which the SessionEnd hook sets) starts it as a separate process that keeps going (one at a time,
//     state/local/lfs-upload.lock) instead of being stopped half way. `--background-now` starts it whatever the size;
//   - when encryption of private notes is on (ADR 0019): a copy that cannot encrypt (locked, or git-crypt missing)
//     never stages the private paths, a private note that would be stored as plain text is left out of the save,
//     and a push is refused while any commit about to be uploaded holds a private note as plain text. That last
//     check FAILS CLOSED: if it cannot run, nothing is pushed (the one place this tool does not fail open).
import { projectRoot, rootPath, isDevMode, isMainModule } from '../lib/paths.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, readJsonChecked, appendLine, nowStamp } from '../lib/fsx.mjs';
import { addTask } from '../lib/tasks.mjs';
import {
  gitInstalled, isRepo, remoteUrl, currentBranch, changedCount, aheadBehind, parseRepoUrl,
  hasCommits, operationInProgress, commitAll, pullRebase, pushCurrent, git, lfsInstallCommand,
  PRE_COMMIT_HOOK_TEXT, backgroundUploadBytes, checkStagedBigFiles, ensurePreCommitHook, lfsPendingUpload,
  preCommitHookStatus, unpushedOversizedBlobs,
} from '../lib/git.mjs';
import { findSecret } from '../hooks/block_secrets.mjs';
import {
  SCOPE_DIRS, UNLOCK_COMMAND, auditStaged, auditUnpushed, encryptionContext, encryptionEnabled, excludePathspecs,
  installCommand, isEncryptedPath, pendingPrivateChanges,
} from '../lib/vaultkey.mjs';

const COMMANDS = ['pull', 'commit', 'push', 'status'];
// Used by the hook file git writes into .git/hooks (pre-commit) and by setup: not part of the everyday usage line.
const INTERNAL = ['pre-commit', 'hook'];
/** The exit code of "pre-commit" when the big files were the only thing in the save. The hook file turns it into "nothing to save". */
const PRE_COMMIT_NOTHING_LEFT = 3;

function retryOptions() {
  const ms = Number(process.env.ALTERBRAIN_GIT_RETRY_MS);
  return { retries: 3, delayMs: Number.isFinite(ms) && ms >= 0 ? ms : 800 };
}

function gitConfig() {
  const checked = readJsonChecked(rootPath('config', 'brain.json'));
  const brain = (checked.ok && checked.value) || {};
  const g = brain.git || {};
  // A settings file that exists but cannot be read must not turn the online backup back on.
  return { auto_commit: g.auto_commit !== false, auto_push: checked.ok && g.auto_push !== false, config_unreadable: !checked.ok };
}

/** Only a high-confidence secret holds a file back from a save (a short "password = ..." in a note is allowed). */
const scanForSecrets = (text) => {
  const hit = findSecret(text);
  return hit && hit.level === 'high' ? hit : null;
};

/** Tasks for files that were left out of a save. */
function reportHeld(held) {
  for (const h of held || []) {
    try {
      addTask({
        text: `Alterbrain left "${h.file}" out of your backup because it looks like it holds ${h.kind}. Take the password or key out of it (keys belong in .env.local), and it will be saved with the next save.`,
        tag: 'git',
        priority: 'high',
      });
    } catch {
      /* a task is a nice-to-have */
    }
    logFailure('commit', 'held', `${h.file} ${h.kind}`);
  }
}

// Tasks for big files that were left out of a save (ADR 0020). One line per kind, so repeated saves do not pile them up.
// Only the "private" text must never name a file: file names are not encrypted and Tasks.md is backed up in clear.
const BIG_TASK = {
  'no-lfs': () => `Alterbrain left some big files out of your backup because Git LFS (a free add-on that stores big files) is not installed on this computer. Install it with: \`${lfsInstallCommand()}\`, and they will be saved with the next save.`,
  private: () => 'A very large private file is kept only on this computer. Your private notes are encrypted before they go online, and a file that big cannot be stored with that encryption, so it is not backed up online. Keep a copy somewhere else too.',
  'too-big': (path) => `"${path}" is 2 GB or more. That is too big to back up safely online, so it is kept only on this computer. Keep another copy somewhere else.`,
  'outside-vault': (path) => `"${path}" is a big file outside your vault, so it was left out of your backup. Move it into your vault and it will be saved with the next save.`,
  'rule-failed': (path) => `Alterbrain could not set up storage for the big file "${path}", so it was left out of your backup. Open Claude and type /health-check`,
};

/** Tasks and log lines for the files a save left out because of their size. Returns how many were left out. */
function reportBigFiles(command, big) {
  const left = (big && big.left_out) || [];
  for (const { path, reason } of left) {
    const text = BIG_TASK[reason];
    if (!text) continue;
    try {
      addTask({ text: text(path), tag: 'git', priority: 'medium' });
    } catch {
      /* a task is a nice-to-have */
    }
    logFailure(command, 'big-file', reason === 'private' ? 'private file left out' : `${reason} ${path}`);
  }
  return left.length;
}

const bigNote = (n) => (n ? ` ${n} big file${n === 1 ? ' was' : 's were'} left out of the backup (see your task list).` : '');

/** True when origin is still the public Alterbrain repo (from system/release.json or state/release-origin.json). */
export function originIsFramework(root = projectRoot()) {
  const url = remoteUrl(root);
  if (!url) return false;
  const parsed = parseRepoUrl(url);
  const known = [];
  const release = readJson(rootPath('system', 'release.json'), {}) || {};
  const recorded = readJson(rootPath('state', 'release-origin.json'), null) || {};
  if (release.repo) known.push(String(release.repo).toLowerCase());
  if (recorded.repo) known.push(String(recorded.repo).toLowerCase());
  if (parsed && known.includes(`${parsed.owner}/${parsed.name}`.toLowerCase())) return true;
  const strip = (u) => String(u).trim().toLowerCase().replace(/\.git\/?$/, '').replace(/\/+$/, '');
  return Boolean(recorded.url && strip(recorded.url) === strip(url));
}

const TASK_TEXT = {
  conflict: 'Your notes changed in two places and could not be joined safely. Nothing was lost or overwritten. Open Claude and type /health-check',
  auth: 'Alterbrain could not sign in to GitHub to back up your work. Open Claude and type /health-check',
  rejected: 'GitHub holds newer work than this computer, so the backup was paused. Open Claude and type /health-check',
  storage: 'GitHub has no room left for your big files, so the backup was paused. Open Claude and type /health-check',
  // Never names a file: file names are not encrypted and Tasks.md is backed up in clear.
  'big-blob': 'A very big file was saved as an ordinary file, which GitHub refuses (about 100 MB), so the online backup is paused. Nothing is lost: it is all safe on this computer. Open Claude and type /health-check',
  lock: 'Git is busy or stuck, so your work was not saved just now. Close other Git tools, then open Claude and type /health-check',
  identity: 'Git does not know your name yet, so your work was not saved. Open Claude and type /health-check',
  other: 'Alterbrain could not save or back up your work. Open Claude and type /health-check',
};

function logFailure(command, kind, detail) {
  const line = `${new Date().toISOString()} ${command} ${kind} ${String(detail || '').replace(/\s+/g, ' ').slice(0, 300)}`;
  try {
    appendLine(rootPath('state', 'local', 'git.log'), line);
  } catch {
    /* logging must never break the caller */
  }
}

/** Record a failure. Being offline is only logged: it fixes itself. */
function reportFailure(command, kind, detail) {
  logFailure(command, kind, detail);
  if (kind === 'network' || kind === 'timeout') return false; // both fix themselves: the next save tries again
  try {
    addTask({ text: TASK_TEXT[kind] || TASK_TEXT.other, tag: 'git', priority: 'medium' });
    return true;
  } catch {
    return false;
  }
}

const result = (command, status, message, extra = {}) => ({ command, status, message, ...extra });

// What a failed push says, by kind (the rest say "could not be backed up online").
const PUSH_WHY = {
  network: 'Could not reach GitHub (are you offline?). The backup will retry later.',
  timeout: 'The upload took longer than allowed and was stopped. It starts again at the next save.',
  'big-blob': 'A saved file is too big for GitHub to accept, so the online backup is paused. Your work is safe on this computer (see your task list).',
};

// Tasks for the encryption safety checks. They never name a note: file names are not encrypted and Tasks.md is backed up.
const ENC_TASK = {
  locked: `Your private notes are locked on this computer, so I did not save changes to them. Unlock with: \`${UNLOCK_COMMAND}\``,
  noTool: () => `The encryption tool (git-crypt) is not installed on this computer, so I did not save changes to your private notes. Install it with: \`${installCommand()}\`, then unlock with: \`${UNLOCK_COMMAND}\``,
  plainLeftOut: 'Some of your private notes would have been saved without encryption, so I left them out of the backup. Open Claude and type /health-check',
  checkFailed: 'Alterbrain could not check that your private notes are encrypted, so it left them out of the save. Open Claude and type /health-check',
  pushPlain: 'Alterbrain stopped the online backup because some of your private notes were about to be uploaded without encryption. Nothing was uploaded. Open Claude and type /health-check',
  pushUnchecked: 'Alterbrain could not check that your private notes are encrypted, so it did not back up online. Nothing was uploaded. Open Claude and type /health-check',
};

function encryptionTask(text) {
  try {
    addTask({ text, tag: 'git', priority: 'high' });
  } catch {
    /* a task is a nice-to-have */
  }
}

/**
 * What the save must do when encryption of private notes is on. Returns { enabled, safe, opts } where opts goes to
 * commitAll / pullRebase: `exclude` keeps private paths out of the save on a copy that cannot encrypt, and `screen`
 * takes out any private note that would be stored as plain text. If anything about this is unclear, it leaves private
 * notes out (it never guesses that it is safe).
 */
function encryptionOptions(root, command) {
  let enc;
  try {
    enc = encryptionContext(root);
  } catch {
    enc = { enabled: true, safe: false, lock: { installed: false } };
  }
  if (!enc.enabled) return { enabled: false, safe: true, opts: {} };
  const opts = {
    // A big file in an encrypted folder cannot use Git LFS (the folder's git-crypt rule wins), so it is left out of the save.
    big: { isPrivate: (path) => isEncryptedPath(path) },
    screen: (cwd) => {
      const audit = auditStaged(cwd);
      if (audit.error) {
        logFailure(command, 'encryption-check', audit.error);
        encryptionTask(ENC_TASK.checkFailed);
        return { unstage: SCOPE_DIRS, error: audit.error };
      }
      if (audit.plain.length) {
        logFailure(command, 'unencrypted', `${audit.plain.length} private note(s) left out`);
        encryptionTask(ENC_TASK.plainLeftOut);
        return { unstage: audit.plain };
      }
      return { unstage: [] };
    },
  };
  if (!enc.safe) {
    opts.exclude = excludePathspecs();
    if (pendingPrivateChanges(root) > 0) {
      logFailure(command, 'locked', 'private notes left out of the save');
      encryptionTask(enc.lock && enc.lock.installed === false ? ENC_TASK.noTool() : ENC_TASK.locked);
    }
  }
  return { enabled: true, safe: enc.safe, opts };
}

/** Before an upload: null when it may go ahead, or a failed result. Fails closed. */
function pushBlocked(root) {
  if (!encryptionEnabled(root) || !remoteUrl(root)) return null; // nothing goes up without an online copy
  const audit = auditUnpushed(root);
  if (audit.error) {
    logFailure('push', 'encryption-check', audit.error);
    encryptionTask(ENC_TASK.pushUnchecked);
    return result('push', 'failed', 'Your private notes could not be checked for encryption, so nothing was uploaded.', { kind: 'encryption', error: audit.error });
  }
  if (audit.plain.length) {
    logFailure('push', 'unencrypted', `${audit.plain.length} private note(s) stored as plain text; upload refused`);
    encryptionTask(ENC_TASK.pushPlain);
    return result('push', 'failed', 'Some of your private notes are stored without encryption, so nothing was uploaded.', { kind: 'encryption', plain_files: audit.plain.length });
  }
  return null;
}

function skipReason(command, cfg) {
  const root = projectRoot();
  if (isDevMode()) return 'Developer mode is on, so automatic saving is off.';
  if (!cfg.auto_commit) return 'Automatic saving is switched off in config/brain.json.';
  if (command === 'push' && !cfg.auto_push) {
    return cfg.config_unreadable
      ? 'config/brain.json could not be read, so the online backup is paused until it is fixed.'
      : 'Automatic online backup is switched off in config/brain.json.';
  }
  if (!gitInstalled()) return 'Git is not installed on this computer.';
  if (!isRepo(root)) return 'This folder is not under version control yet.';
  if ((command === 'pull' || command === 'push') && originIsFramework(root)) {
    return 'This folder is still connected to the public Alterbrain page, so nothing is pulled from it or pushed to it. Run: node system/scripts/setup-github.mjs --detach-only';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Big uploads in the background                                       */
/* ------------------------------------------------------------------ */
// Git LFS cannot resume an upload that was stopped, and a hook may only wait seconds. A big upload therefore runs as a
// separate process (git-auto push --detached) that the hook does not wait for. One at a time: the lock file holds the
// process number and the start time. A lock whose process is gone, or that is older than LOCK_MAX_AGE_MS, is ignored.

const DETACHED_TIMEOUT_MS = 2 * 60 * 60 * 1000; // one step of a background upload (git LFS push, git push)
const LOCK_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const lockFile = () => rootPath('state', 'local', 'lfs-upload.lock');

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return Boolean(e && e.code === 'EPERM'); // it exists, we just may not signal it
  }
}

/** The running background upload: { pid, started, token }, or null (no lock, or a stale one, which is removed). */
export function runningUpload(now = Date.now()) {
  const file = lockFile();
  if (!existsSync(file)) return null;
  let lock = null;
  try {
    lock = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    /* unreadable: judged by the file's age below */
  }
  let fresh;
  if (lock && typeof lock === 'object') {
    fresh = pidAlive(lock.pid) && Number.isFinite(lock.started) && now - lock.started < LOCK_MAX_AGE_MS && lock.started <= now + 60_000;
  } else {
    try {
      fresh = now - statSync(file).mtimeMs < 5 * 60 * 1000; // being written right now
    } catch {
      fresh = false;
    }
  }
  if (fresh) return lock && typeof lock === 'object' ? lock : { pid: 0, started: now, token: '' };
  try {
    rmSync(file, { force: true });
  } catch {
    /* another process may have removed it first */
  }
  return null;
}

/** Take the lock for a new background upload. Returns the token, or null when one is already running. */
function takeUploadLock() {
  const token = `${process.pid}-${Date.now()}`;
  const body = (pid) => JSON.stringify({ pid, started: Date.now(), token });
  mkdirSync(dirname(lockFile()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lockFile(), body(process.pid), { flag: 'wx' });
      return token;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') return null;
      if (runningUpload()) return null; // removes a stale lock, so the second attempt can succeed
    }
  }
  return null;
}

/** Hand the lock to the process that now does the work. */
function giveUploadLock(token, pid) {
  try {
    if (existsSync(lockFile()) && JSON.parse(readFileSync(lockFile(), 'utf8')).token === token) {
      writeFileSync(lockFile(), JSON.stringify({ pid, started: Date.now(), token }));
    }
  } catch {
    /* a lock that stays with this process's number is cleaned up as stale */
  }
}

function releaseUploadLock(token) {
  try {
    const lock = JSON.parse(readFileSync(lockFile(), 'utf8'));
    if ((token && lock.token === token) || lock.pid === process.pid) rmSync(lockFile(), { force: true });
  } catch {
    /* no lock, or not ours */
  }
}

/**
 * Start the upload as a separate process. Returns a result to report, or null when it should be done right here instead
 * (nothing to upload, or only a little, or a background process could not be started).
 * opts.force: start it whatever the size (used after a push ran out of time).
 */
function startBackgroundUpload(root, opts = {}) {
  if (!remoteUrl(root)) return null;
  const branch = currentBranch(root);
  if (!branch || !hasCommits(root)) return null;
  let pending = null;
  if (!opts.force) {
    pending = lfsPendingUpload(root);
    if (!pending || pending.count === 0 || pending.bytes < backgroundUploadBytes()) return null; // quick enough to do now
  }
  // A file GitHub would refuse fails at once and says why; the foreground push reports that.
  if (unpushedOversizedBlobs(root).files.length) return null;
  const token = takeUploadLock();
  if (!token) return result('push', 'skipped', 'A big upload is already running in the background. Your work will be backed up when it finishes.', { background: true, running: true });
  let child = null;
  try {
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'push', '--detached'], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ALTERBRAIN_UPLOAD_TOKEN: token },
    });
    child.on('error', () => releaseUploadLock(token));
    child.unref();
  } catch {
    child = null;
  }
  if (!child || !child.pid) {
    releaseUploadLock(token);
    return null;
  }
  giveUploadLock(token, child.pid);
  const mb = pending ? Math.max(1, Math.round(pending.bytes / (1024 * 1024))) : null;
  logFailure('push', 'background-upload', pending ? `started: ${pending.count} big file(s), about ${mb} MB` : 'started: the upload ran out of time here');
  return result(
    'push',
    'ok',
    `${mb ? `A big upload (about ${mb} MB) is` : 'The upload is'} running in the background. Your work is saved on this computer, and the backup finishes by itself.`,
    { background: true, started: true, pending: pending || undefined },
  );
}

/* ------------------------------------------------------------------ */
/* The big-file check that Git runs before every save                  */
/* ------------------------------------------------------------------ */

/**
 * `git-auto pre-commit`: run by the hook file in .git/hooks, whichever Git tool saves (Obsidian Git included). Sends the
 * big files that are staged right now to Git LFS, and takes out of this save the ones that cannot be stored safely.
 * It never stops a save: the hook ignores the exit code, and a failure here only means the check could not be done.
 */
function preCommitCheck(root) {
  if (!gitInstalled() || !isRepo(root)) return result('pre-commit', 'skipped', '');
  // Asked only for a file that is big, so a save without one never pays for looking at the encryption settings.
  let encrypting = null;
  const isPrivate = (path) => {
    if (encrypting === null) {
      try {
        encrypting = encryptionContext(root).enabled;
      } catch {
        encrypting = true; // unclear: treat the private folders as private
      }
    }
    return encrypting && isEncryptedPath(path);
  };
  const res = checkStagedBigFiles(root, { isPrivate, retry: retryOptions() });
  if (res.error) {
    logFailure('pre-commit', 'big-file-check', res.error);
    return result('pre-commit', 'failed', '', { error: res.error });
  }
  const left = reportBigFiles('pre-commit', res);
  const routed = res.routed.length + res.healed.length;
  if (routed) logFailure('pre-commit', 'big-file', `${routed} big file(s) sent to Git LFS`);
  // When the big file was the only thing in this save, there is nothing left to save: say so, as git itself would.
  const nothingLeft = left > 0 && git(['diff', '--cached', '--quiet'], { cwd: root }).code === 0;
  const message = left ? `Alterbrain left ${left} big file${left === 1 ? '' : 's'} out of this save (see your task list).${nothingLeft ? ' Nothing else was waiting to be saved.' : ''}` : '';
  return result('pre-commit', 'ok', message, { routed: res.routed, healed: res.healed, left_out: res.left_out.map((l) => ({ reason: l.reason })), nothing_left: nothingLeft });
}

/** `git-auto hook`: install or refresh that check. Safe to repeat. */
function hookCommand(root) {
  if (!gitInstalled()) return result('hook', 'skipped', 'Git is not installed on this computer.');
  if (!isRepo(root)) return result('hook', 'skipped', 'This folder is not under version control yet.');
  const h = ensurePreCommitHook(root);
  if (h.state === 'active') {
    return result('hook', 'ok', h.changed ? 'Installed the check that sends big files to Git LFS, whichever Git tool saves them (Obsidian Git included).' : 'The check for big files was already in place.', { state: 'active', changed: h.changed });
  }
  return result('hook', 'failed', h.message || PRE_COMMIT_HOOK_TEXT[h.state] || PRE_COMMIT_HOOK_TEXT.error, { state: h.state });
}

export function runCommand(command, opts = {}) {
  const root = projectRoot();
  const cfg = gitConfig();

  if (command === 'status') return statusReport(root, cfg);

  const reason = skipReason(command, cfg);
  if (reason) {
    if (cfg.config_unreadable && command === 'push') {
      try {
        addTask({ text: 'Your settings file config/brain.json could not be read, so the online backup is paused. Open Claude and type /health-check', tag: 'git', priority: 'medium' });
      } catch {
        /* a task is a nice-to-have */
      }
    }
    return result(command, 'skipped', reason);
  }

  const op = operationInProgress(root);
  if (op) {
    const detail = `A ${op} is half-finished in this folder.`;
    reportFailure(command, 'conflict', detail);
    return result(command, 'failed', `${detail} Nothing was changed.`, { kind: 'conflict' });
  }

  ensurePreCommitHook(root); // Obsidian Git saves by itself: its saves must go through the big-file check too

  if (command === 'commit') {
    const enc = encryptionOptions(root, 'commit');
    const res = commitAll(root, (n) => `auto: ${nowStamp()} · ${n} files`, retryOptions(), { scan: scanForSecrets, ...enc.opts });
    if (!res.ok) {
      reportFailure('commit', res.kind, res.error);
      return result('commit', 'failed', 'Your work could not be saved.', { kind: res.kind, error: res.error });
    }
    reportHeld(res.held);
    const heldNote = (res.held && res.held.length ? ` ${res.held.length} file(s) were left out because they look like they hold a password or key.` : '') + bigNote(reportBigFiles('commit', res.big));
    const big = res.big ? { routed: res.big.routed, healed: res.big.healed, left_out: res.big.left_out.map((l) => ({ reason: l.reason })) } : undefined;
    if (res.nothing) return result('commit', 'ok', `Nothing new to save.${heldNote}`, { files: 0, held: res.held, big });
    return result('commit', 'ok', `Saved ${res.files} changed files.${heldNote}`, { files: res.files, commit_message: res.message, held: res.held, big });
  }

  if (command === 'pull') {
    const res = pullRebase(root, { retry: retryOptions(), scan: scanForSecrets, message: (n) => `auto: ${nowStamp()} · ${n} files`, ...encryptionOptions(root, 'pull').opts });
    reportHeld(res.held);
    reportBigFiles('pull', res.big);
    if (!res.ok) {
      reportFailure('pull', res.kind, res.error);
      const why = res.kind === 'network' ? 'Could not reach GitHub (are you offline?). Your local work is untouched.' : 'The online copy could not be joined safely. Your local work is untouched.';
      return result('pull', 'failed', why, { kind: res.kind, error: res.error });
    }
    return result('pull', res.skipped ? 'skipped' : 'ok', res.message);
  }

  // push
  if (!opts.detached) {
    const running = runningUpload();
    if (running) return result('push', 'skipped', 'A big upload is already running in the background. Your work will be backed up when it finishes.', { background: true, running: true });
  }
  const blocked = pushBlocked(root);
  if (blocked) return blocked;
  if (opts.background && !opts.detached) {
    const started = startBackgroundUpload(root, { force: opts.force });
    if (started) return started;
  }
  const pushOpts = opts.detached ? { timeoutMs: DETACHED_TIMEOUT_MS } : {};
  let res = pushCurrent(root, pushOpts);
  if (!res.ok && res.kind === 'rejected') {
    // The online copy moved on. Join it with a rebase (never a force) and try once more.
    const pulled = pullRebase(root, { retry: retryOptions(), scan: scanForSecrets, message: (n) => `auto: ${nowStamp()} · ${n} files`, ...encryptionOptions(root, 'push').opts });
    reportHeld(pulled.held);
    reportBigFiles('push', pulled.big);
    if (!pulled.ok) {
      reportFailure('push', pulled.kind, pulled.error);
      return result('push', 'failed', 'Could not join the newer online copy safely. Your local work is untouched.', { kind: pulled.kind, error: pulled.error });
    }
    const blockedAgain = pushBlocked(root); // the join may have changed what is about to go up
    if (blockedAgain) return blockedAgain;
    res = pushCurrent(root, pushOpts);
  }
  if (!res.ok) {
    reportFailure('push', res.kind, res.error);
    const why = PUSH_WHY[res.kind] || 'Your work could not be backed up online.';
    return result('push', 'failed', why, { kind: res.kind, error: res.error });
  }
  return result('push', res.skipped ? 'skipped' : 'ok', res.message);
}

function statusReport(root, cfg) {
  const info = {
    git_installed: gitInstalled(),
    repo: false,
    dev_mode: isDevMode(),
    auto_commit: cfg.auto_commit,
    auto_push: cfg.auto_push,
  };
  if (info.git_installed && isRepo(root)) {
    info.repo = true;
    info.branch = currentBranch(root);
    info.origin = remoteUrl(root);
    info.origin_is_framework = originIsFramework(root);
    info.has_commits = hasCommits(root);
    info.changed_files = changedCount(root);
    info.in_progress = operationInProgress(root);
    info.big_file_check = preCommitHookStatus(root).state;
    info.upload_running = Boolean(runningUpload());
    info.ahead_behind = info.origin ? aheadBehind(root) : null;
    const last = git(['log', '-1', '--format=%cI'], { cwd: root });
    info.last_commit = last.ok && last.stdout ? last.stdout : null;
    try {
      const enc = encryptionContext(root);
      info.encryption = enc.enabled ? { enabled: true, unlocked: enc.safe, git_crypt_installed: enc.lock.installed } : { enabled: false };
    } catch {
      info.encryption = { enabled: true, unlocked: false, git_crypt_installed: false };
    }
  }
  const lines = [];
  if (!info.git_installed) lines.push('Git is not installed.');
  else if (!info.repo) lines.push('This folder is not under version control yet.');
  else {
    lines.push(info.changed_files ? `${info.changed_files} changed files waiting to be saved.` : 'Everything is saved.');
    if (!info.origin) lines.push('No online copy yet. Run: node system/scripts/setup-github.mjs');
    else if (info.origin_is_framework) lines.push('This folder still points at the public Alterbrain repo, so online syncing is paused. Run: node system/scripts/setup-github.mjs');
    else if (info.ahead_behind) {
      const { ahead, behind } = info.ahead_behind;
      if (ahead) lines.push(`${ahead} saved changes are not backed up online yet.`);
      if (behind) lines.push(`${behind} newer changes are waiting online.`);
      if (!ahead && !behind) lines.push('Backed up online.');
    }
    if (info.in_progress) lines.push(`A ${info.in_progress} is half-finished. Open Claude and type /health-check`);
    if (info.upload_running) lines.push('A big upload is running in the background.');
    if (['foreign', 'hooks-path', 'error'].includes(info.big_file_check)) lines.push(PRE_COMMIT_HOOK_TEXT[info.big_file_check] || PRE_COMMIT_HOOK_TEXT.error);
    if (info.encryption && info.encryption.enabled && !info.encryption.unlocked) lines.push('Your private notes are locked on this computer, so changes to them are not saved.');
  }
  if (info.dev_mode) lines.push('Developer mode is on: automatic saving is off.');
  else if (!info.auto_commit) lines.push('Automatic saving is switched off.');
  return result('status', 'ok', lines.join(' '), { info });
}

/** The background upload itself: the same push, with a long time limit, then the lock is given back. */
function runDetachedPush() {
  const token = process.env.ALTERBRAIN_UPLOAD_TOKEN || '';
  try {
    const res = runCommand('push', { detached: true });
    logFailure('push', 'background-upload', `finished: ${res.status}${res.kind ? ` ${res.kind}` : ''}`);
    return res;
  } finally {
    releaseUploadLock(token);
  }
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => !a.startsWith('--'));
  const command = args[0];
  if (!(COMMANDS.includes(command) || INTERNAL.includes(command)) || args.length > 1) {
    const msg = 'Usage: node system/scripts/git-auto.mjs pull|commit|push|status [--json]';
    if (json) console.log(JSON.stringify({ status: 'usage', message: msg }));
    else console.error(msg);
    return 2;
  }
  let res;
  if (command === 'pre-commit') res = preCommitCheck(projectRoot());
  else if (command === 'hook') res = hookCommand(projectRoot());
  else if (command === 'push' && argv.includes('--detached')) res = runDetachedPush();
  else {
    // The SessionEnd hook asks for this with ALTERBRAIN_PUSH_BACKGROUND (1 = if the upload is big, now = whatever its size).
    const mode = process.env.ALTERBRAIN_PUSH_BACKGROUND;
    const now = argv.includes('--background-now') || mode === 'now';
    res = runCommand(command, { background: now || argv.includes('--background') || mode === '1', force: now });
  }
  if (json) console.log(JSON.stringify(res));
  else if (command === 'pre-commit') {
    if (res.message) console.error(res.message); // git shows a hook's messages to whoever saves
  } else if (res.message) console.log(`git-auto ${command}: ${res.message}`);
  if (command === 'pre-commit' && res.nothing_left) return PRE_COMMIT_NOTHING_LEFT;
  return res.status === 'failed' ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
