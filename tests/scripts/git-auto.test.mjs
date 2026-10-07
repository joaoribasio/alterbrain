import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import {
  makeProject, makeBareRemote, cloneOther, runScript, runScriptAsync, git, gitTry,
  write, readText, cleanup, join,
} from '../fixtures/ops/helpers.mjs';

const tasksOf = (root) => readText(join(root, 'vault', '00_inbox', 'Tasks.md'));
const logOf = (root) => readText(join(root, 'state', 'local', 'git.log'));
const json = (r) => JSON.parse(r.stdout.trim());

test('usage errors exit with 2', () => {
  const { parent, root } = makeProject();
  try {
    assert.equal(runScript('git-auto.mjs', [], root).code, 2);
    assert.equal(runScript('git-auto.mjs', ['explode'], root).code, 2);
  } finally {
    cleanup(parent);
  }
});

test('commit saves changes with the agreed message', () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, 'vault', 'a.md'), 'one\n');
    write(join(root, 'vault', 'b.md'), 'two\n');
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 0, r.stderr);
    const out = json(r);
    assert.equal(out.status, 'ok');
    assert.equal(out.files, 2);
    const msg = git(root, ['log', '-1', '--format=%s']);
    assert.match(msg, /^auto: \d{4}-\d{2}-\d{2} \d{2}:\d{2} · 2 files$/);
    assert.equal(git(root, ['status', '--porcelain']), '');
  } finally {
    cleanup(parent);
  }
});

test('commit with nothing new does nothing', () => {
  const { parent, root } = makeProject();
  try {
    const before = git(root, ['rev-parse', 'HEAD']);
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 0);
    assert.equal(json(r).files, 0);
    assert.equal(git(root, ['rev-parse', 'HEAD']), before);
  } finally {
    cleanup(parent);
  }
});

test('commit still works when git has no name or email set', () => {
  const { parent, root } = makeProject();
  try {
    git(root, ['config', '--unset', 'user.name']);
    git(root, ['config', '--unset', 'user.email']);
    write(join(root, 'vault', 'a.md'), 'one\n');
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(git(root, ['log', '-1', '--format=%an']), 'Alterbrain');
  } finally {
    cleanup(parent);
  }
});

test('skips in dev mode', () => {
  const { parent, root } = makeProject({ dev: true });
  try {
    write(join(root, 'vault', 'a.md'), 'one\n');
    const before = git(root, ['rev-parse', 'HEAD']);
    for (const cmd of ['commit', 'pull', 'push']) {
      const r = runScript('git-auto.mjs', [cmd, '--json'], root);
      assert.equal(r.code, 0);
      assert.equal(json(r).status, 'skipped');
    }
    assert.equal(git(root, ['rev-parse', 'HEAD']), before);
  } finally {
    cleanup(parent);
  }
});

test('skips when git.auto_commit is false, and push skips when auto_push is false', () => {
  const off = makeProject({ brain: { git: { auto_commit: false, auto_push: true } } });
  const noPush = makeProject({ brain: { git: { auto_commit: true, auto_push: false } } });
  try {
    write(join(off.root, 'vault', 'a.md'), 'one\n');
    assert.equal(json(runScript('git-auto.mjs', ['commit', '--json'], off.root)).status, 'skipped');
    assert.equal(git(off.root, ['status', '--porcelain']).length > 0, true);
    assert.equal(json(runScript('git-auto.mjs', ['push', '--json'], noPush.root)).status, 'skipped');
    assert.equal(json(runScript('git-auto.mjs', ['commit', '--json'], noPush.root)).status, 'ok');
  } finally {
    cleanup(off.parent, noPush.parent);
  }
});

test('a folder without git is skipped politely', () => {
  const { parent, root } = makeProject({ repo: false });
  try {
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 0);
    assert.equal(json(r).status, 'skipped');
  } finally {
    cleanup(parent);
  }
});

test('push and pull work against a local remote', () => {
  const { parent, root } = makeProject();
  try {
    const bare = makeBareRemote(parent);
    git(root, ['remote', 'add', 'origin', bare]);

    // nothing online yet: pull is a polite no-op
    assert.equal(json(runScript('git-auto.mjs', ['pull', '--json'], root)).status, 'skipped');

    write(join(root, 'vault', 'a.md'), 'one\n');
    assert.equal(runScript('git-auto.mjs', ['commit'], root).code, 0);
    const push = runScript('git-auto.mjs', ['push', '--json'], root);
    assert.equal(push.code, 0, push.stdout + push.stderr);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));

    // the other computer adds a note and pushes
    const other = cloneOther(parent, bare);
    write(join(other, 'vault', 'from-other.md'), 'hello\n');
    git(other, ['add', '-A']);
    git(other, ['commit', '-m', 'other']);
    git(other, ['push']);

    // our computer has an uncommitted change AND pulls: it is saved as a commit first (no stash is ever used)
    write(join(root, 'vault', 'local-wip.md'), 'wip\n');
    const pull = runScript('git-auto.mjs', ['pull', '--json'], root);
    assert.equal(pull.code, 0, pull.stdout + pull.stderr);
    assert.ok(existsSync(join(root, 'vault', 'from-other.md')));
    assert.ok(existsSync(join(root, 'vault', 'local-wip.md')));

    const st = json(runScript('git-auto.mjs', ['status', '--json'], root));
    assert.equal(st.info.repo, true);
    assert.equal(st.info.branch, 'main');
    assert.equal(st.info.changed_files, 0, 'the change was saved before joining the online copy');
    assert.equal(git(root, ['stash', 'list']), '');
    assert.match(git(root, ['log', '-3', '--format=%s']), /auto: .* · 1 files/);
  } finally {
    cleanup(parent);
  }
});

test('a rebase conflict is never forced: work stays intact, a task and a log line appear', () => {
  const { parent, root } = makeProject();
  try {
    const bare = makeBareRemote(parent);
    write(join(root, 'vault', 'shared.md'), 'line one\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'shared']);
    git(root, ['remote', 'add', 'origin', bare]);
    git(root, ['push', '--set-upstream', 'origin', 'main']);

    const other = cloneOther(parent, bare);
    write(join(other, 'vault', 'shared.md'), 'line one from the other computer\n');
    git(other, ['add', '-A']);
    git(other, ['commit', '-m', 'other edit']);
    git(other, ['push']);
    const remoteHead = git(bare, ['rev-parse', 'main']);

    // our computer edits the same line
    write(join(root, 'vault', 'shared.md'), 'line one from this computer\n');
    assert.equal(runScript('git-auto.mjs', ['commit'], root).code, 0);
    const localHead = git(root, ['rev-parse', 'HEAD']);

    const pull = runScript('git-auto.mjs', ['pull', '--json'], root);
    assert.equal(pull.code, 1);
    assert.equal(json(pull).kind, 'conflict');
    assert.equal(git(root, ['rev-parse', 'HEAD']), localHead, 'local commit untouched');
    assert.equal(existsSync(join(root, '.git', 'rebase-merge')), false, 'no half-finished rebase');
    assert.equal(existsSync(join(root, '.git', 'rebase-apply')), false);
    assert.equal(readText(join(root, 'vault', 'shared.md')), 'line one from this computer\n');
    assert.doesNotMatch(readText(join(root, 'vault', 'shared.md')), /<<<<<<<|>>>>>>>/);

    // pushing must not overwrite the online copy either
    const push = runScript('git-auto.mjs', ['push', '--json'], root);
    assert.equal(push.code, 1);
    assert.equal(git(bare, ['rev-parse', 'main']), remoteHead, 'remote untouched, no force');
    // (the task file that the failed pull wrote may have been saved as a commit on top: the local work is still there)
    assert.equal(gitTry(root, ['merge-base', '--is-ancestor', localHead, 'HEAD']).ok, true, 'the local commit is still in the history');
    assert.equal(readText(join(root, 'vault', 'shared.md')), 'line one from this computer\n');

    const tasks = tasksOf(root);
    assert.match(tasks, /#ab\/git/);
    assert.match(tasks, /could not be joined safely/);
    assert.equal((tasks.match(/#ab\/git/g) || []).length, 1, 'the same task is not added twice');
    assert.match(logOf(root), /pull conflict/);
  } finally {
    cleanup(parent);
  }
});

test('index.lock: gives up after retries without deleting the lock, then reports', () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, 'vault', 'a.md'), 'one\n');
    write(join(root, '.git', 'index.lock'), '');
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 1);
    assert.equal(json(r).kind, 'lock');
    assert.ok(existsSync(join(root, '.git', 'index.lock')), 'someone else may own the lock: never delete it');
    assert.match(tasksOf(root), /#ab\/git/);
    assert.match(logOf(root), /commit lock/);
  } finally {
    cleanup(parent);
  }
});

test('index.lock that clears during the retries lets the commit through', async () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, 'vault', 'a.md'), 'one\n');
    const lock = join(root, '.git', 'index.lock');
    write(lock, '');
    const running = runScriptAsync('git-auto.mjs', ['commit', '--json'], root, { ALTERBRAIN_GIT_RETRY_MS: '700' });
    setTimeout(() => {
      try {
        gitTry(root, ['--version']);
        import('node:fs').then((fs) => fs.rmSync(lock, { force: true }));
      } catch {
        /* ignore */
      }
    }, 900);
    const r = await running;
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout.trim()).files >= 1, true);
  } finally {
    cleanup(parent);
  }
});

test('being offline is logged but does not nag with a task', () => {
  const { parent, root } = makeProject();
  try {
    git(root, ['remote', 'add', 'origin', 'http://127.0.0.1:9/nothing.git']);
    const r = runScript('git-auto.mjs', ['pull', '--json'], root);
    assert.equal(r.code, 1);
    assert.equal(json(r).kind, 'network');
    assert.equal(existsSync(join(root, 'vault', '00_inbox', 'Tasks.md')), false);
    assert.match(logOf(root), /pull network/);
  } finally {
    cleanup(parent);
  }
});

test('a half-finished merge stops everything and says so', () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, '.git', 'MERGE_HEAD'), git(root, ['rev-parse', 'HEAD']) + '\n');
    write(join(root, 'vault', 'a.md'), 'one\n');
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 1);
    assert.match(tasksOf(root), /#ab\/git/);
  } finally {
    cleanup(parent);
  }
});

/* ---------------- code-safety hardening ---------------- */

test('F07: a pull over uncommitted edits never leaves conflict markers in a note, and nothing is stashed', () => {
  const { parent, root } = makeProject();
  try {
    const bare = makeBareRemote(parent);
    write(join(root, 'vault', 'shared.md'), 'line one\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'shared']);
    git(root, ['remote', 'add', 'origin', bare]);
    git(root, ['push', '--set-upstream', 'origin', 'main']);

    const other = cloneOther(parent, bare);
    write(join(other, 'vault', 'shared.md'), 'line one from the other computer\n');
    git(other, ['add', '-A']);
    git(other, ['commit', '-m', 'other edit']);
    git(other, ['push']);

    // Obsidian edited the same line while Claude was closed: an UNCOMMITTED change, which "pull --autostash" would stash.
    write(join(root, 'vault', 'shared.md'), 'line one from Obsidian on this computer\n');
    const pull = runScript('git-auto.mjs', ['pull', '--json'], root);
    assert.equal(pull.code, 1, pull.stdout + pull.stderr);
    assert.equal(json(pull).kind, 'conflict');
    const note = readText(join(root, 'vault', 'shared.md'));
    assert.equal(note, 'line one from Obsidian on this computer\n');
    assert.doesNotMatch(note, /<<<<<<<|=======|>>>>>>>/);
    assert.equal(git(root, ['diff', '--name-only', '--diff-filter=U']), '', 'no half-merged files');
    assert.equal(git(root, ['stash', 'list']), '', 'the stash stays empty');
    assert.equal(existsSync(join(root, '.git', 'rebase-merge')), false);
    assert.match(tasksOf(root), /#ab\/git/);
    // The edit is safe in the history, not only on disk.
    assert.match(git(root, ['log', '-1', '--format=%s']), /^auto: /);
    assert.match(git(root, ['show', 'HEAD:vault/shared.md']), /from Obsidian/);
  } finally {
    cleanup(parent);
  }
});

test('F07: commit refuses while a file is half-merged, even without a merge in progress', () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, 'vault', 'a.md'), 'base\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'a']);
    git(root, ['checkout', '-b', 'side']);
    write(join(root, 'vault', 'a.md'), 'side\n');
    git(root, ['commit', '-am', 'side']);
    git(root, ['checkout', 'main']);
    write(join(root, 'vault', 'a.md'), 'main\n');
    git(root, ['commit', '-am', 'main']);
    assert.equal(gitTry(root, ['merge', 'side']).ok, false, 'the merge conflicts');
    // Pretend the merge state was cleared by hand but the file is still unmerged and full of markers.
    rmSync(join(root, '.git', 'MERGE_HEAD'), { force: true });
    assert.match(git(root, ['diff', '--name-only', '--diff-filter=U']), /a\.md/);
    const before = git(root, ['rev-parse', 'HEAD']);
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 1, r.stdout);
    assert.equal(json(r).kind, 'conflict');
    assert.equal(git(root, ['rev-parse', 'HEAD']), before, 'nothing was committed');
    assert.match(readText(join(root, 'vault', 'a.md')), /<<<<<<</, 'the markers are still only in the working file');
  } finally {
    cleanup(parent);
  }
});

test('F08: a folder that still points at the public repo never pulls from it or pushes to it', () => {
  const { parent, root } = makeProject();
  try {
    write(join(root, 'system', 'release.json'), JSON.stringify({ repo: 'joaoribasio/alterbrain' }));
    git(root, ['remote', 'add', 'origin', 'https://github.com/JoaoRibasIO/Alterbrain.git']);
    write(join(root, 'vault', 'a.md'), 'my notes\n');
    for (const cmd of ['pull', 'push']) {
      const r = runScript('git-auto.mjs', [cmd, '--json'], root);
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.equal(json(r).status, 'skipped', cmd);
      assert.match(json(r).message, /public Alterbrain/, cmd);
    }
    // Saving on this computer still works.
    assert.equal(json(runScript('git-auto.mjs', ['commit', '--json'], root)).files, 2); // the note and release.json
    // The address that setup-github recorded counts too, whatever its spelling.
    git(root, ['remote', 'set-url', 'origin', 'git@github.com:someone/fork.git']);
    write(join(root, 'state', 'release-origin.json'), JSON.stringify({ schema: 1, repo: 'someone/fork', url: 'git@github.com:someone/fork.git' }));
    assert.equal(json(runScript('git-auto.mjs', ['push', '--json'], root)).status, 'skipped');
    const st = json(runScript('git-auto.mjs', ['status', '--json'], root));
    assert.equal(st.info.origin_is_framework, true);
    assert.match(st.message, /public Alterbrain/);
    // Your own private repo is left alone.
    git(root, ['remote', 'set-url', 'origin', 'https://github.com/alex/my-alterbrain.git']);
    assert.equal(json(runScript('git-auto.mjs', ['status', '--json'], root)).info.origin_is_framework, false);
  } finally {
    cleanup(parent);
  }
});

test('F17: a settings file with a byte order mark is still read, and a broken one pauses the online backup', () => {
  const { parent, root } = makeProject();
  try {
    const bare = makeBareRemote(parent);
    git(root, ['remote', 'add', 'origin', bare]);
    write(join(root, 'vault', 'a.md'), 'one\n');
    assert.equal(runScript('git-auto.mjs', ['commit'], root).code, 0);

    // BOM + auto_push:false must still switch the push off.
    write(join(root, 'config', 'brain.json'), '﻿' + JSON.stringify({ git: { auto_push: false } }));
    const off = runScript('git-auto.mjs', ['push', '--json'], root);
    assert.equal(json(off).status, 'skipped');
    assert.match(json(off).message, /switched off/);
    assert.equal(gitTry(bare, ['rev-parse', 'main']).ok, false, 'nothing reached the online copy');

    // A file that cannot be read at all must not turn the backup back on.
    write(join(root, 'config', 'brain.json'), '{ "git": { "auto_push": false ');
    const broken = runScript('git-auto.mjs', ['push', '--json'], root);
    assert.equal(json(broken).status, 'skipped');
    assert.match(json(broken).message, /could not be read/);
    assert.equal(gitTry(bare, ['rev-parse', 'main']).ok, false);
    assert.match(tasksOf(root), /config\/brain\.json could not be read/);
    // Saving on this computer is not affected.
    write(join(root, 'vault', 'b.md'), 'two\n');
    assert.equal(json(runScript('git-auto.mjs', ['commit', '--json'], root)).status, 'ok');

    // Fixed again: the backup works.
    write(join(root, 'config', 'brain.json'), JSON.stringify({ git: { auto_push: true } }));
    assert.equal(runScript('git-auto.mjs', ['push'], root).code, 0);
    assert.equal(git(bare, ['rev-parse', 'main']), git(root, ['rev-parse', 'HEAD']));
  } finally {
    cleanup(parent);
  }
});

test('F15: a note that holds a key is left out of the save, the others are saved, and a task says which', () => {
  const { parent, root } = makeProject();
  try {
    const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
    write(join(root, 'vault', 'good.md'), 'just notes\n');
    write(join(root, 'vault', 'oops.md'), `my notes\n${pem}\nabc\n`);
    const r = runScript('git-auto.mjs', ['commit', '--json'], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = json(r);
    assert.equal(out.status, 'ok');
    assert.equal(out.held.length, 1);
    assert.equal(out.held[0].file, 'vault/oops.md');
    assert.match(out.message, /left out/);
    const files = git(root, ['show', '--name-only', '--format=', 'HEAD']);
    assert.match(files, /vault\/good\.md/);
    assert.doesNotMatch(files, /oops/);
    assert.match(git(root, ['status', '--porcelain']), /\?\? vault\/oops\.md/, 'the note is still there, only not saved');
    assert.match(tasksOf(root), /left "vault\/oops\.md" out of your backup/);
    assert.doesNotMatch(tasksOf(root), /PRIVATE/);
    // Once the key is out of the note it is saved with the next save.
    write(join(root, 'vault', 'oops.md'), 'my notes\n');
    assert.match(json(runScript('git-auto.mjs', ['commit', '--json'], root)).message, /Saved \d+ changed files/);
    assert.match(git(root, ['show', '--name-only', '--format=', 'HEAD']), /vault\/oops\.md/);
    // Framework folders are not scanned: they come from a checked release.
    write(join(root, 'system', 'doc.md'), `${pem}\nexample in the docs\n`);
    assert.equal(json(runScript('git-auto.mjs', ['commit', '--json'], root)).files, 1);
  } finally {
    cleanup(parent);
  }
});
