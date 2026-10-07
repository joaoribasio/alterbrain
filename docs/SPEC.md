# Alterbrain build spec (v0.1)

This document is the single contract for everyone, human or agent, who writes framework files. If a file disagrees with this spec, the spec wins. If the spec is wrong, fix the spec first.

Plan of record: `docs/adr/` (decisions) and the approved plan (summarised in `docs/research/summary.md`).

---

## 1. Principles

1. **The user is not technical.** Every user-facing sentence is plain English: short sentences, no jargon, and any unavoidable term explained in one line. UK spelling.
2. **A complete structure, thin features.** The core works out of the box. Each add-on ships one working case plus a blueprint for extending it. Depth comes from self-build (propose → approve → build).
3. **Draft, never act.** Nothing leaves the machine (email, post, application, message) unless `config/autonomy.json` allows it for that channel. The default is `draft`.
4. **Clarify before building.** No skill, agent, document, assignment or application starts from a vague request. Run `/clarify` first.
5. **Raw first, cite always.** Everything ingested is copied raw with provenance. Answers cite the source notes.
6. **Smart model use.** Every agent and skill declares `model` and `effort` (§6).
7. **Zero dependencies.** Scripts and hooks use Node ≥ 20 built-ins only (ESM `.mjs`). No `npm install` and no Python in the core. Python appears only in optional blueprints and in a few MCP servers that start with `uvx` (`markitdown`, `fetch`); those are off by default until `uv` is installed.
8. **Windows first, macOS equal.** Never use bash-only syntax, symlinks, `/tmp`, `python3` or `date` in shell prose. Use `path.join` and `os.tmpdir()`. Line endings are LF.
9. **Git is invisible.** One `main` branch, automatic commit and push, no worktrees and no branches. The user never types git.
10. **No personal data in the framework.** Fixtures are synthetic. The upstream repo never contains anything about a real user.

---

## 2. Repository layout and ownership

```
alterbrain/
├─ README.md  LICENSE  THIRD_PARTY_NOTICES.md  UPSTREAM-SYNC.md  CHANGELOG.md   [F text]
├─ CLAUDE.md                          [F text]  imports only (see §5)
├─ .claude/
│  ├─ settings.json                   [F code]  model, hooks, permissions baseline
│  ├─ settings.local.json             [U, gitignored]
│  ├─ rules/*.md                      [F text]  always-on or path-scoped rules
│  ├─ skills/<name>/SKILL.md (+ references/, workflows/)   [F text]
│  ├─ skills/my-<name>/               [U]  self-built skills
│  ├─ agents/<name>.md                [F text]
│  └─ agents/my-<name>.md             [U]  self-built agents
├─ system/                            [F]
│  ├─ core.md                         [F code]  the constitution (protected)
│  ├─ release.json                    [F code]  {name, version, tag, repo, min_claude_code, min_node, min_quarto}
│  ├─ manifest.json                   [F code]  generated; file list + class + sha256
│  ├─ hooks/*.mjs                     [F code]
│  ├─ scripts/*.mjs, install.ps1, install.sh   [F code]
│  ├─ lib/*.mjs                       [F code]  shared helpers for hooks and scripts
│  ├─ catalogue/mcp.json, routing.json, obsidian-plugins.json   [F code]
│  ├─ catalogue/MCP-CATALOGUE.md      [F text]  human-readable view of mcp.json
│  ├─ templates/                      [F text]  vault skeleton, identity templates, note templates, config defaults
│  ├─ blueprints/*.md                 [F text]
│  ├─ docs/guides/*.md                [F text]  read by /menu
│  ├─ packs/mba/                      [F text]  pack references: lens prompts, framework seeds, course/case templates, jobs-nl/ reference tables
│  ├─ packs/twin/                     [F text]  drafting rules and voice-import steps (used by `ghostwriter` and `/reply`)
│  └─ quarto/                         [F text]  Quarto templates, _extensions (vendored), brand, fonts; tools/render.mjs (render, scaffold)
├─ config/                            [U]  brain.json, autonomy.json, mcp.selected.json
├─ state/                             [U]  onboarding.json, proposals.json, built.json (section 10), release-origin.json (section 15); local/ is gitignored
├─ .mcp.json                          [U generated]  by system/scripts/mcp-gen.mjs
├─ docs/                              [F text]  SPEC.md (this file), adr/ (decisions), research/
├─ tests/                             [F code]  node --test suites + fixtures (synthetic)
├─ .github/workflows/ci.yml           [F code]
└─ vault/                             [U]  the Obsidian vault (Obsidian opens THIS folder)
```

`F` = framework, `U` = user. Two classes of framework file:
- **`code`** files are replaced verbatim on update and are write-protected by `protect_paths`.
- **`text`** files may be customised by the user; customised ones are reconciled on update with a 3-way review.

**Dev mode.** If `state/local/dev-mode` exists, `protect_paths` allows framework edits and auto-git is off. That file exists only in the framework developer's checkout, which is how we build Alterbrain itself.

---

## 3. Vault layout and conventions

```
vault/
├─ Home.md                    dashboard (Tasks queries + Bases views + "what can I ask?")
├─ _views/                    the `.base` files (Assignments, Applications, Drafts, Proposals, Sources, Cards due), embedded by Home.md
├─ 00_inbox/
│  ├─ Tasks.md                THE human to-do list (§4)
│  ├─ outbox/                 drafts awaiting the human (emails, applications, posts)
│  ├─ proposals/              self-build proposal cards
│  └─ captures/               quick notes from /capture
├─ 10_projects/               time-boxed work (assignments, job campaigns, group work)
├─ 20_areas/
│  ├─ courses/<course-slug>/  course.md (syllabus, AI policy), sessions/, cases/, assignments/
│  └─ career/                 career.md (targets), applications/, cv/
├─ 30_wiki/                   agent-maintained knowledge
│  ├─ index.md  log.md
│  ├─ concepts/  frameworks/  companies/  industries/  topics/   (topics/ = answers filed back by /ask)
├─ 40_sources/
│  ├─ raw/YYYY/               immutable copies (LFS for binaries); raw/_local/ = too big for git (gitignored)
│  ├─ text/YYYY/              extracted text (markdown)
│  ├─ notes/                  one source note per raw file
│  └─ manifest.jsonl          provenance ledger (§9)
├─ 50_learning/cards/         study cards (§12)
├─ 60_people/                 people notes (business info only, source + date per fact)
├─ 70_journal/  daily/  weekly/  decisions/
└─ 80_me/
   ├─ SOUL.md  IDENTITY.md  USER.md  MEMORY.md  fact-sheet.md
   ├─ voice/<lang>/profile.md  voice/<lang>/exemplars.md  voice/<lang>/stats.json (baseline for `voice-stats.mjs --check`)
   ├─ voice/slop-extra.json   (optional: the user's own word lists for `slop-check.mjs`)
   └─ brand/_brand.yml
```

### Conventions
- **File names:** human-readable Title Case for notes (`Porter Five Forces.md`); kebab-case for folders. Never two names differing only by case.
- **Links:** Obsidian wikilinks `[[Note Name]]`; embeds `![[file]]`. Further habits (file over app, one date format, properties over folders, link liberally), adapted from Steph Ango's published vault practices, are in `.claude/rules/vault.md`; where they differ from this section, this section wins.
- **Frontmatter:** every note has YAML frontmatter with at least `type`, `created` (YYYY-MM-DD) and `status`. Strings are double-quoted.
- **Dates:** always take them from the system (`node -e "console.log(new Date().toISOString())"` or the hook digest). Never guess a date.
- **Citations** in wiki and answers: `[Source: [[note]] | YYYY-MM-DD | confidence: high|medium|low]`.
- **Labels** for anything not directly sourced: `[Inference]`, `[Unverified]`.

### Note types (`type:` frontmatter)

| type | where | required extra fields |
|---|---|---|
| `source` | 40_sources/notes | `raw`, `sha256`, `origin`, `ingested`, `kind` (pdf, web, email, doc, slides, sheet, transcript, other) |
| `concept` | 30_wiki/concepts | `sources: []` |
| `framework` | 30_wiki/frameworks | `family`, `when_to_use`, `sources: []` |
| `company` | 30_wiki/companies | `sources: []` |
| `course` | 20_areas/courses/x/course.md | `code`, `term`, `school`, `ai_policy` (allowed, allowed-with-disclosure, restricted, banned, unknown), `ai_policy_quote` |
| `case` | courses/x/cases | `course`, `question`, `case_type` (decision, evaluation, diagnosis), `case_date` (YYYY-MM-DD, the date the case is set; see §13 hindsight rule). Template: `system/packs/mba/templates/case.md` |
| `assignment` | 10_projects/<slug>/assignment.md | see §13. `limits` is a small map `{ pages, font_pt, line_spacing, words }` (any may be null). Template: `system/packs/mba/templates/assignment.md` |
| `application` | 20_areas/career/applications | `company`, `role`, `stage` (found, shortlisted, preparing, applied, interview, offer, rejected, withdrawn), `source_url`, `deadline`; plus the extra fields below |
| `draft` | 00_inbox/outbox | `channel`, `to`, `lang`, `status` (draft, approved, sent, killed), `facts_used: []`; plus the extra fields below |
| `proposal` | 00_inbox/proposals | see §11 |
| `person` | 60_people | `org`, `role`, `source`, `dnc` (do not contact, true/false) |
| `card` | 50_learning/cards | see §12 |
| `daily`, `weekly`, `decision` | 70_journal | `decision` notes never have the Decision field filled by the agent |
| `capture` | 00_inbox/captures | `status` (new, filed). The body is the user's words, untouched (`/capture`) |
| `topic` | 30_wiki/topics | `sources: []`, `status: "active"`. An answer from `/ask` filed back with its citations |
| `analysis` | wherever the user works (usually a project folder) | `framework`, `subject`, `question`, `sources: []`. Output of `/framework` |
| `scan` | 10_projects/<YYYY> Job search | `roles: []`, `cities: []`, `found`, `shortlisted`. Summary of one `/jobs scan` |
| `rubric` | assignment folder | `assignment`, `scale`, `grade_mapping`. The verbatim rubric text first, our reading second |
| `decisions` | assignment folder | `assignment`. Log of the user's decisions (D1, D2, ...) |
| `brief` | assignment folder | `assignment`, `thesis`. The fact base for the assignment |
| `critique` | assignment folder | `assignment`, `round`, `panel: []`, `grade_low`, `grade_mid`, `grade_high`, `plateau`, `thesis`. Consolidated critique of one round |
| `review-round` | assignment folder | `assignment`, `round`, `panel: []`, `case_date`. The round card handed to the lenses |
| `review` | `reviews/<round>/<lens>.md` | `lens`, `round`. One lens report, saved word for word |
| `lens` | `system/packs/mba/lenses/` (framework file, not a vault note) | `name`, `model`, `effort`, `word_cap`, `panels: []` |
| `identity` | 80_me | `status`. Used by SOUL, IDENTITY, USER and MEMORY |
| `fact-sheet` | 80_me/fact-sheet.md | `status`. The facts allowlist for drafts |
| `voice-profile` | 80_me/voice/<lang>/profile.md | `lang`, `status` (draft, active), `calibrated`, `samples` |
| `voice-exemplars` | 80_me/voice/<lang>/exemplars.md | `lang`, `status`. Real samples tagged by channel and recipient class |
| `tasks` | 00_inbox/Tasks.md | `status`. Generated by `system/lib/tasks.mjs`; has no `created` field |
| `blueprint` | `system/blueprints/` (framework file, not a vault note) | see section 16 |

Other `type` values appear only in framework files, not in the vault: `guide`, `reference`, `readme`, `home`, `index`, `log`.

**Extra `draft` fields** (written by `ghostwriter` and `/reply`; the email ones are empty for other channels):

| field | meaning |
|---|---|
| `recipient_class` | one of the seven classes below |
| `subject` | email subject |
| `in_reply_to` | the thread id the draft answers (empty for a new message) |
| `thread_id` | the thread id from `mail-reader` |
| `gmail_draft_id` | the id the Gmail connector returns once the draft exists there (empty until then) |
| `facts_ok` | `true` if every statement matched the allowlist and nothing is flagged |
| `facts_flagged: []` | statements that need the user's OK. Approval is blocked while this is not empty |
| `slop_check` | `pass` or `fail`, from `slop-check.mjs` (after `edit-voice` fixes) |
| `voice` | `ok` or `missing` (no profile in this language yet) |
| `exemplars: []` | ids of the exemplars used, for example `E07` |

**Extra `application` fields** (written by `/jobs scan`): `location`; `fit` (score); `sponsor` (the IND register phrase, or `n/a`); `dutch` (language signal: required, likely, preferred, not_required, unknown); `salary_check` (verdict against `system/packs/mba/jobs-nl/salary-thresholds.md`, or `n/a`); `source` (`adzuna` or `career-page`); `retrieved` (date).

**Recipient classes** (`system/packs/twin/drafting.md`; the same names tag the exemplars):

| class | who |
|---|---|
| `faculty` | professors, lecturers, teaching assistants |
| `school-staff` | programme office, admissions, careers centre, IT |
| `recruiter` | recruiters, hiring managers, interviewers |
| `professional` | alumni, colleagues, companies, networking contacts |
| `peer` | classmates, teammates, study group |
| `close` | friends, family |
| `group` | many recipients, mailing lists |

---

## 4. Human task list (`vault/00_inbox/Tasks.md`)

**Syntax** (Obsidian Tasks emoji format, readable without the plugin):

```
- [ ] Review reply to Prof. Smith #ab/reply 📅 2026-10-09 🔼 [[outbox/2026-10-08 Reply to Prof Smith]]
```

**Fields:**
- **Tag `#ab/<skill>`.** Required on agent-created tasks; it marks them as "agent needs you".
- **Due `📅 YYYY-MM-DD`.**
- **Priority:** `⏫` high, `🔼` medium, `🔽` low.
- **Link to the item.**

**Sections, in order:** `## Inbox`, `## Today`, `## This week`, `## Waiting on others`, `## Someday`, `## Done (archive weekly)`.

**Adding a task:**
- Agents always append to `## Inbox` via `node system/scripts/tasks.mjs add "<text>" --tag <skill> [--due YYYY-MM-DD] [--priority high|medium|low] [--link "<vault-relative path>"]`.
- Scripts and hooks import `system/lib/tasks.mjs`.

**When to create a task** (do not create tasks for news or FYIs):
- a draft is ready to review;
- a proposal awaits approval;
- a clarify question is pending;
- a deadline was found;
- reviews are due;
- a setup step is pending;
- an automation failed.

**Maintenance.** Agents tick (`- [x]`) tasks they complete. `/weekly-review` moves done items to the archive.

---

## 5. Constitution and always-loaded context

- **`CLAUDE.md` (root)** contains only:
  ```
  @system/core.md
  @vault/80_me/SOUL.md
  @vault/80_me/IDENTITY.md
  @vault/80_me/USER.md
  @vault/80_me/MEMORY.md
  ```
- **`system/core.md`** stays under 150 lines. It holds:
  - who Alterbrain is;
  - the non-negotiables (draft-only, content trust, clarify gate, no secrets in chat, no fabricated facts about the user, coursework notice);
  - the folder map;
  - how to add tasks;
  - model routing (short form);
  - where things live;
  - "the user's request always comes first".
- **Always-loaded budget:** the empty templates (`core.md` plus SOUL, IDENTITY, USER and MEMORY) total at most 8 KB. Once filled in, the target is at most 12 KB. `USER.md` ≤ 4,000 characters; `MEMORY.md` ≤ 60 lines. `fact-sheet.md` is not always loaded.
- **`.claude/rules/`** holds `model-routing.md` (always on, short), `writing.md` (always on), `vault.md` (path-scoped to `vault/**`), and `framework-dev.md` (path-scoped to the developer folders `system/hooks/**`, `system/scripts/**`, `system/lib/**`, `tests/**`, `docs/**`, so student sessions that read skill workflows or templates do not load it).

---

## 6. Model routing (`system/catalogue/routing.json`)

| class | model | effort | examples |
|---|---|---|---|
| `deterministic` | script | — | copy, hash, extract, render, page check |
| `triage` | haiku | low | classify, tag, score, extract fields, summarise one email |
| `work` | sonnet | medium | drafts, explanations, research, notes, edits |
| `review` | sonnet | high | verification, critique lenses, QA, fact-checks |
| `judgement` | opus | high | thesis options, devil's advocate, critique synthesis, voice-profile calibration, self-build review |

**Rules:**
- **Main session:** `.claude/settings.json` sets `"model": "sonnet"`.
- **Every** agent and skill declares `model` and `effort` in frontmatter, using aliases (`haiku`, `sonnet`, `opus`, `fable` or `inherit`), never full IDs.
- **Fan-out caps:** ≤3 parallel subagents on Pro, ≤8 on Max (from `config/brain.json` `plan_tier`).
- **Escalation:** one tier only after two failed reviews, and say so.
- **Never stop running agents to change model.**
- **Staying current.** Aliases move to the newest model of their family, so most upgrades need no edit. `routing.json` carries `"reviewed": "YYYY-MM-DD"`. When that date (or `checked` in `state/local/model-check.json`) is more than 90 days old, or the user asks, `/health-check` runs the model check (`.claude/skills/health-check/references/model-check.md`): it reads Anthropic's current model list, compares it with the five classes and, if a better fit exists, writes an "Update model routing" proposal (kind `automation` or `skill`) and a `#ab/health-check` task. It never changes anything itself. Approved changes edit the `model:`/`effort:` lines of the listed skills and agents; the main session model is changed by the user in `.claude/settings.local.json`, never in `.claude/settings.json`. `/weekly-review` adds a reminder task when the check is due.

---

## 7. Skill authoring contract

**Location:** `.claude/skills/<name>/SKILL.md`. Supporting files go in `references/` or `workflows/` (loaded on demand). Keep SKILL.md ≤ 250 lines.

**Frontmatter** (exact keys; unknown keys are not allowed):
```yaml
---
name: <name>
description: <one sentence: what it does + when to use it, written so Claude picks it correctly>
model: haiku|sonnet|opus|inherit
effort: low|medium|high
argument-hint: "<optional>"
---
```
*(Final key list confirmed against Claude Code docs; see §17.)*

**Body sections, in this order:**
1. `# <Title>`: one line in plain English.
2. `## When to use`
3. `## Before you start`: the clarify requirements (link `/clarify` checklist type) and which files to read.
4. `## Steps`: numbered and imperative, naming exact files, scripts and agents.
5. `## Outputs`: files written, tasks created.
6. `## Safety`: anything non-negotiable for this skill.
7. `## Extend this`: link to the relevant blueprint (add-ons only).

**Rules:**
- **Talk to the user one question at a time.** Use AskUserQuestion for choices (2–4 options, recommended first) and free text for narrative.
- **Never ask what can be inferred** from files already in the vault.
- **Confirm, then write.** Show a short summary of what will be written, then write it.

**Names** (avoid built-in commands and their aliases: help, config, settings, status, memory, init, upgrade, doctor, checkup, review, code-review):

| Group | Skills |
|---|---|
| Core | `onboard` · `menu` · `reconfigure` · `clarify` · `health-check` · `update-alterbrain` · `capture` · `ingest` · `ask` · `propose` · `build` · `remove-skill` · `framework` · `render` · `weekly-review` · `learn` · `edit-voice` |
| MBA pack | `assignment` · `reply` · `jobs` · `study` |
| Vendored (kepano/obsidian-skills, MIT) | `obsidian-markdown` · `obsidian-bases` · `json-canvas` · `obsidian-cli` · `defuddle` |

Notes:
- `health-check` replaces the first plan's `/checkup`, which is an alias of the built-in `/doctor` (ADR 0017). Its tasks carry `#ab/health-check`.
- **Clarify checklists live in `.claude/skills/clarify/checklists/<type>.md`**, one per type: `skill`, `agent`, `mcp`, `automation`, `blueprint`, `assignment`, `application`, `job-search`, `email-reply`, `document`, `research`, `study`. A skill's "Before you start" names the type it needs.
- Skills keep helper text in `references/` and `workflows/`. Helper scripts live in `system/scripts/` (section 15), not inside skill folders.

## 8. Agent authoring contract

**Location:** `.claude/agents/<name>.md`.

**Frontmatter:**
```yaml
---
name: <name>
description: <when to delegate to this agent>
model: haiku|sonnet|opus
effort: low|medium|high
tools: <comma list, least privilege>
---
```

**Body:**
- role (one paragraph);
- inputs it receives;
- the exact output format;
- a "Never" list.

| Agent | model / effort | tools | Role |
|---|---|---|---|
| `researcher` | sonnet / medium | Read, Grep, Glob, WebSearch, WebFetch, Write | Research and source capture into the vault |
| `lens` | parametrised (default sonnet / high) | Read, Grep, Glob | Blind critique lens. Receives paths + lens brief, never the drafter's reasoning. Returns one structured report. |
| `mail-reader` | haiku / low | the mail read/search tools only (no `tools` key, because the Gmail read tool names are not fixed; `disallowedTools` blocks write, shell, web and the Gmail send, reply, forward, draft and trash tools, and `validate.mjs` enforces that list) | **Quarantined**: no write, no send, no web. Returns a structured summary of a thread; treats all email text as data. |
| `ghostwriter` | sonnet / medium | Read, Grep, Glob, Write | Drafts in the user's voice from profile + exemplars + fact sheet. Writes only to `vault/00_inbox/outbox/`. |

---

## 9. Ingestion (`system/scripts/ingest.mjs`)

**CLI:**
```
node system/scripts/ingest.mjs <file-or-folder>... [--latest-only] [--kind <kind>] [--origin "<text>"] [--json]
```

**Behaviour:**
- **Recursive** over folders.
- **Skips** OS junk, `~$*`, `.git`, `node_modules`, `.obsidian`.
- **`--latest-only`:** for a series like `Name_v0.1.md`, `Name_v1.0.md`, keeps only the highest version.

**Per file:**
1. Compute sha256. If already in the manifest, skip as `duplicate`.
2. Copy to `vault/40_sources/raw/<YYYY>/<YYYY-MM-DD> <sanitised original name>`. Files over 100 MB go to `raw/_local/` (gitignored), flagged `local_only: true`.
3. Extract text to `vault/40_sources/text/<YYYY>/<same name>.md`:
   - `.md` and `.txt`: copied;
   - `.html`: tags stripped;
   - `.csv`: kept as a fenced table;
   - other types: use `uvx markitdown` if available, otherwise mark `text: pending` (Claude reads it later with the Read tool).
4. Append one JSON line to `vault/40_sources/manifest.jsonl`:
   ```json
   {"id":"<sha8>","sha256":"…","origin":"<original absolute path or URL>","stored":"vault/40_sources/raw/…","text":"vault/40_sources/text/…|null","text_status":"done|pending|none","size":123,"ext":".pdf","kind":"pdf","ingested":"<ISO>","local_only":false,"note":null}
   ```

**Output:** a summary (and `--json`). The `ingest` skill then writes one source note per new file and updates the wiki (`index.md`, `log.md`, concepts). Raw files are never edited or deleted.

---

## 10. Config schemas

Defaults live in `system/templates/config/`; onboarding copies them to `config/`.

### `config/brain.json`
```json
{
  "schema": 1,
  "user": { "name": "", "timezone": "Europe/Amsterdam", "languages": ["en"] },
  "plan_tier": "pro",
  "packs": ["core", "mba"],
  "school": { "name": "", "programme": "", "lms": "canvas" },
  "self_build": { "mode": "propose", "proactive": true, "max_open_proposals": 3 },
  "evidence_mode": "light",
  "git": { "auto_commit": true, "auto_push": true },
  "jobs": { "country": "NL", "needs_sponsorship": null, "languages": ["en"], "sources": ["adzuna", "career-pages"] }
}
```

### `config/autonomy.json`
`level` ∈ `draft`, `approve`, `auto`.

```json
{
  "schema": 1,
  "default": "draft",
  "channels": {
    "email":    { "level": "draft" },
    "calendar": { "level": "draft" },
    "jobs":     { "level": "draft" },
    "linkedin": { "level": "draft" },
    "social":   { "level": "draft" },
    "messaging":{ "level": "draft" },
    "web-forms":{ "level": "draft" }
  }
}
```
- `auto` is valid only after its blueprint has been built (`state/built.json` lists it). Otherwise `outbound_guard` treats it as `approve`.

### `config/mcp.selected.json`
```json
{ "schema": 1, "enabled": ["mcpvault", "playwright", "context7"] }
```
These three start with `npx` (Node only), so they work on a fresh machine. `markitdown` and `fetch` are core-tier but start with `uvx`, so they are switched on only after `uv` is installed (`winget install --id astral-sh.uv -e`, or `brew install uv`). `doctor.mjs` warns when a configured connection needs `uv` and it is missing.

## State files (`state/`)

Written only through their scripts, never by hand. Timestamps come from the system clock.

### `state/built.json` (`system/scripts/built.mjs list|has|add|remove`)
The single record of everything self-build added. `/build` writes it, `/remove-skill` removes entries, `/menu` reads it, and `outbound_guard` reads it to decide whether a channel may really use `auto`.
```json
{
  "schema": 1,
  "items": [
    {
      "name": "my-case-summary",
      "kind": "skill",
      "blueprint": null,
      "paths": [".claude/skills/my-case-summary/"],
      "mcp": [],
      "channels": [],
      "proposal": "vault/00_inbox/proposals/2026-10-07 Case summary.md",
      "model": "sonnet",
      "effort": "medium",
      "built": "2026-10-07T10:00:00.000Z",
      "note": ""
    }
  ]
}
```
- `name`: `my-<slug>` for skills, agents and automations the user designed; the **blueprint slug** when building a blueprint; the catalogue `id` when the build is only an MCP install.
- `kind`: `skill`, `agent`, `mcp`, `blueprint` or `automation` (as on the proposal card).
- `paths`: every file or folder the build created (project-relative, forward slashes). `/remove-skill` deletes exactly these.
- `mcp`: catalogue ids the build added to `config/mcp.selected.json`.
- `channels`: autonomy channels this build makes real. `auto` on a channel counts only when an entry lists the channel **and** comes from a blueprint.
- The same `name` again replaces the old entry (a rebuild). "Is blueprint X built?" means an entry whose `name` or `blueprint` equals X.

### `state/proposals.json` (`system/scripts/proposals.mjs status|signal|signals|mark`)
Evidence for proactive suggestions. One signal per key per day.
```json
{
  "schema": 1,
  "signals": {
    "<key>": {
      "count": 3, "days": ["2026-10-05", "2026-10-06", "2026-10-07"],
      "first": "<ISO>", "last": "<ISO>",
      "examples": ["<plain description, up to 5>"],
      "outcome": null, "outcome_at": null, "card": null
    }
  }
}
```
- `outcome` is `null` or one of `suggested`, `rejected`, `built` (set by `mark`). `card` is the vault path of the proposal card.
- A key with `count >= 3` and no outcome is ready to suggest, but only when `self_build.proactive` is true and open cards are fewer than `max_open_proposals`.

### `state/onboarding.json` (`system/scripts/onboard-progress.mjs show|next|start|done|later|skip|reset`)
```json
{
  "schema": 1,
  "status": "in_progress",
  "started": "<ISO>", "updated": "<ISO>",
  "minimum": ["M0", "M1", "M2", "M3", "M4"],
  "modules": {
    "M0": { "title": "Setup", "status": "done", "started": "<ISO>", "finished": "<ISO>", "note": "" }
  }
}
```
- Overall `status`: `not_started`, `in_progress`, `minimum_done` (M0 to M4 done) or `complete` (every module `done` or `skipped`).
- Module `status`: `todo`, `in_progress`, `done`, `later` (still open), `skipped`.
- `note` is one short line to resume from. Read by `session_start`, `/menu`, `/reconfigure` and `doctor.mjs`.

### `state/release-origin.json`
Written by `setup-github.mjs` (section 15): `{ "schema": 1, "repo": "<owner/name>", "url": "<old origin>", "recorded": "YYYY-MM-DD" }`.

---

## 11. Self-build

**Proposal card:** `vault/00_inbox/proposals/<YYYY-MM-DD> <Title>.md`.

```yaml
---
type: "proposal"
created: "2026-10-07"
status: "open"          # open | approved | built | rejected | removed
kind: "skill"           # skill | agent | mcp | blueprint | automation
name: "my-<slug>"
model: "sonnet"
effort: "medium"
risk: "low"             # low | medium | high
---
```

Body sections:
- **What it does** (one line, with an example).
- **Why I'm suggesting it**: the evidence, e.g. "you asked for X three times".
- **What it will touch**: files and tools.
- **Cost and risk**, in plain words.
- **How to undo.**

**Flow:**
1. `/propose` (or proactive detection, only if `self_build.proactive`) writes the card and a `#ab/propose` task. Repeated manual requests are counted in `state/proposals.json` (section 10).
2. The user approves in chat.
3. `/build` runs `/clarify` with the matching checklist (`skill`, `agent`, `mcp`, `automation` or `blueprint`).
4. It scaffolds into `.claude/skills/my-<slug>/` or `.claude/agents/my-<slug>.md`. For an MCP it adds the id to `config/mcp.selected.json` and runs `mcp-gen`.
5. Quick check: describe 3 prompts that should trigger the skill and 3 that should not, and confirm the description discriminates.
6. Run `validate.mjs`, then commit.
7. Record in `state/built.json` (section 10) with `node system/scripts/built.mjs add`.

`/remove-skill` reverses all of this.

**Self-build may never edit** `code`-class files, `.claude/settings.json`, `system/core.md` or the catalogue.

---

## 12. Study cards (`50_learning/cards/<topic>/<Card title>.md`)

```yaml
---
type: "card"
created: "2026-10-07"
topic: "[[Porter Five Forces]]"
source: "[[source note]]"
box: 1                  # Leitner box 1-5
due: "2026-10-08"       # next review date
status: "active"
---
Q: …
A: …
```

- **Schedule:** box 1 → +1 day, 2 → +3, 3 → +7, 4 → +16, 5 → +35. Right answer: box +1. Wrong answer: box 1.
- **`/study`** creates cards. Due cards produce one `#ab/study` task per day ("Review 6 cards"). **`/study quiz`** runs them.

---

## 13. Assignment studio (`/assignment`)

**Folder:** `vault/10_projects/<YYYY> <course> <assignment slug>/`.
```
assignment.md      (type: assignment; frontmatter = the spec below)
brief.md  report.qmd  critique-<round>.md  decisions.md  reviews/<round>/<lens>.md  rubric.md  releases/
```

**`assignment.md` frontmatter:**
```yaml
type: "assignment"
course: "[[course]]"
title: ""
deadline: "YYYY-MM-DD"
deadline_confirmed: false
questions: []          # verbatim
limits: { pages: 6, font_pt: 11, line_spacing: 1.15, words: null }
deliverables: ["pdf"]  # pdf, xlsx, docx, pptx
rubric: "[[rubric]]"
team: []               # names only if the user provides them
lenses: ["devils-advocate", "premortem", "board", "specialists", "grader"]
stop_rule: { target_grade: 9, plateau_rounds: 2 }
status: "setup"        # setup, brief, draft, critique, final, shipped
```

**Subcommands:** `new`, `brief`, `draft`, `critique`, `ship`. Extensions are in `system/blueprints/assignment-extras.md`.

**Coursework notice.** If the course `ai_policy` is `restricted`, `banned` or `unknown`:
- warn once per assignment in plain words;
- ask whether to continue;
- proceed if yes.

**Never** write the consent anywhere tracked by git. If needed, use `state/local/` only. If the policy is `allowed-with-disclosure`, draft a disclosure paragraph for the user.

**Case date and the hindsight rule.**
- A case note carries `case_date` (the date the case is set). `/assignment critique` copies it into the round card (`review-round`, `case_date`, or "none" when the work is not a case).
- **Hindsight rule:** every lens and the consolidation use only facts that were knowable on that date. Later facts go under "Outside the case" (or "for class only" in the consolidation) and never drive an attack, a grade or a decision.

**Review notes block.** `/assignment draft` puts the page plan at the very top of the body of `report.qmd` in a block that starts with `::: {.content-hidden` and ends with `:::`. Quarto does not print it, and the lenses ignore it (with the YAML front matter) because it is review notes, not graded text. The consolidation reads it.

**Lens prompts** live in `system/packs/mba/lenses/*.md`.
- Each lens runs as the `lens` agent with paths only, blind to the other lenses, read-only.
- Consolidation is done by `opus/high`.

---

## 14. Hooks (`system/hooks/*.mjs`, registered in `.claude/settings.json`)

**General:**
- Node, zero dependencies, read JSON from stdin.
- **Fail open on malformed input** (exit 0, no output), **except** `outbound_guard`, which fails closed, and `rate_guard`, which fails closed for a server that has limits when its limits, ledger or state cannot be read (a payload it cannot read at all is still ignored: it cannot tell which server it is about).
- Resolve the project root from `process.env.CLAUDE_PROJECT_DIR`, then fall back to walking up from `import.meta.url`. Never rely on cwd.
- Every hook has tests in `tests/hooks/`.

| hook | event / matcher | behaviour |
|---|---|---|
| `session_start.mjs` | SessionStart | Runs `git-auto pull` (5 s budget). Emits a compact digest as additional context: date/time; onboarding status (incomplete → suggest `/onboard` after handling the user's request); counts of overdue/today tasks, outbox drafts and open proposals; warnings (model not sonnet, Claude Code version below minimum, git problems). |
| `protect_paths.mjs` | PreToolUse Write\|Edit\|MultiEdit\|NotebookEdit | Denies edits to `code`-class paths (from `system/manifest.json`, plus always `.claude/settings.json`, `system/core.md`, `system/hooks/**`, `system/scripts/**`, `system/lib/**`, `system/catalogue/*.json`) unless dev mode. Denies writes into `vault/40_sources/raw/**` (raw is immutable; only `ingest.mjs` writes there) and into `state/local/rate-guard/**` (the rate guard's ledger and state; an agent must not be able to clear a safety stop). |
| `block_secrets.mjs` | PreToolUse Write\|Edit\|MultiEdit, and Bash\|PowerShell for `git commit` | Denies content matching secret patterns (private keys, `sk-…`, `ghp_…`, `gho_…`, `xox…`, AWS keys, generic `api_key=…` with high entropy) anywhere except `.env.local`. |
| `block_dangerous_git.mjs` | PreToolUse Bash\|PowerShell | Denies `push --force` / `-f`, `reset --hard`, `clean -f`, deleting `.git`, `filter-branch`, `worktree add`, creating or switching to new branches (`checkout -b`, `switch -c`, `branch <name>`), `rebase -i`. |
| `outbound_guard.mjs` | PreToolUse `mcp__.*` (Gmail connector tools are `mcp__claude_ai_Gmail__*`) | Classifies outbound tools by name (`send`, `reply`, `forward`, `post`, `publish`, `submit`, `apply`, `connect`, `invite`, `message`, `comment`, `share`, `create_event`, `delete`) and maps them to a channel by server (gmail/mail → email, calendar → calendar, linkedin → linkedin, instagram/facebook/x → social, telegram/whatsapp/slack → messaging, playwright click on submit-like elements → web-forms). Reads `config/autonomy.json`: `draft` → deny with a plain explanation and the tip "the draft is in your outbox"; `approve` → ask; `auto` → allow only if the blueprint is built, else ask. Creating drafts is never blocked. Unreadable config → deny. |
| `rate_guard.mjs` | PreToolUse, PostToolUse and PostToolUseFailure, all `mcp__.*` | Generic rate guard for MCP servers that have limits in `system/catalogue/limits.json` (LinkedIn today); a server with no limits gets no output. Core logic in `system/lib/rateguard.mjs`. **Pre:** maps the tool to a category (a tool not listed on a limited server is `other`, which has its own cap), then denies with a plain reason (which limit, used of cap, when it resets, that it protects the account) when: all calls are paused after a warning; the server is draft-only and the category writes; the identical call (same tool and target) had an unknown outcome in the last 24 h; the day is not in `weekday_cap`; the daily or weekly cap is reached (local midnight and Monday 00:00 reset); or `min_gap_seconds` has not passed. It never answers `allow` (that would skip the permission prompt). **Post and PostToolUseFailure:** count the call after it ran (a call refused at the permission prompt never reaches Post), append `{ts, server, tool, category, outcome, target?, warning?}` to `state/local/rate-guard/ledger.jsonl` (pruned to 35 days) and read the result: platform warnings (specific phrases anywhere; common words such as captcha, restricted or 429 only in an error or a result under `weak_max_chars`) set `paused_until` (pause_hours, default 24, all calls) and `throttled_until` (throttle_days, default 14, daily and weekly caps halved), add a `#ab/rate-guard` task and tell Claude to stop; a second warning (after the pause, within draft_only_window_days) sets `draft_only`, which denies every category that writes until the user runs `rate-guard.mjs clear-draft-only`. An unknown outcome on a write (status in `outcome_unknown.statuses`, `retry_safe:false` without `sent:true`, a matching text, or an error that looks like a timeout) is recorded as `unknown`, adds a task and blocks the identical call for 24 h. User overrides (`config/limits.json`) may lower caps freely; raising a cap, shortening a gap or adding weekdays needs `accept_risk: true` on that server, otherwise the default stays and the deny reason says the setting was ignored. Fail closed for a limited server when the framework limits, the user file, the ledger or the state cannot be read (until the limits file is readable, servers whose name contains `linkedin` count as limited). |
| `session_end.mjs` | SessionEnd, plus Stop throttled to once per 10 min | Runs `git-auto commit` then `git-auto push`. On failure: a plain-language task (`#ab/git`) and a log line in `state/local/git.log`. |

---

## 15. Scripts (`system/scripts/*.mjs`)

All scripts:
- print plain-language output;
- accept `--json` for machine output;
- exit with code 0 on success, 1 on problems found, 2 on usage error.

| script | purpose |
|---|---|
| `doctor.mjs [--json] [--ci]` | Checks Node ≥ 20, git, git-lfs, gh auth, origin remote, Quarto (optional), Obsidian config, Claude Code version (`claude --version` if on PATH; minimum in `system/release.json`), `.claude/settings.json` model, onboarding state, vault skeleton, manifest integrity (sha of code files), `validate.mjs`, `.mcp.json` validity, `uv` when a configured connection needs it, disk space. Each failure prints one-line fix advice. |
| `validate.mjs [--write-manifest]` | Lints skill and agent frontmatter (required keys, allowed values, name = folder), the routing file, the catalogue schema (and that the Risk column of `MCP-CATALOGUE.md` matches `tos_risk`), blueprint sections, and the `Adapted from` line in every file `UPSTREAM-SYNC.md` lists as adapted. `--write-manifest` regenerates `system/manifest.json` (release tooling). |
| `ingest.mjs` | §9 |
| `tasks.mjs add\|list\|done` | §4 |
| `mcp-gen.mjs [--dry-run]` | `config/mcp.selected.json` + `system/catalogue/mcp.json` → `.mcp.json` (wraps `npx` as `cmd /c npx` on Windows; `${VAR}` placeholders only) |
| `git-auto.mjs pull\|commit\|push\|status` | Never forces. `pull` = `git pull --rebase --autostash` when an origin exists. `commit` = `git add -A` + `git commit -m "auto: <date time> · <n> files"`, retried 3× on `index.lock`. `push` = `git push`. Skips when dev mode or `git.auto_commit` is false. |
| `setup-github.mjs [--name <repo>] [--dry-run] [--detach-only]` | Checks `gh auth`. If origin points to a repo that is not the user's own (normally the public Alterbrain repo), records the old origin in `state/release-origin.json` and removes it. Runs `gh repo create <name> --private --source . --remote origin --push`; ensures `git lfs install`. `--detach-only` needs no sign-in: it only records and removes the public Alterbrain origin (used in onboarding M0 when the user skips the backup). |
| `obsidian-setup.mjs` | Writes `vault/.obsidian/{app,core-plugins,community-plugins}.json`. Downloads pinned community plugins from `system/catalogue/obsidian-plugins.json` (GitHub release assets, sha256 verified) into `vault/.obsidian/plugins/<id>/`. |
| `update.mjs check\|plan <tag>\|apply-safe <tag>\|finish <tag>` | Reference-based update (plan §Update model). Reads the release via `gh api` or the GitHub HTTPS API. |
| `slop-check.mjs <file> [--lang en]` | Port of COG slop-gate (MIT): hard tells fail on one hit, filler fails at three or more; quotes and code are stripped. Non-English: only language-neutral checks. |
| `voice-stats.mjs <file...> [--lang]` | Port of COG voice-baseline idea: sentence length distribution, openers, punctuation, top phrases, watch-list rates → JSON used by onboarding M5 and `edit-voice`. |
| `qmd-prerender.mjs <note.md> [--out]` | Obsidian note → `.qmd`: resolve wikilinks to text, inline embeds, convert callouts to Quarto callouts, strip Obsidian-only syntax. |
| `jobs/adzuna.mjs` | Adzuna NL search (keys from `.env.local`; rate-limited, with a daily counter) |
| `jobs/ind-sponsors.mjs` | IND recognised-sponsor register download, cache and lookup; `thresholds` prints the salary table from `system/packs/mba/jobs-nl/salary-thresholds.md` |
| `onboard-seed.mjs [--dry-run]` | Onboarding M0: copies the vault skeleton, config defaults, identity templates and framework seeds into place, never overwriting an existing file; fills `{{date}}` and `{{title}}` |
| `onboard-progress.mjs` | Reads and writes `state/onboarding.json` (section 10) |
| `proposals.mjs` | Reads and writes `state/proposals.json` and counts open proposal cards (sections 10 and 11) |
| `built.mjs` | Reads and writes `state/built.json` (section 10). `remove <name> --delete-files` also deletes the entry's `my-*` skill folders and agent files, and nothing else |
| `rate-guard.mjs status [--all] [--json]` / `reset-throttle <server>` / `clear-draft-only <server>` / `repair-ledger` | `status` shows used-of-cap per category for each rate-limited server that is switched on or has been used (exit 1 on a pause, draft-only, an unknown outcome to check, or a damaged file). The other three lift a safety stop or repair a file, so they are not on the allow list: Claude asks first |
| `date.mjs [--plus N] [--from YYYY-MM-DD] [--now] [--weekday] [--iso-week]` | Local date and time from the system clock (the same clock as the session digest). Skills use it instead of `node -e` and never use the UTC date |
| `check-json.mjs <file>...` / `--length <file>` | Checks that edited settings files still parse, or counts the characters of a file (USER.md limit) |
| `ingest-pending.mjs` | Lists files that `ingest.mjs` copied but that have no source note yet |
| `system/quarto/tools/render.mjs` | `render <src> --type cv\|cv-ats\|letter\|report\|deck`, `scaffold <type> <folder>`, `types`; options `--out`, `--name`, `--release`, `--max-pages`, `--pdf`, `--brand`, `--json`. Used by `/render` and `/assignment ship`. Its helpers are `explain.mjs`, `fonts.mjs`, `lib.mjs` and `pagecount.mjs` in the same folder |

---

## 16. Catalogue schemas

### `system/catalogue/mcp.json`
Entry shape:
```json
{ "id": "playwright", "name": "Playwright (Microsoft)", "url": "https://github.com/microsoft/playwright-mcp",
  "licence": "Apache-2.0", "tier": "core|optional|high-risk|avoid", "what": "plain one-liner",
  "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@<pinned>"], "env": {},
  "auth": "none|api-key|oauth|connector", "cost": "free", "tos_risk": "low|medium|high",
  "writes": true, "channel": "web-forms", "notes": "…", "verified": "2026-10-06" }
```
`channel` is information for people and blueprints. `outbound_guard` does not read the catalogue: it works out the channel from the server name (section 14), and a server it cannot place counts as `other`, where the default level (`draft`) applies.

### `system/catalogue/routing.json`
`{ "schema":1, "reviewed":"YYYY-MM-DD", "classes": { "<class>": { "model":"…", "effort":"…", "examples":[…] } }, "caps": { "pro":3, "max":8 } }`

`reviewed` is the date of the last model check (section 6). `validate.mjs` ignores keys it does not know, so the field needs no schema change.

### `system/catalogue/limits.json`
Framework defaults for the rate guard (code class, protected). A server not listed here is never touched; adding a server is data only.
```json
{ "schema": 1, "_note": "…",
  "servers": { "linkedin": {
    "name": "LinkedIn", "_note": "sources, [Claim] / [Unverified] / [Speculation] labels",
    "match": ["linkedin"],                     // words matched inside the server name (normalised, so claude_ai_LinkedIn matches)
    "target_keys": ["linkedin_username", "url"], // tool arguments that identify the target (for the unknown-outcome rule)
    "categories": {
      "invite": { "label": "connection requests", "tools": ["connect_with_person"], "writes": true,
                  "daily_cap": 15, "weekly_cap": 60, "weekday_cap": ["mon","tue","wed","thu"], "min_gap_seconds": 30 },
      "other":  { "label": "other actions", "writes": true, "daily_cap": 20, "min_gap_seconds": 30 }
    },
    "warnings": { "phrases": ["regex, matched anywhere"], "weak": ["regex, only in errors or short results"], "weak_max_chars": 1000 },
    "outcome_unknown": { "statuses": ["outcome_unknown"], "patterns": ["regex"], "error_patterns": ["timed? ?out"] },
    "failed_statuses": ["connect_unavailable"],
    "throttle_days": 14, "pause_hours": 24, "draft_only_window_days": 60 } } }
```
- `daily_cap` / `weekly_cap`: whole numbers (0 blocks the category). `weekday_cap`: the days a category may run (`"mon"`..`"sun"`, or 0-6 with Monday = 0); a category without it runs every day. `min_gap_seconds`: minimum time between two calls of the category. `writes: true` marks categories that send or change things (draft-only blocks them, and an unknown outcome is tracked for them). A category with no caps, no gap and no `writes` (such as `free`) is never checked.
- Day caps reset at local midnight, week caps on Monday 00:00 local time. Halving (after a warning) rounds down and never goes below 1.
- `validate.mjs` checks the file; the hook fails closed on a bad one.
- Default LinkedIn caps (conservative, for student accounts; about half the framework author's campaign limits, which he applies through his own config/limits.json with accept_risk): invite 15/day, 60/week, Monday to Thursday, 30 s apart; message 15/day, 60/week, 60 s; profile 40/day, 20 s; company 20/day, 20 s; search 8/day, 30 s; employees 5/day, 60 s; inbox 30/day, 10 s; other 10/day, 30 s. Tools are those of `mcp-server-linkedin` 4.26.2.

### `config/limits.json` (user-owned, optional; template `system/templates/config/limits.json`)
`{ "schema": 1, "comment": "…", "servers": { "linkedin": { "accept_risk": false, "categories": { "invite": { "daily_cap": 10 } } } } }` — only `daily_cap`, `weekly_cap`, `min_gap_seconds` and `weekday_cap` can be overridden. Lowering is always allowed. Raising a cap above the framework default, shortening a gap or adding a weekday needs `"accept_risk": true` on that server; without it the default stays and `rate_guard` says so when it denies. A file that is not valid JSON blocks the server it belongs to (fail closed).

### `state/local/rate-guard/` (gitignored, never committed: it can hold names and URLs of people)
`ledger.jsonl` (one JSON object per call that ran, pruned to 35 days) and `state.json` (per server: `warnings`, `paused_until`, `throttled_until`, `draft_only`). Protected from agent writes by `protect_paths`; changed only by the hook and by `rate-guard.mjs`.

### `system/catalogue/obsidian-plugins.json`
`{ "<id>": { "repo":"owner/name", "version":"x.y.z", "files": { "main.js":"<sha256>", "manifest.json":"<sha256>", "styles.css":"<sha256>|null" } } }`

### Blueprints (`system/blueprints/<slug>.md`)
Frontmatter: `type: "blueprint"`, `title`, `kind`, `status: "available"`, `risk`, `cost`.

Sections:
- **What it does**, with an example.
- **You'll need**, i.e. prerequisites.
- **Cost and risk.**
- **Questions I'll ask you**, the clarify list.
- **Build steps**, written for the agent.
- **How to test.**
- **How to undo.**

---

## 17. Verified Claude Code mechanics (docs, 2026-10-07) and open points

Full notes: `docs/research/claude-code-mechanics.md`.

- **Hook form.** Use **exec form**: `{"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/system/hooks/x.mjs"]}`.
  - Claude Code substitutes `${CLAUDE_PROJECT_DIR}` itself, so this works whether the shell is Git Bash or PowerShell.
  - Hook cwd is NOT reliably the project root.
- **Hook I/O.**
  - SessionStart: plain stdout, or JSON `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`. Only SessionStart receives `model`.
  - PreToolUse decisions: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny|ask|allow","permissionDecisionReason":"…"}}`. A deny holds even in bypass mode.
  - SessionEnd: best effort, 1.5 s budget by default (raise with `timeout`, max 60). Whether it fires on desktop close is undocumented, so we also use a throttled Stop hook.
  - Stop: fires after every response.
- **Frontmatter.** Skills support `effort` (`low|medium|high|xhigh|max`), `model` (incl. `inherit`), `allowed-tools`, `argument-hint`, `disable-model-invocation`, `context: fork`, `paths`. Agents support `tools`, `disallowedTools`, `model`, `effort`, `maxTurns`, `permissionMode`, `color`.
- **Name clashes.** Built-ins and aliases to avoid: help, config, settings, status, memory, init, upgrade, doctor, checkup (alias of `/doctor`), review, code-review. Hence `health-check` (ADR 0017).
- **Gmail connector tools.** Named `mcp__claude_ai_Gmail__<tool>`: `send_message`, `reply`, `forward`, `create_draft`, `update_draft`, … (confirm with `/mcp`).
  - Permission rules evaluate deny → ask → allow, and nothing overrides a deny.
  - So `.claude/settings.json` puts the send tools under **ask** (a safety net), and `outbound_guard` turns them into deny at `draft` level.
- **settings.json keys.**
  - Model and effort: `model`, `effortLevel` (applies to all models in project scope), `maxEffortLevel`.
  - `autoMemoryDirectory`, `disableSkillShellExecution` (bool).
  - `permissions.disableBypassPermissionsMode` takes the string `"disable"`.
- **Where config loads.** Project `.claude/skills|agents|settings.json` hooks load in the Desktop Code tab and cloud sessions. Repo-declared plugins do not load in cloud sessions, which confirms ADR 0006.
- **Scheduled tasks** are user-level (`~/.claude/scheduled-tasks/`). There is no repo file format. They can be created in the Routines page of the Code tab or by asking Claude in a Desktop session. A blueprint uses the scheduled-tasks tools only if the session lists them (a detected capability); otherwise it gives the prompt to paste and the UI steps. A local task needs the app open and the computer awake, and after sleep it gets one catch-up run. Details, background sessions, Remote Control, Channels and the terms: `docs/research/claude-code-mechanics.md`.
- **Statusline** does not render in the Desktop app.

Resolved (verified 2026-10-07):
- [x] Hook command form on Windows (exec form, above).
- [x] Skill and agent frontmatter keys (above).
- [x] Built-in name clashes (above; ADR 0017).
- [x] Gmail connector tool naming and send tools (above). The read tool names are still open (below).
- [x] Repo-declared plugins do not load in cloud sessions (ADR 0006).
- [x] Obsidian Tasks 8.4.0 and Obsidian Git 2.41.1 release asset hashes (pinned in `system/catalogue/obsidian-plugins.json`).
- [x] IND register format (verified with a live run; `system/scripts/jobs/ind-sponsors.mjs`).
- [x] Highly-skilled-migrant thresholds for 2026 (one table, `system/packs/mba/jobs-nl/salary-thresholds.md`, never hard-coded elsewhere; updated each January).

Still open:
- [ ] Whether `SessionEnd` fires when the desktop app closes (the throttled `Stop` hook covers it).
- [ ] Gmail connector read and search tool names (confirm with `/mcp` on a connected account).
- [ ] Adzuna `nl` endpoint confirmed with a real key, and the user's own reading of the terms on storing results.
- [ ] A live check in Obsidian of the Tasks queries on `Home.md` and the `.base` files in `vault/_views/`.

---

## 18. Attribution

- **Every adapted or ported file** (mode `adapted` in `UPSTREAM-SYNC.md`) starts (or ends, for Markdown) with: `Adapted from <project> (<licence>) — <url> @ <sha>`. `validate.mjs` checks this for every file the table lists as adapted.
- **Verbatim files** (mode `verbatim`) are kept byte for byte, so they carry no line of their own. They are covered by the `LICENSE-*` file in the same skill folder (or by `THIRD_PARTY_NOTICES.md`) and by their row in `UPSTREAM-SYNC.md`.
- **`THIRD_PARTY_NOTICES.md`** collects the full licence texts:
  - OpenClaw templates (MIT, OpenClaw Foundation);
  - kepano/obsidian-skills (MIT, Steph Ango);
  - no-ai-slop (MIT, Peter Yang);
  - COG-second-brain (MIT, Huy Tieu);
  - obsidian-to-quarto-exporter (MIT, Andreas Varotsis; ideas only);
  - quarto-awesomecv-typst (MIT, Kazuharu Yanagimoto);
  - apa.csl from citation-style-language/styles (CC BY-SA 3.0);
  - Obsidian Tasks and Obsidian Git (MIT; downloaded at setup, not included).
- **`UPSTREAM-SYNC.md`** maps each ported file to its source repo, path, commit and mode (verbatim, adapted or ideas), and says how to check for upstream changes every quarter.
- **Never vendor** Anthropic's proprietary skills (docx, pdf, pptx, xlsx).
