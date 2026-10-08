// Tests for the small helpers added for the user-experience fixes:
// date.mjs, check-json.mjs, ingest-pending.mjs, built.mjs --delete-files,
// setup-github.mjs --detach-only, the git-auto public-origin guard, the .env.local seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import {
  makeProject, runScript, git, write, cleanup, join, tmp,
} from '../fixtures/ops/helpers.mjs';
import { compute, isoWeek, parseArgs, parseDay } from '../../system/scripts/date.mjs';
import { isOwnPath } from '../../system/scripts/built.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const RELEASE = { name: 'alterbrain', version: '0.1.0', tag: 'v0.1.0', repo: 'joaoribasio/alterbrain' };

test('date.mjs: local date, plus days, ISO week, bad input', () => {
  const justAfterMidnight = new Date(2026, 9, 7, 0, 30, 0); // the UTC date may still be 6 October
  assert.equal(compute({ plus: 0, from: null }, justAfterMidnight).date, '2026-10-07');
  assert.equal(compute({ plus: 1, from: null }, justAfterMidnight).date, '2026-10-08');
  assert.equal(compute({ plus: -5, from: '2026-10-20' }, justAfterMidnight).date, '2026-10-15');
  assert.equal(compute({ plus: 12, from: '2026-12-25' }, justAfterMidnight).date, '2027-01-06');
  assert.equal(compute({ plus: 0, from: '2026-10-07' }, justAfterMidnight).weekday, 'Wednesday');
  assert.equal(isoWeek(new Date(2026, 9, 7)), '2026-W41');
  assert.equal(isoWeek(new Date(2027, 0, 1)), '2026-W53');
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseArgs(['--plus', 'x']), null);
  assert.equal(parseArgs(['--plus=-3']).plus, -3);
  assert.equal(parseArgs(['--nope']), null);
});

test('date.mjs CLI prints one line and exits 2 on bad input', release(), () => {
  const { parent, root } = makeProject();
  try {
    const ok = runScript('date.mjs', ['--from', '2026-10-20', '--plus', '-5'], root);
    assert.equal(ok.code, 0);
    assert.equal(ok.stdout.trim(), '2026-10-15');
    assert.match(runScript('date.mjs', ['--now'], root).stdout.trim(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.match(runScript('date.mjs', ['--iso-week'], root).stdout.trim(), /^\d{4}-W\d{2}$/);
    assert.equal(runScript('date.mjs', ['--from', '2026-13-40'], root).code, 2);
    assert.equal(runScript('date.mjs', ['--bogus'], root).code, 2);
  } finally {
    cleanup(parent);
  }
});

test('check-json.mjs: valid, invalid, missing and --length', release(), () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, 'config', 'good.json'), '{"a":1}\n');
    write(join(root, 'config', 'bad.json'), '{"a":');
    write(join(root, 'note.md'), 'abcde');
    assert.equal(runScript('check-json.mjs', ['config/good.json'], root).code, 0);
    assert.equal(runScript('check-json.mjs', ['config/good.json', 'config/bad.json'], root).code, 1);
    assert.equal(runScript('check-json.mjs', ['config/missing.json'], root).code, 1);
    const len = runScript('check-json.mjs', ['--length', 'note.md'], root);
    assert.equal(len.code, 0);
    assert.equal(len.stdout.trim(), '5');
    assert.equal(runScript('check-json.mjs', [], root).code, 2);
  } finally {
    cleanup(parent);
  }
});

test('ingest-pending.mjs lists only manifest entries without a source note', () => {
  const { parent, root } = makeProject();
  try {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    write(
      join(root, 'vault', '40_sources', 'manifest.jsonl'),
      `${JSON.stringify({ id: 'one', sha256: a, stored: 'raw/one.pdf', kind: 'pdf' })}\n${JSON.stringify({ id: 'two', sha256: b, stored: 'raw/two.pdf', kind: 'pdf' })}\nnot json\n`,
    );
    write(join(root, 'vault', '40_sources', 'notes', 'One.md'), `---\ntype: "source"\nsha256: "${a}"\n---\n`);
    const r = runScript('ingest-pending.mjs', ['--json'], root);
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.count, 1);
    assert.equal(out.pending[0].id, 'two');
  } finally {
    cleanup(parent);
  }
});

test('built.mjs remove --delete-files deletes only my-* skills and agents', () => {
  assert.equal(isOwnPath('.claude/skills/my-zotero/'), true);
  assert.equal(isOwnPath('.claude/agents/my-helper.md'), true);
  assert.equal(isOwnPath('.claude/skills/ask/'), false);
  assert.equal(isOwnPath('.claude/skills/my-x/../ask'), false);
  assert.equal(isOwnPath('system/scripts/built.mjs'), false);
  assert.equal(isOwnPath('vault/30_wiki/topics/Reading.md'), false);
  const { parent, root } = makeProject();
  try {
    write(join(root, '.claude', 'skills', 'my-zotero', 'SKILL.md'), 'x');
    write(join(root, '.claude', 'agents', 'my-helper.md'), 'x');
    write(join(root, 'vault', '30_wiki', 'topics', 'Reading.md'), 'keep me');
    const add = runScript('built.mjs', ['add', '--name', 'my-zotero', '--kind', 'skill', '--path', '.claude/skills/my-zotero/', '--path', '.claude/agents/my-helper.md', '--path', 'vault/30_wiki/topics/Reading.md'], root);
    assert.equal(add.code, 0, add.stderr);
    const rm = runScript('built.mjs', ['remove', 'my-zotero', '--delete-files', '--json'], root);
    assert.equal(rm.code, 0, rm.stderr);
    const out = JSON.parse(rm.stdout);
    assert.equal(out.deleted.length, 2);
    assert.deepEqual(out.kept, ['vault/30_wiki/topics/Reading.md']);
    assert.equal(existsSync(join(root, '.claude', 'skills', 'my-zotero')), false);
    assert.equal(existsSync(join(root, '.claude', 'agents', 'my-helper.md')), false);
    assert.equal(readFileSync(join(root, 'vault', '30_wiki', 'topics', 'Reading.md'), 'utf8'), 'keep me');
  } finally {
    cleanup(parent);
  }
});

function projectWithOrigin(origin) {
  const p = makeProject();
  write(join(p.root, 'system', 'release.json'), JSON.stringify(RELEASE));
  git(p.root, ['add', '-A']);
  git(p.root, ['commit', '-m', 'release file']);
  if (origin) git(p.root, ['remote', 'add', 'origin', origin]);
  return p;
}

test('setup-github --detach-only removes the public origin without GitHub, and leaves other origins alone', release(), () => {
  const pub = projectWithOrigin('https://github.com/joaoribasio/alterbrain.git');
  try {
    const dry = JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--dry-run', '--json'], pub.root).stdout);
    assert.ok(dry.steps.some((s) => s.id === 'remove-origin' && s.status === 'planned'));
    assert.equal(git(pub.root, ['remote', 'get-url', 'origin']), 'https://github.com/joaoribasio/alterbrain.git');
    const r = runScript('setup-github.mjs', ['--detach-only', '--json'], pub.root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(git(pub.root, ['remote']), '');
    const rec = JSON.parse(readFileSync(join(pub.root, 'state', 'release-origin.json'), 'utf8'));
    assert.equal(rec.repo.toLowerCase(), 'joaoribasio/alterbrain');
    const again = JSON.parse(runScript('setup-github.mjs', ['--detach-only', '--json'], pub.root).stdout);
    assert.ok(again.steps.every((s) => s.status === 'skipped'));
  } finally {
    cleanup(pub.parent);
  }
  const own = projectWithOrigin('https://github.com/alex-doe/my-brain.git');
  try {
    const r = runScript('setup-github.mjs', ['--detach-only', '--json'], own.root);
    assert.equal(r.code, 0);
    assert.equal(git(own.root, ['remote', 'get-url', 'origin']), 'https://github.com/alex-doe/my-brain.git');
  } finally {
    cleanup(own.parent);
  }
});

test('git-auto pull and push refuse to talk to the public Alterbrain repo', release(), () => {
  const { parent, root } = projectWithOrigin('https://github.com/joaoribasio/alterbrain.git');
  try {
    for (const cmd of ['pull', 'push']) {
      const r = runScript('git-auto.mjs', [cmd, '--json'], root);
      const out = JSON.parse(r.stdout);
      assert.equal(out.status, 'skipped', `${cmd}: ${r.stdout}${r.stderr}`);
      assert.match(out.message, /public Alterbrain/);
    }
  } finally {
    cleanup(parent);
  }
});

test('onboard-seed creates .env.local from .env.example once and never overwrites it', () => {
  const root = tmp('ab-seed-');
  try {
    mkdirSync(join(root, 'system'), { recursive: true });
    write(join(root, '.env.example'), '# template\nADZUNA_APP_ID=\n');
    const first = JSON.parse(runScript('onboard-seed.mjs', ['--json'], root).stdout);
    assert.ok(first.created.includes('.env.local'));
    assert.equal(readFileSync(join(root, '.env.local'), 'utf8'), '# template\nADZUNA_APP_ID=\n');
    write(join(root, '.env.local'), 'MINE=1\n');
    const second = JSON.parse(runScript('onboard-seed.mjs', ['--json'], root).stdout);
    assert.ok(second.kept.includes('.env.local'));
    assert.equal(readFileSync(join(root, '.env.local'), 'utf8'), 'MINE=1\n');
  } finally {
    cleanup(root);
  }
});

test('doctor warns when the keys file was saved as .env.local.txt, and says nothing otherwise', release(), () => {
  const { parent, root } = makeProject();
  try {
    const ids = () => JSON.parse(runScript('doctor.mjs', ['--json'], root).stdout).checks.map((c) => c.id);
    assert.ok(!ids().includes('env-file'));
    write(join(root, '.env.local.txt'), 'X=1\n');
    const out = JSON.parse(runScript('doctor.mjs', ['--json'], root).stdout);
    const c = out.checks.find((x) => x.id === 'env-file');
    assert.ok(c, 'env-file check is reported');
    assert.equal(c.status, 'warn');
    assert.match(c.detail, /\.env\.local\.txt/);
  } finally {
    cleanup(parent);
  }
});
