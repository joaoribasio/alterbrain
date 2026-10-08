---
type: "voice-profile"
lang: "en"
created: ""
status: "draft"
calibrated: ""
samples: 0
---
# Voice profile (English)

How you write in this language. The `ghostwriter` agent reads this file plus 3-5 matching samples from `exemplars.md` before every draft. One profile per language: `vault/80_me/voice/<lang>/profile.md`.

<!-- Built in onboarding M5: voice-stats.mjs measures your samples, then one opus/high pass writes this profile, then you read it back and correct it. Status moves draft -> confirmed after your read-back. Change it any time with /edit-voice. -->

## In one line
<!-- e.g. "Warm but brief. Gets to the point in the first sentence. Never gushes." -->

## Registers

How formal you are depends on the channel and who you are writing to. Channels use the names in `config/autonomy.json`: `email`, `linkedin`, `messaging`, `social`, `jobs` (cover letters and application answers). Recipient classes (defined in `system/packs/twin/drafting.md` §3; keep only the ones you write to): `faculty` (teachers, lecturers, tutors, supervisors, mentors) · `school-staff` (programme or provider staff) · `recruiter` (recruiters, hiring managers) · `professional` (colleagues, managers, clients, alumni, contacts) · `peer` (classmates, course-mates, team-mates) · `close` (friends and family; only if you opt in) · `group` (many recipients, mailing lists).

| Channel | Recipient class | Register | Greeting | Sign-off | Typical length |
|---|---|---|---|---|---|
| email | faculty | <!-- formal --> | <!-- Dear [Name], --> | <!-- Kind regards, Alex --> | <!-- 3-6 sentences --> |
| email | recruiter | | | | |
| email | professional | | | | |
| email | school-staff | | | | |
| email | peer | | | | |
| linkedin | recruiter | | | | |
| linkedin | professional | | | | |
| messaging | peer | | | | |
| jobs | recruiter | | | | |

<!-- Keep only rows backed by real samples. A row with no samples says "not enough samples yet": the ghostwriter then uses the closest row and tells you so. -->

## Sentence habits

From `voice-stats.mjs` (numbers, not opinions). Refresh with `/edit-voice`.

- **Sentence length:** <!-- median N words; range N-N; share of sentences over 25 words: N% -->
- **Paragraphs:** <!-- e.g. 1-3 sentences; one idea each -->
- **How you open:** <!-- most common first words, e.g. "Hi", "Thanks for", "Quick question" -->
- **Punctuation:** <!-- e.g. rarely uses exclamation marks; no semicolons; uses dashes -->
- **Contractions:** <!-- e.g. often (I'm, don't) / rarely -->
- **Phrases you use a lot:** <!-- top 5 -->
- **Watch list:** <!-- words you overuse or the slop checker flags, with rate per 1,000 words -->

## Do
<!-- 3-6 lines, e.g. "Put the ask in the first two sentences." -->

## Don't
<!-- 3-6 lines, e.g. "Don't open with 'I hope this email finds you well'." -->

## Sign-offs
<!-- by register, e.g. formal: "Kind regards, Alex"; neutral: "Best, Alex"; casual: "Cheers, A." -->

## Example openers
<!-- 3-5 real first lines from your samples, one per register, third-party names replaced with roles -->

## Read-back log
<!-- - YYYY-MM-DD: what you corrected after reading the profile back -->
