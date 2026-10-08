---
type: "guide"
title: "Routines: your scheduled jobs"
summary: "What a routine is, how to see your routines in Obsidian, how they run on each computer, why one may have stopped, and how to pause one."
---
# Routines: your scheduled jobs

A routine is a job that runs on a schedule, for example "every Monday at 08:00, list the people I should get back to". Alterbrain does not run the schedule itself. Your computer or the Claude app does. Alterbrain keeps one note per routine so you can see what runs, move it to another computer and notice when it stops.

## See your routines

- In Obsidian, open the `Routines` view (`_views/Routines.base`). It shows each routine's status, schedule, host, last run and last result.
- Or ask: "check my routines". Alterbrain lists them and says which are late.
- The notes are in `vault/90_routines/`, one per routine. The note holds the exact instruction the job follows, so you can copy it to any computer.

## How they run

- **Laptop (Claude desktop app).** A scheduled task in the Claude app runs the instruction. The app must be open and the computer awake. After sleep, a missed run happens once when the app is back.
- **Claude cloud routine.** Runs on Claude's servers, with a copy of your project. It updates the note only if the instruction also saves and uploads the change, so check the Routines page in the Claude app for the truth.
- **A server of your own.** Its own scheduler (cron) runs the instruction. Same copy rule as the cloud.

Every routine only prepares drafts and tasks. Nothing is sent, whatever the schedule says. What a job may send is still decided by your sending rules.

## Why one stopped

Each run ends by writing "last run" into its note. If that date is older than the schedule allows, Alterbrain flags it: one line at the start of a session, in the health check and in the weekly review. Usual causes:

- The laptop was off or asleep, or the Claude app was closed.
- The schedule on the host was deleted or paused.
- A cloud or server run could not save its result back, so the note looks stale though the job ran.
- The last step ("record the run") is missing from the instruction on the host.
- The note itself is damaged (its top block is missing or not closed). "Check my routines" and the health check then list it as unreadable, with what to repair, instead of ignoring it.

Fix the cause, then run the job once. The note updates itself.

## Pause or remove one

- Pause: set `status` in the note to `paused`. It is no longer checked. Also pause the schedule on the host, or it keeps running.
- Remove: delete the note and the schedule on the host. `/remove-skill` does this for something it built.

## Suggested routines

Alterbrain offers a short list (contacts due each Monday, a weekly review reminder, a morning brief if you built it). Say "suggest routines" to see them. A suggestion becomes active only when you say yes.
