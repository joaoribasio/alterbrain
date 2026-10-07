# Menu groups

The overview shows these eight groups, in this order. Each row: the skills behind the group, and three example prompts the user can copy. Show a skill only if `.claude/skills/<name>/SKILL.md` exists. If none of a group's skills exist, show the group under "Available to build" instead.

## 1. Study
Skills: `study`, `ask`, `framework`
- "Explain the Value Chain using my own lecture notes."
- "Make study cards from this week's Corporate Finance slides."
- "Quiz me on the cards that are due today."

## 2. Assignments
Skills: `assignment`, `clarify`
- "Start my Strategy assignment. Here is the brief."
- "Critique my draft like a tough grader."
- "Turn my draft into a PDF that fits in 6 pages."

## 3. Email
Skills: `reply`, `edit-voice`
- "Draft a reply to the latest email from my professor."
- "Summarise the emails I got from the programme office this week."
- "Make this email sound more like me."

## 4. Jobs
Skills: `jobs`
- "Find strategy roles in Rotterdam from employers that can sponsor a visa."
- "Write a cover letter for this job ad, using only facts from my fact sheet."
- "Which of my applications need something from me this week?"

## 5. Documents
Skills: `render`, `edit-voice`
- "Turn this note into a PDF with my colours and fonts."
- "Make a one-page memo from my case notes."
- "Check this text for phrases that sound like AI."

## 6. Knowledge
Skills: `ingest`, `ask`, `capture`, `weekly-review`, `learn`
- "Add this PDF, or the zip I downloaded from my course site, to my sources and tell me what's in it."
- "What do my notes say about network effects? Show the sources."
- "Remind me to email my study group on Friday."

## 7. Build something new
Skills: `propose`, `build`, `remove-skill`, `clarify`
- "I keep summarising case readings by hand. Could you make that a skill?"
- "Show me what you can build for me."
- "Remove the skill you built last week."

## 8. Settings & help
Skills: `reconfigure`, `onboard`, `health-check`, `update-alterbrain`, `menu`
- "Let me approve emails before they are sent."
- "Something isn't working. Can you check my setup?"
- "Is there a new version of Alterbrain?"

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
| Canvas, Brightspace, Moodle, learning platform, course site, course files, download everything, zip | Knowledge: importing course material (`ingest`). There is no connection to the learning platform. The user downloads the files from the course site and gives me the folder or zip. For "how do I download them?" give the steps in `.claude/skills/onboard/workflows/M3-programme.md` ("Bring your course material"); the import itself is in `.claude/skills/ingest/references/course-material.md`. |
