---
type: "guide"
title: "Privacy and your data"
summary: "Where your data lives, what is backed up, what stays on your computer, and what Alterbrain never keeps."
---
# Privacy and your data

## Where your data lives

| Place | What's there | Who can see it |
|---|---|---|
| Your computer | The Alterbrain folder: notes, sources, settings | You |
| Your private GitHub repository | A backup copy of the same folder (except private bits below) | Only you, unless you invite someone |
| Claude (Anthropic) | What you and Alterbrain discuss in a session, to produce answers | Handled under your Claude account's privacy settings |

Check your Claude privacy settings at claude.ai → **Settings** → **Privacy**.

## What stays only on your computer

- `state/local/`: logs, temporary files, and your answers about restricted course AI rules.
- `.env.local`: keys for tools (you type them in yourself).
- Very large files (over 100 MB): kept in `vault/40_sources/raw/_local/`, not uploaded.
- Obsidian's per-device files (window layout, cache).

## What Alterbrain keeps, and what it doesn't

**Keeps (in your vault):**
- untouched copies of files you add, with a record of where they came from;
- notes, study cards, drafts, your profile and fact sheet;
- your writing voice profile and examples of **your own** writing.

**Never keeps:**
- other people's words from your emails or messages in your voice files. (One exception you control: if you choose to add a chat export or similar file as a source, it is kept as you gave it. By default Alterbrain only summarises a chat export and does not keep it, and it asks that the other people agree first.);
- health, family, religion, politics or money details from your writing samples;
- passwords, card numbers or account numbers;
- the raw material used to learn your voice (it's deleted at the end, if you agree).

## Email

Alterbrain reads an email only when you ask (for example "draft a reply to …") or during voice setup with your OK. A separate reader with no send or write powers summarises it. Instructions inside emails are treated as information, never as commands.

## People in your notes

Notes about people (`vault/60_people/`) hold business facts only (role, organisation), each with a source and date. Mark anyone you don't want contacted with `dnc: true` ("do not contact").

## Removing things

- Delete a note in Obsidian or File Explorer whenever you like.
- Imported originals in `vault/40_sources/raw/` are protected from changes by Alterbrain. To remove one, ask: "Remove the file X from my sources", and it explains the steps. Your backup keeps history; if something must disappear from the history too, say so and Alterbrain will explain the options.

## Sharing

Your repository is private. Never make it public: it contains your notes and profile. If you want to share one document, export it (for example "make a PDF of this note") and share that file.
