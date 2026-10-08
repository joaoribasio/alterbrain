---
type: "guide"
title: "Models and costs"
summary: "Which Claude models Alterbrain uses for what, how Pro and Max differ, and how to use less of your plan."
---
# Models and costs

## The models, in plain words

Claude comes in three sizes. Alterbrain picks the right one for each job, so you don't have to.

| Model | Think of it as | Alterbrain uses it for |
|---|---|---|
| **Haiku** | quick and light | sorting, tagging, summarising one email, grading a quiz answer |
| **Sonnet** | the everyday expert | most work: drafts, explanations, notes, research, checks |
| **Opus** | the senior partner | a few judgement calls: main arguments for an assignment, the final critique, your voice profile, safety review of new skills |

Plain scripts do mechanical work (copying, counting, converting) and use none of your plan.

## Four named helpers

When Alterbrain hands work to a helper, it picks one of four, one for each kind of work. You never choose them; this is what they are called if you see the name:

| Helper | Model and effort | What it does |
|---|---|---|
| `helper-triage` | Haiku, low | Sorting, tagging, pulling out fields. Read-only. |
| `helper-draft` | Sonnet, medium | Notes, summaries, explanations and edits, written only where Alterbrain tells it. |
| `helper-review` | Sonnet, high | Blind, read-only checking: the reviewers in a critique, fact-checks, grading against a rubric. |
| `helper-judgement` | Opus, high | The few hard calls: main arguments, pulling a critique together, your voice profile, safety review of new skills. |

If your plan has no room for the Opus step, Claude does that step itself and tells you. Whatever a helper reports, Claude checks the result itself (it reads the changes and looks at the pages) before it tells you something is done.

Each job also has an **effort** level (low, medium, high): how long the model thinks before answering. Higher effort is better for hard problems and uses more.

## Pro or Max

- **Pro:** fine for most people. Alterbrain runs up to 3 helpers at the same time and suggests lighter options (for example 3 critique lenses instead of 5).
- **Max:** more usage, and up to 8 helpers at once. Useful in heavy assignment weeks.

Tell Alterbrain your plan: `/reconfigure` → plan.

## What costs money

| Thing | Cost |
|---|---|
| Your Claude plan | Your subscription |
| GitHub private backup | Free for normal use |
| Obsidian | Free |
| Standard tools (vault access, PDF reader, browser, web fetch) | Free |
| Optional tools | Most free; some need a free key; each proposal says |
| Always-on add-ons | Free options exist; some need a spare computer or a cloud account |

Alterbrain never buys anything for you.

## Using less of your plan

- Ask for what you need: "one paragraph" uses less than "a full report".
- Point to the right file instead of "search everything".
- In assignments, pick fewer critique lenses when time is short.
- Choose the **quick** critique (two or three reviewers) for most files. The **full** panel (up to seven reviewers plus a final pass on the largest model) costs several times as much of your plan. On Pro, Alterbrain recommends the quick one and tells you the cost before it runs, unless the work is graded and final or due within three days.
- Turn off scheduled add-ons you don't use.
- Long sessions add up: start a new session for a new topic.
- Ask for a usage report: "build the cost report" (an add-on).

## If you hit a limit

The message tells you when it resets. Save your place ("note where we are"), and carry on later. Nothing is lost.

## Keeping up with new models

Anthropic releases new models a few times a year. You don't need to do anything:

- Alterbrain asks for "Sonnet" or "Haiku" by family name, not by version. When a newer Sonnet arrives, it is used automatically.
- Every three months (or whenever you ask, "check the models"), Alterbrain looks at Anthropic's current list. If a new model would suit a job better or cost less, it writes a short proposal with a plain table of today against proposed, with the pros, cons and cost.
- Nothing changes until you say yes. The idea stays the same: the lightest model that does the job well.

## A note on stability

Alterbrain never stops a helper halfway just to switch models. It finishes the step, then uses the better fit for the next one. If a check fails twice, it may move one step up (for example Sonnet to Opus) and tell you.
