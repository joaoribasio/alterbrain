// Optional encryption of the user's most private notes before they reach GitHub (ADR 0019).
//
// The encrypting is done by git-crypt, a free tool we never bundle or download. Files stay plain on the
// user's computer; git-crypt encrypts them when git saves them, and decrypts them when they are checked out
// on a computer that holds the key. This file holds the logic that is shared by:
//   - system/scripts/vault-key.mjs   (status, setup, export, check, unlock)
//   - system/scripts/git-auto.mjs    (the automatic save: never stage private notes it cannot encrypt,
//                                      never push one that is stored as plain text)
//   - system/hooks/session_start.mjs and system/scripts/doctor.mjs (warnings)
//   - system/scripts/git-hooks/pre-push.mjs (the upload check that git itself runs, so Obsidian Git is covered too)
//
// Nothing here ever prints, logs or stores key material or a password. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { readJsonChecked, writeJson } from './fsx.mjs';
import { IS_WINDOWS, run } from './proc.mjs';
import { GIT_ENV, git, lfsInstallCommand } from './git.mjs';

/* ------------------------------------------------------------------ */
/* Plain-language texts shared by the script, the hooks and the docs    */
/* ------------------------------------------------------------------ */

export const KEY_LOSS_WARNING =
  'If you lose the key file (and its password, if you set one) and also lose this laptop, your encrypted notes on GitHub cannot be recovered. ' +
  'Not by GitHub, not by Anthropic, not by me. The rest of your brain is unaffected. ' +
  'Keep the key in two places: your password manager and one other (a USB stick or a cloud folder).';

export const PASSWORD_ONLY_NOTE =
  'Forgetting only the password, while this laptop still works, is recoverable: export a new copy of the key file from this laptop.';

export const PASSWORD_EXPLANATION =
  'The encryption tool (git-crypt) has no password of its own. It uses a key file, a small file that unlocks your notes, like a house key. ' +
  'The optional password protects the backup copy of that file, so the copy can sit in cloud storage or an email safely. ' +
  'On this laptop the key lives inside the hidden .git folder and nothing needs typing.';

/** The one-line install command for this computer. */
export function installCommand() {
  if (IS_WINDOWS) return 'winget install --id AGWA.git-crypt -e';
  if (process.platform === 'darwin') return 'brew install git-crypt';
  return 'Install git-crypt with your package manager (for example: sudo apt install git-crypt)';
}

/** Which of the user's unlock commands to show in messages. */
export const UNLOCK_COMMAND = 'node system/scripts/vault-key.mjs unlock --key <your key file>';

/**
 * What the upload check (git-hooks/pre-push.mjs) says when it refuses. The refusal always starts with this sentence, so
 * another tool can recognise it in git's output. The two task texts are the same ones the automatic save uses, so
 * the task list never gets the same warning twice.
 */
export const PUSH_REFUSED_PREFIX = 'Alterbrain stopped this upload';
export const PUSH_PLAIN_TASK_TEXT =
  'Alterbrain stopped the online backup because some of your private notes were about to be uploaded without encryption. Nothing was uploaded. Open Claude and type /health-check';
export const PUSH_UNCHECKED_TASK_TEXT =
  'Alterbrain could not check that your private notes are encrypted, so it did not back up online. Nothing was uploaded. Open Claude and type /health-check';

/* ------------------------------------------------------------------ */
/* Scope: which files are encrypted                                    */
/* ------------------------------------------------------------------ */

/** Notes and their data files. */
export const NOTE_EXTENSIONS = ['md', 'json', 'txt', 'csv', 'yml', 'yaml', 'base', 'canvas'];

/**
 * Documents and pictures. Ordinary files of this kind are normal git files (only files of 50 MB or more use Git LFS,
 * by exact path), so they can be encrypted too. A private file of 50 MB or more cannot be both: one file cannot use
 * Git LFS and git-crypt, so such a file is kept off the online backup instead (the automatic save adds a task).
 */
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'rtf', 'odt'];

/** Every file type that is encrypted when it sits in an encrypted folder. */
export const ENCRYPTED_EXTENSIONS = [...NOTE_EXTENSIONS, ...DOCUMENT_EXTENSIONS];

/**
 * The default scope. `dir` gets its own .gitattributes file. `files` are exact names directly inside it.
 * `folders` are sub-folders (any depth); the empty name means the whole of `dir`.
 * Not encrypted on purpose: SOUL.md and IDENTITY.md (persona only, read by every session) and brand/.
 */
export const ENCRYPTED_SCOPE = [
  { dir: 'vault/80_me', files: ['fact-sheet.md', 'USER.md', 'MEMORY.md'], folders: ['voice', 'private'] },
  { dir: 'vault/60_people', files: [], folders: [''] },
  { dir: 'vault/70_journal', files: [], folders: [''] },
];

/** Paths only, as recorded in config/brain.json (privacy.encryption.scope). */
export const SCOPE_LABELS = ENCRYPTED_SCOPE.flatMap((e) => [
  ...e.files.map((f) => `${e.dir}/${f}`),
  ...e.folders.map((f) => (f ? `${e.dir}/${f}/` : `${e.dir}/`)),
]);

/** The folders that hold encrypted notes (a git pathspec that covers every encrypted path). */
export const SCOPE_DIRS = ENCRYPTED_SCOPE.map((e) => e.dir);

const normRel = (rel) => String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');

/**
 * Is this project-relative path in the encrypted scope? Matching ignores case on purpose: Windows and macOS
 * ignore case, so a differently spelled path is the same file there, and a guard that misses it would leak.
 */
export function isEncryptedPath(rel) {
  const low = normRel(rel).toLowerCase();
  const ext = extname(low).slice(1);
  if (!ENCRYPTED_EXTENSIONS.includes(ext)) return false;
  for (const e of ENCRYPTED_SCOPE) {
    const prefix = `${e.dir.toLowerCase()}/`;
    if (!low.startsWith(prefix)) continue;
    const inner = low.slice(prefix.length);
    if (e.files.some((f) => inner === f.toLowerCase())) return true;
    for (const folder of e.folders) {
      if (folder === '' || inner.startsWith(`${folder.toLowerCase()}/`)) return true;
    }
  }
  return false;
}

/** Git pathspecs that keep every encrypted path out of `git add` (used when a copy cannot encrypt). */
export function excludePathspecs() {
  const out = [];
  for (const e of ENCRYPTED_SCOPE) {
    for (const f of e.files) out.push(`:(exclude,icase)${e.dir}/${f}`);
    for (const folder of e.folders) {
      const base = folder ? `${e.dir}/${folder}` : e.dir;
      for (const x of ENCRYPTED_EXTENSIONS) out.push(`:(exclude,icase,glob)${base}/**/*.${x}`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The .gitattributes files                                            */
/* ------------------------------------------------------------------ */

export const ATTR_BLOCK_START = '# >>> alterbrain: encrypted private notes (written by vault-key.mjs, please do not edit)';
export const ATTR_BLOCK_END = '# <<< alterbrain';
const ATTR = 'filter=git-crypt diff=git-crypt';
// Documents and pictures are binary data: "-text" keeps git from ever changing line endings inside them.
const ATTR_BINARY = `${ATTR} -text`;

/** The attribute lines for one folder, between the markers. */
export function attributeBlock(entry) {
  const lines = [ATTR_BLOCK_START];
  for (const f of entry.files) lines.push(`/${f} ${ATTR}`);
  for (const folder of entry.folders) {
    for (const x of ENCRYPTED_EXTENSIONS) {
      const attr = DOCUMENT_EXTENSIONS.includes(x) ? ATTR_BINARY : ATTR;
      lines.push(folder ? `/${folder}/**/*.${x} ${attr}` : `*.${x} ${attr}`);
    }
  }
  lines.push('.gitattributes !filter !diff', ATTR_BLOCK_END);
  return lines.join('\n');
}

export const attributeFileRel = (entry) => `${entry.dir}/.gitattributes`;
const attributeFileAbs = (root, entry) => join(root, ...attributeFileRel(entry).split('/'));

/** Put our block into existing text: replace a previous block, or append after what the file already says. */
export function mergeAttributeText(existing, block) {
  const text = String(existing || '').replace(/\r\n/g, '\n');
  const start = text.indexOf(ATTR_BLOCK_START);
  const end = text.indexOf(ATTR_BLOCK_END);
  if (start !== -1 && end > start) {
    return `${text.slice(0, start)}${block}${text.slice(end + ATTR_BLOCK_END.length)}`.replace(/\n*$/, '\n');
  }
  const kept = text.replace(/\n*$/, '');
  return `${kept ? `${kept}\n\n` : ''}${block}\n`;
}

/** Write the attribute files. Returns the project-relative paths that changed. */
export function writeAttributeFiles(root) {
  const changed = [];
  for (const entry of ENCRYPTED_SCOPE) {
    const file = attributeFileAbs(root, entry);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const after = mergeAttributeText(before, attributeBlock(entry));
    if (after !== before.replace(/\r\n/g, '\n')) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, after, 'utf8');
      changed.push(attributeFileRel(entry));
    }
  }
  return changed;
}

/** The folders whose attribute file does not carry our block. */
export function attributeFilesMissing(root) {
  return ENCRYPTED_SCOPE.filter((entry) => {
    const file = attributeFileAbs(root, entry);
    return !(existsSync(file) && readFileSync(file, 'utf8').includes('filter=git-crypt'));
  }).map(attributeFileRel);
}

/** True when any of our attribute files exists (encryption has been set up in this folder at some point). */
export function attributesPresent(root) {
  return attributeFilesMissing(root).length < ENCRYPTED_SCOPE.length;
}

/* ------------------------------------------------------------------ */
/* Settings in config/brain.json                                       */
/* ------------------------------------------------------------------ */

/** What config/brain.json says. Never throws. `readable` is false when the file exists but cannot be parsed. */
export function readEncryptionConfig(root) {
  const checked = readJsonChecked(join(root, 'config', 'brain.json'));
  const enc = (checked.ok && checked.value && checked.value.privacy && checked.value.privacy.encryption) || {};
  return {
    readable: checked.ok,
    enabled: enc.enabled === true,
    key_backup_checked: typeof enc.key_backup_checked === 'string' ? enc.key_backup_checked : null,
    scope: Array.isArray(enc.scope) ? enc.scope : [],
  };
}

/** Merge values into privacy.encryption in config/brain.json, keeping every other key. Throws if the file is unreadable. */
export function updateEncryptionConfig(root, patch) {
  const file = join(root, 'config', 'brain.json');
  const checked = readJsonChecked(file);
  if (checked.exists && !checked.ok) throw new Error('config/brain.json cannot be read, so the setting was not saved.');
  const brain = checked.value && typeof checked.value === 'object' && !Array.isArray(checked.value) ? checked.value : { schema: 1 };
  const privacy = brain.privacy && typeof brain.privacy === 'object' ? brain.privacy : {};
  const current = privacy.encryption && typeof privacy.encryption === 'object' ? privacy.encryption : {};
  brain.privacy = {
    ...privacy,
    encryption: { enabled: false, tool: 'git-crypt', scope: [], key_backup_checked: null, ...current, ...patch },
  };
  writeJson(file, brain);
  return brain.privacy.encryption;
}

/** Encryption counts as on when either the settings or the attribute files say so (the safer reading). */
export function encryptionEnabled(root) {
  return readEncryptionConfig(root).enabled || attributesPresent(root);
}

/* ------------------------------------------------------------------ */
/* The git-crypt tool and the lock state of this copy                  */
/* ------------------------------------------------------------------ */

let toolCache = null; // { key, value }: remembered per ALTERBRAIN_GIT_CRYPT setting, so a test can change it

/**
 * Every git-crypt.exe that a winget install of AGWA.git-crypt left in the current user's WinGet packages folder.
 * The folder is named AGWA.git-crypt_<source id>, and the source id differs between computers, so the packages
 * folder is listed (no shell wildcard) rather than guessed. Only files that exist are returned, in a fixed order.
 */
export function wingetGitCryptExes(localAppData = process.env.LOCALAPPDATA) {
  if (!localAppData) return [];
  const packages = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  let names;
  try {
    names = readdirSync(packages);
  } catch {
    return [];
  }
  return names
    .filter((name) => /^AGWA\.git-crypt_/i.test(name))
    .sort()
    .map((name) => join(packages, name, 'git-crypt.exe'))
    .filter((exe) => existsSync(exe));
}

/**
 * The places to look for git-crypt, in order: { cmd, pre }. ALTERBRAIN_GIT_CRYPT (when set) is the only candidate.
 * Otherwise PATH first, then the folders the installers use. A program that was already running when winget
 * added git-crypt to the PATH (such as the Claude desktop app) does not see the new PATH until it restarts, so the
 * winget folders are searched directly: the Links folder (where winget puts "portable" tools, kept for those) and
 * every AGWA.git-crypt_* package folder (where the real install of git-crypt 0.7.0 puts git-crypt.exe).
 */
export function gitCryptCandidates({ env = process.env, platform = process.platform } = {}) {
  const set = env.ALTERBRAIN_GIT_CRYPT;
  if (set) return [/\.m?js$/i.test(set) ? { cmd: process.execPath, pre: [set] } : { cmd: set, pre: [] }];
  const candidates = [{ cmd: 'git-crypt', pre: [] }];
  if (platform === 'win32' && env.LOCALAPPDATA) {
    candidates.push({ cmd: join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'git-crypt.exe'), pre: [] });
    for (const exe of wingetGitCryptExes(env.LOCALAPPDATA)) candidates.push({ cmd: exe, pre: [] });
  }
  if (platform === 'darwin') {
    candidates.push({ cmd: '/opt/homebrew/bin/git-crypt', pre: [] }, { cmd: '/usr/local/bin/git-crypt', pre: [] });
  }
  return candidates;
}

/**
 * Where git-crypt is, as { cmd, pre, version } (pre = arguments that come before the real ones), or null.
 * ALTERBRAIN_GIT_CRYPT points at another executable, or at a .mjs script that is run with node (used by the tests).
 * Otherwise see gitCryptCandidates. The result is remembered per ALTERBRAIN_GIT_CRYPT setting; `fresh` looks again.
 */
export function resolveGitCrypt({ fresh = false } = {}) {
  const env = process.env.ALTERBRAIN_GIT_CRYPT;
  if (toolCache && !fresh && toolCache.key === (env || '')) return toolCache.value;
  const candidates = gitCryptCandidates();
  let found = null;
  for (const c of candidates) {
    // Only the exit code decides whether this is git-crypt. Version 0.7.0 prints "git-crypt 0.7.0" on stdout and exits 0;
    // other builds have printed it on stderr, so the version is read from both.
    const probe = run(c.cmd, [...c.pre, '--version'], { timeout: 15_000 });
    if (probe.ok) {
      const version = (`${probe.stdout}\n${probe.stderr}`.match(/\d+\.\d+(?:\.\d+)?/) || [])[0] || null;
      found = { ...c, version };
      break;
    }
  }
  toolCache = { key: env || '', value: found };
  return found;
}

/** Run git-crypt with arguments. Returns { ok, code, stdout, stderr }, or a failure when it is not installed. */
export function runGitCrypt(args, opts = {}) {
  const tool = resolveGitCrypt();
  if (!tool) return { ok: false, code: -1, stdout: '', stderr: 'git-crypt is not installed.' };
  return run(tool.cmd, [...tool.pre, ...args], { timeout: 120_000, ...opts });
}

/** The folder git keeps its data in (".git"), as an absolute path, or null. */
export function gitDirOf(root) {
  const r = git(['rev-parse', '--git-dir'], { cwd: root });
  return r.ok && r.stdout ? resolve(root, r.stdout.split(/\r?\n/)[0]) : null;
}

/** Where git-crypt keeps this copy's key. */
export function keyFileOf(root) {
  const dir = gitDirOf(root);
  return dir ? join(dir, 'git-crypt', 'keys', 'default') : null;
}

/**
 * Can this copy encrypt and decrypt? "Unlocked" means the key is present AND git's encrypt/decrypt step is set up
 * (git-crypt unlock and git-crypt init do both; git-crypt lock removes both). Never throws.
 */
export function lockState(root) {
  const tool = resolveGitCrypt();
  const keyFile = keyFileOf(root);
  const keyPresent = Boolean(keyFile && existsSync(keyFile));
  const filter = git(['config', '--get', 'filter.git-crypt.clean'], { cwd: root });
  const filterConfigured = filter.ok && filter.stdout.length > 0;
  return {
    installed: Boolean(tool),
    version: tool ? tool.version : null,
    key_present: keyPresent,
    filter_configured: filterConfigured,
    unlocked: keyPresent && filterConfigured,
  };
}

/** Everything the automatic save needs to decide what is safe. */
export function encryptionContext(root) {
  const cfg = readEncryptionConfig(root);
  const enabled = cfg.enabled || attributesPresent(root);
  if (!enabled) return { enabled: false };
  const lock = lockState(root);
  return { enabled: true, cfg, lock, safe: lock.installed && lock.unlocked };
}

/* ------------------------------------------------------------------ */
/* Reading git objects: the git-crypt header check                     */
/* ------------------------------------------------------------------ */

/** Every file git-crypt encrypts starts with a NUL byte, "GITCRYPT" and another NUL byte. */
export const GITCRYPT_HEADER = Buffer.from([0x00, 0x47, 0x49, 0x54, 0x43, 0x52, 0x59, 0x50, 0x54, 0x00]);

export function hasGitCryptHeader(buf) {
  return Buffer.isBuffer(buf) && buf.length >= GITCRYPT_HEADER.length && buf.subarray(0, GITCRYPT_HEADER.length).equals(GITCRYPT_HEADER);
}

/** A stored file is fine when it is encrypted. An empty file is left empty by git-crypt, so it is fine too. */
export const isEncryptedBlob = (buf) => Buffer.isBuffer(buf) && (buf.length === 0 || hasGitCryptHeader(buf));

/** Run git and return stdout as raw bytes (the output holds NUL bytes and file contents). Throws on failure. */
function gitBytes(root, args, input, { maxBuffer = 1024 * 1024 * 1024 } = {}) {
  const res = spawnSync('git', args, {
    cwd: root,
    input,
    maxBuffer,
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env, ...GIT_ENV },
  });
  if (res.error) throw new Error(res.error.message);
  if (res.status !== 0) throw new Error(String(res.stderr || '').trim().split('\n')[0] || `git exited with code ${res.status}`);
  return res.stdout;
}

const MIB = 1024 * 1024;

/**
 * How much of the stored files is held in memory at once. Private documents and pictures can add up to more than a
 * computer should hold, so the check never reads them all in one go: files are read in groups of at most `batchBytes`,
 * and a single file bigger than `wholeFileBytes` is not read whole at all (only its first bytes are, see blobStart).
 * The tests lower these numbers to try the limits without large files.
 */
export const BLOB_READ_LIMITS = { batchBytes: 64 * MIB, wholeFileBytes: 8 * MIB };

const OBJECT_ID = /^[0-9a-f]{40,64}$/i;
const UNREADABLE = 'A stored file could not be read, so it could not be checked.';

/**
 * The first bytes of one stored file, without reading the rest. Git is stopped as soon as it has sent a first block
 * (Node documents that output is kept up to the point where the limit was passed), so a 90 MB scan costs about the same as
 * a short note. Throws when git fails or sends too little to tell.
 */
function blobStart(root, oid) {
  const res = spawnSync('git', ['cat-file', 'blob', oid], {
    cwd: root,
    maxBuffer: 64, // far more than the header needs; the first block git sends is kept whatever its size
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env, ...GIT_ENV },
  });
  const stoppedOnPurpose = Boolean(res.error && res.error.code === 'ENOBUFS');
  if (res.error && !stoppedOnPurpose) throw new Error(res.error.message);
  if (!stoppedOnPurpose && res.status !== 0) throw new Error(String(res.stderr || '').trim().split('\n')[0] || UNREADABLE);
  const bytes = res.stdout || Buffer.alloc(0);
  if (stoppedOnPurpose && bytes.length < GITCRYPT_HEADER.length) throw new Error(UNREADABLE);
  return bytes;
}

/**
 * Header check on stored files: Map of object id -> { size, header, missing }. The check reads the bytes
 * itself (git cat-file) and does not rely on any text git-crypt prints. It asks git for every size first, then reads
 * small files in groups and only the start of big ones, so an upload of gigabytes of private documents is checked in a
 * small amount of memory (see BLOB_READ_LIMITS). Throws when anything cannot be read.
 */
export function readBlobs(root, oids) {
  const unique = [...new Set(oids)];
  const out = new Map();
  if (!unique.length) return out;
  if (unique.some((o) => !OBJECT_ID.test(String(o)))) throw new Error('A stored file id was not understood, so it could not be checked.');

  const lines = gitBytes(root, ['cat-file', '--batch-check'], `${unique.join('\n')}\n`).toString('latin1').split(/\r?\n/).filter(Boolean);
  if (lines.length !== unique.length) throw new Error('Unexpected output from git.');
  const found = [];
  unique.forEach((oid, i) => {
    const m = /^[0-9a-f]{40,64} (\S+) (\d+)$/i.exec(lines[i]);
    if (m) found.push({ oid, type: m[1], size: Number(m[2]) });
    else if (/^\S+ missing$/.test(lines[i])) out.set(oid, { size: 0, header: false, missing: true });
    else throw new Error('Unexpected output from git.');
  });

  // Big files: only the start is read
  const rest = [];
  for (const f of found) {
    if (f.type === 'blob' && f.size > BLOB_READ_LIMITS.wholeFileBytes) {
      out.set(f.oid, { size: f.size, header: hasGitCryptHeader(blobStart(root, f.oid)), missing: false });
    } else {
      rest.push(f);
    }
  }

  // Everything else: read in groups that stay under the memory limit
  let group = [];
  let groupBytes = 0;
  const flush = () => {
    if (group.length) readGroup(root, group, out);
    group = [];
    groupBytes = 0;
  };
  for (const f of rest) {
    if (group.length && groupBytes + f.size > BLOB_READ_LIMITS.batchBytes) flush();
    group.push(f);
    groupBytes += f.size;
  }
  flush();
  return out;
}

/** Read one group of stored files with a single git call. `group` = [{ oid, size }], sizes as git reported them. */
function readGroup(root, group, out) {
  const room = group.reduce((n, f) => n + f.size + 1 + 160, 4096); // contents, a line break, and git's one-line description of each file
  const buf = gitBytes(root, ['cat-file', '--batch'], `${group.map((f) => f.oid).join('\n')}\n`, { maxBuffer: room });
  let pos = 0;
  for (const f of group) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1) throw new Error('Unexpected output from git.');
    const m = /^[0-9a-f]{40,64} \S+ (\d+)$/i.exec(buf.toString('latin1', pos, nl));
    if (!m || Number(m[1]) !== f.size) throw new Error('Unexpected output from git.');
    pos = nl + 1;
    out.set(f.oid, { size: f.size, header: hasGitCryptHeader(buf.subarray(pos, pos + Math.min(f.size, GITCRYPT_HEADER.length))), missing: false });
    pos += f.size + 1;
  }
}

const REGULAR_MODES = new Set(['100644', '100755']);

/**
 * Parse `git diff --raw -z --no-renames` (or `git diff-tree -c`) output into [{ status, mode, oid, path }], the new side.
 * A combined line (a merge commit shown against all its parents at once) starts with one colon per parent and has one
 * mode and one object id per parent plus the result; the result is always the last of each.
 */
function parseRaw(text) {
  const out = [];
  const tokens = text.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const m = /^:+((?:\d{6} )+)((?:[0-9a-f]+ )+)([A-Z]+)\d*$/.exec(tokens[i]);
    if (!m) continue;
    const modes = m[1].trim().split(' ');
    const ids = m[2].trim().split(' ');
    if (modes.length !== ids.length) throw new Error('Unexpected output from git.');
    out.push({ status: m[3], mode: modes[modes.length - 1], oid: ids[ids.length - 1], path: tokens[i + 1] || '' });
    i++;
  }
  return out;
}

/** Of these entries, the ones that sit in the encrypted scope and are stored as a plain file. */
function plainAmong(root, entries) {
  const wanted = entries.filter((e) => e.status !== 'D' && REGULAR_MODES.has(e.mode) && isEncryptedPath(e.path));
  const blobs = readBlobs(root, wanted.map((e) => e.oid));
  const plain = [];
  const seen = new Set();
  for (const e of wanted) {
    const b = blobs.get(e.oid);
    if (!b || b.missing) throw new Error('A stored file could not be read, so it could not be checked.');
    if (b.size > 0 && !b.header && !seen.has(e.path)) { // an empty file stays empty under git-crypt
      seen.add(e.path);
      plain.push(e.path);
    }
  }
  return { plain, checked: wanted.length };
}

/**
 * Staged changes in encrypted paths that are NOT encrypted. Used right after `git add`, before the commit.
 * Returns { plain: [paths], checked, error }. When it cannot check, `error` is set (callers fail closed).
 */
export function auditStaged(root) {
  try {
    const raw = gitBytes(root, ['diff', '--cached', '--raw', '--no-abbrev', '-z', '--no-renames', '--no-ext-diff', '--', ...SCOPE_DIRS]).toString('utf8');
    const { plain, checked } = plainAmong(root, parseRaw(raw));
    return { plain, checked, error: null };
  } catch (e) {
    return { plain: [], checked: 0, error: String(e.message || e) };
  }
}

/**
 * Files in encrypted paths that are in commits not yet on the online copy and are stored as plain text.
 * Looks at every commit that would be uploaded, not only the newest one, because a plain file that a later
 * commit replaced would still be uploaded with the history. Returns { plain: [paths], checked, error }.
 */
export function auditUnpushed(root) {
  try {
    if (!git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root }).ok) return { plain: [], checked: 0, error: null };
    const revs = gitBytes(root, ['rev-list', 'HEAD', '--not', '--remotes=origin']).toString('utf8').split(/\r?\n/).filter(Boolean);
    return auditCommits(root, revs);
  } catch (e) {
    return { plain: [], checked: 0, error: String(e.message || e) };
  }
}

/**
 * Files in encrypted paths that these commits add or change and that are stored as plain text (every one of the
 * commits is looked at, not only the newest). Used by the upload check that runs inside git (git-hooks/pre-push.mjs)
 * and by auditUnpushed. Returns { plain: [paths], checked, error }; on `error` the caller must treat the result as unchecked.
 */
export function auditCommits(root, commits) {
  try {
    const revs = [...new Set((commits || []).map((c) => String(c).trim()).filter(Boolean))];
    if (!revs.length) return { plain: [], checked: 0, error: null };
    // "git diff-tree --stdin" quietly skips anything that is not a commit it knows, which would read as "nothing plain".
    // So every entry must be a commit id that exists here, or the whole check is reported as not done.
    if (revs.some((r) => !/^[0-9a-f]{40,64}$/i.test(r))) throw new Error('A commit id was not understood, so the commits could not be checked.');
    const known = gitBytes(root, ['cat-file', '--batch-check'], `${revs.join('\n')}\n`).toString('utf8').split(/\r?\n/).filter(Boolean);
    if (known.length !== revs.length || known.some((l) => !/^[0-9a-f]{40,64} commit \d+$/.test(l))) {
      throw new Error('A commit could not be read, so the commits could not be checked.');
    }
    // A merge commit is shown with -c (against all its parents at once), which lists only the files that differ from EVERY
    // parent: what the merge itself wrote, such as a conflict settled by hand. Not -m, which would list everything the
    // other side brought in, including notes that are already online. Those are covered by the commits that made them
    // (they are in the list too, or the online copy already has them).
    const raw = gitBytes(root, ['diff-tree', '--stdin', '-r', '--no-abbrev', '-z', '--no-renames', '--root', '-c', '--no-commit-id'], `${revs.join('\n')}\n`).toString('utf8');
    const { plain, checked } = plainAmong(root, parseRaw(raw));
    return { plain, checked, error: null };
  } catch (e) {
    return { plain: [], checked: 0, error: String(e.message || e) };
  }
}

/**
 * Tracked files in encrypted paths, as stored in the index, and which of them are plain.
 * Returns { tracked: [paths], plain: [paths], error }.
 */
export function auditIndex(root) {
  try {
    const text = gitBytes(root, ['ls-files', '-s', '-z', '--', ...SCOPE_DIRS]).toString('utf8');
    const entries = [];
    for (const rec of text.split('\0')) {
      const m = /^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(rec);
      if (m && m[3] === '0') entries.push({ status: 'M', mode: m[1], oid: m[2], path: m[4] });
    }
    const tracked = entries.filter((e) => REGULAR_MODES.has(e.mode) && isEncryptedPath(e.path));
    const { plain } = plainAmong(root, tracked);
    return { tracked: tracked.map((e) => e.path), plain, error: null };
  } catch (e) {
    return { tracked: [], plain: [], error: String(e.message || e) };
  }
}

/** Tracked encrypted-scope files that git would not encrypt, because the attribute files do not cover them. */
export function attributeDrift(root, trackedPaths) {
  if (!trackedPaths.length) return [];
  try {
    const out = gitBytes(root, ['check-attr', '-z', '--stdin', 'filter'], `${trackedPaths.join('\0')}\0`).toString('utf8').split('\0');
    const drift = [];
    for (let i = 0; i + 2 < out.length; i += 3) {
      if (out[i] && out[i + 2] !== 'git-crypt') drift.push(out[i]);
    }
    return drift;
  } catch {
    return [];
  }
}

/** How many changed or new files wait in encrypted paths (they are what a locked copy cannot save). */
export function pendingPrivateChanges(root) {
  try {
    const text = gitBytes(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...SCOPE_DIRS]).toString('utf8');
    const tokens = text.split('\0');
    let n = 0;
    for (let i = 0; i < tokens.length; i++) {
      const rec = tokens[i];
      if (rec.length < 4) continue;
      const code = rec.slice(0, 2);
      if (/[RC]/.test(code)) i++; // renames carry a second path
      if (isEncryptedPath(rec.slice(3))) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* The upload check inside git (a pre-push hook)                       */
/* ------------------------------------------------------------------ */
//
// The automatic save (git-auto.mjs) checks every upload it makes. Obsidian Git, which saves and uploads on its own every
// 10 minutes through the git command line, does not go through it. Git runs a "pre-push" hook before every upload, whoever
// starts it, so a small hook in .git/hooks/pre-push closes that gap on a computer. It cannot help on a phone.
//
// Git LFS uses the same hook file ("git lfs install" writes `git lfs pre-push "$@"` into it, and LFS uploads its big
// files from there). Replacing that file would silently stop big files from uploading, so our hook runs LFS's step
// itself, with the same input, after its own check. A hook that is neither ours nor the standard LFS one belongs to
// someone else and is never touched.

export const PRE_PUSH_SCRIPT_REL = 'system/scripts/git-hooks/pre-push.mjs';
export const PRE_PUSH_MARKER = '# alterbrain-pre-push v1';

/** Plain-language sentences for a hook that is not in place (status, the session digest and the guide use them). */
export const PUSH_HOOK_TEXT = {
  missing: 'The upload check that protects your private notes from Obsidian Git and other Git tools is not installed.',
  foreign:
    "Another tool already has a check that runs before every upload (the file .git/hooks/pre-push), so Alterbrain's own check is not installed. " +
    'Obsidian Git or another Git tool could upload a private note without encryption from a computer that cannot encrypt it.',
  'hooks-path':
    "Git on this computer is set to use a shared folder for its upload checks, so Alterbrain's own check for private notes is not installed. " +
    'Obsidian Git or another Git tool could upload a private note without encryption from a computer that cannot encrypt it.',
  error: 'The upload check for private notes could not be installed.',
};

const shQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/**
 * How the hook tells that a folder uses Git LFS: a line in an attribute file (not a comment) that sends a path to the LFS
 * filter, or LFS set up in this folder's own settings. The big-file rules Alterbrain adds live in vault/.gitattributes.
 */
const LFS_RULE_PATTERN = '^[^#]*[[:space:]]filter=lfs([[:space:]]|$)';

/** What the hook says when a folder uses Git LFS and the program is not on the hook's PATH. No quote, dollar sign or backtick: it sits inside a shell string. */
const LFS_MISSING_REFUSAL =
  `${PUSH_REFUSED_PREFIX} because this folder keeps its big files in Git LFS (a free add-on) and Git LFS was not found on this computer. ` +
  `Without it the big files would reach GitHub as empty placeholders. Nothing was sent. Open Claude and type /health-check, or install Git LFS yourself with: ${lfsInstallCommand()}`;

/** The text of the hook. `nodePath` is used only when "node" is not on the hook's PATH (a desktop app may not have it). */
export function prePushShim(nodePath = '') {
  const fallback = shQuote(String(nodePath || '').replace(/\\/g, '/'));
  const attrFiles = ENCRYPTED_SCOPE.map((e) => `"$root/${attributeFileRel(e)}"`).join(' ');
  return [
    '#!/bin/sh',
    PRE_PUSH_MARKER,
    '# Written by Alterbrain (system/scripts/vault-key.mjs) and rewritten when it goes out of date. Delete this file to switch it off.',
    '# 1. Refuse an upload that would send a private note without encryption (Obsidian Git and every other Git tool go through here).',
    '# 2. Then run the step Git LFS keeps in this file, with the same input, so big files still upload. As in the standard',
    '#    LFS hook, a folder that uses LFS is not uploaded when LFS cannot be found (its placeholders would go up without the files).',
    'input=$(cat)',
    'feed() { if [ -n "$input" ]; then printf \'%s\\n\' "$input"; fi; }',
    'root=$(git rev-parse --show-toplevel 2>/dev/null)',
    `script="$root/${PRE_PUSH_SCRIPT_REL}"`,
    'node_bin=$(command -v node 2>/dev/null)',
    `if [ -z "$node_bin" ] && [ -x ${fallback} ]; then node_bin=${fallback}; fi`,
    'if [ -n "$root" ] && [ -n "$node_bin" ] && [ -f "$script" ]; then',
    '  feed | "$node_bin" "$script" "$@" || exit 1',
    `elif [ -n "$root" ] && grep -qs 'filter=git-crypt' ${attrFiles}; then`,
    `  echo "${PUSH_REFUSED_PREFIX} because it could not run its check for private notes (Node.js or the check itself was not found). Nothing was sent. Open Claude and type /health-check" >&2`,
    '  exit 1',
    'fi',
    'if command -v git-lfs >/dev/null 2>&1; then',
    '  feed | git lfs pre-push "$@" || exit $?',
    `elif [ -n "$root" ] && { [ -n "$(git config --local --get filter.lfs.clean 2>/dev/null)" ] || git grep -q --untracked -E -e '${LFS_RULE_PATTERN}' -- '*.gitattributes' >/dev/null 2>&1; }; then`,
    `  echo "${LFS_MISSING_REFUSAL}" >&2`,
    '  exit 2',
    'fi',
    'exit 0',
    '',
  ].join('\n');
}

/**
 * What an existing pre-push hook is: 'empty', 'ours', 'lfs' (the standard text "git lfs install" writes, in any of its
 * versions) or 'foreign' (anything else, including a hook with the LFS lines plus something more).
 */
export function classifyPrePush(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n');
  if (!t.trim()) return 'empty';
  if (t.split('\n').some((l) => l.trim() === PRE_PUSH_MARKER)) return 'ours';
  const body = t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const lfsGuard = (l) => /^command -v git-lfs >\/dev\/null 2>&1 \|\| \{ .*exit 2; \}$/.test(l);
  const lfsCall = (l) => l === 'git lfs pre-push "$@"';
  if (body.some(lfsCall) && body.every((l) => lfsGuard(l) || lfsCall(l))) return 'lfs';
  return 'foreign';
}

/** The node program to remember in the hook: the one already there if it still exists, else the one running now (only if it is really "node"). */
function nodeForHook(existingText = '') {
  const isNode = (p) => /(^|[\\/])node(\.exe)?$/i.test(p) && existsSync(p);
  const remembered = /\[ -x '([^']*)' \]/.exec(existingText);
  if (remembered && isNode(remembered[1])) return remembered[1];
  return isNode(process.execPath) ? process.execPath : '';
}

/** Where the pre-push hook file is for this folder (git's own answer, which follows links to another git folder). */
function prePushPath(root) {
  try {
    if (statSync(join(root, '.git')).isDirectory()) return join(root, '.git', 'hooks', 'pre-push');
  } catch {
    /* .git is a file (a linked folder) or missing: ask git */
  }
  const r = git(['rev-parse', '--git-path', 'hooks/pre-push'], { cwd: root });
  return r.ok && r.stdout ? resolve(root, r.stdout.split(/\r?\n/)[0]) : null;
}

/** The shared hooks folder Git is set to use (core.hooksPath), or null. Hooks in .git/hooks do not run then. */
function sharedHooksFolder(root) {
  const r = git(['config', '--get', 'core.hooksPath'], { cwd: root });
  return r.ok && r.stdout ? r.stdout.split(/\r?\n/)[0] : null;
}

const readIfThere = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const sameText = (a, b) => String(a).replace(/\r\n/g, '\n') === String(b);

/**
 * Is the upload check in place? Read-only. state: 'active' (our hook is there), 'missing' (no hook, an empty one, or only
 * the standard Git LFS one: it can be installed), 'foreign' (someone else's hook: left alone), 'hooks-path' (Git is
 * set to use a shared hooks folder: nothing is written), 'error'. `outdated` is true when our hook should be rewritten.
 */
export function prePushHookStatus(root) {
  try {
    const file = prePushPath(root);
    if (!file) return { state: 'error', path: null, message: PUSH_HOOK_TEXT.error };
    const shared = sharedHooksFolder(root);
    if (shared) return { state: 'hooks-path', path: file, hooks_path: shared };
    const text = readIfThere(file);
    if (text === null) return { state: 'missing', path: file, was: 'absent' };
    const kind = classifyPrePush(text);
    if (kind === 'ours') return { state: 'active', path: file, outdated: !sameText(text, prePushShim(nodeForHook(text))) };
    if (kind === 'foreign') return { state: 'foreign', path: file };
    return { state: 'missing', path: file, was: kind };
  } catch (e) {
    return { state: 'error', path: null, message: `${PUSH_HOOK_TEXT.error} ${String((e && e.message) || e)}` };
  }
}

/**
 * Install or refresh the upload check. Safe to call often: when our hook is already right it only reads one small file.
 * Never overwrites a hook that is not ours or the standard Git LFS one, never writes outside this folder's own git
 * folder, never throws. Returns { state, changed, path, replaced }, state as in prePushHookStatus ('active' = in place).
 */
export function ensurePrePushHook(root) {
  let tmp = null;
  try {
    const file = prePushPath(root);
    if (!file) return { state: 'error', changed: false, path: null, message: PUSH_HOOK_TEXT.error };
    const text = readIfThere(file);
    const kind = text === null ? 'absent' : classifyPrePush(text);
    if (kind === 'ours' && sameText(text, prePushShim(nodeForHook(text)))) return { state: 'active', changed: false, path: file };
    if (kind === 'foreign') return { state: 'foreign', changed: false, path: file };
    const shared = sharedHooksFolder(root);
    if (shared) return { state: 'hooks-path', changed: false, path: file, hooks_path: shared };
    mkdirSync(dirname(file), { recursive: true });
    tmp = `${file}.alterbrain-new`;
    writeFileSync(tmp, prePushShim(nodeForHook(text || '')), { encoding: 'utf8', mode: 0o755 });
    try {
      chmodSync(tmp, 0o755);
    } catch {
      /* Windows has no execute bit: Git for Windows runs hooks through its own shell */
    }
    renameSync(tmp, file); // a hook file is never half-written when a push starts at the same moment
    tmp = null;
    return { state: 'active', changed: true, path: file, replaced: kind };
  } catch (e) {
    return { state: 'error', changed: false, path: null, message: `${PUSH_HOOK_TEXT.error} ${String((e && e.message) || e)}` };
  } finally {
    if (tmp) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* nothing more to do */
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The full status                                                     */
/* ------------------------------------------------------------------ */

/**
 * Everything `vault-key.mjs status`, doctor and the session digest report. Never throws.
 * problems: things to fix ({ id, message, fix }). notes: things to know, not failures.
 */
export function getStatus(root) {
  const cfg = readEncryptionConfig(root);
  const missing = attributeFilesMissing(root);
  const attributes = missing.length < ENCRYPTED_SCOPE.length;
  const enabled = cfg.enabled || attributes;
  const status = {
    enabled,
    configured: cfg.enabled,
    attributes_present: attributes,
    attribute_files_missing: enabled ? missing : [],
    git_crypt_installed: false,
    git_crypt_version: null,
    key_present: false,
    filter_configured: false,
    unlocked: false,
    tracked_in_scope: 0,
    encrypted: 0,
    plain: [],
    not_covered: [],
    pre_push_hook: null,
    key_backup_checked: cfg.key_backup_checked,
    problems: [],
    notes: [],
  };
  if (!enabled) {
    // Onboarding asks whether the tool is installed before it turns encryption on.
    const tool = resolveGitCrypt();
    status.git_crypt_installed = Boolean(tool);
    status.git_crypt_version = tool ? tool.version : null;
    return status;
  }

  const lock = lockState(root);
  Object.assign(status, {
    git_crypt_installed: lock.installed,
    git_crypt_version: lock.version,
    key_present: lock.key_present,
    filter_configured: lock.filter_configured,
    unlocked: lock.unlocked,
  });

  const idx = auditIndex(root);
  if (idx.error) {
    status.problems.push({ id: 'check-failed', message: 'Your saved notes could not be checked for encryption.', fix: `Ask Claude to run /health-check. (${idx.error})` });
  } else {
    status.tracked_in_scope = idx.tracked.length;
    status.plain = idx.plain;
    status.encrypted = idx.tracked.length - idx.plain.length;
    status.not_covered = attributeDrift(root, idx.tracked);
  }

  if (!lock.installed) {
    status.problems.push({ id: 'tool-missing', message: 'The encryption tool (git-crypt) is not installed on this computer, so private notes cannot be saved.', fix: `Run: ${installCommand()}` });
  }
  if (!lock.unlocked) {
    status.problems.push({ id: 'locked', message: 'Your private notes are locked on this computer. Changes to them are not being saved.', fix: `Run: ${UNLOCK_COMMAND}` });
  }
  if (missing.length) {
    status.problems.push({ id: 'attributes-missing', message: `The settings that tell git which notes to encrypt are missing (${missing.join(', ')}).`, fix: 'Run: node system/scripts/vault-key.mjs setup' });
  }
  if (status.plain.length) {
    status.problems.push({
      id: 'plain-files',
      message: `${status.plain.length} private note${status.plain.length === 1 ? ' is' : 's are'} stored without encryption.`,
      fix: lock.unlocked ? 'Run: node system/scripts/vault-key.mjs setup   (it saves them again, encrypted)' : 'Unlock this computer first, then run: node system/scripts/vault-key.mjs setup',
    });
  }
  if (status.not_covered.length && !missing.length) {
    status.problems.push({ id: 'not-covered', message: `${status.not_covered.length} private note${status.not_covered.length === 1 ? ' is' : 's are'} not covered by the encryption settings.`, fix: 'Run: node system/scripts/vault-key.mjs setup' });
  }
  // The upload check inside git is what stops Obsidian Git, which saves and uploads by itself, from sending a plain private note.
  const hook = prePushHookStatus(root);
  status.pre_push_hook = hook.state;
  if (hook.state !== 'active') {
    const fix = hook.state === 'missing' ? 'Run: node system/scripts/vault-key.mjs setup' : 'Ask Claude to run /health-check, and keep Obsidian Git switched off until then.';
    status.problems.push({ id: `push-hook-${hook.state === 'hooks-path' ? 'shared-folder' : hook.state}`, message: hook.message || PUSH_HOOK_TEXT[hook.state] || PUSH_HOOK_TEXT.error, fix });
  }
  if (!cfg.readable) {
    status.notes.push('config/brain.json could not be read.');
  }
  if (!cfg.key_backup_checked) {
    status.notes.push('Your vault key backup has not been tested. Run the key check: node system/scripts/vault-key.mjs check --key <your key file>');
  }
  return status;
}

/* ------------------------------------------------------------------ */
/* Key file: wrapping a key copy with a password                       */
/* ------------------------------------------------------------------ */

export const WRAP_FORMAT = 'alterbrain-vault-key';
export const WRAP_AAD = Buffer.from('alterbrain-vault-key-v1');
export const SCRYPT_DEFAULT = Object.freeze({ N: 2 ** 17, r: 8, p: 1 });
export const MIN_PASSWORD_LENGTH = 10;

/** A problem with a key file that can be said to the user in one plain sentence. */
export class KeyFileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KeyFileError';
    this.code = code;
  }
}

/** Limits on the cost settings stored in a file, so a hostile file cannot make the computer run out of memory. */
function checkScryptParams({ N, r, p }) {
  const ok = Number.isInteger(N) && N >= 2 ** 14 && N <= 2 ** 18 && (N & (N - 1)) === 0 && Number.isInteger(r) && r >= 1 && r <= 16 && Number.isInteger(p) && p >= 1 && p <= 4;
  if (!ok) throw new KeyFileError('damaged', 'This key file uses settings that Alterbrain does not accept, so it was not opened.');
}

const scryptKey = (password, salt, { N, r, p }) =>
  scryptSync(Buffer.from(String(password).normalize('NFKC'), 'utf8'), salt, 32, { N, r, p, maxmem: 256 * N * r + 128 * r * p + 1024 * 1024 });

/** Check a password for the backup copy. Returns null when fine, or a plain sentence. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || [...password].length < MIN_PASSWORD_LENGTH) {
    return `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Wrap key bytes with a password: scrypt (N=2^17, r=8, p=1) to a 256-bit key, then AES-256-GCM with a random
 * 12-byte IV and the fixed extra data "alterbrain-vault-key-v1". The result is the JSON object that is saved.
 * `params` is only for tests (a cheaper cost).
 */
export function wrapKey(keyBytes, password, params = SCRYPT_DEFAULT) {
  const problem = passwordProblem(password);
  if (problem) throw new KeyFileError('password', problem);
  const { N, r, p } = { ...SCRYPT_DEFAULT, ...params };
  checkScryptParams({ N, r, p });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptKey(password, salt, { N, r, p });
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(WRAP_AAD);
    const ct = Buffer.concat([cipher.update(keyBytes), cipher.final()]);
    return {
      format: WRAP_FORMAT,
      v: 1,
      kdf: { name: 'scrypt', N, r, p, salt: salt.toString('base64') },
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ct: ct.toString('base64'),
    };
  } finally {
    key.fill(0);
  }
}

const b64 = (s, length, what) => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new KeyFileError('damaged', `The key file is damaged (${what}).`);
  const buf = Buffer.from(s, 'base64');
  if (length != null && buf.length !== length) throw new KeyFileError('damaged', `The key file is damaged (${what}).`);
  return buf;
};

/** Is this file a password-protected key copy (as opposed to a plain key file)? */
export function looksWrapped(bytes) {
  const first = bytes.subarray(0, 64).toString('latin1').trimStart();
  return first.startsWith('{');
}

/** Read the JSON of a wrapped key file (bytes, text or an object) and check its shape. Throws KeyFileError with a plain message. */
export function parseWrapped(input) {
  let obj = input;
  if (Buffer.isBuffer(input) || typeof input === 'string') {
    try {
      obj = JSON.parse(Buffer.from(input).toString('utf8').replace(/^﻿/, ''));
    } catch {
      throw new KeyFileError('damaged', 'This file is not a complete Alterbrain key file. It may be damaged or cut short.');
    }
  }
  if (!obj || typeof obj !== 'object' || obj.format !== WRAP_FORMAT) {
    throw new KeyFileError('format', 'This file is not an Alterbrain key file.');
  }
  if (obj.v !== 1) throw new KeyFileError('version', 'This key file was made by a newer version of Alterbrain. Update Alterbrain, then try again.');
  const kdf = obj.kdf;
  if (!kdf || kdf.name !== 'scrypt') throw new KeyFileError('damaged', 'This key file is damaged (settings).');
  checkScryptParams(kdf);
  return obj;
}

/**
 * Open a wrapped key file with the password. A wrong password and a changed file look the same to the
 * cipher, so both give the same plain message.
 */
export function unwrapKey(wrapped, password) {
  const obj = parseWrapped(wrapped);
  const salt = b64(obj.kdf.salt, 16, 'salt');
  const iv = b64(obj.iv, 12, 'iv');
  const tag = b64(obj.tag, 16, 'tag');
  const ct = b64(obj.ct, null, 'contents');
  if (ct.length === 0 || ct.length > 65_536) throw new KeyFileError('damaged', 'The key file is damaged (contents).');
  const key = scryptKey(password, salt, obj.kdf);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(WRAP_AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new KeyFileError('password', 'That password does not open this key file, or the file has been changed or damaged. Check the password and try again.');
  } finally {
    key.fill(0);
  }
}

/** Constant-time comparison of two byte strings by their sha256. */
export function sameKey(a, b) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/* ------------------------------------------------------------------ */
/* Password entry: hidden, from a real keyboard only                   */
/* ------------------------------------------------------------------ */

export class NoTerminalError extends Error {
  constructor() {
    super('This needs a real keyboard.');
    this.name = 'NoTerminalError';
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'CancelledError';
  }
}

/** True when input comes from a person at a keyboard (not a pipe, not Claude). */
export const hasKeyboard = (input = process.stdin) => Boolean(input && input.isTTY && typeof input.setRawMode === 'function');

/**
 * Read one line without showing it. Raw mode on the terminal; handles Backspace, Enter, Ctrl+C and Ctrl+D,
 * and ignores arrow keys and other escape sequences. The prompt goes to `output` (stderr by default, so
 * --json output stays clean). Rejects with NoTerminalError when there is no keyboard: the password is never
 * read from a pipe, an argument or the environment.
 */
export function readHidden(prompt, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolvePromise, reject) => {
    if (!hasKeyboard(input)) {
      reject(new NoTerminalError());
      return;
    }
    let text = [];
    let escape = 0; // 0 none, 1 after ESC, 2 inside "ESC [" / "ESC O" until a final letter
    const wasRaw = Boolean(input.isRaw);
    const finish = (error, value) => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      try {
        input.setRawMode(wasRaw);
        input.pause();
      } catch {
        /* the terminal is gone: nothing left to restore */
      }
      output.write('\n');
      if (error) reject(error);
      else resolvePromise(value);
    };
    const onEnd = () => finish(new CancelledError());
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (escape === 1) {
          escape = ch === '[' || ch === 'O' ? 2 : 0;
          continue;
        }
        if (escape === 2) {
          if (ch >= '@' && ch <= '~') escape = 0;
          continue;
        }
        if (ch === '\u001b') {
          escape = 1;
        } else if (ch === '\r' || ch === '\n') {
          finish(null, text.join(''));
          return;
        } else if (ch === '\u0003') {
          finish(new CancelledError());
          return;
        } else if (ch === '\u0004') {
          if (text.length === 0) {
            finish(new CancelledError());
            return;
          }
        } else if (ch === '\u007f' || ch === '\b') {
          text.pop();
        } else if (ch >= ' ') {
          text.push(ch);
        }
      }
    };
    output.write(prompt);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
    input.on('end', onEnd);
  });
}

// A short list of everyday words for the example password. The user is told to pick their own.
export const EXAMPLE_WORDS = [
  'anchor', 'apple', 'arrow', 'autumn', 'badge', 'bamboo', 'banner', 'barrel', 'basket', 'beacon', 'berry', 'bicycle', 'blanket', 'blossom',
  'bottle', 'bridge', 'bronze', 'bucket', 'butter', 'cabin', 'cactus', 'camel', 'candle', 'canyon', 'carpet', 'castle', 'cedar', 'cellar',
  'chapel', 'cherry', 'cinema', 'circle', 'clover', 'cobalt', 'comet', 'copper', 'coral', 'cotton', 'cradle', 'crystal', 'curtain', 'daisy',
  'desert', 'diamond', 'dolphin', 'dragon', 'eagle', 'ember', 'engine', 'falcon', 'feather', 'fiddle', 'flannel', 'forest', 'fossil',
  'fountain', 'galaxy', 'garden', 'garlic', 'ginger', 'glacier', 'goblet', 'granite', 'guitar', 'hammer', 'harbour', 'harvest', 'hazel',
  'helmet', 'heron', 'honey', 'island', 'ivory', 'jacket', 'jasmine', 'jigsaw', 'jungle', 'kettle', 'kitten', 'ladder', 'lantern',
  'lavender', 'lemon', 'lizard', 'lobster', 'magnet', 'mango', 'maple', 'marble', 'meadow', 'mirror', 'monsoon', 'mosaic', 'muffin',
  'museum', 'nectar', 'needle', 'nutmeg', 'oasis', 'olive', 'onion', 'orchard', 'otter', 'oyster', 'paddle', 'palace', 'panda', 'parrot',
  'pebble', 'pencil', 'pepper', 'piano', 'pigeon', 'pillow', 'planet', 'pocket', 'pottery', 'pumpkin', 'puzzle', 'quartz', 'rabbit',
  'radish', 'raven', 'ribbon', 'river', 'rocket', 'saddle', 'saffron', 'salmon', 'sandal', 'satin', 'scarf', 'shadow', 'silver', 'sketch',
  'slipper', 'spiral', 'spruce', 'squirrel', 'stable', 'statue', 'sunset', 'swallow', 'teapot', 'thistle', 'thunder', 'ticket', 'timber',
  'tomato', 'trumpet', 'tulip', 'tunnel', 'turtle', 'umbrella', 'valley', 'velvet', 'violin', 'walnut', 'wagon', 'whistle', 'willow',
  'window', 'winter', 'wizard', 'yellow', 'zebra',
];

/** Four random words, drawn with the system's secure random generator. An example only. */
export function suggestPassphrase(words = EXAMPLE_WORDS, count = 4) {
  return Array.from({ length: count }, () => words[randomInt(words.length)]).join(' ');
}

/* ------------------------------------------------------------------ */
/* Where the key copy may be saved                                     */
/* ------------------------------------------------------------------ */

function nearestRealPath(abs) {
  let probe = abs;
  const tail = [];
  for (let i = 0; i < 64; i++) {
    if (existsSync(probe)) {
      try {
        return join(realpathSync.native(probe), ...tail.reverse());
      } catch {
        return abs;
      }
    }
    const up = dirname(probe);
    if (up === probe) return abs;
    tail.push(basename(probe));
    probe = up;
  }
  return abs;
}

const comparable = (p) => (process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p);

/** Expand a leading "~" the way a shell would (a quoted "~" reaches us unexpanded). */
export function expandHome(p) {
  const s = String(p);
  if (s === '~') return homedir();
  if (s.startsWith('~/') || s.startsWith('~\\')) return join(homedir(), s.slice(2));
  return s;
}

/** True when the path is inside the project folder, by its real location (links and short names included). */
export function isInsideProject(root, target, cwd = process.cwd()) {
  const abs = resolve(cwd, expandHome(target));
  const inside = (a, b) => {
    const rel = relative(comparable(a), comparable(b));
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };
  const realRoot = nearestRealPath(resolve(root));
  return inside(resolve(root), abs) || inside(realRoot, nearestRealPath(abs)) || inside(realRoot, abs);
}

/** The suggested place for the key copy: outside the project, in the user's Documents folder. */
export function defaultKeyPath(root, wrapped) {
  const name = basename(resolve(root)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'alterbrain';
  return join(homedir(), 'Documents', 'Alterbrain', `vault-key-${name}${wrapped ? '.abkey' : '.key'}`);
}

/** A fresh name for a temporary file under state/local/tmp (never committed). */
export function tempKeyPath(root) {
  return join(root, 'state', 'local', 'tmp', `vault-key-${randomBytes(8).toString('hex')}.tmp`);
}

