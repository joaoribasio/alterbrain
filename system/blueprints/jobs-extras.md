---
type: "blueprint"
title: "Jobs extras"
kind: "automation"
status: "available"
risk: "medium"
cost: "Free. A weekly scan uses a small part of your Claude plan. JobSpy needs the free tool uv."
---

# Jobs extras

Add-ons for `/jobs`. Pick the ones you want. Each is built the safe way: Alterbrain proposes, you approve, then it builds. Two of them (LinkedIn and JobSpy) touch sites whose rules forbid robots. They are **off by default** and carry a clear warning.

## What it does

Six optional upgrades:

1. **Weekly scan routine.** Alterbrain runs `/jobs scan` for you once a week and leaves the shortlist and a task waiting. Example: on Monday morning your task list shows "Review the job shortlist (4 new)".
2. **Pipeline view.** A table in Obsidian that shows every application by stage, with fit score, visa sponsor status, Dutch needs and deadline. Example: "Preparing (2), Applied (3), Interview (1)".
3. **LinkedIn, read-only (opt-in, risky).** Look at a few company or job pages on LinkedIn while you are logged in. Never sends, connects or posts. Example: "Read this LinkedIn job link and add it to my pipeline."
4. **JobSpy (opt-in, risky).** A free Python tool that collects Indeed and Google Jobs results in one go. It runs through `uv`. Example: "Run JobSpy for 'operations analyst' in Utrecht and add the new ones to my scan."
5. **Networking messages.** Drafts a short, honest note to a person at a company you are interested in (an alum, a hiring manager, a recruiter). You send it yourself. Example: "Draft a note to Sam Example at Harbourline Logistics, who I met at the careers fair."
6. **Fill the form, stop before Submit.** A browser helper fills an application form from your approved CV and letter, then stops and shows you the page. You read it and press Submit yourself. Example: "Fill the Harbourline form but do not submit."

## You'll need

- Alterbrain core set up, and at least one run of `/jobs scan` (so the notes and fields exist).
- For 1: a way to run things on a schedule. See `system/blueprints/always-on-laptop.md` and `system/blueprints/morning-brief.md` for the choices and their limits.
- For 2: Obsidian with the Bases feature (built in), and the existing view `vault/_views/Applications.base`.
- For 3: your own LinkedIn account and the `linkedin` blueprint (`system/blueprints/linkedin.md`). Read that one first.
- For 4: `uv` installed (the setup checks this) and Python 3.10 or newer, which `uv` can fetch for you. [Source: https://github.com/speedyapply/JobSpy | retrieved 2026-10-07 | the project says Python 3.10 or higher, MIT licence, package `python-jobspy`]
- For 5: people notes in `vault/60_people/` with their source and date, and your voice profile (`/onboard`, module M5).
- For 6: the Playwright server (`playwright` in `system/catalogue/mcp.json`) enabled in `config/mcp.selected.json`, and an application note with finished CV and letter files from `/jobs apply`.

## Cost and risk

| Extra | Cost | Risk | Why |
|---|---|---|---|
| 1 Weekly scan | A little plan allowance each week | Low | Reads the web and writes notes. Sends nothing. Local schedules run only while the computer is awake. |
| 2 Pipeline view | Free | Low | A view over your own notes. |
| 3 LinkedIn read-only | Free | **High** | LinkedIn's User Agreement (section 8.2) forbids using scripts, robots or crawlers to scrape or copy the service, and forbids bots. Your account could be restricted. [Source: https://www.linkedin.com/legal/user-agreement, fetched 2026-10-07] |
| 4 JobSpy | Free | **High** | It scrapes job sites. Indeed's terms are widely reported to forbid scraping (**[Unverified]**: clause not read). JobSpy's own README warns about blocks (HTTP 429) on Indeed, LinkedIn and Glassdoor. You may be blocked. Alterbrain will not use its LinkedIn option. |
| 5 Networking messages | Free | Medium | Contact details are personal data. Business facts only, with source and date. A badly judged message can harm a relationship. You send it, never Alterbrain. |
| 6 Fill the form | Free | Medium | The browser touches a real application form. It may fill a wrong field. It stops before Submit. You do the final click. |

Never accepted, whatever you ask: solving CAPTCHAs, typing your passwords, creating accounts on job sites, or pressing Submit for you.

## Questions I'll ask you

Alterbrain asks these one at a time (`/clarify`, type `skill` or `automation`):

1. Which of the six do you want first?
2. For 1: which day and time? How many jobs should it keep each week? (Suggested: 10.) Which roles and cities? (Taken from `career.md`.)
3. For 2: which columns matter to you? (Suggested: stage, company, role, fit, sponsor, Dutch, deadline.) Do you want a "closing soon" view?
4. For 3: do you accept the ban risk for your main account, in your own words? How many page reads a week? (Suggested: at most 20, never in bulk.) Would a safer route do instead, such as LinkedIn job-alert emails that Alterbrain reads?
5. For 4: do you accept the risk of blocks, and the site terms? Which sites? (Suggested: Indeed NL and Google Jobs only.) How many results per search? (Suggested: 20.)
6. For 5: who is the person, how do you know them, and what do you want from the message? (A question, an introduction, advice. Never "give me a job".) Which language?
7. For 6: which application? Does the advert allow applying without an account? Are you happy to log in yourself first?

## Build steps

Written for the agent. Do each extra separately. For each: run `/clarify`, write a proposal card (`/propose`), wait for approval, then build with `/build`.

### 1. Weekly scan routine

1. **Verify first.** Check which scheduling routes exist in this install and read their current limits (desktop scheduled tasks, cloud routines). Mark anything unconfirmed `[Unverified]`.
2. Create `my-jobs-weekly` as a thin skill (`model: haiku`, `effort: low`). It does only this:
   - read today's date from the system;
   - run the `/jobs scan` workflow (`.claude/skills/jobs/workflows/scan.md`) with the saved search brief and **no questions**;
   - **skip the confirm step only for writing notes**; keep the note limit (default 10) and the four-task cap;
   - if the Adzuna keys are missing, or the sponsor register cannot be downloaded, add one `#ab/jobs` task saying so and stop.
3. Schedule it with the user's chosen route. For a cloud routine: prune the connectors to nothing the scan does not need, and no send or post tools at all.
4. Record in `state/built.json`: name, schedule, date from the system.

### 2. Pipeline view

1. Read `vault/_views/Applications.base` and `.claude/skills/obsidian-bases/SKILL.md`.
2. Add to the existing file (keep its current view):
   - a table view "Pipeline" grouped by `stage`, with columns `company`, `role`, `fit`, `sponsor`, `dutch`, `salary_check`, `deadline`;
   - a view "Closing soon": `deadline` set and within 14 days, stage not `applied`, `rejected` or `withdrawn`;
   - a view "Shortlisted": `stage == "shortlisted"`, sorted by `fit` descending.
3. Open the file in Obsidian's Bases viewer if available, or check the YAML by eye. Property names must match the application notes written by `/jobs scan` (`fit`, `sponsor`, `dutch`, `salary_check`).
4. Offer to add a link on `Home.md` only if the user agrees.

### 3. LinkedIn, read-only

1. **Verify first.** Follow Build step 1 of `system/blueprints/linkedin.md`, including re-reading LinkedIn's current rules on automated access.
2. Make sure the user said yes to the ban risk in their own words, in chat. If not, stop.
3. Build the `linkedin` blueprint if it is not built. Confirm `config/autonomy.json` has `linkedin` on `draft`. Do not change it.
4. Add working rules to a note `vault/20_areas/career/LinkedIn rules.md`:
   - only pages the user gives you a link to, one at a time, never a search-results loop;
   - at most the agreed number of page reads per week, and count them in the note with the date;
   - no connection requests, messages, comments, likes or posts;
   - every fact saved with source URL and date;
   - if LinkedIn shows a CAPTCHA, a warning or a login prompt, stop and tell the user.
5. Wire it into `/jobs`: a LinkedIn job link given by the user becomes an application note via `/jobs apply`, with `source: "linkedin"`.
6. Offer the safer route: LinkedIn job-alert emails read by `mail-reader` (treated as data), with the links then passed to `/jobs scan`.

### 4. JobSpy

1. **Verify first.** Open https://github.com/speedyapply/JobSpy and confirm: package name `python-jobspy`, licence, Python version, supported sites and the `scrape_jobs` arguments. Read the README's block warnings. Open each site's current terms and say what you found. Mark anything unread `[Unverified]`.
2. Confirm `uv` works: `uv --version`. If missing, tell the user to install it from https://docs.astral.sh/uv/ and stop. Do not install global packages yourself.
3. Create the helper at `state/local/tools/jobspy/search.py` (not part of the framework, not in git). It must:
   - run with `uv run --with python-jobspy search.py ...`;
   - take `--what`, `--where`, `--results` (max 30) and `--hours-old`;
   - search only the sites the user chose. **Never LinkedIn.** Suggested: `indeed` and `google`;
   - for Indeed, set the country to the Netherlands as the README documents;
   - sleep a few seconds between sites, and stop on the first HTTP 429;
   - print JSON in the same shape as `adzuna.mjs` (`title, company, location, url, created, salary_min, salary_max, description_snippet, source`) with `source: "jobspy-<site>"`;
   - keep no cookies and no logins.
4. Teach `/jobs scan` a new source name `jobspy` in `config/brain.json` `jobs.sources`: edit `.claude/skills/jobs/workflows/scan.md` only through a `my-jobs-scan` copy, not the framework file. Self-build may never edit framework `code` files.
5. Cap use at one search per role and city per day. Log each run in `state/local/cache/jobs/jobspy-log.json`.
6. Record in `state/built.json`.

### 5. Networking messages

1. Read `vault/60_people/<person>.md` (business facts only; check `dnc` is `false`). If there is no note, create one from `system/templates/notes/person.md` with the source and date for each fact.
2. Delegate to the `ghostwriter` agent: `channel: linkedin` or `email`, `recipient_class: professional` (or `recruiter`), the user's real connection to the person, one clear small ask, and `length: short`.
3. The draft goes to `vault/00_inbox/outbox/` as usual. Never contact anyone. Add one `#ab/jobs` task.
4. Rules: at most 3 networking drafts a week; no mass messages; no flattery that cannot be backed; no claims about the person you cannot source; ask nothing personal.

### 6. Fill the form, stop before Submit

1. **Verify first.** Read the Playwright entry in `system/catalogue/mcp.json` and the project page it links, and confirm the pinned version and the install command still match. Check `config/autonomy.json` (`web-forms` channel).
2. Make sure `playwright` is in `config/mcp.selected.json`; run `node system/scripts/mcp-gen.mjs` if you changed it.
3. Create a skill `my-fill-form` (`model: sonnet`, `effort: medium`). Steps:
   - take an application note and its outbox files;
   - open the link the user gives you. If the page needs a login, **stop and ask the user to log in themselves**. Never type a password;
   - fill only fields you can fill from the fact sheet, the CV data and the approved letter. Leave anything unclear empty and list it for the user;
   - upload only the PDFs from the outbox that the user approved (a file upload is allowed only for files the user named);
   - **never** click Submit, Apply, Send or Confirm. The outbound guard also stops this while `web-forms` is on `draft`. Keep it on `draft`;
   - take a screenshot, save it to `state/local/tmp/jobs/`, add a `#ab/jobs` task "Check the filled form for <Role> and press Submit yourself", and tell the user where to look;
   - if a CAPTCHA appears, stop and tell the user.
4. Record in `state/built.json`.

## How to test

1. **Weekly scan:** run `my-jobs-weekly` by hand. Expect a summary note, at most four tasks, and no messages sent. Run it twice the same day: expect no duplicate application notes.
2. **Pipeline view:** open the view in Obsidian. Expect one row per application note and the new columns filled in.
3. **LinkedIn:** give it one public job link. Expect one application note with the source and date. Then ask it to "send a connection request". Expect the outbound guard to refuse and offer a draft.
4. **JobSpy:** run it for one search with `--results 5`. Expect JSON in the standard shape, no LinkedIn rows, and a log entry. Run it with a made-up site. Expect a polite refusal.
5. **Networking:** ask for a draft to a person with `dnc: true`. Expect a refusal. Ask for a normal one. Expect a draft in the outbox and a facts table.
6. **Fill the form:** test on a harmless practice form first. Expect fields filled, a screenshot, a task, and **no submit**.

## How to undo

- **1:** delete the schedule, run `/remove-skill my-jobs-weekly`, remove its line from `state/built.json`.
- **2:** remove the extra views from `vault/_views/Applications.base`. Your notes are unchanged.
- **3:** follow "How to undo" in `system/blueprints/linkedin.md`. Remove the working-rules note if you wish.
- **4:** delete `state/local/tools/jobspy/` and remove `jobspy` from `jobs.sources` in `config/brain.json`. Past results stay in your notes.
- **5:** nothing to undo. Drafts in the outbox can be deleted.
- **6:** run `/remove-skill my-fill-form` and remove its line from `state/built.json`. Remove `playwright` from `config/mcp.selected.json` if nothing else needs it, then run `node system/scripts/mcp-gen.mjs`.
