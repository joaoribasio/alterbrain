---
type: "blueprint"
title: "Why Alterbrain does not connect to WhatsApp"
kind: "blueprint"
status: "available"
risk: "high"
cost: "free"
---

# Why Alterbrain does not connect to WhatsApp

## What it does

This page explains why there is no WhatsApp add-on, and gives safe ways to get the same benefit. Example: you want Alterbrain to summarise a group chat about a project. You can do that with an exported chat file, and no risk to your number.

## You'll need

- Nothing to install. For the safe alternatives: your phone, and optionally a Telegram account.

## Cost and risk

- Cost: free.
- Why not:
  - WhatsApp has **no official way** for a normal personal account to be read or controlled by a program. The official Business Platform is for companies, with business verification and message rules.
  - Community tools pretend to be a "linked device" on your phone number. This is against WhatsApp's rules, and your number can be banned. That would cut you off from classmates, family and work.
  - The best-known community server (`lharries/whatsapp-mcp`) has had no update since July 2025.
  - Such a tool would read **everyone's** private messages in your chats, not only yours.
- So the catalogue lists it in the "avoid" tier, and Alterbrain will not build it.

## Questions I'll ask you

1. What did you want from WhatsApp? (Summaries, reminders, quick capture, group-work decisions?)
2. Is it one group chat or everything?
3. Are you comfortable exporting a chat by hand now and then?
4. Would a Telegram bot for quick notes to yourself be enough?
5. Do the other people in the chat know, and are they fine with it? (Needed before you export a group chat. If any of them would say no, do not export it.)

## Build steps

1. **Verify first.** Re-read WhatsApp's current help pages for "Export chat" and for the Business Platform. Note any change since 2026-10 as [Unverified] if you cannot confirm it.
2. Run `/clarify` (type `blueprint`) to find the real need.
3. Offer the matching option:
   - **Summarise a chat:** the user opens the chat on their phone, chooses "Export chat" (without media), and saves the file to their computer. First get consent: for a group chat, ask the user to confirm the other members know and agree (see question 5); for a one-to-one chat, ask whether the other person is fine with it. Without a yes, stop. Then read the file **where the user saved it. Do not run `ingest.mjs` on it**, so no raw copy of other people's messages goes into `vault/40_sources/raw/` (which syncs to GitHub). Write one source note with only what the user needs, such as decisions, deadlines and who owns each task. Refer to other people by first name or initials, never by phone number, and never quote their messages at length. Set `private: true`. Then ask the user to delete the export file from their computer and phone (do not delete it yourself).
   - **Capture notes to self:** use `/capture`, or the Telegram blueprint for a private bot only the user can message.
   - **Reminders:** add tasks with `node system/scripts/tasks.mjs add`.
   - **Group work:** suggest moving decisions into a shared document everyone can see.
4. Never ask for the user's WhatsApp login, QR code or backup. If they ask for the unofficial tool anyway, explain the risks once, and tell them you will not set it up. They are free to decide for themselves, but this framework will not do it.
5. Record the chosen alternative in `state/built.json` if one was built.

## How to test

1. Export a short test chat, ask for a summary, and check the source note has the date, uses initials or first names only, and that nothing was added to `vault/40_sources/raw/`.
2. Ask a question about it. Expect an answer with a citation.

## How to undo

Delete the source note. By default no raw copy exists in the vault. If you chose to ingest an export anyway, that raw file in `vault/40_sources/raw/` is never edited or deleted by Alterbrain, so remove it by hand (and its line in `vault/40_sources/manifest.jsonl`). Delete the exported file from your phone and computer.
