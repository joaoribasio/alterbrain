---
paths:
  - "vault/**"
---

# Vault rules

`vault/` is the user's Obsidian vault. Keep it tidy, linked and sourced. Full contract: `docs/SPEC.md` §3-4, §9, §11-13.

## Files and folders
- **Notes:** human-readable Title Case names (`Porter Five Forces.md`). **Folders:** kebab-case (`strategy-101`).
- Never create two names that differ only by case. Search before creating; update the existing note instead of making a duplicate.
- Dated notes start with the date: `2026-10-08 Reply to Prof Smith.md`.
- Use templates in `system/templates/notes/` when one exists for the note type. Exceptions: `assignment` and `case` notes start from `system/packs/mba/templates/` (the one template for each; the files in `notes/` only point there).

## Frontmatter
Every note starts with YAML frontmatter holding at least `type`, `created` (YYYY-MM-DD) and `status`. Strings are double-quoted. Keep it flat (no nested maps unless the type requires it).

| type | where | extra fields |
|---|---|---|
| `source` | `40_sources/notes/` | `raw`, `sha256`, `origin`, `ingested`, `kind` |
| `concept` | `30_wiki/concepts/` | `sources: []` |
| `framework` | `30_wiki/frameworks/` | `family`, `when_to_use`, `sources: []` |
| `company` | `30_wiki/companies/` | `sources: []` |
| `course` | `20_areas/courses/<slug>/course.md` | `code`, `term`, `school`, `ai_policy`, `ai_policy_quote` |
| `case` | `courses/<slug>/cases/` | `course`, `question`, `case_type`, `case_date` (the date the case is set; SPEC §13) |
| `assignment` | `10_projects/<YYYY> <course> <slug>/assignment.md` | SPEC §13 |
| `application` | `20_areas/career/applications/` | `company`, `role`, `stage`, `source_url`, `deadline` |
| `draft` | `00_inbox/outbox/` | `channel`, `to`, `lang`, `status`, `facts_used: []`; ghostwriter adds `recipient_class`, `facts_ok`, `facts_flagged`, `slop_check`, `voice` and, for email, `subject`, `in_reply_to`, `thread_id`, `gmail_draft_id` (SPEC and `system/packs/twin/drafting.md` §9) |
| `proposal` | `00_inbox/proposals/` | SPEC §11 |
| `person` | `60_people/` | `org`, `role`, `source`, `dnc` |
| `card` | `50_learning/cards/<topic>/` | `topic`, `source`, `box`, `due` |
| `daily`, `weekly`, `decision` | `70_journal/` | — |

`80_me/` files use `identity`, `fact-sheet`, `voice-profile` and `voice-exemplars`.

## Links and citations
- Link with wikilinks: `[[Note Name]]`; embed with `![[file]]`. Link generously to concepts, companies and people that have notes.
- Cite every factual claim in the wiki and in answers: `[Source: [[note]] | YYYY-MM-DD | confidence: high|medium|low]`.
- Anything not directly sourced is labelled `[Inference]` or `[Unverified]`.
- Cite source notes in `40_sources/notes/`, not raw files.

## Obsidian conventions (adapted from Steph Ango)
Ideas paraphrased from Steph Ango's own pages, https://stephango.com/vault and https://stephango.com/file-over-app (retrieved 2026-10-07). He is Obsidian's CEO. Where this file or `docs/SPEC.md` says otherwise, SPEC wins.
- **File over app.** Notes are plain Markdown any editor can open. Keep meaning in the text, not in a plugin: `Tasks.md` reads fine without the Tasks plugin, and a `.base` or `.canvas` view never holds the only copy of anything.
- **One date format: `YYYY-MM-DD`**, in names and properties. Add the time as `HHMM` only to tell same-day notes apart (`2026-10-07 1432 …`, as `/capture` does).
- **Properties over folders.** Describe a note with properties (`type`, `status`, `course`, `company`) and let Bases slice them, rather than adding folders or sub-folders. Create no folder that SPEC §3 does not list. *SPEC differs on purpose:* the numbered top-level folders (`00_` to `80_`) and the course and project folders stay, because Alterbrain's scripts and skills find things by path. Steph keeps his vault nearly flat.
- **Reuse property names.** Before inventing a property, look at the table above and `system/templates/notes/`. Use the same name for the same idea in every note type (`course`, `company`, `deadline`, `source`). Keep new names short. Existing SPEC names (`ai_policy`, `case_date`) stay as they are.
- **Plural names for lists.** A property that holds several values is a list with a plural name (`sources`, `aliases`, `tags`), and tags you invent for the user are plural (`#books`). The `#ab/<skill>` task tags are fixed by SPEC §4.
- **Link liberally.** Link the first mention of each concept, company, person and course in a note. A link to a note that does not exist yet is allowed (it shows what to write next); never create an empty stub note just to resolve it.
- **Keep other people's words apart from yours.** Source material lives in `40_sources/`; our own thinking in `30_wiki/` and `10_projects/`. Never paste a quotation into a note without a citation.
- **Small notes, revisited.** Save quick thoughts as they come (`/capture`) and fold them into the weekly note (`/weekly-review`). Now and then open an old note at random and add the links it is missing.

## Dates
Always take dates from the session digest ("Today is …") or from `node system/scripts/date.mjs` (local date; `--now` adds the time, `--plus N` counts days, `--iso-week` gives the week label). Never use `new Date().toISOString()`: it gives the UTC date, which is yesterday for the first hour or two after midnight. Never guess or compute a weekday in your head.

## Sources
- `40_sources/raw/` is immutable. Never edit, move, rename or delete anything there.
- New material goes in through `/ingest` (`node system/scripts/ingest.mjs <path> [--origin "<text>"]`), which copies it raw, extracts text and logs it in `manifest.jsonl`. Then write one source note per new file and update `30_wiki/index.md` and `30_wiki/log.md`.

## Tasks
- Agent tasks go to `## Inbox` in `00_inbox/Tasks.md` via `node system/scripts/tasks.mjs add …` with `--tag <skill>`. Don't hand-edit other sections.
- Create a task only when the user must act: review a draft, approve a proposal, answer a question, a deadline, reviews due, a setup step, a failed automation.
- Tick (`- [x]`) tasks you complete. Never delete the user's tasks.

## Special notes
- **People** (`60_people/`): business information only (role, organisation, how you met, topics). Every fact has a source and date. Respect `dnc: true` (do not contact). No health, family, religion, politics or home address.
- **Decisions** (`70_journal/decisions/`): write the options and evidence; never fill in the Decision field yourself.
- **Drafts** (`00_inbox/outbox/`): `status` is `draft` until the user approves. Never mark a draft `sent` unless it really was sent.
- **Identity** (`80_me/`): change `USER.md`, `fact-sheet.md` or voice files only with the user's confirmation. `MEMORY.md` is append-only through `/learn`.
