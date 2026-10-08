---
type: "routine"
created: "{{date}}"
status: "suggested"
schedule: "Fridays 16:00"
cadence: "weekly:fri@16:00"
host: "laptop"
runs: "prompt"
may: "draft only"
data:
  - "vault/00_inbox/Tasks.md"
model: "haiku"
effort: "low"
last_run: ""
last_result: ""
---
# Weekly review reminder

## What it does

Once a week it adds a task to run your weekly review, so the habit does not depend on remembering it.

## Where it runs

On a laptop the record step updates this note directly. On a cloud or server host the run works on its own copy of the vault, so the record step reaches your vault only if that run also commits and pushes the note change. Until it does, keep this note paused and read the real last run on the host's page.

## Instruction for the host

Work in the Alterbrain project folder. Add one task, unless an open one already exists. Draft only: do nothing else.

1. Run `node system/scripts/tasks.mjs add "Run the weekly review" --tag weekly-review`. Skip this if `vault/00_inbox/Tasks.md` already has an open task with that text.
2. Record the run: `node system/scripts/routines.mjs record "Weekly review reminder" --result "<one line: task added or already open>"`
