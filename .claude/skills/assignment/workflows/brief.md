# /assignment brief: research, fact base and thesis options

Goal: `brief.md` with a fact base the whole report can stand on, and two or three thesis options (A, B, C) with honest trade-offs. The user picks one. No drafting before that.

Helpers: research by the `researcher` agent; thesis options by `helper-judgement` (opus, high, set by the helper); the rest in the main session.

## 1. Check the starting point

- `assignment.md` exists and `status` is `setup` (or `brief`, if the user wants to redo it: ask first, because the thesis choice in `decisions.md` will be revisited).
- If `deadline_confirmed` is false, remind the user in one line.

## 2. Collect the sources

Build a list of paths. Do not read them all into the main session.

1. The sources named in `assignment.md`. If the assignment is a case, the case text: from the case note's "Sources" section, or search `vault/40_sources/notes/` for the case title; use the extracted text in `vault/40_sources/text/`.
2. The course note and its sessions, if the assignment has a course: `vault/20_areas/courses/<course-slug>/course.md` and `sessions/`.
3. Course material: source notes linked from the course note (slides, readings, the syllabus).
4. Relevant wiki pages: `vault/30_wiki/frameworks/`, `concepts/`, `companies/`, `industries/` (Grep for words from the questions).
5. Any workbook or data file the user named.

Ask once: "I will use these sources: <short list>. Anything else I should read, such as a reading the assessor stressed?" If they point to new files, run the `ingest` skill on them first.

If a source has `text_status: pending` in `vault/40_sources/manifest.jsonl`, read the raw file with the Read tool instead.

## 3. Research (researcher agent)

Launch the `researcher` agent with this prompt, filled in. Fill `<what the user is learning>` from the "Learning or working on" line of `vault/80_me/USER.md` (for example "an MBA student" or "an analyst taking an online course"); if it is empty, write "a learner".

```
mode: vault-only
format: caller
today: <today, from the system>
Research this assignment for <what the user is learning>. Do not write or edit any file: return your findings as your answer, in the five parts below (not in your usual format).
Case date: <case_date, or "none">. If there is one, use only facts knowable on that date. Anything later goes in one line at the end under "Outside the case".
Read in full: <paths: case text if any, course note if any, course material, wiki pages>.
Questions (word for word): <questions from assignment.md>.
Rubric: <path to rubric.md>.
Return, under 1,500 words:
1. For each question, the facts and numbers that matter, each with page, exhibit, slide or line.
2. Every exhibit or data table, and what can be computed from it.
3. The course concepts and readings each question calls for, with file and line.
4. The standard answer you would expect for each question, and where an original angle could beat it.
5. Traps: ambiguous exhibits, disguised data, numbers that conflict, easy misreadings.
Label anything you could not verify [Unverified] and your own estimates [Inference]. Use only the files above: no web search, no captures.
```

Only if the user asked for web research on a topic, change `mode` to `vault-and-web` and add "Web search is allowed for <topic>, and, if there is a case date, only for facts knowable at that date. Give each page you used as a URL in your answer; do not save files." Keep `format: caller`.

## 4. Write the fact base

Write `brief.md` in the assignment folder with this front matter and these sections. It is a working note: `[Unverified]` and `[Inference]` labels belong here and are resolved before anything is delivered (`writing-rules.md`, Labels).

```yaml
---
type: "brief"
created: "<today>"
status: "open"
assignment: "[[10_projects/<folder>/assignment]]"
thesis: ""
---
```

1. `## Questions`: word for word, numbered.
2. `## What the rubric rewards`: three to five lines from `rubric.md`.
3. `## Fact base`: a table, one row per fact: `| # | Fact or number | Base (whose, which unit, which year) | Source |`. Source is page, exhibit, slide, line or cell. Mark every row the researcher could not verify `[Unverified]`. Check at least the ten numbers that matter most against the source yourself, and say so under the table.
4. `## Exhibits`: what each one shows and what can be computed from it.
5. `## Course concepts by question`: the concept, the reading or slide, and how it applies.
6. `## Expected answer and where to beat it`: per question.
7. `## Traps`.
8. `## Open questions for you`: things only the user can settle (for example how the assessor treats a point in class).

If the assignment is a case and has a case note, also fill the case note's "Key facts", "Exhibits", "Traps" and "Course concepts that apply" sections, with citations in the form `[Source: [[note]] | YYYY-MM-DD | confidence: high|medium|low]`. The case note is course knowledge that outlives the assignment. If the assignment is not a case, leave "Exhibits" out of `brief.md` when there are none, and say so in one line.

## 5. Thesis options (`helper-judgement`)

Launch the `helper-judgement` agent (no model override; its frontmatter fixes opus and high effort). Give it file paths only: `assignment.md`, `rubric.md`, `brief.md`, the course note (if any) and the case text (if any). Prompt:

```
You are helping <what the user is learning, from the "Learning or working on" line of USER.md; "a learner" if empty> choose the central thesis for a graded assignment. Read the files listed. Do not write or edit any file.
Propose two or three distinct thesis options, labelled A, B and C. They must disagree on something that matters, not just differ in wording. For each:
- the thesis in one line;
- the answer it gives to each question, in one or two lines each;
- the three strongest pieces of evidence for it, from the fact base, with sources;
- the strongest objection a grader or an opposing team would raise, and the best reply;
- how it scores against each rubric category [Inference];
- fit: can it be argued within the page limit in assignment.md, and what it would have to leave out;
- originality: is it the expected answer, or does it beat it, and is that risky?
Then recommend one option in three lines, and say what would change your mind.
If the assignment has a case date, use only facts knowable at that date. Label estimates [Inference] and anything unchecked [Unverified]. Under 1,200 words.
```

If `helper-judgement` cannot run (plan limits), run the same prompt in the main session and say so in one line.

Append the result to `brief.md` as `## Thesis options` (A, B, C, then `### Recommendation`).

## 6. Debate, then the user picks

1. Show the options in chat, short: the one-line thesis of each, the main trade-off, and the recommendation.
2. Ask: "Which thesis should the report argue?" with AskUserQuestion: the recommended option first, marked "(recommended)", then the others. The user can also type a mix.
3. Debate before accepting. If the pick has a weakness the options found, name it once, plainly, and ask whether to keep it. Respect the answer.
4. If the user wants to think about it, add a task: `node system/scripts/tasks.mjs add "Pick a thesis for <title>" --tag assignment --due <tomorrow> --priority high --link "10_projects/<folder>/brief"`, and stop here.

## 7. Record the choice

1. In `decisions.md` under **Taken**, add `D1`: round `brief`, the chosen thesis in one line, the other options under "Alternatives considered", why, raised by "you". Every decision is the user's to overturn.
2. In `brief.md` set `thesis:` to the one-line thesis and `status: "decided"`.
3. In `assignment.md` set `status: "brief"` and add a log line.
4. Tick the "Pick a thesis" task if there was one.

## 8. Close

Tell the user: the thesis on record, the two biggest open questions, and the next step: "Next: `/assignment draft`. I will plan the pages against your limit and write the first full draft."
