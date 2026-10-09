// The framework's own check workflow (.github/workflows/ci.yml) and how a person's copy gets rid of it (ADR 0031).
//
// The workflow tests framework code, which a learner never edits, and it runs on the learner's own GitHub account.
// Updates never write under .github/ (a workflow can reach private notes), so a copy that holds one keeps it until
// something deletes it. Two things do, and both delete a file only when its content is byte-for-byte (line endings
// aside) a version the framework released:
//   - the installer step in setup-github.mjs, for a brand-new copy;
//   - upgrade 0008-remove-framework-ci, for a copy installed before this.
// The migration keeps its own copy of the hashes (migrations are frozen); this list is for the installer step. A test
// fails when the workflow in this repository is not in the list, so a changed workflow cannot be forgotten here.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';

export const CI_REL = '.github/workflows/ci.yml';

/** sha256 (hex) of every released version of the workflow, with line endings as LF (v0.1.0 to v0.2.2). */
export const FRAMEWORK_CI_SHA256 = [
  '7548625581830e8398fe0fbbc21fe58df2359b8c6d1d4acfc5c46164094b7a02', // v0.1.0 to v0.2.0
  '696d84d2f777cabdb130134c062955f7e56ed2752b69629e333b25cc566f5f35', // v0.2.1
  'f2ac2f2c45d2ae3cc04b56c73935531b2b8f84aa89edc0aa2388fd7d6d931c5f', // v0.2.2
];

/** sha256 of a buffer with CRLF turned into LF. */
export function sha256Lf(buf) {
  const fixed = Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return createHash('sha256').update(fixed).digest('hex');
}

/** 'absent', 'framework' (a released version) or 'custom' (anything else, including a file that cannot be read). */
export function frameworkCiState(root) {
  const file = join(root, ...CI_REL.split('/'));
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return 'absent';
  }
  if (!st.isFile()) return 'custom';
  try {
    return FRAMEWORK_CI_SHA256.includes(sha256Lf(readFileSync(file))) ? 'framework' : 'custom';
  } catch {
    return 'custom';
  }
}

/**
 * Delete the workflow when it is a released version, then the empty .github/workflows and .github folders.
 * Returns the state it found: 'absent', 'framework' (deleted, or would be with dryRun) or 'custom' (left alone).
 */
export function removeFrameworkCi(root, { dryRun = false } = {}) {
  const state = frameworkCiState(root);
  if (state !== 'framework' || dryRun) return state;
  rmSync(join(root, ...CI_REL.split('/')), { force: true });
  for (const dir of [join(root, '.github', 'workflows'), join(root, '.github')]) {
    try {
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {
      /* not there, or not empty: leave it */
    }
  }
  return state;
}
