---
type: "guided-migration"
id: "0003-programme-note"
summary: "If your settings name a school or programme, offers to make a programme note from them and link your courses to it."
since: "0.2.0"
---
# Programme note

## Who this is for

Installs from before 0.2.0 that kept the school and programme in `config/brain.json` (`school.name`, `school.programme`) and have no programme note for it. From 0.2.0, facts that hold for a whole programme live once in a programme note, and each course links to it with a `programme` property. Everyone else has nothing to do here.

## Evaluate

Read only. Do not write anything in this step.

1. Read `config/brain.json`. If it has no `school` block, or both `school.name` and `school.programme` are empty, there is nothing to offer: record it as done with `node system/scripts/update.mjs guided done 0003-programme-note.md`, say so in one line and stop.
2. Work out the note title: `<programme> – <school>` (en dash) when both are set, otherwise whichever one is set. Make it safe as a file name and an Obsidian link: replace `\ / : * ? " < > | # ^ [ ]` and control characters with spaces, collapse whitespace, drop trailing dots, cut at 100 characters at a word boundary.
3. List `vault/20_areas/programmes/*.md`. If a note with that title exists (ignore capitals), it is used as it is and never rewritten.
4. List `vault/20_areas/courses/*/course.md`. A course is a candidate when its `type` is `course`, it has no `programme` and no `provider`, and its `school` is empty or matches `school.name` (ignore capitals and spacing). A course that names a different school is left out; say how many.
5. Read `.claude/skills/course/references/course-setup.md`, section "The programme note", and `system/templates/notes/programme.md`. They are the current procedure and the current shape of the note.
6. If a matching note exists and no course is a candidate, there is nothing left to do: record it as done, say so in one line and stop.

## Propose

Show what you found in plain words: the title, whether the note already exists, and the candidate courses by name, plus any left out for a different school. Then ask once with AskUserQuestion:

- **Do it now (recommended)**: you get one place for the programme's term dates, AI rule, grading scale and submission rules, and the courses stop repeating them. Costs a minute, and the course notes each gain one line.
- **Not now**: nothing changes and the question comes back. Costs nothing, but the programme facts stay spread over the course notes.
- **Skip it**: nothing changes and the question is not asked again by itself. You can still ask later.

If they say yes and some candidate courses should not be linked, let them untick those before you write.

## Apply

Only after a yes, and only these writes:

1. If the note does not exist, create `vault/20_areas/programmes/<title>.md` from `system/templates/notes/programme.md`, following "The programme note" in `course-setup.md`. Fill `provider` from `school.name` and leave every other fact empty. Do not ask the long programme question here; say they can add the facts when they next set up a course.
2. In each approved course note, set `programme: "[[<title>]]"` with the same line-level edit as `setFrontmatterLine` in `system/lib/migrate.mjs`: add or replace that one frontmatter line (after `school`, `term` or `code` if present), keep the file's line endings, change nothing else in the note.
3. Record the outcome: `node system/scripts/update.mjs guided done 0003-programme-note.md`.
4. Report in two lines what was created and how many courses were linked.

## If skipped

The `school` block in `config/brain.json` and the `school` line in course notes stay as they are, and the code keeps reading them as a display name. Nothing is lost. Record it with `node system/scripts/update.mjs guided skip 0003-programme-note.md`. To run it later, say "run a skipped upgrade again" or "make my programme note".

## Never

- Never remove or edit `school.name`, `school.programme` or a course's `school` line.
- Never rewrite an existing programme note, or any other line of a course note.
- Never invent a programme fact (dates, AI rule, grading scale); leave it empty.
- Never touch `vault/40_sources/raw/`, `.env.local`, settings files, `my-*` skills or framework files.
