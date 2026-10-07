---
type: "guide"
title: "Encrypting your private notes"
summary: "Optional: scramble your most private notes and documents before they reach GitHub. What it protects and what it does not, the key file and its password, the recovery test, a new computer, Obsidian, and the limits."
---
# Encrypting your private notes

## What it does

- Your most private notes and documents (facts about you, writing samples, people, journal, and the PDFs, Word files and pictures you keep in those folders) are **scrambled before they reach GitHub**. GitHub, and anyone who gets into your GitHub account, sees unreadable files instead of your notes.
- On your laptop nothing changes. The notes stay normal files, so Claude and Obsidian read them as usual.
- It is **optional**. Onboarding offers it once, and `/reconfigure` turns it on later.

It protects you from a leak of your GitHub account or repository. It does not protect you from someone using your unlocked laptop, and Claude still reads these notes in every session (see [Privacy and your data](privacy-and-data.md)).

## Which notes are encrypted

| Encrypted | Not encrypted |
|---|---|
| `vault/80_me/`: `fact-sheet.md`, `USER.md`, `MEMORY.md`, everything under `voice/` and `private/` | `SOUL.md` and `IDENTITY.md` (the assistant's personality, read by every session) and `brand/` |
| `vault/60_people/`: all notes, documents and pictures | Everything else: wiki, sources, courses, projects, inbox, tasks, and any PDF or picture kept outside the folders on the left (it is saved as a normal file, or with Git LFS if it is 50 MB or more) |
| `vault/70_journal/`: all notes, documents and pictures | Audio, video and zip files, and private files of 50 MB or more (see the limits below) |

Two kinds of file are covered, in those folders only:

- **Notes:** files ending in `.md`, `.json`, `.txt`, `.csv`, `.yml`, `.yaml`, `.base` or `.canvas`.
- **Documents and pictures:** `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.heic`, `.rtf` and `.odt`. Only files of 50 MB or more now use Git LFS (the storage for very large files), so ordinary documents can be scrambled like notes. Turning encryption on scrambles the ones you already have at the next save.

The rules live in three small `.gitattributes` files inside those folders. `vault-key.mjs setup` writes them, and updates do not touch them. A scrambled PDF or picture cannot be previewed on the GitHub website; on your laptop it opens as usual.

## The key file and the password

The tool that does the scrambling is called **git-crypt**. It is free, and it is not part of Alterbrain: you install it once, and Alterbrain asks before it does.

- **git-crypt itself has no password.** It uses a **key file**: a small file that unlocks your notes, like a house key.
- **On this laptop** the key lives inside the hidden `.git` folder. Nothing needs typing, ever.
- **The backup copy** of the key file is the one you keep elsewhere. You can protect that copy with a password you choose. The password does not unlock anything on this laptop. It only makes the backup copy safe to keep in a cloud folder or an email.

The password is typed by you, in a terminal window, and never through Claude. If you use the Claude desktop app, open the **Terminal panel** next to the conversation. The script refuses to read a password from anywhere else.

## If you lose the key

> If you lose the key file (and its password, if you set one) and also lose this laptop, your encrypted notes on GitHub cannot be recovered. Not by GitHub, not by Anthropic, not by me. The rest of your brain is unaffected. Keep the key in two places: your password manager and one other (a USB stick or a cloud folder).

Two cases are different:

- **You forget only the password, and this laptop still works.** Recoverable. Export a new copy of the key file from the laptop.
- **You lose the laptop but still have the key file and its password.** Recoverable. See "A new computer" below.

## Turning it on

1. Say "encrypt my private notes" in Claude, or type `/reconfigure`. Onboarding offers it too.
2. Claude asks before it installs anything: on Windows `winget install --id AGWA.git-crypt -e`, on a Mac `brew install git-crypt`. On Windows the installer adds the tool to your computer's search path, but an app that was already open (such as the Claude app) does not see that until it restarts. You do not need to restart: Alterbrain looks in the folder where Windows puts the tool as well. If it still says the tool is missing, close and reopen the Claude app.
3. `node system/scripts/vault-key.mjs setup` turns it on, saves the settings files first, checks that every private note is stored scrambled, and installs the upload check described below.
4. `node system/scripts/vault-key.mjs export --out <a folder outside this project>` saves the key copy. Add `--password` to protect it (you type the password in your terminal). The script refuses a place inside the project, because the project is backed up to GitHub.
5. **Test the copy** (next section). Do this on the day you make it.

## Test your backup (the recovery drill)

A key copy you have never tested may not work on the day you need it.

`node system/scripts/vault-key.mjs check --key <your key file>` opens the copy, asks for the password if there is one, and compares it with the key on this laptop. It prints "Your key backup works" or says plainly what is wrong, and it notes the date of the last good test. Alterbrain reminds you in the session digest until you have done it once.

## A new computer

1. Install Alterbrain and sign in to GitHub. Your folder comes back from your private repository. The private notes arrive scrambled, and Alterbrain tells you they are locked.
2. Install git-crypt (the same one command as above).
3. Unlock with your key copy: `node system/scripts/vault-key.mjs unlock --key <your key file>`. If the copy has a password, type it in your terminal. The notes become readable on this computer, and Alterbrain saves them scrambled from then on. Unlocking also installs the upload check described below.

Until you unlock, Alterbrain does not save changes to private notes on that computer. It saves everything else, and if it had to leave private changes out it adds one task telling you how to unlock.

## What Alterbrain checks for you

- **Before every automatic save**, private notes are only saved if this computer can scramble them. If it cannot (locked, or git-crypt missing), they are left out and you get a task.
- **A private note that would be stored as plain text** is left out of the save.
- **Before every upload**, every commit that is about to go up is checked. If any private note in it is plain text, nothing is uploaded and a high-priority task says so. This check stops the upload if it cannot run (unlike most checks, which let work continue). Nothing is ever rewritten or forced.
- **The same check runs for Obsidian on a computer** (see the next section).
- `node system/scripts/vault-key.mjs status` and the health check (`/health-check`) report the state in plain words.

## Obsidian on a computer

The Git plugin in Obsidian saves and uploads your vault by itself, every 10 minutes, without going through Alterbrain's automatic save. On a computer that is locked or has lost git-crypt, it could upload a new private note as plain text.

Alterbrain closes that gap with a small upload check that Git itself runs before every upload, whichever program starts it:

- **Setup and unlock install it**, and every Claude session on a computer with encryption on quietly checks it is still there and puts it back if it is not.
- **If a private note or document would go up as plain text, the upload is refused.** Obsidian shows one line starting "Alterbrain stopped this upload", nothing is sent, and the task list gets one high-priority task. Unlock the computer (see "A new computer"), then ask Claude to run `/health-check` to deal with the note that was saved as plain text.
- **If the check cannot run** (for example Node.js, the program Alterbrain uses for its own checks, is missing), the upload is refused too, for the same reason: an upload cannot be taken back.
- **It only looks at what this computer would add online.** A private note that another device (a phone, say) already put online does not stop an upload when Obsidian Git pulls it in and joins it to your own notes. A note of your own that is stored as plain text still does.
- **It also runs Git LFS's upload step**, so very large files still upload as before. If you already used Git LFS, nothing changes for you. As with Git LFS's own check, if this folder keeps big files in Git LFS and Git LFS cannot be found when you upload (an app started without Git LFS on its search path, say), the upload is refused and nothing is sent, because the big files would reach GitHub as empty placeholders. Install Git LFS (the message gives the command) and upload again.
- **Large private documents are checked without loading them.** The check reads only the first few bytes of each stored file, so an upload of many big scans stays quick and uses little memory.
- **It never replaces another tool's check.** If something else already uses Git's upload hook in this folder (the file `.git/hooks/pre-push`), or Git is set to take its checks from a shared folder, Alterbrain leaves it alone and says so in `status`, the health check and the start of your next session. Until that is sorted out, keep Obsidian Git switched off on that computer.

This does **not** cover Obsidian on a phone or tablet. See the limits below.

## Limits you should know

- **File and folder names stay readable on GitHub**, and so do file sizes and when notes were saved. A note called `Jamie Example.md` reveals that name. Choose note names with that in mind.
- **Notes saved before you turned it on stay readable in the old versions on GitHub.** Encryption protects what you save from then on. The only clean fix is a fresh private repository. That decision is yours, and Alterbrain never rewrites your history or force-pushes to hide old notes.
- **Very large private files are kept off GitHub.** A file can use Git LFS or encryption, not both. Files of 50 MB or more use Git LFS, so a private file of that size (a long recording, a big scan) cannot be scrambled. Alterbrain leaves it out of the online backup and adds a task instead of uploading it as plain text. It stays on your computer. If you want it backed up, keep your own copy somewhere you trust, or move it out of the private folders knowing that it will then be stored unscrambled.
- **Only the folders above are covered.** A PDF or picture you keep outside them (in a course folder, say) is stored unscrambled, as a normal file (or with Git LFS if it is 50 MB or more). Audio and video files are not scrambled anywhere.
- **Claude cloud sessions and any always-on server cannot read encrypted notes** unless they hold the key. They see unreadable files in those folders. Alterbrain reads `USER.md` and `MEMORY.md` at the start of every session, so a session without the key starts without them.
- **Obsidian on a phone or tablet is not covered.** It cannot read the scrambled files, and its Git plugin on a phone does not scramble what it saves or run the upload check, because the check is a feature of Git on a computer. Do not use Obsidian Git on a phone with an encrypted vault. On a computer that is locked, the upload check refuses a plain private note, but do not rely on that: unlock before you edit private notes in Obsidian.
- **Two computers editing the same encrypted note at once** cannot be merged line by line, because the stored versions are scrambled. The automatic save stops without overwriting anything and leaves a task, and you choose which version to keep. Close the session on one computer before you open the other.
- **Claude still reads these notes in your sessions.** Encryption protects the copy on GitHub, not the conversation. The trade-off in [Privacy and your data](privacy-and-data.md) is unchanged.
- **The tool is third-party software.** If git-crypt stops being maintained or cannot be installed, your key file and `git-crypt unlock` are how you get your notes back. Keep a copy of the key file even if you never expect to need it.

## If something goes wrong

| You see | What it means | What to do |
|---|---|---|
| A task "Your private notes are locked on this computer" | This computer has no key | Run the unlock command in the task |
| A task "The encryption tool (git-crypt) is not installed" | The tool was removed or this is a new computer | Run the install command in the task |
| A task "stopped the online backup" | A private note was about to go up unscrambled. Nothing was uploaded | Run `node system/scripts/vault-key.mjs status`, then ask Claude to run `/health-check` |
| Obsidian Git shows "Alterbrain stopped this upload" | The same, caught at the moment Obsidian tried to upload | Unlock this computer if it is locked, then ask Claude to run `/health-check` |
| `status` says the upload check is not installed | The hook file was deleted, or Git LFS replaced it | Run `node system/scripts/vault-key.mjs setup` (safe to repeat), or just start a Claude session |
| `status` says another tool already has a check before uploads | Something else uses `.git/hooks/pre-push`, so Alterbrain did not touch it | Keep Obsidian Git switched off on this computer and ask Claude to run `/health-check` |
| The tool was just installed but Alterbrain says it is missing | The app was open during the install and has not seen it yet | Run the same command again; if it still fails, close and reopen the Claude app |
| "That password does not open this key file" | Wrong password, or the file changed | Try again. If you still fail, use another copy of the key file |
| The health check says the key backup was never tested | You have not run `check` yet | Run the recovery drill |

## Turning it off

There is no switch for this yet. If you need it, tell Claude what you want and why, and expect a short plan before anything changes.

## Commands

| Command | What it does |
|---|---|
| `node system/scripts/vault-key.mjs status` | Shows whether it is on, whether this computer is unlocked, whether every saved private note is scrambled, and whether the upload check for Obsidian is installed |
| `node system/scripts/vault-key.mjs setup` | Turns it on and installs the upload check (safe to run again) |
| `node system/scripts/vault-key.mjs export --out <file> [--password]` | Saves a copy of the key file outside the project |
| `node system/scripts/vault-key.mjs check --key <file>` | The recovery drill: proves the copy works |
| `node system/scripts/vault-key.mjs unlock --key <file>` | Unlocks a new computer (and installs the upload check there) |
