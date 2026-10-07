# M2 You and your facts

**Goal:** a short profile of the user (`USER.md`) and a list of confirmed facts that drafts may use (`fact-sheet.md`).
**Time:** about 5 minutes (less with a CV). **Essential.**
**Model / effort:** sonnet / medium. Pulling fields from a long CV or LinkedIn export: sonnet / medium in the main thread.

Say at the start: "Step 3 of 5: a few facts about you, so my drafts never make things up. A CV makes this much faster."

## Why a fact sheet (say this in one or two lines)

"I only use facts about you that are on your fact sheet. If something is missing, I ask or leave a gap. This stops me inventing a job title or a grade in a cover letter."

## Inference sources (ask for them first)

1. Ask: "Do you have a CV or a LinkedIn profile PDF on this computer? I can read it and fill most of this in." AskUserQuestion: Yes, here's the file (recommended) / I'll paste a few lines / No, just ask me.
   - **LinkedIn PDF tip:** "On LinkedIn, open your profile → **More** → **Save to PDF**."
   - The user gives a path (or drags the file into the chat). Read it with the Read tool.
2. Keep a raw copy with a source record: `node system/scripts/ingest.mjs "<path>" --kind pdf --origin "Shared during onboarding (CV)"`. Say: "I've saved a copy in your private sources, so every fact can point to it."
3. Also use: what they said in M1, `config/brain.json` (`user.name`, `timezone`, `languages`).

## Questions (one at a time, only for gaps)

Prefill from the CV, then confirm in one go: "From your CV I have: … Is all of that right?" Ask only what is still missing:

1. **Name** as it should appear on documents, and what to call the user in chat. Suggest the first name from the CV ("Shall I call you Alex?"). If `vault/80_me/IDENTITY.md` still has no **I call you**, fill it with the confirmed answer.
2. **Programme and school** (short; M3 asks for details).
3. **City and time zone.** Default `Europe/Amsterdam` if they live in the Netherlands (recommended).
4. **Languages and levels.** "Which languages do you speak, and how well?" Explain levels in one line if needed: "A1–A2 = basic, B1–B2 = working, C1–C2 = fluent."
5. **Background in one line** (previous roles or field).
6. **Goals this year** (free text, 2–4 lines). Example: "Land a strategy internship in the Netherlands by March."
7. **Visibility check.** For anything sensitive (visa status, age, nationality, health, salary): "Should this be public (fine on a CV) or private (only when you ask)?" Default: private (recommended).
8. **Never say (optional).** "Anything I must never mention? For example a previous start-up or a gap year."
9. **How I write to you (optional).** "Anything I should never do when I write to you? For example long intros or too many bullet points." One line each under **How to work with me** in `USER.md`, in the form `- Never use long intros. (since YYYY-MM-DD)`. "Nothing" is fine.

## Confirm, then write

Show the fact list as a short table (Fact | Exact wording | Visibility | Source). Ask: "Save these facts?" Save (recommended) / Change something. Write only confirmed rows.

- `vault/80_me/USER.md`
  - Fill **Profile**, **Goals this year**, **Current focus** (leave for M3 if unknown).
  - Keep it under 4,000 characters. Check: `node system/scripts/check-json.mjs --length vault/80_me/USER.md` (prints the number of characters). If over, move detail to `fact-sheet.md`.
  - Only write what the user confirmed. No guesses.
- `vault/80_me/fact-sheet.md`
  - Add one row per confirmed fact, directly under the table header (no blank line). Format: `| Fact | Exact wording | public/private | Source | YYYY-MM-DD |`.
  - Source: `[[<source note name>]]` for the CV (use the name `ingest.mjs` reported), or `you told me`.
  - Add any "never say" items as bullets under **Never say**.
  - Leave the synthetic example comment block untouched.
- `config/brain.json`: set `user.name`, `user.timezone`, `user.languages` (ISO codes such as `en`, `nl`, `es`). Edit only those keys.

## Files written

- `vault/80_me/USER.md`, `vault/80_me/fact-sheet.md`, `config/brain.json` (`user` block).
- Raw CV/LinkedIn copy via `ingest.mjs` (in `vault/40_sources/`).

## Done criteria

- USER.md has a name, programme, city, languages, background and at least one goal; it is under 4,000 characters.
- fact-sheet.md has at least 5 confirmed facts, each with visibility, source and date.
- `config/brain.json` `user` block is filled.

Then: `node system/scripts/onboard-progress.mjs done M2`.
