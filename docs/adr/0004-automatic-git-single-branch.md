# 0004. Automatic git on one branch, no worktrees

Status: accepted

## Context
Users should never type a git command. Branches, worktrees and merges confuse non-technical people and cause lost work. The vault is the user's data, so it needs a backup and a history.

## Decision
- One `main` branch. No branches and no worktrees.
- Session start pulls with `git pull --rebase`. *Amended: it first saves local changes as a commit and never stashes (`--no-autostash`), because a stash that cannot be put back leaves conflict markers inside a note.*
- Session end commits (`auto: <date> · N files`) and pushes. A throttled Stop hook does the same.
- Obsidian Git makes interval backups for edits made in Obsidian. *Amended: Obsidian Git does not go through `git-auto`, so on a computer two small checks that Git itself runs cover it: a `pre-commit` hook for big files (ADR 0020) and a `pre-push` hook for private notes (ADR 0019). A phone is not covered.*
- Never force. Any failure is explained in plain English and becomes a `#ab/git` task.
- `block_dangerous_git` denies force-push, hard reset, deleting `.git`, branch creation and worktrees.
- In dev mode (`state/local/dev-mode`) auto-git is off, so the framework developer controls commits.

## Consequences
- History is noisy but safe.
- Two devices editing at once can conflict. We pull first, never force and ask the user for help in plain words.
- Keep the repo out of iCloud and similar sync tools (see the research summary).

## Alternatives considered
- **Branch per task or worktrees.** Powerful, but too complex for the audience.
- **No git, cloud sync only.** No history and no clean updates.
- **Manual git.** The user would have to learn it.
