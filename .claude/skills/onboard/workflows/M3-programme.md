# M3 Courses and projects

**Goal:** Alterbrain knows what the user is working on, in the way that fits them:
- **MBA, degree, other:** the programme (a programme note holds what applies to the whole programme), this term's courses, each course's AI policy and known deadlines, and everything the user has for each course (syllabus, slides, readings, cases, Excel files, briefs) or a reminder to bring it.
- **Online courses:** each course with its provider and whatever material the user has.
- **Working, not studying:** 2 to 4 focus areas and up to 3 current projects.

**Essential.**
**Time, by kind:**
- **mba, degree, other:** about 6 minutes when the user gives the syllabus only (2 to 3 minutes a course). Bringing everything for a course adds the import, roughly 5 to 10 minutes for 21 to 50 files [Inference: it depends on how long the files are], and the download comes first. If Word, PowerPoint or Excel files turn up and the optional document reader is missing, saving them as PDF or installing the reader adds a few minutes, and only if the user chooses it.
- **online:** about 4 minutes with the course outlines only; the import adds time as above.
- **professional:** about 3 minutes.

"Later" is always an answer, so the module never has to take longer than the user wants.
**Model / effort:** sonnet / medium. The per-course work is `.claude/skills/course/references/course-setup.md`, which says when the `helper-triage` agent may read syllabi.

## Which branch

Learner kind: `config/brain.json` `learner.kind`. If it is missing or empty, treat it as `mba` when `packs` lists `mba` or a `school` block exists (older installs); otherwise ask the onboarding learner question (`workflows/M2-you-and-facts.md`) and come back.

| Kind | Branch |
|---|---|
| `mba`, `degree`, `other` | A: programme and courses |
| `online` | B: online courses |
| `professional` | C: focus areas and projects |

Say at the start (one line, by branch):
- A: "Step 4 of 5: your programme and courses. For each course I'll ask for everything you have: syllabus, slides, readings, Excel files, briefs. You can hand over everything, only the syllabus, or leave it for later."
- B: "Step 4 of 5: your online courses. For each one I'll ask for what you have, such as the outline, slides, readings and exercise files. You can hand over everything, only the outline, or leave it for later."
- C: "Step 4 of 5: what you are working on. A few focus areas and your current projects, so I can keep them in view."

## Inference sources

- `USER.md` (what they are learning or doing, from M2), the CV source note, `learner.detail`.
- `vault/20_areas/programmes/*.md` (never duplicate a programme note) and existing `vault/20_areas/courses/*/course.md` (never duplicate a course).
- Existing `vault/10_projects/*/project.md`.
- Older installs only: the `school` block in `config/brain.json`. Read it as a display name for the programme and never write it.
- Syllabus files the user points to.

## Branch A: mba, degree, other (one question at a time)

1. **Programme.** Confirm what you already know ("You're on the full-time MBA at <school>. Right?"), from `USER.md`, the CV, an existing programme note or the old `school` block. Otherwise free text: "Which programme are you on, and at which school or provider?" For kind `other`, start from the line in `learner.detail`.
2. **The programme note.** Follow `.claude/skills/course/references/course-setup.md`, "### The programme note", once. It asks for what holds for the whole programme in one block (school or provider, level, dates, terms, the school-wide AI rule, grading scale, submission rules, career services). Everything in it is optional and "later" is fine. If a programme note already exists, say so and go on. A handbook the user hands over goes through `/ingest`, and its AI rule is quoted word for word.
3. **Current term.** If the programme note has a Terms table, offer its rows (the one that covers today is the recommended option; get the date from `node system/scripts/date.mjs`). Otherwise free text, as the school names it (for example "Term 1, 2026–27" or "Block 2").
4. **Courses this term.** "List the courses you are taking now. Names are enough." Free text. Courses of a later block are not needed now: `/course new` adds them when they start.
5. **For each course, one at a time:** follow `.claude/skills/course/references/course-setup.md` in mode `new`. Pass the course name, the term and the programme note, so it does not ask which programme again. It asks for everything at once, imports what the user hands over, reads the syllabus, writes the course note and its Material list, takes the term dates and (after the user confirms it) the programme's AI rule when the course documents are silent, and checks what is missing. Do not repeat its steps here.
   - If the user answers once for all courses ("later for all of them"), use that for the remaining courses and do not ask again.
   - One zip or folder that holds several courses: `course-setup.md` section 2, step 2 says what can and cannot be split. Do not split a zip here.

## Branch B: online

1. **Courses and provider.** "Which online courses are you taking now, and where (Coursera, edX, a university's own site)?" Free text; names and provider. If they all come from one provider, ask for it once.
2. **No term question, no programme question.** Only if the user says the courses form one track (a specialisation, a certificate), follow `course-setup.md` "### The programme note" once, with the platform as the provider.
3. **For each course, one at a time:** `course-setup.md` in mode `new`. Pass the course name and the provider, so the course note carries `provider` and no programme link. Defaults for this kind:
   - **AI rule:** checked only where the provider states one. If none is stated, the course gets `ai_policy: "none-stated"`, you say so in one quiet line, and no warning comes per assignment.
   - **Deadlines:** optional, because online courses are often self-paced. Add dates the course states; otherwise leave them out.
   - **Class days:** asked only for a course with live sessions.

## Branch C: professional

1. **Focus areas.** "Which 2 to 4 areas are you focusing on right now?" Free text. Show them back, one short line each.
2. **Projects.** "Which projects are you working on now? Up to three. For each: a name, the goal in a line, and a due date if there is one." Free text. Show the list and ask "Save these?" (Save (recommended) / Change something). Then for each project:
   - copy `system/templates/notes/project.md` to `vault/10_projects/<YYYY> <project-slug>/project.md` (year from `node system/scripts/date.mjs`; slug is the lower-case, hyphenated project name). Never overwrite an existing note;
   - fill the title, **Goal** (the user's words), `due` (only a date the user gave) and `area` (the focus area it belongs to, if clear). Leave Next steps and Notes empty;
   - a confirmed due date also becomes a task: `node system/scripts/tasks.mjs add "<project>: due" --due YYYY-MM-DD --tag project --link "<note path>"`.
3. **A course on the side?** One question: "Are you also taking a course?" AskUserQuestion:
   - **No (recommended):** keeps set-up short (about 3 minutes in all). Course and assignment tools stay quiet until you add a course with `/course new`.
   - **Yes:** I ask for each course's syllabus and files (about 3 minutes a course), and AI-rule checks start for graded work.
   On yes, run `course-setup.md` in mode `new` for each course. There is no programme question unless the course belongs to one.

No course, programme or AI-rule step otherwise. `/assignment` and `/study` do not ask a professional for a course.

## After this module

- **Never write `school` in `config/brain.json`.** The programme note replaces it.
- `vault/80_me/USER.md`: complete **Learning or working on** (programme and school, courses and provider, or role and focus; an older file calls this line **Studying**, so keep whichever label the file has) and **Current focus** (course names, or the focus areas and project names; one line each).
- Summarise, by branch:
  - A and B: "<n> courses set up. AI rules: 2 allowed with disclosure, 1 unknown. <n> deadlines added to your task list. Material imported for <n> courses; <n> postponed." For online courses with no stated rule, say "no rule stated" instead of "unknown".
  - C: "<n> focus areas and <n> projects saved. <n> due dates on your task list."
- If any policy is `restricted`, `banned` or `unknown`, add one plain line: "For those courses I'll remind you of the rules before helping with an assignment." Do not say this for `none-stated`.
- For a course whose material is postponed, say where the reminder is: "Your task list has one reminder per course, with the steps."

## Files written

- A and B: `vault/20_areas/courses/<course-slug>/course.md` (one per course), with a `## Material` section. A: `vault/20_areas/programmes/<Programme name>.md` (once).
- C: `vault/10_projects/<YYYY> <project-slug>/project.md` (one per project).
- Raw copies, text and source notes for the files the user hands over, via `ingest.mjs` and `/ingest`.
- `vault/80_me/USER.md` (Learning or working on, Current focus).
- Tasks: deadlines, unclear dates to confirm, "Bring in my <course> material" for each postponed course, material still missing (`#ab/course`); project due dates (`#ab/project`).

## Done criteria

- **mba, degree, other:**
  - the programme note exists in `vault/20_areas/programmes/`;
  - every current course has a `course.md` with an `ai_policy` value (`none-stated` is allowed) and an exact `ai_policy_quote` unless the value is `unknown` or `none-stated`;
  - every dated deadline found is a task; every unclear one has a "confirm" task;
  - for every course the user has been asked for everything they have, and has either handed it over (imported through `/ingest`), chosen the syllabus only, or has a reminder task, or has said their school offers no download.
- **online:** the same for the courses, without the programme note. Every course note has a `provider`.
- **professional:** 2 to 4 focus areas in `USER.md`; every project the user named (up to 3) has a project note; the course question was asked, and any course is set up as above.

Then: `node system/scripts/onboard-progress.mjs done M3`.
