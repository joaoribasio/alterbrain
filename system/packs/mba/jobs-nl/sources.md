---
type: "reference"
title: "Where to find jobs in the Netherlands, and what is allowed"
status: "current"
retrieved: "2026-10-07"
---

# Where to find jobs in the Netherlands, and what is allowed

This file lists job sources, and whether Alterbrain may read them automatically. Short rule: **use official feeds and APIs; read public pages politely; never scrape sites whose terms forbid it.** Alterbrain only searches and drafts. It never applies for you.

"Automated" below means Alterbrain's own core. For Indeed and LinkedIn, the core never automates them. Separate opt-in blueprints exist (`system/blueprints/jobs-extras.md`) that you build yourself, at your own risk. They may breach the site's terms and your account or IP address could be blocked. You decide, and Alterbrain warns you first.

Retrieved on 2026-10-07 unless noted. "robots.txt" is the file a website uses to tell automated tools what they may read. It is not a legal licence, so terms of service still apply.

## Summary table

| Source | Automated access | What Alterbrain does |
|---|---|---|
| **Adzuna API** | Yes. Official API with a free key | `adzuna.mjs` (core, default) |
| **Company career pages** (you list them) | Reading one public page at a time is normal | WebFetch, one page per company, no crawling |
| **IND register of sponsors** | Public page, not blocked by robots.txt | `ind-sponsors.mjs`, refreshed at most weekly |
| **IamExpat Jobs** | robots.txt blocks `/job/` pages | Link only. You browse by hand |
| **Magnet.me** | robots.txt allows most pages | Link only for now. See "Other sources" |
| **Nationale Vacaturebank** | robots.txt blocks the search results page | Link only. You browse by hand |
| **werk.nl** (UWV) | robots.txt blocks only `/webpublicaties` | Link only for now. See "Other sources" |
| **Indeed NL** | robots.txt allows search pages, but the terms of use are widely reported to forbid scraping [Unverified] | Core: link only, never automated. Opt-in JobSpy blueprint (high risk, your own responsibility) |
| **LinkedIn** | **No.** The User Agreement forbids scraping and bots | Core: never scraped. Opt-in blueprint only (your own risk), read-only, with caps |

## Adzuna (the default source)

- **What it is:** a job search engine with a free developer API. It covers the Netherlands (country code `nl`).
- **Get keys:** register at https://developer.adzuna.com/ to receive an `app_id` and an `app_key`. Put them in `.env.local` (never in chat):
  ```
  ADZUNA_APP_ID=your-id
  ADZUNA_APP_KEY=your-key
  ```
- **Endpoint (verified in the Adzuna docs):** `GET https://api.adzuna.com/v1/api/jobs/nl/search/{page}?app_id=...&app_key=...&what=...&where=...&results_per_page=...&content-type=application/json`. Documented results fields: `title`, `company.display_name`, `location.display_name`, `redirect_url`, `created`, `salary_min`, `salary_max`, `description` (a **snippet only**). [Source: https://developer.adzuna.com/docs/search]
- **Free limits (from the terms of service):** 25 calls a minute, 250 a day, 1,000 a week, 2,500 a month. `adzuna.mjs` waits between calls and keeps a daily counter, and stops at 240 calls a day. [Source: https://developer.adzuna.com/docs/terms_of_service | summarised by a page-fetch tool, so re-read the terms if you plan heavy use]
- **Netherlands coverage:** the official docs pages I fetched did not list countries. A third-party summary lists the Netherlands among 18 supported countries. A live call with dummy keys reached the same "authorisation failed" answer for every country code, so this could not be proved without a key. **[Unverified on the official page]** (you will see at your first search.)
- **Terms on storing results:** the terms do not mention caching or storage. They say that publishing listings needs an "Adzuna" credit and link, and that using the data for "ongoing work or research" beyond a trial needs written consent (the exact scope is for you to read). For one person's own job search, the safe approach is: keep only the link, title, company and your own notes in your vault; do not copy the full advert text; do not republish listings. Alterbrain prints "Jobs by Adzuna" under each result list for credit. [Inference] Read the terms yourself: https://developer.adzuna.com/docs/terms_of_service
- **Do not** contact Adzuna's third-party content providers: the terms say that gets your access cancelled.

## Company career pages

Many MBA jobs are only on the company's own site. You list the companies in `vault/20_areas/career/career.md` (target companies and their careers page URLs). `/jobs scan` reads each page once with WebFetch. It does not click through or crawl. It does not log in. If a page needs a login or blocks automated reading, the skill says so and gives you the link.

## Other sources (read by you, not by robots)

- **IamExpat Jobs** (https://www.iamexpat.nl/career/jobs): English-language jobs for international people. The site's robots.txt lists `/job/` as disallowed, so Alterbrain does not fetch those pages. Browse by hand and paste a link into `/jobs apply` when you find something.
- **Magnet.me** (https://magnet.me): popular with Dutch students and graduates. Needs a profile. Its robots.txt allows normal pages and blocks internal tools such as `/applyExternally`. Alterbrain does not log in or scrape it. Browse by hand. [Unverified]: whether Magnet.me offers a public job API; none was found.
- **Nationale Vacaturebank** (https://www.nationalevacaturebank.nl): large Dutch job board, mostly Dutch-language adverts. robots.txt blocks `/vacature/zoeken?*`. Browse by hand.
- **werk.nl** (https://www.werk.nl): UWV's public job board. robots.txt blocks only `/webpublicaties`. Third parties sell scrapers for it, but Alterbrain does not use them. [Unverified]: whether UWV offers an official open-data feed.
- **Indeed NL** (https://nl.indeed.com): large job board. Its terms of use are widely reported to forbid scraping. **[Unverified]**: the exact clause was not fetched. Alterbrain's core does not automate it. The opt-in JobSpy blueprint in `jobs-extras` can collect Indeed results; that blueprint says plainly that it is high risk and you build it at your own risk.
- **LinkedIn** (https://www.linkedin.com): The LinkedIn User Agreement, section 8.2, forbids using scripts, robots, crawlers or browser plug-ins to scrape or copy the service, and bots to access it or send messages. Alterbrain's core **never** scrapes LinkedIn. The `jobs-extras` blueprint has an opt-in, read-only helper with strict daily caps and a clear warning that it may breach the terms and risk your account. [Source: https://www.linkedin.com/legal/user-agreement | fetched 2026-10-07]
- **School career portal:** your business school's job board is usually the best source for MBA roles. It sits behind your login, so you browse it yourself.

## robots.txt results, checked 2026-10-07

| Site | Result |
|---|---|
| ind.nl | Blocks admin, search and system folders. The sponsor register pages are not blocked. |
| iamexpat.nl | `Crawl-delay: 1`. Blocks `/search/`, `/job/`, `/jobProvider/` and others. |
| magnet.me | Allows `/`. Blocks internal paths such as `/admin` and `/applyExternally`. |
| nationalevacaturebank.nl | Blocks `/vacature/zoeken?*`, `/vacature/apply/`, `/solliciteren/` and more. |
| werk.nl | Blocks `/webpublicaties` only. |
| nl.indeed.com | Allows most pages. Blocks many parameter patterns. |
| linkedin.com | Very restrictive. Allows only named bots. |

## Good manners for any automated read

- One request at a time, with a pause between requests.
- Identify yourself honestly (the scripts send a clear `User-Agent`).
- Respect `robots.txt` and the site's terms.
- Cache what you download. Do not repeat a request you already made today.
- If a site says no, stop and give the user the link instead.
