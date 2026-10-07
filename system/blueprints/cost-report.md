---
type: "blueprint"
title: "A weekly usage and cost report"
kind: "automation"
status: "available"
risk: "low"
cost: "free"
---

# A weekly usage and cost report

## What it does

Once a week Alterbrain tells you how much it was used and what any paid extras cost. Example: "This week: 41 sessions, most use on assignment critiques. Paid tools: Exa 8 searches, Firecrawl 12 credits. You are well inside your plan."

## You'll need

- Alterbrain in use for at least a week.
- Your plan type in `config/brain.json` (`plan_tier`: `pro` or `max`).
- Optional: the dashboards of any paid keys you added (Exa, Firecrawl).

## Cost and risk

- Cost: free.
- Risk: low. It only reads usage data and writes one note.
- Honest limits:
  - On a normal subscription you do not pay per message. The report shows **how much of your plan allowance** was used, not a bill. A precise per-session money figure does not exist for subscriptions.
  - Claude Code keeps local session records, but their exact layout is not a promised interface and may change [Unverified]. The report must say "estimate" when it relies on them.
  - Paid tool usage comes from each provider's own dashboard. Alterbrain cannot see it unless you paste the numbers in.

## Questions I'll ask you

1. Which plan do you have? (Pro, Max, or none.)
2. Which paid tools do you use?
3. Do you want a warning when use is unusually high? At what level?
4. Which day should the report arrive?
5. Should it also show which skills use the most? (Helps you pick cheaper models.)

## Build steps

1. **Verify first.** Look for a documented usage command or usage view in this install of Claude Code. Use it if it exists. If you must read local session files, inspect one file first, state exactly which fields you rely on, and mark the report `[Unverified]` in its header.
2. Run `/clarify` (type `automation`).
3. Create a `my-cost-report` skill through `/propose` and `/build`: `model: sonnet`, `effort: low`. Steps:
   - collect the week's numbers (sessions, rough token counts, which skills or agents were busiest) from the verified source;
   - ask the user for any paid-tool numbers they want included. Never store provider keys in the note;
   - compare with `routing.json` fan-out caps and `plan_tier`;
   - write `vault/70_journal/weekly/<YYYY-WNN> usage.md` with `type: "weekly"`;
   - add a suggestion only when it is clear, for example "Critique rounds used Opus often: check the stop rule".
4. If use looks unusual, add one task: `node system/scripts/tasks.mjs add "Check this week's usage" --tag cost`.
5. Schedule weekly using the laptop or home-machine blueprint.
6. Record the build in `state/built.json`.

## How to test

1. Run it once by hand. Check the numbers look reasonable against what you remember.
2. Check the note says "estimate" wherever the source was not an official one.
3. Confirm no keys or tokens appear in the note.

## How to undo

Delete the schedule and run `/remove-skill my-cost-report`. Old reports stay in your journal.
