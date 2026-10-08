---
type: "assignment"
created: "YYYY-MM-DD"
course: "[[20_areas/courses/<course-slug>/course]]"
title: ""
deadline: "YYYY-MM-DD"
deadline_confirmed: false
questions: []
limits: { pages: 6, font_pt: 11, line_spacing: 1.15, words: null }
deliverables: ["pdf"]
rubric: "[[10_projects/<folder>/rubric]]"
team: []
team_name: ""
team_number: ""
templates: []
tone: ""
voice_mode: ""
grade: ""
feedback: ""
lenses: ["devils-advocate", "premortem", "board", "specialists", "grader"]
stop_rule: { target_grade: 9, plateau_rounds: 2 }
status: "setup"
---
# <Assignment title>

<!-- The one template for vault/10_projects/<YYYY> <course-slug> <assignment-slug>/assignment.md (spec section 13). With no course the folder is <YYYY> <assignment-slug>.
     course: a link to the course note, or "" when the assignment belongs to no course.
     questions: one item per question, copied word for word, each a double-quoted string, as a block list:
       questions:
         - "Question 1 text"
         - "Question 2 text"
     deadline_confirmed: true only once you have seen the date on the course site or the syllabus yourself.
     limits: pages and words may be null when the course sets none.
     deliverables: any of pdf, xlsx, docx, pptx.
     team, team_name, team_number: the team for THIS assignment, names only, and only if you give them. Covers, title slides and file names read them from here. Empty for an individual assignment. The course note keeps only a default to pre-fill. An older assignment note without these keys falls back to the course note's default, confirmed with you.
     templates: slugs of document templates for this assignment (the most specific level wins: system/lib/templates.mjs). Empty means the course, programme or default template applies.
     tone: academic, professional or conversational. Empty means the course, programme or recommended default. A formality dial on top of your own voice, never a replacement.
     voice_mode: for group work only, "me" (sounds like you) or "team" (a neutral team voice). Empty for individual work, or until asked.
     grade: the grade as given, for example "7.5/10". Empty until work comes back. feedback: link to feedback.md once you have it (/assignment feedback).
     stop_rule.target_grade: the grade you aim for, on a 10-point scale (default 9). A pass/fail course gets 7, "a clear pass".
     status moves: setup, brief, draft, critique, final, shipped. -->

## Questions (word for word)

1. <Question 1>

## Assignment text (as given)

<Only when you pasted the assignment text: saved verbatim, never tidied. Leave out when the questions above are all there is.>

## Deadline

- **Date:** <YYYY-MM-DD>, <time and time zone, if known>
- **Confirmed on the course site:** <yes or not yet>
- **Late work:** <penalty, if any>

## Limits

- **Pages:** <n>. Cover counts: <yes or no>. References count: <yes or no>.
- **Words:** <n or none>
- **Font and spacing:** <11 pt, 1.15>
- **Other rules:** <e.g. file names on the course site must carry initials>

## Deliverables

- <PDF report>

## Sources (and the case, if it is one)

- **Case note:** <[[20_areas/courses/<course-slug>/cases/<Case title>]], or none when this is not a case>
- **Sources:** <links to source notes in 40_sources/notes>

## Team

<Names only, if you gave them. Otherwise "Individual".>

## AI use disclosure (draft)

<Only when the course policy is allowed-with-disclosure. A draft for you to edit before it goes in the report.>

## Log

- <YYYY-MM-DD>: set up.
