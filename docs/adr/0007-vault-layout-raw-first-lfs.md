# 0007. Vault layout, raw-first ingestion and Git LFS

Status: accepted

## Context
Students collect PDFs, slides, spreadsheets and emails. An answer is only trustworthy if we can trace it back to the original file. Binary files make git slow, and GitHub rejects files over 100 MB.

## Decision
- A numbered vault: `00_inbox`, `10_projects`, `20_areas`, `30_wiki`, `40_sources`, `50_learning`, `60_people`, `70_journal`, `80_me`.
- Ingestion is raw-first: copy the file untouched into `40_sources/raw/YYYY/`, compute sha256, extract text, write a source note and append a line to `manifest.jsonl`. Duplicates are skipped.
- Raw files are immutable. A hook blocks writes into `raw/`.
- Binary files use Git LFS (10 GiB free on GitHub). Files over 100 MB go to `raw/_local/`, which git ignores.
- Answers cite their sources: `[Source: [[note]] | date | confidence]`.

## Consequences
- Provenance is always available, and duplicates cost nothing.
- Users need Git LFS installed (the installer checks).
- Very large files are not backed up by git.

## Alternatives considered
- **Edit or move originals.** Loses provenance.
- **No LFS.** Repos would grow quickly and slow down.
- **Cloud drive for sources.** Breaks the single-repo idea and risks corruption with git.
