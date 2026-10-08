---
type: "programme"
created: "{{date}}"
status: "active"
provider: ""
level: ""
start: ""
end: ""
ai_policy: "unknown"
ai_policy_quote: ""
grading_scale: ""
templates: []
tone: ""
max_upload_mb: null
csl: ""
---
# {{title}}

<!-- One note per programme (a degree, an MBA, a certificate track), at vault/20_areas/programmes/<Programme name>.md. Courses link here with programme: "[[{{title}}]]" and repeat only what differs. A standalone course (for example from Coursera) has no programme note and names its provider instead.
     Procedure: .claude/skills/course/references/course-setup.md, "The programme note". Facts only from documents or the user, never guessed. Leave anything unknown empty.
     status is active or completed. provider is the school or platform, for example Rotterdam School of Management. level is for example MBA, MSc, BSc or certificate. start and end are YYYY-MM-DD. In the Terms table, Start and End hold YYYY-MM-DD only (courses copy them and the session digest reads nothing else); wording such as "Week 40" goes in the Term cell and Start and End stay empty.
     ai_policy is one of: allowed, allowed-with-disclosure, restricted, banned, unknown, none-stated (the same values as a course). ai_policy_quote holds the programme- or school-wide rule word for word. grading_scale is for example "1-10, pass 5.5" or "A-F".
     templates: slugs of document templates for the whole programme (for example a school report template). tone: academic, professional or conversational, the default for every course here. max_upload_mb: the upload limit of the submission platform, a number or null. csl: the citation style the programme requires ("apa" or a file name in a template), or empty.
     Remove this comment when you fill the note. -->

## Terms

| Term | Start | End |
|---|---|---|
| <e.g. Block 1> | <YYYY-MM-DD> | <YYYY-MM-DD> |

## AI rule

> <The programme- or school-wide rule, word for word.>

<Where it comes from (handbook, integrity policy, page, date) and what it means in plain words. Set `ai_policy` in the front matter to match. A course's own rule wins.>

## Grading

<The grading scale and the rules that hold for every course: pass mark, rounding, resits.>

## Submission conventions

<Platform, file names, cover page, word-count rules, late work.>

## Career services

<Name, where to find them and how to book.>

## Courses

Courses link here with the programme property. Obsidian's backlinks pane lists the courses that link here.
