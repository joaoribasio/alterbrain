// Shared helpers for the hook tests (tests/hooks/*.test.mjs).
//
// makeProject() builds a throw-away Alterbrain project under state/local/tmp/hooks/ containing a copy
// of system/hooks and system/lib plus the synthetic files in tests/fixtures/hooks/project. Each hook is
// run as its own process with CLAUDE_PROJECT_DIR pointing at that copy, exactly as Claude Code does.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(FIXTURES, '..', '..', '..');
const TMP_BASE = join(REPO, 'state', 'local', 'tmp', 'hooks');

let template = null;

/** One shared copy of hooks + lib + base fixture; every project is a cheap copy of it. */
function getTemplate() {
  if (template) return template;
  mkdirSync(TMP_BASE, { recursive: true });
  template = mkdtempSync(join(TMP_BASE, 'tpl-'));
  cpSync(join(REPO, 'system', 'hooks'), join(template, 'system', 'hooks'), { recursive: true });
  cpSync(join(REPO, 'system', 'lib'), join(template, 'system', 'lib'), { recursive: true });
  cpSync(join(FIXTURES, 'project'), template, { recursive: true });
  process.on('exit', () => {
    try {
      rmSync(template, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return template;
}

/**
 * Create a project. Options:
 *   devMode     create state/local/dev-mode
 *   autonomy    name of a file in tests/fixtures/hooks/autonomy (without .json), or null for the default,
 *               or false to delete config/autonomy.json
 *   gitAuto     copy the fake git-auto.mjs into system/scripts
 *   manifest    false to delete system/manifest.json
 *   spaces      true to put the project in a folder whose name contains spaces
 */
export function makeProject({ devMode = false, autonomy = null, gitAuto = false, manifest = true, spaces = false } = {}) {
  mkdirSync(TMP_BASE, { recursive: true });
  const root = mkdtempSync(join(TMP_BASE, spaces ? 'my project ' : 'p-'));
  cpSync(getTemplate(), root, { recursive: true });

  const project = {
    root,
    path: (...parts) => join(root, ...parts),
    write(rel, text) {
      const file = join(root, ...rel.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text, 'utf8');
      return file;
    },
    read(rel) {
      const file = join(root, ...rel.split('/'));
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    },
    exists: (rel) => existsSync(join(root, ...rel.split('/'))),
    remove(rel) {
      rmSync(join(root, ...rel.split('/')), { recursive: true, force: true });
    },
    /** Lines the fake git-auto recorded ("pull --json", "commit", "push"). */
    gitCalls() {
      const text = project.read('state/local/tmp/git-calls.log');
      return text ? text.split('\n').filter(Boolean) : [];
    },
    cleanup() {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };

  if (devMode) project.write('state/local/dev-mode', 'test checkout\n');
  if (autonomy === false) project.remove('config/autonomy.json');
  else if (autonomy) cpSync(join(FIXTURES, 'autonomy', `${autonomy}.json`), join(root, 'config', 'autonomy.json'));
  if (gitAuto) cpSync(join(FIXTURES, 'fake-git-auto.mjs'), join(root, 'system', 'scripts', 'git-auto.mjs'));
  if (manifest === false) project.remove('system/manifest.json');
  return project;
}

/**
 * Run one hook as a child process.
 *   input   object, JSON-encoded onto stdin
 *   raw     a string sent as-is instead (to test malformed input)
 *   env     extra environment variables (undefined removes one)
 *   args    extra command-line arguments (for example ['--stop'])
 *   cwd     working directory (default: the OS temp folder, to prove the hook never relies on cwd)
 *   useEnv  false to leave CLAUDE_PROJECT_DIR unset
 * Returns { code, stdout, stderr, json, ms }. json is the parsed stdout, or null.
 */
export function runHook(project, hook, input, { raw, env = {}, args = [], cwd, useEnv = true, timeout = 30_000 } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.CLAUDE_PROJECT_DIR;
  delete childEnv.CLAUDE_CODE_VERSION;
  if (useEnv) childEnv.CLAUDE_PROJECT_DIR = project.root;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  const started = Date.now();
  const res = spawnSync(process.execPath, [join(project.root, 'system', 'hooks', `${hook}.mjs`), ...args], {
    input: raw !== undefined ? raw : JSON.stringify(input),
    encoding: 'utf8',
    cwd: cwd || process.env.TEMP || process.env.TMPDIR || '/',
    env: childEnv,
    timeout,
    windowsHide: true,
  });
  const stdout = (res.stdout || '').trim();
  let json = null;
  try {
    json = stdout ? JSON.parse(stdout) : null;
  } catch {
    /* leave null */
  }
  return { code: res.status, stdout, stderr: res.stderr || '', json, ms: Date.now() - started };
}

/** permissionDecision of a PreToolUse answer, or null when the hook said nothing. */
export const decisionOf = (result) => result.json?.hookSpecificOutput?.permissionDecision ?? null;
export const reasonOf = (result) => result.json?.hookSpecificOutput?.permissionDecisionReason ?? null;
/** additionalContext of a SessionStart answer. */
export const contextOf = (result) => result.json?.hookSpecificOutput?.additionalContext ?? null;

/* ---- PreToolUse payload builders ---- */
export const write = (file_path, content = 'hello') => ({ tool_name: 'Write', tool_input: { file_path, content } });
export const edit = (file_path, new_string = 'hello', old_string = 'x') => ({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string } });
export const multiEdit = (file_path, strings) => ({
  tool_name: 'MultiEdit',
  tool_input: { file_path, edits: strings.map((new_string) => ({ old_string: 'x', new_string })) },
});
export const notebookEdit = (notebook_path, new_source = 'print(1)') => ({ tool_name: 'NotebookEdit', tool_input: { notebook_path, new_source } });
export const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
export const powershell = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
export const mcp = (name, tool_input = {}) => ({ tool_name: name, tool_input });

/* ---- fake secrets: always assembled at run time, never written out in full ---- */
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX = '0123456789abcdef';

/** Deterministic pseudo-random string (mulberry32), forced to contain a letter and a digit. */
export function randomish(length, alphabet = ALNUM, seed = 7) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(next() * alphabet.length)];
  const letters = alphabet.replace(/\d/g, '');
  const digits = alphabet.replace(/\D/g, '');
  const chars = out.split('');
  if (!/\d/.test(out) && digits) chars[0] = digits[seed % digits.length];
  if (!/[A-Za-z]/.test(out) && letters) chars[1] = letters[seed % letters.length];
  return chars.join('');
}

export function fakeSecrets() {
  return {
    privateKey: '-----BEGIN ' + 'RSA PRIVATE' + ' KEY-----',
    skKey: 'sk' + '-' + randomish(44, ALNUM, 11),
    skAnthropic: 'sk' + '-ant-' + 'api03-' + randomish(60, ALNUM, 12),
    githubPat: 'gh' + 'p_' + randomish(36, ALNUM, 13),
    githubOauth: 'gh' + 'o_' + randomish(36, ALNUM, 14),
    slack: 'xo' + 'xb-' + '1234567890' + '-' + '0987654321' + '-' + randomish(24, ALNUM, 15),
    aws: 'AK' + 'IA' + randomish(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16),
    google: 'AI' + 'za' + randomish(35, ALNUM, 17),
    jwt: 'ey' + 'J' + randomish(20, ALNUM, 18) + '.ey' + 'J' + randomish(20, ALNUM, 19) + '.' + randomish(24, ALNUM, 20),
    genericKeyLine: 'api' + '_key' + ' = "' + randomish(32, HEX, 21) + '"',
    envStyleLine: 'ADZUNA_APP' + '_KEY=' + randomish(32, HEX, 22),
    tokenYaml: 'access' + '_token: ' + randomish(40, ALNUM, 23),
    passwordLine: 'pass' + 'word=' + randomish(24, ALNUM, 24),
  };
}
