# Clarify checklist: job-search

**Use for:** a job scan (`/jobs scan`) when the request is vague ("find me jobs"). Light checklist: most answers already sit in `career.md`.

## Infer first

- `vault/20_areas/career/career.md` and `config/brain.json` `jobs` block (country, sponsorship, languages, sources).
- Recent applications in `vault/20_areas/career/applications/` (avoid repeats).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What kind of role this time?" | your targets in `career.md` |
| Inputs | "Which sources?" | the sources in `config/brain.json` |
| Output | "How many results, and where?" | top 10 in chat, the best 3 saved as `found` applications |
| Audience | just you | just you |
| Constraints | "Cities, level, languages, must sponsor visas?" | from `career.md` |
| Deadline | "Only jobs open for at least another week?" | yes |
| Success test | "What makes a result worth your time?" | fits role and city, no Dutch requirement above your level, sponsor check passed when needed |

## Type-specific

- **New filters this time** (industry, company size, remote).
- **Missing career setup.** If `career.md` does not exist, suggest `/onboard career` first (10 minutes), or ask the three key questions now: role, city, sponsorship.

## Ready when

- Role and location are known.
- Sponsorship need is known (`true`, `false` or "not sure").

## Where the brief goes

No file. Keep the brief in chat and pass it to `/jobs scan`. If the user wants it reused, add the filters to `career.md` under **Targets** (ask first).
