#!/usr/bin/env node
// PreToolUse + PostToolUse + PostToolUseFailure (mcp__.*): the rate guard (spec section 14).
//
// For an MCP server that has limits in system/catalogue/limits.json (LinkedIn today):
//   Pre   checks the call against the daily, weekly, weekday and minimum-gap limits, the warning pause, draft-only mode
//         and the "never repeat an unknown outcome" rule. Over a limit -> deny with a plain reason.
//   Post  counts the call AFTER it ran (so a call the user declined is never counted), writes one line to the ledger,
//         spots platform warnings (captcha, checkpoint ...) and sets the throttle, and notes unknown outcomes.
//   Post (failure) the same for a call that failed or timed out: it may still have reached the platform.
//
// A server with no limits is never touched (no output). This hook never answers "allow": that would skip the permission
// prompt. Fails CLOSED for a rate-limited server when the limits, the ledger or the state cannot be read; fails OPEN on
// a payload it cannot read at all (it cannot tell which server it is about). Always exits 0.
import { context, deny, isMainModule, readInput, runHook, toolInfo } from '../lib/hookio.mjs';
import { CRASH_REASON, preCheck, recordCall } from '../lib/rateguard.mjs';

function eventOf(input) {
  const name = input.hook_event_name;
  if (name === 'PreToolUse' || name === 'PostToolUse' || name === 'PostToolUseFailure') return name;
  return 'tool_response' in input || 'error' in input ? 'PostToolUse' : 'PreToolUse';
}

async function main(ctx) {
  const input = await readInput();
  if (!input) return;
  const info = toolInfo(input);
  if (!info.isMcp || !info.server || !info.tool) return;
  const event = eventOf(input);
  ctx.event = event;
  if (event === 'PreToolUse') {
    const verdict = preCheck(info.server, info.tool, info.toolInput, new Date(), ctx);
    if (verdict) deny(verdict.reason);
    return;
  }
  const result = recordCall({
    serverName: info.server,
    tool: info.tool,
    toolInput: info.toolInput,
    response: input.tool_response,
    error: input.error,
    isError: input.is_error === true || event === 'PostToolUseFailure',
    now: new Date(),
  });
  if (result && result.notes.length) context(result.notes.join(' '), event);
}

if (isMainModule(import.meta.url)) {
  const ctx = { limited: false, event: '' };
  await runHook(() => main(ctx), {
    // Only a Pre check can refuse, and only for a server known to have limits.
    onError: () => {
      if (ctx.limited && ctx.event === 'PreToolUse') deny(CRASH_REASON);
    },
  });
}
