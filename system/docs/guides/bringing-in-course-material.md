---
type: "guide"
title: "Bringing in your course material"
summary: "How to download your readings, slides and course pages from your school's website, give them to Alterbrain, and what it does with them."
---
# Bringing in your course material

Alterbrain does not connect to your school's course website. Some schools do not allow automated access, and you do not need it: you download your files once and hand them over. From then on Alterbrain can answer from your own slides and readings, with sources.

## 1. Download (about 5 minutes per course)

Canvas is the example below. Other platforms (Brightspace, Moodle) work much the same, but the buttons have other names. [Unverified] These steps come from general knowledge of Canvas, not from your school. If a button is missing, tell Alterbrain what you see, or save files one at a time: it can add single files whenever you like.

1. **Files.** Open a course and go to **Files**. Select everything (Ctrl+A on Windows, Cmd+A on a Mac), then press **Download**. You get one zip file. Do this for each course.
2. **Pages.** "Download all files" leaves out the pages: the syllabus, assignment descriptions and announcements. Open each one and save it as a PDF with your browser: press Ctrl+P (Cmd+P on a Mac) and choose **Save as PDF** as the printer. The syllabus and the assignment pages matter most, because they hold the deadlines and the AI rules.
3. **Leave out video and big recordings.** Alterbrain cannot read them.

## 2. Give it to Alterbrain

Say, for example, "Here is the zip of my Strategy course", and give the path. Tip: on Windows, right-click the file and choose **Copy as path**; on a Mac, hold **Option** and choose **Copy as Pathname**. A folder that holds the zip and your PDFs works too. One folder or zip per course is best. You can also type `/ingest`.

Alterbrain then:

- works out which course the files belong to and asks you once to confirm;
- keeps an untouched copy of every file (the zip itself is not kept), writes a short note for each one, and links the notes to your course;
- reads the syllabus and assignment pages, if there are any, shows you the deadlines it found and asks whether to add them to your course note and your task list. If the course's AI rules were unknown, it offers to read them from the syllabus too;
- for a big import (more than 50 files), works in batches of about 50 and adds a task for the rest, with a rough time for each batch.

Importing and summarising readings is not assignment work, so the AI-rules reminder does not appear yet. It appears when you ask Alterbrain to start or draft an assignment.

## What it refuses

Alterbrain opens a zip safely, and if anything is wrong with it, it uses **none** of its files and tells you why. Nothing half-imported ever reaches your vault.

| What it says | What to do |
|---|---|
| The zip is password protected | Unzip it yourself with the password and give Alterbrain the folder |
| Too many files or too big | Download one course at a time |
| A file path leads outside the zip's folder, or the zip holds a link | Download it again from the school's website |
| Two files have names that Windows and macOS treat as the same (for example `Notes.md` and `notes.md`), or fewer files came out than the zip lists | Unzip it yourself, rename the clashing files, and give Alterbrain the folder |
| The zip is damaged or incomplete | Download it again |
| A zip inside a zip | It is kept as an ordinary file and not opened. Unzip it yourself if you want its contents |

## Good to know

- Course files are copyright material. They stay in your own vault on your computer and in your private backup, never in the public Alterbrain project.
- A file you have already imported is skipped, and keeps the course it was first saved under.
- A source over 100 MB is kept on your computer only (`vault/40_sources/raw/_local/`) and is not backed up online.
- If your school offers no download at all, give Alterbrain the files one by one as you get them.
