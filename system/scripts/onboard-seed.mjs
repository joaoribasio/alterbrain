#!/usr/bin/env node
// Onboarding M0 helper: copy the starter files into place without ever
// overwriting something the user already has.
//
//   node system/scripts/onboard-seed.mjs [--dry-run] [--json]
//
// Copies (only when the target file is missing):
//   system/templates/vault/**          -> vault/
//   system/templates/config/*.json     -> config/
//   system/templates/identity/*        -> vault/80_me/
//   system/packs/mba/frameworks/*.md   -> vault/30_wiki/frameworks/
//   .env.example                       -> .env.local (empty template for keys, so the user only
//                                         edits a file that already exists with the right name)
// In copied .md and .base files, {{date}} becomes today's date and {{title}}
// becomes the file name without its extension; an empty `created: ""` gets today.
//
// Exit codes: 0 = done, 1 = a source folder is missing (the rest still ran),
// 2 = usage error.
import { existsSync, readdirSync, readFileSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, isMainModule } from '../lib/paths.mjs';
import { today, writeText } from '../lib/fsx.mjs';

const TEXT_EXT = new Set(['.md', '.base']);
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** The four copy jobs, relative to the project root. */
export const JOBS = [
  { label: 'vault skeleton', from: ['system', 'templates', 'vault'], to: ['vault'], recursive: true },
  { label: 'settings', from: ['system', 'templates', 'config'], to: ['config'], recursive: false, ext: ['.json'] },
  { label: 'identity files', from: ['system', 'templates', 'identity'], to: ['vault', '80_me'], recursive: false },
  { label: 'MBA frameworks', from: ['system', 'packs', 'mba', 'frameworks'], to: ['vault', '30_wiki', 'frameworks'], recursive: false, ext: ['.md'] },
];

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
 * Run all copy jobs. Returns { created: [], kept: [], missingSources: [] }
 * with project-relative forward-slash paths.
 */
export function seed({ root = projectRoot(), dryRun = false, date = today() } = {}) {
  const rel = (p) => relative(root, p).split(sep).join('/');
  const result = { created: [], kept: [], missingSources: [] };
  for (const job of JOBS) {
    const src = join(root, ...job.from);
    const dst = join(root, ...job.to);
    if (!existsSync(src)) {
      result.missingSources.push(job.from.join('/'));
      continue;
    }
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
    for (const m of res.missingSources) console.log(`Missing framework folder: ${m}. Run /health-check, or /update-alterbrain to restore it.`);
  }
  return res.missingSources.length ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
