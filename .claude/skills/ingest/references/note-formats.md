# Note formats for `/ingest`

All dates are `YYYY-MM-DD`. All frontmatter strings are in double quotes. Links are Obsidian wikilinks.

## Source note

Path: `vault/40_sources/notes/<Title Case title>.md`

Frontmatter (all required, from SPEC section 3):

```
---
type: "source"
created: "2026-10-07"
status: "active"
raw: "40_sources/raw/2026/2026-10-07 Porter 1979 How Competitive Forces Shape Strategy.pdf"
sha256: "<full sha256 from the manifest>"
origin: "<file name, web address, or zip name and path inside the zip>"
ingested: "<ISO date-time from the manifest>"
kind: "pdf"
course: "[[20_areas/courses/strategy/course|Strategy]]"   # optional, only if known
---
```

Body, in this order:

```
# <Title>

## Summary
Three to six plain sentences. What it is, who wrote it, the main argument, why it matters for the user.

## Key points
- Point one. (p. 3)
- Point two. (section "Entry barriers")
- Point three. (slide 12)

## Quotes
> "Exact words, short." (p. 5)

## Raw file
[[40_sources/raw/2026/<raw file name>]]
Text status: done | pending

## Wiki pages
- [[Porter Five Forces]] (created)
- [[Barriers to Entry]] (extended)
```

Rules:
- **`origin`** is copied from the manifest. For a file that came out of a zip it reads `<zip name>/<path inside the zip>`, for example `Strategy files.zip/Week 1/Porter 1979.pdf`.
- **`course`** is optional. Every course note is called `course.md`, so link to it by its path and give the course title as the label, as shown. Take the course from the manifest entry's `course` field when it has one (it is the course title; find the folder in `vault/20_areas/courses/`). If no course note exists yet, leave the field out rather than link to a note that is not there.
- **Key points** each carry a page, slide, section or timestamp. If there is none, write `(location not known)`.
- **Quotes**: at most five, each under 40 words, exact. Leave the section out if there are none.
- Anything you worked out yourself rather than read gets `[Inference]`.
- For a web page, put the retrieval date in the summary: "Retrieved 2026-10-07".
- For a spreadsheet or CSV, describe what the columns and main numbers are. Do not copy the table.
- For a transcript, add who spoke only if the file says so.
- If the text could not be read, write only the frontmatter, a one-line summary from the file name, and `Text status: pending`.
- A file flagged `ai_notice` by `ingest.mjs` (it says it must not be used with AI tools) gets no note at all until the user decides. If the user chooses to use it, write the note as usual and keep it neutral: do not mention the file's restriction or the user's decision in the note, because notes are tracked by git. The decision lives only in `state/local/` (`ingest.mjs --ai-decide`).
- A source note is a working note: `[Inference]` and `[Unverified]` labels belong here. Anything quoted from a note into a deliverable is reworded plainly first ("we assume", "in our reading").

## Citation line (used in the wiki and in answers)

```
[Source: [[Source note title]] | 2026-10-07 | confidence: high]
```

The date is the `created` date of the source note. Confidence:
- `high`: stated directly by the source.
- `medium`: stated by a secondary source, or partly stated.
- `low`: implied, old, or the text was hard to read.

## Concept page (30_wiki/concepts)

```
---
type: "concept"
created: "2026-10-07"
status: "active"
sources: ["[[Source note title]]"]
---
# Barriers to Entry

One or two plain sentences saying what it is.

## What the sources say
- A claim. [Source: [[Source note title]] | 2026-10-07 | confidence: high]

## Related
- [[Porter Five Forces]]
```

## Framework page (30_wiki/frameworks)

Add `family: "strategy"` and `when_to_use: "one plain sentence"` to the frontmatter, plus `sources`. Body: `## What it is`, `## Steps`, `## Watch out for`, `## What the sources say`, `## Related`.

## Company page (30_wiki/companies)

Frontmatter: `type: "company"`, `created`, `status`, `sources`. Body: `## What it does`, `## Facts` (each with a citation and a date, because facts go stale), `## Related`. Never write rumours about staff. Business facts only about named people (role, employer, source, date); their personal details are not recorded unless the user explicitly asks. The same holds for rosters and attendee lists: name, role, organisation and class or programme only.
