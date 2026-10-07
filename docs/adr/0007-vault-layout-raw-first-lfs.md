# 0007. Vault layout, raw-first ingestion and Git LFS

Status: accepted. The Git LFS parts (the fourth bullet under Decision, the LFS lines under Consequences, and "No LFS" under Alternatives) are superseded by [ADR 0020](0020-git-lfs-for-large-files-only.md): Git LFS is now used only for files of 50 MB or more. The vault layout and raw-first ingestion still stand.

## Context
Students collect PDFs, slides, spreadsheets and emails. An answer is only trustworthy if we can trace it back to the original file. Binary files make git slow, and GitHub rejects files over 100 MB.

## Decision
- A numbered vault: `00_inbox`, `10_projects`, `20_areas`, `30_wiki`, `40_sources`, `50_learning`, `60_people`, `70_journal`, `80_me`.
- Ingestion is raw-first: copy the file untouched into `40_sources/raw/YYYY/`, compute sha256, extract text, write a source note and append a line to `manifest.jsonl`. Duplicates are skipped.
- Raw files are immutable. A hook blocks writes into `raw/`.
- Binary files use Git LFS (10 GiB free on GitHub). Files over 100 MB go to `raw/_local/`, which git ignores. *Superseded by ADR 0020: only files of 50 MB or more use Git LFS; ordinary documents are normal files. The `raw/_local/` limit of 100 MB is unchanged.*
- Answers cite their sources: `[Source: [[note]] | date | confidence]`.

## Consequences
- Provenance is always available, and duplicates cost nothing.
- Users need Git LFS installed (the installer checks). *Superseded by ADR 0020: needed only for files of 50 MB or more.*
- Very large files are not backed up by git.

## Alternatives considered
- **Edit or move originals.** Loses provenance.
- **No LFS.** Repos would grow quickly and slow down. *Revisited in ADR 0020: for files under 50 MB the cost of LFS was higher than the growth, so LFS is now kept for larger files only.*
- **Cloud drive for sources.** Breaks the single-repo idea and risks corruption with git.
