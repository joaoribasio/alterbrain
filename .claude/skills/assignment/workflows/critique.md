# /assignment critique: a round of blind reviews, one consolidated critique

Goal: independent reviewers read the report without seeing each other's work or the drafter's reasoning. One consolidation pass turns their reports into `critique-<round>.md`. The user decides. The accepted changes are applied. The stop rule says when to stop.

Helpers: reviewers and consolidation run as the named helpers in each lens brief (`helper-review`: sonnet, high; `helper-judgement`: opus, high), as `.claude/skills/critique/references/panel.md` says. The rest runs in the main session.

## 1. Check the starting point

- `report.qmd` exists. If not, run `draft` first.
- **Round number.** Count the `critique-*.md` files in the folder; this round is that count plus one.
- If the last critique still has `status: "open"`, the user has not decided on it yet. Offer to go through it first (section 7) instead of starting a new round.
- If there is a render of the report next to it (for example `report.pdf`) older than `report.qmd`, re-render with the `render` skill so reviewers can check the page count and the figures.

## 2. Choose the panel

1. **Fan-out cap.** Read `plan_tier` from `config/brain.json` (`pro` if missing). The cap is in `system/catalogue/routing.json` under `caps` (Pro 3, Max 8). Never run more reviewers at once than the cap.
2. **The two panels.** The core of both is the devil's advocate, the premortem and the grader. The specialists' seats are inferred from the subject (step 3). The lens briefs and the choice by deliverable type are in `.claude/skills/critique/references/lenses/` and `lens-choice.md`; for an assignment the `lenses` in `assignment.md` decide what the full panel holds. A user's note that says `lite` is read as `quick`.
   - **Full panel:** every lens in `lenses` in `assignment.md` (by default devil's advocate, premortem, board, specialists, grader). The board has neutral seats; for a business subject with `mba` in `packs` (`config/brain.json`) it takes the presets in `system/packs/mba/critique-presets.md`. A workbook among the deliverables adds the model-audit lens, and a rubric makes the grader count.
   - **Quick panel:** devil's advocate, premortem and grader.
3. **Recommended default.**
   - On **Max**: the full panel on round 1 and on the final round; the quick panel on the rounds in between.
   - On **Pro**: the quick panel on every round. It fits the cap in one go and saves usage. Offer the full panel as an option; it then runs in two waves, and say plainly that a full panel uses noticeably more of the plan than a quick one.
   - Call a round "final" when the user says so, when the last critique met the stop rule, or when the deadline is three days away or less.
4. Ask with AskUserQuestion: "Which reviewers should read it this round?" Options, the recommended one first and marked "(recommended)", each with a one-line pro and con (for example "Quick: three reviewers, fits your usage, no specialist check of the numbers" and "Full: all five, finds technical errors, uses more of your plan"): "Full panel (5 reviewers)", "Quick panel (devil's advocate, premortem, grader)", "Let me pick". For "Let me pick", list the five lenses with one line each and let the user choose. Warn in one line if they leave out the grader: the stop rule needs its grade.

## 3. Seats

Only for the lenses in this round's panel.

- **Specialists.** Propose three to five seats inferred from the questions and the subject: the main method of the field, the rules or standards that apply, a domain expert, an academic in the field (for a management report, say, "stakeholder analysis" and "change management"; for a statistics essay, "inference" and "study design"). When `packs` lists `mba` and the subject is business, draw on the examples in `system/packs/mba/critique-presets.md`. If an earlier round card exists, propose the same seats. Ask the user to confirm or change them (AskUserQuestion with "Use these seats (recommended)": "Fits the questions; you can still change one." / "Change them": "Costs one more question.").
- **Board.** Keep the six default seats in `.claude/skills/critique/references/lenses/board.md`. Rename seat 2 (the intended reader or decision maker) and seat 3 (the practitioner) to fit the assignment, for example "the programme director" and "a clinical lead", or for a business subject with the MBA pack on, names from `system/packs/mba/critique-presets.md` such as "the acquirer's CEO" and "a deal lawyer". Infer these from the questions and the case, if there is one. Do not ask; state them in one line.

## 4. Prepare the inputs, then write the round card

1. **Prepare the inputs first**, as `.claude/skills/critique/references/panel.md` section 2 says, because the lenses depend on them: resolve the template and house rules (`template.mjs resolve --kind report --for "<assignment folder>/assignment.md" --json`), render the pages to PNGs when a lens needs them (`pages.mjs pdf`; `pages.mjs export` first for Word, PowerPoint or Excel), and, if the deliverables include a workbook, run `workbook-check.mjs "<file.xlsx>" --json` and save its output with the Write tool to `reviews/<round>/_workbook-check.json` (the model-audit lens stops without it). Note the voice profile, the tone (`tone` in `assignment.md`, else the resolved one) and the voice mode (`voice_mode`, group work only).
2. **Write the card** at `reviews/<round>/_round.md` in the format of `panel.md` section 3 (front matter, Files to read, Reference files, Template rules, Board seats, Specialist seats), with these assignment values: `assignment: "[[10_projects/<folder>/assignment]]"`, `round: <n>`, `panel` from section 2, `case_date` (`none` when the assignment is not a case), "Brief for the work" is `assignment.md`, and the Files to read list also holds the rubric, `decisions.md`, the course note, the case text, the course material and the workbook check when they exist. Use **absolute paths**: the reviewers' Read tool needs them. Do not keep a second copy of the card format here.

**Never put in the round card:** the thesis options, `brief.md`, earlier critiques, earlier reviews, chat history or your own view of the report. The reviewers must stay blind.

## 5. Run the panel

Follow `.claude/skills/critique/references/panel.md` (the one procedure for every deliverable) with this round's panel and round card. In short, and as the procedure says in full:

- the round card in `reviews/<round>/_round.md` (section 4) is what the reviewers receive, with the briefs in `.claude/skills/critique/references/lenses/` and the rules in `.claude/skills/critique/references/protocol.md`;
- each reviewer runs as the helper its brief names (`helper-review` or `helper-judgement`), blind, in waves no larger than the fan-out cap from section 2, with no model override;
- each report is saved word for word to `reviews/<round>/<lens>.md` (`type: "review"`, `lens`, `round`, `status: "done"`);
- a reviewer that fails is run once more, then left out with one line to the user.

Do not summarise the reviews for the user yet. A full panel is consolidated by `helper-judgement` (section 6), and the main session reads only the critique it writes. A quick panel is merged by the main session in section 6, which reads the reviews then, after every reviewer has finished.

## 6. Consolidate

Per `panel.md`: the full panel is consolidated by `helper-judgement` with the brief `.claude/skills/critique/references/lenses/consolidation.md`, writing exactly one file, `critique-<round>.md` in the assignment folder. A quick panel is merged by the main session with the same brief. If `helper-judgement` cannot run (plan limits), the main session does it and says so in one line.

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

Add a log line to `assignment.md`, for example `- 2026-10-12: critique round 2 (quick), grade 8.1 to 8.6, 7 changes accepted.`

## Extras

If the assignment extras are built (`.claude/skills/my-assignment-extras/` exists), offer the fact-check as an extra reviewer on round 1 and on the final round, and the delta fact-check after revise mode. See `system/blueprints/assignment-extras.md`.
