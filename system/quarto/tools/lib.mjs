// Shared helpers for the Alterbrain Quarto tools. Zero dependencies (Node 20+).
// Used by render.mjs, fonts.mjs and pagecount.mjs.
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, copyFileSync, unlinkSync, rmSync,
  statSync,
} from 'node:fs';
import { delimiter, dirname, join, relative, resolve, sep, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../../lib/paths.mjs';

export const IS_WINDOWS = process.platform === 'win32';
export const QUARTO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES_DIR = join(QUARTO_DIR, 'templates');
export const DEFAULT_BRAND = join(QUARTO_DIR, 'brand', '_brand.yml');
export const FONTS_DIR = join(QUARTO_DIR, 'fonts');

/** The project root (shared helper from system/lib, so every script agrees on it). */
export function repoRoot() {
  return projectRoot();
}

/**
 * The document types. `template` is a folder in templates/, `file` the starter file in it,
 * `format` the Quarto format name, `ext` the file Quarto writes.
 */
export const TYPES = {
  cv: {
    label: 'CV (designed, two-colour layout)', template: 'cv', file: 'cv.qmd', format: 'awesomecv-typst', ext: 'pdf',
    extra: ['cv-data.yml'],
  },
  'cv-ats': {
    label: 'CV (plain, for applicant tracking systems)', template: 'cv', file: 'cv-ats.qmd',
    format: 'alterbrain-cv-ats-typst', ext: 'pdf', extra: ['cv-data.yml'],
  },
  letter: {
    label: 'Cover letter', template: 'letter', file: 'letter.qmd', format: 'alterbrain-letter-typst', ext: 'pdf',
    extra: [],
  },
  report: {
    label: 'Report, memo or assignment', template: 'report', file: 'report.qmd', format: 'alterbrain-report-typst',
    ext: 'pdf', extra: ['references.bib'],
  },
  deck: {
    label: 'Slide deck', template: 'deck', file: 'deck.qmd', format: 'alterbrain-deck-revealjs', ext: 'html',
    extra: [],
  },
};

export function forwardSlashes(p) {
  return p.split(sep).join('/');
}

// ---------------------------------------------------------------- running Quarto

/** Find the quarto executable. Returns { cmd, shell } or null. */
export function findQuarto() {
  const names = IS_WINDOWS ? ['quarto.exe', 'quarto.cmd'] : ['quarto'];
  const dirs = (process.env.PATH || process.env.Path || '').split(delimiter).filter(Boolean);
  if (process.env.QUARTO_PATH) dirs.unshift(dirname(process.env.QUARTO_PATH));
  for (const name of names) {
    for (const d of dirs) {
      const p = join(d, name);
      if (existsSync(p)) return { cmd: p, shell: name.endsWith('.cmd') };
    }
  }
  return null;
}

/** Folders searched for extra fonts: system/quarto/fonts and the user's brand fonts. */
export function fontFolders(root = repoRoot()) {
  const out = [];
  for (const d of [FONTS_DIR, join(root, 'vault', '80_me', 'brand', 'fonts')]) {
    if (existsSync(d) && readdirSync(d).some((f) => /\.(ttf|otf|ttc)$/i.test(f))) out.push(d);
  }
  return out;
}

export function quartoEnv(root = repoRoot()) {
  const extra = fontFolders(root);
  const env = { ...process.env };
  if (extra.length) {
    env.TYPST_FONT_PATHS = [...extra, process.env.TYPST_FONT_PATHS].filter(Boolean).join(delimiter);
  }
  return env;
}

function quoteForCmd(a) {
  return /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

/** Run quarto with an argument list (no shell quoting problems). Returns { ok, code, stdout, stderr }. */
export function runQuarto(args, { cwd, timeout = 300_000, root } = {}) {
  const q = findQuarto();
  if (!q) return { ok: false, code: -1, stdout: '', stderr: 'quarto: command not found' };
  const res = q.shell
    ? spawnSync([quoteForCmd(q.cmd), ...args.map(quoteForCmd)].join(' '), {
        shell: true, cwd, encoding: 'utf8', timeout, env: quartoEnv(root), windowsHide: true,
      })
    : spawnSync(q.cmd, args, { cwd, encoding: 'utf8', timeout, env: quartoEnv(root), windowsHide: true });
  return {
    ok: res.status === 0 && !res.error,
    code: res.status ?? -1,
    stdout: res.stdout || '',
    stderr: (res.stderr || '') + (res.error ? `\n${res.error.message}` : ''),
  };
}

// ---------------------------------------------------------------- small file helpers

export function listFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** Move a file even across drives. */
export function moveFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

/** "Name.pdf" -> "Name.pdf" if free, else "Name (2).pdf", "Name (3).pdf" ... */
export function uniquePath(file) {
  if (!existsSync(file)) return file;
  const dir = dirname(file);
  const ext = extname(file);
  const stem = basename(file, ext);
  for (let i = 2; i < 1000; i++) {
    const p = join(dir, `${stem} (${i})${ext}`);
    if (!existsSync(p)) return p;
  }
  return file;
}

/** The front matter text of a Markdown or Quarto file ('' if none). */
export function frontMatterText(text) {
  const t = text.replace(/^﻿/, '');
  if (!/^---\r?\n/.test(t)) return '';
  const end = t.search(/\r?\n---\s*(\r?\n|$)/);
  return end === -1 ? '' : t.slice(t.indexOf('\n') + 1, end);
}

export function hasTopLevelKey(frontMatter, key) {
  return new RegExp(`^${key}\\s*:`, 'm').test(frontMatter);
}

// ---------------------------------------------------------------- staging templates next to a source

/**
 * Copy the template's Quarto extensions into <srcDir>/_extensions so that `quarto render` can find them.
 * Returns an object whose cleanup() removes exactly what was added (never anything that was already there).
 */
export function stageExtensions(typeKey, srcDir) {
  const type = TYPES[typeKey];
  const from = join(TEMPLATES_DIR, type.template, '_extensions');
  if (!existsSync(from)) throw new Error(`The template files for "${typeKey}" are missing: ${from}`);
  return stageExtensionsFrom(from, srcDir);
}

/**
 * Copy every folder in `from` (a template's _extensions folder) into <srcDir>/_extensions. A folder that is already
 * there is never overwritten. cleanup() removes exactly what was added. A missing `from` adds nothing.
 */
export function stageExtensionsFrom(from, srcDir) {
  const added = [];
  const extRoot = join(srcDir, '_extensions');
  const createdRoot = !existsSync(extRoot);
  if (existsSync(from)) mkdirSync(extRoot, { recursive: true });
  for (const e of existsSync(from) ? readdirSync(from, { withFileTypes: true }) : []) {
    if (!e.isDirectory()) continue;
    const dest = join(extRoot, e.name);
    if (existsSync(dest)) continue; // the user's own copy wins
    cpSync(join(from, e.name), dest, { recursive: true });
    added.push(dest);
  }
  return {
    added,
    cleanup() {
      for (const d of added) rmSync(d, { recursive: true, force: true });
      if (createdRoot) {
        try {
          if (readdirSync(extRoot).length === 0) rmSync(extRoot, { recursive: true, force: true });
        } catch { /* leave it */ }
      }
    },
  };
}

/** The brand file to use: --brand, then the user's own, then the framework default. */
export function chooseBrand({ explicit, root = repoRoot() } = {}) {
  if (explicit) return resolve(explicit);
  const mine = join(root, 'vault', '80_me', 'brand', '_brand.yml');
  if (existsSync(mine)) return mine;
  return DEFAULT_BRAND;
}

/** Path of `file` relative to `fromDir`, with forward slashes (what Quarto expects). */
export function relativeForQuarto(fromDir, file) {
  return forwardSlashes(relative(fromDir, file));
}

export function isDirectory(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

export function readTextSafe(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

// ---------------------------------------------------------------- formats named by the document itself

/** Names under `contributes: formats:` in an _extension.yml text (the keys, for example pdf, typst, html). */
export function contributedFormats(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const indentOf = (l) => l.length - l.trimStart().length;
  const live = (l) => l.trim() !== '' && !l.trim().startsWith('#');
  const out = [];
  let i = lines.findIndex((l) => /^contributes[ \t]*:/.test(l));
  if (i === -1) return out;
  i++;
  while (i < lines.length && !(live(lines[i]) && /^[ \t]+formats[ \t]*:/.test(lines[i]))) {
    if (live(lines[i]) && indentOf(lines[i]) === 0) return out; // left the contributes block
    i++;
  }
  if (i >= lines.length) return out;
  const base = indentOf(lines[i]);
  let level = -1;
  for (i++; i < lines.length; i++) {
    if (!live(lines[i])) continue;
    const ind = indentOf(lines[i]);
    if (ind <= base) break;
    if (level === -1) level = ind;
    const m = ind === level ? /^\s*["']?([A-Za-z0-9_.-]+)["']?[ \t]*:/.exec(lines[i]) : null;
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * The Quarto format names that the extensions in `extRoot` (a folder of extensions, such as <project>/_extensions)
 * provide. An extension in a folder called "rsm" that contributes a "pdf" format is used as "rsm-pdf". Looks at
 * _extensions/<name>/ and _extensions/<owner>/<name>/. Returns a Set; empty when the folder is missing.
 */
export function extensionFormats(extRoot) {
  const names = new Set();
  if (!extRoot || !isDirectory(extRoot)) return names;
  const dirs = [];
  for (const e of readdirSync(extRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const d = join(extRoot, e.name);
    dirs.push(d);
    for (const e2 of readdirSync(d, { withFileTypes: true })) if (e2.isDirectory()) dirs.push(join(d, e2.name));
  }
  for (const d of dirs) {
    const file = ['_extension.yml', '_extension.yaml'].map((n) => join(d, n)).find((p) => existsSync(p));
    if (!file) continue;
    const yml = readTextSafe(file);
    const name = basename(d); // Quarto names an extension after its folder
    for (const key of contributedFormats(yml)) if (key !== 'common') names.add(`${name}-${key}`);
  }
  return names;
}

/** The format names a document's front matter asks for (`format: x`, or the keys under `format:`), in order. */
export function documentFormats(frontMatter) {
  const lines = String(frontMatter).split(/\r?\n/);
  const i = lines.findIndex((l) => /^format[ \t]*:/.test(l));
  if (i === -1) return [];
  const clean = (v) => v.replace(/[ \t]+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  const rest = clean(lines[i].replace(/^format[ \t]*:/, ''));
  if (rest) return /^[A-Za-z0-9_.-]+$/.test(rest) ? [rest] : [];
  const out = [];
  let level = -1;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.length - l.trimStart().length;
    if (ind === 0) break;
    if (level === -1) level = ind;
    if (ind !== level) continue;
    const m = /^\s*["']?([A-Za-z0-9_.-]+)["']?[ \t]*:/.exec(l);
    if (m) out.push(m[1]);
  }
  return out;
}
