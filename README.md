# Alterbrain

Alterbrain is your **second brain**, your **digital twin** and your **doer**. It runs on the Claude desktop app and keeps everything in an Obsidian vault on your own computer.

- **Second brain.** It remembers what you read, attend and write. It keeps the original files, tells you where every answer came from, and helps you learn.
- **Digital twin.** It learns how you write, in each language you use, and drafts in your voice. It only uses facts you have approved.
- **Doer.** It helps with assignments, reports, decks and workbooks, email replies, job hunting (Netherlands pack included), studying and keeping in touch with people. It prepares things. It never sends or uploads anything unless you allow it.

Alterbrain is free to use and change, for yourself, your studies and your work, under the PolyForm Shield licence (see "Credits and licence" below). The repository is public, so installing and updating need no GitHub sign-in. It is made for anyone who learns or works and is not technical, MBA students first: a university degree, online courses such as Coursera, or a job with no courses all work. It is also meant to be easy for maintainers to read and extend.

---

## What you need

| You need | Why |
|---|---|
| A **Claude Pro** or **Max** plan | Alterbrain runs inside Claude. Pro is enough to start. Max helps if you use it heavily. |
| A **GitHub account** (free) | Your data is backed up to your own private repository there. |
| **Windows 11** or **macOS** | Both are supported equally. |

Claude will help you install the rest (Git, GitHub CLI, Node, Obsidian and Quarto). It asks before each install.

---

## Install

### Option A: paste one prompt (recommended)

1. Install the **Claude desktop app** from [claude.com/download](https://claude.com/download) and sign in.
2. Create a new, **empty folder** on your computer. For example `Documents\Alterbrain`.
3. In the Claude app, open the **Code** tab and choose that folder.
4. Paste the prompt below and press Enter. Then answer Claude's questions. At the end it asks you to close the session and open the same folder again. Do that once, then type `/onboard`.

````text
Please set up Alterbrain in this folder. Go step by step, explain each step in plain
English, and ask me before you install anything.

1. Check which of these tools are already installed, and tell me what is missing:
   Git (with Git LFS, which is only used for files of 50 MB or more), GitHub CLI (gh),
   Node.js LTS, Obsidian and Quarto.
2. Install only the missing ones, one at a time, and ask me before each install.
   On Windows use winget, one package id at a time. On macOS use Homebrew.
   If something fails, explain what happened and what I can do. Do not retry in a loop.
3. Clone https://github.com/joaoribasio/alterbrain into the current folder
   (the folder must end up containing README.md and system/, not a sub-folder).
   If the clone says "not found", the project is still private: tell me, then help me run
   gh auth login and clone with gh repo clone joaoribasio/alterbrain instead.
4. Run: node system/scripts/doctor.mjs
   Explain the result in plain English and help me fix anything that is not green.
5. Run: node system/scripts/onboard-seed.mjs   and then: node system/scripts/mcp-gen.mjs
   (they prepare your folders and the standard tools, so you only restart once).
6. Then tell me to close this session and start a new one in the same folder, and to
   type /onboard there. Do not start /onboard in this session: my safety rules only
   load when a session starts.

Do not send, post or publish anything on my behalf. Never ask me to paste passwords
or keys into this chat.
````

### Option B: run the install script

If you prefer a script, download one from the [releases page](https://github.com/joaoribasio/alterbrain/releases) or from `system/scripts/` in the repository:

- Windows: `system/scripts/install.ps1`
- macOS: `system/scripts/install.sh`

**Read it first.** It is a normal text file. Open it in Notepad or TextEdit and look through it. It checks for the tools above, asks before installing them, and then sets up the folder. You can also paste the script into Claude and ask: "Explain in plain English what this script does. Is anything risky?"

Run it from a terminal:

- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File .\install.ps1`
- macOS (Terminal): `bash install.sh`

Then open the folder in the Code tab (start a new session there) and type `/onboard`.

---

## Your first 30 minutes

Type `/onboard`. Claude interviews you, one question at a time. It checks what it can work out itself before asking. It shows you what it will write, and only writes after you say yes. You can stop at any time and carry on later.

Early on it asks one question: what you are learning or doing (an MBA, a university degree, online courses, or work with no courses). That sets the defaults for everything after it: whether you get a programme and courses, which rules are checked, and whether the MBA frameworks are switched on.

The essentials (M0 to M4) take about 24 minutes. Online learners need about 22 and people who work without studying about 21, because their courses step is shorter. The rest can wait (they will appear in your task list).

| Module | What it sets up | Time |
|---|---|---|
| M0 Setup | Health check, GitHub sign-in, your private repository, automatic backup | 8 min |
| M1 Identity and tone | A name for your assistant and how it talks to you | 2 min |
| M2 You and your facts | A CV or LinkedIn export (optional) fills in the basics, then the question about what you are learning or doing | 5 min |
| M3 Courses and projects | If you study: your programme (if you have one) and your courses. For each course you hand over everything you have (syllabus, slides, readings, Excel files, briefs), or only the syllabus, or leave it for later; Alterbrain records its AI rules and deadlines and lists the material. If you work: your focus areas and projects, with no course steps | 3 to 6 min |
| M4 Autonomy and self-build | What Claude may do alone (default: nothing is sent) | 3 min |
| M5 Your writing voice | You share writing samples, Claude writes a profile, you read it back | 15 min |
| M6 Career and job search | The country you want to work in (Netherlands checks are included), target roles, languages, whether you need sponsorship | 10 min |
| M7 Email and tools | For example Gmail, and extra tools from the catalogue | 8 min |
| M8 Look of your documents | Colours and fonts for CVs, reports and decks | 5 min |
| M9 Import your existing files | Courses, notes, case files, folders and zips (originals are kept, duplicates skipped) | 10 min |

---

## Everyday use

**Open the vault in Obsidian** (the `vault/` folder inside your Alterbrain folder), and start with two notes:

- **`Home.md`** is your dashboard. It shows what is due today, drafts to review, proposals waiting for you, and ideas for what to ask.
- **`00_inbox/Tasks.md`** is your to-do list. When Claude needs you (a draft to check, a deadline, a question), it adds a task here. Tick a box when you are done.

**In the Claude Code tab**, type `/menu` to see what Alterbrain can do, grouped by goal, with example prompts. Or just ask in your own words.

Example prompts:

- "What do I already know about Porter's Five Forces? Cite your sources."
- "Add this PDF to my brain." (then drag the file in)
- "Here is the zip of my Strategy course files. Add it to my brain." (the zip you get from your school's or course provider's website)
- "I'm starting Marketing next block. Set it up: here is everything I have."
- "Remind me to email Prof. Smith on Friday."
- "Start an assignment for my Strategy course."
- "Draft a reply to the latest email from the programme office."
- "Find jobs that fit me." (with the Netherlands pack on, it also checks sponsor registers, Dutch-language requirements and salary thresholds)
- "Make me study cards on pricing strategy."
- "I keep doing X every week. Could you build a skill for it?"

### The commands

| Command | What it does |
|---|---|
| `/onboard` | Set up Alterbrain, or continue where you stopped |
| `/menu` | See what you can do |
| `/reconfigure` | Change a setting or redo a setup step |
| `/health-check` | Check that everything is healthy |
| `/capture` | Save a quick note or a reminder |
| `/ingest` | Add files, folders or a zip of course files to your brain (originals are kept) |
| `/course` | Set up a course with all its material: slides, readings, Excel files, briefs. It records the AI rules and deadlines and keeps a list of what you have and what is missing |
| `/ask` | Ask a question, answered from your own notes with sources |
| `/framework` | Apply a business framework (for example SWOT, Porter) to a case |
| `/render` | Make a PDF, CV, cover letter or deck with Quarto, in the template that applies |
| `/critique` | A panel of blind reviewers on any file you made (report, deck, workbook, memo, CV, letter), then only the changes you approve |
| `/template` | Turn a school or employer template (PowerPoint, Word or a Quarto folder) into one your documents use; list, attach, preview, remove |
| `/people` | Your contact book: add someone from a signature, a profile, an event or a card, set follow-ups, see who is due |
| `/weekly-review` | A short weekly tidy-up |
| `/learn` | Save a lesson so Claude remembers it |
| `/edit-voice` | Clean up a draft so it sounds like you, not like an AI |
| `/clarify` | A readiness check: Claude asks what it needs before starting big work |
| `/propose`, `/build`, `/remove-skill` | Grow Alterbrain (see below) |
| `/update-alterbrain` | Get the latest version |
| `/assignment`, `/reply`, `/jobs`, `/study` | The four add-ons |

---

## The four add-ons and blueprints

Each add-on has **one working case** that you can use today. Each also has a **blueprint**: a plain-language recipe that your own Claude can follow to extend it, when you ask.

| Add-on | Works today | Blueprint ideas |
|---|---|---|
| **Assignments** (`/assignment`) | Set up an assignment (with or without a course and a team), write a brief, draft it, get blind critiques from several "lenses" (devil's advocate, pre-mortem, board, specialists, grader, structure and more), pass the delivery gate, ship within the page and upload limits, then record the grade and feedback that come back | Page budget, fact-check, Excel model, class prep, team review |
| **Email replies** (`/reply`) | Reads a thread safely, drafts a reply in your voice, saves it as a draft and adds a task. Nothing is sent. | Inbox triage, meeting briefs, calendar, learning from your edits, Outlook |
| **Jobs** (`/jobs`; country packs, Netherlands first) | `scan` finds and ranks roles in the country you choose. With the Netherlands pack it also flags the sponsor register, Dutch-language and visa points. `apply` prepares a tailored CV and cover letter in your outbox. Another country gets the same flow without country checks until a pack for it is built (ask for one with `/propose`). | Weekly scan, pipeline view, LinkedIn (read-only), networking messages |
| **Study** (`/study`) | Explains a topic from your own sources and makes cards. Due reviews appear in your task list. `/study quiz` runs them. | Session notes from a syllabus, lecture transcripts, Anki |

### Every deliverable meets one standard

Reports, decks, workbooks, memos, CVs and letters follow the same rules, whichever skill makes them.

- **Your voice, with a tone dial.** Drafts sound like you (from your voice profile). Tone is a dial on top: academic, professional or conversational, with a recommended default for your programme, course or project, which you can change for one deliverable.
- **Built to be read.** Answer first, a storyline you approve before slides are built, full-sentence slide titles, one message per slide, sources on data. A school template or a rubric that prescribes a structure wins.
- **Your template, resolved quietly.** Give Alterbrain a school or employer template once and it is used for the course, programme or project it belongs to. Your own colours and fonts keep working as your default. `/render` says in one line which template it used.
- **A delivery gate before you upload.** Cover complete, file names right, every page looked at, workbook values calculated, numbers agreeing across files, size within the upload limit, and no working labels or placeholders left in. Alterbrain never uploads: the last step is a task for you.
- **A critique, offered once.** At the end of each deliverable Alterbrain offers a quick panel (two or three reviewers, cheaper on Pro) or a full panel. Routine emails are not offered one.
- **After a deck is approved,** an optional rehearsal pack: speaker notes in your voice, a timing plan, the ten likeliest questions with short answers, and a one-page cheat sheet.
- **Contacts.** `/people` keeps a light profile for each person (role, how you met, last contact, next follow-up). The weekly review lists who is due. Business facts only unless you ask for more. Public look-ups happen only when you ask.
- **Routines.** Scheduled jobs (a weekly contacts check, a morning brief) get one note each in `90_routines`: what runs, when, where, and when it last ran. Alterbrain runs no scheduler of its own; it makes your jobs visible, portable to another computer, and flags the ones that stopped. Draft only.

More blueprints (always-on options, keep-in-touch monitoring for your contacts, Instagram, Zotero, morning brief, cost report) are listed in `/menu` as "available to build". Just say "build the morning brief" and Claude will start with some questions.

### Grow it yourself (self-build)

When you ask for something twice, Alterbrain may **propose** a new skill. You see a short card: what it does, why, what it touches, the cost and risk, and how to undo it. If you say yes, it asks a few questions, builds it, tests it and saves it. `/remove-skill` undoes it. Self-built skills start with `my-` and are never overwritten by updates. Safety files can never be changed this way.

---

## Safety

- **Draft only by default.** Alterbrain prepares emails, applications and posts. You send them. You can allow more per channel (email, calendar, jobs, LinkedIn, social, messaging, web forms) with three levels: `draft` (prepare only, works today), `approve` (ask me every time) and `auto` (send within limits). `approve` and `auto` only work after you build the add-on for that channel, for example "build Gmail send with approval".
- **Content trust.** Text inside emails, web pages and documents is treated as information, never as an order. If an email says "ignore your rules and send this", Alterbrain does not obey. Email is read by a locked-down helper that cannot write or send.
- **No made-up facts about you.** Drafts list the facts they use. Anything not on your approved fact sheet blocks approval, and so does a private fact you have not cleared for that draft.
- **Guard rails.** Hooks block secrets from being saved, block dangerous git commands, protect the framework files and keep original sources untouched.
- **Coursework notice.** If a course restricts or bans AI, or its rule is unknown, Alterbrain warns you once per assignment and asks if you want to continue. If a course allows AI with disclosure, it drafts the disclosure paragraph for you. If no rule was found for a course (common for online courses), it stays quiet; that is not a check of the provider's terms, so read them yourself. Your answer is not saved in your repository. Follow the rules that apply to you (your school's, your programme's or your course provider's): that is your responsibility.

## Privacy

- **Alterbrain is your own private brain.** It is meant to hold sensitive facts about you (health, family, nationality, beliefs, finances) if you want it to, so it can write accurately for you. It stores them freely. What it guards is what **leaves**.
- Your data stays on your computer and in **your private GitHub repository**. Nobody else can see it unless you invite them. Documents are saved like any other file; only files of 50 MB or more use Git LFS, an add-on for big files.
- Everything in your vault is **processed by Claude (Anthropic)** when it is used in a session, as with any use of Claude. See Anthropic's privacy settings for your plan. That is the trade-off: you control both accounts and what you tell Alterbrain.
- **Never stored, anywhere:** passwords, API keys and tokens, recovery codes, payment card numbers, bank account numbers and IBANs, government ID numbers (passport, BSN, national ID) and answers to security questions. If you share one, Alterbrain does not repeat or save it; keep these in a password manager. Keys go in `.env.local`, which setup creates for you and which is never saved to git.
- **Public and private facts.** Each fact on your fact sheet is marked public or private. Sensitive facts default to private. Anything that leaves your computer (an email, post, application, CV or shared file) uses public facts only, unless you say yes for that one draft.
- **Other people.** Notes about other people hold business facts by default. Their sensitive details are stored only if you ask, stay private and never go into outbound text.
- **Optional encryption.** During setup (or later in `/reconfigure`) you can have your most private notes scrambled before they reach GitHub, so a leak of your GitHub account does not expose them. That covers the PDFs and pictures you keep in those folders too. On your computer they stay normal files. It needs a key file that you must keep safe. See [Encrypting your private notes](system/docs/guides/encrypting-private-notes.md).
- Tools you choose to connect (for example Gmail) share data with those services, as you approve.
- The public Alterbrain repository contains no personal data.

Details: [Privacy and your data](system/docs/guides/privacy-and-data.md).

## Costs

- **Claude Pro** is the baseline. It is enough for normal use.
- **Claude Max** is useful if you use it heavily or want more things running in parallel.
- Alterbrain saves your allowance on purpose: it uses the small model for simple sorting, the middle model for most work, and the largest model only for a few hard judgement steps.
- Everything else (GitHub private repo, Obsidian, Quarto, Git, Node) is **free by default**. The Adzuna job API is free with a key. Optional tools in the catalogue may cost money. The catalogue says so.

## Updating

Type `/update-alterbrain`. Once a week, at the start of a session, Alterbrain also looks (quietly, and only for the number) whether a newer release exists and adds one line to the start-of-session summary if so. It never installs anything by itself. Claude checks the newest release, explains what changed in plain words, and saves a safe restore point first. Core files are replaced exactly. Files you customised are shown to you, and merged only if you approve. Your `my-*` skills and your own words are never touched.

A release sometimes needs a small upgrade to how your notes or settings are stored, for example a new line in a note's header. Those upgrades are listed before you say yes, run only after the restore point is saved, and reported afterwards in plain words. Upgrades that need your judgement about your own notes (for example turning a school setting into a programme note) are not run for you: after the update Claude explains each one, proposes what makes sense, applies only what you approve, and you can skip it and run it later. See [Updating Alterbrain](system/docs/guides/updating.md).

---

## Folder map

```
alterbrain/
├─ README.md, LICENSE, CHANGELOG.md, THIRD_PARTY_NOTICES.md
├─ CLAUDE.md          what Claude reads first (points at the files below)
├─ .claude/           skills, agents, rules and hooks (my-* are yours)
├─ system/            the framework: scripts, hooks, catalogue, templates, blueprints, guides
├─ config/            your settings (brain, autonomy, tools)
├─ state/             your progress (onboarding, proposals); state/local is never saved to git
├─ tests/             automatic tests
├─ docs/              spec, decisions (adr/) and research
└─ vault/             your Obsidian vault
   ├─ Home.md   dashboard
   ├─ 00_inbox/       Tasks.md, outbox (drafts), proposals, captures
   ├─ 10_projects/    assignments, projects, job campaigns
   ├─ 20_areas/       programmes, courses, career
   ├─ 30_wiki/        what Claude has learned for you (concepts, frameworks, companies)
   ├─ 40_sources/     untouched originals, extracted text, source notes
   ├─ 50_learning/    study cards
   ├─ 60_people/      people notes: your contact book (business facts only)
   ├─ 70_journal/     daily, weekly, decisions
   └─ 80_me/          who you are: soul, identity, facts, voice, brand, templates
```

## For maintainers and contributors

- The binding contract is [`docs/SPEC.md`](docs/SPEC.md). If a file disagrees with it, the spec wins.
- Decisions are in [`docs/adr/`](docs/adr/). Research is in [`docs/research/summary.md`](docs/research/summary.md).
- Rules: zero dependencies (Node 20 or newer, ESM `.mjs`), Windows and macOS equal, LF line endings, no personal data, synthetic examples only (our example people are "Alex Doe", an MBA student in Rotterdam, "Jordan Doe", a working professional with no courses, and "Robin Doe", an online learner on Coursera), plain UK English for users.
- To work on the framework itself, create the file `state/local/dev-mode`. This allows framework edits and turns automatic git off.
- Before opening a pull request, run:

```text
node --test "tests/**/*.test.mjs"
node system/scripts/validate.mjs
node system/scripts/doctor.mjs --ci
```

  The same checks run in GitHub Actions on Windows and macOS (Node 22).
- Skills and agents follow the authoring contracts in the spec (sections 7 and 8). Every one declares `model` and `effort`.
- A change to the shape of user data or config (a setting, a note's header, a folder, a path that people's own files point to) ships a migration or a documented fallback in the same release: see section 15a of the spec and `.claude/rules/framework-dev.md`.
- When you port third-party content, add the attribution line from section 18 of the spec, keep the licence notice, and list it in `UPSTREAM-SYNC.md`.

## Credits and licence

From v0.2.0, Alterbrain is released under the **PolyForm Shield License 1.0.0** (see `LICENSE`). In plain words: you may use, copy and change it for any purpose, including your studies and your job, but you may not use it to offer a product that competes with Alterbrain or with products its maintainer builds on it. This summary is not the licence; the `LICENSE` text decides. Versions up to v0.1.1 were released under MIT and stay under MIT. Contributions are welcome under the terms in `CONTRIBUTING.md`.

It builds on ideas and files from open-source work, which keep their own licences, credited in `THIRD_PARTY_NOTICES.md` and `UPSTREAM-SYNC.md`:

- COG-second-brain (MIT, Huy Tieu)
- no-ai-slop (MIT, Peter Yang)
- kepano/obsidian-skills (MIT)
- OpenClaw templates (MIT)
- Quarto extensions that we include

Anthropic's own proprietary skills are not included. Claude, Obsidian, Quarto and the other tools keep their own licences and terms.
