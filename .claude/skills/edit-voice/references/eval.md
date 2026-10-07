# Edit-voice checklist

Use this after every edit. Answer pass or fail to each check. If any check fails, fix the text and check again (at most two rounds, then tell the user what is left).

For a detect request there is nothing to fix: just make sure the report names each pattern with a quoted line and a short fix, without rewriting, scoring or guessing who wrote it.

## Editing

1. The edit keeps the user's point and adds no claims, examples, numbers, quotes or opinions.
2. It keeps the writer's own vocabulary, rhythm, bluntness, humour, uncertainty, digressions and level of polish.
3. Strong human sentences were left alone. Not every paragraph is now equally tidy.
4. The amount of cutting matches the amount of slop. Nothing was squeezed so hard that character is lost.
5. The text leads with what the reader needs, and keeps personal set-up that gives context or character.
6. Points are up front where that helps, without forcing one structure on every section.
7. Every sentence earns its place. Facts are protected. Verbs are direct.
8. Generic sentences pass the portability test, or were cut, or made specific using only facts from the draft.
9. Active voice with people as subjects, where possible.
10. Useful edge is kept. Structure is kept unless it hurt the text.
11. Tangled sentences are fixed. Clear spoken rhythm, fragments and changes of pace remain.

## Words and patterns

12. Banned words, empty phrases, empty adverbs and inflated claims are gone (unless quoted as examples).
13. Binary contrasts, negative lists, rhetorical set-ups and throat-clearing openers are gone.
14. Faux-insight set-ups, colon reveals, superficial analysis, fake-strong verbs, synonym cycling, dramatic fragments and robotic rhythm are fixed.
15. Importance puffery and weasel attribution are replaced with plain facts and named sources, or flagged to the user when there is no source.
16. Interpretive metadiscourse is removed.
17. Fake-profound kickers are deleted, not rewritten. Summary-recap endings are cut.
18. Formatting slop is removed: emoji headings, decorative bold, bullets that should be prose, headings over tiny sections.
19. Colons are followed by sentence case unless grammar requires otherwise.
20. Em dashes are used sparingly: usually none in short copy, one or two in longer drafts.

## Voice and final read

21. The edit matches the user's voice profile (`vault/80_me/voice/<lang>/profile.md`) where one exists: sentence length, openers, punctuation habits, words they like and words they avoid.
22. No new fact, name, date or figure appears that was not in the draft or the fact sheet.
23. The writer would recognise the edited text as their own.
24. It would sound natural read aloud to a sharp colleague.
25. `node system/scripts/slop-check.mjs` passes, or the remaining hits are quotes or deliberate choices of the writer, and you have said so.
26. The output has the full edited text and a short "What changed" list.

Adapted from no-ai-slop (MIT, Peter Yang) — https://github.com/petergyang/no-ai-slop @ 000650b156983f5159695b441477f4e63b25dc85
