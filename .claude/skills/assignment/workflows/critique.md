# /assignment critique: a round of blind reviews, one consolidated critique

Goal: independent reviewers read the report without seeing each other's work or the drafter's reasoning. One consolidation pass turns their reports into `critique-<round>.md`. The user decides. The accepted changes are applied. The stop rule says when to stop.

Models: each reviewer runs as the `lens` agent at the model in its brief (devil's advocate on opus, the others on sonnet, all high effort). Consolidation runs at opus, high. The rest runs in the main session.

## 1. Check the starting point

- `report.qmd` exists. If not, run `draft` first.
- **Round number.** Count the `critique-*.md` files in the folder; this round is that count plus one.
- If the last critique still has `status: "open"`, the user has not decided on it yet. Offer to go through it first (section 7) instead of starting a new round.
- If there is a render of the report next to it (for example `report.pdf`) older than `report.qmd`, re-render with the `render` skill so reviewers can check the page count and the figures.

## 2. Choose the panel

1. **Fan-out cap.** Read `plan_tier` from `config/brain.json` (`pro` if missing). The cap is in `system/catalogue/routing.json` under `caps` (Pro 3, Max 8). Never run more reviewers at once than the cap.
2. **The two panels.** The core of both is the devil's advocate, the premortem and the grader. The specialists' seats are inferred from the subject (step 3).
   - **Full panel:** every lens in `lenses` in `assignment.md` (by default devil's advocate, premortem, board, specialists, grader). The board has neutral seats; for a business subject with `mba` in `packs` (`config/brain.json`) it takes the presets in `system/packs/mba/critique-presets.md`.
   - **Lite panel:** devil's advocate, premortem and grader.
3. **Recommended default.**
   - On **Max**: the full panel on round 1 and on the final round; the lite panel on the rounds in between.
   - On **Pro**: the lite panel on every round. It fits the cap in one go and saves usage. Offer the full panel as an option; it then runs in two waves.
   - Call a round "final" when the user says so, when the last critique met the stop rule, or when the deadline is three days away or less.
4. Ask with AskUserQuestion: "Which reviewers should read it this round?" Options, the recommended one first and marked "(recommended)", each with a one-line pro and con (for example "Lite: three reviewers, fits your usage, no specialist check of the numbers" and "Full: all five, finds technical errors, uses more of your plan"): "Full panel (5 reviewers)", "Lite panel (devil's advocate, premortem, grader)", "Let me pick". For "Let me pick", list the five lenses with one line each and let the user choose. Warn in one line if they leave out the grader: the stop rule needs its grade.

## 3. Seats

Only for the lenses in this round's panel.

- **Specialists.** Propose three to five seats inferred from the questions and the subject: the main method of the field, the rules or standards that apply, a domain expert, an academic in the field (for a management report, say, "stakeholder analysis" and "change management"; for a statistics essay, "inference" and "study design"). When `packs` lists `mba` and the subject is business, draw on the examples in `system/packs/mba/critique-presets.md`. If an earlier round card exists, propose the same seats. Ask the user to confirm or change them (AskUserQuestion with "Use these seats (recommended)": "Fits the questions; you can still change one." / "Change them": "Costs one more question.").
- **Board.** Keep the six default seats in `.claude/skills/assignment/references/lenses/board.md`. Rename seat 2 (the intended reader or decision maker) and seat 3 (the practitioner) to fit the assignment, for example "the programme director" and "a clinical lead", or for a business subject with the MBA pack on, names from `system/packs/mba/critique-presets.md` such as "the acquirer's CEO" and "a deal lawyer". Infer these from the questions and the case, if there is one. Do not ask; state them in one line.

## 4. Write the round card

Create `reviews/<round>/_round.md` in the assignment folder. Use **absolute paths** (the reviewers' Read tool needs them).

```markdown
---
type: "review-round"
created: "<today>"
status: "open"
assignment: "[[10_projects/<folder>/assignment]]"
round: <n>
panel: ["devils-advocate", "premortem", "grader"]
case_date: "<YYYY-MM-DD, or none when the assignment is not a case>"
---
# Round <n>

## Files to read
- Assignment: <abs path>/assignment.md
- Rubric: <abs path>/rubric.md
- Report: <abs path>/report.qmd
- Rendered report: <abs path>/report.pdf (if it exists)
- Decisions: <abs path>/decisions.md
- Course note: <abs path>
- Case text: <abs path, only if the assignment is a case>
- Course material: <abs paths, one per line>
- Workbook or data: <abs paths, if any>
- Voice profile: <abs path to vault/80_me/voice/<lang>/profile.md, if it exists>

## Board seats
1. The assessor
2. <intended reader or decision maker for this assignment>
3. <practitioner for this assignment>
4. <subject expert>
5. Referee
6. Editor

## Specialist seats
- <seat>
```

**Never put in the round card:** the thesis options, `brief.md`, earlier critiques, earlier reviews, chat history or your own view of the report. The reviewers must stay blind.

## 5. Run the reviewers

For each lens in the panel:

1. Read the front matter of `.claude/skills/assignment/references/lenses/<lens>.md` for its `model`.
2. Launch the `lens` agent (`.claude/agents/lens.md`) with that model and exactly this prompt, nothing else:

   ```
   lens_brief: <abs path to .claude/skills/assignment/references/lenses/<lens>.md>
   target: <abs path to report.qmd>
   context: <abs path to reviews/<round>/_round.md> (the round card lists every other file to read)
   round: <n>
   out_hint: reviews/<round>/<lens>.md
   Read the brief and the round card, then do exactly what the brief says. Return only your report.
   ```

3. Launch the reviewers of one wave in a single message so they run in parallel. Waves are no larger than the cap. On Pro, the full panel runs as devil's advocate, premortem and grader first, then board and specialists.
4. Save each report word for word to `reviews/<round>/<lens>.md`, under this front matter:

   ```yaml
   ---
   type: "review"
   created: "<today>"
   status: "done"
   lens: "<lens>"
   round: <n>
   ---
   ```

5. If a reviewer fails or ignores its output format, run it once more. If it fails again, go on without it and say so in one line.

Do not read the reviews closely yourself and do not summarise them for the user yet. Consolidation does that.

## 6. Consolidate (opus, high)

Launch a general-purpose subagent with `model: "opus"` and this prompt:

```
Consolidation brief: <abs path to .claude/skills/assignment/references/lenses/consolidation.md>
Round card: <abs path to reviews/<round>/_round.md>
Write exactly one file: <abs path to critique-<round>.md>. Do not edit any other file.
Read both files, then do exactly what the brief says.
```

If it cannot run on opus (plan limits), do the consolidation in the main session with the same brief and tell the user in one line.

Then read `critique-<round>.md` and check that its front matter has `round`, `panel`, `grade_low`, `grade_mid`, `grade_high`, `plateau` and `thesis`. Set the round card's `status: "done"`. Set `status: "critique"` in `assignment.md`.

## 7. The user decides

1. Show a short summary in chat: the grade range, the three findings with most marks at risk (and who raised them), how many decisions are proposed and how many proposals were not accepted, and the stop rule result.
2. Ask with AskUserQuestion: "How do you want to handle the proposed changes?"
   - "Accept them all (recommended)";
   - "Go through them one by one";
   - "Let me read the critique first". This adds `node system/scripts/tasks.mjs add "Review critique round <n> for <title>" --tag assignment --due <tomorrow> --priority medium --link "10_projects/<folder>/critique-<n>"` and stops here.
3. One by one: for each row of section 4, show the change and the replacement wording, then ask "Accept", "Overturn" or "Change it" (free text).
4. Update `decisions.md`:
   - accepted decisions go under **Taken**, with their alternatives and who raised them;
   - section 5 of the critique, and every decision the user overturned, go under **Not accepted**, so no later reviewer raises them again;
   - if the user agreed to reopen an earlier decision, move it to **Overturned** and add the new one under **Taken**.
5. Set the critique's `status: "decided"`.
6. Apply the accepted decisions now with revise mode: `.claude/skills/assignment/workflows/draft.md`, section 7.
7. Tick the "Review critique round <n>" task if there was one.

## 8. The stop rule

Read `stop_rule` from `assignment.md` (`target_grade` on the 10-point scale, `plateau_rounds`; if the file has no `target_grade`, use 9, and if it has no `plateau_rounds`, use 2) and `grade_mid` from every `critique-*.md`.

- **Plateau:** there are at least `plateau_rounds` rounds, the grader's `grade_mid` moved by no more than 0.25 across the last `plateau_rounds` of them, and the thesis fits one line.
- **Plateau at or above the target:** recommend stopping. On a yes, set `status: "final"` in `assignment.md`. Next step: `/assignment ship`.
- **Plateau below the target:** another round of the same will not move the grade. Show "What holds the last points" from the critique, then ask: "Ship as it is" (recommended when the deadline is close), "One more round aimed at these points", or "Rethink the design" (back to `brief`, a bigger change). Respect the answer.
- **No plateau yet:** recommend another round once the changes are applied, with the panel from section 2. If the deadline is two days away or less, recommend shipping instead.

Add a log line to `assignment.md`, for example `- 2026-10-12: critique round 2 (lite), grade 8.1 to 8.6, 7 changes accepted.`

## Extras

If the assignment extras are built (`.claude/skills/my-assignment-extras/` exists), offer the fact-check as an extra reviewer on round 1 and on the final round, and the delta fact-check after revise mode. See `system/blueprints/assignment-extras.md`.
