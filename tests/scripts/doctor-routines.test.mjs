import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, runScript, write, cleanup, join } from '../fixtures/ops/helpers.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const note = (over = {}) => {
  const d = {
    type: 'routine', created: '2026-01-05', status: 'active', schedule: 'Mondays 08:00', cadence: 'weekly:mon@08:00', host: 'laptop',
    runs: '/people due', may: 'draft only', model: 'sonnet', effort: 'medium', last_run: '2026-01-05 08:01', last_result: 'ok', ...over,
  };
  return `---\n${Object.entries(d).map(([k, v]) => `${k}: "${v}"`).join('\n')}\n---\n# Note\n`;
};
const check = (root, args = []) => {
  const r = runScript('doctor.mjs', ['--json', ...args], root);
  return JSON.parse(r.stdout).checks.find((c) => c.id === 'routines');
};

test('no routines folder: ok, nothing to do', release(), () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    const c = check(root);
    assert.equal(c.status, 'ok');
    assert.match(c.detail, /No routines yet/);
    assert.equal(c.fix, null);
  } finally {
    cleanup(parent);
  }
});

test('an overdue routine is a warning with a plain fix', release(), () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    write(join(root, 'vault', '90_routines', 'Keep in touch.md'), note());
    const c = check(root);
    assert.equal(c.status, 'warn');
    assert.match(c.detail, /overdue: Keep in touch \(last ran Monday 2026-01-05\)/);
    assert.match(c.fix, /Routines page/);
  } finally {
    cleanup(parent);
  }
});

test('a never-run overdue routine is not described as having run', release(), () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    write(join(root, 'vault', '90_routines', 'Brief.md'), note({ last_run: '', created: '2026-01-05' }));
    const c = check(root);
    assert.equal(c.status, 'warn');
    assert.match(c.detail, /overdue: Brief \(never ran; set up Monday 2026-01-05\)/);
    assert.doesNotMatch(c.detail, /last ran/);
  } finally {
    cleanup(parent);
  }
});

test('an invalid routine note is named with its first problem', release(), () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    write(join(root, 'vault', '90_routines', 'Sender.md'), note({ may: 'send emails', status: 'paused' }));
    const c = check(root);
    assert.equal(c.status, 'warn');
    assert.match(c.detail, /not valid: Sender/);
    assert.match(c.detail, /draft only/);
    assert.match(c.fix, /draft only/);
  } finally {
    cleanup(parent);
  }
});

test('a note with broken frontmatter is a warning that names it and the reason', release(), () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    write(join(root, 'vault', '90_routines', 'Torn.md'), '---\ntype: "routine"\nstatus: "active"\n# never closed\n');
    const c = check(root);
    assert.equal(c.status, 'warn');
    assert.match(c.detail, /cannot be read: Torn \(its settings block at the top of the note is not closed/);
    assert.match(c.fix, /repair its top block/);
    assert.doesNotMatch(c.detail, /No routines yet/);
  } finally {
    cleanup(parent);
  }
});

test('a healthy routine is ok; --ci skips it', release(), () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    write(join(root, 'vault', '90_routines', 'Fresh.md'), note({ last_run: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` }));
    assert.equal(check(root).status, 'ok');
    assert.match(check(root).detail, /1 active, none overdue/);
    assert.equal(check(root, ['--ci']).status, 'skip');
  } finally {
    cleanup(parent);
  }
});
