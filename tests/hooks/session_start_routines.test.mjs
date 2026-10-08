import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, makeProject, runHook } from '../fixtures/hooks/helpers.mjs';

const routine = (name, over = {}) => {
  const d = {
    type: 'routine', created: '2026-01-05', status: 'active', schedule: 'Mondays 08:00', cadence: 'weekly:mon@08:00', host: 'laptop',
    runs: '/people due', may: 'draft only', model: 'sonnet', effort: 'medium', last_run: '2026-01-05 08:01', last_result: 'ok', ...over,
  };
  return `---\n${Object.entries(d).map(([k, v]) => `${k}: "${v}"`).join('\n')}\n---\n# ${name}\n`;
};
const start = (p, source = 'startup') => runHook(p, 'session_start', { hook_event_name: 'SessionStart', source });

test('no routines folder: no routine line', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.doesNotMatch(contextOf(start(p)), /routine/i);
});

test('one overdue routine gets one line naming it and its last run', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('vault/90_routines/Keep in touch.md', routine('Keep in touch'));
  p.write('vault/90_routines/Paused one.md', routine('Paused one', { status: 'paused' }));
  const text = contextOf(start(p));
  assert.match(text, /Keep in touch has not run since Monday 2026-01-05\. Check the Claude app's Routines page, or say 'check my routines'\./);
  assert.equal(text.split('\n').filter((l) => /routine/i.test(l)).length, 1);
  assert.ok(!text.includes('Paused one'));
});

test('a never-run overdue routine is worded as not run yet', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('vault/90_routines/Brief.md', routine('Brief', { last_run: '' }));
  const text = contextOf(start(p));
  assert.match(text, /Brief has not run yet \(set up Monday 2026-01-05\)\./);
  assert.doesNotMatch(text, /not run since/);
});

test('several overdue routines are one summary line', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('vault/90_routines/A.md', routine('A'));
  p.write('vault/90_routines/B.md', routine('B', { last_run: '2026-01-12 08:00' }));
  const text = contextOf(start(p));
  assert.match(text, /2 routines are overdue: say 'check my routines'\./);
});

test('an up-to-date routine adds nothing', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  p.write('vault/90_routines/Fresh.md', routine('Fresh', { last_run: stamp }));
  assert.doesNotMatch(contextOf(start(p)), /routine/i);
});

test('skipped on compact; a broken note fails open', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('vault/90_routines/Keep.md', routine('Keep'));
  p.write('vault/90_routines/Broken.md', '---\ntype: "routine"\n: : :\n');
  assert.doesNotMatch(contextOf(start(p, 'compact')), /routine/i);
  const r = start(p);
  assert.equal(r.code, 0);
  assert.match(contextOf(r), /Keep has not run since/);
});

test('the 25-line cap still holds and the routine line never pushes out warnings', (t) => {
  const p = makeProject({ devMode: true });
  t.after(p.cleanup);
  p.write('vault/90_routines/Keep.md', routine('Keep'));
  const text = contextOf(start(p));
  assert.ok(text.split('\n').length <= 25);
  assert.match(text, /Developer mode is on/);
  assert.match(text, /Keep has not run since/);
});
