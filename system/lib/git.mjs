// Small, safe git helpers shared by git-auto, setup-github, update and doctor.
// Rules: never force, never prompt, never change branches. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { run, has, IS_WINDOWS } from './proc.mjs';
import { readJsonChecked } from './fsx.mjs';

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

/** Is Git LFS installed? ALTERBRAIN_GIT_LFS=none pretends it is not (the tests use this, as they use ALTERBRAIN_GIT_CRYPT). */
export function lfsInstalled() {
  if (process.env.ALTERBRAIN_GIT_LFS === 'none') return false;
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
  // GitHub refuses big files when the account has used up its Git LFS storage or bandwidth. [Unverified] wording of
  // GitHub's replies, taken from memory; an unmatched reply falls through to "auth" (a 403) or "other", both safe.
  if (/data quota|lfs budget|exceeded .*(quota|budget)|storage quota/i.test(t)) return 'storage';
  if (/authentication failed|authorization error|permission denied|could not read username|invalid credentials|repository (or object )?not found|\b40[134]\b|terminal prompts disabled/i.test(t)) return 'auth';
  // A step that was stopped because it ran out of time (node's own ETIMEDOUT, not git's "Connection timed out"): it starts again at the next save.
  if (/\betimedout\b/i.test(t)) return 'timeout';
  if (/could not resolve host|failed to connect|network is unreachable|timed out|connection (refused|reset|timed)|unable to access|early eof|ssl|dial tcp|no such host|i\/o timeout|connectex/i.test(t)) return 'network';
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

/** `-c user.name=... -c user.email=...` for the cases where git has no identity set. */
export function identityArgs(cwd) {
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

/* ------------------------------------------------------------------ */
/* Big files and Git LFS (ADR 0020)                                    */
/* ------------------------------------------------------------------ */
// Ordinary documents go to ordinary git. Only a file at or above the size limit (git.lfs_min_mb in config/brain.json,
// 50 MB by default) is stored with Git LFS. The root .gitattributes holds no LFS rules (an update replaces it), so
// the save adds an exact-path rule for each big file to vault/.gitattributes, which belongs to the user.

export const LFS_DEFAULT_MIN_MB = 50;
/** A setting above this is cut back: GitHub refuses ordinary files of about 100 MB (the exact figure is [Unverified]). */
const LFS_MAX_CONFIGURED_MB = 95;
/**
 * Files at or above this size are never saved: 2 GB is the per-file maximum of Git LFS on GitHub's free plans
 * [Unverified: from memory of GitHub's documentation]. The smaller (decimal) reading is used so that a file of that
 * size is never attempted.
 */
export const LFS_FILE_LIMIT_BYTES = 2_000_000_000;
/** The user-owned attribute file that receives the per-file LFS rules. */
export const LFS_RULES_FILE = 'vault/.gitattributes';
const LFS_ATTRS = 'filter=lfs diff=lfs merge=lfs -text';
const LFS_RULES_HEADER = [
  '# Big files (Git LFS). Alterbrain adds one line here for each file that is too big to store as an ordinary file.',
  '# This file is yours: it is saved with your notes and an update never replaces it. Please do not remove lines.',
];

/** The install command for Git LFS on this computer, for messages. */
export function lfsInstallCommand() {
  if (IS_WINDOWS) return 'winget install --id GitHub.GitLFS -e';
  if (process.platform === 'darwin') return 'brew install git-lfs';
  return 'Install git-lfs with your package manager (for example: sudo apt install git-lfs)';
}

/**
 * The size, in bytes, from which a file goes to Git LFS. ALTERBRAIN_LFS_MIN_BYTES (used by the tests) wins, then
 * git.lfs_min_mb in config/brain.json (1 to 95), then 50 MB. A value that makes no sense is ignored. 1 MB = 1,048,576 bytes.
 */
export function lfsMinBytes(root = process.cwd()) {
  const env = Number(process.env.ALTERBRAIN_LFS_MIN_BYTES);
  if (process.env.ALTERBRAIN_LFS_MIN_BYTES && Number.isFinite(env) && env > 0) return Math.floor(env);
  const checked = readJsonChecked(join(root, 'config', 'brain.json'));
  const gitCfg = checked.ok && checked.value && typeof checked.value.git === 'object' && checked.value.git ? checked.value.git : {};
  const mb = typeof gitCfg.lfs_min_mb === 'number' ? gitCfg.lfs_min_mb : Number.NaN;
  const use = Number.isFinite(mb) && mb > 0 ? Math.min(Math.max(mb, 1), LFS_MAX_CONFIGURED_MB) : LFS_DEFAULT_MIN_MB;
  return Math.round(use * 1024 * 1024);
}

/** The size from which a file is never saved (ALTERBRAIN_LFS_MAX_BYTES lets the tests use a small number). */
export function lfsMaxBytes() {
  const env = Number(process.env.ALTERBRAIN_LFS_MAX_BYTES);
  return process.env.ALTERBRAIN_LFS_MAX_BYTES && Number.isFinite(env) && env > 0 ? Math.floor(env) : LFS_FILE_LIMIT_BYTES;
}

/** Run git and return untrimmed text (the output of -z commands holds NUL bytes and leading spaces that run() would strip). */
function gitRaw(cwd, args, input) {
  const res = spawnSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ...GIT_ENV },
  });
  return { ok: res.status === 0 && !res.error, stdout: res.stdout || '', stderr: (res.stderr || (res.error ? String(res.error.message) : '')).trim() };
}

/** The value of one attribute for each path, as git would apply it right now: Map of path -> "lfs" | "git-crypt" | "unspecified" | ... Throws on failure. */
export function attributeValues(cwd, paths, attr = 'filter') {
  const out = new Map();
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    const r = gitRaw(cwd, ['check-attr', '-z', '--stdin', attr], `${chunk.join('\0')}\0`);
    if (!r.ok) throw new Error(r.stderr || 'git check-attr failed');
    const t = r.stdout.split('\0');
    for (let j = 0; j + 2 < t.length; j += 3) out.set(t[j], t[j + 2]);
  }
  return out;
}

/**
 * The pattern for one path in a .gitattributes file that sits in `vault/`. `relToVault` is the path below vault/.
 * The pattern starts with a slash, so a file directly in vault/ does not also match the same name deeper down.
 * The characters that git reads as wildcards are escaped, and a name with a space or a quote is put in double quotes.
 */
export function attributePattern(relToVault) {
  let p = `/${String(relToVault)}`.replace(/[\\*?[\]]/g, '\\$&');
  if (/[\s"\u0000-\u001f]/.test(p)) {
    p = `"${p
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\u0000-\u001f]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`)}"`;
  }
  return p;
}

/** One line of vault/.gitattributes for a file. */
export const lfsRuleLine = (relToVault) => `${attributePattern(relToVault)} ${LFS_ATTRS}`;

/**
 * Append the rules for these paths (relative to vault/) to vault/.gitattributes, creating it when needed and keeping
 * everything already in it. A rule that is already there is not repeated. Returns the number of lines added.
 */
export function addLfsRules(cwd, relPathsToVault) {
  const file = join(cwd, ...LFS_RULES_FILE.split('/'));
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const have = new Set(before.split(/\r?\n/).map((l) => l.trim()));
  const lines = [];
  for (const rel of relPathsToVault) {
    const line = lfsRuleLine(rel);
    if (!have.has(line) && !lines.includes(line)) lines.push(line);
  }
  if (!lines.length) return 0;
  let text = before ? (before.endsWith('\n') ? before : before + eol) : `${LFS_RULES_HEADER.join(eol)}${eol}`;
  text += lines.join(eol) + eol;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  return lines.length;
}

/**
 * Is Git LFS switched on for this folder? When the LFS program is there but git has no LFS filter yet (a new clone),
 * set the filter for this folder only. Hooks are left alone on purpose: the upload is done by pushLfsObjects.
 */
export function lfsFilterReady(cwd) {
  const configured = () => ['filter.lfs.clean', 'filter.lfs.smudge'].every((k) => git(['config', '--get', k], { cwd }).stdout);
  if (configured()) return true;
  git(['lfs', 'install', '--local', '--skip-repo'], { cwd });
  return configured();
}

/** New or changed files in the working folder (deleted ones, folders and links left out): [{ path, size, staged }]. */
function changedFiles(cwd) {
  const st = gitRaw(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (!st.ok) throw new Error(st.stderr || 'git status failed');
  const out = [];
  for (const rec of st.stdout.split('\0')) {
    if (rec.length < 4 || rec[2] !== ' ') continue;
    const x = rec[0];
    const y = rec[1];
    if (x === 'D' || y === 'D' || x === '!') continue;
    const path = rec.slice(3);
    let stat;
    try {
      stat = lstatSync(join(cwd, ...path.split('/')));
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    out.push({ path, size: stat.size, staged: x !== ' ' && x !== '?' });
  }
  return out;
}

/** Files that are stored as Git LFS pointers in the current version (names as git prints them). Empty when LFS cannot be asked. */
function lfsStoredPaths(cwd) {
  if (!hasCommits(cwd)) return [];
  const r = gitRaw(cwd, ['lfs', 'ls-files', '--name-only']);
  return r.ok ? r.stdout.split(/\r?\n/).filter(Boolean) : [];
}

/**
 * Decide, before anything is staged, where each new or changed file goes. Never throws.
 *  - A file at or above the size limit gets an exact-path rule in vault/.gitattributes and goes through Git LFS.
 *  - A file that is stored as an LFS pointer today but no longer has a rule (the rules used to live in the root
 *    .gitattributes) gets its rule too, so the next save does not store it again as a full copy.
 *  - A file that cannot be stored safely is taken out of the save and listed in left_out with a reason:
 *      "no-lfs"        Git LFS is not installed
 *      "private"       it sits in an encrypted folder (git-crypt wins there, so it cannot use LFS)
 *      "too-big"       2 GB or more
 *      "outside-vault" big, but not inside vault/ (no user-owned place for its rule)
 *      "rule-failed"   the rule was written but git does not apply it
 * opts.isPrivate(path) -> boolean: extra knowledge about encrypted paths (the attribute files may be missing).
 * opts.retry: lock-retry settings for the one git call that changes the index.
 * Returns { min_bytes, routed, healed, left_out: [{ path, reason }], exclude: [pathspecs], error }.
 * When `error` is set the caller must not save: a big file saved as an ordinary file blocks the online backup for good.
 */
export function prepareBigFiles(cwd, opts = {}) {
  const result = { min_bytes: lfsMinBytes(cwd), routed: [], healed: [], left_out: [], exclude: [], error: null };
  try {
    const min = result.min_bytes;
    const max = lfsMaxBytes();
    const isPrivate = typeof opts.isPrivate === 'function' ? opts.isPrivate : () => false;
    const changed = changedFiles(cwd);
    if (!changed.length) return result;
    const changedByPath = new Map(changed.map((f) => [f.path, f]));
    const lfsOk = lfsInstalled();

    const left = new Map(); // path -> reason
    const leave = (path, reason) => {
      if (!left.has(path)) left.set(path, reason);
    };

    // Without Git LFS, every changed file is asked about its filter: one that wants LFS cannot be saved here.
    const asked = lfsOk ? changed.filter((f) => f.size >= min) : changed;
    const attrs = asked.length ? attributeValues(cwd, asked.map((f) => f.path)) : new Map();
    const filterOf = (path) => attrs.get(path) || 'unspecified';
    const priv = (path) => filterOf(path) === 'git-crypt' || isPrivate(path);

    const newRules = []; // big files that need a rule
    for (const f of changed) {
      const big = f.size >= min;
      if (f.size >= max) {
        leave(f.path, priv(f.path) ? 'private' : 'too-big');
      } else if (!lfsOk) {
        if (big || filterOf(f.path) === 'lfs') leave(f.path, priv(f.path) ? 'private' : 'no-lfs');
      } else if (big) {
        if (priv(f.path)) leave(f.path, 'private');
        else if (filterOf(f.path) !== 'lfs') {
          if (f.path.startsWith('vault/')) newRules.push(f.path);
          else leave(f.path, 'outside-vault');
        }
      }
    }

    // Existing installs: files stored as LFS pointers must keep their rule now that the root rules are gone.
    const healRules = [];
    if (lfsOk) {
      const stored = lfsStoredPaths(cwd).filter((p) => existsSync(join(cwd, ...p.split('/'))));
      if (stored.length) {
        const now = attributeValues(cwd, stored);
        for (const p of stored) {
          const v = now.get(p);
          if (v === 'lfs' || v === 'git-crypt') continue;
          if (p.startsWith('vault/')) healRules.push(p);
          else if (changedByPath.has(p)) leave(p, 'outside-vault');
        }
      }
    }

    const isNew = new Set(newRules);
    const targets = [...new Set([...newRules, ...healRules])];
    if (targets.length) {
      if (!lfsFilterReady(cwd)) {
        for (const p of targets) if (changedByPath.has(p)) leave(p, 'no-lfs');
      } else {
        addLfsRules(cwd, targets.map((p) => p.slice('vault/'.length)));
        const after = attributeValues(cwd, targets);
        for (const p of targets) {
          if (after.get(p) === 'lfs') (isNew.has(p) ? result.routed : result.healed).push(p);
          else if (changedByPath.has(p)) leave(p, 'rule-failed');
        }
      }
    }

    result.left_out = [...left].map(([path, reason]) => ({ path, reason }));
    result.exclude = result.left_out.map((l) => `:(exclude,literal)${l.path}`);

    // A file the user (or another tool) staged earlier as an ordinary copy must not stay staged.
    const unstage = [...result.routed, ...result.left_out.map((l) => l.path)].filter((p) => changedByPath.get(p)?.staged);
    for (let i = 0; i < unstage.length; i += 100) {
      const paths = unstage.slice(i, i + 100).map((p) => `:(literal)${p}`);
      const reset = withLockRetry(() => git(['reset', '-q', '--', ...paths], { cwd }), opts.retry || {});
      if (!reset.ok) throw new Error(reset.stderr || 'git reset failed'); // a big file left staged as an ordinary copy must not be saved
    }
    return result;
  } catch (e) {
    result.error = `Big files could not be checked: ${String((e && e.message) || e)}`;
    return result;
  }
}

/**
 * Upload the Git LFS files before the commits that point to them. The pre-push hook that "git lfs install" adds does
 * the same, but a copy can lack it (a new clone, or another tool's hook in its place), and commits that reach the
 * online copy without their files cannot be restored. Does nothing when LFS is not installed or nothing is waiting.
 */
export function pushLfsObjects(cwd, branch, opts = {}) {
  if (!lfsInstalled()) return { ok: true, skipped: true };
  const res = git(['lfs', 'push', 'origin', branch], { cwd, timeout: opts.timeoutMs || 300_000 });
  if (res.ok) return { ok: true };
  const text = `${res.stderr}\n${res.stdout}`;
  return { ok: false, kind: classifyError(text), error: text.trim() };
}

// Framework files come from a checked release: they are not scanned for secrets.
const SCAN_SKIP = /^(?:system|\.claude|docs|tests|\.github)\//i;

/** `git add -A` that leaves some paths alone. The paths go in on standard input, so a long list cannot overflow the command line. */
function addAll(cwd, exclude) {
  if (!exclude.length) return git(['add', '-A'], { cwd });
  const input = ['.', ...exclude].join('\0');
  return git(['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd, input });
}

/**
 * Stage everything and commit. Never amends, never forces.
 * Refuses (kind "conflict") while any file is half-merged, so conflict markers are never saved into a note.
 * opts.scan(text) -> { kind } | null: files whose added text it flags are taken out of the commit and listed
 * in "held", so a password that slipped into a note is not saved and pushed with everything else.
 * opts.exclude: git pathspecs that `git add` must leave alone (encrypted paths on a copy that cannot encrypt).
 * opts.screen(cwd) -> { unstage: [pathspecs], error }: runs after staging and may take paths back out of the commit
 * (private notes that would be stored as plain text). It reports its own findings and must not throw.
 * opts.big: settings for prepareBigFiles ({ isPrivate }), which runs before staging unless opts.big === false. It sends
 * big files to Git LFS and takes out of the commit the ones that cannot be stored safely (see prepareBigFiles).
 * Returns { ok, nothing, files, held, big, kind, error }.
 */
export function commitAll(cwd, message, retry = {}, opts = {}) {
  const unmerged = unmergedPaths(cwd);
  if (unmerged.length) {
    return { ok: false, kind: 'conflict', error: `Half-merged files: ${unmerged.slice(0, 5).join(', ')}`, files: 0 };
  }
  const exclude = Array.isArray(opts.exclude) ? [...opts.exclude] : [];
  let big = null;
  if (opts.big !== false) {
    big = prepareBigFiles(cwd, { ...(opts.big && typeof opts.big === 'object' ? opts.big : {}), retry });
    // Saving without knowing which files are big could store a huge file as an ordinary copy and block every upload after it.
    if (big.error) return { ok: false, kind: classifyError(big.error) === 'lock' ? 'lock' : 'other', error: big.error, files: 0, big };
    exclude.push(...big.exclude);
  }
  const add = withLockRetry(() => addAll(cwd, exclude), retry);
  if (!add.ok) return { ok: false, kind: classifyError(add.stderr), error: add.stderr, files: 0, big };
  if (typeof opts.screen === 'function') {
    let verdict = null;
    try {
      verdict = opts.screen(cwd);
    } catch (e) {
      verdict = { unstage: [], error: String((e && e.message) || e) };
    }
    const unstage = (verdict && Array.isArray(verdict.unstage) ? verdict.unstage : []).filter((p) => typeof p === 'string' && p);
    for (let i = 0; i < unstage.length; i += 100) git(['reset', '-q', '--', ...unstage.slice(i, i + 100)], { cwd });
  }
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
  if (files === 0) return { ok: true, nothing: true, files: 0, held, big };
  const msg = typeof message === 'function' ? message(files) : message;
  const commit = withLockRetry(() => git([...identityArgs(cwd), 'commit', '-m', msg], { cwd }), retry);
  if (!commit.ok) {
    return { ok: false, kind: classifyError(commit.stderr + commit.stdout), error: commit.stderr || commit.stdout, files, big };
  }
  return { ok: true, nothing: false, files, message: msg, held, big };
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
  let kept = {};
  if (changedCount(cwd) > 0) {
    const saved = commitAll(cwd, opts.message || ((n) => `auto: save before sync · ${n} files`), opts.retry || {}, { scan: opts.scan, exclude: opts.exclude, screen: opts.screen, big: opts.big });
    if (!saved.ok) return { ok: false, kind: saved.kind, error: saved.error, big: saved.big };
    kept = { held: saved.held, big: saved.big };
    const dirty = git(['diff', '--name-only'], { cwd });
    if (dirty.ok && dirty.stdout) {
      return { ok: false, kind: 'other', error: 'Some changed files could not be saved first, so the online copy was not joined.', ...kept };
    }
  }
  const stashBefore = stashCount(cwd);
  const pull = withLockRetry(() => git(['pull', '--rebase', '--no-autostash'], { cwd }));
  const text = `${pull.stderr}\n${pull.stdout}`;
  // A pull can exit 0 and still leave files half-merged. Check, whatever the exit code said.
  const op = operationInProgress(cwd);
  const leftover = unmergedPaths(cwd).length > 0 || stashCount(cwd) > stashBefore;
  if (pull.ok && !op && !leftover) return { ok: true, message: 'Up to date with the online copy.', ...kept };
  const wasRebase = op === 'rebase';
  if (wasRebase) git(['rebase', '--abort'], { cwd });
  else if (op === 'merge' || op === 'conflict') git(['reset', '--merge'], { cwd });
  let kind = classifyError(text);
  if ((wasRebase || op || leftover) && kind !== 'lock') kind = 'conflict';
  return { ok: false, kind, error: text.trim() || 'The online copy could not be joined safely.', aborted: wasRebase, ...kept };
}

/**
 * Plain `git push` (sets the upstream the first time), after the Git LFS files have gone up. Never forces.
 * Refuses first (kind "big-blob", with `files`) when a commit that is about to go up holds an ordinary file that GitHub
 * would refuse: the upload would fail on every try, so it is not started. opts.timeoutMs: time limit per step (5 minutes).
 */
export function pushCurrent(cwd, opts = {}) {
  if (!remoteUrl(cwd)) return { ok: true, skipped: true, message: 'No online copy is set up yet.' };
  const branch = currentBranch(cwd);
  if (!branch) return { ok: false, kind: 'other', error: 'Not on a branch.' };
  if (!hasCommits(cwd)) return { ok: true, skipped: true, message: 'No commits to push yet.' };
  const oversized = unpushedOversizedBlobs(cwd);
  if (oversized.files.length) {
    const names = oversized.files.slice(0, 5).map((f) => `${f.path} (${Math.round(f.size / (1024 * 1024))} MB)`).join(', ');
    return { ok: false, kind: 'big-blob', error: `Saved as ordinary files, too big for GitHub: ${names}${oversized.files.length > 5 ? ', ...' : ''}`, files: oversized.files };
  }
  const timeout = opts.timeoutMs || 300_000;
  const lfs = pushLfsObjects(cwd, branch, { timeoutMs: timeout });
  if (!lfs.ok) return lfs;
  const args = hasUpstream(cwd) ? ['push'] : ['push', '--set-upstream', 'origin', branch];
  const res = git(args, { cwd, timeout });
  if (res.ok) return { ok: true, message: 'Backed up online.' };
  const text = `${res.stderr}\n${res.stdout}`;
  return { ok: false, kind: classifyError(text), error: text.trim() };
}

/* ------------------------------------------------------------------ */
/* The big-file safety net for every Git tool (ADR 0020)                */
/* ------------------------------------------------------------------ */
// Obsidian Git saves and uploads by itself every 10 minutes through the git command line and never goes through
// commitAll. A big recording that no rule covers would be saved there as an ordinary file, GitHub would refuse every
// upload after it, and the only repair is a change to saved history. Two layers keep that from happening:
//   1. Prevention: a small "pre-commit" hook (below) sends big files to Git LFS before ANY Git tool saves them. It works
//      on a computer; a phone's Git does not run hooks.
//   2. Detection: pushCurrent refuses early, with a clear reason, when a commit about to go up holds a file that GitHub
//      would refuse (unpushedOversizedBlobs).

/** GitHub refuses ordinary files of about 100 MB (the exact figure is [Unverified]), so a file from 95 MiB up is flagged. */
export const GITHUB_BLOB_LIMIT_BYTES = 95 * 1024 * 1024;

/** The size from which an ordinary file counts as too big to upload. ALTERBRAIN_BLOB_LIMIT_BYTES lets the tests use a small number. */
export function blobLimitBytes() {
  const env = Number(process.env.ALTERBRAIN_BLOB_LIMIT_BYTES);
  return process.env.ALTERBRAIN_BLOB_LIMIT_BYTES && Number.isFinite(env) && env > 0 ? Math.floor(env) : GITHUB_BLOB_LIMIT_BYTES;
}

/** Run git and return the raw bytes of its output (the contents of a blob must not go through a text decoder). */
function gitBytes(cwd, args, input) {
  const res = spawnSync('git', args, {
    cwd,
    input,
    timeout: 120_000,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ...GIT_ENV },
  });
  return { ok: res.status === 0 && !res.error, stdout: res.stdout || Buffer.alloc(0), stderr: String(res.stderr || (res.error ? res.error.message : '')).trim() };
}

const LFS_POINTER = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)\n?/;

/**
 * What the saved changes that are not online yet hold, read from this computer's history alone (no network, no Git LFS
 * program): { files, lfs, error }.
 *  - files: ordinary files at or above the limit, [{ path, size }]. A Git LFS pointer is tiny, so a file stored through
 *    Git LFS is never in this list.
 *  - lfs: the Git LFS files those changes point to, { count, bytes } (pointers are read; `bytes` is the size of the real files).
 *    Only worked out when opts.pointers is true.
 * Never throws. When git cannot answer, `files` is empty and `error` says why (the upload itself then reports the real problem).
 */
function scanUnpushed(cwd, { pointers = false } = {}) {
  const out = { files: [], lfs: { count: 0, bytes: 0 }, error: null };
  try {
    const limit = blobLimitBytes();
    const range = hasUpstream(cwd) ? ['@{u}..HEAD'] : ['HEAD', '--not', '--remotes=origin'];
    const listed = gitRaw(cwd, ['rev-list', '--objects', ...range]);
    if (!listed.ok) return { ...out, error: listed.stderr || 'git rev-list failed' };
    if (!listed.stdout.trim()) return out;
    const sized = gitRaw(cwd, ['cat-file', '--batch-check=%(objecttype) %(objectsize) %(objectname) %(rest)'], listed.stdout);
    if (!sized.ok) return { ...out, error: sized.stderr || 'git cat-file failed' };
    const candidates = []; // blobs the size of a Git LFS pointer
    for (const line of sized.stdout.split(/\r?\n/)) {
      const m = /^blob (\d+) ([0-9a-f]{40,64}) ?(.*)$/.exec(line);
      if (!m) continue;
      const size = Number(m[1]);
      if (size >= limit) out.files.push({ path: m[3] || '(unnamed)', size });
      else if (pointers && size >= 100 && size <= 400) candidates.push(m[2]);
    }
    if (candidates.length) {
      const body = gitBytes(cwd, ['cat-file', '--batch'], `${candidates.join('\n')}\n`);
      if (!body.ok) return { ...out, files: [], error: body.stderr || 'git cat-file failed' };
      const buf = body.stdout;
      const seen = new Set();
      let pos = 0;
      while (pos < buf.length) {
        const eol = buf.indexOf(0x0a, pos);
        if (eol < 0) break;
        const header = buf.toString('latin1', pos, eol).split(' ');
        const size = Number(header[2]);
        if (header[1] !== 'blob' || !Number.isFinite(size)) {
          pos = eol + 1; // "<name> missing": no content follows
          continue;
        }
        const m = LFS_POINTER.exec(buf.toString('latin1', eol + 1, eol + 1 + size));
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          out.lfs.count += 1;
          out.lfs.bytes += Number(m[2]);
        }
        pos = eol + 1 + size + 1;
      }
    }
    return out;
  } catch (e) {
    return { files: [], lfs: { count: 0, bytes: 0 }, error: String((e && e.message) || e) };
  }
}

/**
 * Ordinary files at or above the limit inside the saved changes that are not online yet: { files: [{ path, size }], error }.
 * A Git LFS pointer is tiny, so a file stored through Git LFS never shows up here. Never throws.
 */
export function unpushedOversizedBlobs(cwd) {
  const { files, error } = scanUnpushed(cwd);
  return { files, error };
}

/** From this many bytes of waiting Git LFS files, an upload is started in the background instead of inside a hook's short time limit. */
export const BACKGROUND_UPLOAD_BYTES = 16 * 1024 * 1024;

export function backgroundUploadBytes() {
  const env = Number(process.env.ALTERBRAIN_BACKGROUND_UPLOAD_BYTES);
  return process.env.ALTERBRAIN_BACKGROUND_UPLOAD_BYTES && Number.isFinite(env) && env >= 0 ? Math.floor(env) : BACKGROUND_UPLOAD_BYTES;
}

/**
 * Git LFS files that are saved but not online yet: { count, bytes } (bytes = the size of the real files), or null when
 * the history cannot be read. Reads this computer's history only, so it is quick and works offline. It may count a file
 * that an earlier, interrupted upload already delivered; that only makes a background upload start a little early.
 */
export function lfsPendingUpload(cwd) {
  if (!lfsInstalled()) return { count: 0, bytes: 0 };
  const { lfs, error } = scanUnpushed(cwd, { pointers: true });
  return error ? null : lfs;
}

// ---- the pre-commit hook ----

export const PRE_COMMIT_SCRIPT_REL = 'system/scripts/git-auto.mjs';
export const PRE_COMMIT_MARKER = '# alterbrain-pre-commit v1';

/** Plain-language sentences for a hook that is not in place (doctor and git-auto use them). */
export const PRE_COMMIT_HOOK_TEXT = {
  missing:
    'The check that sends big files to Git LFS before Obsidian Git or another Git tool saves them is not installed. ' +
    'A very large file saved by one of those tools could stop your online backup.',
  foreign:
    "Another tool already has a check that runs before every save (the file .git/hooks/pre-commit), so Alterbrain's own big-file check is not installed. " +
    'A very large file saved by Obsidian Git or another Git tool could stop your online backup.',
  'hooks-path':
    "Git on this computer is set to use a shared folder for its checks, so Alterbrain's own big-file check is not installed. " +
    'A very large file saved by Obsidian Git or another Git tool could stop your online backup.',
  error: 'The big-file check could not be installed.',
};

const shQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** The text of the hook. `nodePath` is used only when "node" is not on the hook's PATH (a desktop app may not have it). */
export function preCommitShim(nodePath = '') {
  const fallback = shQuote(String(nodePath || '').replace(/\\/g, '/'));
  return [
    '#!/bin/sh',
    PRE_COMMIT_MARKER,
    '# Written by Alterbrain (system/lib/git.mjs) and rewritten when it goes out of date. Delete this file to switch it off.',
    '# Before any Git tool (Obsidian Git included) saves a big file as an ordinary file, send it to Git LFS instead.',
    '# It never stops a save, except when the big files were the only thing in it (then there is nothing to save, as git itself says).',
    'root=$(git rev-parse --show-toplevel 2>/dev/null)',
    `script="$root/${PRE_COMMIT_SCRIPT_REL}"`,
    '[ -n "$root" ] && [ -f "$script" ] || exit 0',
    'node_bin=$(command -v node 2>/dev/null)',
    `if [ -z "$node_bin" ] && [ -x ${fallback} ]; then node_bin=${fallback}; fi`,
    '[ -n "$node_bin" ] || exit 0',
    'CLAUDE_PROJECT_DIR="$root" "$node_bin" "$script" pre-commit',
    'if [ "$?" -eq 3 ]; then exit 1; fi',
    'exit 0',
    '',
  ].join('\n');
}

/** What an existing pre-commit hook is: 'empty', 'ours' or 'foreign' (anyone else's, never touched). */
export function classifyPreCommit(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n');
  if (!t.trim()) return 'empty';
  return t.split('\n').some((l) => l.trim() === PRE_COMMIT_MARKER) ? 'ours' : 'foreign';
}

/** The node program to remember in the hook: the one already there if it still exists, else the one running now (only if it is really "node"). */
function nodeForHook(existingText = '') {
  const isNode = (p) => /(^|[\\/])node(\.exe)?$/i.test(p) && existsSync(p);
  const remembered = /\[ -x '([^']*)' \]/.exec(existingText);
  if (remembered && isNode(remembered[1])) return remembered[1];
  return isNode(process.execPath) ? process.execPath : '';
}

/** Where the pre-commit hook file is for this folder (git's own answer, which follows links to another git folder). */
function preCommitPath(root) {
  try {
    if (statSync(join(root, '.git')).isDirectory()) return join(root, '.git', 'hooks', 'pre-commit');
  } catch {
    /* .git is a file (a linked folder) or missing: ask git */
  }
  const r = git(['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: root });
  return r.ok && r.stdout ? resolve(root, r.stdout.split(/\r?\n/)[0]) : null;
}

/** The shared hooks folder Git is set to use (core.hooksPath), or null. Hooks in .git/hooks do not run then. */
function sharedHooksFolder(root) {
  const r = git(['config', '--get', 'core.hooksPath'], { cwd: root });
  return r.ok && r.stdout ? r.stdout.split(/\r?\n/)[0] : null;
}

const readIfThere = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const sameText = (a, b) => String(a).replace(/\r\n/g, '\n') === String(b);

/**
 * Is the big-file check in place? Read-only. state: 'active' (our hook is there), 'missing' (no hook or an empty one: it can
 * be installed), 'foreign' (someone else's hook: left alone), 'hooks-path' (Git uses a shared hooks folder: nothing is
 * written), 'error'. `outdated` is true when our hook should be rewritten.
 */
export function preCommitHookStatus(root) {
  try {
    const file = preCommitPath(root);
    if (!file) return { state: 'error', path: null, message: PRE_COMMIT_HOOK_TEXT.error };
    const shared = sharedHooksFolder(root);
    if (shared) return { state: 'hooks-path', path: file, hooks_path: shared };
    const text = readIfThere(file);
    if (text === null) return { state: 'missing', path: file };
    const kind = classifyPreCommit(text);
    if (kind === 'ours') return { state: 'active', path: file, outdated: !sameText(text, preCommitShim(nodeForHook(text))) };
    if (kind === 'foreign') return { state: 'foreign', path: file };
    return { state: 'missing', path: file };
  } catch (e) {
    return { state: 'error', path: null, message: `${PRE_COMMIT_HOOK_TEXT.error} ${String((e && e.message) || e)}` };
  }
}

/**
 * Install or refresh the big-file check. Safe to call often: when our hook is already right it only reads one small file.
 * Never overwrites a hook that is not ours, never writes outside this folder's own git folder, never throws.
 * Returns { state, changed, path }, state as in preCommitHookStatus ('active' = in place).
 */
export function ensurePreCommitHook(root) {
  let tmp = null;
  try {
    const file = preCommitPath(root);
    if (!file) return { state: 'error', changed: false, path: null, message: PRE_COMMIT_HOOK_TEXT.error };
    const text = readIfThere(file);
    const kind = text === null ? 'absent' : classifyPreCommit(text);
    if (kind === 'ours' && sameText(text, preCommitShim(nodeForHook(text)))) return { state: 'active', changed: false, path: file };
    if (kind === 'foreign') return { state: 'foreign', changed: false, path: file };
    const shared = sharedHooksFolder(root);
    if (shared) return { state: 'hooks-path', changed: false, path: file, hooks_path: shared };
    mkdirSync(dirname(file), { recursive: true });
    tmp = `${file}.alterbrain-new`;
    writeFileSync(tmp, preCommitShim(nodeForHook(text || '')), { encoding: 'utf8', mode: 0o755 });
    try {
      chmodSync(tmp, 0o755);
    } catch {
      /* Windows has no execute bit: Git for Windows runs hooks through its own shell */
    }
    renameSync(tmp, file); // a hook file is never half-written when a save starts at the same moment
    tmp = null;
    return { state: 'active', changed: true, path: file };
  } catch (e) {
    return { state: 'error', changed: false, path: null, message: `${PRE_COMMIT_HOOK_TEXT.error} ${String((e && e.message) || e)}` };
  } finally {
    if (tmp) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* nothing more to do */
      }
    }
  }
}

/** Files that are staged as new or changed ordinary files and are at or above `min` bytes: [{ path, size }]. Throws on a git failure. */
function stagedBigFiles(cwd, min) {
  const d = gitRaw(cwd, ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-abbrev', '--no-ext-diff', '--diff-filter=AM']);
  if (!d.ok) throw new Error(d.stderr || 'git diff failed');
  const t = d.stdout.split('\0');
  const entries = []; // { path, sha }
  for (let i = 0; i + 1 < t.length; i += 2) {
    const m = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) [A-Z]\d*$/.exec(t[i]);
    if (!m) continue;
    if (!m[2].startsWith('100') || /^0+$/.test(m[4])) continue; // regular files only (no links, no folders-as-files)
    entries.push({ path: t[i + 1], sha: m[4] });
  }
  if (!entries.length) return [];
  const sized = gitRaw(cwd, ['cat-file', '--batch-check=%(objectsize)'], `${entries.map((e) => e.sha).join('\n')}\n`);
  if (!sized.ok) throw new Error(sized.stderr || 'git cat-file failed');
  const sizes = sized.stdout.split(/\r?\n/);
  const out = [];
  entries.forEach((e, i) => {
    const size = Number(sizes[i]);
    if (Number.isFinite(size) && size >= min) out.push({ path: e.path, size });
  });
  return out;
}

/**
 * The pre-commit version of prepareBigFiles: look at what is STAGED right now (whichever tool staged it) and fix it
 * before the commit is made. A big file with no rule gets an exact-path rule in vault/.gitattributes and is staged again
 * through Git LFS; a file that cannot be stored safely is taken out of this commit and listed in left_out (same reasons
 * as prepareBigFiles). Everything else in the commit is untouched. Never throws; on `error` nothing was changed.
 * opts.isPrivate(path) -> boolean, opts.retry: as in prepareBigFiles.
 * Returns { min_bytes, routed: [paths], healed: [], left_out: [{ path, reason }], error }.
 */
export function checkStagedBigFiles(cwd, opts = {}) {
  const result = { min_bytes: lfsMinBytes(cwd), routed: [], healed: [], left_out: [], error: null };
  try {
    const min = result.min_bytes;
    const max = lfsMaxBytes();
    const isPrivate = typeof opts.isPrivate === 'function' ? opts.isPrivate : () => false;
    const big = stagedBigFiles(cwd, min);
    if (!big.length) return result;
    const lfsOk = lfsInstalled();
    const attrs = attributeValues(cwd, big.map((f) => f.path));
    const filterOf = (path) => attrs.get(path) || 'unspecified';
    const left = new Map();
    const leave = (path, reason) => {
      if (!left.has(path)) left.set(path, reason);
    };
    const newRules = [];
    const restage = []; // a rule already covers it, but the file was staged without the Git LFS filter
    for (const f of big) {
      const priv = filterOf(f.path) === 'git-crypt' || isPrivate(f.path);
      if (f.size >= max) leave(f.path, priv ? 'private' : 'too-big');
      else if (priv) leave(f.path, 'private');
      else if (!lfsOk) leave(f.path, 'no-lfs');
      else if (filterOf(f.path) === 'lfs') restage.push(f.path);
      else if (f.path.startsWith('vault/')) newRules.push(f.path);
      else leave(f.path, 'outside-vault');
    }

    const targets = [...newRules, ...restage];
    const lit = (p) => `:(literal)${p}`;
    const inChunks = (paths, fn) => {
      for (let i = 0; i < paths.length; i += 100) fn(paths.slice(i, i + 100).map(lit));
    };
    if (targets.length) {
      if (!lfsFilterReady(cwd)) {
        for (const p of targets) leave(p, 'no-lfs');
      } else {
        if (newRules.length) addLfsRules(cwd, newRules.map((p) => p.slice('vault/'.length)));
        const after = attributeValues(cwd, targets);
        const ready = targets.filter((p) => after.get(p) === 'lfs');
        for (const p of targets) if (!ready.includes(p)) leave(p, 'rule-failed');
        if (ready.length) {
          // Stage them again, so that git runs the Git LFS filter, and stage the rule file with them.
          inChunks(ready, (paths) => {
            const reset = withLockRetry(() => git(['reset', '-q', '--', ...paths], { cwd }), opts.retry || {});
            if (!reset.ok) throw new Error(reset.stderr || 'git reset failed');
            const add = withLockRetry(() => git(['add', '--', ...paths], { cwd }), opts.retry || {});
            if (!add.ok) throw new Error(add.stderr || 'git add failed');
          });
          if (newRules.length) {
            const rules = withLockRetry(() => git(['add', '--', lit(LFS_RULES_FILE)], { cwd }), opts.retry || {});
            if (!rules.ok) throw new Error(rules.stderr || 'git add failed');
          }
          // Prove it: what is staged now must be the small pointer, never the full copy.
          const again = new Map(stagedBigFiles(cwd, min).map((f) => [f.path, f]));
          for (const p of ready) {
            if (again.has(p)) leave(p, 'rule-failed');
            else if (newRules.includes(p)) result.routed.push(p);
            else result.healed.push(p);
          }
        }
      }
    }

    result.left_out = [...left].map(([path, reason]) => ({ path, reason }));
    // Whatever cannot be stored safely must not be part of this commit.
    inChunks(result.left_out.map((l) => l.path), (paths) => {
      const reset = withLockRetry(() => git(['reset', '-q', '--', ...paths], { cwd }), opts.retry || {});
      if (!reset.ok) throw new Error(reset.stderr || 'git reset failed');
    });
    return result;
  } catch (e) {
    result.error = `Big files could not be checked: ${String((e && e.message) || e)}`;
    return result;
  }
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
