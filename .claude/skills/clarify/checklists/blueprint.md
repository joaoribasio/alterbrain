# Clarify checklist: blueprint

**Use for:** building one of the ready-made plans in `system/blueprints/`, or when a blueprint says "run /clarify (type blueprint) to find the real need" (for example Instagram or WhatsApp, where a safer alternative may be better).

## Infer first

- The blueprint file: **What it does**, **You'll need**, **Cost and risk**, **Questions I'll ask you**.
- `state/built.json` (already built? then this is a change, not a new build).
- `config/brain.json`, `config/autonomy.json`, `config/mcp.selected.json`.

## Common fields

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What do you want this for, in your own words?" | the blueprint's "What it does" |
| Inputs | from the blueprint's "You'll need" | none |
| Output | "What should you see when it works?" | the blueprint's "How to test" |
| Audience | "Just you?" | just you |
| Constraints | "Anything it must never do?" | drafts only, nothing public without you |
| Deadline | "When do you need it?" | no rush |
| Success test | the blueprint's "How to test", made concrete | none |

## Type-specific (required)

- **The real need.** Ask once: "What problem are you solving?" If a smaller or safer option covers it (for example drafting posts instead of auto-posting), offer that first.
- **Every question** in the blueprint's "Questions I'll ask you", one at a time (or 3–5 at a time with defaults).
- **Prerequisites** in "You'll need" are in place, or have tasks.
- **Risk acknowledgement.** For `risk: "high"`: read the risk in plain words; the user says yes in their own words.
- **Which sub-type to continue with.** Most blueprints then need the `skill`, `mcp` or `automation` checklist. Run that next for the parts it builds.

## Ready when

- Every blueprint question is answered or defaulted with the user's OK.
- Prerequisites are met or tracked as tasks.
- High-risk blueprints have an explicit yes.

## Where the brief goes

The proposal card (`kind: "blueprint"` or the blueprint's own `kind`, `name` = blueprint slug): `## Agreed brief`.
