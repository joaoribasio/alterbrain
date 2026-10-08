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
11. **Store freely, guard what leaves.** The brain is the user's own private brain and may hold sensitive facts about them. Only a short never-store list is kept out of the vault, and only `public` facts may leave the computer without the user's OK (§3, "Privacy"; ADR 0018). The most private notes and documents can also be encrypted in the GitHub copy, as an opt-in (ADR 0019).

---

## 2. Repository layout and ownership

```
alterbrain/
├─ README.md  LICENSE  THIRD_PARTY_NOTICES.md  UPSTREAM-SYNC.md  CHANGELOG.md   [F text]
├─ .gitattributes                     [F text]  line endings, binary types and merge rules for the whole repository; holds no Git LFS rules (§3, "Git storage")
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
│  ├─ scripts/*.mjs, scripts/git-hooks/*.mjs, install.ps1, install.sh   [F code]
│  ├─ lib/*.mjs                       [F code]  shared helpers for hooks and scripts
│  ├─ catalogue/mcp.json, routing.json, obsidian-plugins.json   [F code]
│  ├─ catalogue/MCP-CATALOGUE.md      [F text]  human-readable view of mcp.json
│  ├─ templates/                      [F text]  vault skeleton, identity templates, note templates, config defaults
│  ├─ blueprints/*.md                 [F text]
│  ├─ docs/guides/*.md                [F text]  read by /menu
│  ├─ packs/mba/                      [F text]  pack references: lens prompts, framework seeds, course/case templates, course-setup.md (the course setup procedure), jobs-nl/ reference tables
│  ├─ packs/twin/                     [F text]  drafting rules and voice-import steps (used by `ghostwriter` and `/reply`)
│  └─ quarto/                         [F text]  Quarto templates, _extensions (vendored), brand, fonts; tools/render.mjs (render, scaffold)
├─ config/                            [U]  brain.json, autonomy.json, mcp.selected.json
├─ state/                             [U]  onboarding.json, proposals.json, built.json (section 10), release-origin.json (section 15); local/ is gitignored
├─ .mcp.json                          [U generated]  by system/scripts/mcp-gen.mjs
├─ docs/                              [F text]  SPEC.md (this file), adr/ (decisions), research/
├─ tests/                             [F code]  node --test suites + fixtures (synthetic)
├─ .github/workflows/ci.yml           [F code]
└─ vault/                             [U]  the Obsidian vault (Obsidian opens THIS folder); vault/.gitattributes holds the user's own Git rules (§3)
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
├─ .gitattributes             the user's own Git rules: one Git LFS line per big file, written by the automatic save; never replaced by an update (see "Git storage" below)
├─ 00_inbox/
│  ├─ Tasks.md                THE human to-do list (§4)
│  ├─ outbox/                 drafts awaiting the human (emails, applications, posts)
│  ├─ proposals/              self-build proposal cards
│  └─ captures/               quick notes from /capture
├─ 10_projects/               time-boxed work (assignments, job campaigns, group work)
├─ 20_areas/
│  ├─ courses/<course-slug>/  course.md (syllabus, AI policy, Material list), sessions/, cases/, assignments/
│  └─ career/                 career.md (targets), applications/, cv/
├─ 30_wiki/                   agent-maintained knowledge
│  ├─ index.md  log.md
│  ├─ concepts/  frameworks/  companies/  industries/  topics/   (topics/ = answers filed back by /ask)
├─ 40_sources/
│  ├─ raw/YYYY/               immutable copies (ordinary files; Git LFS only for files of 50 MB or more); raw/_local/ = over 100 MB, kept on this computer only (gitignored)
│  ├─ text/YYYY/              extracted text (markdown)
│  ├─ notes/                  one source note per raw file
│  └─ manifest.jsonl          provenance ledger (§9)
├─ 50_learning/cards/         study cards (§12)
├─ 60_people/                 people notes (business facts by default, source + date per fact)
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
| `course` | 20_areas/courses/x/course.md | `code`, `term`, `school`, `ai_policy` (allowed, allowed-with-disclosure, restricted, banned, unknown), `ai_policy_quote`, and the class dates behind the after-class reminder (all optional, empty by default): `session_dates` (list of `YYYY-MM-DD`, only dates the syllabus states, never invented, class meetings only), `class_days` (list of `mon`..`sun`, used only when `session_dates` is empty, from the syllabus or the user), `term_start` and `term_end` (`YYYY-MM-DD`, the first and last day of the term: generated class days start at `term_start` and end at `term_end`; without `term_end` they end 16 weeks after `term_start`, or after `created` when there is no `term_start`) and `class_days_asked` (`YYYY-MM-DD`, the day Alterbrain asked which days the class meets, set whatever the answer so that it does not ask again unprompted). A class on or before the `created` date is never nudged (for `session_dates` and `class_days` alike), and a `class_days` schedule with no `term_end`, no `term_start` and no valid `created` is not nudged, so the reminder always ends. A note without class dates is never nudged. `status` is `active` or `completed` (set to `completed`, with the user's OK, for a finished course: `/weekly-review` asks only about active courses). Sections: Submission rules and Cases and assignments (read by `/assignment`), and Material, the index of the course's source notes by type and session (written by `system/packs/mba/course-setup.md`). Template: `system/templates/notes/course.md` |
| `case` | courses/x/cases | `course`, `question`, `case_type` (decision, evaluation, diagnosis), `case_date` (YYYY-MM-DD, the date the case is set; see §13 hindsight rule). Template: `system/packs/mba/templates/case.md` |
| `assignment` | 10_projects/<slug>/assignment.md | see §13. `limits` is a small map `{ pages, font_pt, line_spacing, words }` (any may be null). Template: `system/packs/mba/templates/assignment.md` |
| `application` | 20_areas/career/applications | `company`, `role`, `stage` (found, shortlisted, preparing, applied, interview, offer, rejected, withdrawn), `source_url`, `deadline`; plus the extra fields below |
| `draft` | 00_inbox/outbox | `channel`, `to`, `lang`, `status` (draft, approved, sent, killed), `facts_used: []`; plus the extra fields below |
| `proposal` | 00_inbox/proposals | see §11 |
| `person` | 60_people | `org`, `role`, `source`, `dnc` (do not contact, true/false). Business facts by default; see "Privacy" below |
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
| `fact-sheet` | 80_me/fact-sheet.md | `status`. The facts allowlist for drafts. Every row has a visibility, `public` or `private` (see "Privacy" below) |
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
| `facts_flagged: []` | statements that need the user's OK, each as a string `<claim> \| <reason>` (format in `system/packs/twin/drafting.md` §9) with the reason `not in fact sheet`, `private fact` or `guess`. Approval is blocked while this is not empty |
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

### Privacy (exposure-based, ADR 0018)

The vault is the user's own private brain. It is processed by Claude (Anthropic) when used in a session and stored in the user's private GitHub repository; the user controls both. The model has four parts.

1. **Store freely.** Any fact about the user, including special-category data (nationality, ethnicity, gender, sexuality, health and diseases, religion, politics, family, general finances), when the user gives it or it appears in their own material. It is not stripped from the voice corpus, exemplars, fact sheet, `USER.md`, notes, journal or ingested sources. Every fact-sheet row has a `visibility` of `public` or `private`. Special-category facts default to `private`, and so do visa status, birth date, home address and salary expectations. A row with no visibility counts as `private`.
2. **Never store anywhere git tracks** (the *never-store list*), because leaked copies enable fraud: credentials and secrets (passwords, API keys, tokens, recovery codes, 2FA seeds), payment card numbers, bank account numbers and IBANs, government ID numbers (passport, BSN, SSN, national ID, driving licence number), and answers to security questions (such as a mother's maiden name). If the user shares one, Claude does not repeat or save it, points to a password manager and, for a token, suggests replacing it. `.env.local` stays the place for API keys that tools need. Enforcement: `block_secrets` and the ingest secret scan catch keys, tokens and passwords by pattern; the other items are enforced by the rules in `core.md`, `.claude/rules/vault.md`, the skills and the agents, not by code.
3. **Outbound gate.** Anything that leaves the computer or is shared (email, post, message, application, form, CV, shared export, presentation, the public framework repo) may use only facts marked `public`. A `private` fact in an outbound draft is flagged (`facts_flagged`, reason `private fact`) and needs the user's explicit OK for that draft; the OK covers that draft only. Special categories never go into outbound text without that OK. Nothing leaves in any case unless `config/autonomy.json` allows it (non-negotiable 1).
4. **Other people.** Business facts by default (role, organisation, how you met, source and date). Another person's sensitive details (health, family, beliefs) are stored only if the user explicitly asks, stay private (a `## Private` section) and never go outbound. In the voice corpus other people's words are still removed, for voice quality (the profile must learn only the user's writing), not for privacy.
5. **Optional encryption at rest (ADR 0019).** The user may encrypt the most private notes and documents in the copy that goes to GitHub, with git-crypt in key-file mode. Files stay plain on the user's computer (Claude and Obsidian read them normally); the key lives in `.git/git-crypt/keys/default`. Scope: `vault/80_me/` (`fact-sheet.md`, `USER.md`, `MEMORY.md`, `voice/**`, `private/**`; not `SOUL.md`, `IDENTITY.md` or `brand/**`), `vault/60_people/**` and `vault/70_journal/**`, for two kinds of file. **Notes:** `*.md *.json *.txt *.csv *.yml *.yaml *.base *.canvas` (`NOTE_EXTENSIONS` in `system/lib/vaultkey.mjs`). **Documents and pictures:** `*.pdf *.docx *.doc *.xlsx *.xls *.pptx *.ppt *.png *.jpg *.jpeg *.gif *.webp *.heic *.rtf *.odt` (`DOCUMENT_EXTENSIONS`; together `ENCRYPTED_EXTENSIONS`). Audio, video and zip files are not encrypted. The rules are one `.gitattributes` file in each of those three folders (`filter=git-crypt diff=git-crypt`, plus `-text` for documents and pictures so Git never changes line endings inside them, plus `.gitattributes !filter !diff`), written by `vault-key.mjs setup` and never in the root `.gitattributes`, which `/update-alterbrain` replaces verbatim. A rule in one of these folders is deeper than any rule in the root file or in `vault/.gitattributes`, so it wins. `vault/` is a user folder, so an update never touches them, and `system/manifest.json` does not list them. Documents can be encrypted because ordinary documents are normal Git files (ADR 0020). One file cannot use both Git LFS and git-crypt, so a private file at or above the Git LFS limit (50 MB) is neither encrypted nor uploaded: the automatic save leaves it out and adds one task that names no file (§3, "Git storage"). Encryption is also enforced inside Git, so it covers Obsidian Git and every other Git tool on a computer, by the `pre-push` upload check (§15, `git-hooks/pre-push.mjs`); a phone's Git runs no hooks and is not covered. The setting is `config/brain.json` `privacy.encryption` (§10). git-crypt has no password; the optional password protects the exported backup copy of the key file (§15, `vault-key.mjs`). The key-loss warning (losing the key file and the laptop together makes the notes unrecoverable) is shown before the user agrees and again when the key is exported. A key copy never goes inside the project (`vault-key.mjs` refuses, `block_secrets` denies, `.gitignore` lists `*.abkey` and `vault-key-*.key`). Known limits, stated in `system/docs/guides/encrypting-private-notes.md`: file names, sizes and timing stay visible; notes saved before encryption stay readable in old history (a fresh private repository is the only clean fix, the user's call); files outside the three folders are not covered; a private file of 50 MB or more is kept off the online backup; Obsidian on a phone or tablet is not covered; cloud sessions and always-on servers cannot read the notes without the key; two computers editing one encrypted note give an unmergeable conflict.

Email handling: `mail-reader` summarises sensitive content and flags it (`sensitive`) as information for the user; it never refuses. It never copies a never-store value into a summary.

### Git storage: attributes, big files and Git LFS (ADR 0020)

Ordinary documents are ordinary Git files. Git LFS stores only a file at or above a size limit (50 MB by default). Git attributes match names, never sizes, so the automatic save measures each file and writes the rule itself. Code: `system/lib/git.mjs`.

- **Root `.gitattributes`** (`F text`, replaced verbatim by an update): `* text=auto eol=lf`; `binary` for common document, picture, audio, video and archive types (so Git never changes their bytes); `vault/.obsidian/plugins/** -text`; `merge=union` for `vault/40_sources/manifest.jsonl`, `vault/30_wiki/log.md` and `vault/.gitattributes`. It holds **no** `filter=lfs` line. `*.key` is deliberately not marked `binary`, so a PEM private key stays visible to the secret scan.
- **`vault/.gitattributes`** (`U`; created by the first save that needs it; never replaced by an update; Alterbrain never removes a line). Two comment lines, then one line per big file: `"/<path inside vault/>" filter=lfs diff=lfs merge=lfs -text`. The pattern is anchored with a leading slash, so a file directly in `vault/` does not also match the same name deeper down; wildcard characters are escaped; a name with a space or quote is put in double quotes. The three encryption attribute files (§3, "Privacy", point 5) are deeper and win.
- **The limit** is `git.lfs_min_mb` in `config/brain.json` (§10). The code default is 50 when the key is absent, so existing installs need no migration.
- **Routing, before staging.** `commitAll` runs `prepareBigFiles`, so `git-auto commit`, the save before a join (`pull`), the first commit of `setup-github.mjs` and the save before `vault-key.mjs unlock` all get it. For each new or changed file inside `vault/` at or above the limit it writes the rule, unstages a copy that was staged by hand as an ordinary file, and lets `git add` store the pointer. Paths that are left out reach `git add` as exclude pathspecs on standard input, so a long list cannot overflow the Windows command line. If the check itself fails, the save is aborted and reported as a failed save: one ordinary file of 100 MB would block every later upload.
- **Self-healing.** A file that is stored as a Git LFS pointer in the current version but has lost its rule (the old root rules are gone) gets an exact-path rule on the next save that has changes, so a changed PDF is stored as a pointer again, not as a full copy. Existing LFS files stay in LFS. Nothing is migrated and no history is rewritten.
- **Left out of the save**, each with a `#ab/git` task (one per kind; only the `private` task omits the file name, because file names are not encrypted and `Tasks.md` is backed up in clear): `no-lfs` (Git LFS is not installed; the task has the install command), `private` (the file is in an encrypted folder), `too-big` (2,000,000,000 bytes or more; the smaller reading of what is [Unverified] as GitHub's per-file maximum for Git LFS on free plans), `outside-vault` (big, but not inside `vault/`, so no user-owned place for its rule; the task asks the user to move it in), `rule-failed` (the rule was written but Git does not apply it, for example because a deeper `.gitattributes` wins).
- **Every Git tool on a computer.** Obsidian Git saves and uploads every 10 minutes without going through `commitAll`. `git-auto.mjs` therefore installs a `pre-commit` hook (`.git/hooks/pre-commit`, marker `# alterbrain-pre-commit v1`, text in `git.mjs`) on every run outside developer mode; `git-auto.mjs hook`, `setup-github.mjs` and both installers install it too. The hook runs `git-auto pre-commit`, which applies the same routing to the files staged right now: a big file gets its rule and is staged again through Git LFS, and a file that cannot be stored is taken out of that save only. The hook never stops a save, except when the big file was the only thing in it (the command exits 3 and the hook turns that into git's own "nothing to save"). It fails open if node or the script is missing, and it remembers the absolute path of the node that wrote it for when `node` is not on the hook's PATH. A `pre-commit` hook that belongs to another tool, and a `core.hooksPath` setting, are never touched; `doctor.mjs` and `git-auto.mjs status` report them.
- **Phones.** A phone's Git runs no hooks. `pushCurrent` therefore refuses an upload (kind `big-blob`) when a commit that is not online yet holds an ordinary file of 95 MiB or more. It gives one `#ab/git` task that names no file and a log line in `state/local/git.log` that does. [Unverified] GitHub refuses ordinary files of about 100 MB. The repair that `/health-check` may offer, with the user's OK, folds only saves that were never uploaded into one new save (`git reset --soft "@{u}"`, then `git-auto commit` and `push`); it is the only change to local history Alterbrain may make, and it is an open point (§17).
- **Upload.** `pushCurrent` runs `git lfs push origin <branch>` before `git push`, so a copy without Git LFS's own `pre-push` step still uploads the files first. With 16 MiB or more of Git LFS data waiting, `git-auto push --background` (or `ALTERBRAIN_PUSH_BACKGROUND=1`) starts the upload as a separate process (`git-auto push --detached`) that carries on after the hook has ended: one at a time, lock `state/local/lfs-upload.lock`, 2 h limit per step, a lock is ignored once its process is gone or after 3 h. Git LFS cannot resume a stopped upload [Unverified].
- **Left on this computer by design.** `vault/40_sources/raw/_local/` holds files over 100 MB at ingest (§9) and is gitignored. The doctor reports the size of the saved history (§15).
- **Environment variables (tests only):** `ALTERBRAIN_LFS_MIN_BYTES`, `ALTERBRAIN_LFS_MAX_BYTES`, `ALTERBRAIN_BLOB_LIMIT_BYTES`, `ALTERBRAIN_BACKGROUND_UPLOAD_BYTES`, `ALTERBRAIN_GIT_LFS=none` (pretend Git LFS is not installed).

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
  - the non-negotiables (draft-only, content trust, clarify gate, no secrets in chat or the vault, no fabricated facts about the user and the private-fact gate, coursework notice);
  - the folder map;
  - how to add tasks;
  - the standing course-material rule (one line: if something new for a course comes up and its Material list lacks it, ask once per course per session, after the user's request and never mid-draft, whether they have it, then add it via `/ingest`; the detail is `system/packs/mba/course-setup.md` section 7);
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
| MBA pack | `assignment` · `reply` · `jobs` · `study` · `course` |
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
node system/scripts/ingest.mjs <file-folder-or-zip>... [--latest-only] [--kind <kind>] [--origin "<text>"] [--course "<Course name>"] [--json]
```

**Behaviour:**
- **Recursive** over folders.
- **Skips** OS junk, `~$*`, `.git`, `node_modules`, `.obsidian`.
- **`--latest-only`:** for a series like `Name_v0.1.md`, `Name_v1.0.md`, keeps only the highest version.
- **`--course "<Course name>"`:** written as `course` on every new manifest entry (see below), so the `ingest` skill can link notes to the course. A file that is already in the vault keeps the course it was first saved with (the manifest is append-only).
- **Zips (ADR 0021).** There is no connection to any school learning platform (some schools do not allow automated access); the user downloads the course files, usually as one zip ("download all files"), and gives the folder or zip to `/ingest`. A `.zip` named on the command line, or found inside a folder that is, is opened with the computer's own `tar` that reads zips (bsdtar: `System32\tar.exe` by full path on Windows, because a `tar` on the search path can be Git's GNU tar, which cannot; the system `tar` on macOS), or `unzip` if there is no bsdtar. If neither exists, it says plainly to unzip the file first. The zip itself is **not** stored. The files go through the per-file steps below with the origin `<zip name>/<inner path>`; an explicit `--origin` wins. The script reads the zip's index itself before anything is unpacked and refuses the **whole zip** (nothing from it is used, and nothing partial reaches the immutable raw store) when it: holds a name that leads outside its folder (`../x`, `/x`, `C:/x`, `\\server\x`, zip-slip) or a link entry; is password protected, damaged or truncated; holds more than 5000 files or 2 GB unpacked (each zip counted on its own; `ALTERBRAIN_MAX_ZIP_FILES`, `ALTERBRAIN_MAX_ZIP_BYTES`); holds two names that Windows and macOS treat as one file (compared after case-folding and Unicode normalisation: `Notes.md` and `notes.md`); gives a different number of files than it lists when unpacked; or the tool exits with an error. It unpacks into a fresh `state/local/tmp/ingest-zip-*` folder while a watcher stops it if the unpacked size passes the limit, then checks that nothing landed outside that folder, that nothing is a link and that every file resolves inside it. The folder is always deleted again (after an error, at exit and on Ctrl+C; leftovers older than 24 h are swept). A zip **inside** a zip is stored as an ordinary file with a note ("zip inside a zip") and not opened: opening nested zips is how zip bombs multiply and the origin trail would blur. `ALTERBRAIN_NO_ZIP_TOOL=1` pretends there is no tool (tests only).

**Per file:**
1. Compute sha256. If already in the manifest, skip as `duplicate`.
2. Copy to `vault/40_sources/raw/<YYYY>/<YYYY-MM-DD> <sanitised original name>`. Files over 100 MB go to `raw/_local/` (gitignored, this computer only), flagged `local_only: true` (`ALTERBRAIN_MAX_RAW_BYTES` changes the limit; tests). The Git LFS limit (50 MB, §3 "Git storage") is separate: a file from 50 MB to 100 MB is copied into `raw/<YYYY>/` and the next automatic save stores it through Git LFS.
3. Extract text to `vault/40_sources/text/<YYYY>/<same name>.md`:
   - `.md` and `.txt`: copied;
   - `.html`: tags stripped;
   - `.csv`: kept as a fenced table;
   - other types: use `uvx markitdown` if available, otherwise mark `text: pending`. Claude can read a pending PDF later with the Read tool; the Read tool does not open Word, PowerPoint or Excel files, so those stay unread until the reader is installed (and a file already in the manifest is never extracted again).
4. Append one JSON line to `vault/40_sources/manifest.jsonl`:
   ```json
   {"id":"<sha8>","sha256":"…","origin":"<file name only | <zip name>/<inner path> | the --origin text>","stored":"vault/40_sources/raw/…","text":"vault/40_sources/text/…|null","text_status":"done|pending|none","size":123,"ext":".pdf","kind":"pdf","ingested":"<ISO>","local_only":false,"note":null,"course":"<Course name>"}
   ```
   The origin is the file name only unless `--origin` says otherwise, so folder and user names stay out of the manifest. `course` is the last key and is present only when `--course` was given.

**Output:** a summary (and `--json`: `{ ok, counts: { found, new, duplicate, skipped, error, text_pending, local_only, zips }, manifest, manifest_bad_lines, zips: [{ zip, status: "opened" or "refused", files, bytes, reason? }], files: [...] }`). The `ingest` skill then writes one source note per new file and updates the wiki (`index.md`, `log.md`, concepts). For a folder or zip of course material it follows `.claude/skills/ingest/references/course-material.md`: it infers the course from the folder or zip name and the course notes and confirms with one question, passes `--course`, links each source note to the course note, offers to put deadlines found in a syllabus or assignment page into the course note and the task list, and works in batches (about 50 notes per run, with a task for the rest). Setting up a whole course is one procedure, `system/packs/mba/course-setup.md`, followed by `/course` (a new course, block or term), onboarding M3, `/ingest` and, through an offer, `/assignment new`: it asks for everything the student has (syllabus, slides, readings, cases, Excel models and data files, briefs and rubrics, past exams), imports it with `--course`, writes the course note from the syllabus, keeps the `## Material` index in the course note (including links to the user's own notes already in the vault, under "Your notes", never imported twice), records the class dates the syllabus states (`session_dates`) or, when it states none, asks once for the weekdays (`class_days`, `term_start`, `term_end`; "The schedule question" in section 3, also asked by `/course <name>` for a course whose note has no class dates, and remembered in `class_days_asked` so that a "don't know" is not asked again) so that the session digest can ask for new material after each class, and reports what is missing. Bringing material in is an ongoing habit, not a one-off (section 7 of the procedure): whenever the user mentions or hands over something new for a course, or the digest says "New material?", Alterbrain checks the course's Material list first and then asks once per course per session, after the user's own request and never mid-draft. Word, PowerPoint and spreadsheets: `.csv` and `.tsv` are kept as text; `.docx`, `.pptx`, `.xlsx`, `.xls`, `.xlsm`, `.ods` and the like become text only when `markitdown` is available, otherwise `text_status` is `pending` and the source note says so. The procedure checks `uvx --version` before the copy and offers (PDF first, install the reader first, copy as they are), because installing afterwards does not help files already copied. Unreadable files are listed as "not readable yet", counted apart, and never summarised. The AI-policy notice (`core.md` rule 6) does not run at import, because importing readings is not assignment work; it runs when the user asks to start or draft an assignment. Raw files are never edited or deleted.

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
  "school": { "name": "", "programme": "" },
  "self_build": { "mode": "propose", "proactive": true, "max_open_proposals": 3 },
  "evidence_mode": "light",
  "git": { "auto_commit": true, "auto_push": true, "lfs_min_mb": 50 },
  "privacy": { "encryption": { "enabled": false, "tool": "git-crypt", "scope": [], "key_backup_checked": null } },
  "jobs": { "country": "NL", "needs_sponsorship": null, "languages": ["en"], "sources": ["adzuna", "career-pages"] }
}
```
- `school.lms` was removed with the Canvas integration. Nothing reads it, and an existing key is ignored. There is no connection to a learning platform: course files arrive by download and `/ingest` (§9).
- `git.lfs_min_mb` (ADR 0020) is the size, in megabytes of 1,048,576 bytes, from which a file is stored with Git LFS (§3, "Git storage"). It is optional: when the key is absent, not a number or not above 0, the default 50 applies, and a value is kept between 1 and 95, because GitHub refuses ordinary files of about 100 MB [Unverified]. Existing installs need no migration.
- `privacy.encryption` (ADR 0019) is written by `vault-key.mjs`, not by hand: `enabled` (true after a successful `setup`), `tool` (always `git-crypt`), `scope` (the encrypted paths, as listed in §3 "Privacy"; paths only, never key material), `key_backup_checked` (`YYYY-MM-DD` of the last successful `vault-key.mjs check`, or `null`). Code treats encryption as on when either `enabled` is true or the `.gitattributes` files carry `filter=git-crypt` (the safer reading when one of the two is missing or unreadable).

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
- **Fail open on malformed input** (exit 0, no output), **except** `outbound_guard`, which fails closed, and `rate_guard`, which fails closed for a server that has limits when its limits, ledger or state cannot be read (a payload it cannot read at all is still ignored: it cannot tell which server it is about). A third exception sits one level down: the push check in `git-auto.mjs` (run by `session_end.mjs`) fails closed when encryption of private notes is on, and the hook itself still exits 0 (see the `session_end.mjs` row). The `pre-push` upload check that Git itself runs fails closed in the same way (§15, `git-hooks/pre-push.mjs`).
- **Git's own hooks are not Claude Code hooks.** `.git/hooks/pre-commit` (the big-file check, §3 "Git storage") and `.git/hooks/pre-push` (the upload check for private notes and Git LFS) are small shell files that Alterbrain writes. Git runs them for every tool on a computer, Obsidian Git included. They are not registered in `.claude/settings.json`. They are never written over a hook that belongs to someone else, and never written when `core.hooksPath` is set.
- Resolve the project root from `process.env.CLAUDE_PROJECT_DIR`, then fall back to walking up from `import.meta.url`. Never rely on cwd.
- Every hook has tests in `tests/hooks/`.

| hook | event / matcher | behaviour |
|---|---|---|
| `session_start.mjs` | SessionStart | Runs `git-auto pull` (5 s budget). Emits a compact digest as additional context: date/time; onboarding status (incomplete → suggest `/onboard` after handling the user's request); counts of overdue/today tasks, outbox drafts and open proposals; warnings (model not sonnet, Claude Code version below minimum, git problems). **After-class nudge:** between those lines and the warnings it adds up to 3 lines "New material? <course> had class on Tue 13 Oct. Say 'add to <course>' and give me the slides or your notes." (one per active course whose class has ended since the user was last told; more than 3 courses give one summary line; most recent class first; skipped on `compact`). `system/lib/courses.mjs` (`planNudges`) reads `vault/20_areas/courses/*/course.md` with `status: "active"` and counts a class date when it lies in the last 14 days and is strictly before today, or is today and the local time is 18:00 or later, and it is later than the note's `created` date. Dates come from `session_dates`, or, when that is empty, are generated from `class_days` between `term_start` (if given) and `term_end`; without `term_end` generation stops 16 weeks after `term_start`, or after `created` when there is no `term_start`, and a schedule with none of the three is not generated. It reads at most 60 notes, 8 KiB each, starts no process, and takes only the room left of the 25 lines after the other lines and the warnings, so it never pushes a warning out; any failure gives no lines. What was said is kept in `state/local/course-nudges.json` (below), written by `commit()` only after the digest has been delivered, so a digest that fails to build writes nothing. When encryption of private notes is on (ADR 0019) it adds one warning line if this copy is locked or git-crypt is missing (with the unlock or install command), and, while the copy works, one reminder line if `privacy.encryption.key_backup_checked` is `null` ("Your vault key backup has not been tested. Run the key check"). With encryption on it also keeps git's upload check in place (`ensurePrePushHook`: one small file is read when the hook is already right, and it is written or refreshed otherwise) and adds a warning line only when the hook file belongs to another tool or Git uses a shared hooks folder. |
| `protect_paths.mjs` | PreToolUse Write\|Edit\|MultiEdit\|NotebookEdit | Denies edits to `code`-class paths (from `system/manifest.json`, plus always `.claude/settings.json`, `system/core.md`, `system/hooks/**`, `system/scripts/**`, `system/lib/**`, `system/catalogue/*.json`) unless dev mode. Denies writes into `vault/40_sources/raw/**` (raw is immutable; only `ingest.mjs` writes there) and into `state/local/rate-guard/**` (the rate guard's ledger and state; an agent must not be able to clear a safety stop). |
| `block_secrets.mjs` | PreToolUse Write\|Edit\|MultiEdit, and Bash\|PowerShell for `git commit` | Denies content matching secret patterns (private keys, `sk-…`, `ghp_…`, `gho_…`, `xox…`, AWS keys, generic `api_key=…` with high entropy) anywhere except `.env.local`. Also denies vault key files (ADR 0019): writing `*.abkey` or `vault-key-*.key`, or anything in `.git/git-crypt/`, inside the project (file tools and shell writes); reading, copying or `git add`-ing such a file; and `git-crypt export-key` to a place inside the project or to the screen (`-` or no file). |
| `block_dangerous_git.mjs` | PreToolUse Bash\|PowerShell | Denies `push --force` / `-f`, `reset --hard`, `clean -f`, deleting `.git`, `filter-branch`, `worktree add`, creating or switching to new branches (`checkout -b`, `switch -c`, `branch <name>`), `rebase -i`. |
| `outbound_guard.mjs` | PreToolUse `mcp__.*` (Gmail connector tools are `mcp__claude_ai_Gmail__*`) | Classifies outbound tools by name (`send`, `reply`, `forward`, `post`, `publish`, `submit`, `apply`, `connect`, `invite`, `message`, `comment`, `share`, `create_event`, `delete`) and maps them to a channel by server (gmail/mail → email, calendar → calendar, linkedin → linkedin, instagram/facebook/x → social, telegram/whatsapp/slack → messaging, playwright click on submit-like elements → web-forms). Reads `config/autonomy.json`: `draft` → deny with a plain explanation and the tip "the draft is in your outbox"; `approve` → ask; `auto` → allow only if the blueprint is built, else ask. Creating drafts is never blocked. Unreadable config → deny. |
| `rate_guard.mjs` | PreToolUse, PostToolUse and PostToolUseFailure, all `mcp__.*` | Generic rate guard for MCP servers that have limits in `system/catalogue/limits.json` (LinkedIn today); a server with no limits gets no output. Core logic in `system/lib/rateguard.mjs`. **Pre:** maps the tool to a category (a tool not listed on a limited server is `other`, which has its own cap), then denies with a plain reason (which limit, used of cap, when it resets, that it protects the account) when: all calls are paused after a warning; the server is draft-only and the category writes; the identical call (same tool and target) had an unknown outcome in the last 24 h; the day is not in `weekday_cap`; the daily or weekly cap is reached (local midnight and Monday 00:00 reset); or `min_gap_seconds` has not passed. It never answers `allow` (that would skip the permission prompt). **Post and PostToolUseFailure:** count the call after it ran (a call refused at the permission prompt never reaches Post), append `{ts, server, tool, category, outcome, target?, warning?}` to `state/local/rate-guard/ledger.jsonl` (pruned to 35 days) and read the result: platform warnings (specific phrases anywhere; common words such as captcha, restricted or 429 only in an error or a result under `weak_max_chars`) set `paused_until` (pause_hours, default 24, all calls) and `throttled_until` (throttle_days, default 14, daily and weekly caps halved), add a `#ab/rate-guard` task and tell Claude to stop; a second warning (after the pause, within draft_only_window_days) sets `draft_only`, which denies every category that writes until the user runs `rate-guard.mjs clear-draft-only`. An unknown outcome on a write (status in `outcome_unknown.statuses`, `retry_safe:false` without `sent:true`, a matching text, or an error that looks like a timeout) is recorded as `unknown`, adds a task and blocks the identical call for 24 h. User overrides (`config/limits.json`) may lower caps freely; raising a cap, shortening a gap or adding weekdays needs `accept_risk: true` on that server, otherwise the default stays and the deny reason says the setting was ignored. Fail closed for a limited server when the framework limits, the user file, the ledger or the state cannot be read (until the limits file is readable, servers whose name contains `linkedin` count as limited). |
| `session_end.mjs` | SessionEnd, plus Stop throttled to once per 10 min | Runs `git-auto commit` (12 s budget) then `git-auto push` (13 s). On failure: a plain-language task (`#ab/git`) and a log line in `state/local/git.log`. **Big files (ADR 0020):** the push step sets `ALTERBRAIN_PUSH_BACKGROUND=1`, so an upload with 16 MiB or more of Git LFS data waiting starts as a separate process that carries on after the hook ends (§3, "Git storage"). A push that still runs out of time is not a crash: it is logged as `hook-timeout` (no task) and handed over once more (4 s budget, `ALTERBRAIN_PUSH_BACKGROUND=now`) to the same kind of background process, so it can finish instead of being stopped half way every time. A commit that runs out of time is still reported, because nothing was saved. The three budgets (12 + 13 + 4 s) stay inside SessionEnd's 30 s timeout; `ALTERBRAIN_HOOK_COMMIT_TIMEOUT_MS` and `ALTERBRAIN_HOOK_PUSH_TIMEOUT_MS` change the first two (tests only). **When encryption of private notes is on (ADR 0019)**, `git-auto` adds three safeguards: (1) a copy that cannot encrypt (no key, or git-crypt missing) stages nothing in the encrypted paths (git would store plain text silently when its filter is not set up), commits the rest, and (when private changes had to be left out) adds one deduplicated high-priority `#ab/git` task with the unlock command; (2) after staging, any private note whose stored bytes lack the git-crypt header (`\0GITCRYPT\0`) is taken out of the commit and a task says so; (3) before a push, every file in the encrypted paths in every commit about to be uploaded (`HEAD --not --remotes=origin`) is checked by reading the stored bytes (not git-crypt's output), and a plain one refuses the push with a high-priority task. Tasks never name a note. **The push check fails closed**: if it cannot run (git error, unreadable object), nothing is pushed and a task says so. This is the one place the automatic save does not fail open, because an upload cannot be taken back. The same check also runs inside Git as the `pre-push` hook, which covers Obsidian Git (§15, `git-hooks/pre-push.mjs`). It never forces and never rewrites history. |

---

## 15. Scripts (`system/scripts/*.mjs`)

All scripts:
- print plain-language output;
- accept `--json` for machine output;
- exit with code 0 on success, 1 on problems found, 2 on usage error.

| script | purpose |
|---|---|
| `doctor.mjs [--json] [--ci]` | Checks Node ≥ 20, git, git-lfs (`git-lfs`; needed only for files of `git.lfs_min_mb` or more, and the message names the limit), the size of the saved history (`repo-size`, from `git count-objects -v`; Git LFS files are not counted; an `ok` with a `tip` from 1 GB, `warn` from 4 GB, both Alterbrain's own levels), the big-file check for Obsidian Git (`big-file-hook`: `warn` when the `pre-commit` hook is missing, out of date, another tool's, or shadowed by `core.hooksPath`), saved ordinary files that GitHub would refuse (`big-blobs`: `fail` when a commit not yet online holds one of 95 MiB or more), gh auth, origin remote, Quarto (optional), Obsidian config, Claude Code version (`claude --version` if on PATH; minimum in `system/release.json`), `.claude/settings.json` model, onboarding state, vault skeleton, manifest integrity (sha of code files), `validate.mjs`, `.mcp.json` validity, `uv` when a configured connection needs it, disk space. When encryption of private notes is on (not in `--ci`): git-crypt installed (`encryption-tool`), this copy unlocked (`encryption-unlocked`), nothing in the encrypted paths stored as plain text (`encryption-files`), the upload check installed (`encryption-push-hook`: `warn` unless the `pre-push` hook is active), key backup tested (`encryption-backup`). The `git-lfs`, `repo-size`, `big-file-hook`, `big-blobs` and encryption checks look at one computer, so `--ci` skips them. Each failure prints one-line fix advice. A check that is fine but comes with advice (`repo-size` from 1 GB) keeps status `ok`, gets an optional `tip` field in `--json` and prints a `Tip:` line; it is not counted as a problem. |
| `validate.mjs [--write-manifest]` | Lints skill and agent frontmatter (required keys, allowed values, name = folder), the routing file, the catalogue schema (and that the Risk column of `MCP-CATALOGUE.md` matches `tos_risk`), blueprint sections, and the `Adapted from` line in every file `UPSTREAM-SYNC.md` lists as adapted. `--write-manifest` regenerates `system/manifest.json` (release tooling). |
| `ingest.mjs` | §9 |
| `tasks.mjs add\|list\|done` | §4 |
| `mcp-gen.mjs [--dry-run]` | `config/mcp.selected.json` + `system/catalogue/mcp.json` → `.mcp.json` (wraps `npx` as `cmd /c npx` on Windows; `${VAR}` placeholders only) |
| `git-auto.mjs pull\|commit\|push\|status` | Never forces, never stashes, never rewrites history. `pull` saves local changes as a commit first, then runs `git pull --rebase --no-autostash` when an origin exists; a join that cannot be done cleanly is aborted and changes nothing. `commit` = big-file routing (§3, "Git storage") + `git add -A` + `git commit -m "auto: <date time> · <n> files"`, retried 3× on `index.lock`; a file that looks like it holds a password or key is taken out and a task says so. `push` = `git lfs push origin <branch>`, then `git push` (setting the upstream the first time); a rejected push joins the newer online copy with the same rebase and tries once more. `push` refuses first (kind `big-blob`) when a commit not yet online holds an ordinary file of 95 MiB or more. `push --background` (or `ALTERBRAIN_PUSH_BACKGROUND=1`) starts an upload with 16 MiB or more of Git LFS data waiting as a separate process, `--background-now` (or `=now`) does so whatever the size, and `--detached` is that process itself (lock `state/local/lfs-upload.lock`). Failure kinds that add a task: `conflict`, `auth`, `rejected`, `storage` (GitHub has no room for the big files; its wording is [Unverified]), `big-blob`, `lock`, `identity`, `other`; `network` and `timeout` are only logged, because the next save tries again. Skips when dev mode or `git.auto_commit` is false. On every run outside developer mode it installs or refreshes the `pre-commit` big-file check (§3, "Git storage"). Two internal commands are not in the usage line: `pre-commit` (run by that hook file; exit 3 means "the big files were the only thing in this save") and `hook` (install or refresh it). When encryption of private notes is on, `commit` and `pull` (which saves before joining) keep encrypted paths out of a copy that cannot encrypt and take out plain private notes, and `push` runs the fail-closed check described in §14 (`session_end.mjs`). `status` reports a locked copy, the state of the big-file check (`info.big_file_check`: `active\|missing\|foreign\|hooks-path\|error`) and whether a background upload is running (`info.upload_running`). |
| `setup-github.mjs [--name <repo>] [--dry-run] [--detach-only]` | Checks `gh auth`. If origin points to a repo that is not the user's own (normally the public Alterbrain repo), records the old origin in `state/release-origin.json` and removes it. Requires Git LFS (it stores files of 50 MB or more; everyday documents do not need it) and runs `git lfs install --local`. Installs the `pre-commit` big-file check (step `big-file-check`; §3, "Git storage"). Makes the first commit with `commitAll`, which holds back files that look like secrets and sends big files to Git LFS; files that could not be stored stay on this computer and are listed in the step `held-back-big`. Runs `gh repo create <name> --private --source . --remote origin --push`. `install.ps1` and `install.sh` also run `git-auto.mjs hook`. `--detach-only` needs no sign-in: it only records and removes the public Alterbrain origin (used in onboarding M0 when the user skips the backup). |
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
| `vault-key.mjs status\|setup\|export\|check\|unlock [--json]` | Optional encryption of the most private notes with git-crypt (ADR 0019; shared logic in `system/lib/vaultkey.mjs`). **status**: is it on, is git-crypt installed, is this copy unlocked (`<git-dir>/git-crypt/keys/default` exists and git's `filter.git-crypt.clean` is set; the git dir comes from `git rev-parse --git-dir`), and is every tracked file in an encrypted path stored encrypted in the index (each blob's first bytes are compared with the git-crypt header `\0GITCRYPT\0`; git-crypt's own output is not parsed), and is the upload check installed. The text output has an `Upload check ... installed` line; `--json` has `pre_push_hook` (`active\|missing\|foreign\|hooks-path\|error`, or `null` while encryption is off) and the problem ids `push-hook-missing`, `push-hook-foreign`, `push-hook-shared-folder` and `push-hook-error`, and `status` exits 1 until they are fixed. **setup**: needs git-crypt (found as described under "Finding git-crypt" below; if missing it prints the one install command per OS, says to run the command again and to restart the app only if the tool is still not found, and exits 1; it never downloads anything); refuses while `origin` is still the public Alterbrain repo, and when the folder already holds notes encrypted with a key that is not on this computer; runs `git-crypt init` if there is no key; writes the three attribute files and commits them alone before any private file is touched; stages existing encrypted-path files again (`git add --renormalize`) so the next commit stores them encrypted; installs the upload check (see the `git-hooks/pre-push.mjs` row); verifies with the status check; records `privacy.encryption` in `config/brain.json`; idempotent. If another tool owns the hook file or Git uses a shared hooks folder, setup still succeeds (encryption works), prints a `Warning:` line and leaves that hook alone. **export `--out <file> [--password] [--overwrite]`**: refuses an `--out` inside the project (real-path check, links included) or an existing file; runs `git-crypt export-key` to a temporary file in `state/local/tmp/` (overwritten and deleted in all paths); with `--password` asks twice for a password of at least 10 characters and writes JSON `{format:"alterbrain-vault-key", v:1, kdf:{name:"scrypt", N:2^17, r:8, p:1, salt}, iv, tag, ct}` (base64; scrypt then AES-256-GCM, 12-byte IV, extra data `alterbrain-vault-key-v1`), then reads the file back and compares. Default `--out`: `<home>/Documents/Alterbrain/vault-key-<folder>.key` (`.abkey` when wrapped). **check `--key <file>`**: the recovery drill; opens the copy (asking for the password if wrapped), compares its sha256 with the local key, prints "Your key backup works" and records `key_backup_checked`. **unlock `--key <file>`**: for a new computer; saves other changes first (git-crypt wants a tidy folder), unwraps to a temporary file, runs `git-crypt unlock`, deletes the temporary file, verifies, and installs or refreshes the upload check (also when the copy was already unlocked). Passwords are never read from arguments, environment variables or piped input: without a keyboard the script refuses with "Type the password in your own terminal window, not through Claude. Run: node system/scripts/vault-key.mjs …". Key bytes and passwords are never printed or logged. Exit 0 ok, 1 problem or refusal, 2 usage. **Finding git-crypt** (`resolveGitCrypt`, remembered per setting): `ALTERBRAIN_GIT_CRYPT` if set (another executable or a `.mjs` stand-in; tests only); otherwise the search path, then `%LOCALAPPDATA%\Microsoft\WinGet\Links\git-crypt.exe`, then every `%LOCALAPPDATA%\Microsoft\WinGet\Packages\AGWA.git-crypt_*\git-crypt.exe` (found by listing the folder, because the part after the underscore differs between computers), then `/opt/homebrew/bin` and `/usr/local/bin` on a Mac. A program that was open during a winget install does not see the new search path until it restarts, so no restart is needed. Only the per-user winget folder is searched, not a machine-wide install. The version is read from standard output or standard error. |
| `git-hooks/pre-push.mjs <remote name> <remote address>` | The upload check (ADR 0019): run by Git itself through the hook file `.git/hooks/pre-push`, so it covers Obsidian Git and every other Git tool on a computer. The hook file is written by `vault-key.mjs setup` and `unlock` and kept in place by `session_start.mjs`; its text and the helpers (`prePushShim`, `classifyPrePush`, `prePushHookStatus`, `ensurePrePushHook`, `auditCommits`) are in `system/lib/vaultkey.mjs`, and the hook finds the script at run time as `<repository top>/system/scripts/git-hooks/pre-push.mjs`. Git sends `<local ref> <local sha> <remote ref> <remote sha>` lines on standard input. **Exit 0** when encryption of private notes is off, when nothing would be sent (a deleted branch sends no commits), or when every commit is clean. **Exit 1** with one plain line on standard error that starts `Alterbrain stopped this upload` (`PUSH_REFUSED_PREFIX`), and one deduplicated high-priority `#ab/git` task (the same text the automatic save uses) when a commit it would send holds a file in an encrypted path without the git-crypt header. It **fails closed**: if node or the script is missing, or an object cannot be read, nothing is uploaded. It audits only what this computer would add: a named remote excludes commits its tracking branches already hold, a bare address counts every commit, and a merge commit is read with `git diff-tree -c`, which lists only files that differ from every parent, so notes another device already put online do not block a push. Stored files are read in bounded memory (`BLOB_READ_LIMITS`: groups of at most 64 MiB; a file over 8 MiB by its first bytes only), and a commit id that does not exist is an error, not a clean result. After its own check the hook file runs `git lfs pre-push "$@"` with the same input, because Git LFS keeps its upload step in the same file. As the standard LFS hook does, it exits 2 with a message that starts `Alterbrain stopped this upload` when `git-lfs` is not on the hook's PATH and the folder uses Git LFS (a non-comment `filter=lfs` line in any `*.gitattributes`, tracked or not, or `filter.lfs.clean` in the folder's own Git settings). The hook file remembers the absolute path of the node that wrote it, used only when `node` is not on the hook's PATH (a desktop app may not have it). Only an empty, absent, own or standard Git LFS hook file is written over; any other hook is `foreign` and a `core.hooksPath` setting means nothing is written (`hooks-path`): both are reported by `status`, `doctor` and the session digest, never changed. It cannot cover a phone: Git on a phone runs no hooks. |
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

### `state/local/course-nudges.json` (gitignored, never committed)
`{ "schema": 1, "courses": { "<course folder name>": { "last_class": "YYYY-MM-DD", "nudged_on": "YYYY-MM-DD" } } }`. Created on first use by the session digest (`system/lib/courses.mjs`, `writeState`: temporary file, then rename). `last_class` is the newest class date already mentioned for that course folder: a class date counts for a nudge only when it is later than `last_class`, so each class is mentioned once, and an earlier class that was not mentioned separately is covered by the newer one. A missing, unreadable or odd file means nothing was mentioned, but the 14-day window still applies, so an old class never comes back. A `last_class` in the future is ignored. Entries older than 14 days are dropped on the next write (they no longer change anything). It holds course folder names and dates only. Not edited by hand or by Claude.

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
- [ ] Git LFS and the upload check against real GitHub and real Obsidian Git. Tests used Git for Windows 2.55, Git LFS 3.7.1, git-crypt 0.7.0 and local bare repositories on Windows 11 only. Not run: macOS and Linux, a real GitHub upload and restore, GitHub's quota replies, how Obsidian Git shows a hook's message, the Obsidian Git plugin on a phone. GitHub's figures (about 100 MB per ordinary file, 2 GB per Git LFS file on free plans, its repository-size advice) are from memory (ADR 0020).
- [ ] Whether a detached background upload survives the end of a Claude session on every system (it did in tests on Windows 11; if it is ended, the next save starts the upload again from the start of that file).
- [ ] Product-owner decision: the `git reset --soft "@{u}"` repair for big files that were saved as ordinary files and never uploaded (`.claude/skills/health-check/references/fixes.md`, ADR 0020). It changes local history, which `git-auto` never does. Alternative: start a fresh private repository.
- [ ] The Canvas download steps in `system/packs/mba/course-setup.md` ("The download steps", written from general knowledge) against the user's school, and Canvas's own "offline HTML" export as a possible better route.
- [ ] What `markitdown` returns for real course workbooks (sheet names, whether formulas and charts survive). `course-setup.md` says only that values come through and that the rest is [Unverified].

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
