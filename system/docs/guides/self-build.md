---
type: "guide"
title: "Self-build: new skills on request"
summary: "How Alterbrain proposes, builds and removes new skills, helpers and tools, always with your yes first."
---
# Self-build: new skills on request

Alterbrain can grow new abilities for you. It always follows three steps: **propose → you approve → build.**

## 1. Propose

A proposal is a one-page card in `vault/00_inbox/proposals/`. It says:
- **What it does**, with an example;
- **Why** Alterbrain suggests it (for example "you asked for this three times");
- **What it will touch** (folders and tools);
- **Cost and risk**, in plain words;
- **How to undo** it.

Proposals come from:
- **You:** "Could you make that a skill?", "Build me something that checks my numbers."
- **The menu:** `/menu` lists ready-made add-ons under "Available to build", like Zotero, a morning brief or Outlook.
- **Alterbrain itself (if you allow it):** when it notices you doing the same job by hand on several days, it may suggest one idea at the end of a session. Never more than one at a time, never in the middle of your work, and never again once you say no.

Each proposal adds a task, so you won't lose it.

## 2. Approve

Read the card. Say "yes, build it", "not now" or "no thanks" in chat. Nothing is built without your yes.

## 3. Build

Before building, Alterbrain asks a few questions to get it right (this is called *clarify*): for example "give me one real example to test with". Then it:
1. creates the skill (its name always starts with `my-`, like `my-case-summary`);
2. checks it triggers for the right requests and not for others;
3. has a second check look for safety problems;
4. tests it with your example;
5. records it and saves.

Then just ask for it in your own words, or type `/my-case-summary`.

## Removing something

Say "remove my-case-summary" or `/remove-skill my-case-summary`. Alterbrain shows what it will remove, asks, then removes the files and puts any settings back. Your notes stay.

## Settings

- Turn suggestions on or off, or limit how many can be open: `/reconfigure` → "New-skill suggestions".
- Turn self-build off completely: the same place.

## Limits (on purpose)

Self-build can't change Alterbrain's safety rules, its core files or the tool catalogue. New skills draft only; they can't send anything beyond your autonomy level. Tools marked high-risk (such as LinkedIn automation) need your clear yes, in your own words, after the risks are explained.

## Costs

Most skills use little of your Claude plan. Skills that run on a schedule use some each time they run; the proposal says roughly how much.
