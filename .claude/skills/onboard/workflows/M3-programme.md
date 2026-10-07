# M3 Programme and courses

**Goal:** Alterbrain knows the school, the programme, this term's courses, each course's AI policy and the known deadlines.
**Time:** about 6 minutes (2 minutes per syllabus). **Essential.**
**Model / effort:** sonnet / medium. Reading a syllabus: sonnet / medium. With more than 4 syllabi, you may hand each to a haiku / low subagent that returns only the fields below; check every AI-policy quote yourself.

Say at the start: "Step 4 of 5: your programme and courses. If you have the syllabi as files, this is quick."

## Inference sources

- `USER.md` (programme already mentioned in M2), the CV source note.
- `config/brain.json` `school` block.
- Existing `vault/20_areas/courses/*/course.md` (never duplicate a course).
- Syllabus files the user points to.

## Questions (one at a time)

1. **School and programme.** Confirm what you already know ("You're on the full-time MBA at <school>. Right?"). Otherwise free text.
2. **Learning platform.** "Which website does your school use for courses?" AskUserQuestion: Canvas (recommended if unknown) / Brightspace / Moodle / Other or not sure.
3. **Current term.** Free text, as the school names it (for example "Term 1, 2026–27" or "Block 2").
4. **Courses this term.** "List the courses you are taking now. Names are enough." Free text.
5. **For each course, one at a time:** "Do you have the syllabus (course guide) for <course>? You can give me the file, paste the text, or skip." AskUserQuestion: Here's the file (recommended) / I'll paste it / Skip for now.

## Per-course steps

1. **Keep the raw copy** (file only): `node system/scripts/ingest.mjs "<path>" --kind pdf --origin "Syllabus: <course name>"` (use `--kind doc` for Word files). Pasted text: save it first to `state/local/tmp/onboard/<course-slug>-syllabus.md`, then ingest that file.
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

- `config/brain.json`: set `school.name`, `school.programme`, `school.lms`. Edit only those keys.
- `vault/80_me/USER.md`: update **Studying** and **Current focus** (course names, one line).
- Summarise: "<n> courses set up. AI rules: 2 allowed with disclosure, 1 unknown. <n> deadlines added to your task list."
- If any policy is `restricted`, `banned` or `unknown`, add one plain line: "For those courses I'll remind you of the rules before helping with an assignment."

## Files written

- `vault/20_areas/courses/<course-slug>/course.md` (one per course).
- Raw syllabus copies via `ingest.mjs`.
- `config/brain.json` (`school` block), `vault/80_me/USER.md` (Studying, Current focus).
- Tasks: deadlines (`#ab/onboard`), missing syllabi, unclear dates.

## Done criteria

- `school.name` and `school.programme` set.
- Every current course has a `course.md` with an `ai_policy` value and, unless `unknown`, an exact `ai_policy_quote`.
- Every dated deadline found is a task; every unclear one has a "confirm" task.

Then: `node system/scripts/onboard-progress.mjs done M3`.
