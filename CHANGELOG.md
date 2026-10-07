# Changelog

All notable changes to Alterbrain are listed here. Newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

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
- The repository stays private during the pilot. It becomes public (MIT) after the pilot and a red-team check. During the pilot each classmate is added as a collaborator and signs in with `gh auth login`. The installers and `/update-alterbrain` say this in plain words when the repository cannot be reached. Until then the install and update steps that read https://github.com/joaoribasio/alterbrain anonymously only work for people who are signed in.
- Release date: set it when the `v0.1.0` tag is made (this entry stays "Unreleased" until then).
