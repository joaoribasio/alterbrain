---
type: "guide"
title: "Autonomy and safety"
summary: "What Alterbrain may do on its own (draft, approve, auto), what it never does, and how to change it."
---
# Autonomy and safety

You decide how much Alterbrain does on its own. The starting point is the safest one: **it drafts, you send.**

## The three levels

| Level | What happens | Example |
|---|---|---|
| **Draft** (default) | Alterbrain writes the email, letter or post and puts it in your outbox (or as a Gmail draft). You send it. | A reply to your professor waits in Gmail drafts, with a task to review it. |
| **Approve** (needs an add-on) | Alterbrain prepares it and asks "send now?" every time. Nothing goes without your click. | It shows the final email and you press allow. |
| **Auto** (needs an add-on) | Alterbrain sends by itself, within limits you set (for example 5 a day, only to your school). | Confirming study-group times. |

You can set a level per channel: email, calendar, jobs, LinkedIn, social media, chat apps and web forms. Everything starts as **Draft**, and Draft is the only level that works without extra setup. **Approve** and **Auto** only work after you build the add-on for that channel (for email: say "build Gmail send with approval"). The add-on checks the exact text with you and, for Auto, adds limits and a log. Most people never need Auto.

**To change it:** say "let me approve emails before they're sent", or type `/reconfigure`.

## What Alterbrain never does

- Send, post, apply or submit beyond the level you chose. A safety check blocks it, even if something asks it to.
- Pay for anything or enter card details.
- Ask for your passwords or keys in chat. (Keys go in a file called `.env.local` that you edit yourself.)
- Invent facts about you. It only uses facts on your fact sheet (`vault/80_me/fact-sheet.md`). A missing fact shows as `[FACT NEEDED: …]`.
- Follow instructions hidden in emails, web pages or documents. It treats them as information, tells you about them, and asks.
- Change its own safety rules or the framework files.
- Change your original files. Imported files are kept untouched in `vault/40_sources/raw/`.

## Limits for risky tools

Some tools act inside an account that a platform can restrict if it sees too much activity. LinkedIn is the one Alterbrain knows today. For these, a second safety check (the **rate guard**) counts every action after it has run and stops it when you are over a limit. It says which limit, how much has been used and when it starts again.

For LinkedIn the standard limits per day are: 15 connection requests (and 60 a week, Monday to Thursday only, at least 30 seconds apart), 15 messages (60 a week, at least a minute apart), 40 profile views, 20 company page views, 8 searches, 5 employee lists and 30 inbox or feed reads. They are deliberately cautious, set for student accounts. You can lower them any time. Raising one above the standard needs "accept_risk": true, because it raises the chance of a restriction.

- **See what has been used:** say "show my usage limits", or run `node system/scripts/rate-guard.mjs status`.
- **Lower a limit:** edit `config/limits.json` (or ask me to). Lowering is always allowed. The file explains the format.
- **Raise a limit:** only if you add `"accept_risk": true` for that tool. Alterbrain then mentions this whenever the limit stops something. Nobody can promise your account stays safe at higher numbers.
- **If the platform pushes back** (a CAPTCHA, a security check, "unusual activity", "too many requests"): Alterbrain pauses that tool for 24 hours, halves its limits for 14 days and adds a task for you. A second warning switches the tool to draft-only, so it prepares things but never sends them. Only you can lift these: `node system/scripts/rate-guard.mjs reset-throttle linkedin` ends the pause and the halved limits, and `node system/scripts/rate-guard.mjs clear-draft-only linkedin` ends draft-only. Alterbrain asks you before running either.
- **If an action may or may not have gone through** (a timeout, or "outcome unknown"): Alterbrain never repeats the same action for 24 hours. Check on the platform yourself first. A task reminds you.
- **The record** of what was used lives in `state/local/rate-guard/` on your computer only. It can contain names of people, so it is never backed up or committed, and Alterbrain cannot edit it.
- **If it says it could not read its limits or its log**, it blocks the tool to be safe. Ask me to run the health check; `node system/scripts/rate-guard.mjs repair-ledger` fixes a damaged log.

## Coursework and AI rules

Each course note records the course's AI policy, copied from the syllabus:
- **Allowed with disclosure:** Alterbrain drafts a short note saying how you used AI, for you to include.
- **Restricted, banned or unknown:** it warns you once per assignment and asks whether to continue. Your answer is kept only on your computer, not in your backup.

You are responsible for following your school's rules. When in doubt, ask your lecturer.

## Building new skills safely

New skills are only built after you say yes to a written proposal. They can't touch the safety rules. See [Self-build](self-build.md).

## If something looks wrong

- Say "stop". Alterbrain stops at the next step.
- Say "turn off email sending" to put email back to draft at once.
- Type `/health-check` to check the setup.
