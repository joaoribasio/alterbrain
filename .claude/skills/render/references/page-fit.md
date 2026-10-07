# Fitting a document to a page limit

The render tool counts the pages of the finished PDF and says "Too long: 8 pages and the limit is 6. Cut about 2 pages." Use this order. Stop as soon as it fits with a little room.

## First, find out what really counts

Before cutting anything, check:

- Does the limit include the title block, references and appendices? The tool counts every page. Ask the user if the brief does not say. If references and appendices do not count, you can use `{{< pagebreak >}}` before them so they start on their own pages, and count only the main pages yourself.
- Is the brand font installed? A missing font changes the count (`node system/quarto/tools/fonts.mjs`).
- Are the limits in the brief (font size, spacing, margins) the same as the template defaults (11 pt, 1.15, 2.5 cm)? If the brief gives its own, set them in the front matter first.

## Then cut, in this order

1. **Words.** Cut the least useful paragraph, not just a few lines everywhere. Merge points that repeat. Remove warm-up sentences. This is the real fix, and it makes the document better.
2. **Figures and tables.** Make pictures narrower, for example `{width=60%}`. Drop a table that repeats the text. Shorten long captions.
3. **Spacing and margins, only if the brief allows it.** For example `paragraph-spacing: 0.7em`, then margins of 2 cm. Do not go below what the brief says. If the brief says "11 pt, 1.15 spacing, 2.5 cm margins", you cannot change any of them.
4. **Never** reduce the font size below the brief, use a condensed font, or cram the margins to hide that you are over. Markers notice.

## The loop

1. Render with `--max-pages N`.
2. If over: say how many pages (and roughly how many lines) over, make one round of cuts from the list above, tell the user what you cut, and render again.
3. Three rounds at most. If it still does not fit, stop and tell the user plainly: what is in the way, what you cut, and which choices are theirs (for example, "cut section 4 or move the table to an appendix").
4. Never remove content the user marked as essential, and never remove a citation without removing the claim it supports.

## When there is spare room

Leave it. Do not pad to fill the page. If a whole page is empty, mention it.

## For slide decks

A deck has no page limit by default. If the user gives a number of slides, count the `##` headings. Section dividers (`#`) count as slides.

## For CVs and letters

- A CV: two pages at most for the designed layout. If it spills by a few lines, shorten the oldest role first.
- A letter: one page. About 300 words at 10.5 pt. Shorten the text. Do not shrink the font.
