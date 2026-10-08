# Alterbrain build spec (v0.2)

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
12. **A learner-neutral core.** Alterbrain serves anyone who learns or works: an MBA, a university degree, online courses, or a job with no courses. The core (courses, study, notes, drafting, the assignment studio, job search) assumes none of them. A pack adds content for one kind of learner (`mba`) or one country (`country-nl`). The user's kind is `learner.kind` in `config/brain.json` (§10, ADR 0023).
13. **Existing users keep working.** A change to the shape of user data or config ships a migration or a documented fallback in the same release (§15a, ADR 0024). A changed template alone never reaches an existing copy.
14. **Deliverables meet one standard.** Every report, deck, workbook, memo, CV or letter is drafted in the user's voice at a chosen tone, built on one set of principles, passes one delivery gate before the user is told to upload, and is offered a critique once at the end. Nothing that leaves the computer carries working labels or placeholders (§19, ADR 0026).

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
│  ├─ skills/<name>/SKILL.md (+ references/, workflows/)   [F text]  e.g. skills/course/references/course-setup.md (the course procedure), skills/critique/references/lenses/ (the one library of reviewer briefs), skills/critique/ (any deliverable), skills/template/ and skills/people/ (core since 0.2.0)
│  ├─ skills/my-<name>/               [U]  self-built skills
│  ├─ agents/<name>.md                [F text]
│  ├─ agents/helper-{triage,draft,review,judgement}.md   [F text]  the four named helpers, one per routing class (§6, ADR 0027)
│  └─ agents/my-<name>.md             [U]  self-built agents
├─ system/                            [F]
│  ├─ core.md                         [F code]  the constitution (protected)
│  ├─ release.json                    [F code]  {name, version, tag, repo, min_claude_code, min_node, min_quarto}
│  ├─ manifest.json                   [F code]  generated; file list + class + sha256
│  ├─ hooks/*.mjs                     [F code]
│  ├─ scripts/*.mjs, scripts/git-hooks/*.mjs, install.ps1, install.sh   [F code]
│  ├─ scripts/migrations/NNNN-*.mjs   [F code]  upgrade scripts for mechanical must-do fixes, run once each by update.mjs (§15a)
│  ├─ scripts/migrations/NNNN-*.md    [F code]  guided upgrades: instructions the user's own Claude follows after the update, with the user's approval (§15a.2b)
│  ├─ lib/*.mjs                       [F code]  shared helpers for hooks and scripts; migrate.mjs is the helper for upgrade scripts
│  ├─ catalogue/mcp.json, routing.json, obsidian-plugins.json   [F code]
│  ├─ catalogue/MCP-CATALOGUE.md      [F text]  human-readable view of mcp.json
│  ├─ templates/                      [F text]  vault skeleton, identity templates, note templates, config defaults
│  ├─ deliverables/*.md               [F text]  the deliverable rules every skill reads: principles, delivery-gate, tone-and-voice, rehearsal (§19)
│  ├─ blueprints/*.md                 [F text]
│  ├─ docs/guides/*.md                [F text]  read by /menu
│  ├─ packs/README.md                 [F text]  what a pack is, how packs are selected, the learner kinds, country packs (§10, "Packs")
│  ├─ packs/mba/                      [F text]  the MBA pack: frameworks/ (25 business frameworks), templates/case.md (the case method), critique-presets.md (business seats for the reviewers), README.md
│  ├─ packs/twin/                     [F text]  drafting rules and voice-import steps (used by `ghostwriter` and `/reply`; never listed in `packs`)
│  ├─ packs/country-<cc>/             [F text]  a country pack, country-nl first: README.md, jobs.md (the contract, §10 "Packs") and the country's reference tables
│  └─ quarto/                         [F text]  Quarto templates (templates/<name>/, each with a template.yml, §19), _extensions (vendored), brand, fonts; tools/render.mjs (render, scaffold)
├─ config/                            [U]  brain.json, autonomy.json, mcp.selected.json
├─ state/                             [U]  onboarding.json, proposals.json, built.json, migrations.json (section 10), release-origin.json (section 15); local/ is gitignored
├─ .mcp.json                          [U generated]  by system/scripts/mcp-gen.mjs
├─ docs/                              [F text]  SPEC.md (this file), adr/ (decisions), research/
├─ tests/                             [F code]  node --test suites + fixtures (synthetic); slow tests are release tests, run only with `ALTERBRAIN_SLOW_TESTS=1`
├─ .github/workflows/ci.yml           [F code]
└─ vault/                             [U]  the Obsidian vault (Obsidian opens THIS folder); vault/.gitattributes holds the user's own Git rules (§3); vault/80_me/templates/<slug>/ holds the user's own templates (§19)
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
├─ _views/                    the `.base` files (Assignments, Applications, Drafts, Proposals, Sources, Cards due, Contacts), embedded by Home.md; Contacts.base is added to an existing vault by /people on first use; Routines.base ships with the skeleton (§3a)
├─ .gitattributes             the user's own Git rules: one Git LFS line per big file, written by the automatic save; never replaced by an update (see "Git storage" below)
├─ 00_inbox/
│  ├─ Tasks.md                THE human to-do list (§4)
│  ├─ outbox/                 drafts awaiting the human (emails, applications, posts)
│  ├─ proposals/              self-build proposal cards
│  └─ captures/               quick notes from /capture
├─ 10_projects/               time-boxed work (assignments, projects, job campaigns, group work)
├─ 20_areas/
│  ├─ programmes/<Programme name>.md   optional, one per programme (a degree, an MBA, a certificate track): what holds for all its courses
│  ├─ courses/<course-slug>/  course.md (syllabus, AI policy, Material list), sessions/, cases/, assignments/   (flat: no programme name in the slug)
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
├─ 60_people/                 people notes: the contact book (business facts by default, source + date per fact; profile fields in "Note types")
├─ 70_journal/  daily/  weekly/  decisions/
├─ 90_routines/               one note per scheduled job (§3a); created lazily, no folder means no routines
└─ 80_me/
   ├─ SOUL.md  IDENTITY.md  USER.md  MEMORY.md  fact-sheet.md
   ├─ voice/<lang>/profile.md  voice/<lang>/exemplars.md  voice/<lang>/stats.json (baseline for `voice-stats.mjs --check`)
   ├─ voice/slop-extra.json   (optional: the user's own word lists for `slop-check.mjs`)
   ├─ brand/_brand.yml        (the user default look; stays valid as a documented fallback, §15a.5)
   └─ templates/<slug>/       (the user's own templates: template.yml plus its files, §19)
```

### 3a. Routines (`vault/90_routines/<Name>.md`, ADR 0030)
A registry of scheduled jobs. Alterbrain runs no scheduler: hosts stay Claude desktop scheduled tasks (laptop), Claude cloud routines, or a server's own scheduler. The notes make jobs visible, portable and fail-visible. Template: `system/templates/notes/routine.md`; shared logic in `system/lib/routines.mjs`; script `routines.mjs` (§15).
- **Frontmatter:** `type: "routine"`; `status` (`active`, `paused`, `suggested`); `schedule` (plain words, "Mondays 08:00"); `cadence` (machine form: `daily@HH:MM`, `weekly:<mon|tue|wed|thu|fri|sat|sun>@HH:MM` or `monthly:<1-28>@HH:MM`); `host` (`laptop`, `cloud`, `server`); `runs` (a skill such as `"/people due"`, or `"prompt"`); `may: "draft only"` (fixed; any other value makes the note invalid, and it is an instruction and a label, not a lock: `config/autonomy.json` still decides what a run can send); `data` (list of vault paths it may read; absolute paths and `..` are invalid); `model` and `effort` (routing aliases, §6); `last_run` (local `YYYY-MM-DD HH:MM` or empty); `last_result` (one plain line); `created`.
- **Body:** ends with `## Instruction for the host`, the exact text the host runs (copy and paste to recreate it on any host). Its last step is `node system/scripts/routines.mjs record "<Name>" --result "<one line>"`. `show <name> --instruction` prints that section.
- **Overdue rule:** an active, valid routine is overdue when now is later than `last_run` plus one interval plus a grace of half an interval (at least 2 hours); an interval is 24 hours (daily), 7 days (weekly) or 30 days (monthly). A routine that never ran counts from the end of its `created` day (or the full stamp if it has one) to its first due time, plus the same grace. Paused, suggested and invalid notes are never overdue. Times are local.
- **Unreadable notes:** a note in the folder that cannot be recognised as a routine (the file cannot be read, no frontmatter block, a block with no closing `---`, no readable `key: value` lines, or no `type` line; `README.md` and `type: "readme"` are skipped, and so is a note that names another type) is returned by `readRoutines()` in `unreadable` as `{ name, file, reason }` and is never dropped. `routines.mjs list` and `overdue` print it with the reason (and list in `--json` under `unreadable`), `show` and `record` name the reason instead of "no such routine", and the doctor check warns about it. It is never in the session digest, which stays at the one overdue line. Exit 1 from `list`, `overdue` or `show` means something needs attention, a finding and not a crash.
- **Name clashes:** `suggest` does not offer, and `enable` refuses (exit 1, one plain sentence, nothing written), a suggestion whose file name is already taken in `vault/90_routines`, whether by a readable routine, an unreadable note or a note of another type. A write failure is also one plain sentence, never a stack trace.
- **Fallback:** no `vault/90_routines/` folder, or an empty one, means no routines. No migration is needed for the folder; guided migration `0007-routine-notes` only offers notes for automations already in `state/built.json`.
- **Cloud and server hosts** work on their own copy of the project; `record` reaches the vault only if the run also commits and pushes. The note template and the suggested routines carry a "Where it runs" section above the instruction that says so.
- **Suggested routines** are templates in `system/templates/routines/` (Contacts due, Weekly review reminder, Morning brief, the last only if the morning-brief blueprint is built). Updates never write them into a vault; `routines.mjs enable` does, active only with `--user-asked`.
- **View:** `vault/_views/Routines.base` (status, schedule, host, last run, last result).

### Conventions
- **File names:** human-readable Title Case for notes (`Porter Five Forces.md`); kebab-case for folders. Never two names differing only by case.
- **Links:** Obsidian wikilinks `[[Note Name]]`; embeds `![[file]]`. Further habits (file over app, one date format, properties over folders, link liberally), adapted from Steph Ango's published vault practices, are in `.claude/rules/vault.md`; where they differ from this section, this section wins.
- **Frontmatter:** every note has YAML frontmatter with at least `type`, `created` (YYYY-MM-DD) and `status`. Strings are double-quoted.
- **Dates:** always take them from the system (`node -e "console.log(new Date().toISOString())"` or the hook digest). Never guess a date.
- **Citations** in wiki and answers: `[Source: [[note]] | YYYY-MM-DD | confidence: high|medium|low]`.
- **Labels** for anything not directly sourced: `[Inference]`, `[Unverified]`, `[Speculation]` (and the gap marker `[FACT NEEDED: …]`). They belong in chat and in working notes only. Nothing that leaves the computer (a deliverable, a message, a post) carries a bracket label or a placeholder such as `[Teammate name]`: it says "we assume" or "in our reading" instead, and `release-scan.mjs` fails on any that remain (§15, §19).

### Note types (`type:` frontmatter)

| type | where | required extra fields |
|---|---|---|
| `source` | 40_sources/notes | `raw`, `sha256`, `origin`, `ingested`, `kind` (pdf, web, email, doc, slides, sheet, transcript, other) |
| `concept` | 30_wiki/concepts | `sources: []` |
| `framework` | 30_wiki/frameworks | `family`, `when_to_use`, `sources: []` |
| `company` | 30_wiki/companies | `sources: []` |
| `programme` | 20_areas/programmes/<Programme name>.md | optional, one per programme. `provider` (the school or platform), `level` (for example MBA, MSc, BSc, certificate), `start` and `end` (`YYYY-MM-DD`), `ai_policy` (the same values as a course) and `ai_policy_quote` (the school-wide rule, word for word), `grading_scale`, and the optional deliverable defaults `templates` (list of template slugs attached to the whole programme, §19), `tone` (`academic`, `professional` or `conversational`, or empty), `max_upload_mb` (number or null) and `csl` (a citation style: a file name or a bare style name); `status` is `active` or `completed`. Sections: Terms (a table of Term, Start and End; `YYYY-MM-DD` only), AI rule, Grading, Submission conventions, Career services, Courses. Template: `system/templates/notes/programme.md`; procedure: "The programme note" in `.claude/skills/course/references/course-setup.md` |
| `course` | 20_areas/courses/x/course.md | `code`, `term`, `programme` (a link to the programme note, `"[[MBA – RSM]]"`) or `provider` (the school or platform, for a standalone course such as one from Coursera; both optional, a new note carries the one that applies), `ai_policy` (allowed, allowed-with-disclosure, restricted, banned, unknown, none-stated), `ai_policy_quote`, and the class dates behind the after-class reminder (all optional, empty by default): `session_dates` (list of `YYYY-MM-DD`, only dates the syllabus states, never invented, class meetings only), `class_days` (list of `mon`..`sun`, used only when `session_dates` is empty, from the syllabus or the user), `term_start` and `term_end` (`YYYY-MM-DD`, the first and last day of the term: generated class days start at `term_start` and end at `term_end`; without `term_end` they end 16 weeks after `term_start`, or after `created` when there is no `term_start`) and `class_days_asked` (`YYYY-MM-DD`, the day Alterbrain asked which days the class meets, set whatever the answer so that it does not ask again unprompted). A class on or before the `created` date is never nudged (for `session_dates` and `class_days` alike), and a `class_days` schedule with no `term_end`, no `term_start` and no valid `created` is not nudged, so the reminder always ends. A note without class dates is never nudged. `status` is `active` or `completed` (set to `completed`, with the user's OK, for a finished course: `/weekly-review` asks only about active courses). Sections: Submission rules and Cases and assignments (read by `/assignment`), and Material, the index of the course's source notes by type and session (written by the course procedure, `.claude/skills/course/references/course-setup.md`). Optional deliverable keys (empty by default; a missing key means "ask once or inherit", §15a.5): `team` (list of names), `team_name`, `team_number` (the team recorded once per course and reused for covers, title slides and file names; an assignment can override it), `templates` (list of template slugs attached to this course), `tone` and `ai_log` (true when the course requires an AI-use log). Template: `system/templates/notes/course.md`. What a course takes from its programme, and the two meanings of an unset AI rule, are under "Programme notes and inheritance" below the table |
| `case` | courses/x/cases | `course`, `question`, `case_type` (decision, evaluation, diagnosis), `case_date` (YYYY-MM-DD, the date the case is set; see §13 hindsight rule). Template: `system/packs/mba/templates/case.md` (the case method stays in the MBA pack; `/assignment` uses it whenever the work is a case) |
| `assignment` | 10_projects/<slug>/assignment.md | see §13. `limits` is a small map `{ pages, font_pt, line_spacing, words }` (any may be null). `course` may be empty: an assignment does not need a course. Deliverable keys added in 0.2.0, all optional: `team`, `team_name`, `team_number` (this assignment's own team; empty means the course default after a confirming question), `templates` (slugs), `tone`, `voice_mode` (`me` or `team`, asked once per group deliverable), `grade` (as given, empty until it comes back) and `feedback` (link to the feedback note, or empty). Body section `## Assignment text (as given)` holds pasted assignment text word for word. Template: `system/templates/notes/assignment.md` |
| `project` | 10_projects/<YYYY> <project-slug>/project.md | `created`, `status` (active, done, dropped), `due` (`YYYY-MM-DD`, or empty), `area` (the focus area from `USER.md`, "Current focus", it belongs to, or empty). Sections: Goal, Next steps, Notes and links. Optional `templates` (slugs) and `tone`. Work that is not a course assignment (a working professional's launch, report or move to a new team); dates the user has confirmed also go on the task list. Template: `system/templates/notes/project.md` |
| `application` | 20_areas/career/applications | `company`, `role`, `stage` (found, shortlisted, preparing, applied, interview, offer, rejected, withdrawn), `source_url`, `deadline`; plus the extra fields below |
| `draft` | 00_inbox/outbox | `channel`, `to`, `lang`, `status` (draft, approved, sent, killed), `facts_used: []`; plus the extra fields below |
| `proposal` | 00_inbox/proposals | see §11 |
| `person` | 60_people | `org`, `role`, `source`, `dnc` (do not contact, true/false). The CRM profile (ADR 0028), all optional: `how_met`, `met_on` (`YYYY-MM-DD`), `last_contact` (`YYYY-MM-DD`), `next_follow_up` (`YYYY-MM-DD`), `cadence` (`none`, `monthly`, `quarterly`, `half-yearly`, `yearly`), `tags: []`, `linkedin` (an address the user shared), `birthday` (empty unless the user adds it). Sections: Who they are, How we met, Interactions (one dated line per contact), Follow-ups, Notes, and an optional `## Private` section written only on request. Business facts by default; see "Privacy" below. A note without the new keys gives no reminder (§15a.5). Template: `system/templates/notes/person.md`; procedure: `.claude/skills/people/` |
| `routine` | 90_routines | `status`, `schedule`, `cadence`, `host`, `runs`, `may` (`"draft only"`), `data`, `model`, `effort`, `last_run`, `last_result`; shape and overdue rule in §3a. Template: `system/templates/notes/routine.md` |
| `card` | 50_learning/cards | see §12 |
| `daily`, `weekly`, `decision` | 70_journal | `decision` notes never have the Decision field filled by the agent |
| `capture` | 00_inbox/captures | `status` (new, filed). The body is the user's words, untouched (`/capture`) |
| `topic` | 30_wiki/topics | `sources: []`, `status: "active"`. An answer from `/ask` filed back with its citations |
| `analysis` | wherever the user works (usually a project folder) | `framework`, `subject`, `question`, `sources: []`. Output of `/framework` |
| `scan` | 10_projects/<YYYY> Job search | `roles: []`, `cities: []`, `found`, `shortlisted`. Summary of one `/jobs scan` |
| `rubric` | assignment folder | `assignment`, `scale`, `grade_mapping`. The verbatim rubric text first, our reading second |
| `decisions` | assignment folder | `assignment`. Log of the user's decisions (D1, D2, ...) |
| `brief` | assignment folder | `assignment`, `thesis`. The fact base for the assignment |
| `critique` | assignment folder, or the deliverable's folder | `assignment`, `round`, `panel: []`, `grade_low`, `grade_mid`, `grade_high`, `plateau`, `thesis`; for a deliverable that is not an assignment the optional `deliverable` (a link) replaces `assignment`, and the file is `critique-<YYYY-MM-DD>-<n>.md`. Consolidated critique of one round |
| `review-round` | assignment folder, or `<deliverable folder>/reviews/<YYYY-MM-DD>-<n>/` | `assignment` or `deliverable` (a link), `round`, `panel: []`, `case_date`. The round card handed to the lenses |
| `review` | `reviews/<round>/<lens>.md` | `lens`, `round`. One lens report, saved word for word |
| `lens` | `.claude/skills/critique/references/lenses/` (framework file, not a vault note) | `name`, `helper` (the named helper that runs it), `model`, `effort`, `word_cap`, `panels: []` (`full`, `quick`), `deliverables: []` (the kinds it suits, or `any`), `needs` (`none`, `rubric`, `workbook` or `voice-profile`). A user's copy that says `lite` is read as `quick` (§15a.5) |
| `feedback` | assignment folder (`feedback.md`) | `assignment`, `received` (`YYYY-MM-DD`), `grade` (as given). The grade and feedback word for word, then "What it tells us". Written by `/assignment feedback`; template `system/templates/notes/feedback.md` |
| `ai-log` | assignment folder (`ai-log.md`) | `assignment`. Only for a course whose note has `ai_log: true`; one dated line per working step of what Alterbrain did, and the user's own part only in their words. Template `system/templates/notes/ai-log.md` |
| `rehearsal` | next to the deck source (`rehearsal.md`) | The rehearsal pack (§19): timing plan, likely questions with short answers, cheat sheet. The speaker notes go into the deck source itself |
| `identity` | 80_me | `status`. Used by SOUL, IDENTITY, USER and MEMORY |
| `fact-sheet` | 80_me/fact-sheet.md | `status`. The facts allowlist for drafts. Every row has a visibility, `public` or `private` (see "Privacy" below) |
| `voice-profile` | 80_me/voice/<lang>/profile.md | `lang`, `status` (draft, active), `calibrated`, `samples` |
| `voice-exemplars` | 80_me/voice/<lang>/exemplars.md | `lang`, `status`. Real samples tagged by channel and recipient class |
| `tasks` | 00_inbox/Tasks.md | `status`. Generated by `system/lib/tasks.mjs`; has no `created` field |
| `blueprint` | `system/blueprints/` (framework file, not a vault note) | see section 16 |

**Programme notes and inheritance (ADR 0023).** A programme note holds what is true for every course in a programme once, so no course repeats it. A course links to it with `programme: "[[MBA – RSM]]"`; a standalone course names its `provider` and has no programme note. Course folders stay flat in `20_areas/courses/<course-slug>/`: the slug carries no programme name, and only a clash adds a suffix (a course "Strategy" in two places becomes `strategy-coursera` or `strategy-mba-rsm`; the title becomes "Strategy (Coursera)"). The course wins: it overrides the programme only where it differs, and it is the only note that code and rule 6 of `core.md` read.
- **Copied into the course at setup** (code reads only the course note): `ai_policy` and `ai_policy_quote` (only after the user confirms; the quote then starts with `Programme rule: `), and `term_start` and `term_end` from the programme's Terms row for the named term (only real `YYYY-MM-DD` dates; the session digest ignores any other form).
- **Read at the moment of use, never copied:** the grading scale, the submission conventions and career services. The course note's own section is read first, and the programme note answers when that section is empty.
- **A later change to a programme note rewrites no course.** The course procedure's review mode lists the courses whose quote starts `Programme rule: ` and asks once.
- **`ai_policy` has six values.** `unknown` means not checked yet or unclear; rule 6 warns before assignment work. `none-stated` means no rule was found in what was read (the course files, the programme note, and the provider's terms only if they were given) or the user confirmed there is none; it never means that a provider was checked, and rule 6 stays silent. The procedure sets it without a question only for an online or provider course, and a degree or MBA course with nothing found stays `unknown`. An assignment with no course has no rule to read (rule 6: not applicable).
- **`school` (legacy).** Course notes made before 0.2.0 may carry `school: "…"`. It is read as display text only when a note has neither `programme` nor `provider`, and is never written to a new note (§10, "Fallbacks for older installs").

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

**Extra `application` fields** (written by `/jobs scan`). Core fields: `location`; `fit` (score); `source` (`adzuna` or `career-page`); `retrieved` (date). The active country pack adds the fields its `jobs.md` declares under Fields (§10, "Packs"). The Netherlands pack (`country-nl`) writes `sponsor` (the IND register phrase, or `n/a`), `dutch` (language signal: required, likely, preferred, not_required, unknown) and `salary_check` (verdict against `system/packs/country-nl/salary-thresholds.md`, or `n/a`). Without a country pack these three are absent. The names are unchanged since 0.1, so existing notes and the pipeline view keep working.

**Recipient classes** (`system/packs/twin/drafting.md` §3; the same names tag the exemplars; the ids are unchanged since 0.1 because they are stored in drafts and exemplars, and only the definitions were widened for learners and workers who are not in a school):

| class | who |
|---|---|
| `faculty` | teachers, lecturers, tutors, supervisors, mentors |
| `school-staff` | programme or provider staff (admissions, careers, IT, learner support) |
| `recruiter` | recruiters, hiring managers, interviewers |
| `professional` | colleagues, managers, clients, alumni, contacts |
| `peer` | classmates, course-mates, team-mates, same-level colleagues |
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
- **The limit** is `git.lfs_min_mb` in `config/brain.json` (§10). The code default is 50 when the key is absent, so existing installs need no migration (a documented fallback, §15a.5).
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
- **Line endings.** `addTask` keeps the file's own: CRLF when its first line break is CRLF, otherwise LF (a new file is LF). A task is never appended with a different ending from the file's. This holds when the file has no final line break, when Inbox is the last section and empty, and when it has no Inbox heading.

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
  - the non-negotiables (draft-only, content trust, clarify gate, no secrets in chat or the vault, no fabricated facts about the user and the private-fact gate, coursework notice: rule 6 warns for `restricted`, `banned` and `unknown`, drafts a disclosure for `allowed-with-disclosure`, and says nothing for `allowed`, `none-stated` or an assignment with no course);
  - the folder map (including `20_areas/programmes/`, the packs, `vault/80_me/templates/` and `system/deliverables/`);
  - the label boundary in "Known vs not known" (one sentence: bracket labels never go into anything that leaves the computer; plain wording instead, ADR 0026);
  - the standing-rule offer (C5): when the user states a standing rule, offer `/learn` in the same turn so it lands in `vault/80_me/MEMORY.md`;
  - how to add tasks;
  - the standing course-material rule (one line: if something new for a course comes up and its Material list lacks it, ask once per course per session, after the user's request and never mid-draft, whether they have it, then add it via `/ingest`; the detail is `.claude/skills/course/references/course-setup.md` section 7);
  - model routing (short form);
  - where things live;
  - "the user's request always comes first".
- **Always-loaded budget (stated figures):** the empty templates (`core.md` plus SOUL, IDENTITY, USER and MEMORY) total at most 8 KB. Once filled in, the target is at most 12 KB. `USER.md` ≤ 4,000 characters; `MEMORY.md` ≤ 60 lines. `fact-sheet.md` is not always loaded.
  - **Open point for the owner (measured 2026-10-08, again after the v0.2.0 deliverables work): the stated figures do not hold, and no test enforces them.** `core.md` 7,913 bytes (7,900 before the deliverables work, 7,918 before the learner-neutral change) plus the empty templates IDENTITY 573, MEMORY 547, SOUL 1,110 and USER 1,269 is 11,412 bytes, 3.4 KB above 8 KB (it was 11,399 before the deliverables work). The deliverables work paid for its `core.md` additions (label boundary, standing-rule offer, two folder-map entries) by shortening wording and dropping three file-path pointers, and weakened no non-negotiable. Filled in, `core.md`, SOUL, IDENTITY and `USER.md` at its 4,000-character limit alone come to 13.6 KB, so the 12 KB target cannot be met either. This change does not alter the figures. Proposal: state the budget as `core.md` ≤ 8 KB (a limit it meets today), the empty set ≤ 12 KB, and the filled-in set ≤ 18 KB [Inference: `MEMORY.md` at 60 lines of about 80 characters adds about 5 KB]; or trim `core.md` to meet 8 KB for the empty set, which would cost non-negotiable wording. Until the owner decides, the working limit is `core.md` ≤ 7,918 bytes.
- **`.claude/rules/`** holds `model-routing.md` (always on, short), `writing.md` (always on), `vault.md` (path-scoped to `vault/**`), `framework-dev.md` (path-scoped to the developer folders `system/hooks/**`, `system/scripts/**`, `system/lib/**`, `tests/**`, `docs/**`, so learners' sessions that read skill workflows or templates do not load it) and `migrations.md` (path-scoped to `system/templates/**`, `system/packs/**`, `system/catalogue/**`, `system/core.md` and `.claude/skills/**`: a short, dev-mode-only pointer to the migration policy in `framework-dev.md`, loaded where data shapes change).

---

## 6. Model routing (`system/catalogue/routing.json`)

| class | model | effort | helper | examples |
|---|---|---|---|---|
| `deterministic` | script | — | none | copy, hash, extract, render, page check |
| `triage` | haiku | low | `helper-triage` | classify, tag, score, extract fields, summarise one email |
| `work` | sonnet | medium | `helper-draft` | drafts, explanations, research, notes, edits |
| `review` | sonnet | high | `helper-review` | verification, critique lenses, QA, fact-checks |
| `judgement` | opus | high | `helper-judgement` | thesis options, devil's advocate, critique synthesis, voice-profile calibration, self-build review |

**Rules:**
- **Main session:** `.claude/settings.json` sets `"model": "sonnet"`.
- **Every** agent and skill declares `model` and `effort` in frontmatter, using aliases (`haiku`, `sonnet`, `opus`, `fable` or `inherit`), never full IDs.
- **Delegate through a named helper (ADR 0027).** A skill or workflow that hands work to a subagent names the helper of the work's class (`helper-triage`, `helper-draft`, `helper-review`, `helper-judgement`; table above) and never asks for a generic subagent "with model X and effort Y". [Unverified] A per-call effort override is not available to the caller, which is why each class is an agent file with its model and effort in its frontmatter. If `helper-judgement` cannot run (plan limits), the main session does the pass and says so.
- **Delegated work is never reported done on the helper's word (C4).** The main session reads the diff and looks at the changed pages itself; a helper's "I viewed all pages" is never evidence.
- **`validate.mjs` enforces it:** each class's `helper` in `routing.json` must exist as an agent with the same `model` and `effort`, and framework skill, workflow or pack text that asks for a generic subagent with a model or effort and names no helper is an error (a warning for a user's `my-*` skill). Code fences and front matter are ignored.
- **Fan-out caps:** ≤3 parallel subagents on Pro, ≤8 on Max (from `config/brain.json` `plan_tier`).
- **Escalation:** one tier only after two failed reviews, and say so.
- **Never stop running agents to change model.**
- **Staying current.** Aliases move to the newest model of their family, so most upgrades need no edit. `routing.json` carries `"reviewed": "YYYY-MM-DD"`. When that date (or `checked` in `state/local/model-check.json`) is more than 90 days old, or the user asks, `/health-check` runs the model check (`.claude/skills/health-check/references/model-check.md`): it reads Anthropic's current model list, compares it with the five classes and, if a better fit exists, writes an "Update model routing" proposal (kind `automation` or `skill`) and a `#ab/health-check` task. It never changes anything itself. Approved changes edit the `model:`/`effort:` lines of the listed skills and agents (the four helper agents and the `helper` keys in `routing.json` change only in a release); the main session model is changed by the user in `.claude/settings.local.json`, never in `.claude/settings.json`. `/weekly-review` adds a reminder task when the check is due.

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
| Core | `onboard` · `menu` · `reconfigure` · `clarify` · `health-check` · `update-alterbrain` · `capture` · `ingest` · `ask` · `propose` · `build` · `remove-skill` · `framework` · `render` · `weekly-review` · `learn` · `edit-voice` · `assignment` · `reply` · `jobs` · `study` · `course` · `critique` · `template` · `people` |
| Vendored (kepano/obsidian-skills, MIT) | `obsidian-markdown` · `obsidian-bases` · `json-canvas` · `obsidian-cli` · `defuddle` |

Notes:
- `critique` (any deliverable, one lens library), `template` (turn a school or employer template into a template; list, attach, preview, remove) and `people` (the contact book) are core since 0.2.0 (ADR 0025, 0026, 0028).
- There is no skill group for a pack. The MBA pack has no skills: it holds frameworks, the case template and critique presets (§10, "Packs"). `assignment`, `study` and `course` work for any learner, and `jobs` is the core flow plus country packs (Netherlands first).
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
| `helper-triage` | haiku / low | Read, Grep, Glob | Small mechanical judgement on named files (classify, tag, score, extract fields). Returns JSON or a short list. Read-only. |
| `helper-draft` | sonnet / medium | Read, Grep, Glob, Write, Edit | Notes, summaries, explanations, research write-ups and edits, written only to the paths the caller names. Not for text in the user's voice that leaves the computer (use `ghostwriter`). |
| `helper-review` | sonnet / high | Read, Grep, Glob | Blind, read-only review through one lens brief (critique, verification, QA, fact-check, grading). Returns one structured report. Several run in parallel for a panel. |
| `helper-judgement` | opus / high | Read, Grep, Glob, Write | Named judgement passes only: thesis options, devil's advocate, consolidating a critique round, voice-profile calibration, self-build safety review. Writes at most the one file the caller names. |
| `lens` | parametrised (default sonnet / high) | Read, Grep, Glob | **Deprecated** in favour of `helper-review` and `helper-judgement` with a lens brief; kept until 0.4.0 at the earliest so that a user's `my-*` skill that names it keeps working. Blind critique lens: receives paths and a lens brief, returns one structured report. |
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
- **Zips (ADR 0021).** There is no connection to any school's or provider's learning platform (some do not allow automated access); the user downloads the course files, usually as one zip ("download all files"), and gives the folder or zip to `/ingest`. A `.zip` named on the command line, or found inside a folder that is, is opened with the computer's own `tar` that reads zips (bsdtar: `System32\tar.exe` by full path on Windows, because a `tar` on the search path can be Git's GNU tar, which cannot; the system `tar` on macOS), or `unzip` if there is no bsdtar. If neither exists, it says plainly to unzip the file first. The zip itself is **not** stored. The files go through the per-file steps below with the origin `<zip name>/<inner path>`; an explicit `--origin` wins. The script reads the zip's index itself before anything is unpacked and refuses the **whole zip** (nothing from it is used, and nothing partial reaches the immutable raw store) when it: holds a name that leads outside its folder (`../x`, `/x`, `C:/x`, `\\server\x`, zip-slip) or a link entry; is password protected, damaged or truncated; holds more than 5000 files or 2 GB unpacked (each zip counted on its own; `ALTERBRAIN_MAX_ZIP_FILES`, `ALTERBRAIN_MAX_ZIP_BYTES`); holds two names that Windows and macOS treat as one file (compared after case-folding and Unicode normalisation: `Notes.md` and `notes.md`); gives a different number of files than it lists when unpacked; or the tool exits with an error. It unpacks into a fresh `state/local/tmp/ingest-zip-*` folder while a watcher stops it if the unpacked size passes the limit, then checks that nothing landed outside that folder, that nothing is a link and that every file resolves inside it. The folder is always deleted again (after an error, at exit and on Ctrl+C; leftovers older than 24 h are swept). A zip **inside** a zip is stored as an ordinary file with a note ("zip inside a zip") and not opened: opening nested zips is how zip bombs multiply and the origin trail would blur. `ALTERBRAIN_NO_ZIP_TOOL=1` pretends there is no tool (tests only).

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

**Output:** a summary (and `--json`: `{ ok, counts: { found, new, duplicate, skipped, error, text_pending, local_only, zips }, manifest, manifest_bad_lines, zips: [{ zip, status: "opened" or "refused", files, bytes, reason? }], files: [...] }`). The `ingest` skill then writes one source note per new file and updates the wiki (`index.md`, `log.md`, concepts). For a folder or zip of course material it follows `.claude/skills/ingest/references/course-material.md`: it infers the course from the folder or zip name and the course notes and confirms with one question, passes `--course`, links each source note to the course note, offers to put deadlines found in a syllabus or assignment page into the course note and the task list, and works in batches (about 50 notes per run, with a task for the rest). Setting up a whole course is one procedure, `.claude/skills/course/references/course-setup.md`, followed by `/course` (a new course, block or term), onboarding M3, `/ingest` and, through an offer, `/assignment new`: it asks for everything the learner has (syllabus, slides, readings, cases, Excel models and data files, briefs and rubrics, past exams), imports it with `--course`, writes the course note from the syllabus, keeps the `## Material` index in the course note (including links to the user's own notes already in the vault, under "Your notes", never imported twice), records the class dates the syllabus states (`session_dates`) or, when it states none, asks once for the weekdays (`class_days`, `term_start`, `term_end`; "The schedule question" in section 3, also asked by `/course <name>` for a course whose note has no class dates, and remembered in `class_days_asked` so that a "don't know" is not asked again) so that the session digest can ask for new material after each class, and reports what is missing. Bringing material in is an ongoing habit, not a one-off (section 7 of the procedure): whenever the user mentions or hands over something new for a course, or the digest says "New material?", Alterbrain checks the course's Material list first and then asks once per course per session, after the user's own request and never mid-draft. Word, PowerPoint and spreadsheets: `.csv` and `.tsv` are kept as text; `.docx`, `.pptx`, `.xlsx`, `.xls`, `.xlsm`, `.ods` and the like become text only when `markitdown` is available, otherwise `text_status` is `pending` and the source note says so. The procedure checks `uvx --version` before the copy and offers (PDF first, install the reader first, copy as they are), because installing afterwards does not help files already copied. Unreadable files are listed as "not readable yet", counted apart, and never summarised. The AI-policy notice (`core.md` rule 6) does not run at import, because importing readings is not assignment work; it runs when the user asks to start or draft an assignment. Raw files are never edited or deleted.

**Import safety (v0.2.0, ADR 0026).** The per-file `--json` record can carry `ai_notice` and `ai_notice_text` when the new file's text says it must not be used with AI tools (`aiRestrictionHits(text)`, exported; five patterns, case-insensitive, the AI term anchored). The raw copy is still made and the manifest line is unchanged. The skill then flags the file once and writes no note until the user decides. `--ai-pending [--json]` re-checks the files that still have no note, and `--ai-decide <id> held|use` stores the answer in `state/local/ai-decisions.json` (`{ sha256: "held"|"use" }`, never tracked), so the user is asked once. A syllabus sentence that states the course's own AI rule for students is the course AI rule, not a file restriction. Client or company material gets a private-backup reminder, and rosters become business facts only. Bulk import: helpers write source notes only, on disjoint file sets; the main session writes the wiki pages, the index and the log and spot-checks one helper note.

---

## 10. Config schemas

Defaults live in `system/templates/config/`; onboarding copies them to `config/`.

### `config/brain.json`
```json
{
  "schema": 1,
  "user": { "name": "", "timezone": "", "languages": ["en"] },
  "plan_tier": "pro",
  "learner": { "kind": "", "detail": "" },
  "packs": ["core"],
  "self_build": { "mode": "propose", "proactive": true, "max_open_proposals": 3 },
  "evidence_mode": "light",
  "templates": { "defaults": {} },
  "git": { "auto_commit": true, "auto_push": true, "lfs_min_mb": 50 },
  "privacy": { "encryption": { "enabled": false, "tool": "git-crypt", "scope": [], "key_backup_checked": null } },
  "jobs": { "country": "", "needs_sponsorship": null, "languages": ["en"], "sources": ["adzuna", "career-pages"] }
}
```
- `user.timezone` is empty in the template. Onboarding M2 sets it from the computer's time zone after one confirmation. No script reads it; the jobs skill uses it only as a hint when it asks for the country.
- `learner` (ADR 0023) records what the user is learning or doing. `kind` is one of `mba`, `degree`, `online`, `professional` or `other`; `detail` holds the user's own words and is used only for `other`. Onboarding M2 writes it (the learner question comes right after the CV step). `other` behaves like `degree`. `learner.kind` drives the onboarding branches and the defaults below, and `packs` drives the content that is added (frameworks, the case method, business presets, MBA wording): the two are separate. Defaults by kind: `mba` and `degree` have a programme note, courses and AI-rule checks; `online` has standalone courses with a provider, a programme note only when the courses form one track, the AI-rule check only where a rule exists (otherwise `none-stated`) and class days only for courses with live sessions; `professional` has no courses, programme or AI-rule steps, with focus areas in `USER.md` and projects in `project` notes (§3).
- `packs` lists the ids of the packs switched on and is read by code (see "Packs" below). The template starts with `["core"]`.
- `templates.defaults` (ADR 0025) maps a deliverable kind (`deck`, `report`, `memo`, `letter`, `cv`, `essay`, `workbook`, `one-pager`) to the slug of the user's default template for it, for example `{ "report": "my-brand-report" }`. It is the level between a programme and the built-in template in the resolution order (§19). Absent, empty or unknown: the built-in template is used, and `vault/80_me/brand/` keeps working as the default look (§15a.5).
- `jobs.country` is an ISO 3166-1 alpha-2 code in capitals (`NL`), or `""` until the user chooses. The jobs skill asks once and saves it; the Adzuna default country and the country-pack lookup both read it.
- `school` (`name`, `programme`) is no longer in the template: the programme now lives once in a programme note (§3, "Programme notes and inheritance"). Installs made before 0.2.0 still hold the block. It is read as a fallback (below) and is removed no earlier than two releases after 0.2.0, by a migration. `school.lms` was removed with the Canvas integration: nothing reads it, and an existing key is ignored. There is no connection to a learning platform: course files arrive by download and `/ingest` (§9).
- `git.lfs_min_mb` (ADR 0020) is the size, in megabytes of 1,048,576 bytes, from which a file is stored with Git LFS (§3, "Git storage"). It is optional: when the key is absent, not a number or not above 0, the default 50 applies, and a value is kept between 1 and 95, because GitHub refuses ordinary files of about 100 MB [Unverified]. Existing installs need no migration (a documented fallback, §15a.5).
- `privacy.encryption` (ADR 0019) is written by `vault-key.mjs`, not by hand: `enabled` (true after a successful `setup`), `tool` (always `git-crypt`), `scope` (the encrypted paths, as listed in §3 "Privacy"; paths only, never key material), `key_backup_checked` (`YYYY-MM-DD` of the last successful `vault-key.mjs check`, or `null`). Code treats encryption as on when either `enabled` is true or the `.gitattributes` files carry `filter=git-crypt` (the safer reading when one of the two is missing or unreadable).

**Fallbacks for older installs.** An install made before 0.2.0 holds the older shape of `config/brain.json`, and a template change never reaches it (§15a.1). Code and skills read both shapes. In short (the file that reads each one, and its test, are in §15a.5):
- No `learner`, or an empty `learner.kind`: `mba` when `packs` lists `mba` or a `school` block exists, otherwise unknown (onboarding asks the learner question). Migration 0002 records the kind once.
- No `packs`, or one that is not a list: `["core"]`.
- A `school` block: display text only, and only when there is no programme note; it is never copied into a new course note. Migration 0003 makes the programme note and leaves the keys in place.
- An empty `jobs.country`, or `NL` with no `country-*` entry in `packs`: the pack folder for `jobs.country` is used when it exists, and the country is asked once when it is empty.
- `git.lfs_min_mb` and `privacy.encryption` absent: the defaults above.

### Packs

A pack is a folder under `system/packs/` that adds content for one kind of learner or one country; the pack id is the folder name. Everything else (courses, study, the assignment studio, notes, drafting) is core and works with no pack. `system/packs/README.md` is the maintainers' guide.

| id | folder | adds |
|---|---|---|
| `core` | none | always on; may be listed, and code ignores it |
| `mba` | `system/packs/mba/` | the frameworks library (`frameworks/`, copied into `vault/30_wiki/frameworks/`), the case method (`templates/case.md`), business critique presets (`critique-presets.md`) and MBA wording where a kind needs it |
| `country-<cc>` | `system/packs/country-<cc>/` | a country's job-search checks (`country-nl` first) |
| `twin` | `system/packs/twin/` | drafting rules and voice import; always used by `ghostwriter` and `/reply`; never listed in `packs` |

- **Selection.** `packs` in `config/brain.json` is an array of ids. An id must be a folder name (lower-case letters, digits and hyphens). There is no registry: code and skills read the array.
- **Who writes it.** Onboarding M2 (the learner question) adds `mba` for an MBA answer, takes it out only when the user moves away from an MBA, and otherwise leaves it as it is, so a pack the user switched on stays on and a confirmation changes nothing. Onboarding M6 and `/jobs` add `country-<cc>` for `jobs.country` when that pack exists and remove other `country-*` entries. `/reconfigure` re-runs those two steps and has its own row, "Switch the MBA frameworks on or off", which adds or removes `mba` and nothing else, whatever the learner kind. Migration 0002 writes it once for installs made before 0.2.0. Every writer keeps the entries it does not own.
- **Who reads it.** `onboard-seed.mjs` (copies the frameworks of every listed pack; §15), `/assignment critique` (business seats from `critique-presets.md` when `mba` is listed and the subject is business), `/jobs` and onboarding M6 (the country pack), `/menu` and `/reconfigure` (what is switched on). Switching the MBA pack on or off never changes `learner.kind` and deletes no note.
- **The country-pack contract.** A country pack is `system/packs/country-<cc>/`, with `<cc>` the lower-case ISO 3166-1 alpha-2 code (`jobs.country` holds it in capitals). It has:
  - `README.md`: the pack id, the country, the local language, what is in the pack and how to maintain it;
  - `jobs.md` (`type: "reference"`), with six fixed `##` headings in this order: **Defaults** (the Adzuna country code, sources, default regions, local language), **Onboarding questions** (asked by M6 and `/reconfigure` after the generic career questions), **Checks** (per-job checks, each with its command or file and the field it writes), **Keep rules** (added to the core scan rules; where a pack rule and a core score band disagree, the pack rule wins), **Fields** (the extra `application` fields; a name never changes once released) and **Say once** (what to say once per scan);
  - the country's reference tables as separate files (`country-nl`: `dutch-language.md`, `salary-thresholds.md`, `visa-and-sponsorship.md`, `sources.md`).
  The scripts stay in `system/scripts/jobs/`, so permission lists and the user's own copies keep working; the pack holds the data they read.
- **Resolution (the jobs skill, "Country pack").** (1) `packs` lists `country-<cc>` for `jobs.country`: use `system/packs/country-<cc>/jobs.md`. (2) Otherwise use `.claude/skills/my-country-<cc>/jobs.md`, a pack the user had built. (3) For an install whose `packs` has no `country-*` entry (an older one): `system/packs/country-<cc>/jobs.md` when that folder exists. (4) None: run the core flow without country checks, leave the pack's fields out and say once that checks for that country do not exist yet, with an offer to draft them (`/propose`).
- **New packs** are not built ahead of demand (ADR 0023). `/propose` drafts one on request as the user's own skill and never writes under `system/` (§11).

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
- Module titles are for readers only and always come from `MODULES` in `onboard-progress.mjs`: a title stored in the file is ignored, so renaming a module needs no migration (§15a.5). Aliases for `start`, `done` and the like include `projects`, `learning` and `work` (M3) and `job-search` (M6).
- The modules and the time they take:

| id | title | minutes |
|---|---|---|
| M0 | Setup | 8 |
| M1 | Identity and tone | 2 |
| M2 | You and your facts (asks the learner question right after the CV step and writes `learner` and `packs`) | 5 |
| M3 | Courses and projects (branches by kind: programme note and courses, standalone online courses, or focus areas and projects) | 6 for `mba`, `degree` and `other`; 4 for `online`; 3 for `professional` |
| M4 | Autonomy and self-build | 3 |
| M5 | Your writing voice (asks which kinds of people the user writes to, the recipient classes) | 15 |
| M6 | Career and job search (starts with the country question) | 10 |
| M7 | Email and tools | 8 |
| M8 | Look of your documents | 5 |
| M9 | Import your existing files | 10 |

  The essentials, M0 to M4, take about 24 minutes for `mba`, `degree` and `other`, 22 for `online` and 21 for `professional`. `onboard-progress.mjs show --json` adds `learner_kind` (`null` when unknown, by the fallback rule above) and `estimate_minutes { minimum, remaining }`.

### `state/migrations.json` (written only by `update.mjs finish`; tracked)
The record of upgrade scripts that have run (§15a). It lives in `state/`, not `state/local/`, so it travels with the repository to another computer.
```json
{ "schema": 1, "applied": [
  { "id": "0002-learner-and-packs.mjs", "at": "<ISO>", "tag": "v0.2.0" },
  { "id": "0003-programme-note.md", "at": "<ISO>", "tag": "v0.2.0", "kind": "guided", "outcome": "done" } ] }
```
- `id` is the file name. An entry with `"baseline": true` marks an upgrade that a fresh install already contained: it is recorded and never run or asked.
- `kind` is `"script"` (or absent: every entry written before 0.2.0 is a script) or `"guided"`. `outcome` is `"done"` or `"skipped"` (absent means `done`); only a guided entry can be skipped, and a skipped one can be run again on request. A guided baseline entry is `{ kind: "guided", outcome: "done", baseline: true }`.
- Script entries are written by `update.mjs finish`; guided entries are written by `update.mjs guided done|skip <id>` after the user has answered (§15a.2b).
- A fresh install has no such file until its first update (§15a.6). Never edited by hand.

### `state/local/update-check.json` (gitignored, never committed)
`{ "schema": 1, "checked": "YYYY-MM-DD", "latest": "vX.Y.Z" | null }`. Written by the weekly update check (`system/lib/updatecheck.mjs`, §14). A missing or unreadable file means "check now". It holds a date and a tag only.

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

**Packs.** No pack is built ahead of demand (ADR 0023). When someone wants one (a country other than the Netherlands, a field with its own frameworks), `/propose` drafts it as the user's own skill, for a country `.claude/skills/my-country-<cc>/` with a `jobs.md` that follows the country-pack contract (§10, "Packs"). It is never written under `system/`.

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

**Folder:** `vault/10_projects/<YYYY> <course-slug> <assignment-slug>/`, or `<YYYY> <assignment-slug>` when the assignment belongs to no course. A course is optional: a working professional or a self-taught learner can still write and review a report.
```
assignment.md      (type: assignment; frontmatter = the spec below)
brief.md  report.qmd  critique-<round>.md  decisions.md  reviews/<round>/<lens>.md  rubric.md  releases/
feedback.md  ai-log.md  rehearsal.md   (the last three only when they apply)
```

**`assignment.md` frontmatter:**
```yaml
type: "assignment"
course: "[[course]]"   # or "" when the assignment belongs to no course
title: ""
deadline: "YYYY-MM-DD"
deadline_confirmed: false
questions: []          # verbatim
limits: { pages: 6, font_pt: 11, line_spacing: 1.15, words: null }
deliverables: ["pdf"]  # pdf, xlsx, docx, pptx
rubric: "[[rubric]]"
team: []               # names only if the user provides them; team_name and team_number sit beside it
team_name: ""
team_number: ""
templates: []          # template slugs attached to this assignment (§19)
tone: ""               # academic | professional | conversational, or empty to inherit
voice_mode: ""         # me | team, asked once for a group deliverable
grade: ""              # as given, filled when the grade comes back
feedback: ""           # link to feedback.md
lenses: ["devils-advocate", "premortem", "board", "specialists", "grader"]
stop_rule: { target_grade: 9, plateau_rounds: 2 }   # target_grade is on the 10-point scale, converted from the course's own scale (default 9; a pass/fail course gets 7)
status: "setup"        # setup, brief, draft, critique, final, shipped
```

**Subcommands:** `new`, `brief`, `draft`, `critique`, `ship`, `feedback`. `new` is the interview: it asks which course (or none), reads the AI rule from the course note, and asks for the target grade in the course's own scale. For a course with no note it writes one by the short form of the course procedure (§0 and §3 of `.claude/skills/course/references/course-setup.md`) and offers the full course setup at the end. Extensions are in `system/blueprints/assignment-extras.md`.

**Coursework notice** (rule 6 of `core.md`). It reads the course note's `ai_policy` only: a rule taken from a programme was copied into the course at setup, and the course's own rule wins (§3, "Programme notes and inheritance"). If the policy is `restricted`, `banned` or `unknown`:
- warn once per assignment in plain words;
- ask whether to continue;
- proceed if yes.

**Never** write the consent anywhere tracked by git. If needed, use `state/local/` only. If the policy is `allowed-with-disclosure`, draft a disclosure paragraph for the user. If it is `allowed` or `none-stated`, or the assignment has no course, say nothing.

**Case date and the hindsight rule.**
- A case note carries `case_date` (the date the case is set). `/assignment critique` copies it into the round card (`review-round`, `case_date`, or "none" when the work is not a case).
- **Hindsight rule:** applies only when the round card carries a `case_date`. Every lens and the consolidation then use only facts that were knowable on that date. Later facts go under "Outside the case" (or "for class only" in the consolidation) and never drive an attack, a grade or a decision. For work that is not a case, "Outside the case" is n/a.

**Review notes block.** `/assignment draft` puts the page plan at the very top of the body of `report.qmd` in a block that starts with `::: {.content-hidden` and ends with `:::`. Quarto does not print it, and the lenses ignore it (with the YAML front matter) because it is review notes, not graded text. The consolidation reads it.

**Lens prompts** live in the one core library `.claude/skills/critique/references/lenses/*.md` (ADR 0026), written for any subject (assessor, intended reader, subject expert, referee, editor) and shared by `/critique` and `/assignment critique`. A lens's front matter names its `helper`, the `deliverables` it suits, what it `needs` (`rubric`, `workbook`, `voice-profile`) and its `panels` (`full`, `quick`). The lenses are: devil's advocate, premortem, board, specialists, grader (only with a rubric), fact-check, structure (Minto and SCQA, MECE, storyline, action titles, the template's house rules), signature (sounds like the user's voice profile, has story and stakes), production (layout and consistency across files, needs rendered pages), model audit (workbooks), recruiter (CV and cover letter), and the consolidation pass (full panel only). `lens-choice.md` picks lenses by deliverable type.
- The assignment, rubric, decisions and critique templates are in `system/templates/notes/`; the case template is in the MBA pack.
- Business presets (board seats and specialist examples for business subjects) are in `system/packs/mba/critique-presets.md`. The round card uses them only when `packs` lists `mba` and the subject is business.
- **One panel procedure, `.claude/skills/critique/references/panel.md`,** is followed by `/critique` (any file) and `/assignment critique` (an assignment: round id `<n>`, storage `reviews/<n>/`, target `critique-<n>.md`, grader and stop rule apply). For any other deliverable the round id is `<YYYY-MM-DD>-<n>` and the reviews and critique sit in the deliverable's folder (a file outside the vault gets a vault project folder after one question). A deliverable that sits in an assignment folder always goes to `/assignment critique`.
- **Quick panel** (two or three lenses, the cost-aware choice on Pro) is read and merged by the main session; **full panel** (never more than seven lenses without the user asking) is consolidated by `helper-judgement`. The skill says the usage cost plainly on Pro before running.
- Each lens runs as `helper-review` with paths only (the round card lists every file, the rendered page PNGs and the workbook check output), blind to the other lenses, read-only. The `lens` agent is deprecated (§8). A user's copy of a lens brief or `lens-choice.md` that says `lite` is read as `quick`.
- **Feedback step (H1).** `/assignment feedback` runs when a grade or feedback comes back: it saves it word for word in `feedback.md`, fills `grade` and `feedback` on the assignment, updates "How this instructor grades" in the course note and offers a `/learn` lesson. `/weekly-review` asks about returned work.
- **Team from the course (C8).** The team is recorded once per course (`team`, `team_name`, `team_number`) and reused for covers, title slides and file names; an assignment note can override it. A "[Teammate name]" placeholder never ships. For group work `/assignment new` asks one question per deliverable, "sound like you, or a neutral team voice?" (`voice_mode`).
- **AI-use log (C12, optional).** For a course with `ai_log: true` (offered, never forced) every working step adds one dated line to `ai-log.md`; `ship` offers a clean copy in `releases/`.
- **Sources that disagree (C9).** When two sources give different deadlines, weights or limits, the skill shows both and asks; it never chooses silently. Pasted assignment text is saved word for word under `## Assignment text (as given)`.
- **Delivery gate at ship.** `ship` views every page, then runs the delivery gate (`system/deliverables/delivery-gate.md`, `deliver-check.mjs`, §19) before the submit task, and offers the critique panel and, for a deck, the rehearsal pack once. Drafting follows `principles.md` and `tone-and-voice.md`; a rubric or template that prescribes a structure wins.

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
| `session_start.mjs` | SessionStart | Runs `git-auto pull` (5 s budget). Emits a compact digest as additional context: date/time; onboarding status (incomplete → suggest `/onboard` after handling the user's request); counts of overdue/today tasks, outbox drafts and open proposals; warnings (model not sonnet, Claude Code version below minimum, git problems). **After-class nudge:** between those lines and the warnings it adds up to 3 lines "New material? <course> had class on Tue 13 Oct. Say 'add to <course>' and give me the slides or your notes." (one per active course whose class has ended since the user was last told; more than 3 courses give one summary line; most recent class first; skipped on `compact`). `system/lib/courses.mjs` (`planNudges`) reads `vault/20_areas/courses/*/course.md` with `status: "active"` and counts a class date when it lies in the last 14 days and is strictly before today, or is today and the local time is 18:00 or later, and it is later than the note's `created` date. Dates come from `session_dates`, or, when that is empty, are generated from `class_days` between `term_start` (if given) and `term_end`; without `term_end` generation stops 16 weeks after `term_start`, or after `created` when there is no `term_start`, and a schedule with none of the three is not generated. It reads at most 60 notes, 8 KiB each, starts no process, and takes only the room left of the 25 lines after the other lines and the warnings, so it never pushes a warning out; any failure gives no lines. What was said is kept in `state/local/course-nudges.json` (below), written by `commit()` only after the digest has been delivered, so a digest that fails to build writes nothing. When encryption of private notes is on (ADR 0019) it adds one warning line if this copy is locked or git-crypt is missing (with the unlock or install command), and, while the copy works, one reminder line if `privacy.encryption.key_backup_checked` is `null` ("Your vault key backup has not been tested. Run the key check"). With encryption on it also keeps git's upload check in place (`ensurePrePushHook`: one small file is read when the hook is already right, and it is written or refreshed otherwise) and adds a warning line only when the hook file belongs to another tool or Git uses a shared hooks folder. **Weekly update check (ADR 0027):** after the proposals line it adds at most one line, "Alterbrain vX is available. Say 'update Alterbrain' when you're not mid-assignment.", when the last check in `state/local/update-check.json` is 7 or more days old and GitHub's latest public release tag of the repo named in `system/release.json` is newer than the installed tag. It asks once with a short timeout, never applies anything, and is silent when offline or on any error (the next session tries again). It is skipped in developer mode and on a `compact`. **Routines line (ADR 0030):** after the course nudge and before the warnings it adds at most one line when active routines are overdue: "<Name> has not run since <weekday date>. Check the Claude app's Routines page, or say 'check my routines'." (a never-run routine: "<Name> has not run yet (set up <date>)."), or, for several, "<n> routines are overdue: say 'check my routines'." It reads the notes in `vault/90_routines` only, takes only the room left of the 25 lines so it never pushes a warning out, fails open, and is skipped on `compact`. `ALTERBRAIN_UPDATE_CHECK=off` turns it off and `ALTERBRAIN_UPDATE_CHECK_URL` replaces the address (tests only). `/update-alterbrain` stays manual at any time. |
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
| `doctor.mjs [--json] [--ci]` | Checks Node ≥ 20, git, git-lfs (`git-lfs`; needed only for files of `git.lfs_min_mb` or more, and the message names the limit), the size of the saved history (`repo-size`, from `git count-objects -v`; Git LFS files are not counted; an `ok` with a `tip` from 1 GB, `warn` from 4 GB, both Alterbrain's own levels), the big-file check for Obsidian Git (`big-file-hook`: `warn` when the `pre-commit` hook is missing, out of date, another tool's, or shadowed by `core.hooksPath`), saved ordinary files that GitHub would refuse (`big-blobs`: `fail` when a commit not yet online holds one of 95 MiB or more), gh auth, origin remote, Quarto (optional), Obsidian config, Claude Code version (`claude --version` if on PATH; minimum in `system/release.json`), `.claude/settings.json` model, onboarding state, vault skeleton, manifest integrity (sha of code files), `validate.mjs`, `.mcp.json` validity, `uv` when a configured connection needs it, disk space. When encryption of private notes is on (not in `--ci`): git-crypt installed (`encryption-tool`), this copy unlocked (`encryption-unlocked`), nothing in the encrypted paths stored as plain text (`encryption-files`), the upload check installed (`encryption-push-hook`: `warn` unless the `pre-push` hook is active), key backup tested (`encryption-backup`). The `git-lfs`, `repo-size`, `big-file-hook`, `big-blobs` and encryption checks look at one computer, so `--ci` skips them. Each failure prints one-line fix advice. A check that is fine but comes with advice (`repo-size` from 1 GB) keeps status `ok`, gets an optional `tip` field in `--json` and prints a `Tip:` line; it is not counted as a problem. **v0.2.0 checks (both machine checks, skipped in `--ci`):** `git-in-progress` warns about a half-finished rebase or merge (`rebase-merge`, `rebase-apply`, `MERGE_HEAD`), which stops the automatic save, and names `git rebase --abort` or `git merge --abort` as the fix, never a reset; `pdf-pages` reports whether `pdftoppm` is installed and, when it is not, gives an optional tip (never a warning). `obsidian-config` also gives a tip when `app.json` exists and `showUnsupportedFiles` is not true. **Routines check (machine check, skipped in `--ci`):** `routines` is `ok` with no routines or when all are healthy, and `warn` (never `fail`) for an overdue active routine, an invalid note or an unreadable one, with a plain fix (§3a). |
| `validate.mjs [--json] [--release] [--write-manifest [--sign-key <pem>]]` | Lints skill and agent frontmatter (required keys, allowed values, name = folder), the routing file, the catalogue schema (and that the Risk column of `MCP-CATALOGUE.md` matches `tos_risk`), blueprint sections, and the `Adapted from` line in every file `UPSTREAM-SYNC.md` lists as adapted. **The migration lint (§15a):** each file in `system/scripts/migrations/` has a name `NNNN-short-name.mjs` with a unique four-digit prefix, a `// ab-migration:` line within its first three lines and, when a `tests/` folder exists, a test `tests/scripts/migrations/<name>.test.mjs`; a file there that is not `.mjs` (a `README.md` aside) is a warning, because `update.mjs` would never run it. **Release notes:** every upgrade script is named under `### Upgrades` in `CHANGELOG.md`; every framework file of the previous release (read from the manifest at the newest `v*` git tag) that is gone now is listed under `### Moved`; every ADR cited in the rules, lib and scripts exists in `docs/adr/`; and this SPEC mentions `state/migrations.json`. These are warnings while developing. `--release` makes them errors, and `--sign-key` implies it, so nothing is written or signed while they stand (a plain `--write-manifest` is never blocked). `--write-manifest` regenerates `system/manifest.json` (release tooling). **v0.2.0 lints:** guided migrations (file name, a number shared with the `.mjs` scripts, front matter, the six sections in order, a `### Upgrades` line for every `.md` stem); the helper lint (§6: an error for framework text, a warning for `my-*` skills); each routing class's `helper` exists as an agent with the same model and effort; lens front matter keys (`helper`, `deliverables`, `needs`, `panels`); an unpinned package may be pinned by a `git+…@<40-hex commit>`. |
| `ingest.mjs` | §9 |
| `routines.mjs list|overdue|show <name> [--instruction]|record <name> --result "<text>"|suggest|enable <suggested-name> [--user-asked] [--json]` | The routine registry (§3a, ADR 0030). **list** and **overdue** read `vault/90_routines`; **show** prints one note (`--instruction` prints only the host instruction); **record** sets `last_run` and `last_result` (line endings kept, atomic write, result cleaned and cut at 200 characters) and refuses an unknown name; **suggest** lists templates from `system/templates/routines/` the user has not created; **enable** creates a note from one (status `active` only with `--user-asked`, otherwise `suggested`; never overwrites). Exit 0 ok, 1 findings or refusals (an overdue or invalid routine, a note that cannot be read as a routine, an unknown name), 2 usage error. |
| `tasks.mjs add\|list\|done` | §4 |
| `mcp-gen.mjs [--dry-run]` | `config/mcp.selected.json` + `system/catalogue/mcp.json` → `.mcp.json` (wraps `npx` as `cmd /c npx` on Windows; `${VAR}` placeholders only) |
| `git-auto.mjs pull\|commit\|push\|status` | Never forces, never stashes, never rewrites history. `pull` saves local changes as a commit first, then runs `git pull --rebase --no-autostash` when an origin exists; a join that cannot be done cleanly is aborted and changes nothing. `commit` = big-file routing (§3, "Git storage") + `git add -A` + `git commit -m "auto: <date time> · <n> files"`, retried 3× on `index.lock`; a file that looks like it holds a password or key is taken out and a task says so. `push` = `git lfs push origin <branch>`, then `git push` (setting the upstream the first time); a rejected push joins the newer online copy with the same rebase and tries once more. `push` refuses first (kind `big-blob`) when a commit not yet online holds an ordinary file of 95 MiB or more. `push --background` (or `ALTERBRAIN_PUSH_BACKGROUND=1`) starts an upload with 16 MiB or more of Git LFS data waiting as a separate process, `--background-now` (or `=now`) does so whatever the size, and `--detached` is that process itself (lock `state/local/lfs-upload.lock`). Failure kinds that add a task: `conflict`, `auth`, `rejected`, `storage` (GitHub has no room for the big files; its wording is [Unverified]), `big-blob`, `lock`, `identity`, `other`; `network` and `timeout` are only logged, because the next save tries again. Skips when dev mode or `git.auto_commit` is false. On every run outside developer mode it installs or refreshes the `pre-commit` big-file check (§3, "Git storage"). Two internal commands are not in the usage line: `pre-commit` (run by that hook file; exit 3 means "the big files were the only thing in this save") and `hook` (install or refresh it). When encryption of private notes is on, `commit` and `pull` (which saves before joining) keep encrypted paths out of a copy that cannot encrypt and take out plain private notes, and `push` runs the fail-closed check described in §14 (`session_end.mjs`). `status` reports a locked copy, the state of the big-file check (`info.big_file_check`: `active\|missing\|foreign\|hooks-path\|error`) and whether a background upload is running (`info.upload_running`). |
| `setup-github.mjs [--name <repo>] [--dry-run] [--detach-only]` | Checks `gh auth`. If origin points to a repo that is not the user's own (normally the public Alterbrain repo), records the old origin in `state/release-origin.json` and removes it. Requires Git LFS (it stores files of 50 MB or more; everyday documents do not need it) and runs `git lfs install --local`. Installs the `pre-commit` big-file check (step `big-file-check`; §3, "Git storage"). Makes the first commit with `commitAll`, which holds back files that look like secrets and sends big files to Git LFS; files that could not be stored stay on this computer and are listed in the step `held-back-big`. Runs `gh repo create <name> --private --source . --remote origin --push`. `install.ps1` and `install.sh` also run `git-auto.mjs hook`. `--detach-only` needs no sign-in: it only records and removes the public Alterbrain origin (used in onboarding M0 when the user skips the backup). |
| `obsidian-setup.mjs` | Writes `vault/.obsidian/{app,core-plugins,community-plugins}.json`. Downloads pinned community plugins from `system/catalogue/obsidian-plugins.json` (GitHub release assets, sha256 verified) into `vault/.obsidian/plugins/<id>/`. `app.json` also gets `showUnsupportedFiles: true` so Word, PowerPoint and Excel files show in the file list. [Unverified] Obsidian publishes no reference for `app.json`; the key name comes from community plugin sources. Re-running the setup adds it to an existing vault, and the user reopens the vault once. |
| `update.mjs check\|plan <tag>\|apply-safe <tag>\|finish <tag>` | Reference-based update (plan §Update model). Reads the release via `gh api` or the GitHub HTTPS API. **Migrations (§15a):** the verified release manifest lists the upgrade scripts with their sha256. `plan` returns `migrations_pending: [{ id, summary }]` (the summary is the script's `// ab-migration:` line) for the scripts the install has not recorded, and prints them under "Upgrades to your notes and settings (run at the end)"; scripts a fresh install already shipped with come back as `migrations_baseline` and are not listed. `apply-safe` makes the restore tag `pre-update-<tag>` and refuses, before it changes any file, when the plan has upgrades and no tag can be made (`no_restore_point`). `finish` runs the pending scripts once each, in name order, after the restore tag, only when the manifest lists them with a matching sha256, and records each in `state/migrations.json`; it stops at the first exit 1. It returns `safety_tag`, `migrations_run` and `migration_notes` (what each run changed, printed under "Upgrades run:"); a script on disk that the manifest does not list, or whose checksum differs, is not run, is returned in `migrations_skipped`, and makes `ok` false. **Guided upgrades (§15a.2b):** `plan` and `finish` return `guided_pending` (the guided upgrades the verified release manifest lists, that the install has not answered, and that are not baseline); `plan` prints "Upgrades I will ask you about after the update"; `finish` adds one deduplicated `#ab/update-alterbrain` task and never runs a `.md` file. `update.mjs guided list [--all] [--json]\|savepoint [--json] [--no-commit]\|done <id>\|skip <id>` lists them, confirms or makes the restore point, and records the answer in `state/migrations.json`. `apply-safe` and `finish` refuse without a restore point when any guided upgrade is pending. |
| `slop-check.mjs <file> [--lang en]` | Port of COG slop-gate (MIT): hard tells fail on one hit, filler fails at three or more; quotes and code are stripped. Non-English: only language-neutral checks. |
| `voice-stats.mjs <file...> [--lang]` | Port of COG voice-baseline idea: sentence length distribution, openers, punctuation, top phrases, watch-list rates → JSON used by onboarding M5 and `edit-voice`. |
| `qmd-prerender.mjs <note.md> [--out]` | Obsidian note → `.qmd`: resolve wikilinks to text, inline embeds, convert callouts to Quarto callouts, strip Obsidian-only syntax. |
| `jobs/adzuna.mjs` | Adzuna search in any country Adzuna offers (keys from `.env.local`; rate-limited, with a daily counter). The country is `--country`, else `jobs.country` from `config/brain.json`, else `nl`. The `dutch` field and the Dutch line appear for `nl` only; a salary in another country prints without a currency name; HTTP 400 or 404 gives a plain "Adzuna may not offer this country" message [Unverified: Adzuna's real reply for an unsupported country] |
| `jobs/ind-sponsors.mjs` | IND recognised-sponsor register download, cache and lookup; `thresholds` prints the salary table from `system/packs/country-nl/salary-thresholds.md`. An edited copy left at the old place, `system/packs/mba/jobs-nl/salary-thresholds.md`, is named in `note` and `old_copy` and is not read (a documented fallback, §15a.5) |
| `onboard-seed.mjs [--dry-run]` | Onboarding M0 and M2: copies the vault skeleton, config defaults and identity templates into place, never overwriting an existing file; fills `{{date}}` and `{{title}}`. **Pack-driven frameworks:** copies `system/packs/<id>/frameworks/*.md` into `vault/30_wiki/frameworks/` for every id in `config/brain.json` `packs` except `core`. Ids that are not folder names (`^[a-z0-9-]+$`) are ignored; a listed pack whose folder is missing is reported and the exit code is 1; an unreadable `brain.json` means core only, with one line saying so (§10, "Packs") |
| `onboard-progress.mjs` | Reads and writes `state/onboarding.json` (section 10). Module titles always come from the code, never from the stored file; `show --json` adds `learner_kind` and `estimate_minutes` |
| `proposals.mjs` | Reads and writes `state/proposals.json` and counts open proposal cards (sections 10 and 11) |
| `built.mjs` | Reads and writes `state/built.json` (section 10). `remove <name> --delete-files` also deletes the entry's `my-*` skill folders and agent files, and nothing else |
| `rate-guard.mjs status [--all] [--json]` / `reset-throttle <server>` / `clear-draft-only <server>` / `repair-ledger` | `status` shows used-of-cap per category for each rate-limited server that is switched on or has been used (exit 1 on a pause, draft-only, an unknown outcome to check, or a damaged file). The other three lift a safety stop or repair a file, so they are not on the allow list: Claude asks first |
| `date.mjs [--plus N] [--from YYYY-MM-DD] [--now] [--weekday] [--iso-week]` | Local date and time from the system clock (the same clock as the session digest). Skills use it instead of `node -e` and never use the UTC date |
| `check-json.mjs <file>...` / `--length <file>` | Checks that edited settings files still parse, or counts the characters of a file (USER.md limit) |
| `ingest-pending.mjs` | Lists files that `ingest.mjs` copied but that have no source note yet |
| `template.mjs list\|show <slug>\|resolve --kind <kind> [--for <source>]\|check <folder>\|inspect <file>` | Templates (§19; shared logic in `system/lib/templates.mjs`). **list** shows the built-in and the user's templates; **show** prints one `template.yml`; **resolve** returns the template that applies (`template`, `level`, `tone`, `tone_source`, `max_upload_mb`, `csl`, `house_rules`, `warnings`, and `tie` with `tie_level` when two candidates of the kind sit at the same level, in which case `template` is null and the caller asks); **check** validates a template folder and prints notes (for example a `reference_doc` whose format is not in `outputs`); **inspect** reads a `.pptx`, `.potx`, `.docx` or `.dotx` through `system/lib/ooxml.mjs` and lists the theme colours, fonts and slide layouts, and which of the seven layout names Quarto needs are missing. Read-only. Exit 0/1/2. |
| `release-scan.mjs <file...> [--json]` | Fails on bracket honesty labels (`[Inference]`, `[Unverified]`, `[Speculation]`, `[FACT NEEDED …]`, in any case), working citations (`[Source:`, `[[wiki links]]`) and placeholders (`[Teammate name]`, `[Company]`, `[Role]`, `XX%`, `___`, `Lorem ipsum`, `Click to add title`, a bare `{{name}}`) in anything that leaves the computer. Reads `.md`, `.qmd`, `.txt` (the front matter too, because the title, author and date are printed), `.docx`, `.pptx` (slides and speaker notes), `.xlsx` (text cells) by unpacking the XML with the computer's `tar` (`system/lib/ooxml.mjs`, as `ingest.mjs` does), and `.pdf` through `pdftotext`. A file it cannot read is reported "NOT CHECKED" and exits 1: it never counts as clean. Exit 0 clean, 1 found or not checked, 2 usage. |
| `deliver-check.mjs <file...> [--max-mb N] [--base-name] [--name-pattern <regex>] [--source <file>]... [--allow-titles <regex>] [--skip-checks a,b] [--json]` | The mechanical part of the delivery gate (§19): the release scan, upload size, a shared base name and a file-name rule, workbook errors, and for decks (`.pptx` and deck `.qmd`) slide titles that are sentences (four or more words, at most 90 characters) and a source line on data slides. `--source` checks the source a PDF was made from; `--allow-titles` and `--skip-checks` waive a check that a rubric or template contradicts, and every waiver is listed in the output and must be told to the user. The label scan cannot be skipped. Exit 0/1/2. |
| `workbook-check.mjs <file.xlsx> [--recalc] [--json]` | A light, zero-dependency workbook check: unpacks the `.xlsx`, lists the sheets and flags error cells and formulas with no stored value (blocking), and lists numbers typed inside formulas as advice only. `--recalc` recalculates a copy through Excel on Windows when Excel is installed and not already open; it says plainly when it cannot run. What a script cannot judge belongs to the model-audit lens. Exit 0/1/2. |
| `pages.mjs pdf <file.pdf> [--pages 1-12] [--dpi 80]\|export <file.pptx\|.docx\|.xlsx> [--to pdf]\|check` | Makes pages Claude can look at. **pdf** renders PNGs with `pdftoppm` (Poppler) into `state/local/tmp/pages/<sha8>/`; **export** makes a PDF copy of an Office file (PowerPoint, Word or Excel through PowerShell COM on Windows, constants 32, 17 and 0; AppleScript on macOS [Unverified]; otherwise LibreOffice headless with a plain warning that fonts and line breaks may differ); an Office app that is already open is not used. The original is never opened for writing. **check** says which of these tools the computer has. Exit 0/1/2. |
| `people.mjs due [--within N] [--json]\|list [--tag t] [--json]` | A read-only view of `vault/60_people` (ADR 0028). **due** lists people whose `next_follow_up` falls on or before today plus N days (default 7) or whose `cadence` has run out since `last_contact` (30, 91, 182 and 365 days); a person is listed once with every reason. `dnc` is read fail-closed: `true`, `yes`, `y`, `1` and `on`, and any value it does not recognise, keep the person out and are reported. A bad date, an unreadable note, a git-crypt locked note (unlock the vault first) or more than 2,000 notes (16 KiB read per note) is a problem: exit 1, the list is still printed. Exit 0/1/2. |
| `vault-key.mjs status\|setup\|export\|check\|unlock [--json]` | Optional encryption of the most private notes with git-crypt (ADR 0019; shared logic in `system/lib/vaultkey.mjs`). **status**: is it on, is git-crypt installed, is this copy unlocked (`<git-dir>/git-crypt/keys/default` exists and git's `filter.git-crypt.clean` is set; the git dir comes from `git rev-parse --git-dir`), and is every tracked file in an encrypted path stored encrypted in the index (each blob's first bytes are compared with the git-crypt header `\0GITCRYPT\0`; git-crypt's own output is not parsed), and is the upload check installed. The text output has an `Upload check ... installed` line; `--json` has `pre_push_hook` (`active\|missing\|foreign\|hooks-path\|error`, or `null` while encryption is off) and the problem ids `push-hook-missing`, `push-hook-foreign`, `push-hook-shared-folder` and `push-hook-error`, and `status` exits 1 until they are fixed. **setup**: needs git-crypt (found as described under "Finding git-crypt" below; if missing it prints the one install command per OS, says to run the command again and to restart the app only if the tool is still not found, and exits 1; it never downloads anything); refuses while `origin` is still the public Alterbrain repo, and when the folder already holds notes encrypted with a key that is not on this computer; runs `git-crypt init` if there is no key; writes the three attribute files and commits them alone before any private file is touched; stages existing encrypted-path files again (`git add --renormalize`) so the next commit stores them encrypted; installs the upload check (see the `git-hooks/pre-push.mjs` row); verifies with the status check; records `privacy.encryption` in `config/brain.json`; idempotent. If another tool owns the hook file or Git uses a shared hooks folder, setup still succeeds (encryption works), prints a `Warning:` line and leaves that hook alone. **export `--out <file> [--password] [--overwrite]`**: refuses an `--out` inside the project (real-path check, links included) or an existing file; runs `git-crypt export-key` to a temporary file in `state/local/tmp/` (overwritten and deleted in all paths); with `--password` asks twice for a password of at least 10 characters and writes JSON `{format:"alterbrain-vault-key", v:1, kdf:{name:"scrypt", N:2^17, r:8, p:1, salt}, iv, tag, ct}` (base64; scrypt then AES-256-GCM, 12-byte IV, extra data `alterbrain-vault-key-v1`), then reads the file back and compares. Default `--out`: `<home>/Documents/Alterbrain/vault-key-<folder>.key` (`.abkey` when wrapped). **check `--key <file>`**: the recovery drill; opens the copy (asking for the password if wrapped), compares its sha256 with the local key, prints "Your key backup works" and records `key_backup_checked`. **unlock `--key <file>`**: for a new computer; saves other changes first (git-crypt wants a tidy folder), unwraps to a temporary file, runs `git-crypt unlock`, deletes the temporary file, verifies, and installs or refreshes the upload check (also when the copy was already unlocked). Passwords are never read from arguments, environment variables or piped input: without a keyboard the script refuses with "Type the password in your own terminal window, not through Claude. Run: node system/scripts/vault-key.mjs …". Key bytes and passwords are never printed or logged. Exit 0 ok, 1 problem or refusal, 2 usage. **Finding git-crypt** (`resolveGitCrypt`, remembered per setting): `ALTERBRAIN_GIT_CRYPT` if set (another executable or a `.mjs` stand-in; tests only); otherwise the search path, then `%LOCALAPPDATA%\Microsoft\WinGet\Links\git-crypt.exe`, then every `%LOCALAPPDATA%\Microsoft\WinGet\Packages\AGWA.git-crypt_*\git-crypt.exe` (found by listing the folder, because the part after the underscore differs between computers), then `/opt/homebrew/bin` and `/usr/local/bin` on a Mac. A program that was open during a winget install does not see the new search path until it restarts, so no restart is needed. Only the per-user winget folder is searched, not a machine-wide install. The version is read from standard output or standard error. |
| `git-hooks/pre-push.mjs <remote name> <remote address>` | The upload check (ADR 0019): run by Git itself through the hook file `.git/hooks/pre-push`, so it covers Obsidian Git and every other Git tool on a computer. The hook file is written by `vault-key.mjs setup` and `unlock` and kept in place by `session_start.mjs`; its text and the helpers (`prePushShim`, `classifyPrePush`, `prePushHookStatus`, `ensurePrePushHook`, `auditCommits`) are in `system/lib/vaultkey.mjs`, and the hook finds the script at run time as `<repository top>/system/scripts/git-hooks/pre-push.mjs`. Git sends `<local ref> <local sha> <remote ref> <remote sha>` lines on standard input. **Exit 0** when encryption of private notes is off, when nothing would be sent (a deleted branch sends no commits), or when every commit is clean. **Exit 1** with one plain line on standard error that starts `Alterbrain stopped this upload` (`PUSH_REFUSED_PREFIX`), and one deduplicated high-priority `#ab/git` task (the same text the automatic save uses) when a commit it would send holds a file in an encrypted path without the git-crypt header. It **fails closed**: if node or the script is missing, or an object cannot be read, nothing is uploaded. It audits only what this computer would add: a named remote excludes commits its tracking branches already hold, a bare address counts every commit, and a merge commit is read with `git diff-tree -c`, which lists only files that differ from every parent, so notes another device already put online do not block a push. Stored files are read in bounded memory (`BLOB_READ_LIMITS`: groups of at most 64 MiB; a file over 8 MiB by its first bytes only), and a commit id that does not exist is an error, not a clean result. After its own check the hook file runs `git lfs pre-push "$@"` with the same input, because Git LFS keeps its upload step in the same file. As the standard LFS hook does, it exits 2 with a message that starts `Alterbrain stopped this upload` when `git-lfs` is not on the hook's PATH and the folder uses Git LFS (a non-comment `filter=lfs` line in any `*.gitattributes`, tracked or not, or `filter.lfs.clean` in the folder's own Git settings). The hook file remembers the absolute path of the node that wrote it, used only when `node` is not on the hook's PATH (a desktop app may not have it). Only an empty, absent, own or standard Git LFS hook file is written over; any other hook is `foreign` and a `core.hooksPath` setting means nothing is written (`hooks-path`): both are reported by `status`, `doctor` and the session digest, never changed. It cannot cover a phone: Git on a phone runs no hooks. |
| `system/quarto/tools/render.mjs` | `render <src> --type cv\|cv-ats\|letter\|report\|deck`, `scaffold <type> <folder>`, `types`; options `--out`, `--name`, `--release`, `--max-pages`, `--pdf`, `--brand`, `--json`. Used by `/render` and `/assignment ship`. Its helpers are `explain.mjs`, `fonts.mjs`, `lib.mjs` and `pagecount.mjs` in the same folder. **Page count:** `pagecount.mjs` reads page trees stored in Flate-compressed object streams (LuaTeX, pdfTeX) as well as plain ones (Typst), with `node:zlib` only. **Document's own format:** unless `--format` is given, a `format:` key in the document that names a format provided by a Quarto extension in `_extensions/` next to it (or in the `--template` folder) is used instead of the type's default, and the result says so in one note (`result.format` always holds the format used); a hyphenated name (extension-style, such as other-pdf) that is neither ours, built into Quarto nor provided stops with a plain message, while any other name (commonmark_x, epub3, gfm-raw_html) is left to Quarto, which reports an unknown one itself; a document with no `format:` gets the Typst default. The renderer does not call the template resolver for this **v0.2.0:** `--template <folder>` (the resolved template; `/render` takes it from `template.mjs resolve`), `--reference-doc <file>` (a `.docx` or `.pptx` whose styles Word or PowerPoint output copies) and `--csl <file>`. Brand order: `--brand`, then the template's brand, then the existing default choice (`vault/80_me/brand/`). A template's Quarto extension is staged beside the built-in ones and never overwrites one. The renderer does not call the resolver itself: the skill resolves silently and says in one line which template it used. |

---

## 15a. Updates and migrations (ADR 0024)

A release replaces framework files. A person's own data (`config/`, `vault/`, `state/`, their `my-*` skills and agents) stays as it is, so a change to its shape reaches existing users only through an upgrade script (a "migration") or a fallback in code. This section is the contract for both.

### 15a.1 The policy (binding)

Any change that alters the shape of user data or config ships in the same release with (a) a migration: a script (idempotent, safe to re-run, plain-language output, exit 0 or 1, tested on fixture vaults) or a guided migration (§15a.2b); or (b) an explicit, documented fallback.

- **Script or guided (ADR 0027).** Scripts are only for mechanical must-do fixes: a removed id, a renamed key, a retired path. Anything that needs judgement about the user's own content is guided: the user's own Claude evaluates their vault after the update, proposes what makes sense, applies only what the user approves, and the user can skip it or ask again later. Migration 0003 (a programme note from the school settings) is the model case, and 0006 (the brand folder as a template) the second.

- **Shape means** keys or allowed values in `config/*.json`; frontmatter keys or values in vault notes; vault folders; `state/*.json`; the ids in `config/mcp.selected.json`; and a framework path that the user's own files (`my-*` skills and agents, notes) point to.
- **A documented fallback** is one sentence in this SPEC that names the old shape and the file that still reads it, plus a test for it (§10, "Fallbacks for older installs", and §15a.5).
- **Expand, then contract.** A release reads both shapes. The old shape is removed no earlier than two releases later, and by a migration.
- **A template change never reaches existing users.** The templates in `system/templates/` are copied once, at onboarding. A changed template, skill, pack or catalogue entry changes no note, setting or state file that exists already.
- **The summary sentence is true for everyone who sees it.** The plan shows every script the install has not recorded, so a migration that applies to only some people says so ("If you started on Alterbrain 0.1, ...").
- **Release notes.** The CHANGELOG names each migration under `### Upgrades` and lists each moved or removed framework file under `### Moved`. `validate.mjs --release` is the gate (§15).
- **Where the rule is kept.** `.claude/rules/framework-dev.md` ("Changing user data or config (migrations)") has the developer's version and `.claude/rules/migrations.md` points to it from the folders where shapes change. The decision is ADR 0024.

### 15a.2 The script contract

- **Where and what.** `system/scripts/migrations/NNNN-short-name.mjs`: four digits, ascending, never renamed, edited or deleted once released. Code class, listed in `system/manifest.json` with its sha256. Line 1 is `#!/usr/bin/env node`. Line 2 is `// ab-migration: <one plain sentence>`, which the update shows the user before they agree. Only `.mjs` files run; a `.md` file in the folder is a guided migration and is never run by a script (§15a.2b).
- **Helpers (`system/lib/migrate.mjs`).** `runMigration(fn)` calls `fn({ root, dryRun, report })`, prints the reported sentences and sets the exit code. `MigrationStop` is an error with one plain sentence (exit 1). `readJsonFile` ignores a byte-order mark and stops the upgrade on a file that is there but unreadable (`unreadableSettings`). `writeFileAtomic` and `writeJsonAtomic` write a temporary file and then rename it, retrying 3 times, 100 ms apart, when another program holds the file. `setFrontmatterLine` changes one key of a note's front matter and nothing else. In a dry run the write helpers do nothing.
- **Behaviour.** Idempotent, and does nothing on data already in the new shape. Safe to re-run after a partial failure. Self-contained: it never reads templates or other framework text that a later release may change (it carries what it needs, such as the text of a new note). It changes structure only, never the user's prose.
- **Scope.** It touches only `config/`, `vault/` (never `40_sources/raw/`) and `state/` (never `state/local/rate-guard/`), and adds tasks only through `system/lib/tasks.mjs`. It never writes `.env.local`, `.mcp.json` (except by running `mcp-gen.mjs`), `.claude/settings*.json`, `my-*` skills and agents, or framework files; it may only report on them, with a task. It never opens an encrypted path while the copy is locked: it exits 1 instead.
- **Output and exit codes.** One plain UK English sentence on standard output for each thing this run changed, or exactly `Nothing to do.`. `--dry-run` writes nothing and starts each sentence with `Would: `. Exit 0 when done or when there was nothing to do; 1 when it could not finish (one sentence on standard error, nothing half-written); 2 for a wrong command line. It never exits 0 after skipping work it should have done: a file it could not read or check is said out loud and gets a task, not "Nothing to do."
- **Tests.** `tests/scripts/migrations/<id>.test.mjs` per script, on the fixtures in `tests/fixtures/migrations/` (`v0.1.0`, `v0.1.1`, `v0.2-professional`, `v0.2-online`; add one for each new shape). A guided migration needs no per-file test: `validate.mjs` checks its format and `tests/scripts/migrations/guided.test.mjs` covers the commands and the record. `all-migrations.test.mjs` finds new scripts itself, checks that guided files are not scripts, runs each twice on every fixture, checks that the two 0.2 fixtures are unchanged after the first run, and checks dry runs and the rules above. `update-flow.test.mjs` runs the real scripts through `plan`, `apply-safe` and `finish`.

### 15a.2b The guided contract (ADR 0027)

A guided migration is a Markdown file that the user's own Claude follows after the update. It exists for upgrades that need judgement about the user's content, where a script would either guess or do nothing.

- **Where and what.** `system/scripts/migrations/NNNN-short-name.md`: four digits in the same number space as the scripts (one number is one file of either kind), ascending, never renamed or deleted once released, code class, listed in `system/manifest.json` with its sha256, and never run by a script.
- **Format (checked by `validate.mjs`).** Front matter: `type: "guided-migration"`, `id` (the file name without `.md`), `summary` (one plain sentence ending with a full stop, true for everyone who reads it) and `since`. Body, in this order: `# Title`, `## Who this is for`, `## Evaluate` (read-only checks, the exact files to read), `## Propose` (what to show, then AskUserQuestion with "Do it now (recommended)", "Not now" and "Skip it", each with a one-line pro and con), `## Apply` (the exact writes allowed after a yes, with the same scope as a script: tasks only through `tasks.mjs`, `state/` only through scripts), `## If skipped` (what stays as it is, and the sentence that runs it again) and `## Never`. Unlike a script, a guided file may read the current templates and procedures, because it runs later in the user's session.
- **Pending.** A guided upgrade is pending when the verified release manifest lists it, its checksum matches, the install has not recorded it and it is not baseline (§15a.6). A file on disk that the manifest does not list, or whose checksum differs, is not offered.
- **Record.** `state/migrations.json` (§10): `{ id: "NNNN-name.md", at, tag, kind: "guided", outcome: "done"|"skipped" }`. "Not now" records nothing and the question comes back. A skipped one is listed by `guided list --all` and runs again when the user says "run a skipped upgrade again". An entry without `kind` is a script and one without `outcome` is done (§15a.5).
- **Commands.** `node system/scripts/update.mjs guided list [--all] [--json]`, `guided savepoint [--json] [--no-commit]`, `guided done <id>` and `guided skip <id>` (the `.md` suffix is optional). Exit 2 for a wrong command line, 1 for an id that did not come with this release or whose checksum differs. An answer on an install whose record is empty first writes the baseline, so one answer cannot turn the scripts that came with the install into pending upgrades.
- **From `finish`.** `finish` returns `guided_pending` and adds one task, deduplicated: "Alterbrain has N upgrade question(s) for you. Say 'run the pending upgrades'." (`#ab/update-alterbrain`). `plan` lists them before the user agrees, under "Upgrades I will ask you about after the update".
- **Restore point.** Guided upgrades change the user's notes, so they need one like scripts do. `apply-safe` and `finish` refuse (`no_restore_point: true`, with `guided_pending`) when any is pending and `pre-update-<tag>` cannot be made or no longer exists. Before its first write the skill runs `guided savepoint`, which reuses `pre-update-<tag>` or saves everything and makes `pre-guided-<tag>-<date>-<suffix>`; if Git cannot, it returns `ok: false` and the skill writes nothing.
- **The walk-through.** `/update-alterbrain` (step 8) takes the pending files one at a time: read the file, do **Evaluate** silently, record "done" in one line if nothing applies, otherwise follow **Propose** and **Apply** only after a yes. Saying "run the pending upgrades" or "run a skipped upgrade again" later does the same.
- **Release notes.** `### Upgrades` in the CHANGELOG names each guided file like a script, saying that it asks first.

**Upgrades in release 0.2.0** (each summary is the script's own line, or for a guided file the `summary` in its front matter):

| id | what it does |
|---|---|
| `0001-remove-canvas` | Removes the retired Canvas connection from the tools list, if it was switched on, and adds a task for anyone who built the `canvas-sync` blueprint. Never touches `.env.local`, `state/built.json` or `my-*` skills. |
| `0002-learner-and-packs` | If the install started on 0.1: records `learner.kind: "mba"` and switches on the packs already in use (`mba`, and `country-nl` for a job hunt in the Netherlands). |
| `0003-programme-note` (guided) | If the settings name a school or programme: offers to make a programme note from them and link the courses to it with `programme`, asks first, applies only what the user approves, and never touches the `school` keys. Skippable and re-runnable. |
| `0004-old-pack-paths` | Reports the skills and helpers the user built (`my-*`, every text file in them) and the notes in `vault/80_me` that point to framework files that moved. Adds a task; writes nothing. |
| `0005-moved-file-edits` | Reports edits to the 14 framework files that moved (six reviewer briefs, four note templates, four Netherlands job guides). An old copy that was never edited is archived by the update; an edited one is left where it is and would silently stop applying. Adds one task; writes nothing. |
| `0006-brand-to-template` (guided) | If the user has a personal style in `vault/80_me/brand/`: offers to package it as a template (`vault/80_me/templates/my-brand-<kind>/`, one folder per kind chosen) and make it the default for those kinds (`templates.defaults` in `config/brain.json`, only where no default exists). The brand folder is never changed and keeps working as the default look. Skippable and re-runnable. |

### 15a.3 How `update.mjs` runs them

- **`plan <tag>`** stages the release and returns `migrations_pending: [{ id, summary }]`: the scripts the verified release manifest lists, that the install has not recorded, and that are not already part of what the install came with (`migrations_baseline`, §15a.6). The update skill shows them under "Upgrades to your notes and settings" before the user says yes. A staged script that was rejected (a wrong checksum) is not listed.
- **`apply-safe <tag>`** saves everything and makes the git tag `pre-update-<tag>` (a tag that exists is kept: it marks the state before the first run). When the plan has upgrades and no tag can be made (Git missing, not a repository, the tag failed) it returns `no_restore_point: true` and changes nothing. **The save is checked:** when the folder holds unsaved changes and the automatic save fails (for example a half-finished rebase or merge), it returns `ok: false`, `save_failed: true` and one plain sentence pointing to `/health-check`, exit 1, before it replaces anything and before it makes the tag. A clean folder needs no save, so a failed save does not stop it: the tag alone is the restore point. **A skipped save is checked too:** outside developer mode, when the folder holds unsaved changes and the save was skipped because `git.auto_commit` is false in `config/brain.json`, it refuses the same way (`save_failed: true`, one plain sentence saying automatic saving is switched off and to save by hand or switch it on), because a tag on the last commit would not cover those changes. `finish` does not count that skipped final save as a failure. `guided savepoint` follows the same rule.
- **`finish <tag>`** works out what will run before it writes anything. When any upgrade will run and the tag does not exist, it returns `no_restore_point: true` and changes nothing. Otherwise it records the baseline scripts, then runs each pending script once, in name order, in its own process (5 minute limit; `CLAUDE_PROJECT_DIR` and `ALTERBRAIN_UPDATE_TAG` set), and records `{ id, at, tag }` in `state/migrations.json` after each success. The first exit other than 0 stops the update (`ok` false, `error`, `migration`, `detail`, `migrations_run`, `migration_notes`), and a retry carries on after the scripts that finished. Then the new manifest becomes the base for the next update, the health check runs, and the result is saved. If that final save fails, `finish` returns `ok: false`, `save_failed: true` and a plain `error`, and adds one high-priority `#ab/git` task; it never reports the save as done.
- **`finish` returns** `safety_tag`, `migrations_run`, `migration_notes` (script id to its output, up to 2,000 characters each; printed under "Upgrades run:") and `migrations_skipped`: scripts in the folder that the verified manifest does not list, or whose checksum differs. They are not run, are reported ("Skipped upgrade …"), and make `ok` false.
- **Guided upgrades** are not run by `update.mjs`. `plan` and `finish` list them as `guided_pending` and `finish` adds the single task (§15a.2b).
- **Trust.** A script runs only when the verified release manifest lists it with a matching sha256 (the same trust as every other code file).
- **The first update from 0.1.x** is planned by the old `update.mjs`, which has no `migrations_pending`; `finish` is the new one. The update skill therefore falls back to the CHANGELOG `### Upgrades` lines for the preview and stops to ask when they are missing too.

### 15a.4 The record

`state/migrations.json` is described in §10 (State files).

### 15a.5 Documented fallbacks

Each row names an old shape, the file that still reads it and its test. A release reads both shapes, and removing a fallback is a later release's decision with its own migration, no earlier than two releases after the one that introduced the new shape. For the fallbacks introduced in 0.2.0, that is two releases after 0.2.0.

| Old shape | What still reads it | Test |
|---|---|---|
| No `learner`, or an empty `learner.kind` | `learnerKind()` in `system/scripts/onboard-progress.mjs` gives `mba` when `packs` lists `mba` or a `school` block exists, otherwise `null`; the course procedure, onboarding M2, `/reconfigure` and `/menu` apply the same rule. Migration 0002 records the kind for installs made before 0.2.0 | `tests/scripts/onboard-helpers.test.mjs` |
| No `packs`, or one that is not a list | `onboard-seed.mjs` and the jobs skill treat it as `["core"]` | `tests/scripts/onboard-helpers.test.mjs` |
| `school.name` and `school.programme` in `config/brain.json`; `school` in a course note | Display text only, and only when there is no programme note (the course procedure, §0, and `/assignment new`); never copied into a new course note. Migration 0003 adds a programme note and the `programme` link and leaves the keys | `tests/scripts/migrations/guided.test.mjs` (the programme-note upgrade is guided now and may be skipped or never answered, so the display fallback is what keeps working). The display rule itself is skill prose with no test (§17) |
| `jobs.country` empty, or `NL` with no `country-*` entry in `packs` | The jobs skill ("Country pack", step 3) uses the pack folder for `jobs.country` when it exists and asks once when the country is empty; `adzuna.mjs` defaults to `nl` | `tests/scripts/jobs-adzuna.test.mjs`. The skill lookup is prose |
| `git.lfs_min_mb` absent, not a number or not above 0 | `lfsMinBytes` in `system/lib/git.mjs`: 50, kept between 1 and 95 | `tests/scripts/git-lfs-rules.test.mjs` |
| `privacy.encryption` absent | `system/lib/vaultkey.mjs`: encryption counts as on when `enabled` is true or the `.gitattributes` files carry `filter=git-crypt`, and is otherwise off | `tests/scripts/vaultkey-lib.test.mjs` |
| A course note without the class-date fields (`session_dates`, `class_days`, `term_start`, `term_end`, `class_days_asked`) or without a `## Material` section | `readCourse` in `system/lib/courses.mjs` gives such a note no reminder; the course procedure adds the section, and asks the schedule question, when the course is next opened | `tests/hooks/courses.test.mjs` |
| A manifest line without `course` | The key is optional and present only when `--course` was given. The course procedure adds a `course` line to the source notes of files imported without one when it sets the course up | `tests/scripts/ingest-zip.test.mjs` |
| A source note whose `course` line is a short link (`"[[Strategy]]"`) | The course procedure (§4) counts a short link that equals one course's title, code or folder name as linked, and rewrites it when it refreshes the Material list. There is no bulk rewrite | Skill prose; no test |
| A big file stored as a Git LFS pointer whose rule is gone | `prepareBigFiles` in `system/lib/git.mjs` writes an exact-path rule on the next save with changes (§3, "Git storage"); nothing is migrated | `tests/scripts/git-auto-lfs-flows.test.mjs` |
| Onboarding titles stored in `state/onboarding.json` | `onboard-progress.mjs` ignores them and uses its own list | `tests/scripts/onboard-helpers.test.mjs` |
| A profile line labelled "Studying" in `USER.md` | Onboarding M2 and M3 keep the label they find | Skill prose; no test |
| A `state/migrations.json` entry without `kind` or `outcome` | The update code reads an entry without `kind` as a script and one without `outcome` as done (§10) | `tests/scripts/update.test.mjs` |
| `state/local/update-check.json` missing, unreadable or odd | `system/lib/updatecheck.mjs` treats it as "check now"; any failure of the check is silent and writes nothing | `tests/hooks/updatecheck.test.mjs` |
| `config/brain.json` without `templates`, `vault/80_me/templates/` missing, or notes without `templates` or `tone` keys | `system/lib/templates.mjs` resolves to the built-in template and the tone default for the learner kind (professional for `mba`, `professional` and no context; academic for `degree`, `online` and `other`; professional for CVs and letters) | `tests/scripts/templates.test.mjs` |
| A programme or course link written as a vault path (`[[20_areas/courses/<slug>/course]]`) rather than a short link | `linkTarget` in `system/lib/templates.mjs` drops the folder path and a trailing `.md`, and finds the note by folder name; a link it cannot find gives a warning, not an error | `tests/scripts/templates.test.mjs` |
| A `report` template asked for a memo, essay or one-pager; a programme `csl` that is only a style name | A `report` template also serves `memo`, `essay` and `one-pager` and `defaults.report` covers them; an exact-kind template wins at the same level. `csl` resolves to a file in the template folder when there is one, otherwise stays a bare name with `csl_missing` and a warning | `tests/scripts/templates.test.mjs` |
| No `vault/80_me/templates/`, but `vault/80_me/brand/` set up (every install before 0.2.0) | `chooseBrand` in `system/quarto/tools/render.mjs` still uses the brand folder as the user default look; migration 0006 only offers to package it | `tests/scripts/templates.test.mjs`, `tests/quarto/quarto.test.mjs` |
| A person note without the CRM keys (`last_contact`, `next_follow_up`, `cadence` and the rest) | `people.mjs` gives such a note no reminder; `/people` adds the keys one line at a time when it next updates the person | `tests/scripts/people.test.mjs` |
| `vault/_views/Contacts.base` missing from a vault made before 0.2.0 | `/people` creates it on first use and offers the `Home.md` embed without editing `Home.md` | Skill prose; no test |
| `vault/.obsidian/app.json` without `showUnsupportedFiles` | Re-running `obsidian-setup.mjs` adds it; `doctor.mjs` gives a tip until then | `tests/scripts/obsidian-setup.test.mjs`, `tests/scripts/doctor.test.mjs` |
| A course note without `team`, `team_name`, `team_number`, `templates`, `tone` or `ai_log` | The course procedure asks once for the team and offers the AI-use log when it is next needed; empty means "inherit" or "off" | Skill prose; wording checked in `tests/scripts/course-procedure.test.mjs` |
| A programme note without `templates`, `tone`, `max_upload_mb` or `csl`; a project note without `templates` or `tone` | Read as empty: nothing is attached, the tone default applies and no upload limit is assumed | `tests/scripts/templates.test.mjs` |
| An assignment note without `team_name`, `team_number`, `voice_mode`, `grade`, `feedback`, `templates` or `tone` | `/assignment` reads the course note's team after a confirming question, asks `voice_mode` once for group work, and treats `grade` and `feedback` as not returned | Skill prose; wording checked in `tests/scripts/course-procedure.test.mjs` |
| A user's copy of a lens brief or `lens-choice.md` that says `lite`; a critique note without `deliverable`; a `my-*` skill that names the `lens` agent | `panel.md` reads `lite` as `quick`; `deliverable` is optional; the `lens` agent stays until 0.4.0 at the earliest | `tests/scripts/critique-library.test.mjs` |
| An edited salary table at `system/packs/mba/jobs-nl/salary-thresholds.md` | `ind-sponsors.mjs thresholds` reads only the new path and names the old copy in `note` and `old_copy`; migration 0005 adds a task. Both go two releases after 0.2.0, with a migration | `tests/scripts/jobs-ind-sponsors.test.mjs` |

### 15a.6 The fresh-install rule

A fresh install has no `state/migrations.json`. The install does not pre-fill it: a pre-filled list that drifted from the shipped scripts would record an unrun migration as done. Two things keep a fresh install quiet instead.

1. At its first update, `update.mjs` compares the installed `system/manifest.json` with the scripts on disk. Scripts that the installed release came with, whose files match, are recorded with `baseline: true` and are neither shown nor run. This applies only while `state/migrations.json` has no entries. An install from an older release, whose manifest lists no upgrade scripts, is never treated this way, and neither is a script whose file differs from the manifest.
2. Every migration does nothing on data already in the new shape, so even when one does run (a person who changed things by hand, a re-run, a stopped update), it prints `Nothing to do.` and writes nothing. `all-migrations.test.mjs` checks this by running each migration twice on the two 0.2 fixtures.

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
**yahoo-finance (A4, v0.2.0).** The entry is pinned to an exact git commit (`git+https://github.com/Alex2Yang97/yahoo-finance-mcp@b9c1765…`), the one form of pin that is exact for a repository with no release tags, and `validate.mjs` accepts a 40-character commit as pinned. The registry route was checked and not adopted: PyPI lists `yahoo-finance-mcp` 0.1.2 (https://pypi.org/project/yahoo-finance-mcp/0.1.2/), but that page links to no repository and its code was not compared with the pinned commit [Unverified: whether it comes from the same author]. The entry's `notes` say so.

`channel` is information for people and blueprints. `outbound_guard` does not read the catalogue: it works out the channel from the server name (section 14), and a server it cannot place counts as `other`, where the default level (`draft`) applies.

### `system/catalogue/routing.json`
`{ "schema":1, "reviewed":"YYYY-MM-DD", "classes": { "<class>": { "model":"…", "effort":"…", "helper":"helper-…"|null, "examples":[…] } }, "caps": { "pro":3, "max":8 } }`

`helper` (v0.2.0, ADR 0027) is the name of the agent file in `.claude/agents/` that carries the class's model and effort; `deterministic` has none (`null`). `validate.mjs` checks that each named helper exists with the same `model` and `effort`. An older copy without `helper` keys is simply not checked for them.

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

**`keep-in-touch` (v0.2.0, ADR 0028).** A blueprint, not core: it watches the user's contacts for news, job changes, events and achievements so Alterbrain can draft a congratulation. Draft only; it uses official data or the user's own exports, never scraping, and stays inside the rate guard. Kind `automation`, risk `medium`. The core contact book (`/people`, `people.mjs`) does not need it.

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
- [x] Highly-skilled-migrant thresholds for 2026 (one table, `system/packs/country-nl/salary-thresholds.md`, never hard-coded elsewhere; updated each January).

Resolved in v0.2.0 work (2026-10-08):
- [x] Quarto's PowerPoint layout names: the seven names a reference `.pptx` needs (Title Slide, Title and Content, Section Header, Two Content, Comparison, Content with Caption, Blank), from https://quarto.org/docs/presentations/powerpoint.html (checked 2026-10-08). The Quarto Word page (https://quarto.org/docs/output-formats/ms-word-templates.html) lists no style names, so none are hard-coded for `.docx`.
- [x] Office export constants, checked on learn.microsoft.com: PowerPoint `ppSaveAsPDF` = 32, Word `wdFormatPDF` = 17 (SaveAs2), Excel `xlTypePDF` = 0 (ExportAsFixedFormat). `brew install poppler` provides `pdftoppm` (formulae.brew.sh).

Still open:
- [ ] Whether `SessionEnd` fires when the desktop app closes (the throttled `Stop` hook covers it).
- [ ] Gmail connector read and search tool names (confirm with `/mcp` on a connected account).
- [ ] Adzuna: the `nl` endpoint confirmed with a real key; whether other countries work the same way and what Adzuna answers for a country it does not offer (the code treats HTTP 400 and 404 as "not offered"); and the user's own reading of the terms on storing results.
- [ ] A live check in Obsidian of the Tasks queries on `Home.md` and the `.base` files in `vault/_views/`.
- [ ] Git LFS and the upload check against real GitHub and real Obsidian Git. Tests used Git for Windows 2.55, Git LFS 3.7.1, git-crypt 0.7.0 and local bare repositories on Windows 11 only. Not run: macOS and Linux, a real GitHub upload and restore, GitHub's quota replies, how Obsidian Git shows a hook's message, the Obsidian Git plugin on a phone. GitHub's figures (about 100 MB per ordinary file, 2 GB per Git LFS file on free plans, its repository-size advice) are from memory (ADR 0020).
- [ ] Whether a detached background upload survives the end of a Claude session on every system (it did in tests on Windows 11; if it is ended, the next save starts the upload again from the start of that file).
- [ ] Product-owner decision: the `git reset --soft "@{u}"` repair for big files that were saved as ordinary files and never uploaded (`.claude/skills/health-check/references/fixes.md`, ADR 0020). It changes local history, which `git-auto` never does. Alternative: start a fresh private repository.
- [ ] The download steps for the user's school or provider in `.claude/skills/course/references/course-setup.md` ("The download steps", written from general knowledge, with Canvas as the example), checked against real schools and providers (Canvas, Brightspace, Moodle, Coursera, edX), and Canvas's own "offline HTML" export as a possible better route.
- [ ] Learners beyond the MBA pilot group (ADR 0023). The paths for a degree student, an online learner and a working professional (the learner question, courses with no programme, `none-stated`, project notes, the country question) are checked by unit tests and by reading the procedures, not by a run with a real user. The pilot default of `mba` when nothing points elsewhere is to be revisited before a wider release.
- [ ] The first update from an installed 0.1.x to 0.2.0 (§15a.3). The flow was simulated with a local release folder and the real scripts. Not run: an install of 0.1.x, a file held open by Obsidian during an upgrade, macOS, and a signed release with Git and the restore tag.
- [ ] Tests for the prose fallbacks (§15a.5): the `school` display-text rule, the legacy source-note links and the "Studying" label are read by skill procedures, which no test runs. The policy asks for a test per documented fallback.
- [ ] Product-owner decision: the always-loaded budget figures in §5, which no longer hold.
- [ ] [Unverified] Whether Claude's Read tool can open PDF pages without `pdftoppm` (community reports only). `pages.mjs` renders PNGs itself, and the health check and setup offer the renderer once. The Windows install command `winget install --id oschwartz10612.Poppler -e` comes from the winget community repository and was not re-checked at release.
- [ ] [Unverified] The macOS AppleScript export of PowerPoint and Word files to PDF (`pages.mjs export`) is written from the apps' scripting dictionaries and has never been run on a Mac. The Office safety rules (an app that is already open is not used; a hung export is stopped after a timeout) were not exercised against a hidden prompt.
- [ ] [Unverified] The Obsidian setting `showUnsupportedFiles` in `app.json` (shows Word, PowerPoint and Excel files in the file list): the key name comes from community plugin sources, because Obsidian publishes no reference for `app.json`. Not opened in Obsidian; check once that the files appear after the vault is reopened.
- [ ] [Unverified] Per-call effort override for a subagent is not available to the caller, which is the reason for four named helpers (ADR 0027). Also untested in a live session: that Claude Code resolves a helper name from `.claude/agents/` as a subagent type, and the guided-migration walk-through (`/update-alterbrain` step 8) end to end.
- [ ] yahoo-finance provenance (A4): whether PyPI `yahoo-finance-mcp` 0.1.2 is built from the same code as the commit the catalogue pins. The inspector page needs JavaScript and a download of the package is a software download, so the comparison was not made. Product-owner decision: compare by hand and then pin the registry version, or keep the commit pin.
- [ ] The deliverables work was exercised by unit tests on synthetic Word, PowerPoint and Excel files, not with a real Office, LibreOffice or `pdftoppm` run, a real critique round with the named helpers, or a real Quarto render with a school template. `Contacts.base` was not opened in Obsidian.
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

---

## 19. Deliverables (ADR 0025, 0026)

Everything the user hands in or presents (a report, deck, workbook, memo, one-pager, essay, CV or letter) is built to one standard, whichever skill makes it. The rules are core: they do not depend on a school, a programme or a pack. The text lives in `system/deliverables/` (`principles.md`, `delivery-gate.md`, `tone-and-voice.md`, `rehearsal.md`), written in our own words; the skills point to it instead of repeating it. **A rubric or a school template that prescribes a structure always wins over the general principles**, and the skill says so in one line.

### 19.1 Templates

A template is a folder with a `template.yml`. Built-in templates are in `system/quarto/templates/<name>/` (`report`, `deck`, `letter`, `cv`, each with its own `template.yml`, `source: "built-in"`). The user's templates are in `vault/80_me/templates/<slug>/`. The folder name equals `slug`.

**`template.yml`** is flat YAML, one key per line (lists as `- ` lines or `[a, b]`); `template.mjs check <folder>` validates it. The field list is also in `.claude/skills/template/references/new-template.md`.

| key | meaning |
|---|---|
| `schema` | always `1` |
| `name`, `slug` | a short name the user recognises; the folder name |
| `kind` | `deck`, `report`, `memo`, `letter`, `cv`, `essay`, `workbook` or `one-pager` |
| `style` | the preset: `reading-deck` (self-explanatory slides with an "In brief" box, sources, footnotes, a tracker), `presenting-deck` (minimal text, the content in the speaker notes), `report` or `memo`. A deliverable can override it |
| `base` | the built-in layout it builds on: `cv`, `cv-ats`, `letter`, `report`, `deck` or `none` |
| `format`, `outputs` | the Quarto format the documents are made in (empty = the base's), and the formats offered (`pdf`, `docx`, `pptx`, `html`, `xlsx`); `check` prints a note when a reference document's format is not in `outputs` |
| `brand`, `reference_doc`, `quarto_extension` | a style file (colours, fonts) in the folder; a `.pptx` or `.docx` whose styles Word or PowerPoint output copies; the name of a folder under `_extensions/` |
| `csl`, `max_upload_mb`, `page_limit`, `font_size_pt`, `fonts` | citation style (a file in the folder, or `apa`), upload limit, page limit, minimum font size, the fonts it needs |
| `house_rules` | the school's or employer's rules as short plain sentences; the delivery gate and the structure lens read them |
| `structure` | optional skeleton: the headings the document must have, in order |
| `source` | `built-in`, `school`, `employer`, `provider` or `custom` |

**Resolution, most specific first:** the deliverable, then the project or assignment, then the course, then the programme, then the user's default for that kind (`templates.defaults` in `config/brain.json`, §10), then the built-in. `templates` on a note is a list of slugs. A `report` template also serves `memo`, `essay` and `one-pager`; an exact-kind template wins at the same level. `/render` resolves silently and says in one line which template it used. It asks only when two candidates of the kind tie at the same level, or when the user asks. The tone resolves the same way (§19.2). A programme's `csl` and `max_upload_mb` apply when the template sets none.

**The personal brand still works.** `vault/80_me/brand/` stays the user default look for a document that has no template (documented fallback, §15a.5). Guided migration 0006 offers to package it as templates; nothing is forced and the brand folder is never changed.

**`/template`** turns a file the user gives into a template: `.pptx`, `.potx`, `.docx`, `.dotx`, or an existing Quarto extension folder such as a school report extension. It extracts colours and fonts from the OOXML theme (`template.mjs inspect`), checks the slide layout names against the seven that Quarto's PowerPoint reference document needs (§17), makes a sample, renders it and looks at every page, and then attaches it to a deliverable, project, course, programme or the user's default. It also lists, previews and removes templates. A `.potx` or `.dotx` is inspected but not converted: the user saves a copy as `.pptx` or `.docx`. **School and employer artwork never goes into the framework**; it stays in the user's own `vault/80_me/templates/`, which is private, and the school template is kept out of anything that is shared.

### 19.2 Tone and voice

Tone is a formality dial on top of the user's own voice, never a replacement: `academic`, `professional` or `conversational`. It is set per programme, course, project or assignment (the `tone` key), with a recommended default (`professional` for `mba`, `professional` and no context and for CVs and letters; `academic` for `degree`, `online` and `other` course work), and the user can override it for one deliverable. The skill states the choice in one line when it starts.

**Voice is always on for deliverables**, from `vault/80_me/voice/<lang>/profile.md` and matching exemplars. If there is no profile for that language, the skill says so once and suggests the voice setup rather than falling back to a neutral house style; `ghostwriter` writes nothing for a deliverable without a profile unless the caller says to carry on. For group work the skill asks one question per deliverable, "sound like you, or a neutral team voice?" (`voice_mode`).

**Storytelling inside the structure, by default.** The structure stays (answer first); within it: situation, complication, question and answer as a narrative; then the stakes; a real person or customer moment where the user's sources have one; concrete specifics; contrast; and a close that calls back to the opening, not a tidy moral (the writing rules' ban on an inspirational ending stays). Guardrails: no invented anecdotes or facts, academic tone keeps the story quieter, and a rubric or template that prescribes a structure wins.

### 19.3 Principles

`system/deliverables/principles.md` is the one reference for drafting, the delivery gate and the structure lens: the Minto pyramid and SCQA; MECE; storyline first (the user approves the ghost deck of action titles before slides are built); action titles (a full-sentence takeaway, at most two lines); horizontal logic (the titles alone tell the story) and vertical logic (the body proves the title); one message per slide; an executive summary up front and the backup in an appendix; chart choice by message, the key number highlighted, direct labels instead of legends, chart titles that state the so-what, and a source line on data slides; consistent numbers and units; colour-blind-safe contrast and a minimum font size; speaker notes and timing; reading deck against presenting deck; Duarte's what-is and what-could-be arc, hooks and stakes. The rules a script can check (slide titles as sentences and their length, a source line, the template's house rules) belong to the delivery gate; the judgement belongs to the structure lens.

### 19.4 The delivery gate

One checklist before the user is told to upload, for every file type (`system/deliverables/delivery-gate.md`; mechanical part `deliver-check.mjs`, §15). In order: resolve the template; the cover or title slide is complete (names, programme, course, team, no placeholder); file names follow the course or template rule and share one base name; **every page viewed by the main session** (`pages.mjs`; a helper's "viewed all" is never evidence, C1, C4); the workbook opens with calculated values and no error cells; report, deck and workbook agree on the headline numbers and terms; upload size within `max_upload_mb`; the labels scan (§3, `release-scan.mjs`). Then the submit task. **Alterbrain never uploads or sends the file.** A check that a rubric or template contradicts is waived with a stated reason, listed in the hand-over; the label scan is never waived. A file the scan could not read counts as failed. Page images need a PDF page renderer (Poppler's `pdftoppm`), which the health check and setup offer once and never in the middle of a task (§17). A deck from PowerPoint, a Word file or a workbook is exported to PDF through the Office app (§15), with LibreOffice as the fallback and a plain warning about font widths.

The gate is used by `/render` (final), `/assignment ship`, `/jobs apply` and any skill that hands over a file. Routine emails and messages are not deliverables and do not pass through it.

### 19.5 Critique for every deliverable

`/critique` runs a panel of blind reviewers on any file and applies only the changes the user approves; `/assignment critique` follows the same procedure (§13). It is offered once at the end of every deliverable flow (`/render`, `/assignment`, `/jobs apply`, project deliverables); routine emails and messages are not offered it but it is available on request. The lens choice adapts to the type (`lens-choice.md`): a **quick panel** (two or three lenses, read and merged by the main session) or a **full panel** (up to seven lenses, consolidated by `helper-judgement`). The skill says the usage cost plainly on Pro and recommends the quick panel unless the deliverable is graded and final or due within three days. The reviewers are `helper-review` with the effort set in the agent (§6). The MBA pack adds business presets for the board and specialist seats (`system/packs/mba/critique-presets.md`).

### 19.6 The rehearsal pack

Offered once after a deck is approved (`system/deliverables/rehearsal.md`), optional and never blocking: speaker notes in the user's voice (written into the deck source and bound by the outbound gate, because they travel with the file), a timing plan, the ten likeliest audience questions with short answers (from the devil's-advocate lens, using only facts the deck, its sources or the fact sheet hold), and a one-page cheat sheet. The Q&A and the cheat sheet stay in `rehearsal.md` in the vault and are not copied into the shipped deck.

### 19.7 Model audit

A workbook gets the `model-audit` lens (and `fact-check` on the report or deck that rests on it): every number in the report or deck maps to a cell; inputs are kept apart from calculations; no hard-coded numbers inside formulas; no error cells or circular references; units and periods are consistent; checks that confirm themselves are named as such; totals and signs are sane. The structural facts come from `workbook-check.mjs`, not from the model; recalculation through Excel is optional and only on Windows with Excel installed. Python builders and a second-verifier stage are not part of the default.
