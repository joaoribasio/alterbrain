# Updating the wiki after an ingest

The wiki is a set of linked pages you maintain. One source usually touches several pages. This follows the "LLM wiki" idea: do the linking work once at ingest time, so later questions are cheap.

## 1. Find what the source teaches

List the two to six ideas, frameworks, companies or industries the source covers in a meaningful way. Skip passing mentions. For each, search the wiki for an existing page:

- Glob `vault/30_wiki/**/<name>*.md` (case-insensitive) and Grep `vault/30_wiki` for the name and for likely synonyms.
- Read `vault/30_wiki/index.md` first. It is the quickest map.

## 2. Extend or create

**Page exists:**
- Add new facts under `## What the sources say`, each with a citation line.
- Add the source note to the `sources` list in the frontmatter.
- Do not delete or reword what is already there.
- If the new source disagrees with the page, do not overwrite. Add a section `## Conflicts` with both claims and both citations. Tell the user about it in your report.

**Page does not exist:**
- Create it in the right folder (`concepts`, `frameworks`, `companies`, `industries`, `topics`) from the layouts in `note-formats.md`. File names are Title Case.
- Create at most five new pages per source. Link smaller ideas from an existing page instead.
- Add `[[wikilinks]]` to related pages that exist. Do not link to pages that do not exist.

**Every addition cites the source note.** Anything you inferred is labelled `[Inference]`. Anything you could not check is labelled `[Unverified]`. (Wiki pages are working notes: the labels stay here, and are reworded plainly when text from a page goes into a deliverable.)

**Who writes.** The main session writes every wiki page, the index and the log. A helper (`helper-draft`) writes source notes only, never wiki pages, `index.md` or `log.md`, and no two writers share a target page. Never build a wiki page from a source flagged `ai_notice` before the user has decided.

## 3. Append to the log

`vault/30_wiki/log.md` is append-only. Never edit earlier entries. Add at the end (create the file with the heading `# Wiki log` if it is missing):

```
## 2026-10-07 14:32 ingest
- Source: [[Source note title]]
- Created: [[Barriers to Entry]]
- Updated: [[Porter Five Forces]], [[Strategy Basics]]
- Conflicts: none
```

## 4. Keep the index current

`vault/30_wiki/index.md` lists every wiki page, one line each, grouped by folder and sorted A to Z:

```
# Wiki index

## Concepts
- [[Barriers to Entry]] - what stops new firms entering a market

## Frameworks
## Companies
## Industries
## Topics
```

- Add each new page under its group with a short plain description.
- Update the description only if it is now wrong.
- Never remove a line unless the page itself no longer exists.
- The index has frontmatter like any note: `type: "index"`, `created`, `status: "active"`. Create the file with it if it is missing.

## 5. Check

Before you report, spot-check one helper-written source note against its text (bulk imports), confirm for every page you touched: it appears in the index, it cites the source note, and the source note lists it under `## Wiki pages`.
