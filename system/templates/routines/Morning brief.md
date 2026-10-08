---
type: "routine"
created: "{{date}}"
status: "suggested"
requires: "morning-brief"
schedule: "Every day 07:30"
cadence: "daily@07:30"
host: "laptop"
runs: "prompt"
may: "draft only"
data:
  - "vault/00_inbox/Tasks.md"
  - "vault/00_inbox/outbox"
model: "sonnet"
effort: "medium"
last_run: ""
last_result: ""
---
# Morning brief

## What it does

Every morning it writes a short brief of what is due today, what is waiting for you and what changed. Needs the morning-brief add-on to be built first.

## Where it runs

On a laptop the record step updates this note directly. On a cloud or server host the run works on its own copy of the vault, so the record step reaches your vault only if that run also commits and pushes the note change. Until it does, keep this note paused and read the real last run on the host's page.

## Instruction for the host

Work in the Alterbrain project folder. Produce the morning brief exactly as the morning-brief add-on defines it (see `.claude/skills/my-morning-brief/` or the blueprint `system/blueprints/morning-brief.md`) and save it as a draft in `vault/00_inbox/outbox/`. Draft only: never send, post or submit anything.

1. Build the brief and save it to `vault/00_inbox/outbox/`.
2. Record the run: `node system/scripts/routines.mjs record "Morning brief" --result "<one line: what the brief covers>"`
