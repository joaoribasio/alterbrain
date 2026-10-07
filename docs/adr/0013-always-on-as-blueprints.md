# 0013. Always-on as blueprints only

Status: accepted

## Context
Running Claude all the time (on a schedule or from a phone) is attractive, but it adds servers, secrets and attack surface. It also touches Anthropic's subscription terms. Some tools in this space had serious security incidents.

## Decision
Ship no daemons. Always-on options are blueprints, built by the user's own agent on request:
1. a laptop heartbeat (a scheduled task);
2. an always-on Mac or PC with the official Telegram Channels plugin;
3. a Linux VPS (Oracle Always Free or any VPS) with Tailscale.

Each blueprint lists cost, risk and terms, and how to undo. The terms come from Anthropic's Consumer Terms, Usage Policy and the Claude Code legal page, with the URLs and the date they were read recorded in `docs/research/claude-code-mechanics.md` and in each blueprint. The pages do not say whether an unattended personal job is "ordinary, individual usage", so the blueprints say that plainly and keep to one person, one plan, one unmodified Claude Code.

## Consequences
- The core stays simple and safe, and uses unmodified Claude Code.
- Users who want always-on do a little extra work, and the terms are explained first.

## Alternatives considered
- **Bundle a daemon.** Higher risk and higher support cost.
- **Hosted service.** Not free, and takes the data off the user's machine.
