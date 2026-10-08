---
type: "guide"
title: "Templates for your documents"
summary: "How to give Alterbrain your school's or employer's template, where it applies, how defaults work, and why school files stay private."
---
# Templates for your documents

A template tells Alterbrain how a document or deck must look and what rules it must follow: layout, colours and fonts, a Word or PowerPoint master, the citation style, the page and upload limit, and the school's or employer's house rules in plain sentences ("cover page with student number", "maximum 12 slides"). Once Alterbrain has it, every report, deck or memo for that course or project follows it without you asking again.

Alterbrain already has four built-in templates (report, deck, letter, CV). You need your own only when a school, employer or course prescribes something different.

## Add a template

Say "use my school's template" or `/template new`, and give Alterbrain the file:

- a **PowerPoint** (`.pptx`) or **Word** (`.docx`) file your school or employer gave you;
- a **template file** (`.potx` or `.dotx`). Quarto cannot use these as they are, so Alterbrain asks you to open the file, save a copy as `.pptx` or `.docx`, and drop that copy in;
- a **Quarto folder** your school provides for reports (an "extension").

Alterbrain then asks a few short questions, each with a suggested answer: what it is for (deck, report, memo, letter, CV, essay, workbook, one-pager), the style, who it comes from, and the limits it did not find in the file (page limit, upload limit in MB, citation style, minimum font size). It:

1. keeps an untouched copy of your file in your sources;
2. reads the colours and fonts from the file;
3. for slides, checks the seven slide layouts that Quarto looks for by name (Title Slide, Title and Content, Section Header, Two Content, Comparison, Content with Caption, Blank) and tells you which are missing. Quarto then takes the missing ones from its own default, so those slides look different. The fix is to add a layout with exactly that name in PowerPoint's Slide Master view;
4. writes the template into `vault/80_me/templates/<name>/`;
5. makes a sample and **looks at every page**, then shows you what it found.

Rules from a school or employer go into the template as short sentences, in their words made plain. If you have none, none are written. Alterbrain never invents a rule.

## Where a template applies

You can attach a template at five levels. The **most specific wins**:

1. one deliverable (a report or deck on its own);
2. a project or an assignment;
3. a course;
4. a programme (your MBA, your degree);
5. your default for that kind of document (a default report, a default deck).

Below all of them is the built-in template. Say "attach it to my Strategy course", "use it for the whole MBA" or "make it my default deck". A report template also covers memos, essays and one-pagers.

When you render, Alterbrain finds the template that applies and says in one line which it used ("Using the RSM report template, from your programme."). It asks which to use only if two templates of the same kind tie at the same level, or if you ask. To see the answer any time, ask "which template does this report use?". To stop using a template, say "stop using it for Strategy": that only detaches it, and nothing is deleted without a separate yes.

## Defaults and your own look

If you set up colours and fonts in onboarding, they are kept in `vault/80_me/brand/` and stay your default look for anything without a template. Nothing changes if you never use templates. After an update, Alterbrain may offer to package that look as a template you can attach to courses and projects ("turn my document style into a template"); you can say no or ask later.

The citation style and the upload limit can be set on a template or on a programme. The template wins, then the programme.

## What a template checks at the end

Before you upload, the delivery gate reads the template: the upload limit, the page limit, the fonts, the file-name rule and the house rules. Alterbrain looks at every page itself. If a rubric contradicts a general check (for example it prescribes slide titles such as "Introduction"), the rubric wins and Alterbrain tells you in one line. See [Presenting](presenting.md).

## School and employer files stay private

A school's logo, crest, master slide or branded Word file is **your** file. It lives in your own vault, in `vault/80_me/templates/`, which is private, and in your private backup. It is never part of Alterbrain itself and is never shared with anyone. Before you use a school or employer logo, check their rules on logos, then save the image into the template folder yourself.

## If something looks wrong

- **Slides look different from your school's:** ask Alterbrain to check the layouts ("which layouts are missing?").
- **The Word or PowerPoint file is not being used:** the template needs its output format set to Word or PowerPoint; ask "check this template" and it names what is off.
- **A PowerPoint or Word preview looks different from the real file:** if the program is not installed, Alterbrain uses LibreOffice, which can change fonts and line breaks. It warns you when that happens.
