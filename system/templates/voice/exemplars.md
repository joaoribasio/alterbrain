---
type: "voice-exemplars"
lang: "en"
created: ""
status: "active"
count: 0
sources: []
---
# Voice samples (English)

Real messages you wrote, chosen because they sound like you at your best. The `ghostwriter` agent picks 3-5 samples with the **same channel, recipient class and language** before drafting. If fewer than 3 match, it uses the closest ones and tells you.

**Rules for samples**
- Your own words only, unedited. Never an AI-written text, even one you approved.
- Replace other people's names, emails and phone numbers with roles: `[Professor]`, `[Recruiter]`, `[Peer]`.
- Remove anything private you would not want copied into a new draft.
- Aim for 3-5 per channel and recipient class; 30 in total is plenty. Swap out weak ones rather than adding more.
- Same classes as `profile.md` (the seven in `system/packs/twin/drafting.md`): `faculty`, `school-staff`, `recruiter`, `professional`, `peer`, `close`, `group`.

## Format

Each sample is one block like this. The heading format is fixed: `## E<two digits> · <channel> · <class>`. The comment line holds month, source and word count, nothing else. The message text follows as plain text, exactly as written.

~~~markdown
## E01 · email · faculty
<!-- 2026-09 · gmail-sent · 52 words -->
Dear [Professor],

Thank you for the session on Tuesday. Could I ask for a two-day extension on the strategy memo? Our team lost a member this week and we want to hand in work we're proud of.

Kind regards,
Alex
~~~

<!-- The block above is a synthetic example for "Alex Doe". Real samples go below, numbered E01, E02, …  Onboarding M5 fills this file from your sent mail, LinkedIn export and documents (see system/packs/twin/voice-import.md). -->
