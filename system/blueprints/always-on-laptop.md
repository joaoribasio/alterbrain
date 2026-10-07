---
type: "blueprint"
title: "Run Alterbrain on a schedule from your laptop"
kind: "automation"
status: "available"
risk: "low"
cost: "free (uses your normal Claude plan)"
---

# Run Alterbrain on a schedule from your laptop

## What it does

Alterbrain does small jobs for you at set times, with no one typing. Example: every weekday at 07:30 it tidies your inbox of notes and writes your morning brief.

The jobs run through the Claude desktop app's **local scheduled tasks**. They run on your own computer, in your own vault.

## You'll need

- The Claude desktop app, signed in with your own Claude subscription.
- Alterbrain already set up (onboarding finished).
- A laptop that is **on, awake and has the app open** when the job is due.

## Cost and risk

- Cost: no extra money. Each run uses some of your normal Claude plan allowance.
- Risk: low. Jobs follow your autonomy settings, so they only draft. They never send.
- Honest limits (checked 7 October 2026 against https://code.claude.com/docs/en/desktop-scheduled-tasks):
  - A job only runs while the desktop app is open and the computer is awake.
  - If the laptop was asleep at the due time, that run is skipped. When the app starts or the laptop wakes, it does **one** catch-up run for the most recent missed time (it looks back 7 days) and drops older ones. A 07:30 job may therefore run at 11:00 or later.
  - The shortest gap between runs is 1 minute. You will not need anything that fast.
  - The app has a "Keep computer awake" setting (Settings > This computer > System). Closing the lid still sleeps the laptop.
- Terms (read them yourself): Claude Code is covered by Anthropic's Consumer Terms (https://www.anthropic.com/legal/consumer-terms, version effective 8 October 2025, read on 7 October 2026) and Usage Policy (https://www.anthropic.com/legal/aup). Those terms bar automated use of the service except through an API key or where Anthropic permits it, and bar sharing your login. The Claude Code legal page (https://code.claude.com/docs/en/legal-and-compliance) says Pro and Max limits assume ordinary, individual use. This blueprint only uses Anthropic's own features, unmodified, signed in by you. It is not legal advice, and whether an unattended job counts as ordinary use is not spelled out, so keep it small and personal. Source notes: `docs/research/claude-code-mechanics.md`.
- Closing the lid, shutting down or quitting the app means no run. For jobs that must never miss, see "Run Alterbrain on a spare computer at home".

## Questions I'll ask you

1. What should run, and how often? (Start with one job only.)
2. What time, in your time zone?
3. Should the job only read and write notes, or may it also read your connected mail or calendar?
4. If the laptop is asleep, is a late run fine, or should I remind you instead?
5. Do you want a notification when a job finishes or fails?

## Build steps

1. **Verify first.** Check whether the scheduled-tasks tools are listed in this session. If they are, use them (step 4). If not, do not stop: give the user the prompt from step 3 to paste and the steps for the Routines page (Code tab > Routines > New routine > Local: name, instructions, this project folder, schedule). Do not suggest wrappers or other tools that handle their login.
2. Run `/clarify` (type `automation`) and confirm the job in one sentence.
3. Write the job's instructions as a short prompt that names the skill to run, for example "Run /capture on the inbox, then write today's brief". The prompt must not contain secrets.
4. Create the scheduled task with the scheduled-tasks tool if it is listed (otherwise the user creates it from your prompt in the Routines page). Use the user's time zone and the lowest sensible frequency. Never set an interval below 15 minutes unless the user insists. Tell the user that the first run may stall on permission prompts: they should click "Run now" once and approve what the job needs.
5. Make the job safe:
   - it works inside this project folder only;
   - it never calls send, post or submit tools (the outbound guard blocks them anyway);
   - on any failure it adds a `#ab/automation` task with `node system/scripts/tasks.mjs add`.
6. Add a setup task for the human: "Keep the Claude app open and turn on Keep computer awake in the app settings." Do **not** change power settings yourself. Show the user where the setting is and let them do it.
7. Record the job in `state/built.json` with name, schedule and date. Take the date from the system.

## How to test

1. Run the scheduled task once by hand from the desktop app.
2. Check the result file or note exists and looks right.
3. Close the app, wait past the due time, reopen it, and confirm exactly one catch-up run happens (the run history shows skipped and catch-up runs).

## How to undo

Delete the scheduled task in the desktop app (or ask: "ask Alterbrain: stop the morning job"). Remove its line from `state/built.json`. Nothing else was changed.
