# Reference documents and slide layouts

A reference document is a normal Word or PowerPoint file that Quarto copies the look from (fonts, colours, margins, slide masters). Quarto writes the new content into it.

## What to give Quarto

- Slides: a `.pptx`. Word: a `.docx`. A `.potx` (PowerPoint template) or `.dotx` (Word template) is the same kind of file in a different wrapper, and `template.mjs inspect` can read it, but Quarto needs the plain form. Ask the user to open it and use "Save as" to make a copy as `.pptx` or `.docx`. Do not convert it for them.
- Name the file in `reference_doc` in `template.yml`. A deck needs `.pptx`; reports, memos, essays and letters need `.docx`.

## Layout names Quarto needs in a .pptx

Quarto looks for these seven slide layouts by name; the first layout with a given name is used, and a missing one is taken from Quarto's default file, with a warning:

- Title Slide: the opening slide (title, author, date)
- Title and Content: the default slide
- Section Header: the divider slides above the slide level
- Two Content: two-column slides
- Comparison: two columns where one has text and then something that is not text
- Content with Caption: text followed by a picture or table
- Blank: a slide with only notes or nothing

Source: https://quarto.org/docs/presentations/powerpoint.html (checked 2026-10-08). `node system/scripts/template.mjs inspect <file.pptx>` lists the layouts in the file and the ones missing. To add one, the user opens Slide Master view in PowerPoint, adds a layout and names it exactly as above.

## Word

Quarto's Word page says the reference document carries sample text in every style Pandoc uses, and that you change a style by editing the sample text's style in Word. It does not list the style names, so none are checked here. [Unverified] If a style looks wrong in the output, change that style in the reference file and render again.

## Colours and fonts

`inspect` reads the theme inside the file: the twelve theme colours (dark and light, and accent 1 to 6) and the heading (major) and body (minor) fonts. Use accent 1 and 2 (or the school's named brand colours) for `color.primary` and `color.secondary` in the style file, and check them against the school's guidance when it exists. A theme can name a font that is not installed on this computer: say so.
