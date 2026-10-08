#!/usr/bin/env node
// people: a read-only view of the contacts in vault/60_people (the CRM, decision J).
//   node system/scripts/people.mjs due  [--within 7] [--json]
//   node system/scripts/people.mjs list [--tag <tag>] [--json]
// `due` lists people to get back to: next_follow_up on or before today + N days, or a cadence
// (monthly, quarterly, half-yearly, yearly) that has run out. Anyone with dnc: true is left out.
// Notes without the CRM keys give no reminder (documented fallback). Dates that are not real
// YYYY-MM-DD dates are ignored and reported under "problems".
// Exit codes: 0 ok, 1 problems found (a bad date, an unreadable note, too many notes), 2 usage error.
// The script never writes. `--today YYYY-MM-DD` exists for tests; the default is the local clock.
import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { vaultPath, isMainModule } from '../lib/paths.mjs';
import { today as localToday } from '../lib/fsx.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { hasGitCryptHeader } from '../lib/vaultkey.mjs';

export const MAX_NOTES = 2000;
export const MAX_BYTES = 16 * 1024;
export const CADENCE_DAYS = { monthly: 30, quarterly: 91, 'half-yearly': 182, yearly: 365 };

const USAGE = 'Usage: node system/scripts/people.mjs due [--within N] [--json]\n       node system/scripts/people.mjs list [--tag <tag>] [--json]';

/** True for a real calendar date written YYYY-MM-DD. */
export function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const dayNumber = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);

/** YYYY-MM-DD plus a number of days (calendar arithmetic in UTC, so no daylight-saving drift). */
export function addDays(s, n) {
  return new Date((dayNumber(s) + n) * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

function readHead(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(MAX_BYTES);
    const n = readSync(fd, buf, 0, MAX_BYTES, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(full);
  }
}

/** Do-not-contact fails closed: anything not clearly "no" counts as do not contact. Returns { dnc, unclear }. */
export function parseDnc(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '' || ['false', 'no', 'n', '0', 'off'].includes(s)) return { dnc: false, unclear: false };
  if (['true', 'yes', 'y', '1', 'on'].includes(s)) return { dnc: true, unclear: false };
  return { dnc: true, unclear: true };
}

const str = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v));

/**
 * Read every person note. Returns { people, problems, scanned, truncated }.
 * A person: { name, file, org, role, dnc, tags, last_contact, next_follow_up, cadence }.
 */
export function readPeople(peopleDir = vaultPath('60_people')) {
  const files = [];
  walk(peopleDir, files);
  const people = [];
  const problems = [];
  let scanned = 0;
  let locked = 0;
  for (const file of files) {
    if (scanned >= MAX_NOTES) break;
    let text;
    try {
      statSync(file);
      const head = readHead(file);
      if (hasGitCryptHeader(head)) {
        locked++;
        scanned++;
        continue;
      }
      text = head.toString('utf8');
    } catch {
      problems.push({ file: relative(vaultPath(), file).split('\\').join('/'), problem: 'The note could not be read.' });
      continue;
    }
    scanned++;
    const { data } = splitFrontmatter(text);
    if (data.type !== 'person') continue;
    const rel = relative(vaultPath(), file).split('\\').join('/');
    const dncState = parseDnc(data.dnc);
    const p = {
      name: basename(file, '.md'),
      file: rel,
      org: str(data.org),
      role: str(data.role),
      dnc: dncState.dnc,
      tags: Array.isArray(data.tags) ? data.tags.map(str).filter(Boolean) : [],
      last_contact: str(data.last_contact),
      next_follow_up: str(data.next_follow_up),
      cadence: str(data.cadence).toLowerCase() || 'none',
    };
    if (dncState.unclear) {
      problems.push({ file: rel, problem: `dnc "${str(data.dnc)}" is not clearly true or false, so this person is treated as do not contact until you fix it (write dnc: true or dnc: false).` });
    }
    for (const key of ['last_contact', 'next_follow_up']) {
      if (p[key] && !isRealDate(p[key])) {
        problems.push({ file: rel, problem: `${key} "${p[key]}" is not a date written YYYY-MM-DD, so it was ignored.` });
        p[key] = '';
      }
    }
    if (p.cadence !== 'none' && !CADENCE_DAYS[p.cadence]) {
      problems.push({ file: rel, problem: `cadence "${p.cadence}" is not one of none, monthly, quarterly, half-yearly, yearly, so it was ignored.` });
      p.cadence = 'none';
    }
    people.push(p);
  }
  if (locked) problems.push({ file: '60_people', problem: `${locked} contact note${locked === 1 ? ' is' : 's are'} locked on this computer, so the list is incomplete. Unlock the vault first.` });
  const truncated = files.length > MAX_NOTES;
  if (truncated) problems.push({ file: '60_people', problem: `There are more than ${MAX_NOTES} notes, so only the first ${MAX_NOTES} were read.` });
  return { people, problems, scanned, truncated };
}

/** Who is due: { due, no_contact_recorded }. Pure function over readPeople()'s people. */
export function computeDue(people, today, within = 7) {
  const horizon = addDays(today, within);
  const due = [];
  const noContact = [];
  for (const p of people) {
    if (p.dnc) continue;
    const reasons = [];
    const dates = [];
    if (p.next_follow_up && p.next_follow_up <= horizon) {
      reasons.push('follow-up');
      dates.push(p.next_follow_up);
    }
    const days = CADENCE_DAYS[p.cadence];
    if (days) {
      if (p.last_contact) {
        const next = addDays(p.last_contact, days);
        if (next <= horizon) {
          reasons.push(`${p.cadence} catch-up`);
          dates.push(next);
        }
      } else {
        noContact.push({ name: p.name, file: p.file, cadence: p.cadence });
      }
    }
    if (reasons.length) {
      const dueDate = dates.sort()[0];
      due.push({ name: p.name, file: p.file, org: p.org, role: p.role, reasons, due_date: dueDate, days_from_today: daysBetween(today, dueDate), last_contact: p.last_contact, next_follow_up: p.next_follow_up, cadence: p.cadence });
    }
  }
  due.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name));
  return { due, no_contact_recorded: noContact };
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!['due', 'list'].includes(cmd)) return null;
  const o = { cmd, within: 7, tag: null, json: false, today: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json') o.json = true;
    else if (a === '--within') {
      const v = rest[++i];
      if (!/^\d{1,4}$/.test(String(v))) return null;
      o.within = Number(v);
    } else if (a === '--tag') {
      o.tag = rest[++i];
      if (!o.tag) return null;
    } else if (a === '--today') {
      o.today = rest[++i];
      if (!isRealDate(o.today)) return null;
    } else return null;
  }
  if (cmd === 'due' && o.tag) return null;
  if (cmd === 'list' && rest.includes('--within')) return null;
  return o;
}

const when = (d) => (d.days_from_today < 0 ? `${-d.days_from_today} day${d.days_from_today === -1 ? '' : 's'} overdue` : d.days_from_today === 0 ? 'today' : `in ${d.days_from_today} day${d.days_from_today === 1 ? '' : 's'}`);
const who = (p) => [p.role, p.org].filter(Boolean).join(', ');

export function main(argv) {
  const o = parseArgs(argv);
  if (!o) {
    console.error(USAGE);
    return 2;
  }
  const today = o.today || localToday();
  const { people, problems, scanned } = readPeople();
  const out = [];
  if (o.cmd === 'due') {
    const res = computeDue(people, today, o.within);
    if (o.json) console.log(JSON.stringify({ today, within: o.within, scanned, ...res, problems }));
    else {
      if (!res.due.length) out.push(`Nobody is due in the next ${o.within} days.`);
      else {
        out.push(`${res.due.length} ${res.due.length === 1 ? 'person' : 'people'} to get back to (next ${o.within} days):`);
        for (const d of res.due) out.push(`- ${d.name}${who(d) ? ` (${who(d)})` : ''}: ${d.reasons.join(' and ')}, ${d.due_date} (${when(d)})`);
      }
      if (res.no_contact_recorded.length) {
        out.push('', 'Keep-in-touch set but no contact recorded yet:');
        for (const n of res.no_contact_recorded) out.push(`- ${n.name} (${n.cadence})`);
      }
    }
  } else {
    let list = people;
    if (o.tag) list = list.filter((p) => p.tags.map((t) => t.toLowerCase()).includes(o.tag.toLowerCase()));
    if (o.json) console.log(JSON.stringify({ today, scanned, count: list.length, people: list, problems }));
    else {
      if (!list.length) out.push(o.tag ? `Nobody is tagged "${o.tag}".` : 'There are no contacts yet.');
      else {
        out.push(`${list.length} ${list.length === 1 ? 'contact' : 'contacts'}:`);
        for (const p of list) {
          const bits = [who(p), p.next_follow_up && `follow-up ${p.next_follow_up}`, p.last_contact && `last contact ${p.last_contact}`, p.dnc && 'do not contact'].filter(Boolean);
          out.push(`- ${p.name}${bits.length ? `: ${bits.join('; ')}` : ''}`);
        }
      }
    }
  }
  if (!o.json) {
    if (problems.length) {
      out.push('', 'Things to check:');
      for (const p of problems) out.push(`- ${p.file}: ${p.problem}`);
    }
    for (const l of out) console.log(l);
  }
  return problems.length ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
