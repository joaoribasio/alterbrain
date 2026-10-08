# Running a critique panel

One procedure for `/critique` (any deliverable) and `/assignment critique` (a graded assignment). The caller decides what to review and which panel; this file runs it.

Reviewers are the named helpers: `helper-review` for most lenses, `helper-judgement` for the devil's advocate and the consolidation. Each lens brief says which (`helper:` in its front matter). Call the helper by name (`subagent_type`) and pass no model override; its frontmatter fixes model and effort. What every reviewer does is in `protocol.md` (same folder).

## Inputs from the caller

| Input | Meaning |
|---|---|
| Round card path | Where to write `_round.md`. |
| Panel list | Lens ids, from `lens-choice.md` or the user's pick. |
| Storage folder | The folder that holds this round's reviews. |
| Consolidation target | The path of the critique file to write. |
| Grader or stop rule | Whether a rubric (grader) and a `stop_rule` apply. Only graded assignments have both. |

**Storage.**

- Assignment: storage folder `reviews/<n>/` in the assignment folder, target `critique-<n>.md`, round id `<n>` (count of earlier critiques plus one).
- Any other deliverable: storage folder `<deliverable folder>/reviews/<YYYY-MM-DD>-<n>/`, target `<deliverable folder>/critique-<YYYY-MM-DD>-<n>.md`, with `<n>` the count of rounds already run that day plus one. Date from `node system/scripts/date.mjs`.
- **Never inside an assignment folder.** If the file or one of its parent folders holds an `assignment.md`, the deliverable belongs to a graded assignment: hand over to `/assignment critique`. Its round count and stop rule read every `critique-*.md` in the folder, so a dated critique from this skill would be counted as a round.
- **Files outside the vault** (Downloads, Desktop, a shared drive). Do not create `reviews/` or a critique next to the file. Ask once where to keep the review (recommended: the matching project folder under `vault/10_projects/`, or `vault/00_inbox/` if there is none) and use that as the "deliverable folder". Reviews can quote private facts, so they stay in the vault.
- **Word, PowerPoint and Excel files** are never edited in place. Reviewers read them as they are. When changes are approved, edit a copy (`<name> (reviewed).<ext>`) and say so, or give the user the change list to make themselves; the original is untouched.

## 1. Choose the lenses

1. Read `lens-choice.md`. The caller has normally asked the user already (quick or full). If not, propose with AskUserQuestion, recommended first, each option with a pro and con.
2. Drop any lens whose `needs` is not met (`rubric`, `workbook`, `voice-profile`) and say so in one line each.
3. **Cost, said plainly.** On Pro: "A full panel uses noticeably more of your plan than a quick one." Do not give numbers.
4. **Seats.** For `specialists`, propose three to five seats from the questions and the subject (MBA presets when `packs` lists `mba` and the subject is business); the user confirms or changes them (one question). For `board`, keep six seats and rename seats 2 and 3 to fit; state the names in one line, do not ask. An earlier round's seats are proposed again.

## 2. Prepare the inputs the lenses need

Do this in the main session before writing the card:

- **Template and house rules.** `node system/scripts/template.mjs resolve --kind <kind> --for "<deliverable source>" --json`. `<kind>` is one of `deck`, `report`, `memo`, `letter`, `cv`, `essay`, `workbook`, `one-pager`; a proposal uses `report`, a cover letter uses `letter`, anything else the closest kind. Quote every path: folder and file names hold spaces. Copy `house_rules`, `structure`, `style`, `page_limit`, `font_size_pt`, `tone` and `tone_source` into the card.
- **Pages** (for `production`, and `structure` on a deck). Render the final file to PDF if needed, then `node system/scripts/pages.mjs pdf "<file.pdf>" --json`. List every PNG path in the card. For Word, PowerPoint or Excel, `node system/scripts/pages.mjs export "<file>"` first.
- **Workbook** (for `model-audit`). Run `node system/scripts/workbook-check.mjs "<file.xlsx>" --json` and save its output yourself with the Write tool to `<storage folder>/_workbook-check.json`. Do not use a shell redirect (`>`): in Windows PowerShell it writes UTF-16 and splits at spaces. Check the file exists, then list the path in the card. If it does not, drop `model-audit` and say so in one line.
- **Voice profile** (for `signature`): `vault/80_me/voice/<lang>/profile.md` and its exemplars file; the tone and the voice mode (`me` or `team`).
- If a script is unavailable, drop the lens that needs it and say so in one line.

## 3. Write the round card

Create `<storage folder>/_round.md`. Use **absolute paths** (the reviewers' Read tool needs them).

```markdown
---
type: "review-round"
created: "<today>"
status: "open"
assignment: "[[10_projects/<folder>/assignment]]"   # assignments only
deliverable: "[[<path of the deliverable note or folder>]]"   # other deliverables; optional for assignments
round: <n>
panel: ["<lens>", "<lens>"]
case_date: "<YYYY-MM-DD, or none>"
---
# Round <n>

## Files to read
- Deliverable: <abs path>
- Brief for the work: <abs path to assignment.md, or the request in one line>
- Rubric: <abs path, if any>
- Decisions: <abs path, if any>
- Course note / case text / course material / source notes / workbook: <abs paths>
- Fact sheet: <abs path to vault/80_me/fact-sheet.md, for fact-check, cv and cover letters>. Visibility: only `public` rows may be used in anything that leaves the computer.
- Voice profile: <abs path, if any>. Tone: <tone> (<where it came from>). Voice mode: <me or team>
- Rendered pages: <abs paths of PNGs, one per line>
- Workbook check: <abs path to _workbook-check.json>

## Reference files
<abs paths of the house files the chosen lenses name in their brief, one per line with the lens: `system/deliverables/principles.md` (structure), `system/deliverables/tone-and-voice.md` and `.claude/rules/writing.md` (signature), `system/deliverables/delivery-gate.md` (production). Read each lens brief's "What to read" and list what it names. "none" if no lens names one.>

## Template rules
<house_rules, structure, style, page_limit, font_size_pt from template.mjs; "none" if no template>

## Board seats        # only if board is in the panel
## Specialist seats   # only if specialists is in the panel
```

**Never put in the card:** thesis options, `brief.md`, earlier critiques, earlier reviews, chat history or your own view of the work. Reviewers must stay blind.

## 4. Run the reviewers

1. Read the cap: `plan_tier` in `config/brain.json` (`pro` if missing) and `caps` in `system/catalogue/routing.json` (Pro 3, Max 8). Never run more reviewers at once than the cap. Run them in waves; send one wave in a single message so they run in parallel. Put the cheaper lenses and the grader first.
2. For each lens, read its `helper:` and call that helper with exactly this prompt:

   ```
   lens_brief: <abs path to .claude/skills/critique/references/lenses/<lens>.md>
   protocol: <abs path to .claude/skills/critique/references/protocol.md>
   target: <abs path to the deliverable>
   context: <abs path to _round.md> (the card lists every other file to read)
   round: <n>
   out_hint: <storage folder>/<lens>.md
   Read the brief, the protocol and the round card, then do exactly what the brief says. Return only your report.
   ```
3. Save each report word for word to `<storage folder>/<lens>.md` under:

   ```yaml
   ---
   type: "review"
   created: "<today>"
   status: "done"
   lens: "<lens>"
   round: <n>
   ---
   ```
4. A reviewer that fails or ignores its format is run once more. If it fails again, go on without it and say so in one line.
5. If `helper-judgement` cannot run (plan limits), the main session reads the devil's advocate brief and does that pass itself, and says so in one line.

Do not summarise the reviews for the user yet.

## 5. Merge or consolidate

- **Quick panel** (two or three lenses). The main session reads the reviews and writes the critique file itself, following `system/templates/notes/critique.md` and the steps in `lenses/consolidation.md` (collect scores, merge, check each claim before acting, propose decisions, list what is not accepted, open points). It does not skip the checking step.
- **Full panel.** Call `helper-judgement` with:

  ```
  lens_brief: <abs path to .claude/skills/critique/references/lenses/consolidation.md>
  protocol: <abs path to protocol.md>
  context: <abs path to _round.md>
  Write exactly one file: <consolidation target>. Do not edit any other file.
  Read the brief and the round card, then do exactly what the brief says.
  ```
  If it cannot run, the main session does the consolidation with the same brief and says so in one line.

Then read the critique yourself and check its front matter has `round`, `panel`, `grade_low`, `grade_mid`, `grade_high`, `plateau` and `thesis` (the grade keys stay `null` and `plateau` false without a grader). Set the card's `status: "done"`.

## 6. The user decides

Show a short summary in chat: the verdict, the three findings with most impact (and who raised them), how many changes are proposed and how many were not accepted, and for a graded assignment the grade range and the stop rule result. Then ask how to handle the proposed changes: accept all (recommended), go through one by one, or read the critique first (adds a task). Record what was accepted and what was not in `decisions.md` when the deliverable has one. Set the critique's `status: "decided"`.

## 7. Apply approved changes

Only what the user approved. Edit the source (never the rendered file) and re-render. Then, before telling the user it is done, read the diff yourself and look at the changed pages yourself: a helper's "checked" is not evidence. For a deliverable that goes out, run the delivery gate (`system/deliverables/delivery-gate.md`).

## Rules for the whole procedure

- Reviewers are blind and read-only. The main session never tells a reviewer what another found.
- Nothing is sent or uploaded. Alterbrain never uploads.
- Labels like `[Unverified]` stay in reviews and critiques; text proposed for the deliverable uses plain wording.
