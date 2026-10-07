# Brand files

A brand file is a short text file that holds your colours and fonts, so your CV, letters, reports and slides all look like they belong together.

- `_brand.yml` here is the built-in default: navy and sky blue, Arial.
- Your own brand file lives at `vault/80_me/brand/_brand.yml`. The onboarding interview creates it ("M8: brand"). When it exists, every document uses it.

## What goes in it

```yaml
meta:
  name: "My brand"
color:
  palette:
    navy: "#1F3A5F"
    sky: "#3C78B4"
  primary: navy        # headings, rules, table headers, slide titles
  secondary: sky
  link: sky
typography:
  fonts:
    - family: Arial
      source: system
  base:
    family: Arial
    size: 11pt
  headings:
    family: Arial
    weight: bold
    color: navy
```

Keep `color.primary` filled in. The templates use it as the accent colour. `color.link` and `color.secondary` are optional.

## Logos

Quarto brand files can name a logo. Put the image next to the brand file and add:

```yaml
logo:
  medium: logo.png
```

Only use a logo you have the right to use. Alterbrain never ships a school or company logo.

## Fonts

Only fonts installed on your computer work in PDFs. Check with `node system/quarto/tools/fonts.mjs`. If one is missing, install it or drop the file into `vault/80_me/brand/fonts/`. Details: `../README.md`.
