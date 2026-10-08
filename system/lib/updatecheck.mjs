// Weekly update check (run at session start). It only tells the person; it never applies anything.
//
//   checkForUpdate({ root, now, current, fetchLatest, timeoutMs }) -> { line: string | null }
//
// At most once every 7 days it asks GitHub for the latest public release of the repo named in system/release.json
// (unauthenticated, short timeout), compares it with the installed tag and, when it is newer, returns one digest line.
// State lives in state/local/update-check.json ({ schema: 1, checked: "YYYY-MM-DD", latest: "vX.Y.Z" | null }), which is
// local and never committed. A missing or unreadable file means "check now". Offline, a timeout or any other failure
// returns no line and writes nothing, so the next session tries again.
//
// Switches: ALTERBRAIN_UPDATE_CHECK=off turns it off; ALTERBRAIN_UPDATE_CHECK_URL replaces the URL (tests only).
// Skipped in developer mode and on a compact (the conversation is already running).
import { join } from 'node:path';
import { readJson, today, writeJson } from './fsx.mjs';
import { cmpVersion } from './proc.mjs';

export const CHECK_EVERY_DAYS = 7;
export const DEFAULT_TIMEOUT_MS = 1500;
const TAG_RE = /^v?\d+\.\d+\.\d+$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

const stateFile = (root) => join(root, 'state', 'local', 'update-check.json');

/** Whole days from the saved date to `now`; NaN when the saved value is not a usable date. */
function daysSince(checked, now) {
  if (typeof checked !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(checked)) return NaN;
  const [y, m, d] = checked.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const here = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((here - then) / 86_400_000);
}

/** The real fetcher: the tag of the latest public release, or a thrown error. */
export async function defaultFetchLatest({ repo, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = process.env.ALTERBRAIN_UPDATE_CHECK_URL || `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'alterbrain-update', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body && typeof body.tag_name === 'string' ? body.tag_name : null;
}

/** Wait for the fetcher, but never longer than the timeout (a stub that hangs must not hang the session). */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {object} o
 * @param {string} o.root           project folder
 * @param {Date}   [o.now]
 * @param {string} [o.current]      installed tag; read from system/release.json when not given
 * @param {Function} [o.fetchLatest] async ({ repo, timeoutMs }) -> tag string; replaced in tests
 * @param {number} [o.timeoutMs]
 * @param {boolean} [o.devMode]     skip in developer mode
 * @param {string} [o.source]       the SessionStart source; 'compact' is skipped
 */
export async function checkForUpdate({ root, now = new Date(), current, fetchLatest = defaultFetchLatest, timeoutMs = DEFAULT_TIMEOUT_MS, devMode = false, source = '' } = {}) {
  const none = { line: null };
  try {
    if (!root || devMode || source === 'compact') return none;
    if (String(process.env.ALTERBRAIN_UPDATE_CHECK || '').toLowerCase() === 'off') return none;

    const release = readJson(join(root, 'system', 'release.json'), {}) || {};
    const installed = current || release.tag || release.version;
    const repo = release.repo;
    if (!installed || typeof repo !== 'string' || !REPO_RE.test(repo)) return none;

    const saved = readJson(stateFile(root), null);
    const age = saved && typeof saved === 'object' ? daysSince(saved.checked, now) : NaN;
    if (Number.isFinite(age) && age >= 0 && age < CHECK_EVERY_DAYS) return none;

    const latest = await withTimeout(Promise.resolve(fetchLatest({ repo, timeoutMs })), timeoutMs);
    if (typeof latest !== 'string' || !TAG_RE.test(latest.trim())) return none;
    const tag = latest.trim();

    try {
      writeJson(stateFile(root), { schema: 1, checked: today(now), latest: tag });
    } catch {
      /* the line is still worth showing */
    }
    if (cmpVersion(tag, installed) > 0) {
      return { line: `Alterbrain ${tag} is available. Say 'update Alterbrain' when you're not mid-assignment.` };
    }
    return none;
  } catch {
    return none; // offline, slow or anything else: silent, and the next session tries again
  }
}
