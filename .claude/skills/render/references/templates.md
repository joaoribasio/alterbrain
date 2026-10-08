# Template field reference

Starter files live in `system/quarto/templates/<template>/`. Copy them with `render.mjs scaffold`; do not edit the originals. Fuller user-facing guides are in each template's `README.md`.

## cv and cv-ats (shared data file `cv-data.yml`)

Two blocks, both values in double quotes, plain text only (no markdown). The characters `$ # @ & _ %` are fine.

```yaml
author:
  firstname: "Alex"
  lastname: "Doe"
  position: "MBA candidate | Operations and strategy"   # the line under the name
  address: "Rotterdam, the Netherlands"
  contacts:                                              # one line each; icon optional
    - icon: "fa envelope"        # also "fa phone", "fa brands linkedin", "fa brands github", or ""
      text: "alex.doe@example.com"
      url: "mailto:alex.doe@example.com"   # "" for no link
cv:
  summary: "Two or three sentences."                     # a plain string
  work | education | projects | skills | languages | awards:   # lists of entries
    - title: ""          # main line
      description: ""    # usually the organisation (skills: the list of skills)
      location: ""       # short, "Rotterdam, NL"
      date: ""           # text, "2021 - 2026"
      details: ["Bullet.", "Bullet."]
```

- Every `cv.<name>` list needs a matching `{{< cv <name> >}}` line in `cv.qmd` and `cv-ats.qmd`. A list with no matching line is not printed. A line with no matching list prints a warning and nothing else.
- Section headings in `cv.qmd` must be at least three letters (the designed layout colours the first three).
- Keep `location` short (about 15 characters) in the designed layout or it wraps.
- Format names: `awesomecv-typst` (designed) and `alterbrain-cv-ats-typst` (plain).

## letter

Everything above the second `---` is data:

```yaml
sender: {name, address: [lines], email, phone, link}
recipient: {name, role, company, address: [lines]}
place: "Rotterdam"
date: today                 # or a text date
date-format: "D MMMM YYYY"
subject: "Application: <role>"
reference: "optional"
salutation: "Dear Ms Example,"
closing: "Kind regards,"
signature: "Alex Doe"
enclosures: "CV"
lang: en                    # or nl
```

The body is the letter text only. No greeting and no sign-off in the body (they print from the data). About 300 words fits one page at 10.5 pt. Format: `alterbrain-letter-typst`.

## report

Front matter: `title`, `subtitle`, `author: [{name: ...}]`, `course`, `programme`, `date`, `bibliography: references.bib`, `lang`.

Page rules go under `format: alterbrain-report-typst:`:

| Key | Default | Note |
|---|---|---|
| `fontsize` | `11pt` | |
| `line-spacing` | `1.15` | Word-style multiple |
| `margin` | `x: 2.5cm`, `y: 2.5cm` | or `top`, `bottom`, `left`, `right` |
| `paragraph-spacing` | `0.9em` | |
| `first-line-indent` | none | `1.5em` for essay style |
| `left-aligned` | off | `true` for ragged right |
| `papersize` | `a4` | |
| `section-numbering` | `"1.1"` | `""` for none |
| `toc` | off | |
| `reference-section-title` | `References` | |

Body conventions:

- Sections start at `##`. Add `{-}` for an unnumbered heading. Label with `{#sec-name}`, refer with `@sec-name`.
- Summary box: `::: {.box}` ... `:::` (optional `title="..."`).
- A paragraph entirely in italics is a source note: `*Source: ...*`, directly under its figure or table.
- Figure: `![Caption.](path.png){#fig-name}`. Table caption: a line `: Caption {#tbl-name}` under the table.
- Citations: `@key` or `[@key, p. 3]`. Do not write a References heading; the list prints itself.
- Write `\$` for a dollar sign. Page break: `{{< pagebreak >}}`.
- APA 7 is built in (`apa.csl` inside the extension).

## deck

Front matter: `title`, `subtitle`, `author`, `date`. Options under `format: alterbrain-deck-revealjs:` (`footer`, `transition`, `slide-number`, `incremental`).

- `##` starts a slide; `#` starts a section divider.
- Classes: `.box`, `.big-number`, `.source`, `.columns` with `.column width="50%"`, `.notes` for speaker notes.
- `--pdf` prints the deck with Edge or Chrome. `--format pptx` makes a plain PowerPoint file (no brand).

## Brand

`vault/80_me/brand/_brand.yml` is used when it exists, else `system/quarto/brand/_brand.yml`. It needs `color.primary`. Only fonts installed on the computer work in PDFs (`node system/quarto/tools/fonts.mjs` checks).

## Templates (template.yml)

Every built-in template folder has a `template.yml`, and so does each template the user makes (`vault/80_me/templates/<slug>/`, see `/template`). `render.mjs --template <folder>` reads it and adds only what the document does not set itself: the brand file, the reference document (Word and PowerPoint output), the citation style and the Quarto extension. Which template applies is decided by `node system/scripts/template.mjs resolve --kind <kind> --for <source> --json`. Fields: `.claude/skills/template/references/new-template.md`.
