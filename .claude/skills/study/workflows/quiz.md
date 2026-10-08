# Quiz workflow

Used by `/study quiz [topic]`. No clarify step: go straight here.

## 1. Collect due cards

1. Get today's date from the system.
2. List `vault/50_learning/cards/**/*.md`. Read the frontmatter of each (Grep for `^due:` and `^status:` is enough to start).
3. Keep cards where `status: "active"` and `due` is on or before today. If a topic was given, keep only the matching folder or `topic:` link.
4. Sort: oldest `due` first, then lowest `box`.
5. If there are none: say "Nothing is due today", show the next due date, and offer `/study <topic>` for new cards. Stop.
6. If there are more than 15: ask "There are N due. Do 10 now?" (10, all, or stop). Keep quizzes short.

Tell the user the count: "N cards. Answer in your own words. There is no wrong way to phrase it."

## 2. Ask, one at a time

For each card:

1. Show only the `Q:` line, and "Card 3 of 8".
2. Wait for the user's answer. Do not show the answer early.
3. Allow "skip" (counts as wrong, no judgement) and "stop" (go to the summary).

## 3. Grade kindly

Grading may be delegated to the `helper-triage` agent (haiku / low). Give it only the question, the correct answer and the user's reply.

- **Right:** the key idea is there, even if the wording differs. A small slip in a detail is still right if the idea is sound. Say so warmly.
- **Partly right:** schedule it as wrong, but say first which part was right.
- **Wrong:** say it gently. Never mock or hurry.

After grading, always show:

- the correct answer (from the card);
- the source: `[[Source Note Name]]` from the card's `source`;
- one short hint for next time if the answer was wrong.

If the user disagrees ("I think my answer was right"), re-check against the source. If they have a point, change the grade and say so.

## 4. Update the card

Edit only `box` and `due` in the frontmatter. Leave the body and everything else alone.

- Right: `box = min(box + 1, 5)`.
- Wrong or skipped: `box = 1`.
- New `due` = today plus the days for the new box: box 1 = 1, box 2 = 3, box 3 = 7, box 4 = 16, box 5 = 35.

Date arithmetic: `node system/scripts/date.mjs --plus N` with N filled in. It uses your local date, the same as the session digest.

## 5. Summarise

After the last card (or "stop"):

- Score: "6 of 8 right."
- Moved up: how many cards, and any that reached box 5 ("well remembered").
- Needs work: topics with wrong answers, with a one-line tip each.
- Next review: the earliest `due` date across all active cards, and how many are due then.
- Offer: "Want me to explain the tricky ones again with `/study <topic>`?"

## 6. Update the review task

1. Tick today's task: `node system/scripts/tasks.mjs done "Review N cards"` using the exact text of today's line.
2. Find the earliest `due` date among all active cards. If it is today or earlier (cards you skipped), use tomorrow. Count the cards due on or before that date.
3. If a "Review ... cards" task already exists for that date, tick it first, so there is one task per day.
4. If any cards remain, add the next one:
   `node system/scripts/tasks.mjs add "Review N cards" --tag study --due <that-date> --priority medium --link "50_learning/cards"`

## 7. Do not

- Do not reveal answers before the user replies.
- Do not change the question or answer text of a card during a quiz.
- Do not delete cards. To retire a card the user finds useless, set `status: "retired"` (ask first).

## 8. Edge cases

- A card has no `source` or a broken link: still ask it. Say "I can't find the source note for this one" and offer `/ingest`.
- A card is missing `box` or `due`: treat it as box 1, due today, and fix the frontmatter after grading.
- The user answers in another language: grade the idea, not the language.
