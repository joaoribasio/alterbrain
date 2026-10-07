# 0006. Project-level `.claude/` instead of an in-repo plugin

Status: accepted (replaces the earlier idea of shipping an in-repo plugin)

## Context
The first plan put the framework in a plugin inside `system/`. A plugin needs a marketplace entry, a trust dialog and a plugin cache. Loading these is less predictable across the desktop app, the CLI and cloud sessions. Files in a project's `.claude/` folder load everywhere, with no extra steps.

## Decision
Skills, agents, rules and hooks live in the project-level `.claude/` folder. The line between framework and user files is drawn by `system/manifest.json` and a naming rule:
- framework skills and agents have plain names;
- self-built ones start with `my-` (for example `.claude/skills/my-budget/`).

## Consequences
- Proven loading in the desktop app, the CLI and cloud sessions.
- No trust dialog and no cache problems.
- The `my-` prefix keeps user work apart from framework files. Updates never touch `my-*`.
- Skills are not namespaced, so names must avoid built-in commands (see ADR 0017).
- **Verified fact (Claude Code docs, 7 October 2026):** plugins that a repository declares do not load in cloud sessions or routines. Project `.claude/skills`, `.claude/agents`, `.claude/commands` and the hooks and permissions in `.claude/settings.json` do load there. An in-repo plugin would therefore be missing in cloud sessions, which settles the choice.

## Alternatives considered
- **In-repo plugin and local marketplace.** Namespacing is nice, but loading was the risk.
- **Global `~/.claude/`.** Not tied to the project, and not copyable with the repo.
