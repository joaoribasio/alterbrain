---
paths:
  - "system/templates/**"
  - "system/packs/**"
  - "system/catalogue/**"
  - "system/core.md"
  - ".claude/skills/**"
---

# Changing the shape of user data

For developers only: if `state/local/dev-mode` does not exist, ignore this rule.

A release replaces framework files, but a person's data stays as it is. A changed template, skill, pack or catalogue entry never reaches data that already exists. So if your change alters what a person's existing copy holds, ship a migration or a documented fallback in the same release.

That means a change to any of these:

- keys or allowed values in `config/*.json`, or the ids in `config/mcp.selected.json`;
- frontmatter keys or values in vault notes, or vault folders;
- `state/*.json`;
- a framework path that a person's own files point to (`my-*` skills and agents, notes).

Mechanical must-do fixes (removed ids, renamed keys) are scripts in `system/scripts/migrations/NNNN-*.mjs`. Anything that needs judgement about the person's own content is a guided migration, `NNNN-*.md` in the same folder and number space: the person's Claude evaluates their vault, proposes, applies only what they approve, and records the answer (`update.mjs guided done|skip`). Format and rules are in `framework-dev.md`.

The policy, the script contract, the tests and the CHANGELOG lines (`### Upgrades`, `### Moved`) are in `.claude/rules/framework-dev.md`, "Changing user data or config (migrations)". `node system/scripts/validate.mjs --release` checks the CHANGELOG part before a release.
