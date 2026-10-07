# 0014. Human task list in Obsidian Tasks format

Status: accepted

## Context
Users need one place that says "the agent needs you". Notifications scatter attention. Obsidian is already the vault interface.

## Decision
- One file: `vault/00_inbox/Tasks.md`, with checkboxes in Obsidian Tasks emoji format (due date, priority, tag `#ab/<skill>`, link to the item).
- Sections: Inbox, Today, This week, Waiting on others, Someday, Done.
- Agents append to Inbox through `system/scripts/tasks.mjs`. They create tasks only when the human is needed: a draft to review, a proposal, a clarify question, a deadline, due reviews, a setup step or a failure.
- `Home.md` shows Tasks queries and Bases views. The Tasks plugin is pinned and preinstalled.

## Consequences
- The file is readable without the plugin.
- Agents must not add noise (no tasks for news or FYIs).

## Alternatives considered
- **A separate task app.** Another tool to learn.
- **Chat only.** Forgotten between sessions.
