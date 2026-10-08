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
- **"Your private notes are locked" or "stopped the online backup" (only if you turned on encryption):** see [Encrypting your private notes](encrypting-private-notes.md).
- **"Half-finished save or join" (the health check, `git-in-progress`):** a join of your work with the online copy was started and never finished, so automatic saves refuse to run until it is cleared. Your files are safe. Say "fix the backup" and Alterbrain asks first, then undoes the half-finished join (`git rebase --abort` or `git merge --abort`, whichever the check names; never a reset, which would throw work away). Then it checks again and your next session saves as usual. If the undo fails, Alterbrain stops, adds a task and explains in one sentence.
- **"Big files were left out" or "A very big file was saved as an ordinary file":** see "Big files" below.

See [Git is automatic](git-is-automatic.md).

## Big files

Files of 50 MB or more are stored with Git LFS, a free add-on for very large files. Everything smaller is saved as a normal file. A task tagged `#ab/git` says what happened. Nothing is lost in any of these cases: the file is still on your computer.

- **"Git LFS … is not installed":** run the command in the task (on Windows `winget install --id GitHub.GitLFS -e`, on a Mac `brew install git-lfs`). The files are saved at the next save.
- **"A very large private file is kept only on this computer":** you turned on encryption, and a private file of 50 MB or more cannot be both scrambled and stored with Git LFS. Keep your own copy somewhere else, or move the file out of the private folders (it is then stored unscrambled).
- **A file of 2 GB or more:** too big to back up safely. Make a smaller version, or keep your own copy elsewhere.
- **A big file outside your `vault` folder:** move it into the vault.
- **"A very big file was saved as an ordinary file" (the backup is paused):** usually Obsidian Git on a phone, or on a computer without Alterbrain's check. GitHub refuses ordinary files of about 100 MB. Ask Claude to run `/health-check`; it explains the fix and asks before it changes anything.
- **Health check warns "Big-file check for Obsidian Git":** run `node system/scripts/git-auto.mjs hook`. If it says another tool already has a check before saves, Alterbrain leaves that tool alone: keep big files out of the vault, or switch Obsidian Git off, until you decide.
- **Health check warns about the size of your backup:** your saved history is getting large. Deleting a file does not shrink the history, because old versions stay in it. Put new big files you do not need backed up in `vault/40_sources/raw/_local/`, which stays on your computer only.
- **"A big upload is running in the background":** nothing to do. A big upload carries on after you close Claude and finishes by itself.

## Alterbrain cannot look at the pages of my PDF

Before it hands over a report or deck, Alterbrain looks at every page itself. For a PDF that needs a small free tool, the **PDF page renderer** (Poppler, about 30 MB). The health check and setup offer it once, never in the middle of your work. If you said no, or it is missing, Alterbrain tells you which pages it could not look at, and asks you to look at them.

- **To install it,** say "install the PDF page renderer". Alterbrain asks first. On Windows it runs `winget install --id oschwartz10612.Poppler -e`; on a Mac, `brew install poppler`. Then close and reopen Claude so the new tool is found, and run `/health-check` again.
- **A Word, PowerPoint or Excel file** is turned into a PDF copy through the program itself, if it is installed and closed. If it is open, or not installed, Alterbrain uses LibreOffice instead when you have it, and warns you that fonts and line breaks may look different from your real file. Close the file and try again for the exact look.
- [Unverified] The Mac route for PowerPoint and Word was written from the programs' documentation and has not been run on a Mac. If it fails, save the file as PDF yourself and give Alterbrain the PDF.

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
