# Clarify checklist: document

**Use for:** any document Alterbrain writes or shapes: a memo, report, case analysis, framework analysis, CV, one-pager, slide deck. (Graded coursework uses `assignment.md`; job applications use `application.md`.)

## Infer first

- The conversation and any files the user pointed to.
- `vault/80_me/brand/_brand.yml` (look), `vault/80_me/templates/` (templates), `vault/80_me/voice/<lang>/profile.md` (voice), `fact-sheet.md` (facts about the user).
- Related notes in `vault/10_projects/`, `30_wiki/`, `40_sources/notes/`.

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal / problem | "What question should this document answer, or what decision should it support?" | none: must ask |
| Inputs / data available | "What should I work from?" | your notes and sources on this topic |
| Output / format | "What format and length?" | PDF, 2 pages, your brand style |
| Audience | "Who will read it, and what do they already know?" | your professor or a manager; knows the basics |
| Constraints | "Any rules: word limit, language?" | your language, plain and direct |
| Template | Not asked. Resolve it silently: `node system/scripts/template.mjs resolve --kind <kind> --for <source> --json`, and say which one in a line. Ask only when two templates tie. | the most specific one attached, else your default, else the built-in |
| Deck style | "Will this be read on its own, or presented?" (decks only) | `presenting-deck` for a talk, `reading-deck` for a deck sent as a document; the template's style if it sets one |
| Tone | "How formal: academic, professional or conversational?" (your own voice stays on in all three) | the `tone` from `resolve` (course or programme setting, else by kind of learner) |
| Upload limit | "Is there a file size limit for the upload?" | the template's or programme's `max_upload_mb`, else none |
| Deadline | "When do you need it?" | none: must ask |
| Success test | "What would make you say 'this is right'?" | it answers the question in the first paragraph and every number has a source |

## Type-specific (required)

- **Context.** The situation in 2–3 lines (company, case, meeting).
- **Structure.** Suggest one (for example: answer first, then three reasons, then risks) and let the user change it.
- **Sources.** Must every claim be cited? Default yes for anything analytical.
- **Visuals.** Charts or tables needed? Default: only if they save words.
- **Facts about the user.** If the document speaks for the user, only facts in `fact-sheet.md` are used.

## Ready when

- The problem is one clear sentence.
- Format, length and audience are fixed.
- The data available is known (or a research step is agreed first).

## Where the brief goes

`vault/10_projects/<YYYY> <Short title>/brief.md` with frontmatter `type: "brief"`, `created`, `status: "agreed"` (or `"clarifying"`), then the `## Agreed brief` section. If the document belongs to an existing project folder, put `brief.md` there instead.
