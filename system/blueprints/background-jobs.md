---
type: "blueprint"
title: "Keep jobs running while you are away (choose how)"
kind: "automation"
status: "available"
risk: "medium"
cost: "free to small, depending on the option you choose"
---

# Keep jobs running while you are away (choose how)

## What it does

Some jobs are worth doing on a schedule, not only when you open a session. Examples: notice news, job changes and achievements of the people you keep in touch with, and queue "people to congratulate"; check weekly for a new Alterbrain version; build a morning brief.

This blueprint does not pick a way for you. It lays out the options so you choose the one that fits how you work, then builds that one. Whatever you choose, the jobs only **prepare** things: drafts, lists and reminders. Nothing is sent, posted or applied until you say yes in a session.

The jobs themselves have their own blueprints (for example `keep-in-touch.md`). This one is about **where and how** they run.

## You'll need

Depends on the option:

| Option | What it is | Good for | Watch out |
|---|---|---|---|
| **Laptop schedule** (`always-on-laptop.md`) | The Claude desktop app runs the jobs on your own computer | Easiest; no server; your notes never leave the laptop | Runs only while the laptop and the app are on |
| **Home computer** (`always-on-home-machine.md`) | A spare Mac or PC that stays on | Always on, private | Few people have a spare machine |
| **Free cloud server** (`linux-vps-oracle.md`) | A free Oracle machine (no graphics card) | Always on, free | Hardest to set up; free machines can be reclaimed when idle [Unverified: terms change] |
| **Claude cloud routines** | Scheduled runs in Anthropic's cloud | No machine of your own | Your data goes to the cloud run; availability depends on your plan [Unverified] |
| **Phone alerts** (`telegram-channel.md`) | Adds a message channel to any option above | You see results away from the laptop | One more account |

Optional add-on for any always-on option: a small open-source model running on the machine itself, only to **sort** results (for example "is this news really about this person?"). [Inference] Small models are fine at sorting and weak at writing in your voice, so drafting stays with Claude in a session. Start without one: simple name and company matching may be enough.

## Cost and risk

- Cost: free (laptop, home computer, free server) or small (a paid API key, if you add one for sorting).
- Risk: medium. Any option other than the laptop puts a copy of some of your data on another machine or in the cloud.
  - Give a job only the data it needs (for example the people list), never the whole vault.
  - Encrypted notes stay unreadable on a machine without your key; do not copy the key there unless you accept that.
  - No scraping of LinkedIn or other sites whose terms forbid it: news feeds, official data and your own exports only. The rate guard applies.
  - Read each host blueprint's own risk section before you build it.

## Questions I'll ask you

1. Which jobs do you want running? (Suggested first: keeping in touch, and the weekly update check.)
2. Is your laptop usually on, with the Claude app open, during the day? (If yes, the laptop schedule is the recommended start.)
3. Do you have a spare computer that stays on, or would you rather try a free cloud server?
4. Where should results show up: your task list (default), a note, or your phone?
5. Do you want a small local model to filter noise, or start without one? (Suggested: start without.)

## Build steps

1. Run `/clarify` with the answers above. Do not start until each answer is clear.
2. Recommend one option, with one line of pro and con for each of the others, and why the recommended one fits this user (their answers to 2 and 3).
3. Build the chosen host by following its own blueprint (`always-on-laptop.md`, `always-on-home-machine.md`, `linux-vps-oracle.md`, or Claude's cloud routines if the user's plan has them; check what this session can actually see before promising).
4. Build each chosen job from its own blueprint (for example `keep-in-touch.md`) on that host. Each job writes results to the task list or a note and never sends anything. Every scheduled job is a routine note in `vault/90_routines/` (`host` says where it runs): create one per job as `/build` describes under "Routine notes", and point the user to the list ("check my routines").
5. If the user asked for a local sorting model, add it only on an always-on machine, as a separate step with its own test, and keep a plain fallback (name matching) when the model is unavailable.
6. Record the choice in a decision note (`vault/70_journal/decisions/`) so it can be changed later.

## How to test

- Run each job once by hand and check the result appears where the user chose (task list, note or phone).
- Stop the host (close the app, switch off the machine) and confirm the next session shows a task saying the job did not run, rather than silence.
- Confirm no job sent, posted or changed anything outside the vault.

## How to undo

- Remove the scheduled jobs from the host (each host blueprint has its own undo steps) and pause or delete their routine notes in `vault/90_routines/`.
- Delete any copy of your data from the other machine or cloud run.
- Keep or delete the decision note; nothing else in the vault changes.
