# /assignment draft: page plan and full draft in Quarto

Goal: `report.qmd`, a complete draft that argues the chosen thesis, answers every question and fits the limits. The same workflow also applies the decisions of a critique round ("revise mode", section 7).

Model: the main session (sonnet, medium). Read `.claude/skills/assignment/references/writing-rules.md` first.

## 1. Check the starting point

- `decisions.md` has a thesis decision (`D1`, round `brief`). If not, run `brief` first: no draft without a chosen thesis.
- `report.qmd` does not exist yet. If it does, this is a revision: go to section 7.

## 2. Set up the Quarto files

The report template lives in `system/quarto/templates/report/` (maintained by the Quarto part of the framework).

1. Copy `_extensions/`, `references.bib` and the starter `report.qmd` into the assignment folder. If the template folder has a README, follow it. Do not overwrite files that already exist in the folder.
2. Fill the starter's front matter: `title` from `assignment.md`, `subtitle` (for example "Case analysis" or "Report"), `course` (the course note's title), `programme` and `author` with the team names from `team`, or the user's name for individual work. `programme` is the name of the programme note the course links with `programme: "[[...]]"`, or the course's `provider` for a standalone course. Delete the `course` line when the assignment has no course, and the `programme` line when there is neither a programme nor a provider: the template simply leaves them off the cover. Keep `date: today`. Never add student numbers unless the user asks for them.
3. Set the page rules under `format:` from `limits` in `assignment.md`: `fontsize`, `line-spacing` and, only if the course sets them, the margins. The `brand: _brand.yml` line is handled by the `render` skill.
4. Replace the starter's example text (it is a demo) with the outline in section 4. Keep its conventions: sections start at `##`, the summary sits in a `::: {.box}` block, `{-}` leaves a heading unnumbered, `\$` prints a dollar sign, tables and figures carry labels such as `{#tbl-options}` and an italic source note.
5. If the course needs a format the template does not cover (for example Word), note it for `ship`. The `render` skill handles the output formats.

## 3. Page plan

Work out how much space each part gets, before writing a word.

1. **Space available.** From `limits` in `assignment.md`: pages, minus the cover if it counts, minus about a quarter page for references if they count. If `words` is set, use words instead.
2. **Words per page.** Assume about 450 words of prose per A4 page at 11 pt and 1.15 spacing with 2.5 cm margins (about 550 with narrow margins), and about a third of a page for each table or figure. Say it is an estimate.
3. **Split by marks.** Give the summary about a tenth of the space. Split the rest between the questions by their weight in the rubric or the assignment (equal if nothing says otherwise). Add the tables and figures each section needs.
4. Write the plan into a hidden review-notes block at the very top of the body of `report.qmd`:

   ```
   ::: {.content-hidden}
   Review notes, not graded. Page plan: <n> pages, about <w> words.
   | Section | Answers | Pages | Words | Tables and figures |
   |---|---|---|---|---|
   :::
   ```

5. Show the plan in chat and ask: "Is this split right?" Adjust if the user says so.

## 4. Outline

1. One heading per question, worded as the answer ("Should the firm buy? Yes, in two stages"), not as "Question 2".
2. A summary box first that answers every question in one or two sentences each.
3. Under each heading: the answer in the first two sentences, then the evidence, then the objection and the reply.
4. Show the outline (headings and one line each) and ask: "Shall I write the full draft on this outline?"

## 5. Write the draft

1. Write `report.qmd` in full, following the outline, the page plan, the writing rules and the user's voice (`vault/80_me/voice/<lang>/profile.md` and `exemplars.md`, if they exist).
2. Take every fact and number from the fact base in `brief.md` or the sources it cites. Never invent one. If a number needs a calculation, show the inputs and the method so the user can check it. If the deliverables include a workbook, keep a list of every number that comes from it in the review-notes block (`number -> sheet!cell`), for the number map in the extras.
3. Cite readings with the citation keys the template uses (for example `@author2022`), and add the entries to its bibliography file.
4. **AI use disclosure.** If `assignment.md` has a draft under `## AI use disclosure (draft)`, show it to the user, ask them to confirm or edit it, and add the final text at the end of the report as an unnumbered section (for example `## AI use {-}`), unless the course asks for it somewhere else.
5. Keep `[Inference]` and `[Unverified]` labels on anything not yet checked. They are resolved before `ship`.

## 6. Check and close

1. **Self-check**, and fix what fails:
   - every question has a direct answer in the first two sentences of its section;
   - every number in the summary matches the body word for word;
   - every number names its base (whose, which unit, which year);
   - the thesis fits one line;
   - no fact is later than the case date (when the assignment has one).
2. **Length.** Run the `render` skill on `report.qmd` to get a draft PDF and its page count. If Quarto is not set up yet, estimate from the word count and say so. If the draft is over the limit, do not cut on your own: show where it runs long against the page plan and ask what to cut.
3. Set `status: "draft"` in `assignment.md` and add a log line.
4. Tell the user: pages used against the limit, the open labels, and the next step: "Next: `/assignment critique`. A panel of blind reviewers will read it and I will bring you one consolidated critique."

## 7. Revise mode (after a critique round)

Use this when `critique-<round>.md` has `status: "decided"` and its decisions are in `decisions.md`.

1. Read `critique-<round>.md` section 4 and the matching rows in `decisions.md`. Apply only decisions the user accepted. Skip any the user overturned.
2. Edit `report.qmd` in place, one decision at a time, with the replacement wording given. Do not create a copy. Git keeps the old version.
3. Never cut text the user approved unless a decision says so and the user accepted it. Once the user has approved the length, add only into free space.
4. After the edits, repeat the self-check in section 6, step 1, and re-render to check the page count.
5. Add a line to the review-notes block: `Round <n> applied: D<a> to D<b>.` Add a log line to `assignment.md`. Leave `status` at `critique`.
6. Tell the user what changed, the page count, and whether another round is worth it (see the stop rule in `critique.md`).
