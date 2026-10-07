# M6 Career in the Netherlands

**Goal:** Alterbrain knows what jobs the user wants, where, in which languages, and whether they need visa sponsorship, so `/jobs` can search and filter well.
**Time:** about 10 minutes. **Optional.**
**Model / effort:** sonnet / medium. Reading a CV: sonnet / medium.

Say at the start: "Let's set up your job search. I'll ask what you want, where, and a couple of practical things like language and visa. About 10 minutes."

## Inference sources

- `vault/80_me/USER.md` (goals), `vault/80_me/fact-sheet.md` (languages, past roles, visa note if any).
- The CV source note from M2 (`vault/40_sources/notes/`).
- `config/brain.json` `jobs` block and existing `vault/20_areas/career/career.md`.
- Never ask again what these already say. Confirm instead.

## Questions (one at a time)

1. **Kind of role.** "What kinds of roles are you aiming for?" Offer 3 guesses from the CV and goals (for example "Strategy consulting", "Product management", "Corporate finance") plus "Something else". Multi-select is fine.
2. **Level and type.** AskUserQuestion: Full-time job after the MBA (recommended if final year) / Internship / Both.
3. **Industries or companies.** Free text: "Any industries or companies you'd love, or want to avoid?"
4. **Where.** "Which cities or regions?" Default: "Randstad (Amsterdam, Rotterdam, The Hague, Utrecht)" (recommended) / Anywhere in the Netherlands / Also abroad (free text).
5. **Languages for work.** Confirm from the fact sheet. Then: "How good is your Dutch?" AskUserQuestion: None or basic (A1–A2) / Working (B1–B2) / Fluent (C1–C2). Explain once: "Many Dutch job ads need Dutch. I'll flag those for you."
6. **Visa.** "Will you need an employer to sponsor your work permit?" AskUserQuestion: No, I'm free to work here (for example an EU citizen) / Yes, I'll need sponsorship / Not sure (recommended if they hesitate).
   - Explain in one line: "If you need sponsorship, I'll check each employer against the official list of recognised sponsors (the IND register)."
   - Never give legal advice. If "Not sure", add a task `Check whether you need visa sponsorship to work in NL (ask your school's career centre)` (`--tag onboard --priority medium`).
   - This answer is private by default. Offer to add it to the fact sheet as visibility `private`; it never goes into a CV or message without the user's OK for that draft.
7. **Salary (optional).** "Do you have a salary range in mind? You can skip this." Store only if given. Do not quote salary thresholds from memory; `/jobs` reads verified figures from the wiki.
8. **CV.** If a CV was ingested in M2, confirm it is the latest. Otherwise ask for the file and run `node system/scripts/ingest.mjs "<path>" --kind pdf --origin "CV (career setup)"`.

## Confirm, then write

Show a 5-line summary (roles, level, where, languages incl. Dutch level, sponsorship). Ask "Save?" (Save (recommended) / Change something). Then:

- `vault/20_areas/career/career.md`:
  ```yaml
  ---
  type: "career"
  created: "YYYY-MM-DD"
  status: "active"
  ---
  ```
  Body sections: **Targets** (roles, level, industries, companies to aim for / avoid), **Where**, **Languages** (each with level), **Work permit** (needs sponsorship: yes / no / not sure), **Salary** (only if given), **CV** (link to the CV source note `[[…]]`), **Notes**.
- `config/brain.json` `jobs`: `country: "NL"`, `needs_sponsorship` (`true`, `false` or `null` for not sure), `languages` (ISO codes the user can work in, Dutch only at B1 or above), `sources` (keep the default unless the user objects). Edit only the `jobs` block.
- `vault/80_me/fact-sheet.md`: add new confirmed facts (Dutch level, target role). Work-permit status only if the user agreed, as `private`.
- Copy the CV into `vault/20_areas/career/cv/` only if the user asks; otherwise link to the source note.

## Files written

- `vault/20_areas/career/career.md`
- `config/brain.json` (`jobs` block)
- `vault/80_me/fact-sheet.md` (new rows only)
- Raw CV copy via `ingest.mjs` (if new)

## Done criteria

- career.md has targets, where, languages with levels and the sponsorship answer.
- `config/brain.json` `jobs.needs_sponsorship` is `true`, `false` or `null`, and `jobs.languages` is set.

Then: `node system/scripts/onboard-progress.mjs done M6`. Suggest a first try: "Say `/jobs scan` to see roles that fit."
