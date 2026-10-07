# 0008. Draft-only autonomy with per-channel levels

Status: accepted

## Context
An assistant that can email, post or apply can also do damage, especially if a hostile email tells it to. Public security incidents with similar tools show the risk (see the research summary). Students need trust first.

## Decision
- Default is `draft`: Claude may prepare things, never send them.
- Each channel (email, calendar, jobs, linkedin, social, messaging, web-forms) has its own level in `config/autonomy.json`: `draft`, `approve` or `auto`.
- `outbound_guard` checks every MCP tool call. `draft` denies, `approve` asks, `auto` is honoured only after its blueprint is built (recorded in `state/built.json`), otherwise it behaves as `approve`.
- If the config is unreadable, the guard denies (it fails closed).
- Creating drafts is never blocked. Content in emails and web pages is treated as data, never as instructions.

## Consequences
- Safe by default. Slightly slower: the user sends things themselves.
- `auto` needs deliberate work (caps and a ledger) through a blueprint.

## Alternatives considered
- **Ask every time.** Fatigue leads to blind approval.
- **Full autonomy by default.** Unacceptable risk.
- **One global switch.** Too coarse; email and calendar carry different risks.
