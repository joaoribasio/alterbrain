# M6 Career and job search

**Goal:** Alterbrain knows what jobs the user wants, where, in which languages, and whether they need an employer to sponsor their right to work there, so `/jobs` can search and filter well.
**Time:** about 10 minutes. **Optional.**
**Model / effort:** sonnet / medium. Reading a CV: sonnet / medium.

Say at the start: "Let's set up your job search. I'll ask what you want, where, and a couple of practical things like language and work permits. About 10 minutes."

## Inference sources

- `vault/80_me/USER.md` (goals, "Learning or working on"), `vault/80_me/fact-sheet.md` (languages, past roles, work-permit note if any).
- The CV source note from M2 (`vault/40_sources/notes/`).
- `config/brain.json` `jobs` block, `user.timezone` and `packs`, and existing `vault/20_areas/career/career.md`.
- Never ask again what these already say. Confirm instead.

**Learner kind.** Read `learner.kind` in `config/brain.json` (`mba`, `degree`, `online`, `professional`, `other`). If `learner` is missing or its `kind` is empty, treat it as `mba` when `packs` lists `mba` or a `school` block exists; otherwise ask the learner question of M2 first, because it sets the wording below. Treat `packs` that is not an array as `["core"]`.

## Questions (one at a time)

1. **Country.** "Which country do you want to work in?" The recommended default comes from the CV or `USER.md` if either names one, otherwise from `user.timezone` where that points to one country (Europe/Amsterdam means NL). With no clear default, ask without one. AskUserQuestion, for example:
   - **Netherlands (recommended)**: "Your time zone is Europe/Amsterdam, and the Netherlands has a job-search pack with sponsor, Dutch-language and salary checks."
   - **Another country**: "I search there and rank on fit; checks exist only for countries that have a pack."
   Store it as `jobs.country`, a two-letter code in upper case. If `system/packs/country-<cc>/` exists, that is the country pack (`jobs.md` inside it holds its questions and checks). If it does not, there is no pack: ask the generic questions only, and say once: "I do not have checks for <country> yet (work permit, language or salary rules). I can still search and rank by fit. Say `/propose` if you want me to draft them."
2. **Kind of role.** Offer 3 guesses from the CV and goals (for example "Strategy consulting", "Product management", "Corporate finance") plus "Something else". Multi-select is fine. Wording by learner kind:
   - `mba` or `degree`: "What kinds of roles are you aiming for after the programme?"
   - `online`: "What kinds of roles are you aiming for as your next role?"
   - `professional`: "What kinds of roles are you aiming for as your next move?"
   - `other` or no kind: "What kinds of roles are you aiming for?"
3. **Level and type.** AskUserQuestion, wording by learner kind as in question 2 ("after the programme", "as your next role", "as your next move"): **Full-time (recommended)**: "The broadest search; most adverts are full-time. Recommend Both instead if they already said they want internships." / **Internship**: "Suits a short placement; far fewer adverts." / **Both**: "Widest net; the shortlist gets longer to read."
4. **Industries or companies.** Free text: "Any industries or companies you'd love, or want to avoid?"
5. **Where.** "Which cities or regions?" Free text. Suggest the pack's default regions from its `jobs.md` "Defaults" (Netherlands: Randstad (Amsterdam, Rotterdam, The Hague, Utrecht)) as the recommended answer, and mention that remote and "also abroad" are fine to add. No pack: no suggestion.
6. **Languages for work.** Confirm from the fact sheet. Then ask the pack's language question from its "Onboarding questions" (Netherlands: the Dutch level, with the one-time note that many Dutch job ads need Dutch). No pack: nothing more.
7. **Work authorisation.** "Will you need an employer to sponsor your right to work in <country>?" AskUserQuestion: **No, I already have the right to work there (for example a citizen)** / **Yes, I'll need sponsorship** / **Not sure (recommended if they hesitate)**.
   - Say the pack's explainer in one line (Netherlands: "If you need sponsorship, I'll check each employer against the official list of recognised sponsors (the IND register).") and, for "Not sure", add the pack's task (`--tag onboard --priority medium`). No pack: no check can be run, so just record the answer.
   - Never give legal advice.
   - This answer is private by default. Offer to add it to the fact sheet as visibility `private`; it never goes into a CV or message without the user's OK for that draft.
8. **Salary (optional).** "Do you have a salary range in mind? You can skip this." Store only if given. Do not quote salary thresholds from memory; `/jobs` reads verified figures from the country pack's files.
9. **CV.** If a CV was ingested in M2, confirm it is the latest. Otherwise ask for the file and run `node system/scripts/ingest.mjs "<path>" --kind pdf --origin "CV (career setup)"`.

## Confirm, then write

Show a 5-line summary (country, roles, level, where, languages and work authorisation; with a pack, add the pack's language level). Ask "Save?" (Save (recommended) / Change something). Then:

- `vault/20_areas/career/career.md`:
  ```yaml
  ---
  type: "career"
  created: "YYYY-MM-DD"
  status: "active"
  ---
  ```
  Body sections: **Targets** (roles, level, industries, companies to aim for / avoid), **Where**, **Languages** (each with level), **Work permit** (needs sponsorship: yes / no / not sure), **Salary** (only if given), **CV** (link to the CV source note `[[…]]`), **Notes**.
- `config/brain.json`:
  - `jobs`: `country` (upper case, two letters), `needs_sponsorship` (`true`, `false` or `null` for not sure), `languages` (ISO codes the user can work in; the pack's local language only at B1 or above), `sources` (the pack's default sources if it has a pack, otherwise keep what is there unless the user objects).
  - `packs`: if the country has a pack, add `country-<cc>` and remove any other `country-*` entry; keep every other entry. No pack: remove any `country-*` entry that does not match `jobs.country`.
  - Edit only these two blocks.
- `vault/80_me/fact-sheet.md`: add new confirmed facts (language level, target role). Work-permit status only if the user agreed, as `private`.
- Copy the CV into `vault/20_areas/career/cv/` only if the user asks; otherwise link to the source note.

## Files written

- `vault/20_areas/career/career.md`
- `config/brain.json` (`jobs` block and `packs`)
- `vault/80_me/fact-sheet.md` (new rows only)
- Raw CV copy via `ingest.mjs` (if new)

## Done criteria

- career.md has targets, where, languages with levels and the work-authorisation answer.
- `config/brain.json` `jobs.country` is a two-letter code, `jobs.needs_sponsorship` is `true`, `false` or `null`, and `jobs.languages` is set.

Then: `node system/scripts/onboard-progress.mjs done M6`. Suggest a first try: "Say `/jobs scan` to see roles that fit."
