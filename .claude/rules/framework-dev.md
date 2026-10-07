---
paths:
  - "system/hooks/**"
  - "system/scripts/**"
  - "system/lib/**"
  - "tests/**"
  - "docs/**"
---

# Framework development

You are editing Alterbrain itself. (This rule loads only for developer folders: hooks, scripts, lib, tests and docs. It stays out of the way of skill workflows, templates and packs that students' sessions read. When you author skills or agents, read `docs/SPEC.md` sections 7 and 8 and the "Skills" and "Agents" parts below.) `docs/SPEC.md` is the binding contract: if a file disagrees with it, the spec wins; if the spec is wrong, fix the spec first.

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
- **Reuse `system/lib/`**: `paths.mjs` (projectRoot, vaultPath, isDevMode, matchGlob), `fsx.mjs` (readJson, writeText, sha256File, today, nowStamp), `frontmatter.mjs`, `proc.mjs` (run, has, IS_WINDOWS), `tasks.mjs` (addTask, listTasks, completeTask). Don't re-implement them.
- **Windows first, macOS equal:** `path.join`, `os.tmpdir()`, no bash-only syntax, no symlinks, no `/tmp`, no `python3`, LF line endings.
- **Hooks:** read JSON from stdin; root from `CLAUDE_PROJECT_DIR`, never cwd; fail open on bad input (exit 0, no output), except `outbound_guard`, which fails closed. Tests in `tests/hooks/`.
- **Scripts:** plain-language output, `--json` option, exit 0 ok / 1 problems / 2 usage error.
- **Tests:** `node --test`, synthetic fixtures only, must pass on Windows. Temp files under `state/local/tmp/`.
- Never write a real secret, even in tests: build fake ones by string concatenation at runtime.

## Content
- Every skill and agent declares `model` and `effort` (see `model-routing.md`).
- User-facing text follows `writing.md`: plain UK English for a non-technical reader.
- **No personal data** about any real person. Example persona: "Alex Doe", MBA student in Rotterdam.
- **Ported or adapted files** carry `Adapted from <project> (<licence>) — <url> @ <sha>` (first line, or last line for Markdown), and get listed in `THIRD_PARTY_NOTICES.md` and `UPSTREAM-SYNC.md`. Never vendor Anthropic's proprietary skills.

## Before you finish
- Run `node system/scripts/validate.mjs` and `node --test "tests/**/*.test.mjs"` (the quoted glob; plain `node --test tests/` fails on Node 22).
- Git: never branches or worktrees. In dev mode, commits are made deliberately by the developer, not by hooks.
