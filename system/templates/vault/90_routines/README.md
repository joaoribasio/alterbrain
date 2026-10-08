---
type: "readme"
created: "{{date}}"
status: "active"
---
# Routines

One note per scheduled job. Alterbrain does not run its own scheduler: the job runs on the Claude desktop app (scheduled tasks), a Claude cloud routine, or a server's own scheduler. The note makes the job visible and portable. Its body is the exact instruction the host runs, so you can copy it to recreate the job on any host. Each run records itself in the note (`last_run`, `last_result`), and if a job stops running, the start of your next session says so.

Routines only ever draft: they save to `00_inbox/outbox/` or add a task, and never send anything. Say "check my routines" to see which are active and which are late. The table is in `vault/_views/Routines.base`.

## The note

- The instruction the host runs is everything under the heading "Instruction for the host", to the end of the note. `node system/scripts/routines.mjs show "<name>" --instruction` prints exactly that text. Keep that heading last, and keep the final "record" step in it.
- `status` is active, paused or suggested. `cadence` is daily@HH:MM, weekly:<mon..sun>@HH:MM or monthly:<1-28>@HH:MM, in your local time. `host` is laptop, cloud or server.
- `runs` is a skill such as "/people due", or "prompt". `may` is always "draft only". `data` lists the vault paths the job may read. `model` is haiku, sonnet, opus or inherit; `effort` is low, medium or high.
- `last_run` and `last_result` are filled in by each run.
