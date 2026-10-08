# Documents: CVs, letters, reports and slides

This folder turns plain text into good-looking documents. It uses Quarto, a free program that makes PDFs and slide decks from text files.

You do not need to learn Quarto. Ask Alterbrain for what you want ("make my CV", "turn this note into a 6-page PDF") and the `/render` skill does the rest. This page explains what is here, in case you want to look underneath.

## What you can make

| You want | Template | Output | Starter file |
|---|---|---|---|
| A CV that looks designed | `cv` | PDF | `templates/cv/cv.qmd` |
| A CV for online application forms | `cv-ats` | PDF | `templates/cv/cv-ats.qmd` |
| A cover letter | `letter` | PDF | `templates/letter/letter.qmd` |
| A case report, memo or assignment | `report` | PDF | `templates/report/report.qmd` |
| Slides | `deck` | HTML (and PDF on request) | `templates/deck/deck.qmd` |

"ATS" means applicant tracking system: the software many employers use to read CVs before a person does. It reads plain, single-column layouts best, so the `cv-ats` version has no icons, colours or columns.

Each template folder has its own `README.md` with the details.

## How a document gets made

1. A text file (`.qmd`, or an Obsidian note ending in `.md`) holds your words.
2. A template decides how it looks: fonts, colours, spacing, page size.
3. A template decides the look and the house rules (see "Templates" below). Without one, your brand file decides the colours and fonts. It is `vault/80_me/brand/_brand.yml`. If you do not have one yet, the built-in `brand/_brand.yml` is used.
4. Quarto puts them together and writes the result next to your source file:
   - in `_out/` while you work (a scratch folder that is replaced each time and never saved to git);
   - in `releases/<date>/` when you ask for a final version (every version is kept);
   - or in any folder you name, for example the outbox for a job application.

## Making a document by hand

Most of the time, ask Alterbrain. If you want to run it yourself, open a terminal in the Alterbrain folder:

```
node system/quarto/tools/render.mjs scaffold report vault/10_projects/my-memo
node system/quarto/tools/render.mjs vault/10_projects/my-memo/report.qmd --type report --max-pages 6
```

The first line copies a starter file into a folder. The second makes the PDF and tells you how many pages it has.

Other useful commands:

| Command | What it does |
|---|---|
| `node system/quarto/tools/render.mjs types` | Lists the five kinds of document |
| `... render.mjs <file> --type report --release` | Saves the final version in `releases/<date>/` |
| `... render.mjs <file> --type deck --pdf` | Slides as HTML and as a PDF (needs Microsoft Edge or Google Chrome) |
| `... render.mjs <file> --type deck --format pptx` | Slides as a PowerPoint file (plain look, no brand) |
| `... render.mjs <note.md> --type report` | Turns an Obsidian note into a PDF |
| `node system/quarto/tools/fonts.mjs` | Checks that your brand fonts are installed |
| `node system/quarto/tools/pagecount.mjs file.pdf --max 6` | Counts the pages of any PDF |

Every command accepts `--json` for scripts.

## Templates

A template is a folder with a short description file, `template.yml`: what kind of document it is for, its style, an optional brand file, an optional Word or PowerPoint reference file, a citation style, page and upload limits and house rules in plain sentences. The four folders under `templates/` are the built-in ones. Yours (from a school, an employer or a provider) live in `vault/80_me/templates/<name>/`; make one with `/template`.

Which one applies is decided for you, most specific first: the document itself, then its project or assignment, its course, its programme, your default for that kind (`config/brain.json`, `templates.defaults`), and last the built-in. If two templates tie at the same level, Alterbrain asks. Your personal brand file keeps working as the default look when no template is set.

| Command | What it does |
|---|---|
| `node system/scripts/template.mjs list` | Lists the built-in templates and yours |
| `... template.mjs resolve --kind deck --for <file>` | Shows which template a document would use, with its tone and style |
| `... template.mjs check <folder>` | Checks a template folder and names each problem |
| `... template.mjs inspect <file.pptx>` | Reads colours, fonts and slide layouts from a PowerPoint or Word file |
| `... render.mjs <file> --type deck --template <folder>` | Renders with that template; `--reference-doc` and `--csl` add a Word or PowerPoint style file or a citation style |

A template only adds what the document does not set itself, and school artwork stays in your vault, never in this folder.

## Page limits

Many assignments have a page limit. The tools count pages for you, but you decide how to fit.

1. Make the PDF with `--max-pages <limit>`. It says how many pages are used.
2. If you are over, cut in this order:
   1. Words. Remove the weakest paragraph, not the thinnest line.
   2. Figures and tables. Make them smaller or move detail to an appendix (if the brief allows one).
   3. Spacing and margins, but only within what the brief allows. Do not change the font size if the brief sets it.
3. Never shrink anything to hide that you are over. A marker can tell.
4. Ask your course whether the title, references and appendices count towards the limit. Our count includes every page of the PDF.
5. The page count depends on the font. If your brand font is missing, a substitute is used and the count may be a page out. Run `node system/quarto/tools/fonts.mjs` to check.

Line spacing is set as a multiple, like Word: `1.15` means 1.15 times the normal line height. It is close to Word's setting but not identical, so leave a few lines of safety.

## Fonts

The default font is Arial, which Windows and Mac both have. If your brand uses another font:

- Install it the usual way (double-click the font file, then choose Install), or
- drop the `.ttf` or `.otf` file into `system/quarto/fonts/` or `vault/80_me/brand/fonts/`. Documents find it there without installing anything.

Fonts from Google Fonts are not downloaded automatically for PDFs. Download the file yourself, then use one of the two steps above. Please check the font's licence before you share it.

## Works offline

Rendering needs no internet. The templates use only what Quarto already has, and the slide deck is one self-contained file.

## Folder map

```
system/quarto/
  README.md           this page
  NOTICE.md           where the third-party parts come from, and their licences
  brand/              the built-in default colours and fonts (_brand.yml)
  fonts/              drop extra font files here
  templates/          each folder also has a template.yml
    cv/               designed CV and ATS-plain CV (they share cv-data.yml)
    letter/           cover letter
    report/           report, memo, assignment (A4, APA 7 references)
    deck/             slides
  tools/              the scripts behind /render (render, pagecount, fonts, explain)
  tests/              automated checks
```

## For developers

- Tests: `node --test tests/quarto/quarto.test.mjs`. They render every template and skip cleanly when Quarto is not on the PATH. Rendered files go to `state/local/tmp/quarto/tests/`.
- The scripts have no dependencies beyond Node 20.
- The CV layout is a lightly patched copy of an open-source extension. The patches are listed in `templates/cv/_extensions/awesomecv/PATCHES.md`.
- To add a template: make a folder under `templates/` with a starter `.qmd`, a `README.md` and an `_extensions/<name>/` folder; add a `template.yml` (check it with `node system/scripts/template.mjs check`); add one entry to `TYPES` in `tools/lib.mjs`; add a test. The resolver is `system/lib/templates.mjs`.
