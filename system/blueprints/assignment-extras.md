---
type: "blueprint"
title: "Assignment extras"
kind: "skill"
status: "available"
risk: "low"
cost: "Free. Uses your Claude plan for the extra reviewers. The spreadsheet tools use uv (free) to run small Python helpers."
---
# Assignment extras

Seven add-ons for `/assignment`, built on request as one self-built skill, `my-assignment-extras`. Build all of them or only the ones you want.

## What it does

| Extra | What you get | Example |
|---|---|---|
| **Fit and page plan** | A plan that brings the report within the page limit: a page budget per section driven by the rubric, the cuts ranked by marks lost per line saved, and what can move to an appendix or the workbook. You approve every cut. | "The draft is 7.4 pages for a 6-page limit. Cut these four paragraphs (0.9 pages, low marks at risk) and move Table 3 to the workbook." |
| **Fact-check, full and delta** | Two blind checkers each take half the report and check every number, date, quote and attribution against the case, the course and the workbook. You get a claims table. The delta version checks only what changed since the last round. | "41 claims: 37 verified, 2 imprecise, 1 wrong (the growth rate is 4.1%, not 4.4%: Exhibit 5), 1 unverifiable." |
| **Number map** | A `Report_Map` sheet that ties every number in the report to a cell in your workbook, and a check that flags any number that no longer matches. | "209 of 209 numbers match. None changed since the last round." |
| **Excel model builder** | A workbook built by a script, so it can be rebuilt at any time: an Inputs sheet with every case number and its source, one tab per question, live formulas only, the `Report_Map`, chart tabs and a change log. | "Inputs (58 numbers, each with page and exhibit), Q1 to Q4, Report_Map, Figure1 to Figure3, README." |
| **Reality check** | Outside the report: with what actually happened after the case date, would your recommendation have done better than the alternative? Separates the quality of the decision from luck. | "The two-stage deal would have saved about 12% against buying outright. [Inference] Good for class, never for the report." |
| **Class prep** | The eight to ten hardest questions the lecturer may ask in class, each with an answer built from numbers in your report or workbook, plus the soft spots to know. | "Q: 'Everything rests on your 20% discount rate.' A: At 15% the gain falls from 70 to 30 but the decision holds (workbook Q2_Sens B23)." |
| **Team comments** | Teammates comment on the PDF in any reader. Alterbrain collects every comment into one table with author, page, the text marked and the matching line of `report.qmd`, then helps you decide on each one. | "14 comments from 3 teammates: 9 accepted, 3 already decided (D4, D7), 2 declined." |

## You'll need

- The assignment studio (`/assignment`) set up, with at least one assignment.
- **For the number map, the Excel model builder and team comments:** `uv` installed (Alterbrain's health check tells you if it is). uv runs small Python helpers in their own sandbox and fetches what they need (openpyxl, pymupdf) on first use. Nothing is installed system-wide.
- **For recalculating workbooks and turning Excel charts into images (optional):** LibreOffice. Without it, open the workbook in Excel and save it once before a number check.
- **For the reality check:** web access (the `fetch` tool, or WebSearch).

## Cost and risk

- **Cost.** A full fact-check runs two extra reviewers (sonnet, high effort); a delta check runs one. A reality check is one research run (sonnet, medium). On the Pro plan, run the full fact-check on the first and final rounds only.
- **Risk: low.** Checkers are blind and read-only. The scripts only read your files, except the model builder, which writes one workbook in the assignment folder. Nothing is sent anywhere.
- **Hindsight.** The reality check uses facts from after the case date. Its output lives outside the report and is never used to change it.
- **Coursework rules.** The same coursework notice applies as for `/assignment`.

## Questions I'll ask you

1. Which extras do you want: all seven, or a selection?
2. Do you do your calculations in Excel? If yes: should I build the workbook from a script (model builder), or map the numbers of a workbook you build yourself (number map only)?
3. Is LibreOffice installed, and may I use it to recalculate workbooks? If not, I will ask you to open and save the workbook in Excel before each check.
4. How does your team comment: on the PDF, or somewhere else?
5. For the reality check: may I search the web for what happened after the case date?
6. For class prep: do you want a task on the day of the class discussion?

## Build steps

Follow the `/build` flow (spec section 11): the proposal is approved, run `/clarify` with type `skill`, then build.

1. **Scaffold** `.claude/skills/my-assignment-extras/SKILL.md` per spec section 7: `name: my-assignment-extras`, `model: sonnet`, `effort: medium`, `argument-hint: "fit | factcheck | factcheck-delta | numbers | model | reality | class-prep | comments [assignment]"`. The body routes each sub-command to `workflows/<extra>.md`, finds the assignment folder the same way `/assignment` does, and repeats the assignment skill's Safety rules. Build only the extras the user chose.
2. **Fit and page plan** (`workflows/fit.md`):
   - read `limits` in `assignment.md`, `rubric.md`, the page plan in the review-notes block of `report.qmd`, and the page count from the `render` skill;
   - measure each section's words and lines against the plan;
   - write `fit-plan.md`: budget against actual per section, cuts ranked by marks at risk per line saved (lowest first), what moves to an appendix or the workbook, and the lines of free space after the cuts;
   - the user approves each cut; record approved cuts as decisions in `decisions.md`. Once the length is approved, write "length frozen" in the review-notes block: from then on, add only into free space and never trim.
3. **Fact-check** (`workflows/factcheck.md` and `lenses/fact-check.md`):
   - the brief follows the format of `system/packs/mba/lenses/*.md` (front matter `type: "lens"`, `model: "sonnet"`, `effort: "high"`, `word_cap: 1200`; sections Role, What to read, Output format, Word cap, Rules, including blind, read-only, verify every claim, `[Unverified]`, respect `decisions.md`, hindsight rule);
   - method: split the scope into atomic claims, sentence by sentence (every number, date, rank, quote character by character, attribution, calculation, comparison, figure caption, legend, table cell); status `VERIFIED` (with exact evidence: page or exhibit and quote, `sheet!cell = value`, file and line, or a recomputation), `WRONG` (correct value and evidence), `IMPRECISE`, `UNVERIFIABLE` (which source is needed) or `JUDGEMENT` (defensible or not); the smallest in-place edit for every item that is not verified; no cuts;
   - output: the full claims table `| # | Claim | Where | Status | Evidence | Smallest fix |`, then counts by status and the three most important findings;
   - **full:** split the report into two halves by section; run two `lens` agents in parallel (within the fan-out cap) with the same round card as `/assignment critique` and a scope line; save to `reviews/<round>/factcheck-a.md` and `factcheck-b.md`;
   - **delta:** find the last critique's commit with `git log -1 --format=%H -- critique-<round>.md` and the changes with `git diff <sha> -- report.qmd` (read-only git only); the scope is the changed sentences; save to `reviews/<round>/factcheck-delta.md`;
   - the consolidation of the next round reads these files like any other review.
4. **Number map** (`workflows/numbers.md` and `scripts/check_numbers.py`):
   - the workbook gets a `Report_Map` sheet: `id | printed as | section | sheet!cell | rounding`;
   - the script starts with PEP 723 inline metadata (`# /// script`, `dependencies = ["openpyxl"]`) and runs as `uv run .claude/skills/my-assignment-extras/scripts/check_numbers.py <workbook.xlsx> <report.qmd>`;
   - it opens the workbook with `data_only=True` (saved values), finds each printed string in the report, rounds the cell value as stated and compares; it prints `n of m match` and every mismatch or missing number, and exits 1 if any fail;
   - if cells have no saved values, it says so in plain words: "Open the workbook in Excel, save it, and run the check again" (or recalculate with LibreOffice headless, if the user allowed it).
5. **Excel model builder** (`workflows/model.md` and `scripts/build_model_template.py`):
   - the template is copied once into the assignment folder as `model/build_model.py` (PEP 723 metadata, `dependencies = ["openpyxl"]`) and adapted to the case;
   - sheets: `Inputs` (every case number with page or exhibit), one tab per question, live formulas only (no pasted values), `Report_Map`, `Figure1..n` as Excel charts, `README` with a dated change log;
   - output: `<course code>_<assignment-slug>_model.xlsx` in the assignment folder, rebuilt in place (git is the history; never versioned file names);
   - after each build: recalculate (LibreOffice headless if allowed, otherwise ask the user to open and save in Excel), check for zero formula errors, print every new cell's value and list any report number not yet mapped.
6. **Reality check** (`workflows/reality.md`):
   - run the `researcher` agent with web access on what happened after the case date; public data only, each fact with its source and date;
   - compare the recommendation (the challenger) with the incumbent decision or the main alternative (the champion);
   - separate decision quality (what was knowable then) from outcome (luck);
   - write `reality-check.md` in the assignment folder, under 900 words, every unverified item labelled; it never changes the report.
7. **Class prep** (`workflows/class-prep.md`):
   - run a `lens` agent (opus, high) with a class-prep brief: read the report, workbook, decisions and the critiques; return the eight to ten hardest questions with answers that use numbers from the report or workbook (with cells), the soft spots to know, and the thesis and key insight in one line each;
   - write `class-prep.md`; if the user gave the class date, add `node system/scripts/tasks.mjs add "Class discussion: <case>" --tag assignment --due <date> --priority medium --link "10_projects/<folder>/class-prep"`.
8. **Team comments** (`workflows/comments.md` and `scripts/pdf_comments.py`):
   - the script (PEP 723 metadata, `dependencies = ["pymupdf"]`) runs as `uv run .claude/skills/my-assignment-extras/scripts/pdf_comments.py <annotated.pdf>... --source report.qmd --out comments.md`;
   - it reads typed notes and highlights (not handwriting), and writes one table: `| # | Author | Page | Text marked | Comment | Line in report.qmd |`;
   - then go through the comments with the user like critique decisions: accept, decline or "already decided" (with the id); record the outcome in `decisions.md`, apply accepted ones in place;
   - teammates' names appear only as the PDF reader recorded them; nothing else about them is stored.
9. **Finish:** run `node system/scripts/validate.mjs`, record `my-assignment-extras` and the extras built in `state/built.json`, and tell the user how to call each one.

## How to test

Use a synthetic assignment, never a real one: `vault/10_projects/2026 demo-course demo-case/` for Alex Doe, with a two-page `report.qmd`, a short case text and a small workbook.

1. **Fit:** set `limits.pages` to 1. The plan proposes cuts that save at least one page and touches nothing until you approve.
2. **Fact-check:** plant one wrong number and one misquote. Both come back `WRONG` with the right value and evidence. The delta check, after one edit, checks only the edited sentence.
3. **Number map:** change one cell. The check prints one mismatch and exits 1. Restore it: all match, exit 0.
4. **Model builder:** the build gives zero formula errors and a `Report_Map` with every number of the demo report.
5. **Reality check:** `reality-check.md` exists, cites a source and date for every later fact, and the report is unchanged (`git diff` shows nothing on `report.qmd`).
6. **Class prep:** at least eight questions, each answer with a number traceable to the report or a cell.
7. **Comments:** a PDF with two typed comments gives a two-row table with page and source line.

Then remove the demo folder.

## How to undo

Run `/remove-skill my-assignment-extras`. It deletes `.claude/skills/my-assignment-extras/` and its entry in `state/built.json`. Files the extras wrote inside your assignment folders (`fit-plan.md`, fact-check reviews, `reality-check.md`, `class-prep.md`, `comments.md`, `model/`) stay, because they are your work. Delete them yourself if you no longer want them. `/assignment` keeps working without the extras.
