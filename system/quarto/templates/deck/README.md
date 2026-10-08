# Slide deck template

Slides that run in any browser. 16:9, brand colours, a numbered footer, speaker notes. The result is one HTML file that works offline and can be emailed.

The example is a made-up case discussion by Alex Doe, an MBA student in Rotterdam.

## How to use

Ask Alterbrain: "make a 5-slide deck from this note". The `/render` skill drafts `deck.qmd`, shows you the outline, then makes the file.

By hand:

```
node system/quarto/tools/render.mjs scaffold deck vault/10_projects/my-presentation
node system/quarto/tools/render.mjs vault/10_projects/my-presentation/deck.qmd --type deck --pdf
```

You get `deck.html` (open it in a browser, press `F` for full screen, `S` for speaker notes, `O` for an overview of all slides) and, with `--pdf`, `deck.pdf`.

## PDF and PowerPoint

- **PDF.** `--pdf` prints the deck with Microsoft Edge or Google Chrome, which are already on most computers. Each slide becomes one page. If you have neither, open the HTML file in a browser, add `?print-pdf` to the end of the address, press `Ctrl+P` and choose "Save as PDF".
- **PowerPoint.** `--format pptx` makes a `.pptx` file. It has a plain look: PowerPoint files do not use the brand colours. Use it when someone insists on PowerPoint.

## Writing slides

- A `##` heading starts a slide. The heading is the slide title. Make it a sentence that states the point ("Leasing first keeps the choice open"), not a label ("Options").
- A `#` heading makes a section divider.
- `::: {.box}` ... `:::` makes a highlighted box. Good for the one line you want remembered.
- `::: {.big-number}` ... `:::` prints a number very large. Follow it with a short label.
- `::: {.source}` ... `:::` puts a small source line at the bottom of the slide.
- `:::: {.columns}` with `::: {.column width="50%"}` blocks makes columns.
- `::: {.notes}` ... `:::` holds speaker notes. They never show on the slide.

Rules of thumb: one idea per slide, at most six lines, no slide without a point.

## Look

The colours and fonts come from your brand file (`vault/80_me/brand/_brand.yml`); without one the default navy and Arial are used. The shape of the slides (sizes, spacing, boxes) is in `_extensions/alterbrain-deck/alterbrain.scss`.

## Changing the format options

Add them under `format: alterbrain-deck-revealjs:` in the front matter. Common ones: `transition: fade`, `slide-number: false`, `footer: "Your text"`, `incremental: true` (bullets appear one by one), `logo: path/to/logo.png`.

## Template description

`template.yml` in this folder describes the built-in deck template: its style, limits and house rules. Your own templates (for example from your school) go in `vault/80_me/templates/`, and are made with `/template`. When one is attached to a course, project or document, it is used instead of this one.
