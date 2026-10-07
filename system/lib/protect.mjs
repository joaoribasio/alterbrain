// What may not be written, and how to spot a shell command that writes it (spec section 14).
//
// Shared by the protect_paths hook (Write/Edit tools, shell commands, MCP file tools). Zero dependencies.
//
// Honest limits: the shell part is best effort. It reads redirects (> >> | tee) and the arguments of the
// usual writers (Set-Content, Copy-Item, rm, mv, sed -i ...), and looks inside node/python one-liners. It
// cannot see a script that writes a protected file by itself. Protected writes therefore stay behind the
// permission prompt: shells are never put on the allow list.
import { readJson } from './fsx.mjs';
import { commandSegments, programName, projectRels } from './hookio.mjs';
import { matchGlob, rootPath } from './paths.mjs';

export const DEV_MODE_REL = 'state/local/dev-mode';
export const RAW_GLOB = 'vault/40_sources/raw/**';
// Obsidian plugin code runs with the user's rights inside Obsidian.
const PLUGIN_GLOB = 'vault/.obsidian/plugins/**/*.js';
// The rate guard's usage log and warning record: an agent that could edit them could clear a safety stop.
export const RATE_GUARD_GLOB = 'state/local/rate-guard/**';

// Always protected, even when the manifest is missing (spec section 14).
export const ALWAYS_PROTECTED = [
  '.claude/settings.json',
  'system/core.md',
  'system/release.json',
  'system/manifest.json',
  'system/hooks/**',
  'system/scripts/**',
  'system/lib/**',
  'system/catalogue/*.json',
];

export const REASONS = {
  system: 'This is a protected Alterbrain system file. Ask me to propose a change instead.',
  raw: 'Files in vault/40_sources/raw are original copies and are never edited. Ask me to add a fresh copy with the ingest step instead.',
  devmode: 'Developer mode can only be switched on by hand, by the person who owns this computer. Alterbrain never creates or edits that file.',
  git: 'The hidden .git folder holds your saved history and its automatic steps. Alterbrain never edits it directly.',
  plugin: 'Obsidian plugin code runs inside Obsidian, so Alterbrain does not edit it. Ask me to propose a change instead.',
  rateguard: 'The usage limits record protects your accounts, so Alterbrain never edits it. To see it, ask me to run: node system/scripts/rate-guard.mjs status',
  ancestor: 'This would delete or move a whole folder that holds protected Alterbrain files or your original sources.',
};

/** Lower-cased project-relative paths of code-class files in system/manifest.json. */
export function manifestCodePaths() {
  const manifest = readJson(rootPath('system', 'manifest.json'), null);
  const out = new Set();
  if (!manifest || typeof manifest !== 'object') return out;
  const files = Array.isArray(manifest) ? manifest : manifest.files;
  const add = (path, cls) => {
    if (typeof path === 'string' && String(cls || '').toLowerCase() === 'code') {
      out.add(path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase());
    }
  };
  if (Array.isArray(files)) {
    for (const f of files) if (f && typeof f === 'object') add(f.path, f.class ?? f.kind);
  } else if (files && typeof files === 'object') {
    for (const [path, v] of Object.entries(files)) add(path, typeof v === 'string' ? v : v && (v.class ?? v.kind));
  }
  return out;
}

/**
 * Which protection a project-relative path falls under: 'devmode' | 'raw' | 'git' | 'plugin' | 'system', or null.
 * The dev-mode marker is protected even in dev mode (an agent must never be able to switch dev mode on).
 * Everything else is skipped when `dev` is true.
 */
export function protectedKind(rel, codePaths = new Set(), dev = false) {
  const r = String(rel).toLowerCase();
  if (r === DEV_MODE_REL) return 'devmode';
  if (dev) return null;
  if (matchGlob(r, RAW_GLOB)) return 'raw';
  if ((r === '.git' || r.startsWith('.git/')) && !/\.lock$/.test(r)) return 'git';
  if (matchGlob(r, PLUGIN_GLOB)) return 'plugin';
  if (matchGlob(r, RATE_GUARD_GLOB)) return 'rateguard';
  if (ALWAYS_PROTECTED.some((g) => matchGlob(r, g))) return 'system';
  if (codePaths.has(r)) return 'system';
  return null;
}

/** The first protection hit among all the spellings of one path, as { kind, rel }, or null. */
export function protectedHit(path, codePaths, dev) {
  for (const rel of projectRels(path)) {
    const kind = protectedKind(rel, codePaths, dev);
    if (kind) return { kind, rel };
  }
  return null;
}

/* ------------------------------ samples for wildcards and folders ------------------------------ */

let sampleCache = null;

/** Example protected files, and the folders that contain them (deleting a folder deletes its files). */
function samples(codePaths) {
  if (sampleCache && sampleCache.codePaths === codePaths) return sampleCache;
  const files = new Set([DEV_MODE_REL, '.git/config', '.git/hooks/pre-commit', 'vault/40_sources/raw/x', 'vault/.obsidian/plugins/x/main.js', 'state/local/rate-guard/ledger.jsonl']);
  for (const g of ALWAYS_PROTECTED) {
    if (g.endsWith('/**')) files.add(`${g.slice(0, -3)}/x`);
    else files.add(g.replace('*', 'x'));
  }
  for (const p of codePaths) files.add(p);
  const dirs = new Set(['']);
  for (const f of files) {
    const parts = f.split('/');
    for (let k = 1; k < parts.length; k++) dirs.add(parts.slice(0, k).join('/'));
  }
  // Folders whose whole content is protected: copying a file INTO one writes a protected file.
  const containers = new Set(['.git', 'vault/40_sources/raw', 'vault/.obsidian/plugins', 'state/local/rate-guard']);
  for (const g of ALWAYS_PROTECTED) if (g.endsWith('/**')) containers.add(g.slice(0, -3));
  sampleCache = { codePaths, files: [...files], dirs, containers };
  return sampleCache;
}

/** A shell-style pattern (* ? and **) as an anchored, case-insensitive regex. */
function globRegex(pattern) {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`, 'i');
}

/**
 * Is writing (or, when `destructive`, deleting or moving) this path a protected act?
 * Handles wildcards by trying them against example protected files and folders.
 * Returns { kind, rel } or null.
 */
function checkTarget(value, { destructive, codePaths, dev }) {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\n\r\0]/.test(value)) return null;
  if (NULL_TARGET.test(value)) return null;
  if (/^[$%]/.test(value)) return null; // an unresolved variable: nothing to compare
  const s = samples(codePaths);
  const wildcard = /[*?]/.test(value);
  for (const rel of projectRels(value)) {
    if (wildcard) {
      const rx = globRegex(rel);
      for (const f of s.files) {
        const kind = protectedKind(f, codePaths, dev);
        if (kind && rx.test(f)) return { kind, rel };
      }
      if (destructive && !dev) for (const d of s.dirs) if (rx.test(d)) return { kind: 'ancestor', rel };
      continue;
    }
    const kind = protectedKind(rel, codePaths, dev);
    if (kind) return { kind, rel };
    if (destructive && !dev && s.dirs.has(rel.toLowerCase())) return { kind: 'ancestor', rel };
    if (!dev && s.containers.has(rel.toLowerCase())) return { kind: protectedKind(`${rel}/x`, codePaths, dev) || 'system', rel };
  }
  return null;
}

/* ------------------------------ what a shell command writes ------------------------------ */

// Places a redirect writes to that are not files: nothing, the screen, a stream.
const NULL_TARGET = /^(?:\/dev\/(?:null|stdout|stderr|stdin|tty|fd\/\d+)|nul|\$null|&\d|-)$/i;
const REDIRECT = /^(?:\d*|&|\*)>{1,2}\|?(.*)$/;

// Programs whose every path argument is written, changed or removed.
const WRITERS = new Set([
  'tee', 'tee-object', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'clear-content', 'clc', 'new-item', 'ni',
  'set-item', 'set-itemproperty', 'touch', 'mkdir', 'md', 'truncate', 'chmod', 'chown', 'attrib', 'icacls', 'takeown', 'ln', 'mklink',
  'rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'unlink', 'shred',
  'mv', 'move', 'move-item', 'mi', 'ren', 'rename', 'rename-item', 'rni',
]);
// Deleting or moving: a folder that contains protected files counts too.
const DESTRUCTIVE = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'unlink', 'shred', 'mv', 'move', 'move-item', 'mi', 'ren', 'rename', 'rename-item', 'rni']);
// Copying: only the destination is written.
const COPIERS = new Set(['cp', 'copy', 'copy-item', 'cpi', 'xcopy', 'install', 'rsync', 'scp', 'robocopy']);
const CODE_PROGRAMS = /^(?:node|nodejs|python|python3|py|perl|ruby|deno|bun|php|lua)$/;
const INLINE_FLAG = /^-(?:[a-zA-Z]*[ecpErx]|-eval|-print)$/;
// Words in a one-liner that change files. open(...) only counts when it is opened for writing ("w", "a", "x").
const WRITEISH = /write|append|copy|rename|unlink|\brm|remove|delete|truncate|open\([^)]*['"][wax][b+]?['"]|move|symlink|put_contents|replace|save/i;
const DOTNET_WRITE = /\[(?:system\.)?io\.(?:file|directory)\]::\s*(?:write|append|copy|move|delete|create|open|replace|set)/i;

const LITERALS = [
  'system/hooks', 'system/scripts', 'system/lib', 'system/core.md', 'system/release.json', 'system/manifest.json',
  'system/catalogue', '.claude/settings', 'state/local/dev-mode', 'state/local/rate-guard', 'dev-mode', '40_sources/raw', '.git/hooks', '.git/config',
  '.obsidian/plugins',
];

/** Does a piece of code text name a protected path (even when joined from parts: join('system','hooks'))? */
export function mentionsProtectedLiteral(text, codePaths = new Set()) {
  const t = String(text).toLowerCase().replace(/\\/g, '/').replace(/['"`,+\s]+/g, '/');
  if (LITERALS.some((l) => t.includes(l))) return true;
  for (const p of codePaths) if (t.includes(p)) return true;
  return false;
}

/** Path-like values out of an argument list: plain arguments, and the value of -Path:x / --dir=x. */
function pathArgs(args) {
  const out = [];
  for (const raw of args) {
    let v = raw;
    if (v.startsWith('-')) {
      const m = /^-{1,2}[A-Za-z][\w-]*[:=](.+)$/.exec(v);
      if (!m) continue;
      v = m[1];
    } else if (/^\/[A-Za-z?]$/.test(v)) {
      continue; // cmd switch such as /s
    }
    out.push(v);
  }
  return out;
}

/** Targets a shell command writes, as [{ value, destructive }]. Best effort. */
export function shellWriteTargets(command, shell = 'bash') {
  const targets = [];
  for (const seg of commandSegments(command, shell)) {
    const prog = programName(seg[0]);
    const args = seg.slice(1);

    // Redirects: echo hi > file, cmd >> file, cmd 2> file
    for (let i = 0; i < seg.length; i++) {
      const m = REDIRECT.exec(seg[i]);
      if (!m) continue;
      let value = m[1];
      if (!value) {
        value = seg[i + 1];
        i++;
      }
      if (value && !NULL_TARGET.test(value)) targets.push({ value, destructive: false });
    }

    if (WRITERS.has(prog)) {
      for (const value of pathArgs(args)) targets.push({ value, destructive: DESTRUCTIVE.has(prog) });
    } else if (COPIERS.has(prog)) {
      const named = [];
      for (let i = 0; i < args.length; i++) {
        if (/^-(?:t|d|de|des|dest|destination)$/i.test(args[i]) || args[i] === '--target-directory') named.push(args[i + 1]);
        else if (/^--target-directory=(.+)$/.test(args[i])) named.push(args[i].slice(args[i].indexOf('=') + 1));
        else if (/^-(?:destination|dest):(.+)$/i.test(args[i])) named.push(args[i].slice(args[i].indexOf(':') + 1));
      }
      const positional = args.filter((a) => !a.startsWith('-'));
      const dest = named.length ? named : prog === 'robocopy' ? positional.slice(1, 2) : positional.slice(-1);
      for (const value of dest) if (value) targets.push({ value, destructive: false });
    } else if ((prog === 'sed' || prog === 'perl' || prog === 'ruby') && args.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a))) {
      for (const value of pathArgs(args)) targets.push({ value, destructive: false });
    } else if (prog === 'dd') {
      for (const a of args) if (a.startsWith('of=')) targets.push({ value: a.slice(3), destructive: false });
    }
  }
  return targets;
}

/**
 * Does a shell command write a protected path? Returns { kind, rel } or null.
 * `dev` is true in dev mode: then only the dev-mode marker is protected.
 */
export function shellProtectHit(command, shell, { codePaths = new Set(), dev = false } = {}) {
  if (typeof command !== 'string' || !command.trim()) return null;
  for (const t of shellWriteTargets(command, shell)) {
    const hit = checkTarget(t.value, { destructive: t.destructive, codePaths, dev });
    if (hit) return hit;
  }
  // One-liners that run code (node -e, python -c) and .NET file calls in PowerShell.
  const wantsLiteral = (text) => (dev ? /dev-mode/i.test(text) : mentionsProtectedLiteral(text, codePaths));
  for (const seg of commandSegments(command, shell)) {
    const prog = programName(seg[0]);
    if (CODE_PROGRAMS.test(prog) && seg.slice(1).some((a) => INLINE_FLAG.test(a))) {
      const text = seg.slice(1).join(' ');
      if (WRITEISH.test(text) && wantsLiteral(text)) return { kind: /dev-mode/i.test(text) ? 'devmode' : 'system', rel: '' };
    }
  }
  if (DOTNET_WRITE.test(command) && wantsLiteral(command)) return { kind: /dev-mode/i.test(command) ? 'devmode' : 'system', rel: '' };
  return null;
}
