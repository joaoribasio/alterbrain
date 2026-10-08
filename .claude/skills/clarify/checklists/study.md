# Clarify checklist: study

**Use for:** `/study <topic>`. Light checklist: ask one question at a time, and only what the vault doesn't show.

## Infer first

- `vault/20_areas/courses/` (which course the topic belongs to, if any; offer matches as choices).
- `vault/50_learning/cards/` (cards already made on this topic).
- `Tasks.md` and `course.md` (exam dates).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "Which topic exactly?" | none: must ask |
| Inputs | "Use your notes and sources on it?" | yes |
| Output | "Explanation, cards, or both?" | both: a short explanation + 5–10 cards |
| Audience | you | you |
| Constraints | "How deep: quick overview, solid understanding, or exam-ready?" | solid understanding |
| Deadline | "Is there an exam date?" (optional) | from `course.md` if listed; otherwise none |
| Success test | "How will you know you've got it?" | you can explain it in your own words and score 80% on the cards |

## Type-specific

- **Course.** Only if one applies: which one (multiple choice from the vault). A topic from work or the user's own reading needs none.
- **Sources missing?** If the vault has nothing on the topic, offer `/ingest` (add the slides) or a quick research step first.
- **Coursework check.** Study help is for learning, not for graded answers. If the topic is a graded question, point to `/assignment` and its AI-policy notice.

## Ready when

- Topic is known; course known if one applies.
- Depth is set.

## Where the brief goes

No file. Pass the brief to `/study` in chat.
