#!/usr/bin/env node
// Record of what self-build has built: state/built.json (see references/built-json.md).
//
//   node system/scripts/built.mjs list [--json]
//   node system/scripts/built.mjs has <name-or-blueprint> [--json]
//   node system/scripts/built.mjs add --name <name> --kind <kind> [--blueprint <slug>]
//        [--path <p>]... [--mcp <id>]... [--channel <c>]... [--proposal "<vault path>"]
//        [--model <m>] [--effort <e>] [--note "<text>"] [--json]
//   node system/scripts/built.mjs remove <name> [--delete-files] [--json]
//        --delete-files also deletes the entry's .claude/skills/my-* folders and .claude/agents/my-*.md files
//
// Timestamps come from the system clock. Exit codes: 0 ok, 1 not found, 2 usage error.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, isMainModule } from '../lib/paths.mjs';
import { readJson, writeJson } from '../lib/fsx.mjs';

export const KINDS = ['skill', 'agent', 'mcp', 'blueprint', 'automation'];
export const BUILT_FILE = () => rootPath('state', 'built.json');

export function load(file = BUILT_FILE()) {
  const s = readJson(file, null);
  if (!s || !Array.isArray(s.items)) return { schema: 1, items: [] };
  return s;
}

/** Find an entry by its name or by the blueprint it came from. */
export function find(state, key) {
  const k = String(key || '').toLowerCase();
  return state.items.find((i) => i.name?.toLowerCase() === k || (i.blueprint && i.blueprint.toLowerCase() === k)) || null;
}

/** Add or replace an entry (same name replaces). Returns the entry. */
export function add(state, entry, now = new Date().toISOString()) {
  if (!entry.name) throw new Error('name is required');
  if (!KINDS.includes(entry.kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`);
  const item = {
    name: entry.name,
    kind: entry.kind,
    blueprint: entry.blueprint || null,
    paths: entry.paths || [],
    mcp: entry.mcp || [],
    channels: entry.channels || [],
    proposal: entry.proposal || null,
    model: entry.model || null,
    effort: entry.effort || null,
    built: now,
    note: entry.note || '',
  };
  state.items = state.items.filter((i) => i.name !== item.name);
  state.items.push(item);
  return item;
}

export function remove(state, key) {
  const hit = find(state, key);
  if (!hit) return null;
  state.items = state.items.filter((i) => i !== hit);
  return hit;
}

const OWN_SKILL = /^\.claude\/skills\/my-[^/]+\/?$/;
const OWN_AGENT = /^\.claude\/agents\/my-[^/]+\.md$/;

/** True only for a self-built skill folder or agent file. Nothing else is ever deleted by script. */
export function isOwnPath(p) {
  const rel = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.includes('..')) return false;
  return OWN_SKILL.test(rel) || OWN_AGENT.test(rel);
}

/** Delete the my-* skill folders and agent files an entry lists. Returns { deleted, kept }. */
export function deleteOwnFiles(item) {
  const deleted = [];
  const kept = [];
  for (const p of item.paths || []) {
    if (!isOwnPath(p)) {
      kept.push(p);
      continue;
    }
    rmSync(rootPath(...String(p).replace(/\\/g, '/').split('/').filter(Boolean)), { recursive: true, force: true });
    deleted.push(p);
  }
  return { deleted, kept };
}

function parse(argv) {
  const out = { _: [], path: [], mcp: [], channel: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--delete-files') out['delete-files'] = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[++i];
      if (val === undefined) throw new Error(`missing value for ${a}`);
      if (Array.isArray(out[key])) out[key].push(val);
      else out[key] = val;
    } else out._.push(a);
  }
  return out;
}

function main(argv) {
  let args;
  try {
    args = parse(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const [cmd, key] = args._;
  const state = load();
  const print = (obj, text) => console.log(args.json ? JSON.stringify(obj, null, 2) : text);
  if (cmd === 'list' || !cmd) {
    const text = state.items.length
      ? state.items.map((i) => `- ${i.name} (${i.kind}${i.blueprint ? `, from blueprint ${i.blueprint}` : ''}), built ${String(i.built).slice(0, 10)}`).join('\n')
      : 'Nothing has been built yet.';
    print(state, text);
    return 0;
  }
  if (cmd === 'has') {
    const hit = find(state, key);
    print({ built: !!hit, item: hit }, hit ? `Yes: ${hit.name} is built.` : `No: ${key} is not built.`);
    return hit ? 0 : 1;
  }
  if (cmd === 'add') {
    try {
      const item = add(state, {
        name: args.name, kind: args.kind, blueprint: args.blueprint, paths: args.path, mcp: args.mcp,
        channels: args.channel, proposal: args.proposal, model: args.model, effort: args.effort, note: args.note,
      });
      writeJson(BUILT_FILE(), state);
      print(item, `Recorded ${item.name} in state/built.json.`);
      return 0;
    } catch (e) {
      console.error(e.message);
      return 2;
    }
  }
  if (cmd === 'remove') {
    if (!key) {
      console.error('Say which entry to remove.');
      return 2;
    }
    const hit = remove(state, key);
    if (!hit) {
      print({ removed: null }, `${key} is not in state/built.json.`);
      return 1;
    }
    writeJson(BUILT_FILE(), state);
    let deleted = [];
    let kept = [];
    if (args['delete-files']) {
      ({ deleted, kept } = deleteOwnFiles(hit));
    }
    const text = [`Removed ${hit.name} from state/built.json.`];
    if (deleted.length) text.push(`Deleted: ${deleted.join(', ')}`);
    if (kept.length) text.push(`Kept (not a my-* skill or agent, ask the user first): ${kept.join(', ')}`);
    print({ removed: hit, deleted, kept }, text.join('\n'));
    return 0;
  }
  console.error('Usage: built.mjs list | has <name> | add --name <n> --kind <k> [...] | remove <name> [--delete-files]  [--json]');
  return 2;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
