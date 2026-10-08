# Business critique presets (MBA pack)

Seat suggestions for `/assignment critique` when the assignment is about business. They are starting points: `.claude/skills/assignment/workflows/critique.md` proposes them only when `packs` in `config/brain.json` lists `mba` and the subject is business (strategy, finance, marketing, operations, accounting, entrepreneurship). For any other subject, the neutral seats in `.claude/skills/assignment/references/lenses/board.md` apply.

Seats are roles, never real people.

## Board seats

The board keeps its six seats. Seat 1 (the assessor), seat 5 (a referee) and seat 6 (an editor) do not change. Rename seats 2, 3 and 4 to fit the assignment, using these as a guide.

| Seat | Neutral default | Business examples |
|---|---|---|
| 2 | The intended reader or decision maker | The CFO, the buyer, the acquirer's CEO, the investment committee, the head of a business unit |
| 3 | A practitioner | A treasurer, a management consultant, a deal lawyer, a category manager, a brand manager |
| 4 | A subject expert | An audit partner, a valuation expert, a pricing economist, a supply-chain specialist |

Infer the names from the case or the questions. State them in one line instead of asking, as `critique.md` section 3 does.

## Specialist seats

Propose three to five from the questions and the case. Examples:

- Valuation
- Negotiation and game theory
- Competition law
- Corporate finance (an academic's view)
- Industry economics for the sector in the case (for example retail)
- Accounting and reporting standards
- Marketing research methods

If an earlier round card exists, propose the same seats again. The user confirms or changes them.

## Hindsight

A business case usually has a case date. When the round card gives one, every reviewer uses only facts knowable on that date, and later events go under "Outside the case". Without a case date the hindsight rule does not apply.
