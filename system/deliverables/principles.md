---
type: "reference"
title: "Presentation and document principles"
status: "active"
---

# Presentation and document principles

One reference for how reports, memos, decks and one-pagers are built. Drafting follows it, the delivery gate checks the mechanical parts, and the structure lens judges the rest.

**Rubric and template win.** If a rubric, a school template or the employer's format prescribes a structure, use it and say so in one line ("Your rubric sets the section order, so I follow it."). The principles then apply inside that structure.

## 1. Argument

- **Answer first (pyramid).** Open with the conclusion or recommendation, then the two to four reasons that support it, then the evidence under each. A reader who stops after the first page still has the answer.
- **Situation, complication, question, answer (SCQA).** Frame the opening as: the situation the reader already accepts, what changed or went wrong, the question that raises, and your answer. In a report this is the first paragraph. In a deck it is the first two slides.
- **MECE.** Groups of reasons or options should not overlap and should cover the whole question. Test it by asking what a reader could add that fits none of the groups.
- **Storyline first.** Before building slides or sections, write the ghost deck: the list of titles, in order, as full sentences. The user approves it. Only then do you build the pages. Changing the storyline later is cheap; changing built slides is not.
- **Executive summary up front.** Anything longer than two pages starts with a summary that stands alone: the answer, the three strongest reasons, the ask.
- **Appendix for backup.** Detail the reader may want but need not read goes at the back, referred to from the page that depends on it.

## 2. Titles and logic

- **Action titles.** A slide or section title is a full-sentence takeaway ("Freight costs, not demand, explain the margin fall"), not a topic ("Margins"). At most two lines on the page.
- **Horizontal logic.** Read only the titles, in order: they should tell the whole story and make sense as a short memo.
- **Vertical logic.** Under each title, everything on the page proves or explains that title. Anything that does not, moves or goes.
- **One message per slide.** If a slide needs "and" in its title, it is two slides.

## 3. Charts, numbers and sources

- **Chart choice follows the message.** Comparison between items: bars. Change over time: lines. Parts of a whole: a stacked bar or a single labelled bar. Relationship between two measures: a scatter. Avoid pies for more than three parts and avoid 3D.
- **Highlight the key number.** One colour for the point being made, a quiet grey for the rest. Label lines and bars directly instead of using a legend.
- **Chart titles state the so-what** ("Sales fell 12% after the price rise"), with the measure and unit in a small subtitle.
- **Source line on every data slide or table.** "Source: Company annual report 2025, p. 14." Also name the date of the data when it matters.
- **Consistent numbers and units.** The same figure reads the same in the text, the chart, the deck and the workbook: same rounding, same currency, same period. Say "EUR m" or "%" once and keep it.
- **Colour-blind-safe contrast and a minimum font size.** Do not rely on red against green. Body text at least 14 pt in a presenting deck and 11 pt in a reading deck or report, unless the template sets other limits.

## 4. Two kinds of deck

- **Reading deck** (sent, studied alone): self-explanatory slides, an "In brief" box with the takeaway, sources, footnotes, a tracker showing where the reader is. More text is fine because nobody is speaking.
- **Presenting deck** (spoken): minimal text, one visual or one claim per slide, the content in speaker notes. Add speaker notes and a timing plan: roughly one to two minutes per content slide, with the total checked against the time slot.
- Decide which one at the start. The template's `style` (`reading-deck` or `presenting-deck`) sets the default.

## 5. Making the audience care

- **What is and what could be.** Alternate between how things are now and how they could be, ending on the "could be" with what it takes. The contrast is what keeps people listening.
- **Hook and stakes.** The first page or slide says why this matters to this reader and what is at risk. Open with a specific fact, a customer moment or a surprising number, not a definition.
- Tone and storytelling rules are in `tone-and-voice.md`.

## Checked by the delivery gate (mechanical)

`deliver-check.mjs` runs these on slides (`.pptx` and deck `.qmd`):

- every slide title after the cover is a sentence of 4 or more words and at most 90 characters;
- a slide with a chart or table has a line starting "Source";
- no honesty labels, working citations or placeholders anywhere in the files, including the front matter of a report (a file that cannot be read fails as not checked);
- a file-name rule, once the main session has turned the rule in the template or course note into a regular expression (`--name-pattern`).

The page limit and the fonts are not checked by the script. The main session reads them from the resolved template and checks the rendered pages (`pagecount.mjs` and `fonts.mjs` under `system/quarto/tools`, or by looking). The rubric or template still wins: a prescribed title that the script rejects is waived out loud (see `delivery-gate.md`).

## Judged by the structure lens

Answer first, SCQA, MECE, storyline and horizontal logic, vertical logic, one message per slide, whether the summary stands alone, chart choice for the message, whether numbers agree across files, and whether the template's house rules are met in spirit. The lens reports findings with the page they refer to; the main session decides with the user what changes.
