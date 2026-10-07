# Layout of a framework note

Path example: `vault/10_projects/2026 Netflix pricing/Porter Five Forces - Netflix.md`

```
---
type: "analysis"
created: "2026-10-07"
status: "draft"
framework: "[[Porter Five Forces]]"
subject: "Netflix"
question: "Should Netflix raise prices in the Netherlands?"
sources: ["[[Netflix Annual Report 2025]]", "[[Streaming Market Notes]]"]
---
# Porter Five Forces - Netflix

## Question
One sentence: the problem, the decision-maker and the time frame.

## Short answer
Two to four sentences. The answer first. Say how sure you are and why.

## Inputs used
- [[Source note]] - what it gave you
- Anything the user pasted (say "pasted by user, <date>")

## Analysis
One sub-heading per step of the framework, in the framework page's own order.

### <Step name>
- Finding. [Source: [[note]] | 2026-10-07 | confidence: medium]
- Finding labelled [Inference]: your reasoning in one line.

## Assumptions
- Each assumption on its own line, labelled [Inference] or [Unverified], with what would change if it is wrong.

## What I could not find
- Data that would improve this and where it might come from.

## Next steps
- Two or three concrete actions. Put deadlines in the user's task list, not only here.
```

Rules:
- **Table when it helps.** For frameworks with a grid (SWOT, Five Forces ratings), use a small table with one cell per point and a citation or label in each row.
- **No new facts without a label.** If a cell has no citation, it must say `[Inference]` or `[Unverified]`.
- **Plain English.** Short sentences. Explain any unavoidable term once.
- **Length.** One page by default. Respect any limit the user gave.
- **Status.** Always `draft` until the user says it is final.
