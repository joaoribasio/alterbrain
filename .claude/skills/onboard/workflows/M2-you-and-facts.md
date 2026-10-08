# M2 You and your facts

**Goal:** a short profile of the user (`USER.md`), what they are learning or doing (it sets the defaults for the rest of set-up), and a list of confirmed facts that drafts may use (`fact-sheet.md`).
**Time:** about 5 minutes (less with a CV). **Essential.**
**Model / effort:** sonnet / medium. Pulling fields from a long CV or LinkedIn export: sonnet / medium in the main thread.

Say at the start: "Step 3 of 5: a few facts about you, so my drafts never make things up. A CV makes this much faster."

## Why a fact sheet (say this in one or two lines)

"I only use facts about you that are on your fact sheet. If something is missing, I ask or leave a gap. This stops me inventing a job title or a grade in a cover letter."

Then, in the same breath, the privacy trade-off (once, plainly): "This is your private brain, so it can hold sensitive facts too, such as health, family or nationality, if you want me to know them. They're stored in your private GitHub backup, and Claude (Anthropic) reads them when I use them in a session. Each fact is marked public or private. Only public facts go into anything that leaves your computer, unless you say yes for that one draft. The only things I never store are passwords and keys, card and bank account numbers, ID numbers (passport, BSN) and answers to security questions."

## Inference sources (ask for them first)

1. Ask: "Do you have a CV or a LinkedIn profile PDF on this computer? I can read it and fill most of this in." AskUserQuestion: Yes, here's the file (recommended) / I'll paste a few lines / No, just ask me.
   - **LinkedIn PDF tip:** "On LinkedIn, open your profile → **More** → **Save to PDF**."
   - The user gives a path (or drags the file into the chat). Read it with the Read tool.
2. Before saving a copy, check what the file shows. If it contains a number from the never-store list (a passport, BSN or other ID number, a bank account number or IBAN, a card number), say so and ask, because the saved copy would carry it into your online backup. AskUserQuestion: Use a version without it (recommended: your backup never holds it) / Save it anyway (I'll leave the number out of your facts, but the copy keeps it). Everything else in the CV (birth date, address, nationality, health or family details) is fine to keep.
3. Keep a raw copy with a source record: `node system/scripts/ingest.mjs "<path>" --kind pdf --origin "Shared during onboarding (CV)"`. Say: "I've saved a copy in your private sources, so every fact can point to it."
4. Also use: what they said in M1, `config/brain.json` (`user.name`, `timezone`, `languages`, `learner`).

## The learner question (first question, straight after the CV step)

Say in one line: "One question first, because it decides how I set up the rest."

Learner kind: `config/brain.json` `learner.kind`. If it is missing or empty, treat it as `mba` when `packs` lists `mba` or a `school` block exists (older installs); otherwise ask the onboarding learner question.

- **Kind already known** (stored, or read by that rule on an older install): confirm instead of asking. "I have you down as doing an MBA. Still right?" Yes (recommended) / Change it. On yes, still write `learner` (below), so it is recorded.
- **Re-run from `/reconfigure`** ("Change what I'm learning or doing"): show the current answer, ask the question below whatever is stored, then run M3 (`workflows/M3-programme.md`).

**Ask** (AskUserQuestion, header "You"): "What are you learning or doing right now? I'll set myself up around it."

| Label | Description |
|---|---|
| An MBA | Pro: switches on the MBA pack (25 business frameworks in your wiki, the case method and business reviewers for assignments). Con: assumes a programme with courses and graded work. |
| A university degree | Pro: courses, a programme note and AI-rule checks for graded work. Con: no business frameworks library (you can switch it on any time by saying so). |
| Online courses | Pro: each course stands alone with its provider (Coursera, edX and so on), rule checks only where the provider states a rule, self-paced deadlines. Con: no programme note and no after-class reminders unless a course has live sessions. |
| Working, not studying | Pro: no course set-up; I keep your focus areas and current projects instead. Con: course and assignment tools stay quiet until you add a course. |

The built-in **Other** takes a free line: "Tell me in one line." Kind `other`; the line goes into `learner.detail`.

**Recommended option.** Put the option the CV or the chat points to first, add "(recommended)" and one reason at the start of its description. Examples: "Your CV shows a full-time MBA at <school>." / "Your CV shows a bachelor's degree in progress." / "You mentioned Coursera." / "Your CV shows a current job and no programme." With nothing to go on, put **An MBA** first, marked (recommended), and say plainly that it is only a starting guess. Never infer from the school's name alone; a CV that shows an MBA completed years ago points to **Working, not studying**.

**Write the answer** (config edits are the only writes in this step):
1. Read `config/brain.json`. If it cannot be read, change nothing: say so in one plain line, add a task `Fix your settings file. Say /health-check` (`--tag onboard --priority high`), and use the answer for this conversation only. Note two things from it before you change anything: the **stored kind** (a valid `learner.kind`, or none) and the **old kind** (the stored kind, otherwise `mba` by the older-install rule above, otherwise none).
2. Set `learner` to `{ "kind": "<mba|degree|online|professional|other>", "detail": "<the user's line for other, otherwise empty>" }`.
3. Set `packs`: if it is not an array, make it `["core"]`. Then decide about `mba`; the first line that fits wins:
   - The answer equals the stored kind (a confirmation, or a re-run with the same answer): leave `packs` as it is.
   - The answer is `mba`: add `mba` if it is missing.
   - The old kind was `mba` and the answer is another kind: remove `mba`, because the user has stopped the MBA.
   - Anything else (a first answer that is not `mba`, or a move between kinds that are not `mba`): leave `mba` exactly as it is. A user who switched the frameworks on with `/reconfigure` keeps them on; nobody gets them without asking.

   Keep every other entry (`core`, `country-nl`) and every other key as it is.
4. Check the file: `node system/scripts/check-json.mjs config/brain.json`.
5. Run `node system/scripts/onboard-seed.mjs`. It reads `packs`, copies the MBA frameworks into `vault/30_wiki/frameworks/` when `mba` is listed, and never overwrites. If it copied frameworks, say so with the real count: "I added 25 business frameworks to your wiki." If the kind moved away from `mba`, say: "The frameworks already in your wiki stay."
6. Tell the user in one line what the answer switched on and how long the essentials now take (`estimate_minutes.remaining` from `node system/scripts/onboard-progress.mjs show --json`: "About 18 minutes to go."):

   | Kind | Switched on |
   |---|---|
   | `mba` | MBA pack; next step covers the programme and this term's courses; AI-rule checks; assignment studio with business reviewers |
   | `degree` | The same without the MBA pack |
   | `online` | Your courses with their provider; rule checks only where a provider states a rule; no term questions |
   | `professional` | Focus areas and projects instead of courses; course tools appear when you add a course |
   | `other` | Treated like a degree until you say otherwise |

   When the kind is not `mba` and `packs` does not list `mba`, add one line: "The 25 business frameworks are off. Tell me any time if you want them." (The switch is `/reconfigure`, "Switch the MBA frameworks on or off".)

## Questions (one at a time, only for gaps)

Prefill from the CV, then confirm in one go: "From your CV I have: … Is all of that right?" Ask only what is still missing:

1. **Name** as it should appear on documents, and what to call the user in chat. Suggest the first name from the CV ("Shall I call you Alex?"). If `vault/80_me/IDENTITY.md` still has no **I call you**, fill it with the confirmed answer.
2. **City and time zone.** Read the computer's zone first: `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`. Then one question, with that zone as the default: "Your computer is set to Europe/Amsterdam. Do you live there?" Yes, in <city> (recommended) / Somewhere else (free text for the city). Use the CV's city if it differs, and work out the zone from the city. If the command fails, ask only for the city. Never guess.
3. **Languages and levels.** "Which languages do you speak, and how well?" Explain levels in one line if needed: "A1–A2 = basic, B1–B2 = working, C1–C2 = fluent."
4. **Background in one line** (previous roles or field).
5. **Goals this year** (free text, 2–4 lines). Example: "Finish my certification by March."
6. **Visibility check.** Every fact gets `public` (fine on a CV or in an email to a stranger) or `private` (only when you ask for it in a specific draft). Defaults, no question needed: special-category facts (nationality, ethnicity, gender, sexuality, health and diseases, religion, politics, family, general finances), visa status, birth date, home address and salary are `private`; ordinary facts from the CV (name, programme or role, city, previous roles, languages) are `public`. Ask only when it is unclear, or when the user wants to change a default: "Should this be public (fine on a CV) or private (only when you ask)?" Default: private (recommended). Store sensitive facts freely when the user gives them; do not talk them out of it or leave them out.
   - If the user pastes a password, key, card or bank account number, ID number or security answer: do not repeat it or save it. Say "Keep that in a password manager; I don't store it." For a token, add "replace it, since it is now in this chat."
7. **Never say (optional).** "Anything I must never mention? For example a previous start-up or a gap year."
8. **How I write to you (optional).** "Anything I should never do when I write to you? For example long intros or too many bullet points." One line each under **How to work with me** in `USER.md`, in the form `- Never use long intros. (since YYYY-MM-DD)`. "Nothing" is fine.

What they are learning or doing needs no question of its own: it comes from the learner answer and the CV. The next step asks for the details (school or provider, courses, projects).

## Confirm, then write

Show the fact list as a short table (Fact | Exact wording | Visibility | Source). Ask: "Save these facts?" Save (recommended) / Change something. Write only confirmed rows.

- `vault/80_me/USER.md`
  - Fill **Profile** (including **Learning or working on**: the kind in plain words plus school, provider or role when the CV shows it, for example "Full-time MBA at <school>"; leave the details to the next step; a `USER.md` made by an earlier release calls this line **Studying**, so keep whichever label the file has), **Goals this year**, **Current focus** (leave for the next step if unknown).
  - Keep it under 4,000 characters. Check: `node system/scripts/check-json.mjs --length vault/80_me/USER.md` (prints the number of characters). If over, move detail to `fact-sheet.md`.
  - Only write what the user confirmed. No guesses.
- `vault/80_me/fact-sheet.md`
  - Add one row per confirmed fact, directly under the table header (no blank line). Format: `| Fact | Exact wording | public/private | Source | YYYY-MM-DD |`. Every row has a visibility; special-category facts are `private` unless the user chose `public`.
  - Source: `[[<source note name>]]` for the CV (use the name `ingest.mjs` reported), or `you told me`.
  - Add any "never say" items as bullets under **Never say**.
  - Leave the synthetic example comment block untouched.
- `config/brain.json`: set `user.name`, `user.timezone`, `user.languages` (ISO codes such as `en`, `nl`, `es`). Edit only those keys. (`learner` and `packs` were written above.)

## Files written

- `vault/80_me/USER.md`, `vault/80_me/fact-sheet.md`, `config/brain.json` (`learner`, `packs` and the `user` block).
- Raw CV/LinkedIn copy via `ingest.mjs` (in `vault/40_sources/`).
- `vault/30_wiki/frameworks/*.md` by `onboard-seed.mjs`, only when `packs` lists `mba` (an MBA answer, or a pack the user switched on earlier).

## Done criteria

- `config/brain.json` has a `learner.kind` and a `packs` list. A first answer of `mba` put `mba` in `packs`; a first answer of any other kind added nothing. A later answer changed `mba` only by the rule in step 3 (so a pack the user switched on is still on).
- USER.md has a name, what they are learning or doing, city, languages, background and at least one goal; it is under 4,000 characters.
- fact-sheet.md has at least 5 confirmed facts, each with visibility, source and date.
- `config/brain.json` `user` block is filled.

Then: `node system/scripts/onboard-progress.mjs done M2`.
