// Tests for proposals.mjs. Run: node --test tests/scripts/proposals.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addSignal, candidates, mark, normaliseKey } from '../../system/scripts/proposals.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'system', 'scripts', 'proposals.mjs');

test('signals count once per day and become candidates at the threshold', () => {
  const s = { schema: 1, signals: {} };
  addSignal(s, 'Summarise case reading', 'summarised a case reading into one page', '2026-10-01T09:00:00.000Z');
  addSignal(s, 'summarise-case-reading', 'same day again', '2026-10-01T15:00:00.000Z');
  assert.equal(s.signals['summarise-case-reading'].count, 1);
  addSignal(s, 'summarise case reading', null, '2026-10-03T09:00:00.000Z');
  assert.equal(candidates(s, 3).length, 0);
  addSignal(s, 'summarise case reading', null, '2026-10-06T09:00:00.000Z');
  const c = candidates(s, 3);
  assert.equal(c.length, 1);
  assert.equal(c[0].count, 3);
  assert.equal(c[0].examples.length, 2);
  mark(s, 'summarise case reading', 'rejected');
  assert.equal(candidates(s, 3).length, 0, 'rejected ideas are not suggested again');
  assert.throws(() => mark(s, 'x', 'maybe'));
  assert.equal(normaliseKey('  Weekly LinkedIn post!! '), 'weekly-linkedin-post');
});

function project() {
  const root = mkdtempSync(join(tmpdir(), 'ab-propose-'));
  mkdirSync(join(root, 'system'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });
  mkdirSync(join(root, 'vault', '00_inbox', 'proposals'), { recursive: true });
  return root;
}

test('status respects self_build settings and counts only open proposal cards', () => {
  const root = project();
  try {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    const run = (...a) => spawnSync(process.execPath, [CLI, ...a, '--json'], { env, encoding: 'utf8' });
    writeFileSync(join(root, 'config', 'brain.json'), JSON.stringify({ self_build: { mode: 'propose', proactive: true, max_open_proposals: 2 } }));
    const card = (name, status) =>
      writeFileSync(join(root, 'vault', '00_inbox', 'proposals', name), `---\ntype: "proposal"\nstatus: "${status}"\n---\n# x\n`);
    card('2026-10-01 A.md', 'open');
    card('2026-10-02 B.md', 'rejected');
    writeFileSync(join(root, 'vault', '00_inbox', 'proposals', 'README.md'), '---\ntype: "readme"\n---\n');
    let s = JSON.parse(run('status').stdout);
    assert.equal(s.open, 1);
    assert.equal(s.can_suggest_proactively, true);
    card('2026-10-03 C.md', 'open');
    s = JSON.parse(run('status').stdout);
    assert.equal(s.can_suggest_proactively, false, 'limit reached');
    writeFileSync(join(root, 'config', 'brain.json'), JSON.stringify({ self_build: { mode: 'off', proactive: true, max_open_proposals: 9 } }));
    s = JSON.parse(run('status').stdout);
    assert.equal(s.can_propose, false);
    assert.equal(s.can_suggest_proactively, false);

    let r = run('signal', 'case summary', '--example', 'summarised a case');
    assert.equal(r.status, 0, r.stderr);
    r = run('mark', 'case summary', 'suggested', '--card', 'vault/00_inbox/proposals/2026-10-03 C.md');
    assert.equal(JSON.parse(r.stdout).card, 'vault/00_inbox/proposals/2026-10-03 C.md');
    assert.equal(spawnSync(process.execPath, [CLI, 'mark', 'x', 'maybe'], { env, encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
