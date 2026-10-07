// Shared test helpers for the scripts-core tests. Synthetic data only.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURES = join(REPO, 'tests', 'fixtures', 'scripts');

/** A throwaway project folder (has system/ and vault/ so path helpers accept it). */
export function makeProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ab-scripts-')));
  mkdirSync(join(dir, 'system'), { recursive: true });
  mkdirSync(join(dir, 'vault'), { recursive: true });
  return {
    dir,
    path: (...parts) => join(dir, ...parts),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Run one of the scripts against a project. Returns { status, stdout, stderr, json() }. */
export function runScript(name, args, project, extraEnv = {}) {
  const res = spawnSync(process.execPath, [join(REPO, 'system', 'scripts', name), ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project.dir, ALTERBRAIN_NO_MARKITDOWN: '1', ...extraEnv },
    windowsHide: true,
    timeout: 60_000,
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    json: () => JSON.parse(res.stdout),
  };
}

/** Copy a fixture folder into a project. A top-level "claude" folder becomes ".claude". */
export function copyFixture(fixtureRel, project) {
  const src = join(FIXTURES, ...fixtureRel.split('/'));
  cpSync(src, project.dir, { recursive: true });
  const plain = join(project.dir, 'claude');
  if (existsSync(plain)) renameSync(plain, join(project.dir, '.claude'));
}

export function write(project, rel, content) {
  const file = join(project.dir, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

export function read(project, rel) {
  return readFileSync(join(project.dir, ...rel.split('/')), 'utf8');
}
