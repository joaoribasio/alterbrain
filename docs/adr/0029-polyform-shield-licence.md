# 0029. PolyForm Shield licence from v0.2.0

Status: accepted (2026-10-08, product owner)

## Context
Alterbrain was released under MIT up to v0.1.1. The owner may later build a platform or service on top of it and does not want someone else to take the framework and offer a competing product. The owner first asked for "personal use only". That would also forbid a professional from using Alterbrain for their employer's work, which contradicts the learner-neutral goal of ADR 0023 (useful for students, online learners and working professionals).

## Decision
From v0.2.0, Alterbrain is licensed under the PolyForm Shield License 1.0.0, copied unchanged from the PolyForm project (https://polyformproject.org/licenses/shield/1.0.0), with the line `Required Notice: Copyright 2026 João Ribas (https://github.com/joaoribasio/alterbrain)` at the top of `LICENSE`.

- Anyone may use, copy and change Alterbrain for any purpose, including study and work, except to provide a product that competes with the software or with a product the licensor provides using it.
- Versions up to v0.1.1 stay under MIT: a licence already granted cannot be withdrawn, so this protects v0.2.0 onwards.
- Third-party files keep their own licences (MIT for most; CC BY-SA 3.0 for the citation style file), as listed in `THIRD_PARTY_NOTICES.md`.
- Contributions are accepted under `CONTRIBUTING.md`, which licenses them under the same terms and gives the maintainer the right to relicense, so a future platform is not blocked by one contributor's code.

## Consequences
- Alterbrain is source-available, not "open source" in the OSI sense. User-facing text says "free to use and change" and never "open source".
- Users' private copies (the copy-once install model of ADR 0005) are permitted: each user uses and changes their own copy.
- The contribution terms are standard wording, not reviewed by a lawyer. Before any commercial step, have a lawyer review `LICENSE`, `CONTRIBUTING.md` and the trademark position of the name.

## Alternatives considered
- **Keep MIT.** Maximum adoption, no protection for a future platform.
- **PolyForm Noncommercial.** Closest to "personal use only", but forbids professional use at work.
- **Elastic License 2.0.** Well known, but only forbids offering it as a hosted or managed service; a competing product that is not a hosted copy stays allowed.
- **Business Source License.** Converts to open source after a set date; more administration than the pilot needs.
- **A custom licence.** Rejected: home-made licence text is a legal risk.
