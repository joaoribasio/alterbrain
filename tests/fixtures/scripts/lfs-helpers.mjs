// Shared helpers for the big-file tests (ADR 0020): git-auto, the Git LFS rules and the doctor checks.
// Everything happens in throw-away folders under state/local/tmp/lfs/. Synthetic data only; the "files" are random bytes.
// The tests need the real Git LFS program (they skip when it is missing) and never download or install anything.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TMP_BASE = join(REPO, 'state', 'local', 'tmp', 'lfs');

/** Is the real Git LFS program installed? The tests that need it are skipped when it is not. */
export const LFS_AVAILABLE = spawnSync('git', ['lfs', 'version'], { encoding: 'utf8', windowsHide: true }).status === 0;
export const SKIP = LFS_AVAILABLE ? false : 'Git LFS is not installed on this computer';

/** The rules the root .gitattributes held before ADR 0020: every binary document in the vault went through Git LFS. */
export const OLD_ROOT_RULES = [
  '* text=auto eol=lf',
  ...['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'm4a', 'mp4', 'mov', 'zip', 'mbox'].map((e) => `vault/**/*.${e} filter=lfs diff=lfs merge=lfs -text`),
  'vault/.obsidian/plugins/** -text',
  'vault/40_sources/manifest.jsonl merge=union',
  'vault/30_wiki/log.md            merge=union',
  '',
].join('\n');

/** The root .gitattributes of this checkout (the rules after ADR 0020). */
export const newRootRules = () => readFileSync(join(REPO, '.gitattributes'), 'utf8');

/** Default size limit for the tests, so that small files count as "big". */
export const TEST_LIMIT = 4096;

/** Environment for child processes: isolated git settings (no global or system Git LFS setup). */
export function childEnv(root, extra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'),
    GIT_TERMINAL_PROMPT: '0',
    ALTERBRAIN_GIT_RETRY_MS: '20',
    // The throw-away folders sit inside this checkout: git must never walk up out of them into the real repository.
    GIT_CEILING_DIRECTORIES: existsSync(TMP_BASE) ? realpathSync(TMP_BASE) : TMP_BASE,
    ...extra,
  };
  for (const [k, v] of Object.entries(extra)) if (v === undefined || v === null) delete env[k];
  return env;
}

export function git(cwd, args, env = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv(cwd, env), windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${res.stderr}`);
  return (res.stdout || '').trim();
}

export function gitTry(cwd, args, env = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv(cwd, env), windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: res.status === 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
}

/** Bytes of a file as stored in a commit (a Git LFS pointer for a big file). */
export function blobAt(cwd, rev, path) {
  const res = spawnSync('git', ['cat-file', 'blob', `${rev}:${path}`], { cwd, env: childEnv(cwd), windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`no ${path} at ${rev}: ${res.stderr}`);
  return res.stdout;
}

export const isPointer = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, 64).toString('latin1').startsWith('version https://git-lfs.github.com/spec/v1');
export const inHead = (cwd, path) => gitTry(cwd, ['cat-file', '-e', `HEAD:${path}`]).ok;
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/** Where Git LFS keeps an object in a git folder. */
export const lfsObjectPath = (gitDir, oid) => join(gitDir, 'objects', oid.slice(0, 2), oid.slice(2, 4), oid);
/** Random bytes. They never start with a Git LFS pointer header. */
export const bytes = (n) => randomBytes(n);

export function write(root, rel, content) {
  const file = join(root, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}
export const read = (root, rel) => readFileSync(join(root, ...rel.split('/')));
export const readText = (root, rel) => readFileSync(join(root, ...rel.split('/')), 'utf8');
export const exists = (root, rel) => existsSync(join(root, ...rel.split('/')));
export const tasksOf = (root) => (exists(root, 'vault/00_inbox/Tasks.md') ? readText(root, 'vault/00_inbox/Tasks.md') : '');
export const logOf = (root) => (exists(root, 'state/local/git.log') ? readText(root, 'state/local/git.log') : '');

export function newTmp(prefix = 'p-') {
  mkdirSync(TMP_BASE, { recursive: true });
  return realpathSync(mkdtempSync(join(TMP_BASE, prefix)));
}

export function cleanup(...dirs) {
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      /* best effort */
    }
  }
}

/**
 * A throw-away Alterbrain-shaped project with git and one commit.
 *   rules   'new' (the root .gitattributes of this checkout) or 'old' (every binary document in LFS)
 *   lfs     'none': no Git LFS setup in the folder (git-auto must set the filter itself) or 'full': `git lfs install --local`
 *   remote  true: a bare repository next to the project becomes "origin" and the first commit is pushed
 *   framework  true: the project holds a copy of the real hooks, library and git-auto script, so a hook can be run in it
 * Returns { parent, root, bare }.
 */
export function makeProject({ rules = 'new', lfs = 'none', remote = false, brain = {}, framework = false } = {}) {
  const parent = newTmp();
  const root = join(parent, 'proj');
  mkdirSync(root, { recursive: true });
  write(root, 'system/placeholder.txt', 'x\n'); // projectRoot() only accepts a folder that has system/
  write(root, '.gitignore', 'state/local/\n');
  write(root, '.gitattributes', rules === 'old' ? OLD_ROOT_RULES : newRootRules());
  write(root, 'config/brain.json', JSON.stringify({ schema: 1, git: { auto_commit: true, auto_push: true }, ...brain }, null, 2));
  write(root, 'vault/00_inbox/Tasks.md', '---\ntype: "tasks"\nstatus: "active"\n---\n# Tasks\n\n## Inbox\n\n## Today\n\n');
  write(root, 'vault/Home.md', '# Home\n');
  if (framework) {
    for (const dir of ['hooks', 'lib']) cpSync(join(REPO, 'system', dir), join(root, 'system', dir), { recursive: true });
    mkdirSync(join(root, 'system', 'scripts'), { recursive: true });
    cpSync(join(REPO, 'system', 'scripts', 'git-auto.mjs'), join(root, 'system', 'scripts', 'git-auto.mjs'));
  }
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Alex Doe']);
  git(root, ['config', 'user.email', 'alex@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  if (lfs === 'full') git(root, ['lfs', 'install', '--local']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'start']);
  let bare = null;
  if (remote) {
    bare = join(parent, 'remote.git');
    mkdirSync(bare, { recursive: true });
    git(bare, ['init', '-q', '--bare', '-b', 'main']);
    git(root, ['remote', 'add', 'origin', bare]);
    git(root, ['push', '-q', '-u', 'origin', 'main']);
  }
  return { parent, root, bare };
}

/**
 * Run `node system/scripts/git-auto.mjs <command> --json` against a project. The size limit is TEST_LIMIT bytes unless
 * `limit` is given (null leaves it to config/brain.json). Returns { code, stdout, stderr, json }.
 */
export function runAuto(root, command, { limit = TEST_LIMIT, env = {} } = {}) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'git-auto.mjs'), command, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: childEnv(root, { ALTERBRAIN_LFS_MIN_BYTES: limit === null ? undefined : String(limit), ...env }),
    timeout: 180_000,
    windowsHide: true,
  });
  let json = null;
  try {
    json = JSON.parse((res.stdout || '').trim().split('\n').filter(Boolean).pop() || '');
  } catch {
    /* not JSON */
  }
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '', json };
}

/** Run the SessionEnd hook of a project made with { framework: true }. Returns { code, stdout, stderr }. */
export function runSessionEnd(root, { limit = TEST_LIMIT, env = {} } = {}) {
  const res = spawnSync(process.execPath, [join(root, 'system', 'hooks', 'session_end.mjs')], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'SessionEnd', reason: 'other' }),
    env: childEnv(root, { ALTERBRAIN_LFS_MIN_BYTES: limit === null ? undefined : String(limit), ...env }),
    timeout: 120_000,
    windowsHide: true,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}
