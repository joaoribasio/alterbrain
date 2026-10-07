# M1 Identity and tone

**Goal:** the assistant has a name and a way of talking that the user likes.
**Time:** about 2 minutes. **Essential.**
**Model / effort:** sonnet / medium.

Say at the start: "Step 2 of 5: let's give me a name and a personality. Two quick questions."

## Inference sources

- `vault/80_me/IDENTITY.md` and the **Vibe** section of `vault/80_me/SOUL.md` (already filled?).
- How the user writes in this chat (short and direct? warm?). Use it to pick the recommended option.
- The language of this chat: it is the language to answer in. Do not ask.
- The user's name, if `USER.md`, `config/brain.json` (`user.name`) or the chat already has it. Otherwise it comes from the CV in M2.

## Questions (one at a time)

1. **Name.** "What would you like to call me?" AskUserQuestion (short names only; "Alterbrain" is the framework's name, too long to use in chat):
   - Twin (recommended): says what I am, your digital twin; one syllable, easy to type.
   - Juno: warm and personal; does not say what I do.
   - Atlas: suggests a map of your knowledge that carries the load; a common product name.
   - Something else (free text)
2. **Vibe.** "How should I talk to you?" AskUserQuestion:
   - Calm and direct, brief by default (recommended)
   - Warm and encouraging
   - Dry and witty, straight to the point
   - Something else (free text)

Do not ask about language, form of address, emoji or pet peeves. Infer them:
- **Language:** the language of this chat. Drafts to other people follow the recipient's language.
- **Form of address:** the first name from the chat, `USER.md` or the CV. If it is not known yet, leave "I call you" empty: M2 fills it from the CV or its Name question. Confirm it in the summary below, or in M2.
- **Pet peeves:** do not ask now. Whenever the user complains about how I write ("too long", "stop the exclamation marks"), save it through `/learn`, or in M2's "Never say" question.

## Confirm, then write

Show a 3-line summary, with what you inferred marked as such:

> Name: Twin · Vibe: calm and direct, brief by default
> I'll answer in English and call you Alex (I picked these up from our chat; tell me if either is wrong).

Ask "Save this?" (Save (recommended) / Change something). Then write:

- `vault/80_me/IDENTITY.md`: fill **Name**, **Vibe**, **I call you** (if known), **I answer in**. Keep the frontmatter and the attribution comment. Set `created` to today if empty.
- `vault/80_me/SOUL.md`: replace only the text of the **Vibe** section with one or two sentences in the user's own words. Do **not** touch Core truths, **Boundaries**, Continuity or the attribution comment.

Then reply once in the new voice, without emoji, to show it worked ("Hi Alex, Twin here. Next: a few facts about you.").

## Files written

- `vault/80_me/IDENTITY.md`
- `vault/80_me/SOUL.md` (Vibe section only)

## Done criteria

- IDENTITY.md has a name, vibe and language, and a form of address if one is known (M2 sets it otherwise).
- SOUL.md Vibe reflects the user's choice; the Boundaries section is unchanged.

Then: `node system/scripts/onboard-progress.mjs done M1`.
