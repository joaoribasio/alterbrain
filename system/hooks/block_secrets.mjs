#!/usr/bin/env node
// PreToolUse (Write|Edit|MultiEdit|NotebookEdit, and Bash|PowerShell): keep secrets out of files and history.
//
//   - File edits: denies text that looks like a private key, an API key or token, or a
//     "key = long random value" line. Allowed anywhere inside the project's own .env.local and tests/fixtures/.
//     A weaker match (a short password after "password =") makes the hook ASK instead of deny, so a person can
//     approve an example in a note.
//   - Shell: denies `git commit` commands that carry such text (for example in -m), shell commands that WRITE such
//     text into a file (echo sk-... >> note.md), `git add` / `git stage` of .env files (or `git add --force`, which
//     skips the safety list in .gitignore), and commands that read or copy a .env file (cat .env.local, cp .env x).
//   - Vault key files (ADR 0019): the backup copies that vault-key.mjs makes (*.abkey, vault-key-*.key) and git-crypt's own
//     key must never be written into the project folder (it is backed up to GitHub), read into the chat or copied. Denied
//     in file edits and in shell commands, including `git-crypt export-key` to a place inside the project or to the screen.
// Fails open on malformed input. Never prints the secret it found.
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  commandSegments, deny, ask, isGit, isMainModule, parseGit, programName, projectRels, readInput, runHook, toolInfo,
} from '../lib/hookio.mjs';
import { shellWriteTargets } from '../lib/protect.mjs';

const SECRET_REASON =
  'This looks like a password, key or token. Alterbrain never saves secrets in your notes or files. ' +
  'Keep it out of the text. If a tool needs a key, add it to .env.local yourself, and never paste it into the chat.';
const MAYBE_REASON =
  'This might be a password. If it is only an example or a made-up word, approve it. If it is real, keep it out of your notes: ' +
  'add it to .env.local yourself, and never paste it into the chat.';
const ENV_ADD_REASON =
  'Files named .env hold passwords and keys, so they must never be added to your saved history. Alterbrain keeps them out on purpose.';
const ENV_READ_REASON =
  'Files named .env hold passwords and keys. Alterbrain does not read or copy them, so a key never reaches the chat or your notes. ' +
  'If a key needs changing, edit .env.local yourself.';
const KEY_FILE_REASON =
  'This is a vault key file. It unlocks your encrypted notes, so it must never sit inside your project folder (which is backed up to GitHub), ' +
  'and Alterbrain does not read, copy or print it. To save a copy outside the project, type this yourself in a terminal: ' +
  'node system/scripts/vault-key.mjs export --out <a folder outside this project>';
const FORCE_ADD_REASON =
  'Forcing a file into your saved history skips the safety list that keeps secrets out. Alterbrain does not do that.';

/* ------------------------------ detection ------------------------------ */

/** Shannon entropy in bits per character. */
export function entropy(s) {
  if (!s) return 0;
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const mixed = (v) => /[A-Za-z]/.test(v) && /\d/.test(v);
const PLACEHOLDER_WORDS = /example|placeholder|changeme|change_me|your[_-]?(api|key|token|secret)|xxxx|dummy|redacted|\*{4}/i;

/** Obvious stand-ins: one repeated character, only x/./-, or words like "example". */
function isPlaceholder(v) {
  return /^(.)\1+$/.test(v) || /^[xX*._-]+$/.test(v) || PLACEHOLDER_WORDS.test(v);
}

/**
 * Text made of ordinary words run together (ProjectManagement2024Plan, 2024-Q3-board-presentation-final,
 * Smith2019TheTheoryOfFirm). Real tokens do not read like that. Needs at least two words of four letters or more.
 */
export function wordLike(v) {
  const segs = String(v).match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) || [];
  const letters = segs.join('').length;
  const good = segs.filter((s) => s.length >= 4);
  return good.length >= 2 && good.join('').length / Math.max(letters, 1) >= 0.7;
}

// Strings with a distinctive prefix. Real tokens are long, so no entropy check is needed.
const PREFIX_PATTERNS = [
  { name: 'a private key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { name: 'an API key', re: /\bsk-[A-Za-z0-9_-]{20,}/g, ok: (m) => mixed(m.slice(3)) && !isPlaceholder(m) },
  { name: 'a GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g, ok: (m) => !isPlaceholder(m.replace(/^[a-z_]+?_/, '')) },
  { name: 'a Slack token', re: /\b(?:xox[abprs]-[A-Za-z0-9-]{10,}|xapp-\d-[A-Za-z0-9-]{10,})/g, ok: (m) => !isPlaceholder(m.replace(/^[a-z]+-/, '')) },
  { name: 'an AWS access key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, ok: (m) => !/EXAMPLE/.test(m) },
  { name: 'a Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'a Stripe key', re: /\b[sr]k_live_[0-9A-Za-z]{20,}/g },
  { name: 'a login token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'a bearer token', re: /\bBearer\s+([A-Za-z0-9._~+/=-]{24,})/g, ok: (m) => mixed(m) && !isPlaceholder(m) },
  { name: 'an npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/g, ok: (m) => !isPlaceholder(m.slice(4)) },
  { name: 'a GitLab token', re: /\bglpat-[A-Za-z0-9_-]{20,}/g, ok: (m) => !isPlaceholder(m.slice(6)) },
  { name: 'a Hugging Face token', re: /\bhf_[A-Za-z0-9]{30,}\b/g, ok: (m) => mixed(m.slice(3)) && !isPlaceholder(m.slice(3)) },
  { name: 'a Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  // A web address with a name and a password in front of the host. The group is the password. Stand-ins are skipped.
  {
    name: 'a password inside a web address',
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"<>]+:([^\s@/'"<>]{3,})@[^\s/'"<>]+/gi,
    ok: (pw) => !/^\$\{?\w+\}?$|^%\w+%$|^\{\{.*\}\}$|^\*+$|^x+$/i.test(pw),
    low: (pw) => /^(?:pass|password|passwd|pwd|secret|changeme)$/i.test(pw),
  },
];

// "something_key = value", "token: value" ... with a long, random-looking value.
const GENERIC_RE =
  /(?:api[_-]?key|apikey|app[_-]?key|app[_-]?secret|secret|token|passw(?:or)?d|pwd|credential|auth[_-]?key|access[_-]?key|private[_-]?key|session[_-]?(?:string|token|key)|(?<!public[_-]?)[_-]key)[A-Za-z0-9_.-]{0,40}["']?\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{16,})/gi;
const FILE_VALUE_RE = /\.(json|ya?ml|txt|md|pem|key|env|js|mjs|cjs|ts|py|csv|toml|ini|cfg|conf|log|html?)$/i;

// A short password after "password": quoted, or unquoted after "=". Weaker evidence, so the hook asks.
const PASSWORD_QUOTED_RE = /(?<![A-Za-z])pass(?:word|wd|phrase|code)?(?:[_.-][A-Za-z0-9_.-]{0,12})?["']?\s*[:=]\s*(["'])([^"'\s]{4,64})\1/gi;
const PASSWORD_BARE_RE = /(?<![A-Za-z])pass(?:word|wd|phrase|code)?(?:[_.-][A-Za-z0-9_.-]{0,12})?["']?\s*=\s*([^\s"'$(){}[\]<>|,;]{6,64})(?=$|[\s,;)])/gi;

/** Does this value (from key=value) look like a real secret rather than a name or a path? */
function looksRandom(v, maxLength = 256) {
  if (v.length < 16 || v.length > maxLength) return false;
  if (isPlaceholder(v)) return false;
  if (!mixed(v)) return false;
  if (/^[./~]/.test(v) || FILE_VALUE_RE.test(v)) return false;
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(v)) return false; // an environment variable name
  if (/process\.env|environ|getenv/i.test(v)) return false;
  if (wordLike(v)) return false; // ProjectManagement2024Plan, 2024-Q3-board-presentation-final
  return entropy(v) >= 3.3;
}

/** A short password worth a question: has a digit or symbol, is not a stand-in and does not read like words. */
function looksLikePassword(v) {
  if (!/[^A-Za-z]/.test(v)) return false; // plain letters: "password = password", "secret = none"
  if (isPlaceholder(v) || wordLike(v)) return false;
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(v)) return false;
  return !/^\$|process\.env|environ|getenv|^\.{0,2}[\\/]/i.test(v);
}

/**
 * Find the first secret-looking thing in a text. Returns { kind, level } or null. Never returns the secret.
 * level 'high' is a deny, 'low' (a short password) is a question.
 */
export function findSecret(text) {
  if (typeof text !== 'string' || !text) return null;
  let weak = null;
  for (const { name, re, ok, low } of PREFIX_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const value = m[1] ?? m[0];
      if (ok && !ok(value, m[0])) continue;
      if (low && low(value)) weak ??= { kind: name, level: 'low' };
      else return { kind: name, level: 'high' };
    }
  }
  GENERIC_RE.lastIndex = 0;
  for (const m of text.matchAll(GENERIC_RE)) {
    if (looksRandom(m[1], /session/i.test(m[0]) ? 4096 : 256)) return { kind: 'a password or key', level: 'high' };
  }
  if (weak) return weak;
  PASSWORD_QUOTED_RE.lastIndex = 0;
  for (const m of text.matchAll(PASSWORD_QUOTED_RE)) if (looksLikePassword(m[2])) return { kind: 'a password', level: 'low' };
  PASSWORD_BARE_RE.lastIndex = 0;
  for (const m of text.matchAll(PASSWORD_BARE_RE)) if (looksLikePassword(m[1])) return { kind: 'a password', level: 'low' };
  return null;
}

/* ------------------------------ policy ------------------------------ */

const ENV_TEMPLATES = /\.(example|sample|template|dist|defaults?)$/i;

/** .env, .env.production, *.env ... but not templates such as .env.example. */
export function isEnvFileArg(arg) {
  const base = String(arg).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  if (ENV_TEMPLATES.test(base)) return false;
  return /^\.env(\..+|\*.*)?$/i.test(base) || /\.env$/i.test(base);
}

/* ------------------------------ vault key files ------------------------------ */

const KEY_NAME = /(?:^|[\\/])(?:vault-key-[^\\/]*\.key|[^\\/]*\.abkey)$/i;
const GIT_CRYPT_DIR = /(?:^|[\\/])\.git[\\/]git-crypt(?:[\\/]|$)/i;

/** A vault key copy by name (vault-key-*.key, *.abkey) or anything in git-crypt's own folder inside .git. */
export function isKeyFileArg(arg) {
  const a = String(arg).replace(/[\\/]+$/, '');
  return KEY_NAME.test(a) || GIT_CRYPT_DIR.test(a);
}

/** "~/x" the way a shell would expand it (a quoted ~ reaches the hook unexpanded). */
const expandTilde = (p) => (/^~(?:[\\/]|$)/.test(p) ? join(homedir(), p.slice(1)) : p);

/** Is this path inside the project folder? A variable that is not expanded yet cannot be judged, so it counts as outside. */
function insideProject(rawPath) {
  const p = String(rawPath);
  if (!p || /^[$%]/.test(p)) return false;
  return projectRels(expandTilde(p)).length > 0;
}

/** git-crypt export-key writes the key where it is told: into the project, or ("-") to the screen, is not allowed. */
function exportsKeyUnsafely(seg) {
  if (programName(seg[0]) !== 'git-crypt') return false;
  const args = seg.slice(1).filter((a) => !a.startsWith('-') || a === '-');
  if (args[0] !== 'export-key') return false;
  const dest = args[1];
  return dest === undefined || dest === '-' || insideProject(dest);
}

/** Paths where secret-like text is allowed: the project's own .env.local and synthetic test fixtures. */
function pathIsExempt(rawPath) {
  const rels = projectRels(String(rawPath));
  if (!rels.length) return false;
  const rel = rels[0].toLowerCase();
  return rel === '.env.local' || rel.startsWith('tests/fixtures/');
}

// Programs that show or copy the contents of a file.
const ENV_READERS = new Set([
  'cat', 'type', 'get-content', 'gc', 'more', 'less', 'head', 'tail', 'bat', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'certutil',
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'sed', 'awk', 'gawk', 'select-string', 'sls', 'findstr',
  'cp', 'copy', 'copy-item', 'cpi', 'mv', 'move', 'move-item', 'mi', 'xcopy', 'scp', 'rsync', 'source', '.', 'import-clixml',
]);

// Copying INTO a keys file (cp .env.example .env.local) shows nothing, so only the sources are checked for these.
const COPY_PROGRAMS = new Set(['cp', 'copy', 'copy-item', 'cpi', 'xcopy']);

/** An argument that names a .env file, also as <.env, @.env or --file=.env. */
function namesEnvFile(arg) {
  let a = String(arg).replace(/^[<@]+/, '');
  const m = /^-{1,2}[A-Za-z][\w-]*[:=](.+)$/.exec(a);
  if (m) a = m[1];
  return a.length > 0 && !a.startsWith('-') && isEnvFileArg(a);
}

const decisionFor = (hit) => (hit.level === 'high' ? { decision: 'deny', reason: SECRET_REASON } : { decision: 'ask', reason: MAYBE_REASON });

/** Returns { decision: 'deny' | 'ask', reason } for a shell command, or null. */
export function checkCommandDecision(command, shell) {
  for (const seg of commandSegments(command, shell)) {
    if (!isGit(seg)) {
      const prog = programName(seg[0]);
      if (exportsKeyUnsafely(seg)) return { decision: 'deny', reason: KEY_FILE_REASON };
      if (ENV_READERS.has(prog) && seg.slice(1).some((a) => !a.startsWith('-') && isKeyFileArg(a.replace(/^[<@]+/, '')))) {
        return { decision: 'deny', reason: KEY_FILE_REASON };
      }
      if (ENV_READERS.has(prog)) {
        let args = seg.slice(1);
        if (COPY_PROGRAMS.has(prog)) {
          const plain = args.filter((a) => !a.startsWith('-'));
          const dest = plain[plain.length - 1];
          if (plain.length > 1) args = args.filter((a) => a !== dest || a.startsWith('-'));
        }
        if (args.some(namesEnvFile)) return { decision: 'deny', reason: ENV_READ_REASON };
      }
      continue;
    }
    const { sub, args } = parseGit(seg);
    if (sub === 'add' || sub === 'stage') {
      let afterDashes = false;
      for (const a of args) {
        if (a === '--' && !afterDashes) {
          afterDashes = true;
          continue;
        }
        if (!afterDashes && (a === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a))) return { decision: 'deny', reason: FORCE_ADD_REASON };
        if ((afterDashes || !a.startsWith('-')) && isEnvFileArg(a)) return { decision: 'deny', reason: ENV_ADD_REASON };
        if ((afterDashes || !a.startsWith('-')) && isKeyFileArg(a)) return { decision: 'deny', reason: KEY_FILE_REASON };
      }
    } else if (sub === 'update-index') {
      if (args.some((a) => !a.startsWith('-') && isEnvFileArg(a))) return { decision: 'deny', reason: ENV_ADD_REASON };
      if (args.some((a) => !a.startsWith('-') && isKeyFileArg(a))) return { decision: 'deny', reason: KEY_FILE_REASON };
    } else if (sub === 'commit') {
      const hit = findSecret(command);
      if (hit) return decisionFor(hit);
    }
  }
  // A command that writes a file (echo sk-... >> note.md, Set-Content, tee ...) carrying a secret.
  const targets = shellWriteTargets(command, shell);
  if (targets.some((t) => isKeyFileArg(t.value) && insideProject(t.value))) return { decision: 'deny', reason: KEY_FILE_REASON };
  if (targets.length && !targets.every((t) => pathIsExempt(t.value))) {
    const hit = findSecret(command);
    if (hit) return decisionFor(hit);
  }
  return null;
}

/** Returns a deny reason for a shell command, or null. (A question is not a deny: see checkCommandDecision.) */
export function checkCommand(command, shell) {
  const r = checkCommandDecision(command, shell);
  return r && r.decision === 'deny' ? r.reason : null;
}

async function main() {
  const input = await readInput();
  if (!input) return; // malformed: fail open
  const info = toolInfo(input);

  if (info.isEdit) {
    if (info.filePaths.some((p) => isKeyFileArg(p) && insideProject(p))) {
      deny(KEY_FILE_REASON);
      return;
    }
    // Exempt when every target path is exempt (normally there is exactly one).
    if (info.filePaths.length && info.filePaths.every(pathIsExempt)) return;
    for (const text of info.contents) {
      const hit = findSecret(text);
      if (hit) {
        const d = decisionFor(hit);
        if (d.decision === 'deny') deny(d.reason);
        else ask(d.reason);
        return;
      }
    }
    return;
  }

  if (info.isShell && info.command) {
    const d = checkCommandDecision(info.command, info.shell);
    if (!d) return;
    if (d.decision === 'deny') deny(d.reason);
    else ask(d.reason);
  }
}

if (isMainModule(import.meta.url)) await runHook(main);
