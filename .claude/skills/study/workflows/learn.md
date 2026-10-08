# Learn workflow

Used by `/study <topic>`. Read after the clarify step in `SKILL.md`.

## 1. Find the sources

Search in this order. Use Grep and Glob on the vault, then Read the best hits.

1. `vault/20_areas/courses/<course>/` (course.md, sessions, cases), only when a course applies.
2. `vault/40_sources/notes/` (one note per ingested file). Follow the `raw` and text links if the note is thin.
3. `vault/30_wiki/` (concepts, frameworks, topics).

Try the topic name, plural and singular, and two or three synonyms. Without a course, sources 2 and 3 are all there is: that is enough. Keep a list of the notes you used. Each one needs a link and a date for the citation (use its `created` or `ingested` date).

If you find nothing, say so in one line. Offer two choices (AskUserQuestion, recommended first):

- "Add your material": run `/ingest` on slides, readings or transcripts.
- "Research it for me": the `researcher` agent captures sources into the vault first.

Do not go on to explain from memory.

## 2. Explain (Feynman style)

Keep it short enough to read in two minutes.

1. **In one sentence:** what is it, as you would tell a friend?
2. **Analogy:** one everyday comparison.
3. **The idea in plain words:** three to six short sentences. Explain any term in one line.
4. **Worked example:** a small, concrete case. Use the course example if the sources have one (or an example from the user's own work or reading).
5. **Common mistake:** one thing learners often get wrong, if the sources say so.
6. **What your notes do not cover:** a bullet list. Offer `/ingest` or research.

Every factual sentence carries a citation: `[Source: [[note]] | YYYY-MM-DD | confidence: high|medium|low]`. Use `high` for direct statements in lecture or reading notes, `medium` for summaries, `low` for thin or secondhand notes. Mark anything else `[Inference]` or `[Unverified]`.

Then ask: "Does that make sense? Tell me which part feels shaky." Adjust once if needed.

## 3. Write the cards

Aim for 5 to 10 cards. Scale by depth: overview 5, solid 7, exam-ready 10. Fewer if the sources are thin. Never pad.

Rules for good cards:

- **Atomic:** one idea per card.
- **Mix:** at least two recall cards ("What are the five forces?") and at least two application cards ("A new airline enters a route. Which force rises, and why?").
- **Self-contained:** the question makes sense without the explanation.
- **Short answers:** one to three lines.
- **Sourced:** every card links to the source note it came from.

### File

Path: `vault/50_learning/cards/<topic-slug>/<Card title>.md`

- `<topic-slug>` is kebab-case (`porter-five-forces`).
- `<Card title>` is Title Case, short and unique in the folder, for example `Porter - Threat of new entrants.md`. Never two names that differ only by case. If a name exists, add a number.
- If a card for the same question already exists, update it instead of duplicating it.

Content:

```
---
type: "card"
created: "<today>"
topic: "[[Topic Note Name]]"
source: "[[Source Note Name]]"
box: 1
due: "<tomorrow>"
status: "active"
---
Q: <question>
A: <answer>
```

- `topic` links to the wiki concept or framework note if one exists. If not, link the best source note, and mention that a wiki page could be created.
- `due` is today plus one day: `node system/scripts/date.mjs --plus 1`.
- Strings in double quotes. No other keys.

Before writing, show the list of card questions. Wait for a yes (or edits). Then write.

## 4. Create the review task

Count the cards due tomorrow across the whole `cards/` folder, not only the new ones. Then:

```
node system/scripts/tasks.mjs add "Review N cards" --tag study --due <tomorrow> --priority medium --link "50_learning/cards/<topic-slug>"
```

If an open "Review M cards" task already has the same due date, tick it first (`node system/scripts/tasks.mjs done "Review M cards"`) and add the new one with the combined count. One task per day.

## 5. Finish

Tell the user, in three lines:

- how many cards were made and where;
- when the first review is;
- what to do next (`/study quiz` tomorrow, or add the missing material).
