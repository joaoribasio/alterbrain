# 0025. Template engine: a template is a folder, resolved from the most specific level

Status: accepted (2026-10-08, product owner)

## Context
Until 0.2.0 Alterbrain had four built-in Quarto templates (report, deck, letter, CV) and one personal look: the brand folder `vault/80_me/brand/`. That fits a person who has one style. It does not fit a learner or worker whose school, employer or course prescribes its own: a business school's report format with its cover page, a company's PowerPoint master, a course that wants APA 7 and a 10 MB upload limit. Those rules lived in the user's head, in the assignment brief, or in a Word file that Claude could not use.

The same gap shows at the end of a job. A deliverable can pass every check Alterbrain has and still be wrong because the school's cover page, file-name rule or upload limit was never applied. The rules exist; there was nowhere to put them.

## Decision
- **A template is a folder with a `template.yml`.** Fields: `name`, `slug`, `kind` (`deck`, `report`, `memo`, `letter`, `cv`, `essay`, `workbook`, `one-pager`), `style` (`reading-deck`, `presenting-deck`, `report`, `memo`), `base` (the built-in layout it builds on), `format` and `outputs`, `brand`, `reference_doc` (a `.pptx` or `.docx`), `quarto_extension`, `csl`, `max_upload_mb`, `page_limit`, `font_size_pt`, `fonts`, `house_rules` (a plain-language list), an optional `structure` skeleton and `source` (`built-in`, `school`, `employer`, `provider`, `custom`). The file is flat YAML so a zero-dependency parser reads it.
- **Two places.** Built-in templates are `system/quarto/templates/<name>/` and each gets a `template.yml`. The user's are `vault/80_me/templates/<slug>/`, which is user data and private.
- **Most specific wins.** A deliverable, then a project or assignment, then a course, then a programme, then the user's default for that kind (`templates.defaults` in `config/brain.json`), then the built-in. Notes carry a `templates` list of slugs. A `report` template also serves `memo`, `essay` and `one-pager`; an exact-kind template wins at the same level.
- **Silent unless it matters.** `/render` resolves the template itself and says in one line which one it used. It asks only when two candidates of the kind tie at the same level, or when the user asks.
- **A resolver and a script, no framework.** `system/lib/templates.mjs` holds the logic and `system/scripts/template.mjs` has `list`, `show`, `resolve`, `check` and `inspect`. `render.mjs` takes `--template`, `--reference-doc` and `--csl`; it does not call the resolver, so the skill stays in control of what is said to the user.
- **A `/template` skill** makes a template from a file the user gives: `.pptx`, `.potx`, `.docx`, `.dotx`, or an existing Quarto extension folder (a school report extension). It reads colours and fonts from the OOXML theme with `system/lib/ooxml.mjs` (unpacked with the computer's own `tar`, as `ingest.mjs` does), checks the PowerPoint layout names against the seven Quarto needs (from Quarto's own documentation, checked 2026-10-08), renders a sample and looks at every page. It also lists, attaches, previews and removes.
- **The style preset sets the house rules.** `reading-deck` means self-explanatory slides with an "In brief" box, sources, footnotes and a tracker. `presenting-deck` means minimal text with the content in the speaker notes. A template's `house_rules` add to the preset and a rubric overrides both.
- **Citation style and upload limit** can be set on a template or a programme (`csl`, `max_upload_mb`); the template wins, then the programme.
- **The personal brand stays.** `vault/80_me/brand/` remains the user default look for anything without a template (a documented fallback, SPEC §15a.5). Guided migration 0006 offers to package it as templates and never changes the brand folder.
- **School artwork never goes into the framework.** A school's logo, a master slide or a branded Word file is the user's own file in the user's own vault.

## Consequences
- School and employer rules reach every deliverable once, instead of being retyped per assignment, and the delivery gate (ADR 0026) has something concrete to check against.
- A new user-data shape (`vault/80_me/templates/`, `templates.defaults`, `templates`, `tone`, `max_upload_mb` and `csl` keys on notes) ships with documented fallbacks and a tested resolver instead of a script, because every key is optional and an absent key means "use the built-in".
- A template that comes from a Word or PowerPoint file is only as good as the file's layout names and styles. `template.mjs inspect` says what is missing; it cannot repair a master. [Unverified] The Word reference-document style names are not listed on Quarto's page, so none are checked for `.docx`.
- Rendering a school's own Quarto extension depends on that extension working with the installed Quarto. It was tested with the resolver, not with a real school extension.
- The user needs to give a template once. People with no template see nothing new.

## Alternatives considered
- **Extend the brand file with more keys.** One file with colours and fonts would grow into a template by accident, with no folder for a reference document or a citation style and no way to attach a different one to each course. Rejected: a brand is a look; a template is a look plus rules.
- **Store the rules in the course note only.** Easy to read, and each course would repeat what its programme already says, with no place for a Word reference document. Rejected for the files; kept for the facts (`max_upload_mb` and `csl` on a programme).
- **A database or registry of templates.** Heavy, and nothing else in Alterbrain needs one. A folder per template is something the user can see, copy and delete in Obsidian.
- **Ask which template to use at every render.** Safe and tiresome. Rejected: most of the time exactly one candidate applies, so it is used and named in one line.
- **Ship school templates.** It would put school artwork in the framework and go out of date each term. Rejected.
