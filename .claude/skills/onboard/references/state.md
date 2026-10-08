# Onboarding state (`state/onboarding.json`)

Written only through `node system/scripts/onboard-progress.mjs`. Never edit the file by hand and never type a timestamp yourself: the script takes it from the system clock.

```json
{
  "schema": 1,
  "status": "in_progress",
  "started": "2026-10-07T09:12:00.000Z",
  "updated": "2026-10-07T09:31:00.000Z",
  "minimum": ["M0", "M1", "M2", "M3", "M4"],
  "modules": {
    "M0": { "title": "Setup", "status": "done", "started": "…", "finished": "…", "note": "" },
    "M1": { "title": "Identity and tone", "status": "later", "started": "…", "finished": null, "note": "wants to pick a name tomorrow" }
  }
}
```

## Fields

- `status` (overall), worked out by the script:
  - `not_started`: no module touched;
  - `in_progress`: something started, essentials not finished;
  - `minimum_done`: M0 to M4 are `done`;
  - `complete`: every module is `done` or `skipped`.
- `modules.<id>.title`: written for people who open the file, never read back. The script always uses the titles in its own code (`MODULES` in `onboard-progress.mjs`), so a renamed module shows its new title on an install that started earlier, with no migration. Never edit a stored title to rename a module.
- `modules.<id>.status`: `todo`, `in_progress`, `done`, `later` (the user said "later"; still open), `skipped` (the user does not want it).
- `started` / `finished`: ISO timestamps. `finished` is set by `done` and `skip`.
- `note`: one short line to resume from ("stopped at course 2 of 4"). No personal details beyond what the next step needs.

## Commands

| Command | Effect |
|---|---|
| `node system/scripts/onboard-progress.mjs show` | Plain summary for the user, with the next module and the minutes per module for this kind of learner |
| `node system/scripts/onboard-progress.mjs show --json` | The state plus `learner_kind` (`mba`, `degree`, `online`, `professional`, `other`, or `null` until M2 asks) and `estimate_minutes`: `{ "minimum": 24, "remaining": 17 }`, the time for the essentials (M0 to M4) for that kind, in all and still to do |
| `node system/scripts/onboard-progress.mjs next --json` | `{ "next": "M2", "title": "…", "file": "workflows/M2-you-and-facts.md" }` |
| `node system/scripts/onboard-progress.mjs start M2` | Mark in progress (keeps the first start time) |
| `node system/scripts/onboard-progress.mjs done M2` | Mark done |
| `node system/scripts/onboard-progress.mjs later M2 --note "<where we stopped>"` | Save for later |
| `node system/scripts/onboard-progress.mjs skip M8` | The user does not want this module |
| `node system/scripts/onboard-progress.mjs reset M5` | Back to `todo` (used by `/reconfigure` before a full redo) |

Modules accept aliases too: `setup`, `identity`, `you`, `courses` (also `projects`, `learning`, `work`), `autonomy`, `voice`, `career` (also `job-search`), `gmail`, `brand`, `import`.

## How long it takes

M3 is the one module whose time depends on the learner: MBA, degree and other 6 minutes, online courses 4, working (not studying) 3. M1 takes 2. So the essentials take about 24 minutes (MBA, degree, other), 22 (online) or 21 (professional). `learner_kind` comes from `config/brain.json` `learner.kind`. If it is missing or empty, older installs count as `mba` when `packs` lists `mba` or a `school` block exists; otherwise it is `null` and the default of 6 minutes for M3 is used.

## Who reads it

- `system/hooks/session_start.mjs`: shows "setup incomplete" in the digest while `status` is `not_started` or `in_progress`.
- `/menu` and `/reconfigure`: show what is set up.
- `system/scripts/doctor.mjs`: reports the onboarding state.
