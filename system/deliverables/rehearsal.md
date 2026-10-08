---
type: "reference"
title: "Rehearsal pack"
status: "active"
---

# Rehearsal pack

Offered once, after the user approves a deck: "Want a rehearsal pack for this deck?" Not offered again for the same deck unless they ask. It is optional and never blocks delivery.

## What it contains

1. **Speaker notes in the user's voice.** One note per content slide, written into the deck's `::: {.notes}` blocks in the source `.qmd`. Voice from `vault/80_me/voice/<lang>/profile.md` at the deck's tone (`tone-and-voice.md`); a presenting deck carries most of its content here, a reading deck needs only short notes. If there is no voice profile, say so once and suggest the voice setup.
2. **A timing plan.** A table of slide number, title, minutes and the point to land. Total time against the slot the user gave (ask for it if unknown). Roughly one to two minutes per content slide; mark the slides to cut first if time runs short.
3. **The ten most likely audience questions, with short answers.**
   - Take them from the devil's-advocate lens. Reuse the latest devil's-advocate review of this deck if one exists (`reviews/` next to the deck, or the assignment's review folder). Otherwise run the lens on `helper-judgement` first.
   - For each question: the question as the audience would ask it, a two-to-three sentence answer using only facts from the deck, the sources and the user's fact sheet, and the slide to go to. If the deck cannot answer one, say so as a gap to close, not a made-up answer.
4. **A one-page cheat sheet.** The answer in one sentence, the three or four numbers to remember (with units and sources), the order of the slides, the opening line and the closing line, and the three hardest questions.

## Where it is written

`rehearsal.md` (frontmatter `type: "rehearsal"`) next to the deck source. The speaker notes go into the deck source itself; show the user the diff of what changed in the deck.

## Rules

- Answers use only facts that are in the deck, its sources, the fact sheet or what the user said in chat. No invented anecdotes, numbers or quotes.
- **Speaker notes ship inside the `.pptx`, so they follow the outbound gate** (`system/packs/twin/drafting.md` section 5): only `public` facts. A `private` or special-category fact (health, finances, family, nationality and the like) goes into a note only if the user says so in this chat for this deck. Audience questions such as "why did you leave your last job?" are answered from `public` facts, or flagged as a gap for the user, never filled from a private one.
- Do not put other people's sensitive details (a teammate, an interviewee, a case contact) in the notes.
- The cheat sheet and the Q&A stay in `rehearsal.md` in the vault. They are not copied into the shipped deck.
- The main session reads the notes and the cheat sheet itself before saying it is ready. If a helper drafted them, check them against the deck.
- If the deck changes, the notes and the cheat sheet may be out of date: offer to refresh them.
- Rendering a deck after adding notes goes through the delivery gate again (`delivery-gate.md`), including the labels scan, because speaker notes leave the computer with a `.pptx`.
