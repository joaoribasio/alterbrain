# Course material: a folder or a zip

Use this when the user gives a folder or a zip that holds the material for one course: slides, readings, cases, Excel models, the syllabus, assignment pages. The usual zip is "download everything" from the school or provider course site (an online provider often has none: then the files come one by one). The download steps are in `.claude/skills/course/references/course-setup.md` (section 1); if the user asks, give those steps again.

One loose file follows the normal steps in `SKILL.md`. If the user names its course, still pass `--course`.

There is no connection to the school's or provider's learning platform. The user downloads the files and you read them.

**Two procedures meet here.** `.claude/skills/course/references/course-setup.md` is the one procedure for a course: the request for all the material, the course note, the Material list and the gap check. When `/course` (or onboarding) started this import, the course is already known: skip step 1 below and step 6, and do steps 2 to 5; course setup does the rest. When the user starts here, follow this file, and use course setup for the course note (step 6) and the Material list (step 5).

## 1. Which course? (one question)

Infer first. Never ask what you can see.

- **Courses you know:** for each `vault/20_areas/courses/*/course.md`, read the first heading (the course title), `code`, the folder name, and the `programme` link or the `provider`.
- **Name evidence:** the folder or zip name, ignoring words like files, download, export, course and any dates or numbers. For a folder, also the names of the folders one level down. For a zip, its name is all you have before the copy, and `--course` has to be chosen before the copy. A name like `files.zip` says nothing: ask without a guess. Also note any provider or programme the names mention ("Coursera", "edX", a school).
- **A name is a candidate, not proof.** Two courses can share a short name ("Strategy" in the MBA and on Coursera). The folder or zip name matching a course title settles it only when exactly one course note carries that name and the names mention no provider or programme, or mention the same one as the note. Otherwise ask with each candidate's programme or provider shown (`course-setup.md` section 0, "Does the course exist?").
- **Ask once** (AskUserQuestion), recommended option first, each with a pro and a con:
  - One clear match: "**Strategy (MBA – RSM) (recommended)**: the name matches that course, so the notes link to it and deadlines go into it. If I am wrong, the links are wrong and the notes need redoing." Always show the programme or provider in brackets when the note has one.
  - Two notes share the name, or the names point to a different provider or programme than the matching note: list each candidate with its programme or provider (the likelier first, recommended), then "**Another course with this name**: I set it up as its own course, with the provider or programme in its title, so the two never mix. Costs one more question." On that option `--course` is the suffixed title that `course-setup.md` section 0 gives ("Strategy (Coursera)"), and step 6 runs course setup in mode `after-import`. A question has at most four options: with two candidates, leave out "A different course" below.
  - "**A different course**: you pick it from your list. Costs one more question."
  - "**Several courses or not sure**: I decide per file from what it says. Slower, and I may get some wrong."
  - No course note matches at all: "**Set up <name> as a new course (recommended)**: after the import I read the syllabus for the deadlines and the AI rules, write the course note and list every file in it. About two more minutes, and it needs the syllabus to be in the files." and "**Import without a course**: fastest, but nothing links to a course until you tell me." On the first, `--course` is the name the user confirms, and step 6 runs course setup in mode `after-import`.

The value for `--course` is the course title as written in the course note. Course titles are meant to be unique: when two courses share a name, course setup gives the later one a suffix ("Strategy (Coursera)"), and that is the value to pass. If two notes still carry the same title (an older vault), do not guess: ask which one, as above. For "several courses or not sure" and "without a course", leave `--course` out.

## 2. The AI-policy notice

Importing and summarising readings is not assignment work, so there is no notice yet. `system/core.md` rule 6 applies before assignment work. The moment the user asks you to start, draft or answer an assignment from this material, stop and hand over to `/assignment`, which reads `ai_policy` in the course note first: for `restricted`, `banned` or `unknown` it warns once per assignment and asks whether to continue; for `allowed-with-disclosure` it drafts a short disclosure paragraph; for `allowed` and `none-stated` it says nothing. Never write down the user's answer anywhere git tracks (use `state/local/` if it must be remembered).

If the course note says `ai_policy: "unknown"` and the files hold a syllabus, offer to read the policy from it (step 6).

## 3. Copy

`node system/scripts/ingest.mjs "<folder or zip>" --course "<Course title>" [--latest-only] --json`

- Leave `--origin` out for a zip: every file then keeps "<zip name>/<path inside>" as its origin. The zip itself is not stored, and the script deletes its temporary folder.
- Different courses go in different runs.
- A zip that was refused has a plain `reason` in `zips[]` (and an `error` record in `files[]`). Tell the user in your own words and what to do next: password protected means they unzip it with the password and give you the folder; too big or too many files means one course folder at a time; an unsafe path or a link means download it again from the school's website; two file names that Windows and macOS treat as the same file (for example `Notes.md` and `notes.md`), or "lists 12 files, but 11 came out", means one file would have overwritten another, so they unzip it themselves, rename the clashing files and give you the folder; unreadable means the download is damaged or incomplete. Never unpack a zip yourself with another tool, and never offer to switch a check off.
- A zip inside a zip is stored as an ordinary file and not opened (its `note` says so). Tell the user, and offer to carry on once they have unzipped it.
- Duplicates keep the course they were first saved with (the manifest is never edited). If a duplicate's `course` differs from the one chosen, say so in one line ("3 files were already in your vault under Marketing, so I left them there") and write no second note for them. A duplicate with no course (an earlier import without one) gets this course on its existing note: `course-setup.md` section 4 adds the line, and you say "7 were already in your vault, so I linked them to <course>". A duplicate that never got a note is written as a new note.
- Read the counts: new, duplicate, skipped, problems, `text_pending`, `local_only`. Report them in a line.
- **Files that say they must not be used with AI tools.** A new record with `ai_notice: true` (and the sentence in `ai_notice_text`) is flagged once, in one message for the whole run, listing each file and its sentence. Write no source note for those files until the user decides (`SKILL.md`, step 4), and save the answer with `ingest.mjs --ai-decide <id> held|use` (on this computer only). Raw copies are only copies, so they stay. A file the user holds is listed as "held, not read" and counted apart in the Material heading (`course-setup.md` section 4). `/ingest pending` works the flag out again from the files, so a later session still knows. **A syllabus, course guide or policy that states the course's own AI rule for students is not such a restriction** (`SKILL.md`, step 4): read it for the rule even if it is flagged, and do not hold it. Judge by what the sentence restricts: a rule about students' use of AI in assignments is the course's rule; a rule that the document itself may not be put into AI tools is a restriction.
- **Client or company material** (a case company's internal data, an employer's files): give the private-backup reminder once for the run (`SKILL.md`, step 4).
- **Rosters** (class or team lists): business facts only; no birthdays, personal contact details or photos.

## 4. How many, and how long

After the copy you know the number of new files. Say it, with an estimate labelled as one:

- **20 or fewer:** "I'll write the notes now. It takes a few minutes." Go on.
- **21 to 50:** "<N> new files. Writing the notes takes roughly 5 to 10 minutes [Inference: it depends on how long the files are]. Start now?" Now (recommended: the course is searchable straight away; costs a few minutes of waiting) / Later (nothing waits on you; the files are saved but not searchable by topic until the notes exist).
- **More than 50:** "<N> new files. I write about 50 notes per run, so this is <ceil(N/50)> runs of roughly 5 to 10 minutes each [Inference]. I start with the syllabus and assignment pages, then the rest. Do the first run now?" The same two options. For the rest, add one task and tick it when none are left (the way `/ingest pending` does):
  `node system/scripts/tasks.mjs add "Write notes for the rest of the <course> files. Say: /ingest pending (about 50 files each time)" --tag ingest --priority medium`

Order of work: syllabus and course guide first, then assignment pages, then slides and readings in folder order. Work in batches of at most 8 files, as in `SKILL.md` step 5, with one line after each batch ("16 of 50 done").

**Bulk rules.** Classification goes to `helper-triage`. Source notes go to `helper-draft`, each helper with its own disjoint set of files and the exact note paths it may write; helpers write source notes only. The main session writes the wiki pages, `index.md` and `log.md` and the course note's Material list, so no two writers share a target page. After each batch the main session reads one helper note against its extracted text before continuing. Parallel helpers stay within the `plan_tier` cap (3 on Pro, 8 on Max). `/ingest pending` reads `course` from the manifest, so a later run keeps the course.

## 5. Write the notes with the course known

Follow steps 5 and 6 of `SKILL.md`, with these differences:

- The source note carries `course: "[[20_areas/courses/<slug>/course|<Course title>]]"` (see `note-formats.md`).
- The classify step does not guess the course. It decides kind, title and the wiki pages to touch.
- At the end of each run (and before pausing), update the course note's `## Material` list as in `.claude/skills/course/references/course-setup.md` section 4: one line per new note, in its group (slides, readings, cases, data and models, and so on), with the "N of M files noted" heading while notes are still to write. Add only; never reword what the user wrote, and leave lines under `## Sources` as they are. If the course has no note yet, leave the `course` line out of the notes; section 4 adds it once the note exists. When the last note for the course is written, run the gap check as well (`course-setup.md` section 5): before that, a "missing" slide or model may only be a file that has no note yet.
- If a file's own text says it belongs to another course you know, set `course` to that course, and tell the user in one line.
- A spreadsheet or data file: describe its sheets or columns and main figures, as `note-formats.md` says. A Word, PowerPoint or Excel file whose text is `pending` cannot be read here: write the note from the file name only, say so (`Text status: pending`), and never summarise it. `course-setup.md` section 2, step 5 says what to tell the user.

## 6. Course note, deadlines and the AI rule

Follow `.claude/skills/course/references/course-setup.md`. Do not repeat its steps here.

- **The course has no note** (the user chose "Set up <name> as a new course"): run mode `after-import`: section 3 (read the syllabus, the AI-policy reading the user confirms, the course note, deadline tasks), then 4, 5 and 6. Write the course note before the remaining source notes, so they can link to it. No syllabus among the files: the note is written with what is known and the gap check says so.
- **The course has a note:** run mode `refresh`. If the new files include a syllabus, course guide, assignment sheet or an announcement with dates (judge by name and content), run section 3 in add-only mode for the course note, the deadline tasks and, if `ai_policy` is `unknown`, the AI-policy reading. Then section 4 (the Material list) and the one-line summary of section 6.
- **Import without a course:** nothing here. If the user later names the course, run `after-import` or `refresh` then.
- Offer `/assignment new` for an assignment sheet. That skill runs the AI-policy notice (step 2 above).

## 7. New material later in the term

Material keeps arriving all term. When the user mentions or hands over something new for a course (a class that took place, slides, their own notes, a case, a reading, a brief, feedback, a transcript), or the session digest says "New material?" for a course, the course is usually clear already: take it from their words or the digest line and skip step 1. Ask the step 1 question only if two courses fit. The flow is steps 3 to 6 with the course known (mode `refresh`). Notes the user already typed in the vault are linked into the Material list under "Your notes", not imported again. Ask once per course per session, never mid-draft, and only for what the course's Material list does not already hold. The detail (when to ask, what to check first, examples) is in `.claude/skills/course/references/course-setup.md` section 7.

## 8. Report

A few lines, for example: "Added 212 files from the zip to Strategy (14 were already there). Wrote 50 notes, 162 to go (task added). Found 4 deadlines (added) and the AI rule (allowed with disclosure)." For a new course, use the summary in `course-setup.md` section 6 instead. End with two next steps, such as "Ask me a question about it (`/ask`)" and "Turn the first week into study cards (`/study`)".
