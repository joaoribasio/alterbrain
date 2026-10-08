# Building a template folder

A template is a folder. Yours go in `vault/80_me/templates/<slug>/`; the built-in ones are in `system/quarto/templates/<name>/`. The folder name and `slug` must be the same: lower-case letters, digits and hyphens.

## template.yml

Flat text, one key per line (lists use `- ` lines or `[a, b]`). Check it with `node system/scripts/template.mjs check <folder>`.

| Key | Meaning |
|---|---|
| `schema` | Always `1`. |
| `name` | A short name the user recognises ("RSM report"). |
| `slug` | The folder name. |
| `kind` | What it is for: `deck`, `report`, `memo`, `letter`, `cv`, `essay`, `workbook`, `one-pager`. |
| `style` | `reading-deck` (self-explanatory slides with an "In brief" box, sources, footnotes), `presenting-deck` (minimal text, the content in the speaker notes), `report` or `memo`. The deliverable can override it. |
| `base` | The built-in layout it builds on: `cv`, `cv-ats`, `letter`, `report`, `deck` or `none`. |
| `format` | The Quarto format the documents are made in. Empty = the base's (Typst PDF for a report, HTML for a deck). Set `pptx` or `docx` when the school's PowerPoint or Word file is the point of the template (a reference document is only used for Word or PowerPoint output). For a Quarto extension, set the format name the extension adds: read `_extensions/<ext>/_extension.yml` and use `<ext>-pdf`, `<ext>-html` or similar. An extension with an empty `format` is never used. |
| `outputs` | `pdf`, `docx`, `pptx`, `html`, `xlsx`. Keep it consistent with `format` and the reference document: list `docx` or `pptx` when a reference document is there (as the main format, or as a copy on request with `--format`). `check` prints a note when they disagree. |
| `brand` | A style file in the folder (colours and fonts), or empty. |
| `reference_doc` | A `.pptx` (deck) or `.docx` (document) in the folder whose styles Word or PowerPoint output copies, or empty. See `reference-docs.md`. |
| `quarto_extension` | The name of a folder under `<template>/_extensions/`, or empty. |
| `csl` | A citation style file in the folder, `apa`, or empty. |
| `max_upload_mb` | The upload limit as a number, or `null`. |
| `page_limit`, `font_size_pt` | Numbers, or `null`. |
| `fonts` | Font names the template needs. |
| `house_rules` | The template's rules as short plain sentences, one per line. The delivery gate and the structure review read them. |
| `structure` | Optional list of headings the document must have, in order. |
| `source` | `built-in`, `school`, `employer`, `provider` or `custom`. |

## House rules

Take them from the school's or employer's own guidance, in their words made plain ("Cover page with student number", "Maximum 12 slides"). If the user has none, write none: the style preset supplies sensible defaults. Where a template or rubric prescribes a structure, it wins over the general principles in `system/deliverables/principles.md`; say so in one line.

## Where it applies

The most specific level wins: deliverable, then project or assignment, then course, then programme, then the user's default for that kind in `config/brain.json` (`templates.defaults`), then the built-in. `node system/scripts/template.mjs resolve --kind <kind> --for <source> --json` shows what `/render` will use. A `report` template also serves memos, essays and one-pagers; a template of the exact kind wins at the same level. A note links its course as `[[Strategy]]` or as a path (`[[20_areas/courses/strategy/course]]`); both work, and `resolve` warns when a link matches no note.

Citation style: a template's `csl` is a file in its folder. A programme's `csl` is a file name or a bare style name (`chicago`); `resolve` returns the path when `chicago.csl` (or the name given) is in the attached template's folder, and a warning when it is not. `/render` passes the resolved `csl` itself.
