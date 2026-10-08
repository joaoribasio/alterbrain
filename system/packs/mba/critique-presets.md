# Business critique presets (MBA pack)

Seat suggestions for `/critique` and `/assignment critique` when the work is about business. Both use the same lens library (`.claude/skills/critique/references/lenses/`) and the same procedure (`.claude/skills/critique/references/panel.md`). The presets are starting points: they apply only when `packs` in `config/brain.json` lists `mba` and the subject is business (strategy, finance, marketing, operations, accounting, entrepreneurship). For any other subject, the neutral seats in `.claude/skills/critique/references/lenses/board.md` apply.

Seats are roles, never real people.

## Board seats

The board keeps its six seats. Seat 1 (the assessor or approver), seat 5 (a referee) and seat 6 (an editor) do not change. Rename seats 2, 3 and 4 to fit the work, using these as a guide.

| Seat | Neutral default | Business examples |
|---|---|---|
| 2 | The intended reader or decision maker | The CFO, the buyer, the acquirer's CEO, the investment committee, the head of a business unit |
| 3 | A practitioner | A treasurer, a management consultant, a deal lawyer, a category manager, a brand manager |
| 4 | A subject expert | An audit partner, a valuation expert, a pricing economist, a supply-chain specialist |

Infer the names from the case or the questions. State them in one line instead of asking, as `panel.md` section 1 does.

## Seats by deliverable

Use these when the work is not a case report.

| Deliverable | Seat 2 (reader or decision maker) | Seat 3 (practitioner) | Seat 4 (subject expert) |
|---|---|---|---|
| Strategy deck | The executive committee, the CEO | A head of strategy | An industry analyst |
| Investor or pitch deck | The investment committee, a partner at a fund | A founder who has raised before | A valuation expert |
| Management memo | The manager who must decide, the CFO | An operations lead | The function's expert (finance, legal, HR) |
| Business proposal | The client's sponsor, the buying committee | A delivery lead | A procurement or contract specialist |
| Financial model or workbook | The CFO, the investment committee | A treasurer, an FP&A lead | An audit partner, a valuation expert |
| Marketing plan | The CMO, the brand director | A category or brand manager | A market-research specialist |

For a deck, the reading-deck or presenting-deck style from the resolved template changes what the editor seat expects: a reading deck must stand alone, a presenting deck must not carry the talk.

## Specialist seats

Propose three to five from the questions and the case. Examples:

- Valuation
- Negotiation and game theory
- Competition law
- Corporate finance (an academic's view)
- Industry economics for the sector in the case (for example retail)
- Accounting and reporting standards
- Marketing research methods
- Pricing and unit economics
- Operations and supply chain

If an earlier round card exists, propose the same seats again. The user confirms or changes them.

## Hindsight

A business case usually has a case date. When the round card gives one, every reviewer uses only facts knowable on that date, and later events go under "Outside the case". Without a case date the hindsight rule does not apply (decks, memos and proposals usually have none).
