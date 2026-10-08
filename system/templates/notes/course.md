---
type: "course"
created: "{{date}}"
status: "active"
code: ""
term: ""
programme: ""
provider: ""
ai_policy: "unknown"
ai_policy_quote: ""
session_dates: []
class_days: []
term_start: ""
term_end: ""
class_days_asked: ""
team: []
team_name: ""
team_number: ""
templates: []
tone: ""
ai_log: false
---
# {{title}}

<!-- The one template for vault/20_areas/courses/<course-slug>/course.md. Onboarding, /course and /assignment all use it (procedure: .claude/skills/course/references/course-setup.md).
     programme: a link to the programme note, "[[MBA – RSM]]", for a course that belongs to a programme. provider: the school or platform name, for a standalone course (for example Coursera). Both are optional; set the one that applies. Programme-wide facts live in the programme note (vault/20_areas/programmes/); list here only what differs.
     status is active or completed (a finished course; /weekly-review then stops asking about it).
     ai_policy is one of: allowed, allowed-with-disclosure, restricted, banned, unknown, none-stated.
     unknown means not checked yet, or unclear. none-stated means no rule was found in what was read (the course files, the programme note, and the provider's terms only if they were given); it does not mean the provider was checked. Set only for an online or provider course, or when you confirm there is no rule.
     ai_policy_quote holds the policy sentence copied word for word from the syllabus or the course site. A rule taken from the programme starts with "Programme rule: ".
     Leave "unknown" until you have seen the policy yourself.
     session_dates, class_days, term_start and term_end drive the "New material?" reminder after a class (session digest). All may stay empty.
     session_dates: dates of class meetings exactly as the syllabus states them, as "YYYY-MM-DD" (never invented; not deadlines or exams).
     class_days: only when the syllabus has no dates: the weekdays of class, for example ["tue", "thu"]. term_start and term_end: "YYYY-MM-DD", the first and last day of the term, if known.
     Classes on or before the day this note was made (created) are never asked about. Without term_end the reminder stops 16 weeks after term_start (or after created).
     class_days_asked: the date Alterbrain asked which days the class meets, so it does not ask again unprompted. Leave it empty until then.
     team, team_name, team_number: the team for group work in this course, recorded once and reused for covers, title slides and file names. Names only, and only what you give. Leave empty for individual courses.
     templates: slugs of document templates that apply to this course (school or lecturer templates). tone: academic, professional or conversational; empty means the programme or the recommended default.
     ai_log: true when the course requires an AI-use log (offered, never forced); each assignment folder then gets ai-log.md.
     Remove this comment when you fill the note. -->

## Overview

<What the course is about, in one or two lines. Instructor names and roles only: business details, never private ones.>

## AI policy

> <The policy text, word for word, with where you found it.>

<What it means in plain words. Set `ai_policy` in the front matter to match.>

## Grading

| Component | Weight | Due | Notes |
|---|---|---|---|
| <e.g. Case report 1> | <e.g. 20%> | <YYYY-MM-DD> | <individual or team> |

## Submission rules

- **Page or word limit:** <e.g. six pages including tables and references; the cover does not count>
- **Format:** <e.g. 11 pt, line spacing 1.15, PDF>
- **File names on the LMS:** <the rule, if the course sets one>
- **Late work:** <the penalty, if stated>
- **Extra files:** <e.g. an Excel file with every calculation>

## Sessions

<Links to notes in sessions/. One line each.>

## Cases and assignments

<Links to notes in cases/ and to project folders in 10_projects/.>

## Material

<Index of this course's files, grouped by type and session. Kept by /course and /ingest from the source notes. Leave empty groups out.>

## How this instructor grades

<What earns and loses marks, from the syllabus, slides or the instructor's own words. Cite the source note.>

## Sources

<Sources cited in this note that are not part of the course files, such as articles or company reports. The course files are listed under Material.>
