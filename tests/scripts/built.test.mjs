// Tests for built.mjs. Run: node --test tests/scripts/built.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { add, find, remove } from '../../system/scripts/built.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'system', 'scripts', 'built.mjs');

test('add, find by name or blueprint, replace, remove', () => {
  const s = { schema: 1, items: [] };
  add(s, { name: 'my-case-summary', kind: 'skill', paths: ['.claude/skills/my-case-summary/'] }, '2026-10-07T10:00:00.000Z');
  add(s, { name: 'gmail-send-approval', kind: 'automation', blueprint: 'gmail-send-approval', channels: ['email'] });
  assert.equal(find(s, 'MY-CASE-SUMMARY').built, '2026-10-07T10:00:00.000Z');
  assert.equal(find(s, 'gmail-send-approval').channels[0], 'email');
  add(s, { name: 'my-case-summary', kind: 'skill', note: 'rebuilt' });
  assert.equal(s.items.filter((i) => i.name === 'my-case-summary').length, 1);
  assert.equal(find(s, 'my-case-summary').note, 'rebuilt');
  assert.throws(() => add(s, { name: 'x', kind: 'plugin' }));
  assert.equal(remove(s, 'gmail-send-approval').name, 'gmail-send-approval');
  assert.equal(find(s, 'gmail-send-approval'), null);
  assert.equal(remove(s, 'nope'), null);
});

test('CLI writes state/built.json under CLAUDE_PROJECT_DIR', () => {
  const root = mkdtempSync(join(tmpdir(), 'ab-built-'));
  try {
    mkdirSync(join(root, 'system'), { recursive: true });
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { env, encoding: 'utf8' });
    let r = run('add', '--name', 'zotero', '--kind', 'mcp', '--blueprint', 'zotero', '--mcp', 'zotero-mcp', '--path', '.claude/skills/my-zotero/', '--path', 'vault/30_wiki/topics/Reading.md');
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(root, 'state', 'built.json'), 'utf8'));
    assert.deepEqual(saved.items[0].paths, ['.claude/skills/my-zotero/', 'vault/30_wiki/topics/Reading.md']);
    assert.deepEqual(saved.items[0].mcp, ['zotero-mcp']);
    assert.equal(run('has', 'zotero').status, 0);
    assert.equal(run('has', 'telegram-channel').status, 1);
    assert.equal(run('add', '--name', 'x').status, 2, 'kind is required');
    assert.equal(run('remove', 'zotero').status, 0);
    assert.equal(run('remove', 'zotero').status, 1);
    assert.equal(run('frobnicate').status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
