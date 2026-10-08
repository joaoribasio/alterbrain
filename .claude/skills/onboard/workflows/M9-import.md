# M9 Import your existing files

**Goal:** the user's existing study or work files (slides, readings, notes, cases, reports) are copied into the vault with a source record, so `/ask` and `/study` can use them. This covers files already on the computer, including a zip downloaded from a course website (how to get one is in `.claude/skills/course/references/course-setup.md`, "The download steps"; for a whole course, `/course new` asks for everything and sets the course up).
**Time:** about 10 minutes of the user's time; processing can continue in the background or later.
**Optional.**
**Model / effort:** copying and text extraction: `system/scripts/ingest.mjs` (script). Source notes and wiki updates: the `/ingest` skill (sonnet / medium; batches can use haiku / low for summaries).

Say at the start: "Let's bring in the files you already have. I keep an untouched copy of each one, so every answer can point back to the original."

## Inference sources

- `vault/40_sources/manifest.jsonl` (what is already imported; duplicates are skipped automatically).
- `vault/20_areas/courses/` (to match folders to courses; there may be none).
- The folder paths the user gives.

## Questions (one at a time)

1. **Where are the files?** "Which folders or zip files hold your study or work files? For example a 'Study' folder in Documents, a synced OneDrive folder, or a zip you downloaded from a course website." Free text; accept several paths. Tip for finding a path: "In File Explorer (Windows) or Finder (Mac), right-click the folder and choose **Copy as path** (Windows) or hold **Option** and choose **Copy as Pathname** (Mac)."
2. **Versions.** "If you have several versions of a file, like `Report_v1` and `Report_v3`, should I keep only the latest?" Only the latest (recommended) / Keep all versions.
3. **Anything to leave out?** "Any subfolders that are private or not for study or work (photos, personal admin)?" Free text, or "no". Never import a folder the user calls private.

## Steps

1. **Preview first.** For each folder, count files and total size with a quick read-only listing (Glob). Say: "That folder has 312 files (1.8 GB). Big videos over 100 MB stay on this computer only and are not uploaded to your backup." For a zip you cannot count the files this way: say its size and "I unpack it in a temporary folder and delete that folder afterwards. The zip itself is not changed." A zip that is far too big (many thousands of files or several GB) is refused with a plain message; then ask the user to unzip it and give you one course folder at a time. Ask "Go ahead?" (Yes (recommended) / Choose fewer folders).
2. **Match to courses.** Only if course notes exist in `vault/20_areas/courses/` (skip this step otherwise, and use no `--course`): if a folder or zip name matches a course there, ask one question before you copy: "Is the 'Corporate Finance' folder for your Corporate Finance course?" (Yes (recommended): the files are linked to that course when the notes are written. / Another course / Not a course). Use the answer as `--course` in step 3. If the zip also holds the course's syllabus or assignment sheets, `/ingest` offers to pull the deadlines into the course note and the task list.
3. **Copy.** Folders and zips go in separate runs, one run per course when a folder or zip belongs to one:
   - Folders: `node system/scripts/ingest.mjs "<folder 1>" "<folder 2>" --latest-only --origin "Onboarding import" [--course "<Course name>"] --json`
   - A zip: `node system/scripts/ingest.mjs "<zip>" --latest-only [--course "<Course name>"] --json`. Leave `--origin` out: each file then keeps "<zip name>/<path inside>" as its origin. The zip itself is not stored.
   - Drop `--latest-only` if they chose "keep all". Large imports can take a while; run in the background and keep chatting.
4. **Report in plain words** from the JSON: "Imported 240 files, skipped 31 duplicates, 12 need text extraction later, 3 kept local-only because they're very large." If a zip was refused, give the reason from the JSON in your own words and what to do next (for example: unzip it yourself and give me the folder).
5. **Queue the notes.** Each new file needs a short source note and wiki updates. That is what `/ingest pending` does: it finds every manifest entry that has no source note yet (no note in `vault/40_sources/notes/` with the same `sha256`) and writes the notes in batches, about 50 files per run.
   - **20 new files or fewer:** offer to run `/ingest pending` now.
   - **More than 20:** add one task, so the work can be done when the user has time:
     `node system/scripts/tasks.mjs add "Turn imported files into notes. Say: /ingest pending (about 50 files each time)" --tag ingest --priority low`
     Say: "I'll turn them into notes when you ask. Type `/ingest pending`; each run takes a few minutes and does about 50 files."
   - Do not run `ingest.mjs` again on the same folders to "restart": it would only report duplicates.
6. **Text pending.** If files show `text_status: "pending"` (no text extractor available), sort them by `ext`. PDFs, images and plain text: say "I can still read those when needed." Word, PowerPoint and Excel files (`.docx .pptx .xlsx` and similar): the Read tool does not open them, so say "I kept N Word, PowerPoint or Excel files, but I cannot read inside them yet. A PDF version of each works with nothing to install." The optional document reader helps only files copied after it is installed, because `ingest.mjs` skips a file it already holds, so do not offer it as the fix for these (`.claude/skills/course/references/course-setup.md` section 2, step 1). Never write a summary of a file you cannot read.

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
- Only `ingest.mjs` opens a zip (it checks the paths, the number of files and the size first, and deletes its temporary folder afterwards). Never unpack a zip yourself with another tool. If a zip is refused, the user unzips it themselves and gives you the folder.
