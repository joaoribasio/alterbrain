# Changelog

All notable changes to Alterbrain are listed here. Newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Optional encryption of your most private notes before they reach GitHub (ADR 0019): onboarding and `/reconfigure` can switch on git-crypt for your fact sheet, `USER.md`, `MEMORY.md`, voice files, people notes and journal, so a leak of your GitHub account no longer exposes them, while the files stay normal on your laptop. `vault-key.mjs` sets it up, saves a copy of the key file outside the project (optionally protected by a password you type in a terminal, never in the chat), tests that copy, and unlocks a new computer. The automatic save never stages private notes it cannot encrypt, leaves out any that would be stored as plain text, and refuses to upload if one slipped through (this check stops the upload if it cannot run). `doctor` and the session digest report a locked copy, a missing tool and an untested key copy. New guide: "Encrypting your private notes".
- Encryption follow-ups (ADR 0019). Private documents are encrypted too: the PDFs, Word and Excel files, slides and pictures you keep in the private folders are scrambled like notes, because ordinary documents are no longer in Git LFS (see Changed). A new upload check closes the Obsidian Git gap on a computer: Git itself runs it before every upload (a small `pre-push` hook that `vault-key.mjs setup`, `unlock` and each Claude session keep in place), so Obsidian Git can no longer upload a private note or document without encryption. It stops the upload if it cannot run, it leaves another tool's hook alone, and it still lets Git LFS upload big files (like Git LFS's own check, it refuses to upload from a folder that uses Git LFS when Git LFS cannot be found). It looks only at what your computer would add, so notes that your phone put online do not block an upload, and it reads big files without loading them. It does not cover Obsidian on a phone. `vault-key.mjs status`, the health check and the session digest report it. The encryption tool (git-crypt) is now found straight after a winget install, without restarting the Claude app. A private file of 50 MB or more cannot be both encrypted and in Git LFS, so it stays off the online backup, with a task.
- `/course`: a course now starts by asking for everything you have (ADR 0022). Naming a course, in onboarding or later with `/course new` (a new block or term, or a course you add), makes Alterbrain ask once for the syllabus, slides, readings, cases, Excel models and data files, assignment briefs and rubrics, past exams and announcements. A zip or one folder per course is best, files one by one also work, and "only the syllabus" or "later" are fine (later adds one reminder task with the download steps). It keeps an untouched copy of every file, reads the syllabus for the grading, submission rules, deadlines and the AI rule (you confirm the reading), and keeps a **Material** list in the course note, grouped by type and session. It then says what is missing (no syllabus, an assignment without its brief or rubric, sessions without slides, an Excel model the course refers to) and asks at most one question or adds one task. Word, PowerPoint and Excel files are read only if the optional document reader (uv) is installed. Alterbrain checks that before it copies anything and, if it is missing, offers to save the files as PDF first (recommended), install the reader first, or keep them unread; unreadable files are listed as "not readable yet" and never summarised. PDF, CSV and plain text need nothing. One procedure, `system/packs/mba/course-setup.md`, is followed by `/course`, onboarding M3 (which no longer holds its own copy of the steps), `/ingest` (offers course setup when the course has no note, refreshes the Material list when it has one) and `/assignment new` (offers it in one line after the interview). `/reconfigure` sends "add a course" to `/course new`, `/weekly-review` asks once a week whether there is new material, and the course template has a `Material` section. The "course setup from a syllabus" extra in the study blueprint is now "session notes from a syllabus".

- Course material keeps coming in all term, and Alterbrain reminds you after each class. Bringing in what you study is now a habit, not a one-off at course setup: whenever you mention or hand over something new for a course (a class that took place, slides, your own notes, a case, a reading, a brief, feedback, a transcript), Alterbrain checks the course's Material list and, if it is not there, asks once per course per session, after your own request and never in the middle of a draft, whether to add it to that course through `/ingest`, and it links notes you already typed in the vault into the course's Material list instead of importing them again. Course setup now records the class dates the syllabus states (`session_dates` in the course note) or, when the syllabus gives none, asks once for the weekdays of class (`class_days`, and `term_start` and `term_end` if you know them). A course set up earlier gets its class days the same way: say `/course <name>` and Alterbrain asks once, and remembers a "don't know" so it does not ask again. From those the start-of-session summary adds up to three lines such as "New material? Corporate Finance had class on Tue 13 Oct": a class counts once it is over (from 18:00 on the day itself), only the last 14 days count, classes on or before the day the course note was made are never mentioned, the reminder ends at `term_end` (or 16 weeks after the term starts if there is none), each class is mentioned once, and what was said is kept in `state/local/course-nudges.json` on your computer only. Courses without those fields get no reminder. The weekly review's weekly question stays. The guide "Bringing in your course material" has a new section, "When new material arrives".

### Changed
- Git LFS is now only for big files (ADR 0020). Files of 50 MB or more (`git.lfs_min_mb` in `config/brain.json`) are stored with Git LFS; PDFs, slides, Word files, pictures and everything else are saved as normal files. That removes the Git LFS install step and its storage allowance for most people, and lets private documents be encrypted. The root `.gitattributes` no longer has Git LFS rules. For each big file the automatic save adds one exact-path rule to `vault/.gitattributes`, which is yours and is never replaced by an update. Files already in Git LFS stay there, and a changed one is stored as before. A big file that cannot be stored safely (Git LFS missing, in an encrypted folder, 2 GB or more, outside the vault) is left out of the backup, with a task. Obsidian Git is covered by a small check that Git runs before every save on a computer; a big upload carries on in the background after Claude closes; Git LFS files are uploaded before the saves that point to them. A phone's Git runs no checks, so an ordinary file of about 100 MB saved there pauses the online backup with a clear task instead of failing again and again. The health check gains `repo-size` (a tip from 1 GB of history, a warning from 4 GB), `big-file-hook` and `big-blobs`, and its Git LFS check now says it matters only for big files. The installers still provide Git LFS and switch the check on.
- Canvas is gone; course material now arrives by download and `/ingest` (ADR 0021). The `canvas-sync` blueprint, the `canvas-mcp` catalogue entry and the `school.lms` setting are removed, because some schools do not allow automated access to their learning platform. Onboarding (M3, "Bring your course material") now explains in plain words how to download everything from the course site (Files, select all, Download gives a zip) and how to save the syllabus and assignment pages as PDF, then hands over to `/ingest`. `ingest.mjs` opens `.zip` files and takes `--course "<Course name>"`. A zip is refused as a whole, and nothing from it is used, if it is password protected, damaged, holds a path that leads outside its folder or a link, holds two names that Windows and macOS treat as one file (for example `Notes.md` and `notes.md`), or is over 5000 files or 2 GB; a zip inside a zip is kept as a plain file and not opened. The `/ingest` skill has a course-material flow: it infers the course and asks once, links each source note to the course note, offers to put deadlines from a syllabus or assignment page into the course note and your task list, and works in batches of about 50 files. Study extras is now five add-ons.

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
