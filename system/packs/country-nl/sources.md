---
type: "reference"
title: "Where to find jobs in the Netherlands, and what is allowed"
status: "current"
retrieved: "2026-10-07"
---

# Where to find jobs in the Netherlands, and what is allowed

This file lists the Netherlands-specific job sources and whether Alterbrain may read them automatically. The sources that work in any country (the Adzuna API, company career pages, and why Indeed and LinkedIn are never automated) and the rules for any automated read are in `.claude/skills/jobs/references/sources.md`. Short rule: **use official feeds and APIs; read public pages politely; never scrape sites whose terms forbid it.** Alterbrain only searches and drafts. It never applies for you.

Retrieved on 2026-10-07 unless noted. "robots.txt" is the file a website uses to tell automated tools what they may read. It is not a legal licence, so terms of service still apply.

## Summary table

| Source | Automated access | What Alterbrain does |
|---|---|---|
| **IND register of sponsors** | Public page, not blocked by robots.txt | `ind-sponsors.mjs`, refreshed at most weekly |
| **IamExpat Jobs** | robots.txt blocks `/job/` pages | Link only. You browse by hand |
| **Magnet.me** | robots.txt allows most pages | Link only for now. See "Other sources" |
| **Nationale Vacaturebank** | robots.txt blocks the search results page | Link only. You browse by hand |
| **werk.nl** (UWV) | robots.txt blocks only `/webpublicaties` | Link only for now. See "Other sources" |
| **Indeed NL** | robots.txt allows search pages, but the terms of use are widely reported to forbid scraping [Unverified] | Core: link only, never automated. Opt-in JobSpy blueprint (high risk, your own responsibility) |

## Adzuna in the Netherlands

- **Netherlands coverage:** Adzuna's country code for the Netherlands is `nl`. The official docs pages I fetched did not list countries. A third-party summary lists the Netherlands among 18 supported countries. A live call with dummy keys reached the same "authorisation failed" answer for every country code, so this could not be proved without a key. **[Unverified on the official page]** (you will see at your first search.)

## IND register of sponsors

The IND (the Dutch immigration service) publishes a public list of organisations recognised as sponsors. It is one public web page. Its `robots.txt` does not block it. `node system/scripts/jobs/ind-sponsors.mjs` saves a copy and refreshes it at most once a week. How the register works and how to read a match is in `visa-and-sponsorship.md`.

## Other sources (read by you, not by robots)

- **IamExpat Jobs** (https://www.iamexpat.nl/career/jobs): English-language jobs for international people. The site's robots.txt lists `/job/` as disallowed, so Alterbrain does not fetch those pages. Browse by hand and paste a link into `/jobs apply` when you find something.
- **Magnet.me** (https://magnet.me): popular with Dutch students and graduates. Needs a profile. Its robots.txt allows normal pages and blocks internal tools such as `/applyExternally`. Alterbrain does not log in or scrape it. Browse by hand. [Unverified]: whether Magnet.me offers a public job API; none was found.
- **Nationale Vacaturebank** (https://www.nationalevacaturebank.nl): large Dutch job board, mostly Dutch-language adverts. robots.txt blocks `/vacature/zoeken?*`. Browse by hand.
- **werk.nl** (https://www.werk.nl): UWV's public job board. robots.txt blocks only `/webpublicaties`. Third parties sell scrapers for it, but Alterbrain does not use them. [Unverified]: whether UWV offers an official open-data feed.
- **Indeed NL** (https://nl.indeed.com): large job board. Its terms of use are widely reported to forbid scraping. **[Unverified]**: the exact clause was not fetched. Alterbrain's core does not automate it. The opt-in JobSpy blueprint in `jobs-extras` can collect Indeed results; that blueprint says plainly that it is high risk and you build it at your own risk.
- **School career portal:** your school's or programme's job board, if it has one, is often a good source. It sits behind your login, so you browse it yourself.

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
