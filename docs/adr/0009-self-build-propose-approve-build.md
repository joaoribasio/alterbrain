# 0009. Self-build: propose, approve, build, with a clarify gate

Status: accepted

## Context
The framework should grow with each user, but a vague request produces a poor skill, and an agent that edits its own safety rules is dangerous.

## Decision
- **Propose.** A proposal card in `vault/00_inbox/proposals/` explains what, why, what it touches, cost and risk, and how to undo. A `#ab/propose` task is created. Proposals can be proactive (a config switch) and are capped (default three open).
- **Approve.** The user says yes in chat.
- **Build.** `/build` runs `/clarify` first, scaffolds into `my-*` paths, runs a quick check (3 prompts that should trigger the skill and 3 that should not), runs `validate.mjs`, commits and records the build in `state/built.json`.
- Self-build may never edit `code` files, `.claude/settings.json`, `system/core.md` or the catalogue.
- `/remove-skill` reverses a build.
- The clarify gate is general: nothing starts from a vague request.

## Consequences
- Users get new abilities safely, with a clear undo.
- Some friction from questions, which we accept for better results.

## Alternatives considered
- **Build immediately on request.** Fast, but poor results and risky.
- **No self-build, only releases.** Slow growth, no personalisation.
- **Allow self-editing of hooks.** Defeats the safety model.
