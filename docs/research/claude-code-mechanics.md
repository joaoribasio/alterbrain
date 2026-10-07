# Claude Code mechanics that Alterbrain relies on

Checked against code.claude.com docs on 2026-10-07 with Claude Code 2.1.284. Re-check after major Claude Code releases. Items marked *undocumented* are tested on a real machine before we rely on them.

## Hooks
- **Shell.** Shell-form commands run in `sh -c` (macOS/Linux), Git Bash (Windows), or PowerShell when Git Bash is absent. Source: hooks-guide.
- **Exec form avoids shell differences:** `{"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/system/hooks/x.mjs"]}`. Claude Code substitutes `${CLAUDE_PROJECT_DIR}` itself, and `node.exe` is a real binary on Windows. Source: hooks.
- **Working directory** follows the session's current directory. Do not assume it is the project root. Use `CLAUDE_PROJECT_DIR`.
- **SessionStart.**
  - Output: plain stdout, or `hookSpecificOutput.additionalContext`.
  - Matchers: `startup|resume|clear|compact|fork`.
  - It is the only event that receives `model`, and only sometimes.
- **PreToolUse.** Decide with `hookSpecificOutput.permissionDecision` = `deny|ask|allow` plus `permissionDecisionReason`. Exit code 2 also blocks. A deny holds even in bypass mode.
- **SessionEnd** fires on session termination with reasons clear, resume, logout, prompt_input_exit or other.
  - Time budget is 1.5 s, raisable via `timeout` up to 60 s.
  - *Undocumented:* whether it fires when a desktop session closes. We back it with a throttled Stop hook.
- **Stop** fires after every response, but not on user interrupt.

## Skills (`.claude/skills/<name>/SKILL.md`)
- **Frontmatter:**
  - identity and invocation: `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`;
  - tools and model: `allowed-tools`, `disallowed-tools`, `model` (incl. `inherit`), `effort` (`low|medium|high|xhigh|max`);
  - execution: `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`;
  - other: `metadata`, `license`, `compatibility`.
- **Character cap:** `description` + `when_to_use` are capped at 1,536 characters in the listing.
- **Name clashes:** a project skill named like a built-in replaces it in terminal sessions, but not its aliases. Desktop behaviour is undocumented, so avoid these names: help, config, settings, status, memory, init, upgrade, doctor, checkup, review, code-review.
- **Supporting files** load on demand. `${CLAUDE_SKILL_DIR}` points at the skill folder.

## Subagents (`.claude/agents/*.md`)
- **Fields:** `name`, `description` (required); `tools`, `disallowedTools`, `model` (`sonnet|opus|haiku|fable|inherit|<id>`), `effort`, `maxTurns`, `permissionMode`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `isolation`, `color`, `initialPrompt`, `omitClaudeMd`.

## Where config loads
- **Desktop Code tab:** reads the same configuration files as the CLI. Project skills, hooks and permissions apply.
- **Cloud sessions and routines:** repo `.claude/settings.json` hooks and permissions, `.claude/skills`, `.claude/agents` and `.claude/commands` all load. Plugins enabled by the repo do **not** load. This is why ADR 0006 keeps everything project-level.

## settings.json
- **Model and effort:** `model` (alias), `effortLevel` (`low|medium|high|xhigh`; in project scope it applies to every model), `maxEffortLevel`, `availableModels`, `deniedModels`.
- **Memory:** `autoMemoryDirectory` (read from any scope).
- **Safety switches:** `disableSkillShellExecution` (boolean); `permissions.disableBypassPermissionsMode: "disable"`.
- **Permission rules:** evaluated in the order deny → ask → allow, and an allow cannot override a deny. MCP rules use the forms `mcp__server`, `mcp__server__*` and `mcp__server__tool`, with no parentheses.
- **Attribution:** `includeCoAuthoredBy` is deprecated in favour of `attribution`.

## claude.ai connectors
- **Naming:** connector tools appear as `mcp__claude_ai_<Server>__<tool>`.
- **Gmail tools** (issue #89304 and the connector page): `send_message`, `reply`, `forward`, `create_draft`, `update_draft`, `trash_message`, … Confirm with `/mcp`.
- **The Gmail connector can send mail**, so draft-only must be enforced by us: send tools are under `ask` in settings, and `outbound_guard` denies them at `draft` level.
- *Undocumented:* whether permission rules match desktop in-process connector servers identically. Tested in the spike.

## Scheduling and status line
- **Desktop scheduled tasks** are user-level (`~/.claude/scheduled-tasks/<name>/SKILL.md`). Schedule, folder and model are set in the UI or by asking Claude in a session. Local tasks need the app open and the computer awake. See the last section for details.
- **Cloud routines:** 1-hour minimum interval, a fresh clone, all connectors by default.
- **Status line** does not render in the Desktop app.

## Scheduling, background sessions, Remote Control, Channels, sign-in and terms
Checked on 2026-10-07 against the pages named in each line (all under https://code.claude.com/docs/en/ unless a full address is given). Re-check each quarter.

- **Desktop local scheduled tasks** (`desktop-scheduled-tasks`).
  - They run on your machine and fire only while the app is open and the computer is awake. Minimum interval 1 minute.
  - Missed runs: on app start or wake, Desktop checks the last 7 days and starts **exactly one** catch-up run for the most recently missed time. Older misses are discarded. If the computer sleeps through the time, the run is skipped, so the app has a **Keep computer awake** setting (Settings > This computer > System).
  - Creation: through the Routines page in the Code tab, **or by asking Claude in any Desktop session** ("set up a daily ... at 9am"). Intervals the picker lacks (such as every 15 minutes) are set the same way. Tasks live in `~/.claude/scheduled-tasks/<name>/SKILL.md`; schedule, folder and model are not in that file.
  - So a blueprint may use the scheduled-tasks tools **when the session lists them**. Otherwise it gives the prompt to paste and the UI steps.
- **Cloud routines** (`routines`): 1-hour minimum interval, a fresh clone, connectors set per task.
- **Background sessions** (`agent-view`).
  - `claude --bg "<prompt>"` starts a session hosted by a supervisor process, so it does not need an open terminal.
  - They survive sleep, but **stop on shutdown** or reboot (the conversation stays on disk and can be resumed). Idle sessions may stop after about an hour.
  - They use the stored `/login` or API-key credentials. A login that expires stops them until you sign in again.
- **Remote Control** (`remote-control`).
  - It drives a Claude Code session running on your machine from claude.ai or the Claude mobile app. The session keeps running locally, so the computer must stay on. It reconnects after sleep or a network drop.
  - Needs a claude.ai subscription (Pro, Max, Team or Enterprise), not an API key. On Team and Enterprise an Owner must switch it on.
- **Channels** (`channels`).
  - A **research preview**, so flags and steps may change. Telegram, Discord and iMessage plugins exist. The plugins need **Bun**.
  - Telegram steps: create a bot with BotFather, `/plugin install telegram@claude-plugins-official`, `/telegram:configure <token>`, start with `claude --channels plugin:telegram@claude-plugins-official`, pair with `/telegram:access pair <code>`, then `/telegram:access policy allowlist`. Only allowlisted sender ids can push messages.
  - Messages arrive only while that session is running. Pro and Max users without an organisation need no admin switch. Team and Enterprise organisations must enable channels.
  - Windows support is **not stated** on the page. Treat as [Unverified].
- **Signing in without a browser on the same computer** (`authentication`).
  - Over SSH, in WSL2 or in containers the browser may show a login code. Paste it into the terminal where Claude Code asks for it. Credentials are then stored in `~/.claude/.credentials.json` on Linux, so they normally survive a reboot until the login expires. Claude Code warns three days before expiry.
  - `claude setup-token` makes a one-year token for scripts (`CLAUDE_CODE_OAUTH_TOKEN`). It can make model requests only, not Remote Control or claude.ai connectors. Not needed for Alterbrain, and it must stay in the owner's own environment.
- **Terms and acceptable use.**
  - `legal-and-compliance`: Claude Code is covered by the Consumer Terms (Free, Pro, Max) or the Commercial Terms. The page says advertised Pro and Max limits "assume ordinary, individual usage". Subscription sign-in is for the person who bought the plan: third parties may not route requests through someone's plan credentials or collect their sign-in tokens, and the Claude Code binary must be unmodified.
  - Consumer Terms, https://www.anthropic.com/legal/consumer-terms (page effective 8 October 2025): no use of the services through automated means such as bots or scripts except through an API key or where Anthropic explicitly permits it; no sharing of account login details. We rely on the **unmodified Claude Code and Desktop app, signed in by the owner**. Unattended jobs run through these official features. Nothing in Alterbrain handles anyone's login.
  - Anthropic Usage Policy: https://www.anthropic.com/legal/aup.
  - Open question for the maintainer: whether a scheduled job on a spare computer counts as "ordinary, individual usage". The pages above do not say. The always-on blueprints tell students to read the terms and keep to one person, one plan, one machine.
