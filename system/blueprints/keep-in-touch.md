---
type: "blueprint"
title: "Keep in touch (news and milestones from your contacts)"
kind: "automation"
status: "available"
risk: "medium"
cost: "free"
---

# Keep in touch (news and milestones from your contacts)

## What it does

Once a week, for the contacts you chose, it looks for news you would want to react to: a job change, a promotion, a company announcement, a talk or event they are speaking at, an award, a published article. For each item it writes a short **congratulation or check-in draft** in your voice and adds a task to review it. You send it yourself. Nothing is posted or sent for you.

Example: "Priya Example has started as Head of Strategy at Harbourline Logistics (company announcement, 2 October). Draft congratulation saved. Review it?"

It builds on the contact book (`/people`, notes in `vault/60_people/`). The basic contact book needs none of this: follow-up dates, rhythms and the weekly-review list work without it.

## You'll need

- The contact book in use: people notes with `last_contact`, `cadence` and `tags` (`/people`).
- A voice profile (`/onboard`, module M5) so drafts sound like you.
- A list of the few contacts to watch (a tag such as `watch` on their notes). Start with 5 to 15, not everyone.
- Sources that are allowed (see below). If you want news from LinkedIn, your own data export (`linkedin-data-portability`) is the safe route.

## Cost and risk

- Cost: free. It uses some of your Claude allowance each week, in proportion to the number of contacts watched.
- Risk: medium.
  - It reads information about other people. Business and public facts only, each with a source and a date. Nothing sensitive: no family, health, beliefs, home address or finances. Birthdays only for contacts where you added one yourself.
  - A congratulation sent on a wrong or stale fact is embarrassing. Every draft shows its source and date, and you check before sending.
  - **No scraping.** It uses official data (company news pages, press releases, conference programmes, RSS feeds the site offers, search results the `researcher` helper reads as an ordinary web search) or files you export yourself. It never logs in as you, never walks LinkedIn pages, and never runs lists of people through people-search sites.
  - LinkedIn: only through the rate guard, only for named people, and the `linkedin` channel stays on `draft`. Automated access breaks LinkedIn's rules (see `linkedin.md`); the safer route is your own data export.
  - Drafts only. `config/autonomy.json` stays on `draft` for email and LinkedIn.
- Do not use it for people who asked not to be contacted (`dnc: true`). They are skipped.

## Questions I'll ask you

1. Which contacts should I watch? (Suggested: tag them `watch`; start with 5 to 15.)
2. What counts as news worth a note? (Suggested: job change, promotion, company announcement, award, a talk or article.)
3. How often? (Suggested: weekly, together with your weekly review.)
4. Which sources are you comfortable with? (Suggested: company news pages and press releases, plus your LinkedIn data export. Not LinkedIn browsing.)
5. Language and tone for the drafts? (Suggested: from your voice profile, short, one line of real congratulation and no ask.)
6. How many drafts a week at most? (Suggested: 3, so each message stays personal.)

## Build steps

1. **Verify first.** Read `.claude/skills/people/references/enrichment.md` and `system/blueprints/linkedin.md` and confirm the rules still match. Check `config/autonomy.json`: `email` and `linkedin` must be `draft`. Do not change them.
2. Run `/clarify` (type `automation`) with the answers above.
3. Create a skill `my-keep-in-touch` (`model: sonnet`, `effort: medium`). Steps for the skill:
   - read `node system/scripts/people.mjs list --tag watch --json`; skip anyone with `dnc: true`;
   - for each watched person, one question to the `researcher` agent (`depth: quick`, `scope` limited to the sources chosen): "Has <name> at <org> changed role, been promoted, announced something, won an award or given a talk since <last_contact or last check>?" At most 15 people per run;
   - for LinkedIn, only the user's own data export if they ingested one; the connector only for a named person, after `node system/scripts/rate-guard.mjs status`;
   - keep an item only if it has a source address and a date, and the person is clearly the right one (same employer as in the note). Otherwise drop it, silently;
   - delegate each kept item to the `ghostwriter` agent (`channel: linkedin` or `email`, `recipient_class: professional` or `peer`, `length: short`, intent: congratulate or say hello, no ask); the draft goes to `vault/00_inbox/outbox/` with the source in its notes;
   - add one `#ab/people` task per draft, and offer to log the interaction after the user sends it;
   - save the date of the last check in `state/local/keep-in-touch.json`; at most 3 drafts per run.
4. Write the routine note `vault/90_routines/Keep in touch news.md` (`runs: "/my-keep-in-touch"`, `may: "draft only"`, `data: ["vault/60_people"]`) as `/build` describes under "Routine notes". The note starts as `paused` and goes `active` only once the schedule exists on the host (and, for a cloud or server host, once the run can push its note change); a paused note is never monitored, so it cannot raise a false "has not run yet". Use that name, not "Contacts due": "Contacts due" is the framework's own suggested routine (follow-ups that are due, from `people.mjs due`), and a second note with the same name would be refused. The two do different jobs and can both run. Write the body as the exact instruction the host runs, ending with `node system/scripts/routines.mjs record "Keep in touch news" --result "<one line>"`, then check it with `node system/scripts/routines.mjs show "Keep in touch news"`. Offer the follow-ups routine as well: `node system/scripts/routines.mjs suggest` lists "Contacts due", and `node system/scripts/routines.mjs enable "Contacts due" --user-asked` creates it, only when the user said yes in chat (without the flag the note is saved inert, as `suggested`, and the job is never monitored). With the flag it is `active` at once, so set it to `paused` straight away and treat it like the first job: schedule it on the host with the text from `node system/scripts/routines.mjs show "Contacts due" --instruction`, then set it to `active`. Every scheduled job is a routine note; point the user to it. Record the build in `state/built.json`, listing the note in its paths.
5. Schedule it with the weekly review or as a desktop scheduled task exactly as `morning-brief.md` describes (the user sets it in the app; give the prompt to paste and the clicks). When you give the scheduled task its prompt, print the instruction with `node system/scripts/routines.mjs show "Keep in touch news" --instruction`, so the host runs the note and not a copy. Once the schedule exists on the host, set the note to `active` (see step 4). Include the off switch: remove the `watch` tag, or `/remove-skill my-keep-in-touch`.

## How to test

1. Tag one test contact `watch`, with a real employer and a recent public announcement you know of. Run the skill. Expect one draft in the outbox with a source address and a date, and one task.
2. Tag a contact with `dnc: true` as well. Expect them to be skipped.
3. Run it for a contact with nothing new. Expect nothing written and no task.
4. Ask it to send a draft. Expect a refusal and a pointer to the outbox.

## How to undo

`/remove-skill my-keep-in-touch`, then pause the routine note `Keep in touch news` in `vault/90_routines/` (set `status: "paused"`, recommended: the history stays) or delete it, and delete the schedule on your host (the Claude app's Scheduled tasks or Routines page, or your server's scheduler), or it keeps running. "Contacts due" is a separate routine; leave it unless you want it gone too. Delete the `watch` tag from the notes if you like, and delete `state/local/keep-in-touch.json`. Drafts already in the outbox stay until you remove them.
