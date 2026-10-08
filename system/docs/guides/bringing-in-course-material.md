---
type: "guide"
title: "Bringing in your course material"
summary: "How to download your readings, slides and course pages from your school's or provider's website, give them to Alterbrain, and what it does with them."
---
# Bringing in your course material

Alterbrain does not connect to your school's or provider's course website. Some do not allow automated access, and you do not need it: you download your files once and hand them over. From then on Alterbrain can answer from your own slides and readings, with sources.

When a course starts (a new term or block, an online course, or a course you add later), say `/course new` or "I'm starting Marketing". Alterbrain asks for everything you have for it, in one go:

- the syllabus or course guide
- slides
- readings and the reading list
- cases
- Excel models and data files
- assignment briefs and rubrics
- past exams or sample questions
- announcements
- anything else you have

You can hand over everything, only the syllabus, or say "later" (it adds a reminder with the steps below).

## 1. Download (about 5 minutes per course)

Canvas is the example below. Other platforms (Brightspace, Moodle) work much the same, but the buttons have other names. [Unverified] These steps come from general knowledge of Canvas, not from your school or provider. If a button is missing, tell Alterbrain what you see, or save files one at a time: it can add single files whenever you like.

1. **Files.** Open a course and go to **Files**. Select everything (Ctrl+A on Windows, Cmd+A on a Mac), then press **Download**. You get one zip file. Do this for each course.
2. **Pages.** "Download all files" leaves out the pages: the syllabus, assignment descriptions and announcements. Open each one and save it as a PDF with your browser: press Ctrl+P (Cmd+P on a Mac) and choose **Save as PDF** as the printer. The syllabus and the assignment pages matter most, because they hold the deadlines and the AI rules.
3. **Leave out video and big recordings.** Alterbrain cannot read them. A transcript or captions saved as text are fine.

**Online providers (Coursera, edX and similar).** These sites rarely offer one download for a whole course. [Unverified] That is general knowledge of such platforms, not a check of yours. Instead, save what each page gives you: transcripts or captions of the lectures as text, readings, slides, quiz feedback and your own notes. Hand them over as a folder, or one by one as you go ("add these to Data Analytics"). Alterbrain notes the provider instead of a programme, and it warns you about AI rules only when the course or the provider states one.

## 2. Give it to Alterbrain

Say, for example, "Here is the zip of my Strategy course", and give the path. Tip: on Windows, right-click the file and choose **Copy as path**; on a Mac, hold **Option** and choose **Copy as Pathname**. A folder that holds the zip and your PDFs works too. One folder or zip per course is best. You can also type `/ingest`.

Alterbrain then:

- works out which course the files belong to and asks you once to confirm;
- keeps an untouched copy of every file (the zip itself is not kept), writes a short note for each one, and links the notes to your course;
- reads the syllabus and assignment pages, if there are any, shows you the deadlines it found and asks whether to add them to your course note and your task list. If the course's AI rules were unknown, it offers to read them from the syllabus too (a course that states none is recorded as such, and you are not warned before assignments);
- writes the course note (AI rules, grading, submission rules, deadlines) and a **Material** list in it, grouped by type (syllabus, slides, readings, cases, data and models, assignments and rubrics, exams) and by session when that is clear;
- tells you in a few lines what is missing, for example an assignment without its brief or a session without slides;
- for a big import (more than 50 files), works in batches of about 50 and adds a task for the rest, with a rough time for each batch.

Importing and summarising readings is not assignment work, so the AI-rules reminder does not appear yet. It appears when you ask Alterbrain to start or draft an assignment.

**Word, PowerPoint and Excel files.** Alterbrain always keeps your originals untouched. PDF, CSV and plain-text files are read in full. Word, PowerPoint and Excel files can be read only if a small optional document reader is installed on your computer. Alterbrain checks that before it copies anything. If the reader is missing, it asks you to choose:

- **Save them as PDF first (recommended).** Nothing to install. In PowerPoint, Word or Excel choose File, then Save As or Export, then PDF. A workbook saved as PDF shows its values, not its formulas.
- **Install the reader first.** It needs a small free launcher called uv, which Alterbrain installs only after your yes. Every Word, PowerPoint and Excel file is then read as it comes in.
- **Copy them as they are.** Every file is kept and listed, but Alterbrain cannot read inside the Word, PowerPoint and Excel ones, so it cannot answer from them.

Decide before you hand the files over. Installing the reader afterwards does not help files that are already copied, because Alterbrain skips a file it already holds. A file it cannot read is listed as "not readable yet", and Alterbrain never guesses what is in it. When the reader works, a workbook's note lists each sheet and what its tables hold, using the numbers the sheet shows. [Unverified] Formulas, charts and speaker notes may not come through. For a workbook you can also save each sheet as CSV (File, Save As, CSV) and hand those over.

## When new material arrives

Everything you study belongs in your vault, and it keeps arriving all term: slides, your own notes from class, a case, a reading, a brief, feedback on a report, the transcript of a recording.

- **Mention it or hand it over.** Say "we had class today" or "here are my notes from the case discussion". Alterbrain finishes what you asked first, then asks once whether you have the slides or notes. It works out the course from what you said and asks only if two could fit. It does not ask in the middle of a draft, and not for anything already in the course's Material list. It asks once per course in a session: say "not now" and it leaves that course alone until your next session. Files or notes you hand over are always taken in.
- **Give it the files, or paste the text.** Say "add these to Strategy". Each item is kept untouched, gets a note and is linked into the course's Material list. A video itself cannot be read: give it the transcript or captions as text.
- **Notes you already typed in the vault** are not imported again. They are linked into the Material list under "Your notes" and left as you wrote them.
- **A reminder after each class** (for courses that meet on fixed days; a self-paced online course has none). When the course note holds the class dates, the start-of-session summary adds a line such as "New material? Corporate Finance had class on Tue 13 Oct", once per class and only for the last 14 days. A class counts as over from 18:00 on the day itself. Classes on or before the day you set the course up are left out, because you handed that material over then. The dates come from the syllabus. If it has none, Alterbrain asks once on which days the class meets (for example Tuesday and Thursday) and, if you know them, when the term starts and ends. Say "I don't know" and there is no reminder for that course. Without an end date the reminders stop 16 weeks after the term starts, and they stop earlier when you mark the course finished.
- **Courses you set up earlier.** They have no class dates yet. To get the reminder, say `/course Strategy` (use the course's name) or "add class days to Strategy". Alterbrain asks once which days the class meets and writes the answer in the course note. If you say you do not know, it notes that and does not ask again on its own; tell it the days whenever you do know them.
- **The weekly review** still asks once a week about all your active courses.

## What it refuses

Alterbrain opens a zip safely, and if anything is wrong with it, it uses **none** of its files and tells you why. Nothing half-imported ever reaches your vault.

| What it says | What to do |
|---|---|
| The zip is password protected | Unzip it yourself with the password and give Alterbrain the folder |
| Too many files or too big | Download one course at a time |
| A file path leads outside the zip's folder, or the zip holds a link | Download it again from the school's or provider's website |
| Two files have names that Windows and macOS treat as the same (for example `Notes.md` and `notes.md`), or fewer files came out than the zip lists | Unzip it yourself, rename the clashing files, and give Alterbrain the folder |
| The zip is damaged or incomplete | Download it again |
| A zip inside a zip | It is kept as an ordinary file and not opened. Unzip it yourself if you want its contents |

## Good to know

- Course files are copyright material. They stay in your own vault on your computer and in your private backup, never in the public Alterbrain project.
- A file you have already imported is skipped. If it was saved under another course, it stays there. If it was saved with no course, Alterbrain links its note to the course you name now.
- One zip per course. Alterbrain cannot split a zip that holds several courses: unzip it and give one folder per course.
- A source over 100 MB is kept on your computer only (`vault/40_sources/raw/_local/`) and is not backed up online.
- Your programme (a degree or an MBA) gets one note, in `20_areas/programmes/`, for what holds across all its courses: the terms, the school-wide AI rule, the grading scale, how work is submitted and career services. Each course links to it and repeats only what differs. Alterbrain asks for these once, and "later" is fine. A course from a provider such as Coursera has no programme note.
- If your school or provider offers no download at all, give Alterbrain the files one by one as you get them.
