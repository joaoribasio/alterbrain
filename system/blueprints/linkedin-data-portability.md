---
type: "blueprint"
title: "LinkedIn official data (read-only)"
kind: "automation"
status: "available"
risk: "low"
cost: "free"
---

# LinkedIn official data (read-only)

## What it does

Alterbrain pulls **your own** LinkedIn data through LinkedIn's official data-portability service. EU law (the Digital Markets Act) obliges LinkedIn to offer this to members in the European Economic Area (EEA) and Switzerland. It only reads. It cannot post, message or connect, it does not open LinkedIn in a browser, and it does not scrape, so the ban risk of the `linkedin` helper does not apply.

Example: you say "which of my LinkedIn connections work at consulting firms?" and Alterbrain answers from your saved connections list, saying how old the list is. Every week it also adds a few lines to one note: "This week on LinkedIn: 3 invitations sent, 1 post, 5 comments."

What you can get:

| You want | LinkedIn calls it |
|---|---|
| Your connections (name, employer, job title, date connected) | `CONNECTIONS` |
| Invitations you sent and received | `INVITATIONS` |
| Your posts and re-shares (date, link, your text) | `MEMBER_SHARE_INFO` |
| Your profile (headline, jobs, education, skills) | `PROFILE`, `POSITIONS`, `EDUCATION`, `SKILLS` |
| Messages (optional, off by default) | `INBOX` and the change log |

What it cannot do: look at anyone else's profile, search LinkedIn, or tell you who accepted an invitation after you set it up (see the honest limits below).

## You'll need

- A LinkedIn account that LinkedIn treats as located in the EEA (the EU countries plus Norway, Iceland and Liechtenstein) or Switzerland. LinkedIn only gives the token to these members. Which location counts (profile or residence) is not stated in the documents [Unverified].
- A free LinkedIn developer app. You make it once in LinkedIn's Developer Portal (about 10 minutes). You do **not** create a company page.
- A text editor, to put one line in `.env.local`.
- The Node.js that Alterbrain already needs. Nothing else is installed.

## Cost and risk

- Cost: free.
- Risk: low.
  - It is LinkedIn's own route for this, it only sends read requests, and it never touches linkedin.com pages. Read the terms LinkedIn shows when you request access.
  - The token (a long password-like code) lets whoever holds it read your LinkedIn data. Keep it in `.env.local` only. Never paste it into the chat. It expires: LinkedIn tokens are normally valid for 60 days, but the figure for tokens made in the developer tool is not stated [Unverified]. When it stops working you make a new one.
  - Your connections list holds other people's names and jobs. It stays in your private vault. If you use the online backup, those files are backed up with it. Do not share the raw files.
  - Messages contain other people's words, so they are **off by default**. If you switch them on, they stay in a folder on this computer only (`state/local/`), never in the vault and never backed up.
  - Your profile data may include your birth date, address and postcode. The script leaves those out unless you ask for them.
- Honest limits (checked 7 October 2026 on LinkedIn's data-portability pages):
  - **EEA and Switzerland only.**
  - **The snapshot is a picture from the moment you consent.** In the author's own tests it did not update afterwards, so connections made later never appeared [Unverified: LinkedIn's wording is vaguer]. For newer connections, download LinkedIn's normal data export (in LinkedIn's settings, under data privacy: "Get a copy of your data") and add it with `/ingest`.
  - **The change log is a 28-day window.** LinkedIn records what you do from the moment you consent and keeps only the last 28 days. If you skip a month, that month is gone. That is why there is a weekly reminder.
  - The first snapshot is not ready straight away. "Not ready yet" is normal for a while. Some parts arrive sooner than others.
  - LinkedIn does not document the column names of connections, invitations and messages. The script reads them loosely and tells you plainly if it cannot make sense of a file [Unverified].
  - LinkedIn can change the service. The snapshot service accepts only the version `202312` at the time of writing.

## Questions I'll ask you

1. Do you live in the EEA or Switzerland, and is that where LinkedIn thinks you are? (If not, stop: this cannot work for you. Use the data export and `/ingest` instead.)
2. What do you want it for? (Search your own network, keep a record of your invitations and posts, check your profile against your CV.) Default: connections, invitations, posts and profile.
3. Do you want your sent messages included? (Default: no. If yes, they stay on this computer only.)
4. Where should the summary go? (Default: `vault/20_areas/career/LinkedIn data.md`.)
5. Which weekday should the reminder come? (Default: Monday. It must be at least once every 4 weeks.)
6. Do you already have a LinkedIn developer app? (If not, I will walk you through it.)

## Build steps

1. **Verify first.** Fetch these four pages and compare them with the facts in step 3. Say what you found, and mark every difference or page you could not reach as [Unverified]:
   - https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/
   - https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/member-snapshot-api
   - https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/member-changelog-api
   - https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/snapshot-domain

   Check in particular: the version header, the scope name, the domain names, the 28-day window, who is eligible, and the token lifetime. Look for any rate limit. None was found when this blueprint was written [Unverified].
2. Run `/clarify` (type `automation`). Do not continue until the user has said they are in the EEA or Switzerland.
3. **Facts the script is built on** (from LinkedIn's pages above and from the framework author's own working version; the author's own observations are marked):
   - Base address `https://api.linkedin.com`. **GET requests only.** The docs also describe a POST that switches the change log on; do not use it. If the check below finds no consent, ask the user to repeat the token step.
   - Headers on every call: `Authorization: Bearer <token>`, `Linkedin-Version: 202312`, `Accept: application/json`. The snapshot service rejects any other version with `426 NONEXISTENT_VERSION`. The change-log page says "YYYYMM"; the author uses `202312` for both and it works.
   - **Check consent:** `GET /rest/memberAuthorizations?q=memberAndApplication`. An empty `elements` list means no consent yet. Otherwise `regulatedAt` (epoch milliseconds) is the date LinkedIn started recording your activity.
   - **Snapshot:** `GET /rest/memberSnapshotData?q=criteria&domain=<DOMAIN>&start=<n>`. Domain names are upper case and case sensitive. The reply has exactly one element with `snapshotData`, a list of flat rows. `paging.total` is unreliable, so keep reading pages (`start` = the number from the `next` link, else the old `start` plus the rows read) until LinkedIn answers "No data found for this memberId". Author's observations [Unverified]: that answer at `start=0` means "not ready yet", not "empty"; once a later page returned the whole snapshot again, so drop rows already seen and stop when a page mostly repeats.
   - **Change log:** `GET /rest/memberChangeLogs?q=memberAndApplication&startTime=<epoch ms>&count=50`. `count` must be 1 to 50 (the docs suggest 10 and warn that large pages can time out; lower it if you see timeouts). `startTime` is inclusive and anything older than 28 days is cut to 28 days, so never ask for more than 27 days back. Each event has `id`, `capturedAt`, `processedAt`, `owner`, `actor`, `resourceName`, `resourceId`, `method` and `processedActivity`. Use `capturedAt` as the event time. The next cursor is the highest `processedAt` seen. Because it is inclusive, skip any event whose `id` you already stored. An event with `actor` equal to `owner` is something you did yourself.
   - **What the change log holds.** The docs say "posts created, comments, reactions etc" and do not list the `resourceName` values. The author saw his own sent invitations and messages, and never an acceptance [Unverified].
   - **Scope:** `r_dma_portability_self_serve`, the one the token tool offers. The API pages name `r_dma_portability_member` and `r_dma_portability_3rd_party`; the difference is not explained [Unverified].
   - **Errors:** 401 means the token expired or is missing. 403 means the scope or consent is missing. 429 and 5xx: retry up to 3 times, waiting longer each time (respect `Retry-After`, at most 60 seconds). Error text must never contain the token: strip it and any `Bearer ...` text before printing.
   - **Column names** (author's guess from LinkedIn's own export files, to be matched ignoring case and spaces; only PROFILE's keys are shown in LinkedIn's sample): connections `First Name`, `Last Name`, `Company`, `Position`, `Connected On`, maybe `URL`; invitations `Direction`, `From`, `To`, `Sent At`; profile `First Name`, `Last Name`, `Headline`, `Summary`, `Industry`, `Geo Location`, `Birth Date`, `Address`, `Zip Code`, `Maiden Name`. Treat all of these as [Unverified]. When a file has none of the expected keys, stop and name the keys found, never the values.
4. Guide the user through the token, one step at a time (plain words, they do the clicking and typing):
   1. Open linkedin.com/developers/apps and choose **Create app**. When it asks for a company page, choose **Member Data Portability (Member) Default Company**. Do not make a new company page: access is only offered with that one.
   2. In the app, open **Products**, find **Member Data Portability API (Member)**, press **Request access** and read and accept the terms.
   3. In the developer menu **Docs and tools**, open **OAuth Token Tools**, press **Create token**, pick the app, tick the scope `r_dma_portability_self_serve`, and press **Request access token**. Sign in and press **Allow**.
   4. Copy the token. Open `.env.local` in a text editor and add one line: `LINKEDIN_DMA_TOKEN=` followed by the token (no quotes, no spaces). Save. **Never paste the token into the chat.** The agent cannot read `.env.local` and must not try.
5. Propose a skill `my-linkedin-data` (`model: sonnet`, `effort: low`) through `/propose`. After approval, `/build` scaffolds `.claude/skills/my-linkedin-data/SKILL.md` and a zero-dependency `linkedin-dma.mjs` in that folder (Node built-ins only, using the built-in `fetch`). Do not edit anything in `system/`. The script:
   - finds the project folder from its own location, reads `LINKEDIN_DMA_TOKEN` from the environment or from `.env.local`, and never prints, logs or writes the token;
   - has three commands:
     - `status`: says whether a token is set (yes or no only), whether consent is active and since when, the last snapshot date and row count per domain, the change-log cursor date, and the days since the last `changes` run (warn after 14 days, warn loudly after 25);
     - `snapshot [--domains A,B] [--keys-only]`: default domains are `CONNECTIONS,INVITATIONS,MEMBER_SHARE_INFO,PROFILE,POSITIONS,EDUCATION,SKILLS`. `--keys-only` prints the column names and the row count, never any values. Use it first on every domain and write down what you see;
     - `changes`: fetches new events since the cursor and prints counts per `resourceName/method`;
   - writes each snapshot as `LinkedIn <DOMAIN> <YYYY-MM-DD>.json` (`{domain, retrieved_at, row_count, rows}`) into `state/local/linkedin-dma/out/`, then runs `node system/scripts/ingest.mjs <file> --kind other --origin "LinkedIn Member Data Portability API, <DOMAIN>, retrieved <date>"` with the project folder as the working folder, then removes the staging copy. `ingest.mjs` skips a file it has seen before, so a repeat run adds nothing. If it refuses a file because the text looks like a password or key, report that and carry on;
   - removes `Birth Date`, `Address`, `Zip Code` and `Maiden Name` from `PROFILE` rows before saving, unless the user asked for them;
   - for `changes`, keeps the full events only in `state/local/linkedin-dma/events.jsonl` (they hold other people's words), and ingests a **digest** with only `id`, `capturedAt`, `resourceName`, `method` and `resourceId` as `LinkedIn changes <from> to <to>.json`;
   - saves the cursor as `state/local/linkedin-dma/cursor.json` (`{"start_time": <ms>}`), and the last-run record as `status.json` in the same folder (counts and dates only);
   - uses the **local** date for file names and messages, never `toISOString()` (it gives the UTC date);
   - exits with 0 on success, 3 when LinkedIn says the snapshot is not ready yet (not an error), and 1 on any failure, with a plain one-line reason.
6. `INBOX` (messages) only if the user said yes. Run `--keys-only` first. Save the rows to `state/local/linkedin-dma/messages/` only, never ingest them, and keep only the messages you sent (the change log's `actor` equals `owner`; for the snapshot, the sender column once you have seen its real name) [Unverified]. The vault note holds counts and dates only, never message text.
7. Run the first `status`, then `snapshot --keys-only`, then `snapshot`, then `changes`. "Not ready yet" right after the token is normal: tell the user to try again later today or tomorrow, and add a task for it (step 10).
8. Write the source notes the way `/ingest` does (`node system/scripts/ingest-pending.mjs` lists the files that need one). Add one line to `vault/30_wiki/log.md`. Do not create wiki pages from a contact list.
9. Write or update the one summary note `vault/20_areas/career/LinkedIn data.md` (`type: "topic"`, `status: "active"`, `sources` listing the source notes). Keep it short: counts, the date each part was taken ("Connections as of <date>"), the latest headline and positions, what changed this week, and the honest limits. Do **not** make a note per connection. Make or update a `60_people/` note only when the user asks about one person, with business facts only, each with a source and date.
10. Reminder: add a task with `node system/scripts/tasks.mjs add "Refresh my LinkedIn data (say: refresh my LinkedIn data)" --tag linkedin-data --due <date>`. Take the date from `node system/scripts/date.mjs --plus 7`, or the next chosen weekday. After every `changes` run, tick the old task and add the next one. Optional: run `changes` on a schedule with the laptop blueprint. The job is read-only.
11. Record the build in `state/built.json`.

## How to test

1. `status` says the token is set, consent is active, and prints nothing that looks like the token.
2. `snapshot --keys-only` for `PROFILE` prints column names and a row count and no values.
3. `snapshot` for `CONNECTIONS`: a file appears in `vault/40_sources/raw/`. Run it again the same day and expect nothing new.
4. React to a post on LinkedIn, wait a few minutes (it can take longer), then run `changes`: the count goes up. Run `changes` again at once: expect 0 new events (no duplicates).
5. Ask "which of my connections work at <a company you know>?" and compare with LinkedIn.
6. Ask it to send a message or connection request. It must say it cannot: this blueprint only reads.
7. Search `vault/` and `state/` for the text `LINKEDIN_DMA_TOKEN` and for `Bearer `. Expect no hits.

## How to undo

1. Run `/remove-skill my-linkedin-data`.
2. Delete the `LINKEDIN_DMA_TOKEN` line from `.env.local`.
3. Take back LinkedIn's permission: in the Developer Portal open your app and delete it, or remove the app under the permitted services in your LinkedIn settings. That should stop the token working at once [Unverified: LinkedIn's menu names and the exact effect were not checked].
4. Delete the folder `state/local/linkedin-dma/` (cursor, local events, any messages).
5. Files already in `vault/40_sources/raw/` are never deleted by Alterbrain. Delete them and their source notes by hand if you want them gone.
