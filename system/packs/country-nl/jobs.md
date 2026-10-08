---
type: "reference"
title: "Netherlands job search: the country-pack contract"
status: "current"
retrieved: "2026-10-08"
---

# Netherlands job search

The jobs skill (`.claude/skills/jobs/`), the career set-up in onboarding (M6) and `/reconfigure` read this file when `jobs.country` is `NL` and `packs` lists `country-nl`. The headings below are fixed, so every one of them can find its part: Defaults, Onboarding questions, Checks, Keep rules, Fields, Say once. The scan and apply workflows hold the steps that are the same in every country; this file holds what is true only for the Netherlands.

## Defaults

- **Adzuna country code:** `nl`. The jobs skill passes `--country nl` to `node system/scripts/jobs/adzuna.mjs`.
- **Sources:** `adzuna` and `career-pages` (the values for `jobs.sources`). Other Dutch job sites are link-only: `sources.md` in this folder.
- **Default regions:** Randstad (Amsterdam, Rotterdam, The Hague, Utrecht). Offered as the suggestion when the user is asked where they want to work.
- **Local language:** `nl` (Dutch). The scan brief offers it as an advert language next to English. Put `nl` in `jobs.languages` only when the user's Dutch is B1 or above.

## Onboarding questions

Asked by onboarding M6 and `/reconfigure`, each straight after the generic career question it belongs to (languages, work authorisation, salary). One at a time.

1. **Dutch level.** "How good is your Dutch?" AskUserQuestion: None or basic (A1–A2) / Working (B1–B2) / Fluent (C1–C2). Explain once: "Many Dutch job ads need Dutch. I'll flag those for you." Add the level to the fact sheet only after the user confirms it.
2. **Work authorisation.** The generic question is "Will you need an employer to sponsor your work permit?" with the answers "No, I'm free to work here (for example an EU citizen)", "Yes, I'll need sponsorship" and "Not sure". For the Netherlands, explain in one line:
   - "If you need sponsorship, I'll check each employer against the official list of recognised sponsors (the IND register)."
   - Citizens of the EU, EEA or Switzerland, and people who already have the right to work in the Netherlands, answer No. `visa-and-sponsorship.md` has the plain-English guide, for "Not sure" as well (three lines, then ask again).
   - Never give legal advice. If "Not sure", add a task `Check whether you need visa sponsorship to work in NL (ask your school's career centre or the IND)` (`--tag onboard --priority medium`).
3. **Salary.** Do not quote salary thresholds from memory. The jobs skill reads verified figures from `salary-thresholds.md` in this folder.

## Checks

The jobs skill runs these for every job scoring 50 or more, after scoring. Each one writes one field (see Fields).

| Id | Applies when | Command or file | Field | Re-checked by `/jobs apply` |
|---|---|---|---|---|
| `sponsor` | `jobs.needs_sponsorship` is not `false` | `node system/scripts/jobs/ind-sponsors.mjs lookup --company "<employer>" --json` | `sponsor` | No |
| `dutch` | every job | `dutch-language.md`, and the `dutch` signal from `adzuna.mjs` as a first guess | `dutch` | Yes: tell the user plainly before they spend time, if `required` or `likely` |
| `salary` | sponsorship is needed, and the salary is shown and not estimated | `node system/scripts/jobs/ind-sponsors.mjs thresholds ... --json`, amounts from `salary-thresholds.md` | `salary_check` | No |

### `sponsor`

Skip if `needs_sponsorship` is `false`. Otherwise:
```
node system/scripts/jobs/ind-sponsors.mjs lookup --company "<employer>" --json
```
The script downloads the IND register at most once a week and reuses its saved copy.

| `status` | Say in the note |
|---|---|
| `recognised` | `recognised sponsor (KvK <number>). Confirm this is the employing company.` |
| `possible` | `possible match: <name> (KvK <number>). Check before relying on it.` |
| `not_found` | `not in the IND register (list updated <date>). Ask whether they sponsor, or whether you could start on an orientation-year permit.` |

Staffing and recruitment agencies: the advert's `company` may be the agency. Say so if the advert looks like one.

### `dutch`

Fetch the advert page with WebFetch. If it cannot be read, use the snippet and say so. Label it with one of `required`, `likely`, `preferred`, `not_required`, `unknown` using `system/packs/country-nl/dutch-language.md`. Quote the exact phrase you relied on, in a short quotation of 12 words at most. The `dutch` field in the Adzuna output is only a first guess from a short snippet.

### `salary`

Only if sponsorship is needed and the salary is shown and not estimated:
```
node system/scripts/jobs/ind-sponsors.mjs thresholds --reduced --annual-min <n> --annual-max <n> --json
```
Use `--reduced` when `career.md` says the user graduated in the last 3 years or holds or can get an orientation-year permit. Otherwise use `--age-band under30` or `--age-band 30plus`. Read `selected.verdict`:

| verdict | Say |
|---|---|
| `meets` | `Salary looks high enough for the highly skilled migrant amount (EUR <monthly> a month, <year> amounts).` |
| `unclear` | `Salary may meet the amount, depending on whether the advert includes holiday allowance. Ask the employer.` |
| `below` | `Salary looks below the highly skilled migrant amount.` |
| `unknown` | `No salary shown. Ask early.` |

If the result has a `note` (amounts out of date), repeat it to the user.

**Questions this check needs.** Asked only when `jobs.needs_sponsorship` is `true`. Look in `career.md` first; ask only what is missing:
- **age band** (under 30, or 30 and over). The salary rules need only the band, so ask for that, not the exact birth date. Store it as a `private` fact;
- **graduation date** or orientation-year status (decides whether the reduced salary amount applies, see `salary-thresholds.md`).

## Keep rules

Added to the keep rules in the scan workflow. A job that meets none of them follows the core rules (70 or more shortlisted, 50 to 69 found).

| Situation | Action |
|---|---|
| Sponsorship needed, sponsor `not_found`, and salary `below` | Do not shortlist. List under "Filtered out" in the summary with the reason. |
| Sponsorship needed, sponsor `not_found`, salary otherwise fine or unknown | Keep, stage `found`, flag it. |
| Dutch `required` or `likely`, and the user's Dutch is below the level named (or the user has no Dutch) | Keep as `found`, flag it "stretch: needs Dutch". |

## Fields

Written to each application note and shown as columns in the scan summary. The names are the same as in every earlier version, so existing notes and the pipeline view keep working.

| Field | Values |
|---|---|
| `sponsor` | one of the phrases in the `sponsor` check, or `n/a` |
| `dutch` | `required`, `likely`, `preferred`, `not_required` or `unknown` |
| `salary_check` | `meets`, `unclear`, `below` or `unknown`, or `n/a` |

## Say once

Say this once per scan, in plain words, and not again in every note:
- **Visa, salary and language checks are guidance, not advice.** The IND and the employer decide. Always label an uncertain finding `[Unverified]`. Take threshold amounts only from `salary-thresholds.md`, and show its warning if the year is out of date.
- **A register match is a hint.** The IND lists legal entities. Show the KvK number and say to confirm the employing company.
