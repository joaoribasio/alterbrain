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
- Very large files (over 100 MB) stay on your computer only.

## If something goes wrong

You'll see a task tagged `#ab/git` with a plain explanation. Common cases:

- **No internet:** it tries again next session. Nothing to do.
- **Signed out of GitHub:** say "sign me in to GitHub again".
- **The same note changed on two computers:** say "fix the backup". Alterbrain keeps both versions and asks you which to keep where they differ.

You can always ask: "Is my work backed up?"

## Working on two computers

Fine. Close the session on one computer before opening on the other, so the latest version is uploaded first.

## Turning it off

Not recommended (you lose your backup). If you must: `/reconfigure` → automatic backup.

## For the curious

You can see your history on github.com, in your private repository. Looking is safe; just don't change things there.
