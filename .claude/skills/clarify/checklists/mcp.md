# Clarify checklist: mcp (a new tool)

**Use for:** turning on a tool from the catalogue (`system/catalogue/mcp.json`), such as Zotero or a finance data source. Explain once: "A tool is a connection that gives me a new ability, like reading your Zotero library."

## Infer first

- The catalogue entry: `what`, `tier`, `auth`, `cost`, `tos_risk`, `writes`, `channel`, `notes`.
- `config/mcp.selected.json` (already on?).
- The blueprint for this tool in `system/blueprints/` if one exists (its "Questions I'll ask you" come first).
- `config/autonomy.json` for the tool's channel.

## Common fields, as they apply to a tool

| Field | Ask in plain words | Suggested default |
|---|---|---|
| Goal | "What do you want to do with it?" | the catalogue `what` line |
| Inputs | "Which account or library will it use?" | your own account |
| Output | "Where should results go?" | notes in the matching vault folder |
| Audience | "Just for you?" | just you |
| Constraints | "Read only, or may it change things?" | read only where the tool allows it |
| Deadline | "When do you need it?" | no rush |
| Success test | "What's one thing you'd ask it, to check it works?" | one real query; no default |

## Type-specific (required)

- **Catalogue id.** Must exist in `system/catalogue/mcp.json`. Not there: stop, say so, suggest `/propose` for a different approach. Never add entries to the catalogue.
- **Tier check.**
  - `core` / `optional`: fine.
  - `high-risk`: read the entry's `notes` and `tos_risk` to the user in plain words; they must say yes **in their own words** in chat.
  - `avoid`: do not install. Explain why and offer the alternative from the notes.
- **Sign-in or key.** `auth: "api-key"`: the user types the key into `.env.local` themselves (never in chat). Where to get it comes from `notes`. `auth: "oauth"`: a browser sign-in will appear on first use.
- **Writes and channel.** If `writes: true`, which channel, and confirm its autonomy level stays as is (default `draft`).
- **Permission from school or employer** when the tool reads a school or employer system (a university mailbox, a company drive): "Does your school (or employer) allow this kind of access?" Must be yes.
- **Course files are not a tool.** A school's learning platform is not in the catalogue and is not offered as a connection. If the user asks for one, do not suggest `/propose`: tell them to download their course files and give Alterbrain the folder or zip (`/ingest`).

## Ready when

- The id is in the catalogue and not `avoid`.
- Any key is in `.env.local` (user confirmed), or the user knows where to get it and a task exists.
- High-risk tools have an explicit yes in the user's own words.
- One test query is agreed.

## Where the brief goes

The proposal card (`kind: "mcp"`, `name` = catalogue id): `## Agreed brief`.
