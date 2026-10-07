// Raw-first ingestion (spec section 9).
//
//   node system/scripts/ingest.mjs <file-folder-or-zip>... [--latest-only] [--kind <kind>]
//        [--origin "<text>"] [--course "<Course name>"] [--json]
//
// For every new file: sha256, raw copy with provenance, extracted text (when we
// can), and one line in vault/40_sources/manifest.jsonl. Raw files are never
// edited or deleted. The /ingest skill then writes the source notes.
//
// Zip files (a "download all files" from a learning platform): a .zip named on the command line, or found in a
// folder you name, is unpacked with the computer's own tar (bsdtar, built into Windows 10+ and macOS; unzip on
// other systems) into a fresh private folder under state/local/tmp/. Every file inside then goes through the
// normal path with the origin "<zip name>/<inner path>". The zip itself is NOT stored (it would copy every file a
// second time) and the private folder is always deleted again, even after an error. A zip inside a zip is stored
// as an ordinary file and not opened (opening zips inside zips is how "zip bombs" multiply, and the origin trail
// would get confusing): unzip it yourself if you want its contents. A zip is refused as a whole, and nothing from
// it is used, when it is password protected, holds link entries, holds a path that leads outside its folder
// (zip-slip: "../x", "/x", "C:/x"), holds more files or bytes than the limits below, holds two names that Windows
// and macOS treat as one file ("Notes.md" and "notes.md": one would silently overwrite the other), gives a different
// number of files than it lists, or does not unpack cleanly. The limits apply to each zip on its own.
//
// --course "<Course name>" is written on every new manifest entry as "course" (for the /ingest skill to link notes).
// A file that is already in the vault keeps the course it was first saved with.
//
// Environment (optional):
//   ALTERBRAIN_NO_MARKITDOWN=1   never try "uvx markitdown" (used by tests)
//   ALTERBRAIN_MAX_RAW_BYTES=n   change the 100 MB "keep local only" limit (used by tests)
//   ALTERBRAIN_MAX_ZIP_BYTES=n   most bytes one zip may unpack to (default 2 GB)
//   ALTERBRAIN_MAX_ZIP_FILES=n   most files one zip may hold (default 5000)
//   ALTERBRAIN_NO_ZIP_TOOL=1     pretend this computer has no tool that opens zips (used by tests)
//
// Safety: files that look like secrets are never copied into the vault (a vault is saved and backed up online).
// A file whose NAME looks like one (.env, *.pem, id_rsa, credentials*.json, a password export) is skipped, and a file
// whose TEXT holds a password or key is removed again right after the copy. The record keeps only the file name
// unless --origin says otherwise, so folder and user names stay out of the manifest. The same screening applies to
// every file inside a zip.
//
// Exit codes: 0 all fine, 1 a file could not be ingested or a path is missing, 2 wrong usage.
import {
  constants,
  copyFileSync,
  existsSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, toRel, isMainModule } from '../lib/paths.mjs';
import { appendLine, ensureDir, sha256File, today, writeText } from '../lib/fsx.mjs';
import { cmpVersion } from '../lib/proc.mjs';
import { findSecret } from '../hooks/block_secrets.mjs';

export const KINDS = ['pdf', 'web', 'email', 'doc', 'slides', 'sheet', 'transcript', 'other'];
const MAX_RAW_BYTES = () => Number(process.env.ALTERBRAIN_MAX_RAW_BYTES) || 100 * 1024 * 1024;
const MAX_INLINE_TEXT_BYTES = 25 * 1024 * 1024; // html/csv are read into memory only below this
const envNumber = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const MAX_ZIP_BYTES = () => envNumber('ALTERBRAIN_MAX_ZIP_BYTES', 2 * 1024 * 1024 * 1024); // what one zip may unpack to
const MAX_ZIP_FILES = () => envNumber('ALTERBRAIN_MAX_ZIP_FILES', 5000); // files in one zip
const ZIP_WATCH_MS = 200; // how often the unpacked size is checked while a zip is being opened
const ZIP_TIMEOUT_MS = 15 * 60 * 1000; // a zip that takes longer than this to unpack is given up
const MAX_COURSE_LENGTH = 120;

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

// ---------------------------------------------------------------- zip files
/** A zip that is refused. The message is written for the user and goes into the report as it is. */
class ZipRefusal extends Error {}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmt = (n) => Number(n).toLocaleString('en-GB');

function formatBytes(n) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * True when a name inside a zip points outside the folder it is unpacked into: "../x", "a/../../x", "..\\x",
 * "/x", "C:/x" or "\\\\server\\x". Such names are the "zip-slip" trick. A real download never has them.
 */
export function unsafeZipName(name) {
  const n = String(name);
  if (n.includes('\u0000')) return true;
  const s = n.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[A-Za-z]:/.test(s)) return true;
  return s.split('/').some((segment) => segment === '..');
}

/** True when `candidate` is the folder `root` or something inside it (both paths already resolved). */
export function isInside(root, candidate) {
  const rel = relative(root, candidate);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

const SIG_EOCD = 0x06054b50; // end of central directory
const SIG_CENTRAL = 0x02014b50; // one entry in the central directory
const SIG_EOCD64 = 0x06064b50;
const SIG_LOCATOR64 = 0x07064b50;

function readExactly(fd, length, position) {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = readSync(fd, buf, done, length - done, position + done);
    if (n <= 0) break;
    done += n;
  }
  if (done < length) throw new ZipRefusal('This file ends in .zip but I cannot read it. It may be damaged or only partly downloaded. Download it again and give it to me again.');
  return buf;
}

/**
 * Read the list of entries from the end of a zip (its "central directory") without unpacking anything.
 * Returns [{ name, size, dir, link, encrypted }]. Throws ZipRefusal when the file is not a readable zip.
 */
export function readZipIndex(file) {
  const unreadable = () => new ZipRefusal('This file ends in .zip but I cannot read it. It may be damaged or only partly downloaded. Download it again and give it to me again.');
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    if (size < 22) throw unreadable();
    const tailLength = Math.min(size, 22 + 0xffff + 20);
    const tail = readExactly(fd, tailLength, size - tailLength);
    // The end record is the last one whose comment length reaches exactly to the end of the file. (A comment may
    // itself contain the bytes of an end record; failing that exact fit, take the last signature found.)
    let at = tailLength - 22;
    let fallback = -1;
    for (; at >= 0; at--) {
      if (tail.readUInt32LE(at) !== SIG_EOCD) continue;
      if (at + 22 + tail.readUInt16LE(at + 20) === tailLength) break;
      if (fallback < 0) fallback = at;
    }
    if (at < 0) at = fallback;
    if (at < 0) throw unreadable();
    if (tail.readUInt16LE(at + 4) !== 0 || tail.readUInt16LE(at + 6) !== 0) {
      throw new ZipRefusal('This zip is split over several files, which I cannot open. Unzip it yourself and give me the folder.');
    }
    let total = tail.readUInt16LE(at + 10);
    let cdSize = tail.readUInt32LE(at + 12);
    let cdOffset = tail.readUInt32LE(at + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      // A "zip64" file (very many files, or files over 4 GB): the real numbers sit in an extra record.
      if (at < 20 || tail.readUInt32LE(at - 20) !== SIG_LOCATOR64) throw unreadable();
      const z = readExactly(fd, 56, Number(tail.readBigUInt64LE(at - 12)));
      if (z.readUInt32LE(0) !== SIG_EOCD64) throw unreadable();
      total = Number(z.readBigUInt64LE(32));
      cdSize = Number(z.readBigUInt64LE(40));
      cdOffset = Number(z.readBigUInt64LE(48));
    }
    const maxEntries = MAX_ZIP_FILES() * 4 + 1000; // folders count as entries too
    if (total > maxEntries || cdSize > 256 * 1024 * 1024) {
      throw new ZipRefusal(`This zip lists ${fmt(total)} items, far more than my limit of ${fmt(MAX_ZIP_FILES())} files for one zip. I did not open it. Unzip it yourself and give me one course folder at a time.`);
    }
    if (cdOffset + cdSize > size) throw unreadable();
    const cd = readExactly(fd, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    for (let n = 0; n < total; n++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== SIG_CENTRAL) throw unreadable();
      const madeByUnix = cd[p + 5] === 3;
      const flags = cd.readUInt16LE(p + 8);
      let usize = cd.readUInt32LE(p + 24);
      const nameLength = cd.readUInt16LE(p + 28);
      const extraLength = cd.readUInt16LE(p + 30);
      const commentLength = cd.readUInt16LE(p + 32);
      const mode = cd.readUInt32LE(p + 38) >>> 16;
      if (p + 46 + nameLength + extraLength + commentLength > cd.length) throw unreadable();
      const name = cd.toString('utf8', p + 46, p + 46 + nameLength);
      if (usize === 0xffffffff) {
        // The real size is in the "zip64" extra field (id 1), as its first number.
        let q = p + 46 + nameLength;
        const end = q + extraLength;
        while (q + 4 <= end) {
          const id = cd.readUInt16LE(q);
          const len = cd.readUInt16LE(q + 2);
          if (id === 1 && len >= 8) {
            usize = Number(cd.readBigUInt64LE(q + 4));
            break;
          }
          q += 4 + len;
        }
      }
      entries.push({
        name,
        size: usize === 0xffffffff ? 0 : usize,
        dir: name.endsWith('/') || name.endsWith('\\'),
        link: madeByUnix && (mode & 0o170000) === 0o120000,
        encrypted: (flags & 1) === 1,
      });
      p += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    closeSync(fd);
  }
}

/** An entry name as a list of folder and file names: backslashes separate, empty and "." pieces are dropped. */
const zipPieces = (name) => String(name).replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.');

/** A name from inside a zip, safe to show: one line, in quotes, not too long. */
const quotedName = (name) => `"${String(name).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80)}"`;

/**
 * The entries that must come out of a zip as ordinary files on disk: not folders, not inside a folder the scan never
 * enters (__MACOSX, .git, ...) and not a junk name (.DS_Store, ...). Those are the files the user can see in the
 * result, so this list is what the name check and the after-unpacking count are made on.
 */
export function expectedZipFiles(entries) {
  return entries.filter((e) => {
    if (e.dir) return false;
    const pieces = zipPieces(e.name);
    const last = pieces.pop();
    if (last === undefined) return false;
    return !pieces.some((s) => JUNK_DIRS.has(s.toLowerCase())) && !isJunk(last);
  });
}

/** Refuse a zip before anything is unpacked. Returns { files, bytes } for a zip that passes. */
export function checkZipIndex(entries) {
  if (entries.some((e) => unsafeZipName(e.name))) {
    throw new ZipRefusal('This zip holds a file whose path leads outside its own folder (for example "../something"). I did not open it. A normal download from a school website never does this, so download it again from the original site.');
  }
  if (entries.some((e) => e.link)) {
    throw new ZipRefusal('This zip holds links (shortcuts to other places), which I never follow. I did not open it. If you trust it, unzip it yourself and give me the folder.');
  }
  if (entries.some((e) => e.encrypted)) {
    throw new ZipRefusal('This zip is password protected, so I cannot open it. Unzip it yourself with the password and give me the folder.');
  }
  // Windows and macOS treat "Notes.md" and "notes.md" (and the same accent written two ways) as one file, so the
  // second would overwrite the first without a word. Refuse the zip rather than lose a file quietly.
  const seen = new Map();
  for (const e of expectedZipFiles(entries)) {
    const key = zipPieces(e.name).join('/').normalize('NFC').toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      throw new ZipRefusal(`This zip holds two files whose names Windows and macOS treat as the same file (${quotedName(first)} and ${quotedName(e.name)}), so one would overwrite the other and be lost. I did not open it. Unzip it yourself, rename one of the two, and give me the folder.`);
    }
    seen.set(key, e.name);
  }
  const files = entries.filter((e) => !e.dir);
  const bytes = files.reduce((sum, e) => sum + e.size, 0);
  if (files.length > MAX_ZIP_FILES()) {
    throw new ZipRefusal(`This zip holds ${fmt(files.length)} files, more than my limit of ${fmt(MAX_ZIP_FILES())} for one zip. I did not open it. Unzip it yourself and give me one course folder at a time.`);
  }
  if (bytes > MAX_ZIP_BYTES()) {
    throw new ZipRefusal(`This zip would unpack to about ${formatBytes(bytes)}, more than my limit of ${formatBytes(MAX_ZIP_BYTES())} for one zip. I did not open it. Unzip it yourself, leave out videos and large recordings, and give me the folders.`);
  }
  return { files: files.length, bytes };
}

let zipToolState; // undefined = not looked for yet

/**
 * The tool that opens zips on this computer: { cmd, kind: 'bsdtar' | 'unzip' }, or null.
 * Windows 10+ and macOS ship bsdtar as "tar". On Windows the one in System32 is used by name, because a "tar" found
 * on the PATH can be Git's GNU tar, which cannot open zips.
 */
export function findZipTool() {
  if (process.env.ALTERBRAIN_NO_ZIP_TOOL === '1') return null;
  if (zipToolState !== undefined) return zipToolState;
  const candidates = [];
  if (process.platform === 'win32') candidates.push(join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'tar.exe'));
  if (process.platform === 'darwin') candidates.push('/usr/bin/tar');
  candidates.push('bsdtar', 'tar');
  zipToolState = null;
  for (const cmd of candidates) {
    const probe = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
    if (probe.status === 0 && !probe.error && /bsdtar|libarchive/i.test(probe.stdout || '')) {
      zipToolState = { cmd, kind: 'bsdtar' };
      return zipToolState;
    }
  }
  const unzip = spawnSync('unzip', ['-v'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  if (unzip.status === 0 && !unzip.error) zipToolState = { cmd: 'unzip', kind: 'unzip' };
  return zipToolState;
}

/** Files, bytes and links under a folder (links are counted, never followed). Stops early once a limit is passed. */
function treeStats(root, maxFiles, maxBytes) {
  const stats = { files: 0, bytes: 0, links: 0, over: false };
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isSymbolicLink()) stats.links++;
      else if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) {
        stats.files++;
        try {
          stats.bytes += lstatSync(abs).size;
        } catch {
          /* the file vanished: ignore */
        }
        if (stats.files > maxFiles || stats.bytes > maxBytes) {
          stats.over = true;
          return stats;
        }
      }
    }
  }
  return stats;
}

/** Unpack a zip into `dest` while watching the size, so a "zip bomb" is stopped part way. */
function runUnzip(tool, zipAbs, dest) {
  const args = tool.kind === 'bsdtar' ? ['-xf', zipAbs, '-C', dest] : ['-qq', '-o', zipAbs, '-d', dest];
  const maxFiles = MAX_ZIP_FILES();
  const maxBytes = MAX_ZIP_BYTES();
  return new Promise((done) => {
    let child;
    try {
      child = spawn(tool.cmd, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      done({ code: -1, stderr: String(e?.message || e), over: false, timedOut: false });
      return;
    }
    let stderr = '';
    let over = false;
    let timedOut = false;
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearInterval(watch);
      clearTimeout(limit);
      done({ code, stderr, over, timedOut });
    };
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d;
    });
    const watch = setInterval(() => {
      if (treeStats(dest, maxFiles, maxBytes).over) {
        over = true;
        child.kill();
      }
    }, ZIP_WATCH_MS);
    const limit = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, ZIP_TIMEOUT_MS);
    child.on('error', (e) => {
      stderr += String(e?.message || e);
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

const firstLine = (text) => String(text || '').split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 200) || 'no reason was given';

function removeFolder(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* the next run clears old leftovers */
  }
}

/** Run `fn(folder)` with a fresh private folder under state/local/tmp/, and always delete it afterwards. */
async function withTempFolder(fn) {
  const base = rootPath('state', 'local', 'tmp');
  ensureDir(base);
  for (const name of readdirSync(base)) {
    // Leftovers of a run that was killed hard: older than a day, so they cannot belong to a run in progress.
    if (!name.startsWith('ingest-zip-')) continue;
    try {
      if (Date.now() - statSync(join(base, name)).mtimeMs > 24 * 60 * 60 * 1000) removeFolder(join(base, name));
    } catch {
      /* ignore */
    }
  }
  const dir = mkdtempSync(join(base, 'ingest-zip-'));
  const cleanUp = () => removeFolder(dir);
  const onSignal = () => {
    cleanUp();
    process.exit(130);
  };
  process.on('exit', cleanUp);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    return await fn(dir);
  } finally {
    process.removeListener('exit', cleanUp);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanUp();
  }
}

/**
 * Check what an unpacked zip left on disk and list its files. Everything must resolve inside `dest`, and nothing may
 * sit next to `dest` in `parent` (that is where a "../x" entry would land). Throws ZipRefusal if anything is wrong.
 */
export function inspectUnpacked(parent, dest, { maxFiles = MAX_ZIP_FILES(), maxBytes = MAX_ZIP_BYTES() } = {}) {
  const stray = readdirSync(parent).filter((n) => n !== basename(dest));
  if (stray.length) {
    throw new ZipRefusal('Unpacking this zip wrote files outside its own folder, so I used none of it. Download it again from the original site.');
  }
  const stats = treeStats(dest, maxFiles, maxBytes);
  if (stats.links) {
    throw new ZipRefusal('Unpacking this zip created links (shortcuts to other places), so I used none of it. If you trust it, unzip it yourself and give me the folder.');
  }
  if (stats.over) {
    throw new ZipRefusal(`This zip unpacked to more than my limits (${fmt(maxFiles)} files or ${formatBytes(maxBytes)}), so I stopped and used none of it. Unzip it yourself, leave out videos and large recordings, and give me the folders.`);
  }
  const realDest = realpathSync.native(dest);
  const items = [];
  walkDir(dest, (abs, name) => {
    if (!isInside(realDest, realpathSync.native(abs))) {
      throw new ZipRefusal('A file in this zip ended up outside its own folder, so I used none of it. Download it again from the original site.');
    }
    items.push({ abs, junk: isJunk(name), inner: relative(dest, abs).split(sep).join('/').normalize('NFC'), bytes: lstatSync(abs).size });
  });
  return items;
}

/**
 * Compare the files a zip lists with the files that really came out of it (junk not counted on either side).
 * A difference means something was lost or added on the way, for example two names this computer treats as one file
 * that the name check could not foresee, so the whole zip is refused. `entries` is the list from readZipIndex and
 * `inside` the list from inspectUnpacked.
 */
export function checkUnpackedCount(entries, inside) {
  const listed = expectedZipFiles(entries).length;
  const found = inside.filter((i) => !i.junk).length;
  if (listed !== found) {
    throw new ZipRefusal(`This zip lists ${fmt(listed)} files, but ${fmt(found)} came out when I unpacked it (the usual cause is two file names this computer treats as the same, for example names that differ only by a capital letter or by a character Windows does not allow), so I used none of it. Unzip it yourself, rename the clashing files, and give me the folder.`);
  }
}

// ---------------------------------------------------------------- collecting files
/** Visit every file under a folder, in name order. Symbolic links and junk folders are never entered. */
function walkDir(dir, onFile) {
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
      walkDir(abs, onFile);
    } else if (e.isFile()) {
      onFile(abs, e.name);
    }
  }
}

const isZipName = (name) => extname(name).toLowerCase() === '.zip';

/**
 * Expand files and folders into lists of { abs, junk }: ordinary `files`, `zips` (to be opened) and `missing` paths.
 * Symbolic links inside folders are never followed.
 */
function collect(paths) {
  const files = [];
  const zips = [];
  const missing = [];
  const add = (abs, name) => (isZipName(name) ? zips : files).push({ abs, junk: isJunk(name) });
  for (const p of paths) {
    const abs = resolve(p);
    let st;
    try {
      st = statSync(abs);
    } catch {
      missing.push(p);
      continue;
    }
    if (st.isDirectory()) walkDir(abs, add);
    else if (st.isFile()) add(abs, basename(abs));
  }
  // The same file named twice is only handled once.
  const seen = new Set();
  const unique = (list) =>
    list.filter((f) => {
      const key = process.platform === 'win32' ? f.abs.toLowerCase() : f.abs;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { files: unique(files), zips: unique(zips), missing };
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
/** A course name as it is written on manifest entries: one line, no control characters, at most 120 characters. */
export function cleanCourse(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COURSE_LENGTH);
}

/**
 * Ingest files, folders and zips. Returns a summary object (see CLI --json).
 * Options: { latestOnly, kind, origin, course }
 */
export async function ingest(paths, { latestOnly = false, kind = null, origin = null, course = null } = {}) {
  const { files, zips, missing } = collect(paths);
  const records = [];
  const zipSummaries = [];
  const courseName = cleanCourse(course);
  const date = today();
  const year = date.slice(0, 4);
  const sourcesDir = rootPath('vault', '40_sources');
  const { map: known, bad: badLines } = loadManifest();
  let found = 0;

  // What the user sees for a file: its path, or "<zip name>/<inner path>" for a file inside a zip.
  const shownOf = (f) => f.shown ?? f.abs;
  const zipField = (f) => (f.zip ? { zip: f.zip } : {});

  /** Drop junk, secret-looking names and (with --latest-only) older versions. Returns what is left, in name order. */
  const prefilter = (items) => {
    for (const f of items.filter((x) => x.junk)) records.push({ path: shownOf(f), status: 'skipped', reason: 'junk', ...zipField(f) });
    let candidates = items.filter((x) => !x.junk);
    for (const f of candidates.filter((x) => looksLikeSecretFile(shownOf(x)))) {
      records.push({ path: shownOf(f), status: 'skipped', reason: 'looks like a password or key file, so it was not copied', ...zipField(f) });
    }
    candidates = candidates.filter((x) => !looksLikeSecretFile(shownOf(x)));

    if (latestOnly) {
      const { keep, dropped } = applyLatestOnly(candidates);
      const shownByAbs = new Map(candidates.map((x) => [x.abs, shownOf(x)]));
      candidates = keep;
      for (const d of dropped) {
        records.push({
          path: shownOf(d.item),
          status: 'skipped',
          reason: 'older-version',
          superseded_by: shownByAbs.get(d.supersededBy) ?? d.supersededBy,
          ...zipField(d.item),
        });
      }
    }
    return candidates.sort((a, b) => shownOf(a).localeCompare(shownOf(b), 'en'));
  };

  /** Copy one file into the vault, extract its text, screen it for secrets and write its manifest line. */
  const ingestOne = async (f) => {
    const shown = shownOf(f);
    const rec = { path: shown, status: 'error', ...zipField(f) };
    const created = [];
    try {
      const st = statSync(f.abs);
      if (st.size === 0) {
        records.push({ path: shown, status: 'skipped', reason: 'empty', ...zipField(f) });
        return;
      }
      const sha = await sha256File(f.abs);
      const existing = known.get(sha);
      if (existing) {
        records.push({
          path: shown,
          status: 'duplicate',
          id: existing.id,
          sha256: sha,
          stored: existing.stored,
          ...(existing.course ? { course: existing.course } : {}),
          ...zipField(f),
        });
        return;
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
      if (ext === '.zip' && f.zip) {
        text.note = 'This is a zip inside a zip. I kept it as it is and did not open it. Unzip it yourself if you want its contents.';
      }
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
        records.push({ path: shown, status: 'skipped', reason: `it holds ${hit.kind}, so it was not stored (keys belong in .env.local)`, ...zipField(f) });
        return;
      }

      const entry = {
        id: sha.slice(0, 8),
        sha256: sha,
        // The file name only (folder and user names stay out of the manifest); inside a zip: "<zip name>/<inner path>".
        origin: origin ?? f.origin ?? basename(f.abs),
        stored: toRel(rawAbs),
        text: text.status === 'done' ? toRel(textAbs) : null,
        text_status: text.status,
        size: st.size,
        ext,
        kind: kind ?? inferKind(basename(f.abs)),
        ingested: new Date().toISOString(),
        local_only: localOnly,
        note: text.note ?? (localOnly ? 'Too big for git, so it stays on this computer only.' : null),
        ...(courseName ? { course: courseName } : {}),
      };
      appendLine(manifestFile(), JSON.stringify(entry));
      known.set(sha, entry);
      records.push({ path: shown, status: 'new', ...entry, ...zipField(f) });
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
  };

  /** Open one zip in a private folder, ingest what is inside, and delete the folder again. */
  const ingestZip = async (zipItem) => {
    const zipName = basename(zipItem.abs);
    const summary = { zip: zipName, status: 'refused', files: 0, bytes: 0 };
    zipSummaries.push(summary);
    const refuse = (reason) => {
      summary.reason = reason;
      records.push({ path: zipItem.abs, status: 'error', zip: zipName, reason });
    };
    try {
      const index = readZipIndex(zipItem.abs);
      const listed = checkZipIndex(index);
      if (listed.files === 0) {
        summary.status = 'opened';
        records.push({ path: zipItem.abs, status: 'skipped', reason: 'the zip holds no files', zip: zipName });
        return;
      }
      const tool = findZipTool();
      if (!tool) {
        throw new ZipRefusal('I cannot open zip files on this computer because no tool for it was found. Unzip it yourself and give me the folder instead.');
      }
      await withTempFolder(async (parent) => {
        const dest = join(parent, 'files');
        ensureDir(dest);
        const run = await runUnzip(tool, zipItem.abs, dest);
        if (run.over) {
          throw new ZipRefusal(`This zip unpacked to more than my limits (${fmt(MAX_ZIP_FILES())} files or ${formatBytes(MAX_ZIP_BYTES())}), so I stopped and used none of it. Unzip it yourself, leave out videos and large recordings, and give me the folders.`);
        }
        if (run.timedOut) throw new ZipRefusal('Unpacking this zip took too long, so I stopped and used none of it. Unzip it yourself and give me the folder.');
        if (run.code !== 0) {
          throw new ZipRefusal(`I could not unpack this zip cleanly (${firstLine(run.stderr)}), so I used none of it. Download it again, or unzip it yourself and give me the folder.`);
        }
        const inside = inspectUnpacked(parent, dest);
        checkUnpackedCount(index, inside);
        const items = inside.map((i) => ({
          abs: i.abs,
          junk: i.junk,
          zip: zipName,
          shown: `${zipName}/${i.inner}`,
          origin: `${zipName}/${i.inner}`,
        }));
        summary.status = 'opened';
        summary.files = inside.length;
        summary.bytes = inside.reduce((sum, i) => sum + i.bytes, 0);
        if (items.length === 0) {
          records.push({ path: zipItem.abs, status: 'skipped', reason: 'the zip holds no files', zip: zipName });
          return;
        }
        found += items.length;
        for (const f of prefilter(items)) await ingestOne(f);
      });
    } catch (e) {
      if (e instanceof ZipRefusal) refuse(e.message);
      else refuse(`I could not open this zip: ${firstLine(e?.message || e)}`);
    }
  };

  found += files.length;
  for (const f of prefilter(files)) await ingestOne(f);
  for (const z of prefilter(zips)) await ingestZip(z);
  for (const m of missing) records.push({ path: resolve(m), status: 'error', reason: 'not found' });

  const countOf = (s) => records.filter((r) => r.status === s).length;
  const added = records.filter((r) => r.status === 'new');
  const counts = {
    found,
    new: added.length,
    duplicate: countOf('duplicate'),
    skipped: countOf('skipped'),
    error: countOf('error'),
    text_pending: added.filter((r) => r.text_status === 'pending').length,
    local_only: added.filter((r) => r.local_only).length,
    zips: zipSummaries.filter((z) => z.status === 'opened').length,
  };
  return { ok: counts.error === 0, counts, manifest: toRel(manifestFile()), manifest_bad_lines: badLines, zips: zipSummaries, files: records };
}

// ---------------------------------------------------------------- CLI
const USAGE = `ingest: copies files into your vault with provenance (the raw copy is never changed)

  node system/scripts/ingest.mjs <file-folder-or-zip>... [--latest-only] [--kind <kind>] [--origin "<text>"]
                                 [--course "<Course name>"] [--json]

  A .zip (for example "download all files" from a learning platform) is opened and every file inside is added.
  The zip itself is not stored, and a zip inside a zip is kept as an ordinary file and not opened.

  --latest-only   for files like Report_v0.1.md and Report_v1.0.md, keep only the newest
  --kind          one of: ${KINDS.join(', ')} (default: guessed from the file type)
  --origin        where the files came from (default: the file name only, or "<zip name>/<path inside>")
  --course        the course these files belong to, written on each new record as "course"
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
    } else if (flag === '--kind' || flag === '--origin' || flag === '--course') {
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
    console.error(`Tell me which file, folder or zip to ingest.\n\n${USAGE}`);
    return 2;
  }
  if (opts.kind !== undefined && !KINDS.includes(opts.kind)) {
    console.error(`--kind must be one of: ${KINDS.join(', ')}.`);
    return 2;
  }

  if (opts.course !== undefined && !cleanCourse(opts.course)) {
    console.error('--course needs a course name, for example --course "Corporate Finance".');
    return 2;
  }

  const summary = await ingest(paths, opts);
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return summary.ok ? 0 : 1;
  }

  const c = summary.counts;
  console.log(`Ingest finished. I looked at ${plural(c.found, 'file')}.`);
  if (c.zips) console.log(`  Zips opened:       ${c.zips} (${summary.zips.filter((z) => z.status === 'opened').map((z) => z.zip).join(', ')})`);
  console.log(`  New:               ${c.new}`);
  console.log(`  Already ingested:  ${c.duplicate}`);
  console.log(`  Skipped:           ${c.skipped}`);
  if (c.error) console.log(`  Problems:          ${c.error}`);
  if (c.text_pending) console.log(`  Claude will read ${plural(c.text_pending, 'file')} directly (no text could be extracted yet).`);
  if (c.local_only) console.log(`  ${plural(c.local_only, 'file')} too big for git, kept on this computer only.`);
  for (const r of summary.files) {
    if (r.status === 'new') console.log(`  + ${r.stored}${r.zip ? ` (from ${r.origin})` : ''}`);
    else if (r.status === 'duplicate') console.log(`  = ${basename(r.path)} (already in your vault as ${r.id})`);
    else if (r.status === 'skipped' && r.reason !== 'junk') console.log(`  - ${basename(r.path)} (${r.reason === 'older-version' ? 'older version' : r.reason})`);
    else if (r.status === 'error') console.log(`  ! ${r.zip && basename(r.path) === r.zip ? r.zip : r.path}: ${r.reason}`);
  }
  return summary.ok ? 0 : 1;
}

function isMain() {
  return isMainModule(import.meta.url);
}

if (isMain()) run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
