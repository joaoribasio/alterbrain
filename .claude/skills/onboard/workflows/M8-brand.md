# M8 Look of your documents

**Goal:** reports, CVs, cover letters and slides use the user's chosen fonts and colours, via one style file.
**Time:** about 5 minutes. **Optional.**
**Model / effort:** sonnet / medium. Reading a template: sonnet / medium.

Say at the start: "Let's choose how your documents look: colours, fonts and an optional logo. You can change it later in one file."

## Inference sources

- `vault/80_me/brand/_brand.yml` (already set up?).
- `system/templates/brand/_brand.yml` (the starting point; plain comments explain each line).
- A template from the user's school, employer or provider (Word `.docx`, PowerPoint `.pptx` or a PDF) if they have one.
- The school, employer or provider named in `USER.md` or in the programme note (`vault/20_areas/programmes/*.md`), to suggest "use their colours".

## Questions (one at a time)

1. **Starting point.** AskUserQuestion: "How should your documents look?"
   - Clean and neutral: navy and teal, modern fonts (recommended)
   - Match my school's, employer's or provider's template (I have a file)
   - I'll pick my own colours and fonts
2. **Template (if chosen).** "Give me the template file." Ingest it first: `node system/scripts/ingest.mjs "<path>" --kind doc --origin "Template from my school, employer or provider"` (`--kind slides` for PowerPoint). Read it and pull out the main colours (hex codes), heading and body fonts, and whether there is a logo.
   - Say: "Check their rules before using their logo on personal documents." If the user wants the logo, ask them to save the image into `vault/80_me/brand/` themselves, or copy it there from the file they named.
   - For Word output, also copy the `.docx` to `vault/80_me/brand/reference.docx` (Quarto uses it as the Word style). Do this with a copy command, never by retyping.
3. **Own choice (if chosen).** Ask for: a main colour, an accent colour (a hex code like `#1F3A5F`, or a plain name like "dark green"; you turn names into hex), a body font and a heading font. Suggest free Google Fonts (for example Source Sans 3, Inter, Lato, Merriweather) and say why in a few words.
4. **Logo (optional).** "Do you want a logo or monogram at the top?" No (recommended) / Yes, I have an image.

## Confirm, then write

Show the choices as a short list (main colour, accent, body font, heading font, logo). Ask "Save?" (Save (recommended) / Change something). Then:

- If `vault/80_me/brand/_brand.yml` does not exist, copy `system/templates/brand/_brand.yml` there first.
- Edit only the values: `meta.name` (the user's name), `color.palette` (give each colour a plain name), `color.primary`, `color.secondary`, `typography.fonts`, `typography.base.family`, `typography.headings.family`, and `logo` if given. Keep the explanatory comments.
- Check: every colour is a 6-digit hex code, and every font named in `base` or `headings` is listed under `fonts`.
- If Quarto is installed (`quarto --version`), offer a one-page preview via `/render` so they can see it. Otherwise say the style will be used when Quarto is set up.

## Offer a template package

After the user has said yes to the look, offer once: "Do you want to save this as a template you can attach to a course or project?" Save as a template (recommended): "lets you attach it per course, programme or project, with page and upload limits." / Not now: "the style file above stays your default for everything, no extra steps." On a yes, follow the steps of `/template new` (`.claude/skills/template/SKILL.md`) using the files already ingested here. Without a template, `vault/80_me/brand/_brand.yml` keeps working as the default.

## Files written

- `vault/80_me/brand/_brand.yml`
- Optional: `vault/80_me/templates/<slug>/` (the template package)
- Optional: `vault/80_me/brand/reference.docx`, a logo image in `vault/80_me/brand/`
- Raw copy of any template via `ingest.mjs`

## Done criteria

- `_brand.yml` exists with valid hex colours and fonts that are listed.
- The user saw the summary (and, if possible, a preview) and said yes.

Then: `node system/scripts/onboard-progress.mjs done M8`.
