# The contact profile in a person note

One note per person: `vault/60_people/<Full Name>.md`, made from `system/templates/notes/person.md`. All CRM keys are optional. A note without them is valid and simply gives no reminders (`people.mjs` treats absent keys as "no reminder").

## Keys

| Key | Meaning | Values |
|---|---|---|
| `org`, `role` | Where they work and what they do now | text, `""` if unknown |
| `source` | Where the facts came from, with the date | `"email signature, 2026-10-08"` |
| `dnc` | Do not contact | `true` or `false`, written unquoted. `people.mjs` also reads "true", yes, y, 1 and on as do not contact, and reports any value it cannot read (treating that person as do not contact until fixed) |
| `how_met` | How you met, in a few words | `"Careers fair, Rotterdam"` |
| `met_on` | Date you met | `YYYY-MM-DD` or `""` |
| `last_contact` | Date of the latest real contact | `YYYY-MM-DD` or `""` |
| `next_follow_up` | The date you want to get back in touch | `YYYY-MM-DD` or `""` |
| `cadence` | Keep-in-touch rhythm | `none`, `monthly` (30 days), `quarterly` (91), `half-yearly` (182), `yearly` (365) |
| `tags` | Free labels | `[alumni, finance]` |
| `linkedin` | The profile address the user shared | URL or `""` |
| `birthday` | Only if the user adds it | `""` otherwise |

Dates are real calendar dates written YYYY-MM-DD, from `node system/scripts/date.mjs` or the user. `people.mjs` ignores anything else and reports it.

## Sections

- `## Who they are`: role, organisation, one line on what they work on. One fact per line, each with source and date: `Head of Operations at Example BV (LinkedIn profile shared by user, 2026-10-08)`.
- `## How we met`: two or three lines in the user's words.
- `## Interactions`: one line per contact, newest last: `- 2026-10-08 · meeting · Coffee after the careers fair; she offered an intro`. Channels: email, call, meeting, message, event.
- `## Follow-ups`: what you promised or want to ask, one line each. Date it when it has a date.
- `## Notes`: anything else that is a business fact.
- `## Private` (optional): sensitive details, only because the user explicitly asked you to record them. Never used in a draft, never in anything outbound, never in a summary shown for sharing. Do not create the section otherwise.

## Writing rules

- Change a key by replacing that one frontmatter line. Keep the other lines, their order and the user's prose exactly as they are.
- Quote string values, except `dnc`, which is written `dnc: true` or `dnc: false` without quotes. Keep `tags` as a list.
- **Older notes** (from before the CRM keys) may lack keys or sections. Upgrade only what you are setting. A missing key is inserted on its own line before the closing `---`, in the order of the table above. A missing section is added before `## Private`, or at the end of the note if there is no `## Private`. Never put an Interactions or Follow-ups line under `## Private`. Leave every other key and section as it is.
- Add to Interactions; never rewrite earlier lines.
- Setting `last_contact`: only ever move it forward.
- Setting `next_follow_up`: only when the user asked or agreed. After a contact is logged, ask whether to move it.
- A person who asks not to be contacted: `dnc: true`, clear `next_follow_up`, set `cadence: "none"`, and tick the matching task. Do not delete anything.
- Contact details: a work email or phone the person put in their own signature may go into `## Who they are` with the source. A personal mobile or home address only if the user asks.
- Never store government ID numbers, bank details, passwords or answers to security questions. If a card or message shows one, leave it out.

## Names

File name is the full name as the person writes it. Two people with one name: `Alex Doe (Example BV).md`. Search before creating (`vault/60_people/**`), including a different spelling of the same name.

## The contacts table

`vault/_views/Contacts.base` shows the people with their next follow-up. New vaults have it. For a vault that does not, copy `system/templates/vault/_views/Contacts.base` there on first use and say so. To show it on Home, the user can add `![[Contacts.base]]` under a heading; offer it, do not edit Home.md without a yes.
