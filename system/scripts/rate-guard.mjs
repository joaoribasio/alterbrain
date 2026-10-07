#!/usr/bin/env node
// The rate guard's status and the user's reset commands (spec sections 14 and 15).
//
//   node system/scripts/rate-guard.mjs status [--all] [--json]
//        what has been used today and this week for each rate-limited tool that is switched on (or has been used)
//   node system/scripts/rate-guard.mjs reset-throttle <server> [--json]
//        ends a warning pause and the halved limits (and forgets the warnings)
//   node system/scripts/rate-guard.mjs clear-draft-only <server> [--json]
//        lets the server write again after two warnings put it in draft-only mode
//   node system/scripts/rate-guard.mjs repair-ledger [--json]
//        drops damaged lines from the usage log so the guard can read it again
//
// Only `status` is for Claude to run by itself. The other commands lift a safety stop, so they are never on the
// allow list: Claude asks the user first. Exit codes: 0 fine, 1 problems found (status), 2 usage error.
import { isMainModule } from '../lib/paths.mjs';
import { clearDraftOnly, fmtWhen, loadFramework, loadState, repairLedger, resetThrottle, statusReport } from '../lib/rateguard.mjs';

const USAGE = `rate-guard: status of the usage limits that protect your accounts

  node system/scripts/rate-guard.mjs status [--all] [--json]
  node system/scripts/rate-guard.mjs reset-throttle <server> [--json]
  node system/scripts/rate-guard.mjs clear-draft-only <server> [--json]
  node system/scripts/rate-guard.mjs repair-ledger [--json]
`;

function parse(argv) {
  const out = { _: [], json: false, all: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a === '--all') out.all = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else out._.push(a);
  }
  return out;
}

function describeCategory(c) {
  const parts = [];
  const day = c.daily_cap === null ? `${c.used_today} today` : `${c.used_today} of ${c.daily_cap} today`;
  parts.push(day);
  if (c.weekly_cap !== null) parts.push(`${c.used_week} of ${c.weekly_cap} this week`);
  const rules = [];
  if (c.days) rules.push(`${c.days} only`);
  if (c.min_gap_seconds) rules.push(`at least ${c.min_gap_seconds} seconds apart`);
  return `  - ${c.label}: ${parts.join(', ')}${rules.length ? ` (${rules.join(', ')})` : ''}${c.writes ? ' [sends or changes things]' : ''}`;
}

function describeServer(s, now) {
  const lines = [`${s.name}${s.enabled ? '' : ' (not switched on)'}`];
  if (s.draft_only) lines.push(`  DRAFT-ONLY: ${s.name} showed two warnings, so nothing is sent or changed there. To switch this off: node system/scripts/rate-guard.mjs clear-draft-only ${s.key}`);
  if (s.paused_until) lines.push(`  PAUSED until ${fmtWhen(s.paused_until, now)} because ${s.name} showed a warning. To end the pause: node system/scripts/rate-guard.mjs reset-throttle ${s.key}`);
  if (s.throttled_until) lines.push(`  Limits are halved until ${fmtWhen(s.throttled_until, now)} because ${s.name} showed a warning.`);
  if (!s.draft_only && !s.paused_until && !s.throttled_until) lines.push('  Normal: no warnings.');
  for (const c of s.categories) lines.push(describeCategory(c));
  if (s.unknown.length) {
    lines.push(`  Not sure these went through (the same action is blocked for 24 hours): check on ${s.name} yourself:`);
    for (const u of s.unknown) lines.push(`    - ${u.tool}${u.target ? ` for ${u.target}` : ''}`);
  }
  if (s.accept_risk) lines.push('  You have accepted the risk of limits above the default in config/limits.json.');
  for (const key of s.clamped) lines.push(`  Ignored: your setting for ${key} in config/limits.json is above the default and accept_risk is not switched on.`);
  for (const n of s.notes) lines.push(`  Note: ${n}.`);
  return lines.join('\n');
}

function resolveServer(arg) {
  const fw = loadFramework();
  if (!fw.ok) return { error: `The limits file cannot be read (${(fw.problems || []).join('; ')}).` };
  const want = String(arg || '').toLowerCase();
  const key = Object.keys(fw.servers).find((k) => k.toLowerCase() === want || String(fw.servers[k].name || '').toLowerCase() === want);
  if (!key) return { error: `"${arg || ''}" is not a tool with limits. Known: ${Object.keys(fw.servers).join(', ')}.`, usage: true };
  return { key, name: fw.servers[key].name || key };
}

function main(argv) {
  let args;
  try {
    args = parse(argv);
  } catch (e) {
    console.error(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  const [cmd, server] = args._;
  const print = (obj, text) => console.log(args.json ? JSON.stringify(obj, null, 2) : text);
  const now = new Date();

  if (cmd === 'status') {
    const report = statusReport(now);
    const shown = report.servers.filter((s) => args.all || s.enabled || s.activity);
    if (args.json) {
      console.log(JSON.stringify({ ...report, servers: shown }, null, 2));
      return report.ok ? 0 : 1;
    }
    const out = [];
    for (const p of report.problems) out.push(`Problem: ${p}.`);
    if (!shown.length && !report.problems.length) out.push('No tool with usage limits is switched on, so there is nothing to show.');
    for (const s of shown) out.push(describeServer(s, now));
    console.log(out.join('\n\n'));
    return report.ok ? 0 : 1;
  }

  if (cmd === 'reset-throttle' || cmd === 'clear-draft-only') {
    const r = resolveServer(server);
    if (r.error) {
      console.error(`${r.error}\n\n${USAGE}`);
      return 2;
    }
    const before = loadState();
    const srv = before.state.servers[r.key] || {};
    if (cmd === 'reset-throttle') {
      const wasActive = Boolean(srv.paused_until || srv.throttled_until || (srv.warnings || []).length);
      resetThrottle(r.key);
      const text = !before.ok
        ? `The warning record was damaged, so it has been reset. ${r.name} runs at its normal limits again.`
        : wasActive
          ? `Done. ${r.name} is no longer paused and its limits are back to normal.${srv.draft_only ? ' It is still in draft-only mode: to switch that off too, run clear-draft-only.' : ''}`
          : `${r.name} was not paused or halved. Nothing to change.`;
      print({ ok: true, server: r.key, was_active: wasActive || !before.ok, repaired: !before.ok }, text);
      return 0;
    }
    const was = clearDraftOnly(r.key);
    print({ ok: true, server: r.key, was_draft_only: was }, was ? `Done. ${r.name} may send and change things again (your autonomy settings still apply).` : `${r.name} was not in draft-only mode. Nothing to change.`);
    return 0;
  }

  if (cmd === 'repair-ledger') {
    const dropped = repairLedger();
    print({ ok: true, dropped }, dropped ? `Removed ${dropped} damaged line${dropped === 1 ? '' : 's'} from the usage log. The guard can read it again.` : 'The usage log is fine. Nothing to repair.');
    return 0;
  }

  console.error(USAGE);
  return 2;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
