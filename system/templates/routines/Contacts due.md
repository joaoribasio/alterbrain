---
type: "routine"
created: "{{date}}"
status: "suggested"
schedule: "Mondays 08:00"
cadence: "weekly:mon@08:00"
host: "laptop"
runs: "prompt"
may: "draft only"
data:
  - "vault/60_people"
model: "sonnet"
effort: "medium"
last_run: ""
last_result: ""
---
# Contacts due

## What it does

Once a week it finds the people you meant to get back to and drafts a short message for each, so no follow-up slips. It never asks questions: anything it cannot settle on its own becomes a task for you.

## Where it runs

On a laptop the record step updates this note directly. On a cloud or server host the run works on its own copy of the vault, so the record step reaches your vault only if that run also commits and pushes the note change. Until it does, keep this note paused and read the real last run on the host's page.

## Instruction for the host

Work in the Alterbrain project folder. Do not ask any question: if something is unclear or missing, add a task for the user instead and carry on. Draft only: never send, post or submit anything.

1. Run `node system/scripts/people.mjs due --within 7 --json`. If nobody is due, skip to step 4.
2. For each person due, delegate to the `ghostwriter` agent: channel `email` (or `linkedin` if that is the only contact route in the note), the person's language, recipient class `professional` (or the class named in the note), length `short`. Give it only the business facts from the note (how you met, the last interactions, one small clear ask), never the `## Private` section. Save each draft to `vault/00_inbox/outbox/`.
3. Add one task per draft: `node system/scripts/tasks.mjs add "Review the message to <name>" --tag people --link "<draft path>"`. For a person whose note cannot be read or whose date is broken, add a task to fix it instead of drafting.
4. Record the run: `node system/scripts/routines.mjs record "Contacts due" --result "<one line: how many people were due, how many drafts, how many tasks to fix>"`
