---
type: "reference"
title: "Where to find jobs, and what is allowed"
status: "current"
retrieved: "2026-10-07"
---

# Where to find jobs, and what is allowed

This file lists the job sources that work in any country, and whether Alterbrain may read them automatically. Sources that belong to one country are in that country's pack: the Netherlands is `system/packs/country-nl/sources.md`. Short rule: **use official feeds and APIs; read public pages politely; never scrape sites whose terms forbid it.** Alterbrain only searches and drafts. It never applies for you.

"Automated" below means Alterbrain's own core. For Indeed and LinkedIn, the core never automates them. Separate opt-in blueprints exist (`system/blueprints/jobs-extras.md`) that you build yourself, at your own risk. They may breach the site's terms and your account or IP address could be blocked. You decide, and Alterbrain warns you first.

Retrieved on 2026-10-07 unless noted. "robots.txt" is the file a website uses to tell automated tools what they may read. It is not a legal licence, so terms of service still apply.

## Summary table

| Source | Automated access | What Alterbrain does |
|---|---|---|
| **Adzuna API** | Yes. Official API with a free key | `adzuna.mjs` (core, default) |
| **Company career pages** (you list them) | Reading one public page at a time is normal | WebFetch, one page per company, no crawling |
| **Indeed** | The terms of use are widely reported to forbid scraping [Unverified] | Core: link only, never automated. Opt-in JobSpy blueprint (high risk, your own responsibility) |
| **LinkedIn** | **No.** The User Agreement forbids scraping and bots | Core: never scraped. Opt-in blueprint only (your own risk), read-only, with caps |
| **Sources for one country** | Set by that country's pack | See the pack's `sources.md` |

## Adzuna (the default source)

- **What it is:** a job search engine with a free developer API.
- **Which country:** the search uses the country in `jobs.country` in `config/brain.json`, written as a lower-case two-letter code in the endpoint (`nl` for the Netherlands). `adzuna.mjs` always gets it as `--country <cc>`. If Adzuna does not offer that country, the script says so in plain words. Coverage for the Netherlands is in `system/packs/country-nl/sources.md`.
- **Get keys:** register at https://developer.adzuna.com/ to receive an `app_id` and an `app_key`. Put them in `.env.local` (never in chat):
  ```
  ADZUNA_APP_ID=your-id
  ADZUNA_APP_KEY=your-key
  ```
- **Endpoint:** `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id=...&app_key=...&what=...&where=...&results_per_page=...&content-type=application/json`, with `{country}` the lower-case `jobs.country`. The Netherlands form (`.../jobs/nl/search/...`) was verified in the Adzuna docs; other countries use the same pattern [Unverified]. Documented results fields: `title`, `company.display_name`, `location.display_name`, `redirect_url`, `created`, `salary_min`, `salary_max`, `description` (a **snippet only**). [Source: https://developer.adzuna.com/docs/search]
- **Free limits (from the terms of service):** 25 calls a minute, 250 a day, 1,000 a week, 2,500 a month. `adzuna.mjs` waits between calls and keeps a daily counter, and stops at 240 calls a day. [Source: https://developer.adzuna.com/docs/terms_of_service | summarised by a page-fetch tool, so re-read the terms if you plan heavy use]
- **Terms on storing results:** the terms do not mention caching or storage. They say that publishing listings needs an "Adzuna" credit and link, and that using the data for "ongoing work or research" beyond a trial needs written consent (the exact scope is for you to read). For one person's own job search, the safe approach is: keep only the link, title, company and your own notes in your vault; do not copy the full advert text; do not republish listings. Alterbrain prints "Jobs by Adzuna" under each result list for credit. [Inference] Read the terms yourself: https://developer.adzuna.com/docs/terms_of_service
- **Do not** contact Adzuna's third-party content providers: the terms say that gets your access cancelled.

## Company career pages

Many roles are only on the company's own site. You list the companies in `vault/20_areas/career/career.md` (target companies and their careers page URLs). `/jobs scan` reads each page once with WebFetch. It does not click through or crawl. It does not log in. If a page needs a login or blocks automated reading, the skill says so and gives you the link.

## Never automated

- **Indeed** (any country): the terms of use are widely reported to forbid scraping. **[Unverified]**: the exact clause was not fetched. Alterbrain's core does not automate it. The opt-in JobSpy blueprint in `jobs-extras` can collect Indeed results; that blueprint says plainly that it is high risk and you build it at your own risk.
- **LinkedIn** (https://www.linkedin.com): The LinkedIn User Agreement, section 8.2, forbids using scripts, robots, crawlers or browser plug-ins to scrape or copy the service, and bots to access it or send messages. Alterbrain's core **never** scrapes LinkedIn. The `jobs-extras` blueprint has an opt-in, read-only helper with strict daily caps and a clear warning that it may breach the terms and risk your account. [Source: https://www.linkedin.com/legal/user-agreement | fetched 2026-10-07]

For any other job board, check its terms and robots.txt before reading it automatically. If in doubt, give the user the link and let them browse by hand.

## Good manners for any automated read

- One request at a time, with a pause between requests.
- Identify yourself honestly (the scripts send a clear `User-Agent`).
- Respect `robots.txt` and the site's terms.
- Cache what you download. Do not repeat a request you already made today.
- If a site says no, stop and give the user the link instead.
