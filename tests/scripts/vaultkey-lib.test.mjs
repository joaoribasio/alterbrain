// system/lib/vaultkey.mjs: scope, attribute files, header check, wrapping a key copy, hidden password entry.
// Synthetic data only. Passwords and keys are made up at run time. No git-crypt is needed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CancelledError, DOCUMENT_EXTENSIONS, ENCRYPTED_EXTENSIONS, EXAMPLE_WORDS, GITCRYPT_HEADER, KeyFileError, NOTE_EXTENSIONS, NoTerminalError,
  SCRYPT_DEFAULT, SCOPE_LABELS, attributeBlock, attributeFilesMissing, attributesPresent, auditCommits, auditIndex, auditStaged, auditUnpushed,
  defaultKeyPath, encryptionEnabled, ENCRYPTED_SCOPE, excludePathspecs, getStatus, gitCryptCandidates, hasGitCryptHeader, isEncryptedBlob,
  isEncryptedPath, isInsideProject, looksWrapped, mergeAttributeText, parseWrapped, passwordProblem, pendingPrivateChanges, readBlobs,
  readEncryptionConfig, readHidden, resolveGitCrypt, sameKey, suggestPassphrase, unwrapKey, updateEncryptionConfig, wingetGitCryptExes, wrapKey,
  writeAttributeFiles,
} from '../../system/lib/vaultkey.mjs';
import {
  FAKE_GIT_CRYPT, NOTES, REAL_GIT_CRYPT_TOOL, REPO, cleanup, fakeKeyBytes, fakePassword, git, gitTry, makeVaultProject, newTmp, read, write,
} from '../fixtures/scripts/vaultkey-helpers.mjs';

const CHEAP = { N: 2 ** 14, r: 8, p: 1 }; // the real cost (2^17) is checked once, below
const encryptedBytes = (text = 'secret') => Buffer.concat([GITCRYPT_HEADER, Buffer.alloc(12, 7), Buffer.from(text)]);
/** Write raw bytes into a project file (the shared helper writes text). */
function putBytes(root, rel, bytes) {
  const file = join(root, ...rel.split('/'));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, bytes);
}
const readBrain = (root) => readFileSync(join(root, 'config', 'brain.json'), 'utf8');

/* ------------------------------ wrapping a key copy ------------------------------ */

test('wrap and unwrap round trip, with the documented file layout', () => {
  const key = fakeKeyBytes();
  const pw = fakePassword();
  const wrapped = wrapKey(key, pw, CHEAP);
  assert.equal(wrapped.format, 'alterbrain-vault-key');
  assert.equal(wrapped.v, 1);
  assert.deepEqual(Object.keys(wrapped).sort(), ['ct', 'format', 'iv', 'kdf', 'tag', 'v']);
  assert.equal(wrapped.kdf.name, 'scrypt');
  assert.deepEqual([wrapped.kdf.N, wrapped.kdf.r, wrapped.kdf.p], [CHEAP.N, 8, 1]);
  assert.equal(Buffer.from(wrapped.kdf.salt, 'base64').length, 16);
  assert.equal(Buffer.from(wrapped.iv, 'base64').length, 12);
  assert.equal(Buffer.from(wrapped.tag, 'base64').length, 16);
  assert.equal(Buffer.from(wrapped.ct, 'base64').length, key.length);
  assert.ok(!JSON.stringify(wrapped).includes(key.toString('base64')), 'the key is not stored in the clear');
  assert.ok(unwrapKey(wrapped, pw).equals(key));
  // as bytes, as a file would be read
  const bytes = Buffer.from(`${JSON.stringify(wrapped)}\n`);
  assert.equal(looksWrapped(bytes), true);
  assert.ok(unwrapKey(bytes, pw).equals(key));
  assert.equal(looksWrapped(key), false, 'a plain key file is not mistaken for a wrapped one');
});

test('the default cost is scrypt N=2^17, r=8, p=1', () => {
  assert.deepEqual({ ...SCRYPT_DEFAULT }, { N: 131072, r: 8, p: 1 });
  const key = fakeKeyBytes();
  const pw = fakePassword();
  const wrapped = wrapKey(key, pw);
  assert.equal(wrapped.kdf.N, 131072);
  assert.ok(unwrapKey(wrapped, pw).equals(key));
});

test('every wrap uses a fresh salt and IV', () => {
  const key = fakeKeyBytes();
  const pw = fakePassword();
  const a = wrapKey(key, pw, CHEAP);
  const b = wrapKey(key, pw, CHEAP);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('a wrong password gives a plain message, not a stack trace', () => {
  const wrapped = wrapKey(fakeKeyBytes(), fakePassword(), CHEAP);
  assert.throws(
    () => unwrapKey(wrapped, `${fakePassword()}-other`),
    (e) => e instanceof KeyFileError && e.code === 'password' && /password/i.test(e.message) && !/\bat file:|node:|\.mjs/.test(e.message),
  );
});

test('a changed file is refused: ciphertext, tag, IV, salt and cost settings', () => {
  const key = fakeKeyBytes();
  const pw = fakePassword();
  const flip = (b64) => {
    const buf = Buffer.from(b64, 'base64');
    buf[0] ^= 1;
    return buf.toString('base64');
  };
  const base = wrapKey(key, pw, CHEAP);
  const variants = {
    ct: { ...base, ct: flip(base.ct) },
    tag: { ...base, tag: flip(base.tag) },
    iv: { ...base, iv: flip(base.iv) },
    salt: { ...base, kdf: { ...base.kdf, salt: flip(base.kdf.salt) } },
    cost: { ...base, kdf: { ...base.kdf, N: base.kdf.N * 2 } },
  };
  for (const [name, v] of Object.entries(variants)) {
    assert.throws(() => unwrapKey(JSON.stringify(v), pw), (e) => e instanceof KeyFileError && e.code === 'password', name);
  }
  // Truncated or wrong-shaped files
  const text = JSON.stringify(base);
  assert.throws(() => unwrapKey(text.slice(0, text.length - 20), pw), (e) => e instanceof KeyFileError && e.code === 'damaged');
  assert.throws(() => unwrapKey('{"hello":1}', pw), (e) => e instanceof KeyFileError && e.code === 'format');
  assert.throws(() => unwrapKey(JSON.stringify({ ...base, v: 2 }), pw), (e) => e instanceof KeyFileError && e.code === 'version');
  assert.throws(() => unwrapKey(JSON.stringify({ ...base, ct: 'not base64!' }), pw), (e) => e instanceof KeyFileError && e.code === 'damaged');
  assert.throws(() => unwrapKey(JSON.stringify({ ...base, tag: Buffer.alloc(3).toString('base64') }), pw), (e) => e instanceof KeyFileError && e.code === 'damaged');
});

test('hostile cost settings in a file are refused before any work is done', () => {
  const base = wrapKey(fakeKeyBytes(), fakePassword(), CHEAP);
  for (const kdf of [{ N: 2 ** 26 }, { N: 3 }, { r: 1000 }, { p: 99 }, { N: 'x' }]) {
    assert.throws(() => parseWrapped({ ...base, kdf: { ...base.kdf, ...kdf } }), (e) => e instanceof KeyFileError && e.code === 'damaged');
  }
  assert.throws(() => wrapKey(fakeKeyBytes(), fakePassword(), { N: 2 ** 30 }), (e) => e instanceof KeyFileError);
});

test('a password needs at least 10 characters', () => {
  assert.match(passwordProblem('short'), /at least 10/);
  assert.match(passwordProblem(''), /at least 10/);
  assert.equal(passwordProblem('0123456789'), null);
  assert.throws(() => wrapKey(fakeKeyBytes(), 'short', CHEAP), (e) => e instanceof KeyFileError);
});

test('the same password typed with composed or decomposed accents opens the file', () => {
  const key = fakeKeyBytes();
  const composed = 'café-café-café';
  const decomposed = 'café-café-café';
  assert.ok(unwrapKey(wrapKey(key, composed, CHEAP), decomposed).equals(key));
});

test('sameKey compares by content', () => {
  const a = fakeKeyBytes();
  assert.equal(sameKey(a, Buffer.from(a)), true);
  assert.equal(sameKey(a, fakeKeyBytes()), false);
});

test('the example password is four words from the list; the list has no repeats', () => {
  assert.equal(new Set(EXAMPLE_WORDS).size, EXAMPLE_WORDS.length);
  assert.ok(EXAMPLE_WORDS.every((w) => /^[a-z]{3,10}$/.test(w)));
  assert.ok(EXAMPLE_WORDS.length >= 150);
  for (let i = 0; i < 20; i++) {
    const words = suggestPassphrase().split(' ');
    assert.equal(words.length, 4);
    assert.ok(words.every((w) => EXAMPLE_WORDS.includes(w)));
  }
});

/* ------------------------------ hidden password entry ------------------------------ */

/** A stand-in for a terminal: a stream with the properties readHidden needs. */
function fakeTerminal({ tty = true } = {}) {
  const input = new PassThrough();
  input.isTTY = tty;
  input.isRaw = false;
  input.rawModes = [];
  input.setRawMode = (v) => {
    input.isRaw = v;
    input.rawModes.push(v);
  };
  const shown = [];
  const output = { write: (t) => shown.push(String(t)) };
  return { input, output, shown };
}

const settle = () => new Promise((r) => setImmediate(r));

test('readHidden returns what was typed, does not echo it, and puts the terminal back', async () => {
  const term = fakeTerminal();
  const pending = readHidden('Password: ', term);
  await settle();
  term.input.write('abc');
  term.input.write('d\r');
  assert.equal(await pending, 'abcd');
  assert.ok(term.shown.join('').startsWith('Password: '));
  assert.ok(!term.shown.join('').includes('abcd'), 'typed characters are never shown');
  assert.deepEqual(term.input.rawModes, [true, false], 'raw mode on, then restored');
});

test('readHidden handles Backspace, arrow keys, pasted text and a newline from Enter', async () => {
  const term = fakeTerminal();
  const pending = readHidden('> ', term);
  await settle();
  term.input.write('abx\u007f\u007fab'); // x and b removed
  term.input.write('\u001b[A\u001b[D'); // arrow keys are ignored
  term.input.write('c\bC'); // old-style backspace
  term.input.write('é😀z\n');
  assert.equal(await pending, 'aabCé😀z');
});

test('readHidden cancels on Ctrl+C, and the terminal is put back', async () => {
  const term = fakeTerminal();
  const pending = readHidden('> ', term);
  await settle();
  term.input.write('ab\u0003');
  await assert.rejects(pending, CancelledError);
  assert.deepEqual(term.input.rawModes, [true, false]);
});

test('Ctrl+D cancels when nothing is typed and is ignored after text', async () => {
  const empty = fakeTerminal();
  const p1 = readHidden('> ', empty);
  await settle();
  empty.input.write('\u0004');
  await assert.rejects(p1, CancelledError);

  const typed = fakeTerminal();
  const p2 = readHidden('> ', typed);
  await settle();
  typed.input.write('ab\u0004c\r');
  assert.equal(await p2, 'abc');
});

test('readHidden refuses when there is no keyboard (pipe, Claude, a script)', async () => {
  const piped = fakeTerminal({ tty: false });
  await assert.rejects(readHidden('> ', piped), NoTerminalError);
  assert.deepEqual(piped.input.rawModes, [], 'nothing was touched');
  await assert.rejects(readHidden('> ', { input: new PassThrough(), output: { write() {} } }), NoTerminalError);
});

/* ------------------------------ which files are encrypted ------------------------------ */

test('isEncryptedPath follows the default scope', () => {
  const yes = [
    NOTES.fact, NOTES.user, 'vault/80_me/MEMORY.md', NOTES.voice, 'vault/80_me/voice/slop-extra.json', 'vault/80_me/voice/en/stats.json',
    'vault/80_me/private/medical.txt', 'vault/80_me/private/deep/notes.md', NOTES.person, 'vault/60_people/Group/Jamie Example.canvas',
    NOTES.journal, 'vault/70_journal/decisions/2026-10-07 Offer.md', 'vault/70_journal/weekly/w41.base', 'vault/60_people/list.csv',
    'VAULT/60_PEOPLE/Someone.MD', // Windows and macOS ignore case
    // documents and pictures in the private folders are encrypted too
    NOTES.scan, 'vault/60_people/photo.png', 'vault/70_journal/scan.docx', 'vault/70_journal/receipts/2026/hotel.PDF', 'vault/80_me/voice/clip.rtf',
    'vault/80_me/private/passport-scan.heic', 'vault/80_me/private/contract.odt', 'vault/60_people/Group/org-chart.pptx', 'vault/70_journal/budget.xlsx',
    'vault/60_people/old.xls', 'vault/60_people/old.doc', 'vault/60_people/old.ppt', 'vault/60_people/a.jpg', 'vault/60_people/a.JPEG', 'vault/60_people/a.gif',
    'vault/60_people/a.webp',
  ];
  const no = [
    NOTES.soul, 'vault/80_me/IDENTITY.md', 'vault/80_me/brand/_brand.yml', 'vault/80_me/README.md', 'vault/80_me/sub/fact-sheet.md',
    'vault/80_me/foo.pdf', // in 80_me, but only fact-sheet, USER, MEMORY, voice/ and private/ are encrypted
    'vault/80_me/brand/logo.png', 'vault/60_people/.gitattributes',
    'vault/60_people/clip.mp3', 'vault/70_journal/archive.zip', 'vault/70_journal/mail.mbox', 'vault/60_people/film.mp4', // not a note, document or picture
    'vault/30_wiki/concepts/diagram.png', 'vault/40_sources/raw/2026/reading.pdf', 'vault/20_areas/courses/slides.pptx', 'vault/10_projects/report.docx',
    NOTES.task, 'vault/30_wiki/concepts/Porter.md', 'vault/40_sources/raw/2026/x.md', 'config/brain.json', 'vault/60_people', 'README.md',
    'vault/80_me/voice', 'vault/80_me/voicenotes.md', 'vault/600_people/a.md', 'vault/60_people/noextension', 'vault/60_people/notes.pdf.bak',
  ];
  for (const p of yes) assert.equal(isEncryptedPath(p), true, p);
  for (const p of no) assert.equal(isEncryptedPath(p), false, p);
  assert.equal(isEncryptedPath('vault\\60_people\\a.md'), true, 'backslashes are read as folders');
  assert.equal(isEncryptedPath('vault\\60_people\\scan.pdf'), true);
});

test('the encrypted file types: notes, then documents and pictures', () => {
  assert.deepEqual(NOTE_EXTENSIONS, ['md', 'json', 'txt', 'csv', 'yml', 'yaml', 'base', 'canvas']);
  assert.deepEqual(DOCUMENT_EXTENSIONS, ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'rtf', 'odt']);
  assert.deepEqual(ENCRYPTED_EXTENSIONS, [...NOTE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);
  assert.equal(new Set(ENCRYPTED_EXTENSIONS).size, ENCRYPTED_EXTENSIONS.length, 'no repeats');
  assert.ok(ENCRYPTED_EXTENSIONS.every((x) => /^[a-z0-9]+$/.test(x)));
});

test('the scope recorded in settings holds paths only', () => {
  assert.deepEqual(SCOPE_LABELS, [
    'vault/80_me/fact-sheet.md', 'vault/80_me/USER.md', 'vault/80_me/MEMORY.md', 'vault/80_me/voice/', 'vault/80_me/private/',
    'vault/60_people/', 'vault/70_journal/',
  ]);
});

test('attribute files: git-crypt covers notes, documents and pictures in the private folders; persona files and other folders are left alone', () => {
  // The root file has no Git LFS rules (ordinary documents are normal git files), so this does not depend on the framework's own .gitattributes.
  const { parent, root } = makeVaultProject();
  try {
    const changed = writeAttributeFiles(root);
    assert.deepEqual(changed.sort(), ['vault/60_people/.gitattributes', 'vault/70_journal/.gitattributes', 'vault/80_me/.gitattributes']);
    assert.deepEqual(writeAttributeFiles(root), [], 'writing twice changes nothing');
    const attr = (name, path) => {
      const r = git(root, ['check-attr', name, '--', path]);
      return r.slice(r.lastIndexOf(': ') + 2);
    };
    const filter = (path) => attr('filter', path);
    for (const p of [
      NOTES.fact, NOTES.user, 'vault/80_me/MEMORY.md', NOTES.voice, 'vault/80_me/voice/slop-extra.json', 'vault/80_me/private/a.txt',
      NOTES.person, 'vault/60_people/team/Jamie.md', NOTES.journal, 'vault/70_journal/weekly/w41.canvas',
    ]) assert.equal(filter(p), 'git-crypt', p);
    // Documents and pictures in the private folders are encrypted as well, at any depth
    for (const p of [
      NOTES.scan, 'vault/60_people/photo.png', 'vault/70_journal/scan.docx', 'vault/70_journal/receipts/2026/hotel.pdf', 'vault/80_me/voice/clip.rtf',
      'vault/80_me/private/passport-scan.heic', 'vault/80_me/private/deep/contract.odt', 'vault/60_people/team/a.jpeg', 'vault/70_journal/b.xlsx',
    ]) assert.equal(filter(p), 'git-crypt', p);
    // Not in the list, or outside the private folders: left to the root file (here: nothing)
    for (const p of [
      NOTES.pdf, 'vault/80_me/voice/clip.mp3', 'vault/60_people/film.mp4', 'vault/70_journal/archive.zip', 'vault/80_me/brand/logo.png',
      NOTES.soul, 'vault/80_me/IDENTITY.md', 'vault/80_me/brand/_brand.yml', NOTES.task, 'vault/30_wiki/concepts/diagram.png', 'vault/60_people/.gitattributes', 'vault/80_me/.gitattributes',
    ]) assert.equal(filter(p), 'unspecified', p);
    // The diff driver goes with the filter, and documents are marked binary so git never changes line endings inside them
    assert.match(git(root, ['check-attr', 'diff', '--', NOTES.fact]), /git-crypt$/);
    assert.match(git(root, ['check-attr', 'diff', '--', NOTES.scan]), /git-crypt$/);
    assert.equal(attr('text', NOTES.scan), 'unset');
    assert.equal(attr('text', 'vault/60_people/photo.png'), 'unset');
    assert.notEqual(attr('text', NOTES.fact), 'unset', 'notes stay text');
    assert.match(read(root, 'vault/60_people/.gitattributes'), /\.pdf filter=git-crypt diff=git-crypt -text$/m);
    assert.match(read(root, 'vault/60_people/.gitattributes'), /\.md filter=git-crypt diff=git-crypt$/m);
  } finally {
    cleanup(parent);
  }
});

test('a private folder rule wins over a Git LFS rule in the root file', () => {
  // A computer that still has the old root file (documents in Git LFS) must still encrypt documents in the private folders.
  const { parent, root } = makeVaultProject();
  try {
    writeFileSync(join(root, '.gitattributes'), `${read(root, '.gitattributes')}\nvault/**/*.pdf filter=lfs diff=lfs merge=lfs -text\nvault/**/*.docx filter=lfs diff=lfs merge=lfs -text\n`);
    writeAttributeFiles(root);
    const filter = (path) => git(root, ['check-attr', 'filter', '--', path]).replace(/^.*: /, '');
    assert.equal(filter(NOTES.scan), 'git-crypt');
    assert.equal(filter('vault/70_journal/scan.docx'), 'git-crypt');
    assert.equal(filter(NOTES.fact), 'git-crypt');
    assert.equal(filter(NOTES.pdf), 'lfs', 'outside the private folders the root rule still applies');
  } finally {
    cleanup(parent);
  }
});

test('with the framework\'s own root .gitattributes, whichever version it is, documents in the private folders get git-crypt', () => {
  const { parent, root } = makeVaultProject({ rootAttributes: 'framework' });
  try {
    writeAttributeFiles(root);
    const attr = (name, path) => git(root, ['check-attr', name, '--', path]).replace(/^.*: /, '');
    for (const p of [NOTES.scan, 'vault/60_people/photo.png', 'vault/70_journal/scan.docx', 'vault/80_me/private/passport-scan.heic', NOTES.fact]) {
      assert.equal(attr('filter', p), 'git-crypt', p);
      assert.equal(attr('diff', p), 'git-crypt', `${p}: the private folder rule also wins for the diff driver`);
    }
    assert.notEqual(attr('filter', NOTES.pdf), 'git-crypt', 'a PDF directly in 80_me is outside the encrypted scope');
  } finally {
    cleanup(parent);
  }
});

test('mergeAttributeText replaces our block and keeps lines it did not write', () => {
  const block = attributeBlock(ENCRYPTED_SCOPE[1]);
  const first = mergeAttributeText('*.foo text\n', block);
  assert.ok(first.startsWith('*.foo text\n\n# >>> alterbrain'));
  assert.ok(first.endsWith('# <<< alterbrain\n'));
  assert.equal(mergeAttributeText(first, block), first, 'idempotent');
  const changed = mergeAttributeText(first, block.replace('*.md', '*.txt-removed'));
  assert.ok(changed.startsWith('*.foo text'));
  assert.equal(changed.match(/>>> alterbrain/g).length, 1);
  assert.equal(mergeAttributeText('', block), `${block}\n`);
  assert.equal(mergeAttributeText('a\r\nb\r\n', block).includes('\r'), false);
});

test('the attribute block ends with the line that keeps the attribute file itself readable', () => {
  for (const entry of ENCRYPTED_SCOPE) {
    const lines = attributeBlock(entry).split('\n');
    assert.ok(lines.includes('.gitattributes !filter !diff'));
    assert.ok(lines.filter((l) => l.includes('filter=git-crypt')).every((l) => l.includes('diff=git-crypt')));
  }
});

test('attributesPresent and attributeFilesMissing', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(attributesPresent(root), false);
    assert.equal(attributeFilesMissing(root).length, 3);
    write(root, 'vault/70_journal/.gitattributes', attributeBlock(ENCRYPTED_SCOPE[2]) + '\n');
    assert.equal(attributesPresent(root), true);
    assert.deepEqual(attributeFilesMissing(root), ['vault/80_me/.gitattributes', 'vault/60_people/.gitattributes']);
  } finally {
    cleanup(parent);
  }
});

test('exclude pathspecs keep encrypted paths out of git add and nothing else', () => {
  const { parent, root } = makeVaultProject();
  try {
    for (const p of [NOTES.fact, NOTES.person, 'vault/60_people/sub/Other.MD', NOTES.voice, NOTES.journal, 'vault/80_me/private/x.txt']) write(root, p, 'private\n');
    for (const p of [NOTES.scan, 'vault/60_people/photo.PNG', 'vault/70_journal/receipts/hotel.pdf', 'vault/80_me/private/passport.heic']) write(root, p, 'private document\n');
    for (const p of [NOTES.user, 'vault/80_me/IDENTITY.md', 'vault/60_people/clip.mp3', 'vault/00_inbox/a.md', 'vault/80_me/brand/_brand.yml', 'vault/80_me/foo.pdf', 'vault/30_wiki/x.pdf']) write(root, p, 'ok\n');
    git(root, ['add', '-A', '--', '.', ...excludePathspecs()]);
    const staged = git(root, ['diff', '--cached', '--name-only']).split('\n').sort();
    assert.deepEqual(staged, ['vault/00_inbox/a.md', 'vault/30_wiki/x.pdf', 'vault/60_people/clip.mp3', 'vault/80_me/IDENTITY.md', 'vault/80_me/brand/_brand.yml', 'vault/80_me/foo.pdf'].sort());
    // USER.md is in the scope too, so it is not staged either.
    assert.ok(!staged.includes(NOTES.user));
  } finally {
    cleanup(parent);
  }
});

test('pendingPrivateChanges counts only changed files that are in the scope', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(pendingPrivateChanges(root), 0);
    write(root, NOTES.person, 'x\n');
    write(root, NOTES.scan, 'x\n');
    write(root, 'vault/60_people/clip.mp3', 'x\n');
    write(root, 'vault/80_me/brand/_brand.yml', 'x\n');
    assert.equal(pendingPrivateChanges(root), 2, 'a note and a document; not an audio file or a brand file');
  } finally {
    cleanup(parent);
  }
});

/* ------------------------------ the header check ------------------------------ */

test('header check tells encrypted bytes from plain text', () => {
  assert.equal(hasGitCryptHeader(encryptedBytes()), true);
  assert.equal(hasGitCryptHeader(Buffer.from('# A note\n')), false);
  assert.equal(hasGitCryptHeader(Buffer.from('GITCRYPT but no NUL bytes')), false);
  assert.equal(hasGitCryptHeader(GITCRYPT_HEADER.subarray(0, 9)), false, 'a cut-short header does not count');
  assert.equal(hasGitCryptHeader(Buffer.alloc(0)), false);
  assert.equal(isEncryptedBlob(Buffer.alloc(0)), true, 'an empty file stays empty under git-crypt');
  assert.equal(isEncryptedBlob(Buffer.from('plain')), false);
});

test('readBlobs and the audits look at the stored bytes, not at git-crypt output', () => {
  const { parent, root } = makeVaultProject();
  try {
    write(root, NOTES.fact, 'Nationality: example\n'); // plain, in an encrypted path
    git(root, ['add', '-A']);
    const oid = git(root, ['rev-parse', `:${NOTES.fact}`]);
    const blobs = readBlobs(root, [oid]);
    assert.equal(blobs.get(oid).header, false);
    assert.equal(blobs.get(oid).size, 21);
    assert.equal(readBlobs(root, []).size, 0);

    let staged = auditStaged(root);
    assert.equal(staged.error, null);
    assert.deepEqual(staged.plain, [NOTES.fact]);

    // Replace the plain file by bytes that carry the header (what the encryption step stores)
    putBytes(root, NOTES.fact, encryptedBytes('Nationality'));
    git(root, ['add', '-A']);
    staged = auditStaged(root);
    assert.deepEqual(staged.plain, []);
    assert.equal(staged.checked, 1);

    // Other files in the same commit do not matter: only encrypted paths are checked.
    write(root, 'vault/00_inbox/plain.md', 'plain is fine here\n');
    putBytes(root, NOTES.user, Buffer.alloc(0));
    git(root, ['add', '-A']);
    assert.deepEqual(auditStaged(root).plain, [], 'an empty private file is fine');

    const index = auditIndex(root);
    assert.equal(index.error, null);
    assert.deepEqual(index.tracked.sort(), [NOTES.user, NOTES.fact].sort());
    assert.deepEqual(index.plain, []);
  } finally {
    cleanup(parent);
  }
});

test('auditUnpushed checks every commit that would go up, even a plain file a later commit replaced', () => {
  const { parent, root } = makeVaultProject({ remote: true });
  try {
    assert.deepEqual(auditUnpushed(root), { plain: [], checked: 0, error: null });

    write(root, NOTES.person, 'Plain contact details\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'plain by mistake']);
    // A later commit replaces the plain file with an encrypted-looking one
    putBytes(root, NOTES.person, encryptedBytes('contact'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'now encrypted']);

    const audit = auditUnpushed(root);
    assert.equal(audit.error, null);
    assert.deepEqual(audit.plain, [NOTES.person], 'the plain version in the older commit is still caught');

    // Once the online copy has everything, nothing is left to upload
    const fresh = makeVaultProject({ remote: true });
    try {
      putBytes(fresh.root, NOTES.person, encryptedBytes('contact'));
      git(fresh.root, ['add', '-A']);
      git(fresh.root, ['commit', '-q', '-m', 'encrypted']);
      assert.deepEqual(auditUnpushed(fresh.root).plain, []);
      assert.equal(auditUnpushed(fresh.root).checked, 1);
    } finally {
      cleanup(fresh.parent);
    }
  } finally {
    cleanup(parent);
  }
});

test('auditUnpushed covers the first upload (no remote branch yet) and ignores deleted files', () => {
  const { parent, root } = makeVaultProject();
  try {
    git(root, ['remote', 'add', 'origin', join(parent, 'not-yet.git')]);
    write(root, NOTES.journal, 'plain journal\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'journal']);
    assert.deepEqual(auditUnpushed(root).plain, [NOTES.journal]);
    git(root, ['rm', '-q', NOTES.journal]);
    git(root, ['commit', '-q', '-m', 'removed']);
    assert.deepEqual(auditUnpushed(root).plain, [NOTES.journal], 'the plain version is still in the history that would go up');
  } finally {
    cleanup(parent);
  }
});

test('the audits report an error, never a clean result, when git cannot be read', () => {
  // Outside the project tree, so no parent repository is found either
  const dir = mkdtempSync(join(tmpdir(), 'ab-notarepo-'));
  try {
    assert.ok(auditStaged(dir).error);
    assert.ok(auditIndex(dir).error);
    // auditUnpushed treats "no HEAD" as nothing to upload, but a failing git call is an error
    write(dir, 'x.txt', 'x');
    assert.deepEqual(auditUnpushed(dir).plain, []);
  } finally {
    cleanup(dir);
  }
});

/* ------------------------------ settings ------------------------------ */

test('updateEncryptionConfig keeps other settings and defaults the rest', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(readEncryptionConfig(root).enabled, false);
    updateEncryptionConfig(root, { enabled: true, scope: SCOPE_LABELS });
    let cfg = readEncryptionConfig(root);
    assert.equal(cfg.enabled, true);
    assert.deepEqual(cfg.scope, SCOPE_LABELS);
    assert.equal(cfg.key_backup_checked, null);
    updateEncryptionConfig(root, { key_backup_checked: '2026-10-08' });
    cfg = readEncryptionConfig(root);
    assert.equal(cfg.key_backup_checked, '2026-10-08');
    assert.equal(cfg.enabled, true, 'earlier values stay');
    const brain = JSON.parse(readBrain(root));
    assert.equal(brain.git.auto_commit, true, 'unrelated settings stay');
    assert.equal(brain.privacy.encryption.tool, 'git-crypt');
    assert.equal(encryptionEnabled(root), true);
  } finally {
    cleanup(parent);
  }
});

test('an unreadable brain.json is not overwritten, and counts as unreadable', () => {
  const { parent, root } = makeVaultProject();
  try {
    write(root, 'config/brain.json', '{ not json');
    assert.equal(readEncryptionConfig(root).readable, false);
    assert.throws(() => updateEncryptionConfig(root, { enabled: true }), /cannot be read/);
    assert.equal(readBrain(root), '{ not json');
  } finally {
    cleanup(parent);
  }
});

test('encryption counts as on when either the settings or the attribute files say so', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(encryptionEnabled(root), false);
    writeAttributeFiles(root);
    assert.equal(encryptionEnabled(root), true, 'attribute files alone');
  } finally {
    cleanup(parent);
  }
  const b = makeVaultProject({ enabled: true });
  try {
    assert.equal(encryptionEnabled(b.root), true, 'settings alone');
  } finally {
    cleanup(b.parent);
  }
});

test('getStatus is quiet when encryption is off and honest when it is on without the tool or the key', () => {
  const off = makeVaultProject();
  try {
    const st = getStatus(off.root);
    assert.equal(st.enabled, false);
    assert.deepEqual(st.problems, []);
  } finally {
    cleanup(off.parent);
  }
  const on = makeVaultProject({ enabled: true });
  const prev = process.env.ALTERBRAIN_GIT_CRYPT;
  process.env.ALTERBRAIN_GIT_CRYPT = join(on.root, 'no-such-tool.exe');
  try {
    const st = getStatus(on.root);
    assert.equal(st.enabled, true);
    assert.equal(st.git_crypt_installed, false);
    assert.equal(st.unlocked, false);
    const ids = st.problems.map((p) => p.id);
    assert.ok(ids.includes('tool-missing'));
    assert.ok(ids.includes('locked'));
    assert.ok(ids.includes('attributes-missing'));
    assert.ok(st.problems.every((p) => p.message && p.fix), 'every problem comes with a one-line fix');
    assert.ok(st.notes.some((n) => /key backup has not been tested/.test(n)));
  } finally {
    if (prev === undefined) delete process.env.ALTERBRAIN_GIT_CRYPT;
    else process.env.ALTERBRAIN_GIT_CRYPT = prev;
    cleanup(on.parent);
  }
});

/* ------------------------------ where a key copy may go ------------------------------ */

test('isInsideProject sees the project folder, its sub-folders and spellings that lead back into it', () => {
  const { parent, root } = makeVaultProject();
  try {
    assert.equal(isInsideProject(root, join(root, 'key.abkey')), true);
    assert.equal(isInsideProject(root, join(root, 'a', 'b', 'key.abkey')), true);
    assert.equal(isInsideProject(root, root), true);
    assert.equal(isInsideProject(root, join(root, 'vault', '..', 'key.abkey')), true);
    assert.equal(isInsideProject(root, 'key.abkey', root), true, 'a relative name is read from the folder the command runs in');
    assert.equal(isInsideProject(root, join(parent, 'elsewhere', 'key.abkey')), false);
    assert.equal(isInsideProject(root, join(parent, 'proj-sibling', 'key.abkey')), false, 'a folder whose name starts like the project is outside');
    assert.equal(isInsideProject(root, join(parent, 'key.abkey')), false);
    // A link outside that leads into the project
    const outside = join(parent, 'outside');
    mkdirSync(outside, { recursive: true });
    const link = join(outside, 'link');
    try {
      symlinkSync(root, link, 'junction');
      assert.equal(isInsideProject(root, join(link, 'key.abkey')), true, 'through a link');
    } catch {
      /* links cannot be made here: skip this part */
    }
  } finally {
    cleanup(parent);
  }
});

test('the suggested key file is outside the project, in Documents', () => {
  const { parent, root } = makeVaultProject();
  try {
    const raw = defaultKeyPath(root, false);
    const wrapped = defaultKeyPath(root, true);
    assert.match(raw, /Documents[\\/]Alterbrain[\\/]vault-key-proj\.key$/);
    assert.match(wrapped, /vault-key-proj\.abkey$/);
    assert.equal(isInsideProject(root, raw), false);
  } finally {
    cleanup(parent);
  }
});

test('git status of encrypted paths is unaffected by files of the same name outside the scope', () => {
  const { parent, root } = makeVaultProject();
  try {
    write(root, 'notes/fact-sheet.md', 'x\n');
    assert.equal(pendingPrivateChanges(root), 0);
    assert.equal(gitTry(root, ['status', '--porcelain']).ok, true);
  } finally {
    cleanup(parent);
  }
});

/* ------------------------------ finding git-crypt ------------------------------ */

/** A fake %LOCALAPPDATA%: Microsoft/WinGet/Packages/<name>/ with (or without) a git-crypt.exe in each. Any file will do: it is only listed. */
function fakeLocalAppData(packages) {
  const dir = newTmp('winget-');
  for (const [name, exe] of Object.entries(packages)) {
    const folder = join(dir, 'Microsoft', 'WinGet', 'Packages', name);
    mkdirSync(folder, { recursive: true });
    if (exe) writeFileSync(join(folder, 'git-crypt.exe'), 'not a program');
  }
  return dir;
}

test('wingetGitCryptExes lists every AGWA.git-crypt_<source> folder that holds git-crypt.exe, and nothing else', () => {
  const dir = fakeLocalAppData({
    'AGWA.git-crypt_Microsoft.Winget.Source_8wekyb3d8bbwe': true,
    'agwa.git-crypt_OtherSource_abc': true, // case does not matter on Windows
    'AGWA.git-crypt_Empty_xyz': false, // the folder is there but the program is not
    'GitHub.GitLFS_Microsoft.Winget.Source_8wekyb3d8bbwe': true, // another package
    'AGWA.git-crypt-extras_Source': true, // not the same package name
  });
  try {
    const found = wingetGitCryptExes(dir).map((p) => p.slice(join(dir, 'Microsoft', 'WinGet', 'Packages').length + 1));
    assert.deepEqual(found, [
      join('AGWA.git-crypt_Microsoft.Winget.Source_8wekyb3d8bbwe', 'git-crypt.exe'),
      join('agwa.git-crypt_OtherSource_abc', 'git-crypt.exe'),
    ], 'in a fixed order');
    assert.deepEqual(wingetGitCryptExes(join(dir, 'nowhere')), [], 'no packages folder is not an error');
    assert.deepEqual(wingetGitCryptExes(''), []);
  } finally {
    cleanup(dir);
  }
});

test('gitCryptCandidates: PATH first, then the winget Links folder and every winget package folder; nothing else on Linux', () => {
  const dir = fakeLocalAppData({ 'AGWA.git-crypt_Microsoft.Winget.Source_8wekyb3d8bbwe': true });
  try {
    const win = gitCryptCandidates({ env: { LOCALAPPDATA: dir }, platform: 'win32' }).map((c) => c.cmd);
    assert.equal(win[0], 'git-crypt');
    assert.equal(win[1], join(dir, 'Microsoft', 'WinGet', 'Links', 'git-crypt.exe'), 'the Links probe is kept');
    assert.equal(win[2], join(dir, 'Microsoft', 'WinGet', 'Packages', 'AGWA.git-crypt_Microsoft.Winget.Source_8wekyb3d8bbwe', 'git-crypt.exe'));
    assert.equal(win.length, 3);
    assert.deepEqual(gitCryptCandidates({ env: {}, platform: 'win32' }).map((c) => c.cmd), ['git-crypt'], 'no LOCALAPPDATA, no winget folders');
    assert.deepEqual(gitCryptCandidates({ env: {}, platform: 'linux' }).map((c) => c.cmd), ['git-crypt']);
    assert.deepEqual(gitCryptCandidates({ env: {}, platform: 'darwin' }).map((c) => c.cmd), ['git-crypt', '/opt/homebrew/bin/git-crypt', '/usr/local/bin/git-crypt']);
    // The setting made for tests is the only candidate; a .mjs file is run with node
    assert.deepEqual(gitCryptCandidates({ env: { ALTERBRAIN_GIT_CRYPT: 'C:/tools/git-crypt.exe', LOCALAPPDATA: dir }, platform: 'win32' }), [{ cmd: 'C:/tools/git-crypt.exe', pre: [] }]);
    assert.deepEqual(gitCryptCandidates({ env: { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT }, platform: 'win32' }), [{ cmd: process.execPath, pre: [FAKE_GIT_CRYPT] }]);
  } finally {
    cleanup(dir);
  }
});

test('the version is read from stdout (git-crypt 0.7.0) or stderr (older builds); a program that cannot run is not git-crypt', () => {
  const saved = { tool: process.env.ALTERBRAIN_GIT_CRYPT, on: process.env.FAKE_GIT_CRYPT_VERSION_ON };
  try {
    process.env.ALTERBRAIN_GIT_CRYPT = FAKE_GIT_CRYPT;
    delete process.env.FAKE_GIT_CRYPT_VERSION_ON;
    assert.equal(resolveGitCrypt({ fresh: true }).version, '0.0.0', 'on stdout');
    process.env.FAKE_GIT_CRYPT_VERSION_ON = 'stderr';
    assert.equal(resolveGitCrypt({ fresh: true }).version, '0.0.0', 'on stderr');
    process.env.ALTERBRAIN_GIT_CRYPT = join(FAKE_GIT_CRYPT, '..', 'no-such-program.exe');
    assert.equal(resolveGitCrypt({ fresh: true }), null);
  } finally {
    for (const [key, value] of [['ALTERBRAIN_GIT_CRYPT', saved.tool], ['FAKE_GIT_CRYPT_VERSION_ON', saved.on]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resolveGitCrypt({ fresh: true });
  }
});

test('a real git-crypt installed with winget is found although the running app does not have it on its PATH', {
  skip: !(process.platform === 'win32' && REAL_GIT_CRYPT_TOOL && /WinGet[\\/]Packages[\\/]AGWA\.git-crypt_/i.test(REAL_GIT_CRYPT_TOOL.cmd)) && 'git-crypt is not installed by winget here',
}, () => {
  // The child process gets a PATH that holds only node's own folder, as an app started before the install would have it.
  const lib = pathToFileURL(join(REPO, 'system', 'lib', 'vaultkey.mjs')).href;
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH'; // Windows spells it Path
  const env = { ...process.env, [pathKey]: join(process.execPath, '..') };
  delete env.ALTERBRAIN_GIT_CRYPT;
  const res = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(lib)}).then((m) => console.log(JSON.stringify(m.resolveGitCrypt())))`], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(res.status, 0, res.stderr);
  const tool = JSON.parse(res.stdout);
  assert.ok(tool, 'found');
  assert.match(tool.cmd, /WinGet[\\/]Packages[\\/]AGWA\.git-crypt_.*git-crypt\.exe$/i);
  assert.match(tool.version, /^\d+\.\d+/, 'the version came from the program itself');
});

/* ------------------------------ checking a list of commits ------------------------------ */

test('auditCommits names the plain private files in exactly the commits it is given', () => {
  const { parent, root } = makeVaultProject();
  try {
    const start = git(root, ['rev-parse', 'HEAD']);
    write(root, NOTES.person, 'Plain contact details\n');
    write(root, NOTES.scan, 'plain pdf text\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'plain']);
    const plainCommit = git(root, ['rev-parse', 'HEAD']);
    putBytes(root, NOTES.person, encryptedBytes('contact'));
    putBytes(root, NOTES.scan, encryptedBytes('pdf'));
    write(root, 'vault/00_inbox/other.md', 'not private, plain is fine\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'encrypted']);
    const encryptedCommit = git(root, ['rev-parse', 'HEAD']);

    assert.deepEqual(auditCommits(root, [plainCommit]).plain.sort(), [NOTES.person, NOTES.scan].sort());
    assert.deepEqual(auditCommits(root, [encryptedCommit]), { plain: [], checked: 2, error: null }, 'only the encrypted versions are in this commit');
    assert.deepEqual(auditCommits(root, [start]), { plain: [], checked: 0, error: null }, 'the first commit holds no private file');
    assert.equal(auditCommits(root, [encryptedCommit, plainCommit, plainCommit]).plain.length, 2, 'repeats are counted once');
    assert.deepEqual(auditCommits(root, []), { plain: [], checked: 0, error: null });
    assert.deepEqual(auditCommits(root, [' ', '']), { plain: [], checked: 0, error: null });
    assert.ok(auditCommits(root, ['not-a-commit']).error, 'a commit that cannot be read is an error, not a clean result');
  } finally {
    cleanup(parent);
  }
});
