# 0031. The framework's check workflow is not carried in learners' copies

Status: accepted (2026-10-09, product owner, request adjusted for safety)

## Context
Every learner's copy of Alterbrain starts as a copy of the framework repository, including `.github/workflows/ci.yml`. That workflow runs the framework's test suite on GitHub. In a learner's private notes repository each automatic save is a push, so the workflow ran a long Windows and macOS test run on every save and used the learner's free GitHub Actions minutes, to check framework code that the learner never edits.

Release 0.2.1 made the workflow run only in the framework's own repository, and 0.2.2 narrowed when it starts at all. Both CHANGELOG entries said the update replaces the workflow file. It does not: `update.mjs` never delivers anything under `.github/` (`isExcludedFromUpdates`), on purpose. A workflow runs on the learner's GitHub account, which holds their private notes, so an update must not be able to write one. Result:
- copies installed before 0.2.1 keep the old, unguarded workflow and keep burning minutes;
- after an update, the health check reported "Framework files: changed .github/workflows/ci.yml" with the fix "/update-alterbrain", which cannot resolve it because the updater skips that file.

## Decision
- **Keep the exclusion.** Updates never write under `.github/`. A release cannot change what runs on a learner's GitHub account.
- **A learner's copy carries no framework workflow.**
  - Existing copies: upgrade `0008-remove-framework-ci` deletes `.github/workflows/ci.yml` (and the then-empty `.github/workflows` and `.github` folders) only when its content, with line endings normalised to LF, has the sha256 of a version the framework released. The hashes come from the repository history (v0.1.0 to v0.2.2) and are embedded in the script, because migrations are frozen. A changed file is kept: one plain sentence and one deduplicated task explain that the copy has its own workflow that may use Actions minutes, and how to delete or keep it. The script does nothing in developer mode or when the copy's own `origin` is the repository named in `system/release.json`.
  - New copies: `setup-github.mjs` deletes the same file on the same condition in the step that disconnects the public origin. Both installers already run that step right after cloning, so no installer needed a change. A fresh install is never run through migrations (it records them as baseline), so the migration alone would not reach it. The deletion is left for the next automatic save.
- **Policy exception, narrow.** A migration may delete `.github/workflows/ci.yml`, and only when it is byte-for-byte (LF-normalised) a released version. Nothing else under `.github/`, and no write there.
- **The health check agrees with the updater.** The "Framework files" check skips every path that `isExcludedFromUpdates` names, which now lives in `system/lib/manifest.mjs` so `doctor.mjs` and `update.mjs` share one definition.

## Consequences
- Learners stop spending Actions minutes on framework tests, including those on 0.2.0 and earlier.
- The health check no longer reports a failure that nothing could fix, for a copy with the file, without it, or with its own.
- The framework repository keeps its workflow, and developers are untouched.
- The hash list must grow when the workflow changes. A test fails when the repository's current workflow is not in `FRAMEWORK_CI_SHA256` (`system/lib/frameworkci.mjs`); the migration's list stays as released.
- A learner who edited the workflow keeps it and decides for themselves.
- The 0.2.1 and 0.2.2 CHANGELOG lines that said updates replace the workflow were wrong; 0.2.3 says so.

## Alternatives considered
- **Deliver `ci.yml` through updates.** Fixes the file for old copies in one step. Rejected: updates would gain the power to change what runs on learners' GitHub accounts, next to their private notes. That is a larger risk than a few Actions minutes, and the exclusion exists to prevent it.
- **Make the health check consistent only (skip the file, say nothing else).** Removes the false failure. Rejected: old copies would keep burning minutes.
- **Delete the file unconditionally in a migration.** Simpler. Rejected: it would delete a workflow a learner wrote on purpose; the hash check keeps their file.
- **Remove the file from the repository's template for new copies by other means (a separate branch or a release asset).** Rejected: the project is one branch, and a second source of truth for the copy contents is more to keep in step than one installer step.
