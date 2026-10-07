# Clarify checklist: assignment

**Use for:** the field list for graded coursework run through `/assignment` (SPEC §13). It is **not run through `/clarify`**: `/assignment new` (`.claude/skills/assignment/workflows/new.md`) is the interview and the only thing that writes the folder and `assignment.md`. If someone asks `/clarify assignment` directly, hand over to `/assignment new`.

## Infer first

- `vault/20_areas/courses/<course>/course.md`: `ai_policy`, `ai_policy_quote`, grading, deadlines.
- The assignment brief or handout the user gives (ingest it first: `node system/scripts/ingest.mjs "<path>" --origin "Assignment brief: <course>"`).
- A rubric file, if any.
- `Tasks.md` (a deadline may already be recorded).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What does this assignment ask you to do?" | from the handout |
| Inputs | "What material comes with it: case, data, readings?" | the handout and course readings |
| Output | "What do you hand in, and in which format?" | one PDF |
| Audience | "Who grades it?" | the course lecturer |
| Constraints | "Page or word limit, font size, spacing, team or solo?" | from the handout; otherwise ask, never guess |
| Deadline | "When is it due? Is that date confirmed?" | from `course.md`; mark `deadline_confirmed: false` until the user confirms |
| Success test | "What grade are you aiming for?" | target 9 (of 10), stop when two rounds don't improve |

## Type-specific (required, mapped to `assignment.md` frontmatter)

- `course`: link `[[course]]` to the course note.
- `title`: the assignment's own name.
- `questions`: **verbatim** from the handout, one list item each. Never paraphrase.
- `limits`: `pages`, `font_pt`, `line_spacing`, `words` (use `null` when not given).
- `deliverables`: from `pdf`, `xlsx`, `docx`, `pptx`.
- `rubric`: link to `rubric.md` if a rubric exists; otherwise ask "Is there a grading rubric?".
- `team`: names only if the user gives them.
- `lenses`: default all five (`devils-advocate`, `premortem`, `board`, `specialists`, `grader`); on Pro suggest three to save usage.
- `stop_rule`: default `{ target_grade: 9, plateau_rounds: 2 }`.
- `ai_policy`: copied from the course note. The coursework notice itself belongs to `new.md` (step 3), not here. Never write the user's answer to the notice, or the fact that a warning was given, into `assignment.md` or any other tracked file: only `state/local/coursework/<slug>.json` holds it.

## Ready when

- Questions are copied verbatim.
- Deadline and limits are known (deadline may still be unconfirmed, with a task to confirm).
- Deliverables are listed.
- The coursework notice was handled by `new.md` (nothing about it recorded in the vault).

## Where the brief goes

`/assignment new` writes `vault/10_projects/<YYYY> <course> <assignment slug>/assignment.md` with the fields above and `status: "setup"`. There is no `## Agreed brief` section: the spec itself is the agreement. Do **not** write `brief.md` here: in an assignment folder that file is the thesis brief made by `/assignment brief`.
