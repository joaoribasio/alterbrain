# The MBA pack

This pack adds what is specific to an MBA (or other business programme) on top of Alterbrain's core. It is on when `packs` in `config/brain.json` lists `mba`. Onboarding adds it when you say you are doing an MBA, and `/reconfigure` can switch it on or off.

## What is core, not in this pack

These work for every learner, with or without this pack:

- **Course setup** (`/course`): the syllabus, slides, readings, data files, briefs and exams of each course, with the AI rule and deadlines. The procedure is `.claude/skills/course/references/course-setup.md`.
- **The assignment studio** (`/assignment`): set-up, research brief, Quarto draft, blind reviewer panel and final PDF. Its reviewer briefs live in `.claude/skills/assignment/references/lenses/`, and its note templates in `system/templates/notes/`.
- **Study** (`/study`): flashcards and spaced-repetition quizzes from your own notes.
- **Job search** (`/jobs`): finding and ranking vacancies and preparing drafts. The checks for one country (Netherlands first) are in a country pack, `system/packs/country-nl/`, not here.

## What is in it

1. **Frameworks library** (`system/packs/mba/frameworks/`). 25 short notes on the models you meet in an MBA, such as Porter's Five Forces, VRIO and DCF. Each note is written the same way, so they are easy to scan and use. See the list below.
2. **Case method** (`system/packs/mba/templates/case.md`). The case note template, with the case date the reviewers need for the hindsight rule, the exhibits table and the traps. `/assignment` uses it when the assignment is a case.
3. **Business critique presets** (`system/packs/mba/critique-presets.md`). Seat suggestions for the board and the specialists when `/assignment critique` reviews a business assignment: a CFO or a buyer, a treasurer or a consultant, an audit partner or a valuation expert, and specialist fields such as valuation or competition law.
4. **MBA wording.** Menus, examples and onboarding questions that speak about business, a programme and "after the programme" use this wording while the pack is on. Without it they use neutral words.

## How the frameworks get into your vault

You do not copy anything yourself. During `/onboard`, Alterbrain copies the notes from `system/packs/mba/frameworks/` to `vault/30_wiki/frameworks/` in your Obsidian vault, but only when `packs` lists `mba`. From then on:

- The notes are yours. Edit them, add your course examples, link them to your cases.
- Other skills find them by their title, for example `[[Porter's Five Forces]]`.
- If you break one, copy the original again from the pack folder.

## What each framework note contains

Every note has the same sections:

1. A one-line definition.
2. When to use it, and when not to.
3. The inputs you need.
4. Step-by-step instructions.
5. Common pitfalls (what professors mark down).
6. A short worked example with made-up numbers.
7. Questions to ask yourself.
8. Related frameworks, as links.
9. Sources: the original author, work and year.

The header (frontmatter) of each note records its `family`, `when_to_use` and `sources`, so Alterbrain can search the library.

## The 25 frameworks

**Strategy**
[[Porter's Five Forces]] · [[Porter's Generic Strategies]] · [[Value Chain]] · [[SWOT]] · [[PESTEL]] · [[VRIO]] · [[BCG Growth-Share Matrix]] · [[Ansoff Matrix]] · [[Blue Ocean Strategy (ERRC grid)]]

**Business models and customers**
[[Business Model Canvas]] · [[Value Proposition Canvas]] · [[Jobs to Be Done]] · [[Disruptive Innovation]]

**Marketing**
[[Marketing Mix (4Ps and 7Ps)]] · [[Segmentation-Targeting-Positioning]] · [[Customer Lifetime Value and CAC]]

**Finance**
[[Unit Economics]] · [[Discounted Cash Flow Valuation]] · [[WACC]] · [[Valuation by Multiples]]

**Organisation and change**
[[McKinsey 7S]] · [[Kotter's 8-Step Change Model]] · [[Stakeholder Mapping (Power-Interest)]]

**Communication and problem solving**
[[Pyramid Principle and SCQA]] · [[MECE Issue Trees]]

## Using the library well

- Pick a framework because it fits the question, not because it is familiar.
- Use two or three frameworks together, and say why.
- Always add evidence and a conclusion. A framework with no "so what?" loses marks.
- Check the course rules on AI help before using Alterbrain on graded work. The assignment studio will remind you.

## Notes for maintainers

- File names are the exact note title plus `.md`. The slash in "4Ps/7Ps" is not allowed in file names, so that note is called `Marketing Mix (4Ps and 7Ps)`.
- Examples are synthetic. Do not add real people or real company data.
- Cite the original author, work and year. Add a link only if you are sure it is correct.
- Release 0.2.0 moved the six reviewer briefs (`lenses/`), four note templates (`assignment`, `rubric`, `decisions`, `critique`) and the Netherlands job guides (`jobs-nl/`) out of this pack. The CHANGELOG lists each old and new path under Moved, and upgrade `0005-moved-file-edits` tells a person who edited an old copy. Any later move needs the same two things.
- This pack holds only MBA content. A change to course setup, the assignment studio, study or the job search belongs in the core files named above, and a change to the Netherlands job search in `system/packs/country-nl/`.
