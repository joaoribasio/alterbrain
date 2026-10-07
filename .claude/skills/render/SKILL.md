---
name: render
description: Makes a finished PDF or slide deck (CV, cover letter, report, memo, assignment or presentation) from the user's notes with the Quarto templates, checks the page limit and fonts, and explains any error in plain English. Use when the user asks to make, build, export, print or "turn into a PDF, CV, letter or deck".
model: sonnet
effort: medium
argument-hint: "[cv|letter|report|deck] [note, topic or folder]"
---

# Render: turn notes into a CV, letter, report or deck

Makes a good-looking, correctly sized document from text the user already has, and tells them in plain words how it went.

## When to use

- "Make my CV", "make an ATS-friendly CV", "turn this into a 6-page PDF", "make a cover letter for this job", "make slides from this note".
- `/assignment ship` and `/jobs apply` call this skill for the final file.
- Not for writing the content itself. Drafting words is `/assignment`, `/jobs` and the `ghostwriter` agent. Render only lays out words that already exist.

## Before you start

1. **Clarify first.** Use `/clarify document` (the checklist for documents) unless the request already answers it. You need five answers. Take every one you can from the files below, and ask only for what is missing, one question at a time:
   - which kind of document (see the table in step 1);
   - what the words come from (a note, an assignment folder, the user's facts);
   - who will read it and what it is for;
   - the limits: pages, font size, line spacing, margins. For an assignment these are already in `assignment.md` under `limits`;
   - the language (`en` or `nl`).
2. **Read, in this order, only what applies:**
   - `vault/10_projects/<assignment>/assignment.md` (limits, deliverables, `status`);
   - `vault/80_me/USER.md`, `vault/80_me/fact-sheet.md` and `vault/20_areas/career/career.md` (for a CV or letter);
   - the application note in `vault/20_areas/career/applications/` (for a letter);
   - the source note or `report.qmd` (for a report or deck);
   - `vault/80_me/brand/_brand.yml`, if it exists (colours and fonts).
3. **Check the tools once per session.** Run `node system/quarto/tools/fonts.mjs`.
   - If it says Quarto is missing, tell the user in one line how to install it (Windows: `winget install --id Posit.Quarto -e`, or quarto.org) and stop.
   - If fonts are missing, say which, and offer the two fixes it prints. Do not continue silently: a substitute font can change the page count.
4. Field lists for every template are in `references/templates.md`. Read it when you fill a template.

## Steps

1. **Pick the template** from what the user asked for.

   | Document | `--type` | Starter file |
   |---|---|---|
   | CV for a person to read | `cv` | `cv.qmd` + `cv-data.yml` |
   | CV for online forms, "ATS", "plain" | `cv-ats` | `cv-ats.qmd` + `cv-data.yml` |
   | Cover letter | `letter` | `letter.qmd` |
   | Report, case, memo, assignment | `report` | `report.qmd` + `references.bib` |
   | Slides, presentation | `deck` | `deck.qmd` |

   A CV with no preference: make both layouts from the same `cv-data.yml`, and say which is for what.
2. **Choose the folder and start the files.** Use the existing source if there is one. Otherwise:
   - CV: `vault/20_areas/career/cv/`
   - letter: `vault/20_areas/career/applications/<company role>/`
   - assignment: the assignment folder (`report.qmd` already belongs there)
   - anything else: `vault/10_projects/<short-name>/`

   Then run `node system/quarto/tools/render.mjs scaffold <type> <folder>`. It never overwrites a file that is already there, so a `cv-data.yml` that another skill prepared is kept.
3. **Fill the file.** Follow the rule for the type.
   - **CV:** edit only `cv-data.yml`. Follow `references/cv-filling.md`: every line comes from `fact-sheet.md`, `USER.md` or `career/` notes. If a fact is missing, leave the line out and ask. Never guess a date, number, title or employer.
   - **Letter:** the `ghostwriter` agent drafts the text from the voice profile and the fact sheet. You place it in `letter.qmd` and fill the data block. Keep it to one page.
   - **Report:** the content is the user's. Check the structure against `references/templates.md` (sections start at `##`, `\$` for dollar signs, `*Source: ...*` notes, citations as `@key`). Add missing keys to `references.bib` only from real source notes in `vault/40_sources/`.
   - **Deck:** turn the user's note into one idea per slide. Titles state the point. Speaker notes go in `::: {.notes}` blocks. Show the outline (slide titles only) and wait for a yes before writing the file.
4. **Confirm, then write.** Give a three-line summary of what will be written and where. When the user says yes, write.
5. **Render.** Run one command from the project root:

   `node system/quarto/tools/render.mjs <source> --type <type> [--max-pages N] [--pdf] [--name "<name>"]`

   - `--max-pages N`: for assignments use `limits.pages`. For a CV use 2 unless the user says otherwise; for a letter use 1.
   - `--pdf`: only for a deck, when the user wants a PDF as well.
   - `--format docx` or `--format pptx`: for a Word or PowerPoint copy when the brief lists one. These have a plainer look (they use `vault/80_me/brand/reference.docx` or `reference.pptx` when present). The page count is not available for them, so say so.
   - An Obsidian note ending in `.md` works as the source. The tool converts a copy first and never changes the note.
   - Output goes next to the source in `_out/` (scratch space, replaced each time, not saved to git). For a final version add `--release`: it goes to `releases/<today>/` and every version is kept. If another skill gave you a folder or a file name, pass `--out <folder>` and `--name <name>`.
6. **Read the result.** The tool prints `Done.`, the file path, and `Info`, `Note` or `Problem` lines.
   - **Problem about length:** follow `references/page-fit.md`. At most three passes, then tell the user honestly where it stands.
   - **Any other Problem:** the lines already explain it in plain English. Try the fix they suggest once. If it is still broken, read `references/troubleshooting.md`. Do not paste technical output at the user. Summarise it in one sentence and say what you will try.
   - **Note about a font:** relay it, with the two fixes.
7. **Check the document, not just the tool.** For a CV or letter, re-read the filled data against the fact sheet one last time. For a report, check that headings, figure numbers and the reference list look right. If the Read tool can open the PDF, look at the pages. If it cannot, say what you checked and what you could not.
8. **Hand over.** Tell the user, in plain words:
   - where the file is (full path);
   - the page count against the limit;
   - one thing to check by eye (for example "open it and check the table on page 3").

   For a file the user must approve, add a task, unless the skill that called you already adds one (`/jobs apply` and `/assignment ship` do):
   `node system/scripts/tasks.mjs add "Review <document name>" --tag render --link "<vault-relative path to the source>"`
   Nothing is ever sent or uploaded from here.

## Outputs

- A PDF (or, for decks, an HTML file and optionally a PDF) in `_out/`, `releases/<today>/` or the folder you were given.
- Edited or new source files in the folder you chose: `cv-data.yml`, `letter.qmd`, `report.qmd`, `deck.qmd`, `references.bib`.
- A `#ab/render` task in `vault/00_inbox/Tasks.md` when the user needs to review the result.
- No temporary files are left behind. The tool removes the copies it makes.

## Safety

- **Draft only.** This skill makes files. It never emails, uploads, submits or shares them.
- **No invented facts.** A CV or letter contains only what is in the user's own files or what they confirmed in this conversation. Label anything uncertain `[Unverified]` in the chat and leave it out of the document until the user confirms.
- **Never edit the user's note, raw sources or `vault/40_sources/raw/`.** Render works on copies.
- **Never shrink the font, margins or spacing below the brief to hit a page limit.** If the brief does not allow it, cut words and say so.
- **Coursework.** Whether AI help is allowed on an assignment is handled by `/assignment` (the notice and the user's consent). Do not repeat or record it here. If `assignment.md` shows a course with `ai_policy` of `restricted`, `banned` or `unknown` and the user has not been warned, say so once and hand back to `/assignment`.
- **No secrets, no real people in templates.** Never put anything private into `system/quarto/`. That folder is shared framework code. User data lives in the vault.
- **Do not change framework files.** `system/quarto/**` is protected. Make the user's documents in the vault.
