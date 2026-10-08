# CV templates

Two CVs, one set of facts.

| File | What it makes |
|---|---|
| `cv-data.yml` | **Your facts.** Name, contact details, experience, education, skills. This is the only file you edit. |
| `cv.qmd` | The designed CV: your name in large type, a coloured accent, dates on the right. Page size A4. |
| `cv-ats.qmd` | The plain CV: one column, no icons, no colours. Use it for online application forms. |

"ATS" means applicant tracking system: the software many employers use to read CVs before a person does. Plain layouts survive it best. A designed CV is better for sending to a person.

The example is Alex Doe, a made-up MBA student in Rotterdam. Nothing in it is real.

## How to use

Ask Alterbrain: "make my CV" or "make a CV for the Operations Analyst role at Harbourline". The `/render` skill:

1. copies these starter files into `vault/20_areas/career/cv/`;
2. fills `cv-data.yml` from `vault/80_me/USER.md`, `vault/80_me/fact-sheet.md` and the notes in `vault/20_areas/career/`;
3. shows you what it wrote, so you can correct it;
4. makes the PDF in `_out/`.

Alterbrain only writes facts you have confirmed. If it does not know something, it leaves the line out and asks you.

By hand:

```
node system/quarto/tools/render.mjs scaffold cv vault/20_areas/career/cv
node system/quarto/tools/render.mjs vault/20_areas/career/cv/cv.qmd --type cv --max-pages 2
node system/quarto/tools/render.mjs scaffold cv-ats vault/20_areas/career/cv
node system/quarto/tools/render.mjs vault/20_areas/career/cv/cv-ats.qmd --type cv-ats --max-pages 2
```

## What goes in `cv-data.yml`

There are two blocks.

**`author`**: your name, the line under it (`position`), your town, and a list of contact lines. Each contact has `text` (what is printed), `url` (where it links, or an empty `""`) and `icon`.

Icons: `"fa envelope"`, `"fa phone"`, `"fa brands linkedin"`, `"fa brands github"`. Leave `icon: ""` for none. The plain CV ignores icons.

**`cv`**: lists of entries. The section names are `summary`, `work`, `education`, `projects`, `skills`, `languages` and `awards`.

An entry can have:

| Field | Meaning | Example |
|---|---|---|
| `title` | The main line | `"Operations Manager"` |
| `description` | Usually the organisation | `"Harbourline Logistics B.V."` |
| `location` | Short, to fit on one line | `"Rotterdam, NL"` |
| `date` | Text, not a date format | `"2021 - 2026"` |
| `details` | Bullet points | a list |

Rules for good bullets: start with a verb, end with a result, include a number if you honestly have one. Never invent a number.

## Adding or removing a section

Open `cv.qmd` (and `cv-ats.qmd`). Each section is two lines: a heading, then a line saying which list to print. To add "Volunteering", add a `volunteering:` list to `cv-data.yml` and these lines to the CV file:

```
## Volunteering

{{< cv volunteering >}}
```

Copy the pattern from any existing section and change the list name.

Headings must be at least three letters. The designed CV colours the first three.

## Special characters

You can type `$`, `#`, `@`, `&`, `_` and `%` in the data file. They print as typed. Avoid asterisks, backticks, angle brackets and the tilde: Quarto reads them as formatting and they disappear. There is no bold or italic in the data file.

## Length

A CV of one to two pages is normal. The sample is two pages in the designed layout and one in the plain layout. Keep the most relevant lines first.

## Where this comes from

The designed CV is `quarto-awesomecv-typst` (MIT, Kazuharu Yanagimoto) with small changes. The plain CV was written for Alterbrain. Details: `../../NOTICE.md` and `_extensions/awesomecv/PATCHES.md`.

## Template description

`template.yml` in this folder describes the built-in cv template: its style, limits and house rules. Your own templates (for example from your school) go in `vault/80_me/templates/`, and are made with `/template`. When one is attached to a course, project or document, it is used instead of this one.
