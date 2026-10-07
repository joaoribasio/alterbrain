#!/usr/bin/env node
// date: today's date from the system clock, in LOCAL time (the same clock the
// session digest uses). Skills call this instead of doing date sums themselves.
//
//   node system/scripts/date.mjs                      -> 2026-10-07
//   node system/scripts/date.mjs --plus 1             -> tomorrow (negative numbers count back)
//   node system/scripts/date.mjs --from 2026-10-20 --plus -5
//   node system/scripts/date.mjs --now                -> 2026-10-07 14:32:05
//   node system/scripts/date.mjs --weekday            -> Wednesday
//   node system/scripts/date.mjs --iso-week           -> 2026-W41 (ISO week of the date)
//   add --json for a machine-readable object.
//
// Exit codes: 0 ok, 2 usage error.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { today } from '../lib/fsx.mjs';
import { isMainModule } from '../lib/paths.mjs';

const USAGE = 'Usage: node system/scripts/date.mjs [--from YYYY-MM-DD] [--plus N] [--now] [--weekday] [--iso-week] [--json]';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function parseArgs(argv) {
  const opts = { from: null, plus: 0, now: false, weekday: false, isoWeek: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith('--') && a.includes('=') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    if (flag === '--json') opts.json = true;
    else if (flag === '--now') opts.now = true;
    else if (flag === '--weekday') opts.weekday = true;
    else if (flag === '--iso-week') opts.isoWeek = true;
    else if (flag === '--plus') {
      const v = inline ?? argv[++i];
      if (!/^-?\d{1,5}$/.test(String(v))) return null;
      opts.plus = Number(v);
    } else if (flag === '--from') {
      const v = inline ?? argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return null;
      opts.from = v;
    } else return null;
  }
  return opts;
}

/** A local Date at midnight for a YYYY-MM-DD string, or null if it is not a real date. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return today(d) === s ? d : null;
}

/** ISO week label, for example 2026-W41. */
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export function compute(opts, now = new Date()) {
  let base = now;
  if (opts.from) {
    base = parseDay(opts.from);
    if (!base) return null;
  }
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + opts.plus, base.getHours(), base.getMinutes(), base.getSeconds());
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: today(d),
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    weekday: DAYS[d.getDay()],
    iso_week: isoWeek(d),
  };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts) {
    console.error(USAGE);
    return 2;
  }
  const r = compute(opts);
  if (!r) {
    console.error('That is not a real date. Use the form YYYY-MM-DD.');
    return 2;
  }
  if (opts.json) {
    console.log(JSON.stringify(r));
    return 0;
  }
  let out = r.date;
  if (opts.now) out = `${r.date} ${r.time}`;
  if (opts.weekday) out = r.weekday;
  if (opts.isoWeek) out = r.iso_week;
  console.log(out);
  return 0;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
