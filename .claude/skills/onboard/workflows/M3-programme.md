# M3 Programme and courses

**Goal:** Alterbrain knows the school, the programme, this term's courses, each course's AI policy and the known deadlines, and has been asked for everything the user has for each course (syllabus, slides, readings, cases, Excel files, briefs). **Essential.**
**Time:** about 6 minutes when the user gives the syllabus only (2 to 3 minutes a course). Bringing everything for a course adds the import, roughly 5 to 10 minutes for 21 to 50 files [Inference: it depends on how long the files are], and the download comes first. If Word, PowerPoint or Excel files turn up and the optional document reader is missing, saving them as PDF or installing the reader adds a few minutes, and only if the user chooses it. "Later" is always an answer, so the module never has to take longer than the user wants.
**Model / effort:** sonnet / medium. The per-course work is `system/packs/mba/course-setup.md`, which says when a helper may read syllabi.

Say at the start: "Step 4 of 5: your programme and courses. For each course I'll ask for everything you have: syllabus, slides, readings, Excel files, briefs. You can hand over everything, only the syllabus, or leave it for later."

## Inference sources

- `USER.md` (programme already mentioned in M2), the CV source note.
- `config/brain.json` `school` block.
- Existing `vault/20_areas/courses/*/course.md` (never duplicate a course).
- Syllabus files the user points to.

## Questions (one at a time)

1. **School and programme.** Confirm what you already know ("You're on the full-time MBA at <school>. Right?"). Otherwise free text.
2. **Current term.** Free text, as the school names it (for example "Term 1, 2026–27" or "Block 2").
3. **Courses this term.** "List the courses you are taking now. Names are enough." Free text. Courses of a later block are not needed now: `/course new` adds them when they start.
4. **For each course, one at a time:** follow `system/packs/mba/course-setup.md` in mode `new`. Pass the course name and the term. It asks for everything at once, imports what the user hands over, reads the syllabus, writes the course note and its Material list, and checks what is missing. Do not repeat its steps here.
   - If the user answers once for all courses ("later for all of them"), use that for the remaining courses and do not ask again.
   - One zip or folder that holds several courses: `course-setup.md` section 2, step 2 says what can and cannot be split. Do not split a zip here.

## After all courses

- `config/brain.json`: set `school.name` and `school.programme`. Edit only those keys.
- `vault/80_me/USER.md`: update **Studying** and **Current focus** (course names, one line).
- Summarise: "<n> courses set up. AI rules: 2 allowed with disclosure, 1 unknown. <n> deadlines added to your task list. Material imported for <n> courses; <n> postponed."
- If any policy is `restricted`, `banned` or `unknown`, add one plain line: "For those courses I'll remind you of the rules before helping with an assignment."
- For a course whose material is postponed, say where the reminder is: "Your task list has one reminder per course, with the steps."

## Files written

- `vault/20_areas/courses/<course-slug>/course.md` (one per course), with a `## Material` section.
- Raw copies, text and source notes for the files the user hands over, via `ingest.mjs` and `/ingest`.
- `config/brain.json` (`school` block), `vault/80_me/USER.md` (Studying, Current focus).
- Tasks (`#ab/course`): deadlines, unclear dates to confirm, "Bring in my <course> material" for each postponed course, material still missing.

## Done criteria

- `school.name` and `school.programme` set.
- Every current course has a `course.md` with an `ai_policy` value and, unless `unknown`, an exact `ai_policy_quote`.
- Every dated deadline found is a task; every unclear one has a "confirm" task.
- For every course the user has been asked for everything they have, and has either handed it over (imported through `/ingest`), chosen the syllabus only, or has a reminder task, or has said their school offers no download.

Then: `node system/scripts/onboard-progress.mjs done M3`.
