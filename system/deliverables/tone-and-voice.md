---
type: "reference"
title: "Tone and voice for deliverables"
status: "active"
---

# Tone and voice for deliverables

Two separate things. **Voice** is how the user writes: their rhythm, openers, habits and the things they never say. **Tone** is how formal the piece is. Tone is a dial on top of the user's voice. It never replaces it.

## Voice is always on

Every deliverable is drafted in the user's voice, from `vault/80_me/voice/<lang>/profile.md` and matching samples in `exemplars.md`.

- **No voice profile for that language:** say so once per session, in one line, and suggest the voice setup (onboarding step M5, `/onboard` voice). Do not fall back to a neutral house style unasked. Proceed only if the user wants to carry on now; then draft plainly and say that it will sound less like them.
- The anti-AI rules in `.claude/rules/writing.md` §2 apply at every tone, and a voice profile can add rules, never remove them.

## The tone dial

| Value | What changes | Typical use |
|---|---|---|
| `academic` | Fuller sentences, cited claims, hedged where the evidence is thin, the story kept quieter and shorter | Coursework, essays, theses |
| `professional` | Direct, concrete, answer first, little hedging, short paragraphs | Business reports, memos, applications, client work |
| `conversational` | Closer to speech, contractions, shorter sentences, first person | Posts, informal notes, some presentations |

**Where it is set.** An optional `tone` key on a programme note, course note, project note or assignment note, and in a deliverable's source front matter. The most specific wins:

deliverable, then project or assignment, then course, then programme, then the recommended default.

**Recommended default when nothing is set.**

| Context | Default |
|---|---|
| Learner kind `mba` | `professional` |
| Learner kind `degree`, `online` or `other`, for course work | `academic` |
| Learner kind `professional` | `professional` |
| Job applications | `professional` |
| No context | `professional` |

State the choice in one line when you start a deliverable ("Tone: professional, from your programme note. Say if you want it different.") and let the user override it for that deliverable. A rubric or school template that sets a tone wins; say so in one line.

## Storytelling inside the structure

Stories carry a point; they do not replace one. The structure in `principles.md` stays: answer first, then the support. Within it, by default:

1. **Situation, complication, question, answer, told as a narrative.** The reader should feel the problem before they see the solution.
2. **Answer first, then stakes.** What the reader gains or risks if they act or do not act.
3. **A real person or customer moment**, where one is available in the user's sources. One specific scene beats three general claims.
4. **Concrete specifics.** A number, a name, a date, a place, instead of "many" or "significant".
5. **Contrast.** What is against what could be; before against after; expectation against result.
6. **A close that calls back to the opening.** Return to the opening image, number or question and show what changed. Do not end on a tidy moral or an inspirational line (the writing rules ban that).

## Guardrails

- **No invented anecdotes or facts.** A story must come from the user's sources, the case material or something the user told you in chat. If there is none, write the point plainly and ask if they have a real moment to use. Never fill a gap with a plausible scene.
- **Academic tone keeps the story quieter:** one short illustrative example, no dramatic framing, citations carry the weight.
- **A rubric or school template that prescribes a structure wins.** Say so in one line, and use the storytelling moves inside it where it allows.
- Facts about the user come only from the fact sheet and USER.md, as in `system/packs/twin/drafting.md`.
- Nothing that leaves the computer carries bracket labels or placeholders (see `.claude/rules/writing.md` §2). Say "we assume" or "in our reading" instead.

## Group work

For a group deliverable, ask one question per deliverable: **"Sound like you, or a neutral team voice?"** Store the answer as `voice_mode: "me"` or `"team"` in the assignment note. With `me`, draft in the user's voice. With `team`, draft in a plain, professional register, still without the banned patterns, and say that it is not the user's voice.
