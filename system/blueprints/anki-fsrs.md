---
type: "blueprint"
title: "Smarter flashcard timing (FSRS) and Anki"
kind: "skill"
status: "available"
risk: "low"
cost: "free"
---

# Smarter flashcard timing (FSRS) and Anki

## What it does

Alterbrain's built-in flashcards use a simple five-box schedule. This add-on offers two upgrades:

1. **FSRS timing.** FSRS is a modern way to decide when you should see a card again. It adapts to how hard each card is for you. Example: an easy card comes back in three weeks, a hard one in three days.
2. **Anki link (optional).** Send your cards to the Anki app, if you already use it.

## You'll need

- Cards made with `/study` (they live in `vault/50_learning/cards/`).
- For the Anki link: the Anki desktop app with the AnkiConnect add-on, and `anki` turned on.

## Cost and risk

- Cost: free.
- Risk: low. It only changes card dates. Back up first (git does this for you).
- Honest limits: FSRS needs some review history before it beats the simple boxes. The exact formula and starting numbers must be taken from the official open-source description, not from memory [Unverified until checked in step 1].
- Two systems can disagree. Pick one place to review: the vault, or Anki.

## Questions I'll ask you

1. Do you want FSRS timing, the Anki link, or both?
2. How long a memory do you aim for? (Suggested: remember 90 per cent of cards when they come due.)
3. If you use Anki, should it become the only place you review?
4. How many new cards a day is comfortable?
5. Which topics first?

## Build steps

1. **Verify first.** Read the official FSRS description and reference code at the open-spaced-repetition organisation on GitHub. Record the algorithm version, the default parameters and the licence in a note. Do not type parameters from memory.
2. Run `/clarify` (type `skill`).
3. Propose a skill `my-fsrs` (`model: sonnet`, `effort: medium`) through `/propose`. After approval, `/build` scaffolds `.claude/skills/my-fsrs/` with a small zero-dependency `fsrs.mjs` script inside that folder. Do not edit anything in `system/`.
4. Extend the card frontmatter by **adding** fields, never renaming the existing ones (`box`, `due` keep working): `stability`, `difficulty`, `last_review`, `reps`, `lapses`.
5. The script reads a rating (again, hard, good, easy) per card, updates the fields and sets the new `due`. Existing Leitner cards get a starting state on their first review.
6. Teach `/study quiz` to call the script when `my-fsrs` exists. If the script fails, fall back to the Leitner schedule and say so.
7. Anki link (optional): add `anki` to `config/mcp.selected.json`, run `mcp-gen.mjs`, and push cards to one deck named "Alterbrain". Keep card ids in the card frontmatter as `anki_id`. Do not pull edits from Anki back into the vault without asking.
8. Record the build in `state/built.json`.

## How to test

1. Make three test cards. Rate them again, good and easy. Expect three different due dates.
2. Check that a card's `due` is a real date later than today.
3. For Anki: send one card and confirm it shows in the deck.

## How to undo

Use `/remove-skill my-fsrs`. The extra card fields are harmless and can stay. Remove `anki` from `config/mcp.selected.json` and run `mcp-gen.mjs`. The old Leitner schedule resumes.
