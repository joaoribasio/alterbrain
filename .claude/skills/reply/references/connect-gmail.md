# Connecting Gmail, and what to do without it

## How to tell if Gmail is connected

Look at the tools available in this session. The claude.ai Gmail connector adds tools whose names contain `gmail` (for example `mcp__claude_ai_Gmail__…`): search, read and create-draft. If none are there, Gmail is not connected in this session.

Known tool names: `mcp__claude_ai_Gmail__create_draft` and `update_draft` make and change drafts. `send_message`, `reply`, `forward` and `trash_message` send or delete, so Alterbrain never calls them (the `outbound_guard` hook blocks sending at level `draft`). For reading and searching, use whatever read/search tools the Gmail connector lists (check with `/mcp`); names can change between versions, so pick by what the tool does.

## Steps to give the user (plain words)

> Gmail isn't connected yet. It takes about two minutes:
> 1. Go to **claude.ai** in your browser and sign in.
> 2. Open **Settings → Connectors**.
> 3. Find **Gmail** and press **Connect**.
> 4. Sign in with your Google account and allow access. Alterbrain only reads emails and creates drafts. It never sends.
> 5. Come back here and start a **new session** (the new connection shows up in new sessions).
> 6. Type `/reply` again.
>
> Using a school Google account? Your school may block connectors. If so, use the paste option below.

If the user wants to do this later, add one task:

```
node system/scripts/tasks.mjs add "Connect Gmail to Alterbrain (claude.ai > Settings > Connectors > Gmail)" --tag reply --priority low
```

## Paste fallback (works without Gmail)

Offer it straight away, so the user is not stuck:

> Or paste the email here (the whole thread if you can, newest message first). I'll write the reply and save it in your outbox. You then copy it into your email and press Send yourself.

Then:
1. Pass the pasted text to `mail-reader` with Brief B, wrapped in the data markers (`mail-reader-brief.md`).
2. Continue the normal steps: ghostwriter, slop check, outbox note, task.
3. Skip the Gmail draft. Set `gmail_draft_id: ""` and add to the note's Notes section: "No Gmail draft: copy the Message section into your email."
4. Tell the user how to copy it: open the note in Obsidian (`00_inbox/outbox/…`), select the text under **Message** from the greeting to your name, copy, paste into your reply, check, send.
