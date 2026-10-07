// Shared test helpers for the ops scripts (git-auto, doctor, setup-github,
// obsidian-setup, update). Everything happens in temporary folders.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..', '..');
export const SCRIPTS = join(REPO_ROOT, 'system', 'scripts');
export const FIXTURES = HERE;

export function tmp(prefix = 'ab-ops-') {
  return mkdtempSync(join(tmpdir(), prefix));
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

export function write(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export function sha(bufOrText) {
  return createHash('sha256').update(bufOrText).digest('hex');
}

/** Environment for child scripts: an isolated git setup, no global config. */
export function childEnv(root, extra = {}) {
  return {
    ...process.env,
    CLAUDE_PROJECT_DIR: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'),
    GIT_TERMINAL_PROMPT: '0',
    ALTERBRAIN_GIT_RETRY_MS: '20',
    ...extra,
  };
}

/** Run `node system/scripts/<name>` against a temporary project root. */
export function runScript(name, args, root, extraEnv = {}) {
  const res = spawnSync(process.execPath, [join(SCRIPTS, name), ...args], {
    encoding: 'utf8',
    env: childEnv(root, extraEnv),
    cwd: root,
    timeout: 120_000,
    windowsHide: true,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

export function runScriptAsync(name, args, root, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(SCRIPTS, name), ...args], {
      env: childEnv(root, extraEnv),
      cwd: root,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Run git in a folder with the isolated environment. */
export function git(cwd, args, root = cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv(root), windowsHide: true });
  if (res.status !== 0 && !args.includes('--allow-fail')) {
    const err = new Error(`git ${args.join(' ')} failed in ${cwd}: ${res.stderr}`);
    err.code = res.status;
    err.stderr = res.stderr;
    throw err;
  }
  return (res.stdout || '').trim();
}

export function gitTry(cwd, args, root = cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv(root), windowsHide: true });
  return { ok: res.status === 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
}

/**
 * A throw-away Alterbrain-shaped project: `system/` and `vault/` folders, an
 * optional config/brain.json, and a git repository with one commit.
 * The folder lives inside a parent so that "../" scratch files are tidy.
 */
export function makeProject({ brain = null, dev = false, repo = true, name = 'proj' } = {}) {
  const parent = tmp();
  const root = join(parent, name);
  mkdirSync(join(root, 'system'), { recursive: true });
  mkdirSync(join(root, 'vault', '00_inbox'), { recursive: true });
  if (brain) write(join(root, 'config', 'brain.json'), JSON.stringify(brain, null, 2));
  if (dev) write(join(root, 'state', 'local', 'dev-mode'), 'dev\n');
  write(join(root, '.gitignore'), 'state/local/\n');
  write(join(root, 'README.md'), '# Test project\n');
  if (repo) {
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.name', 'Alex Doe']);
    git(root, ['config', 'user.email', 'alex@example.invalid']);
    git(root, ['config', 'commit.gpgsign', 'false']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'start']);
  }
  return { parent, root };
}

/** A bare repository used as the "online" remote. Returns its path. */
export function makeBareRemote(parent) {
  const bare = join(parent, 'remote.git');
  mkdirSync(bare, { recursive: true });
  git(bare, ['init', '--bare', '-b', 'main']);
  return bare;
}

/** Clone the bare remote somewhere else, to act as "the other computer". */
export function cloneOther(parent, bare, name = 'other') {
  const dir = join(parent, name);
  git(parent, ['clone', bare, dir]);
  git(dir, ['config', 'user.name', 'Alex Doe']);
  git(dir, ['config', 'user.email', 'alex@example.invalid']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

export function readText(file) {
  return readFileSync(file, 'utf8');
}

export { existsSync, cpSync, join, mkdirSync, writeFileSync, readFileSync };
