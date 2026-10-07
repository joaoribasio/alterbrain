#!/usr/bin/env node
// A stand-in for git-crypt, used by the tests when the real tool is not installed (ALTERBRAIN_GIT_CRYPT points here).
//
// This is NOT encryption. It copies the behaviour the scripts depend on: a key file in .git/git-crypt/keys/default,
// the git filter settings, a clean step that stores files with the git-crypt header (a NUL byte, "GITCRYPT", a NUL
// byte), a smudge step that reverses it, export-key, and unlock (which wants a tidy folder and decrypts the files).
// The scrambling is a plain XOR with the key, only so that a stored file is not readable as text.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER = Buffer.from([0x00, 0x47, 0x49, 0x54, 0x43, 0x52, 0x59, 0x50, 0x54, 0x00]);
const [command, ...args] = process.argv.slice(2);

const fail = (message, code = 1) => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

function git(gitArgs, opts = {}) {
  const r = spawnSync('git', gitArgs, { encoding: 'utf8', windowsHide: true, ...opts });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function gitDir() {
  const r = git(['rev-parse', '--absolute-git-dir']);
  if (!r.ok) fail('Error: not a git repository');
  return r.stdout;
}

const keyPath = () => join(gitDir(), 'git-crypt', 'keys', 'default');

function readKey() {
  const file = keyPath();
  return existsSync(file) ? readFileSync(file) : null;
}

const xor = (data, key) => {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
};

function configure() {
  const quote = (p) => `"${p.replace(/\\/g, '/')}"`;
  const base = `${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))}`;
  git(['config', '--local', 'filter.git-crypt.smudge', `${base} smudge`]);
  git(['config', '--local', 'filter.git-crypt.clean', `${base} clean`]);
  git(['config', '--local', 'filter.git-crypt.required', 'true']);
  git(['config', '--local', 'diff.git-crypt.textconv', `${base} diff`]);
}

function stdinBytes() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks)));
  });
}

const encrypt = (data, key) => {
  if (data.length === 0) return data; // empty files stay empty
  if (data.subarray(0, HEADER.length).equals(HEADER)) return data;
  const nonce = createHash('sha256').update(key).update(data).digest().subarray(0, 12);
  return Buffer.concat([HEADER, nonce, xor(data, key)]);
};

const decrypt = (data, key) => (data.subarray(0, HEADER.length).equals(HEADER) ? xor(data.subarray(HEADER.length + 12), key) : data);

if (command === '--version') {
  // The real git-crypt 0.7.0 prints its version on stdout and exits 0. FAKE_GIT_CRYPT_VERSION_ON=stderr copies builds that used stderr.
  (process.env.FAKE_GIT_CRYPT_VERSION_ON === 'stderr' ? process.stderr : process.stdout).write('git-crypt 0.0.0-fake\n');
} else if (command === 'init') {
  if (readKey()) fail('Error: this repository has already been initialized with git-crypt.');
  const file = keyPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([Buffer.from('\0GITCRYPTKEY'), randomBytes(136)]));
  configure();
} else if (command === 'export-key') {
  if (!readKey()) fail('Error: this repository has not been initialized with git-crypt, or is locked.');
  if (!args[0]) fail('Usage: git-crypt export-key FILENAME');
  copyFileSync(keyPath(), args[0]);
} else if (command === 'unlock') {
  if (!args[0] || !existsSync(args[0])) fail('Error: key file not found.');
  // Like the real tool: changes to files git tracks stop an unlock; untracked files do not.
  if (git(['status', '--porcelain', '--untracked-files=no']).stdout) {
    fail("Error: Working directory not clean.\nPlease commit your changes or 'git stash' them before running 'git-crypt unlock'.");
  }
  const file = keyPath();
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(args[0], file);
  configure();
  const top = git(['rev-parse', '--show-toplevel']).stdout;
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: top, encoding: 'utf8', windowsHide: true }).stdout || '';
  const files = listed.split('\0').filter(Boolean);
  const attrs = spawnSync('git', ['check-attr', '-z', '--stdin', 'filter'], { cwd: top, input: `${files.join('\0')}\0`, encoding: 'utf8', windowsHide: true }).stdout || '';
  const parts = attrs.split('\0');
  const encrypted = [];
  for (let i = 0; i + 2 < parts.length; i += 3) if (parts[i + 2] === 'git-crypt') encrypted.push(parts[i]);
  // Git does not rewrite a file it believes is already checked out, so the stored copies are removed first.
  for (const file of encrypted) rmSync(join(top, file), { force: true });
  for (let i = 0; i < encrypted.length; i += 100) {
    const co = spawnSync('git', ['checkout', '-f', 'HEAD', '--', ...encrypted.slice(i, i + 100)], { cwd: top, encoding: 'utf8', windowsHide: true });
    if (co.status !== 0) fail(`Error: could not decrypt files: ${co.stderr}`);
  }
} else if (command === 'clean') {
  const key = readKey();
  if (!key) fail('Error: no key, cannot encrypt.');
  process.stdout.write(encrypt(await stdinBytes(), key));
} else if (command === 'smudge') {
  const key = readKey();
  const data = await stdinBytes();
  process.stdout.write(key ? decrypt(data, key) : data);
} else if (command === 'diff') {
  const key = readKey();
  const data = args[0] && existsSync(args[0]) ? readFileSync(args[0]) : Buffer.alloc(0);
  process.stdout.write(key ? decrypt(data, key) : data);
} else {
  fail(`Usage: fake git-crypt (unknown command ${command})`, 2);
}
