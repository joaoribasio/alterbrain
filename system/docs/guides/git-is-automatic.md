---
type: "guide"
title: "Git is automatic"
summary: "How your work is saved and backed up without you ever typing a git command, and what to do if the backup fails."
---
# Git is automatic

**Git** is a tool that saves versions of your files. **GitHub** is a website that keeps a private online copy. Alterbrain uses both for you. You never need to type a git command.

## What happens by itself

| When | What Alterbrain does |
|---|---|
| You open a session | Downloads any changes from your online copy (for example from your other laptop) |
| You close a session | Saves a version of everything that changed, and uploads it |
| Every few minutes in Obsidian | The Obsidian Git plugin saves and uploads your edits too |

Each saved version is labelled like `auto: 2026-10-07 18:40 · 12 files`. Your history goes back to day one.

## Why it matters

- **Laptop lost or broken?** Install Alterbrain on a new computer, sign in to GitHub, and your whole vault comes back.
- **Deleted something by mistake?** Ask: "Bring back the note I deleted yesterday."
- **Want an older version?** Ask: "Show me how my CV note looked last week."

## Rules Alterbrain keeps

- One line of history (no branches, no copies). Simple and safe.
- It never overwrites your work to fix a problem.
- It never uploads secrets (keys in `.env.local`) or your private local folder (`state/local/`).
- If you turned on [encryption of your private notes](encrypting-private-notes.md), it never saves a private note that it cannot scramble, and never uploads one that is not scrambled.

## Documents and big files

- Everyday notes and documents (PDFs, slides, Word files, pictures) are saved as normal files, just like notes.
- Files of 50 MB or more, such as a long recording or a big dataset, are stored with **Git LFS**, a free add-on for very large files. Alterbrain switches it on and uses it by itself. If Git LFS is not installed on your computer, those files wait until it is, and a task tells you the one command to run.
- A few files stay on your computer only, and a task tells you which: a file of 2 GB or more, a very large private file (when you [encrypt your private notes](encrypting-private-notes.md)), and a big file kept outside your `vault` folder. Move that last kind into the vault and it is saved at the next save.
- A source you import that is over 100 MB is kept in `vault/40_sources/raw/_local/`, which is never uploaded. You can also put any file there on purpose to keep it off GitHub.
- Your saved history grows with every version of every document you keep. The health check prints a tip when it passes 1 GB and a warning at 4 GB.

## Big files and Obsidian

The Obsidian Git plugin saves and uploads on its own, without going through Alterbrain. On a computer, Git runs a small check from Alterbrain before every save, so a big file still goes to Git LFS first. A very big upload carries on in the background after you close Claude, so closing the session does not cut it short. Notes you write meanwhile are saved and go online when it finishes.

A phone's Git cannot run that check. If a phone saves a file of about 100 MB as an ordinary file, GitHub refuses it and the online backup pauses, with a task. Nothing is lost: everything is safe on your computer. Ask Claude to run `/health-check`; it explains the options and asks before it changes anything.

## If something goes wrong

You'll see a task tagged `#ab/git` with a plain explanation. Common cases:

- **No internet:** it tries again next session. Nothing to do.
- **Signed out of GitHub:** say "sign me in to GitHub again".
- **Big files were left out:** the task says why. Install Git LFS if that is the reason; move a big file from outside the vault into it. See [Troubleshooting](troubleshooting.md).
- **The same note changed on two computers:** say "fix the backup". Alterbrain keeps both versions and asks you which to keep where they differ.

You can always ask: "Is my work backed up?"

## Working on two computers

Fine. Close the session on one computer before opening on the other, so the latest version is uploaded first.

## Turning it off

Not recommended (you lose your backup). If you must: `/reconfigure` → automatic backup.

## For the curious

You can see your history on github.com, in your private repository. Looking is safe; just don't change things there.
