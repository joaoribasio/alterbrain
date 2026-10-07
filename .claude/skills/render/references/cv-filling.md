# Filling the CV data from the vault

The CV is the most checked document a person sends. Every line must be true and the user must have seen it. Fill `cv-data.yml` (in `vault/20_areas/career/cv/`) from these places, in this order of trust:

| Field | Take it from | If it is missing |
|---|---|---|
| name, town | `vault/80_me/USER.md` | Ask |
| contact lines | `USER.md`, or `fact-sheet.md` | Ask. Never copy an address from an email thread |
| `position` (line under the name) | The target role in `vault/20_areas/career/career.md`, or the application note | Ask which role this CV is for |
| `summary` | Write it from facts below. Two or three sentences | Leave it out rather than pad |
| `work`, `education`, `awards` | `fact-sheet.md`, then notes in `career/` | Ask. Do not guess dates or titles |
| `projects` | `career/` notes, or course notes the user marks as theirs | Leave out |
| `skills`, `languages` | `USER.md` and `fact-sheet.md`. Use the level words the user used | Ask |

If the user pastes an old CV, ingest it first (`/ingest`) and use the source note. The source note is evidence; the fact sheet is what the user has approved. When they disagree, ask.

## Rules

1. **No invention.** No made-up numbers, tools, employers, titles or dates. A bullet with a number needs the number in a source file or in the user's words this session.
2. **Tailor by choosing, not by inventing.** For a specific role, put the most relevant true entries first and cut the least relevant. Do not add skills the job asks for unless the user has them.
3. **Bullets:** start with a verb, one idea each, end with a result. Three to five per role. Past tense for past roles.
4. **Keep it short.** Two pages at most for the designed CV; one to two for the plain one. Older or less relevant roles get fewer bullets.
5. **Dates are text.** Use one style throughout: `"2021 - 2026"`, `"Sep 2025 - present"`.
6. **Plain text only.** No markdown, no emoji, no tables. Avoid `*`, backticks, `~`, `<` and `>`: Quarto reads them as formatting and they vanish. `$ # @ & _ %` are fine.
7. **Language.** Write in the language of the job advert. For a Dutch CV, ask the user for the headings they want; do not translate facts, only labels.
8. **Things that vary by country** (photo, date of birth, marital status, a "personal details" line): do not add them unless the user asks. They are private facts, so they also need the user's OK for this CV (they go to strangers). If they ask whether to include them, say you are not sure of local norms, and suggest they ask their career service.

## ATS-plain CV (applicant tracking systems)

- Use the same data. The layout does the rest: one column, no icons, no tables, standard headings.
- Keep headings standard: Profile, Experience, Education, Skills. Do not rename them to something creative.
- Put the job title and employer in the text, not only in the layout.
- Do not put the key content in a header or footer, an image or a text box.
- Spell out abbreviations once, for example "applicant tracking system (ATS)".

## Check before you hand over

Re-read the finished `cv-data.yml` against `fact-sheet.md`:

- Does every employer, title and date match?
- Is every number traceable to a file or to the user's words?
- Is anything in the CV that is not in the fact sheet? Either the user confirms it now and you add it to the fact sheet (with their say-so), or it comes out.

Then tell the user what you used and what you left out, in two or three lines.
