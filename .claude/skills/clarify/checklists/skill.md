# Clarify checklist: skill

**Use for:** building a new skill (`.claude/skills/my-<slug>/`): a repeatable job Alterbrain does when asked, like "summarise a case reading into one page".

## Infer first

- The proposal card in `vault/00_inbox/proposals/` (What it does, Why, What it will touch).
- `state/proposals.json` examples (what the user actually asked for, and how often).
- Existing skills in `.claude/skills/` (does one already do this? then improve, don't duplicate).
- `USER.md` and `config/brain.json` (language, plan tier).

## Common fields, as they apply to a skill

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What should this skill do for you, in one sentence?" | from the proposal card |
| Inputs | "What will you give it each time: a file, a note, a link, nothing?" | the input seen in past requests |
| Output | "What should come out, and where should I save it?" | a note in the matching vault folder + a short chat summary |
| Audience | "Who reads the result: just you, or someone else?" | just you |
| Constraints | "Anything it must never do, or a length or language rule?" | your language, one page max, draft-only |
| Deadline | "When do you need it working?" | no rush (built today) |
| Success test | "Give me one real example input. What would a great result look like?" | must be one real example; no default |

## Type-specific (required)

- **Trigger phrases.** "How will you ask for it? Give me two ways you'd say it." Needed for the description and the quick check.
- **Name.** `my-<slug>`, short and plain (`my-case-summary`). Suggest one; the user can rename.
- **Model and effort.** Pick from the routing table (SPEC §6) and say why in a few words: sorting or tagging → haiku/low; drafting or notes → sonnet/medium; checking → sonnet/high; real judgement → opus/high (rare; costs more of your plan).
- **Tools and files it may touch.** List folders it reads and writes. It may never write to `system/`, `.claude/settings.json`, `system/core.md` or the catalogue.
- **Anything outbound?** If it would send, post or submit: it drafts only, and the channel's level in `config/autonomy.json` applies.

## Ready when

- One real example input exists (path or pasted) and the expected result is described.
- At least two trigger phrases are agreed.
- The write locations are inside `vault/` (or `.claude/skills/my-<slug>/` itself).
- No overlap with an existing skill, or the user chose to build anyway knowing the overlap.

## Where the brief goes

The proposal card (`vault/00_inbox/proposals/<date> <Title>.md`): replace or add `## Agreed brief`. Update the card frontmatter `name`, `model`, `effort`, `risk` if they changed. No card yet: run `/propose` first (it creates one), then come back.

## Example

Vague: "Build me something for finance."
Missing: goal, inputs, output, success test. Ask:
1. "What finance job do you repeat? For example: checking a DCF, summarising an annual report, explaining a ratio." (suggested: summarising annual reports)
2. "What will you give it each time?" (suggested: a PDF)
3. "What should come out?" (suggested: a one-page note in `30_wiki/companies/`)
4. "Share one real report you'd use it on, so we can test it."
