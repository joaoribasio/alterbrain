# Clarify checklist: assignment

**Use for:** the field list for graded coursework run through `/assignment` (SPEC §13). A course is optional: work for no course (a self-set report, a certificate task) uses the same fields. It is **not run through `/clarify`**: `/assignment new` (`.claude/skills/assignment/workflows/new.md`) is the interview and the only thing that writes the folder and `assignment.md`. If someone asks `/clarify assignment` directly, hand over to `/assignment new`.

## Infer first

- `vault/20_areas/courses/<course>/course.md` and, if it links one, its programme note (`vault/20_areas/programmes/<Programme name>.md`): `ai_policy`, `ai_policy_quote`, `grading_scale`, submission conventions, deadlines.
- The assignment brief or handout the user gives (ingest it first: `node system/scripts/ingest.mjs "<path>" --origin "Assignment brief: <course>"`).
- A rubric file, if any.
- `Tasks.md` (a deadline may already be recorded).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What does this assignment ask you to do?" | from the handout |
| Inputs | "What material comes with it: case, data, readings?" | the handout and course readings |
| Output | "What do you hand in, and in which format?" | one PDF |
| Audience | "Who assesses it?" | the assessor (lecturer, marker or peer reviewers) |
| Constraints | "Page or word limit, font size, spacing, team or solo?" | from the handout; otherwise ask, never guess |
| Deadline | "When is it due? Is that date confirmed?" | from `course.md`; mark `deadline_confirmed: false` until the user confirms |
| Success test | "What grade are you aiming for?" Ask it in the course's own scale. | target 9 (of 10), or the nearest grade on the course's scale; a pass/fail course gets 7, "a clear pass". Stop when two rounds don't improve |

## Type-specific (required, mapped to `assignment.md` frontmatter)

- `course`: link `[[course]]` to the course note, or `""` when there is no course.
- `title`: the assignment's own name.
- `questions`: **verbatim** from the handout, one list item each. Never paraphrase. Pasted assignment text is kept verbatim under `## Assignment text (as given)`.
- Sources that disagree on the deadline, a weight or a limit: show both with their sources and ask. Never choose silently.
- `limits`: `pages`, `font_pt`, `line_spacing`, `words` (use `null` when not given).
- `deliverables`: from `pdf`, `xlsx`, `docx`, `pptx`.
- `rubric`: link to `rubric.md` if a rubric exists; otherwise ask "Is there a grading rubric?".
- `team`, `team_name`, `team_number`: the team of this assignment, names only if the user gives them, stored in `assignment.md` (empty for individual work). The course note's team is only a default to pre-fill and confirm; "not the same team" is written to `assignment.md` alone. A missing name is left out, never a placeholder.
- `voice_mode`: group work only, "me" or "team" ("sound like you, or a neutral team voice?"). Empty for individual work.
- `tone`: `academic`, `professional` or `conversational`; recommended from the course, programme or learner kind, overridable. Empty means the recommended default.
- `templates`: slugs of document templates for this assignment, only if the user names one; otherwise the resolver picks (deliverable, project, course, programme, default, built-in).
- AI-use log: when the course requires one (`ai_log` in the course note, or the syllabus says so), offer `ai-log.md`; on yes create it and set `ai_log: true`. Offered, never forced. The log is kept whenever the file exists.
- `grade` and `feedback`: left empty at set-up; `/assignment feedback` fills them when work comes back.
- `lenses`: default all five (`devils-advocate`, `premortem`, `board`, `specialists`, `grader`); on Pro suggest three to save usage.
- `stop_rule`: default `{ target_grade: 9, plateau_rounds: 2 }`. `target_grade` is always on the 10-point scale: convert the user's target with the programme note's `grading_scale`.
- `ai_policy`: read from the course note (the course value wins over the programme's). With no course there is no policy to check and no notice. The coursework notice itself belongs to `new.md` (step 3), not here. Never write the user's answer to the notice, or the fact that a warning was given, into `assignment.md` or any other tracked file: only `state/local/coursework/<slug>.json` holds it.

## Ready when

- Questions are copied verbatim.
- Deadline and limits are known (deadline may still be unconfirmed, with a task to confirm).
- Deliverables are listed.
- The team (if any), tone and, for group work, the voice question are settled.
- The coursework notice was handled by `new.md` (nothing about it recorded in the vault).

## Where the brief goes

`/assignment new` writes `vault/10_projects/<YYYY> <course> <assignment slug>/assignment.md` (`<YYYY> <assignment slug>` without a course) with the fields above and `status: "setup"`. There is no `## Agreed brief` section: the spec itself is the agreement. Do **not** write `brief.md` here: in an assignment folder that file is the thesis brief made by `/assignment brief`.
