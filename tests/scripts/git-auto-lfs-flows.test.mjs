// Big files (ADR 0020), the flows that need more than one step: existing installs that keep their LFS files, private
// folders, and the real round trip through a local bare repository (upload, restore on a second computer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  OLD_ROOT_RULES, SKIP, blobAt, bytes, childEnv, cleanup, exists, git, gitTry, inHead, isPointer, lfsObjectPath,
  makeProject, newRootRules, read, readText, runAuto, sha256, tasksOf, write,
} from '../fixtures/scripts/lfs-helpers.mjs';
import { FAKE_GIT_CRYPT, runVk } from '../fixtures/scripts/vaultkey-helpers.mjs';
import { spawnSync } from 'node:child_process';
import { release } from '../fixtures/scripts/release.mjs';

const RULES = 'vault/.gitattributes';
const ruleLines = (root) => (exists(root, RULES) ? readText(root, RULES).split(/\r?\n/).filter((l) => l && !l.startsWith('#')) : []);
const taskLines = (root, needle) => tasksOf(root).split('\n').filter((l) => l.includes(needle));

/* ---------------- existing installs: files that were stored through the old root rules ---------------- */

test('self-healing: an LFS file keeps its rule after the root rules are gone, so the next save does not store it as a full copy', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject({ rules: 'old', lfs: 'full' });
  try {
    // 1. The old framework: every PDF and Word file in the vault goes through Git LFS, whatever its size.
    const reading = bytes(3000);
    const thesis = bytes(2000);
    write(root, 'vault/20_areas/courses/Reading list.pdf', reading);
    write(root, 'vault/10_projects/Ünï thesis.docx', thesis);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'old install']);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/20_areas/courses/Reading list.pdf')), true);
    const docxBlob = git(root, ['rev-parse', 'HEAD:vault/10_projects/Ünï thesis.docx']);

    // 2. An update replaces the root .gitattributes (no LFS rules any more). The PDF then changes, and a new small PDF appears.
    write(root, '.gitattributes', newRootRules());
    assert.equal(git(root, ['check-attr', 'filter', '--', 'vault/20_areas/courses/Reading list.pdf']).split(': ').pop(), 'unspecified');
    const reading2 = bytes(3500);
    write(root, 'vault/20_areas/courses/Reading list.pdf', reading2);
    const fresh = Buffer.concat([Buffer.from('%PDF-1.7\r\n'), bytes(400)]);
    write(root, 'vault/20_areas/courses/New handout.pdf', fresh);
    const r = runAuto(root, 'commit', { limit: 100_000 }); // far above every file here: only the healing can keep them in LFS
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');

    // 3. The changed PDF is a pointer again (not a full copy), the untouched Word file kept its pointer, the new small PDF is ordinary.
    const stored = blobAt(root, 'HEAD', 'vault/20_areas/courses/Reading list.pdf');
    assert.equal(isPointer(stored), true, 'the changed file is stored through Git LFS again');
    assert.match(stored.toString(), new RegExp(sha256(reading2)));
    assert.equal(git(root, ['rev-parse', 'HEAD:vault/10_projects/Ünï thesis.docx']), docxBlob, 'an untouched file is not rewritten');
    assert.deepEqual(blobAt(root, 'HEAD', 'vault/20_areas/courses/New handout.pdf'), fresh, 'a new small PDF is an ordinary file');
    assert.deepEqual(ruleLines(root).sort(), [
      '"/10_projects/Ünï thesis.docx" filter=lfs diff=lfs merge=lfs -text',
      '"/20_areas/courses/Reading list.pdf" filter=lfs diff=lfs merge=lfs -text',
    ]);
    assert.match(git(root, ['show', '--name-only', '--format=', 'HEAD']), /\.gitattributes/);
    assert.deepEqual(read(root, 'vault/20_areas/courses/Reading list.pdf'), reading2);
    assert.deepEqual(r.json.big.healed.sort(), ['vault/10_projects/Ünï thesis.docx', 'vault/20_areas/courses/Reading list.pdf']);

    // 4. A second save repeats nothing.
    assert.equal(runAuto(root, 'commit', { limit: 100_000 }).json.files, 0);
    assert.equal(ruleLines(root).length, 2);
    write(root, 'vault/10_projects/Ünï thesis.docx', bytes(2500));
    runAuto(root, 'commit', { limit: 100_000 });
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/10_projects/Ünï thesis.docx')), true);
    assert.equal(ruleLines(root).length, 2);
  } finally {
    cleanup(parent);
  }
});

test('self-healing leaves alone a file that is not stored through Git LFS today, and an install without LFS files', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    write(root, 'vault/Ideas.md', '# Ideas\n');
    write(root, 'vault/slides.pptx', bytes(2000));
    const r = runAuto(root, 'commit', { limit: 100_000 });
    assert.equal(r.json.status, 'ok');
    assert.deepEqual(r.json.big, { routed: [], healed: [], left_out: [] });
    assert.equal(exists(root, RULES), false);
  } finally {
    cleanup(parent);
  }
});

/* ---------------- private folders (git-crypt wins there, so a big file cannot use Git LFS) ---------------- */

test('a very large private file is kept on this computer with a task that names no file; other big files still go to Git LFS', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    const env = { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT };
    const setup = runVk(root, ['setup']);
    assert.equal(setup.code, 0, setup.stdout + setup.stderr);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'encryption on']);

    write(root, 'vault/60_people/Jamie Example - contacts export.csv', bytes(5000)); // private text file, big
    write(root, 'vault/60_people/Jamie Example - photo.mov', bytes(5000)); // not a text file: not encrypted, so Git LFS can take it
    write(root, 'vault/60_people/Jamie.md', '# Jamie\n'); // private and small: encrypted as usual
    write(root, 'vault/20_areas/market data.csv', bytes(5000)); // not private: Git LFS
    const r = runAuto(root, 'commit', { env });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.status, 'ok');

    assert.equal(inHead(root, 'vault/60_people/Jamie Example - contacts export.csv'), false, 'the big private file was not saved');
    assert.match(git(root, ['ls-files', '--others', '--exclude-standard']), /vault\/60_people\/Jamie Example - contacts export\.csv/, 'it is still on disk, untracked');
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/60_people/Jamie Example - photo.mov')), true);
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/20_areas/market data.csv')), true);
    assert.equal(inHead(root, 'vault/60_people/Jamie.md'), true);
    assert.equal(blobAt(root, 'HEAD', 'vault/60_people/Jamie.md').subarray(0, 10).toString('latin1'), '\0GITCRYPT\0', 'the small private note is encrypted');
    assert.doesNotMatch(readText(root, RULES), /contacts export/, 'no LFS rule for the private file');

    const lines = taskLines(root, 'very large private file');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /kept only on this computer/);
    assert.doesNotMatch(tasksOf(root), /contacts export|Jamie/, 'no file name reaches the task list');
    runAuto(root, 'commit', { env });
    assert.equal(taskLines(root, 'very large private file').length, 1, 'one task');
  } finally {
    cleanup(parent);
  }
});

/* ---------------- the round trip through a bare repository ---------------- */

test('push uploads the Git LFS files first, even when the folder has no LFS hook; a second computer gets the file back', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ remote: true });
  try {
    const mov = bytes(6000);
    write(root, 'vault/40_sources/raw/lecture.mov', mov);
    write(root, 'vault/Ideas.md', '# Ideas\n');
    assert.equal(runAuto(root, 'commit').json.status, 'ok');
    // Git LFS adds its own upload hook the first time it is used. Take it away: another tool's hook may stand in its place.
    rmSync(join(root, '.git', 'hooks', 'pre-push'), { force: true });
    assert.equal(existsSync(join(root, '.git', 'hooks', 'pre-push')), false);

    const push = runAuto(root, 'push');
    assert.equal(push.code, 0, push.stdout + push.stderr);
    assert.equal(push.json.status, 'ok');
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))), 'the big file itself reached the online copy');
    assert.equal(isPointer(blobAt(bare, 'main', 'vault/40_sources/raw/lecture.mov')), true, 'the online history holds the pointer');
    assert.equal(runAuto(root, 'push').json.status, 'ok', 'a second push has nothing to send');

    // The second computer: clone, switch Git LFS on, fetch the files.
    const other = join(parent, 'other');
    const env = childEnv(parent);
    const clone = spawnSync('git', ['clone', '-q', bare, other], { encoding: 'utf8', env, windowsHide: true });
    assert.equal(clone.status, 0, clone.stderr);
    git(other, ['lfs', 'install', '--local', '--skip-repo']);
    git(other, ['lfs', 'pull']);
    assert.deepEqual(read(other, 'vault/40_sources/raw/lecture.mov'), mov, 'restored byte for byte');
    assert.equal(readText(other, 'vault/Ideas.md'), '# Ideas\n');
  } finally {
    cleanup(parent);
  }
});

test('joining the online copy saves a new big file first (as a pointer) and does not upload it twice', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ remote: true });
  try {
    // The other computer adds a note.
    const other = join(parent, 'other');
    const env = childEnv(parent);
    assert.equal(spawnSync('git', ['clone', '-q', bare, other], { encoding: 'utf8', env, windowsHide: true }).status, 0);
    git(other, ['config', 'user.name', 'Alex Doe']);
    git(other, ['config', 'user.email', 'alex@example.invalid']);
    write(other, 'vault/from-other.md', 'hello\n');
    git(other, ['add', '-A']);
    git(other, ['commit', '-q', '-m', 'other']);
    git(other, ['push', '-q']);

    // This computer has a big file waiting, then pulls.
    const mov = bytes(7000);
    write(root, 'vault/40_sources/raw/slides-recording.mov', mov);
    const pull = runAuto(root, 'pull');
    assert.equal(pull.code, 0, pull.stdout + pull.stderr);
    assert.equal(pull.json.status, 'ok');
    assert.ok(existsSync(join(root, 'vault', 'from-other.md')));
    assert.equal(isPointer(blobAt(root, 'HEAD', 'vault/40_sources/raw/slides-recording.mov')), true);
    assert.deepEqual(read(root, 'vault/40_sources/raw/slides-recording.mov'), mov);
    assert.equal(git(root, ['stash', 'list']), '');
    const push = runAuto(root, 'push');
    assert.equal(push.code, 0, push.stdout + push.stderr);
    assert.ok(existsSync(lfsObjectPath(join(bare, 'lfs'), sha256(mov))));
  } finally {
    cleanup(parent);
  }
});

test('an upload that fails is reported as a failed push and nothing is forced', release({ skip: SKIP }), () => {
  const { parent, root } = makeProject();
  try {
    git(root, ['remote', 'add', 'origin', 'http://127.0.0.1:9/nothing.git']); // nobody listens here
    write(root, 'vault/40_sources/raw/clip.mov', bytes(6000));
    assert.equal(runAuto(root, 'commit').json.status, 'ok');
    const push = runAuto(root, 'push');
    assert.equal(push.code, 1);
    assert.equal(push.json.status, 'failed');
    assert.equal(push.json.kind, 'network', 'being offline is not a reason to nag with a task');
    assert.doesNotMatch(tasksOf(root), /back up your work/);
  } finally {
    cleanup(parent);
  }
});

test('two computers that each add big-file rules join without a conflict (the rules file is merged as a union)', release({ skip: SKIP }), () => {
  const { parent, root, bare } = makeProject({ rules: 'old', lfs: 'full', remote: true });
  try {
    const a = bytes(3000);
    const b = bytes(2500);
    write(root, 'vault/20_areas/a.pdf', a);
    write(root, 'vault/20_areas/b.pdf', b);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'old install']);
    git(root, ['push', '-q']);

    // The second computer has the same files (it has Git LFS switched on, as an old install does).
    const other = join(parent, 'other');
    mkdirSync(other, { recursive: true });
    git(other, ['init', '-q', '-b', 'main']);
    git(other, ['config', 'user.name', 'Alex Doe']);
    git(other, ['config', 'user.email', 'alex@example.invalid']);
    git(other, ['config', 'commit.gpgsign', 'false']);
    git(other, ['lfs', 'install', '--local']);
    git(other, ['remote', 'add', 'origin', bare]);
    git(other, ['pull', '-q', 'origin', 'main']);
    git(other, ['branch', '--set-upstream-to=origin/main', 'main']);
    assert.deepEqual(read(other, 'vault/20_areas/a.pdf'), a, 'the second computer has the real file, not a pointer');

    // Both computers get the update (no LFS rules in the root file) and each adds a different big file.
    for (const dir of [root, other]) write(dir, '.gitattributes', newRootRules());
    write(root, 'vault/40_sources/x.mov', bytes(5000));
    write(other, 'vault/40_sources/y.mov', bytes(5200));
    assert.equal(runAuto(root, 'commit').json.status, 'ok');
    assert.equal(runAuto(root, 'push').code, 0);
    assert.equal(runAuto(other, 'commit').json.status, 'ok');

    const pull = runAuto(other, 'pull');
    assert.equal(pull.code, 0, pull.stdout + pull.stderr);
    assert.equal(pull.json.status, 'ok');
    assert.doesNotMatch(tasksOf(other), /could not be joined safely/);
    const rules = readText(other, RULES);
    for (const name of ['a.pdf', 'b.pdf', 'x.mov', 'y.mov']) assert.match(rules, new RegExp(`/${name.replace('.', '\.')} filter=lfs`), name);
    assert.doesNotMatch(rules, /<<<<<<<|>>>>>>>/);
    for (const p of ['vault/20_areas/a.pdf', 'vault/20_areas/b.pdf', 'vault/40_sources/x.mov', 'vault/40_sources/y.mov']) {
      assert.equal(isPointer(blobAt(other, 'HEAD', p)), true, p);
    }
    assert.equal(runAuto(other, 'push').code, 0);
  } finally {
    cleanup(parent);
  }
});
