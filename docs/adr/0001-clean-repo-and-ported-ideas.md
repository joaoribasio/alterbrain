# 0001. Clean repo with ported ideas, not a COG fork

Status: accepted

## Context
COG-second-brain (MIT) already proves several good ideas: a slop gate, a voice baseline and a wiki habit. An earlier private vault by the author proved the operating model (constitution, identity files, agents, hooks, send guard). Both are heavier or narrower than we need. Alterbrain is for MBA classmates who are not technical.

## Decision
Start a clean repository. Port about eight COG ideas with attribution. Adapt OpenClaw persona templates (MIT). Use second-brain-starter for ideas only, because it has no licence. Record every ported file in `UPSTREAM-SYNC.md` and keep licence texts in `THIRD_PARTY_NOTICES.md`.

## Consequences
- We own the structure and can keep it small.
- We carry the work of attribution and of watching upstream changes by hand.
- Nothing from the author's personal vault enters the repo.

## Alternatives considered
- **Fork COG-second-brain.** Fast start, but it brings its layout and its history, and updates would mean merges for every classmate.
- **Use second-brain-starter code.** Rejected: no licence means no right to reuse it.
- **Start from nothing, no ports.** Slower and repeats solved problems.
