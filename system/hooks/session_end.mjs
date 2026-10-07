#!/usr/bin/env node
// SessionEnd, and Stop with --stop: save the work with git-auto (commit, then push).
//
//   node system/hooks/session_end.mjs          SessionEnd: always tries
//   node system/hooks/session_end.mjs --stop   Stop: at most once every 10 minutes
//
// Does nothing in dev mode, when config/brain.json says git.auto_commit is false, or when
// system/scripts/git-auto.mjs does not exist. git-auto logs its own failures and adds the
// "#ab/git" task; this hook only adds a line and a task when git-auto itself could not run
// (crash, timeout). Never throws, never prints, always exits 0.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isMainModule, readInput, runHook } from '../lib/hookio.mjs';
import { isDevMode, projectRoot, rootPath } from '../lib/paths.mjs';
import { appendLine, readJson, writeText } from '../lib/fsx.mjs';
import { addTask } from '../lib/tasks.mjs';
import { run } from '../lib/proc.mjs';

export const THROTTLE_MS = 10 * 60 * 1000;
const COMMIT_TIMEOUT_MS = 12_000;
const PUSH_TIMEOUT_MS = 15_000; // 12 + 15 stays inside the 30 s SessionEnd timeout

const STAMP_FILE = () => rootPath('state', 'local', 'last-auto-commit');
const LOG_FILE = () => rootPath('state', 'local', 'git.log');

/** Epoch ms of the last attempt, or null. Reads the stamp file, then falls back to its mtime. */
function lastAttempt() {
  const file = STAMP_FILE();
  if (!existsSync(file)) return null;
  try {
    const n = Number(readFileSync(file, 'utf8').trim());
    if (Number.isFinite(n) && n > 0) return n;
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** True if the last attempt was under 10 minutes ago. A stamp from the future is ignored. */
export function isThrottled(now = Date.now()) {
  const t = lastAttempt();
  if (t == null) return false;
  if (t > now + 60_000) return false;
  return now - t < THROTTLE_MS;
}

function reportCrash(step, res) {
  const detail = String(res.stderr || res.stdout || '').split('\n')[0].replace(/\s+/g, ' ').slice(0, 300);
  try {
    appendLine(LOG_FILE(), `${new Date().toISOString()} ${step} hook-error code=${res.code} ${detail}`);
  } catch {
    /* logging must never break the hook */
  }
  try {
    addTask({
      text: 'Alterbrain could not save or back up your work. Open Claude and ask it to check your backup.',
      tag: 'git',
      priority: 'medium',
    });
  } catch {
    /* a task is a nice-to-have */
  }
}

/** One git-auto step. Exit 0 = fine. Exit 1 = git-auto already told the user. Anything else = crash. */
function step(script, name, timeout) {
  const res = run(process.execPath, [script, name], { cwd: projectRoot(), timeout, env: { CLAUDE_PROJECT_DIR: projectRoot() } });
  if (res.code !== 0 && res.code !== 1) reportCrash(name, res);
  return res;
}

async function main() {
  const input = await readInput(1500); // only used to spot a Stop event; bad input is not a reason to skip saving
  const isStop = process.argv.includes('--stop') || (input && input.hook_event_name === 'Stop');

  if (isDevMode()) return;
  const brain = readJson(rootPath('config', 'brain.json'), null);
  if (brain && brain.git && brain.git.auto_commit === false) return;
  const script = rootPath('system', 'scripts', 'git-auto.mjs');
  if (!existsSync(script)) return;

  if (isStop && isThrottled()) return;
  try {
    writeText(STAMP_FILE(), String(Date.now()));
  } catch {
    /* no stamp means no throttle, which is fine */
  }

  const commit = step(script, 'commit', COMMIT_TIMEOUT_MS);
  if (commit.code === -1) return; // timed out or could not start: pushing now would just hang again
  step(script, 'push', PUSH_TIMEOUT_MS);
}

if (isMainModule(import.meta.url)) await runHook(main);
