# M7 Email and tools

**Goal:** Gmail is connected (so Alterbrain can read mail and create drafts), and the user has picked any extra tools they want from the catalogue.
**Time:** about 8 minutes. **Optional.**
**Model / effort:** sonnet / medium. Generating the tools file: script.

Say at the start: "Let's connect your email and any extra tools. Remember: I only write drafts. Sending stays with you unless you change that."

## Inference sources

- `config/mcp.selected.json` (what is already on).
- `system/catalogue/mcp.json` (`servers[]`: `id`, `name`, `tier`, `what`, `auth`, `cost`, `tos_risk`, `writes`, `channel`, `notes`).
- `config/autonomy.json` (to explain what each tool may do).
- Whether Gmail tools are already available in this session (tools whose names start with `mcp__claude_ai_Gmail`, or similar).

## Part A: Gmail (claude.ai connector)

Explain in one line: "A connector is a safe link between Claude and your Gmail. You switch it on in your Claude account; I never see your password."

1. If Gmail tools are already available: say so, skip to Part B.
2. Ask: "Do you use Gmail for school or job emails?" Yes (recommended) / No, I use Outlook / Skip email.
   - **Outlook:** point to the `outlook-m365` blueprint (`/menu`, "available to build") and skip to Part B.
3. **The clicks** (send as a short numbered list):
   1. Open **claude.ai** in your browser (or the Claude desktop app) and sign in.
   2. Click your initials (bottom left) → **Settings** → **Connectors**.
   3. Find **Gmail** and click **Connect**.
   4. Choose your Google account, read what it asks for, and click **Allow**.
   5. Come back here and tell me "done".
4. Explain: "New connections appear when you start a new session. Close this session and open the project again, then say `/onboard gmail` and I'll check it worked."
5. Mark the module `later` with note `waiting for Gmail restart` and add a task `Check that Gmail is connected. Say /onboard gmail` (`--tag onboard --priority medium`). Continue with Part B in this session.
6. **Check (after restart):** search for one recent email subject (read-only) and show it. Then say: "Connected. I can read and draft. Sending is set to <level from autonomy.json>." Tick the task.
   - If the tools don't appear: say so plainly, keep the task, and point to `system/docs/guides/troubleshooting.md`.

## Part B: extra tools (optional)

Explain: "Tools give me extra skills, like reading PDFs or searching your reading library. The basics are already on. Here are a few optional ones."

1. Read `system/catalogue/mcp.json`. Offer only `tier: "optional"` entries that are not already enabled. Never offer `avoid`. Offer `high-risk` only if the user asks by name, and then read its `notes` and `tos_risk` aloud in plain words first.
2. Group the list by goal and show at most 6, one line each: name, `what`, cost, and whether it needs a key or sign-in (`auth`). Recommend at most two that match what you know (for example Zotero if they mentioned it). The catalogue has no helper for the school's learning platform. If the user asks for one, do not offer to build it: course files arrive by download, and M3 ("Bring your course material") and `/ingest` cover that.
3. Ask with AskUserQuestion (multi-select): the recommended ones first, plus "None for now".
4. For each pick:
   - `auth: "api-key"`: never ask for the key in chat. The file `.env.local` already exists in the Alterbrain folder (setup creates it from `.env.example`; if it is missing, run `node system/scripts/onboard-seed.mjs`). Do not ask the user to find or create it: Windows hides file extensions and Mac hides dot-files, so a hand-made file often ends up with the wrong name. Ask: "Shall I open the keys file for you?" (Yes (recommended) / I'll open it myself). On yes, run it in the background so the chat stays free: Windows `notepad .env.local`, Mac `open -e .env.local`. Then say: "Add a line `NAME=your-key` on its own line (no spaces around the `=`), save, close the file, and tell me done." You cannot read the file (it is blocked on purpose), so after "done" run `node system/scripts/mcp-gen.mjs`: it names any variable that is still missing (names only, never values) and warns if the file got the wrong name (`.env.local.txt`). Use the variable name from the entry's `env` placeholders. If they don't have the key yet, add a task with where to get it (from the entry's `notes`).
   - `auth: "oauth"`: explain that a browser sign-in will appear the first time the tool is used.
   - `writes: true` with a `channel`: remind them that the channel's level in `config/autonomy.json` still applies.
5. Show the final list and ask "Turn these on?" (Yes (recommended) / Change).
6. Add the ids to `config/mcp.selected.json` `enabled` (keep existing ids; no duplicates).
7. Run `node system/scripts/mcp-gen.mjs`. If it reports a missing key or unknown id, explain in one line and add a task.
8. **Restart.** "Close this session and open the project again so the new tools load. The first time, Claude asks whether to trust each new tool: choose **allow** for the ones you just picked."

## Files written

- `config/mcp.selected.json` (`enabled` list)
- `.mcp.json` (by `mcp-gen.mjs`)
- Tasks for pending keys, restart checks, Gmail check

## Done criteria

- Gmail: connected and checked, or the user chose Outlook / skip.
- Every picked tool is in `config/mcp.selected.json`, `mcp-gen.mjs` ran without errors, and keys are either in `.env.local` (user confirmed) or have a task.
- The user knows to restart.

Then: `node system/scripts/onboard-progress.mjs done M7`. If only the Gmail check is pending after restart, keep the module `later` until the check passes.
