# Which lenses, for which deliverable

Used by `panel.md` to propose the panel. The lens library is `.claude/skills/critique/references/lenses/`; each lens file names the deliverables it suits and what it needs. This table is the default; the user can always pick their own.

Lens ids: `devils-advocate`, `premortem`, `board`, `specialists`, `grader`, `fact-check`, `structure`, `signature`, `production`, `model-audit`, `recruiter`, and `consolidation` (always last, full panel only).

## Rules that apply to every row

- **Quick panel:** two or three lenses, read and merged by the main session. Only lenses whose `panels` include `quick`.
- **Full panel:** all lenses in the row, consolidated by `helper-judgement` (the `consolidation` lens). Never more than seven lenses in one round without the user asking.
- `grader` only when a rubric exists. Without a rubric, leave it out and say so in one line.
- `recruiter` only for a CV or a cover letter.
- `model-audit` only for a workbook, or for a report or deck that rests on one (then it audits the workbook it names).
- `signature` needs a voice profile (`vault/80_me/voice/<lang>/profile.md`). Without one, leave it out, say so once, and suggest the voice setup.
- `production` needs rendered pages. The main session produces the PNGs first (`node system/scripts/pages.mjs`) and lists them in the round card. Without pages, leave it out.
- `specialists` needs seats confirmed by the user (one question). `board` seats are inferred and stated in one line.
- Business presets: when `packs` in `config/brain.json` lists `mba` and the subject is business, the `board` and `specialists` seats come from `system/packs/mba/critique-presets.md`.
- A prescribed structure (rubric or school template) wins over the general principles; the `structure` lens says so in one line.
- On Pro, recommend the quick panel unless the deliverable is graded and final, or the deadline is within three days.

## Table

| Deliverable | Quick panel (recommended on Pro) | Full panel |
|---|---|---|
| Graded report or essay, with a rubric | `devils-advocate`, `premortem`, `grader` | `devils-advocate`, `premortem`, `board`, `specialists`, `grader`, `fact-check`, `structure` |
| Report or essay, no rubric | `devils-advocate`, `structure`, `fact-check` | `devils-advocate`, `premortem`, `board`, `fact-check`, `structure`, `signature`, `production` |
| Memo | `structure`, `devils-advocate`, `signature` | `devils-advocate`, `premortem`, `board`, `fact-check`, `structure`, `signature` |
| Proposal | `devils-advocate`, `premortem`, `structure` | `devils-advocate`, `premortem`, `board`, `fact-check`, `structure`, `signature`, `production` |
| Deck | `structure`, `devils-advocate`, `production` | `devils-advocate`, `premortem`, `board`, `fact-check`, `structure`, `signature`, `production` |
| Workbook | `model-audit`, `fact-check`, `devils-advocate` | `model-audit`, `fact-check`, `devils-advocate`, `premortem`, `specialists`, `production` |
| CV | `recruiter`, `signature`, `fact-check` | `recruiter`, `signature`, `fact-check`, `production`, `premortem` |
| Cover letter | `recruiter`, `signature`, `fact-check` | `recruiter`, `signature`, `fact-check`, `premortem` |
| CV and cover letter together | `recruiter`, `signature`, `fact-check` | `recruiter`, `signature`, `fact-check`, `production`, `premortem` |
| One-pager | `structure`, `devils-advocate`, `signature` | `devils-advocate`, `board`, `structure`, `signature`, `production` |

For a deliverable that is not in the table, start from the closest row and say which one you used.

## Graded assignments

`/assignment critique` uses the first row. Its quick panel is the old "lite" panel (devil's advocate, premortem, grader). The lenses it stores in `assignment.md` keep their ids. A user's own copy that says `lite` is read as `quick`.

## Asking

Use AskUserQuestion with the recommended panel first, each option with a one-line pro and con, for example:

- "Quick panel (recommended): three reviewers, light on your plan, no specialist check of the numbers."
- "Full panel: seven reviewers, finds technical and structural gaps, noticeably more of your plan."
- "Let me pick": list the lenses that apply, one line each.
