# Netherlands job-search pack

- **Pack id:** `country-nl`
- **Country:** NL (the Netherlands)
- **Local language:** `nl` (Dutch)
- **Switched on when** `packs` in `config/brain.json` lists `country-nl`. Onboarding (M6) and `/jobs` add it when `jobs.country` is `NL`; `/reconfigure` changes it.

The job search itself (`/jobs scan`, `/jobs apply`) is core and works in any country. This pack adds what is true only for the Netherlands: the checks for visa sponsors, Dutch-language requirements and salary thresholds, the sources that are link-only, and the questions career set-up asks.

## What is in it

| File | What it holds |
|---|---|
| `jobs.md` | The pack contract the jobs skill reads: defaults, onboarding questions, checks, keep rules, fields, the one-time disclaimer |
| `dutch-language.md` | How to spot a Dutch-language requirement in an advert: phrases, levels, five labels |
| `salary-thresholds.md` | The highly skilled migrant salary amounts (the single place they live), their year, and who gets the reduced amount |
| `visa-and-sponsorship.md` | Plain-English guide to the orientation year, the highly skilled migrant route and the IND register of recognised sponsors |
| `sources.md` | Dutch job sources and whether they may be read automatically, with the robots.txt results |

The scripts stay where they are, so permissions and your own copies keep working: `system/scripts/jobs/adzuna.mjs` (Adzuna search, adds a Dutch-language guess for `nl`) and `system/scripts/jobs/ind-sponsors.mjs` (IND register and salary thresholds).

## Maintenance

- **Every 1 January:** update the table in `salary-thresholds.md` from the IND page listed under its Sources, and change its `valid_year`. After that date the script and the jobs skill warn that the amounts may be out of date.
- **If you changed the table before release 0.2.0,** your copy is still at `system/packs/mba/jobs-nl/salary-thresholds.md`, where nothing reads it. `/update-alterbrain` adds a task to carry the change over, and `node system/scripts/jobs/ind-sponsors.mjs thresholds` names the old file until you do.
- **Recheck the robots.txt results** in `sources.md` when you update the amounts (and before adding a new source). Change the date next to them.
- **Keep `dutch-language.md` and `REQUIRED_PATTERNS` in `system/scripts/jobs/adzuna.mjs` in step.** A change in one is a change in the other.
- **CV conventions:** none yet. The CV filling guide (`.claude/skills/render/references/cv-filling.md`) says to look for them in the country pack, so add them here if a Dutch convention is worth keeping.
- Examples are synthetic. Do not add real people or real company data.
