# 0018. Exposure-based privacy

Status: accepted (2026-10-07, framework owner)

## Context
The first framework rules treated "sensitive" personal data as something to keep out. Voice import dropped emails about health, family or money and told the profile to carry no sensitive detail. The fact sheet told the drafting agent never to mention health, family, religion or politics. People notes banned health, family and beliefs. Several skills refused to save such details.

That model fits a public tool, but it does not fit this product. Alterbrain is the user's own private brain. It is supposed to know them, including the things that matter most when it writes on their behalf: nationality for a visa question, a health condition for an extension request, family for an availability reply. Stripping those facts makes drafts less accurate and gives a false sense of safety, because the data that is dangerous when leaked is not the same as the data that feels personal.

Two facts frame the real risk. The vault syncs to the user's private GitHub repository, and everything in it is processed by Claude (Anthropic) when used in a session. The user controls both accounts. What the user does not control is what happens once text leaves the computer in an email, post, application or shared file.

## Decision
Replace "strip sensitive information" with an exposure-based model: store freely, guard what leaves, and keep out only what enables fraud.

1. **Store.** Any fact about the user, including special-category data (nationality, ethnicity, gender, sexuality, health and diseases, religion, politics, family, general finances), when the user gives it or it appears in their own material. Nothing is stripped from the voice corpus, exemplars, fact sheet, `USER.md`, notes, journal or ingested sources. Every fact-sheet row has a visibility, `public` or `private`. Special-category facts default to `private`. We keep the existing private defaults for visa status, birth date, home address and salary expectations.
2. **Never store, anywhere git tracks.** Credentials and secrets (passwords, API keys, tokens, recovery codes, 2FA seeds), payment card numbers, bank account numbers and IBANs, government ID numbers (passport, BSN, SSN, national ID, driving licence number), and answers to security questions. If the user shares one, it is not repeated or saved, the user is pointed to a password manager and, for a token, told to replace it. `.env.local` stays the place for keys that tools need.
3. **Outbound gate.** Anything that leaves the computer or is shared (email, post, message, application, form, CV, shared export, presentation, the public framework repository) uses only `public` facts. A `private` fact in an outbound draft is flagged in `facts_flagged` with the reason `private fact` and needs the user's explicit OK for that draft. The OK covers that draft only. Special categories never go into outbound text without it. This sits on top of the existing draft-only autonomy (ADR 0008), which still decides whether anything may be sent at all.
4. **Other people.** Business facts by default (role, organisation, how the user met them, source and date). Their sensitive details are stored only if the user explicitly asks, stay private and never go outbound. In the voice corpus other people's words are still removed, for voice quality (the profile must learn only the user's writing), not for privacy.
5. **Say the trade-off plainly.** The privacy guide states that everything in the vault is processed by Claude (Anthropic) when used in a session and stored in the user's private GitHub repository, that this is the trade-off the user accepts, and that the user controls both.

Not weakened: `block_secrets`, the ingest secret scan, `outbound_guard`, `rate_guard` and `protect_paths`.

## Consequences
- Drafts become more accurate for the user's real situation, and the user decides case by case what leaves. The cost is a new kind of flag: a draft that uses a private fact cannot be approved until the user says yes to that fact for that draft.
- The brain holds more sensitive data. A leak of the user's private repository, or of their Claude account, would now expose it. The never-store list limits the damage to data that is embarrassing, not data that enables fraud.
- Enforcement is partly prose, not code. `block_secrets` and the ingest scan catch keys, tokens and passwords by pattern. They do not detect card numbers, IBANs or ID numbers, so those rely on the rules in `core.md`, `.claude/rules/vault.md`, the skills and the agents. A later code change could add detectors; false positives (long digit strings in ordinary text) would need care.
- The outbound gate relies on the drafting agents (`ghostwriter`, `/reply`, `/jobs apply`) applying it and on the user's review. The independent check is the blind `lens` in `/jobs apply`, which flags private facts. Other outbound paths (a shared export, a presentation) depend on the rule alone.
- The `mail-reader` flags sensitive email content as information and does not withhold it. It still never copies a never-store value into a summary.
- Existing users who followed the old "strip" behaviour keep their data as it is. Nothing is migrated.

## Alternatives considered
- **Keep stripping special categories.** Safe by default, but it makes the twin worse at the tasks it exists for, and it protects the wrong thing: the data stays in the user's own repository anyway.
- **Store nothing sensitive and ask each time.** Maximum control, constant friction, and the user ends up retyping the same facts in every session.
- **Encrypt sensitive facts at rest.** Real protection against a repository leak, but it needs key management a non-technical user cannot be expected to handle, and Claude must read the facts in the clear to use them.
- **A single visibility switch for the whole fact sheet.** Too coarse: a name is fine on a CV and a diagnosis is not.
- **Block outbound with a hook that reads facts.** A hook cannot tell which sentence in a free-text draft uses which fact, so it would either miss leaks or block ordinary drafts. The gate stays in the drafting rules and the user's review.
