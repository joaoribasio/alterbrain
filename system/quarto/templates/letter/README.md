# Cover letter template

A one-page A4 letter: your name and details at the top, the recipient on the left, the date on the right, a bold subject line, then your text.

The example is a made-up application by Alex Doe, an MBA student in Rotterdam.

## How to use

Ask Alterbrain: "write a cover letter for the Operations Analyst role at Harbourline". The `/render` skill and the `ghostwriter` helper then:

1. write the letter in your voice, using only facts from `vault/80_me/fact-sheet.md`;
2. save it as a draft in `vault/00_inbox/outbox/` for you to review (nothing is sent anywhere);
3. make the PDF when you approve it.

By hand:

```
node system/quarto/tools/render.mjs scaffold letter vault/20_areas/career/applications/harbourline
node system/quarto/tools/render.mjs vault/20_areas/career/applications/harbourline/letter.qmd --type letter --max-pages 1
```

## What to change

Everything above the second `---` line is data. Change the words, keep the names on the left.

| Key | What it is |
|---|---|
| `sender` | Your `name`, `address` (a list of lines), `email`, `phone`. `link` is optional (for example your LinkedIn address) |
| `recipient` | `name`, `role`, `company`, `address` (a list of lines). Leave out what you do not know |
| `place`, `date` | Printed top right. `date: today` fills in the day you make the PDF |
| `subject` | The bold line above the letter |
| `reference` | Optional, for example a vacancy number |
| `salutation` | "Dear Ms Example," |
| `closing`, `signature` | "Kind regards," and your name |
| `enclosures` | What is attached, for example "CV" |
| `lang` | `en` or `nl`. It sets hyphenation and quote marks |

Write the letter text below the data. Do not repeat the greeting or the sign-off: they are printed from the data.

## Length

One page holds about 300 words at 10.5 pt. Three or four short paragraphs is right: why this role, why you (one proof point with a number you can defend), what happens next.

If a letter spills onto a second page, shorten it. Do not shrink the font.

## Look

Colours and fonts come from your brand file (`vault/80_me/brand/_brand.yml`). Without one, the default navy and Arial are used.

Options you can add under `format: alterbrain-letter-typst:` in the front matter: `fontsize` (default `10.5pt`) and `margin` (default 2.5 cm on the sides, 2.2 cm top and bottom).

## Template description

`template.yml` in this folder describes the built-in letter template: its style, limits and house rules. Your own templates (for example from your school) go in `vault/80_me/templates/`, and are made with `/template`. When one is attached to a course, project or document, it is used instead of this one.
