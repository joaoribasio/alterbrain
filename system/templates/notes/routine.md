---
type: "routine"
created: "{{date}}"
status: "active"
schedule: "Mondays 08:00"
cadence: "weekly:mon@08:00"
host: "laptop"
runs: "prompt"
may: "draft only"
data: []
model: "sonnet"
effort: "medium"
last_run: ""
last_result: ""
---
# {{title}}

## What it does

One or two plain sentences.

## Where it runs

On a laptop the record step updates this note directly. On a cloud or server host the run works on its own copy of the vault, so the record step reaches your vault only if that run also commits and pushes the note change. Until it does, keep this note paused and read the real last run on the host's page.

## Instruction for the host

Work in the Alterbrain project folder. Do the job below. Draft only: write results to `vault/00_inbox/outbox/` or add a task; never send, post or submit anything.

1. (The steps, one per line.)
2. Record the run: `node system/scripts/routines.mjs record "{{title}}" --result "<one line: what happened>"`
