# When a render goes wrong

The render tool already turns most errors into plain sentences (`Problem: ...`). Use this page when that is not enough. Fix, render again, and tell the user in one sentence what happened and what you changed. Do not show raw Quarto output.

## The tool says

| Plain message | What it means | What to do |
|---|---|---|
| Quarto is not installed | The program that makes the file is missing | Windows: `winget install --id Posit.Quarto -e`. Mac: the installer from quarto.org. Then run again |
| A file the document needs was not found | A picture, `references.bib`, `cv-data.yml` or similar is missing or misnamed | Check the name and that it is in the same folder as the source. Pictures are relative to the source file |
| The text points to "x" but no section, figure or table has that label | `@fig-x`, `@tbl-x` or `@sec-x` has no target | Add the label `{#fig-x}` to the figure, table caption or heading, or fix the spelling. Prefixes must be `fig-`, `tbl-`, `sec-` |
| A source called "x" is cited but not in the reference list file | Citation key not in `references.bib` | Add the entry (only from a real source note), or correct the key |
| A bracket, quote or backtick was opened and never closed | Unbalanced punctuation, often in a caption or a box | Look near the line number in the technical details and close it, or put a backslash before it |
| The text contains "#word", which the layout engine reads as a command | A `#` in ordinary text | Write `\#` |
| The layout engine could not read part of the text | Usually a stray `$`, `#`, `@` or `_` | Put a backslash before it. Dollar signs: `\$98m` |
| The output file is open in another program | The old PDF is open in a viewer | Ask the user to close it, then run again. Or use `--name` for a new file name |
| The settings block at the top is not written correctly | YAML mistake (tabs, a colon in unquoted text, wrong indent) | Use spaces, put text containing a colon in "quotes", and check the indent |
| The brand file could not be read | `vault/80_me/brand/_brand.yml` has a mistake | Check indentation, or move the file away to use the default look |
| The font "X" is not installed | A substitute font was used | Install it, or put the file in `system/quarto/fonts/`; or change the font in the brand file to Arial. Then check the page count again |
| A picture could not be loaded | Wrong path or unsupported type | Use PNG, JPG, SVG or PDF; check the path |
| No Edge or Chrome browser was found | The deck PDF needs a browser | Open the HTML in any browser, add `?print-pdf` to the address, print, "Save as PDF" |
| The PDF has N pages but the deck has M slides | The browser printed too early | Run again. If it repeats, use the manual print above |

## Problems the tool does not name

- **A heading prints as plain text, not as a heading.** It is a level-1 heading (`#`) in a report. Reports start at `##`.
- **Two "References" headings.** Remove your own `## References` heading and `::: {#refs}` block; the template prints the list. (The filter removes them automatically when it can.)
- **A section is missing from the CV.** The list name in `cv-data.yml` and the line in the `.qmd` do not match, or the line is missing.
- **Section names look wrong in the designed CV (first three letters coloured).** That is the design. Use a longer heading or the plain CV.
- **Text is cut off or wraps oddly in the CV's right-hand column.** `location` or `date` is too long. Shorten it.
- **The first render of a new file is slow.** Quarto warms up. Later renders take a few seconds.
- **Fonts look different from Word.** The page count may differ by a few lines. Leave a safety margin.
- **The deck's colours are wrong.** The brand file has no `color.primary`, or the file name is not exactly `_brand.yml`.

## Looking deeper (for Claude, not the user)

- Re-run with `--keep` to keep `<name>.render.qmd` and the staged `_extensions/` folder, then run `quarto render <name>.render.qmd --to <format> -M keep-typ:true` to keep the Typst file (`<name>.render.typ`) and read the line the error points at. Delete these files afterwards.
- `quarto typst compile <file>.typ out-{p}.png --ppi 80` makes pictures of the pages for checking layout.
- `node system/quarto/tools/render.mjs ... --json` returns `problems`, `notes` and `technical`.
- If `system/quarto/**` itself looks broken, do not edit it. Tell the user, and use `/health-check`.
