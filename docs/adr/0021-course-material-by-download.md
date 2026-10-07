# 0021. Course material arrives by download, not by a learning-platform connection

Status: accepted (2026-10-07, framework owner)

## Context
The first version listed a Canvas integration: a `canvas-mcp` entry in the tool catalogue and a `canvas-sync` blueprint that would read courses, files and deadlines from the school's Canvas site through its API. It needs an API token from the student. The product owner's school does not allow that kind of access, and other schools may not either, so the integration could not be offered as a default path. [Unverified: what other schools allow was not checked.] A tool that works for some students and is forbidden for others is a poor foundation for onboarding.

What students actually need is simpler: their slides, readings, cases and course pages in the vault, so that answers come from their own material with sources. Every learning platform lets a student download files, and `/ingest` (ADR 0007) already copies files in untouched, with provenance.

## Decision
- **No learning-platform connection.** The `canvas-sync` blueprint, the `canvas-mcp` catalogue entry and the `school.lms` setting are removed. The tool catalogue says so in one line.
- **The student downloads; Alterbrain reads.** Onboarding M3 ("Bring your course material") explains in plain words how to download everything from a course site (Canvas as the example: Files, select all, Download gives a zip) and how to save the syllabus, assignment pages and announcements as PDF, because "download all files" leaves out the pages that hold the deadlines and the AI rules. The student then gives the zip or a folder to `/ingest`, now or later (a task keeps the steps). The steps are written from general knowledge of Canvas and are [Unverified] for any given school; the workflow says so rather than insist on a button name.
- **`ingest.mjs` opens zips and takes `--course`.** A zip named on the command line, or found inside a folder, is unpacked with the computer's own bsdtar (or `unzip`) into a private temporary folder, and every file goes through the normal per-file path with the origin `<zip name>/<inner path>`. The zip itself is not stored. `--course "<Course name>"` is written on each new manifest entry.
- **A zip is refused as a whole, never half used.** Raw sources are immutable, so a half-unpacked zip would put damaged or partial files in the vault for good. The script reads the zip's index first and refuses the whole zip, with a plain reason, when it holds a path that leads outside its folder (zip-slip) or a link, is password protected, damaged or truncated, holds more than 5000 files or 2 GB, holds two names that Windows and macOS treat as one file, gives a different number of files than it lists when unpacked, or does not unpack cleanly. A watcher stops the tool if the unpacked size passes the limit, because a zip's declared sizes can be false. A zip inside a zip is stored as a plain file and not opened, so nested zips cannot multiply and the origin trail stays clear.
- **The `/ingest` skill has a course-material flow** (`.claude/skills/ingest/references/course-material.md`): it infers the course and asks once, links each source note to the course note, offers to put deadlines from a syllabus or assignment page into the course note and the task list (it never invents a date), and works in batches of about 50 notes per run.
- **The coursework notice does not run at import.** `core.md` rule 6 applies to assignment work, and importing readings is not that. The notice runs when the user asks to start or draft an assignment, through `/assignment`.

## Consequences
- One manual step per course, instead of a live connection. Material does not update itself: new slides need a new download.
- No live deadlines from the platform. Deadlines come from the syllabus and assignment pages the student saves, and the student confirms them.
- It works for any platform and any school, with no token and no terms-of-service risk from automated access.
- The safety checks cost whole zips: one bad entry loses the zip, and the message tells the student to unzip it themselves.
- Course files are copyright material. They stay in the student's own vault and private backup, never in the public framework.
- Not run: the `unzip` fallback (only bsdtar was installed where this was built), Linux (its default `tar` cannot read zips, so it needs bsdtar or `unzip`), a real learning-platform download with thousands of files, and the text extraction time for many PDFs. The time estimates in the skill are labelled as estimates.

## Alternatives considered
- **Keep the Canvas MCP and blueprint as an option.** Works where the school allows tokens, and is dead weight where it does not. Rejected for the default path, and a connector can still be added later through the normal self-build route if a student's school allows it.
- **Browser automation or scraping of the course site.** Brittle, and automated access is what some schools forbid. Rejected.
- **Canvas's own "view course content offline" export.** Might be a better route where it is switched on. Not evaluated; it is an open point in the SPEC.
- **Unzip in the skill with whatever tool is at hand.** Skips the checks that make a zip safe to open. Rejected: the script does it.
- **Keep what is good in a partly bad zip.** Would report a partial import as fine and leave damaged files in an immutable store. Rejected.
