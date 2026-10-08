# /assignment feedback: record a grade and what it teaches

Goal: the grade and the feedback saved word for word, the course note's "How this instructor grades" sharpened with cited points, and a lesson offered for `/learn`. The user drops the material in; nothing is sent anywhere.

Runs in the main session.

## 1. Check the starting point

- The assignment is `shipped`, or the user says it has come back. If `status` is earlier, ask once whether it is the right assignment; do not change `status`.
- `feedback.md` already exists: this is an addition. Show it, and ask whether to append a second block or replace nothing. Never overwrite what is saved.
- Which assignment: as in `SKILL.md`, before-you-start step 2 (the name the user gave, else the `shipped` assignments with an empty `grade`, most recent first).

## 2. Take it in

1. Ask once, in plain words: "Paste the grade and the feedback exactly as you got them, or give me the file." Accept pasted text, a file path (run `node system/scripts/ingest.mjs "<path>" --course "<course title>" --origin "Feedback: <assignment title>" --json` so the original is kept, then read its text), or a photo or PDF the Read tool can open.
2. Do not tidy, shorten, translate or correct it. Keep names of assessors as written; leave out nothing the user gave.
3. Ask for the grade in the course's own scale ("Is the grade 7.5 out of 10?") only if it is not plain in the text. Never work out or guess a grade.
4. Sensitive or personal details about the user or others in the text stay in the note as given (it is the user's own coursework), and are not copied anywhere else.

## 3. Write `feedback.md`

In the assignment folder, from `system/templates/notes/feedback.md`:

- replace `{{title}}` with the assignment title and `{{date}}` with today (from `node system/scripts/date.mjs`);
- front matter: `created` today, `assignment` link `"[[10_projects/<folder>/assignment]]"`, `received` (the date the user says it arrived, else today), `grade` as given;
- `## Feedback (as given)`: the text word for word;
- `## What it tells us`: three to six points, each a plain sentence that cites the sentence it rests on. What earned marks, what lost them, what the assessor weights. Where the feedback is thin, say so in one line instead of guessing. These are our reading, and they stay in the vault.

Then in `assignment.md`: set `grade: "<as given>"` and `feedback: "[[10_projects/<folder>/feedback]]"` (always the full path: every assignment folder holds a file called `feedback.md`, so a link by file name alone could open another assignment's) (add the keys if the note was made before they existed), and add a log line, for example `- 2026-11-02: graded 7.5/10, feedback saved.`

## 4. Update the course note

Only when the assignment has a course.

1. Open the course note's `## How this instructor grades` section (the heading stays exactly as it is). Add the new points as bullets, each ending with `[Source: [[10_projects/<folder>/feedback]] | <today> | confidence: medium]` (full path, for the same reason). Add to it; never reword or delete what is there. If a new point contradicts an old one, show both and ask which to keep.
2. If the feedback names a rule that belongs elsewhere (a page-limit penalty, a file-name rule), show it and ask before adding it to "Submission rules".
3. If `ai-log.md` exists, nothing to do; this step never writes to it (the log records working sessions, and a returned grade is not one).

## 5. Offer the lesson

Offer `/learn` in the same turn, once: "Shall I save the main lesson from this feedback to your memory, so the next draft starts from it?" Propose the one or two lines you would save (a standing preference or an assessor habit, such as "Prof. X rewards a number in the first sentence"). The user decides; `/learn` writes `vault/80_me/MEMORY.md`.

## 6. Close

Tell the user in three lines: what is saved and where, which points went into the course note, and the next step. If other assignments in the course are open, offer to start the next with what this one taught.

Add `node system/scripts/tasks.mjs done "<the 'Record the grade' task>"` only if such a task exists.

## Never

- Change, summarise instead of keeping, or invent any part of the feedback or the grade.
- Record anything about the coursework notice (core rule 6) or the user's consent.
- Put a grade or a name from the feedback into a file that leaves the computer.
