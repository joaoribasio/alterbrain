// system/scripts/vault-key.mjs: status, setup, export, check, unlock.
// Most tests run against a stand-in for git-crypt (tests/fixtures/scripts/fake-git-crypt.mjs), so they run anywhere.
// The real-tool test needs the real git-crypt and skips itself when it is not installed (the library looks in PATH and in the winget folders).
// Passwords and keys are made up at run time; nothing here installs or downloads anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runVaultKey } from '../../system/scripts/vault-key.mjs';
import { GITCRYPT_HEADER, KEY_LOSS_WARNING, SCOPE_LABELS, classifyPrePush, ensurePrePushHook, resolveGitCrypt, wrapKey } from '../../system/lib/vaultkey.mjs';
import { release } from '../fixtures/scripts/release.mjs';
import {
  FAKE_GIT_CRYPT, NOTES, REAL_GIT_CRYPT, blobAt, cleanup, exists, fakeKeyBytes, fakePassword, git, gitTry, makeVaultProject, read, runVk, write,
} from '../fixtures/scripts/vaultkey-helpers.mjs';

const CHEAP = { N: 2 ** 14, r: 8, p: 1 };
const keyOf = (root) => readFileSync(join(root, '.git', 'git-crypt', 'keys', 'default'));
const json = (r) => JSON.parse(r.stdout);
const startsEncrypted = (buf) => buf.subarray(0, GITCRYPT_HEADER.length).equals(GITCRYPT_HEADER);
const stored = (root, path) => blobAt(root, 'HEAD', path);
const classifyHook = (root) => classifyPrePush(readFileSync(join(root, '.git', 'hooks', 'pre-push'), 'utf8'));

/** Write raw bytes into a project file (the shared helper writes text). */
function putBytes(root, rel, bytes) {
  const file = join(root, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

/** Documents and pictures with the awkward bytes of real ones: NUL bytes, CRLF line ends, a lone CR, high bytes. */
const DOCS = {
  pdf: Buffer.concat([Buffer.from('%PDF-1.4\r\n%'), Buffer.from([0xe2, 0xe3, 0xcf, 0xd3, 0x0d, 0x0a, 0x00, 0x01]), Buffer.from('1 0 obj\r\n<< >>\r\nendobj\r\n\rtrailer\r\n'), randomBytes(200)]),
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]), randomBytes(300)]),
  rtf: Buffer.from('{\\rtf1\\ansi\r\nA private letter.\r\nSecond line with CRLF.\r\n}\r\n'), // plain 7-bit text: the case where a line-ending change would show
};
const DOC_PATHS = { pdf: NOTES.scan, png: 'vault/70_journal/photo.png', rtf: 'vault/80_me/private/letter.rtf' };
const NOT_PRIVATE = { mp3: 'vault/60_people/clip.mp3', wikiPdf: 'vault/30_wiki/diagram.pdf', me: NOTES.pdf };

/** Documents saved plain, in and out of the private folders, as a vault is before encryption is switched on. */
function seedDocuments(root) {
  for (const k of Object.keys(DOC_PATHS)) putBytes(root, DOC_PATHS[k], DOCS[k]);
  for (const path of Object.values(NOT_PRIVATE)) putBytes(root, path, DOCS.pdf);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'documents']);
}

/** Save the notes in git as plain text (the state of a vault before encryption is switched on). */
function seedNotes(root) {
  write(root, NOTES.fact, '# Facts\n\nNationality: Exampleland (private)\n');
  write(root, NOTES.user, '# About me\n\nA short profile.\n');
  write(root, NOTES.voice, '---\ntype: "voice-profile"\n---\nWarm and direct.\n');
  write(root, NOTES.person, '# Jamie Example\n\nMet at a careers event.\n');
  write(root, NOTES.journal, '# 2026-10-07\n\nA private journal entry.\n');
  write(root, NOTES.pdf, 'pretend pdf bytes\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'notes']);
}

/** A project where setup has run (with the stand-in tool) and the result is committed and pushed. */
function encryptedProject({ remote = true } = {}) {
  const p = makeVaultProject({ remote });
  seedNotes(p.root);
  if (remote) git(p.root, ['push', '-q']);
  const r = runVk(p.root, ['setup']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  return p;
}

/** Run something in this process with the stand-in tool and isolated git settings. */
async function inProcess(root, fn) {
  const saved = {};
  const set = { ALTERBRAIN_GIT_CRYPT: FAKE_GIT_CRYPT, CLAUDE_PROJECT_DIR: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, '..', 'no-such-gitconfig'), GIT_TERMINAL_PROMPT: '0' };
  for (const [k, v] of Object.entries(set)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const vk = (root, argv, io = {}) =>
  inProcess(root, () => runVaultKey(argv, { root, print: () => {}, kdf: CHEAP, hasKeyboard: () => true, ...io }));

/* ------------------------------ usage ------------------------------ */

test('usage errors exit with 2 and say what to do', release(), () => {
  const { parent, root } = makeVaultProject();
  try {
    for (const args of [[], ['explode'], ['status', 'extra'], ['status', '--nope'], ['check'], ['unlock'], ['status', '--out', 'x'], ['check', '--key', 'x', '--password'], ['export', '--key', 'k'], ['export', '--out']]) {
      const r = runVk(root, args);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, /Usage: node system\/scripts\/vault-key\.mjs/, args.join(' '));
    }
  } finally {
    cleanup(parent);
  }
});

test('a password is never accepted on the command line', release(), () => {
  const { parent, root } = makeVaultProject();
  try {
    const word = fakePassword();
    const r = runVk(root, ['export', `--password=${word}`]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /never given on the command line/);
    assert.ok(!r.stderr.includes(word) && !r.stdout.includes(word), 'it is not echoed back');
    const r2 = runVk(root, ['export', '--password', word]);
    assert.equal(r2.code, 2, 'a loose second word is not taken as a password');
    assert.ok(!r2.stderr.includes(word));
  } finally {
    cleanup(parent);
  }
});

test('the password is not read from the environment or from piped input either', () => {
  const { parent, root } = makeVaultProject();
  const out = join(parent, 'keys', 'vault-key-test.abkey');
  try {
    const word = fakePassword();
    const r = runVk(root, ['export', '--out', out, '--password'], { env: { ALTERBRAIN_PASSWORD: word, PASSWORD: word }, input: `${word}\n${word}\n` });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /Type the password in your own terminal window, not through Claude\./);
    assert.match(r.stdout, /Run: node system\/scripts\/vault-key\.mjs export --out .*--password/);
    assert.ok(!existsSync(out));
    assert.ok(!r.stdout.includes(word));
  } finally {
    cleanup(parent);
  }
});

/* ------------------------------ status ------------------------------ */

test('status says encryption is off, in words and as JSON', release(), () => {
  const { parent, root } = makeVaultProject();
  try {
    const plain = runVk(root, ['status']);
    assert.equal(plain.code, 0);
    assert.match(plain.stdout, /Encryption of private notes is off\./);
    const j = json(runVk(root, ['status', '--json']));
    assert.equal(j.ok, true);
    assert.equal(j.status.enabled, false);
    // Onboarding reads this before it offers to install the tool
    assert.equal(j.status.git_crypt_installed, true, 'with the stand-in tool');
    assert.equal(json(runVk(root, ['status', '--json'], { tool: 'none' })).status.git_crypt_installed, false);
  } finally {
    cleanup(parent);
  }
});

/* ------------------------------ setup ------------------------------ */

test('setup without git-crypt installed prints the install command, changes nothing and exits 1', release(), () => {
  const { parent, root } = makeVaultProject({ remote: true });
  try {
    seedNotes(root);
    const before = git(root, ['rev-parse', 'HEAD']);
    const brainBefore = read(root, 'config/brain.json');
    const r = runVk(root, ['setup'], { tool: 'none' });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /not installed/);
    assert.match(r.stdout, process.platform === 'win32' ? /winget install --id AGWA\.git-crypt -e/ : /brew install git-crypt|package manager/);
    assert.equal(git(root, ['rev-parse', 'HEAD']), before);
    assert.equal(read(root, 'config/brain.json'), brainBefore);
    assert.ok(!exists(root, 'vault/80_me/.gitattributes'));
    assert.equal(git(root, ['status', '--porcelain']), '');
    const j = json(runVk(root, ['setup', '--json'], { tool: 'none' }));
    assert.equal(j.ok, false);
    assert.equal(j.error, 'tool-missing');
    assert.ok(j.install);
  } finally {
    cleanup(parent);
  }
});

test('setup refuses while the folder still points at the public Alterbrain page', () => {
  const { parent, root } = makeVaultProject();
  try {
    write(root, 'system/release.json', JSON.stringify({ name: 'alterbrain', repo: 'example-owner/alterbrain' }));
    git(root, ['remote', 'add', 'origin', 'https://github.com/example-owner/alterbrain.git']);
    const r = runVk(root, ['setup']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /public Alterbrain page/);
    assert.ok(!exists(root, 'vault/80_me/.gitattributes'));
  } finally {
    cleanup(parent);
  }
});

test('setup turns encryption on: settings saved first, notes stored encrypted, persona files left alone', release(), () => {
  const { parent, root } = makeVaultProject({ remote: true });
  try {
    seedNotes(root);
    const r = runVk(root, ['setup']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Encryption of your private notes is on\./);
    assert.ok(r.stdout.includes(KEY_LOSS_WARNING), 'the key-loss warning is shown');

    // The settings files were saved on their own, in one commit made before the notes were touched.
    const head = git(root, ['log', '-1', '--format=%s']);
    assert.match(head, /^Encrypt private notes/);
    assert.deepEqual(git(root, ['show', '--name-only', '--format=', 'HEAD']).split('\n').sort(), [
      'vault/60_people/.gitattributes', 'vault/70_journal/.gitattributes', 'vault/80_me/.gitattributes',
    ]);

    // Notes in the index are encrypted from now on. Notes outside the scope are not.
    for (const p of [NOTES.fact, NOTES.user, NOTES.voice, NOTES.person, NOTES.journal]) {
      assert.equal(startsEncrypted(blobAt(root, '', p)), true, `${p} is encrypted in the index`);
      assert.equal(startsEncrypted(stored(root, p)), false, `${p} is still plain in the last commit (the next save encrypts it)`);
    }
    assert.equal(blobAt(root, '', NOTES.soul).toString(), 'Persona notes.\n');
    assert.equal(blobAt(root, '', NOTES.pdf).toString(), 'pretend pdf bytes\n', 'binary files are not touched');

    // On this computer the files stay plain text.
    assert.match(read(root, NOTES.fact), /Nationality: Exampleland/);
    assert.match(read(root, NOTES.person), /Jamie Example/);

    // Settings record the scope (paths only) and no key material.
    const brain = JSON.parse(read(root, 'config/brain.json'));
    assert.deepEqual(brain.privacy.encryption, { enabled: true, tool: 'git-crypt', scope: SCOPE_LABELS, key_backup_checked: null });
    assert.equal(brain.git.auto_commit, true, 'other settings stay');
    assert.ok(!read(root, 'config/brain.json').includes(keyOf(root).toString('base64')));

    // The next save commits the encrypted versions.
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'save']);
    for (const p of [NOTES.fact, NOTES.person]) assert.equal(startsEncrypted(stored(root, p)), true, p);
    assert.equal(stored(root, NOTES.soul).toString(), 'Persona notes.\n');
  } finally {
    cleanup(parent);
  }
});

test('setup can be run again: nothing changes and nothing is saved twice', release(), () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    const before = git(p.root, ['rev-parse', 'HEAD']);
    const keyBefore = keyOf(p.root).toString('hex');
    const r = runVk(p.root, ['setup']);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(git(p.root, ['rev-parse', 'HEAD']), before, 'no new commit');
    assert.equal(keyOf(p.root).toString('hex'), keyBefore, 'the key is kept');
    assert.equal(git(p.root, ['status', '--porcelain']), '');
    assert.match(r.stdout, /kept it|already in place/);
  } finally {
    cleanup(p.parent);
  }
});

test('setup keeps lines it did not write in an existing .gitattributes file', release(), () => {
  const { parent, root } = makeVaultProject();
  try {
    write(root, 'vault/60_people/.gitattributes', '*.vcf text eol=crlf\n');
    seedNotes(root);
    const r = runVk(root, ['setup']);
    assert.equal(r.code, 0, r.stdout);
    const text = read(root, 'vault/60_people/.gitattributes');
    assert.ok(text.startsWith('*.vcf text eol=crlf\n'));
    assert.match(text, /\*\.md filter=git-crypt diff=git-crypt/);
  } finally {
    cleanup(parent);
  }
});

test('status after setup: unlocked, every saved private note encrypted, key backup not tested yet', release(), () => {
  const p = encryptedProject();
  try {
    const r = runVk(p.root, ['status']);
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /Encryption of private notes is on\./);
    assert.match(r.stdout, /unlocked/);
    assert.match(r.stdout, /5 of 5 are encrypted/);
    assert.match(r.stdout, /never tested/);
    const j = json(runVk(p.root, ['status', '--json']));
    assert.equal(j.status.unlocked, true);
    assert.equal(j.status.tracked_in_scope, 5);
    assert.deepEqual(j.status.plain, []);
    assert.deepEqual(j.status.problems, []);
    assert.equal(j.status.key_backup_checked, null);
  } finally {
    cleanup(p.parent);
  }
});

test('status reports a private note stored as plain text, and setup repairs it', release(), () => {
  const p = encryptedProject();
  try {
    // Save a new private note with the encryption step switched off for this one command
    write(p.root, 'vault/60_people/Sam Example.md', '# Sam Example\n');
    git(p.root, ['-c', 'filter.git-crypt.clean=cat', '-c', 'filter.git-crypt.required=false', 'add', 'vault/60_people/Sam Example.md']);
    const r = runVk(p.root, ['status']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /1 private note is stored without encryption/);
    assert.match(r.stdout, /Fix: Run: node system\/scripts\/vault-key\.mjs setup/);
    assert.ok(!r.stdout.includes('Sam Example'), 'file names are not repeated');
    const fixed = runVk(p.root, ['setup']);
    assert.equal(fixed.code, 0, fixed.stdout);
    assert.equal(runVk(p.root, ['status']).code, 0);
    assert.equal(startsEncrypted(blobAt(p.root, '', 'vault/60_people/Sam Example.md')), true);
  } finally {
    cleanup(p.parent);
  }
});

test('status on a copy that has no key says it is locked and how to unlock', release(), () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = join(p.parent, 'other');
    git(p.parent, ['clone', '-q', p.bare, clone]);
    const r = runVk(clone, ['status']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /LOCKED/);
    assert.match(r.stdout, /Fix: Run: node system\/scripts\/vault-key\.mjs unlock --key <your key file>/);
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ export ------------------------------ */

test('export saves the key outside the project, prints the key-loss warning twice over, and never prints the key', release(), () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.key');
    const r = runVk(p.root, ['export', '--out', out]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.ok(keyOf(p.root).equals(readFileSync(out)), 'the copy is the key of this computer');
    assert.ok(r.stdout.includes(KEY_LOSS_WARNING));
    assert.match(r.stdout, /Forgetting only the password/);
    assert.match(r.stdout, /Saved a copy of your key file/);
    assert.match(r.stdout, /no password, so keep it somewhere only you can open/);
    for (const form of ['hex', 'base64']) assert.ok(!r.stdout.includes(keyOf(p.root).toString(form)), `the key is not printed (${form})`);
    // Nothing is left in the temporary folder
    const tmp = join(p.root, 'state', 'local', 'tmp');
    assert.deepEqual(existsSync(tmp) ? readdirSync(tmp).filter((f) => f.startsWith('vault-key-')) : [], []);

    // A second export does not replace the first unless asked.
    const again = runVk(p.root, ['export', '--out', out]);
    assert.equal(again.code, 1);
    assert.match(again.stdout, /already a file/);
    assert.equal(runVk(p.root, ['export', '--out', out, '--overwrite']).code, 0);
  } finally {
    cleanup(p.parent);
  }
});

test('export refuses to put the key inside the project, however the path is written', release(), () => {
  const p = encryptedProject();
  try {
    const cases = [
      join(p.root, 'vault-key-x.key'),
      join(p.root, 'vault', '80_me', 'backup.abkey'),
      join(p.root, 'vault', '..', 'k.abkey'),
      join(p.root, '.git', 'k.key'),
      'relative-key.abkey', // relative to the folder the command runs in, which is the project
    ];
    for (const out of cases) {
      const r = runVk(p.root, ['export', '--out', out]);
      assert.equal(r.code, 1, out);
      assert.match(r.stdout, /cannot be saved inside this project folder/, out);
    }
    // through a link that leads back into the project
    const outside = join(p.parent, 'outside');
    mkdirSync(outside, { recursive: true });
    let linked = false;
    try {
      symlinkSync(p.root, join(outside, 'link'), 'junction');
      linked = true;
    } catch {
      /* links are not allowed here */
    }
    if (linked) {
      const r = runVk(p.root, ['export', '--out', join(outside, 'link', 'k.abkey')]);
      assert.equal(r.code, 1);
      assert.match(r.stdout, /inside this project folder/);
      assert.ok(!exists(p.root, 'k.abkey'));
    }
    assert.ok(!exists(p.root, 'relative-key.abkey') && !exists(p.root, 'vault-key-x.key') && !exists(p.root, 'vault/80_me/backup.abkey'));
    assert.equal(git(p.root, ['status', '--porcelain', '--', '*.abkey', '*.key']), '');
    const j = json(runVk(p.root, ['export', '--out', join(p.root, 'k.abkey'), '--json']));
    assert.equal(j.ok, false);
    assert.equal(j.error, 'inside-project');
  } finally {
    cleanup(p.parent);
  }
});

test('export with a password refuses when there is no keyboard, before anything is exported', release(), () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.abkey');
    const r = runVk(p.root, ['export', '--out', out, '--password']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /Type the password in your own terminal window, not through Claude\./);
    assert.match(r.stdout, /Run: node system\/scripts\/vault-key\.mjs export --out .+ --password/);
    assert.ok(!existsSync(out));
    const tmp = join(p.root, 'state', 'local', 'tmp');
    assert.deepEqual(existsSync(tmp) ? readdirSync(tmp).filter((f) => f.startsWith('vault-key-')) : [], [], 'no key was exported to a temporary file');
    const j = json(runVk(p.root, ['export', '--out', out, '--password', '--json']));
    assert.equal(j.error, 'needs-terminal');
    assert.match(j.run, /^node system\/scripts\/vault-key\.mjs export/);
  } finally {
    cleanup(p.parent);
  }
});

test('export with a password asks twice, needs 10 characters, and the file opens only with that password', release(), async () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.abkey');
    const good = fakePassword();
    const answers = ['short', good, `${good}x`, good, good]; // too short; then a mismatch; then right
    const asked = [];
    const printed = [];
    const res = await vk(p.root, ['export', '--out', out, '--password'], {
      getPassword: async (prompt) => {
        asked.push(prompt);
        return answers.shift();
      },
      print: (t) => printed.push(t),
    });
    assert.equal(res.code, 0, res.stdout);
    assert.ok(printed.some((t) => /at least 10 characters/.test(t)));
    assert.ok(printed.some((t) => /did not match/.test(t)));
    assert.ok(printed.some((t) => /four unrelated words/.test(t)));
    assert.ok(printed.some((t) => /no password of its own/.test(t)), 'the password framing is said before asking');
    assert.deepEqual(asked.filter((a) => a.startsWith('Type it again')).length, 2);

    const file = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(file.format, 'alterbrain-vault-key');
    assert.equal(file.kdf.N, CHEAP.N, 'the test cost was used');
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(keyOf(p.root).toString('base64')), 'the key is not in the file in the clear');
    assert.ok(res.stdout.includes('protected by the password you chose'));
    assert.ok(res.stdout.includes(KEY_LOSS_WARNING));
    assert.ok(!res.stdout.includes(good) && !printed.join('\n').includes(good));
    const tmp = join(p.root, 'state', 'local', 'tmp');
    assert.deepEqual(existsSync(tmp) ? readdirSync(tmp).filter((f) => f.startsWith('vault-key-')) : [], []);
  } finally {
    cleanup(p.parent);
  }
});

test('export gives up after three bad passwords and saves nothing', release(), async () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.abkey');
    const res = await vk(p.root, ['export', '--out', out, '--password'], { getPassword: async () => 'short' });
    assert.equal(res.code, 1);
    assert.ok(!existsSync(out));
  } finally {
    cleanup(p.parent);
  }
});

test('export on a locked copy says there is no key to copy', release(), () => {
  const p = encryptedProject();
  try {
    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    const clone = join(p.parent, 'other');
    git(p.parent, ['clone', '-q', p.bare, clone]);
    const r = runVk(clone, ['export', '--out', join(p.parent, 'keys', 'k.key')]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /no key to copy/);
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ check (the recovery drill) ------------------------------ */

test('check proves a plain key copy works and notes the date', release(), async () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.key');
    assert.equal(runVk(p.root, ['export', '--out', out]).code, 0);
    const r = runVk(p.root, ['check', '--key', out]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Your key backup works\./);
    const brain = JSON.parse(read(p.root, 'config/brain.json'));
    assert.match(brain.privacy.encryption.key_backup_checked, /^\d{4}-\d{2}-\d{2}$/);
    const status = json(runVk(p.root, ['status', '--json'])).status;
    assert.equal(status.key_backup_checked, brain.privacy.encryption.key_backup_checked);
    assert.deepEqual(status.notes, [], 'the reminder is gone');
  } finally {
    cleanup(p.parent);
  }
});

test('check with a password: right password works, wrong password and a changed file give plain messages', release(), async () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.abkey');
    const pw = fakePassword();
    const exported = await vk(p.root, ['export', '--out', out, '--password'], { getPassword: async () => pw });
    assert.equal(exported.code, 0, exported.stdout);

    const ok = await vk(p.root, ['check', '--key', out], { getPassword: async () => pw });
    assert.equal(ok.code, 0, ok.stdout);
    assert.match(ok.stdout, /Your key backup works\./);
    assert.match(ok.stdout, /password is right/);

    // wrong password: three tries, then a plain message
    let tries = 0;
    const wrong = await vk(p.root, ['check', '--key', out], { getPassword: async () => (tries++, `${pw}-wrong`) });
    assert.equal(wrong.code, 1);
    assert.equal(tries, 3);
    assert.match(wrong.stdout, /That password does not open this key file/);
    assert.ok(!/\bat file:|node:|\.mjs|Error:/.test(wrong.stdout), 'no stack trace');

    // a changed file
    const file = JSON.parse(readFileSync(out, 'utf8'));
    const ct = Buffer.from(file.ct, 'base64');
    ct[3] ^= 0xff;
    const tampered = join(p.parent, 'keys', 'tampered.abkey');
    writeFileSync(tampered, JSON.stringify({ ...file, ct: ct.toString('base64') }));
    const t = await vk(p.root, ['check', '--key', tampered], { getPassword: async () => pw });
    assert.equal(t.code, 1);
    assert.match(t.stdout, /changed or damaged/);
    assert.ok(!/\bat file:|node:|\.mjs|Error:/.test(t.stdout));

    // a cut-short file is not retried with more passwords
    writeFileSync(tampered, readFileSync(out, 'utf8').slice(0, 60));
    let asked = 0;
    const cut = await vk(p.root, ['check', '--key', tampered], { getPassword: async () => (asked++, pw) });
    assert.equal(cut.code, 1);
    assert.equal(asked, 0, 'a file that is not a key file does not even ask for a password');
    assert.match(cut.stdout, /damaged or cut short/);
  } finally {
    cleanup(p.parent);
  }
});

test('check refuses a key file that does not match this computer', release(), async () => {
  const p = encryptedProject();
  const other = makeVaultProject();
  try {
    const wrong = join(p.parent, 'keys', 'vault-key-other.key');
    mkdirSync(join(p.parent, 'keys'), { recursive: true });
    writeFileSync(wrong, fakeKeyBytes());
    const r = runVk(p.root, ['check', '--key', wrong]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /does not match the key on this computer/);
    assert.equal(JSON.parse(read(p.root, 'config/brain.json')).privacy.encryption.key_backup_checked, null, 'a failed check records nothing');
    const missing = runVk(p.root, ['check', '--key', join(p.parent, 'keys', 'nope.key')]);
    assert.equal(missing.code, 1);
    assert.match(missing.stdout, /can't find the key file/);
    const empty = join(p.parent, 'keys', 'empty.key');
    writeFileSync(empty, '');
    assert.match(runVk(p.root, ['check', '--key', empty]).stdout, /is empty/);
  } finally {
    cleanup(p.parent, other.parent);
  }
});

test('check of a wrapped key without a keyboard refuses and asks for a real terminal', release(), async () => {
  const p = encryptedProject();
  try {
    const file = join(p.parent, 'keys', 'vault-key-test.abkey');
    mkdirSync(join(p.parent, 'keys'), { recursive: true });
    writeFileSync(file, JSON.stringify(wrapKey(keyOf(p.root), fakePassword(), CHEAP)));
    const r = runVk(p.root, ['check', '--key', file]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /Type the password in your own terminal window, not through Claude\./);
    assert.match(r.stdout, /Run: node system\/scripts\/vault-key\.mjs check --key /);
    const u = runVk(p.root, ['unlock', '--key', file]);
    assert.equal(u.code, 0, 'an unlocked computer has nothing to unlock');
    assert.match(u.stdout, /already unlocked/);
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ unlock (a new computer) ------------------------------ */

/** Push the encrypted state, then clone it somewhere else: a computer that has no key. */
function newComputer(p) {
  git(p.root, ['add', '-A']);
  git(p.root, ['commit', '-q', '-m', 'save']);
  git(p.root, ['push', '-q']);
  const clone = join(p.parent, 'other');
  git(p.parent, ['clone', '-q', p.bare, clone]);
  git(clone, ['config', 'user.name', 'Alex Doe']);
  git(clone, ['config', 'user.email', 'alex@example.invalid']);
  git(clone, ['config', 'commit.gpgsign', 'false']);
  return clone;
}

test('what GitHub holds is encrypted, and a new computer sees it locked', release(), () => {
  const p = encryptedProject();
  try {
    const clone = newComputer(p);
    const online = blobAt(p.bare, 'main', NOTES.fact);
    assert.equal(startsEncrypted(online), true, 'the online copy of a private note is encrypted');
    assert.ok(!online.toString('latin1').includes('Exampleland'), 'the note text is not in the online copy');
    assert.equal(blobAt(p.bare, 'main', NOTES.soul).toString(), 'Persona notes.\n');
    // The clone has the scrambled files on disk
    assert.equal(startsEncrypted(readFileSync(join(clone, ...NOTES.fact.split('/')))), true);
  } finally {
    cleanup(p.parent);
  }
});

test('unlock with a plain key copy decrypts the notes on a new computer', release(), () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.key');
    assert.equal(runVk(p.root, ['export', '--out', out]).code, 0);
    const clone = newComputer(p);
    const r = runVk(clone, ['unlock', '--key', out]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Unlocked\. Your private notes are readable on this computer\./);
    assert.match(r.stdout, /5 private notes decrypted/);
    assert.match(read(clone, NOTES.fact), /Nationality: Exampleland/);
    assert.match(read(clone, NOTES.person), /Jamie Example/);
    assert.equal(runVk(clone, ['status']).code, 0);
    // The key is kept inside .git and the temporary copy is gone.
    assert.ok(existsSync(join(clone, '.git', 'git-crypt', 'keys', 'default')));
    const tmp = join(clone, 'state', 'local', 'tmp');
    assert.deepEqual(existsSync(tmp) ? readdirSync(tmp).filter((f) => f.startsWith('vault-key-')) : [], []);
    // From now on saving works and stores new notes encrypted.
    write(clone, 'vault/70_journal/daily/2026-10-08.md', 'Back on a new laptop.\n');
    git(clone, ['add', '-A']);
    assert.equal(startsEncrypted(blobAt(clone, '', 'vault/70_journal/daily/2026-10-08.md')), true);
    // Running it again is harmless.
    assert.match(runVk(clone, ['unlock', '--key', out]).stdout, /already unlocked/);
  } finally {
    cleanup(p.parent);
  }
});

test('unlock with a password-protected copy, and with unsaved changes in the folder', release(), async () => {
  const p = encryptedProject();
  try {
    const out = join(p.parent, 'keys', 'vault-key-test.abkey');
    const pw = fakePassword();
    assert.equal((await vk(p.root, ['export', '--out', out, '--password'], { getPassword: async () => pw })).code, 0);
    const clone = newComputer(p);
    write(clone, NOTES.task, `${read(clone, NOTES.task)}- [ ] a task that was added before unlocking\n`); // a change outside the private notes

    // refused without a keyboard
    const noKeyboard = runVk(clone, ['unlock', '--key', out]);
    assert.equal(noKeyboard.code, 1);
    assert.match(noKeyboard.stdout, /Type the password in your own terminal window, not through Claude\./);
    assert.equal(startsEncrypted(readFileSync(join(clone, ...NOTES.fact.split('/')))), true, 'nothing was unlocked');

    // wrong password first, then the right one
    const answers = [`${pw}-wrong`, pw];
    const res = await vk(clone, ['unlock', '--key', out], { getPassword: async () => answers.shift() });
    assert.equal(res.code, 0, res.stdout);
    assert.match(res.stdout, /Saved 1 other changed file first/);
    assert.match(read(clone, NOTES.fact), /Exampleland/);
    assert.equal(git(clone, ['status', '--porcelain']), '');
    assert.match(git(clone, ['log', '-1', '--format=%s']), /save before unlocking/);
  } finally {
    cleanup(p.parent);
  }
});

test('setup on a copy that holds encrypted notes made elsewhere refuses and points to unlock', release(), () => {
  const p = encryptedProject();
  try {
    const clone = newComputer(p);
    const r = runVk(clone, ['setup']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /already holds encrypted notes/);
    assert.match(r.stdout, /unlock --key <your key file>/);
    assert.ok(!existsSync(join(clone, '.git', 'git-crypt')), 'no second key was created');
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ documents and pictures ------------------------------ */

test('setup also encrypts documents and pictures in the private folders; other files are not touched', release(), () => {
  const p = makeVaultProject({ remote: true });
  try {
    seedNotes(p.root);
    seedDocuments(p.root);
    git(p.root, ['push', '-q']);
    const r = runVk(p.root, ['setup']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    // In the index, ready for the next save: the three private documents are encrypted
    for (const path of Object.values(DOC_PATHS)) assert.equal(startsEncrypted(blobAt(p.root, '', path)), true, `${path} is encrypted in the index`);
    // Not private: stored as they were
    for (const path of Object.values(NOT_PRIVATE)) assert.ok(blobAt(p.root, '', path).equals(DOCS.pdf), `${path} is untouched`);
    // On this computer the files stay what they were, byte for byte
    for (const k of Object.keys(DOC_PATHS)) assert.ok(readFileSync(join(p.root, ...DOC_PATHS[k].split('/'))).equals(DOCS[k]), `${DOC_PATHS[k]} is unchanged on disk`);
    const status = json(runVk(p.root, ['status', '--json'])).status;
    assert.equal(status.tracked_in_scope, 8, '5 notes and 3 documents');
    assert.deepEqual(status.plain, []);
    assert.deepEqual(status.not_covered, []);
    assert.equal(runVk(p.root, ['status']).code, 0);

    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    for (const path of Object.values(DOC_PATHS)) assert.equal(startsEncrypted(blobAt(p.bare, 'main', path)), true, `${path} is encrypted online`);
    assert.ok(blobAt(p.bare, 'main', NOT_PRIVATE.wikiPdf).equals(DOCS.pdf));
    // A new document later is encrypted by the normal save
    putBytes(p.root, 'vault/60_people/Jamie Example CV.pdf', DOCS.pdf);
    git(p.root, ['add', '-A']);
    assert.equal(startsEncrypted(blobAt(p.root, '', 'vault/60_people/Jamie Example CV.pdf')), true);
  } finally {
    cleanup(p.parent);
  }
});

test('documents and pictures come back byte for byte on a new computer', release(), () => {
  const p = makeVaultProject({ remote: true });
  try {
    seedNotes(p.root);
    seedDocuments(p.root);
    git(p.root, ['push', '-q']);
    assert.equal(runVk(p.root, ['setup']).code, 0);
    const key = join(p.parent, 'keys', 'vault-key-test.key');
    assert.equal(runVk(p.root, ['export', '--out', key]).code, 0);
    const clone = newComputer(p);
    for (const k of Object.keys(DOC_PATHS)) {
      assert.equal(startsEncrypted(readFileSync(join(clone, ...DOC_PATHS[k].split('/')))), true, `${DOC_PATHS[k]} is scrambled before unlocking`);
    }
    const u = runVk(clone, ['unlock', '--key', key]);
    assert.equal(u.code, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /8 private notes decrypted/);
    for (const k of Object.keys(DOC_PATHS)) assert.ok(readFileSync(join(clone, ...DOC_PATHS[k].split('/'))).equals(DOCS[k]), `${DOC_PATHS[k]} is the original`);
    for (const path of Object.values(NOT_PRIVATE)) assert.ok(readFileSync(join(clone, ...path.split('/'))).equals(DOCS.pdf));
    assert.equal(git(clone, ['status', '--porcelain']), '', 'nothing looks changed after unlocking');
  } finally {
    cleanup(p.parent);
  }
});

/* ------------------------------ the real tool ------------------------------ */

test('with the real git-crypt: setup, export, check, then unlock on a new computer', release({ skip: !REAL_GIT_CRYPT && 'git-crypt is not installed' }), () => {
  const p = makeVaultProject({ remote: true });
  try {
    seedNotes(p.root);
    seedDocuments(p.root);
    git(p.root, ['push', '-q']);
    const s = runVk(p.root, ['setup'], { tool: 'real' });
    assert.equal(s.code, 0, s.stdout + s.stderr);
    for (const path of [NOTES.fact, NOTES.person, NOTES.journal, ...Object.values(DOC_PATHS)]) assert.equal(startsEncrypted(blobAt(p.root, '', path)), true, path);
    assert.ok(blobAt(p.root, '', NOT_PRIVATE.wikiPdf).equals(DOCS.pdf), 'a document outside the private folders is not touched');
    assert.equal(runVk(p.root, ['status'], { tool: 'real' }).code, 0);
    assert.equal(classifyHook(p.root), 'ours', 'setup installed the upload check');

    const out = join(p.parent, 'keys', 'vault-key-real.key');
    assert.equal(runVk(p.root, ['export', '--out', out], { tool: 'real' }).code, 0);
    const c = runVk(p.root, ['check', '--key', out], { tool: 'real' });
    assert.equal(c.code, 0, c.stdout);

    git(p.root, ['add', '-A']);
    git(p.root, ['commit', '-q', '-m', 'save']);
    git(p.root, ['push', '-q']);
    assert.equal(startsEncrypted(blobAt(p.bare, 'main', NOTES.fact)), true, 'GitHub holds the encrypted version');
    const clone = join(p.parent, 'other');
    git(p.parent, ['clone', '-q', p.bare, clone]);
    assert.equal(runVk(clone, ['status'], { tool: 'real' }).code, 1, 'locked before unlocking');
    for (const path of Object.values(DOC_PATHS)) assert.equal(startsEncrypted(blobAt(p.bare, 'main', path)), true, `${path} is encrypted online`);
    const u = runVk(clone, ['unlock', '--key', out], { tool: 'real' });
    assert.equal(u.code, 0, u.stdout + u.stderr);
    assert.match(read(clone, NOTES.fact), /Exampleland/);
    assert.equal(runVk(clone, ['status'], { tool: 'real' }).code, 0);
    for (const k of Object.keys(DOC_PATHS)) assert.ok(readFileSync(join(clone, ...DOC_PATHS[k].split('/'))).equals(DOCS[k]), `${DOC_PATHS[k]} came back byte for byte (CRLF and NUL bytes included)`);
    assert.equal(git(clone, ['status', '--porcelain']), '', 'nothing looks changed after unlocking');
    assert.equal(classifyHook(clone), 'ours', 'unlock installed the upload check on the new computer');

    // The case the upload check exists for, with the real tool: a new computer that is NOT unlocked commits a new private note as
    // plain text (no encryption step is configured there), and the upload is refused.
    const fresh = join(p.parent, 'third');
    git(p.parent, ['clone', '-q', p.bare, fresh]);
    git(fresh, ['config', 'user.name', 'Alex Doe']);
    git(fresh, ['config', 'user.email', 'alex@example.invalid']);
    assert.equal(ensurePrePushHook(fresh).state, 'active');
    write(fresh, 'vault/60_people/New Contact.md', '# New Contact\n\nA phone number.\n');
    git(fresh, ['add', '-A']);
    git(fresh, ['commit', '-q', '-m', 'Obsidian Git: vault backup']);
    assert.equal(startsEncrypted(blobAt(fresh, 'HEAD', 'vault/60_people/New Contact.md')), false, 'stored as plain text, as the real tool leaves it without a key');
    const refused = gitTry(fresh, ['push', 'origin', 'main']);
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, /Alterbrain stopped this upload because one of your private notes would have been sent without encryption/);
    assert.equal(git(p.bare, ['log', '--oneline', '-1', '--format=%s']), 'save', 'nothing was uploaded');
  } finally {
    cleanup(p.parent);
  }
});

test('the stand-in tool is found by the library only through the setting made for tests', () => {
  const prev = process.env.ALTERBRAIN_GIT_CRYPT;
  try {
    process.env.ALTERBRAIN_GIT_CRYPT = FAKE_GIT_CRYPT;
    assert.ok(resolveGitCrypt());
    process.env.ALTERBRAIN_GIT_CRYPT = join(FAKE_GIT_CRYPT, '..', 'no-such-tool.exe');
    assert.equal(resolveGitCrypt(), null);
  } finally {
    if (prev === undefined) delete process.env.ALTERBRAIN_GIT_CRYPT;
    else process.env.ALTERBRAIN_GIT_CRYPT = prev;
    resolveGitCrypt({ fresh: true });
  }
});
