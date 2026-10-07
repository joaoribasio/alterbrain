#!/usr/bin/env node
// SessionEnd, and Stop with --stop: save the work with git-auto (commit, then push).
//
//   node system/hooks/session_end.mjs          SessionEnd: always tries
//   node system/hooks/session_end.mjs --stop   Stop: at most once every 10 minutes
//
// When encryption of private notes is on (ADR 0019), the safeguards live in git-auto, not here: a copy that cannot
// encrypt stages no private notes, plain private notes are left out of the save, and a push that would upload one is
// refused (that check fails closed). git-auto exits 1 for these, which this hook treats like any reported failure.
//
// Big files (ADR 0020) are stored with Git LFS by git-auto. Uploading one can need far more time than a hook may wait, and
// Git LFS cannot resume a stopped upload. So the push step asks git-auto (ALTERBRAIN_PUSH_BACKGROUND=1) to start a big
// upload as a separate process that carries on after this hook has finished. A push that still runs out of time here is
// not a crash: it is logged (not turned into a task), then handed to the same kind of background process
// (ALTERBRAIN_PUSH_BACKGROUND=now), so that it can finish instead of being stopped half way every time. A commit that
// runs out of time is still reported, because nothing was saved. Nothing on disk is touched by any of this.
//
// Does nothing in dev mode, when config/brain.json says git.auto_commit is false, or when
// system/scripts/git-auto.mjs does not exist. git-auto logs its own failures and adds the
// "#ab/git" task; this hook only adds a line and a task when git-auto itself could not run
// (a crash, or a commit that timed out). Never throws, never prints, always exits 0.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isMainModule, readInput, runHook } from '../lib/hookio.mjs';
import { isDevMode, projectRoot, rootPath } from '../lib/paths.mjs';
import { appendLine, readJson, writeText } from '../lib/fsx.mjs';
import { addTask } from '../lib/tasks.mjs';
import { run } from '../lib/proc.mjs';

export const THROTTLE_MS = 10 * 60 * 1000;
// The limits can be changed with ALTERBRAIN_HOOK_COMMIT_TIMEOUT_MS and ALTERBRAIN_HOOK_PUSH_TIMEOUT_MS (the tests use this).
const envMs = (name, fallback) => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const COMMIT_TIMEOUT_MS = envMs('ALTERBRAIN_HOOK_COMMIT_TIMEOUT_MS', 12_000);
const PUSH_TIMEOUT_MS = envMs('ALTERBRAIN_HOOK_PUSH_TIMEOUT_MS', 13_000);
const HANDOFF_TIMEOUT_MS = 4_000; // 12 + 13 + 4 stays inside the 30 s SessionEnd timeout

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

/**
 * Did the step run out of time? proc.run reports a process that was stopped as code -1, with node's ETIMEDOUT message when
 * it had printed nothing itself; the time it took is the second witness. A process that could not start fails at once.
 */
const ranOutOfTime = (res, timeout, tookMs) => res.code === -1 && (/ETIMEDOUT/i.test(String(res.stderr || '')) || tookMs >= timeout * 0.9);

function logLine(text) {
  try {
    appendLine(LOG_FILE(), `${new Date().toISOString()} ${text}`);
  } catch {
    /* logging must never break the hook */
  }
}

/**
 * One git-auto step. Exit 0 = fine. Exit 1 = git-auto already told the user. Anything else = crash.
 * With patientOnTimeout, running out of time is logged and returned as `timedOut` instead of being reported as a crash.
 */
function step(script, args, timeout, { patientOnTimeout = false, env = {} } = {}) {
  const started = Date.now();
  const res = run(process.execPath, [script, ...args], { cwd: projectRoot(), timeout, env: { CLAUDE_PROJECT_DIR: projectRoot(), ...env } });
  if (patientOnTimeout && ranOutOfTime(res, timeout, Date.now() - started)) {
    logLine(`${args[0]} hook-timeout the step needed more than ${Math.round(timeout / 1000)} s; it is tried again, and a push carries on in the background`);
    return { ...res, timedOut: true };
  }
  if (res.code !== 0 && res.code !== 1) reportCrash(args[0], res);
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

  const commit = step(script, ['commit'], COMMIT_TIMEOUT_MS);
  if (commit.code === -1) return; // timed out or could not start: pushing now would just hang again
  const push = step(script, ['push'], PUSH_TIMEOUT_MS, { patientOnTimeout: true, env: { ALTERBRAIN_PUSH_BACKGROUND: '1' } });
  if (push.timedOut) step(script, ['push'], HANDOFF_TIMEOUT_MS, { patientOnTimeout: true, env: { ALTERBRAIN_PUSH_BACKGROUND: 'now' } });
}

if (isMainModule(import.meta.url)) await runHook(main);
