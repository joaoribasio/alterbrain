# M0 Setup: checks, folders, backup and Obsidian

**Goal:** a healthy install. The vault and settings exist, the user's work is backed up to a private GitHub repository, and Obsidian is ready.
**Time:** about 8 minutes, plus about 5 if you choose to encrypt your private notes. **Essential.**
**Model / effort:** sonnet / medium for the conversation; every step below is a script.

Say at the start: "Step 1 of 5: I'll check your computer and set up your folders. Mostly I do the work; I'll need you for one sign-in."

## Inference sources (read before asking)

- Output of `node system/scripts/doctor.mjs --json`.
- `gh auth status` (is the user already signed in to GitHub?).
- `git remote -v` (is there already an `origin`?). Read-only; never change remotes by hand. The one exception is the script in step 3, which disconnects the public Alterbrain repo.
- `config/` and `vault/` (already seeded?).

## Steps

1. **Health check.** Run `node system/scripts/doctor.mjs`.
   - All green: say "Your computer is ready." and move on.
   - Problems: explain each in one plain line, using the fix advice doctor prints. Deal with blockers first (git, GitHub CLI). Git LFS (`git-lfs`) stores only files of 50 MB or more, so everyday documents do not need it and its warning is low urgency, but `setup-github.mjs` in step 3 still requires it: install it before then (Git for Windows usually includes it). Optional items (Quarto, Obsidian) can wait.
   - If a blocker is missing, ask: "Shall I install <tool> now?" (Yes (recommended) / I'll do it myself). On yes, run the install command from doctor's advice (winget on Windows, brew on Mac), one package at a time. If it fails, explain it in one plain line and show the user the command or download page. Never retry in a loop. If the tool is still not found afterwards, ask the user to close and reopen the Claude app, then say `/onboard`.
   - Signing in and creating accounts stay the user's own clicks (step 3).
   - If the user can't fix one now: add a task `Fix setup: <problem> (see /health-check)` with `--tag onboard --priority high` and carry on.
2. **Folders and starter files.** Run `node system/scripts/onboard-seed.mjs`. It copies, only where missing:
   - the vault skeleton `system/templates/vault/**` → `vault/`;
   - default settings `system/templates/config/*.json` → `config/`;
   - identity templates `system/templates/identity/*` → `vault/80_me/`.
   The default settings list only the `core` pack, so nothing else is copied now. The frameworks of a pack the user switches on (the MBA pack, after the learner question in M2 or a later switch in `/reconfigure`) arrive when `onboard-seed.mjs` runs again then.
   It never overwrites. If it reports a missing folder ("Missing starter folder" or "Missing pack folder"), add a task `Restore a missing Alterbrain folder. Say /update-alterbrain` (`--tag onboard --priority high`) and carry on.
3. **GitHub backup.** First, whatever the user chooses below, make sure the folder cannot talk to the public Alterbrain repo. Run `node system/scripts/setup-github.mjs --detach-only`. It needs no sign-in and no question. If the folder still pointed at the public repo, it remembers that address in `state/release-origin.json` and disconnects it; say one line: "I disconnected this folder from the public Alterbrain page, so your notes only ever go to your own backup. Updates still work through /update-alterbrain." If it reports nothing to disconnect, say nothing. If it fails, explain the message in one plain line and add a `#ab/onboard` task (high priority).
   Then explain in one line: "GitHub keeps a private copy of your Alterbrain online, so nothing is lost if your laptop breaks. Only you can see it."
   - If `git remote -v` already shows an `origin` that is *not* the public Alterbrain repository, backup is set up. Skip to step 4.
   - Ask (AskUserQuestion): "Do you have a GitHub account?" Options: Yes (recommended) / No, show me how / Skip backup for now.
     - **No:** tell them to open github.com, click **Sign up**, and follow the steps (free plan is fine). Wait for "done". Never create the account for them.
     - **Skip:** add task `Set up your private GitHub backup (~5 min). Say /onboard setup` (`--tag onboard --priority high`). Go to step 4.
   - **Sign in** (only if `gh auth status` says not logged in):
     1. Run in the background: `gh auth login --web --hostname github.com --git-protocol https`.
     2. Read its output. Show the user the one-time code and say: "A GitHub page will open (or go to github.com/login/device). Paste this code, click **Continue**, then **Authorize**. Tell me when it says you're done."
     3. When they confirm, run `gh auth status`. Then `gh auth setup-git`.
   - Ask the repository name: "I'll call your private backup `alterbrain`. OK?" (Use alterbrain (recommended) / Choose another name).
   - Run `node system/scripts/setup-github.mjs --name <name>`. It creates the private repository, connects it and pushes. If it fails, explain the message in plain words and add a `#ab/onboard` task.
   - Say: "From now on I save and back up your work automatically. You never need to touch git." (Guide: `system/docs/guides/git-is-automatic.md`.)
4. **Encrypt your private notes (optional).** Offer this now: the private GitHub repository exists and no personal data has been written yet. Skip the step silently if there is no `origin` (the user skipped the backup in step 3), and re-offer it from `/reconfigure` later. Guide for the user: `system/docs/guides/encrypting-private-notes.md`.
   This is an optional extra. The default is **No**: never push it, never add a task for it, and do not bring it up again.
   1. **Offer it in one line, no jargon:** "Optional: I can scramble your most private notes (facts about you, writing samples, people, journal, and PDFs or pictures kept with them) before they reach GitHub, so someone who got into your GitHub account would find unreadable files. On this laptop nothing changes."
   2. **Ask (AskUserQuestion):** "Encrypt your private notes on GitHub?"
      - **No (recommended).** Pro: nothing extra to look after. Con: your private notes sit readable in your private GitHub backup. You can turn it on later in `/reconfigure`.
      - **Yes, encrypt them.** Pro: a leak of your GitHub account no longer exposes your facts, people and journal. Con: you must keep a key file safe, and a new computer needs it.
      On "No": add no task, skip the rest of this encryption step and go on to the Obsidian step.
   3. **On "Yes", say the key-loss warning in these words before doing anything** (do not shorten it), and confirm they still want it: "If you lose the key file (and its password, if you set one) and also lose this laptop, your encrypted notes on GitHub cannot be recovered. Not by GitHub, not by Anthropic, not by me. The rest of your brain is unaffected. Keep the key in two places: your password manager and one other (a USB stick or a cloud folder)." Explain **key file** once: "a small file that unlocks your notes, like a house key". Also say: "It does not hide file names, and notes saved before you turn it on stay readable in old versions on GitHub."
   4. **If yes, install the tool (ask first).** Run `node system/scripts/vault-key.mjs status --json`; if `git_crypt_installed` is false, say what and where from, then ask (Yes, install it (recommended) / I'll do it myself / Not now): "I need a small free tool called git-crypt. On Windows I would run `winget install --id AGWA.git-crypt -e` (the git-crypt package in Windows' own app installer); on a Mac, `brew install git-crypt` (Homebrew)." On yes, run exactly that one command, once. Then run `node system/scripts/vault-key.mjs status --json` again, without restarting anything: the installer adds the tool to the computer's search path, which an app that was already open (this one) does not see until it restarts, but the script also looks in the folder where Windows puts the tool, so it normally finds it at once. Only if `git_crypt_installed` is still false (or the install command itself failed), explain in one plain line and ask the user to close and reopen the Claude app, then say `/onboard setup`. Never retry in a loop, never download anything another way.
   5. **Turn it on.** Run `node system/scripts/vault-key.mjs setup`. It sets up the key on this computer, saves the settings files, prepares existing notes, installs a safety check that also stops Obsidian Git from uploading a private note without encryption, and checks the result. If it exits with 1, explain its message in plain words and add a `#ab/onboard` task (high priority). Do not continue to the key copy. If it exits 0 but prints a `Warning:` line saying another tool already has a check that runs before every upload, say so in one plain line, leave that other tool alone, and add a `#ab/onboard` task (medium priority): "Another tool already uses Git's check before uploads, so Alterbrain's safety check for Obsidian Git is not installed. Keep Obsidian Git switched off, or ask Claude to run /health-check."
   6. **Ask (AskUserQuestion):** "Protect the key file with a password?" Say first, in plain words: "The encryption tool itself has no password. It uses the key file. This password would protect only the backup copy of the key file, so that copy can sit in a cloud folder or an email safely. On this laptop the key lives in the hidden .git folder and nothing needs typing."
      - **Yes, a password I choose (recommended if the copy will sit in a cloud folder or email).** Pro: the copy stays safe even if the folder or email is read by someone else. Con: one more secret to keep, and you type it in a terminal, never in this chat.
      - **No, I'll keep it in my password manager.** Pro: nothing extra to remember. Con: whoever gets the file can unlock your notes, so it must live only in your password manager or on a USB stick.
   7. **Make the key copy.** Pick the place: `Documents/Alterbrain/vault-key-<folder name>.key` (`.abkey` with a password), outside the project; the script refuses a place inside it.
      - **No password:** run `node system/scripts/vault-key.mjs export --out "<path>"` yourself.
      - **Password:** you must never see it. In the Claude desktop app, open the user's **Terminal panel** and start `node system/scripts/vault-key.mjs export --out "<path>" --password` there. In a plain terminal, ask the user to run that command in a separate terminal window. Tell them: "Type your password when it asks, twice. You will not see it as you type. Tell me when it says Saved." Never ask for the password in chat. If the user types one into the chat anyway, do not use it: say it was shown here, so it is not a good password any more, and ask them to choose a new one in the terminal. The script refuses to take a password from a pipe, so running it through your own shell does not work.
      - The script repeats the key-loss warning when it finishes. Say, in one line, where the file is and: "Put a copy in your password manager and one more place (a USB stick or a cloud folder). Forgetting only the password is recoverable while this laptop works: I can make a new copy."
   8. **Test it (the recovery drill).** Run `node system/scripts/vault-key.mjs check --key "<path>"` the same way (for a password-protected copy the user runs it in the terminal and types the password there). On success the script prints "Your key backup works" and notes the date in `config/brain.json`. If the user skips the test, add a task: `node system/scripts/tasks.mjs add "Test your vault key backup (2 minutes): node system/scripts/vault-key.mjs check --key <your key file>" --tag onboard --priority high`.
   9. **Close with one line:** "Your private notes are now encrypted when they are saved to GitHub, and a safety check stops Obsidian from uploading one unscrambled. If this laptop ever says they are locked, the key file unlocks them."
   - Never open, read, print or copy a key file yourself, and never write one into the project. Hooks stop it, and so should you.
5. **Obsidian.** Explain: "Obsidian is a free app for reading and editing your notes. Alterbrain writes; Obsidian lets you browse."
   - Run `node system/scripts/obsidian-setup.mjs`. It prepares the settings and the two plugins (Tasks, Git).
   - Ask: "Is Obsidian installed?" Yes (recommended) / Not yet / I'll skip Obsidian.
     - **Not yet:** "Download it from obsidian.md and install it. No account is needed."
     - Then: "Open Obsidian → **Open folder as vault** → choose the `vault` folder inside your Alterbrain folder. If it asks about community plugins, choose **Turn on community plugins** so the task list works." Full guide: `system/docs/guides/using-obsidian.md`.
     - **Skip:** fine. Everything still works in plain files.
     - The setup also makes Word, PowerPoint and Excel files visible in the file list ("Detect all file extensions"). If Obsidian is already open on this vault, tell the user to close the vault and open it once more.
6. **PDF page renderer (optional, once).** Run `node system/scripts/doctor.mjs --json` and read the `pdf-pages` line. If it shows a tip (the renderer is missing) and the user has not declined it, offer it in one question (AskUserQuestion): **Install it (recommended)**: lets me look at every page of the reports and decks I make before you hand them in; a small download (Poppler, about 30 MB). / **Not now**: I still make PDFs, but I cannot check the layout by eye; you can add it later in `/health-check`. On yes, ask for the go-ahead and run the command from `.claude/skills/health-check/references/fixes.md` (Windows `winget install --id oschwartz10612.Poppler -e`, macOS `brew install poppler`), once, never in a loop. Then say it takes effect after you close and reopen Claude. On no, add no task and do not ask again.
7. **Tools file.** If `.mcp.json` already exists (the install prompt creates it before your first restart), say nothing and go on. Otherwise run `node system/scripts/mcp-gen.mjs`, remember that it was created in this session, and tell the user once at the end of M4 (not now): "Close this session and open the folder again so the standard tools load. If Claude asks whether to trust them, choose **allow**."
8. **Re-check.** Run `node system/scripts/doctor.mjs` once more. Summarise in one line: what is ready, what is waiting (with its task).

## Files written

- `vault/**` and `config/*.json` (by `onboard-seed.mjs`, never overwriting).
- If the user chose encryption (step 4): `vault/80_me/.gitattributes`, `vault/60_people/.gitattributes`, `vault/70_journal/.gitattributes` and `config/brain.json` (`privacy.encryption`), all by `vault-key.mjs setup`; the key itself stays inside `.git/`; the key copy is saved outside the project by `vault-key.mjs export`.
- `vault/.obsidian/**` (by `obsidian-setup.mjs`).
- `.mcp.json` (by `mcp-gen.mjs`, unless the install prompt already made it).
- `system/release.json` may be updated by `setup-github.mjs` (that is the script's job, not yours).
- Tasks for anything postponed.

## Done criteria

- `onboard-seed.mjs` ran with no missing folders.
- `config/brain.json`, `config/autonomy.json`, `config/mcp.selected.json` and `vault/80_me/USER.md` exist.
- doctor shows no blocking failure, or every remaining one has a task.
- GitHub backup works (`origin` set and pushed), **or** the user chose to skip and a task exists. Either way `origin` is not the public Alterbrain repo.
- Encryption of private notes: the user said "No" (the default; nothing to do), **or** `vault-key.mjs status` shows it on with the key copy tested (`key_backup_checked` set), **or** a task exists for the missing install, the key copy or the test.
- `obsidian-setup.mjs` ran.

Then: `node system/scripts/onboard-progress.mjs done M0`.
