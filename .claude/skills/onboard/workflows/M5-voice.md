# M5 Your writing voice

**Goal:** one voice profile and one set of real examples per language the user writes in, so drafts sound like them.
**Time:** about 15 minutes of the user's time (exports can take longer to arrive). **Optional.**
**Model / effort:**
- sorting and cleaning sent mail: `mail-reader` agent (haiku / low);
- statistics: `system/scripts/voice-stats.mjs` (script);
- choosing exemplars, read-back, blind test: sonnet / medium;
- **writing the profile: opus / high**, as a subagent (judgement pass).

Say at the start: "This one teaches me how you write: your openings, sign-offs, sentence length, the words you'd never use. About 15 minutes."

## The process lives in one place

Follow **`system/packs/twin/voice-import.md`** step by step. It is the single source of truth for sources, cleaning, exemplars, stats, the profile, the read-back and the blind test. This file only adds the onboarding wrapper. If that file is missing, stop, add a task `Voice setup is missing a framework file. Run /health-check` (`--tag onboard --priority medium`) and mark this module `later`.

## Privacy in this module

Say it once, in plain words, before reading anything: "I keep your own writing as you wrote it, even when it's about health, family or money. I leave out other people's words, because they would blur your voice, not for privacy. The one thing I strip from your own text is a password, card or bank number, ID number or security answer, which I never store. The finished voice files sync to your private GitHub backup, and Claude reads them in sessions." Details: `voice-import.md` §0 and §8, and `system/docs/guides/privacy-and-data.md`.

## Inference sources

- `config/brain.json` `user.languages` (which languages to cover).
- `node system/scripts/onboard-progress.mjs show`: the M5 `note` says which languages are already done.
- Existing `vault/80_me/voice/<lang>/profile.md` (only redo a language if the user asks).
- Whether Gmail is connected (if not, voice-import offers documents and the LinkedIn export instead; Gmail can be added later via M7).

## Questions (the wrapper)

1. "Which languages do you write in for work or study?" Confirm from `user.languages`: "I have English and Spanish. Shall I do both?" AskUserQuestion: Both (recommended) / Only English / Add another.
2. Per language, follow voice-import.md sections 1 to 7. One question at a time. Recommended option first.

## Key commands (from voice-import.md)

- Stats: `node system/scripts/voice-stats.mjs "state/local/tmp/voice/<lang>/corpus.md" --lang <lang> --out "vault/80_me/voice/<lang>/stats.json"`. It prints JSON and, with `--out`, also saves it (there is no `--json` flag). That file is the baseline `voice-stats --check` reads by default.
- Exemplars and profile register rows use the seven recipient classes of `system/packs/twin/drafting.md` §3: `faculty`, `school-staff`, `recruiter`, `professional`, `peer`, `close`, `group`.
- Profile: an **opus / high** subagent fills `system/templates/voice/profile.md` from the exemplars and the baseline stats, and writes `vault/80_me/voice/<lang>/profile.md`.
- Read-back (voice-import.md §6), always in this order:
  1. Show what was discovered (sources and gaps, signature habits with tiny quotes, do/never, covered registers), each marked measured or inferred, and let the user correct it.
  2. Write a 120–180-word sample in their voice on a topic they pick (default: opening a class presentation).
  3. Only then ask "Does this sound like you?"
- Blind test: 5 pairs (one real held-out message, one `ghostwriter` draft from a neutral brief). The user guesses which is theirs. 0–3 correct = pass. 4–5 = ask what gave it away, update the profile, at most two rounds.

## Saving progress between languages

After each language: `node system/scripts/onboard-progress.mjs start M5 --note "done: en (high); next: es"`. If the user stops: `node system/scripts/onboard-progress.mjs later M5 --note "<same style>"` and the usual task.

## Files written

- `vault/80_me/voice/<lang>/exemplars.md`, `vault/80_me/voice/<lang>/profile.md` (with `blind_test` in frontmatter) and `vault/80_me/voice/<lang>/stats.json` (baseline numbers).
- Optional `## How I think` bullets in `vault/80_me/USER.md` (only with the user's OK; stay under 4,000 characters).
- Working files only in `state/local/tmp/voice/` (gitignored), deleted at the end if the user agrees.

## Done criteria

- Every language the user chose has a profile and exemplars, or is explicitly marked "not set up" with a task to add samples.
- The read-back got a "Yes" or the requested changes were made.
- The blind test ran at least once per profiled language (or the user declined it).
- The user was asked whether to delete raw material.

Then: `node system/scripts/onboard-progress.mjs done M5 --note "<langs and confidence>"`, and mention `/edit-voice` for tuning later.
