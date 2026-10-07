# Tools Alterbrain can connect to

An "MCP server" is a small helper program that gives Alterbrain one extra ability, such as reading a web page or searching your Zotero library. This page lists the helpers we have checked.

Everything here was checked on 7 October 2026. The machine-readable version is `system/catalogue/mcp.json`. If this page and that file ever disagree, the file wins.

## How to turn one on

Just say: **"ask Alterbrain: turn on `<name>`"**, for example "turn on zotero-mcp". Alterbrain will explain what it does, check the risk with you, and set it up. You never edit settings files yourself.

To turn one off, say "turn off `<name>`".

## How to read the risk column

- **Low**: reads public or local things. Very little can go wrong.
- **Medium**: uses an account of yours, or unofficial data. Check your school or employer rules first.
- **High**: can break a website's rules or act as you in public. Your account could be limited or banned.

Anything that sends, posts or submits is held back by the **outbound guard** unless you have allowed that channel in `config/autonomy.json`. The default is "draft": Alterbrain writes the draft and you send it. The guard works out the channel from the helper's name. A helper it does not recognise (for example `google_workspace_mcp` or `ms-365`) counts as "other", where the default also applies.

## Core tier: the basics

**On by default** (these three start with `npx`, so they work on a fresh computer):

| Name | What it does | Risk | Notes |
|---|---|---|---|
| `mcpvault` | Reads, searches and writes notes in your vault | Low | Works even when Obsidian is closed |
| `playwright` | Opens web pages and fills in forms in a browser | Low | Submitting is held back (channel: web-forms) |
| `context7` | Looks up current software documentation | Low | Sends the library name to Upstash |

**Core, but off until you ask** (turn them on with "ask Alterbrain: turn on `<name>`"):

| Name | What it does | Risk | Notes |
|---|---|---|---|
| `markitdown` | Turns PDFs, Word, PowerPoint and Excel files into text | Low | Needs `uv` (see below); alpha release, pinned |
| `fetch` | Downloads a web page as text | Low | Needs `uv` (see below) |
| `mcpvault-readonly` | The same vault access as `mcpvault`, but read-only | Low | Pick this or `mcpvault`, not both |
| `filesystem` | Reads and writes files in the folders you allow | Low | Vault only by default |

**What is `uv`?** It is a small free program that starts helpers written in Python. Two of the helpers above need it, and some blueprints do too. You do not need it for anything else. To install it: `winget install --id astral-sh.uv -e` on Windows, or `brew install uv` on a Mac. `/health-check` tells you if a helper you turned on needs it and it is missing.

## Optional tier: turn on when you need it

| Name | What it does | Risk | How you sign in |
|---|---|---|---|
| `google_workspace_mcp` | Reads Gmail, Calendar and Drive (read-only to start) | Low | Your own Google sign-in |
| `zotero-mcp` | Searches your Zotero library | Low | Zotero app open on your computer |
| `qmd` | Fast search of your notes by meaning | Low | None. Windows can be awkward |
| `obsidian-local-rest` | Talks to Obsidian while it is open | Low | Key from the Obsidian plugin |
| `firecrawl` | Reads hard-to-load websites | Low | Firecrawl key (free tier) |
| `exa` | Web search built for AI | Low | Exa key (free tier) |
| `yahoo-finance` | Share prices and company numbers for cases | Medium | None. Unofficial data. Not for trading |
| `anki` | Flashcards in the Anki app | Low | Anki open with AnkiConnect |
| `ms-365` | Reads Outlook mail, calendar and OneDrive | Medium | Microsoft sign-in; your school may need to approve |

## High-risk tier: only if you understand the risk

| Name | What it does | Risk | Why it is risky |
|---|---|---|---|
| `linkedin` | Reads LinkedIn pages through a real browser | High | LinkedIn forbids automation. Account could be restricted |
| `instagram` | Not a server. Official Meta API only (blueprint) | High | Needs a business account; scraping is banned |
| `telegram` | Reads and sends as your Telegram account | High | The login key is as strong as your password |

For your own LinkedIn data without scraping, so the ban risk above does not apply (members in the EEA and Switzerland only), see the `linkedin-data-portability` blueprint. It is not a helper to switch on: Alterbrain builds a small read-only script from the blueprint.

## Avoid tier: we do not recommend these

| Name | Why not |
|---|---|
| `notebooklm` | Archived in September 2026 and drives your Google login in a browser |
| `whatsapp` | No official personal API. Number can be banned. No updates since July 2025 |
| `x-twitter` | The official API is paid and strict; community servers vary a lot |
| `browserbase` | Archived. Playwright does the same job on your own computer |
| `office-word-gongrzhe` | Archived. Use Quarto for documents |

## Good to know

- Pinned versions: every server that has a package is fixed to an exact version (or, for two of them, a fixed commit or tag) so an update cannot surprise you. Entries in the avoid tier and guide-only entries have nothing to pin. `/health-check` tells you when newer ones are worth testing.
- Keys and tokens live in `.env.local` on your computer. Never paste one into a chat.
- There is no helper for your school's learning platform. Some schools do not allow automated access, so course files arrive by download instead: save everything from the course site, then give Alterbrain the folder or the zip (`/ingest`).
- Some items carry the label `[Unverified]` in the machine-readable file. That means a detail was not confirmed yet. Alterbrain checks it the first time you turn that tool on.
- Related how-to guides are in `system/blueprints/`.
