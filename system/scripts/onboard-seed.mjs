#!/usr/bin/env node
// Onboarding M0 helper: copy the starter files into place without ever
// overwriting something the user already has.
//
//   node system/scripts/onboard-seed.mjs [--dry-run] [--json]
//
// Copies (only when the target file is missing):
//   system/templates/vault/**               -> vault/
//   system/templates/config/*.json          -> config/
//   system/templates/identity/*             -> vault/80_me/
//   system/packs/<id>/frameworks/*.md       -> vault/30_wiki/frameworks/   for every pack id in
//                                              config/brain.json "packs" except "core" (a pack
//                                              without a frameworks folder adds nothing)
//   .env.example                            -> .env.local (empty template for keys, so the user only
//                                              edits a file that already exists with the right name)
// Pack ids must look like folder names (lower-case letters, digits, hyphens); anything else is
// ignored. A listed pack whose folder is missing is reported. If config/brain.json cannot be read,
// only the core files are seeded and the output says so.
// In copied .md and .base files, {{date}} becomes today's date and {{title}}
// becomes the file name without its extension; an empty `created: ""` gets today.
//
// Exit codes: 0 = done, 1 = a source folder is missing (the rest still ran),
// 2 = usage error.
import { existsSync, readdirSync, readFileSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, isMainModule } from '../lib/paths.mjs';
import { today, writeText, readJsonChecked } from '../lib/fsx.mjs';

const TEXT_EXT = new Set(['.md', '.base']);
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** The fixed copy jobs, relative to the project root. The pack jobs come after them (see seed). */
export const JOBS = [
  { label: 'vault skeleton', from: ['system', 'templates', 'vault'], to: ['vault'], recursive: true },
  { label: 'settings', from: ['system', 'templates', 'config'], to: ['config'], recursive: false, ext: ['.json'] },
  { label: 'identity files', from: ['system', 'templates', 'identity'], to: ['vault', '80_me'], recursive: false },
];

/** A pack id is a folder name under system/packs/. */
export const PACK_ID = /^[a-z0-9-]+$/;

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Pack ids to seed: the "packs" array in config/brain.json, without "core" (always on, nothing to copy),
 * without names that are not valid folder names, and without repeats. A missing config file falls back
 * to the template (so a dry run reports what a real run would do). A file that exists but cannot be read,
 * or has no packs array, gives core only. `unreadable` is true in the first case, so the caller can say so.
 */
export function packsFromConfig(root) {
  let checked = readJsonChecked(join(root, 'config', 'brain.json'));
  if (!checked.exists) checked = readJsonChecked(join(root, 'system', 'templates', 'config', 'brain.json'));
  if (checked.exists && !checked.ok) return { ids: [], unreadable: true };
  const list = Array.isArray(checked.value?.packs) ? checked.value.packs : [];
  return { ids: cleanPackIds(list), unreadable: false };
}

/** Valid, distinct pack ids other than "core", in the order given. */
export function cleanPackIds(list) {
  const out = [];
  for (const id of list) {
    if (typeof id === 'string' && PACK_ID.test(id) && id !== 'core' && !out.includes(id)) out.push(id);
  }
  return out;
}

function listFiles(dir, recursive) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (JUNK.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (recursive) out.push(...listFiles(full, true));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export function fillPlaceholders(text, file, date) {
  const title = basename(file, extname(file));
  return text
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{title\}\}/g, title)
    .replace(/^created: ""[ \t]*$/m, `created: "${date}"`);
}

/**
 * Run all copy jobs. Returns { created: [], kept: [], missingSources: [], notes: [] }
 * with project-relative forward-slash paths. `packs` (an array of ids) overrides what
 * config/brain.json says; it is meant for tests.
 */
export function seed({ root = projectRoot(), dryRun = false, date = today(), packs } = {}) {
  const rel = (p) => relative(root, p).split(sep).join('/');
  const result = { created: [], kept: [], missingSources: [], notes: [] };

  function runJob(job) {
    const src = join(root, ...job.from);
    const dst = join(root, ...job.to);
    for (const file of listFiles(src, job.recursive)) {
      if (job.ext && !job.ext.includes(extname(file).toLowerCase())) continue;
      const target = join(dst, relative(src, file));
      if (existsSync(target)) {
        result.kept.push(rel(target));
        continue;
      }
      if (!dryRun) {
        if (TEXT_EXT.has(extname(file).toLowerCase())) {
          writeText(target, fillPlaceholders(readFileSync(file, 'utf8'), file, date));
        } else {
          mkdirSync(dirname(target), { recursive: true });
          copyFileSync(file, target);
        }
      }
      result.created.push(rel(target));
    }
  }

  for (const job of JOBS) {
    if (!existsSync(join(root, ...job.from))) {
      result.missingSources.push(job.from.join('/'));
      continue;
    }
    runJob(job);
  }

  // The packs the user switched on. The settings job above has put config/brain.json in place by now.
  let ids;
  if (Array.isArray(packs)) {
    ids = cleanPackIds(packs);
  } else {
    const found = packsFromConfig(root);
    ids = found.ids;
    if (found.unreadable) result.notes.push('config/brain.json could not be read, so I set up the core files only. Run /health-check.');
  }
  for (const id of ids) {
    const packDir = join(root, 'system', 'packs', id);
    if (!isDir(packDir)) {
      result.missingSources.push(`system/packs/${id}`);
      continue;
    }
    if (isDir(join(packDir, 'frameworks'))) {
      runJob({ from: ['system', 'packs', id, 'frameworks'], to: ['vault', '30_wiki', 'frameworks'], recursive: false, ext: ['.md'] });
    }
  }

  // The keys file: created once from the template, never overwritten.
  const example = join(root, '.env.example');
  const envLocal = join(root, '.env.local');
  if (existsSync(example)) {
    if (existsSync(envLocal)) result.kept.push('.env.local');
    else {
      if (!dryRun) copyFileSync(example, envLocal);
      result.created.push('.env.local');
    }
  }
  return result;
}

function main(argv) {
  const known = new Set(['--dry-run', '--json']);
  const bad = argv.filter((a) => !known.has(a));
  if (bad.length) {
    console.error(`I don't know these options: ${bad.join(' ')}`);
    console.error('Usage: node system/scripts/onboard-seed.mjs [--dry-run] [--json]');
    return 2;
  }
  const dryRun = argv.includes('--dry-run');
  const res = seed({ dryRun });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ dryRun, ...res }, null, 2));
  } else {
    const verb = dryRun ? 'Would create' : 'Created';
    console.log(`${verb} ${res.created.length} starter files. Kept ${res.kept.length} files you already had (nothing was overwritten).`);
    for (const n of res.notes) console.log(n);
    for (const m of res.missingSources) {
      const pack = /^system\/packs\/([^/]+)$/.exec(m);
      console.log(pack
        ? `Missing pack folder: ${pack[1]}. Run /health-check, or /update-alterbrain to restore it.`
        : `Missing starter folder: ${m}. Run /health-check, or /update-alterbrain to restore it.`);
    }
  }
  return res.missingSources.length ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
