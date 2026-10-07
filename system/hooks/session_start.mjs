#!/usr/bin/env node
// SessionStart: sync from git (5 s budget), then hand Claude a short digest as extra context.
//
// The digest (at most 25 lines) holds the date and weekday, onboarding status, task / outbox /
// proposal counts and warnings (model, Claude Code version, git, dev mode). It never throws:
// a part that fails is simply left out. Fails open on malformed input (no output).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { context, isMainModule, readInput, runHook } from '../lib/hookio.mjs';
import { isDevMode, projectRoot, rootPath, vaultPath } from '../lib/paths.mjs';
import { readJson, today } from '../lib/fsx.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { listTasks } from '../lib/tasks.mjs';
import { cmpVersion, run } from '../lib/proc.mjs';

const MAX_LINES = 25;
const PULL_TIMEOUT_MS = 5000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Run a step; on any error give back the fallback. */
function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** "Today is Wednesday 2026-10-07, 14:32 (Europe/Amsterdam)." from the system clock. */
export function describeNow(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const tz = safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, '') || 'local time';
  return `Today is ${WEEKDAYS[d.getDay()]} ${today(d)}, ${p(d.getHours())}:${p(d.getMinutes())} (${tz}). Use this date; never guess dates.`;
}

/** True while onboarding is not started or still in progress (state/onboarding.json). */
export function onboardingUnfinished(state) {
  if (!state || typeof state !== 'object') return true;
  const status = typeof state.status === 'string' ? state.status.toLowerCase() : '';
  return status === '' || status === 'not_started' || status === 'in_progress';
}

/** Pull from git through git-auto. Returns a warning string, or null when all is well or skipped. */
function syncWarning(source) {
  if (isDevMode() || source === 'compact') return null;
  const script = rootPath('system', 'scripts', 'git-auto.mjs');
  if (!existsSync(script)) return null;
  const brain = readJson(rootPath('config', 'brain.json'), null);
  if (brain && brain.git && brain.git.auto_commit === false) return null;
  const res = run(process.execPath, [script, 'pull', '--json'], {
    timeout: PULL_TIMEOUT_MS,
    cwd: projectRoot(),
    env: { CLAUDE_PROJECT_DIR: projectRoot() },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout.split('\n').filter(Boolean).pop() || '');
  } catch {
    /* not JSON: judge by the exit code */
  }
  if (parsed && parsed.status === 'failed') {
    return `Online sync problem: ${parsed.message || 'could not update from your backup.'}`;
  }
  if (!res.ok && !parsed) {
    const timedOut = /ETIMEDOUT|timed out/i.test(res.stderr);
    return timedOut
      ? 'Online sync took too long, so Alterbrain skipped it and is using your local copy.'
      : 'Online sync did not finish, so Alterbrain is using your local copy.';
  }
  return null;
}

/**
 * .mcp.json holds this computer's folder paths and is not saved to git, so a vault that moved to another computer
 * (or another folder) has to rebuild it. mcp-gen only writes when the content changed. Silent; never blocks.
 */
function refreshMcpConfig() {
  const script = rootPath('system', 'scripts', 'mcp-gen.mjs');
  if (!existsSync(script) || !existsSync(rootPath('config', 'mcp.selected.json'))) return;
  run(process.execPath, [script, '--json'], { timeout: 3000, cwd: projectRoot(), env: { CLAUDE_PROJECT_DIR: projectRoot() } });
}

/** Count notes in a folder whose frontmatter status equals `status`. */
function countByStatus(dir, status) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')).slice(0, 300);
  for (const f of files) {
    try {
      const head = readFileSync(join(dir, f), 'utf8').slice(0, 2000);
      if (String(splitFrontmatter(head).data.status || '').toLowerCase() === status) n++;
    } catch {
      /* unreadable note: skip */
    }
  }
  return n;
}

function taskSummary(todayStr) {
  const open = listTasks();
  const overdue = open.filter((t) => t.due && t.due < todayStr);
  const dueToday = open.filter((t) => t.due === todayStr);
  const agent = open.filter((t) => /#ab\//.test(t.line));
  const clean = (line) => line.replace(/^- \[ \]\s*/, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110);
  const items = [
    ...overdue.slice(0, 2).map((t) => `  - (overdue) ${clean(t.line)}`),
    ...dueToday.slice(0, 2).map((t) => `  - (today) ${clean(t.line)}`),
  ].slice(0, 3);
  const line = `Tasks: ${overdue.length} overdue, ${dueToday.length} due today, ${agent.length} agent task${agent.length === 1 ? '' : 's'} open.`;
  return [line, ...items];
}

function modelName(input) {
  const m = input && input.model;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object') return String(m.id || m.name || m.display_name || '');
  return '';
}

/** Build the digest text. `input` is the SessionStart payload. */
export function buildDigest(input = {}) {
  const now = new Date();
  const todayStr = today(now);
  const lines = ['Alterbrain digest (from the SessionStart hook)', describeNow(now)];

  const devMode = safe(isDevMode, false);
  const sync = safe(() => syncWarning(input && input.source), null);
  safe(refreshMcpConfig, null);

  const onboarding = safe(() => readJson(rootPath('state', 'onboarding.json'), null), null);
  if (onboardingUnfinished(onboarding)) {
    lines.push("Onboarding not finished: after handling the user's request, offer /onboard.");
  }

  lines.push(...safe(() => taskSummary(todayStr), []));

  const drafts = safe(() => countByStatus(vaultPath('00_inbox', 'outbox'), 'draft'), 0);
  if (drafts) lines.push(`Outbox: ${drafts} draft${drafts === 1 ? '' : 's'} waiting for the user to review.`);
  const proposals = safe(() => countByStatus(vaultPath('00_inbox', 'proposals'), 'open'), 0);
  if (proposals) lines.push(`Proposals: ${proposals} open, waiting for approval.`);

  const warnings = [];
  const model = modelName(input);
  if (model && !/sonnet/i.test(model)) {
    warnings.push(`Main model is ${model}; Alterbrain recommends Sonnet to save your usage — /model sonnet`);
  }
  const version = process.env.CLAUDE_CODE_VERSION || (input && (input.claude_code_version || input.version)) || '';
  const min = safe(() => readJson(rootPath('system', 'release.json'), {}).min_claude_code, '');
  if (version && min && cmpVersion(version, min) < 0) {
    warnings.push(`Claude Code is version ${version}, but Alterbrain needs ${min} or newer. Update the Claude app.`);
  }
  if (sync) warnings.push(sync);
  if (devMode) warnings.push('Developer mode is on: framework files can be edited and automatic saving to git is off.');
  if (warnings.length) lines.push('Warnings:', ...warnings.map((w) => `- ${w}`));

  return lines.slice(0, MAX_LINES).join('\n');
}

async function main() {
  const input = await readInput();
  if (!input) return; // malformed: fail open
  const digest = safe(() => buildDigest(input), '');
  if (digest) context(digest, 'SessionStart');
}

if (isMainModule(import.meta.url)) await runHook(main);
