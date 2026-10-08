#!/usr/bin/env node
// ab-migration: Removes the retired Canvas connection from your tools list, if you had switched it on.
//
// Canvas support was removed after v0.1.1 (ADR 0021): the catalogue id "canvas-mcp" no longer exists. This takes the
// id out of config/mcp.selected.json, rebuilds .mcp.json with the normal tool (mcp-gen.mjs), and, for a person who
// built the canvas-sync blueprint, adds one task that says how to remove it. It never edits .env.local,
// state/built.json or any my-* skill.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigration, readJsonFile, writeJsonAtomic } from '../../lib/migrate.mjs';
import { addTask, formatTask, TASKS_FILE } from '../../lib/tasks.mjs';
import { readText } from '../../lib/fsx.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RETIRED_ID = 'canvas-mcp';

function builtForCanvas(item) {
  if (!item || typeof item !== 'object') return false;
  return item.name === 'my-canvas-sync' || item.name === 'canvas-sync' || item.blueprint === 'canvas-sync'
    || (Array.isArray(item.mcp) && item.mcp.includes(RETIRED_ID));
}

/** Rebuild .mcp.json with the normal tool. True when it wrote or confirmed the file; the exit code is ignored on purpose. */
function rebuildConnections(root) {
  const res = spawnSync(process.execPath, [join(HERE, '..', 'mcp-gen.mjs'), '--json'], {
    cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  if (res.error || res.status === null) return false;
  try {
    return typeof JSON.parse(res.stdout).written === 'boolean';
  } catch {
    return false;
  }
}

await runMigration(async ({ root, dryRun, report }) => {
  // 1. The tools list.
  const selectedFile = join(root, 'config', 'mcp.selected.json');
  const selected = readJsonFile(selectedFile);
  let changed = false;
  if (selected.exists && selected.value && typeof selected.value === 'object' && Array.isArray(selected.value.enabled)
    && selected.value.enabled.includes(RETIRED_ID)) {
    writeJsonAtomic(selectedFile, { ...selected.value, enabled: selected.value.enabled.filter((id) => id !== RETIRED_ID) });
    report('Removed the retired Canvas connection from your tools list.');
    changed = true;
  }

  // 2. The connections file, only when there is one to refresh.
  if (changed && !dryRun && existsSync(join(root, '.mcp.json')) && !rebuildConnections(root)) {
    report('Your connections file will be rebuilt at the start of your next session.');
  }

  // 3. Someone who built the Canvas sync gets one task. A record that cannot be read is skipped: it is not needed above.
  let built = null;
  try {
    const file = readJsonFile(join(root, 'state', 'built.json'));
    built = file.exists ? file.value : null;
  } catch {
    built = null;
  }
  const hit = built && Array.isArray(built.items) ? built.items.find(builtForCanvas) : null;
  const name = hit && typeof hit.name === 'string' ? hit.name.replace(/[^A-Za-z0-9._-]/g, '') : '';
  if (name) {
    const task = {
      text: `Canvas is no longer supported. Say /remove-skill ${name} to remove what was built for it, then delete the Canvas access token in your Canvas profile and the CANVAS_API lines in .env.local.`,
      tag: 'update-alterbrain',
      priority: 'medium',
    };
    const line = formatTask(task);
    const tasks = existsSync(TASKS_FILE()) ? readText(TASKS_FILE()) : '';
    if (!tasks.includes(line) && !tasks.includes(line.replace('- [ ]', '- [x]'))) {
      if (!dryRun) addTask(task);
      report('Added a task to remove the Canvas sync you built.');
    }
  }
});
