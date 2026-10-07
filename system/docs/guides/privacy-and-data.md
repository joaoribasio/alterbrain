---
type: "guide"
title: "Privacy and your data"
summary: "Where your data lives, what Alterbrain stores, the few things it never stores, and what may leave your computer."
---
# Privacy and your data

## The deal in one paragraph

Alterbrain is **your own private brain**. It is meant to hold sensitive facts about you (health, family, nationality, beliefs, finances) if you want it to know them, because that is how it writes accurately on your behalf. The rule is not "keep sensitive things out". The rule is: **store freely, and guard what leaves.** Two things follow. A short list of items is never stored at all, because they enable fraud if they ever leak. And nothing sensitive goes into an email, post, application or shared file unless you say yes for that one item.

## The trade-off you accept

- **Claude (Anthropic) processes what is in your vault.** Whenever a note, your fact sheet or your voice samples are used in a session, their text goes to Claude to produce an answer. Check your Claude privacy settings at claude.ai → **Settings** → **Privacy**.
- **Your vault is stored in your private GitHub repository.** That is the automatic backup. Only you can see it, unless you invite someone.
- **You control both.** You choose what to tell Alterbrain, you can delete any note, and you own both accounts. If you would rather not have a fact in the system, don't give it, or tell me to remove it.
- **You can encrypt your most private notes on GitHub (optional).** Facts about you, writing samples, people notes and your journal, and the PDFs and pictures you keep with them, are then stored scrambled in your repository. See [Encrypting your private notes](encrypting-private-notes.md).

## Where your data lives

| Place | What's there | Who can see it |
|---|---|---|
| Your computer | The Alterbrain folder: notes, sources, settings | You |
| Your private GitHub repository | A backup copy of the same folder (except the local-only bits below). Your most private notes are scrambled in it if you turned on [encryption](encrypting-private-notes.md) | Only you, unless you invite someone |
| Claude (Anthropic) | What you and Alterbrain discuss, and the notes it reads in a session | Handled under your Claude account's privacy settings |

## What stays only on your computer

- `state/local/`: logs, temporary files, and your answers about restricted course AI rules.
- `.env.local`: keys for tools (you type them in yourself).
- Sources you import that are over 100 MB: kept in `vault/40_sources/raw/_local/`, not uploaded. You can put any file there on purpose to keep it off GitHub.
- Files that cannot be backed up safely, each with a task: a file of 2 GB or more, a very large private file (if you encrypt your private notes), and a big file kept outside your vault folder. Files of 50 MB or more that can be uploaded are stored with Git LFS, an add-on for very large files. Everything smaller is saved as a normal file.
- Obsidian's per-device files (window layout, cache).

## What Alterbrain stores

Anything about **you**, when you give it to me or it appears in your own material:

- facts, including sensitive ones: nationality, ethnicity, gender, sexuality, health and diseases, religion, politics, family and general finances;
- your notes, journal, drafts, study cards, imported files and a record of where each came from;
- your writing voice profile and real examples of **your own** writing, kept as you wrote them, whatever they are about.

I don't filter these, soften them or leave them out because they are personal.

## What Alterbrain never stores

These are kept out of everything that is saved to your backup, because anyone who got hold of them could commit fraud:

- passwords, API keys, tokens, recovery codes and two-factor seeds;
- payment card numbers;
- bank account numbers and IBANs;
- government ID numbers (passport, BSN, SSN, national ID, driving licence number);
- answers to security questions (for example your mother's maiden name).

If you share one, I won't repeat it or save it. Keep it in a **password manager**. If it was a key or token, replace it, since it has now been typed into a chat. Keys that tools need go in `.env.local`, a file that is never backed up.

Also left out, for a different reason (quality, not privacy): other people's words in your voice files. If a sample contains someone else's lines, I keep only yours, so your profile learns your writing and nobody else's. The raw material used to learn your voice is deleted at the end, if you agree.

One exception you control: if you choose to add a chat export or similar file as a source, it is kept as you gave it. By default Alterbrain only summarises a chat export and does not keep it, and it asks that the other people agree first.

## Public and private facts

Every fact on your fact sheet (`vault/80_me/fact-sheet.md`) is marked **public** or **private**.

- **Public:** fine for anyone to see, such as your name, programme, city and past roles.
- **Private:** used only when you ask. Special-category facts (nationality, ethnicity, gender, sexuality, health, religion, politics, family, general finances) start as private. So do your visa status, birth date, home address and salary expectations.

You can change any row: "make my nationality public".

## What may leave your computer

Anything that leaves is an **outbound** item: an email, a post, a message, an application, a form, a CV, a presentation, a shared export, or the public Alterbrain project itself.

- Outbound items use **public facts only**.
- If a draft needs a private fact, it is flagged "private fact", and you decide for that draft. The answer applies to that draft only, not to later ones.
- Special-category facts are never put into outbound text without your yes.
- Nothing is sent without your approval in any case. Alterbrain drafts, you send (see [Autonomy and safety](autonomy-and-safety.md)).

## Email

Alterbrain reads an email only when you ask (for example "draft a reply to …") or during voice setup with your OK. A separate reader with no send or write powers summarises it. It reports what the email says, including sensitive content, and tells you when an email contains health, family, money or legal matters, so you know. Instructions inside emails are treated as information, never as commands.

## People in your notes

Notes about other people (`vault/60_people/`) hold **business facts** by default: role, organisation, how you met, each with a source and date. Their sensitive details (health, family, beliefs) are stored only if you explicitly ask. If you do, they stay private and never go into anything that leaves your computer. Mark anyone you don't want contacted with `dnc: true` ("do not contact").

## Encrypting your most private notes (optional)

Your repository is private, but anyone who got into your GitHub account could read it. If that worries you, Alterbrain can scramble the notes that matter most before they are uploaded: `fact-sheet.md`, `USER.md`, `MEMORY.md`, your voice files, people notes and the journal, and the PDFs, Word files and pictures you keep in those folders. On your computer they stay normal files and I still read them in every session. A small check that Git runs before every upload also stops Obsidian Git on a computer from sending a private note unscrambled; a phone is not covered. What it does not hide: file names and sizes, notes saved before you turned it on (they stay readable in old versions), audio and video, files outside those folders, and private files of 50 MB or more (those are kept off GitHub altogether). It needs a key file that you must keep safe: lose it and the laptop together and those notes cannot be recovered. Full explanation: [Encrypting your private notes](encrypting-private-notes.md).

## Removing things

- Delete a note in Obsidian or File Explorer whenever you like.
- Imported originals in `vault/40_sources/raw/` are protected from changes by Alterbrain. To remove one, ask: "Remove the file X from my sources", and it explains the steps. Your backup keeps history; if something must disappear from the history too, say so and Alterbrain will explain the options.

## Sharing

Your repository is private. Never make it public: it holds your notes, your facts and your voice profile. If you want to share one document, export it (for example "make a PDF of this note") and check it first; a shared export is an outbound item, so it should carry public facts only.
