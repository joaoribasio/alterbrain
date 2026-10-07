---
type: "guide"
title: "Troubleshooting"
summary: "Quick fixes for common problems: backup errors, missing Gmail or tools, Obsidian, usage limits and blocked actions."
---
# Troubleshooting

**First step for almost anything:** type `/health-check`. It checks your setup and gives a one-line fix for each problem.

## "Backup failed" task (`#ab/git`)

Alterbrain saves and uploads your work after each session. If that fails, it adds a task with the reason.
- **No internet:** nothing to do. It retries next time.
- **Signed out of GitHub:** say "sign me in to GitHub again". It shows you a code to paste on the GitHub page.
- **Changes on two computers at once:** say "fix the backup". Alterbrain combines them; it never throws work away.
See [Git is automatic](git-is-automatic.md).

## Gmail doesn't work

1. Check the connector: claude.ai → **Settings** → **Connectors** → **Gmail** should say connected.
2. Close this session and open the project again. New connections only appear in a new session.
3. Still missing? Disconnect and connect Gmail again, then restart.
4. Say "check Gmail" to test.

## A tool I added doesn't show up

- Close the session and open the project again.
- When Claude asks whether to trust the project's tools, choose **allow**.
- If the tool needs a key, check the line in `.env.local` (no spaces around `=`). The file must be called exactly `.env.local`. Windows can quietly add `.txt` (`.env.local.txt`): ask Claude to run `/health-check`, which tells you if it finds that, and ask it to open the file for you.
- Type `/health-check`: it checks the tools file.

## Obsidian shows code instead of my task lists

Turn on community plugins: Obsidian → **Settings** → **Community plugins** → **Turn on community plugins**. Then make sure **Tasks** is enabled. See [Using Obsidian](using-obsidian.md).

## "Usage limit reached"

Your Claude plan has limits that reset over time. Wait for the reset (the message says when), or consider the Max plan. To use less: ask for shorter outputs, run fewer critique lenses, and avoid scheduled jobs you don't need. See [Models and costs](models-and-costs.md).

## "Blocked" messages

Alterbrain has safety checks. A block is usually doing its job:
- **"Sending is set to draft"**: the draft is in your outbox or Gmail drafts. Send it yourself, or change the level with `/reconfigure`.
- **"Protected file"**: Alterbrain tried to change a framework file. That's not allowed; nothing is wrong. If you think the framework has a bug, try `/update-alterbrain`.
- **"Looks like a secret"**: something like a password or key was about to be saved. Put keys only in `.env.local`, typed by you.

## Setup got interrupted

Type `/onboard`. It remembers where you stopped. `/onboard status` shows what's done.

## Alterbrain made something up

Say so: "That's wrong: I never worked at X." It fixes the draft, and you can add the right fact to your fact sheet. Say "remember that" to keep the lesson.

## Still stuck

Type `/health-check` and copy its summary into a message to whoever set Alterbrain up for you, or open an issue on the Alterbrain GitHub page (never include personal details).
