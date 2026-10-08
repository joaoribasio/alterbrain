// Test helpers for the upgrade scripts in system/scripts/migrations/. Synthetic data only.
//
// A fixture is a small project folder in one of the shapes a release has produced:
//   v0.1.0, v0.1.1 ......... old installs (Alex Doe, MBA, Rotterdam); they still have a school block
//   v0.2-professional ...... a 0.2 install (Jordan Doe, no courses)
//   v0.2-online ............ a 0.2 install (Robin Doe, Coursera)
// A top-level "claude" folder in a fixture becomes ".claude" in the copy (the same convention as the validate fixtures),
// so no nested .claude folder sits inside the repository's tests. Copies live in <repo>/state/local/tmp/mig-<random>/.
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..', '..');
export const FIXTURES = HERE;
export const MIGRATIONS_DIR = join(REPO, 'system', 'scripts', 'migrations');
export const FIXTURE_NAMES = ['v0.1.0', 'v0.1.1', 'v0.2-professional', 'v0.2-online'];

const made = new Set();

/** Copy a fixture to a fresh temporary project folder and return its path. */
export function copyFixture(name) {
  const base = join(REPO, 'state', 'local', 'tmp');
  mkdirSync(base, { recursive: true });
  const root = join(base, `mig-${randomBytes(6).toString('hex')}`);
  cpSync(join(FIXTURES, name), root, { recursive: true });
  const plain = join(root, 'claude');
  if (existsSync(plain)) renameSync(plain, join(root, '.claude'));
  made.add(root);
  return root;
}

/** Remove every folder this process copied. */
export function cleanup() {
  for (const dir of made) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      /* best effort */
    }
  }
  made.clear();
}
process.on('exit', cleanup);

/** Run one upgrade script against a project folder. `file` is its name, for example "0001-remove-canvas.mjs". */
export function runMigration(file, root, args = []) {
  const res = spawnSync(process.execPath, [join(MIGRATIONS_DIR, file), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 120_000,
    windowsHide: true,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/** Every upgrade script in the framework, in the order they run. */
export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.mjs')).sort();
}

/** Every guided upgrade (NNNN-*.md) in the framework: instructions for the person's Claude, never run by a script. */
export function listGuided() {
  return readdirSync(MIGRATIONS_DIR).filter((n) => /^\d{4}-[a-z0-9-]+\.md$/.test(n)).sort();
}

/** Sorted [relative path, sha256] of every file under a folder: two snapshots are equal when nothing changed. */
export function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push([relative(root, full).split(sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex')]);
    }
  };
  walk(root);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** The paths whose content differs, appears or disappears between two snapshots. */
export function changedPaths(before, after) {
  const a = new Map(before);
  const b = new Map(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p)).sort();
}

export const abs = (root, rel) => join(root, ...rel.split('/'));
export const read = (root, rel) => readFileSync(abs(root, rel), 'utf8');
export const exists = (root, rel) => existsSync(abs(root, rel));
export const readJsonIn = (root, rel) => JSON.parse(read(root, rel).replace(/^﻿/, ''));

export function write(root, rel, text) {
  const file = abs(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
