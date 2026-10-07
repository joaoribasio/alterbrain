# Changelog

All notable changes to Alterbrain are listed here. Newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-07

### Added
- Rate guard (`rate_guard` hook, `system/catalogue/limits.json`, `config/limits.json`, `rate-guard.mjs`): usage limits for tools that can get an account restricted, with LinkedIn built in. It counts each action after it ran and stops one that is over a daily, weekly, weekday or minimum-gap limit, saying which limit, how much is used and when it resets. A CAPTCHA, security check or similar warning pauses the tool for 24 hours and halves its limits for 14 days; a second warning switches it to draft-only until you lift that. An action whose result is unknown is never repeated for 24 hours. Default LinkedIn limits are deliberately cautious for student accounts (for example 15 connection requests a day). You can lower any limit; raising one needs `accept_risk`. Other servers can be added as data only. The usage record lives in `state/local/rate-guard/` (not backed up, not editable by Claude). Adapted from the framework author's own LinkedIn guard.
- Exposure-based privacy (ADR 0018): your brain stores what you tell it, including sensitive facts, instead of stripping them. A short never-store list stays out of everything saved (passwords and keys, card and bank account numbers, ID numbers, security-question answers). Every fact has a public or private visibility, and anything that leaves your computer uses public facts only unless you say yes for that draft. Other people's notes hold business facts by default. The privacy guide states the trade-off: Claude processes your vault in sessions and it is stored in your private GitHub repository.
- LinkedIn data-portability blueprint (official member data, no scraping) and portable critique-panel prompts in `docs/critique-panel-prompts.md`.

### Changed
- The assistant is called Twin by default (Juno and Atlas are offered as alternatives).
- Voice read-back: you first see what was learned about your writing and can correct it, then read a short sample in your voice, and only then are asked whether it sounds like you.

### Fixed
- The git guard no longer treats output redirections (`2>&1`, `> file`) as git arguments, so `git push 2>&1` is allowed while `git push --force 2>&1` is still blocked.
- The path guards recognise backslash paths on macOS and Linux.

## [0.1.0] - 2026-10-07

The first version (the MVP). It is a complete, working structure with thin features. Depth comes later through self-build.

### Added

**Core**
- One-prompt install in the Claude desktop app (Code tab), plus `install.ps1` and `install.sh` as a fallback.
- `/onboard`: a resumable interview (about 25 minutes for the minimum path) that sets up GitHub, your identity, facts, courses, autonomy, voice, career targets, integrations, brand and existing material.
- An Obsidian vault with a clear folder layout, a `Home.md` dashboard and a human to-do list (`Tasks.md`, Obsidian Tasks format).
- Raw-first ingestion (`/ingest`): files are copied untouched, hashed and logged with provenance, then turned into source notes and wiki pages.
- `/ask` with citations, `/capture`, `/framework`, `/render` (Quarto and Typst), `/weekly-review`, `/learn`, `/edit-voice`.
- `/clarify`: a readiness check that runs before anything is built.
- `/menu`, `/reconfigure`, `/health-check` and `/update-alterbrain`. (`/health-check` is not called `/checkup` because that name is an alias of the built-in `/doctor`; see ADR 0017.)
- Self-build: `/propose`, `/build` and `/remove-skill` (propose, approve, then build).
- Four agents: `researcher`, `lens`, `mail-reader` (quarantined) and `ghostwriter`.
- Model routing law: Sonnet by default, Haiku for triage, Opus only for named judgement steps.
- A quarterly model check (`/health-check`, with a reminder in `/weekly-review`): reads Anthropic's current models and, if a better fit exists, proposes an update. It never changes a model by itself. Skills use aliases, so new versions arrive without edits.
- Obsidian helpers from Obsidian's own team (kepano/obsidian-skills, MIT): `obsidian-markdown`, `obsidian-bases`, `json-canvas`, plus the optional `obsidian-cli` and `defuddle`. Vault habits adapted from Steph Ango's published practices are in `.claude/rules/vault.md` and the "Using Obsidian" guide.
- Safety hooks: protected paths, secret blocking, dangerous-git blocking, an outbound guard and automatic git.
- Automatic git on a single `main` branch. You never type a git command.
- A curated MCP catalogue and `mcp-gen` to generate `.mcp.json`.

**Add-ons (one working case each, plus blueprints)**
- Assignment studio (`/assignment`): new, brief, draft, critique with blind lenses, ship as PDF.
- Email replies (`/reply`): quarantined reading, drafting in your voice, draft-only.
- Jobs in the Netherlands (`/jobs`): scan and apply, with sponsor, language and visa-aware flags.
- Study (`/study`): explanations and spaced-repetition cards that show up in `Tasks.md`.

**Blueprints**
- Buildable-on-request extensions, including always-on options (laptop heartbeat, Telegram, VPS), Instagram, Zotero, morning brief and cost report.

**Framework**
- Zero-dependency Node scripts and hooks (Node 20 or newer), tested with `node --test`.
- GitHub Actions CI on Windows and macOS.
- Seventeen architecture decision records in `docs/adr/` and a research summary in `docs/research/`.

### Notes
- Third-party content is credited in `THIRD_PARTY_NOTICES.md` and `UPSTREAM-SYNC.md`.
- Pilot release. The repository is public (MIT), so install and `/update-alterbrain` work without signing in to GitHub.
