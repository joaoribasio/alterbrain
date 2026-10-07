// Tests for the onboarding helpers (onboard-seed.mjs, onboard-progress.mjs).
// Run: node --test tests/scripts/onboard-helpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seed, fillPlaceholders } from '../../system/scripts/onboard-seed.mjs';
import { emptyState, setStatus, overall, nextModule, resolveModule, load } from '../../system/scripts/onboard-progress.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function put(root, rel, text) {
  const f = join(root, ...rel.split('/'));
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text, 'utf8');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ab-onboard-'));
  put(root, 'system/templates/vault/Home.md', '---\ncreated: "{{date}}"\n---\n# {{title}}\n');
  put(root, 'system/templates/vault/00_inbox/Tasks.md', '# Tasks\n');
  put(root, 'system/templates/vault/10_projects/.gitkeep', '');
  put(root, 'system/templates/config/brain.json', '{"schema":1}\n');
  put(root, 'system/templates/config/notes.txt', 'not json');
  put(root, 'system/templates/identity/USER.md', '---\ncreated: "{{date}}"\n---\n');
  put(root, 'system/packs/mba/frameworks/SWOT.md', '# SWOT\n');
  return root;
}

test('fillPlaceholders replaces date and title', () => {
  assert.equal(fillPlaceholders('{{date}} {{title}}', 'x/My Note.md', '2026-10-07'), '2026-10-07 My Note');
  assert.equal(fillPlaceholders('---\ncreated: ""\n---\n', 'USER.md', '2026-10-07'), '---\ncreated: "2026-10-07"\n---\n');
  assert.equal(fillPlaceholders('created: "2025-01-01"\n', 'x.md', '2026-10-07'), 'created: "2025-01-01"\n');
});

test('seed copies missing files, fills placeholders, never overwrites', () => {
  const root = fixture();
  try {
    put(root, 'vault/00_inbox/Tasks.md', 'MINE\n');
    const res = seed({ root, date: '2026-10-07' });
    assert.deepEqual(res.missingSources, []);
    assert.ok(res.created.includes('vault/Home.md'));
    assert.ok(res.created.includes('config/brain.json'));
    assert.ok(res.created.includes('vault/80_me/USER.md'));
    assert.ok(res.created.includes('vault/30_wiki/frameworks/SWOT.md'));
    assert.ok(res.created.includes('vault/10_projects/.gitkeep'));
    assert.ok(!existsSync(join(root, 'config', 'notes.txt')), 'only .json config files are copied');
    assert.ok(res.kept.includes('vault/00_inbox/Tasks.md'));
    assert.equal(readFileSync(join(root, 'vault', '00_inbox', 'Tasks.md'), 'utf8'), 'MINE\n');
    assert.match(readFileSync(join(root, 'vault', 'Home.md'), 'utf8'), /created: "2026-10-07"\n---\n# Home/);
    const again = seed({ root, date: '2026-10-08' });
    assert.equal(again.created.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('seed dry run writes nothing and reports missing sources', () => {
  const root = fixture();
  try {
    rmSync(join(root, 'system', 'templates', 'identity'), { recursive: true });
    const res = seed({ root, dryRun: true });
    assert.ok(res.created.length > 0);
    assert.ok(!existsSync(join(root, 'vault')));
    assert.deepEqual(res.missingSources, ['system/templates/identity']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('progress: overall status, next module and aliases', () => {
  const s = emptyState();
  assert.equal(overall(s), 'not_started');
  assert.equal(nextModule(s), 'M0');
  setStatus(s, 'M0', 'in_progress', { now: '2026-10-07T10:00:00.000Z' });
  assert.equal(s.status, 'in_progress');
  assert.equal(s.modules.M0.started, '2026-10-07T10:00:00.000Z');
  for (const id of ['M0', 'M1', 'M2', 'M3']) setStatus(s, id, 'done');
  setStatus(s, 'M4', 'later', { note: 'wants to think' });
  assert.equal(nextModule(s), 'M4', 'later still counts as open');
  setStatus(s, 'M4', 'done');
  assert.equal(s.status, 'minimum_done');
  assert.equal(nextModule(s), 'M5');
  for (const id of ['M5', 'M6', 'M7', 'M8']) setStatus(s, id, 'done');
  setStatus(s, 'M9', 'skipped');
  assert.equal(s.status, 'complete');
  assert.equal(nextModule(s), null);
  setStatus(s, 'M5', 'reset');
  assert.equal(s.modules.M5.status, 'todo');
  assert.equal(resolveModule('voice'), 'M5');
  assert.equal(resolveModule('m3'), 'M3');
  assert.equal(resolveModule('7'), 'M7');
  assert.equal(resolveModule('banana'), null);
});

test('progress CLI writes state/onboarding.json under CLAUDE_PROJECT_DIR', () => {
  const root = mkdtempSync(join(tmpdir(), 'ab-progress-'));
  try {
    mkdirSync(join(root, 'system'), { recursive: true });
    const cli = join(HERE, '..', '..', 'system', 'scripts', 'onboard-progress.mjs');
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    let r = spawnSync(process.execPath, [cli, 'start', 'setup'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    r = spawnSync(process.execPath, [cli, 'later', 'M0', '--note', 'GitHub tomorrow'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const state = load(join(root, 'state', 'onboarding.json'));
    assert.equal(state.modules.M0.status, 'later');
    assert.equal(state.modules.M0.note, 'GitHub tomorrow');
    assert.ok(state.started);
    r = spawnSync(process.execPath, [cli, 'done', 'M42'], { env, encoding: 'utf8' });
    assert.equal(r.status, 2);
    r = spawnSync(process.execPath, [cli, 'next', '--json'], { env, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(r.stdout), { next: 'M0', title: 'Setup', file: 'workflows/M0-setup.md' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
