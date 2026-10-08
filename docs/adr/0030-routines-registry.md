# 0030. A registry of scheduled jobs ("routines"), not a scheduler

Status: accepted (2026-10-08, product owner)

## Context
Scheduled jobs (a morning brief, a weekly contacts check) run on a host: a Claude desktop scheduled task on the laptop, a Claude cloud routine, or a server's own scheduler. Their text lives on the host, not in the vault. A user cannot see them in Obsidian, cannot move one to another host without rewriting it, and learns that one stopped only by noticing the silence. Alterbrain needs none of the host machinery to fix that.

## Decision
- **Alterbrain runs no scheduler.** Hosts stay as they are. A routine is a note that describes a job and records its runs.
- **One note per routine** in `vault/90_routines/<Name>.md` (type `routine`; template `system/templates/notes/routine.md`; shape in SPEC §3). The body ends with the exact instruction the host runs, so the job can be recreated on any host by copy and paste, and its last step is `routines.mjs record`, which writes `last_run` and `last_result` into the note.
- **`may: "draft only"` is fixed.** Anything else makes the note invalid. It is an instruction to the run and a label for the reader, not a lock: `config/autonomy.json` still decides what any run can send (non-negotiable 1).
- **Overdue detection.** An active, valid routine is overdue when its last run is older than one interval plus a grace of half an interval (at least 2 hours). A routine that never ran counts from the end of its `created` day (or the full stamp) to its first due time, plus the same grace. Paused, suggested and invalid notes are never overdue.
- **Fail-visible.** The session digest gets at most one line when an active routine is overdue; `doctor` and `/health-check` list overdue routines, invalid notes and notes that cannot be read as a routine (no top block, an unclosed block, no `type`); `/weekly-review` counts them; `routines.mjs list`, `overdue` and `show` exit 1 for any of these, so a host can alert; callers treat exit 1 as "something needs attention", not as a crash.
- **Suggested routines are templates**, not files written into vaults by updates (`system/templates/routines/`). `routines.mjs enable` creates a note from one, active only when the user asked.
- **`/build`** writes the routine note for every automation, keeps the `state/built.json` record, and schedules the host with `routines.mjs show "<Name>" --instruction`.
- **Fallback instead of a migration for the folder.** No `vault/90_routines/` means no routines; nothing reads a missing folder as an error. Guided migration `0007-routine-notes` offers notes for automations already in `state/built.json`.

## Consequences
- Jobs become visible (`Routines.base`), portable and checkable without any new moving part.
- A cloud or server run works on its own copy of the project; `record` reaches the vault only if the run also commits and pushes. Such a note stays paused until push access is confirmed, and the host's own Routines page is the source of truth until then.
- Overdue detection depends on the host calling `record`; a job that runs but skips that step looks stopped. The instruction template makes it the last step.
- Local time stamps are host-local; a server in another time zone can look early or late by that offset.

## Alternatives considered
- **Build a scheduler.** Full control, and a process to keep alive on every machine, with the account and security cost of an always-on component. Rejected.
- **Read the host's schedule directly.** No double entry, but each host has a different, partly private interface. Rejected.
- **Store the registry in `state/`.** Easier to parse, invisible in Obsidian and not portable by copy and paste. Rejected: the notes are the data, as everywhere else in the vault.
- **Allow routines that send.** Convenient, and a scheduled send has no one to approve it. Rejected: draft only.
