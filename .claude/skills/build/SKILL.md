---
name: build
description: Build an approved self-build proposal (a my-* skill, a my-* helper agent, a catalogue tool, an automation, or a ready-made blueprint), test that it triggers correctly, validate it and record it; use after the user says yes to a proposal card, or for "build it", "/build <proposal or blueprint>".
model: sonnet
effort: high
argument-hint: "<proposal card path | blueprint slug | my-name>"
---

# Build

Turn an approved proposal into a working skill, helper, tool or automation, safely.

## When to use

- The user approved a proposal card ("yes, build it").
- The user picks a blueprint ("build Zotero", "build the morning brief").
- A blueprint's own steps say "follow the `/build` flow".

## Before you start

1. **Find the card.** From the argument, or the newest card in `vault/00_inbox/proposals/` that matches. No card yet: run `/propose` first (it writes one), then continue.
2. **Approval.** The card must have `status: "approved"`, or the user must say yes in chat now. If it is `open`, show the 3-line summary and ask. Never build on an `open`, `rejected` or `removed` card.
3. **Clarify.** Run `/clarify` with the card's `kind` (`skill`, `agent`, `mcp`, `automation`, `blueprint`). Don't continue until it returns READY and the card has an `## Agreed brief`.
4. **Read the rules for what you will write:**
   - skills: SPEC §7 and `references/skill-template.md`;
   - agents: SPEC §8 and `references/agent-template.md`;
   - the record: `references/built-json.md`;
   - a blueprint: the whole blueprint file, especially **Build steps**, **How to test**, **How to undo**.
5. **The never-edit list.** Self-build may never create or change: anything under `system/`, `.claude/settings.json`, `system/core.md`, `system/catalogue/*`, `system/hooks/*`, any skill or agent without the `my-` prefix, or `vault/40_sources/raw/`. If a step needs one of these, **stop**, explain in plain words, add a `#ab/build` task, and suggest `/update-alterbrain` or a different design.

## Steps

1. **Plan in one message.** List the files you will create and the settings you will change, with one line each. Ask "Go ahead?" (Yes (recommended) / Change something).
2. **Scaffold by kind:**
   - **skill** → `.claude/skills/my-<slug>/SKILL.md` from `references/skill-template.md`. Frontmatter keys exactly `name`, `description`, `model`, `effort` (and optional `argument-hint`); `name` equals the folder name. Body sections in SPEC §7 order. Extra detail goes in `references/` or `workflows/` inside the same folder. Keep SKILL.md ≤ 250 lines.
   - **agent** → `.claude/agents/my-<slug>.md` from `references/agent-template.md`. Least-privilege `tools`. Body: role, inputs, exact output format, a "Never" list.
   - **mcp** → add the catalogue `id` to `config/mcp.selected.json` `enabled` (no duplicates; never edit the catalogue). Run `node system/scripts/mcp-gen.mjs`. Any key: the user types it into `.env.local` (never in chat). Explain the restart: "Close this session and open the project again; when Claude asks whether to trust the new tool, choose allow."
   - **automation** → a `my-<slug>` skill (as above) for the job itself, plus the schedule exactly as its blueprint describes (desktop scheduled tasks are set by the user in the app: give them the prompt to paste and the clicks). Always include the off switch from the brief.
   - **blueprint** → follow its **Build steps** in order. Each part that creates a skill, agent or tool uses the matching recipe above. Ask before any step that changes `config/autonomy.json`, and never set `auto` before the blueprint is recorded as built.
3. **Quick trigger check** (skills and agents). Write down:
   - 3 prompts that **should** use it (in the user's own words, from the brief and `state/proposals.json` examples);
   - 3 prompts that **should not** (near misses that belong to other skills, for example `/study`, `/ask`, `/assignment`).
   Compare against every other skill's `description`. If any "should not" prompt would match the new description better than its real owner, or a "should" prompt is ambiguous, rewrite the description and check again. Show the six prompts to the user in a short table.
4. **Safety review.** Hand the new files to a read-only review subagent (tools: Read, Grep, Glob):
   - risk `low`: sonnet / high; risk `medium` or `high`: **opus / high**.
   - It checks: only allowed paths are written; tools are least-privilege; nothing sends, posts or submits beyond the channel's autonomy level; no secrets; facts about the user only from `fact-sheet.md`; model and effort fit the routing table; the description discriminates.
   - It returns PASS or a numbered fix list. Fix and re-review once. Two failed reviews: stop, tell the user, add a task.
5. **Validate.** Run `node system/scripts/validate.mjs`. Fix any problem in the new `my-*` files only. Do not continue until it passes.
6. **Test once for real.** Run the success test from the agreed brief with the user's real example (for an MCP after restart: add a task `Test <tool> after restarting` with `--tag build` instead). Show the result.
7. **Record it.**
   ```
   node system/scripts/built.mjs add --name <name> --kind <kind> [--blueprint <slug>] --path "<each created path>" [--mcp <id>] [--channel <channel>] --proposal "<card path>" --model <m> --effort <e>
   ```
   Then set the card `status: "built"`, tick its task (`node system/scripts/tasks.mjs done "<card title>"`), and run `node system/scripts/proposals.mjs mark <key> built`.
8. **Save.** Run `node system/scripts/git-auto.mjs commit` (it skips itself when auto-commit is off; otherwise the session end does it anyway).
9. **Tell the user** in 4 lines: what was built, how to use it (two example phrases), what it will never do, and "To undo: `/remove-skill <name>`."

## Outputs

- New files: `.claude/skills/my-<slug>/**` or `.claude/agents/my-<slug>.md`, and anything a blueprint's steps create (only in allowed places).
- Possibly `config/mcp.selected.json` + regenerated `.mcp.json`; `config/autonomy.json` only when a blueprint says so and the user agreed.
- `state/built.json` entry; proposal card `status: "built"`; ticked `#ab/propose` task; `#ab/build` tasks for anything left to do.

## Safety

- No approval, no build. No READY from `/clarify`, no build.
- Only `my-*` names, only allowed paths (see the never-edit list). Hooks will block protected paths anyway; never try to work around a block.
- New skills draft; they never send, post, submit, pay or delete on their own. Outbound actions obey `config/autonomy.json`.
- Never ask for or write secrets. Keys live only in `.env.local`, typed by the user.
- High-risk tools and blueprints need the user's yes in their own words, recorded in the agreed brief.
- If validation or review keeps failing, stop and say so. A half-built skill is removed with `/remove-skill`.
