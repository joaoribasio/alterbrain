# Report, memo and assignment template

A clean A4 document for case reports, memos and course assignments. Eleven-point text, numbered sections, a title block, an optional summary box, source notes under figures and tables, and a reference list in APA 7 style.

The example is a made-up case memo by Alex Doe, an MBA student in Rotterdam.

## How to use

Ask Alterbrain, or use the assignment studio (`/assignment`). It writes `report.qmd` in the assignment folder, and `/render` makes the PDF and checks the page limit. Draft PDFs go to `_out/`; the final one, made by `/assignment ship`, goes to `releases/`.

By hand:

```
node system/quarto/tools/render.mjs scaffold report vault/10_projects/2026-my-course-my-assignment
node system/quarto/tools/render.mjs vault/10_projects/2026-my-course-my-assignment/report.qmd --type report --max-pages 6
```

You can also write the report as an ordinary Obsidian note ending in `.md`. Then `/render` first converts the note (wikilinks become plain text, callouts become boxes) and makes the PDF from that. Your note is never changed.

## The page rules

Set these in the front matter, under `format: alterbrain-report-typst:`. They match the brief you were given.

```yaml
format:
  alterbrain-report-typst:
    fontsize: 11pt
    line-spacing: 1.15
    margin:
      x: 2.5cm
      y: 2.5cm
```

| Option | Default | What it does |
|---|---|---|
| `fontsize` | `11pt` | Size of the main text |
| `line-spacing` | `1.15` | Line spacing as a multiple, like Word (1.0, 1.15, 1.5, 2.0) |
| `margin` | `x: 2.5cm, y: 2.5cm` | Left and right (`x`), top and bottom (`y`). You can also set `top`, `bottom`, `left`, `right` |
| `paragraph-spacing` | `0.9em` | Gap between paragraphs |
| `first-line-indent` | none | For example `1.5em` to indent each paragraph, as in an essay |
| `left-aligned` | off | `true` for a ragged right edge instead of justified text |
| `papersize` | `a4` | `us-letter` if you must |
| `section-numbering` | `"1.1"` | Set to `""` (two quote marks) for no numbers |
| `toc` | off | `true` for a table of contents |
| `lang` | `en` | `nl` for Dutch (hyphenation and labels) |

Check the length after every change: `--max-pages 6` tells you how many pages are used.

## What you can write

- **Title block.** `title`, `subtitle`, `author` (a list of `- name: "..."`), `course`, `programme`, `date` come from the front matter. `date: today` fills in the day you make the PDF.
- **Sections.** Start at `##`. The title is the front matter, so `#` is not used. Numbers are automatic. Add `{-}` to leave a heading unnumbered, as in `## Summary {-}`.
- **Summary box.** Put the summary between `::: {.box}` and `:::`. Add a title with `::: {.box title="Summary"}`.
- **Source notes.** A paragraph that is entirely in italics becomes a small grey note, for example `*Source: company annual report, 2025.*`. Put it directly under the figure or table.
- **Figures.** `![Caption.](images/chart.png){#fig-sales}`. Refer to it as `@fig-sales`, which prints "Figure 1".
- **Tables.** Write a Markdown table, then a line `: Caption {#tbl-options}` under it. Refer to it as `@tbl-options`. The caption sits above the table, as is usual.
- **Section references.** Label a heading `{#sec-situation}` and write `@sec-situation`, which prints "Section 1".
- **Citations.** `@porter1985` prints "Porter (1985)". `[@porter1985]` prints "(Porter, 1985)". `[@porter1985, p. 12]` adds a page. The keys come from `references.bib`.
- **Reference list.** It prints itself at the end. Do not write a References heading. To change its title, set `reference-section-title: "Referenties"`.
- **Page break.** Write `{{< pagebreak >}}` on a line of its own.
- **Dollar signs.** Write `\$98m` with a backslash. Otherwise two dollar signs can turn the text between them into a formula.

In Obsidian, labels such as `{#fig-sales}` show as plain text. That is expected.

## References

The `references.bib` file holds your sources. One entry looks like this:

```
@book{porter1985,
  author = {Porter, Michael E.},
  title = {{Competitive Advantage}},
  publisher = {Free Press},
  year = {1985}
}
```

Double curly brackets around a title keep its capital letters. Alterbrain adds sources to this file when it reads papers for you, and each one comes from a real file in your vault, never from memory.

The style is APA 7th edition. The style file, `apa.csl`, is copied from the Citation Style Language project (CC BY-SA 3.0). See `../../NOTICE.md`.

## Brand

Colours and fonts come from `vault/80_me/brand/_brand.yml`. The main colour is used for headings, the title rule, the summary box and table headers. Without a brand file the default navy and Arial are used.

## Keeping to a page limit

1. Render with `--max-pages <limit>`.
2. If you are over, cut words first. Then shrink figures. Change spacing and margins only if the brief allows it. Never change the font size if the brief sets it.
3. Ask your course whether the title block, references and appendices count. The tool counts every page of the PDF.
4. Check that your brand font is installed (`node system/quarto/tools/fonts.mjs`). A substitute font changes the length.

## Template description

`template.yml` in this folder describes the built-in report template: its style, limits and house rules. Your own templates (for example from your school) go in `vault/80_me/templates/`, and are made with `/template`. When one is attached to a course, project or document, it is used instead of this one.
