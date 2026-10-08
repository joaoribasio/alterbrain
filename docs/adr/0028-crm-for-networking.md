# 0028. A light contact book for networking, with business facts by default

Status: accepted (2026-10-08, product owner)

## Context
`vault/60_people/` has existed since the first release as a folder of person notes with `org`, `role`, `source` and `dnc`. Nothing used it as a contact book. A student or professional who is building a network (alumni, recruiters, speakers, classmates, clients) loses people for lack of a next step: no record of when they last spoke, no date to follow up, and no nudge. Networking is also where privacy matters most, because the notes are about other people.

## Decision
- **Capture a person from where they appear:** an email signature (through `mail-reader`, which stays quarantined and returns only name, role, organisation and signature contact lines), a LinkedIn profile the user shares, an event, a business card photo, or a conversation. One question at most; the user's words go into the note.
- **A small profile in the person note** (all keys optional): `how_met`, `met_on`, `last_contact`, `next_follow_up`, `cadence` (`none`, `monthly`, `quarterly`, `half-yearly`, `yearly`), `tags`, `linkedin`, `birthday`, plus an interaction log (one dated line per contact), a follow-ups section and an optional `## Private` section. A note without the new keys works as before and gives no reminder.
- **`/people`** is a core skill. It captures, logs an interaction, sets a follow-up or a cadence, lists who is due, and drafts a message through `ghostwriter` (a draft in the outbox, never sent; at most three outreach drafts a week).
- **Reminders in the weekly review.** `people.mjs due` lists follow-ups on or before today plus a week and cadences that have run out; a person appears once with every reason. The weekly review recommends the first three, oldest first, and rolls the rest over.
- **A contacts view.** `vault/_views/Contacts.base` (an Obsidian Bases view) with follow-ups sorted by date and everyone; a person marked `dnc` is filtered out. New vaults get it with `Home.md`; an existing vault gets it from `/people` on first use.
- **Enrichment only when the user asks,** from public sources, through the `researcher` helper. The LinkedIn connector is used only if it is switched on and the rate guard shows room. Nothing is scraped.
- **Privacy follows ADR 0018.** Business facts by default (role, organisation, how we met, last contact). Sensitive details about a person (health, family, beliefs) are recorded only if the user asks, go under `## Private`, and never appear in outbound text. A birthday is stored only if the user adds it. `dnc` is read fail-closed: any value that is not clearly false keeps the person out of reminders. The people notes are in the encrypted scope when the user switches encryption on (ADR 0019); a locked note is reported, not skipped silently. Rosters (a class list, an attendee list) become business facts only.
- **A blueprint for later, `keep-in-touch`:** monitoring for news, job changes, events and achievements so Alterbrain can draft congratulations. Draft only, official data or the user's own exports only, under the rate guard, never scraping. It is not built in 0.2.0.

## Consequences
- A new optional shape on person notes with a tested fallback (`people.mjs` ignores notes without the keys) and no migration, because every key is optional and nothing reads a missing key as an error.
- Keeping a record about a third party is a privacy cost. The default is the smallest useful profile, the user decides what else is recorded, and nothing about a person leaves the computer except in a draft the user sends.
- A person-note quirk to know: `Contacts.base` filters on `dnc != true`, so a `dnc` written in quotes could still show in the table although `people.mjs` treats it as do not contact. [Inference] Not tested in Obsidian. The skill writes it unquoted.
- The weekly review has two more steps (keep warm, returned work). That is more to read each week, capped at three people.

## Alternatives considered
- **A separate contacts app or a database.** More power (pipelines, bulk import) and a second place to keep in sync. Rejected: the notes are the data, as everywhere else in the vault.
- **Automatic enrichment of every contact.** Fast, and it collects data about people who did not agree to it and spends the LinkedIn allowance. Rejected: only on request.
- **Birthday reminders by default.** Friendly, and it means holding a personal date about someone because they appeared in an email. Rejected: only if the user adds it.
- **Build keep-in-touch monitoring now.** Valuable and the riskiest part (scraping, rate limits, data about people). Rejected for 0.2.0; left as a blueprint with its limits written down.
- **Have the weekly review list everyone with an overdue cadence.** A long list is ignored. Rejected: three a week, oldest first.
