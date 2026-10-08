# /assignment new: set up an assignment

Goal: a folder with `assignment.md`, `rubric.md` and `decisions.md`, the coursework notice handled, and the deadline in the task list. About ten minutes of questions, one at a time.

Model: the main session (sonnet, medium). No subagents.

## 1. Look before you ask

This workflow is the readiness check for an assignment: do not run `/clarify` first. The field list it must fill, and its "Ready when" lines, are in `.claude/skills/clarify/checklists/assignment.md`. Only this workflow creates the assignment folder.

Before each question below, look for the answer in:
- the course note (`vault/20_areas/courses/<course-slug>/course.md`), especially "Submission rules" and "Grading";
- source notes for the syllabus or the assignment sheet (`vault/40_sources/notes/`, search with Grep for the course code and words like "assignment", "rubric", "deadline");
- `config/brain.json` (`school.name`, `school.lms`).

When you find an answer, state it and ask the user to confirm instead of asking from scratch ("The syllabus says six pages, 11 pt, 1.15 spacing. Is that right for this one?").

## 2. The course and the title

1. List the course notes: `vault/20_areas/courses/*/course.md`. Ask which course this is for (AskUserQuestion if there are two to four; free text otherwise).
2. If the course has no note yet, create one from `system/templates/notes/course.md` (the one course template; onboarding and `/course` use it too). Keep it small: the basics and the AI rule only. Do not ask for the course's slides, readings or rubrics now. The assignment interview comes first, and step 8 offers the rest:
   - folder `vault/20_areas/courses/<course-slug>/` (kebab-case, for example `corporate-finance`);
   - ask for the course code and term; take `school` from `config/brain.json`;
   - ask for the AI policy: "Please paste the course's rule on AI tools, word for word, or tell me where it is (syllabus, LMS page)." If the user does not know it, set `ai_policy: "unknown"` and leave `ai_policy_quote` empty.
   - Map the quote to one value: `allowed`, `allowed-with-disclosure`, `restricted`, `banned` or `unknown`. Show your reading and ask the user to confirm it. Never set anything other than `unknown` without the user's confirmation.
   - Show the course note in three lines and write it on a yes. Remember that you created it: step 8 needs that.
3. Ask the title: "What is the assignment called?" (for example "Case 2: the media deal"). Make the assignment slug from it now: kebab-case, at most five words (for example `case-2-media-deal`).

## 3. Coursework notice

Read `ai_policy` from the course note.

**If it is `restricted`, `banned` or `unknown`:**
1. Check `state/local/coursework/<course-slug>--<assignment-slug>.json`. If it exists, the user was already warned for this assignment: do not warn again. Go on.
2. Otherwise warn once, in plain words. Adapt this:

   > A quick note before we start. This course's rule on AI tools is <restricted / a ban / not known yet>. <If there is a quote: "The syllabus says: '<quote>'.">
   > Using me on this assignment may go against that rule, and you are the one who answers for what you hand in. I can still help, and you decide how.

3. Ask with AskUserQuestion: "Carry on with this assignment?"
   - "Yes, carry on" (recommended only if the policy is `unknown`);
   - "Let me check the rule first" (adds a task "Check the AI rule for <course>" with `--tag assignment --priority high`, then stops);
   - "No, stop here" (stops, writes nothing).
4. On yes, write `state/local/coursework/<course-slug>--<assignment-slug>.json`:
   ```json
   { "assignment": "<course-slug>--<assignment-slug>", "policy": "<value>", "warned": "<ISO date-time>", "continue": true }
   ```
   This folder is ignored by git. **Never write the consent, or the fact that the user was warned, into `assignment.md`, the course note, the log or any other tracked file.**

**If it is `allowed-with-disclosure`:** draft a disclosure paragraph for the user and put it under `## AI use disclosure (draft)` in `assignment.md` (step 6). Adapt this, then ask the user to correct it to match what they will really do:

> I used Alterbrain, an AI assistant built on Claude (Anthropic), to <organise my notes and sources, suggest a structure, check facts and numbers, and review drafts>. The analysis, the judgements and the final wording are my own. I checked every fact and number against the case and the course material.

Use "our" and "we" for a team. The `draft` step places the final text in the report.

**If it is `allowed`:** say nothing about it.

## 4. The assignment, one question at a time

Ask only what is still missing. Use free text unless a choice is shown.

1. **Questions, word for word.** "Please paste the questions exactly as the course gives them." Keep them character for character. Do not fix typos. One list item per question.
2. **Case.** If the questions refer to a case: "Which file is the case?" If it is not in `vault/40_sources/` yet, run the `ingest` skill on it first. Ask for the case date only if the case text does not state it.
3. **Deadline.** "When is it due? Date and time, if you know them." Then: "Did you see that date on the LMS or the syllabus yourself?" (AskUserQuestion: "Yes, I checked it" / "Not yet"). Yes sets `deadline_confirmed: true`.
4. **Limits.** Pages, words, font size and line spacing. Then two short ones: "Does the cover page count?" and "Do references count?" Use `null` for a limit the course does not set.
5. **Rubric.** "Please paste the rubric or grading criteria, or tell me which file has them." If there is none, say you will build a working reading from the syllabus, labelled `[Inference]`.
6. **Deliverables.** AskUserQuestion, several allowed: "PDF report" (recommended), "Excel workbook", "Word document", "Slides".
7. **Team.** AskUserQuestion: "Individual" / "Team". If team: "Would you like to add your teammates' names? This is optional, names only." Store only what they give.

Do not ask about lenses or the stop rule. Use the defaults from the template and mention them once in the summary.

## 5. Name the folder

`vault/10_projects/<YYYY> <course-slug> <assignment-slug>/`
- `<YYYY>`: the deadline's year;
- `<assignment-slug>`: the slug from step 2.

If the folder exists, stop and ask whether to open that one instead.

Before you write anything, check the "Ready when" lines of the checklist: questions copied word for word, deadline and limits known, deliverables listed, coursework notice handled. If the user stops before that ("later"), write nothing. Add one task `node system/scripts/tasks.mjs add "Finish setting up the assignment <title>. Say /assignment new" --tag assignment --priority medium` and say so.

## 6. Confirm, then write

Show a short summary: folder, title, deadline (and whether confirmed), the questions (first words of each), limits, deliverables, team, and the default reviewers and stop rule ("five reviewers available; I stop suggesting rounds when the grade estimate stops moving, target 9 out of 10"). Ask "Shall I set it up?" Then write:

1. `assignment.md` from `system/packs/mba/templates/assignment.md`:
   - `created`: today; `course`: `"[[20_areas/courses/<course-slug>/course]]"`; `rubric`: `"[[10_projects/<folder>/rubric]]"`;
   - `questions`: a block list, one double-quoted string per question, word for word (escape inner `"` as `\"`);
   - `status: "setup"`; fill the body sections; remove the template comment; add the first `## Log` line.
2. `rubric.md` from `system/packs/mba/templates/rubric.md`: the verbatim text first, then the categories table.
3. `decisions.md` from `system/packs/mba/templates/decisions.md`, with the example rows removed.
4. For a case: the case note `vault/20_areas/courses/<course-slug>/cases/<Case title>.md` from `system/packs/mba/templates/case.md`, if it does not exist. Fill what the case text gives; leave the rest for `brief`.
5. Add a line linking the folder under "Cases and assignments" in the course note.

Do not create `reviews/` or `releases/` yet.

## 7. Deadline tasks

Get today from the system: `node system/scripts/date.mjs` (local date). Count days with it, for example five days before 2026-10-20: `node system/scripts/date.mjs --from 2026-10-20 --plus -5`. Tomorrow is `node system/scripts/date.mjs --plus 1`.

First read the open tasks: `node system/scripts/tasks.mjs list`. Course setup (`system/packs/mba/course-setup.md`) may already have put this deadline on the list, as "<course>: <assignment> due" or "Confirm the deadline for <assignment> (<course>)". Match on the assignment title together with the course name or code, not on the exact wording.
- **A matching task with the same date:** skip item 1 below ("The deadline was already on your list"), and item 2 as well when a matching "Confirm the deadline" task is open. If `deadline_confirmed` is true now and its "Confirm the deadline" task is open, tick it: `node system/scripts/tasks.mjs done "<its text>"`.
- **A matching task with a different date:** show both and ask which is right. Tasks cannot be edited from here: if the list is wrong, add item 1 with the right date and, with the user's OK, tick the old one with `tasks.mjs done`.
- **No match:** add items 1 to 3 as below.

Add what is not skipped, with `node system/scripts/tasks.mjs add`:
1. `"Deadline: <title> (<course code>)" --tag assignment --due <deadline> --priority high --link "10_projects/<folder>/assignment"`.
2. If `deadline_confirmed` is false: `"Confirm the deadline for <title> on the LMS" --tag assignment --due <tomorrow> --priority high --link "10_projects/<folder>/assignment"`.
3. If the deadline is more than seven days away: `"First review round for <title>" --tag assignment --due <deadline minus 5 days> --priority medium --link "10_projects/<folder>/assignment"`.

## 8. Close

Tell the user, in three lines: the folder is ready, what tasks were added, and the next step: "Next: `/assignment brief`. I will read the case and your course notes and come back with two or three possible answers for you to choose from."

If you created the course note in step 2, add one more line, once, and do not wait for an answer: "This course is new to me, so I only know its AI rule. Say `/course <course title>` and give me its slides, readings, Excel files and rubrics, and I can answer from your own material." It never blocks the assignment. `/course` follows `system/packs/mba/course-setup.md` and fills in this same course note without making a second one.
