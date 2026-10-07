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
//   - when config/brain.json exists but cannot be read, the online backup is paused instead of guessing.
import { projectRoot, rootPath, isDevMode, isMainModule } from '../lib/paths.mjs';
import { readJson, readJsonChecked, appendLine, nowStamp } from '../lib/fsx.mjs';
import { addTask } from '../lib/tasks.mjs';
import {
  gitInstalled, isRepo, remoteUrl, currentBranch, changedCount, aheadBehind, parseRepoUrl,
  hasCommits, operationInProgress, commitAll, pullRebase, pushCurrent, git,
} from '../lib/git.mjs';
import { findSecret } from '../hooks/block_secrets.mjs';

const COMMANDS = ['pull', 'commit', 'push', 'status'];

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
  if (kind === 'network') return false;
  try {
    addTask({ text: TASK_TEXT[kind] || TASK_TEXT.other, tag: 'git', priority: 'medium' });
    return true;
  } catch {
    return false;
  }
}

const result = (command, status, message, extra = {}) => ({ command, status, message, ...extra });

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

export function runCommand(command) {
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

  if (command === 'commit') {
    const res = commitAll(root, (n) => `auto: ${nowStamp()} · ${n} files`, retryOptions(), { scan: scanForSecrets });
    if (!res.ok) {
      reportFailure('commit', res.kind, res.error);
      return result('commit', 'failed', 'Your work could not be saved.', { kind: res.kind, error: res.error });
    }
    reportHeld(res.held);
    const heldNote = res.held && res.held.length ? ` ${res.held.length} file(s) were left out because they look like they hold a password or key.` : '';
    if (res.nothing) return result('commit', 'ok', `Nothing new to save.${heldNote}`, { files: 0, held: res.held });
    return result('commit', 'ok', `Saved ${res.files} changed files.${heldNote}`, { files: res.files, commit_message: res.message, held: res.held });
  }

  if (command === 'pull') {
    const res = pullRebase(root, { retry: retryOptions(), scan: scanForSecrets, message: (n) => `auto: ${nowStamp()} · ${n} files` });
    reportHeld(res.held);
    if (!res.ok) {
      reportFailure('pull', res.kind, res.error);
      const why = res.kind === 'network' ? 'Could not reach GitHub (are you offline?). Your local work is untouched.' : 'The online copy could not be joined safely. Your local work is untouched.';
      return result('pull', 'failed', why, { kind: res.kind, error: res.error });
    }
    return result('pull', res.skipped ? 'skipped' : 'ok', res.message);
  }

  // push
  let res = pushCurrent(root);
  if (!res.ok && res.kind === 'rejected') {
    // The online copy moved on. Join it with a rebase (never a force) and try once more.
    const pulled = pullRebase(root, { retry: retryOptions(), scan: scanForSecrets, message: (n) => `auto: ${nowStamp()} · ${n} files` });
    if (!pulled.ok) {
      reportFailure('push', pulled.kind, pulled.error);
      return result('push', 'failed', 'Could not join the newer online copy safely. Your local work is untouched.', { kind: pulled.kind, error: pulled.error });
    }
    res = pushCurrent(root);
  }
  if (!res.ok) {
    reportFailure('push', res.kind, res.error);
    const why = res.kind === 'network' ? 'Could not reach GitHub (are you offline?). The backup will retry later.' : 'Your work could not be backed up online.';
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
    info.ahead_behind = info.origin ? aheadBehind(root) : null;
    const last = git(['log', '-1', '--format=%cI'], { cwd: root });
    info.last_commit = last.ok && last.stdout ? last.stdout : null;
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
  }
  if (info.dev_mode) lines.push('Developer mode is on: automatic saving is off.');
  else if (!info.auto_commit) lines.push('Automatic saving is switched off.');
  return result('status', 'ok', lines.join(' '), { info });
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => !a.startsWith('--'));
  const command = args[0];
  if (!COMMANDS.includes(command) || args.length > 1) {
    const msg = 'Usage: node system/scripts/git-auto.mjs pull|commit|push|status [--json]';
    if (json) console.log(JSON.stringify({ status: 'usage', message: msg }));
    else console.error(msg);
    return 2;
  }
  const res = runCommand(command);
  if (json) console.log(JSON.stringify(res));
  else console.log(`git-auto ${command}: ${res.message}`);
  return res.status === 'failed' ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
