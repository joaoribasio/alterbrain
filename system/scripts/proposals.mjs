#!/usr/bin/env node
// Self-build bookkeeping for /propose (see references/proactive.md).
//
//   node system/scripts/proposals.mjs status [--json]
//   node system/scripts/proposals.mjs signal <key> --example "<plain description>" [--json]
//   node system/scripts/proposals.mjs signals [--min 3] [--json]
//   node system/scripts/proposals.mjs mark <key> suggested|rejected|built [--card "<vault path>"] [--json]
//
// status:  reads config/brain.json self_build and counts open cards in vault/00_inbox/proposals/.
// signal:  records one repeated manual request in state/proposals.json (one per key per day).
// signals: lists keys with enough evidence that were never suggested or rejected.
// Exit codes: 0 ok, 2 usage error.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPath, vaultPath, isMainModule } from '../lib/paths.mjs';
import { readJson, readText, writeJson } from '../lib/fsx.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';

export const STATE_FILE = () => rootPath('state', 'proposals.json');
export const OUTCOMES = ['suggested', 'rejected', 'built'];
const DEFAULTS = { mode: 'propose', proactive: true, max_open_proposals: 3 };

export function selfBuildConfig() {
  const brain = readJson(rootPath('config', 'brain.json'), {}) || {};
  return { ...DEFAULTS, ...(brain.self_build || {}) };
}

export function openCards(dir = vaultPath('00_inbox', 'proposals')) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .filter((f) => {
      const { data } = splitFrontmatter(readText(join(dir, f)));
      return data.type === 'proposal' && data.status === 'open';
    });
}

export function status() {
  const cfg = selfBuildConfig();
  const open = openCards();
  const canPropose = cfg.mode !== 'off';
  return {
    mode: cfg.mode,
    proactive: !!cfg.proactive,
    max_open_proposals: cfg.max_open_proposals,
    open: open.length,
    open_cards: open,
    can_propose: canPropose,
    can_suggest_proactively: canPropose && !!cfg.proactive && open.length < cfg.max_open_proposals,
  };
}

export function load(file = STATE_FILE()) {
  const s = readJson(file, null);
  if (!s || typeof s.signals !== 'object' || s.signals === null) return { schema: 1, signals: {} };
  return s;
}

export function normaliseKey(key) {
  return String(key || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Record one occurrence. Counts at most once per key per calendar day (UTC). */
export function addSignal(state, key, example, now = new Date().toISOString()) {
  const k = normaliseKey(key);
  if (!k) throw new Error('key is required');
  const s = state.signals[k] || { count: 0, days: [], first: now, last: null, examples: [], outcome: null, outcome_at: null, card: null };
  const day = now.slice(0, 10);
  if (!s.days.includes(day)) {
    s.days.push(day);
    s.days = s.days.slice(-30);
    s.count += 1;
  }
  s.last = now;
  if (example) {
    const ex = String(example).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (ex && !s.examples.includes(ex)) s.examples = [...s.examples, ex].slice(-5);
  }
  state.signals[k] = s;
  return { key: k, ...s };
}

/** Keys with enough evidence that were never suggested, rejected or built. */
export function candidates(state, min = 3) {
  return Object.entries(state.signals)
    .filter(([, s]) => s.count >= min && !s.outcome)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, s]) => ({ key, ...s }));
}

export function mark(state, key, outcome, card = null, now = new Date().toISOString()) {
  const k = normaliseKey(key);
  if (!OUTCOMES.includes(outcome)) throw new Error(`outcome must be one of ${OUTCOMES.join(', ')}`);
  const s = state.signals[k] || { count: 0, days: [], first: now, last: now, examples: [], outcome: null, outcome_at: null, card: null };
  s.outcome = outcome;
  s.outcome_at = now;
  if (card) s.card = card;
  state.signals[k] = s;
  return { key: k, ...s };
}

function main(argv) {
  const json = argv.includes('--json');
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const valueIdx = new Set(['--example', '--min', '--card'].map((n) => argv.indexOf(n)).filter((i) => i >= 0).map((i) => i + 1));
  const pos = argv.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
  const [cmd, key, outcome] = pos;
  const print = (obj, text) => console.log(json ? JSON.stringify(obj, null, 2) : text);
  try {
    if (cmd === 'status' || !cmd) {
      const s = status();
      const text = s.can_propose
        ? `Self-build is on (${s.proactive ? 'I may suggest things' : 'only when asked'}). Open proposals: ${s.open} of ${s.max_open_proposals}.`
        : 'Self-build is switched off in config/brain.json.';
      print(s, text);
      return 0;
    }
    const state = load();
    if (cmd === 'signal') {
      const r = addSignal(state, key, opt('--example'));
      writeJson(STATE_FILE(), state);
      print(r, `Noted "${r.key}" (${r.count} time${r.count === 1 ? '' : 's'}).`);
      return 0;
    }
    if (cmd === 'signals') {
      const list = candidates(state, Number(opt('--min') || 3));
      print(list, list.length ? list.map((c) => `- ${c.key}: ${c.count} times (e.g. ${c.examples[0] || 'no example'})`).join('\n') : 'No repeated requests worth a proposal yet.');
      return 0;
    }
    if (cmd === 'mark') {
      const r = mark(state, key, outcome, opt('--card') || null);
      writeJson(STATE_FILE(), state);
      print(r, `Marked "${r.key}" as ${r.outcome}.`);
      return 0;
    }
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  console.error('Usage: proposals.mjs status | signal <key> --example "<text>" | signals [--min 3] | mark <key> suggested|rejected|built [--card "<path>"]  [--json]');
  return 2;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
