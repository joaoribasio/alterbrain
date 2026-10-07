#!/usr/bin/env node
// ingest-pending: lists the files that ingest.mjs already copied but that
// have no source note yet (an entry is pending when no note in
// vault/40_sources/notes/ carries the same sha256 in its frontmatter).
//
//   node system/scripts/ingest-pending.mjs [--json]
//
// Prints one JSON line per pending file (id, stored, text, text_status, kind,
// origin), or a plain sentence when nothing is pending. Exit codes: 0 ok, 2 usage error.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, isMainModule } from '../lib/paths.mjs';

export function pendingEntries(root = rootPath()) {
  const manifest = join(root, 'vault', '40_sources', 'manifest.jsonl');
  const notesDir = join(root, 'vault', '40_sources', 'notes');
  const lines = existsSync(manifest) ? readFileSync(manifest, 'utf8').split(/\r?\n/) : [];
  const have = new Set();
  if (existsSync(notesDir)) {
    for (const f of readdirSync(notesDir)) {
      if (!f.endsWith('.md')) continue;
      const m = readFileSync(join(notesDir, f), 'utf8').match(/^sha256:\s*\W?([0-9a-f]{64})/m);
      if (m) have.add(m[1]);
    }
  }
  const out = [];
  for (const l of lines) {
    let e;
    try { e = JSON.parse(l); } catch { continue; }
    if (e && e.sha256 && !have.has(e.sha256)) {
      out.push({ id: e.id, stored: e.stored, text: e.text, text_status: e.text_status, kind: e.kind, origin: e.origin });
    }
  }
  return out;
}

function main(argv) {
  if (argv.some((a) => a !== '--json')) {
    console.error('Usage: node system/scripts/ingest-pending.mjs [--json]');
    return 2;
  }
  const list = pendingEntries();
  if (argv.includes('--json')) console.log(JSON.stringify({ count: list.length, pending: list }));
  else if (list.length === 0) console.log('Every saved file already has a note.');
  else for (const e of list) console.log(JSON.stringify(e));
  return 0;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
