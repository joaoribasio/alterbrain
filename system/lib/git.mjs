// Small, safe git helpers shared by git-auto, setup-github, update and doctor.
// Rules: never force, never prompt, never change branches. Zero dependencies.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, has } from './proc.mjs';

/** Environment that stops git from ever waiting for a person to type. */
export const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_EDITOR: 'true',
  GIT_ASKPASS: '',
  LC_ALL: 'C',
};

/** Run git in `cwd`. Returns { ok, code, stdout, stderr }. */
export function git(args, opts = {}) {
  return run('git', args, {
    timeout: 120_000,
    ...opts,
    env: { ...GIT_ENV, ...(opts.env || {}) },
  });
}

/** Block the thread for `ms` milliseconds (used between retries). */
export function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function gitInstalled() {
  return has('git');
}

export function lfsInstalled() {
  return git(['lfs', 'version']).ok;
}

/** True when `cwd` itself is the top of a git repository. */
export function isRepo(cwd) {
  return existsSync(join(cwd, '.git'));
}

export function hasCommits(cwd) {
  return git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd }).ok;
}

export function currentBranch(cwd) {
  const r = git(['symbolic-ref', '--short', 'HEAD'], { cwd });
  return r.ok ? r.stdout : null;
}

export function remoteUrl(cwd, name = 'origin') {
  const r = git(['remote', 'get-url', name], { cwd });
  return r.ok && r.stdout ? r.stdout : null;
}

export function hasUpstream(cwd) {
  return git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd }).ok;
}

/** Number of changed or untracked paths in the working folder. */
export function changedCount(cwd) {
  const r = git(['status', '--porcelain'], { cwd });
  if (!r.ok || !r.stdout) return 0;
  return r.stdout.split(/\r?\n/).filter((l) => l.trim()).length;
}

/** Paths that are in the middle of a merge (conflict markers inside): "git diff --diff-filter=U". */
export function unmergedPaths(cwd) {
  const r = git(['diff', '--name-only', '--diff-filter=U'], { cwd });
  return r.ok && r.stdout ? r.stdout.split(/\r?\n/).filter(Boolean) : [];
}

/** Number of entries in the stash (an autostash that could not be re-applied stays there). */
export function stashCount(cwd) {
  const r = git(['stash', 'list'], { cwd });
  return r.ok && r.stdout ? r.stdout.split(/\r?\n/).filter(Boolean).length : 0;
}

/** Name of a half-finished git operation, or null. Unmerged files count even when no operation is recorded. */
export function operationInProgress(cwd) {
  const g = join(cwd, '.git');
  if (existsSync(join(g, 'rebase-merge')) || existsSync(join(g, 'rebase-apply'))) return 'rebase';
  if (existsSync(join(g, 'MERGE_HEAD'))) return 'merge';
  if (existsSync(join(g, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (unmergedPaths(cwd).length) return 'conflict';
  return null;
}

/** Ahead/behind counts against the upstream branch (as last fetched). */
export function aheadBehind(cwd) {
  const r = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], { cwd });
  if (!r.ok) return null;
  const [ahead, behind] = r.stdout.split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

/** Sort a failed git message into a short kind. */
export function classifyError(text) {
  const t = String(text || '');
  if (/index\.lock|unable to create '.*\.lock'|another git process/i.test(t)) return 'lock';
  if (/conflict|could not apply|resolve all conflicts|needs merge|unmerged|rebase.*(stopped|failed)/i.test(t)) return 'conflict';
  if (/please tell me who you are|unable to auto-detect email|empty ident name/i.test(t)) return 'identity';
  if (/authentication failed|permission denied|could not read username|invalid credentials|repository not found|\b40[134]\b|terminal prompts disabled/i.test(t)) return 'auth';
  if (/could not resolve host|failed to connect|network is unreachable|timed out|connection (refused|reset|timed)|unable to access|early eof|ssl/i.test(t)) return 'network';
  if (/non-fast-forward|\[rejected\]|fetch first|failed to push some refs|updates were rejected/i.test(t)) return 'rejected';
  return 'other';
}

/** Run a git step, retrying when another process holds index.lock. */
export function withLockRetry(fn, { retries = 3, delayMs = 800 } = {}) {
  let res = fn();
  for (let i = 0; i < retries && !res.ok && classifyError(res.stderr) === 'lock'; i++) {
    sleepSync(delayMs);
    res = fn();
  }
  return res;
}

function identityArgs(cwd) {
  const name = git(['config', 'user.name'], { cwd }).stdout;
  const email = git(['config', 'user.email'], { cwd }).stdout;
  const args = [];
  if (!name) args.push('-c', 'user.name=Alterbrain');
  if (!email) args.push('-c', 'user.email=alterbrain@users.noreply.invalid');
  return args;
}

/**
 * The added lines of a staged diff, grouped by file: [{ file, text }]. Binary files have no lines.
 */
export function stagedAdditions(cwd) {
  const d = git(['-c', 'core.quotepath=false', 'diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--no-renames'], { cwd, timeout: 60_000 });
  if (!d.ok || !d.stdout) return [];
  const out = [];
  let cur = null;
  for (const line of d.stdout.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      const m = /^\+\+\+ b\/(.+?)(?:\t.*)?$/.exec(line);
      cur = m ? { file: m[1].replace(/^"|"$/g, ''), lines: [] } : null;
      if (cur) out.push(cur);
    } else if (cur && line.startsWith('+')) {
      cur.lines.push(line.slice(1));
    }
  }
  return out.map((o) => ({ file: o.file, text: o.lines.join('\n') }));
}

// Framework files come from a checked release: they are not scanned for secrets.
const SCAN_SKIP = /^(?:system|\.claude|docs|tests|\.github)\//i;

/**
 * Stage everything and commit. Never amends, never forces.
 * Refuses (kind "conflict") while any file is half-merged, so conflict markers are never saved into a note.
 * opts.scan(text) -> { kind } | null: files whose added text it flags are taken out of the commit and listed
 * in "held", so a password that slipped into a note is not saved and pushed with everything else.
 * Returns { ok, nothing, files, held, kind, error }.
 */
export function commitAll(cwd, message, retry = {}, opts = {}) {
  const unmerged = unmergedPaths(cwd);
  if (unmerged.length) {
    return { ok: false, kind: 'conflict', error: `Half-merged files: ${unmerged.slice(0, 5).join(', ')}`, files: 0 };
  }
  const add = withLockRetry(() => git(['add', '-A'], { cwd }), retry);
  if (!add.ok) return { ok: false, kind: classifyError(add.stderr), error: add.stderr, files: 0 };
  const held = [];
  if (typeof opts.scan === 'function') {
    for (const { file, text } of stagedAdditions(cwd)) {
      if (SCAN_SKIP.test(file) || !text) continue;
      let hit = null;
      try {
        hit = opts.scan(text);
      } catch {
        hit = null;
      }
      if (hit) {
        held.push({ file, kind: hit.kind });
        git(['reset', '-q', '--', file], { cwd });
      }
    }
  }
  const staged = git(['diff', '--cached', '--name-only', '--no-renames'], { cwd });
  const files = staged.stdout ? staged.stdout.split(/\r?\n/).filter(Boolean).length : 0;
  if (files === 0) return { ok: true, nothing: true, files: 0, held };
  const msg = typeof message === 'function' ? message(files) : message;
  const commit = withLockRetry(() => git([...identityArgs(cwd), 'commit', '-m', msg], { cwd }), retry);
  if (!commit.ok) {
    return { ok: false, kind: classifyError(commit.stderr + commit.stdout), error: commit.stderr || commit.stdout, files };
  }
  return { ok: true, nothing: false, files, message: msg, held };
}

/**
 * Bring in remote changes with a rebase. If it cannot be done cleanly the
 * rebase is aborted so nothing is half-finished, and nothing is forced.
 * Returns { ok, skipped, kind, error, message }.
 */
export function pullRebase(cwd, opts = {}) {
  if (!remoteUrl(cwd)) return { ok: true, skipped: true, message: 'No online copy is set up yet.' };
  const branch = currentBranch(cwd);
  if (!branch) return { ok: false, kind: 'other', error: 'Not on a branch.' };
  const fetch = git(['fetch', 'origin'], { cwd });
  if (!fetch.ok) return { ok: false, kind: classifyError(fetch.stderr), error: fetch.stderr };
  if (!git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { cwd }).ok) {
    return { ok: true, skipped: true, message: 'Nothing online to pull yet.' };
  }
  if (!hasCommits(cwd)) {
    return { ok: true, skipped: true, message: 'No local commits yet.' };
  }
  if (!hasUpstream(cwd)) {
    git(['branch', `--set-upstream-to=origin/${branch}`, branch], { cwd });
  }
  // Save local changes first, as a commit. "git pull --autostash" exits 0 when putting the stash back conflicts and
  // leaves conflict markers inside the note, so no stash is ever used.
  if (changedCount(cwd) > 0) {
    const saved = commitAll(cwd, opts.message || ((n) => `auto: save before sync · ${n} files`), opts.retry || {}, { scan: opts.scan });
    if (!saved.ok) return { ok: false, kind: saved.kind, error: saved.error };
    const dirty = git(['diff', '--name-only'], { cwd });
    if (dirty.ok && dirty.stdout) {
      return { ok: false, kind: 'other', error: 'Some changed files could not be saved first, so the online copy was not joined.', held: saved.held };
    }
  }
  const stashBefore = stashCount(cwd);
  const pull = withLockRetry(() => git(['pull', '--rebase', '--no-autostash'], { cwd }));
  const text = `${pull.stderr}\n${pull.stdout}`;
  // A pull can exit 0 and still leave files half-merged. Check, whatever the exit code said.
  const op = operationInProgress(cwd);
  const leftover = unmergedPaths(cwd).length > 0 || stashCount(cwd) > stashBefore;
  if (pull.ok && !op && !leftover) return { ok: true, message: 'Up to date with the online copy.' };
  const wasRebase = op === 'rebase';
  if (wasRebase) git(['rebase', '--abort'], { cwd });
  else if (op === 'merge' || op === 'conflict') git(['reset', '--merge'], { cwd });
  let kind = classifyError(text);
  if ((wasRebase || op || leftover) && kind !== 'lock') kind = 'conflict';
  return { ok: false, kind, error: text.trim() || 'The online copy could not be joined safely.', aborted: wasRebase };
}

/** Plain `git push` (sets the upstream the first time). Never forces. */
export function pushCurrent(cwd) {
  if (!remoteUrl(cwd)) return { ok: true, skipped: true, message: 'No online copy is set up yet.' };
  const branch = currentBranch(cwd);
  if (!branch) return { ok: false, kind: 'other', error: 'Not on a branch.' };
  if (!hasCommits(cwd)) return { ok: true, skipped: true, message: 'No commits to push yet.' };
  const args = hasUpstream(cwd) ? ['push'] : ['push', '--set-upstream', 'origin', branch];
  const res = git(args, { cwd, timeout: 300_000 });
  if (res.ok) return { ok: true, message: 'Backed up online.' };
  const text = `${res.stderr}\n${res.stdout}`;
  return { ok: false, kind: classifyError(text), error: text.trim() };
}

export function tagExists(cwd, tag) {
  return git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { cwd }).ok;
}

/** Create a lightweight tag at HEAD. Returns { ok, existed, error }. */
export function createTag(cwd, tag) {
  if (!hasCommits(cwd)) return { ok: false, error: 'No commits yet.' };
  if (tagExists(cwd, tag)) return { ok: true, existed: true };
  const r = git(['tag', tag], { cwd });
  return { ok: r.ok, existed: false, error: r.stderr };
}

/**
 * Read owner and name out of a GitHub remote URL (https or ssh).
 * Returns { host, owner, name } or null.
 */
export function parseRepoUrl(url) {
  if (!url) return null;
  const u = String(url).trim();
  let m = u.match(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) m = u.match(/^(?:[^@/]+@)?([^:/]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { host: m[1].toLowerCase(), owner: m[2], name: m[3] };
}
