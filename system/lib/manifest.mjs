// Framework manifest helpers (spec section 2).
//
// system/manifest.json lists every framework file with its class and a sha256.
// "code" files are replaced verbatim on update; "text" files may be customised.
// doctor.mjs, update.mjs, protect_paths.mjs and validate.mjs all reuse this.
//
// Manifest shape:
//   { "schema": 1, "version": "0.1.0", "tag": "v0.1.0",
//     "files": [ { "path": "system/core.md", "class": "code", "sha256": "..." }, ... ] }
// Files are sorted by path (plain code-unit order) so the output is stable.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { join } from 'node:path';
import { projectRoot } from './paths.mjs';
import { readJson, writeJson } from './fsx.mjs';

export const MANIFEST_REL = 'system/manifest.json';

// Folder names skipped at any depth.
const SKIP_SEGMENTS = new Set(['.git', 'node_modules']);
// File names that are OS noise, never framework files.
const JUNK_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
// Whole top-level folders that belong to the user.
const USER_TOP_DIRS = new Set(['vault', 'config', 'state']);

const CODE_EXACT = new Set([
  '.claude/settings.json',
  'system/core.md',
  'system/release.json',
  'system/manifest.json',
]);
const CODE_PREFIXES = ['system/hooks/', 'system/scripts/', 'system/lib/', 'tests/', '.github/'];
// Executable files are code wherever they live (for example system/quarto/tools/*.mjs).
const CODE_EXTENSION = /\.(mjs|js|ps1|sh)$/i;

/** Normalise a path to forward slashes with no leading "./". */
function norm(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** True if a project-relative path is NOT part of the framework (user data, generated, git, junk). */
export function isExcluded(relPath) {
  const rel = norm(relPath);
  const low = rel.toLowerCase();
  const segments = low.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.some((s) => SKIP_SEGMENTS.has(s))) return true;
  if (USER_TOP_DIRS.has(segments[0])) return true;
  if (low === '.mcp.json' || low === '.claude/settings.local.json') return true;
  if (low === 'system/manifest.sig') return true; // the signature of the manifest cannot be listed inside it
  if (low.startsWith('.claude/skills/my-') || low.startsWith('.claude/agents/my-')) return true;
  const base = segments[segments.length - 1];
  if (JUNK_NAMES.has(base)) return true;
  if ((base === '.env' || base.startsWith('.env.')) && base !== '.env.example') return true;
  return false;
}

/** "code" or "text" for a project-relative framework path. */
export function classify(relPath) {
  const rel = norm(relPath);
  if (CODE_EXACT.has(rel)) return 'code';
  if (CODE_PREFIXES.some((p) => rel.startsWith(p))) return 'code';
  if (/^system\/catalogue\/[^/]+\.json$/.test(rel)) return 'code';
  if (CODE_EXTENSION.test(rel)) return 'code';
  return 'text';
}

/**
 * sha256 (hex) of file bytes with CRLF turned into LF, so hashes match on
 * Windows and macOS. Binary content (contains a NUL byte) is hashed as-is.
 */
export function sha256Normalised(buf) {
  const head = buf.subarray(0, 8000);
  const isBinary = head.includes(0);
  if (isBinary) return createHash('sha256').update(buf).digest('hex');
  // latin1 keeps every byte intact, and CR/LF are plain ASCII in UTF-8 too.
  const fixed = Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return createHash('sha256').update(fixed).digest('hex');
}

/** sha256 of a file on disk, LF-normalised (see sha256Normalised). */
export function hashFile(absPath) {
  return sha256Normalised(readFileSync(absPath));
}

/**
 * Sorted project-relative paths (forward slashes) of every framework file.
 * system/manifest.json is left out (a manifest never lists itself) unless asked.
 */
export function listFrameworkFiles(root = projectRoot(), { includeManifest = false } = {}) {
  const out = [];
  const walk = (dirAbs, dirRel) => {
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue; // never follow links
      if (e.isDirectory()) {
        // Directory-level exclusion (vault/, .git/, my-* skill folders, ...):
        // test with a dummy child so prefix rules apply to the folder itself.
        if (isExcluded(`${rel}/x`)) continue;
        walk(join(dirAbs, e.name), rel);
      } else if (e.isFile()) {
        if (isExcluded(rel)) continue;
        if (!includeManifest && rel === MANIFEST_REL) continue;
        out.push(rel);
      }
    }
  };
  walk(root, '');
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Build the manifest object for a project (does not write anything). */
export function buildManifest(root = projectRoot()) {
  const release = readJson(join(root, 'system', 'release.json'), {}) || {};
  const files = listFrameworkFiles(root).map((rel) => ({
    path: rel,
    class: classify(rel),
    sha256: hashFile(join(root, ...rel.split('/'))),
  }));
  return { schema: 1, version: release.version ?? null, tag: release.tag ?? null, files };
}

/**
 * Sign system/manifest.json with an Ed25519 private key (a PEM file) and write system/manifest.sig (base64).
 * The updater checks it against "signing_public_key" in system/release.json. Release tooling only.
 */
export function signManifest(root, keyFile) {
  const key = createPrivateKey(readFileSync(keyFile, 'utf8'));
  const bytes = readFileSync(join(root, 'system', 'manifest.json'));
  const sig = cryptoSign(null, bytes, key).toString('base64');
  writeFileSync(join(root, 'system', 'manifest.sig'), `${sig}\n`, 'utf8');
  return sig;
}

/** Build the manifest and write system/manifest.json. Returns the manifest. */
export function writeManifest(root = projectRoot()) {
  const manifest = buildManifest(root);
  writeJson(join(root, 'system', 'manifest.json'), manifest);
  return manifest;
}

/** Read system/manifest.json (null when missing or unreadable). */
export function readManifest(root = projectRoot()) {
  return readJson(join(root, 'system', 'manifest.json'), null);
}

/**
 * Normalise a manifest (array form, or a { path: { class, sha256 } } map) into
 * an array of { path, class, sha256 }. Lets callers survive either shape.
 */
export function manifestEntries(manifest) {
  if (!manifest || typeof manifest !== 'object') return [];
  const files = manifest.files;
  if (Array.isArray(files)) return files.filter((f) => f && typeof f.path === 'string');
  if (files && typeof files === 'object') {
    return Object.entries(files).map(([path, v]) => ({
      path,
      class: v?.class ?? classify(path),
      sha256: v?.sha256 ?? null,
    }));
  }
  return [];
}

/** Paths the manifest marks as class "code". */
export function codePaths(manifest) {
  return manifestEntries(manifest)
    .filter((f) => f.class === 'code')
    .map((f) => f.path);
}
