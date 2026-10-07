#!/usr/bin/env node
// check-json: checks that settings files still parse, or counts characters.
//
//   node system/scripts/check-json.mjs <file>...        each file must be valid JSON
//   node system/scripts/check-json.mjs --length <file>  prints how many characters the file has
//   add --json for a machine-readable object.
//
// Exit codes: 0 ok, 1 a file is missing or not valid, 2 usage error.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/paths.mjs';

const USAGE = 'Usage: node system/scripts/check-json.mjs <file>... | --length <file>   [--json]';

export function checkFile(file) {
  if (!existsSync(file)) return { file, ok: false, error: 'The file does not exist.' };
  try {
    JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return { file, ok: true };
  } catch (e) {
    return { file, ok: false, error: `It is not valid JSON (${e.message}).` };
  }
}

export function lengthOf(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').length;
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  if (args.length === 0) {
    console.error(USAGE);
    return 2;
  }
  if (args[0] === '--length') {
    if (args.length !== 2) {
      console.error(USAGE);
      return 2;
    }
    const n = lengthOf(args[1]);
    if (n === null) {
      console.error(`${args[1]}: the file does not exist.`);
      return 1;
    }
    console.log(json ? JSON.stringify({ file: args[1], characters: n }) : String(n));
    return 0;
  }
  if (args.some((a) => a.startsWith('--'))) {
    console.error(USAGE);
    return 2;
  }
  const results = args.map(checkFile);
  if (json) console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }));
  else for (const r of results) console.log(r.ok ? `${r.file}: ok` : `${r.file}: ${r.error}`);
  return results.every((r) => r.ok) ? 0 : 1;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
