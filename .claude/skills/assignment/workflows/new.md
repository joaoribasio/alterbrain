# /assignment new: set up an assignment

Goal: a folder with `assignment.md`, `rubric.md` and `decisions.md`, the coursework notice handled, and the deadline in the task list. About ten minutes of questions, one at a time.

Runs in the main session.

## 1. Look before you ask

This workflow is the readiness check for an assignment: do not run `/clarify` first. The field list it must fill, and its "Ready when" lines, are in `.claude/skills/clarify/checklists/assignment.md`. Only this workflow creates the assignment folder.

Before each question below, look for the answer in:
- the course note (`vault/20_areas/courses/<course-slug>/course.md`), especially "Submission rules" and "Grading";
- the programme note the course links with `programme: "[[...]]"` (`vault/20_areas/programmes/<Programme name>.md`): `grading_scale`, `## Submission conventions`, the programme-wide AI rule. The course note's own section is read first; the programme note answers when that section is empty;
- source notes for the syllabus or the assignment sheet (`vault/40_sources/notes/`, search with Grep for the course code and words like "assignment", "rubric", "deadline");
- the course note's default `team`, `team_name`, `team_number`, `tone` and `templates`, and the programme note's `tone`, `templates`, `max_upload_mb` and `csl`;
- `config/brain.json` `school.name` and `school.programme`, only as a display name when there is no programme note.

When you find an answer, state it and ask the user to confirm instead of asking from scratch ("The syllabus says six pages, 11 pt, 1.15 spacing. Is that right for this one?").

**Two sources that disagree** on a deadline, a weight or a limit (the syllabus and the course site, the course note and the assignment sheet): show both, each with where it comes from, and ask which holds. Never choose silently, and never write either until the user has answered.

## 2. The course and the title

1. **Which course.** List the course notes: `vault/20_areas/courses/*/course.md`. Ask which course this is for, and always offer **No course** (a self-set report, a certificate task, work for your job). Read `learner.kind` in `config/brain.json` (if `learner` is missing or its `kind` is empty, treat it as `mba` when `packs` lists `mba` or a `school` block exists; otherwise there is no kind). With AskUserQuestion, put the options in this order:
   - for a `professional`: **No course (recommended)**: "No AI rule to check and no course note to keep; the folder holds the assignment only." / the courses (up to two) / **A course not listed here**.
   - for everyone else: the courses (up to two), **No course**: "Right for work that belongs to no course; no AI rule to check." / **A course not listed here**: "I set up its note first; adds about 3 minutes."
   With more than two courses, show the two with the nearest deadlines or the most recent and let the user type another. A `professional` with no course notes at all gets **No course** without a question, in one line.
2. **A course with no note yet.** Create the note by the course procedure, `.claude/skills/course/references/course-setup.md`, in its short form: the title, slug and programme or provider (its section 0), the AI rule and the note itself (its section 3). The files themselves (its sections 1 and 2) wait for step 8 below. The assignment interview comes first. Keep the note small:
   - folder `vault/20_areas/courses/<course-slug>/` (kebab-case, no programme name in the slug, for example `corporate-finance`), from `system/templates/notes/course.md`;
   - ask for the course code and term if they are not known; the programme question (or `provider`) is the procedure's;
   - the AI rule: ask for the course's own rule word for word, or where it is (syllabus, course site). If the course is silent and its programme note holds a rule, pre-fill it and only ask to confirm: "The programme rule is <x>. Treat this course the same?". For a course with a `provider` and no stated rule, ask once whether the course or provider states one and save `none-stated` if not. If the user does not know, set `ai_policy: "unknown"` and leave `ai_policy_quote` empty;
   - map the quote to one value: `allowed`, `allowed-with-disclosure`, `restricted`, `banned`, `none-stated` or `unknown`. Show your reading and ask the user to confirm it. Never set anything other than `unknown` without the user's confirmation;
   - show the course note in three lines and write it on a yes. Remember that you created it: step 8 needs that.
3. **The title.** Ask: "What is the assignment called?" (for example "Case 2: the media deal"). Make the assignment slug from it now: kebab-case, at most five words (for example `case-2-media-deal`).

## 3. Coursework notice

Skip this step when there is no course: with no course there is no rule to check, and nothing is warned or recorded.

Read `ai_policy` from the course note. The course value always decides. If it is `unknown` and the programme note holds a rule (`ai_policy` other than `unknown`, with its quote), pre-fill and only ask to confirm: "The programme rule is <x>. Is it the same for this course?" On a yes, write `ai_policy` and `ai_policy_quote` (starting `Programme rule: `) to the course note and carry on with the new value. On a no, keep `unknown`.

**If it is `restricted`, `banned` or `unknown`:**
1. Check `state/local/coursework/<course-slug>--<assignment-slug>.json`. If it exists, the user was already warned for this assignment: do not warn again. Go on.
2. Otherwise warn once, in plain words, and say where the rule comes from: the course (its own text), the programme (the quote starts `Programme rule: `) or the provider (the course has a `provider` property and the rule is theirs). Adapt this:

   > A quick note before we start. <The course's / Your programme's / <Provider>'s> rule on AI tools is <restricted / a ban / not known yet>. <If there is a quote: "It says: '<quote>'.">
   > Using me on this assignment may go against that rule, and you are the one who answers for what you hand in. I can still help, and you decide how.

3. Ask with AskUserQuestion: "Carry on with this assignment?"
   - "Yes, carry on" (recommended only if the policy is `unknown`): "You get my help and answer for the result; costs nothing if the rule turns out to allow it."
   - "Let me check the rule first": "Safest; the assignment waits." Adds a task "Check the AI rule for <course>" with `--tag assignment --priority high`, then stops.
   - "No, stop here": "Nothing is written."
4. On yes, write `state/local/coursework/<course-slug>--<assignment-slug>.json`:
   ```json
   { "assignment": "<course-slug>--<assignment-slug>", "policy": "<value>", "warned": "<ISO date-time>", "continue": true }
   ```
   This folder is ignored by git. **Never write the consent, or the fact that the user was warned, into `assignment.md`, the course note, the log or any other tracked file.**

**If it is `allowed-with-disclosure`:** draft a disclosure paragraph for the user and put it under `## AI use disclosure (draft)` in `assignment.md` (step 6). Adapt this, then ask the user to correct it to match what they will really do:

> I used Alterbrain, an AI assistant built on Claude (Anthropic), to <organise my notes and sources, suggest a structure, check facts and numbers, and review drafts>. The analysis, the judgements and the final wording are my own. I checked every fact and number against the sources and the course material.

Use "our" and "we" for a team. The `draft` step places the final text in the report.

**If it is `allowed` or `none-stated`:** say nothing about it.

## 4. The assignment, one question at a time

Ask only what is still missing. Use free text unless a choice is shown.

1. **Questions, word for word.** "Please paste the questions exactly as the course gives them." Keep them character for character. Do not fix typos. One list item per question. With no course: "...exactly as they were set, or as you want to answer them." If the user pastes the whole assignment text (brief, instructions, case question), keep that too, verbatim, for `## Assignment text (as given)` in step 6, and take the questions from it. Never tidy, shorten or reorder what was pasted.
2. **Case.** Only if the questions refer to a case (a text with facts and exhibits to analyse): "Which file is the case?" If it is not in `vault/40_sources/` yet, run the `ingest` skill on it first. Ask for the case date only if the case text does not state it. For anything that is not a case, skip this question and do not ask for a case date.
3. **Deadline.** "When is it due? Date and time, if you know them." Then: "Did you see that date on the course site or the syllabus yourself?" (AskUserQuestion: "Yes, I checked it" / "Not yet"). Yes sets `deadline_confirmed: true`.
4. **Limits.** Pages, words, font size and line spacing. Then two short ones: "Does the cover page count?" and "Do references count?" Use `null` for a limit the course does not set.
5. **Rubric.** "Please paste the rubric or grading criteria, or tell me which file has them." If there is none, say you will build a working reading from the syllabus, labelled `[Inference]` (a working note in `rubric.md`; the label never reaches a delivered file).
6. **Target grade.** Ask once: "What grade are you aiming for?" Ask it in the course's own scale: read `grading_scale` in the programme note, or the course note's Grading section, and name the scale in the question ("The scale is 1 to 10, pass at 5.5."). With no scale on record, ask for the scale in the same question. Store `stop_rule.target_grade` on the 10-point scale, which the stop rule uses:
   - a 1 to 10 scale: the grade as given;
   - a percentage: divide by 10;
   - letters or a 4.0 scale: the course's own mapping if it states one; otherwise spread the scale evenly over 10 and round to the nearest half point (A is about 9, B about 8);
   - a scale where 1 is the best grade: invert it so the best grade is 10;
   - no scale known, or the user has no target: 9 (the default);
   - a pass/fail course: 7, "a clear pass".
   Show the conversion in one line before you write it ("A is 9 out of 10 here. OK?") and label it `[Inference]` if the course gives no mapping.
7. **Deliverables.** AskUserQuestion, several allowed: "PDF report" (recommended), "Excel workbook", "Word document", "Slides".
8. **Team.** AskUserQuestion: "Individual" / "Team". **The team of this assignment is what `assignment.md` holds** (`team`, `team_name`, `team_number`); covers, title slides and file names read it from there. The course note keeps only a default, to pre-fill.
   - **Individual:** leave `team` empty, whatever the course note holds. Do not ask about a team and do not put the course default on the cover.
   - **Team, and the course note holds a default:** show it and ask "Same team as before: <names>?" Yes: copy it to `assignment.md`. No: ask for the names, the team name and the number for this assignment and write them to `assignment.md` only. Leave the course default as it is unless the user says to replace it (a new group per assignment is common).
   - **Team, and the course note has none:** "Would you like to add your teammates' names, the team name and the team number, if there are any? This is optional, names only." Write them to `assignment.md`, then ask once whether they are the course's usual team; on a yes also save them in the course note as the default.
   - With no course, keep it in `assignment.md` only. If a name is missing, leave it out: a `[Teammate name]` placeholder never ships (the release scan catches it).
9. **Voice, group work only.** One question: "Should this sound like you, or use a neutral team voice?" **Sound like me (recommended)**: "Uses your voice profile, so it reads like your own work; teammates' sections may sound different." / **A neutral team voice**: "One plain register for everyone; it will not sound like you." Store `voice_mode: "me"` or `"team"`. Individual work is always your voice, so `voice_mode` stays empty. No voice profile in `vault/80_me/voice/<lang>/`: say once that there is none and suggest the voice setup (onboarding M5); carry on only if the user wants to.
10. **Tone.** Tone is a formality dial on top of your voice: `academic`, `professional` or `conversational`. Find the recommended one: `node system/scripts/template.mjs resolve --kind report --for "<course note path>" --json` and read `tone` and `tone_source` (the course value, else the programme's). If that gives nothing, use the default: `learner.kind` `mba` or `professional` gives professional; `degree`, `online` or `other` gives academic. State it with its source and ask only to confirm ("Tone: academic, from your programme. OK?"). Store it in `tone` only if the user changes it; empty means the course, programme or default applies. A rubric or school template that sets a structure or register wins: say so in one line.
11. **AI-use log.** Only when the course note has `ai_log: true`, or the course or syllabus requires an AI-use log: offer it once ("The course asks for an AI-use log. Shall I keep one, one dated line per working step?" **Yes, keep one (recommended)**: "You always have the log ready to hand in; it costs one line per step." / **No, I keep it myself**: "Nothing is written for you."). On yes, create `ai-log.md` from `system/templates/notes/ai-log.md` in step 6, and set `ai_log: true` in the course note if it says `false` or lacks the key. The log is kept whenever `ai-log.md` exists, whatever the course flag says. Every later step adds its own line (`SKILL.md` step 5); the log records only what Alterbrain did, and the user's own part only in their words. Offered, never forced.

Do not ask about lenses. Use the defaults from the template and mention them once in the summary.

## 5. Name the folder

`vault/10_projects/<YYYY> <course-slug> <assignment-slug>/`, or `vault/10_projects/<YYYY> <assignment-slug>/` when there is no course.
- `<YYYY>`: the deadline's year;
- `<assignment-slug>`: the slug from step 2.

If the folder exists, stop and ask whether to open that one instead.

Before you write anything, check the "Ready when" lines of the checklist: questions copied word for word, deadline and limits known, deliverables listed, coursework notice handled. If the user stops before that ("later"), write nothing. Add one task `node system/scripts/tasks.mjs add "Finish setting up the assignment <title>. Say /assignment new" --tag assignment --priority medium` and say so.

## 6. Confirm, then write

Show a short summary: folder, title, course (or "no course"), deadline (and whether confirmed), the questions (first words of each), limits, deliverables, team, tone (and voice, for group work), and the default reviewers and stop rule ("five reviewers available; I stop suggesting rounds when the grade estimate stops moving, target <N> out of 10"). Ask "Shall I set it up?" Then write:

1. `assignment.md` from `system/templates/notes/assignment.md`:
   - `created`: today; `course`: `"[[20_areas/courses/<course-slug>/course]]"`, or `""` with no course; `rubric`: `"[[10_projects/<folder>/rubric]]"`;
   - `questions`: a block list, one double-quoted string per question, word for word (escape inner `"` as `\"`);
   - `stop_rule.target_grade`: the converted target from step 4; `team`, `team_name`, `team_number`, `tone` and `voice_mode` from step 4 (empty when not set; `team` is empty for an individual assignment); `templates`, `grade` and `feedback` stay empty;
   - the pasted assignment text, if any, verbatim under `## Assignment text (as given)`; delete that section when nothing was pasted;
   - `status: "setup"`; fill the body sections; remove the template comment; add the first `## Log` line.
2. `rubric.md` from `system/templates/notes/rubric.md`: the verbatim text first, then the categories table.
3. `decisions.md` from `system/templates/notes/decisions.md`, with the example rows removed.
3a. `ai-log.md` from `system/templates/notes/ai-log.md`, only if step 4.11 said yes.
4. For a case, and only when there is a course: the case note `vault/20_areas/courses/<course-slug>/cases/<Case title>.md` from `system/packs/mba/templates/case.md`, if it does not exist. Fill what the case text gives; leave the rest for `brief`. A case with no course gets no case note: link its source note under "Sources" in `assignment.md` and keep the case date there.
5. With a course, add a line linking the folder under "Cases and assignments" in the course note.

Do not create `reviews/` or `releases/` yet.

## 7. Deadline tasks

Get today from the system: `node system/scripts/date.mjs` (local date). Count days with it, for example five days before 2026-10-20: `node system/scripts/date.mjs --from 2026-10-20 --plus -5`. Tomorrow is `node system/scripts/date.mjs --plus 1`.

First read the open tasks: `node system/scripts/tasks.mjs list`. Course setup (`.claude/skills/course/references/course-setup.md`) may already have put this deadline on the list, as "<course>: <assignment> due" or "Confirm the deadline for <assignment> (<course>)". Match on the assignment title together with the course name or code, not on the exact wording.
- **A matching task with the same date:** skip item 1 below ("The deadline was already on your list"), and item 2 as well when a matching "Confirm the deadline" task is open. If `deadline_confirmed` is true now and its "Confirm the deadline" task is open, tick it: `node system/scripts/tasks.mjs done "<its text>"`.
- **A matching task with a different date:** show both and ask which is right. Tasks cannot be edited from here: if the list is wrong, add item 1 with the right date and, with the user's OK, tick the old one with `tasks.mjs done`.
- **No match:** add items 1 to 3 as below.

Add what is not skipped, with `node system/scripts/tasks.mjs add`:
1. `"Deadline: <title> (<course code, or the course name, or nothing>)" --tag assignment --due <deadline> --priority high --link "10_projects/<folder>/assignment"`.
2. If `deadline_confirmed` is false: `"Confirm the deadline for <title> on the course site" --tag assignment --due <tomorrow> --priority high --link "10_projects/<folder>/assignment"`.
3. If the deadline is more than seven days away: `"First review round for <title>" --tag assignment --due <deadline minus 5 days> --priority medium --link "10_projects/<folder>/assignment"`.

## 8. Close

Tell the user, in three lines: the folder is ready, what tasks were added, and the next step: "Next: `/assignment brief`. I will read your sources and course notes and come back with two or three possible answers for you to choose from." For a case, say "the case" instead of "your sources".

If you created the course note in step 2, add one more line, once, and do not wait for an answer: "This course is new to me, so I only know its AI rule. Say `/course <course title>` and give me its slides, readings, data files and rubrics, and I can answer from your own material." It never blocks the assignment. `/course` follows `.claude/skills/course/references/course-setup.md` and fills in this same course note without making a second one.
