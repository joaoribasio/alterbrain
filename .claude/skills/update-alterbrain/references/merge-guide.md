# How to merge a customised file

A 3-way merge needs three versions of the same file.

| Version | Meaning | Where to get it |
|---|---|---|
| **Base** | The released file you were on when the user last updated or installed | The release tag in `system/release.json` (before the update changes it) |
| **Mine** | The user's file as it is now | The file in the project |
| **Theirs** | The new release file | The new release tag |

## Getting the versions

Read `repo` and `tag` from `system/release.json` before step 4 of the skill. Remember the old tag.

Base and Theirs, using the GitHub command line (works the same on Windows and macOS):

```
gh api "repos/<repo>/contents/<path>?ref=<tag>" -H "Accept: application/vnd.github.raw"
```

- The plan output may already say where the new version was saved. Use that if it does.
- Save fetched copies under `state/local/tmp/update/<tag>/` (this folder is not backed up).
- If the old tag cannot be fetched, the base is unknown. Do a 2-way comparison (Mine against Theirs) and mark the merge as low confidence.
- The sha256 of the base is in the old `system/manifest.json`. If a fetched file does not match that sha, do not trust it as the base.

## Merging

1. Split each file into sections (headings, or blocks of rules).
2. For each section decide:
   - **Only the user changed it**: keep Mine.
   - **Only the release changed it**: take Theirs.
   - **Neither changed it**: keep as is.
   - **Both changed it, same meaning**: keep Mine (it has the user's wording).
   - **Both changed it, different meaning**: this is a clash. Do not guess. Put both versions in your summary and ask.
   - **Release added a section**: add it in the same position.
   - **Release removed a section the user never touched**: remove it.
   - **Release removed a section the user edited**: keep Mine and tell the user.
3. Keep the file's frontmatter keys valid. For a skill, the header must still pass `node system/scripts/validate.mjs`.
4. Keep the file at or under its size limit (skills: 250 lines). If the merge would break the limit, tell the user and suggest moving content into `references/`.
5. After writing, run `node system/scripts/validate.mjs` for skill or agent files. If it fails, restore from the backup copy and report.

## Plain-language summary template

Show this before asking for approval. No diff symbols.

```
File: .claude/skills/<name>/SKILL.md
What you changed: <one line>
What the update changes: <one line>
Result of the merge:
 - Kept: <your changes>
 - Added: <new parts>
 - Needs your choice: <clash, your wording vs new wording>  (or "nothing")
Confidence: high | medium | low (low means I could not get the original version)
```

## Special cases

- **`CLAUDE.md`**: it should only contain the five import lines from SPEC section 5. Merge by union of lines, never by dropping the user's.
- **Rules in `.claude/rules/`**: keep the user's added rules, add new ones, resolve duplicates by keeping the user's wording.
- **Templates in `system/templates/`**: the user may have changed these on purpose. Show the clash, never overwrite silently.
- **Binary or very large files**: do not merge. Offer "keep mine" or "use the new one" only.
