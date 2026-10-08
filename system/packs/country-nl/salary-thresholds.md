---
type: "reference"
title: "Salary thresholds for highly skilled migrants (Netherlands)"
status: "current"
valid_year: 2026
retrieved: "2026-10-07"
---

# Salary thresholds for highly skilled migrants (Netherlands)

A "highly skilled migrant" (in Dutch: *kennismigrant*) is a non-EU worker whose employer sponsors a Dutch work and residence permit. The employer must pay at least a set monthly salary. The IND (the Dutch immigration service) changes the amounts every 1 January.

**This file is the single place where the amounts live.** The `/jobs` skill and `node system/scripts/jobs/ind-sponsors.mjs thresholds` read the table below. Nothing else in Alterbrain should hard-code these numbers. Each January, update the table from the IND page listed under Sources, and change `valid_year` above.

## The amounts

All amounts are **gross per month, without the 8% holiday allowance** **[Unverified on the IND page wording; see Sources]**. They are for the calendar year in `valid_year`.

<!-- thresholds:start -->
| key | monthly_eur | applies_to |
|---|---|---|
| hsm_30_plus | 5942 | Highly skilled migrant aged 30 or older when the permit is applied for |
| hsm_under_30 | 4357 | Highly skilled migrant younger than 30 |
| hsm_reduced | 3122 | Reduced criterion for recent graduates (see "Who gets the reduced amount") |
| blue_card | 5942 | EU Blue Card (shown for reference only) |
| blue_card_reduced | 4754 | EU Blue Card, reduced criterion (reference only) |
<!-- thresholds:end -->

Holiday allowance: the IND amounts exclude it. An annual salary quoted in a job advert may or may not include it. To compare an annual figure with the monthly amount, the script gives two readings:

- cautious: annual salary / 12 / 1.08 (assumes the advert includes the 8% holiday allowance);
- generous: annual salary / 12 (assumes it does not).

If only the generous reading clears the bar, the skill says "unclear: ask the employer".

The cautious reading can be too strict. The IND counts fixed allowances such as a thirteenth month (written in the contract, paid into your bank account every month) towards the amount, but not the holiday allowance, in-kind pay or irregular pay (IND page read 2026-10-07). So an advert's annual figure that includes a thirteenth month may clear the bar even when the cautious reading does not. Ask the employer to confirm how the monthly salary is built up.

## Who gets the reduced amount

The IND says the reduced amount applies in these cases (summary, not legal advice):

1. The permit is applied for **during** an orientation-year permit (*zoekjaar*, see `visa-and-sponsorship.md`).
2. The person **used to have** an orientation-year permit.
3. The permit is applied for **within 3 years** of graduating (or of a doctoral defence, or of a research permit ending).
4. The person has never held an orientation-year permit, but **would have qualified** for one (for example, a recent graduate of a Dutch programme).

For someone who graduates from a Dutch university, this will usually be the relevant row for the first 3 years. [Inference] Always confirm with the employer or the IND, because the IND decides.

## Which amount applies to the user?

- Recent graduate (within 3 years) or in an orientation year: `hsm_reduced`.
- Otherwise under 30: `hsm_under_30`.
- Otherwise 30 or older: `hsm_30_plus`.
- Also "in line with the market rate": the IND expects the salary to match what people in that job normally earn. A job that clears the threshold but pays far below the market can still be refused. [Source below, ind.nl highly skilled migrant page.]

The skill asks the user once for their age band (under 30 or 30+) and graduation date, and stores the answer in `vault/20_areas/career/career.md`. It does not ask for a date of birth.

## Sources (all retrieved 2026-10-07)

- IND, "Required amounts income requirements" (2026 amounts, valid 1 January 2026 up to and including 31 December 2026) — https://ind.nl/en/required-amounts-income-requirements — **numbers verified directly on the page** (5,942 / 4,357 / 3,122; Blue Card 5,942 / 4,754), and cross-checked against a third-party summary quoting the same figures: https://www.leideninternationalcentre.nl/get-advice/blogs/salary-thresholds-changes-2026
- That the highly skilled migrant amounts are **without** holiday allowance: stated by a page-fetch summary of the IND page and by the third-party summary (the IND page shows both "without" and "with" holiday allowance columns for other permit types). Treat as **[Unverified] on the exact IND wording**. Confirm on the IND page before relying on a close call.
- IND, "Highly skilled migrant" (employer must be a recognised sponsor; salary must meet the income requirement and be in line with the market rate; application fee EUR 423) — https://ind.nl/en/residence-permits/work/highly-skilled-migrant — verified by page fetch.
- Under-30 rule detail from the same IND amounts page: a migrant who turns 30 keeps the lower amount only if they have not changed employer since the first permit unless they were still under 30 at the time.

## Caveats

- These are 2026 amounts. In 2027 they will change. If today's year is later than `valid_year`, the script prints a warning and the skill tells the user the numbers may be out of date.
- Employers may also use other routes (EU Blue Card, intra-company transfer, and others) with different rules. This file covers the highly skilled migrant route only.
- This is information, not legal or immigration advice.
