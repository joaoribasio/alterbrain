// Shared helpers for the encryption tests (vaultkey lib, vault-key.mjs, git-auto guard).
// Everything happens in throw-away folders under state/local/tmp/vaultkey/. Synthetic data only. Keys and passwords
// are made up at run time, and nothing here installs or downloads anything.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { resolveGitCrypt } from '../../../system/lib/vaultkey.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FAKE_GIT_CRYPT = join(REPO, 'tests', 'fixtures', 'scripts', 'fake-git-crypt.mjs');
const TMP_BASE = join(REPO, 'state', 'local', 'tmp', 'vaultkey');

/**
 * Is a real git-crypt installed? Decided by the library's own search (PATH first, then the folders winget and the other
 * installers use), so it is found on a computer where the app was started before the install and PATH is out of date.
 * ALTERBRAIN_GIT_CRYPT is ignored here when it points at a test stand-in (a .mjs file), and honoured when it points at
 * the real program (a way to run the real-tool tests against one particular git-crypt). The tests that need the real
 * tool skip when there is none.
 */
function findRealGitCrypt() {
  const previous = process.env.ALTERBRAIN_GIT_CRYPT;
  const forced = previous && !/\.m?js$/i.test(previous) ? previous : undefined;
  if (forced) process.env.ALTERBRAIN_GIT_CRYPT = forced;
  else delete process.env.ALTERBRAIN_GIT_CRYPT;
  try {
    return { tool: resolveGitCrypt({ fresh: true }), forced };
  } finally {
    if (previous === undefined) delete process.env.ALTERBRAIN_GIT_CRYPT;
    else process.env.ALTERBRAIN_GIT_CRYPT = previous;
  }
}
const REAL = findRealGitCrypt();
export const REAL_GIT_CRYPT_TOOL = REAL.tool;
export const REAL_GIT_CRYPT = Boolean(REAL.tool);
/** What child processes get as ALTERBRAIN_GIT_CRYPT in 'real' mode: nothing (they search themselves), unless the real program was named. */
export const REAL_GIT_CRYPT_ENV = REAL.forced;

/** A password for tests, made up at run time (never a real one). */
export const fakePassword = () => `test-${randomBytes(6).toString('hex')}-${randomBytes(3).toString('hex')}`;

/** Fake key bytes in the shape of a git-crypt key file. */
export const fakeKeyBytes = () => Buffer.concat([Buffer.from('\0GITCRYPTKEY'), randomBytes(136)]);

/** Environment for child processes: isolated git settings, one tool choice. */
export function childEnv(root, extra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'),
    GIT_TERMINAL_PROMPT: '0',
    ALTERBRAIN_GIT_RETRY_MS: '20',
    // The hook's real time limits (12 s and 13 s) are for a person's computer. The suite runs hundreds of tests in parallel, and a
    // push that went over would be handed to the background and not be online yet when a test looks. Tests of the hand-over set their own.
    ALTERBRAIN_HOOK_COMMIT_TIMEOUT_MS: '90000',
    ALTERBRAIN_HOOK_PUSH_TIMEOUT_MS: '90000',
    ...extra,
  };
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete env[k];
  return env;
}

export function git(cwd, args, env = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv(cwd, env), windowsHide: true });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${res.stderr}`);
  return (res.stdout || '').trim();
}

export function gitTry(cwd, args, env = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv(cwd, env), windowsHide: true });
  return { ok: res.status === 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
}

/** Bytes of a file as stored in a commit. */
export function blobAt(cwd, rev, path) {
  const res = spawnSync('git', ['cat-file', 'blob', `${rev}:${path}`], { cwd, env: childEnv(cwd), windowsHide: true });
  if (res.status !== 0) throw new Error(`no ${path} at ${rev}: ${res.stderr}`);
  return res.stdout;
}

export function write(root, rel, text) {
  const file = join(root, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

export const read = (root, rel) => readFileSync(join(root, ...rel.split('/')), 'utf8');
export const exists = (root, rel) => existsSync(join(root, ...rel.split('/')));

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

/** Notes used by the tests. Plain text, made up. */
export const NOTES = {
  fact: 'vault/80_me/fact-sheet.md',
  user: 'vault/80_me/USER.md',
  soul: 'vault/80_me/SOUL.md',
  voice: 'vault/80_me/voice/en/profile.md',
  person: 'vault/60_people/Jamie Example.md',
  journal: 'vault/70_journal/daily/2026-10-07.md',
  pdf: 'vault/80_me/foo.pdf', // in 80_me but outside voice/ and private/, so not encrypted
  scan: 'vault/60_people/scan.pdf', // a document in an encrypted folder
  task: 'vault/00_inbox/Tasks.md',
};

/**
 * A throw-away Alterbrain-shaped project with git, the framework's root .gitattributes, one commit and
 * (optionally) a bare repository as "origin". Copies the real hooks, lib and the git-auto script when `framework` is set,
 * so the hook can be run against it. Returns { parent, root, bare, env }.
 */
export function makeVaultProject({ remote = false, framework = false, enabled = false, brain = {}, rootAttributes = 'neutral' } = {}) {
  const parent = newTmp();
  const root = join(parent, 'proj');
  mkdirSync(join(root, 'system'), { recursive: true });
  write(root, 'system/placeholder.txt', 'x\n');
  write(root, '.gitignore', 'state/local/\n');
  // 'neutral' is the root rule every copy has (LF line endings) and nothing about Git LFS, so the tests do not depend on how the
  // framework's own .gitattributes treats documents. 'framework' copies the real file.
  write(root, '.gitattributes', rootAttributes === 'framework' ? readFileSync(join(REPO, '.gitattributes'), 'utf8') : '* text=auto eol=lf\n');
  write(root, 'config/brain.json', JSON.stringify({
    schema: 1,
    git: { auto_commit: true, auto_push: true },
    ...(enabled ? { privacy: { encryption: { enabled: true, tool: 'git-crypt', scope: [], key_backup_checked: null } } } : {}),
    ...brain,
  }, null, 2));
  write(root, NOTES.task, '---\ntype: "tasks"\nstatus: "active"\n---\n# Tasks\n\n## Inbox\n\n## Today\n\n');
  write(root, NOTES.soul, 'Persona notes.\n');
  // The upload check (a git hook, installed by vault-key setup and unlock) runs system/scripts/git-hooks/pre-push.mjs from the
  // project and refuses when it cannot be found, so every test project carries it and the library it uses.
  cpSync(join(REPO, 'system', 'lib'), join(root, 'system', 'lib'), { recursive: true });
  cpSync(join(REPO, 'system', 'scripts', 'git-hooks'), join(root, 'system', 'scripts', 'git-hooks'), { recursive: true });
  if (framework) {
    cpSync(join(REPO, 'system', 'hooks'), join(root, 'system', 'hooks'), { recursive: true });
    for (const f of ['git-auto.mjs', 'vault-key.mjs']) cpSync(join(REPO, 'system', 'scripts', f), join(root, 'system', 'scripts', f));
  }
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Alex Doe']);
  git(root, ['config', 'user.email', 'alex@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
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

/** Run vault-key.mjs in a project. `tool` = 'fake' (default), 'none' (git-crypt missing) or 'real'. */
export function runVk(root, args, { tool = 'fake', env = {}, input } = {}) {
  const toolEnv = tool === 'fake' ? { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT } : tool === 'none' ? { ALTERBRAIN_GIT_CRYPT: join(root, 'no-such-git-crypt.exe') } : { ALTERBRAIN_GIT_CRYPT: REAL_GIT_CRYPT_ENV };
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', 'vault-key.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: childEnv(root, { ...toolEnv, ...env }),
    input,
    timeout: 120_000,
    windowsHide: true,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/** Run a script or hook that lives inside the project copy (made with framework: true). */
export function runInProject(root, rel, args = [], { tool = 'fake', env = {}, input } = {}) {
  const toolEnv = tool === 'fake' ? { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT } : tool === 'none' ? { ALTERBRAIN_GIT_CRYPT: join(root, 'no-such-git-crypt.exe') } : { ALTERBRAIN_GIT_CRYPT: REAL_GIT_CRYPT_ENV };
  const res = spawnSync(process.execPath, [join(root, ...rel.split('/')), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: childEnv(root, { ...toolEnv, ...env }),
    input,
    timeout: 120_000,
    windowsHide: true,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}
