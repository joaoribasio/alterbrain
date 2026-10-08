# Clarify checklist: application

**Use for:** a job or internship application (`/jobs apply`): tailored CV, cover letter, form answers. Nothing is ever submitted for the user.

## Infer first

- The job ad (saved via `ingest.mjs` or fetched by `/jobs`), and the application note in `vault/20_areas/career/applications/` if it exists.
- `vault/20_areas/career/career.md` (targets, languages, work-authorisation need).
- `vault/80_me/fact-sheet.md` (the only facts allowed), the latest CV source note.
- `vault/80_me/voice/<lang>/profile.md` (voice in the ad's language).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "Which role are you applying for?" | from the ad |
| Inputs | "Use your latest CV and fact sheet?" | yes |
| Output | "What do you need: CV, cover letter, form answers?" | tailored CV + cover letter, PDF |
| Audience | "Who reads it: recruiter, hiring manager, both?" | recruiter first |
| Constraints | "Length, language, anything to leave out?" | 1-page letter, in the ad's language |
| Deadline | "When does the application close?" | from the ad; ask if missing |
| Success test | "What should a recruiter take away in 10 seconds?" | three strongest matches between you and the ad, each backed by a fact |

## Type-specific (required)

- **Company and role** exactly as in the ad, with `source_url`.
- **Language of the application.** Default: the ad's language. If the ad asks for a language level above what the fact sheet shows (a language requirement above your level), flag it and ask.
- **Work authorisation.** If `jobs.needs_sponsorship` is true, run the country pack's checks via `/jobs` before investing time (in the Netherlands: the employer against the IND sponsor register). Never state work-authorisation status in the letter unless the user asks.
- **Top three selling points**, each mapped to a fact-sheet row. Missing facts become `[FACT NEEDED: …]`, never invented.
- **Contact person** (if named in the ad): business details only.
- **How it gets sent.** Always by the user. Draft goes to `vault/00_inbox/outbox/` with a `#ab/jobs` task.

## Ready when

- Role, company, deadline and language are fixed.
- Every selling point maps to a fact on the fact sheet.
- The country pack's checks are done (when the country has a pack and they apply).

## Where the brief goes

The application note `vault/20_areas/career/applications/<Company> <Role>.md` (`type: "application"`, `stage: "preparing"`): add `## Agreed brief`. Create the note from `system/templates/notes/application.md` if it doesn't exist.
