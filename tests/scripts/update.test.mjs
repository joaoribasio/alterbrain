import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { relative, sep } from 'node:path';
import { release } from '../fixtures/scripts/release.mjs';
import {
  makeProject, runScript, git, gitTry, write, sha, cleanup, tmp, FIXTURES, join,
} from '../fixtures/ops/helpers.mjs';
import {
  decide, normaliseManifest, isSafeFrameworkPath, contentMatchesSha, isExcludedFromUpdates, isValidRepo, manifestSignatureOk, staysInsideProject,
} from '../../system/scripts/update.mjs';

const OLD = join(FIXTURES, 'release', 'old');
const NEW = join(FIXTURES, 'release', 'new');
const TAG = 'v0.2.0';
const MIGRATION_SUMMARY = 'Writes a small marker file so the test can see that this upgrade ran.';

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out.sort();
}

const isCode = (p) => /^system\/(hooks|lib|scripts)\//.test(p) || p === 'system/release.json';

function manifestFor(dir, version, tag) {
  const files = {};
  for (const p of walk(dir)) {
    if (p === 'system/manifest.json') continue;
    files[p] = { class: isCode(p) ? 'code' : 'text', sha256: sha(readFileSync(join(dir, ...p.split('/')))) };
  }
  return { schema: 1, version, tag, files };
}

/** A release folder (the NEW fixture tree plus a manifest) in a temp place. */
function makeRelease(mutate) {
  const dir = tmp('ab-release-');
  cpSync(NEW, dir, { recursive: true });
  const manifest = manifestFor(dir, '0.2.0', TAG);
  if (mutate) mutate(dir, manifest);
  write(join(dir, 'system', 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

/** A project that has the OLD release installed, with some user edits. */
function makeInstalled() {
  const { parent, root } = makeProject();
  cpSync(OLD, root, { recursive: true });
  write(join(root, 'system', 'manifest.json'), JSON.stringify(manifestFor(OLD, '0.1.0', 'v0.1.0'), null, 2));
  // user edits
  write(join(root, 'system', 'lib', 'helper.mjs'), '// somebody hacked this code file\n');
  write(join(root, 'system', 'templates', 'notes', 'Course.md'), '---\ntype: "course"\n---\nCourse template, my own words\n');
  write(join(root, 'system', 'templates', 'notes', 'Person.md'), '---\ntype: "person"\n---\nPerson template, my own words\n');
  write(join(root, 'system', 'blueprints', 'old-edited.md'), 'My notes inside an old blueprint.\n');
  // Concept.md is stored with Windows line endings but has the same words: it counts as not edited
  write(join(root, 'system', 'templates', 'notes', 'Concept.md'), readFileSync(join(OLD, 'system', 'templates', 'notes', 'Concept.md'), 'utf8').replace(/\n/g, '\r\n'));
  // the install's manifest must list old-edited.md (it is in OLD tree, so it does)
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'installed']);
  return { parent, root };
}

// A release folder is only accepted when the person has switched that on in their own terminal.
const upd = (root, args, env = {}) => runScript('update.mjs', args, root, { ALTERBRAIN_ALLOW_CUSTOM_SOURCE: '1', ...env });
const jsonOf = (r) => JSON.parse(r.stdout.trim());
const actionOf = (plan, path) => plan.files.find((f) => f.path === path)?.action;
const readRoot = (root, p) => readFileSync(join(root, ...p.split('/')), 'utf8');

test('check compares the installed release with the latest one', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    const r = upd(root, ['check', '--json', '--source-dir', rel]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = jsonOf(r);
    assert.equal(out.current, 'v0.1.0');
    assert.equal(out.latest, 'v0.2.0');
    assert.equal(out.update_available, true);
    const same = jsonOf(upd(root, ['check', '--json', '--source-dir', OLD]));
    assert.equal(same.update_available, false);
  } finally {
    cleanup(parent, rel);
  }
});

test('plan decides every case correctly and stages verified files', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  const baseDir = OLD;
  try {
    const r = upd(root, ['plan', TAG, '--json', '--source-dir', rel, '--base-dir', baseDir]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const plan = jsonOf(r);
    assert.equal(plan.ok, true);
    assert.equal(actionOf(plan, 'system/hooks/session_start.mjs'), 'replace');
    assert.equal(actionOf(plan, 'system/lib/helper.mjs'), 'replace', 'code is replaced even if someone edited it');
    assert.equal(actionOf(plan, 'system/lib/stable.mjs'), 'unchanged');
    assert.equal(actionOf(plan, 'system/templates/notes/Concept.md'), 'replace', 'unedited text (even with CRLF) is replaced');
    assert.equal(actionOf(plan, 'system/templates/notes/Course.md'), 'propose-merge');
    assert.equal(actionOf(plan, 'system/templates/notes/Person.md'), 'unchanged', 'edited, but upstream did not change it');
    assert.equal(actionOf(plan, 'system/blueprints/new-thing.md'), 'add');
    assert.equal(actionOf(plan, 'system/scripts/migrations/001-example.mjs'), 'add');
    assert.equal(actionOf(plan, 'system/blueprints/old-thing.md'), 'archive');
    assert.equal(actionOf(plan, 'system/scripts/legacy.mjs'), 'archive');
    const edited = plan.files.find((f) => f.path === 'system/blueprints/old-edited.md');
    assert.equal(edited.action, 'archive');
    assert.equal(edited.needs_review, true);
    assert.equal(plan.files.find((f) => f.path === 'system/templates/notes/Course.md').base_available, true);
    // the upgrades that finish will run are listed up front, with the sentence from the script
    assert.deepEqual(plan.migrations_pending, [{ id: '001-example.mjs', summary: MIGRATION_SUMMARY }]);

    const stage = join(root, 'state', 'local', 'update', TAG);
    assert.ok(existsSync(join(stage, 'plan.json')));
    assert.ok(existsSync(join(stage, 'new', 'system', 'blueprints', 'new-thing.md')));
    assert.ok(existsSync(join(stage, 'new', 'system', 'templates', 'notes', 'Course.md')));
    assert.ok(existsSync(join(stage, 'base', 'system', 'templates', 'notes', 'Course.md')));
    assert.equal(existsSync(join(stage, 'new', 'system', 'lib', 'stable.mjs')), false, 'unchanged files are not downloaded');
    // planning changes nothing in the project
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 1\n');
  } finally {
    cleanup(parent, rel);
  }
});

test('apply-safe, then finish: the full happy path', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    const a = upd(root, ['apply-safe', TAG, '--json', '--no-commit']);
    assert.equal(a.code, 0, a.stdout + a.stderr);
    const applied = jsonOf(a);
    assert.equal(applied.safety_tag, `pre-update-${TAG}`);
    assert.equal(git(root, ['tag', '--list', `pre-update-${TAG}`]), `pre-update-${TAG}`);

    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 2\n');
    assert.equal(readRoot(root, 'system/lib/helper.mjs'), 'export const version = 2;\n');
    assert.match(readRoot(root, 'system/templates/notes/Concept.md'), /v2/);
    assert.equal(readRoot(root, 'system/blueprints/new-thing.md'), 'A brand new blueprint.\n');
    assert.match(readRoot(root, 'system/release.json'), /0\.2\.0/);

    // the user's edited files are not touched
    assert.match(readRoot(root, 'system/templates/notes/Course.md'), /my own words/);
    assert.match(readRoot(root, 'system/templates/notes/Person.md'), /my own words/);
    assert.deepEqual(applied.propose_merge.map((m) => m.path), ['system/templates/notes/Course.md']);
    assert.ok(existsSync(join(root, 'system', 'blueprints', 'old-edited.md')), 'edited + removed upstream: left for the user');

    // removed upstream: moved, never lost
    assert.equal(existsSync(join(root, 'system', 'blueprints', 'old-thing.md')), false);
    assert.equal(readRoot(root, `state/archive/${TAG}/system/blueprints/old-thing.md`), 'Old blueprint, removed upstream.\n');
    assert.equal(existsSync(join(root, 'system', 'scripts', 'legacy.mjs')), false);
    assert.ok(existsSync(join(root, 'state', 'archive', TAG, 'system', 'scripts', 'legacy.mjs')));

    // the manifest still describes the OLD release until finish
    assert.equal(JSON.parse(readRoot(root, 'system/manifest.json')).version, '0.1.0');

    const f = upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']);
    assert.equal(f.code, 0, f.stdout + f.stderr);
    const fin = jsonOf(f);
    assert.deepEqual(fin.migrations_run, ['001-example.mjs']);
    assert.deepEqual(fin.migration_notes, { '001-example.mjs': 'Wrote the example marker file.' });
    assert.deepEqual(fin.migrations_skipped, []);
    assert.equal(fin.ok, true);
    assert.deepEqual(fin.still_to_merge, ['system/templates/notes/Course.md']);
    assert.equal(readRoot(root, 'state/migration-001.txt'), `ran for ${TAG}\n`);
    assert.equal(JSON.parse(readRoot(root, 'state/migrations.json')).applied[0].id, '001-example.mjs');
    const manifest = JSON.parse(readRoot(root, 'system/manifest.json'));
    assert.equal(manifest.version, '0.2.0');
    assert.equal(manifest.files['system/lib/helper.mjs'].sha256, sha('export const version = 2;\n'));

    // a second finish does not run the migration again
    writeFileSync(join(root, 'state', 'migration-001.txt'), 'changed by hand\n');
    const again = jsonOf(upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.deepEqual(again.migrations_run, []);
    assert.deepEqual(again.migration_notes, {});
    assert.equal(readRoot(root, 'state/migration-001.txt'), 'changed by hand\n');

    // and a new plan no longer lists an upgrade that has already run
    assert.deepEqual(jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel])).migrations_pending, []);
  } finally {
    cleanup(parent, rel);
  }
});

test('a tampered release file is rejected at plan time and nothing is applied', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir) => {
    // change the file AFTER the manifest hash was computed (see manifestFor call order below)
    writeFileSync(join(dir, 'system', 'hooks', 'session_start.mjs'), '// hook version 2 + evil\n');
  });
  // makeRelease computed the manifest before mutate ran, so the hash no longer matches
  try {
    const r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 1);
    const plan = jsonOf(r);
    assert.equal(plan.ok, false);
    assert.ok(plan.errors.some((e) => e.path === 'system/hooks/session_start.mjs' && /mismatch/i.test(e.error)));
    assert.equal(actionOf(plan, 'system/hooks/session_start.mjs'), 'rejected');
    assert.equal(existsSync(join(root, 'state', 'local', 'update', TAG, 'new', 'system', 'hooks', 'session_start.mjs')), false);

    const a = upd(root, ['apply-safe', TAG, '--json', '--no-commit']);
    assert.equal(a.code, 1);
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 1\n');
    assert.equal(readRoot(root, 'system/blueprints/old-thing.md'), 'Old blueprint, removed upstream.\n');
    assert.equal(gitTry(root, ['tag', '--list', `pre-update-${TAG}`]).stdout, '');
  } finally {
    cleanup(parent, rel);
  }
});

test('a staged file changed after the plan is caught before anything is written', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    write(join(root, 'state', 'local', 'update', TAG, 'new', 'system', 'lib', 'helper.mjs'), 'export const evil = true;\n');
    const a = upd(root, ['apply-safe', TAG, '--json', '--no-commit']);
    assert.equal(a.code, 1);
    assert.match(jsonOf(a).error, /checksum/);
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 1\n', 'nothing was applied');
  } finally {
    cleanup(parent, rel);
  }
});

test('a text file the user edits between plan and apply is left alone', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    write(join(root, 'system', 'templates', 'notes', 'Concept.md'), 'I just edited this now.\n');
    const a = jsonOf(upd(root, ['apply-safe', TAG, '--json', '--no-commit']));
    assert.equal(a.results.find((r) => r.path === 'system/templates/notes/Concept.md').status, 'skipped-changed');
    assert.equal(readRoot(root, 'system/templates/notes/Concept.md'), 'I just edited this now.\n');
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 2\n');
  } finally {
    cleanup(parent, rel);
  }
});

test('paths that point at the user\'s own folders or outside the project are rejected', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    for (const bad of ['vault/Home.md', 'config/brain.json', 'state/onboarding.json', '../escape.txt', '.git/config', '.claude/skills/my-thing/SKILL.md']) {
      manifest.files[bad] = { class: 'text', sha256: sha('x') };
    }
  });
  try {
    const r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 1);
    const plan = jsonOf(r);
    for (const bad of ['vault/Home.md', 'config/brain.json', 'state/onboarding.json', '../escape.txt', '.git/config', '.claude/skills/my-thing/SKILL.md']) {
      assert.equal(actionOf(plan, bad), 'rejected', bad);
    }
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 1);
  } finally {
    cleanup(parent, rel);
  }
});

test('a file listed in the manifest but missing from the release is an error', () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    manifest.files['system/lib/ghost.mjs'] = { class: 'code', sha256: sha('ghost') };
  });
  try {
    const r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 1);
    assert.ok(jsonOf(r).errors.some((e) => e.path === 'system/lib/ghost.mjs'));
  } finally {
    cleanup(parent, rel);
  }
});

test('a failing migration stops finish and leaves the old manifest in place', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    const p = 'system/scripts/migrations/001-example.mjs';
    const body = 'process.exit(3);\n';
    writeFileSync(join(dir, ...p.split('/')), body);
    manifest.files[p].sha256 = sha(body);
  });
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const f = upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']);
    assert.equal(f.code, 1);
    assert.equal(jsonOf(f).migration, '001-example.mjs');
    assert.equal(JSON.parse(readRoot(root, 'system/manifest.json')).version, '0.1.0');
    assert.equal(existsSync(join(root, 'state', 'migrations.json')), false);
  } finally {
    cleanup(parent, rel);
  }
});

test('finish runs the health check and reports its result', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const f = upd(root, ['finish', TAG, '--json', '--no-commit']);
    const out = jsonOf(f);
    assert.equal(out.doctor.skipped, false);
    assert.equal(typeof out.doctor.exit_code, 'number');
    assert.equal(out.doctor.summary && typeof out.doctor.summary.fail, 'number');
    assert.equal(f.code, out.doctor.ok ? 0 : 1);
  } finally {
    cleanup(parent, rel);
  }
});

test('finish refuses to run before apply-safe', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['finish', TAG, '--no-commit', '--no-doctor']).code, 1);
  } finally {
    cleanup(parent, rel);
  }
});

test('works without git when the release has no upgrades: no restore point, a note, no crash', () => {
  const p = makeProject({ repo: false });
  cpSync(OLD, p.root, { recursive: true });
  write(join(p.root, 'system', 'manifest.json'), JSON.stringify(manifestFor(OLD, '0.1.0', 'v0.1.0')));
  // a release whose upgrade scripts are none: it changes files only, never the person's notes
  const rel = makeRelease((dir, manifest) => {
    rmSync(join(dir, 'system', 'scripts', 'migrations'), { recursive: true, force: true });
    delete manifest.files['system/scripts/migrations/001-example.mjs'];
  });
  try {
    assert.equal(upd(p.root, ['plan', TAG, '--source-dir', rel]).code, 0);
    const a = upd(p.root, ['apply-safe', TAG, '--json', '--no-commit']);
    assert.equal(a.code, 0, a.stdout + a.stderr);
    const applied = jsonOf(a);
    assert.equal(applied.safety_tag, null);
    assert.match(applied.notes.join(' '), /There is no restore point, because this folder is not saved with Git\./);
    const f = jsonOf(upd(p.root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.equal(f.ok, true);
    assert.equal(f.safety_tag, null);
  } finally {
    cleanup(p.parent, rel);
  }
});

test('no Git and an upgrade to run: apply-safe stops before it changes a single file', () => {
  const p = makeProject({ repo: false });
  cpSync(OLD, p.root, { recursive: true });
  write(join(p.root, 'system', 'manifest.json'), JSON.stringify(manifestFor(OLD, '0.1.0', 'v0.1.0')));
  const rel = makeRelease();
  try {
    assert.equal(upd(p.root, ['plan', TAG, '--source-dir', rel]).code, 0);
    const a = upd(p.root, ['apply-safe', TAG, '--json', '--no-commit']);
    assert.equal(a.code, 1);
    const out = jsonOf(a);
    assert.equal(out.ok, false);
    assert.equal(out.no_restore_point, true);
    assert.match(out.error, /could not save a restore point.*changed nothing.*\/health-check/);
    assert.equal(readRoot(p.root, 'system/hooks/session_start.mjs'), '// hook version 1\n');
    assert.equal(existsSync(join(p.root, 'system', 'blueprints', 'new-thing.md')), false);
    assert.equal(existsSync(join(p.root, 'state', 'local', 'update', TAG, 'applied.json')), false);
    const text = upd(p.root, ['apply-safe', TAG, '--no-commit']);
    assert.match(text.stdout, /^! I could not save a restore point/);
    assert.match(text.stdout, /There is no restore point, because this folder is not saved with Git\./);
  } finally {
    cleanup(p.parent, rel);
  }
});

test('an upgrade script that came with the install is recorded as done, never run, and never listed again', release(), () => {
  const { parent, root } = makeInstalled();
  // this install is the release that already had 001-example.mjs: the script is on disk and in its manifest
  const script = readFileSync(join(NEW, 'system', 'scripts', 'migrations', '001-example.mjs'));
  write(join(root, 'system', 'scripts', 'migrations', '001-example.mjs'), script);
  const manifestFile = join(root, 'system', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.files['system/scripts/migrations/001-example.mjs'] = { class: 'code', sha256: sha(script) };
  write(manifestFile, JSON.stringify(manifest));
  const rel = makeRelease();
  try {
    const plan = jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel]));
    assert.deepEqual(plan.migrations_pending, []);
    assert.deepEqual(plan.migrations_baseline, ['001-example.mjs']);
    assert.doesNotMatch(upd(root, ['plan', TAG, '--source-dir', rel]).stdout, /Upgrades to your notes and settings/);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const fin = jsonOf(upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.deepEqual(fin.migrations_run, []);
    assert.equal(existsSync(join(root, 'state', 'migration-001.txt')), false, 'the script was not run');
    const record = JSON.parse(readRoot(root, 'state/migrations.json'));
    assert.equal(record.applied.length, 1);
    assert.equal(record.applied[0].id, '001-example.mjs');
    assert.equal(record.applied[0].baseline, true);
    assert.equal(record.applied[0].tag, 'v0.1.0', 'the record says which release it came with');
  } finally {
    cleanup(parent, rel);
  }
});

test('a script that is in the install manifest but is not the file on disk is not taken for one that came with the install', release(), () => {
  const { parent, root } = makeInstalled();
  const script = readFileSync(join(NEW, 'system', 'scripts', 'migrations', '001-example.mjs'));
  write(join(root, 'system', 'scripts', 'migrations', '001-example.mjs'), 'process.exit(0);\n// somebody changed it\n');
  const manifestFile = join(root, 'system', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.files['system/scripts/migrations/001-example.mjs'] = { class: 'code', sha256: sha(script) };
  write(manifestFile, JSON.stringify(manifest));
  const rel = makeRelease();
  try {
    const plan = jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel]));
    assert.deepEqual(plan.migrations_pending.map((m) => m.id), ['001-example.mjs']);
    assert.deepEqual(plan.migrations_baseline, []);
  } finally {
    cleanup(parent, rel);
  }
});

test('usage errors exit with 2', () => {
  const { parent, root } = makeInstalled();
  try {
    assert.equal(upd(root, []).code, 2);
    assert.equal(upd(root, ['plan']).code, 2);
    assert.equal(upd(root, ['plan', '../evil']).code, 2);
    assert.equal(upd(root, ['dance', TAG]).code, 2);
    assert.equal(upd(root, ['check', TAG]).code, 2);
    assert.equal(upd(root, ['plan', TAG, '--bogus']).code, 2);
  } finally {
    cleanup(parent);
  }
});

test('decide(): the full rule table', () => {
  const S = (exists, eqNew, eqOld) => ({ exists, eqNew, eqOld });
  assert.equal(decide('code', 'a', 'b', S(true, false, true)).action, 'replace');
  assert.equal(decide('code', 'a', 'b', S(true, false, false)).action, 'replace');
  assert.equal(decide('code', 'a', 'b', S(true, true, false)).action, 'unchanged');
  assert.equal(decide('code', 'a', 'b', S(false, false, null)).action, 'add');
  assert.equal(decide('code', null, 'b', S(false, false, null)).action, 'add');
  assert.equal(decide('text', 'a', 'b', S(true, false, true)).action, 'replace');
  assert.equal(decide('text', 'a', 'b', S(true, false, false)).action, 'propose-merge');
  assert.equal(decide('text', 'a', 'a', S(true, false, false)).action, 'unchanged');
  assert.equal(decide('text', null, 'b', S(true, false, null)).action, 'propose-merge');
  assert.equal(decide('text', 'a', 'a', S(false, false, null)).action, 'unchanged', 'user removed it, upstream did not change it');
  assert.equal(decide('text', 'a', 'b', S(false, false, null)).action, 'add');
});

test('manifest helpers', () => {
  const asObject = normaliseManifest({ files: { 'a.md': { class: 'code', sha256: 'AB' }, 'b.md': { sha256: 'cd' } } });
  assert.equal(asObject.files.get('a.md').class, 'code');
  assert.equal(asObject.files.get('a.md').sha256, 'ab');
  assert.equal(asObject.files.get('b.md').class, 'text');
  const asArray = normaliseManifest({ files: [{ path: 'x/y.mjs', class: 'code', sha256: 'ff' }] });
  assert.equal(asArray.files.get('x/y.mjs').sha256, 'ff');
  assert.equal(normaliseManifest(null).files.size, 0);

  for (const ok of ['system/lib/a.mjs', '.claude/skills/ask/SKILL.md', '.claude/settings.json', 'README.md']) assert.equal(isSafeFrameworkPath(ok), true, ok);
  for (const bad of ['', '/etc/passwd', 'C:/x', 'a/../b', 'a\\b', 'vault/x.md', 'config/x.json', 'state/x', '.env', 'x/.env.local', '.mcp.json', 'system/manifest.json', '.claude/agents/my-agent.md']) {
    assert.equal(isSafeFrameworkPath(bad), false, bad);
  }

  const lf = Buffer.from('a\nb\n');
  assert.equal(contentMatchesSha(Buffer.from('a\r\nb\r\n'), 'x.md', sha(lf)), true, 'CRLF text counts as the same');
  assert.equal(contentMatchesSha(Buffer.from('a\r\nb\r\n'), 'x.png', sha(lf)), false, 'binary files are exact');
});

/* ---------------- code-safety hardening ---------------- */

test('isSafeFrameworkPath: case, Windows aliases and git internals are all refused', () => {
  const bad = [
    '.GIT/hooks/pre-commit', '.Git/config', 'Vault/Home.md', 'STATE/x', 'Config/brain.json', '.ENV', 'sub/.ENV.local',
    '.MCP.json', '.Claude/settings.local.json', 'system/core.md::$DATA', 'system/hooks/x.mjs.', 'system/hooks/x.mjs ',
    'GIT~1/config', 'SYSTEM~1/core.md', '.claude/skills/MY-x/SKILL.md', '.github/workflows/ci.yml', 'a/.gitmodules',
    'system/CON', 'system/nul.txt', 'system/com1.md', 'a:b', 'a*b', 'a?b', 'a|b', 'x/y\\z', 'a\u0001b',
  ];
  for (const p of bad) assert.equal(isSafeFrameworkPath(p), false, JSON.stringify(p));
  // .gitignore and .gitattributes are ordinary framework files; .env.example is the template.
  for (const ok of ['.gitignore', '.gitattributes', '.env.example', 'system/scripts/migrations/001-example.mjs']) assert.equal(isSafeFrameworkPath(ok), true, ok);
  assert.equal(isExcludedFromUpdates('.github/workflows/ci.yml'), true);
  assert.equal(isExcludedFromUpdates('system/core.md'), false);
});

test('isValidRepo accepts owner/name only', () => {
  for (const ok of ['joaoribasio/alterbrain', 'a-b/c.d_e']) assert.equal(isValidRepo(ok), true, ok);
  for (const bad of ['', '../x', 'a/..', 'a/b/c', 'a b/c', 'a/b?x=1', 'a/b;rm', '/x', 'x/', null]) assert.equal(isValidRepo(bad), false, String(bad));
});

test('another release folder or repo is refused unless the person switches it on', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    for (const args of [
      ['plan', TAG, '--json', '--source-dir', rel],
      ['check', '--json', '--source-dir', rel],
      ['plan', TAG, '--json', '--repo', 'someone-else/alterbrain'],
    ]) {
      const r = runScript('update.mjs', args, root, { ALTERBRAIN_ALLOW_CUSTOM_SOURCE: '' });
      assert.equal(r.code, 2, args.join(' ') + r.stdout);
      assert.match(r.stdout + r.stderr, /switched off|ALTERBRAIN_ALLOW_CUSTOM_SOURCE/);
    }
    assert.equal(existsSync(join(root, 'state', 'local', 'update', TAG)), false, 'nothing was staged');
    // The flag lets the developer through, but the repo must still look like owner/name.
    const bad = upd(root, ['plan', TAG, '--repo', '../../x']);
    assert.equal(bad.code, 2);
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
  } finally {
    cleanup(parent, rel);
  }
});

test('a code file in the plan is listed for review', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    const r = upd(root, ['plan', TAG, '--source-dir', rel]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Code files that run on your computer/);
    assert.match(r.stdout, /system\/hooks\/session_start\.mjs/);
    assert.match(r.stdout, /not signed/);
    const plan = jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel]));
    assert.ok(plan.code_changes.some((c) => c.path === 'system/hooks/session_start.mjs'));
    assert.equal(plan.signature, 'unsigned');
  } finally {
    cleanup(parent, rel);
  }
});

test('finish only runs migrations that the verified manifest lists', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    // Someone drops a script into the migrations folder: it is not in the manifest.
    write(join(root, 'system', 'scripts', 'migrations', '999-evil.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('state/evil.txt', 'ran');\n");
    // And a listed one is altered after apply: its checksum no longer matches.
    write(join(root, 'system', 'scripts', 'migrations', '001-example.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('state/evil2.txt', 'ran');\n");
    const out = jsonOf(upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.deepEqual(out.migrations_run, []);
    assert.deepEqual(out.migrations_skipped.sort(), ['001-example.mjs', '999-evil.mjs']);
    assert.equal(out.ok, false, 'a skipped upgrade is a problem');
    assert.equal(existsSync(join(root, 'state', 'evil.txt')), false);
    assert.equal(existsSync(join(root, 'state', 'evil2.txt')), false);
    // In plain words, and with a failing exit code.
    const text = upd(root, ['finish', TAG, '--no-commit', '--no-doctor']);
    assert.equal(text.code, 1);
    assert.match(text.stdout, /Skipped upgrade 999-evil\.mjs: it is not part of this release, so it was not run\./);
    assert.match(text.stdout, /Skipped upgrade 001-example\.mjs: it is not part of this release, so it was not run\./);
    assert.doesNotMatch(text.stdout, /Upgrades run:/);
  } finally {
    cleanup(parent, rel);
  }
});

test('a pinned signing key makes plan demand a valid signature on the manifest', release(), () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
  const { parent, root } = makeInstalled();
  const relFile = join(root, 'system', 'release.json');
  write(relFile, JSON.stringify({ ...JSON.parse(readFileSync(relFile, 'utf8')), signing_public_key: raw }));
  const rel = makeRelease();
  try {
    // unsigned
    let r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 1);
    assert.match(JSON.stringify(jsonOf(r).errors), /not signed/);
    // wrongly signed
    write(join(rel, 'system', 'manifest.sig'), cryptoSign(null, Buffer.from('something else'), privateKey).toString('base64'));
    r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 1);
    assert.match(JSON.stringify(jsonOf(r).errors), /does not match/);
    // properly signed
    const bytes = readFileSync(join(rel, 'system', 'manifest.json'));
    write(join(rel, 'system', 'manifest.sig'), cryptoSign(null, bytes, privateKey).toString('base64'));
    r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(jsonOf(r).signature, 'verified');
    assert.equal(manifestSignatureOk(bytes, cryptoSign(null, bytes, privateKey).toString('hex'), raw), true, 'hex signatures work too');
    assert.equal(manifestSignatureOk(Buffer.from('x'), cryptoSign(null, bytes, privateKey).toString('base64'), raw), false);
    assert.equal(manifestSignatureOk(bytes, 'AAAA', 'not a key'), false);
  } finally {
    cleanup(parent, rel);
  }
});

test('a download over the size limit is refused', () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    const r = upd(root, ['plan', TAG, '--json', '--source-dir', rel], { ALTERBRAIN_MAX_DOWNLOAD_BYTES: '20' });
    const out = jsonOf(r);
    assert.equal(out.ok, false);
    assert.match(JSON.stringify(out), /larger than the allowed/);
  } finally {
    cleanup(parent, rel);
  }
});

test('a release path that leads out of the project through a link is rejected', (t) => {
  const { parent, root } = makeInstalled();
  const outside = tmp('ab-outside-');
  rmSync(join(root, 'system', 'blueprints'), { recursive: true, force: true });
  try {
    symlinkSync(outside, join(root, 'system', 'blueprints'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    cleanup(parent, outside);
    t.skip('links cannot be created here');
    return;
  }
  const rel = makeRelease();
  try {
    const before = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(staysInsideProject('system/blueprints/new-thing.md'), false);
      assert.equal(staysInsideProject('system/lib/helper.mjs'), true);
    } finally {
      if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = before;
    }
    const r = upd(root, ['plan', TAG, '--json', '--source-dir', rel]);
    assert.equal(r.code, 1);
    assert.match(JSON.stringify(jsonOf(r).errors), /outside the project/);
  } finally {
    try {
      unlinkSync(join(root, 'system', 'blueprints')); // a junction or link: removes the link, not the target
    } catch {
      /* the target is a temp folder anyway */
    }
    cleanup(parent, rel, outside);
  }
});

/* ---------------- upgrades to notes and settings (migrations) ---------------- */

/** Put an upgrade script into the release folder and its manifest. */
function addMigration(dir, manifest, name, body) {
  const path = `system/scripts/migrations/${name}`;
  writeFileSync(join(dir, ...path.split('/')), body);
  manifest.files[path] = { class: 'code', sha256: sha(body) };
}

test('plan says in plain words which upgrades will run at the end', () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    // a second upgrade without the description line, and a file that is not an upgrade at all
    addMigration(dir, manifest, '002-plain.mjs', 'console.log("x");\n');
    const readme = 'Not an upgrade.\n';
    writeFileSync(join(dir, 'system', 'scripts', 'migrations', 'README.md'), readme);
    manifest.files['system/scripts/migrations/README.md'] = { class: 'text', sha256: sha(readme) };
  });
  try {
    const r = upd(root, ['plan', TAG, '--source-dir', rel]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`Upgrades to your notes and settings \\(run at the end\\):\\n {2}- ${MIGRATION_SUMMARY.replace(/\./g, '\\.')}\\n {2}- \\(no description\\)\\n`));
    assert.doesNotMatch(r.stdout, /Not an upgrade/);
    const plan = jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel]));
    assert.deepEqual(plan.migrations_pending.map((m) => m.id), ['001-example.mjs', '002-plain.mjs']);
    assert.equal(plan.migrations_pending[1].summary, '(no description)');
    // planning changes nothing, and the saved plan carries the same list
    assert.equal(existsSync(join(root, 'state', 'migrations.json')), false);
    assert.deepEqual(JSON.parse(readRoot(root, `state/local/update/${TAG}/plan.json`)).migrations_pending, plan.migrations_pending);
  } finally {
    cleanup(parent, rel);
  }
});

test('plan leaves out upgrades that are already recorded as done', () => {
  const { parent, root } = makeInstalled();
  write(join(root, 'state', 'migrations.json'), JSON.stringify({ schema: 1, applied: [{ id: '001-example.mjs', at: '2026-10-08T10:00:00.000Z', tag: 'v0.1.5' }] }));
  const rel = makeRelease();
  try {
    const r = upd(root, ['plan', TAG, '--source-dir', rel]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /Upgrades to your notes and settings/);
    assert.deepEqual(jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel])).migrations_pending, []);
  } finally {
    cleanup(parent, rel);
  }
});

test('finish tells the person, in plain words, what each upgrade did', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    addMigration(dir, manifest, '001-example.mjs', '// ab-migration: Prints two lines.\nconsole.log("First thing done.");\nconsole.log("Second thing done.");\n');
    addMigration(dir, manifest, '002-quiet.mjs', '// ab-migration: Says nothing.\n');
  });
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const f = upd(root, ['finish', TAG, '--no-commit', '--no-doctor']);
    assert.equal(f.code, 0, f.stdout + f.stderr);
    assert.match(f.stdout, /Upgrades run:\n {2}- 001-example\.mjs\n {6}First thing done\.\n {6}Second thing done\.\n {2}- 002-quiet\.mjs\n/);
    assert.deepEqual(JSON.parse(readRoot(root, 'state/migrations.json')).applied.map((a) => a.id), ['001-example.mjs', '002-quiet.mjs']);
    assert.deepEqual(JSON.parse(readRoot(root, `state/local/update/${TAG}/finished.json`)).migration_notes, {
      '001-example.mjs': 'First thing done.\nSecond thing done.',
      '002-quiet.mjs': '',
    });
  } finally {
    cleanup(parent, rel);
  }
});

test('a long note from an upgrade is cut to 2,000 characters', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => addMigration(dir, manifest, '001-example.mjs', '// ab-migration: Talks a lot.\nconsole.log("y".repeat(5000));\n'));
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const out = jsonOf(upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.equal(out.migration_notes['001-example.mjs'].length, 2000);
  } finally {
    cleanup(parent, rel);
  }
});

test('a failing upgrade is named, its own sentence is shown, and earlier upgrades stay recorded', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    addMigration(dir, manifest, '001-example.mjs', '// ab-migration: Works.\nconsole.log("Did the first part.");\n');
    addMigration(dir, manifest, '002-fails.mjs', '// ab-migration: Fails.\nconsole.error("Your settings file config/brain.json could not be read, so I changed nothing.");\nprocess.exit(1);\n');
  });
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const f = upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']);
    assert.equal(f.code, 1);
    const out = jsonOf(f);
    assert.equal(out.migration, '002-fails.mjs');
    assert.equal(out.error, 'The upgrade 002-fails.mjs stopped, so the update is not finished.');
    assert.equal(out.detail, 'Your settings file config/brain.json could not be read, so I changed nothing.');
    assert.deepEqual(out.migrations_run, ['001-example.mjs']);
    assert.deepEqual(out.migration_notes, { '001-example.mjs': 'Did the first part.' });
    assert.deepEqual(JSON.parse(readRoot(root, 'state/migrations.json')).applied.map((a) => a.id), ['001-example.mjs']);
    assert.equal(JSON.parse(readRoot(root, 'system/manifest.json')).version, '0.1.0', 'the update is not marked finished');

    // Run again: finish continues where it stopped (001 is not run twice) and stops at the same place.
    const again = jsonOf(upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.equal(again.migration, '002-fails.mjs');
    assert.deepEqual(again.migrations_run, []);
  } finally {
    cleanup(parent, rel);
  }
});

test('the text of a failing upgrade names it, shows its sentence, and lists what already ran', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease((dir, manifest) => {
    addMigration(dir, manifest, '001-example.mjs', '// ab-migration: Works.\nconsole.log("Did the first part.");\n');
    addMigration(dir, manifest, '002-fails.mjs', '// ab-migration: Fails.\nconsole.error("I could not save vault/20_areas/x.md (is it open in another program?). Close it and finish the update again.");\nprocess.exit(1);\n');
  });
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const text = upd(root, ['finish', TAG, '--no-commit', '--no-doctor']);
    assert.equal(text.code, 1);
    assert.match(text.stdout, /! The upgrade 002-fails\.mjs stopped, so the update is not finished\.\n {2}I could not save vault\/20_areas\/x\.md/);
    assert.match(text.stdout, /\n {2}Already done: 001-example\.mjs\n/);
  } finally {
    cleanup(parent, rel);
  }
});

test('migrationSummary reads the description from the first three lines only', async () => {
  const { migrationSummary } = await import('../../system/scripts/update.mjs');
  const dir = tmp('ab-mig-summary-');
  try {
    const f = (name, text) => {
      write(join(dir, name), text);
      return join(dir, name);
    };
    assert.equal(migrationSummary(f('a.mjs', '#!/usr/bin/env node\n// ab-migration: Does a thing.\ncode();\n')), 'Does a thing.');
    assert.equal(migrationSummary(f('b.mjs', '// ab-migration:   Spaces are trimmed.   \r\nmore\r\n')), 'Spaces are trimmed.');
    assert.equal(migrationSummary(f('c.mjs', 'one\ntwo\nthree\n// ab-migration: too late\n')), '(no description)');
    assert.equal(migrationSummary(f('d.mjs', '// ab-migration:\ncode();\n')), '(no description)');
    assert.equal(migrationSummary(join(dir, 'missing.mjs')), '(no description)');
  } finally {
    cleanup(dir);
  }
});

test('fallback: a record entry without "kind" is a script and one without "outcome" is done', release(), () => {
  const { parent, root } = makeInstalled();
  // the record as the 0.1.x updater wrote it: no kind, no outcome
  write(join(root, 'state', 'migrations.json'), JSON.stringify({ schema: 1, applied: [{ id: '001-example.mjs', at: '2026-01-01T00:00:00.000Z', tag: 'v0.1.0' }] }));
  const rel = makeRelease();
  try {
    const plan = jsonOf(upd(root, ['plan', TAG, '--json', '--source-dir', rel]));
    assert.deepEqual(plan.migrations_pending, [], 'the legacy entry counts as done');
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    const fin = jsonOf(upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']));
    assert.equal(fin.migrations_run.includes('001-example.mjs'), false, 'a legacy entry still counts as done');
    assert.equal(existsSync(join(root, 'state', 'migration-001.txt')), false);
    // a legacy entry on a guided id also reads as done
    const md = '0007-example-question.md';
    const body = '---\ntype: "guided-migration"\nid: "0007-example-question"\nsummary: "Asks an example question."\nsince: "0.2.0"\n---\n# Example\n';
    write(join(root, 'system', 'scripts', 'migrations', md), body);
    const manifestFile = join(root, 'system', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    manifest.files[`system/scripts/migrations/${md}`] = { class: 'code', sha256: sha(Buffer.from(body)) };
    write(manifestFile, JSON.stringify(manifest));
    const record = JSON.parse(readRoot(root, 'state/migrations.json'));
    record.applied.push({ id: md, at: '2026-01-02T00:00:00.000Z', tag: 'v0.1.0' });
    write(join(root, 'state', 'migrations.json'), JSON.stringify(record));
    const all = jsonOf(upd(root, ['guided', 'list', '--all', '--json']));
    assert.deepEqual(all.guided.map((g) => [g.id, g.status]), [[md, 'done']]);
    assert.equal(jsonOf(upd(root, ['guided', 'list', '--json'])).guided.length, 0);
  } finally {
    cleanup(parent, rel);
  }
});

test('guided: usage errors exit 2, an unknown or changed upgrade is refused with exit 1 and nothing is recorded', release(), () => {
  const { parent, root } = makeInstalled();
  try {
    for (const args of [['guided'], ['guided', 'done'], ['guided', 'skip', 'a', 'b'], ['guided', 'list', 'x'], ['guided', 'done', 'x.md', '--all'], ['guided', 'nope']]) {
      const r = upd(root, args);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, /Usage:/);
    }
    for (const id of ['0009-not-there.md', '../../etc/passwd', 'system/lib/paths.mjs', '0009-not-there']) {
      const r = upd(root, ['guided', 'done', id]);
      assert.equal(r.code, 1, id);
      assert.match(r.stderr, /is not an upgrade question that came with this release, so nothing was recorded\./);
    }
    assert.equal(existsSync(join(root, 'state', 'migrations.json')), false);
    const none = upd(root, ['guided', 'list']);
    assert.equal(none.code, 0);
    assert.match(none.stdout, /No upgrade questions are waiting\./);
  } finally {
    cleanup(parent);
  }
});

const GUIDED_BODY = '---\ntype: "guided-migration"\nid: "0007-example-question"\nsummary: "Asks an example question."\nsince: "0.2.0"\n---\n# Example\n';
const guidedOnlyRelease = () => makeRelease((dir, manifest) => {
  rmSync(join(dir, 'system', 'scripts', 'migrations'), { recursive: true, force: true });
  delete manifest.files['system/scripts/migrations/001-example.mjs'];
  mkdirSync(join(dir, 'system', 'scripts', 'migrations'), { recursive: true });
  addMigration(dir, manifest, '0007-example-question.md', GUIDED_BODY);
});

test('no Git and only an upgrade question in the release: apply-safe still stops before it changes a file', () => {
  const p = makeProject({ repo: false });
  cpSync(OLD, p.root, { recursive: true });
  write(join(p.root, 'system', 'manifest.json'), JSON.stringify(manifestFor(OLD, '0.1.0', 'v0.1.0')));
  const rel = guidedOnlyRelease();
  try {
    const plan = jsonOf(upd(p.root, ['plan', TAG, '--json', '--source-dir', rel]));
    assert.deepEqual(plan.migrations_pending, []);
    assert.equal(plan.guided_pending.length, 1);
    const a = upd(p.root, ['apply-safe', TAG, '--json', '--no-commit']);
    assert.equal(a.code, 1);
    const out = jsonOf(a);
    assert.equal(out.no_restore_point, true);
    assert.equal(out.guided_pending.length, 1);
    assert.equal(readRoot(p.root, 'system/hooks/session_start.mjs'), '// hook version 1\n');
    assert.equal(existsSync(join(p.root, 'system', 'scripts', 'migrations', '0007-example-question.md')), false);
  } finally {
    cleanup(p.parent, rel);
  }
});

test('finish refuses without the restore point when an upgrade question is waiting', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = guidedOnlyRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--no-commit']).code, 0);
    git(root, ['tag', '-d', `pre-update-${TAG}`]);
    const f = upd(root, ['finish', TAG, '--json', '--no-commit', '--no-doctor']);
    assert.equal(f.code, 1);
    const out = jsonOf(f);
    assert.equal(out.no_restore_point, true);
    assert.equal(out.guided_pending.length, 1);
    assert.equal(existsSync(join(root, 'state', 'local', 'update', TAG, 'finished.json')), false);
  } finally {
    cleanup(parent, rel);
  }
});

// A half-finished rebase stops the automatic save (git-auto commit exits 1).
const blockSave = (root) => mkdirSync(join(root, '.git', 'rebase-merge'), { recursive: true });

test('apply-safe refuses and changes nothing when unsaved work cannot be saved', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    write(join(root, 'vault', 'my-note.md'), 'unsaved work\n');
    blockSave(root);
    const a = upd(root, ['apply-safe', TAG, '--json']);
    assert.equal(a.code, 1, a.stdout + a.stderr);
    const out = jsonOf(a);
    assert.equal(out.ok, false);
    assert.equal(out.save_failed, true);
    assert.equal(out.safety_tag, null);
    assert.match(out.error, /could not be saved.*changed nothing.*\/health-check/);
    assert.equal(git(root, ['tag', '--list', `pre-update-${TAG}`]), '');
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 1\n');
    assert.equal(existsSync(join(root, 'system', 'blueprints', 'new-thing.md')), false);
    assert.equal(existsSync(join(root, 'state', 'local', 'update', TAG, 'applied.json')), false);
    const text = upd(root, ['apply-safe', TAG]);
    assert.equal(text.code, 1);
    assert.match(text.stdout, /^! Your latest work could not be saved/);
    assert.doesNotMatch(text.stdout, /restore point was saved/);
  } finally {
    cleanup(parent, rel);
  }
});

test('apply-safe goes on when the save is blocked but nothing is unsaved: the tag is the restore point', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    blockSave(root);
    const a = upd(root, ['apply-safe', TAG, '--json']);
    assert.equal(a.code, 0, a.stdout + a.stderr);
    assert.equal(jsonOf(a).safety_tag, `pre-update-${TAG}`);
    assert.equal(git(root, ['tag', '--list', `pre-update-${TAG}`]), `pre-update-${TAG}`);
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 2\n');
  } finally {
    cleanup(parent, rel);
  }
});

test('apply-safe refuses unsaved work when automatic saving is switched off, and says so', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    write(join(root, 'config', 'brain.json'), JSON.stringify({ git: { auto_commit: false } }));
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'config']);
    write(join(root, 'vault', 'my-note.md'), 'unsaved work\n');
    const a = upd(root, ['apply-safe', TAG, '--json']);
    assert.equal(a.code, 1, a.stdout + a.stderr);
    const out = jsonOf(a);
    assert.equal(out.ok, false);
    assert.equal(out.safety_tag, null);
    assert.match(out.error, /switched off in config\/brain\.json.*unsaved changes.*changed nothing/);
    assert.equal(git(root, ['tag', '--list', `pre-update-${TAG}`]), '');
    assert.equal(readRoot(root, 'system/hooks/session_start.mjs'), '// hook version 1\n');
    const text = upd(root, ['apply-safe', TAG]);
    assert.doesNotMatch(text.stdout, /restore point was saved/);
    // a clean folder with saving switched off still gets its tag
    unlinkSync(join(root, 'vault', 'my-note.md'));
    const ok = upd(root, ['apply-safe', TAG, '--json']);
    assert.equal(ok.code, 0, ok.stdout + ok.stderr);
    assert.equal(jsonOf(ok).safety_tag, `pre-update-${TAG}`);
  } finally {
    cleanup(parent, rel);
  }
});

test('finish reports a failed final save as a problem, with a task', release(), () => {
  const { parent, root } = makeInstalled();
  const rel = makeRelease();
  try {
    assert.equal(upd(root, ['plan', TAG, '--source-dir', rel]).code, 0);
    assert.equal(upd(root, ['apply-safe', TAG, '--json', '--no-commit']).code, 0);
    write(join(root, 'vault', 'my-note.md'), 'unsaved work\n');
    blockSave(root);
    const f = upd(root, ['finish', TAG, '--json', '--no-doctor']);
    assert.equal(f.code, 1, f.stdout + f.stderr);
    const out = jsonOf(f);
    assert.equal(out.ok, false);
    assert.equal(out.save_failed, true);
    assert.match(out.error, /final save failed.*\/health-check/);
    assert.match(readRoot(root, 'vault/00_inbox/Tasks.md'), /final save failed.*#ab\/git/);
    const text = upd(root, ['finish', TAG, '--no-doctor']);
    assert.match(text.stdout, /^! |\n! The update finished, but the final save failed/);
    assert.doesNotMatch(text.stdout, /Update v0\.2\.0 finished/);
  } finally {
    cleanup(parent, rel);
  }
});
