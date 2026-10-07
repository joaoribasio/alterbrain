---
type: "fact-sheet"
created: ""
status: "active"
---
# Fact sheet

These are the only facts about you that I may use in drafts, CVs, cover letters and replies. If a fact is not here (or in USER.md), I don't use it: I ask you, or I leave a visible gap like `[FACT NEEDED: graduation year]`.

This is your private brain, so it may hold sensitive facts (health, family, nationality, beliefs, finances and so on). I store them when you give them to me. What matters is what leaves your computer: an email, post, application, CV or shared file may only use `public` facts, unless you say yes for that one draft.

**How to read the table**
- **Fact:** a short label I can search for.
- **Exact wording:** the words to use. I copy them as written; I don't round, upgrade or rephrase numbers, titles or dates.
- **Visibility:** `public` = fine for anyone (CV, LinkedIn, recruiters). `private` = never in anything that leaves your computer unless you say yes for that specific draft. A row with no visibility counts as `private`.
- **Source:** where it comes from (`[[CV 2026]]`, "you told me", a LinkedIn export). One source per fact.
- **Last checked:** the date you last confirmed it (YYYY-MM-DD). Facts older than 12 months get a review task.

**Default visibility.** Facts about your nationality, ethnicity, gender, sexuality, health and diseases, religion, politics, family and general finances start as `private`. So do your visa status, birth date, home address and salary expectations. Everything else is up to you. Change a row any time: "make my nationality public".

## Allowed facts

| Fact | Exact wording | Visibility | Source | Last checked |
|---|---|---|---|---|

<!-- Example rows (synthetic persona "Alex Doe"). Onboarding (M2) adds confirmed facts as rows directly under the table header (no blank line). Never use these rows as facts.
| Full name | Alex Doe | public | you told me | 2026-10-07 |
| Programme | Full-time MBA, Class of 2027 | public | [[Admission letter]] | 2026-10-07 |
| City | Rotterdam, the Netherlands | public | you told me | 2026-10-07 |
| Previous role | Senior Analyst, consumer goods strategy (4 years) | public | [[CV 2026]] | 2026-10-07 |
| Languages | English (fluent), Spanish (native), Dutch (A2) | public | [[CV 2026]] | 2026-10-07 |
| Visa status | Needs sponsorship after graduation | private | you told me | 2026-10-07 |
| Health | Type 1 diabetes | private | you told me | 2026-10-07 |
-->

## Never store here

This file is saved to your private GitHub backup and read by Claude in sessions. Some things are too dangerous if they ever leaked, so I never write them here or anywhere else in your vault:
- passwords, API keys, tokens, recovery codes and 2FA seeds (keys for tools go in `.env.local`);
- payment card numbers;
- bank account numbers and IBANs;
- government ID numbers (passport, BSN, SSN, national ID, driving licence number);
- answers to security questions, such as a mother's maiden name.

If you give me one, I won't repeat it or save it. Keep it in a password manager. If it was a token, replace it.

## Never say

Things I must never claim or mention, even if they look helpful.

- Never invent grades, rankings, awards, salaries, team sizes or results.
- Never claim a skill, certificate or language level that is not in the table.
- Never put a `private` fact (health, family, religion, politics, visa status and so on) in anything that leaves your computer unless you say yes for that draft.
- Never name a current or past employer's clients or confidential projects.
- <!-- add your own, e.g. "Never mention my previous start-up" -->

## How facts are used

Every draft lists the facts it used in a `facts_used` table (fact, exact wording, source, visibility). A draft that uses a fact not on this sheet cannot be approved until you add the fact here or remove it from the draft. A draft that uses a `private` fact is flagged ("private fact") and cannot be approved until you say yes to that fact for that draft, or remove it.
