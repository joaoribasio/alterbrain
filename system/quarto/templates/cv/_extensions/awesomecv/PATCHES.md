# Changes Alterbrain made to this extension

Adapted from quarto-awesomecv-typst (MIT) — https://github.com/kazuyanagimoto/quarto-awesomecv-typst @ 33e70a3ef0bcf28960773f2f8438861ed94b5b4a (release v0.3.3)

The upstream licence is in `LICENSE` (MIT, Copyright (c) 2024 Kazuharu Yanagimoto). It must stay with these files.

Everything not listed here is unchanged from v0.3.3. All changes are small and marked "Alterbrain" in the code.

| File | Change | Why |
|---|---|---|
| `typst-template.typ` | Patch 1 of 4: imports the Font Awesome package that ships inside Quarto (0.5.0) instead of downloading 0.6.2 | A render then never needs the internet, and the icons use fonts Quarto already has |
| `typst-template.typ` | Patch 2 of 4: an empty `icon:` is allowed (no icon is drawn) | Not every contact line needs an icon |
| `typst-template.typ` | Patch 3 of 4: a contact without a web address is printed as plain text, and a single contact is shown (upstream needed two or more) | A phone number has no link |
| `typst-template.typ` | Patch 4 of 4: the default fonts are Arial | Source Sans 3 and Roboto are not on most computers. The brand file still decides the font |
| `typst-show.typ` | The accent and link colours come from `brand-color.primary` and `brand-color.link` (Quarto always defines `brand-color`) | The upstream line looked for a variable Quarto does not provide, so the brand colour was ignored |
| `_extension.yml` | Registers the extra shortcode `cv.lua` | See below |
| `cv.lua` (new) | Shortcode `{{< cv work >}}` prints a list from the document metadata (`cv-data.yml`) as CV entries. Special characters are escaped so `$`, `#`, `@` and `_` print as typed | One data file feeds both CV layouts, and the render skill only edits data |

Upstream's own `input-yaml.lua` shortcode is still included and still works.
