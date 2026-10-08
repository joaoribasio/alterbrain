---
type: "readme"
---
# Packs

A pack is a folder under `system/packs/` that adds content for one kind of learner or one country. The pack id is the folder name. Everything else in Alterbrain (courses, study, the assignment studio, notes, drafting) is core and works without any pack.

## Packs

| Id | Folder | What it adds |
|---|---|---|
| `core` | none | Always on. May be listed in `packs`; code ignores it. |
| `mba` | `system/packs/mba/` | The frameworks library (25 business frameworks, copied into the wiki), the case method (`templates/case.md`) and business critique presets (`critique-presets.md`). |
| `country-nl` | `system/packs/country-nl/` | The Netherlands job search: Dutch-language signals, salary thresholds, visa and sponsorship checks, sources. |
| `twin` | `system/packs/twin/` | Drafting rules and voice import. Always used by `ghostwriter` and `/reply`; never listed in `packs`. |

## Selecting packs

`config/brain.json` has a `packs` array of ids. The template starts with `["core"]`.

Written by:
- onboarding M2, the learner question: adds `mba` when the answer is an MBA, takes it out when the user moves away from an MBA, and otherwise leaves it as it is (a pack the user switched on stays on, and confirming the same answer changes nothing). It keeps every other entry;
- onboarding M6 and `/jobs`: add `country-<cc>` for `jobs.country` when that pack exists, and remove other `country-*` entries;
- `/reconfigure`, which re-runs those two steps, and has its own row "Switch the MBA frameworks on or off": it adds or removes `mba` and nothing else, whatever the learner kind, then runs `onboard-seed.mjs`;
- migration 0002, once, for existing users.

Read by:
- `system/scripts/onboard-seed.mjs`: copies `system/packs/<id>/frameworks/*.md` into `vault/30_wiki/frameworks/` for every listed pack, never overwrites, ignores ids that are not folder names (lower-case letters, digits and hyphens only) and reports a listed pack whose folder is missing;
- `/critique` and `/assignment critique` (procedure `.claude/skills/critique/references/panel.md`, lens choice `lens-choice.md`): business seat presets from `system/packs/mba/critique-presets.md` when `mba` is listed and the subject is business;
- `/jobs` and onboarding M6: the country pack;
- `/menu` and `/reconfigure`: to show what is switched on.

Switching the learner kind away from `mba` removes the id from `packs`; switching the pack on or off by itself never changes `learner.kind`. Neither deletes notes that are already in the wiki.

## Reading the learner kind

Learner kind: `config/brain.json` `learner.kind`. If it is missing or empty, treat it as `mba` when `packs` lists `mba` or a `school` block exists (older installs); otherwise ask the onboarding learner question.

`learner.kind` drives wording and the onboarding branches. `packs` drives content. The two are separate: a degree student can switch the MBA pack on at any time with `/reconfigure` ("Switch the MBA frameworks on or off"), and it stays on when they answer the learner question again, unless the new answer moves to or from an MBA.

| Kind | Defaults |
|---|---|
| `mba` | A programme note, courses, AI-rule checks, the assignment studio with business presets. The `mba` pack is on. |
| `degree` | The same. The `mba` pack is off until the user switches it on. |
| `online` | Standalone courses, each with its provider. No programme note unless the courses form one track. The AI-rule check applies only where the provider states a rule (otherwise `none-stated`). Class days only for courses with live sessions. |
| `professional` | No courses, programme or AI-rule steps. Focus areas live in `USER.md` (Current focus) and projects in `vault/10_projects/<YYYY> <project-slug>/project.md`. Course tools appear once a course exists. |
| `other` | `learner.detail` holds the user's own words. Behaves like `degree`. |

`node system/scripts/onboard-progress.mjs show --json` returns `learner_kind` with this rule already applied (`null` when nothing is known).

## Old installs (fallbacks)

An update or a stopped update can leave settings in the older shape. Code and skills read both:

- No `learner`, or an empty kind: `mba` when `packs` lists `mba` or a `school` block exists.
- `packs` missing or not an array: `["core"]`.
- No `country-*` entry in `packs`: the pack for `jobs.country`, if that pack exists.
- No programme note: `school.name` and `school.programme` serve as display text only. Never copy them into a new course note.

## Country packs

A country pack is `system/packs/country-<cc>/`, with `<cc>` the lower-case ISO 3166-1 alpha-2 code (`jobs.country` holds it in capitals). It has a `README.md` and a `jobs.md`; the contract for both is in `system/packs/country-nl/README.md`.

`/jobs` uses `system/packs/country-<cc>/jobs.md` when `packs` lists `country-<cc>`, and `.claude/skills/my-country-<cc>/jobs.md` otherwise. With neither, it runs the core flow and says once that checks for that country are not available yet.

## Making a new pack

Real users ask for packs; none are built ahead of time. When someone wants one (a country other than the Netherlands, a field with its own frameworks), `/propose` drafts it as the user's own skill, for example `.claude/skills/my-country-de/` with a `jobs.md`, which `/jobs` also looks for. A pack the user built stays in their `my-*` folder and is never written under `system/`.
