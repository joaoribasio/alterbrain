// Project path helpers. Never rely on process.cwd(): hooks and scripts can be
// launched from any directory (a shell `cd` must not break them).
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Real path of a file, lower-cased on case-insensitive platforms, for comparing two spellings of one file. */
function comparable(p) {
  let r;
  try {
    r = realpathSync.native(p);
  } catch {
    r = resolve(p);
  }
  return process.platform === 'win32' || process.platform === 'darwin' ? r.toLowerCase() : r;
}

/**
 * True when the calling module is the file node was started with: `if (isMainModule(import.meta.url)) ...`.
 * Node resolves symlinks and junctions in import.meta.url but not in process.argv[1], so a plain string
 * comparison is false (and every hook silently does nothing) when the project is reached through a link.
 * Both sides go through realpath here. One helper for every hook and script.
 */
export function isMainModule(metaUrl) {
  try {
    if (!process.argv[1]) return false;
    return comparable(process.argv[1]) === comparable(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

/** Absolute path of the Alterbrain project root. */
export function projectRoot() {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  if (fromEnv && existsSync(join(fromEnv, 'system'))) return resolve(fromEnv);
  // system/lib/paths.mjs -> project root is two levels up
  let dir = resolve(HERE, '..', '..');
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'system')) && existsSync(join(dir, 'vault'))) return dir;
    if (existsSync(join(dir, 'system', 'core.md'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(HERE, '..', '..');
}

/** Join path parts onto the project root. */
export function rootPath(...parts) {
  return join(projectRoot(), ...parts);
}

/** Join path parts onto the vault folder. */
export function vaultPath(...parts) {
  return join(projectRoot(), 'vault', ...parts);
}

/**
 * True when this checkout is the framework developer's: state/local/dev-mode exists and is a plain file. The person
 * who owns the computer creates it by hand. The hooks never let a tool create it, and a folder or a link with that
 * name (which a shell could make) does not count.
 */
export function isDevMode() {
  try {
    return lstatSync(rootPath('state', 'local', 'dev-mode')).isFile();
  } catch {
    return false;
  }
}

/** Project-relative path with forward slashes (stable across Windows/macOS). */
export function toRel(absPath) {
  return relative(projectRoot(), resolve(absPath)).split(sep).join('/');
}

/** Normalise any path (absolute or relative to root) to project-relative forward-slash form. */
export function normRel(p) {
  if (!p) return '';
  const abs = resolve(projectRoot(), p);
  return toRel(abs);
}

/** True if a project-relative path matches a simple glob ("dir/**", "dir/*.json", exact). */
export function matchGlob(rel, pattern) {
  const r = rel.replace(/\\/g, '/');
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`, 'i').test(r);
}
