---
type: "guided-migration"
id: "0007-routine-notes"
summary: "If you already have scheduled jobs recorded in your build list, offers to give each one a routine note, so you can see it, move it to another computer and notice when it stops."
since: "0.2.0"
---
# Routine notes for your scheduled jobs

## Who this is for

Anyone whose `state/built.json` lists an automation: a scheduled job such as a morning brief or a weekly contacts check. From 0.2.0 every scheduled job has a routine note in `vault/90_routines/`. The note holds the exact instruction the job runs, when and where it runs, and when it last ran, so Alterbrain can tell you when a job has stopped. Alterbrain still runs no scheduler of its own: the job keeps running from the Claude app or your server, exactly as before. If `state/built.json` is missing or lists no automation, nothing here applies: say "Nothing to do" and record it as done.

## Evaluate

Read only. Do not write anything in this step.

1. Read `state/built.json` (`node system/scripts/built.mjs list --json`). Candidates are entries with `kind: "automation"`, plus entries whose `blueprint` is `morning-brief` or `keep-in-touch`. Host blueprints (`always-on-laptop`, `always-on-home-machine`, `linux-vps-oracle`, `background-jobs`) are not jobs: they only say where jobs run. An automation that is not scheduled (for example `gmail-send-approval`) is not a candidate.
2. No candidate: record it as done with `node system/scripts/update.mjs guided done 0007-routine-notes`, say "Nothing to do" in one line and stop.
3. List `vault/90_routines/*.md` if the folder exists. A candidate that already has a routine note (same name, ignoring capitals) is left alone; say how many.
4. Read the current procedure: `.claude/skills/build/SKILL.md`, block "Routine notes", and `system/templates/notes/routine.md`. Run `node system/scripts/routines.mjs suggest --json` to see which framework suggestions match a candidate.
5. If every candidate already has a note, record it as done and stop.

## Propose

Say in plain words what you found: each job by name, and what a routine note gives it (it shows in "check my routines", its instruction can be pasted into any computer or the cloud, and a missed run shows up at the start of your next session and in the weekly review). For each job, ask the user what the note cannot know and I must not guess: how often it runs, at what time, and where (this laptop, the Claude cloud, or a server). Offer a recommended default only where `built.json` or the job's skill says it (a weekly contacts check: weekly; a morning brief: daily). Missing detail: ask, never fill in.

Then ask once with AskUserQuestion:

- **Create them now (recommended):** "One note per job. It starts paused and becomes active once the job records its runs, so you see every job in one place and are warned only about a real stop, not a false alarm. Takes a minute per job." Con: "The note records the schedule you tell me; it does not change the schedule on your computer or in the cloud, and you add one line to the job yourself."
- **Not now:** "Nothing changes; I ask again next time you update." Con: "Until then a job that silently stops is not noticed."
- **Skip it:** "Never asks again by itself; your jobs keep running as today." Con: "No overdue warnings for those jobs unless you create notes yourself later."

## Apply

Only after a yes, and only for the jobs the user named. For each job:

- If it matches a framework suggestion and the user asked for it, create the note with `node system/scripts/routines.mjs enable "<suggested-name>" --user-asked` (the flag means the user said yes in chat; without it the note is saved inert as `suggested`), then set its `status` line to `"paused"`. Otherwise copy `system/templates/notes/routine.md` to `vault/90_routines/<Name>.md` (create the folder if needed) and fill the frontmatter as the "Routine notes" block of `/build` describes: `status: "paused"` (these jobs have no record step yet, so an active note would look overdue), `schedule` in plain words and `cadence` in machine form from the user's answers, `host`, `runs` (the job's skill), `may: "draft only"`, `data`, `model` and `effort` (from the job's skill, or the routing table), `created` from `node system/scripts/date.mjs`. Leave `last_run` and `last_result` empty.
- Write the body as the exact instruction the host runs: take the prompt the job already uses if the user can paste it; otherwise write "Run `<skill>`" with the skill's own steps left in the skill. End it with the step "record the run: `node system/scripts/routines.mjs record "<Name>" --result "<one line>"`".
- Check it: `node system/scripts/routines.mjs show "<Name>"`. Fix what it reports.
- Tell the user the one remaining step, which only they can do: add that final "record the run" step to the instruction of the job on the host (the Claude app's Routines page, or the server's scheduler), so each run updates the note. For a cloud or server job the run works on its own copy, so the note only updates if that step also pushes the change; say so. Once the step is in place, the note's `status` line changes to `"active"`. Add a task: `node system/scripts/tasks.mjs add "Add the record-the-run step to the <Name> job on its host, then set its routine note to active" --tag build --link "vault/90_routines/<Name>.md"`.

If a note with the same name exists, leave it alone and say so.

Then record it: `node system/scripts/update.mjs guided done 0007-routine-notes`.

## If skipped

Jobs keep running as today and no note is created. For "Skip it", record it with `node system/scripts/update.mjs guided skip 0007-routine-notes`. For "Not now", record nothing. To run it later, say "run the pending upgrades", or "make routine notes for my jobs".

## Never

- Never create, change or delete a schedule on the host, and never run a job to test it without the user's yes.
- Never invent a schedule, host or last run. A never-run job has an empty `last_run`.
- Never set `may` to anything but "draft only".
- Never overwrite or delete an existing routine note, and never edit `state/built.json` by hand.
- Never touch `vault/40_sources/raw/`, `.env.local`, settings files, `my-*` skills or framework files.
- Never write anything outside `vault/90_routines/`, one task per job, and the outcome record through `update.mjs`.
