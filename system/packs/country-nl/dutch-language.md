---
type: "reference"
title: "Spotting Dutch-language requirements in job adverts"
status: "current"
retrieved: "2026-10-07"
---

# Spotting Dutch-language requirements in job adverts

Many Dutch jobs need Dutch. Many do not. This guide helps you tell which is which before you spend time on an application.

## The short version

- If the advert is **written in Dutch**, assume Dutch is needed until you learn otherwise.
- If the advert is in English **and** says nothing about Dutch, Dutch is probably not required, but ask.
- If it names a level (for example "B2" or "NT2"), take it seriously. It is a real requirement.
- "Nederlands is een pré" means "Dutch is a plus". It is not a requirement.

Background, for context: Indeed reported (date not checked) that about 8% of Dutch vacancies on its site did not require Dutch, and that Dutch is more often needed for HR, IT helpdesk and childcare roles. [Source: https://www.iamexpat.nl/career/employment-news/indeed-speaking-dutch-often-not-required-jobs-netherlands | retrieved 2026-10-07 | secondary source, summarised by a search tool, **[Unverified]** for the exact figure]

## Words and levels

- **NT2** (*Nederlands als tweede taal*): "Dutch as a second language". It is the name of the official exams for adult learners. NT2 Programme I is roughly level B1, and Programme II is roughly B2. [Unverified: from general knowledge, check inburgering/DUO pages if it matters]
- **CEFR levels** A1 to C2: A1 is a beginner and C2 is near-native. B2 is "can work in Dutch with some effort". C1 is "fluent for work".
- **Moedertaal**: mother tongue. **In woord en geschrift**: spoken and written.

## Phrases that mean "Dutch is required"

The script `adzuna.mjs` and the `/jobs` skill use this list. If you change it here, change the `REQUIRED_PATTERNS` list in `system/scripts/jobs/adzuna.mjs` too. The list is a **heuristic written from general knowledge. [Unverified]** It will miss some wording and catch some false alarms, so a person always makes the final call.

| Phrase (Dutch or English) | Plain meaning |
|---|---|
| vloeiend Nederlands, vloeiende beheersing van het Nederlands | fluent Dutch |
| (goede / uitstekende / zeer goede) beheersing van de Nederlandse taal | good or excellent command of Dutch |
| Nederlandse taal in woord en geschrift | Dutch, spoken and written |
| Nederlands als moedertaal, native Dutch | native Dutch |
| Nederlandstalig | Dutch-speaking |
| NT2 | NT2 level needed |
| taalniveau B2 / C1 / C2, Nederlands op C1-niveau | named level |
| fluent in Dutch, Dutch is required / mandatory / a must | fluent Dutch needed |
| excellent / strong command of Dutch, Dutch-speaking | strong Dutch needed |

## Phrases that mean "Dutch is a plus"

| Phrase | Plain meaning |
|---|---|
| Nederlands is een pré / een plus / een voordeel | Dutch is a plus |
| kennis van het Nederlands is een pré | knowing Dutch is a plus |
| Dutch is a plus / an advantage / nice to have | same, in English |

## Phrases that mean "Dutch is not needed"

| Phrase | Plain meaning |
|---|---|
| English is the working language, company language | work is done in English |
| no Dutch required, Dutch not required | explicit |
| geen kennis van het Nederlands vereist | explicit |

## Reading the signal: five labels

The skill and script give each job one label.

1. `required`: a "required" phrase was found and no "not needed" phrase.
2. `likely`: nothing explicit, but the advert is written in Dutch.
3. `preferred`: only a "plus" phrase was found.
4. `not_required`: a "not needed" phrase was found.
5. `unknown`: no mention, advert in English or too short to tell.

Adzuna only gives a **short snippet** of each advert (the API documents it as a snippet). So the label is only a first guess. For every shortlisted job, the skill fetches the full advert with WebFetch and checks again.

## What to do about it

- `required` or `likely`, and your Dutch is below the level named: put the job in "stretch" or drop it.
- `preferred`: apply, and say in your cover letter that you are learning Dutch (only if it is true, see `vault/80_me/fact-sheet.md`).
- `unknown`: ask the recruiter, "Is Dutch needed day to day?"
- Never claim a Dutch level you do not have. Language levels are checked in interviews.

## Sources (retrieved 2026-10-07)

- Example of real wording ("goede beheersing van de Nederlandse taal in woord en geschrift") from a Dutch company vacancies page found by search: https://www.buckaroo.eu/about/vacancies — one example only, shown to illustrate the pattern.
- Indeed statistics via IamExpat: https://www.iamexpat.nl/career/employment-news/indeed-speaking-dutch-often-not-required-jobs-netherlands — secondary.
- The pattern lists above are the author's own heuristics: **[Unverified]**.
