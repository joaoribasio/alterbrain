import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { makeProject, runScript, read, write } from '../fixtures/scripts/helpers.mjs';

const FILE = 'vault/00_inbox/Tasks.md';

test('add creates Tasks.md and puts the task under Inbox', () => {
  const p = makeProject();
  try {
    const r = runScript(
      'tasks.mjs',
      ['add', 'Review reply to Prof. Smith', '--tag', 'reply', '--due', '2026-10-09', '--priority', 'medium', '--link', 'vault/00_inbox/outbox/2026-10-08 Reply to Prof Smith.md'],
      p,
    );
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(p.path(FILE)));
    const text = read(p, FILE);
    assert.match(text, /- \[ \] Review reply to Prof\. Smith #ab\/reply 📅 2026-10-09 🔼 \[\[00_inbox\/outbox\/2026-10-08 Reply to Prof Smith\]\]/);
    assert.ok(text.indexOf('- [ ] Review') > text.indexOf('## Inbox'));
    assert.ok(text.indexOf('- [ ] Review') < text.indexOf('## Today'));
  } finally {
    p.cleanup();
  }
});

test('add is idempotent and appends in order', () => {
  const p = makeProject();
  try {
    runScript('tasks.mjs', ['add', 'First thing', '--tag', 'a'], p);
    runScript('tasks.mjs', ['add', 'First thing', '--tag', 'a'], p);
    runScript('tasks.mjs', ['add', 'Second thing'], p);
    const lines = read(p, FILE).split('\n').filter((l) => l.startsWith('- [ ]'));
    assert.deepEqual(lines, ['- [ ] First thing #ab/a', '- [ ] Second thing']);
  } finally {
    p.cleanup();
  }
});

test('add --json returns the line', () => {
  const p = makeProject();
  try {
    const r = runScript('tasks.mjs', ['add', 'Check deadline', '--tag', 'assignment', '--priority', 'high', '--json'], p);
    assert.equal(r.status, 0);
    const out = r.json();
    assert.equal(out.ok, true);
    assert.equal(out.line, '- [ ] Check deadline #ab/assignment ⏫');
    assert.equal(out.file, 'vault/00_inbox/Tasks.md');
  } finally {
    p.cleanup();
  }
});

test('list shows open tasks, flags overdue ones and can filter to agent tasks', () => {
  const p = makeProject();
  try {
    runScript('tasks.mjs', ['add', 'Old deadline', '--tag', 'jobs', '--due', '2020-01-01'], p);
    runScript('tasks.mjs', ['add', 'Buy a notebook'], p);
    const all = runScript('tasks.mjs', ['list', '--json'], p).json();
    assert.equal(all.count, 2);
    const old = all.tasks.find((t) => t.line.includes('Old deadline'));
    assert.equal(old.overdue, true);
    assert.equal(old.agent, true);
    const agent = runScript('tasks.mjs', ['list', '--agent', '--json'], p).json();
    assert.equal(agent.count, 1);
    const human = runScript('tasks.mjs', ['list'], p);
    assert.match(human.stdout, /2 open tasks/);
    assert.match(human.stdout, /\(overdue\)/);
  } finally {
    p.cleanup();
  }
});

test('list says so when there is nothing to do', () => {
  const p = makeProject();
  try {
    const r = runScript('tasks.mjs', ['list'], p);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No open tasks/);
  } finally {
    p.cleanup();
  }
});

test('done ticks the first match and reports a miss with exit 1', () => {
  const p = makeProject();
  try {
    runScript('tasks.mjs', ['add', 'Review the draft', '--tag', 'reply'], p);
    runScript('tasks.mjs', ['add', 'Review the proposal', '--tag', 'propose'], p);
    const r = runScript('tasks.mjs', ['done', 'Review the'], p);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /2 tasks matched/);
    const text = read(p, FILE);
    assert.match(text, /- \[x\] Review the draft/);
    assert.match(text, /- \[ \] Review the proposal/);
    const miss = runScript('tasks.mjs', ['done', 'does not exist'], p);
    assert.equal(miss.status, 1);
    assert.match(miss.stdout, /could not find/);
  } finally {
    p.cleanup();
  }
});

test('done works on a Tasks.md that already has content in other sections', () => {
  const p = makeProject();
  try {
    write(p, FILE, '# Tasks\n\n## Inbox\n\n## Today\n- [ ] Call the careers office\n\n## Done (archive weekly)\n');
    const r = runScript('tasks.mjs', ['done', 'careers office'], p);
    assert.equal(r.status, 0);
    assert.match(read(p, FILE), /- \[x\] Call the careers office/);
  } finally {
    p.cleanup();
  }
});

test('usage errors exit with 2', () => {
  const p = makeProject();
  try {
    assert.equal(runScript('tasks.mjs', [], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['add'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['add', 'x', '--due', '09/10/2026'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['add', 'x', '--due', '2026-02-31'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['add', 'x', '--priority', 'urgent'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['add', 'x', '--nope'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['add', 'x', '--tag'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['frobnicate'], p).status, 2);
    assert.equal(runScript('tasks.mjs', ['done'], p).status, 2);
    assert.equal(existsSync(p.path(FILE)), false, 'nothing should be written on a usage error');
  } finally {
    p.cleanup();
  }
});

test('add keeps CRLF line endings in a Tasks.md that uses them (no mixed endings)', () => {
  const p = makeProject();
  try {
    write(p, FILE, '# Tasks\r\n\r\n## Inbox\r\n- [ ] Old one\r\n\r\n## Today\r\n\r\n## Done (archive weekly)\r\n');
    assert.equal(runScript('tasks.mjs', ['add', 'New one', '--tag', 'a'], p).status, 0);
    const text = read(p, FILE);
    assert.ok(text.includes('- [ ] New one #ab/a\r\n'));
    assert.equal(text.replace(/\r\n/g, '').includes('\n'), false, 'every line break is CRLF');
    assert.equal(text.replace(/\r\n/g, '').includes('\r'), false);
    // done and list still work on the CRLF file and keep its endings
    assert.equal(runScript('tasks.mjs', ['done', 'Old one'], p).status, 0);
    const after = read(p, FILE);
    assert.match(after, /- \[x\] Old one\r\n/);
    assert.equal(after.replace(/\r\n/g, '').includes('\n'), false);
    assert.match(runScript('tasks.mjs', ['list', '--json'], p).stdout, /New one #ab\/a"/);
  } finally {
    p.cleanup();
  }
});

test('add to a CRLF file with no Inbox heading adds one with CRLF', () => {
  const p = makeProject();
  try {
    write(p, FILE, '# Tasks\r\n\r\n## Today\r\n');
    runScript('tasks.mjs', ['add', 'Fresh'], p);
    const text = read(p, FILE);
    assert.ok(text.includes('## Inbox\r\n- [ ] Fresh\r\n'));
    assert.equal(text.replace(/\r\n/g, '').includes('\n'), false);
  } finally {
    p.cleanup();
  }
});

test('add keeps LF in an LF file, and a new Tasks.md is LF', () => {
  const p = makeProject();
  try {
    runScript('tasks.mjs', ['add', 'First'], p);
    assert.equal(read(p, FILE).includes('\r'), false);
    runScript('tasks.mjs', ['add', 'Second'], p);
    const text = read(p, FILE);
    assert.equal(text.includes('\r'), false);
    assert.ok(text.includes('- [ ] First\n- [ ] Second\n'));
  } finally {
    p.cleanup();
  }
});

test('add to CRLF files in the edge cases leaves no bare LF and no lone CR', () => {
  const cases = [
    '# Tasks\r\n\r\n## Today\r\n- [ ] a',
    '# Tasks\r\n\r\n## Inbox\r\n',
    '# Tasks\r\n\r\n## Inbox',
    '# Tasks\r\n\r\n## Inbox\r\n- [ ] old',
  ];
  for (const input of cases) {
    const p = makeProject();
    try {
      write(p, FILE, input);
      assert.equal(runScript('tasks.mjs', ['add', 'New task'], p).status, 0);
      const text = read(p, FILE);
      assert.equal(text.replace(/\r\n/g, '').includes('\n'), false, `bare LF for ${JSON.stringify(input)}`);
      assert.equal(text.replace(/\r\n/g, '').includes('\r'), false, `lone CR for ${JSON.stringify(input)}`);
      assert.ok(text.endsWith('\r\n'), 'ends with CRLF');
      assert.ok(text.includes('- [ ] New task\r\n'));
    } finally {
      p.cleanup();
    }
  }
});
