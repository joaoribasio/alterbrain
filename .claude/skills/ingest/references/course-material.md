# Course material: a folder or a zip

Use this when the user gives a folder or a zip that holds the material for one course: slides, readings, cases, the syllabus, assignment pages. The usual zip is "download everything" from the school's course website. How the user gets one is explained in onboarding M3 ("Bring your course material"); if they ask, give those steps again.

One loose file follows the normal steps in `SKILL.md`. If the user names its course, still pass `--course`.

There is no connection to the school's learning platform. The user downloads the files and you read them.

## 1. Which course? (one question)

Infer first. Never ask what you can see.

- **Courses you know:** for each `vault/20_areas/courses/*/course.md`, read the first heading (the course title), `code` and the folder name.
- **Name evidence:** the folder or zip name, ignoring words like files, download, export, course and any dates or numbers. For a folder, also the names of the folders one level down. For a zip, its name is all you have before the copy, and `--course` has to be chosen before the copy. A name like `files.zip` says nothing: ask without a guess.
- **Ask once** (AskUserQuestion), recommended option first, each with a pro and a con:
  - A match: "**Strategy (recommended)**: the name matches your Strategy course, so the notes link to it and deadlines go into it. If I am wrong, the links are wrong and the notes need redoing."
  - "**A different course**: you pick it from your list. Costs one more question."
  - "**Several courses or not sure**: I decide per file from what it says. Slower, and I may get some wrong."
  - No course note matches at all: "**Set up <name> as a new course (recommended)**: if the syllabus is in the files I read the deadlines and the AI rules from it. Needs a syllabus, and about two more minutes." and "**Import without a course**: fastest, but nothing links to a course until you tell me."

The value for `--course` is the course title as written in the course note. For "several courses or not sure" and "without a course", leave `--course` out.

## 2. The AI-policy notice

Importing and summarising readings is not assignment work, so there is no notice yet. `system/core.md` rule 6 applies before assignment work. The moment the user asks you to start, draft or answer an assignment from this material, stop and hand over to `/assignment`, which reads `ai_policy` in the course note first: for `restricted`, `banned` or `unknown` it warns once per assignment and asks whether to continue; for `allowed-with-disclosure` it drafts a short disclosure paragraph. Never write down the user's answer anywhere git tracks (use `state/local/` if it must be remembered).

If the course note says `ai_policy: "unknown"` and the files hold a syllabus, offer to read the policy from it (step 6).

## 3. Copy

`node system/scripts/ingest.mjs "<folder or zip>" --course "<Course title>" [--latest-only] --json`

- Leave `--origin` out for a zip: every file then keeps "<zip name>/<path inside>" as its origin. The zip itself is not stored, and the script deletes its temporary folder.
- Different courses go in different runs.
- A zip that was refused has a plain `reason` in `zips[]` (and an `error` record in `files[]`). Tell the user in your own words and what to do next: password protected means they unzip it with the password and give you the folder; too big or too many files means one course folder at a time; an unsafe path or a link means download it again from the school's website; two file names that Windows and macOS treat as the same file (for example `Notes.md` and `notes.md`), or "lists 12 files, but 11 came out", means one file would have overwritten another, so they unzip it themselves, rename the clashing files and give you the folder; unreadable means the download is damaged or incomplete. Never unpack a zip yourself with another tool, and never offer to switch a check off.
- A zip inside a zip is stored as an ordinary file and not opened (its `note` says so). Tell the user, and offer to carry on once they have unzipped it.
- Duplicates keep the course they were first saved with. If a duplicate's `course` differs from the one chosen, say so in one line ("3 files were already in your vault under Marketing, so I left them there") and write no second note for them.
- Read the counts: new, duplicate, skipped, problems, `text_pending`, `local_only`. Report them in a line.

## 4. How many, and how long

After the copy you know the number of new files. Say it, with an estimate labelled as one:

- **20 or fewer:** "I'll write the notes now. It takes a few minutes." Go on.
- **21 to 50:** "<N> new files. Writing the notes takes roughly 5 to 10 minutes [Inference: it depends on how long the files are]. Start now?" Now (recommended: the course is searchable straight away; costs a few minutes of waiting) / Later (nothing waits on you; the files are saved but not searchable by topic until the notes exist).
- **More than 50:** "<N> new files. I write about 50 notes per run, so this is <ceil(N/50)> runs of roughly 5 to 10 minutes each [Inference]. I start with the syllabus and assignment pages, then the rest. Do the first run now?" The same two options. For the rest, add one task and tick it when none are left (the way `/ingest pending` does):
  `node system/scripts/tasks.mjs add "Write notes for the rest of the <course> files. Say: /ingest pending (about 50 files each time)" --tag ingest --priority medium`

Order of work: syllabus and course guide first, then assignment pages, then slides and readings in folder order. Work in batches of at most 8 files, as in `SKILL.md` step 5, with one line after each batch ("16 of 50 done"). `/ingest pending` reads `course` from the manifest, so a later run keeps the course.

## 5. Write the notes with the course known

Follow steps 5 and 6 of `SKILL.md`, with these differences:

- The source note carries `course: "[[20_areas/courses/<slug>/course|<Course title>]]"` (see `note-formats.md`).
- The classify step does not guess the course. It decides kind, title and the wiki pages to touch.
- After each batch, append one line per new note to the `## Sources` section of the course note: `- [[Source note title]]`. Add only; never reword what the user wrote there.
- If a file's own text says it belongs to another course you know, set `course` to that course, and tell the user in one line.

## 6. Syllabus and assignment pages: deadlines

If the new files include a syllabus, course guide, assignment sheet or an announcement with dates (judge by name and content):

1. Read them in full, not just a summary. Collect deadlines, exam dates, assignment titles, submission rules and any sentence on AI use.
2. Show what you found in a short table: item, date as written, your reading. Dates stay as written. "Week 6" and "TBC" stay without a date. A date that has already passed is marked "already passed" and gets no task.
3. Ask once: "Add these to the course note and your task list?" **Yes, all (recommended)**: nothing to remember by hand; you can delete any task later. / **Let me choose**: only what you tick, one extra question. / **No**: nothing is written.
4. On yes:
   - **Course note:** add to its Grading table and "Cases and assignments" section, and to "Submission rules" where the files state them. Add only; never overwrite what the user wrote. If there is no course note, create it from `system/templates/notes/course.md` following onboarding M3, "Per-course steps" 2 to 4 (the exact policy quote, your reading of it, the user's confirmation).
   - **Tasks:** check `vault/00_inbox/Tasks.md` first so nothing is added twice, then
     `node system/scripts/tasks.mjs add "<Course>: <assignment> due" --tag ingest --due YYYY-MM-DD --priority high --link "20_areas/courses/<slug>/course"`.
     For an unclear date: `node system/scripts/tasks.mjs add "Confirm the deadline for <assignment> (<course>)" --tag ingest --priority medium --link "20_areas/courses/<slug>/course"`. Never invent a date.
   - **AI policy:** if `ai_policy` is `unknown` and a sentence on AI use turns up, show the exact words and your reading ("I read that as *allowed with disclosure*. Agree?"). The user's answer wins. If it is unclear, it stays `unknown`.
5. Offer `/assignment new` for an assignment sheet. That skill runs the AI-policy notice (step 2 above).

## 7. Report

A few lines, for example: "Added 212 files from the zip to Strategy (14 were already there). Wrote 50 notes, 162 to go (task added). Found 4 deadlines (added) and the AI rule (allowed with disclosure)." End with two next steps, such as "Ask me a question about it (`/ask`)" and "Turn the first week into study cards (`/study`)".
