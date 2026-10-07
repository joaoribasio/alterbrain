// Dry-run only: these tests never talk to GitHub or change the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeProject, runScript, git, write, cleanup, existsSync, join,
} from '../fixtures/ops/helpers.mjs';
import { judgeOrigin, parseArgs } from '../../system/scripts/setup-github.mjs';

const RELEASE = { name: 'alterbrain', version: '0.1.0', tag: 'v0.1.0', repo: 'joaoribasio/alterbrain' };

function project(origin) {
  const p = makeProject();
  write(join(p.root, 'system', 'release.json'), JSON.stringify(RELEASE));
  git(p.root, ['add', '-A']);
  git(p.root, ['commit', '-m', 'release file']);
  if (origin) git(p.root, ['remote', 'add', 'origin', origin]);
  return p;
}

const ids = (out) => out.steps.map((s) => s.id);

test('dry run: origin pointing at the public Alterbrain repo is recorded and removed (planned only)', () => {
  const { parent, root } = project('https://github.com/joaoribasio/alterbrain.git');
  try {
    const r = runScript('setup-github.mjs', ['--dry-run', '--json', '--name', 'my-brain'], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.dry_run, true);
    assert.ok(ids(out).includes('record-origin'));
    assert.ok(ids(out).includes('remove-origin'));
    assert.ok(ids(out).includes('create'));
    const create = out.steps.find((s) => s.id === 'create');
    assert.match(create.text, /PRIVATE/);
    assert.match(create.text, /my-brain/);
    // nothing changed
    assert.equal(git(root, ['remote', 'get-url', 'origin']), 'https://github.com/joaoribasio/alterbrain.git');
    assert.equal(existsSync(join(root, 'state', 'release-origin.json')), false);
  } finally {
    cleanup(parent);
  }
});

test('dry run: someone else\'s repo is treated the same way', () => {
  const { parent, root } = project('git@github.com:someone-else/their-fork.git');
  try {
    const out = JSON.parse(runScript('setup-github.mjs', ['--dry-run', '--json'], root).stdout);
    assert.ok(ids(out).includes('remove-origin'));
    assert.equal(git(root, ['remote', 'get-url', 'origin']), 'git@github.com:someone-else/their-fork.git');
  } finally {
    cleanup(parent);
  }
});

test('dry run: no origin means just create', () => {
  const { parent, root } = project(null);
  try {
    const out = JSON.parse(runScript('setup-github.mjs', ['--dry-run', '--json'], root).stdout);
    assert.ok(!ids(out).includes('remove-origin'));
    assert.ok(ids(out).includes('create'));
    assert.match(out.steps.find((s) => s.id === 'create').text, /my-alterbrain/);
  } finally {
    cleanup(parent);
  }
});

test('dry run: plain-language text output', () => {
  const { parent, root } = project(null);
  try {
    const r = runScript('setup-github.mjs', ['--dry-run'], root);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Dry run: nothing will be changed/);
    assert.match(r.stdout, /\[plan\]/);
  } finally {
    cleanup(parent);
  }
});

test('developer mode leaves origin alone', () => {
  const { parent, root } = makeProject({ dev: true });
  try {
    git(root, ['remote', 'add', 'origin', 'https://github.com/joaoribasio/alterbrain.git']);
    const out = JSON.parse(runScript('setup-github.mjs', ['--dry-run', '--json'], root).stdout);
    assert.deepEqual(ids(out), ['dev-mode']);
  } finally {
    cleanup(parent);
  }
});

test('bad repo names are a usage error', () => {
  const { parent, root } = project(null);
  try {
    assert.equal(runScript('setup-github.mjs', ['--dry-run', '--name', 'bad name!'], root).code, 2);
    assert.equal(runScript('setup-github.mjs', ['--dry-run', '--name'], root).code, 2);
    assert.equal(runScript('setup-github.mjs', ['--wat'], root).code, 2);
  } finally {
    cleanup(parent);
  }
});

test('judgeOrigin decides correctly', () => {
  const ctx = { releaseRepo: 'joaoribasio/alterbrain', login: 'alex-doe' };
  assert.equal(judgeOrigin(null, ctx).kind, 'none');
  assert.equal(judgeOrigin('https://github.com/JoaoRibasio/Alterbrain', ctx).kind, 'foreign');
  assert.equal(judgeOrigin('https://github.com/alex-doe/my-alterbrain.git', ctx).kind, 'own');
  assert.equal(judgeOrigin('git@github.com:other/x.git', ctx).kind, 'foreign');
  assert.equal(judgeOrigin('https://github.com/other/x.git', { ...ctx, login: null }).kind, 'unknown');
  assert.equal(judgeOrigin('https://github.com/joaoribasio/alterbrain', { ...ctx, login: null }).kind, 'foreign');
  assert.equal(parseArgs(['--name', 'ok_name-1.x']).name, 'ok_name-1.x');
  assert.equal(parseArgs(['--name', '..']), null);
});
