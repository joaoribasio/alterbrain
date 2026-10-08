---
type: "reference"
title: "Deliverable rules"
status: "active"
---

# Deliverable rules

Four short references that apply to every report, deck, workbook, memo, CV, letter or essay Alterbrain helps produce. They are core: they do not depend on a school, a programme or a pack. A school template or a rubric can override the structure rules, and the references say so where it matters.

| File | What it is | Who reads it |
|---|---|---|
| `principles.md` | How a document or deck is built: answer first, storyline before slides, action titles, one message per slide, chart and number rules. Says which rules a script checks and which the structure lens judges. | Drafting (`assignment`, `render`, `jobs`), the structure lens, the delivery gate |
| `delivery-gate.md` | The one checklist before telling the user to upload: cover, file names, every page viewed, workbook values, agreeing numbers, size, label scan. Alterbrain never uploads. | `render` final, `/assignment ship`, `/jobs apply`, any skill that hands over a file |
| `tone-and-voice.md` | Tone as a dial on top of the user's own voice (academic, professional, conversational), how it is chosen, storytelling inside the structure, group work, and what to do when there is no voice profile. | `ghostwriter`, drafting skills, the signature lens |
| `rehearsal.md` | The rehearsal pack offered once after a deck is approved: speaker notes, timing plan, likely questions with short answers, one-page cheat sheet. | `render`, `assignment`, the user |

Scripts behind the gate: `node system/scripts/deliver-check.mjs`, `release-scan.mjs`, `workbook-check.mjs`, `pages.mjs`, and `template.mjs resolve` for the upload limit, the page limit, the fonts and the house rules (the main session reads a file-name rule from the house rules).

These files are written in our own words. They name well-known methods (the Minto pyramid, SCQA, MECE, Duarte's contrast arc) without quoting them.
