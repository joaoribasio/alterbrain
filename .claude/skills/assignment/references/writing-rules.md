# Writing rules for assignment reports

Read this before drafting or revising `report.qmd`. These rules come from graded reports and the mistakes that cost them marks.

## Process rules

- **Debate before drafting.** No draft until the user has picked a thesis in `brief`.
- **Ask before cutting.** Never remove text the user approved without asking. Once the user approves the length, add only into free space.
- **Edit in place.** One `report.qmd`. Git keeps every earlier version. Never create copies with version numbers in the name. The one exception is the temporary scratch files of the draft speed option (`state/local/tmp/draft-<n>.qmd`, `draft.md` section 5), which the main session assembles into `report.qmd` and deletes.
- **Answer the reviewers by checking, not obeying.** A reviewer can be wrong. Check every claim against the files before acting on it.

## Shape of the report

- **One central thesis and one key insight.** The thesis fits one line. If it does not, the argument is not ready.
- **A summary box that answers every question.** Put it first, between a `::: {.box}` line and a `:::` line (or the equivalent the report template documents). Every number in the summary matches the body word for word. Check them against each other at every revision: summaries drift.
- **Headings that answer the questions.** "Should the team adopt it? Yes, in two stages" beats "Question 3".
- **A direct answer early.** Each question gets its answer in the first two sentences of its section, in the assessor's terms. Show the expected analysis before an original twist.
- **Define the core concept in one line**, the first time it appears. No definition dumps: match the register of the course, written for a reader who knows the field.
- **Course concepts by name.** Use the course's own words where they fit (for example "sampling bias", "incentive", "sunk cost"). Attribute a formula or an example to the course only if it is in the course material.

## Numbers

- **Name the base of every number.** Whose figure, which currency, which measure, which year, on whose books.
- **Every number traces to a source.** A page or exhibit of the case (if it is a case), a source note, a course file, or a cell in the workbook. If there is a workbook, keep the number map current (see the assignment extras blueprint).
- **Do not anchor on a case's own scenario sizes** (if the assignment is a case). Stress-test them against base rates and simple indicators before using them.
- **Precise words.** A floor is "at least". An estimate is "about". A calculation "shows"; it does not "prove" or "correct" unless it really does. Say "beats the benchmark" rather than "pays off".
- **Check dates on quotes and data.** In a case with a case date, a quote made later than that date breaks the hindsight rule. A record "since 1990" goes stale: check the last data point.

## Reading the sources

- **Read exhibits and attributions literally.** Who proposed what, which line item is which, what a committee did or did not discuss. Misreadings cost marks.
- **Hindsight rule.** Only for an assignment with a case date: only facts knowable at that date go in the report. What happened later goes to class prep or a reality check.

## Tables and figures

- **A figure title never contradicts its own data.** Legends name exactly what each line is.
- **Short tables float with their note.** Keep citations out of table cells and notes where the template asks.
- **Source notes** go under every table and figure: where the data comes from, or "Team calculations" with the workbook tab.

## Voice, tone and story

Full rules: `system/deliverables/tone-and-voice.md`.

- **Voice is always on.** Write in the user's voice: `vault/80_me/voice/<lang>/profile.md` and `exemplars.md`. There is no neutral house style to fall back on. With no profile, say so once per session and suggest the voice setup (onboarding M5); carry on only if the user wants to now.
- **Tone is a dial on top of the voice, never a replacement.** `academic`, `professional` or `conversational`, read from `tone` in `assignment.md`, else the course, programme or recommended default. An academic tone keeps the story quieter.
- **Group work.** Read `voice_mode` in `assignment.md`: `me` is the user's voice, `team` a neutral team register.
- **Tell the story inside the structure.** Answer first, then the stakes, a real moment from the case or from the user's own facts, concrete specifics, a contrast, and a close that calls back to the opening. No tidy moral or inspirational ending. No invented anecdote, quote or number.
- **A rubric or a school template that prescribes a structure wins.** Say so in one line to the user.
- After drafting, run `node system/scripts/slop-check.mjs report.qmd --lang <lang>` if it exists, and fix every hard hit.

## Labels

- In working files (`brief.md`, `decisions.md`, the hidden review-notes block, critique notes), mark estimates `[Inference]` and anything unchecked `[Unverified]`.
- **Nothing that leaves the computer carries a bracket label** (`[Inference]`, `[Unverified]`, `[Speculation]`, `[FACT NEEDED: ...]`), and no placeholder such as `[Teammate name]`. In the report, say it in plain words: "we assume", "in our reading", "we estimate".
- Before `ship`, every `[Unverified]` is checked or removed, every `[Inference]` is rewritten as a plain statement of judgement, and every `[FACT NEEDED]` is answered. The release scan (`system/scripts/release-scan.mjs`, run by the delivery gate) fails the file otherwise.
