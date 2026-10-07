---
type: "guide"
title: "Updating Alterbrain"
summary: "How to get a new version of Alterbrain without losing your notes or your own changes."
---
# Updating Alterbrain

New versions of Alterbrain bring fixes and new abilities. Updating never touches your notes.

## How to update

1. Type `/update-alterbrain` (or ask "is there a new version?").
2. Alterbrain checks the latest release and tells you, in plain words, what's new.
3. If you want it, say yes. It then:
   - saves a restore point first;
   - replaces the framework's own code files;
   - for framework text files **you changed** (for example a skill you edited), shows you the differences and asks before merging;
   - adds new files and suggests what to do with removed ones;
   - runs a health check (`/health-check`) at the end.
4. It saves and backs up automatically when done.

It takes a few minutes. Do it when you're not in the middle of an assignment.

## What is never touched

- Your vault (`vault/`): notes, sources, tasks, drafts.
- Your settings (`config/`) and progress (`state/`).
- Skills you built (`my-…`).

## If something goes wrong

- Alterbrain explains the problem in plain words and adds a task.
- The restore point means nothing is lost. Ask: "Undo the last update."
- Run `/health-check` and follow its one-line fixes.

## How often?

When Alterbrain mentions a new version at the start of a session, or about once a month. There's no need to update in the middle of exams.

## Claude itself

Alterbrain needs a recent version of the Claude app. If the start-of-session message says your Claude version is too old, update the app (the Claude app usually offers this itself, or download it again from claude.ai/download).
