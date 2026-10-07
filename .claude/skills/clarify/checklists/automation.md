# Clarify checklist: automation

**Use for:** anything that runs on a schedule or without the user asking each time: a morning brief, a weekly job scan, a laptop heartbeat, an always-on computer, Telegram chat. Explain once: "An automation runs by itself at set times. It still only drafts unless you've chosen otherwise."

## Infer first

- The blueprint in `system/blueprints/` (most automations have one: `morning-brief`, `always-on-laptop`, `always-on-home-machine`, `linux-vps-oracle`, `telegram-channel`, `cost-report`, `gmail-send-approval`). Its **Questions I'll ask you** come first.
- `config/brain.json` (`plan_tier`, time zone), `config/autonomy.json`.
- The skill it would run (must exist, or be built first).

## Common fields, as they apply to an automation

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What should happen automatically?" | from the blueprint |
| Inputs | "What does it look at each time?" | your tasks, calendar or inbox (read only) |
| Output | "What should be waiting for you afterwards?" | a note in `70_journal/daily/` + a task if action is needed |
| Audience | "Just you?" | just you |
| Constraints | "Anything it must never do on its own?" | never send, post or pay; drafts only |
| Deadline | "When should it start?" | from tomorrow |
| Success test | "How will you know it ran?" | the note appears at the set time; a failure becomes a task |

## Type-specific (required)

- **Schedule.** Days and time, in the user's time zone ("weekdays at 07:30").
- **Where it runs.** This laptop (needs the Claude app open and the computer awake), a spare computer, or a cloud server. Explain the trade-off in one line each.
- **Usage and cost.** "Each run uses part of your Claude plan." Estimate runs per week. On Pro, suggest fewer runs.
- **Off switch.** How to pause it in one step. Must be agreed before building.
- **Failure handling.** A failed run adds a `#ab/automation` task. Agreed by default.
- **Outbound.** If it could send anything, the channel level in `config/autonomy.json` applies; `auto` needs the matching blueprint built.

## Ready when

- Schedule, place and off switch are agreed.
- The skill it runs exists (or is part of this build).
- The user accepted the usage estimate.

## Where the brief goes

The proposal card (`kind: "automation"`): `## Agreed brief`.
