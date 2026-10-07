# Writing rules for assignment reports

Read this before drafting or revising `report.qmd`. These rules come from graded case reports and the mistakes that cost them marks.

## Process rules

- **Debate before drafting.** No draft until the user has picked a thesis in `brief`.
- **Ask before cutting.** Never remove text the user approved without asking. Once the user approves the length, add only into free space.
- **Edit in place.** One `report.qmd`. Git keeps every earlier version. Never create copies with version numbers in the name.
- **Answer the reviewers by checking, not obeying.** A reviewer can be wrong. Check every claim against the files before acting on it.

## Shape of the report

- **One central thesis and one key insight.** The thesis fits one line. If it does not, the argument is not ready.
- **A summary box that answers every question.** Put it first, between a `::: {.box}` line and a `:::` line (or the equivalent the report template documents). Every number in the summary matches the body word for word. Check them against each other at every revision: summaries drift.
- **Headings that answer the questions.** "Should the firm buy? Yes, in two stages" beats "Question 3".
- **A direct answer early.** Each question gets its answer in the first two sentences of its section, in the lecturer's terms. Show the expected analysis before an original twist.
- **Define the core concept in one line**, the first time it appears. No definition dumps: this is an MBA register.
- **Course concepts by name.** Use the course's own words where they fit (for example "adverse selection", "incentive"). Attribute a formula or an example to the course only if it is in the course material.

## Numbers

- **Name the base of every number.** Whose figure, which currency, which measure, which year, on whose books.
- **Every number traces to a source.** A page or exhibit of the case, a course file, or a cell in the workbook. If there is a workbook, keep the number map current (see the assignment extras blueprint).
- **Do not anchor on the case's own scenario sizes.** Stress-test them against base rates and simple indicators before using them.
- **Precise words.** A floor is "at least". An estimate is "about". A calculation "shows"; it does not "prove" or "correct" unless it really does. Say "beats the benchmark" rather than "pays off".
- **Check dates on quotes and data.** A quote made later than the case date breaks the hindsight rule. A record "since 1990" goes stale: check the last data point.

## Reading the sources

- **Read exhibits and attributions literally.** Who proposed what, which line item is which, what a committee did or did not discuss. Misreadings cost marks.
- **Hindsight rule.** Only facts knowable at the case date go in the report. What happened later goes to class prep or a reality check.

## Tables and figures

- **A figure title never contradicts its own data.** Legends name exactly what each line is.
- **Short tables float with their note.** Keep citations out of table cells and notes where the template asks.
- **Source notes** go under every table and figure: where the data comes from, or "Team calculations" with the workbook tab.

## Voice

- Write in the user's voice: `vault/80_me/voice/<lang>/profile.md` and `exemplars.md`, if they exist.
- Default house style when there is no profile: data-first openings, short declarative sentences, UK English, no filler openers ("However,", "Moreover,", "Additionally,"), no em or en dashes, no ellipses.
- After drafting, run `node system/scripts/slop-check.mjs report.qmd --lang <lang>` if it exists, and fix every hard hit.

## Labels

- In working files, mark estimates `[Inference]` and anything unchecked `[Unverified]`.
- Before `ship`, every `[Unverified]` is either checked or removed. `[Inference]` may stay only where the report itself presents a judgement, and then in plain words ("we estimate").
