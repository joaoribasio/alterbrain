# Research summary

Research was done on 6 and 7 October 2026: 41 research agents across 14 tracks, two deep reads of the author's earlier vault, a trim map of COG-second-brain, an extraction of the author's MBA case pipeline, a synthesis and a red-team critique. This summary lists only what the plan and `docs/SPEC.md` record. Exact upstream commits are in `UPSTREAM-SYNC.md`. Licence texts are in `THIRD_PARTY_NOTICES.md`. Claims that need a live check (prices, terms, thresholds) are marked, and the framework does not hard-code them.

## 1. What we learned, and what we did with it

- **OpenClaw workspace pattern and security incidents.** Learned: a personal agent works well with a few plain files (persona, identity, user, memory); OpenClaw templates are MIT. Tools of this kind that can send messages and run commands had serious security incidents. Did: adapted the persona templates with attribution (ADR 0001); draft-only autonomy and a fail-closed outbound guard (ADR 0008); always-on as blueprints only (ADR 0013).
- **Karpathy LLM wiki.** An LLM is most useful maintaining a linked wiki with an index. Did: `30_wiki/` with `index.md` and `log.md`, maintained by `ingest`; answers cite notes (ADR 0007).
- **COG-second-brain (MIT, Huy Tieu).** A slop gate, a voice baseline and wiki habits are worth keeping. Did: ported about eight ideas with attribution, including `slop-check.mjs` and `voice-stats.mjs` (ADR 0001).
- **claude-obsidian.** Claude Code and an Obsidian vault fit together. Did: used as a reference for vault and Obsidian setup.
- **PAI / LifeOS.** A "life operating system" needs a constitution, identity files and a feedback loop. Did: `system/core.md`, identity files in `vault/80_me/`, the `learn` skill.
- **second-brain-starter licence issue.** The project has no licence. Did: ideas only, nothing copied (ADR 0001).
- **Claude Code channels, remote control, scheduled tasks, subscription terms.** Claude Code can run on a schedule, from a phone or via channels such as Telegram; subscription terms matter for unattended use. Did: no daemons, three always-on blueprints, terms explained before building (ADR 0013), unmodified Claude Code. Check live: terms and limits change.
- **MCP catalogue findings.** MCP servers vary in safety, cost and upkeep; some are archived; some carry terms-of-service risk. Did: a curated catalogue (`system/catalogue/mcp.json`) with tiers: core (mcpvault, playwright-mcp, Context7 on by default; markitdown-mcp, fetch and filesystem off until asked, the first two needing `uv`), optional (Google Workspace read-only, Canvas, Zotero, qmd and others), high-risk opt-in (LinkedIn, Instagram, Telegram; JobSpy is a blueprint-only helper in `jobs-extras`, not a catalogue entry) and avoid (WhatsApp, X, archived servers). Each entry records licence, auth, cost, ToS risk, writes and the verified date. Example: https://github.com/microsoft/playwright-mcp
- **Voice-twin techniques.** Exemplars (the user's own texts per language); the edit-learning loop (learn from the user's edits of drafts); slop lists (hard tells fail on one hit, filler on three or more); eval caution (measuring "sounds like me" is hard, so the user reading the profile back is the real test). Did: per-language profiles, `voice-stats.mjs`, `slop-check.mjs`, `edit-voice` (adapted from no-ai-slop, MIT, Peter Yang), a `facts_used` table so unknown facts block approval.
- **Quarto and Typst.** Quarto with Typst gives clean PDFs that respect page limits. Did: the `render` skill, templates in `system/quarto/`, a brand file, `qmd-prerender.mjs`; minimum Quarto version is in `system/release.json`.
- **Obsidian Tasks, Bases, mcpvault.** Tasks gives a checkbox format readable without the plugin; Bases gives database-like views; mcpvault lets Claude read the vault. Did: `Tasks.md` (ADR 0014), `Home.md` with Tasks queries and Bases views, plugins pinned by sha256 in `system/catalogue/obsidian-plugins.json` (release hashes recorded). Also used: https://github.com/kepano/obsidian-skills (MIT).
- **Windows lessons from the author's earlier vault.** `python3` is often absent, so Node only (ADR 0015). UTF-8 must be explicit, with LF endings. iCloud plus `.git` corrupts repos, so keep the project out of iCloud and similar sync folders (ADR 0004). Hook paths must be anchored: resolve from `CLAUDE_PROJECT_DIR`, then from the file location, never from cwd.

## 2. Open points

Checked on 7 October 2026 and now closed. The details are in `docs/research/claude-code-mechanics.md` and `docs/SPEC.md` section 17.

- **Hook command form:** exec form (`command` plus `args`, with `${CLAUDE_PROJECT_DIR}`), which works the same in Git Bash and PowerShell.
- **Skill and agent frontmatter keys:** confirmed against the Claude Code docs.
- **Built-in name clashes:** confirmed. `checkup` is an alias of `/doctor`, so the skill is called `health-check` (ADR 0017).
- **Gmail connector tool names:** the connector tools are named `mcp__claude_ai_Gmail__<tool>` and include send tools, so draft-only is enforced by our own guard.
- **Repo plugins in cloud sessions:** confirmed that they do not load, which supports ADR 0006.
- **IND recognised-sponsor register format:** verified by the jobs package with a live run (see `system/packs/country-nl/`).
- **2026 highly-skilled-migrant salary thresholds:** verified by the jobs package and kept in one table, `system/packs/country-nl/salary-thresholds.md`. They are updated every January and never hard-coded elsewhere.

Still open:

- **SessionEnd on desktop close.** It is not documented whether the hook fires when a desktop session closes. A throttled Stop hook covers it.
- **Gmail read-tool names.** The send and draft tools are known. The read and search tool names need confirming with `/mcp` on a connected account.
- **Adzuna NL.** The `nl` endpoint follows the documented pattern, but it was not tested live because no keys were available. The terms on storing results also need the user's own reading.
- **Live Obsidian check.** The Tasks queries on `Home.md` and the `.base` files in `vault/_views/` were checked as files only, not in a running Obsidian.
