# 0017. Renamed `/checkup` to `/health-check`

Status: accepted

## Context
The first plan called the setup-and-repair skill `/checkup`. The Claude Code docs (checked 7 October 2026) show that `checkup` is an alias of the built-in `/doctor` command. A project skill with the same name as a built-in replaces the built-in in terminal sessions, but not its aliases. How the desktop app treats a clash is not documented.

## Decision
- Call the skill `/health-check`.
- Avoid all built-in names and aliases for skills: help, config, settings, status, memory, init, upgrade, doctor, checkup, review and code-review. `docs/SPEC.md` section 7 keeps this list.

## Consequences
- No clash with a built-in command in any surface.
- Every document, task tag and message uses `health-check`. Tasks the skill creates carry `#ab/health-check`.
- The script behind it is still `system/scripts/doctor.mjs`. It is a script, not a command, so the name is free to use.

## Alternatives considered
- **Keep `/checkup`.** Risky: the alias would still open the built-in `/doctor` in some places.
- **`/doctor-plus` or `/doctor`.** Too close to the built-in and confusing for non-technical users.
