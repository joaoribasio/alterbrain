#!/usr/bin/env node
// update: bring framework files up to a newer release, safely.
//   node system/scripts/update.mjs check
//   node system/scripts/update.mjs plan <tag>
//   node system/scripts/update.mjs apply-safe <tag>
//   node system/scripts/update.mjs finish <tag>
//   node system/scripts/update.mjs guided list [--all] | done <id> | skip <id>
// Options: --json  --source-dir <folder>  --base-dir <folder>  --repo <owner/name>
//          --no-commit  --no-doctor
//
// How it works (the update model):
//   code file ............ replaced as it is, after its sha256 is checked
//   text file, not edited  replaced
//   text file, edited .... NEVER touched here: listed as "propose-merge" for the
//                          /update-alterbrain skill to merge with the user
//   new file ............. added
//   removed upstream ..... moved to state/archive/<tag>/ (edited text files are only listed)
// Files never leave the machine and nothing outside the release manifest is touched.
//
// Trust model (read this before changing it):
//   - The files and their sha256 values come from the same release, so the checksums only catch damage in
//     transit. If system/release.json carries a "signing_public_key" (Ed25519, base64), the release manifest must
//     be signed (system/manifest.sig, over the exact manifest bytes) and plan refuses an unsigned or wrongly
//     signed release. Without a key the plan says the release is unsigned.
//   - --source-dir and --repo (another folder or another GitHub repo) are refused unless the person sets
//     ALTERBRAIN_ALLOW_CUSTOM_SOURCE=1 in their own terminal: an instruction inside a note must not be able to
//     point the updater at a folder it prepared. Plain --repo <the repo in release.json> is fine.
//   - Guided upgrades (system/scripts/migrations/NNNN-*.md) are instructions for the person's own Claude, never run here.
//     finish lists the ones still open and adds one task; `guided done|skip` records the outcome in state/migrations.json
//     (entries: { id, at, tag, kind: "guided", outcome }). An entry without "kind" is a script, one without "outcome" is done.
//   - Only migrations that are listed in the verified manifest, with a matching sha256, are ever run. One that is on
//     disk but not listed is reported as skipped, and that makes the finish result "not ok".
//   - Migrations change the person's notes and settings, so they run only with a restore point: the git tag
//     pre-update-<tag> that apply-safe makes. apply-safe refuses (before it changes anything) when the plan has upgrades
//     and no restore point can be made, and finish checks again. An install that came with the upgrade scripts (they are
//     in its own manifest, and it has no record yet) is already in the new shape: they are recorded as done, never run.
//   - Downloads are capped (default 20 MB per file, ALTERBRAIN_MAX_DOWNLOAD_BYTES to change).
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, copyFileSync, unlinkSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, extname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { projectRoot, rootPath, isMainModule, isDevMode } from '../lib/paths.mjs';
import { readJson, writeJson, today } from '../lib/fsx.mjs';
import { has, run, cmpVersion } from '../lib/proc.mjs';
import { gitInstalled, isRepo, createTag, tagExists, changedCount } from '../lib/git.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { addTask, listTasks } from '../lib/tasks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_REL = 'system/manifest.json';
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TEXT_EXT = new Set([
  '.md', '.mjs', '.js', '.json', '.jsonl', '.yml', '.yaml', '.txt', '.ps1', '.sh', '.qmd',
  '.css', '.html', '.csv', '.base', '.canvas', '.toml',
]);

// ---------------------------------------------------------------------------
// Manifest helpers (also used by doctor.mjs)
// ---------------------------------------------------------------------------

/**
 * Read a manifest in either shape:
 *   { files: { "<path>": { class, sha256 } } }   or   { files: [ { path, class, sha256 } ] }
 * Returns { version, tag, files: Map(path -> { class, sha256 }) }.
 */
export function normaliseManifest(m) {
  const files = new Map();
  const raw = m && m.files;
  const add = (path, e) => {
    if (typeof path !== 'string' || !e) return;
    const sha = String(e.sha256 || e.sha || '').toLowerCase();
    files.set(path, { class: e.class === 'code' ? 'code' : 'text', sha256: sha });
  };
  if (Array.isArray(raw)) for (const e of raw) add(e && e.path, e);
  else if (raw && typeof raw === 'object') for (const [p, e] of Object.entries(raw)) add(p, e);
  return { version: m && m.version, tag: m && m.tag, files };
}

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * True for a project-relative path a release is allowed to write. Case-insensitive on purpose (Windows and macOS
 * volumes ignore case), and strict about every Windows spelling of a name: no ":" (drive letters, NTFS streams
 * such as file::$DATA), no trailing dot or space, no 8.3 short names (GIT~1), no device names (CON, NUL, COM1).
 */
export function isSafeFrameworkPath(p) {
  if (typeof p !== 'string' || !p || p.length > 300) return false;
  if (/[\0-\x1f\\:*?"<>|]/.test(p) || p.startsWith('/')) return false;
  const parts = p.split('/');
  if (parts.some((x) => x === '' || x === '.' || x === '..')) return false;
  const low = p.toLowerCase();
  const lparts = low.split('/');
  if (lparts.some((x) => /[. ]$/.test(x) || /~\d/.test(x) || WINDOWS_RESERVED.test(x.split('.')[0]))) return false;
  if (/^(vault|config|state)(\/|$)/.test(low)) return false; // the user's own folders
  if (lparts[0] === '.git' || lparts[0] === '.github' || lparts.some((x) => x === '.git' || x === '.gitmodules' || x === '.gitconfig')) return false;
  if (lparts.some((x) => x.startsWith('.env') && x !== '.env.example')) return false;
  if (low === '.mcp.json' || low === '.claude/settings.local.json' || low === MANIFEST_REL) return false;
  if (/^\.claude\/(skills|agents)\/my-/.test(low)) return false; // self-built, owned by the user
  return true;
}

/** Framework files that exist in the repo but are not delivered to a person's own copy (their CI settings). */
export function isExcludedFromUpdates(p) {
  return typeof p === 'string' && /^\.github\//i.test(p);
}

/** True when writing to this project-relative path stays inside the project (no symlink or junction leads out). */
export function staysInsideProject(relPath) {
  try {
    const root = realpathSync.native(projectRoot());
    let probe = rootPath(...relPath.split('/'));
    const tail = [];
    while (!existsSync(probe)) {
      const up = dirname(probe);
      if (up === probe) return false;
      tail.unshift(probe.slice(up.length).replace(/^[\\/]+/, ''));
      probe = up;
    }
    const real = join(realpathSync.native(probe), ...tail);
    const rel = relative(root, real);
    return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
  } catch {
    return false;
  }
}

/** A GitHub "owner/name": letters, digits, dot, dash, underscore, and no segment made only of dots. */
export function isValidRepo(repo) {
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo) && !repo.split('/').some((x) => /^\.+$/.test(x));
}

/** The person has said, in their own terminal, that a custom release source is fine. */
export function customSourceAllowed() {
  return process.env.ALTERBRAIN_ALLOW_CUSTOM_SOURCE === '1';
}

/** Largest file the updater downloads or reads from a release folder. */
export function maxDownloadBytes() {
  const n = Number(process.env.ALTERBRAIN_MAX_DOWNLOAD_BYTES);
  return Number.isFinite(n) && n > 0 ? n : 20 * 1024 * 1024;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Does this content match the expected sha? Text files also match with LF line endings. */
export function contentMatchesSha(buf, relPath, expected) {
  if (!expected) return false;
  const want = expected.toLowerCase();
  if (sha256(buf) === want) return true;
  if (TEXT_EXT.has(extname(relPath).toLowerCase())) {
    const lf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    return sha256(lf) === want;
  }
  return false;
}

export function fileMatchesSha(absPath, relPath, expected) {
  try {
    return contentMatchesSha(readFileSync(absPath), relPath, expected);
  } catch {
    return false;
  }
}

/**
 * The decision for one manifest entry. Pure.
 * state = { exists, eqNew, eqOld }  (eqOld is null when there is no old sha)
 */
export function decide(cls, oldSha, newSha, state) {
  if (!state.exists) {
    if (oldSha && oldSha === newSha && cls === 'text') {
      return { action: 'unchanged', reason: 'You removed this file and it has not changed upstream, so it stays removed.' };
    }
    return { action: 'add', reason: oldSha ? 'Missing here, so it is put back.' : 'New in this release.' };
  }
  if (state.eqNew) return { action: 'unchanged', reason: 'Already up to date.' };
  if (cls === 'code') return { action: 'replace', reason: 'Code file: replaced exactly as released.' };
  if (oldSha && state.eqOld) return { action: 'replace', reason: 'You have not edited it, so it is replaced.' };
  if (oldSha && oldSha === newSha) return { action: 'unchanged', reason: 'Your edited version stays: the release did not change this file.' };
  return { action: 'propose-merge', reason: 'You edited this file and the release changed it too: needs a merge.' };
}

// ---------------------------------------------------------------------------
// Release sources: a local folder, or GitHub
// ---------------------------------------------------------------------------

function ghRaw(repo, path, ref) {
  const res = spawnSync('gh', ['api', `repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, '-H', 'Accept: application/vnd.github.raw'], {
    maxBuffer: maxDownloadBytes() + 1024, windowsHide: true, timeout: 120_000,
  });
  if (res.status === 0) return { buf: res.stdout };
  const err = String(res.stderr || res.error || '');
  if (/ENOBUFS|maxBuffer/i.test(err)) return { error: 'the file is larger than the allowed download size' };
  if (/404|not found/i.test(err)) return { notFound: true };
  return { error: err.trim() || 'gh failed' };
}

async function httpRaw(repo, path, ref) {
  const url = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxDownloadBytes()) return { error: 'the file is larger than the allowed download size' };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxDownloadBytes()) return { error: 'the file is larger than the allowed download size' };
  return { buf };
}

/** A source gives `read(path)` -> Buffer, or null when the file is not in that release. */
export function makeSource({ sourceDir, repo, tag }) {
  if (sourceDir) {
    const base = resolve(sourceDir);
    return {
      label: `folder ${base}`,
      async read(path) {
        const file = join(base, ...path.split('/'));
        if (!existsSync(file)) return null;
        if (statSync(file).size > maxDownloadBytes()) throw new Error(`Could not read ${path}: the file is larger than the allowed size`);
        return readFileSync(file);
      },
    };
  }
  const useGh = has('gh');
  return {
    label: `GitHub ${repo} @ ${tag}`,
    async read(path) {
      let last = 'could not reach GitHub';
      if (useGh) {
        const r = ghRaw(repo, path, tag);
        if (r.buf) return r.buf;
        if (r.notFound) return null;
        last = r.error;
      }
      try {
        const r = await httpRaw(repo, path, tag);
        if (r.buf) return r.buf;
        if (r.notFound) return null;
        last = r.error;
      } catch (e) {
        last = String(e.message || e);
      }
      throw new Error(`Could not download ${path}: ${last}`);
    },
  };
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

async function latestTag(repo, sourceDir) {
  if (sourceDir) {
    const rel = readJson(join(resolve(sourceDir), 'system', 'release.json'), null);
    return rel ? rel.tag || `v${rel.version}` : null;
  }
  if (has('gh')) {
    const r = run('gh', ['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name'], { timeout: 30_000 });
    if (r.ok && r.stdout) return r.stdout.trim();
    if (/404|not found/i.test(r.stderr)) return null;
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'alterbrain-update' },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`);
  return (await res.json()).tag_name || null;
}

export async function check(opts) {
  const rel = readJson(rootPath('system', 'release.json'), {}) || {};
  const repo = opts.repo || rel.repo;
  const current = rel.tag || (rel.version ? `v${rel.version}` : null);
  if (!opts.sourceDir && !isValidRepo(repo)) {
    return { ok: false, current, latest: null, repo, update_available: false, message: 'The release repo in system/release.json is not a valid "owner/name".' };
  }
  const latest = await latestTag(repo, opts.sourceDir);
  const available = Boolean(latest && current && cmpVersion(latest, current) > 0);
  return {
    ok: true, current, latest, repo, update_available: available,
    message: !latest ? 'No published releases were found. If Alterbrain is still private for the pilot, ask the maintainer to add you as a collaborator and sign in with: gh auth login. Then try again.' : available ? `A newer version is available: ${latest} (you have ${current}).` : `You are up to date (${current}).`,
  };
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

const stageDir = (tag) => rootPath('state', 'local', 'update', tag);

function readManifestFrom(buf) {
  try {
    return { raw: buf.toString('utf8'), parsed: JSON.parse(buf.toString('utf8')) };
  } catch {
    return null;
  }
}

function writeStaged(dir, sub, relPath, buf) {
  const file = join(dir, sub, ...relPath.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

/** Public key for manifest signatures: base64 of 32 raw Ed25519 bytes, or an SPKI DER key. Returns a KeyObject or null. */
function signingKey(text) {
  try {
    const raw = Buffer.from(String(text).trim(), 'base64');
    const der = raw.length === 32 ? Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]) : raw;
    return createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

/** Does this signature (base64 or hex) match the manifest bytes under the pinned key? */
export function manifestSignatureOk(manifestBuf, sigText, keyText) {
  const key = signingKey(keyText);
  if (!key) return false;
  const t = String(sigText || '').trim();
  const sig = /^[0-9a-f]{128}$/i.test(t) ? Buffer.from(t, 'hex') : Buffer.from(t, 'base64');
  try {
    return cryptoVerify(null, manifestBuf, key, sig);
  } catch {
    return false;
  }
}

const MIGRATION_PATH = /^system\/scripts\/migrations\/[^/]+\.mjs$/;

/** The one-sentence description in a migration script: "// ab-migration: <sentence>" within its first 3 lines. */
export function migrationSummary(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/, 3)) {
      const m = line.match(/^\/\/\s*ab-migration:\s*(\S.*?)\s*$/);
      if (m) return m[1];
    }
  } catch {
    /* fall through */
  }
  return '(no description)';
}

const GUIDED_PATH = /^system\/scripts\/migrations\/\d{4}-[a-z0-9-]+\.md$/;
const GUIDED_ID = /^\d{4}-[a-z0-9-]+\.md$/;

/** The one sentence a guided upgrade shows before it asks: the "summary" key of its front matter. */
export function guidedSummary(file) {
  try {
    const summary = splitFrontmatter(readFileSync(file, 'utf8')).data.summary;
    if (typeof summary === 'string' && summary.trim()) return summary.trim();
  } catch {
    /* fall through */
  }
  return '(no description)';
}

const migrationId = (path) => path.slice(path.lastIndexOf('/') + 1);

/** state/migrations.json: { schema: 1, applied: [{ id, at, tag, baseline? }] }. A missing or unreadable file is an empty record. */
function readMigrationRecord() {
  const record = readJson(rootPath('state', 'migrations.json'), null);
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { schema: 1, applied: [] };
  return { ...record, schema: 1, applied: Array.isArray(record.applied) ? record.applied.filter((a) => a && typeof a.id === 'string') : [] };
}

/**
 * The upgrade scripts this copy already has built in. A fresh install has no record, because nothing has ever run an
 * upgrade, but its own manifest lists the scripts it came with and its notes and settings already have their shape.
 * Without this, the first update would tell every new person about upgrades to data they never had. An install from
 * 0.1 is not fooled: its manifest lists no upgrade scripts. A script counts only when the file on this computer is
 * exactly the one the manifest lists, so a changed or stray file is never taken for one that came with the install.
 */
function baselineMigrations(record) {
  if (record.applied.length > 0) return [];
  const installed = normaliseManifest(readJson(rootPath('system', 'manifest.json'), {}));
  return [...installed.files]
    .filter(([path, entry]) => (MIGRATION_PATH.test(path) || GUIDED_PATH.test(path)) && fileMatchesSha(rootPath(...path.split('/')), path, entry.sha256))
    .map(([path]) => migrationId(path))
    .sort();
}

/** Record the upgrades a fresh install came with as done (baseline), once, before anything else is written to the record. */
function materialiseBaseline(record) {
  const baseline = baselineMigrations(record);
  if (baseline.length === 0) return baseline;
  const installedTag = normaliseManifest(readJson(rootPath('system', 'manifest.json'), {})).tag || null;
  for (const id of baseline) {
    const at = new Date().toISOString();
    record.applied.push(GUIDED_ID.test(id) ? { id, at, tag: installedTag, kind: 'guided', outcome: 'done', baseline: true } : { id, at, tag: installedTag, baseline: true });
  }
  writeJson(rootPath('state', 'migrations.json'), record);
  return baseline;
}

/**
 * Guided upgrades that still need an answer: listed in `listed` (a manifest's files map), the file read by `fileFor`
 * matches the listed checksum, and the record has no entry for the id (done or skipped) and it is not a baseline.
 * With `all`, recorded ones are included, with their outcome.
 */
function guidedRows(listed, fileFor, record, baseline, { all = false } = {}) {
  const rows = [];
  for (const path of [...listed.keys()].sort()) {
    if (!GUIDED_PATH.test(path)) continue;
    const file = fileFor(path);
    if (!file || !fileMatchesSha(file, path, listed.get(path).sha256)) continue;
    const id = migrationId(path);
    const entry = record.applied.find((a) => a.id === id);
    const status = entry ? (entry.outcome === 'skipped' ? 'skipped' : 'done') : baseline.includes(id) ? 'done' : 'pending';
    if (status === 'pending' || all) rows.push({ id, summary: guidedSummary(file), status, ...(entry ? { at: entry.at || null } : {}) });
  }
  return rows;
}

/** The restore point for this update: the git tag apply-safe makes before it changes anything. */
function hasRestorePoint(tag) {
  const root = projectRoot();
  return gitInstalled() && isRepo(root) && tagExists(root, `pre-update-${tag}`);
}

export async function plan(tag, opts) {
  const rel = readJson(rootPath('system', 'release.json'), {}) || {};
  const repo = opts.repo || rel.repo;
  if (!opts.sourceDir && !isValidRepo(repo)) {
    return { ok: false, tag, errors: [{ path: 'system/release.json', error: 'The release repo is not a valid "owner/name".' }], files: [], summary: {} };
  }
  const dir = stageDir(tag);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const errors = [];
  const files = [];

  const src = makeSource({ sourceDir: opts.sourceDir, repo, tag });
  const manifestBuf = await src.read(MANIFEST_REL);
  const fetched = manifestBuf && readManifestFrom(manifestBuf);
  if (!fetched) {
    return { ok: false, tag, errors: [{ path: MANIFEST_REL, error: `The release ${tag} has no readable ${MANIFEST_REL}.` }], files: [], summary: {} };
  }
  // Authenticity: a signed manifest when the installed release pins a key.
  let signature = 'unsigned';
  if (rel.signing_public_key) {
    let sigBuf = null;
    try {
      sigBuf = await src.read('system/manifest.sig');
    } catch {
      sigBuf = null;
    }
    if (!sigBuf || !manifestSignatureOk(manifestBuf, sigBuf.toString('utf8'), rel.signing_public_key)) {
      return {
        ok: false, tag, files: [], summary: {},
        errors: [{ path: MANIFEST_REL, error: sigBuf ? 'The release manifest signature does not match the pinned key. Nothing was used.' : 'This release is not signed, but your install only accepts signed releases. Nothing was used.' }],
      };
    }
    signature = 'verified';
  }
  const next = normaliseManifest(fetched.parsed);
  const installed = normaliseManifest(readJson(rootPath('system', 'manifest.json'), {}));

  // Base copies (the old release) let the skill do a real 3-way merge.
  const baseSource = opts.baseDir || !opts.sourceDir
    ? makeSource({ sourceDir: opts.baseDir, repo, tag: rel.tag || `v${rel.version}` })
    : null;

  for (const path of [...next.files.keys()].sort()) {
    const entry = next.files.get(path);
    if (path === MANIFEST_REL) continue; // the manifest itself is handled by finish
    if (isExcludedFromUpdates(path)) {
      files.push({ path, class: entry.class, action: 'unchanged', reason: 'Not delivered by updates (it belongs to the framework repo, not to your copy).' });
      continue;
    }
    if (!isSafeFrameworkPath(path)) {
      errors.push({ path, error: 'This path is not allowed in a release (it points at your own folders or outside the project).' });
      files.push({ path, class: entry.class, action: 'rejected', reason: 'unsafe path' });
      continue;
    }
    if (!staysInsideProject(path)) {
      errors.push({ path, error: 'This path leads outside the project through a link, so it was not used.' });
      files.push({ path, class: entry.class, action: 'rejected', reason: 'outside the project' });
      continue;
    }
    const abs = rootPath(...path.split('/'));
    const old = installed.files.get(path);
    const exists = existsSync(abs);
    const state = {
      exists,
      eqNew: exists && fileMatchesSha(abs, path, entry.sha256),
      eqOld: old && exists ? fileMatchesSha(abs, path, old.sha256) : null,
    };
    const verdict = decide(entry.class, old ? old.sha256 : null, entry.sha256, state);
    const item = {
      path, class: entry.class, action: verdict.action, reason: verdict.reason,
      sha_new: entry.sha256, sha_base: old ? old.sha256 : null,
      sha_local: exists ? sha256(readFileSync(abs)) : null,
    };
    if (['replace', 'add', 'propose-merge'].includes(verdict.action)) {
      let buf = null;
      try {
        buf = await src.read(path);
      } catch (e) {
        errors.push({ path, error: String(e.message || e) });
        item.action = 'rejected';
        item.reason = 'download failed';
        files.push(item);
        continue;
      }
      if (!buf) {
        errors.push({ path, error: 'Listed in the release manifest but missing from the release.' });
        item.action = 'rejected';
        item.reason = 'missing from release';
      } else if (!contentMatchesSha(buf, path, entry.sha256)) {
        errors.push({ path, error: 'Checksum mismatch: the downloaded file is not what the manifest promises. It was NOT used.' });
        item.action = 'rejected';
        item.reason = 'sha256 mismatch';
      } else {
        writeStaged(dir, 'new', path, buf);
        if (verdict.action === 'propose-merge' && baseSource && old) {
          try {
            const baseBuf = await baseSource.read(path);
            if (baseBuf && contentMatchesSha(baseBuf, path, old.sha256)) {
              writeStaged(dir, 'base', path, baseBuf);
              item.base_available = true;
            }
          } catch {
            /* a missing base only means a two-way merge */
          }
          item.base_available = Boolean(item.base_available);
        }
      }
    }
    files.push(item);
  }

  // Files the release no longer ships.
  for (const [path, old] of installed.files) {
    if (next.files.has(path) || !isSafeFrameworkPath(path)) continue;
    const abs = rootPath(...path.split('/'));
    if (!existsSync(abs)) continue;
    const edited = old.class === 'text' && !fileMatchesSha(abs, path, old.sha256);
    files.push({
      path, class: old.class, action: 'archive', needs_review: edited,
      reason: edited ? 'Removed upstream, but you edited it: left in place for you to decide.' : 'Removed upstream: moved to state/archive.',
      sha_base: old.sha256, sha_local: sha256(readFileSync(abs)),
    });
  }

  const changelog = await src.read('CHANGELOG.md').catch(() => null);
  if (changelog) writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  writeFileSync(join(dir, 'new-manifest.json'), fetched.raw);

  // Upgrades to the person's notes and settings that finish will run, so the plan can say so before they agree.
  const record = readMigrationRecord();
  const baseline = baselineMigrations(record);
  const done = new Set([...record.applied.map((a) => a.id), ...baseline]);
  const pending = [];
  for (const path of [...next.files.keys()].sort()) {
    if (!MIGRATION_PATH.test(path)) continue;
    const id = migrationId(path);
    if (done.has(id) || files.some((f) => f.path === path && f.action === 'rejected')) continue;
    const staged = join(dir, 'new', ...path.split('/'));
    pending.push({ id, summary: migrationSummary(existsSync(staged) ? staged : rootPath(...path.split('/'))) });
  }

  const guided = guidedRows(
    next.files,
    (path) => {
      const staged = join(dir, 'new', ...path.split('/'));
      return files.some((f) => f.path === path && f.action === 'rejected') ? null : existsSync(staged) ? staged : rootPath(...path.split('/'));
    },
    record, baseline,
  ).map(({ id, summary }) => ({ id, summary }));

  const summary = {};
  for (const f of files) summary[f.action] = (summary[f.action] || 0) + 1;
  const result = {
    schema: 1, ok: errors.length === 0, tag, created: new Date().toISOString(),
    from: { version: rel.version || null, tag: rel.tag || null },
    to: { version: fetched.parsed.version || null, tag: fetched.parsed.tag || tag },
    source: src.label, stage_dir: dir, changelog: Boolean(changelog), signature, summary, errors, files, migrations_pending: pending, migrations_baseline: baseline.filter((id) => id.endsWith('.mjs')), guided_pending: guided,
    code_changes: files.filter((f) => f.class === 'code' && ['replace', 'add'].includes(f.action)).map((f) => ({ path: f.path, action: f.action })),
  };
  writeJson(join(dir, 'plan.json'), result);
  return result;
}

// ---------------------------------------------------------------------------
// apply-safe
// ---------------------------------------------------------------------------

function writeAtomic(abs, buf) {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.ab-tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, abs);
}

function loadPlan(tag) {
  const p = readJson(join(stageDir(tag), 'plan.json'), null);
  return p;
}

function runGitAuto(args) {
  const script = existsSync(rootPath('system', 'scripts', 'git-auto.mjs')) ? rootPath('system', 'scripts', 'git-auto.mjs') : join(HERE, 'git-auto.mjs');
  return spawnSync(process.execPath, [script, ...args], { cwd: projectRoot(), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() }, windowsHide: true, timeout: 120_000 });
}

/**
 * Save everything with the automatic save and say whether that worked. Not working while the folder holds unsaved
 * changes means those changes are not covered by any restore point. A clean folder needs no save: the tag is enough. Only the state before the attempt counts, because a failed save
 * itself adds a task to the notes.
 */
function safetySave() {
  const root = projectRoot();
  const dirtyBefore = changedCount(root) > 0;
  const res = runGitAuto(['commit', '--json']);
  const failed = res.error || res.status !== 0;
  // A skipped save exits 0. Outside developer mode it means automatic saving is switched off, so unsaved changes are not
  // saved and no tag can cover them. In developer mode skipping is expected.
  let status = null;
  try {
    status = JSON.parse(String(res.stdout || '').trim()).status;
  } catch {
    /* an unreadable answer counts as no answer */
  }
  const switchedOff = !failed && dirtyBefore && status === 'skipped' && !isDevMode();
  return { ok: !(failed && dirtyBefore) && !switchedOff, failed: Boolean(failed), dirty: dirtyBefore, switched_off: switchedOff };
}

const SAVE_FAILED_MESSAGE = 'Your latest work could not be saved, so a restore point would not cover it and I changed nothing. Run /health-check, which offers to clear a half-finished rebase or merge, then try again.';
const SAVE_OFF_MESSAGE = 'Automatic saving is switched off in config/brain.json and you have unsaved changes, so a restore point would not cover them and I changed nothing. Save your work yourself, or switch automatic saving on, then try again.';

export function applySafe(tag, opts = {}) {
  const p = loadPlan(tag);
  if (!p) return { ok: false, error: `There is no plan for ${tag}. Run: node system/scripts/update.mjs plan ${tag}` };
  if (!p.ok || (p.errors && p.errors.length)) {
    return { ok: false, error: 'The plan has problems (see errors), so nothing was changed.', errors: p.errors };
  }
  const dir = stageDir(tag);
  const todo = p.files.filter((f) => f.action === 'replace' || f.action === 'add');

  // 1. Verify every staged file again before touching anything.
  const staged = new Map();
  for (const f of todo) {
    const file = join(dir, 'new', ...f.path.split('/'));
    if (!isSafeFrameworkPath(f.path) || !existsSync(file)) return { ok: false, error: `The staged copy of ${f.path} is missing. Run plan again.` };
    if (!staysInsideProject(f.path)) return { ok: false, error: `${f.path} leads outside the project through a link. Nothing was changed.` };
    const buf = readFileSync(file);
    if (!contentMatchesSha(buf, f.path, f.sha_new)) return { ok: false, error: `The staged copy of ${f.path} does not match its checksum. Nothing was changed.` };
    staged.set(f.path, buf);
  }

  // 2. A safety net: save everything, then tag it so any update can be undone. A tag that exists already (apply-safe
  //    run again after a stopped finish) is kept: it marks the state before the first run, which is the one to go back to.
  const notes = [];
  let safetyTag = null;
  if (!gitInstalled()) {
    notes.push('There is no restore point, because Git is not installed on this computer.');
  } else if (!isRepo(projectRoot())) {
    notes.push('There is no restore point, because this folder is not saved with Git.');
  } else {
    if (!opts.noCommit) {
      const sv = safetySave();
      if (!sv.ok) return { ok: false, save_failed: true, tag, safety_tag: null, notes, error: sv.switched_off ? SAVE_OFF_MESSAGE : SAVE_FAILED_MESSAGE };
    }
    const t = createTag(projectRoot(), `pre-update-${tag}`);
    if (t.ok) safetyTag = `pre-update-${tag}`;
    else notes.push(`There is no restore point, because the safety tag could not be created (${t.error || 'unknown reason'}).`);
  }
  // The upgrades listed in the plan rewrite the person's notes and settings. Without a restore point they do not run,
  // and neither does anything else: stop now, while no file has been touched, rather than half-way.
  const writesNotes = (Array.isArray(p.migrations_pending) && p.migrations_pending.length > 0) || (Array.isArray(p.guided_pending) && p.guided_pending.length > 0);
  if (!safetyTag && writesNotes) {
    return {
      ok: false, no_restore_point: true, tag, safety_tag: null, notes, guided_pending: Array.isArray(p.guided_pending) ? p.guided_pending : [],
      error: 'I could not save a restore point, and this update has upgrades to your notes and settings (some of them questions I would ask you later), so I changed nothing. Run /health-check to see what is wrong with Git, then try the update again.',
    };
  }

  // 3. Apply. release.json goes last, so a half-finished run never claims the new version.
  const results = [];
  const ordered = [...todo.filter((f) => f.path !== 'system/release.json'), ...todo.filter((f) => f.path === 'system/release.json')];
  for (const f of ordered) {
    const abs = rootPath(...f.path.split('/'));
    if (f.action === 'replace' && f.class === 'text' && existsSync(abs)) {
      const nowSha = sha256(readFileSync(abs));
      if (nowSha !== f.sha_local) {
        results.push({ path: f.path, status: 'skipped-changed', reason: 'The file changed after the plan was made.' });
        continue;
      }
    }
    try {
      writeAtomic(abs, staged.get(f.path));
      results.push({ path: f.path, status: f.action === 'add' ? 'added' : 'replaced' });
    } catch (e) {
      results.push({ path: f.path, status: 'failed', reason: String(e.message || e) });
    }
  }

  // 4. Archive files removed upstream (moved, never deleted).
  for (const f of p.files.filter((x) => x.action === 'archive')) {
    if (!isSafeFrameworkPath(f.path) || !staysInsideProject(f.path)) continue;
    if (f.needs_review) {
      results.push({ path: f.path, status: 'needs-review', reason: f.reason });
      continue;
    }
    const abs = rootPath(...f.path.split('/'));
    if (!existsSync(abs)) continue;
    try {
      const to = rootPath('state', 'archive', tag, ...f.path.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(abs, to);
      unlinkSync(abs);
      results.push({ path: f.path, status: 'archived', to: `state/archive/${tag}/${f.path}` });
    } catch (e) {
      results.push({ path: f.path, status: 'failed', reason: String(e.message || e) });
    }
  }

  const merges = p.files.filter((f) => f.action === 'propose-merge').map((f) => ({ path: f.path, base_available: Boolean(f.base_available), staged: `state/local/update/${tag}/new/${f.path}` }));
  const failed = results.filter((r) => r.status === 'failed');
  const out = {
    ok: failed.length === 0, tag, safety_tag: safetyTag, notes, results, propose_merge: merges,
    counts: results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
  };
  writeJson(join(dir, 'applied.json'), out);
  return out;
}

// ---------------------------------------------------------------------------
// finish
// ---------------------------------------------------------------------------

export function finish(tag, opts = {}) {
  const dir = stageDir(tag);
  const p = loadPlan(tag);
  const applied = readJson(join(dir, 'applied.json'), null);
  if (!p || !applied) return { ok: false, error: `Run apply-safe ${tag} first.` };
  if (!applied.ok) return { ok: false, error: 'apply-safe reported failures, so the update is not finished. Fix them and run apply-safe again.' };
  const safetyTag = hasRestorePoint(tag) ? `pre-update-${tag}` : null;

  // The staged release manifest is what says which migrations are real (and what their checksums are).
  const stagedManifestText = existsSync(join(dir, 'new-manifest.json')) ? readFileSync(join(dir, 'new-manifest.json'), 'utf8') : null;
  if (!stagedManifestText) return { ok: false, error: 'The release manifest was not staged. Run plan again.' };
  let listed = new Map();
  try {
    listed = normaliseManifest(JSON.parse(stagedManifestText)).files;
  } catch {
    return { ok: false, error: 'The staged release manifest cannot be read. Run plan again.' };
  }

  // 1. Migrations that have not run yet.
  const root = projectRoot();
  const migDir = rootPath('system', 'scripts', 'migrations');
  const doneFile = rootPath('state', 'migrations.json');
  const record = readMigrationRecord();
  const ran = [];
  const skipped = [];
  const notes = {};
  const baseline = baselineMigrations(record).filter((id) => id.endsWith('.mjs'));
  const names = existsSync(migDir) ? readdirSync(migDir).filter((n) => n.endsWith('.mjs')).sort() : [];
  // Work out first what will run. A script that is not in the verified manifest (or does not match it) is never run.
  const todo = [];
  for (const name of names) {
    if (record.applied.some((a) => a.id === name) || baseline.includes(name)) continue;
    const entry = listed.get(`system/scripts/migrations/${name}`);
    if (!entry || !fileMatchesSha(join(migDir, name), `system/scripts/migrations/${name}`, entry.sha256)) skipped.push(name);
    else todo.push(name);
  }
  // Upgrades rewrite notes and settings, so they run only with a restore point. Nothing has been written yet.
  // Guided upgrades count too: they are run later by Claude and rewrite notes, so the restore point must exist first.
  const guidedWaiting = guidedRows(listed, (path) => rootPath(...path.split('/')), record, baselineMigrations(record)).map(({ id, summary }) => ({ id, summary }));
  if ((todo.length > 0 || guidedWaiting.length > 0) && !safetyTag) {
    return {
      ok: false, no_restore_point: true, tag, safety_tag: null, migrations_pending: todo, guided_pending: guidedWaiting,
      error: 'I have no restore point, so I did not change your notes or settings. Run /health-check to see what is wrong with Git, then finish the update again.',
    };
  }
  // A fresh install is already in the new shape: record the scripts it came with as done, without running them.
  materialiseBaseline(record);
  for (const name of todo) {
    const res = spawnSync(process.execPath, [join(migDir, name)], {
      cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ALTERBRAIN_UPDATE_TAG: tag },
    });
    if (res.status !== 0) {
      const detail = `${res.stderr || res.stdout || (res.error && res.error.message) || ''}`.trim().slice(0, 500);
      return { ok: false, error: `The upgrade ${name} stopped, so the update is not finished.`, migration: name, detail, safety_tag: safetyTag, migrations_run: ran, migration_notes: notes };
    }
    record.applied.push({ id: name, at: new Date().toISOString(), tag });
    writeJson(doneFile, record);
    ran.push(name);
    notes[name] = String(res.stdout || '').trim().slice(0, 2000);
  }

  // 2. The release manifest becomes the new base for the next update.
  const manifestText = stagedManifestText;
  mkdirSync(dirname(rootPath(...MANIFEST_REL.split('/'))), { recursive: true });
  writeFileSync(rootPath(...MANIFEST_REL.split('/')), manifestText);

  // 2b. Guided upgrades still open: listed in the new manifest, file matching, no answer recorded. Never run here.
  const guidedOpen = guidedRows(listed, (path) => rootPath(...path.split('/')), record, []).map(({ id, summary }) => ({ id, summary }));
  if (guidedOpen.length > 0) {
    try {
      const n = guidedOpen.length;
      const already = listTasks().some((x) => x.line.includes('#ab/update-alterbrain') && /upgrade questions? for you/.test(x.line));
      if (!already) addTask({ text: `Alterbrain has ${n} upgrade question${n === 1 ? '' : 's'} for you. Say "run the pending upgrades".`, tag: 'update-alterbrain' });
    } catch {
      /* the list is still in the result */
    }
  }

  // 3. Health check.
  let doctor = { skipped: true };
  if (!opts.noDoctor) {
    const script = existsSync(rootPath('system', 'scripts', 'doctor.mjs')) ? rootPath('system', 'scripts', 'doctor.mjs') : join(HERE, 'doctor.mjs');
    const res = spawnSync(process.execPath, [script, '--json'], { cwd: root, encoding: 'utf8', timeout: 180_000, windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    let parsed = null;
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      /* keep null */
    }
    doctor = { skipped: false, exit_code: res.status, ok: res.status === 0, summary: parsed && parsed.summary ? parsed.summary : null };
  }

  // 4. Save the result.
  let saveFailed = false;
  if (!opts.noCommit && gitInstalled() && isRepo(root)) {
    // Automatic saving switched off by the person is their choice: not a failed save (apply-safe already refused to tag unsaved work).
    const sv = safetySave();
    saveFailed = !sv.ok && !sv.switched_off;
  }
  if (saveFailed) {
    try {
      addTask({ text: 'The update finished, but the final save failed, so your latest work is not backed up. Run /health-check, which offers to clear a half-finished rebase or merge.', tag: 'git', priority: 'high' });
    } catch {
      /* the message below still reaches the person */
    }
  }

  const out = {
    ok: !saveFailed && skipped.length === 0 && (!doctor.skipped ? doctor.ok : true), tag, safety_tag: safetyTag, migrations_run: ran, migration_notes: notes, migrations_skipped: skipped, guided_pending: guidedOpen, doctor,
    ...(saveFailed ? { save_failed: true, error: 'The update finished, but the final save failed, so your latest work is not backed up. Run /health-check, which offers to clear a half-finished rebase or merge.' } : {}),
    still_to_merge: (p.files || []).filter((f) => f.action === 'propose-merge').map((f) => f.path),
    finished: today(),
  };
  writeJson(join(dir, 'finished.json'), out);
  return out;
}

// ---------------------------------------------------------------------------
// guided upgrades: list, done, skip
// ---------------------------------------------------------------------------

function installedListed() {
  return normaliseManifest(readJson(rootPath('system', 'manifest.json'), {})).files;
}

export function guidedList({ all = false } = {}) {
  const record = readMigrationRecord();
  const rows = guidedRows(installedListed(), (path) => rootPath(...path.split('/')), record, baselineMigrations(record), { all });
  return { ok: true, pending: rows.filter((r) => r.status === 'pending').length, guided: rows };
}

/**
 * A restore point before a guided upgrade writes to the person's notes. The update's own tag (pre-update-<tag>) counts
 * when it still exists; otherwise everything is saved and a new tag is made. Without working Git it says so and makes none.
 */
export function guidedSavepoint(opts = {}) {
  const root = projectRoot();
  const tag = (readJson(rootPath('system', 'release.json'), {}) || {}).tag || null;
  if (tag && TAG_RE.test(tag) && hasRestorePoint(tag)) return { ok: true, restore_point: `pre-update-${tag}`, created: false };
  if (!gitInstalled() || !isRepo(root)) {
    return { ok: false, restore_point: null, error: 'There is no restore point, because Git is not working in this folder, so I will not change your notes.' };
  }
  const sv = opts.noCommit ? { ok: true } : safetySave();
  if (!sv.ok) return { ok: false, restore_point: null, error: sv.switched_off ? 'Automatic saving is switched off in config/brain.json and you have unsaved changes, so a restore point would not cover them and I will not change your notes. Save your work yourself, or switch automatic saving on, then try again.' : 'Your latest work could not be saved, so a restore point would not cover it and I will not change your notes. Run /health-check, which offers to clear a half-finished rebase or merge, then try again.' };
  const name = `pre-guided-${tag && TAG_RE.test(tag) ? tag + '-' : ''}${today()}-${Date.now().toString(36)}`;
  const t = createTag(root, name);
  if (!t.ok) return { ok: false, restore_point: null, error: `There is no restore point, because the safety tag could not be created (${t.error || 'unknown reason'}), so I will not change your notes.` };
  return { ok: true, restore_point: name, created: true };
}

/** Record the answer to one guided upgrade. Refuses an id that is not a listed file whose checksum matches. */
export function guidedRecord(rawId, outcome) {
  const id = String(rawId || '').endsWith('.md') ? String(rawId) : `${rawId}.md`;
  const path = `system/scripts/migrations/${id}`;
  const entry = GUIDED_ID.test(id) ? installedListed().get(path) : null;
  if (!entry || !fileMatchesSha(rootPath(...path.split('/')), path, entry.sha256)) {
    return { ok: false, error: `"${rawId}" is not an upgrade question that came with this release, so nothing was recorded.` };
  }
  const record = readMigrationRecord();
  materialiseBaseline(record);
  const tag = (readJson(rootPath('system', 'release.json'), {}) || {}).tag || null;
  record.applied = record.applied.filter((a) => a.id !== id);
  record.applied.push({ id, at: new Date().toISOString(), tag, kind: 'guided', outcome });
  writeJson(rootPath('state', 'migrations.json'), record);
  return { ok: true, id, outcome };
}

// ---------------------------------------------------------------------------
// command line
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { json: false, noCommit: false, noDoctor: false, all: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--no-commit') opts.noCommit = true;
    else if (a === '--no-doctor') opts.noDoctor = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--source-dir') opts.sourceDir = argv[++i];
    else if (a === '--base-dir') opts.baseDir = argv[++i];
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a.startsWith('--')) return null;
    else rest.push(a);
  }
  if ((argv.includes('--source-dir') && !opts.sourceDir) || (argv.includes('--base-dir') && !opts.baseDir) || (argv.includes('--repo') && !opts.repo)) return null;
  opts.command = rest[0];
  opts.tag = rest[1];
  opts.extra = rest.slice(2);
  return opts;
}

function printPlan(r) {
  if (!r.files) {
    for (const e of r.errors || []) console.log(`! ${e.error}`);
    return;
  }
  console.log(`Update plan: ${r.from.tag || r.from.version || 'current'} -> ${r.to.tag || r.tag}`);
  const label = {
    replace: 'will be replaced', add: 'will be added', 'propose-merge': 'needs a merge with your edits',
    archive: 'was removed upstream', unchanged: 'unchanged', rejected: 'REJECTED',
  };
  for (const key of ['replace', 'add', 'propose-merge', 'archive', 'rejected']) {
    const list = r.files.filter((f) => f.action === key);
    if (!list.length) continue;
    console.log(`\n${list.length} file(s) ${label[key]}:`);
    for (const f of list) console.log(`  - ${f.path}${f.needs_review ? ' (you edited it)' : ''}`);
  }
  if (r.code_changes && r.code_changes.length) {
    console.log(`\nCode files that run on your computer (hooks, scripts, settings): ${r.code_changes.length}. Look through this list before you apply:`);
    for (const c of r.code_changes) console.log(`  * ${c.path} (${c.action === 'add' ? 'new' : 'replaced'})`);
  }
  if (r.migrations_pending && r.migrations_pending.length) {
    console.log('\nUpgrades to your notes and settings (run at the end):');
    for (const m of r.migrations_pending) console.log(`  - ${m.summary}`);
    console.log('  A restore point is saved first. If an upgrade does not apply to you, it finds nothing to change.');
  }
  if (r.guided_pending && r.guided_pending.length) {
    console.log('\nUpgrades I will ask you about after the update:');
    for (const m of r.guided_pending) console.log(`  - ${m.summary}`);
    console.log('  Nothing changes until you say yes, and you can skip any of them.');
  }
  if (r.signature === 'verified') console.log('\nThe release manifest signature is verified.');
  else if (r.signature === 'unsigned') console.log('\nThis release is not signed, so only its checksums were checked. Apply it only if you trust where it came from.');
  const same = (r.summary.unchanged || 0);
  if (same) console.log(`\n${same} file(s) already up to date or kept as you have them.`);
  for (const e of r.errors || []) console.log(`! ${e.path}: ${e.error}`);
  console.log(r.ok ? `\nPlan saved to state/local/update/${r.tag}/plan.json` : '\nThe plan has problems. Nothing will be applied.');
}

async function main(argv) {
  const opts = parseArgs(argv);
  const usage = 'Usage: node system/scripts/update.mjs check | plan <tag> | apply-safe <tag> | finish <tag> | guided list [--all] | guided savepoint | guided done <id> | guided skip <id>  [--json] [--source-dir <folder>] [--base-dir <folder>] [--repo <owner/name>] [--no-commit] [--no-doctor]';
  const needsTag = ['plan', 'apply-safe', 'finish'];
  if (opts && opts.command === 'guided') {
    const sub = opts.tag;
    const okShape = ((sub === 'list' || sub === 'savepoint') && opts.extra.length === 0 && !(sub === 'savepoint' && opts.all)) || ((sub === 'done' || sub === 'skip') && opts.extra.length === 1 && !opts.all);
    if (!okShape || opts.sourceDir || opts.baseDir || opts.repo) {
      console.error(usage);
      return 2;
    }
    try {
      const res = sub === 'savepoint' ? guidedSavepoint(opts) : sub === 'list' ? guidedList({ all: opts.all }) : guidedRecord(opts.extra[0], sub === 'done' ? 'done' : 'skipped');
      if (opts.json) console.log(JSON.stringify(res));
      else if (!res.ok) console.error(res.error);
      else if (sub === 'savepoint') console.log(`Restore point: ${res.restore_point}.`);
      else if (sub === 'list') {
        if (res.guided.length === 0) console.log(opts.all ? 'No upgrade questions came with this release.' : 'No upgrade questions are waiting.');
        for (const g of res.guided) console.log(`- ${g.id} (${g.status}): ${g.summary}`);
      } else console.log(`Recorded ${res.id} as ${res.outcome === 'done' ? 'done' : 'skipped'}.`);
      return res.ok ? 0 : 1;
    } catch (e) {
      console.error(`Could not read or write the upgrade record: ${e.message || e}`);
      return 1;
    }
  }
  if (!opts || !['check', ...needsTag].includes(opts.command) || opts.extra.length
    || (opts.command === 'check' && opts.tag) || (needsTag.includes(opts.command) && !(opts.tag && TAG_RE.test(opts.tag)))) {
    console.error(usage);
    return 2;
  }
  const emit = (res, text) => {
    if (opts.json) console.log(JSON.stringify(res));
    else text();
    return res.ok ? 0 : 1;
  };
  const installedRepo = String((readJson(rootPath('system', 'release.json'), {}) || {}).repo || '');
  const foreignRepo = opts.repo && opts.repo.toLowerCase() !== installedRepo.toLowerCase();
  if ((opts.sourceDir || foreignRepo) && !customSourceAllowed()) {
    const error = 'Updating from another folder or another repo is switched off, so an instruction hidden in a note cannot point the updater at files it prepared. If you are the developer and meant it, set ALTERBRAIN_ALLOW_CUSTOM_SOURCE=1 in your own terminal.';
    if (opts.json) console.log(JSON.stringify({ ok: false, error }));
    else console.error(error);
    return 2;
  }
  if (opts.repo && !isValidRepo(opts.repo)) {
    console.error('--repo must look like owner/name.');
    return 2;
  }
  try {
    if (opts.command === 'check') {
      const r = await check(opts);
      return emit(r, () => console.log(r.message));
    }
    if (opts.command === 'plan') {
      const r = await plan(opts.tag, opts);
      return emit(r, () => printPlan(r));
    }
    if (opts.command === 'apply-safe') {
      const r = applySafe(opts.tag, opts);
      return emit(r, () => {
        if (r.error) {
          console.log(`! ${r.error}`);
          for (const e of r.errors || []) console.log(`  - ${e.path}: ${e.error}`);
          for (const n of r.notes || []) console.log(`  ${n}`);
          return;
        }
        console.log(`Safe changes applied for ${opts.tag}.`);
        if (r.safety_tag) console.log(`A restore point was saved as the git tag ${r.safety_tag}.`);
        for (const n of r.notes) console.log(`Note: ${n}`);
        for (const [k, v] of Object.entries(r.counts)) console.log(`- ${k}: ${v}`);
        for (const f of r.results.filter((x) => x.status === 'failed')) console.log(`! ${f.path}: ${f.reason}`);
        if (r.propose_merge.length) {
          console.log(`\n${r.propose_merge.length} file(s) you edited were NOT touched. Claude will go through them with you:`);
          for (const m of r.propose_merge) console.log(`  - ${m.path}`);
        }
      });
    }
    const r = finish(opts.tag, opts);
    return emit(r, () => {
      if (r.error && !r.save_failed) {
        console.log(`! ${r.error}${r.detail ? `\n  ${r.detail}` : ''}`);
        if (r.migrations_run && r.migrations_run.length) console.log(`  Already done: ${r.migrations_run.join(', ')}`);
        return;
      }
      console.log(r.save_failed ? `Update ${opts.tag} is installed.` : `Update ${opts.tag} finished.`);
      if (r.migrations_run.length) {
        if (r.safety_tag) console.log(`Your restore point is the git tag ${r.safety_tag}.`);
        console.log('Upgrades run:');
        for (const id of r.migrations_run) {
          console.log(`  - ${id}`);
          for (const line of String((r.migration_notes || {})[id] || '').split(/\r?\n/).filter(Boolean)) console.log(`      ${line}`);
        }
      }
      if (r.guided_pending && r.guided_pending.length) {
        console.log(`${r.guided_pending.length} upgrade question(s) are waiting for you. Say "run the pending upgrades" when you are ready:`);
        for (const g of r.guided_pending) console.log(`  - ${g.summary}`);
      }
      for (const id of r.migrations_skipped) console.log(`Skipped upgrade ${id}: it is not part of this release, so it was not run.`);
      console.log(r.doctor.skipped ? 'Health check skipped.' : r.doctor.ok ? 'Health check passed.' : 'Health check found problems: run node system/scripts/doctor.mjs to see them.');
      if (r.still_to_merge.length) console.log(`${r.still_to_merge.length} edited file(s) still need a merge.`);
      if (r.save_failed) console.log(`! ${r.error}`);
    });
  } catch (e) {
    const res = { ok: false, error: `Could not finish: ${e.message || e}` };
    if (opts.json) console.log(JSON.stringify(res));
    else console.error(res.error);
    return 1;
  }
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = await main(process.argv.slice(2));
