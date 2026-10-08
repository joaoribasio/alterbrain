#!/usr/bin/env node
// routines: the registry of scheduled jobs (vault/90_routines, one note per routine).
//   node system/scripts/routines.mjs list    [--json]
//   node system/scripts/routines.mjs overdue [--json]
//   node system/scripts/routines.mjs show <name> [--json | --instruction]
//   node system/scripts/routines.mjs record <name> --result "<one line>" [--json]
//   node system/scripts/routines.mjs suggest [--json]
//   node system/scripts/routines.mjs enable <suggested-name> [--user-asked] [--json]
//
// Alterbrain does not run a scheduler. Hosts are the Claude desktop scheduled tasks, Claude cloud routines or a
// server's own scheduler; this script only makes the jobs visible and records their runs. `record` is the last step
// of every routine's instruction. It changes only last_run and last_result (line endings are kept) and refuses a
// name that is not a routine note. `enable` creates the note from a suggestion in system/templates/routines/: with
// --user-asked (the user said yes in chat) the status is active, without it the note is saved as "suggested".
// `show --instruction` prints only the text under "## Instruction for the host" to the end of the note: that is
// what the host is scheduled with. No vault/90_routines folder means no routines (documented fallback). `--now "YYYY-MM-DD HH:MM"` is for tests.
// Exit codes: 0 ok, 1 something needs attention (an overdue or invalid routine, a note that cannot be read, an unknown name, a
// suggestion that cannot be enabled): a finding, not a crash, so read the output; 2 usage error.
// A note in vault/90_routines that cannot be recognised as a routine (no frontmatter, an unclosed block, no type) is listed as
// unreadable by list and overdue, and never dropped silently.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMainModule, rootPath } from '../lib/paths.mjs';
import { today } from '../lib/fsx.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { writeFileAtomic } from '../lib/migrate.mjs';
import { load as loadBuilt, find as findBuilt } from './built.mjs';
import {
  applyRecord, applyStatus, cleanResult, describeDay, describeLastRun, findRoutine, lateText, nextDue, overdueRoutines, overdueStatus,
  parseCadence, parseStamp, readRoutines, routinesDir, toRoutine, validateRoutine,
} from '../lib/routines.mjs';

const USAGE = [
  'Usage: node system/scripts/routines.mjs list [--json]',
  '       node system/scripts/routines.mjs overdue [--json]',
  '       node system/scripts/routines.mjs show <name> [--json | --instruction]',
  '       node system/scripts/routines.mjs record <name> --result "<one line>" [--json]',
  '       node system/scripts/routines.mjs suggest [--json]',
  '       node system/scripts/routines.mjs enable <suggested-name> [--user-asked] [--json]',
].join('\n');

const BOOL_FLAGS = new Set(['json', 'user-asked', 'instruction']);
const VALUE_FLAGS = new Set(['result', 'now']);

export function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (BOOL_FLAGS.has(name)) flags[name] = true;
    else if (VALUE_FLAGS.has(name)) {
      const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
      if (v === undefined) return null;
      flags[name] = v;
    } else return null;
  }
  return { cmd: pos[0] || '', rest: pos.slice(1), flags };
}

export const suggestionsDir = () => rootPath('system', 'templates', 'routines');

/** The suggestions shipped with the framework: [{ name, file, text, requires, routine }]. */
export function readSuggestions(dir = suggestionsDir()) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.md')).sort()) {
    try {
      const file = join(dir, f);
      const raw = readFileSync(file, 'utf8');
      const { data } = splitFrontmatter(raw);
      const name = f.replace(/\.md$/i, '');
      out.push({ name, file, text: raw, requires: typeof data.requires === 'string' ? data.requires : '', routine: toRoutine(name, file, { ...data, created: data.created === '{{date}}' ? today() : data.created }) });
    } catch {
      /* unreadable template: leave it out */
    }
  }
  return out;
}

/** Is the add-on a suggestion needs built (state/built.json)? A suggestion with no requirement is always available. */
function requirementMet(requires) {
  if (!requires) return true;
  try {
    return Boolean(findBuilt(loadBuilt(), requires));
  } catch {
    return false;
  }
}

const parseNow = (v) => (v ? parseStamp(v) : new Date());

function summarise(r, now) {
  const st = overdueStatus(r, now);
  const next = r.valid && r.status === 'active' ? nextDue(r.cadence, st.since && r.last_run ? parseStamp(r.last_run) : now) : null;
  return { ...r, overdue: st.overdue, next_due: next ? `${describeDay(next)} ${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}` : null };
}

const unreadableLine = (u) => `${u.name} [UNREADABLE]: ${u.reason}. Open vault/90_routines/${u.name}.md and fix it, or move it out of the folder.`;

function cmdList(flags, now) {
  const { routines, unreadable, folder_exists } = readRoutines();
  const rows = routines.map((r) => summarise(r, now));
  const problems = rows.filter((r) => !r.valid || r.overdue).length + unreadable.length;
  if (flags.json) {
    console.log(JSON.stringify({ folder_exists, routines: rows.map(({ file, ...r }) => r), unreadable: unreadable.map(({ name, reason }) => ({ name, reason })), problems }));
    return problems ? 1 : 0;
  }
  if (!rows.length && !unreadable.length) {
    console.log('You have no routines yet. A routine is a scheduled job, saved as a note in vault/90_routines. Run "routines.mjs suggest" to see ideas.');
    return 0;
  }
  for (const r of rows) {
    const flag = !r.valid ? ' [INVALID]' : r.overdue ? ' [OVERDUE]' : '';
    console.log(`${r.name} (${r.status || 'no status'})${flag}: ${r.schedule || 'no schedule'}, on ${r.host || 'no host'}, runs ${r.runs || 'nothing'}. Last run: ${describeLastRun(r)}.`);
    for (const p of r.problems) console.log(`  Problem: ${p}.`);
  }
  for (const u of unreadable) console.log(unreadableLine(u));
  return problems ? 1 : 0;
}

function cmdOverdue(flags, now) {
  const { routines, unreadable } = readRoutines();
  const late = overdueRoutines(routines, now);
  const invalid = routines.filter((r) => !r.valid);
  if (flags.json) {
    console.log(JSON.stringify({
      overdue: late.map(({ routine, since, due_at, never_run }) => ({ name: routine.name, never_run, host: routine.host, schedule: routine.schedule, since: describeDay(since), last_run: routine.last_run, due_at: `${describeDay(due_at)}` })),
      invalid: invalid.map((r) => ({ name: r.name, problems: r.problems })),
      unreadable: unreadable.map(({ name, reason }) => ({ name, reason })),
    }));
    return late.length || invalid.length || unreadable.length ? 1 : 0;
  }
  if (!late.length && !invalid.length && !unreadable.length) {
    console.log('No routine is overdue.');
    return 0;
  }
  for (const x of late) {
    const { routine } = x;
    console.log(`${routine.name} ${lateText(x)} (${routine.schedule}, on ${routine.host}). Check the Claude app's Routines page, or the server's scheduler.`);
  }
  for (const r of invalid) console.log(`${r.name} cannot be checked: ${r.problems.join('; ')}.`);
  for (const u of unreadable) console.log(unreadableLine(u));
  return 1;
}

/** The text under "## Instruction for the host" to the end of the note, or null. */
export function instructionOf(body) {
  const m = /^##[ \t]+Instruction for the host[ \t]*\r?\n/im.exec(body);
  if (!m) return null;
  const t = body.slice(m.index + m[0].length).trim();
  return t || null;
}

/** Say plainly that a note exists but is not a readable routine. Returns true when it did. */
function explainUnreadable(unreadable, name) {
  const u = findRoutine(unreadable, name);
  if (!u) return false;
  console.error(`${u.name} is in vault/90_routines but cannot be read as a routine: ${u.reason}. Fix the note first.`);
  return true;
}

function cmdShow(name, flags, now) {
  const { routines, unreadable } = readRoutines();
  const r = findRoutine(routines, name);
  if (!r) {
    if (explainUnreadable(unreadable, name)) return 1;
    console.error(`There is no routine called "${name}". Run "routines.mjs list" to see them.`);
    return 1;
  }
  const row = summarise(r, now);
  const body = splitFrontmatter(readFileSync(r.file, 'utf8')).body;
  if (flags.instruction) {
    const ins = instructionOf(body);
    if (!ins) {
      console.error(`${r.name} has no "## Instruction for the host" section, so there is nothing to schedule. Add it to the note.`);
      return 1;
    }
    console.log(ins);
    return 0;
  }
  if (flags.json) {
    const { file, ...rest } = row;
    console.log(JSON.stringify({ ...rest, body, instruction: instructionOf(body) }));
    return r.valid ? 0 : 1;
  }
  console.log(`${r.name} (${r.status})`);
  console.log(`Schedule: ${r.schedule} (${r.cadence}), on ${r.host}. Runs: ${r.runs}. Model: ${r.model}, effort ${r.effort}.`);
  console.log(`Last run: ${describeLastRun(r)}.${row.overdue ? ' It is overdue.' : ''}${row.next_due ? ` Next due: ${row.next_due}.` : ''}`);
  for (const p of r.problems) console.log(`Problem: ${p}.`);
  console.log('');
  console.log(body.trim());
  return r.valid ? 0 : 1;
}

function cmdRecord(name, flags, now) {
  if (!name || flags.result === undefined || !String(flags.result).trim()) {
    console.error('Usage: node system/scripts/routines.mjs record <name> --result "<one line>"');
    return 2;
  }
  const { routines, unreadable } = readRoutines();
  const r = findRoutine(routines, name);
  if (!r) {
    if (explainUnreadable(unreadable, name)) return 1;
    console.error(`There is no routine called "${name}", so I recorded nothing. Run "routines.mjs list" to see them.`);
    return 1;
  }
  const before = readFileSync(r.file, 'utf8');
  const after = applyRecord(before, flags.result, now);
  if (after === before) {
    console.error(`I could not record the run: ${r.name} has no settings block at the top of the note (between two --- lines).`);
    return 1;
  }
  try {
    writeFileAtomic(r.file, after);
  } catch (e) {
    console.error(e && e.message ? e.message : 'I could not save the routine note.');
    return 1;
  }
  const stamp = `${today(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (flags.json) console.log(JSON.stringify({ name: r.name, last_run: stamp, last_result: cleanResult(flags.result) }));
  else console.log(`Recorded the run of ${r.name} at ${stamp}.`);
  return 0;
}

function cmdSuggest(flags) {
  const { routines: mine, unreadable } = readRoutines();
  const list = readSuggestions().filter((s) => !findRoutine(mine, s.name) && !findRoutine(unreadable, s.name) && requirementMet(s.requires));
  if (flags.json) {
    console.log(JSON.stringify({ suggestions: list.map((s) => ({ name: s.name, schedule: s.routine.schedule, host: s.routine.host, runs: s.routine.runs })) }));
    return 0;
  }
  if (!list.length) {
    console.log('No suggested routines are left: you have them all, or their add-on is not built yet.');
    return 0;
  }
  for (const s of list) console.log(`${s.name}: ${s.routine.schedule}, runs ${s.routine.runs}.`);
  return 0;
}

function cmdEnable(name, flags) {
  if (!name) {
    console.error('Usage: node system/scripts/routines.mjs enable <suggested-name> [--user-asked]');
    return 2;
  }
  const s = readSuggestions().find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!s) {
    console.error(`There is no suggested routine called "${name}". Run "routines.mjs suggest" to see them.`);
    return 1;
  }
  if (!requirementMet(s.requires)) {
    console.error(`${s.name} needs the "${s.requires}" add-on, which is not built yet. Build that first.`);
    return 1;
  }
  const { routines: mine, unreadable } = readRoutines();
  if (findRoutine(mine, s.name)) {
    console.error(`You already have a routine called "${s.name}", so I changed nothing.`);
    return 1;
  }
  const dir = routinesDir();
  const target = join(dir, `${s.name}.md`);
  const clash = findRoutine(unreadable, s.name);
  if (clash) {
    console.error(`A note called "${s.name}" is already in vault/90_routines but cannot be read as a routine: ${clash.reason}. I created nothing. Repair or rename that note first.`);
    return 1;
  }
  if (existsSync(target)) {
    console.error(`A file called "${s.name}.md" is already in vault/90_routines, so I created nothing. Rename or move it first.`);
    return 1;
  }
  const status = flags['user-asked'] ? 'active' : 'suggested';
  let text = s.text.replace(/\{\{date\}\}/g, today()).replace(/\{\{title\}\}/g, s.name).replace(/^requires:.*\r?\n/m, '');
  text = applyStatus(text, status);
  const problems = validateRoutine(splitFrontmatter(text).data);
  if (problems.length) {
    console.error(`The suggestion "${s.name}" is not valid (${problems.join('; ')}), so I created nothing.`);
    return 1;
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(target, text, { encoding: 'utf8', flag: 'wx' });
  } catch (e) {
    console.error(`I could not create the routine note "${s.name}" (${e && e.code ? e.code : 'write failed'}), so nothing was saved.`);
    return 1;
  }
  if (flags.json) console.log(JSON.stringify({ name: s.name, status, file: `vault/90_routines/${s.name}.md` }));
  else if (status === 'active') console.log(`Created the routine "${s.name}" as active in vault/90_routines. Now schedule it on your host with the instruction in the note.`);
  else console.log(`Saved "${s.name}" in vault/90_routines as a suggestion (status: suggested). It does nothing until you set it to active and schedule it on a host.`);
  return 0;
}

export function main(argv) {
  const args = parseArgs(argv);
  if (!args || !args.cmd) {
    console.error(USAGE);
    return 2;
  }
  const now = parseNow(args.flags.now);
  if (!now) {
    console.error('--now must look like 2026-10-05 08:00.');
    return 2;
  }
  switch (args.cmd) {
    case 'list': return cmdList(args.flags, now);
    case 'overdue': return cmdOverdue(args.flags, now);
    case 'show': return args.rest[0] ? cmdShow(args.rest.join(' '), args.flags, now) : (console.error(USAGE), 2);
    case 'record': return cmdRecord(args.rest.join(' '), args.flags, now);
    case 'suggest': return cmdSuggest(args.flags);
    case 'enable': return cmdEnable(args.rest.join(' '), args.flags);
    default:
      console.error(USAGE);
      return 2;
  }
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
