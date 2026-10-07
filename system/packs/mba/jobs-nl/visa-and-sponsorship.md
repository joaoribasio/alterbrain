---
type: "reference"
title: "Working in the Netherlands: sponsors and the orientation year"
status: "current"
retrieved: "2026-10-07"
---

# Working in the Netherlands: sponsors and the orientation year

Plain-English guide for an MBA student who is not an EU citizen. This is information, not immigration advice. The IND (*Immigratie- en Naturalisatiedienst*, the Dutch immigration service) makes the decisions.

If you are a citizen of the EU, EEA or Switzerland, or already have the right to work in the Netherlands, you can skip this file. Set `jobs.needs_sponsorship` to `false` in `config/brain.json`.

## The two routes that matter for graduates

### Route 1: the orientation year (*zoekjaar hoogopgeleiden*)

A one-year residence permit that lets a recent graduate look for work in the Netherlands.

- **Who:** people who finished an accredited bachelor's or master's programme at a Dutch higher education institution **in the 3 years before the date of application**. Other groups can also apply:
  - **Foreign university graduates:** the IND asks that the university is in the top 200 (general ranking or the ranking for your subject) of **at least two of these three** rankings, as they stood on your graduation date: Times Higher Education, QS and ShanghaiRanking. If you use a subject ranking, it must match your field of study. One ranking is not enough. (IND page, read 2026-10-07.)
  - **Post-master's programmes** in the Netherlands of at least one academic year (10 months). For a foreign programme the IND also asks for an English or Dutch language qualification or a programme taught in English or Dutch. [Unverified: check the exact conditions for your case on the IND page.]
  - Researchers, Erasmus Mundus joint master's graduates, and some students on Dutch government-funded programmes are covered too.
  - Always check the IND page for the exact list before you rely on one of these.
- **Length:** 1 year. It **cannot be extended**.
- **Work:** you may work freely. Your employer does **not** need a work permit for you, and does **not** need to be a recognised sponsor.
- **Cost:** the IND fee is EUR 254 (2026 page).
- **Apply:** from abroad or, if you meet the conditions, from inside the Netherlands.
- **After it:** if you find a job, your employer can switch you to a highly skilled migrant permit. This needs a recognised sponsor and a salary at or above the amounts in `salary-thresholds.md`. The **reduced salary amount** applies to you.

**MBA graduates.** A master's from a Dutch institution counts. Whether a particular MBA qualifies depends on the programme being an accredited bachelor's or master's programme at a Dutch higher education institution. Some MBA programmes at Dutch business schools are advertised as qualifying; this is **[Unverified]** for any specific school. Check with your school's international office and the IND before you rely on it. Useful starting points: the IND page below, and your school's immigration contact.

### Route 2: highly skilled migrant (*kennismigrant*)

A permit for a skilled worker with a job offer.

- The employer must be **recognised by the IND as a sponsor** (*erkend referent*). Not every company is. The register is public (see below).
- The salary must meet the monthly amount in `salary-thresholds.md` (gross, without holiday allowance, **[Unverified on the IND page wording]**) and be in line with the market rate. The IND counts fixed allowances written in the contract and paid into your bank account every month (for example a thirteenth month) towards that amount. The holiday allowance, payments in kind and irregular pay such as overtime do not count (IND page, read 2026-10-07).
- The employer applies for you. The IND fee is EUR 423 (2026 page).
- The employer takes on duties as a sponsor, for example telling the IND about changes.

Other routes exist (EU Blue Card, intra-company transfer, and others). They are out of scope for this pack.

## The public register of recognised sponsors

- **What it is:** a public list of organisations recognised by the IND as sponsors. The register for work and highly skilled migrants is called "Public register Work" (Dutch: *Openbaar register arbeid*). There are separate registers for exchange, study and research.
- **Where:** https://ind.nl/en/public-register-recognised-sponsors/public-register-work (Dutch: https://ind.nl/nl/openbaar-register-erkende-referenten/openbaar-register-arbeid).
- **Format (verified 2026-10-07):** one web page with one HTML table. Two columns: "Organisation" and "KVK (Chamber of Commerce) number". About 13,000 rows, sorted A to Z. It is not a downloadable file and has no search API, so Alterbrain saves the page and searches the copy. The page is about 1 MB.
- **How often it changes:** the IND says the registers are updated once a month. The page said "last updated on 5 October 2026" when checked.
- **How Alterbrain uses it:** `node system/scripts/jobs/ind-sponsors.mjs lookup --company "<name>"`. The copy is refreshed at most once a week. The IND `robots.txt` does not block this page.
- **Matching tips:**
  - The register lists **legal entities**, such as "Example Netherlands B.V.". A global brand may be recognised under a Dutch company name, or not at all. Match on the **entity that signs your contract**.
  - Names are matched loosely (ignoring B.V., N.V., Holding and punctuation). A loose match is a **hint**, never proof. The KvK number is the reliable check: ask the employer, or look the company up at https://www.kvk.nl.
  - Recruitment agencies and staffing firms may be recognised, while the end client is not. Ask who the employer on the contract would be.
  - A company missing from the register may have applied recently, because the list updates monthly. It can still become a sponsor, but it can take up to about 90 days [Unverified: third-party summary].

## What to say to a recruiter

Short script for the first conversation:

> "I will need a highly skilled migrant permit, or I may be on an orientation-year permit. Is your company a recognised sponsor with the IND? Which legal entity would employ me?"

Asking early is normal. Recruiters hear it often.

## Sources (retrieved 2026-10-07)

- IND, public registers overview (four registers, updated once a month): https://ind.nl/en/public-register-recognised-sponsors — verified.
- IND, Public register Work (HTML table, two columns, 13,000+ rows, "last updated on 5 October 2026"): https://ind.nl/en/public-register-recognised-sponsors/public-register-work — **verified by fetching the page and parsing the table**.
- IND robots.txt (no rule blocking the register): https://ind.nl/robots.txt — verified.
- IND, orientation year (valid 1 year, cannot be extended, work freely without employer work permit, fee EUR 254, "in the 3 years before the date of application", accredited bachelor's or master's at a Dutch higher education institution, top-200 foreign universities): https://ind.nl/en/residence-permits/work/residence-permit-for-orientation-year — verified (page text and fetch summary).
- IND, highly skilled migrant (recognised sponsor required, income requirement, market-rate wording, fee EUR 423): https://ind.nl/en/residence-permits/work/highly-skilled-migrant — verified by page fetch.
- Third-party background on orientation-year MBAs and sponsor duties (secondary sources, treat as pointers): https://www.leideninternationalcentre.nl/get-advice/blogs/the-dutch-orientation-year-zoekjaar-a-practical-guide-for-international-graduates, https://lawandmore.eu/legal-glossary/recognised-sponsor/
