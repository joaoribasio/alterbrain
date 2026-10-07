# Upstream sync

This file maps every file in Alterbrain that comes from someone else's work to its source. Use it to check, once a quarter, whether the sources have changed. Licences are in `THIRD_PARTY_NOTICES.md`.

Modes:
- **verbatim**: copied without changes (apart from the notes below). These files carry no attribution line, so they stay byte for byte identical to upstream. Their licence is the `LICENSE-*` file in the same skill folder, and this table is their record.
- **adapted**: copied or ported, then changed. The file carries an `Adapted from <project> (<licence>) — <url> @ <sha>` line, and `validate.mjs` checks that it does.
- **ideas**: nothing copied. The upstream work only informed the design.

## Files and sources

### OpenClaw workspace templates (MIT, OpenClaw Foundation)

Repo: https://github.com/openclaw/openclaw. Commit: `f215c401e69a22547b31b9e1a2436944ab9528a7`.

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `system/templates/identity/SOUL.md` | `docs/reference/templates/SOUL.md` | adapted | Rewritten in plain English with our sections. Attribution comment at the end. |
| `system/templates/identity/IDENTITY.md` | `docs/reference/templates/IDENTITY.md` | adapted | As above. |
| `system/templates/identity/USER.md` | `docs/reference/templates/USER.md` | adapted | As above. Kept under 4,000 characters. |

`MEMORY.md` and `fact-sheet.md` in the same folder are our own work (OpenClaw has no template for them at that path).

### kepano/obsidian-skills (MIT, Steph Ango)

Repo: https://github.com/kepano/obsidian-skills. Commit: `3ccff5338ea700537839b21900aa5358a0402c98`.

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `.claude/skills/obsidian-markdown/SKILL.md` | `skills/obsidian-markdown/SKILL.md` | adapted | Added `model: inherit` and `effort: low` to the frontmatter; attribution line at the end. |
| `.claude/skills/obsidian-markdown/references/CALLOUTS.md` | `skills/obsidian-markdown/references/CALLOUTS.md` | verbatim | |
| `.claude/skills/obsidian-markdown/references/EMBEDS.md` | `skills/obsidian-markdown/references/EMBEDS.md` | verbatim | |
| `.claude/skills/obsidian-markdown/references/PROPERTIES.md` | `skills/obsidian-markdown/references/PROPERTIES.md` | verbatim | |
| `.claude/skills/obsidian-bases/SKILL.md` | `skills/obsidian-bases/SKILL.md` | adapted | Frontmatter as above. Cut from 504 to 246 lines by moving sections into `references/`. |
| `.claude/skills/obsidian-bases/references/FUNCTIONS_REFERENCE.md` | `skills/obsidian-bases/references/FUNCTIONS_REFERENCE.md` | verbatim | |
| `.claude/skills/obsidian-bases/references/EXAMPLES.md` | `skills/obsidian-bases/SKILL.md` (examples section) | adapted | Split out of upstream SKILL.md. |
| `.claude/skills/obsidian-bases/references/VIEWS_AND_SUMMARIES.md` | `skills/obsidian-bases/SKILL.md` (view types and summaries) | adapted | Split out of upstream SKILL.md. |
| `.claude/skills/obsidian-bases/references/TROUBLESHOOTING.md` | `skills/obsidian-bases/SKILL.md` (troubleshooting) | adapted | Split out of upstream SKILL.md. |
| `.claude/skills/obsidian-bases/references/FILE_PROPERTIES.md` | `skills/obsidian-bases/SKILL.md` (file properties table) | adapted | Split out of upstream SKILL.md. |
| `.claude/skills/json-canvas/SKILL.md` | `skills/json-canvas/SKILL.md` | adapted | Frontmatter as above. |
| `.claude/skills/json-canvas/references/EXAMPLES.md` | `skills/json-canvas/references/EXAMPLES.md` | verbatim | |
| `.claude/skills/obsidian-cli/SKILL.md` | `skills/obsidian-cli/SKILL.md` | adapted | Frontmatter as above. Added an "Alterbrain notes" section (optional, vault safety rules). Upstream body unchanged. Attribution line at the end. |
| `.claude/skills/defuddle/SKILL.md` | `skills/defuddle/SKILL.md` | adapted | Frontmatter as above. Added an "Alterbrain notes" section (optional, run with `npx`, WebFetch as the fallback). Upstream body unchanged. Attribution line at the end. |
| `.claude/skills/obsidian-markdown/LICENSE-obsidian-skills`, `.claude/skills/obsidian-bases/LICENSE-obsidian-skills`, `.claude/skills/json-canvas/LICENSE-obsidian-skills`, `.claude/skills/obsidian-cli/LICENSE-obsidian-skills`, `.claude/skills/defuddle/LICENSE-obsidian-skills` | `LICENSE` | verbatim | |

Not taken: the upstream skill `knap` and the `.claude-plugin/` files.

### petergyang/no-ai-slop (MIT, Peter Yang)

Repo: https://github.com/petergyang/no-ai-slop. Commit: `000650b156983f5159695b441477f4e63b25dc85`.

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `.claude/skills/edit-voice/SKILL.md` | `skills/no-ai-slop/SKILL.md` (the two modes and workflow) | adapted | Changed to work with voice profiles per language. Attribution line at the end. |
| `.claude/skills/edit-voice/references/patterns.md` | `skills/no-ai-slop/SKILL.md` (principles, words, patterns) | adapted | Attribution line at the end. |
| `.claude/skills/edit-voice/references/eval.md` | `skills/no-ai-slop/eval.md` | adapted | Attribution line at the end. |
| `.claude/skills/edit-voice/LICENSE-no-ai-slop` | `LICENSE` | verbatim | |

### huytieu/COG-second-brain (MIT, Huy Tieu)

Repo: https://github.com/huytieu/COG-second-brain. Commit: `c6cb32807254254abff0a04a8a59df2ac9e39eb9` (last commit that touched both files; the repo HEAD when we fetched was `36ac9d78d66e61a41d6471ae88c2b844737fc853`).

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `system/scripts/slop-check.mjs` | `.claude/skills/slop-gate/scripts/scan.py` (blob `e8a64f55df1992d8d6d6f16dbb303ccb1638941b`) | adapted | Ported from Python to Node. Pattern lists kept as data in `DEFAULT_LISTS`. Added language handling and user word lists. |
| `system/scripts/voice-stats.mjs` | `.claude/skills/voice-baseline/scripts/census.py` (blob `35334fdd7642d9dcae11f90bc453571c555ade57`) | adapted | Ported from Python to Node. Added per-language output and a draft check. |

The wiki habits (index, log, ingest) in `/ingest` and the braindump principle in `/capture` use COG ideas only, with no copied text.

### andreasthinks/obsidian-to-quarto-exporter (MIT, Andreas Varotsis)

Repo: https://github.com/andreasthinks/obsidian-to-quarto-exporter. Commit: `1c58a962f24e34d9edca1efec6c4beabfce0f445`.

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `system/scripts/qmd-prerender.mjs` | `README.md` (conversion rules) | ideas | No code copied. The file still carries an attribution line for transparency. |

### kazuyanagimoto/quarto-awesomecv-typst (MIT, Kazuharu Yanagimoto)

Repo: https://github.com/kazuyanagimoto/quarto-awesomecv-typst. Release v0.3.3. Commit: `33e70a3ef0bcf28960773f2f8438861ed94b5b4a`. Our changes are listed in `system/quarto/templates/cv/_extensions/awesomecv/PATCHES.md`.

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `system/quarto/templates/cv/_extensions/awesomecv/_extension.yml` | `_extensions/awesomecv/_extension.yml` | adapted | Registers our extra shortcode `cv.lua`. |
| `system/quarto/templates/cv/_extensions/awesomecv/typst-template.typ` | `_extensions/awesomecv/typst-template.typ` | adapted | Four small patches (bundled Font Awesome, optional icon, plain contacts, Arial default). |
| `system/quarto/templates/cv/_extensions/awesomecv/typst-show.typ` | `_extensions/awesomecv/typst-show.typ` | adapted | Colours come from the brand file. |
| `system/quarto/templates/cv/_extensions/awesomecv/input-yaml.lua` | `_extensions/awesomecv/input-yaml.lua` | adapted | Attribution line added; otherwise unchanged. |
| `system/quarto/templates/cv/_extensions/awesomecv/LICENSE` | `LICENSE` | verbatim | |
| `system/quarto/templates/cv/_extensions/awesomecv/PATCHES.md` | (ours) | n/a | Lists our changes. |
| `system/quarto/templates/cv/_extensions/awesomecv/cv.lua` | (ours) | n/a | New file, not from upstream. |

`system/quarto/templates/cv/_extensions/alterbrain-cv-ats/`, `alterbrain-letter`, `alterbrain-deck` and `alterbrain-report` (apart from `apa.csl`) are our own work.

### citation-style-language/styles (CC BY-SA 3.0)

Repo: https://github.com/citation-style-language/styles. Commit: `89c63834393a5f806e375b0816dc110c3be93d44`.

| Our file | Source path | Mode | Notes |
|---|---|---|---|
| `system/quarto/templates/report/_extensions/alterbrain-report/apa.csl` | `apa.csl` (blob `d663d1e1b728c5fbc70dea233e1c0d09121e8909`) | adapted | Only change: removed the two author `<email>` lines and added a comment saying so. Share-alike applies to this file. |

### Downloaded at setup time (not in this repo)

| Item | Source | Version | Notes |
|---|---|---|---|
| Obsidian Tasks | https://github.com/obsidian-tasks-group/obsidian-tasks | 8.4.0 | MIT. Pinned with sha256 in `system/catalogue/obsidian-plugins.json`. |
| Obsidian Git | https://github.com/Vinzent03/obsidian-git | 2.41.1 | MIT. Pinned with sha256 in `system/catalogue/obsidian-plugins.json`. |

### Ideas only, nothing copied

- second-brain-starter: no licence, so ideas only (ADR 0001).
- Steph Ango's essays https://stephango.com/vault and https://stephango.com/file-over-app (retrieved 2026-10-07): vault habits paraphrased in `.claude/rules/vault.md` and `system/docs/guides/using-obsidian.md`. No text copied. Re-read them at the quarterly check in case his practices have moved on.
- The author's own earlier private vault and Quarto kit: lessons and structure, no assets, logos or text.

## Checking for upstream changes (every quarter)

Do this in a development checkout (`state/local/dev-mode` present). It needs `gh` signed in. Nothing here changes any file; you decide what to port.

1. **Has the source moved on?** For each repo above, compare our commit with the current default branch:

   ```
   gh api repos/<owner>/<repo>/compare/<our-commit>...HEAD --jq "{ahead: .ahead_by, status: .status}"
   ```

2. **Did our files change upstream?** List only the commits that touched the source path:

   ```
   gh api "repos/<owner>/<repo>/commits?path=<source-path>&since=<date-of-our-commit>" --jq ".[].commit.message"
   ```

   Use the paths in the tables above. Nothing listed means nothing to do.
3. **Read the diff** for any path that changed:

   ```
   gh api repos/<owner>/<repo>/compare/<our-commit>...HEAD --jq ".files[] | select(.filename==\"<source-path>\") | .patch"
   ```

4. **Decide** per file: port the change, skip it (write the reason below), or leave for later.
5. **After porting**, update the commit hash in the attribution line of the file, in the table above and in `THIRD_PARTY_NOTICES.md`. Run `node system/scripts/validate.mjs --write-manifest` and the tests (`node --test "tests/**/*.test.mjs"`).
6. **Licences:** check that each repo's licence has not changed (`gh api repos/<owner>/<repo>/license --jq .license.spdx_id`). If one has, stop and read it before porting anything newer.
7. **Plugins and Quarto:** check the latest Obsidian Tasks and Obsidian Git releases, and the CSL `apa.csl` file, the same way. For a new plugin version, update the pinned hashes in `system/catalogue/obsidian-plugins.json` from the release assets.
8. **Record** the date and outcome in the log below.

## Log

| Date | Checked by | Outcome |
|---|---|---|
| 2026-10-07 | initial build | All sources pinned at the commits above. |
