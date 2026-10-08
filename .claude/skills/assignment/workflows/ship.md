# /assignment ship: final checks, render, package for the course site

Goal: the final files, checked against the limits and named the way the course (or its programme) wants, in `releases/`, plus a task for the user to submit them. Alterbrain never submits anything itself.

Model: the main session (sonnet, medium). Rendering and page counts are deterministic (the `render` skill).

## 1. Check the starting point

- If `status` is not `final`, say why in one line (for example "the last critique has not plateaued" or "round 2 is still open") and ask whether to ship anyway. Respect the answer.
- If `deadline_confirmed` is false, remind the user to check the deadline on the course site.
- If the assignment has a course and its `ai_policy` is `allowed-with-disclosure`, check that the report has the AI use section. If not, offer the draft from `assignment.md`.

## 2. Final text checks

Look only at the graded text, not the `::: {.content-hidden` review-notes block.

1. **Labels.** Grep `report.qmd` for `[Unverified]`. Each one is either checked now against its source or removed. Grep for `[Inference]`: each one stays only if the report itself presents it as a judgement, in plain words ("we estimate"). Show the user what you changed.
2. **Summary against body.** Every number in the summary matches the body word for word.
3. **Questions.** Every question in `assignment.md` has a section whose first two sentences answer it.
4. **Hindsight.** If the assignment is a case with a case date, no fact is later than that date.
5. If any check needs a change to approved text, show it and ask before editing.

## 3. Render

1. Run the `render` skill on `report.qmd` for each output the deliverables need: `pdf`, and `docx` or `pptx` if listed. This is a check render: leave out `--release` so the files go to the scratch folder `_out/` and nothing is kept yet.
2. Open the PDF with the Read tool and check:
   - **pages** against `limits.pages` (add one if the cover does not count; if references do not count, count the pages before them);
   - **words** against `limits.words`, if set;
   - font size and spacing look as the limits say (the template sets them; the `render` skill may report them);
   - no review notes, comments or `[Unverified]` labels show in the PDF;
   - every figure and table shows, with its caption and source note.
3. **Over the limit:** do not cut on your own. Show how far over it is and where the text runs long against the page plan in the review-notes block, propose cuts (or what can move to an appendix or the workbook), and ask the user to approve them. Then apply, re-render and check again.

## 4. Name the files

1. Find the submission platform and the file-name rule. Start from the programme note's `## Submission conventions` (the course's `programme` link; `vault/20_areas/programmes/<Programme name>.md`). The course note's "Submission rules" override it line by line: the course says what differs, the programme is the default. For what is still missing, ask once: "Does the course set a rule for file names or say where to submit (for example initials or a student number)?" Save the answer in the course note under "Submission rules" so you never ask again for this course. With no course, ask the same question, and keep the answer under "Other rules" in `assignment.md`.
2. With no rule, use `<course code>_<assignment-slug>.<ext>`, for example `FIN-501_case-2-media-deal.pdf`, or `<assignment-slug>.<ext>` when there is no course code. Add the team name or the user's initials only if the rule asks for them.
3. Keep names short, with no characters a course site might reject (`/ \ : * ? " < > |`).

## 5. Put them in releases/

1. Render the final files straight into `releases/<today>/` with the render tool's `--release` option and the file name from step 4. Run it once per output, from the project root:
   `node system/quarto/tools/render.mjs <assignment folder>/report.qmd --type <report|deck|letter> --release --name "<file name without extension>" [--max-pages N]`
   - Add `--format docx` or `--format pptx` for those copies.
   - `--release` creates `releases/<today>/` next to `report.qmd` (today from the system). A second shipment on another day gets its own folder, and a second file on the same day gets `(2)` in its name, so nothing is overwritten.
   - Equivalent, if you need another place: `--out <assignment folder>/releases/<today> --name "<name>"`.
2. Copy the workbook there too, if `xlsx` is a deliverable (the file the user worked in, copied, not moved), under its new name.
3. Do not copy `report.qmd` or the review files: git already keeps them.
4. Never create versioned copies anywhere else in the folder.

## 6. The submit task

Add, with `node system/scripts/tasks.mjs add`:

`"Submit <title> on <the platform from step 4, or the course site>: upload the files in releases/<today>" --tag assignment --due <deadline> --priority high --link "10_projects/<folder>/releases/<today>/<pdf file name>"`

Never upload, email or post the files, even if a tool for the course site is connected. The user submits.

## 7. Close

1. Set `status: "shipped"` in `assignment.md` and add a log line, for example `- 2026-10-19: shipped, 6 pages, files in releases/2026-10-19.`
2. Tell the user:
   - the files and where they are;
   - the page count against the limit;
   - "Please upload them on the course site before <deadline>. When you have, tick the 'Submit' and 'Deadline' tasks in your task list."
3. Offer, in one line each:
   - class prep (the hardest questions the assessor may ask, with answers from the report), if the assignment extras are built;
   - adding notes from the class discussion to the case note later, if the assignment is a case.
