---
type: "blueprint"
title: "Use LinkedIn safely (read a little, draft everything)"
kind: "mcp"
status: "available"
risk: "high"
cost: "free"
---

# Use LinkedIn safely (read a little, draft everything)

## What it does

Alterbrain can look up a company, a job post or a public profile on LinkedIn, and write post and message **drafts** for you to send yourself. Example: you say "who leads the sustainability team at Example BV?" and it reads one page and saves the answer as a people note with the source and date.

## You'll need

- Your own LinkedIn account.
- `uv` installed (it runs the helper program).
- A short, careful mindset: this tool drives a real browser logged in as you.

## Cost and risk

- Cost: free.
- Risk: **high.** LinkedIn's rules forbid automated access. Your account could be restricted or banned, and that could hurt your job search.
  - Read only a few pages at a time, slowly, and never in bulk.
  - **Never** let it send connection requests, messages, comments or posts. The `linkedin` autonomy channel stays on `draft`.
  - A usage guard is built in (the rate guard, nothing to build). It counts every LinkedIn action after it ran and stops one that is over a limit. Standard limits per day: 15 connection requests (60 a week, Monday to Thursday only, 30 seconds apart), 15 messages (60 a week, a minute apart), 40 profile views, 20 company pages, 8 searches, 5 employee lists, 30 inbox or feed reads. They are deliberately cautious for student accounts; lower them further if you like (see below). Raising one needs "accept_risk". A CAPTCHA, security check or similar warning pauses LinkedIn for 24 hours and halves the limits for 14 days; a second one switches it to draft-only. An action whose result is unknown is never repeated for 24 hours.
  - Keep business facts only about people: role, employer, source and date. Nothing private.
- The helper is `mcp-server-linkedin` (stickerdaniel, Apache-2.0). Its login is a saved browser session on your computer. Treat that folder like a password.
- Safer substitute for many tasks: download your own data from LinkedIn's settings page and let Alterbrain ingest the files. No risk to the account.
- For your own data without scraping, see `linkedin-data-portability`.

## Questions I'll ask you

1. What do you need from LinkedIn? (Company research, jobs, people at a target employer, post drafts.)
2. Can that be done with a normal web page or your own data download instead?
3. Do you accept the ban risk for your main account?
4. How many lookups a week is realistic? (Suggested: fewer than 20.)
5. Which tone and language for post drafts?

## Build steps

1. **Verify first.** Open the project README at https://github.com/stickerdaniel/linkedin-mcp-server and confirm the install command, the pinned version in `system/catalogue/mcp.json`, and the login steps still match. Also re-read LinkedIn's current rules on automated access and say what you found.
2. Run `/clarify` (type `mcp`). Make sure the user has said yes to the ban risk in their own words in chat.
3. Add `linkedin` to `config/mcp.selected.json` and run `node system/scripts/mcp-gen.mjs`.
4. Guide the user through the one-time login (the helper opens a browser). They type their own password. You never see it. If LinkedIn shows a captcha, the user solves it. You must not. The catalogue entry carries `--no-auto-import`, so the helper does not copy a session from the user's everyday browser. On Windows, if the sign-in stops with a `PrivateStateError`, the user creates an empty folder in their user folder and sets the `INSTALLER_TEMP_DIR` environment variable to it, then signs in again.
5. Confirm `config/autonomy.json` has `linkedin` on `draft`. Do not change it.
   - Set the usage limits to match the answer to question 4. Edit `config/limits.json` (lowering is always allowed): for example profile views `daily_cap` 5, searches 3, company pages 5, and leave connection requests and messages low or at 0 while sending stays on draft. Do not raise any number above the standard and never add `accept_risk` unless the user asks for it in their own words. Run `node system/scripts/rate-guard.mjs status` and show the user the result.
6. Create the working rules in a note in `vault/20_areas/career/`:
   - one lookup at a time, no loops;
   - every fact saved with source URL and date;
   - post and message drafts go to `vault/00_inbox/outbox/` with `channel: "linkedin"`;
   - a `#ab/linkedin` task is created for each draft.
7. Record the build in `state/built.json`.

## How to test

1. Ask for one public company page. Expect a short summary with a source line.
2. Ask it to "send a connection request". Expect the outbound guard to refuse and offer a draft instead.
3. Check the outbox draft opens in Obsidian.
4. Run `node system/scripts/rate-guard.mjs status`. Expect LinkedIn listed with one profile or company view used today and no warnings.

## How to undo

Remove `linkedin` from `config/mcp.selected.json`, run `mcp-gen.mjs`, delete the saved browser session folder the helper created (it tells you where on first run), and sign out of any LinkedIn sessions you do not recognise.
