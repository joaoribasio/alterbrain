# M9 Import your existing files

**Goal:** the user's existing course material (slides, readings, notes, cases) is copied into the vault with a source record, so `/ask` and `/study` can use it.
**Time:** about 10 minutes of the user's time; processing can continue in the background or later.
**Optional.**
**Model / effort:** copying and text extraction: `system/scripts/ingest.mjs` (script). Source notes and wiki updates: the `/ingest` skill (sonnet / medium; batches can use haiku / low for summaries).

Say at the start: "Let's bring in the files you already have. I keep an untouched copy of each one, so every answer can point back to the original."

## Inference sources

- `vault/40_sources/manifest.jsonl` (what is already imported; duplicates are skipped automatically).
- `vault/20_areas/courses/` (to match folders to courses).
- The folder paths the user gives.

## Questions (one at a time)

1. **Where are the files?** "Which folders hold your course material? For example a 'MBA' folder in Documents, or a synced OneDrive folder." Free text; accept several paths. Tip for finding a path: "In File Explorer (Windows) or Finder (Mac), right-click the folder and choose **Copy as path** (Windows) or hold **Option** and choose **Copy as Pathname** (Mac)."
2. **Versions.** "If you have several versions of a file, like `Report_v1` and `Report_v3`, should I keep only the latest?" Only the latest (recommended) / Keep all versions.
3. **Anything to leave out?** "Any subfolders that are private or not for school (photos, personal admin)?" Free text, or "no". Never import a folder the user calls private.

## Steps

1. **Preview first.** For each folder, count files and total size with a quick read-only listing (Glob). Say: "That folder has 312 files (1.8 GB). Big videos over 100 MB stay on this computer only and are not uploaded to your backup." Ask "Go ahead?" (Yes (recommended) / Choose fewer folders).
2. **Copy.** Run:
   `node system/scripts/ingest.mjs "<folder 1>" "<folder 2>" --latest-only --origin "Onboarding import" --json`
   (drop `--latest-only` if they chose "keep all"). Large imports can take a while; run in the background and keep chatting.
3. **Report in plain words** from the JSON: "Imported 240 files, skipped 31 duplicates, 12 need text extraction later, 3 kept local-only because they're very large."
4. **Queue the notes.** Each new file needs a short source note and wiki updates. That is what `/ingest pending` does: it finds every manifest entry that has no source note yet (no note in `vault/40_sources/notes/` with the same `sha256`) and writes the notes in batches, about 50 files per run.
   - **20 new files or fewer:** offer to run `/ingest pending` now.
   - **More than 20:** add one task, so the work can be done when the user has time:
     `node system/scripts/tasks.mjs add "Turn imported files into notes. Say: /ingest pending (about 50 files each time)" --tag ingest --priority low`
     Say: "I'll turn them into notes when you ask. Type `/ingest pending`; each run takes a few minutes and does about 50 files."
   - Do not run `ingest.mjs` again on the same folders to "restart": it would only report duplicates.
5. **Text pending.** If files show `text_status: "pending"` (no text extractor available), say: "I can still read those when needed. If you want faster search, the markitdown tool helps (see `/menu` → Settings & help)."
6. **Match to courses.** If folder names match a course in `vault/20_areas/courses/`, mention it: "Your 'Corporate Finance' folder will be linked to that course when the notes are written."

## Files written

- `vault/40_sources/raw/**`, `vault/40_sources/text/**`, `vault/40_sources/manifest.jsonl` (only by `ingest.mjs`; never by hand).
- A task tagged `#ab/ingest` that points to `/ingest pending`, if the notes are not written now.

## Done criteria

- `ingest.mjs` finished without errors for every chosen folder (or errors were explained and turned into tasks).
- Source notes are either written (`/ingest pending`) or queued as a task.

Then: `node system/scripts/onboard-progress.mjs done M9`.

## Safety

- Raw files are never edited, moved or deleted after import.
- Never import a folder the user marked private, or system folders (Program Files, AppData, Library).
- Files over 100 MB are kept local-only by the script. Do not work around this.
