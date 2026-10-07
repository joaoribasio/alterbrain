# 0010. English framework with language-tagged voice

Status: accepted

## Context
Our users write in several languages (for example English and Dutch), but one framework is easier to build, test and support. A voice that sounds like the user must be learned per language.

## Decision
- The framework text, skills and docs are in English (UK spelling).
- Voice is stored per language: `vault/80_me/voice/<lang>/profile.md` and `exemplars.md`. Drafts carry a `lang` field.
- Slop checks use full rules for English and only language-neutral checks for other languages.

## Consequences
- One codebase. Translated framework docs are out of scope for v0.1.
- Dutch or other drafts work through the user's own samples.

## Alternatives considered
- **Translate the whole framework.** Large and hard to keep in sync.
- **One mixed voice profile.** A person writes differently in each language.
