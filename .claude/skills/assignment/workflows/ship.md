# /assignment ship: final checks, render, package for the course site

Goal: the final files, checked against the limits and named the way the course (or its programme) wants, in `releases/`, plus a task for the user to submit them. Alterbrain never submits anything itself.

Runs in the main session. Rendering, page counts and the checks in section 6 are deterministic scripts; looking at the pages is the main session's own job.

## 1. Check the starting point

- If `status` is not `final`, say why in one line (for example "the last critique has not plateaued" or "round 2 is still open") and ask whether to ship anyway. Respect the answer.
- If `deadline_confirmed` is false, remind the user to check the deadline on the course site.
- If the assignment has a course and its `ai_policy` is `allowed-with-disclosure`, check that the report has the AI use section. If not, offer the draft from `assignment.md`.

## 2. Final text checks

Look only at the graded text, not the `::: {.content-hidden` review-notes block.

1. **Labels.** Nothing that leaves the computer carries a bracket label. Grep `report.qmd` (and any other source of a deliverable) for `[Unverified]`, `[Inference]`, `[Speculation]` and `[FACT NEEDED`. Each `[Unverified]` is checked now against its source, or removed. Each `[Inference]` or `[Speculation]` becomes plain wording the report owns ("we assume", "in our reading", "we estimate"). Each `[FACT NEEDED: ...]` is answered with the user or the sentence is cut. Show the user what you changed. The scan in section 6 enforces this on the finished files, but a PDF is only as checkable as the tool that reads it, so the source file is the check that always works:
   - run `node system/scripts/release-scan.mjs "<assignment folder>/report.qmd"` now, and again for any other source of a deliverable. It reads the front matter too (the cover prints `title`, `subtitle` and `author`) and reports labels and placeholders such as `[Teammate name]`. Fix every hit before rendering;
   - also read the `title`, `subtitle`, `author`, `course` and `programme` lines of the front matter yourself for any bracket or empty name.
2. **Summary against body.** Every number in the summary matches the body word for word.
3. **Questions.** Every question in `assignment.md` has a section whose first two sentences answer it.
4. **Hindsight.** If the assignment is a case with a case date, no fact is later than that date.
5. If any check needs a change to approved text, show it and ask before editing.

## 3. Render

1. Run the `render` skill on `report.qmd` for each output the deliverables need: `pdf`, and `docx` or `pptx` if listed. This is a check render: leave out `--release` so the files go to the scratch folder `_out/` and nothing is kept yet.
2. **Look at every page yourself, of every file that will be handed in.** For a PDF, render the pages to images with `node system/scripts/pages.mjs pdf <file.pdf> --json`. For every `.docx`, `.pptx` and `.xlsx` (a Word or slide copy of the report, and the workbook, which you look at here, before it is copied in section 5), first run `node system/scripts/pages.mjs export "<file>" --json`, then `pages.mjs pdf` on the PDF it names. Say in one line when the export fell back to LibreOffice (fonts and line breaks may then differ from the real file). Open each PNG with the Read tool (cover, edges, half-empty boxes, fallback fonts, overlaps, legibility). If the page renderer is missing, `pages.mjs check` says so: tell the user once and point to the health check, which offers the one-time install; until then say plainly that the pages are not yet viewed. A helper's "I viewed all pages" is never evidence. Then check:
   - **pages** against `limits.pages` (add one if the cover does not count; if references do not count, count the pages before them);
   - **words** against `limits.words`, if set;
   - font size and spacing look as the limits say (the template sets them; the `render` skill may report them);
   - no review notes, comments or bracket labels show in the PDF;
   - the cover is complete: title, course, programme, and, for a team assignment, the team names and number from `assignment.md` (`team`, `team_name`, `team_number`; an older assignment note without them: the course note's default, confirmed with the user). An individual assignment (`team` empty) shows the user's name only, never the course's team. No placeholder;
   - every figure and table shows, with its caption and source note.
3. **Over the limit:** do not cut on your own. Show how far over it is and where the text runs long against the page plan in the review-notes block, propose cuts (or what can move to an appendix or the workbook), and ask the user to approve them. Then apply, re-render and check again.

## 4. Name the files

1. Find the submission platform and the file-name rule. A deliverable's template (`node system/scripts/template.mjs resolve --kind report --for "<assignment folder>/assignment.md" --json`) may carry the rule in its `house_rules`; the course note still wins. Start from the programme note's `## Submission conventions` (the course's `programme` link; `vault/20_areas/programmes/<Programme name>.md`). The course note's "Submission rules" override it line by line: the course says what differs, the programme is the default. For what is still missing, ask once: "Does the course set a rule for file names or say where to submit (for example initials or a student number)?" Save the answer in the course note under "Submission rules" so you never ask again for this course. With no course, ask the same question, and keep the answer under "Other rules" in `assignment.md`.
2. With no rule, use `<course code>_<assignment-slug>.<ext>`, for example `FIN-501_case-2-media-deal.pdf`, or `<assignment-slug>.<ext>` when there is no course code. Add the team name or the user's initials only if the rule asks for them.
3. All files of one submission (report, workbook, slides) share one base name, differing only in the extension or a suffix the rule asks for.
4. Keep names short, with no characters a course site might reject (`/ \ : * ? " < > |`).

## 5. Put them in releases/

1. Render the final files straight into `releases/<today>/` with the render tool's `--release` option and the file name from step 4. Run it once per output, from the project root:
   `node system/quarto/tools/render.mjs <assignment folder>/report.qmd --type <report|deck|letter> --release --name "<file name without extension>" [--max-pages N]`
   - Add `--format docx` or `--format pptx` for those copies.
   - `--release` creates `releases/<today>/` next to `report.qmd` (today from the system). A second shipment on another day gets its own folder, and a second file on the same day gets `(2)` in its name, so nothing is overwritten.
   - Equivalent, if you need another place: `--out <assignment folder>/releases/<today> --name "<name>"`.
2. Copy the workbook there too, if `xlsx` is a deliverable (the file the user worked in, copied, not moved), under its new name. Its pages were viewed in section 3 before this copy.
2a. **AI-use log.** If `ai-log.md` exists and the course asks for the log to be handed in (ask once if unsure), show it to the user first, so they can add their own part in their words. Then put a clean copy in `releases/<today>/` (the title and the dated lines only, no front matter or comments), run it through the gate with the other files, and name it in the submit task. If the course takes the log pasted into a form, show the text instead. Never write the user's part for them.
3. Do not copy `report.qmd` or the review files: git already keeps them.
4. Never create versioned copies anywhere else in the folder.

## 6. The delivery gate

Before you tell the user to upload, run the one gate, `system/deliverables/delivery-gate.md`, on the files in `releases/<today>/`:

`node system/scripts/deliver-check.mjs <files in releases/<today>> --source "<assignment folder>/report.qmd" --max-mb <max_upload_mb from the resolved template or the programme note, if any> --base-name [--name-pattern <rule>] --json`

A PDF is read through `pdftotext`. When it cannot be read, the check reports it as **not checked**, which is a failure and never "passes": `--source` makes the check run on the file the PDF was made from instead, and says so in the result. If it still reports a file as not checked, do not call the gate clean: install the tool through the health check or check the source yourself (section 2) and tell the user what was not scanned.

It runs the release scan for labels and placeholders, the upload size, the shared base name, the workbook check for `.xlsx` (through `workbook-check.mjs`: it must open with calculated values and no error cells) and the deck checks. Fix what it reports and run it again. Then do the judgement part yourself, as the gate lists it: the report, the deck and the workbook agree on the headline numbers and terms, and every page of every file has been viewed (section 3, including the exported Word, slide and workbook files). If the release render differs from the check render (a different page count or size), look at the changed pages again. With a workbook, the model-audit lens is offered at the critique step, not here. Only when the gate is clean, go on.

## 7. The submit task

Add, with `node system/scripts/tasks.mjs add`:

`"Submit <title> on <the platform from step 4, or the course site>: upload the files in releases/<today>" --tag assignment --due <deadline> --priority high --link "10_projects/<folder>/releases/<today>/<pdf file name>"`

Never upload, email or post the files, even if a tool for the course site is connected. The user submits.

## 8. Close

1. Set `status: "shipped"` in `assignment.md` and add a log line, for example `- 2026-10-19: shipped, 6 pages, files in releases/2026-10-19.`
2. Tell the user:
   - the files and where they are;
   - the page count against the limit;
   - "Please upload them on the course site before <deadline>. When you have, tick the 'Submit' and 'Deadline' tasks in your task list."
3. When the grade or feedback comes back, the user drops it in and `/assignment feedback` records it (say this in one line).
4. Offer, in one line each:
   - a critique panel on the final files, once, if none ran on the final version (a quick panel is cheaper; a full panel uses noticeably more of the plan, on Pro especially); the user decides, and the gate runs again if anything changes;
   - the rehearsal pack, if a deck is among the files (`system/deliverables/rehearsal.md`);
   - class prep (the hardest questions the assessor may ask, with answers from the report), if the assignment extras are built;
   - adding notes from the class discussion to the case note later, if the assignment is a case.
