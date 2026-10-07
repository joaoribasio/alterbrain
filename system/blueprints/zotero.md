---
type: "blueprint"
title: "Connect your Zotero reading library"
kind: "mcp"
status: "available"
risk: "low"
cost: "free"
---

# Connect your Zotero reading library

## What it does

Alterbrain can search your Zotero library and turn papers and articles into vault notes with proper sources. Example: "find what I saved about platform pricing" returns three papers, and each gets a source note you can cite.

Zotero is a free app that stores your reading list and references.

## You'll need

- The Zotero desktop app with a library in it.
- `uv` installed.
- For local mode: Zotero open while Alterbrain works.

## Cost and risk

- Cost: free.
- Risk: low. In local mode it talks only to the app on your own computer.
- Online mode needs a Zotero key and sends requests to Zotero's servers. Prefer local mode.
- Do not let it edit your library unless you ask. Start read-only.
- PDFs may be copyright. They stay in your private vault.

## Questions I'll ask you

1. Local mode (Zotero open on this computer) or online mode?
2. Which collections should I use? All of them or just some?
3. Should I save PDFs into the vault, or only the reference details?
4. Do you cite in a particular style? (APA, Harvard...)
5. Do you want a weekly "unread papers" reminder?

## Build steps

1. **Verify first.** Open https://github.com/54yyyu/zotero-mcp and confirm the command (`zotero-mcp`), the pinned version in `system/catalogue/mcp.json` and the setting that turns on local mode. Update the notes as [Unverified] where they differ.
2. Run `/clarify` (type `mcp`).
3. In Zotero's own settings, the user may need to allow local access by other programs. Show them where. Do not change it for them.
4. Add `zotero-mcp` to `config/mcp.selected.json`, run `node system/scripts/mcp-gen.mjs`, and ask the user to restart the session.
5. Test a search for one known item.
6. For each chosen paper:
   - if the PDF is wanted, copy it with `node system/scripts/ingest.mjs <file> --origin "Zotero: <title>"`;
   - write a source note in `vault/40_sources/notes/` with the title, authors, year, DOI or link, and the Zotero item key;
   - add concepts to `vault/30_wiki/` with the citation format from SPEC section 3.
7. Never invent a reference. If a detail is missing, write `[Unverified]`.
8. Record the build in `state/built.json`.

## How to test

1. Search for a paper you know. Expect it in the results.
2. Import it. Check the source note has an origin, a date and a working link.
3. Ask a question about it. Expect an answer with a citation line.

## How to undo

Remove `zotero-mcp` from `config/mcp.selected.json` and run `mcp-gen.mjs`. Source notes already made stay in the vault. Your Zotero library was never changed.
