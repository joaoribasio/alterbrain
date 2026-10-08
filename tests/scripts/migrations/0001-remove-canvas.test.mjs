import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, changedPaths, copyFixture, exists, read, readJsonIn, runMigration, snapshot, write } from '../../fixtures/migrations/helpers.mjs';

after(cleanup);
const FILE = '0001-remove-canvas.mjs';
const lines = (text) => text.split(/\r?\n/);

test('0001: an old install loses canvas-mcp, gets one task, and nothing else changes', () => {
  const root = copyFixture('v0.1.0');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Removed the retired Canvas connection/);
  assert.match(r.stdout, /Added a task/);

  const tools = readJsonIn(root, 'config/mcp.selected.json');
  assert.deepEqual(tools.enabled, ['mcpvault', 'playwright', 'context7']);
  assert.equal(tools.schema, 1, 'other keys are kept');

  const tasks = lines(read(root, 'vault/00_inbox/Tasks.md')).filter((l) => l.includes('/remove-skill my-canvas-sync'));
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /#ab\/update-alterbrain/);

  // The record of what was built, the person's own skill and the secrets file are not touched.
  assert.deepEqual(changedPaths(before, snapshot(root)), ['config/mcp.selected.json', 'vault/00_inbox/Tasks.md']);
  assert.equal(exists(root, '.env.local'), false);
  assert.equal(exists(root, '.claude/skills/my-canvas-sync/SKILL.md'), true);
});

test('0001: a second run says "Nothing to do." and changes nothing', () => {
  const root = copyFixture('v0.1.0');
  assert.equal(runMigration(FILE, root).code, 0);
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.code, 0);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0001: an install that never had Canvas has nothing to do', () => {
  const root = copyFixture('v0.1.1');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0001: .mcp.json is rebuilt by the normal tool when the catalogue is there', () => {
  const root = copyFixture('v0.1.0');
  write(root, '.mcp.json', '{"mcpServers":{"stale":{"command":"x","args":[]}}}\n');
  write(root, 'system/catalogue/mcp.json', JSON.stringify({
    servers: ['mcpvault', 'playwright', 'context7'].map((id) => ({ id, name: id, tier: 'core', transport: 'stdio', command: 'node', args: [`${id}.mjs`], env: {} })),
  }));
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /rebuilt at the start of your next session/);
  const servers = Object.keys(readJsonIn(root, '.mcp.json').mcpServers);
  assert.deepEqual(servers, ['mcpvault', 'playwright', 'context7']);
});

test('0001: when the connections file cannot be rebuilt, it says it will be at the next session', () => {
  const root = copyFixture('v0.1.0');
  write(root, '.mcp.json', '{"mcpServers":{}}\n'); // and there is no system/catalogue in this project
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Your connections file will be rebuilt at the start of your next session\./);
  assert.deepEqual(readJsonIn(root, 'config/mcp.selected.json').enabled, ['mcpvault', 'playwright', 'context7']);
});

test('0001: a tools list that cannot be read stops with one sentence and changes nothing', () => {
  const root = copyFixture('v0.1.0');
  write(root, 'config/mcp.selected.json', '{oops');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 1);
  assert.equal(r.stderr.trim(), 'Your settings file config/mcp.selected.json could not be read, so I changed nothing. Run /health-check, then finish the update again.');
  assert.equal(r.stdout, '');
  assert.deepEqual(snapshot(root), before);
});

test('0001: --dry-run says what would happen and writes nothing', () => {
  const root = copyFixture('v0.1.0');
  write(root, '.mcp.json', '{"mcpServers":{}}\n');
  const before = snapshot(root);
  const r = runMigration(FILE, root, ['--dry-run']);
  assert.equal(r.code, 0);
  const out = lines(r.stdout.trim());
  assert.ok(out.length >= 2);
  for (const l of out) assert.match(l, /^Would: /);
  assert.deepEqual(snapshot(root), before);
});

test('0001: other keys, a byte order mark and a repeated id are handled', () => {
  const root = copyFixture('v0.1.1');
  write(root, 'config/mcp.selected.json', '﻿{"schema":1,"note":"mine","enabled":["canvas-mcp","playwright","canvas-mcp"]}');
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(readJsonIn(root, 'config/mcp.selected.json'), { schema: 1, note: 'mine', enabled: ['playwright'] });
  assert.equal(r.stdout.trim(), 'Removed the retired Canvas connection from your tools list.');
});

test('0001: a record of what was built that cannot be read does not stop the tools list from being cleaned', () => {
  const root = copyFixture('v0.1.0');
  write(root, 'state/built.json', '{not json');
  const before = snapshot(root);
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Removed the retired Canvas connection from your tools list.');
  assert.deepEqual(changedPaths(before, snapshot(root)), ['config/mcp.selected.json']);
});

test('0001: a build that used canvas-mcp under another name still gets the task, and a ticked task is not added again', () => {
  const root = copyFixture('v0.1.1');
  write(root, 'state/built.json', JSON.stringify({ schema: 1, items: [{ name: 'my-school-sync', kind: 'skill', blueprint: null, mcp: ['canvas-mcp'], paths: [] }] }));
  const r = runMigration(FILE, root);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Added a task to remove the Canvas sync you built.');
  const tasks = read(root, 'vault/00_inbox/Tasks.md');
  assert.match(tasks, /- \[ \] Canvas is no longer supported\. Say \/remove-skill my-school-sync to remove/);

  // The person ticks it. Running the upgrade again must not bring it back.
  write(root, 'vault/00_inbox/Tasks.md', tasks.replace('- [ ] Canvas', '- [x] Canvas'));
  const before = snapshot(root);
  const again = runMigration(FILE, root);
  assert.equal(again.stdout.trim(), 'Nothing to do.');
  assert.deepEqual(snapshot(root), before);
});

test('0001: a name in the record that is not a plain name is cleaned before it goes into a task', () => {
  const root = copyFixture('v0.1.1');
  write(root, 'state/built.json', JSON.stringify({ schema: 1, items: [{ name: 'my-canvas-sync [[x]] `rm`', kind: 'skill', blueprint: 'canvas-sync', mcp: [], paths: [] }] }));
  assert.equal(runMigration(FILE, root).code, 0);
  const task = read(root, 'vault/00_inbox/Tasks.md').split('\n').find((l) => l.includes('/remove-skill'));
  assert.match(task, /\/remove-skill my-canvas-syncxrm to remove/);
  assert.doesNotMatch(task, /\[\[|`/);
});
