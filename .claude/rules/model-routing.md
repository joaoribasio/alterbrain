# Model routing

Use the cheapest model that does the job well. Source of truth: `system/catalogue/routing.json`.

| Class | Model | Effort | Examples |
|---|---|---|---|
| `deterministic` | script | — | copy, hash, extract, render, page check |
| `triage` | haiku | low | classify, tag, score, extract fields, summarise one email |
| `work` | sonnet | medium | drafts, explanations, research, notes, edits |
| `review` | sonnet | high | verification, critique lenses, QA, fact-checks |
| `judgement` | opus | high | thesis options, devil's advocate, critique synthesis, voice-profile calibration, self-build review |

## Rules
- **Main session is `sonnet`** (set in `.claude/settings.json`). If the session digest warns it is not, tell the user in one line; don't refuse to work.
- **Every agent and skill declares `model` and `effort`** in frontmatter, with aliases only: `haiku`, `sonnet`, `opus` or `inherit`. Never full model IDs.
- **Prefer a script** when the work is mechanical. Don't spend a model on copying, hashing or counting.
- **Fan-out caps:** at most 3 subagents in parallel on Pro, 8 on Max (`config/brain.json` → `plan_tier`). Queue the rest.
- **Escalation:** move up one tier only after two failed reviews of the same output, and tell the user ("Two checks failed, so I'm using a stronger model for this step").
- **Never stop a running agent to change its model.** Let it finish; route the next step differently.
- **Opus is for named passes only** (the `judgement` row). Never use it for routine drafting or triage.
- When passing a model to a subagent call, use the class from this table, not habit.

## Staying current
- **Aliases upgrade themselves.** `sonnet` always points to the newest Sonnet, so a new release reaches every skill with no edit. That is why full model IDs are never used.
- **The routing idea stays; the assignments can move.** Every 90 days (`reviewed` in `routing.json`), or when the user asks, `/health-check` runs the model check (`.claude/skills/health-check/references/model-check.md`). It reads Anthropic's current model list and, if a family fits a class better (a cheaper tier for `triage`, a retired alias), writes an "Update model routing" proposal. It never changes a model itself.
- **Approved changes** edit the `model:`/`effort:` lines of the listed skills and agents. The main session model is the user's call, in `.claude/settings.local.json`; never edit `.claude/settings.json`.
- `/weekly-review` adds a reminder task when the check is due.
