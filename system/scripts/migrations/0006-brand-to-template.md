---
type: "guided-migration"
id: "0006-brand-to-template"
summary: "If you set up a personal style for your documents, offers to turn it into a template you can attach to courses and projects."
since: "0.2.0"
---
# Turn your document style into a template

## Who this is for

Anyone who has a personal style file for their documents, `vault/80_me/brand/_brand.yml` (colours, fonts, an optional logo, an optional Word or PowerPoint style file). If there is no such file, nothing here applies: say "Nothing to do" and record it as done.

## Evaluate

Read only these, and change nothing:

- `vault/80_me/brand/_brand.yml` and the other files in `vault/80_me/brand/` (a logo, `reference.docx`, `reference.pptx`, a `fonts/` folder).
- `vault/80_me/templates/`: which folders exist, and whether `my-brand-*` folders are already there.
- `config/brain.json`: whether `templates.defaults` exists and which kinds already have a default.
- The current template procedure and fields: `.claude/skills/template/SKILL.md` and `.claude/skills/template/references/new-template.md`.

If the brand file is still the unchanged starting copy (compare with `system/templates/brand/_brand.yml`), say so: there is little to package, and "Skip it" is a fair answer.

## Propose

Say in plain words what you found (colours, fonts, whether there is a logo and a Word or PowerPoint style file) and what a template would give: the same look, but attachable to a course, a programme or a project, with page and upload limits and house rules. Your brand folder stays as it is and keeps working as the default for anything without a template.

Ask which kinds of document the look should become a template for: report (the report template also serves memos, essays and one-pagers, and the report default covers them too), deck, letter, CV. Recommend report and deck, plus a Word or PowerPoint style file only where the brand folder has one. Then ask with AskUserQuestion:

- **Do it now (recommended):** "Packages your current look as templates and makes them your default for those kinds. Takes about two minutes, and your brand folder is untouched." Con: "If you later edit the brand file, the template copies do not follow; you repeat this step."
- **Not now:** "Asks again next time you update." Con: "Until then, nothing changes, which is fine: the brand file still works."
- **Skip it:** "Never asks again; the brand file stays your default." Con: "You attach no template to a course or project unless you run `/template new` yourself."

## Apply

Only after a yes, and only for the kinds the user chose. For each kind, make one folder `vault/80_me/templates/my-brand-<kind>/` (for example `my-brand-report`, `my-brand-deck`):

- Copy `_brand.yml`, the logo and the matching style file (`reference.docx` for report, memo, essay, letter and one-pager; `reference.pptx` for deck) from the brand folder with a copy, never retyping. Leave the brand folder untouched.
- Write `template.yml` following the current fields in `new-template.md`: `slug` equal to the folder name, `kind`, `style` (`presenting-deck` for a deck, `report` otherwise), `base` for that kind, `brand: "_brand.yml"`, `reference_doc` only for a file that was copied (with `outputs: [pdf, docx]` for a Word file or `outputs: [html, pptx]` for a PowerPoint file, and `format` left empty, so the look stays the same and the style file is used when a Word or PowerPoint copy is asked for), `source: "custom"`, empty `house_rules`, and no limits the user did not give.
- Check it: `node system/scripts/template.mjs check vault/80_me/templates/my-brand-<kind>`. Fix what it names.
- Set `templates.defaults.<kind>` in `config/brain.json` to the new slug, only for kinds that have no default yet. Change nothing else in that file. If the file cannot be read, stop and say so.

If a `my-brand-<kind>` folder already exists, leave it alone and say so.

Then record it: `node system/scripts/update.mjs guided done 0006-brand-to-template`.

## If skipped

The brand folder stays your default look, exactly as today; no template is created. For "Skip it", record it with `node system/scripts/update.mjs guided skip 0006-brand-to-template`. For "Not now", record nothing. To run it later, say "run the pending upgrades", or "turn my document style into a template".

## Never

- Never delete, move or edit anything in `vault/80_me/brand/`.
- Never overwrite an existing template folder or an existing `templates.defaults` entry.
- Never copy a school or employer logo anywhere the user has not already put it.
- Never touch `vault/40_sources/raw/`, `.env.local`, settings files, `my-*` skills or framework files.
- Never write anything outside `vault/80_me/templates/` and the `templates` key of `config/brain.json`, apart from recording the outcome through `update.mjs`.
