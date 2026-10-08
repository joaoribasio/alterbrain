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

## Moved files

A release can move a framework file to a new path. The CHANGELOG lists these under `### Moved`, with the old path and the new path. If the user never edited the old file, `apply-safe` has already archived it and added the new one, and there is nothing to do. If the user edited it, `apply-safe` left the old file where it is (the plan marks it `needs_review`) and added the new file next to it. Carry the user's edits into the new path with a 3-way merge:

| Version | Meaning | Where to get it |
|---|---|---|
| **Base** | The **old path** at the release the user was on | The old release tag from `system/release.json`, with the `gh api` command above and the old path. Check it against the sha256 the old `system/manifest.json` lists for the old path |
| **Mine** | The user's edited file at the old path | The file in the project |
| **Theirs** | The file at the **new path** in the new release | `state/local/update/<tag>/new/<new path>` if the plan staged it, otherwise the new release tag |

1. Merge as in "Merging" above. The result goes to the **new path**, never back to the old one.
2. Show the plain-language summary (below) with both paths, and ask for approval as for any other merge.
3. On approval, first save a copy of Mine to `state/local/update-backup/<tag>/<old path>`. Then write the merged file to the new path.
4. Then move the old file to `state/archive/<tag>/<old path>`, so there are not two copies. Never delete it.
5. If the new file already carries the user's edits, or the base cannot be retrieved, treat the merge as low confidence and keep the user's lines wherever the versions disagree.
6. If the CHANGELOG gives no single new path (a file was split into several, or dropped), do not guess. Ask the user where the content belongs, or leave the old file where it is and add a task.
7. Skills and helpers the user built themselves (`my-…`), and their identity notes under `vault/80_me/`, that point to the old path are not changed by an update. The upgrade that checks for them adds a task (and one more for any file it could not search); fixing them is a separate request, "fix the moved paths in my skills and notes". When you do it, change only the path text, one file at a time, with the user's yes for each and a backup copy first, as for a merge.

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
