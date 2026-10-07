// Raw-first ingestion (spec section 9).
//
//   node system/scripts/ingest.mjs <file-or-folder>... [--latest-only] [--kind <kind>]
//        [--origin "<text>"] [--json]
//
// For every new file: sha256, raw copy with provenance, extracted text (when we
// can), and one line in vault/40_sources/manifest.jsonl. Raw files are never
// edited or deleted. The /ingest skill then writes the source notes.
//
// Environment (optional):
//   ALTERBRAIN_NO_MARKITDOWN=1   never try "uvx markitdown" (used by tests)
//   ALTERBRAIN_MAX_RAW_BYTES=n   change the 100 MB "keep local only" limit (used by tests)
//
// Safety: files that look like secrets are never copied into the vault (a vault is saved and backed up online).
// A file whose NAME looks like one (.env, *.pem, id_rsa, credentials*.json, a password export) is skipped, and a file
// whose TEXT holds a password or key is removed again right after the copy. The record keeps only the file name
// unless --origin says otherwise, so folder and user names stay out of the manifest.
//
// Exit codes: 0 all fine, 1 a file could not be ingested or a path is missing, 2 wrong usage.
import {
  constants,
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, toRel, isMainModule } from '../lib/paths.mjs';
import { appendLine, ensureDir, sha256File, today, writeText } from '../lib/fsx.mjs';
import { cmpVersion } from '../lib/proc.mjs';
import { findSecret } from '../hooks/block_secrets.mjs';

export const KINDS = ['pdf', 'web', 'email', 'doc', 'slides', 'sheet', 'transcript', 'other'];
const MAX_RAW_BYTES = () => Number(process.env.ALTERBRAIN_MAX_RAW_BYTES) || 100 * 1024 * 1024;
const MAX_INLINE_TEXT_BYTES = 25 * 1024 * 1024; // html/csv are read into memory only below this

// ---------------------------------------------------------------- junk
const JUNK_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.localized', 'ehthumbs.db']);
const JUNK_DIRS = new Set(['.git', 'node_modules', '.obsidian', '__macosx', '$recycle.bin', '.trash', '.trashes', '.spotlight-v100', '.fseventsd']);

export function isJunk(name) {
  const n = name.toLowerCase();
  if (JUNK_NAMES.has(n)) return true;
  if (n.startsWith('~$')) return true; // Office lock files
  if (n.startsWith('._')) return true; // macOS resource forks
  if (n.startsWith('.~lock.')) return true; // LibreOffice lock files
  if (n.endsWith('.tmp') || n.endsWith('.crdownload') || n.endsWith('.part')) return true;
  return false;
}

// ---------------------------------------------------------------- secrets
const SECRET_NAME = [
  /^\.env(?:\..+)?$/i, // .env, .env.local (but see the template check below)
  /\.(?:pem|p12|pfx|jks|keystore|ppk|kdbx|kdb|1pux|opvault)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?$/i,
  /^(?:credentials?|client_secrets?|service[-_ ]?account)[^/\\]*\.json$/i,
  /^\.(?:npmrc|netrc|pgpass|pypirc|git-credentials)$/i,
  /pass(?:word|wd)s?[^/\\]*\.(?:csv|json|txt|xlsx?|tsv)$/i,
  /^secrets?[^/\\]*\.(?:json|ya?ml|txt|env)$/i,
];
const SECRET_DIR = /(^|[\\/])\.(?:ssh|aws|gnupg|kube|docker|azure)([\\/]|$)/i;

/** True when a file's name or folder says it holds secrets (a template such as .env.example is fine). */
export function looksLikeSecretFile(absOrName) {
  const p = String(absOrName);
  const name = p.split(/[\\/]/).pop() || '';
  if (/\.(?:example|sample|template|dist)$/i.test(name)) return false;
  return SECRET_NAME.some((re) => re.test(name)) || SECRET_DIR.test(p);
}

// ".key" is a Keynote file as often as a private key, so it is judged by its content, not by its name.
const SCANNABLE_RAW = new Set(['.key', '.md', '.markdown', '.txt', '.text', '.log', '.rst', '.org', '.tex', '.vtt', '.srt', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.html', '.htm', '.eml', '.mbox']);

/** First high-confidence secret in the raw copy (text types only) or its extracted text, or null. Never returns the secret. */
function secretIn(rawAbs, ext, textAbs, textStatus) {
  const texts = [];
  try {
    if (SCANNABLE_RAW.has(ext) && statSync(rawAbs).size <= 8 * 1024 * 1024) texts.push(readFileSync(rawAbs, 'utf8'));
    if (textStatus === 'done') texts.push(readFileSync(textAbs, 'utf8'));
  } catch {
    return null;
  }
  for (const t of texts) {
    const hit = findSecret(t);
    if (hit && hit.level === 'high') return hit;
  }
  return null;
}

// ---------------------------------------------------------------- names
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A file name that is safe on Windows and macOS. Keeps spaces and the extension. */
export function sanitiseName(original, maxLength = 140) {
  // Clean first (path separators and ":" would confuse path.parse), then split off the extension.
  const cleaned = String(original)
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const { name, ext } = parse(cleaned);
  let stem = name.replace(/[. ]+$/, '');
  const ext2 = ext.replace(/[. ]+$/, '');
  if (!stem) stem = 'file';
  if (RESERVED.test(stem)) stem = `_${stem}`;
  if (stem.length + ext2.length > maxLength) stem = stem.slice(0, Math.max(10, maxLength - ext2.length)).trim();
  return stem + ext2;
}

function uniqueName(dir, name) {
  if (!existsSync(join(dir, name))) return name;
  const { name: stem, ext } = parse(name);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  throw new Error(`too many files called ${name}`);
}

// ---------------------------------------------------------------- kinds
const KIND_BY_EXT = {
  '.pdf': 'pdf',
  '.html': 'web', '.htm': 'web', '.mhtml': 'web',
  '.eml': 'email', '.msg': 'email', '.mbox': 'email',
  '.doc': 'doc', '.docx': 'doc', '.odt': 'doc', '.rtf': 'doc', '.txt': 'doc', '.md': 'doc', '.markdown': 'doc', '.pages': 'doc', '.epub': 'doc',
  '.ppt': 'slides', '.pptx': 'slides', '.key': 'slides', '.odp': 'slides',
  '.xls': 'sheet', '.xlsx': 'sheet', '.xlsm': 'sheet', '.csv': 'sheet', '.tsv': 'sheet', '.ods': 'sheet', '.numbers': 'sheet',
  '.vtt': 'transcript', '.srt': 'transcript',
};

export function inferKind(name) {
  const ext = extname(name).toLowerCase();
  if (/transcript/i.test(name)) return 'transcript';
  return KIND_BY_EXT[ext] || 'other';
}

// Types we cannot read as text at all.
const NO_TEXT_EXTS = new Set([
  '.zip', '.7z', '.rar', '.gz', '.tar', '.tgz', '.bz2', '.xz', '.exe', '.dll', '.msi', '.dmg', '.iso', '.bin',
  '.mp3', '.m4a', '.wav', '.flac', '.ogg', '.mp4', '.mov', '.avi', '.mkv', '.webm',
]);
const COPY_TEXT_EXTS = new Set(['.md', '.markdown', '.txt', '.text', '.log', '.rst', '.org', '.tex', '.vtt', '.srt']);
const FENCE_EXTS = { '.csv': 'csv', '.tsv': 'tsv', '.json': 'json', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.ini': 'ini' };

// ---------------------------------------------------------------- text extraction
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', euro: '€', pound: '£',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Strip HTML to readable markdown-ish text. */
export function htmlToText(html) {
  let s = html.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');
  const title = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  s = s.replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|article|header|footer|tr|ul|ol|table|blockquote|pre|figure|main|aside)>/gi, '\n\n');
  s = s.replace(/<\/t[dh]>/gi, ' | ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (title && !/^#\s/m.test(s.slice(0, 200))) {
    const t = decodeEntities(title).replace(/\s+/g, ' ').trim();
    if (t) s = `# ${t}\n\n${s}`;
  }
  return s + '\n';
}

/** Keep delimited or structured text as a fenced block (long enough fence to be safe). */
export function toFenced(text, lang) {
  const body = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').trimEnd();
  let fence = '```';
  while (body.includes(fence)) fence += '`';
  return `${fence}${lang}\n${body}\n${fence}\n`;
}

let markitdownState; // undefined = not checked yet
function markitdownAvailable() {
  if (process.env.ALTERBRAIN_NO_MARKITDOWN === '1') return false;
  if (markitdownState === undefined) {
    const probe = spawnSync('uvx', ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
    markitdownState = probe.status === 0 && !probe.error;
  }
  return markitdownState;
}

function runMarkitdown(file) {
  const res = spawnSync('uvx', ['markitdown', file], {
    encoding: 'utf8',
    timeout: 180_000,
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (res.status === 0 && !res.error && res.stdout && res.stdout.trim()) return { ok: true, text: res.stdout };
  const why = (res.error?.message || res.stderr || 'no text came back').toString().split(/\r?\n/).find((l) => l.trim()) || 'no text came back';
  return { ok: false, why: why.trim().slice(0, 200) };
}

/**
 * Extract text from the raw copy into `textAbs`.
 * Returns { status: 'done'|'pending'|'none', note }.
 */
function extractText(rawAbs, textAbs, size) {
  const ext = extname(rawAbs).toLowerCase();
  if (COPY_TEXT_EXTS.has(ext)) {
    ensureDir(dirname(textAbs));
    copyFileSync(rawAbs, textAbs, constants.COPYFILE_EXCL);
    return { status: 'done', note: null };
  }
  if ((ext === '.html' || ext === '.htm') && size <= MAX_INLINE_TEXT_BYTES) {
    writeText(textAbs, htmlToText(readFileSync(rawAbs, 'utf8')));
    return { status: 'done', note: null };
  }
  if (FENCE_EXTS[ext] && size <= MAX_INLINE_TEXT_BYTES) {
    writeText(textAbs, toFenced(readFileSync(rawAbs, 'utf8'), FENCE_EXTS[ext]));
    return { status: 'done', note: null };
  }
  if (NO_TEXT_EXTS.has(ext)) return { status: 'none', note: 'No text can be read from this type of file.' };
  if (markitdownAvailable()) {
    const res = runMarkitdown(rawAbs);
    if (res.ok) {
      writeText(textAbs, res.text.replace(/\r\n/g, '\n'));
      return { status: 'done', note: null };
    }
    return { status: 'pending', note: `markitdown could not read it (${res.why}). Claude will read it directly later.` };
  }
  return { status: 'pending', note: 'Claude will read this file directly later.' };
}

// ---------------------------------------------------------------- manifest
const manifestFile = () => rootPath('vault', '40_sources', 'manifest.jsonl');

/** Map of sha256 -> manifest entry. Bad lines are skipped, never fatal. */
export function loadManifest() {
  const map = new Map();
  let bad = 0;
  if (!existsSync(manifestFile())) return { map, bad };
  for (const line of readFileSync(manifestFile(), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e.sha256 === 'string') map.set(e.sha256, e);
      else bad++;
    } catch {
      bad++;
    }
  }
  return { map, bad };
}

// ---------------------------------------------------------------- collecting files
/**
 * Expand files and folders into a list of { abs, junk } plus missing paths.
 * Symbolic links inside folders are never followed.
 */
function collect(paths) {
  const files = [];
  const missing = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (JUNK_DIRS.has(e.name.toLowerCase())) continue;
        walk(abs);
      } else if (e.isFile()) {
        files.push({ abs, junk: isJunk(e.name) });
      }
    }
  };
  for (const p of paths) {
    const abs = resolve(p);
    let st;
    try {
      st = statSync(abs);
    } catch {
      missing.push(p);
      continue;
    }
    if (st.isDirectory()) walk(abs);
    else if (st.isFile()) files.push({ abs, junk: isJunk(basename(abs)) });
  }
  // The same file named twice is only handled once.
  const seen = new Set();
  const unique = files.filter((f) => {
    const key = process.platform === 'win32' ? f.abs.toLowerCase() : f.abs;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { files: unique, missing };
}

// "Name_v0.1.md", "Name v2.docx", "Name (v3).pdf", "Name-V1.2.3.md"
const VERSION_RE = /^(.+?)(?:[\s._-]+|[\s._-]*[[(])v(\d+(?:\.\d+)*)[\])]?$/i;

/** Split items into keepers and older versions that --latest-only drops. */
export function applyLatestOnly(items) {
  const groups = new Map();
  const result = { keep: [], dropped: [] };
  for (const item of items) {
    const { name, ext } = parse(item.abs);
    const m = VERSION_RE.exec(name);
    if (!m) {
      result.keep.push(item);
      continue;
    }
    const key = [dirname(item.abs).toLowerCase(), ext.toLowerCase(), m[1].trim().toLowerCase()].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ item, version: m[2] });
  }
  for (const members of groups.values()) {
    if (members.length === 1) {
      result.keep.push(members[0].item);
      continue;
    }
    let best = members[0];
    for (const m of members.slice(1)) {
      const c = cmpVersion(m.version, best.version);
      if (c > 0 || (c === 0 && statSync(m.item.abs).mtimeMs > statSync(best.item.abs).mtimeMs)) best = m;
    }
    for (const m of members) {
      if (m === best) result.keep.push(m.item);
      else result.dropped.push({ item: m.item, supersededBy: best.item.abs });
    }
  }
  return result;
}

// ---------------------------------------------------------------- ingest
/**
 * Ingest files and folders. Returns a summary object (see CLI --json).
 * Options: { latestOnly, kind, origin }
 */
export async function ingest(paths, { latestOnly = false, kind = null, origin = null } = {}) {
  const { files, missing } = collect(paths);
  const records = [];
  const date = today();
  const year = date.slice(0, 4);
  const sourcesDir = rootPath('vault', '40_sources');
  const { map: known, bad: badLines } = loadManifest();

  for (const f of files.filter((x) => x.junk)) records.push({ path: f.abs, status: 'skipped', reason: 'junk' });
  let candidates = files.filter((x) => !x.junk);
  for (const f of candidates.filter((x) => looksLikeSecretFile(x.abs))) {
    records.push({ path: f.abs, status: 'skipped', reason: 'looks like a password or key file, so it was not copied' });
  }
  candidates = candidates.filter((x) => !looksLikeSecretFile(x.abs));

  if (latestOnly) {
    const { keep, dropped } = applyLatestOnly(candidates);
    candidates = keep;
    for (const d of dropped) {
      records.push({ path: d.item.abs, status: 'skipped', reason: 'older-version', superseded_by: d.supersededBy });
    }
  }
  candidates.sort((a, b) => a.abs.localeCompare(b.abs, 'en'));

  for (const f of candidates) {
    const rec = { path: f.abs, status: 'error' };
    const created = [];
    try {
      const st = statSync(f.abs);
      if (st.size === 0) {
        records.push({ path: f.abs, status: 'skipped', reason: 'empty' });
        continue;
      }
      const sha = await sha256File(f.abs);
      const existing = known.get(sha);
      if (existing) {
        records.push({ path: f.abs, status: 'duplicate', id: existing.id, sha256: sha, stored: existing.stored });
        continue;
      }

      const localOnly = st.size > MAX_RAW_BYTES();
      const rawDir = localOnly ? join(sourcesDir, 'raw', '_local') : join(sourcesDir, 'raw', year);
      ensureDir(rawDir);
      const rawName = uniqueName(rawDir, `${date} ${sanitiseName(basename(f.abs))}`);
      const rawAbs = join(rawDir, rawName);
      copyFileSync(f.abs, rawAbs, constants.COPYFILE_EXCL);
      created.push(rawAbs);
      if (statSync(rawAbs).size !== st.size) throw new Error('the copy is not the same size as the original');

      const textDir = join(sourcesDir, 'text', year);
      const textBase = extname(rawName).toLowerCase() === '.md' ? rawName : `${rawName}.md`;
      const textAbs = join(textDir, existsSync(textDir) ? uniqueName(textDir, textBase) : textBase);
      const ext = extname(f.abs).toLowerCase();
      const text = extractText(rawAbs, textAbs, st.size);
      if (text.status === 'done') created.push(textAbs);
      const hit = secretIn(rawAbs, ext, textAbs, text.status);
      if (hit) {
        for (const c of created) {
          try {
            unlinkSync(c); // only files this run just created
          } catch {
            /* ignore */
          }
        }
        records.push({ path: f.abs, status: 'skipped', reason: `it holds ${hit.kind}, so it was not stored (keys belong in .env.local)` });
        continue;
      }

      const entry = {
        id: sha.slice(0, 8),
        sha256: sha,
        origin: origin ?? basename(f.abs), // the file name only: folder and user names stay out of the manifest
        stored: toRel(rawAbs),
        text: text.status === 'done' ? toRel(textAbs) : null,
        text_status: text.status,
        size: st.size,
        ext,
        kind: kind ?? inferKind(basename(f.abs)),
        ingested: new Date().toISOString(),
        local_only: localOnly,
        note: text.note ?? (localOnly ? 'Too big for git, so it stays on this computer only.' : null),
      };
      appendLine(manifestFile(), JSON.stringify(entry));
      known.set(sha, entry);
      records.push({ path: f.abs, status: 'new', ...entry });
    } catch (e) {
      for (const c of created) {
        try {
          unlinkSync(c); // only files this run just created
        } catch {
          /* ignore */
        }
      }
      records.push({ ...rec, reason: String(e?.message || e) });
    }
  }
  for (const m of missing) records.push({ path: resolve(m), status: 'error', reason: 'not found' });

  const count = (s) => records.filter((r) => r.status === s).length;
  const added = records.filter((r) => r.status === 'new');
  const counts = {
    found: files.length,
    new: added.length,
    duplicate: count('duplicate'),
    skipped: count('skipped'),
    error: count('error'),
    text_pending: added.filter((r) => r.text_status === 'pending').length,
    local_only: added.filter((r) => r.local_only).length,
  };
  return { ok: counts.error === 0, counts, manifest: toRel(manifestFile()), manifest_bad_lines: badLines, files: records };
}

// ---------------------------------------------------------------- CLI
const USAGE = `ingest: copies files into your vault with provenance (the raw copy is never changed)

  node system/scripts/ingest.mjs <file-or-folder>... [--latest-only] [--kind <kind>] [--origin "<text>"] [--json]

  --latest-only   for files like Report_v0.1.md and Report_v1.0.md, keep only the newest
  --kind          one of: ${KINDS.join(', ')} (default: guessed from the file type)
  --origin        where the files came from (default: the file name only)
  --json          machine-readable output`;

export async function run(argv) {
  const paths = [];
  const opts = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (flag === '--json') json = true;
    else if (flag === '--latest-only') opts.latestOnly = true;
    else if (flag === '--help') {
      console.log(USAGE);
      return 0;
    } else if (flag === '--kind' || flag === '--origin') {
      const value = inline ?? argv[++i];
      if (value === undefined) {
        console.error(`${flag} needs a value.\n\n${USAGE}`);
        return 2;
      }
      opts[flag.slice(2)] = value;
    } else if (a.startsWith('--')) {
      console.error(`I do not know the option ${flag}.\n\n${USAGE}`);
      return 2;
    } else paths.push(a);
  }
  if (paths.length === 0) {
    console.error(`Tell me which file or folder to ingest.\n\n${USAGE}`);
    return 2;
  }
  if (opts.kind !== undefined && !KINDS.includes(opts.kind)) {
    console.error(`--kind must be one of: ${KINDS.join(', ')}.`);
    return 2;
  }

  const summary = await ingest(paths, opts);
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return summary.ok ? 0 : 1;
  }

  const c = summary.counts;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  console.log(`Ingest finished. I looked at ${plural(c.found, 'file')}.`);
  console.log(`  New:               ${c.new}`);
  console.log(`  Already ingested:  ${c.duplicate}`);
  console.log(`  Skipped:           ${c.skipped}`);
  if (c.error) console.log(`  Problems:          ${c.error}`);
  if (c.text_pending) console.log(`  Claude will read ${plural(c.text_pending, 'file')} directly (no text could be extracted yet).`);
  if (c.local_only) console.log(`  ${plural(c.local_only, 'file')} too big for git, kept on this computer only.`);
  for (const r of summary.files) {
    if (r.status === 'new') console.log(`  + ${r.stored}`);
    else if (r.status === 'duplicate') console.log(`  = ${basename(r.path)} (already in your vault as ${r.id})`);
    else if (r.status === 'skipped' && r.reason !== 'junk') console.log(`  - ${basename(r.path)} (${r.reason === 'older-version' ? 'older version' : r.reason})`);
    else if (r.status === 'error') console.log(`  ! ${r.path}: ${r.reason}`);
  }
  return summary.ok ? 0 : 1;
}

function isMain() {
  return isMainModule(import.meta.url);
}

if (isMain()) run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
