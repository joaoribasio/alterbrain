#!/usr/bin/env node
// Adapted from obsidian-to-quarto-exporter (MIT) — https://github.com/andreasthinks/obsidian-to-quarto-exporter @ 1c58a962f24e34d9edca1efec6c4beabfce0f445
// qmd-prerender: turn an Obsidian note into a Quarto .qmd file that renders cleanly.
//
// Conversion ideas follow andreasthinks/obsidian-to-quarto-exporter (MIT, Copyright (c) 2024 Andreas Varotsis)
//   https://github.com/andreasthinks/obsidian-to-quarto-exporter @ 1c58a962f24e34d9edca1efec6c4beabfce0f445
//   (README feature list: wikilinks, note embeds with # and ^ references, image embeds, mermaid, callouts,
//   highlights). No code was copied; this is an independent Node implementation with zero dependencies.
//
// What it does:
//   * [[Note]] and [[Note|text]] become plain text (a printed report has no use for a link to a vault note).
//   * ![[Another note]] is copied into the page (one level deep). ![[Note#Heading]] and ![[Note#^block]] work.
//   * ![[picture.png|300]] becomes a Markdown image with a width. Images are found anywhere in the vault.
//   * > [!note] Title callouts become Quarto callouts (::: {.callout-note title="Title"}).
//   * %%comments%%, ==highlights==, ^block-ids, #tags, dataview/tasks blocks are handled or removed.
//   * YAML frontmatter is kept, Obsidian-only keys are removed, a title is added if missing.
//
// Usage:
//   node system/scripts/qmd-prerender.mjs <note.md> [--out file.qmd] [--vault <folder>] [--json] [--keep-tags]
// Without --out the .qmd text is printed. Paths of images are written relative to the output file.
// Exit codes: 0 done, 1 done with warnings (for example a missing embed), 2 usage error.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { vaultPath, isMainModule } from '../lib/paths.mjs';
import { writeText } from '../lib/fsx.mjs';

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.bmp', '.tif', '.tiff']);
const LINK_EXT = new Set(['.pdf', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.mp4', '.webm', '.mov', '.mkv', '.ogv']);
const DROP_EXT = new Set(['.base', '.canvas', '.excalidraw']);

/** Frontmatter keys that only mean something inside Obsidian. */
const OBSIDIAN_KEYS = new Set([
  'aliases', 'alias', 'cssclass', 'cssclasses', 'publish', 'permalink', 'banner', 'banner_icon', 'banner-icon',
  'banner_y', 'banner-y', 'kanban-plugin', 'excalidraw-plugin', 'obsidianuimode', 'obsidianeditingmode', 'obsidianuidmode',
]);

/** Code blocks that only Obsidian plugins understand. They are removed. */
const OBSIDIAN_BLOCKS = new Set(['dataview', 'dataviewjs', 'tasks', 'query', 'base', 'button', 'meta-bind', 'meta-bind-button', 'templater', 'excalidraw']);

/** Obsidian callout type -> Quarto callout type. Anything not listed becomes "note". */
const CALLOUT_MAP = {
  note: 'note', info: 'note', todo: 'note', abstract: 'note', summary: 'note', tldr: 'note', example: 'note', question: 'note', help: 'note', faq: 'note',
  tip: 'tip', hint: 'tip', success: 'tip', check: 'tip', done: 'tip',
  important: 'important',
  warning: 'warning', attention: 'warning',
  caution: 'caution', danger: 'caution', error: 'caution', failure: 'caution', fail: 'caution', missing: 'caution', bug: 'caution',
};
const QUOTE_CALLOUTS = new Set(['quote', 'cite']);

const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', '.trash']);
const MAX_EMBED_DEPTH = 1;

// ---------------------------------------------------------------------------------------------
// Vault index and lookups
// ---------------------------------------------------------------------------------------------
/** Find the vault folder: --vault, else the nearest parent with .obsidian, else the project vault, else the note's folder. */
export function findVaultRoot(notePath, explicit) {
  if (explicit) return resolve(explicit);
  let dir = dirname(resolve(notePath));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, '.obsidian'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const project = vaultPath();
  if (existsSync(project) && resolve(notePath).startsWith(project + sep)) return project;
  return dirname(resolve(notePath));
}

/** Lazily built map: lower-case file name -> [absolute paths]. */
function makeIndex(root) {
  let map = null;
  const build = () => {
    map = new Map();
    const walk = (dir) => {
      let entries = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
        } else {
          const key = e.name.toLowerCase();
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(join(dir, e.name));
        }
      }
    };
    walk(root);
  };
  return {
    get(name) {
      if (!map) build();
      return map.get(name.toLowerCase()) || [];
    },
  };
}

function pickBest(paths, fromDir) {
  if (!paths.length) return null;
  const sameDir = paths.find((p) => dirname(p) === fromDir);
  if (sameDir) return sameDir;
  return [...paths].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0];
}

// Names that hold secrets or tool internals: never embedded, wherever they are.
const SECRET_BASENAME = /^\.env(?:\..*)?$|\.(?:pem|key|p12|pfx|ppk|kdbx)$|^id_(?:rsa|dsa|ecdsa|ed25519)|^credentials?[^/]*\.json$/i;

/**
 * May this file be read into a document? Only files that really live inside the vault (or the note's own folder),
 * after links and ".." are resolved, and never secret files or .git. Without this, ![[../../.env.local]] in a note
 * would copy the file's text into a PDF that then gets sent to somebody.
 */
function allowedFile(abs, ctx, fromDir) {
  let real;
  try {
    real = realpathSync(abs);
  } catch {
    return false;
  }
  if (SECRET_BASENAME.test(basename(real))) return false;
  for (const root of [ctx.vaultRoot, fromDir]) {
    if (!root) continue;
    let realRoot;
    try {
      realRoot = realpathSync(root);
    } catch {
      continue;
    }
    const rel = relative(realRoot, real);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) continue;
    if (rel.split(sep).some((part) => part.toLowerCase() === '.git')) continue;
    return true;
  }
  return false;
}

/** Resolve a link target ("Note", "folder/Note", "pic.png") to an absolute file, or null. */
function resolveTarget(target, fromDir, ctx, { note }) {
  const allowed = (p) => allowedFile(p, ctx, fromDir);
  const clean = target.trim().replace(/\\/g, '/');
  if (!clean) return null;
  const tries = [];
  if (note && !/\.[A-Za-z0-9]{1,5}$/.test(clean)) tries.push(`${clean}.md`);
  tries.push(clean);
  if (clean.includes('/')) {
    for (const t of tries) {
      for (const base of [ctx.vaultRoot, fromDir]) {
        const p = join(base, t);
        if (existsSync(p) && statSync(p).isFile() && allowed(p)) return p;
      }
    }
  }
  const leaf = clean.split('/').pop();
  const names = note && !/\.[A-Za-z0-9]{1,5}$/.test(leaf) ? [`${leaf}.md`, leaf] : [leaf];
  for (const n of names) {
    const hits = ctx.index.get(n).filter(allowed);
    if (clean.includes('/')) {
      const suffix = `/${tries[0]}`.toLowerCase();
      const filtered = hits.filter((h) => h.replace(/\\/g, '/').toLowerCase().endsWith(suffix));
      if (filtered.length) return pickBest(filtered, fromDir);
    }
    const best = pickBest(hits, fromDir);
    if (best) return best;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------------------------
const PH_OPEN = '';
const PH_CLOSE = '';

function makeStore() {
  const items = [];
  return {
    add(kind, text) {
      items.push(text);
      return `${PH_OPEN}${kind}${items.length - 1}${PH_CLOSE}`;
    },
    get: (i) => items[i],
  };
}

function encodePath(p) {
  return p.replace(/[%()# ]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

function relPath(abs, outDir) {
  const rel = relative(outDir, abs);
  const out = (rel && !/^[A-Za-z]:/.test(rel) ? rel : abs).split(sep).join('/');
  return encodePath(out);
}

const normHeading = (s) => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const stripMd = (name) => name.replace(/\.md$/i, '');

/** Plain text for a wikilink body such as "Note#Heading|alias". */
function wikilinkText(inner) {
  const parts = inner.split(/\\?\|/);
  const target = parts[0].trim();
  const alias = parts.slice(1).join('|').trim();
  if (alias) return alias;
  const hash = target.indexOf('#');
  const name = (hash === -1 ? target : target.slice(0, hash)).trim();
  const section = hash === -1 ? '' : target.slice(hash + 1).trim();
  const leaf = stripMd(name.split('/').pop() || '');
  if (!section || section.startsWith('^')) return leaf || 'this note';
  return leaf ? `${leaf} > ${section}` : section;
}

export function wikilinksToText(text) {
  return text.replace(/\[\[([^\[\]\n]+?)\]\]/g, (_m, inner) => wikilinkText(inner));
}

// ---------------------------------------------------------------------------------------------
// Code protection
// ---------------------------------------------------------------------------------------------
/** Replace fenced code, inline code and display maths by placeholders. Obsidian-only blocks are dropped. */
function protect(text, store) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(\s*)(`{3,}|~{3,})\s*([^\s`{]*)(.*)$/);
    if (!m) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const [, indent, fence, lang] = m;
    let j = i + 1;
    const closeRe = new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    while (j < lines.length && !closeRe.test(lines[j])) j++;
    const block = lines.slice(i, Math.min(j + 1, lines.length));
    i = j + 1;
    const langLower = lang.toLowerCase();
    if (OBSIDIAN_BLOCKS.has(langLower)) continue; // dropped
    if (langLower === 'mermaid') block[0] = `${indent}${fence}{mermaid}`;
    out.push(store.add('F', block.join('\n')));
  }
  let t = out.join('\n');
  t = t.replace(/\$\$[\s\S]*?\$\$/g, (m) => store.add('M', m));
  t = t.replace(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (m) => store.add('C', m));
  return t;
}

function restore(text, store) {
  const lines = text.split('\n').flatMap((line) => {
    const m = line.match(new RegExp(`^(\\s*(?:>\\s?)*)${PH_OPEN}E(\\d+)${PH_CLOSE}\\s*$`));
    if (!m) return [line];
    const body = store.get(Number(m[2])).split('\n');
    return body.map((l) => (l ? m[1] + l : m[1].trimEnd()));
  });
  return lines.join('\n').replace(new RegExp(`${PH_OPEN}[CFME](\\d+)${PH_CLOSE}`, 'g'), (_m, n) => store.get(Number(n)));
}

// ---------------------------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------------------------
function extractSection(content, ref) {
  const lines = content.split('\n');
  if (ref.startsWith('^')) {
    const id = ref.slice(1);
    const idx = lines.findIndex((l) => new RegExp(`(^|\\s)\\^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l));
    if (idx === -1) return null;
    let a = idx;
    let b = idx;
    while (a > 0 && lines[a - 1].trim()) a--;
    while (b + 1 < lines.length && lines[b + 1].trim()) b++;
    return lines.slice(a, b + 1).join('\n');
  }
  const wanted = normHeading(ref.split('#').pop());
  const idx = lines.findIndex((l) => {
    const m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    return m && normHeading(m[2]) === wanted;
  });
  if (idx === -1) return null;
  const level = lines[idx].match(/^#+/)[0].length;
  let end = lines.length;
  for (let k = idx + 1; k < lines.length; k++) {
    const m = lines[k].match(/^(#{1,6})\s/);
    if (m && m[1].length <= level) {
      end = k;
      break;
    }
  }
  return lines.slice(idx, end).join('\n');
}

function parseEmbed(inner) {
  const parts = inner.split(/\\?\|/);
  const target = parts[0].trim();
  let width = null;
  let height = null;
  const alts = [];
  for (const p of parts.slice(1)) {
    const s = p.trim();
    const size = s.match(/^(\d+)(?:x(\d+))?$/);
    if (size) {
      width = size[1];
      height = size[2] || null;
    } else if (s) alts.push(s);
  }
  const hash = target.indexOf('#');
  return {
    file: (hash === -1 ? target : target.slice(0, hash)).trim(),
    ref: hash === -1 ? '' : target.slice(hash + 1).trim(),
    width,
    height,
    alt: alts.join(' '),
  };
}

function expandEmbed(inner, ctx, state) {
  const e = parseEmbed(inner);
  const ext = extname(e.file).toLowerCase();
  const fromDir = ctx.fromDir;
  const record = (kind, found) => ctx.embeds.push({ target: inner.split('|')[0].trim(), kind, found });

  if (DROP_EXT.has(ext)) {
    ctx.warnings.push(`Left out ${e.file}: ${ext} files only work inside Obsidian.`);
    record('dropped', false);
    return '';
  }

  if (IMAGE_EXT.has(ext)) {
    const abs = resolveTarget(e.file, fromDir, ctx, { note: false });
    if (!abs) ctx.warnings.push(`I could not find the image: ${e.file}`);
    record('image', !!abs);
    const path = abs ? relPath(abs, ctx.outDir) : encodePath(e.file);
    const attrs = [e.width ? `width=${e.width}px` : '', e.height ? `height=${e.height}px` : ''].filter(Boolean).join(' ');
    return `![${e.alt.replace(/[\[\]]/g, '')}](${path})${attrs ? `{${attrs}}` : ''}`;
  }

  if (LINK_EXT.has(ext)) {
    const abs = resolveTarget(e.file, fromDir, ctx, { note: false });
    if (!abs) ctx.warnings.push(`I could not find the file: ${e.file}`);
    record('file', !!abs);
    return `[${e.alt || basename(e.file)}](${abs ? relPath(abs, ctx.outDir) : encodePath(e.file)})`;
  }

  // A note.
  const label = stripMd(e.file.split('/').pop() || e.file);
  if (state.depth >= MAX_EMBED_DEPTH) {
    ctx.warnings.push(`Did not open "${label}" inside another embedded note (only one level is copied).`);
    record('note', false);
    return `*${label}*`;
  }
  const abs = e.file ? resolveTarget(e.file, fromDir, ctx, { note: true }) : null;
  if (!abs) {
    ctx.warnings.push(`I could not find the note to embed: ${e.file || inner}`);
    record('note', false);
    return `*[note not found: ${label}]*`;
  }
  if (!/\.(?:md|markdown)$/i.test(abs)) {
    ctx.warnings.push(`Only Markdown notes can be embedded, so I left out ${label}.`);
    record('note', false);
    return `*[not a note: ${label}]*`;
  }
  record('note', true);
  let content = readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n');
  content = splitFrontmatter(content).body;
  if (e.ref) {
    const section = extractSection(content, e.ref);
    if (section === null) {
      ctx.warnings.push(`I could not find "${e.ref}" in ${label}.`);
      return `*[section not found: ${label} > ${e.ref}]*`;
    }
    content = section;
  }
  const sub = { ...ctx, fromDir: dirname(abs) };
  return `\n${convertBody(content, sub, { depth: state.depth + 1 }).trim()}\n`;
}

// ---------------------------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------------------------
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Convert callouts in an array of lines. Returns { lines, depth } where depth is the callout nesting. */
function convertCallouts(lines) {
  const out = [];
  let maxDepth = 0;
  let i = 0;
  const pushBlank = () => {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
  };
  while (i < lines.length) {
    const m = lines[i].match(/^\s{0,3}>\s?\[!([A-Za-z][\w-]*)\]([+-]?)[ \t]*(.*)$/);
    if (!m) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const type = m[1].toLowerCase();
    const fold = m[2];
    const title = m[3].trim().replace(/"/g, "'");
    const body = [];
    let j = i + 1;
    while (j < lines.length && /^\s{0,3}>/.test(lines[j])) {
      body.push(lines[j].replace(/^\s{0,3}>\s?/, ''));
      j++;
    }
    i = j;
    const inner = convertCallouts(body);
    while (inner.lines.length && !inner.lines[0].trim()) inner.lines.shift();
    while (inner.lines.length && !inner.lines[inner.lines.length - 1].trim()) inner.lines.pop();

    pushBlank();
    if (QUOTE_CALLOUTS.has(type)) {
      if (title) out.push(`> **${title}**`, '>');
      for (const l of inner.lines) out.push(l ? `> ${l}` : '>');
      maxDepth = Math.max(maxDepth, inner.depth);
    } else {
      const mapped = CALLOUT_MAP[type] || 'note';
      const attrs = [`.callout-${mapped}`];
      const shownTitle = title || (fold || mapped !== type ? capital(type) : '');
      if (shownTitle) attrs.push(`title="${shownTitle}"`);
      if (fold) attrs.push(`collapse="${fold === '-' ? 'true' : 'false'}"`);
      const colons = ':'.repeat(3 + inner.depth);
      out.push(`${colons} {${attrs.join(' ')}}`, '', ...inner.lines, '', colons);
      maxDepth = Math.max(maxDepth, inner.depth + 1);
    }
    out.push('');
  }
  return { lines: out, depth: maxDepth };
}

// ---------------------------------------------------------------------------------------------
// Body conversion
// ---------------------------------------------------------------------------------------------
const TAG_RE = /(^|\s)#[A-Za-z][\w/-]*(?=\s|$|[.,;:!?)])/g;

function convertBody(text, ctx, state = { depth: 0 }) {
  const store = makeStore();
  let t = protect(text.replace(/\r\n?/g, '\n'), store);

  // Comments: %%...%%
  t = t.replace(/%%[\s\S]*?%%/g, '');
  if (t.includes('%%')) {
    ctx.warnings.push('There is a "%%" with no closing "%%". I left it in place.');
  }

  // Embeds
  t = t
    .split('\n')
    .map((line) => {
      if (!line.includes('![[')) return line;
      return line.replace(/!\[\[([^\[\]\n]+?)\]\]/g, (_m, inner) => {
        const out = expandEmbed(inner, ctx, state);
        return out ? store.add('E', out) : '';
      });
    })
    .join('\n');

  // Callouts
  t = convertCallouts(t.split('\n')).lines.join('\n');

  // Wikilinks -> text
  t = wikilinksToText(t);

  // ==highlight== -> [highlight]{.mark}
  t = t.replace(/==(?=\S)([^=\n]+?)(?<=\S)==/g, '[$1]{.mark}');

  // Block ids and tags
  t = t
    .split('\n')
    .map((line) => {
      let l = line;
      if (!ctx.keepTags) {
        const stripped = l.replace(TAG_RE, '$1');
        if (stripped !== l) l = stripped.replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/[ \t]+$/, '');
      }
      l = l.replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/, '');
      if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(l)) return null;
      return l;
    })
    .filter((l) => l !== null)
    .join('\n');

  t = restore(t, store);
  return t.replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------------------------
function dropKeys(raw, keys) {
  const out = [];
  let skipping = false;
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (m) {
      skipping = keys.has(m[1].toLowerCase());
      if (skipping) continue;
    } else if (skipping && (/^\s+\S/.test(line) || /^-\s/.test(line) || !line.trim())) {
      continue;
    } else {
      skipping = false;
    }
    out.push(line);
  }
  return out.join('\n');
}

const yamlQuote = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function buildFrontmatter(raw, data, title) {
  let fm = wikilinksToText(dropKeys(raw, OBSIDIAN_KEYS)).replace(/\s+$/, '');
  if (!('title' in data) || data.title === '' || data.title === null) {
    fm = `title: ${yamlQuote(title)}${fm ? `\n${fm}` : ''}`;
  }
  return `---\n${fm}\n---\n`;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------
/**
 * Convert Obsidian Markdown to Quarto Markdown.
 * opts: { notePath, vaultRoot, outDir, keepTags }
 * Returns { qmd, title, warnings, embeds }.
 */
export function convertNote(markdown, opts = {}) {
  const notePath = resolve(opts.notePath || 'note.md');
  const vaultRoot = resolve(opts.vaultRoot || findVaultRoot(notePath));
  const ctx = {
    vaultRoot,
    index: opts.index || makeIndex(vaultRoot),
    fromDir: dirname(notePath),
    outDir: resolve(opts.outDir || dirname(notePath)),
    keepTags: !!opts.keepTags,
    warnings: [],
    embeds: [],
  };
  const text = markdown.replace(/\r\n?/g, '\n');
  const { data, body, raw } = splitFrontmatter(text);

  let content = body;
  let title = typeof data.title === 'string' && data.title ? data.title : '';
  if (!title) {
    const h1 = content.match(/^\s*#[ \t]+([^\n]+?)[ \t]*#*[ \t]*(?:\n|$)/);
    if (h1 && content.slice(0, h1.index + h1[0].length).split('\n').filter((l) => l.trim()).length === 1) {
      title = wikilinksToText(h1[1]).trim();
      content = content.slice(h1.index + h1[0].length);
    }
  }
  if (!title) title = basename(notePath).replace(/\.[^.]+$/, '');

  const converted = convertBody(content, ctx).replace(/^\s+/, '').replace(/\s+$/, '');
  const frontmatter = buildFrontmatter(raw, data, title);
  return { qmd: `${frontmatter}\n${converted}\n`, title, warnings: ctx.warnings, embeds: ctx.embeds };
}

/** Read a note from disk, convert it, and (when `out` is given) write the .qmd. */
export function prerenderFile(notePath, { out = null, vault = null, keepTags = false } = {}) {
  const abs = resolve(notePath);
  const markdown = readFileSync(abs, 'utf8');
  const outAbs = out ? resolve(out) : null;
  const result = convertNote(markdown, {
    notePath: abs,
    vaultRoot: findVaultRoot(abs, vault),
    outDir: outAbs ? dirname(outAbs) : dirname(abs),
    keepTags,
  });
  if (outAbs) writeText(outAbs, result.qmd);
  return { ...result, out: outAbs };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
const HELP = `qmd-prerender: turn an Obsidian note into a Quarto .qmd file.

Usage:
  node system/scripts/qmd-prerender.mjs <note.md> [--out file.qmd] [--vault <folder>] [--json] [--keep-tags]

Options:
  --out <file>    Write the .qmd here. Without it the text is printed.
  --vault <dir>   The vault folder, used to find embedded notes and images.
                  Default: the nearest parent folder with .obsidian, else the project vault.
  --json          Print a JSON report (title, warnings, embeds, output path).
  --keep-tags     Keep #tags in the text (they are removed by default).
  -h, --help      Show this help.

Exit codes: 0 done, 1 done with warnings (for example a missing embed), 2 usage error.
`;

export function main(argv = process.argv.slice(2)) {
  const o = { note: null, out: null, vault: null, json: false, keepTags: false, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) o.error = `${a} needs a value.`;
      return v;
    };
    if (a === '--') continue;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--out') o.out = next();
    else if (a === '--vault') o.vault = next();
    else if (a === '--json') o.json = true;
    else if (a === '--keep-tags') o.keepTags = true;
    else if (a.startsWith('-')) o.error = `Unknown option ${a}.`;
    else if (o.note) o.error = 'Please give me one note at a time.';
    else o.note = a;
  }
  if (o.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (o.error || !o.note) {
    process.stderr.write(`${o.error || 'Please give me the note to convert.'}\n\n${HELP}`);
    return 2;
  }
  const abs = resolve(o.note);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    process.stderr.write(`I cannot find the note: ${o.note}\n`);
    return 2;
  }
  if (o.vault && !existsSync(resolve(o.vault))) {
    process.stderr.write(`I cannot find the vault folder: ${o.vault}\n`);
    return 2;
  }

  const r = prerenderFile(abs, { out: o.out, vault: o.vault, keepTags: o.keepTags });
  const ok = r.warnings.length === 0;
  if (o.json) {
    const report = { ok, title: r.title, out: r.out, warnings: r.warnings, embeds: r.embeds };
    if (!r.out) report.qmd = r.qmd;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    if (r.out) process.stdout.write(`Wrote ${r.out}\n`);
    else process.stdout.write(r.qmd);
    for (const w of r.warnings) process.stderr.write(`Warning: ${w}\n`);
  }
  return ok ? 0 : 1;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main();
