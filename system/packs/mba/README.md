# The MBA pack

This pack gives Alterbrain what an MBA student needs most. It has five parts.

## What is in it

1. **Assignment studio** (`/assignment`). It helps you plan, draft, test and polish a piece of coursework. You give it the brief. It checks the rules, builds an outline, drafts with you, and runs a set of critics over the result before you hand in. The critics (called lenses) live in `system/packs/mba/lenses/`.
2. **Frameworks library** (`system/packs/mba/frameworks/`). 25 short notes on the models you meet in an MBA, such as Porter's Five Forces, VRIO and DCF. Each note is written the same way, so they are easy to scan and use. See the list below.
3. **Jobs in the Netherlands** (`/jobs`). It searches for roles, checks which firms can sponsor a visa, and drafts applications for you to review. It never sends anything on its own.
4. **Study** (`/study`). It turns your notes and readings into flashcards, schedules reviews, and quizzes you (`/study quiz`).
5. **Course setup** (`/course`). When a course starts, it asks for everything you have for it (syllabus, slides, readings, cases, Excel models and data files, briefs and rubrics, past exams), keeps an untouched copy of each file, reads the syllabus for the deadlines and the AI rule, and lists the material in the course note. It then tells you what is still missing. Later in the term it asks for new material when you mention it, and the session summary reminds you after each class. The procedure is `course-setup.md` in this folder.

## How the frameworks get into your vault

You do not copy anything yourself. During `/onboard`, Alterbrain copies the notes from `system/packs/mba/frameworks/` to `vault/30_wiki/frameworks/` in your Obsidian vault. From then on:

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
