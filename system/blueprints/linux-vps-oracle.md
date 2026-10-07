---
type: "blueprint"
title: "Run Alterbrain on a free cloud server (Oracle)"
kind: "automation"
status: "available"
risk: "high"
cost: "free if you stay within the Always Free limits"
---

# Run Alterbrain on a free cloud server (Oracle)

## What it does

A small always-on computer in a data centre runs Alterbrain's jobs, so nothing depends on your laptop or a spare machine at home. Example: the morning brief is built at 07:30 every day, even when you travel.

This is the hardest option in this set. Choose it only if a spare home computer is not possible.

## You'll need

- An Oracle Cloud account on the **Always Free** plan (a payment card is used for identity checks).
- The free **Ampere A1 (ARM)** server type, running Linux.
- A free Tailscale personal account, for private access.
- Your private Alterbrain repository on GitHub.
- Claude Code installed on the server, **unmodified**, signed in with **your own** subscription.

## Cost and risk

- Cost: zero if you stay inside the Always Free limits. Check the current limits on Oracle's site before you start [Unverified: allowance sizes change].
- Risk: high, because the server holds a signed-in Claude session and a copy of your notes.
  - Close every public port. Reach the server only through Tailscale.
  - Use SSH keys, not passwords.
  - Never use any tool that handles other people's Claude logins. One person, one subscription, one unmodified Claude Code.
  - Terms (read them yourself): Claude Code is covered by Anthropic's Consumer Terms (https://www.anthropic.com/legal/consumer-terms, version effective 8 October 2025, read on 7 October 2026) and Usage Policy (https://www.anthropic.com/legal/aup). Those terms bar automated use of the service except through an API key or where Anthropic permits it, and bar sharing your login. The Claude Code legal page (https://code.claude.com/docs/en/legal-and-compliance) says Pro and Max limits assume ordinary, individual use. This blueprint only uses Anthropic's own features, unmodified, signed in by you. It is not legal advice, and whether an unattended job counts as ordinary use is not spelled out, so keep it small and personal. Source notes: `docs/research/claude-code-mechanics.md`.
- Honest limits (checked October 2026 for Oracle; Claude points checked 7 October 2026):
  - **Home region cannot be changed later.** Pick a region in the EU if you want your data there.
  - **Capacity errors are common**: Oracle often says "out of capacity" for A1 servers. You may have to retry for days, or try another availability domain.
  - **Idle servers can be reclaimed.** Oracle may stop Always Free servers that sit nearly idle for a long time. Keep it doing real work, and keep a copy of everything in GitHub.
  - **Card verification** is required, and some cards are refused.
  - Signing in on a server with no screen: Claude Code shows a login link. Open it in a browser on another device, then paste the login code it shows back into the server terminal (https://code.claude.com/docs/en/authentication, checked 7 October 2026). Never share the code or the saved login file with anyone. Do not use `claude setup-token` for Alterbrain.
  - Some tools may not run on ARM. Check before relying on them.

## Questions I'll ask you

1. Why not a spare home computer? (If you have one, use that blueprint instead.)
2. Are you happy to give Oracle a card for identity checks, with no charge expected?
3. Which region? (I suggest the nearest EU one. You cannot change it later.)
4. Do you know how to use a terminal, or shall I give copy-and-paste steps?
5. Which jobs will run there?

## Build steps

1. **Verify first.** Read Oracle's current Always Free page and Claude Code's current install and sign-in docs. Write what you confirmed, and what you could not, in a note for the user. Do not promise capacity.
2. Run `/clarify` (type `automation`).
3. Guide the user through account creation. Never enter their card or password. They type all of it.
4. Guide them to create the A1 instance in their chosen region: Ubuntu, SSH key only, no public ports other than SSH during setup.
5. Install Tailscale on the server and on their device. Then close the public SSH port and use the Tailscale address.
6. Install Node 20 or higher, git and Claude Code by the official routes. Clone the private repository.
7. Guide the user to sign in to Claude Code with their own account. You never see or store credentials.
8. Run jobs with `claude --bg` sessions or the documented scheduling route for servers. If you cannot confirm a scheduling route, say so and propose a simple alternative with the user's approval.
9. Add a daily self-check: the job writes a heartbeat line to `state/local/heartbeat.log`. If it is missing for two days, `/health-check` raises a `#ab/automation` task.
10. Record the build in `state/built.json`.

## How to test

1. Reach the server over Tailscale and confirm SSH from the public internet is refused.
2. Run one job. Confirm the note appears in the repository after sync.
3. Reboot the server. Note what restarts by itself.

## How to undo

Terminate the instance in Oracle's console, remove it from Tailscale, sign out of Claude Code on it, and delete the job entries from `state/built.json`.
