# 0012. Netherlands-first jobs

Status: accepted

## Context
The first pilot users study in the Netherlands. Job hunting for international students there has special issues: visa sponsorship, Dutch-language requirements and salary thresholds.

## Decision
- Sources: **automated** are the Adzuna NL API and company career pages (one public page at a time). IamExpat Jobs, Magnet.me, Nationale Vacaturebank, werk.nl and Indeed NL are **link-only**: the student browses by hand, because their robots.txt or terms block automated reading (checked 2026-10-07, see `system/packs/mba/jobs-nl/sources.md`). LinkedIn and JobSpy exist only as opt-in blueprints, at the student's own risk.
- Checks: the IND recognised-sponsor register, Dutch-language requirement detection, and flags for the highly-skilled-migrant salary threshold and orientation-year (zoekjaar) eligibility.
- Facts such as thresholds are verified during the build and stored in the wiki with sources. Skills never hard-code unverified numbers.
- Never auto-apply. Applications are drafts in the outbox.

## Consequences
- Useful on day one for the pilot group.
- Other countries need a blueprint (the jobs config already has a `country` field).
- Rules change each year, so the wiki facts need refreshing.

## Alternatives considered
- **Generic global job search.** Misses the issues that matter most to our users.
- **Hard-code thresholds.** Becomes wrong silently.
