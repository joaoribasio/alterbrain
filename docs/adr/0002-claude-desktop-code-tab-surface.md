# 0002. Claude desktop app (Code tab) as the main surface

Status: accepted

## Context
Our users are not technical. They should not need a terminal. The Claude desktop app has a Code tab that runs Claude Code on a folder. Claude Code needs version 2.1.283 or newer for the features we use. A Claude Pro plan is the realistic baseline for students.

## Decision
The desktop app Code tab is the main surface. The command line is the power path for people who want it. Pro is the baseline. Max unlocks heavier use, such as more parallel agents.

## Consequences
- Install instructions start with "install the Claude desktop app".
- Every feature must work inside Code-tab sessions on Windows 11 and macOS.
- `doctor` checks the Claude Code version against `system/release.json`.

## Alternatives considered
- **CLI only.** Simple for us, hard for the audience.
- **Claude.ai chat with connectors.** No local files, no hooks, no git.
- **Custom app.** Too much to build and maintain, and it could drift from Anthropic's terms.
