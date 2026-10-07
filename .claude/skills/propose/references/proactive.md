# Proactive proposals

How Alterbrain notices a repeated need and offers, once and politely, to build something for it.

## Switches (`config/brain.json` → `self_build`)

- `mode: "propose"` and `proactive: true`: allowed.
- `proactive: false`: only when the user asks. `mode: "off"`: never.
- `max_open_proposals`: if that many cards are already `open`, stay quiet.

`node system/scripts/proposals.mjs status --json` → `can_suggest_proactively` combines all three. If it is `false`, do nothing and say nothing.

## When to run

- At the natural end of a session: the user's job is done and they say thanks, bye, or go quiet after a result.
- From `/weekly-review`, as one step.
- **Never** in the middle of a task, never while the user is stressed or up against a deadline, never during onboarding.

## Step 1: record evidence (every time it runs)

Look back over this session. Did the user ask for a **multi-step job by hand** that no installed skill covers, and that is likely to come back? Examples:
- "Summarise this case reading into one page" (third time this month);
- "Turn these meeting notes into action items and add them as tasks";
- "Check every number in my draft against the Excel file".

Not evidence: one-off questions, things an existing skill already does, small edits.

For each real one (at most two per session):

```
node system/scripts/proposals.mjs signal "<short-job-key>" --example "<plain description, no names, max 120 characters>"
```

- Use a stable key for the same kind of job (`case-reading-summary`, not a new key each time). Check `node system/scripts/proposals.mjs signals --min 1 --json` first and reuse a matching key.
- The script counts at most once per day, so one long session counts once.

## Step 2: suggest at most one

```
node system/scripts/proposals.mjs signals --min 3 --json
```

- Candidates have been seen on **3 or more different days** and were never suggested, rejected or built.
- Take the top one. Check it is not already covered by a skill, blueprint or open card.
- Write the card and task exactly as in `SKILL.md` steps 1–6. In **Why I'm suggesting it**, give the evidence plainly: "You asked me to summarise a case reading on 3 different days (1, 3 and 6 October)."

## Step 3: tell the user (short, friendly, once)

Three lines at most, after their request is fully handled:

> One idea before you go: you've asked me to summarise case readings on three different days. I could turn that into a one-step skill: you drop in the PDF, you get a one-page note in your course folder. I've put a short proposal in your inbox. Want me to build it? (yes / not now / no thanks)

- Yes → `/build`. Not now → leave the card open. No thanks → mark rejected (see `SKILL.md` step 7).
- No reply → the card and task stay; never repeat the nudge in the same session.

## Privacy

- `state/proposals.json` is part of the user's private backup. Keep examples generic: what kind of job, not whose email or which grade.
- Never record email content, other people's names or personal details, or anything from a restricted course. Describe the kind of job, not its content.
