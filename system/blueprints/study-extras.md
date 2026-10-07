---
type: "blueprint"
title: "Study extras"
kind: "skill"
status: "available"
risk: "low"
cost: "Free. Anki export and FSRS need a small optional download. Canvas sync needs your school's Canvas access."
---

# Study extras

Add-ons for `/study`. Pick the ones you want. Each is built the safe way: Alterbrain proposes, you approve, then it builds.

## What it does

Six optional upgrades:

1. **Course setup from a syllabus.** You give a syllabus PDF. Alterbrain creates the course folder, the weekly sessions, the deadlines as tasks, and records the course AI policy with its quote. Example: "Set up Strategy 101 from this syllabus" gives `20_areas/courses/strategy-101/course.md` and 12 session notes.
2. **Lecture transcript ingest.** Drop in a recording transcript. It is saved raw, summarised per topic, and linked to the session note. Cards can then come straight from the lecture.
3. **Better scheduling (FSRS) or Anki export.** FSRS is a newer way to time reviews. It uses how hard each card felt. Or send your cards to Anki, a free flashcard app, to study on your phone.
4. **Canvas sync.** Pull deadlines, announcements and readings from your school's Canvas into the vault and the task list.
5. **Mastery map.** A single page that shows each topic of a course as weak, getting there, or strong, based on your card boxes.
6. **Exam mode.** A countdown plan to your exam date: which topics to review each day, with mock questions and a short final-week checklist.

## You'll need

- Alterbrain core set up (`/onboard` done) and a course in `vault/20_areas/courses/`.
- For 1: the syllabus as a file (PDF, Word or text).
- For 2: a transcript file (for example from your recording tool or Teams).
- For 3: either the `ts-fsrs` package (via Node, no Python needed) or an Anki install with the `anki-mcp` server. Check `system/catalogue/MCP-CATALOGUE.md` for the current entry before choosing.
- For 4: a Canvas access token or calendar feed from your school. Alterbrain never asks you to type a token in chat. You put it in `.env.local`.
- For 5 and 6: cards created with `/study`, and an exam date.

## Cost and risk

- Cost: free. Extra tokens are small.
- Risk: low. Everything stays in your vault.
- Canvas sync reads school data. Check your school's rules on automated access first. Read-only; nothing is posted to Canvas.
- Anki export copies card text out of the vault into a file you control.
- Changing the scheduling method does not change old cards until you agree.
- Exam mode and mastery map never predict your grade. They only show practice progress.

## Questions I'll ask you

Alterbrain asks these one at a time (`/clarify`, type `skill`):

1. Which of the six do you want first?
2. Which course is it for?
3. For setup: where is the syllabus file? Is the AI policy in it? (If it is not clear, the course is marked `unknown` and I will warn you before coursework.)
4. For transcripts: how do you get them, and in which language?
5. For scheduling: stay with simple boxes, move to FSRS, or export to Anki?
6. For Canvas: which school address, and do you want only deadlines or also readings?
7. For exam mode: exam date, how many days a week you can study, and what the exam covers.

## Build steps

Written for the agent. Follow `/build`. Scaffold into `.claude/skills/my-study-<slug>/`. Never edit `.claude/skills/study/` directly (it is a framework file).

1. **Course setup.**
   - Run `node system/scripts/ingest.mjs <syllabus>` so the file is stored raw with provenance.
   - Read the extracted text (or the file with Read if `text_status` is `pending`).
   - Create `vault/20_areas/courses/<slug>/course.md` with `type: "course"` and `code`, `term`, `school`, `ai_policy`, `ai_policy_quote` (verbatim quote, or `unknown` with an empty quote). Create `sessions/` with one note per week, `cases/` and `assignments/` folders.
   - For each deadline found, add a task: `node system/scripts/tasks.mjs add "<text>" --tag study --due <date> --link "20_areas/courses/<slug>/course"`. Label unclear dates `[Unverified]` and ask.
   - Show a summary before writing anything.
2. **Transcript ingest.**
   - `node system/scripts/ingest.mjs <file> --kind transcript`.
   - Write the source note in `vault/40_sources/notes/`, then a summary by topic in the session note, with citations in the SPEC format.
   - Offer `/study <topic>` for each main topic.
3. **FSRS or Anki.**
   - FSRS: add a small `.mjs` helper in the skill's `references/` that wraps `ts-fsrs` (pin the version; propose it as an MCP-free dependency only inside the skill folder, never in core). Grade scale: again, hard, good, easy. Store extra card fields (`stability`, `difficulty`, `state`) in frontmatter. Keep `box` and `due` working so the core skill still reads the card.
   - Anki: either export `.apkg`/CSV from the cards (front = Q, back = A, tag = topic), or use `anki-mcp` if the catalogue lists it and the user enabled it (`config/mcp.selected.json`, then `node system/scripts/mcp-gen.mjs`). Treat the Anki tools as writes: confirm before each batch.
4. **Canvas sync.**
   - Use an iCal feed URL or the Canvas API with a token from `.env.local` (`${CANVAS_TOKEN}` placeholder only). Never print the token.
   - Fetch read-only: assignments, due dates, announcements. Write them to the course note and as tasks. Skip anything already in the task list.
   - Set `config/autonomy.json` channel usage: reading is fine; do not post or submit anything.
5. **Mastery map.**
   - Read all cards for the course. Per topic: share of cards in box 4-5 is strong, box 2-3 getting there, box 1 weak.
   - Write `vault/50_learning/Mastery - <course>.md` with a table and a short plain-language note on what to do next. Use an Obsidian Base (`obsidian-bases` skill) for a live view if the user wants.
6. **Exam mode.**
   - Count days to the exam. Spread topics by weakness (from the mastery map). Write `vault/10_projects/<YYYY> <course> exam plan/plan.md` and add one task per study day with `#ab/study`.
   - Mock questions are generated only from the user's sources, with citations.
   - Final week: a checklist (rest, materials, logistics). No grade guarantees.

Add a short `/propose` card first (kind `skill`, model sonnet, effort medium) and wait for approval.

## How to test

- Course setup: use a synthetic syllabus (Alex Doe, Strategy 101, Rotterdam). Check the course note, the sessions and the tasks.
- Transcript: ingest a short sample. Check the source note and that re-ingesting says "duplicate".
- FSRS or Anki: run on three sample cards. Confirm the old `/study quiz` still works.
- Canvas: run against a sample feed file first.
- Mastery map: make 6 cards in different boxes. Check the table matches.
- Exam mode: set an exam date 10 days away and check one task per study day.
- Run `node system/scripts/validate.mjs` after building.

## How to undo

Run `/remove-skill my-study-<slug>`. It removes the skill and its entries in `state/built.json`. Your cards, course notes and tasks stay (they are your notes). Delete any you do not want by hand. If you enabled `anki-mcp`, remove it from `config/mcp.selected.json` and run `node system/scripts/mcp-gen.mjs`.
