// Helpers for upgrade scripts: system/scripts/migrations/NNNN-short-name.mjs (policy: .claude/rules/framework-dev.md,
// "Changing user data or config (migrations)"; ADR 0024).
//
// An upgrade script changes the SHAPE of the user's notes or settings after a release, once, with the person's
// restore point already made. update.mjs finish runs each script that the verified release manifest lists, in name
// order, and records it in state/migrations.json. A script looks like this:
//
//   #!/usr/bin/env node
//   // ab-migration: One plain sentence that says what this upgrade does.
//   import { runMigration, readJsonFile, writeJsonAtomic } from '../../lib/migrate.mjs';
//   await runMigration(async ({ root, dryRun, report }) => { ...; report('Did a thing.'); });
//
// Contract: print one plain sentence for each thing this run changed, or exactly "Nothing to do."; exit 0 when done
// or when there was nothing to do, 1 when it could not finish (one sentence on standard error), 2 for a wrong
// command line. "--dry-run" writes nothing and starts each sentence with "Would: ".
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { projectRoot } from './paths.mjs';
import { stripBom } from './fsx.mjs';

/** A problem the person can understand. The message is one plain UK English sentence. */
export class MigrationStop extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationStop';
  }
}

// While a run is a dry run, the write helpers below do nothing, so no script can change a file by accident.
let dryRunActive = false;

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRIES = 3;
const RETRY_GAP_MS = 100;

function relOf(abs) {
  try {
    return relative(projectRoot(), abs).split(sep).join('/') || String(abs);
  } catch {
    return String(abs);
  }
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* wait */
    }
  }
}

/** The stop for a settings file that is there but not usable. */
export function unreadableSettings(abs) {
  return new MigrationStop(`Your settings file ${relOf(abs)} could not be read, so I changed nothing. Run /health-check, then finish the update again.`);
}

/**
 * Run an upgrade. `fn({ root, dryRun, report })` may be async; `report(sentence)` records one change.
 * Sets process.exitCode (no hard exit, so the output is always flushed) and returns it.
 */
export async function runMigration(fn, argv = process.argv.slice(2)) {
  if (!(argv.length === 0 || (argv.length === 1 && argv[0] === '--dry-run'))) {
    console.error('Usage: node <this upgrade script> [--dry-run]\n  --dry-run   say what would change, and change nothing');
    process.exitCode = 2;
    return 2;
  }
  const dryRun = argv.length === 1;
  dryRunActive = dryRun;
  const sentences = [];
  const report = (sentence) => {
    const text = String(sentence ?? '').trim();
    if (text) sentences.push(text);
  };
  try {
    await fn({ root: projectRoot(), dryRun, report });
  } catch (e) {
    if (e instanceof MigrationStop) console.error(e.message);
    else console.error(`This upgrade stopped because of an unexpected problem (${e && e.message ? e.message : e}). Nothing else was changed.`);
    process.exitCode = 1;
    return 1;
  } finally {
    dryRunActive = false;
  }
  if (sentences.length === 0) console.log('Nothing to do.');
  else for (const s of sentences) console.log(dryRun ? `Would: ${s}` : s);
  process.exitCode = 0;
  return 0;
}

/**
 * Read a JSON settings file. Returns { exists: false } or { exists: true, value }. A byte order mark is ignored.
 * A file that is there but is not valid JSON stops the upgrade with a plain sentence.
 */
export function readJsonFile(abs) {
  if (!existsSync(abs)) return { exists: false };
  try {
    return { exists: true, value: JSON.parse(stripBom(readFileSync(abs, 'utf8'))) };
  } catch {
    throw unreadableSettings(abs);
  }
}

/**
 * Save text so that a crash never leaves half a file: write next to the target, then rename over it. A file that
 * another program holds open (common on Windows) is retried 3 times, 100 ms apart. Does nothing in a dry run.
 */
export function writeFileAtomic(abs, text) {
  if (dryRunActive) return false;
  const tmp = `${abs}.ab-tmp`;
  let failure = null;
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(tmp, text, 'utf8');
  } catch (e) {
    failure = e;
  }
  if (!failure) {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        renameSync(tmp, abs);
        return true;
      } catch (e) {
        failure = e;
        if (!RETRY_CODES.has(e && e.code) || attempt === RETRIES) break;
        sleepSync(RETRY_GAP_MS);
      }
    }
  }
  try {
    rmSync(tmp, { force: true });
  } catch {
    /* the temporary file is harmless */
  }
  const busy = RETRY_CODES.has(failure && failure.code);
  throw new MigrationStop(
    busy
      ? `I could not save ${relOf(abs)} (is it open in another program?). Close it and finish the update again.`
      : `I could not save ${relOf(abs)}. Check that there is free space and that the folder can be written to, then finish the update again.`,
  );
}

/**
 * Delete one file. A file that another program holds open (common on Windows) is retried 3 times, 100 ms apart. A file
 * that is already gone counts as deleted. Returns true when it deleted something. Does nothing in a dry run.
 */
export function removeFile(abs) {
  if (dryRunActive || !existsSync(abs)) return false;
  let failure = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      rmSync(abs, { force: true });
      return true;
    } catch (e) {
      failure = e;
      if (!RETRY_CODES.has(e && e.code) || attempt === RETRIES) break;
      sleepSync(RETRY_GAP_MS);
    }
  }
  const busy = RETRY_CODES.has(failure && failure.code);
  throw new MigrationStop(
    busy
      ? `I could not delete ${relOf(abs)} (is it open in another program?). Close it and finish the update again.`
      : `I could not delete ${relOf(abs)}. Check that the folder can be written to, then finish the update again.`,
  );
}

/** Delete a folder only when it is empty. Returns true when it deleted it. Never touches a folder that holds anything. */
export function removeDirIfEmpty(abs) {
  if (dryRunActive) return false;
  try {
    if (readdirSync(abs).length > 0) return false;
    rmdirSync(abs); // rmdir refuses a folder that is not empty, so this cannot remove content by mistake
    return true;
  } catch {
    return false;
  }
}

/** Save a value as JSON (two-space indent, final newline), atomically. */
export function writeJsonAtomic(abs, value) {
  return writeFileAtomic(abs, JSON.stringify(value, null, 2) + '\n');
}

// A line that belongs to the key above it: indented text or a list item.
const continuesKey = (line) => /^\s+\S/.test(line) || /^-\s/.test(line);

/**
 * Set one top-level key in a note's leading "---" block, as the raw text after "key: " (so a string is passed with its
 * quotes, for example '"[[MBA]]"'). An existing line for the key is replaced; otherwise the new line goes after the
 * first key in `after` that exists, else just before the closing "---". A leading byte order mark and the file's line
 * endings (CRLF when the text has any) are kept. Without a frontmatter block the text is returned unchanged, and the
 * body of the note is never touched.
 */
export function setFrontmatterLine(text, key, rawValue, { after = [] } = {}) {
  const bom = text.charCodeAt(0) === 0xfeff ? '﻿' : '';
  const body = bom ? text.slice(1) : text;
  const cr = body.includes('\r\n') ? '\r' : '';
  const lines = body.split('\n');
  const bare = (line) => line.replace(/\r$/, '');
  if (bare(lines[0]).trimEnd() !== '---') return text;
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (bare(lines[i]).trimEnd() === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) return text;

  const find = (k) => {
    for (let i = 1; i < close; i++) if (lines[i].startsWith(`${k}:`)) return i;
    return -1;
  };
  const endOfKey = (i) => {
    let end = i + 1;
    while (end < close && continuesKey(lines[end])) end++;
    return end;
  };

  const existing = find(key);
  if (existing !== -1) {
    const tail = lines[existing].endsWith('\r') ? '\r' : '';
    lines.splice(existing, endOfKey(existing) - existing, `${key}: ${rawValue}${tail}`);
  } else {
    let at = close;
    for (const k of after) {
      const i = find(k);
      if (i !== -1) {
        at = endOfKey(i);
        break;
      }
    }
    lines.splice(at, 0, `${key}: ${rawValue}${cr}`);
  }
  return bom + lines.join('\n');
}
