# Menu groups

The overview shows these eight groups, in this order. Each row: the skills behind the group, and three example prompts the user can copy. Show a skill only if `.claude/skills/<name>/SKILL.md` exists. If none of a group's skills exist, show the group under "Available to build" instead.

## Which prompts to show

Each group has a **study** variant and, where the job differs, a **work** variant.

- **Kind:** `config/brain.json` `learner.kind`. If it is missing or empty, treat it as `mba` when `packs` lists `mba` or a `school` block exists (older installs). Still unknown: use the study prompts.
- `professional` → the work variant. Every other kind (`mba`, `degree`, `online`, `other`) → the study variant.
- **Courses and Assignments** (the `/course` skill in group 1 and the whole of group 2) are shown when the kind is not `professional`, or when `vault/20_areas/courses/*/course.md` holds at least one course note. For a professional without a course, leave them out and say nothing; if the user asks, say "Add a course with `/course new` and these appear."
- Country-specific prompts (the visa example in group 4) are shown only when `packs` lists the matching country pack (`country-nl`).

## 1. Study
Skills: `course`, `study`, `ask`, `framework`

Study variant:
- "I'm starting Marketing next term. Set it up: here are my slides, readings and Excel files."
- "Explain opportunity cost using my own lecture notes."
- "Make study cards from this week's slides."

Work variant (no `/course`):
- "Explain unit economics using the articles I saved."
- "Make study cards from the report I added yesterday."
- "Which framework fits the pricing question in my project? Apply it."

## 2. Assignments
Skills: `assignment`, `clarify`

- "Start my Strategy assignment. Here is the brief."
- "Critique my draft like a tough grader."
- "Turn my draft into a PDF that fits in 6 pages."

Shown only as described under "Which prompts to show". There is no work variant: a report or project write-up without a course goes through Documents (group 5).

## 3. Email
Skills: `reply`, `edit-voice`

Study variant:
- "Draft a reply to the latest email from my lecturer."
- "Summarise the emails I got from my school or course provider this week."
- "Make this email sound more like me."

Work variant:
- "Draft a reply to the latest email from my manager."
- "Summarise the emails my team sent me this week."
- "Make this email sound more like me."

## 4. Jobs
Skills: `jobs`

Study variant:
- "Find internships or graduate roles in my city that fit my profile."
- "Write a cover letter for this job ad, using only facts from my fact sheet."
- "Which of my applications need something from me this week?"

Work variant:
- "Find roles one step up from my current one in my city."
- "Write a cover letter for this job ad, using only facts from my fact sheet."
- "Which of my applications need something from me this week?"

With `country-nl` in `packs`, swap the first prompt for "Find strategy roles in Rotterdam from employers that can sponsor a visa." when the user needs sponsorship (`jobs.needs_sponsorship`).

## 5. Documents
Skills: `render`, `edit-voice`

Study variant:
- "Turn this note into a PDF with my colours and fonts."
- "Make a one-page memo from my case notes."
- "Check this text for phrases that sound like AI."

Work variant:
- "Turn this note into a PDF with my colours and fonts."
- "Make a one-page memo from my project notes."
- "Check this text for phrases that sound like AI."

## 6. Knowledge
Skills: `ingest`, `ask`, `capture`, `weekly-review`, `learn`

Study variant:
- "Add this PDF, or the zip I downloaded from my course site, to my sources and tell me what's in it."
- "What do my notes say about network effects? Show the sources."
- "Remind me to email my study group on Friday."

Work variant:
- "Add this PDF, or the folder of reports I use at work, to my sources and tell me what's in it."
- "What do my notes say about our pricing? Show the sources."
- "Remind me to send my team the update on Friday."

## 7. Build something new
Skills: `propose`, `build`, `remove-skill`, `clarify`

Study variant:
- "I keep summarising case readings by hand. Could you make that a skill?"
- "Show me what you can build for me."
- "Remove the skill you built last week."

Work variant:
- "I keep writing the same weekly status update by hand. Could you make that a skill?"
- "Show me what you can build for me."
- "Remove the skill you built last week."

## 8. Settings & help
Skills: `reconfigure`, `onboard`, `health-check`, `update-alterbrain`, `menu`

- "Let me approve emails before they are sent."
- "Something isn't working. Can you check my setup?"
- "Is there a new version of Alterbrain?"

To change what the user is learning or doing (MBA, degree, online courses, working), `/reconfigure` has a row for it. It has another row to switch the 25 MBA business frameworks on or off, for a user who is not on an MBA. Mention either only when the user's words point that way.

## Helpers that are not in the menu

`obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli` and `defuddle` (from kepano/obsidian-skills, Obsidian's own team) are working helpers that I use behind the scenes. Do not list them as commands. For "how do I use Obsidian?" point to `system/docs/guides/using-obsidian.md`. `obsidian-cli` and `defuddle` are optional: they only help when Obsidian is open or Node's `npx` is available, and Alterbrain works without them.

## Matching blueprints to groups

Use the blueprint `title` and `kind` to place each "available to build" item under the closest group:

| Words in title | Group |
|---|---|
| flashcard, study, Anki, Zotero, reading | Study or Knowledge |
| email, Gmail, Outlook, calendar | Email |
| LinkedIn, job | Jobs |
| Instagram, Telegram, WhatsApp | Build something new (channels) |
| always-on, schedule, server, morning brief, cost | Settings & help (automations) |

When unsure, put it under "Build something new".

## Words that point to a group

When the user's own words (a request, or a "how do I" question) include one of these, show the group on the right.

| Words | Group |
|---|---|
| Canvas, Brightspace, Moodle, Coursera, edX, learning platform, course site, course files, download everything, zip | Knowledge: importing course material (`ingest`). There is no connection to any learning platform, school or provider. The user downloads the files from the course site and gives me the folder or zip. For "how do I download them?" give the steps in `.claude/skills/course/references/course-setup.md` ("The download steps"), and say plainly when a provider offers no bulk download (then files go in one by one); the import itself is in `.claude/skills/ingest/references/course-material.md`. For a whole course (syllabus, slides, readings, Excel files, briefs), point to Study: `course`. |
| new course, new block, new term, start a course, set up a course, add a course | Study: `course`. It asks for everything the user has for the course, reads the syllabus for deadlines and the AI rule, and keeps a list of the material in the course note. |
| change what I'm learning, I'm not studying any more, I started an MBA, I'm taking online courses, I started a job | Settings & help: `reconfigure`, "Change what I'm learning or doing". |
| business frameworks, switch on the frameworks, turn off the MBA frameworks | Settings & help: `reconfigure`, "Switch the MBA frameworks on or off". It works for any kind of learner and changes nothing else. |
