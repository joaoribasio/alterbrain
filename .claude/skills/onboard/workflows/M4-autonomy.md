# M4 Autonomy and self-build

**Goal:** the user decides how much Alterbrain may do on its own, per channel, and whether it may suggest new skills.
**Time:** about 3 minutes. **Essential.**
**Model / effort:** sonnet / medium.

Say at the start: "Last essential step: how much I'm allowed to do on my own. You stay in charge; you can change this any time with `/reconfigure`."

## Inference sources

- `config/autonomy.json` and `config/brain.json` (`self_build`, `plan_tier`).
- `state/built.json`: which blueprints are built (needed before `auto` is real).

## Explain the three levels (exactly this, in plain words)

> **Draft** (recommended): I write it, you send it. Emails, posts and applications wait in your outbox, and I add a task for you to review. This works from day one.
> **Approve** (later, needs an add-on): I prepare it and ask you "send now?" every time. Nothing goes out without your click. For email, say "build Gmail send with approval" when you want it.
> **Auto** (later, needs a second add-on): I send on my own, within limits you set.

Be straight about it: Approve and Auto do nothing until their add-on is built, so today every channel starts as Draft.

Add: "Whatever you choose, I never pay for anything and never share your passwords."

## Questions (one at a time)

1. **Overall level.** Offer only what works today. AskUserQuestion: "How should I handle things that leave your computer?"
   - Draft everything; I'll send myself (recommended)
   - I want you to send for me later (needs an add-on)
2. **If they want sending later:** explain in two lines which add-on gives it ("Ask me before sending needs the Gmail send add-on: say `build Gmail send with approval` any time"). Offer a task `Look at the send-with-approval add-on for email` (`--tag onboard --priority low`). Keep every channel on `draft` for now. Never set `approve` or `auto` in this module.
3. **Self-build.** Explain in two lines: "When I notice you doing the same thing again and again, I can suggest a small new skill for it. I write a one-page proposal; nothing is built unless you say yes." AskUserQuestion:
   - Yes, suggest things when you notice a pattern (recommended)
   - Only when I ask
   - Never build new things
   Map: first → `mode: "propose"`, `proactive: true`; second → `mode: "propose"`, `proactive: false`; third → `mode: "off"`, `proactive: false`.
4. **Open suggestions limit** (only if proactive): "At most how many open suggestions at once?" 1 / 3 (recommended) / 5. Store as `max_open_proposals`.
5. **Claude plan.** "Which Claude plan do you have?" Pro (recommended if unsure) / Max. Explain: "On Max I can run more helpers at the same time. On Pro I'm more careful to save your usage." Store as `plan_tier` (`pro` or `max`).

## Confirm, then write

Show:

> Sending: draft for everything (you send) · New skills: I suggest, you decide (max 3 open) · Plan: Pro

Ask "Save?" (Save (recommended) / Change something). Then:

- `config/autonomy.json`: set `default` and each `channels.<name>.level` to `draft`. Write `approve` or `auto` only for a channel whose blueprint is already built (`node system/scripts/built.mjs has <blueprint>` succeeds); in a first setup that is never the case.
- `config/brain.json`: set `self_build.mode`, `self_build.proactive`, `self_build.max_open_proposals`, and `plan_tier`. Edit only those keys.

## Wrap-up of the essentials

- Say: "That's the essentials done. Here's what I know and where it lives:" then 4 bullets (identity, profile, courses or projects, safety settings).
- Point to the guide: `system/docs/guides/autonomy-and-safety.md`.
- Only if M0 had to create `.mcp.json` in this session (it normally exists before the first restart), add once: "Close this session and open the folder again, so the standard tools load." (Explain: "In the Claude app, close this session and open the folder again.") Otherwise do not ask for a restart.
- Continue with step 6 of `SKILL.md` (offer the optional modules).

## Files written

- `config/autonomy.json`
- `config/brain.json` (`self_build`, `plan_tier`)

## Done criteria

- Every channel in `config/autonomy.json` has `draft` (or `approve` / `auto` only with a built blueprint).
- `self_build` and `plan_tier` reflect the user's answers.

Then: `node system/scripts/onboard-progress.mjs done M4`.
