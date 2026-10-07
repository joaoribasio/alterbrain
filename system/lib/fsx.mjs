// Small, dependency-free file helpers.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Text of a file without a leading UTF-8 byte order mark (Notepad and Windows PowerShell 5.1 add one). */
export function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(stripBom(readFileSync(file, 'utf8')));
  } catch {
    return fallback;
  }
}

/**
 * Like readJson, but tells "no such file" apart from "a file I could not read".
 * Returns { exists, ok, value }. Use it for settings where a silent fallback would be unsafe.
 */
export function readJsonChecked(file) {
  if (!existsSync(file)) return { exists: false, ok: true, value: null };
  try {
    return { exists: true, ok: true, value: JSON.parse(stripBom(readFileSync(file, 'utf8'))) };
  } catch {
    return { exists: true, ok: false, value: null };
  }
}

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function readText(file, fallback = '') {
  try {
    return stripBom(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

export function appendLine(file, line) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, line.endsWith('\n') ? line : line + '\n', 'utf8');
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** sha256 of a file (streamed, safe for large files). */
export function sha256File(file) {
  return new Promise((resolvePromise, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolvePromise(h.digest('hex')))
      .on('error', reject);
  });
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Today's date as YYYY-MM-DD in local time. */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local date-time as "YYYY-MM-DD HH:MM". */
export function nowStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${today(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
