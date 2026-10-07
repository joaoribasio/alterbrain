# M0 Setup: checks, folders, backup and Obsidian

**Goal:** a healthy install. The vault and settings exist, the user's work is backed up to a private GitHub repository, and Obsidian is ready.
**Time:** about 8 minutes. **Essential.**
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
   - Problems: explain each in one plain line, using the fix advice doctor prints. Deal with blockers first (git, git-lfs, GitHub CLI). Optional items (Quarto, Obsidian) can wait.
   - If a blocker is missing, ask: "Shall I install <tool> now?" (Yes (recommended) / I'll do it myself). On yes, run the install command from doctor's advice (winget on Windows, brew on Mac), one package at a time. If it fails, explain it in one plain line and show the user the command or download page. Never retry in a loop. If the tool is still not found afterwards, ask the user to close and reopen the Claude app, then say `/onboard`.
   - Signing in and creating accounts stay the user's own clicks (step 3).
   - If the user can't fix one now: add a task `Fix setup: <problem> (see /health-check)` with `--tag onboard --priority high` and carry on.
2. **Folders and starter files.** Run `node system/scripts/onboard-seed.mjs`. It copies, only where missing:
   - the vault skeleton `system/templates/vault/**` → `vault/`;
   - default settings `system/templates/config/*.json` → `config/`;
   - identity templates `system/templates/identity/*` → `vault/80_me/`;
   - starter frameworks `system/packs/mba/frameworks/*.md` → `vault/30_wiki/frameworks/`.
   It never overwrites. If it reports a missing framework folder, add a task and suggest `/update-alterbrain`.
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
4. **Obsidian.** Explain: "Obsidian is a free app for reading and editing your notes. Alterbrain writes; Obsidian lets you browse."
   - Run `node system/scripts/obsidian-setup.mjs`. It prepares the settings and the two plugins (Tasks, Git).
   - Ask: "Is Obsidian installed?" Yes (recommended) / Not yet / I'll skip Obsidian.
     - **Not yet:** "Download it from obsidian.md and install it. No account is needed."
     - Then: "Open Obsidian → **Open folder as vault** → choose the `vault` folder inside your Alterbrain folder. If it asks about community plugins, choose **Turn on community plugins** so the task list works." Full guide: `system/docs/guides/using-obsidian.md`.
     - **Skip:** fine. Everything still works in plain files.
5. **Tools file.** If `.mcp.json` already exists (the install prompt creates it before your first restart), say nothing and go on. Otherwise run `node system/scripts/mcp-gen.mjs`, remember that it was created in this session, and tell the user once at the end of M4 (not now): "Close this session and open the folder again so the standard tools load. If Claude asks whether to trust them, choose **allow**."
6. **Re-check.** Run `node system/scripts/doctor.mjs` once more. Summarise in one line: what is ready, what is waiting (with its task).

## Files written

- `vault/**` and `config/*.json` (by `onboard-seed.mjs`, never overwriting).
- `vault/.obsidian/**` (by `obsidian-setup.mjs`).
- `.mcp.json` (by `mcp-gen.mjs`, unless the install prompt already made it).
- `system/release.json` may be updated by `setup-github.mjs` (that is the script's job, not yours).
- Tasks for anything postponed.

## Done criteria

- `onboard-seed.mjs` ran with no missing source folders.
- `config/brain.json`, `config/autonomy.json`, `config/mcp.selected.json` and `vault/80_me/USER.md` exist.
- doctor shows no blocking failure, or every remaining one has a task.
- GitHub backup works (`origin` set and pushed), **or** the user chose to skip and a task exists. Either way `origin` is not the public Alterbrain repo.
- `obsidian-setup.mjs` ran.

Then: `node system/scripts/onboard-progress.mjs done M0`.
