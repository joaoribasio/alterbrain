# Clarify checklist: research

**Use for:** a research job handed to the `researcher` agent: a company, an industry, a market, a topic for a case or an interview.

## Infer first

- `vault/30_wiki/` (what we already know: companies, industries, topics) and `40_sources/notes/`.
- The project or course this is for (`10_projects/`, `20_areas/courses/`).

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What question should the research answer?" | none: must ask |
| Inputs | "Start from your notes, the web, or both?" | your notes first, then the web |
| Output | "What do you want back?" | a one-page summary note with sources, saved in `30_wiki/` |
| Audience | "What's it for: a case, an interview, a decision?" | your own preparation |
| Constraints | "How recent must sources be? Any to avoid?" | last 3 years; reputable sources; no paywall bypassing |
| Deadline | "When do you need it?" | today |
| Success test | "What would make it useful?" | answers the question in the first three lines; every claim cited |

## Type-specific (required)

- **Scope.** Company, industry, country, time period. Narrow it: "Dutch grocery delivery, 2022–now" beats "e-commerce".
- **Depth.** Quick scan (15 minutes) or deep dive (more sources, more usage). Default: quick scan.
- **Citations.** `[Source: [[note]] | YYYY-MM-DD | confidence: high|medium|low]`; guesses labelled `[Inference]`.
- **People.** Business facts by default, each with a source and date. Another person's sensitive details only if the user explicitly asks.
- **Usage.** On Pro, a deep dive with several helpers in parallel uses more of the plan. Say so.

## Ready when

- The question is one sentence and the scope is narrow enough to answer.
- Depth and output are fixed.

## Where the brief goes

`vault/10_projects/<YYYY> research <short topic>/brief.md` (`type: "brief"`, `status: "agreed"`), with `## Agreed brief`. For a small quick scan, the brief can stay in chat.
