---
name: assignment
description: Runs an MBA assignment or case report from start to hand-in (set up, research brief and thesis options, Quarto draft, blind reviewer panel, final PDF); use when the user mentions an assignment, case report, essay or coursework, or types /assignment new, brief, draft, critique or ship.
model: sonnet
effort: medium
argument-hint: "new | brief | draft | critique | ship [assignment name]"
---
# Assignment studio: plan, write, test and package a graded assignment, one step at a time.

## When to use

- The user has a graded piece of coursework: a case report, an essay, a group report, a memo.
- They type `/assignment` with or without a step name: `new`, `brief`, `draft`, `critique`, `ship`.
- They ask things like "help me with my finance case", "review my report before I submit", "what would this get?".

Do not use it for study cards (`/study`) or for an email to a lecturer (`/reply`).

## Before you start

1. **`new.md` is the readiness check.** A new assignment starts with `workflows/new.md`, which is its own interview. Do not run `/clarify` first: it would ask the same questions twice. `../clarify/checklists/assignment.md` is only the list of fields `new.md` must fill. Never start a brief or a draft from a vague request.
2. **Find the assignment folder.** Folders live in `vault/10_projects/<YYYY> <course-slug> <assignment-slug>/`, each with an `assignment.md` whose front matter is `type: "assignment"` (spec section 13).
   - If the user named one, match it against folder names and `title`.
   - If not, list the folders whose `assignment.md` status is not `shipped`. One: use it. Several: ask which, with AskUserQuestion (most urgent deadline first).
   - None and the step is not `new`: offer to run `new`.
3. **Pick the step.** If the user named one, use it. Otherwise infer it from `status` in `assignment.md`:

   | status | next step |
   |---|---|
   | (no folder) | `new` |
   | `setup` | `brief` |
   | `brief` | `draft` |
   | `draft` | `critique` |
   | `critique` | `critique` again, or `ship` if the stop rule is met |
   | `final` | `ship` |
   | `shipped` | nothing: say it is done and show the release files |

   Say which step you are about to run, in one line, and why.
4. **Read before asking.** Read `assignment.md`, the course note it links (`vault/20_areas/courses/<course-slug>/course.md`), `rubric.md` and `decisions.md` if they exist. Never ask what these already answer.
5. **Dates come from the system.** Get today with `node system/scripts/date.mjs` (local date). Never guess a date.

## Steps

1. Open the workflow file for the step and follow it exactly:
   - `new`: `.claude/skills/assignment/workflows/new.md`
   - `brief`: `.claude/skills/assignment/workflows/brief.md`
   - `draft`: `.claude/skills/assignment/workflows/draft.md`
   - `critique`: `.claude/skills/assignment/workflows/critique.md`
   - `ship`: `.claude/skills/assignment/workflows/ship.md`
2. While drafting or revising, follow `.claude/skills/assignment/references/writing-rules.md`.
3. Talk to the user one question at a time. Use AskUserQuestion for choices (two to four options, the recommended one first, marked "(recommended)"). Use free text for anything they must paste or describe.
4. Confirm, then write: before writing or changing files, show a short summary of what will change and get a yes.
5. At the end of every step:
   - update `status` in `assignment.md` as the workflow says;
   - add one dated line under `## Log` in `assignment.md` (for example `- 2026-10-12: critique round 2, grade 8.1 to 8.6.`);
   - tick any `#ab/assignment` task the step completed (`- [x]` in `vault/00_inbox/Tasks.md`);
   - tell the user in two or three lines what changed and what comes next.

## Outputs

All inside `vault/10_projects/<YYYY> <course-slug> <assignment-slug>/`:

| File | Written by | What it is |
|---|---|---|
| `assignment.md` | `new` | The spec: questions word for word, deadline, limits, deliverables, team, lenses, stop rule, status |
| `rubric.md` | `new` | The rubric word for word, plus our reading of it |
| `decisions.md` | `new`, then `brief` and `critique` | Every decision taken or declined, each one yours to overturn |
| `brief.md` | `brief` | Fact base, course concepts, thesis options A, B and C, page budget |
| `report.qmd` (+ the Quarto template files) | `draft` | The report itself, edited in place |
| `reviews/<round>/_round.md` and `reviews/<round>/<lens>.md` | `critique` | The round card and each reviewer's report, word for word |
| `critique-<round>.md` | `critique` | The consolidated critique of that round |
| `releases/` | `ship` | The files to upload, named for the LMS |

Also:
- a course note at `vault/20_areas/courses/<course-slug>/course.md` if none exists (`new`);
- a case note at `vault/20_areas/courses/<course-slug>/cases/<Case title>.md` for case assignments (`new` or `brief`);
- tasks in `vault/00_inbox/Tasks.md`, always through `node system/scripts/tasks.mjs add "<text>" --tag assignment ...`: the deadline, "confirm the deadline", "pick a thesis", "review critique round N", "submit on the LMS".

Templates for all of these live in `system/packs/mba/templates/`. Reviewer briefs live in `system/packs/mba/lenses/`.

## Safety

- **Never submit anything.** Alterbrain does not upload to the LMS, email a lecturer or post to a team chat. `ship` puts files in `releases/` and adds a task for the user to submit.
- **Coursework notice.** If the course `ai_policy` is `restricted`, `banned` or `unknown`, warn once per assignment in plain words, ask whether to continue, and proceed only on a yes. Never write that consent anywhere git tracks: only `state/local/coursework/`. If the policy is `allowed-with-disclosure`, draft a disclosure paragraph for the user.
- **Git is the history.** Edit `report.qmd` in place. Never create `_v0.1`, `_v2`, `final-final` or dated copies. Snapshots exist only in `releases/`.
- **No invented facts or numbers.** Every number in the report comes from the case, the course material, the user's sources or a calculation the user can check. Label estimates `[Inference]` and anything unchecked `[Unverified]` in working files; resolve every label before `ship`.
- **Reviewers are blind and read-only.** Each lens runs as the `lens` agent with file paths and its brief only, never the drafter's reasoning, never another reviewer's output.
- **The user decides.** Thesis choice, cuts and every critique decision are proposals until the user says yes. Never cut text the user approved without asking.
- **People.** Team members' names only if the user gives them. No student numbers, grades or other personal data in any file unless the user puts them there.
- **Hindsight rule.** The report uses only facts knowable at the case date. Later facts go to class prep or a reality check, never into the report.

## Extend this

Fit and page-budget planning, full and delta fact-checks, a number map for spreadsheets, an Excel model builder, a reality check, class prep and team comments are in `system/blueprints/assignment-extras.md`. Ask "build the assignment extras" to start, or run `/propose`.
