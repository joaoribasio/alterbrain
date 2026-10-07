# M3 Programme and courses

**Goal:** Alterbrain knows the school, the programme, this term's courses, each course's AI policy and the known deadlines, and the user knows how to bring in their course material.
**Time:** about 6 minutes (2 minutes per syllabus), plus the download if the user does it now. **Essential.**
**Model / effort:** sonnet / medium. Reading a syllabus: sonnet / medium. With more than 4 syllabi, you may hand each to a haiku / low subagent that returns only the fields below; check every AI-policy quote yourself.

Say at the start: "Step 4 of 5: your programme and courses. If you have the syllabi as files, this is quick."

## Inference sources

- `USER.md` (programme already mentioned in M2), the CV source note.
- `config/brain.json` `school` block.
- Existing `vault/20_areas/courses/*/course.md` (never duplicate a course).
- Syllabus files the user points to.

## Questions (one at a time)

1. **School and programme.** Confirm what you already know ("You're on the full-time MBA at <school>. Right?"). Otherwise free text.
2. **Current term.** Free text, as the school names it (for example "Term 1, 2026–27" or "Block 2").
3. **Courses this term.** "List the courses you are taking now. Names are enough." Free text.
4. **For each course, one at a time:** "Do you have the syllabus (course guide) for <course>? You can give me the file, paste the text, or skip." AskUserQuestion: Here's the file (recommended) / I'll paste it / Skip for now. If they hand over a zip or a folder of everything instead, that is fine: open it as in "Bring your course material" below and take the syllabus from it.
5. **Bring your course material.** Once, after the last course. See "Bring your course material" below.

## Per-course steps

1. **Keep the raw copy** (file only): `node system/scripts/ingest.mjs "<path>" --kind pdf --origin "Syllabus: <course name>" --course "<course name>"` (use `--kind doc` for Word files). Pasted text: save it first to `state/local/tmp/onboard/<course-slug>-syllabus.md`, then ingest that file.
2. **Read the syllabus** and pull out:
   - course code, full title, term, lecturer names (names and roles only);
   - grading components and weights;
   - session list (dates if given);
   - assignments and exams, with deadlines exactly as written;
   - **submission rules**: page or word limits (say whether the cover and references count), font and spacing, the file-name rule for the LMS, the late penalty, extra files. Copy them as written; leave a rule out if the syllabus does not state it;
   - **the AI policy sentence(s)**, copied word for word.
3. **Classify the AI policy** from the quote only:
   - `allowed`: AI use is permitted without conditions;
   - `allowed-with-disclosure`: permitted if you say how you used it;
   - `restricted`: allowed only for some tasks or with limits;
   - `banned`: not allowed;
   - `unknown`: no clear sentence found, or no syllabus.
   Show the quote and your reading: "The syllabus says: '…'. I read that as *allowed with disclosure*. Agree?" The user's answer wins. Never guess a policy; when unsure, use `unknown`.
4. **Confirm, then write** `vault/20_areas/courses/<course-slug>/course.md`:
   - Folder slug: kebab-case of the short course name (`corporate-finance`). If it exists, update it; never create a second one.
   - Start from `system/templates/notes/course.md` (the same template `/assignment` uses, so `ship` finds the "Submission rules" and `new` finds "Cases and assignments"). Replace `{{title}}` with the course title and `{{date}}` with today.
   - Frontmatter: `type: "course"`, `created`, `status: "active"`, `code`, `term`, `school`, `ai_policy`, `ai_policy_quote` (exact words, double-quoted, inner quotes escaped).
   - Body, in the template's sections: Overview (2–3 lines), AI policy (quote + one plain line on what it means), Grading, **Submission rules** (what you found; delete the lines the syllabus does not cover), Sessions, and under **Cases and assignments** the assignments and exams you found. Delete the template comment and any empty placeholder lines. Cite the syllabus: `[Source: [[<source note>]] | YYYY-MM-DD | confidence: high]`.
   - Create empty folders `sessions/`, `cases/`, `assignments/` only when there is something to put in them.
5. **Deadlines → tasks.** For each deadline with a clear date:
   `node system/scripts/tasks.mjs add "<course>: <assignment> due" --tag onboard --due YYYY-MM-DD --priority high --link "20_areas/courses/<course-slug>/course"`
   - Unclear dates ("week 6", "TBC"): no due date. Add `Confirm the deadline for <assignment> (<course>)` with `--priority medium` instead. Never invent a date.
   - Check `Tasks.md` first so you don't add the same deadline twice.
6. **Skipped syllabus:** write `course.md` with what you know, `ai_policy: "unknown"`, and add a task `Add the syllabus for <course> so I know its AI rules. Say /onboard courses` (`--priority medium`).

## After all courses

- `config/brain.json`: set `school.name` and `school.programme`. Edit only those keys.
- `vault/80_me/USER.md`: update **Studying** and **Current focus** (course names, one line).
- Summarise: "<n> courses set up. AI rules: 2 allowed with disclosure, 1 unknown. <n> deadlines added to your task list."
- If any policy is `restricted`, `banned` or `unknown`, add one plain line: "For those courses I'll remind you of the rules before helping with an assignment."

## Bring your course material

Run this once, after the summary above. There is no connection to the school's learning platform: some schools do not allow automated access, and a download needs none. The student downloads everything, and you read it.

1. **Explain in plain words** (short, in this order; use the school's own name for the website if you know it):
   - "Your readings, slides and cases sit on your school's course website. Download them once and I can answer from your own material from then on. Canvas is the example below. Other platforms (Brightspace, Moodle) work much the same, but the buttons have other names."
   - "**1. Files.** Open a course, go to **Files**, tick the box that selects everything (or press Ctrl+A on Windows, Cmd+A on a Mac), then press **Download**. You get one zip file. Do this for each course."
   - "**2. Pages.** 'Download all files' leaves out the pages: the syllabus, assignment descriptions and announcements. Open each one and save it as a PDF with your browser: press Ctrl+P (Cmd+P on a Mac) and choose **Save as PDF** as the printer. The syllabus and the assignment pages matter most, because they hold the deadlines and the AI rules."
   - "**3. Give it to me.** Hand me the zip, or a folder holding the zip and your PDFs. One folder per course works best. Leave out video and big recordings: I cannot read them."
   - Add: "Menu names differ by school and platform version. If a button is missing, tell me what you see, or save files one at a time: I can add single files any time." Keep this line: the steps above are written from general knowledge of Canvas and are [Unverified] for this user's school, so say so rather than insisting on a button name.
   - Course files are copyright material. Say, only if asked: "They stay in your own vault on this computer and your private backup, never in the public Alterbrain project."
2. **Ask once** with AskUserQuestion: "Do you want to bring it in now?"
   - **Now (recommended):** "You can ask about your own slides and readings from today. It costs a few minutes of downloading."
   - **Later:** "You finish setup first. Until you do it I know nothing from your course files, so I add a reminder to your task list with these steps."
3. **Now:** ask for the zip or folder ("Type the path, or tip: right-click the file and choose **Copy as path** on Windows, or hold **Option** and choose **Copy as Pathname** on a Mac."). Then hand over to `/ingest` with the path and the course names you have just set up. The skill infers the course, asks one question to confirm it and does the rest. Come back here when it is done or paused.
4. **Later:** add a task, and tell the user the task holds the steps:
   `node system/scripts/tasks.mjs add "Bring in my course material: download everything from each course site (Files, select all, Download; save syllabus and assignment pages as PDF), then say /ingest and give me the zip or folder" --tag ingest --priority medium`
   Check `Tasks.md` first so you do not add it twice.
5. If the user says their school offers no download at all, say so plainly and do not add a task: "Then give me files one by one as you get them: say /ingest and name the file."

## Files written

- `vault/20_areas/courses/<course-slug>/course.md` (one per course).
- Raw syllabus copies via `ingest.mjs`.
- `config/brain.json` (`school` block), `vault/80_me/USER.md` (Studying, Current focus).
- Tasks: deadlines (`#ab/onboard`), missing syllabi, unclear dates, and (if the material is postponed) "Bring in my course material" (`#ab/ingest`).
- If the user brings the material now: raw copies, source notes and course links, written by `/ingest`.

## Done criteria

- `school.name` and `school.programme` set.
- Every current course has a `course.md` with an `ai_policy` value and, unless `unknown`, an exact `ai_policy_quote`.
- Every dated deadline found is a task; every unclear one has a "confirm" task.
- The user has been told how to download their course material and has either handed it over (via `/ingest`) or has a task for it, or has said their school offers no download.

Then: `node system/scripts/onboard-progress.mjs done M3`.
