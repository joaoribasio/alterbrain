// Human task list CLI (spec section 4).
//
//   node system/scripts/tasks.mjs add "<text>" [--tag <skill>] [--due YYYY-MM-DD]
//        [--priority high|medium|low] [--link "<vault-relative path>"] [--json]
//   node system/scripts/tasks.mjs list [--agent] [--json]
//   node system/scripts/tasks.mjs done "<part of the task text>" [--json]
//
// Exit codes: 0 ok, 1 nothing matched or a problem, 2 wrong usage.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addTask, listTasks, completeTask, TASKS_FILE } from '../lib/tasks.mjs';
import { today } from '../lib/fsx.mjs';
import { toRel, isMainModule } from '../lib/paths.mjs';

const USAGE = `Tasks: your to-do list (vault/00_inbox/Tasks.md)

  add "<text>" [--tag <skill>] [--due YYYY-MM-DD] [--priority high|medium|low] [--link "<note path>"]
  list [--agent]        show open tasks (--agent: only ones Alterbrain added)
  done "<text>"         tick the first open task that contains this text

Add --json to any command for machine-readable output.`;

const BOOL_FLAGS = new Set(['json', 'agent', 'help']);
const VALUE_FLAGS = new Set(['tag', 'due', 'priority', 'link']);

class UsageError extends Error {}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (BOOL_FLAGS.has(name)) {
        flags[name] = true;
      } else if (VALUE_FLAGS.has(name)) {
        const value = eq === -1 ? argv[++i] : a.slice(eq + 1);
        if (value === undefined) throw new UsageError(`--${name} needs a value.`);
        flags[name] = value;
      } else {
        throw new UsageError(`I do not know the option --${name}.`);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function out(json, payload, human) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(human);
}

export function run(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  const { positional, flags } = parsed;
  const [cmd, ...rest] = positional;
  const json = Boolean(flags.json);

  if (flags.help || !cmd) {
    console.log(USAGE);
    return cmd || flags.help ? 0 : 2;
  }

  if (cmd === 'add') {
    const text = rest.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) {
      console.error(`Please say what the task is.\n\n${USAGE}`);
      return 2;
    }
    if (flags.due !== undefined && !isRealDate(flags.due)) {
      console.error('The due date must look like 2026-10-09 (year-month-day).');
      return 2;
    }
    if (flags.priority !== undefined && !['high', 'medium', 'low'].includes(flags.priority)) {
      console.error('Priority must be high, medium or low.');
      return 2;
    }
    const line = addTask({
      text,
      tag: flags.tag,
      due: flags.due,
      priority: flags.priority,
      link: flags.link,
    });
    out(json, { ok: true, line, file: toRel(TASKS_FILE()) }, `Added to your Inbox:\n  ${line}`);
    return 0;
  }

  if (cmd === 'list') {
    const now = today();
    const tasks = listTasks({ agentOnly: Boolean(flags.agent) }).map((t) => ({
      ...t,
      overdue: Boolean(t.due && t.due < now),
      agent: /#ab\//.test(t.line),
    }));
    if (json) {
      console.log(JSON.stringify({ ok: true, count: tasks.length, tasks }, null, 2));
      return 0;
    }
    if (tasks.length === 0) {
      console.log(flags.agent ? 'Nothing is waiting on you from Alterbrain.' : 'No open tasks. Nice.');
      return 0;
    }
    console.log(`${tasks.length} open task${tasks.length === 1 ? '' : 's'}:`);
    for (const t of tasks) {
      console.log(`  ${t.line.replace(/^- \[ \]\s*/, '')}${t.overdue ? '   (overdue)' : ''}`);
    }
    return 0;
  }

  if (cmd === 'done') {
    const needle = rest.join(' ').trim();
    if (!needle) {
      console.error(`Tell me part of the task text to tick.\n\n${USAGE}`);
      return 2;
    }
    const matches = listTasks().filter((t) => t.line.includes(needle)).length;
    const changed = completeTask(needle);
    if (!changed) {
      out(json, { ok: false, error: 'no-match', needle }, `I could not find an open task containing "${needle}".`);
      return 1;
    }
    const note = matches > 1 ? ` ${matches} tasks matched, so I ticked the first one.` : '';
    out(json, { ok: true, needle, matches }, `Ticked it off.${note}`);
    return 0;
  }

  console.error(`I do not know the command "${cmd}".\n\n${USAGE}`);
  return 2;
}

function isMain() {
  return isMainModule(import.meta.url);
}

if (isMain()) process.exitCode = run(process.argv.slice(2));
