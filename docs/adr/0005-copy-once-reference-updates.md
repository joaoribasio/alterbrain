# 0005. Copy once, then reference-based updates

Status: accepted

## Context
Classmates need updates, but they also customise some files. A normal fork would force merges. A plugin system would hide the files.

## Decision
- The user copies the framework once (clone or release download). Their `origin` is their own private repo.
- There is no upstream remote and no merges.
- `/update-alterbrain` reads the release at a tag (GitHub API; public after the pilot, and during the pilot readable only by signed-in collaborators through `gh`) and explains the CHANGELOG.
- It tags `pre-update-<version>` first.
- Per file, using `system/manifest.json`:
  - `code` files are replaced verbatim after a sha256 check;
  - `text` files unchanged since install are replaced;
  - customised `text` files get a 3-way review, applied only on approval;
  - new files are added; removed files are proposed for archive.
- Then run `doctor` and auto-commit.

## Consequences
- Users own their copy completely.
- We must keep `manifest.json` accurate (release tooling regenerates it).
- A tampered file is rejected by its checksum.

## Alternatives considered
- **Git remote upstream with merges.** Conflicts for non-technical users.
- **Overwrite everything on update.** Destroys customisations.
- **Package manager install.** Needs tools the audience does not have.
