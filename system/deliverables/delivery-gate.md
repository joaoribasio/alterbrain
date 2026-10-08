---
type: "reference"
title: "Delivery gate"
status: "active"
---

# Delivery gate

The one checklist to finish before telling the user a file is ready to upload. It is used by `render` (final), `/assignment ship` and `/jobs apply`, and by any skill that hands over a document, deck or workbook. **Alterbrain never uploads or sends the file.** The last step is a task for the user.

## The rule that matters most

**The main session looks at every page itself.** A helper saying "I viewed all pages" is never evidence. Delegated work is not reported done on a helper's word: read the diff and look at the changed pages yourself (`.claude/rules/model-routing.md`).

## Checklist, in order

1. **Resolve the template.** `node system/scripts/template.mjs resolve --kind <kind> --for <source path> --json` gives the upload limit (`max_upload_mb`), the page limit, the fonts and the house rules. There is no separate file-name field: a file-name rule appears as free text in `house_rules` or in the course or programme note. Read it yourself and turn it into a regular expression for step 3. No template or no rule: say so in the report and use the course or programme note.
2. **Cover or title slide is complete.** Names, programme, course, date, title. The team comes from the course note (`team`, `team_name`, `team_number`), recorded once and reused. Nothing is a placeholder. Main session looks.
3. **File names.** They follow the course or template rule and share one base name (for example `Team5_StrategyCase.docx`, `.pptx`, `.xlsx`). Command: `deliver-check.mjs <files> --base-name --name-pattern "<regex>"`, where the regex is the one you wrote from the rule in step 1. If no rule exists, leave `--name-pattern` out and say so in the hand-over.
4. **Every page viewed.** Main session looks at each page of each file:
   - PDF: `node system/scripts/pages.mjs pdf <file.pdf>` renders PNGs; open each with the Read tool.
   - `.pptx`, `.docx`, `.xlsx`: `node system/scripts/pages.mjs export <file>` exports a copy to PDF, then render as above. The export tries PowerPoint, Word or Excel first. If Office is not installed it falls back to LibreOffice and prints a warning: fonts and line breaks may differ from the real file, so judge text width with care.
   - No page renderer installed: say so, and offer the one-time install (see "The page renderer" below). Do not skip the step silently; if the user declines, ask them to look at the pages and say so in the hand-over.
   - Look for: cover, page edges and margins, half-empty boxes, fallback fonts, overlapping elements, legibility at the minimum font size, charts readable and labelled.
5. **Workbook.** Opens with calculated values and no error cells: `node system/scripts/workbook-check.mjs <file.xlsx>` (add `--recalc` on Windows with Excel, optional). The model-audit lens covers the judgement items.
6. **Numbers and terms agree.** The report, the deck and the workbook state the same headline numbers, units, periods and terms. Main session compares them by reading; this is judgement, not a script.
7. **Upload size.** Within `max_upload_mb`: `deliver-check.mjs <files> --max-mb <n>`. If over, say which file and offer to reduce image size or split the file.
8. **Labels scan.** No bracket honesty labels (`[Inference]`, `[Unverified]`, `[Speculation]`, `[FACT NEEDED]`), no working citations (`[Source: ...]`, `[[wiki links]]`) and no placeholders (`[Teammate name]`, `[Company]`, `[Role]`, `Lorem ipsum`, `Click to add title`) in anything that leaves the computer, including the title, author and date in a report's front matter: `node system/scripts/release-scan.mjs <files>`. `deliver-check.mjs` runs this too. **A file the scan could not read counts as failed, never as clean.** A PDF is read through `pdftotext` (installed with Poppler, see "The page renderer"). Without it the PDF fails as `not-checked`; check the file it was made from by adding `--source <qmd, docx or pptx>` to `deliver-check.mjs`, or install Poppler.
9. **Deck rules.** Titles are sentences, data slides have a source line (`deliver-check.mjs` checks both). Structure and logic belong to the structure lens (`principles.md`).

Run `node system/scripts/deliver-check.mjs <all files> [--max-mb N] [--base-name] [--name-pattern <regex>] [--source <file>]` once for steps 3, 5, 7, 8 and 9. Exit 0 means the mechanical checks pass; steps 2, 4 and 6 are still yours. The script does not check the page limit or the fonts: read them from the resolved template and look at the pages (step 4), or run `system/quarto/tools/pagecount.mjs` and `fonts.mjs` on the PDF, and say in the hand-over which of these you checked.

Typed numbers in workbook formulas are advice, not a failure: look at the list and decide whether any is a hidden input.

## Then

- Fix what failed, rerun, and look at any page that changed.
- **When a rubric or template contradicts a check** (it prescribes slide titles such as "Introduction", or a short title the script rejects), the rubric wins (`principles.md`). Say so to the user in one line, record one line in the hand-over, and rerun with `--allow-titles "<regex of the prescribed titles>"` or `--skip-checks slide-title,source-line` (the names are `slide-title`, `source-line`, `file-name`, `base-name`, `size`, `workbook`). The output lists every waived check. Never skip a check silently, and never use it to hide a real failure; the label scan cannot be skipped.
- Add the submit task: `node system/scripts/tasks.mjs add "Upload <file names> to <where>" --tag <skill> --due <date> --link "<vault path>"`.
- Tell the user in plain words: what was checked, anything you could not check (for example "LibreOffice export, so fonts may look different from the real file"), and that they upload it themselves.
- Offer the critique panel once if the flow has not already (`/critique`).

## The page renderer

Looking at PDF pages needs a PDF page renderer (Poppler's `pdftoppm`). Alterbrain renders pages itself, because whether Claude's Read tool can open PDF pages without it is [Unverified] (community reports only). The health check and setup offer it once, never in the middle of a task:

- Windows: `winget install --id oschwartz10612.Poppler -e` (the package id is in the winget community repository).
- macOS: `brew install poppler` (listed on formulae.brew.sh with `pdftoppm`).

Check with `node system/scripts/pages.mjs check`. The same install gives `pdftotext`, which the label scan uses to read PDFs.

## Office on this computer

Exporting a `.pptx`, `.docx` or `.xlsx` to PDF, or recalculating a workbook, starts PowerPoint, Word or Excel in the background. If that app is already open, Alterbrain does not use it (closing it could lose unsaved work) and falls back to LibreOffice or the stored values, and says so. If the app hangs on a hidden prompt, the run stops the process it started after a timeout. [Unverified] This is written from how Office automation is known to behave and has not been tested against every prompt. Close the file in Office before the gate if you can.
