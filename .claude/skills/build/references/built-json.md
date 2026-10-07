# What has been built (`state/built.json`)

The single record of everything self-build added. `/build` writes it, `/remove-skill` removes entries, `/menu` reads it, and `system/hooks/outbound_guard.mjs` reads it to decide whether a channel may really use `auto`.

Always change it through the helper, never by hand:

```
node system/scripts/built.mjs list [--json]
node system/scripts/built.mjs has <name-or-blueprint-slug> [--json]     (exit 0 = built, 1 = not built)
node system/scripts/built.mjs add --name <name> --kind <kind> [--blueprint <slug>] [--path <p>]... [--mcp <id>]... [--channel <c>]... [--proposal "<vault path>"] [--model <m>] [--effort <e>] [--note "<text>"]
node system/scripts/built.mjs remove <name-or-blueprint-slug>
```

## Shape

```json
{
  "schema": 1,
  "items": [
    {
      "name": "my-case-summary",
      "kind": "skill",
      "blueprint": null,
      "paths": [".claude/skills/my-case-summary/"],
      "mcp": [],
      "channels": [],
      "proposal": "vault/00_inbox/proposals/2026-10-07 Case summary.md",
      "model": "sonnet",
      "effort": "medium",
      "built": "2026-10-07T10:00:00.000Z",
      "note": ""
    },
    {
      "name": "gmail-send-approval",
      "kind": "automation",
      "blueprint": "gmail-send-approval",
      "paths": [".claude/skills/my-email-send/"],
      "mcp": [],
      "channels": ["email"],
      "proposal": "vault/00_inbox/proposals/2026-10-07 Gmail send with approval.md",
      "model": "sonnet",
      "effort": "medium",
      "built": "2026-10-07T11:00:00.000Z",
      "note": "level approve"
    }
  ]
}
```

## Rules

- `name`: `my-<slug>` for skills, agents and automations you designed; the **blueprint slug** (file name without `.md`) when building a blueprint; the catalogue `id` when the build is only an MCP install.
- `kind`: `skill`, `agent`, `mcp`, `blueprint` or `automation` (same values as the proposal card).
- `blueprint`: the blueprint slug, or `null`.
- `paths`: every file or folder the build created (project-relative, forward slashes). `/remove-skill` deletes exactly these.
- `mcp`: catalogue ids added to `config/mcp.selected.json` by this build.
- `channels`: autonomy channels this build makes real (`email`, `calendar`, `jobs`, `linkedin`, `social`, `messaging`, `web-forms`). `auto` on a channel counts only when an entry lists that channel **and** comes from a blueprint.
- Same `name` again replaces the old entry (a rebuild).
- **Is blueprint X built?** An entry whose `name` or `blueprint` equals X.
