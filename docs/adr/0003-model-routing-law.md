# 0003. Model routing is a framework law

Status: accepted

## Context
On a Pro plan, Claude Code can silently default to Opus. Opus uses up limits fastest and would burn a student's allowance quickly. Many tasks (tagging, summarising one email) need far less.

## Decision
Routing is a rule that every part of the framework follows:
- `.claude/settings.json` sets `"model": "sonnet"`, because Pro would otherwise default to Opus.
- Every agent and skill declares `model` and `effort` in its frontmatter, using aliases (`haiku`, `sonnet`, `opus`, `inherit`).
- Classes: deterministic (a script), triage (Haiku, low), work (Sonnet, medium), review (Sonnet, high), judgement (Opus, high).
- Opus is used only for named judgement steps.
- Fan-out caps: at most 3 parallel agents on Pro, 8 on Max.
- Escalate one tier only after two failed reviews, and say so.
- Never stop running agents just to change model.
- `validate.mjs` lints all of this.

## Consequences
- Pro users stay inside their limits for normal use.
- Authors of skills must think about cost when they write a skill.
- Routing lives in one file, `system/catalogue/routing.json`.

## Alternatives considered
- **Let the session default decide.** Unsafe for Pro users.
- **Always Opus for quality.** Too costly.
- **Always Haiku.** Quality too low for drafts and reviews.
