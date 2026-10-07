# Clarify checklist: study

**Use for:** `/study <topic>`. Light checklist: ask one question at a time, and only what the vault doesn't show.

## Infer first

- `vault/20_areas/courses/` (which course the topic belongs to; offer matches as choices).
- `vault/50_learning/cards/` (cards already made on this topic).
- `Tasks.md` and `course.md` (exam dates).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "Which topic exactly?" | none: must ask |
| Inputs | "Use your course notes and sources on it?" | yes |
| Output | "Explanation, cards, or both?" | both: a short explanation + 5–10 cards |
| Audience | you | you |
| Constraints | "How deep: quick overview, solid understanding, or exam-ready?" | solid understanding |
| Deadline | "Is there an exam date?" | from `course.md` if listed |
| Success test | "How will you know you've got it?" | you can explain it in your own words and score 80% on the cards |

## Type-specific

- **Course.** Which one (multiple choice from the vault).
- **Sources missing?** If the vault has nothing on the topic, offer `/ingest` (add the slides) or a quick research step first.
- **Coursework check.** Study help is for learning, not for graded answers. If the topic is a graded question, point to `/assignment` and its AI-policy notice.

## Ready when

- Topic and course are known.
- Depth is set.

## Where the brief goes

No file. Pass the brief to `/study` in chat.
