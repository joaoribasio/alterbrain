---
paths:
  - "system/hooks/**"
  - "system/scripts/**"
  - "system/lib/**"
  - "tests/**"
  - "docs/**"
---

# Framework development

You are editing Alterbrain itself. (This rule loads only for developer folders: hooks, scripts, lib, tests and docs. It stays out of the way of skill workflows, templates and packs that learners' sessions read; a short companion, `.claude/rules/migrations.md`, loads when you edit templates, skills, packs, the catalogue or `core.md`, where data shapes change, and points back to "Changing user data or config" below. When you author skills or agents, read `docs/SPEC.md` sections 7 and 8 and the "Skills" and "Agents" parts below.) `docs/SPEC.md` is the binding contract: if a file disagrees with it, the spec wins; if the spec is wrong, fix the spec first.

## Who may edit what
- **Dev mode** = `state/local/dev-mode` exists. Only then may framework files be edited, and auto-git is off. Without it, `protect_paths` blocks `code`-class files and you must not try to get around it.
- **`code` files** (replaced verbatim on update): `system/core.md`, `.claude/settings.json`, `system/hooks/`, `system/scripts/`, `system/lib/`, `system/catalogue/*.json`, plus anything marked `code` in `system/manifest.json`.
- **`text` files** (user may customise; reconciled on update): rules, skills, agents, templates, blueprints, guides, packs.
- **User self-builds** go only to `.claude/skills/my-<name>/` and `.claude/agents/my-<name>.md`. Never touch framework files from a self-build.

## Skills (`.claude/skills/<name>/SKILL.md`, SPEC §7)
- Frontmatter keys only: `name` (= folder name), `description` (one sentence: what + when), `model` (`haiku|sonnet|opus|inherit`), `effort` (`low|medium|high`), optional `argument-hint`.
- Body sections in order: `# Title` · `## When to use` · `## Before you start` · `## Steps` · `## Outputs` · `## Safety` · `## Extend this` (add-ons only).
- ≤ 250 lines; longer material in `references/` or `workflows/`.
- One question at a time; never ask what the vault already answers; confirm, then write.
- Avoid built-in names: help, doctor, config, settings, init, review, status, memory, upgrade, update.

## Agents (`.claude/agents/<name>.md`, SPEC §8)
- Frontmatter: `name`, `description` (when to delegate), `model`, `effort`, `tools` (least privilege).
- Body: role (one paragraph) · inputs · exact output format · a "Never" list.

## Code (hooks and scripts)
- Node ≥ 20, ESM `.mjs`, **zero dependencies**. No Python in the core (optional blueprints and the `uvx`-launched MCP servers may use `uv`; it is not installed by default).
- **Reuse `system/lib/`**: `paths.mjs` (projectRoot, vaultPath, isDevMode, matchGlob), `fsx.mjs` (readJson, writeText, sha256File, today, nowStamp), `frontmatter.mjs`, `proc.mjs` (run, has, IS_WINDOWS), `tasks.mjs` (addTask, listTasks, completeTask), `migrate.mjs` (upgrade scripts: runMigration, readJsonFile, writeFileAtomic, writeJsonAtomic, setFrontmatterLine). Don't re-implement them.
- **Windows first, macOS equal:** `path.join`, `os.tmpdir()`, no bash-only syntax, no symlinks, no `/tmp`, no `python3`, LF line endings.
- **Hooks:** read JSON from stdin; root from `CLAUDE_PROJECT_DIR`, never cwd; fail open on bad input (exit 0, no output), except `outbound_guard`, which fails closed. Tests in `tests/hooks/`.
- **Scripts:** plain-language output, `--json` option, exit 0 ok / 1 problems / 2 usage error.
- **Tests:** `node --test`, synthetic fixtures only, must pass on Windows. Temp files under `state/local/tmp/`.
- Never write a real secret, even in tests: build fake ones by string concatenation at runtime.

## Changing user data or config (migrations)
A release replaces framework files, but the user's data stays as it is. A change to the shape of that data therefore reaches existing users only through a migration or a fallback in code. A changed template alone never does. This policy is binding (ADR 0024).

- **The rule.** Any change that alters the shape of user data or config ships in the same release with (a) a migration or (b) a documented fallback.
- **Shape means:** keys or allowed values in `config/*.json`; frontmatter keys or values in vault notes; vault folders; `state/*.json`; the ids in `config/mcp.selected.json`; a framework path that user files (`my-*` skills and agents, notes) point to.
- **A documented fallback** is one SPEC sentence that names the old shape and the file that still reads it, plus a test for it.
- **Expand, then contract.** A release reads both shapes. The old shape is removed no earlier than two releases later, and by a migration.
- **Where they live.** `system/scripts/migrations/NNNN-short-name.mjs`: four digits, ascending, never renamed, edited or deleted once released. Code class, listed in the release manifest (`update.mjs finish` runs only listed scripts whose checksum matches, once each in name order, and records them in `state/migrations.json`; it runs none without a restore point, the git tag `pre-update-<tag>`, and `apply-safe` refuses before it changes anything when the plan has upgrades and no restore point can be made). Line 1 is `#!/usr/bin/env node` and line 2 is `// ab-migration: <one sentence>`, which the update shows the user before they agree. `validate.mjs` checks the name, the line and the test.
- **Write that sentence so it is true for everyone who sees it.** The plan lists every script the install has not recorded, so an upgrade that only applies to some people says so ("If you started on Alterbrain 0.1, ...", "..., if you had switched it on"). A fresh install is not shown upgrades it came with: its own manifest lists them, the file on disk matches, and `update.mjs` records them as done (`baseline: true` in `state/migrations.json`) without running them. An install from an older release is never treated that way.
- **Each migration:**
  - is idempotent and does nothing on data already in the new shape (a script can still meet new-shape data: a person who changed things by hand, or a re-run);
  - is safe to re-run after a partial failure;
  - is self-contained: it never reads templates or other framework text that later releases may change, and it uses `system/lib/migrate.mjs`;
  - changes structure only, never the user's prose, and writes atomically;
  - touches only `config/`, `vault/` (never `40_sources/raw/`) and `state/` (never `state/local/rate-guard/`), and adds tasks only through `system/lib/tasks.mjs`;
  - never writes `.env.local`, `.mcp.json` (except by running `mcp-gen.mjs`), `.claude/settings*.json` or `my-*` skills and agents. It may only report on those;
  - never opens encrypted paths while the copy is locked (exit 1 instead);
  - prints plain UK English sentences about what this run changed, or exactly `Nothing to do.`;
  - exits 0 when done or when there is nothing to do, and 1 when it could not finish (one sentence on stderr, nothing half-written). It never exits 0 after skipping work it should have done: a file it could not read or check is said out loud and gets a task, not "Nothing to do."
- **Tests.** `tests/scripts/migrations/<id>.test.mjs` on the fixtures in `tests/fixtures/migrations/` (`v0.1.0`, `v0.1.1`, `v0.2-professional`, `v0.2-online`; add one for each new shape), plus `all-migrations.test.mjs`, which runs every migration twice on every fixture and finds new ones itself.
- **CHANGELOG.** List each migration under `### Upgrades` (naming the script, for example `0002-learner-and-packs`) and each moved or removed framework file under `### Moved` (old path, new path or "removed"; a folder covers what is inside it; `tests/` and `.github/` need no line). The update skill uses both lists, and for the first update from an older release (which is planned by the old script) the `### Upgrades` list is the only one the person sees. `validate.mjs` warns about gaps; `validate.mjs --release` makes them errors, and `--sign-key` refuses to sign until there are none. Release only after `--release` passes.

## Content
- Every skill and agent declares `model` and `effort` (see `model-routing.md`).
- User-facing text follows `writing.md`: plain UK English for a non-technical reader.
- **No personal data** about any real person. Example personas: "Alex Doe", MBA student in Rotterdam; "Jordan Doe", working professional with no courses; "Robin Doe", online learner on Coursera.
- **Ported or adapted files** carry `Adapted from <project> (<licence>) — <url> @ <sha>` (first line, or last line for Markdown), and get listed in `THIRD_PARTY_NOTICES.md` and `UPSTREAM-SYNC.md`. Never vendor Anthropic's proprietary skills.

## Before you finish
- Run `node system/scripts/validate.mjs` and `node --test "tests/**/*.test.mjs"` (the quoted glob; plain `node --test tests/` fails on Node 22).
- Changed the shape of user data or config? Ship a migration or a documented fallback (see above), with its CHANGELOG lines.
- Preparing a release? Run `node system/scripts/validate.mjs --release` first (it needs the git tag of the previous release, for example `v0.1.1`). A release also needs the ADR for this policy and its SPEC section.
- Git: never branches or worktrees. In dev mode, commits are made deliberately by the developer, not by hooks.
