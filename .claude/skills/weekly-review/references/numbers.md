# How to count the weekly numbers

Use Glob and Grep on the vault. Read frontmatter only. If a folder is missing or empty, the answer is "none yet". Never estimate.

The **week** runs Monday to Sunday of the reviewed ISO week. "Next 7 days" means from today.

| Number | Where to look | How to count |
|---|---|---|
| Assignments shipped | `vault/10_projects/*/assignment.md` | `status: "shipped"` and the file was changed in the reviewed week. Check the file's modified date. |
| Assignments due | same | `deadline` inside the reviewed week (due) and inside the next 7 days (coming). Show both. |
| Applications by stage | `vault/20_areas/career/applications/*.md` | Count each `stage` value (found, shortlisted, preparing, applied, interview, offer, rejected, withdrawn). Show only stages with at least one. |
| Applications moved this week | same | Files changed in the reviewed week, with their current stage. |
| Drafts sent | `vault/00_inbox/outbox/*.md` | `status: "sent"` and changed in the reviewed week. |
| Drafts waiting | same | `status: "draft"` or `"approved"`. |
| Cards reviewed | `vault/50_learning/cards/**/*.md` | Cards with a `last_reviewed` date inside the week. If no card has that field, write "review history is not kept yet". |
| Cards due now | same | `due` on or before today and `status: "active"`. |
| New cards | same | `created` inside the week. |
| Open proposals | `vault/00_inbox/proposals/*.md` | `status: "open"`. Also list approved or built this week. |
| Tasks done this week | `vault/00_inbox/Tasks.md` | Lines `- [x]` carrying a done date (`✅ YYYY-MM-DD`) inside the week. If tasks have no done date, count `- [x]` lines not yet archived and say "ticked since the last review". |
| Tasks open / overdue | same | Lines `- [ ]`. Overdue means `📅` date before today. |
| Captures waiting | `vault/00_inbox/captures/*.md` | `status: "new"`. |

## Weekly note layout

Path: `vault/70_journal/weekly/<YYYY>-W<ww>.md`

```
---
type: "weekly"
created: "2026-10-09"
status: "active"
week: "2026-W41"
---
# Week 2026-W41

## Numbers
| What | This week |
|---|---|
| Assignments shipped / due | 1 / 2 |
| Applications | applied 2, interview 1 |
| Drafts sent / waiting | 3 / 1 |
| Cards reviewed / due | 24 / 6 |
| Open proposals | 1 |
| Tasks done / open / overdue | 9 / 14 / 2 |

## What happened
- Three to five plain bullets taken from the data (what shipped, what moved).

## Cleared
- Inbox: 5 captures processed (2 notes, 2 tasks, 1 archived).
- Tasks: 9 archived, 3 rescheduled, 2 moved to Someday.

## Decisions waiting
- [[Proposal title]] (open)

## Next week
- Deadlines: <what> on <date>
- First thing to do: <one item>

## In your words
(only if the user wrote something)
```

If the note already exists, keep it and add a section `## Update <date>` instead of replacing anything.
