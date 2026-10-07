// The human task list: vault/00_inbox/Tasks.md (spec §4).
import { existsSync } from 'node:fs';
import { vaultPath } from './paths.mjs';
import { readText, writeText } from './fsx.mjs';

export const TASKS_FILE = () => vaultPath('00_inbox', 'Tasks.md');

export const SECTIONS = ['Inbox', 'Today', 'This week', 'Waiting on others', 'Someday', 'Done (archive weekly)'];

const PRIORITY = { high: '⏫', medium: '🔼', low: '🔽' };

export function skeleton() {
  return [
    '---',
    'type: "tasks"',
    'status: "active"',
    '---',
    '# Tasks',
    '',
    'Your to-do list. Alterbrain adds items to **Inbox** when it needs you (tagged `#ab/...`).',
    'Tick a box when done. Move items between sections whenever you like.',
    '',
    ...SECTIONS.flatMap((s) => [`## ${s}`, '', '']),
  ].join('\n');
}

/** Format one task line. */
export function formatTask({ text, tag, due, priority, link }) {
  const parts = ['- [ ]', String(text).replace(/\s+/g, ' ').trim()];
  if (tag) parts.push(`#ab/${String(tag).replace(/^#?ab\//, '').replace(/\s+/g, '-')}`);
  if (due) parts.push(`📅 ${due}`);
  if (priority && PRIORITY[priority]) parts.push(PRIORITY[priority]);
  if (link) parts.push(`[[${String(link).replace(/^vault\//, '').replace(/\.md$/, '')}]]`);
  return parts.join(' ');
}

/** Append a task under "## Inbox". Creates Tasks.md if missing. Returns the line. */
export function addTask(task) {
  const file = TASKS_FILE();
  let text = existsSync(file) ? readText(file) : skeleton();
  const line = formatTask(task);
  if (text.includes(line)) return line; // idempotent
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => /^##\s+Inbox\s*$/.test(l));
  if (idx === -1) {
    lines.push('', '## Inbox', line);
  } else {
    let insertAt = idx + 1;
    while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++;
    // insert after the last existing task directly under Inbox
    while (insertAt < lines.length && /^- \[[ xX]\]/.test(lines[insertAt])) insertAt++;
    lines.splice(insertAt, 0, line);
  }
  text = lines.join('\n');
  writeText(file, text);
  return line;
}

/** List open tasks (optionally only agent tasks). */
export function listTasks({ agentOnly = false } = {}) {
  const text = readText(TASKS_FILE());
  return text
    .split('\n')
    .filter((l) => /^- \[ \]/.test(l))
    .filter((l) => !agentOnly || /#ab\//.test(l))
    .map((l) => {
      const due = l.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
      return { line: l, due };
    });
}

/** Mark the first open task containing `needle` as done. Returns true if changed. */
export function completeTask(needle) {
  const file = TASKS_FILE();
  const text = readText(file);
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^- \[ \]/.test(l) && l.includes(needle));
  if (i === -1) return false;
  lines[i] = lines[i].replace('- [ ]', '- [x]');
  writeText(file, lines.join('\n'));
  return true;
}
