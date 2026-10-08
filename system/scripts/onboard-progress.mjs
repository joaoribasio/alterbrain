#!/usr/bin/env node
// Onboarding progress tracker: state/onboarding.json (see references/state.md).
//
//   node system/scripts/onboard-progress.mjs show [--json]
//   node system/scripts/onboard-progress.mjs next [--json]
//   node system/scripts/onboard-progress.mjs start|done|later|skip|reset <M0..M9> [--note "<text>"]
//
// Timestamps always come from the system clock, never from the model.
// Module titles always come from this file: a title stored in state/onboarding.json is ignored, so
// a renamed module shows its new name on installs that started earlier.
// `show --json` also gives learner_kind (config/brain.json, with the rule for older installs) and
// estimate_minutes: the time for the essential modules, which depends on the kind of learner.
// Exit codes: 0 = ok, 2 = usage error.
import { rootPath, isMainModule } from '../lib/paths.mjs';
import { readJson, writeJson } from '../lib/fsx.mjs';

export const MODULES = [
  { id: 'M0', title: 'Setup', minutes: 8, file: 'M0-setup.md', aliases: ['setup', 'github', 'install'] },
  { id: 'M1', title: 'Identity and tone', minutes: 2, file: 'M1-identity.md', aliases: ['identity', 'tone', 'name'] },
  { id: 'M2', title: 'You and your facts', minutes: 5, file: 'M2-you-and-facts.md', aliases: ['you', 'facts', 'profile', 'cv'] },
  { id: 'M3', title: 'Courses and projects', minutes: 6, minutesByKind: { mba: 6, degree: 6, online: 4, professional: 3, other: 6 }, file: 'M3-programme.md', aliases: ['programme', 'program', 'courses', 'school', 'projects', 'learning', 'work'] },
  { id: 'M4', title: 'Autonomy and self-build', minutes: 3, file: 'M4-autonomy.md', aliases: ['autonomy', 'safety', 'self-build'] },
  { id: 'M5', title: 'Your writing voice', minutes: 15, file: 'M5-voice.md', aliases: ['voice', 'writing'] },
  { id: 'M6', title: 'Career and job search', minutes: 10, file: 'M6-career.md', aliases: ['career', 'jobs', 'job-search'] },
  { id: 'M7', title: 'Email and tools', minutes: 8, file: 'M7-integrations.md', aliases: ['integrations', 'gmail', 'email', 'tools', 'mcp'] },
  { id: 'M8', title: 'Look of your documents', minutes: 5, file: 'M8-brand.md', aliases: ['brand', 'fonts', 'colours', 'colors'] },
  { id: 'M9', title: 'Import your existing files', minutes: 10, file: 'M9-import.md', aliases: ['import', 'files', 'ingest'] },
];
export const MINIMUM = ['M0', 'M1', 'M2', 'M3', 'M4'];
export const LEARNER_KINDS = ['mba', 'degree', 'online', 'professional', 'other'];
export const STATUSES = ['todo', 'in_progress', 'done', 'later', 'skipped'];

export const STATE_FILE = () => rootPath('state', 'onboarding.json');

export function emptyState() {
  const modules = {};
  for (const m of MODULES) modules[m.id] = { title: m.title, status: 'todo', started: null, finished: null, note: '' };
  return { schema: 1, status: 'not_started', started: null, updated: null, minimum: [...MINIMUM], modules };
}

/** Load state, filling any missing module entries (forward compatible). Titles always come from MODULES. */
export function load(file = STATE_FILE()) {
  const base = emptyState();
  const s = readJson(file, null);
  if (!s || typeof s !== 'object') return base;
  const merged = { ...base, ...s, modules: { ...base.modules } };
  for (const id of Object.keys(base.modules)) {
    if (s.modules && s.modules[id]) merged.modules[id] = { ...base.modules[id], ...s.modules[id], title: base.modules[id].title };
  }
  merged.status = overall(merged);
  return merged;
}

/** Overall status: not_started | in_progress | minimum_done | complete. */
export function overall(state) {
  const mods = Object.values(state.modules);
  if (mods.every((m) => m.status === 'done' || m.status === 'skipped')) return 'complete';
  if (MINIMUM.every((id) => state.modules[id]?.status === 'done')) return 'minimum_done';
  if (mods.some((m) => m.status !== 'todo')) return 'in_progress';
  return 'not_started';
}

/** Resolve "M5", "m5", "5" or an alias like "voice" to a module id. */
export function resolveModule(arg) {
  if (!arg) return null;
  const a = String(arg).trim().toLowerCase();
  for (const m of MODULES) {
    if (a === m.id.toLowerCase() || a === m.id.slice(1) || m.aliases.includes(a)) return m.id;
  }
  return null;
}

/** Next module to offer: minimum path first, then the rest. "later" counts as not done. */
export function nextModule(state) {
  const open = (id) => !['done', 'skipped'].includes(state.modules[id].status);
  const inMin = MINIMUM.find(open);
  if (inMin) return inMin;
  return MODULES.map((m) => m.id).find(open) || null;
}

export function setStatus(state, id, status, { note, now = new Date().toISOString() } = {}) {
  const mod = state.modules[id];
  if (status === 'reset') {
    Object.assign(mod, { status: 'todo', started: null, finished: null });
  } else {
    if (status === 'in_progress') {
      mod.started = mod.started || now;
      mod.finished = null;
    }
    if (status === 'done' || status === 'skipped') mod.finished = now;
    mod.status = status;
  }
  if (note !== undefined) mod.note = String(note);
  state.started = state.started || now;
  state.updated = now;
  state.status = overall(state);
  return state;
}

/**
 * The kind of learner: config/brain.json learner.kind (mba, degree, online, professional, other).
 * If it is missing or empty, older installs count as mba when packs lists mba or a school block exists.
 * Otherwise null: the onboarding learner question has not been answered yet.
 */
export function learnerKind(brain) {
  if (!brain || typeof brain !== 'object') return null;
  const raw = brain.learner && typeof brain.learner === 'object' ? brain.learner.kind : undefined;
  const kind = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (LEARNER_KINDS.includes(kind)) return kind;
  const packs = Array.isArray(brain.packs) ? brain.packs : [];
  if (packs.includes('mba') || Object.prototype.hasOwnProperty.call(brain, 'school')) return 'mba';
  return null;
}

/** Minutes for one module; M3 depends on the kind of learner (null or unknown kind: the default). */
export function moduleMinutes(m, kind) {
  return (kind && m.minutesByKind?.[kind]) || m.minutes;
}

/** Time for the essential modules: { minimum: all of them, remaining: those not done yet }. */
export function estimateMinutes(state, kind) {
  let minimum = 0;
  let remaining = 0;
  for (const m of MODULES) {
    if (!MINIMUM.includes(m.id)) continue;
    const mins = moduleMinutes(m, kind);
    minimum += mins;
    if (state.modules[m.id].status !== 'done') remaining += mins;
  }
  return { minimum, remaining };
}

function readLearnerKind() {
  return learnerKind(readJson(rootPath('config', 'brain.json'), null));
}

function describe(state, kind = null) {
  const label = { todo: 'not started', in_progress: 'in progress', done: 'done', later: 'saved for later', skipped: 'skipped' };
  const lines = [];
  const left = MODULES.filter((m) => MINIMUM.includes(m.id) && state.modules[m.id].status !== 'done');
  const mins = estimateMinutes(state, kind).remaining;
  lines.push(`Setup: ${state.status.replace('_', ' ')}.` + (left.length ? ` About ${mins} minutes left for the essentials.` : ' The essentials are done.'));
  for (const m of MODULES) {
    const tag = MINIMUM.includes(m.id) ? 'essential' : 'optional';
    lines.push(`- ${m.id} ${m.title} (${tag}, ~${moduleMinutes(m, kind)} min): ${label[state.modules[m.id].status]}`);
  }
  const nxt = nextModule(state);
  lines.push(nxt ? `Next: ${nxt} ${state.modules[nxt].title}.` : 'Everything is set up.');
  return lines.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const noteIdx = argv.indexOf('--note');
  const note = noteIdx >= 0 ? argv[noteIdx + 1] : undefined;
  const args = argv.filter((a, i) => a !== '--json' && a !== '--note' && !(noteIdx >= 0 && i === noteIdx + 1));
  const [cmd, modArg] = args;
  const usage = () => {
    console.error('Usage: onboard-progress.mjs show|next [--json]  or  onboard-progress.mjs start|done|later|skip|reset <M0..M9> [--note "<text>"]');
    return 2;
  };
  const state = load();
  if (cmd === 'show' || !cmd) {
    const kind = readLearnerKind();
    console.log(json
      ? JSON.stringify({ ...state, learner_kind: kind, estimate_minutes: estimateMinutes(state, kind) }, null, 2)
      : describe(state, kind));
    return 0;
  }
  if (cmd === 'next') {
    const id = nextModule(state);
    const m = MODULES.find((x) => x.id === id);
    console.log(json ? JSON.stringify({ next: id, title: m?.title ?? null, file: m ? `workflows/${m.file}` : null }) : id ? `${id} ${m.title}` : 'none');
    return 0;
  }
  const map = { start: 'in_progress', done: 'done', later: 'later', skip: 'skipped', reset: 'reset' };
  if (!map[cmd]) return usage();
  const id = resolveModule(modArg);
  if (!id) {
    console.error(`I don't know the module "${modArg ?? ''}". Use M0 to M9.`);
    return 2;
  }
  setStatus(state, id, map[cmd], { note });
  writeJson(STATE_FILE(), state);
  console.log(json ? JSON.stringify(state, null, 2) : `${id} ${state.modules[id].title}: ${state.modules[id].status.replace('_', ' ')}. Overall: ${state.status.replace('_', ' ')}.`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
