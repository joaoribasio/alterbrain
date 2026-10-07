---
type: "blueprint"
title: "Run Alterbrain on a spare computer at home"
kind: "automation"
status: "available"
risk: "medium"
cost: "free, plus electricity (and a spare computer)"
---

# Run Alterbrain on a spare computer at home

## What it does

A spare computer at home stays switched on, so Alterbrain's jobs run even when your laptop is shut. Example: the morning brief is always ready at 07:30, and you can check on it from your phone.

## You'll need

- A spare Windows, Mac or Linux computer that can stay on (an old laptop or a small mini PC is fine).
- A copy of your Alterbrain repository on it (your private GitHub copy).
- Claude Code installed there, **unmodified**, signed in with **your own** Claude subscription.
- A free Tailscale personal account if you want private access from your phone or laptop.

## Cost and risk

- Cost: electricity only. Jobs use your normal Claude plan allowance.
- Risk: medium. A computer that is always on holds a logged-in Claude session and a copy of your notes.
  - Use a screen lock and a strong account password.
  - Turn on disk encryption (BitLocker on Windows, FileVault on Mac).
  - Never share the machine's login.
- Rule: each person runs the unmodified Claude Code on their own machine with their own subscription. Never use a tool that handles someone else's login or shares one login between people.
- Honest limits (checked 7 October 2026 against https://code.claude.com/docs/en/agent-view and https://code.claude.com/docs/en/remote-control):
  - Background sessions (`claude --bg`) are hosted by a helper process, so they do not need an open terminal. They survive sleep but **stop when the machine shuts down or restarts**; you reply to or attach to them to continue from the saved conversation.
  - Remote Control lets you steer a session running on the home machine from claude.ai or the Claude phone app. The machine must stay on. It needs a claude.ai subscription, not an API key.
  - Your saved login is stored on the machine and normally survives a restart, but it expires after a time. Claude Code warns three days before. When it expires, background and Remote Control sessions stop until you sign in again.
- Terms (read them yourself): Claude Code is covered by Anthropic's Consumer Terms (https://www.anthropic.com/legal/consumer-terms, version effective 8 October 2025, read on 7 October 2026) and Usage Policy (https://www.anthropic.com/legal/aup). Those terms bar automated use of the service except through an API key or where Anthropic permits it, and bar sharing your login. The Claude Code legal page (https://code.claude.com/docs/en/legal-and-compliance) says Pro and Max limits assume ordinary, individual use. This blueprint only uses Anthropic's own features, unmodified, signed in by you. It is not legal advice, and whether an unattended job counts as ordinary use is not spelled out, so keep it small and personal. Source notes: `docs/research/claude-code-mechanics.md`.

## Questions I'll ask you

1. Which computer will be the always-on one? Which system is it?
2. Will it sit somewhere safe, and is its disk encrypted?
3. Do you want to reach it from your phone? (Needs Tailscale.)
4. Which jobs should run there? (Start with one.)
5. Should it start by itself after a power cut?

## Build steps

1. **Verify first.** Confirm on the target machine: `node --version` is 20 or higher, `git --version` works, and `claude --version` works. Read Claude's current docs for `--bg` and Remote Control and note anything that differs from this page. Mark anything you could not confirm as [Unverified].
2. Run `/clarify` (type `automation`).
3. Guide the user, step by step and one question at a time, to clone their private repository onto the home machine and run `claude` there once to sign in with their own account. Never ask for, type or store their password.
4. Ask the user to turn on disk encryption and a screen lock. Do not change system or security settings yourself. Give the exact steps for their system and let them click.
5. Install Tailscale (personal plan) on the home machine and on the device they will use. Use the user's own sign-in. Check the machine appears in their Tailscale list. Do not open any port to the public internet.
6. Choose how jobs run:
   - simple: use the desktop app's local scheduled tasks (see the laptop blueprint) and keep the app open;
   - more advanced: start `claude --bg` sessions for longer work, and use Remote Control to watch from a phone. Confirm the exact commands against the docs named above before you give them [Unverified until tried on this machine].
7. Set the machine to stay awake and to start the app after a restart. Show the user the setting; they apply it.
8. Make sure auto-commit and auto-push are on (`config/brain.json`) so the home copy and the laptop copy stay in step.
9. Add a `#ab/automation` task for any step the user still has to do. Record the build in `state/built.json`.

## How to test

1. From your phone or laptop, over Tailscale, check you can see the machine.
2. Trigger one job and confirm it finishes and the note appears after the next sync.
3. Restart the machine and confirm what comes back by itself. Write down what does not.

## How to undo

Stop the jobs, sign out of Claude Code on the home machine, remove Tailscale from it, and delete the repository copy. Your main vault is unaffected.
