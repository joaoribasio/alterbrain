---
type: "blueprint"
title: "Instagram posts: drafts first, official API only"
kind: "blueprint"
status: "available"
risk: "high"
cost: "free to draft; the official API is free but needs a business setup"
---

# Instagram posts: drafts first, official API only

## What it does

Alterbrain writes Instagram captions, hashtags and a posting plan in your voice. You post them yourself. If you really want automatic posting, there is one rule-following route: Meta's official API. Example: you say "draft a caption for my project photo" and the draft appears in your outbox.

## You'll need

- An Instagram account.
- For automatic posting only: a **professional** (business or creator) account linked to a Facebook Page, and a Meta developer app you create yourself.

## Cost and risk

- Cost: free for drafting.
- Risk: high for anything automatic.
  - We do **not** recommend scraping tools or tools that log in with your password. They break Instagram's rules and can get the account banned.
  - The official API has its own review steps and limits, and these change often [Unverified: check Meta's current requirements before promising anything].
  - Public posts are hard to undo. Everything stays on `draft` unless you choose otherwise.
- No MCP server is recommended. The `instagram` entry in the catalogue is "blueprint only".

## Questions I'll ask you

1. Is this a personal or a professional account? (Personal accounts usually cannot use the posting API [Unverified].)
2. Is drafting enough? (For most people, yes.)
3. What is the account for: course project, personal brand, job search?
4. Which language and tone? Any words you never use?
5. Who must see a post before it goes out?

## Build steps

1. **Verify first.** Read Meta's current developer documentation for Instagram content publishing. Write down the account type needed, the review steps and the limits. Mark anything you cannot confirm as [Unverified].
2. Run `/clarify` (type `blueprint`). Ask whether drafting alone is enough. If yes, do only steps 3 and 4.
3. Create a drafting recipe: a note `vault/20_areas/career/Instagram playbook.md` with the user's goals, tone and a posting calendar. Use `ghostwriter` for captions with the user's voice profile.
4. Drafts go to `vault/00_inbox/outbox/` with `channel: "social"`, `status: "draft"` and a `#ab/social` task to review and post by hand.
5. Only if the user wants automatic posting and the verified requirements fit:
   - walk them through creating their own developer app (they enter any keys; keys go in `.env.local`, never in chat);
   - propose a small `my-` skill that posts one approved draft. Keep `social` on `approve` so every post asks first;
   - tell them plainly that `auto` is not recommended.
6. Record the build in `state/built.json`.

## How to test

1. Ask for one caption draft. Check it sounds like you and passes `node system/scripts/slop-check.mjs`.
2. Confirm the file is in the outbox with `status: "draft"`.
3. If the API route was built: post a test to a private test account, never a real one.

## How to undo

Delete the playbook note and any `my-` posting skill (use `/remove-skill`), delete the developer app in Meta's dashboard, and remove its keys from `.env.local`.
