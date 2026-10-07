# Third-party material in system/quarto

Alterbrain's own files here are MIT licensed (see the LICENSE file in the repository root). The items below come from other people. Full licence texts are collected in `THIRD_PARTY_NOTICES.md` in the repository root.

## quarto-awesomecv-typst (MIT)

- Adapted from quarto-awesomecv-typst (MIT) — https://github.com/kazuyanagimoto/quarto-awesomecv-typst @ 33e70a3ef0bcf28960773f2f8438861ed94b5b4a (release v0.3.3)
- Copyright (c) 2024 Kazuharu Yanagimoto
- Where: `templates/cv/_extensions/awesomecv/`. The licence is kept in `templates/cv/_extensions/awesomecv/LICENSE`.
- What changed: five small patches and one added file (`cv.lua`). See `templates/cv/_extensions/awesomecv/PATCHES.md`.
- It is itself a Quarto and Typst version of Byungjin Park's Awesome-CV design (https://github.com/posquit0/Awesome-CV, LPPL 1.3c), and its Typst code is inspired by Paul Tsouchlos's modern-cv package. No files from either project are included here.

## APA 7th edition citation style (CC BY-SA 3.0)

- Copied from the Citation Style Language styles repository — https://github.com/citation-style-language/styles (file `apa.csl`, blob d663d1e1b728c5fbc70dea233e1c0d09121e8909, repository commit 89c63834393a5f806e375b0816dc110c3be93d44, file dated 2026-02-07)
- Licence: Creative Commons Attribution-ShareAlike 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). Authors named inside the file: Brenton M. Wiernik and Andrew Dunning, with contributor Jay Pfaffman.
- Where: `templates/report/_extensions/alterbrain-report/apa.csl`.
- Change made: the two `<email>` lines of the style authors were removed, and a comment line saying so was added. The style itself is untouched.
- The share-alike condition applies to this one file: if you change it and share it, share your version under the same licence.

## Built into Quarto (not copied here)

- Typst, Pandoc, reveal.js and the Font Awesome 6 Free icons come with Quarto and keep their own licences. Alterbrain does not copy them. The CV icons use the Font Awesome package that Quarto bundles.

## Written for Alterbrain

These were written from scratch for Alterbrain. They copy no third-party template:

- `alterbrain-report` (report format), `alterbrain-letter` (cover letter), `alterbrain-cv-ats` (plain CV), `alterbrain-deck` (slides).
- The ideas for the report format (summary box, source notes, numbered sections, APA 7) come from the author's own earlier private kit. No logos, images or school assets were copied.
