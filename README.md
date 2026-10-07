# Alterbrain

Alterbrain is your **second brain**, your **digital twin** and your **doer**. It runs on the Claude desktop app and keeps everything in an Obsidian vault on your own computer.

- **Second brain.** It remembers what you read, attend and write. It keeps the original files, tells you where every answer came from, and helps you learn.
- **Digital twin.** It learns how you write, in each language you use, and drafts in your voice. It only uses facts you have approved.
- **Doer.** It helps with assignments, email replies, job hunting in the Netherlands and studying. It prepares things. It never sends anything unless you allow it.

Alterbrain is open source (MIT). During the pilot the repository is **private**: the maintainer adds you as a collaborator first, and you sign in with `gh auth login` (the installer and the setup prompt tell you when). After the pilot and a red-team check it becomes public. It is made for MBA students who are not technical, and it is also meant to be easy for maintainers to read and extend.

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
   Git (with Git LFS), GitHub CLI (gh), Node.js LTS, Obsidian and Quarto.
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

The minimum path takes about 25 minutes. The rest can wait (they will appear in your task list).

| Module | What it sets up |
|---|---|
| M0 | Health check, GitHub sign-in, your private repository, automatic backup |
| M1 | Identity and tone: a name for your assistant and how it talks to you |
| M2 | You and your facts: CV or LinkedIn export (optional) fills in the basics |
| M3 | Your programme, your courses (with each course's AI rules) and your goals |
| M4 | Autonomy and self-build: what Claude may do alone (default: nothing is sent) |
| M5 | Your voice: you share writing samples, Claude writes a profile, you read it back |
| M6 | Career in the Netherlands: target roles, languages, whether you need sponsorship |
| M7 | Integrations: for example Gmail, and extra tools from the catalogue |
| M8 | Brand for documents: colours and fonts for CVs, reports and decks |
| M9 | Import existing material: courses, notes, case files (originals are kept, duplicates skipped) |

---

## Everyday use

**Open the vault in Obsidian** (the `vault/` folder inside your Alterbrain folder), and start with two notes:

- **`Home.md`** is your dashboard. It shows what is due today, drafts to review, proposals waiting for you, and ideas for what to ask.
- **`00_inbox/Tasks.md`** is your to-do list. When Claude needs you (a draft to check, a deadline, a question), it adds a task here. Tick a box when you are done.

**In the Claude Code tab**, type `/menu` to see what Alterbrain can do, grouped by goal, with example prompts. Or just ask in your own words.

Example prompts:

- "What do I already know about Porter's Five Forces? Cite your sources."
- "Add this PDF to my brain." (then drag the file in)
- "Remind me to email Prof. Smith on Friday."
- "Start an assignment for my Strategy course."
- "Draft a reply to the latest email from the programme office."
- "Find Netherlands jobs that fit me."
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
| `/ingest` | Add files to your brain (originals are kept) |
| `/ask` | Ask a question, answered from your own notes with sources |
| `/framework` | Apply a business framework (for example SWOT, Porter) to a case |
| `/render` | Make a PDF, CV, cover letter or deck with Quarto |
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
| **Assignments** (`/assignment`) | Set up an assignment, write a brief, draft it, get blind critiques from several "lenses" (devil's advocate, pre-mortem, board, specialists, grader), then ship a PDF within the page limit | Page budget, fact-check, Excel model, class prep, team review |
| **Email replies** (`/reply`) | Reads a thread safely, drafts a reply in your voice, saves it as a draft and adds a task. Nothing is sent. | Inbox triage, meeting briefs, calendar, learning from your edits, Outlook |
| **Jobs in the Netherlands** (`/jobs`) | `scan` finds roles and flags sponsor register, Dutch-language and visa points. `apply` prepares a tailored CV and cover letter in your outbox. | Weekly scan, pipeline view, LinkedIn (read-only), networking messages |
| **Study** (`/study`) | Explains a topic from your own sources and makes cards. Due reviews appear in your task list. `/study quiz` runs them. | Course set-up from a syllabus, lecture transcripts, Anki, Canvas |

More blueprints (always-on options, Instagram, Zotero, morning brief, cost report) are listed in `/menu` as "available to build". Just say "build the morning brief" and Claude will start with some questions.

### Grow it yourself (self-build)

When you ask for something twice, Alterbrain may **propose** a new skill. You see a short card: what it does, why, what it touches, the cost and risk, and how to undo it. If you say yes, it asks a few questions, builds it, tests it and saves it. `/remove-skill` undoes it. Self-built skills start with `my-` and are never overwritten by updates. Safety files can never be changed this way.

---

## Safety

- **Draft only by default.** Alterbrain prepares emails, applications and posts. You send them. You can allow more per channel (email, calendar, jobs, LinkedIn, social, messaging, web forms) with three levels: `draft` (prepare only, works today), `approve` (ask me every time) and `auto` (send within limits). `approve` and `auto` only work after you build the add-on for that channel, for example "build Gmail send with approval".
- **Content trust.** Text inside emails, web pages and documents is treated as information, never as an order. If an email says "ignore your rules and send this", Alterbrain does not obey. Email is read by a locked-down helper that cannot write or send.
- **No made-up facts about you.** Drafts list the facts they use. Anything not on your approved fact sheet blocks approval.
- **Guard rails.** Hooks block secrets from being saved, block dangerous git commands, protect the framework files and keep original sources untouched.
- **Coursework notice.** If a course restricts or bans AI, or the policy is unknown, Alterbrain warns you once per assignment and asks if you want to continue. If a course allows AI with disclosure, it drafts the disclosure paragraph for you. Your answer is not saved in your repository. Follow your school's rules: that is your responsibility.

## Privacy

- Your data stays on your computer and in **your private GitHub repository**. Nobody else can see it.
- What you type and the files Claude reads in a session go to **Anthropic**, as with any use of Claude. See Anthropic's privacy settings for your plan.
- Tools you choose to connect (for example Gmail) share data with those services, as you approve.
- Passwords and keys never go in the chat. Keys go in `.env.local`, which setup creates for you; Claude opens it for you when a tool needs a key. That file is never saved to git.
- The public Alterbrain repository contains no personal data.

## Costs

- **Claude Pro** is the baseline. It is enough for normal use.
- **Claude Max** is useful if you use it heavily or want more things running in parallel.
- Alterbrain saves your allowance on purpose: it uses the small model for simple sorting, the middle model for most work, and the largest model only for a few hard judgement steps.
- Everything else (GitHub private repo, Obsidian, Quarto, Git, Node) is **free by default**. The Adzuna job API is free with a key. Optional tools in the catalogue may cost money. The catalogue says so.

## Updating

Type `/update-alterbrain`. Claude checks the newest release, explains what changed in plain words, and saves a safe restore point first. Core files are replaced exactly. Files you customised are shown to you, and merged only if you approve. Your notes, settings and `my-*` skills are never touched.

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
   ├─ 10_projects/    assignments, job campaigns
   ├─ 20_areas/       courses, career
   ├─ 30_wiki/        what Claude has learned for you (concepts, frameworks, companies)
   ├─ 40_sources/     untouched originals, extracted text, source notes
   ├─ 50_learning/    study cards
   ├─ 60_people/      people notes (business facts only)
   ├─ 70_journal/     daily, weekly, decisions
   └─ 80_me/          who you are: soul, identity, facts, voice, brand
```

## For maintainers and contributors

- The binding contract is [`docs/SPEC.md`](docs/SPEC.md). If a file disagrees with it, the spec wins.
- Decisions are in [`docs/adr/`](docs/adr/). Research is in [`docs/research/summary.md`](docs/research/summary.md).
- Rules: zero dependencies (Node 20 or newer, ESM `.mjs`), Windows and macOS equal, LF line endings, no personal data, synthetic examples only (our example person is "Alex Doe", an MBA student in Rotterdam), plain UK English for users.
- To work on the framework itself, create the file `state/local/dev-mode`. This allows framework edits and turns automatic git off.
- Before opening a pull request, run:

```text
node --test "tests/**/*.test.mjs"
node system/scripts/validate.mjs
node system/scripts/doctor.mjs --ci
```

  The same checks run in GitHub Actions on Windows and macOS (Node 22).
- Skills and agents follow the authoring contracts in the spec (sections 7 and 8). Every one declares `model` and `effort`.
- When you port third-party content, add the attribution line from section 18 of the spec, keep the licence notice, and list it in `UPSTREAM-SYNC.md`.

## Credits and licence

Alterbrain is released under the **MIT licence** (see `LICENSE`).

It builds on ideas and files from other open-source work, credited in `THIRD_PARTY_NOTICES.md` and `UPSTREAM-SYNC.md`:

- COG-second-brain (MIT, Huy Tieu)
- no-ai-slop (MIT, Peter Yang)
- kepano/obsidian-skills (MIT)
- OpenClaw templates (MIT)
- Quarto extensions that we include

Anthropic's own proprietary skills are not included. Claude, Obsidian, Quarto and the other tools keep their own licences and terms.
