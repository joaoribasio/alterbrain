// system/lib/vaultkey.mjs: the checks on stored files that decide whether an upload is safe (merge commits and large files).
// Real git in throw-away folders under state/local/tmp/vaultkey/. Synthetic data only. No git-crypt is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOB_READ_LIMITS, GITCRYPT_HEADER, auditCommits, auditIndex, auditStaged, auditUnpushed, hasGitCryptHeader, readBlobs,
} from '../../system/lib/vaultkey.mjs';
import { cleanup, git, gitTry, makeVaultProject, write } from '../fixtures/scripts/vaultkey-helpers.mjs';

const encryptedBytes = (text = 'secret') => Buffer.concat([GITCRYPT_HEADER, Buffer.alloc(12, 7), Buffer.from(text)]);
/** Write raw bytes into a project file (the shared helper writes text). */
function putBytes(root, rel, bytes) {
  const file = join(root, ...rel.split('/'));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, bytes);
}
const parentsOf = (root, rev) => git(root, ['rev-list', '--parents', '-n', '1', rev]).split(' ').length - 1;

/* ------------------------------ merge commits ------------------------------ */

test('a merge commit is checked for what the merge itself wrote, not for what the other side brought in', () => {
  const { parent, root } = makeVaultProject();
  try {
    git(root, ['checkout', '-q', '-b', 'other']);
    write(root, 'vault/60_people/Phone.md', 'Saved on a phone, stored as plain text\n'); // plain, and already online in this story
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'phone']);
    const phoneCommit = git(root, ['rev-parse', 'HEAD']);
    git(root, ['checkout', '-q', 'main']);
    write(root, 'vault/00_inbox/local.md', 'an ordinary note\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'local']);
    git(root, ['merge', '-q', '--no-edit', 'other']);
    const clean = git(root, ['rev-parse', 'HEAD']);
    assert.equal(parentsOf(root, clean), 2, 'a merge commit');

    // Only the merge commit: it wrote no private file of its own
    assert.deepEqual(auditCommits(root, [clean]), { plain: [], checked: 0, error: null });
    // With the commit that brought the plain note, the note is found, once
    assert.deepEqual(auditCommits(root, [phoneCommit, clean]).plain, ['vault/60_people/Phone.md']);

    // A merge that settles a conflict by hand writes a file of its own, and that file is checked
    git(root, ['checkout', '-q', '-b', 'second', 'main~1']);
    write(root, 'vault/00_inbox/second.md', 'ordinary\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'second']);
    git(root, ['merge', '-q', '--no-commit', '--no-ff', 'main']);
    write(root, 'vault/70_journal/typed-in-the-merge.md', 'plain, typed while settling the merge\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'merge by hand']);
    const byHand = git(root, ['rev-parse', 'HEAD']);
    assert.equal(parentsOf(root, byHand), 2);
    assert.deepEqual(auditCommits(root, [byHand]).plain, ['vault/70_journal/typed-in-the-merge.md']);

    // The same file stored encrypted is fine
    putBytes(root, 'vault/70_journal/typed-in-the-merge.md', encryptedBytes('journal'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--amend', '--no-edit']); // still a merge commit
    assert.equal(parentsOf(root, 'HEAD'), 2);
    assert.deepEqual(auditCommits(root, [git(root, ['rev-parse', 'HEAD'])]), { plain: [], checked: 1, error: null });
  } finally {
    cleanup(parent);
  }
});

test('a merge that takes one side of a file the other side changed adds nothing new to check', () => {
  const { parent, root } = makeVaultProject();
  try {
    putBytes(root, 'vault/60_people/Sam.md', encryptedBytes('one'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'start']);
    git(root, ['checkout', '-q', '-b', 'other']);
    putBytes(root, 'vault/60_people/Sam.md', encryptedBytes('theirs'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'theirs']);
    git(root, ['checkout', '-q', 'main']);
    putBytes(root, 'vault/60_people/Sam.md', encryptedBytes('mine'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'mine']);
    // The two stored versions cannot be merged line by line; the person keeps one of them
    assert.equal(gitTry(root, ['merge', '--no-commit', '--no-ff', 'other']).ok, false, 'a conflict');
    git(root, ['checkout', '--ours', '--', 'vault/60_people/Sam.md']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'keep mine']);
    const merge = git(root, ['rev-parse', 'HEAD']);
    assert.equal(parentsOf(root, merge), 2);
    assert.deepEqual(auditCommits(root, [merge]), { plain: [], checked: 0, error: null }, 'the stored file is the one a parent already had');
  } finally {
    cleanup(parent);
  }
});

test('auditUnpushed: a note that a phone already put online is not counted after a merge, and the computer\'s own plain note still is', () => {
  const { parent, root, bare } = makeVaultProject({ remote: true });
  try {
    const phone = join(parent, 'phone');
    git(parent, ['clone', '-q', bare, phone]);
    git(phone, ['config', 'user.name', 'Alex Doe']);
    git(phone, ['config', 'user.email', 'alex@example.invalid']);
    git(phone, ['config', 'commit.gpgsign', 'false']);
    write(phone, 'vault/60_people/Phone.md', 'plain, from a phone\n');
    git(phone, ['add', '-A']);
    git(phone, ['commit', '-q', '-m', 'phone']);
    git(phone, ['push', '-q', 'origin', 'main']);

    write(root, 'vault/00_inbox/local.md', 'an ordinary note\n');
    putBytes(root, 'vault/60_people/Sam.md', encryptedBytes('sam'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'local']);
    git(root, ['pull', '-q', '--no-rebase', '--no-edit']); // Obsidian Git's default pull: a merge commit
    assert.equal(parentsOf(root, 'HEAD'), 2, 'a merge commit');
    assert.deepEqual(auditUnpushed(root), { plain: [], checked: 1, error: null }, 'only the encrypted note of this computer is up for upload');

    // A plain note of this computer's own, committed after the merge, is still caught
    write(root, 'vault/60_people/Mine.md', 'plain by mistake\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'plain']);
    assert.deepEqual(auditUnpushed(root).plain, ['vault/60_people/Mine.md']);
  } finally {
    cleanup(parent);
  }
});

test('an octopus merge (three parents) is read too', () => {
  const { parent, root } = makeVaultProject();
  try {
    for (const name of ['one', 'two']) {
      git(root, ['checkout', '-q', '-b', name, 'main']);
      write(root, `vault/60_people/${name}.md`, `plain, brought in by ${name}\n`);
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '-m', name]);
    }
    git(root, ['checkout', '-q', 'main']);
    write(root, 'vault/00_inbox/main.md', 'ordinary\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'main']);
    git(root, ['merge', '-q', '--no-edit', 'one', 'two']);
    const octopus = git(root, ['rev-parse', 'HEAD']);
    assert.equal(parentsOf(root, octopus), 3);
    assert.deepEqual(auditCommits(root, [octopus]), { plain: [], checked: 0, error: null });
    assert.deepEqual(auditCommits(root, [octopus, git(root, ['rev-parse', 'one']), git(root, ['rev-parse', 'two'])]).plain.sort(), ['vault/60_people/one.md', 'vault/60_people/two.md']);
  } finally {
    cleanup(parent);
  }
});

/* ------------------------------ large files ------------------------------ */

/** Run `fn` with smaller read limits, then put the real ones back. */
function withReadLimits(limits, fn) {
  const before = { ...BLOB_READ_LIMITS };
  Object.assign(BLOB_READ_LIMITS, limits);
  try {
    return fn();
  } finally {
    Object.assign(BLOB_READ_LIMITS, before);
  }
}

test('readBlobs reads small files in groups and only the start of big ones, and gives the same answers either way', () => {
  const { parent, root } = makeVaultProject();
  try {
    const filler = (n) => Buffer.alloc(n, 0x41);
    const files = {
      'vault/60_people/small-plain.md': Buffer.from('plain note\n'),
      'vault/60_people/small-encrypted.md': encryptedBytes('note'),
      'vault/60_people/empty.md': Buffer.alloc(0),
      'vault/60_people/big-plain.pdf': Buffer.concat([Buffer.from('%PDF-1.4 '), filler(5000)]),
      'vault/60_people/big-encrypted.pdf': Buffer.concat([encryptedBytes('pdf'), filler(5000)]),
      'vault/60_people/big-encrypted-two.pdf': Buffer.concat([encryptedBytes('pdf two'), filler(7000)]),
      'vault/60_people/a-bit-short.png': GITCRYPT_HEADER.subarray(0, 9), // a cut-short header is not a header
      'vault/60_people/header-only.png': Buffer.from(GITCRYPT_HEADER),
    };
    const oids = {};
    for (const [rel, bytes] of Object.entries(files)) {
      putBytes(root, rel, bytes);
      git(root, ['add', '--', rel]);
      oids[rel] = git(root, ['rev-parse', `:${rel}`]);
    }
    const all = Object.values(oids);
    const expected = (rel) => ({ size: files[rel].length, header: hasGitCryptHeader(files[rel]), missing: false });
    const check = (blobs) => {
      assert.equal(blobs.size, new Set(all).size);
      for (const rel of Object.keys(files)) assert.deepEqual(blobs.get(oids[rel]), expected(rel), rel);
    };

    check(readBlobs(root, all)); // the normal limits: one group
    check(withReadLimits({ batchBytes: 40, wholeFileBytes: 4000 }, () => readBlobs(root, all))); // several groups, the big ones by their start
    check(withReadLimits({ batchBytes: 1, wholeFileBytes: 0 }, () => readBlobs(root, all))); // every file with content by its start
    check(withReadLimits({ batchBytes: 1, wholeFileBytes: 1_000_000 }, () => readBlobs(root, all))); // one file per group
  } finally {
    cleanup(parent);
  }
});

test('the audits stay correct when the stored files are bigger than the read limits', () => {
  const { parent, root } = makeVaultProject();
  try {
    // Twelve private documents that are encrypted, then one that is plain
    for (let i = 0; i < 12; i++) putBytes(root, `vault/60_people/scan-${i}.pdf`, Buffer.concat([encryptedBytes(`scan ${i}`), Buffer.alloc(20_000, i)]));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'scans']);
    const encryptedCommit = git(root, ['rev-parse', 'HEAD']);
    putBytes(root, 'vault/70_journal/photo.jpg', Buffer.concat([Buffer.from('JFIF'), Buffer.alloc(30_000, 1)]));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'a plain photo']);
    const plainCommit = git(root, ['rev-parse', 'HEAD']);

    // Groups of 50 KB at most, and nothing over 25 KB read whole: each of these files is read by its start
    withReadLimits({ batchBytes: 50_000, wholeFileBytes: 25_000 }, () => {
      assert.deepEqual(auditCommits(root, [encryptedCommit]), { plain: [], checked: 12, error: null });
      assert.deepEqual(auditCommits(root, [encryptedCommit, plainCommit]).plain, ['vault/70_journal/photo.jpg']);
      const index = auditIndex(root);
      assert.deepEqual(index.plain, ['vault/70_journal/photo.jpg']);
      assert.equal(index.tracked.length, 13);
      assert.deepEqual(auditStaged(root), { plain: [], checked: 0, error: null });
    });
    // Groups that hold only a few files each
    withReadLimits({ batchBytes: 45_000, wholeFileBytes: 1_000_000 }, () => {
      assert.deepEqual(auditCommits(root, [encryptedCommit]), { plain: [], checked: 12, error: null });
      assert.deepEqual(auditCommits(root, [plainCommit]).plain, ['vault/70_journal/photo.jpg']);
    });
  } finally {
    cleanup(parent);
  }
});

test('a stored file that is missing, or an id that is not one, is an error and never a clean result', () => {
  const { parent, root } = makeVaultProject();
  try {
    const gone = 'f'.repeat(40);
    assert.deepEqual(readBlobs(root, [gone]).get(gone), { size: 0, header: false, missing: true });
    assert.throws(() => readBlobs(root, ['not-an-object-id']), /not understood/);
    assert.throws(() => readBlobs(root, [`${gone}\n--batch`]), /not understood/, 'nothing but an object id is ever handed to git');

    // A staged private file whose stored object is gone is reported as an error by the audit, whatever the limits
    git(root, ['update-index', '--add', '--info-only', '--cacheinfo', `100644,${gone},vault/60_people/Gone.md`]);
    for (const limits of [{}, { wholeFileBytes: 0, batchBytes: 1 }]) {
      const audit = withReadLimits(limits, () => auditStaged(root));
      assert.match(audit.error || '', /could not be read/, JSON.stringify(limits));
      assert.deepEqual(audit.plain, []);
    }

    // A big file is read by its start only, and the answer is still right
    const scan = Buffer.concat([encryptedBytes('scan'), Buffer.alloc(5000, 3)]);
    putBytes(root, 'vault/60_people/scan.pdf', scan);
    git(root, ['add', '--', 'vault/60_people/scan.pdf']);
    const oid = git(root, ['rev-parse', ':vault/60_people/scan.pdf']);
    withReadLimits({ wholeFileBytes: 100 }, () => assert.deepEqual(readBlobs(root, [oid]).get(oid), { size: scan.length, header: true, missing: false }));
  } finally {
    cleanup(parent);
  }
});
