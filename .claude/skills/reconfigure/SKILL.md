---
name: reconfigure
description: Show the user's current Alterbrain settings in plain English (sending rules, self-build, tools, plan, identity, voice, courses, career) and change whatever they want, or re-run any onboarding step; use for "change my settings", "let me approve emails before sending", "turn off suggestions", "add a tool", "redo my voice", or "/reconfigure".
model: sonnet
effort: medium
argument-hint: "[what to change, e.g. sending | suggestions | tools | plan | voice | courses | M0-M9]"
---

# Reconfigure

See how Alterbrain is set up, in plain words, and change anything you like.

## When to use

- "What are my settings?", "/reconfigure".
- "Let me approve emails before they go", "stop suggesting new skills", "I upgraded to Max".
- "Add Zotero", "turn off the browser tool".
- "Redo my writing voice", "add a new course", "change your name".

## Before you start

1. No clarify needed for a single change. For a new tool or anything that sends, the same checks as `/build` apply (see Steps).
2. Read (all small files):
   - `config/brain.json`, `config/autonomy.json`, `config/mcp.selected.json`;
   - `system/catalogue/mcp.json` (only the `name` and `what` of enabled ids);
   - `vault/80_me/IDENTITY.md`, the **Vibe** section of `SOUL.md`, the Profile of `USER.md`;
   - `vault/80_me/voice/*/profile.md` frontmatter (languages, `blind_test`);
   - `state/onboarding.json` (via `node system/scripts/onboard-progress.mjs show`) and `state/built.json` (via `node system/scripts/built.mjs list`).
3. Never show raw JSON to the user unless they ask.

## Steps

1. **Show the current setup** (skip if the user already said exactly what to change). At most 15 lines, like this:
   ```
   Here's how I'm set up:
   • Me: Juno, calm and direct, in English
   • You: Alex, MBA at <school>, 4 courses this term
   • Sending: email, LinkedIn, jobs → I draft, you send (all channels "draft")
   • New skills: I suggest when I see a pattern (max 3 open); 1 open now
   • Plan: Pro (I run up to 3 helpers at once)
   • Tools on: vault access, browser, PDF reader, web fetch, docs lookup, Zotero
   • Your voice: English (blind test: you spotted 2 of 5, which is a pass), Spanish not set up
   • Built for you: my-case-summary
   • Backup: automatic (saves and uploads after each session)
   • Setup steps still open: career, brand
   ```
   Then ask: "What would you like to change?" AskUserQuestion: Sending rules / New-skill suggestions / Tools / Something else (free text).
2. **Make the change, one at a time.** Confirm, then write. Edit only the keys involved and keep the rest of each file as it is. After editing a JSON file, check it still parses: `node system/scripts/check-json.mjs <file>`.

   | Change | How |
   |---|---|
   | Sending level per channel | `config/autonomy.json` `channels.<name>.level`: `draft` is always possible. `approve` and `auto` only if `built.mjs has <blueprint>` succeeds for a blueprint listing that channel (for email: `gmail-send-approval`); otherwise say in one line that sending needs that add-on and offer `/propose` for it. Explain the levels as in `.claude/skills/onboard/workflows/M4-autonomy.md`. |
   | New-skill suggestions | `config/brain.json` `self_build`: `mode` (`propose` or `off`), `proactive` (true/false), `max_open_proposals`. |
   | Plan | `config/brain.json` `plan_tier`: `pro` or `max`. |
   | Turn a tool on | Treat as a small build: `/clarify` type `mcp`, then the `/build` mcp recipe (catalogue id → `config/mcp.selected.json`, keys only in `.env.local` typed by the user, `mcp-gen`). |
   | Turn a tool off | If `state/built.json` has an entry for it, use `/remove-skill`. Otherwise remove the id from `config/mcp.selected.json`. Core tools: warn in one line what stops working first. |
   | Automatic backup | `config/brain.json` `git.auto_commit` / `git.auto_push`. Recommend keeping both on; explain that off means no online backup. |
   | Identity, tone, profile, courses, voice, career, brand, import | Re-run the onboarding module: `/onboard M1` … `/onboard M9` (see the table in `.claude/skills/onboard/SKILL.md`). It shows what is saved and changes only what the user wants. |
   | Re-do a module from scratch | `node system/scripts/onboard-progress.mjs reset <id>`, then `/onboard <id>`. Ask first: "This starts that step from the beginning. Your current files stay until we replace them. OK?" |
   | Model or effort of a built `my-*` skill | Edit its frontmatter; run `node system/scripts/validate.mjs`. |

3. **After a tools change** (on or off): run `node system/scripts/mcp-gen.mjs`, then say: "Close this session and open the project again so the change takes effect."
4. **Record significant changes** as a decision note. Significant = a sending level changed, self-build turned on or off, a tool with `writes: true` or `tier: "high-risk"` turned on, auto-backup turned off, or a module redone from scratch. Write `vault/70_journal/decisions/<YYYY-MM-DD> <Short title>.md` from `system/templates/notes/decision.md`:
   - frontmatter `type: "decision"`, `created` (today, from the system), `status: "open"`;
   - **The question**: what was changed, in one line ("Should email go out only after my approval?");
   - **What I know**: before → after, and why the user said they wanted it (their words, briefly);
   - **Decision** and **Why**: leave the template's placeholder text exactly as it is. Only the user fills these in.
   Small changes (plan tier, suggestion limit, name or emoji) need no note.
5. **Summarise** in one or two lines: what changed, where, and any restart or task.

## Outputs

- Edited keys in `config/brain.json`, `config/autonomy.json`, `config/mcp.selected.json`; regenerated `.mcp.json`.
- Files changed by re-run onboarding modules (see each module's "Files written").
- `vault/70_journal/decisions/<YYYY-MM-DD> <Short title>.md` for significant changes.
- Tasks for anything the user must still do (keys, restart checks).

## Safety

- Never set a channel to `auto` unless its blueprint is built (`state/built.json`). Never loosen a sending level without the user saying so in this conversation.
- Never edit `.claude/settings.json`, `system/**` or the catalogue. If a wanted change needs that, say so and suggest `/update-alterbrain` or `/propose`.
- Keys and tokens: only the user types them, only in `.env.local`.
- Don't fill in the Decision or Why sections of decision notes.
- Changes take effect at the next action; tools need a restart. Say so.
