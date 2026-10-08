---
type: "guide"
title: "Updating Alterbrain"
summary: "How to get a new version of Alterbrain without losing your notes or your own changes."
---
# Updating Alterbrain

New versions of Alterbrain bring fixes and new abilities. Updating keeps what you wrote. Your notes and settings change only when a new version needs a small upgrade to how they are stored, and you see each upgrade before you agree.

## How to update

1. Type `/update-alterbrain` (or ask "is there a new version?").
2. Alterbrain checks the latest release and tells you, in plain words, what's new.
3. If you want it, say yes. It then:
   - shows you what will change, including any upgrades to your notes and settings, before it changes anything;
   - saves a restore point first;
   - replaces the framework's own code files;
   - for framework text files **you changed** (for example a skill you edited), shows you the differences and asks before merging;
   - adds new files, and puts files the release removed aside in the `state/archive/` folder instead of deleting them;
   - makes the upgrades to your notes and settings at the end, one by one, and tells you what each one did;
   - runs a health check (`/health-check`) at the end.
4. It saves and backs up automatically when done.

It takes a few minutes. Do it when you're not in the middle of an assignment, and close Obsidian while it runs: a note that is open in another program can stop an upgrade from saving it.

## What changes in your notes and settings

Most updates change none of your notes. When one does, it is a small upgrade to the way something is stored, for example a new line in a note's header or a new setting. An upgrade:

- is listed first, under "Upgrades to your notes and settings", before you say yes. One that only applies to some people starts with "If", for example "If you started on Alterbrain 0.1, ...", and finds nothing to change for everyone else;
- runs only after the restore point is saved (if Git cannot save one, the update stops before it changes anything), and only once;
- never changes your own words and never leaves a half-written file;
- is reported afterwards in one or two plain sentences, for example "Linked 2 courses to your programme note".

A copy of Alterbrain that is new is already in the latest shape. It is not told about upgrades it does not need, and they are never run on it.

## Upgrades that ask you first

Some upgrades need judgement about your own notes, so Alterbrain does not do them alone. An example: turning the school you named in your settings into a programme note and linking your courses to it. These are the upgrades listed as "asks you first".

- The update lists them before you agree, under "Upgrades I will ask you about after the update", and runs none of them.
- Afterwards you get a task: "Alterbrain has 2 upgrade questions for you." Say "run the pending upgrades" when you are ready (or Alterbrain starts right after the update if you like).
- For each one, Claude looks at your notes first and tells you what it found. If nothing applies to you, it says so and moves on. Otherwise it proposes what it would do and you choose: **do it now**, **not now** (it asks again next time) or **skip it** (it does not ask again by itself).
- A restore point is saved before the first change, and only what you approved is changed.
- A skipped one is never lost. Say "run a skipped upgrade again" whenever you want it back.

## What is never changed

- Your own `my-…` skills and helpers. If one points to a file that has moved, you get a task. Say "fix the moved paths in my skills" when you want it done.
- Passwords and keys in `.env.local`.
- The files you changed yourself, unless you approve a merge.

## If an upgrade stops

An upgrade stops when it cannot save a file or cannot read a setting. The most common cause is a note that is open in another program.

- Alterbrain tells you which upgrade stopped and why, in one sentence, and adds a task.
- Nothing is lost. The restore point is there, and an upgrade saves whole files or none.
- Fix the cause (for example close Obsidian), then say "finish the update". It carries on where it stopped and does not repeat upgrades that already ran.
- If it still stops, run `/health-check`. It checks your settings file and explains what it finds.
- To go back to how things were before the update, say "Undo the last update".

## If Alterbrain says it has no restore point

Alterbrain makes a restore point with Git before it changes your notes or settings. If Git is missing or not working on this computer, it says "I have no restore point" and changes nothing in your notes.

- Run `/health-check`; it tests Git and tells you the one thing to fix.
- Then say "finish the update". Alterbrain makes the restore point and carries on.

## If something else goes wrong

- Alterbrain explains the problem in plain words and adds a task.
- The restore point means nothing is lost. Ask: "Undo the last update."
- Run `/health-check` and follow its one-line fixes.

## The weekly notice

About once a week, at the start of a session, Alterbrain quietly looks whether a newer version exists. If one does, the start-of-session summary gets one line: "Alterbrain vX is available. Say 'update Alterbrain' when you're not mid-assignment."

- It only tells you. It never installs anything by itself, and updating is still your choice, any time, with `/update-alterbrain`.
- It asks GitHub only for the newest public version number. Nothing about you or your notes is sent.
- If you are offline or something goes wrong, it says nothing and tries again next session.
- To turn it off, ask Claude: "stop the weekly update notice".

## How often?

When the weekly notice appears, or about once a month. There's no need to update in the middle of exams.

## Claude itself

Alterbrain needs a recent version of the Claude app. If the start-of-session message says your Claude version is too old, update the app (the Claude app usually offers this itself, or download it again from claude.ai/download).
