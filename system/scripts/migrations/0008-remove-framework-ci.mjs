#!/usr/bin/env node
// ab-migration: Deletes the Alterbrain check workflow from your copy if you never changed it, because it only tests Alterbrain's own code and can use your GitHub Actions minutes on every save.
//
// Releases 0.1.0 to 0.2.2 put .github/workflows/ci.yml in every copy. It runs the framework's test suite on GitHub, and an
// update can never replace it (an update never writes under .github/, ADR 0031), so copies from before 0.2.1 kept a version
// that starts a long run on every automatic save. This deletes the file, and the empty .github folders, only when its content
// (line endings aside) is a version Alterbrain released. A file you changed is left alone and you get one task that explains
// how to delete or keep it. It does nothing in the framework's own repository (developer mode, or an origin that is the
// repository named in system/release.json). The hashes below are fixed on purpose: this script never changes once released.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigration, removeFile, removeDirIfEmpty } from '../../lib/migrate.mjs';
import { addTask, formatTask, TASKS_FILE } from '../../lib/tasks.mjs';
import { isDevMode } from '../../lib/paths.mjs';

// sha256 of each released version of .github/workflows/ci.yml, with line endings as LF (git history, v0.1.0 to v0.2.2).
const RELEASED = new Set([
  '7548625581830e8398fe0fbbc21fe58df2359b8c6d1d4acfc5c46164094b7a02', // v0.1.0 to v0.2.0
  '696d84d2f777cabdb130134c062955f7e56ed2752b69629e333b25cc566f5f35', // v0.2.1
  'f2ac2f2c45d2ae3cc04b56c73935531b2b8f84aa89edc0aa2388fd7d6d931c5f', // v0.2.2
]);

const sha256Lf = (buf) => createHash('sha256').update(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex');

/** "owner/name" (lower case) from a GitHub address in https, ssh or scp form, or null. */
function slugOf(url) {
  const u = String(url || '').trim();
  const m = u.match(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?[^/:]+(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
    || u.match(/^(?:[^@/]+@)?[^:/]+:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** True when this folder is a copy whose origin is the framework's own repository (read-only). */
function isFrameworkOrigin(root) {
  if (!existsSync(join(root, '.git'))) return false; // never read the origin of a repository above this folder
  let repo = '';
  try {
    repo = String(JSON.parse(readFileSync(join(root, 'system', 'release.json'), 'utf8').replace(/^﻿/, '')).repo || '').toLowerCase();
  } catch {
    return false;
  }
  if (!repo) return false;
  const res = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', timeout: 15_000, windowsHide: true });
  if (res.error || res.status !== 0) return false;
  return slugOf(res.stdout) === repo;
}

await runMigration(async ({ root, dryRun, report }) => {
  if (isDevMode() || isFrameworkOrigin(root)) return; // the framework's own folder keeps its workflow

  const file = join(root, '.github', 'workflows', 'ci.yml');
  let st = null;
  try {
    st = lstatSync(file);
  } catch {
    return; // no workflow: nothing to do
  }

  let released = false;
  if (st.isFile()) {
    try {
      released = RELEASED.has(sha256Lf(readFileSync(file)));
    } catch {
      released = false; // a file that cannot be read is treated as the person's own: said out loud, never deleted
    }
  }

  if (released) {
    removeFile(file);
    removeDirIfEmpty(join(root, '.github', 'workflows'));
    removeDirIfEmpty(join(root, '.github'));
    report("Deleted the Alterbrain check workflow (.github/workflows/ci.yml) from your copy. It only tests Alterbrain's own code and could use your GitHub Actions minutes on every save.");
    return;
  }

  const task = {
    text: 'Your copy has its own check workflow (.github/workflows/ci.yml) that is not one of Alterbrain\'s. GitHub may run it on every save and use your free Actions minutes. If you do not need it, delete the file yourself (in File Explorer or Finder, or on github.com); Claude cannot delete it for you. If you wrote it on purpose, keep it.',
    tag: 'update-alterbrain',
    priority: 'medium',
  };
  const line = formatTask(task);
  const tasks = existsSync(TASKS_FILE()) ? readFileSync(TASKS_FILE(), 'utf8') : '';
  if (tasks.includes(line) || tasks.includes(line.replace('- [ ]', '- [x]'))) return; // already told, once
  if (!dryRun) addTask(task);
  report('Left .github/workflows/ci.yml alone because it is not an Alterbrain version (you may have changed it), and added a task that explains how to delete or keep it.');
});
