#!/usr/bin/env node
// Upload check for private notes (ADR 0019). Git runs this before every upload from this folder, whichever tool starts it:
// the automatic save, Obsidian Git (which uploads by itself every 10 minutes) or a person typing git push.
//
// It is started by the small hook file .git/hooks/pre-push (written by vault-key.mjs, see lib/vaultkey.mjs):
//   node system/scripts/git-hooks/pre-push.mjs <remote name> <remote address>      with git's lines on standard input:
//   <local ref> <local sha> <remote ref> <remote sha>
//
// When encryption of private notes is on for this copy, it reads the commits the upload would send and refuses (exit 1,
// one plain sentence on standard error) if any private note in them is stored without the git-crypt header. It reads the
// stored bytes itself and never relies on git-crypt's output. Off, or nothing private to send: exit 0 and no output.
// It FAILS CLOSED: if it cannot tell, nothing is uploaded, because an upload cannot be taken back. It never forces,
// rewrites or deletes anything; its only side effect is one task in the task list (the same task the automatic save adds).
import { isMainModule } from '../../lib/paths.mjs';
import { git } from '../../lib/git.mjs';
import { addTask } from '../../lib/tasks.mjs';
import {
  PUSH_PLAIN_TASK_TEXT, PUSH_REFUSED_PREFIX, PUSH_UNCHECKED_TASK_TEXT, auditCommits, encryptionEnabled,
} from '../../lib/vaultkey.mjs';

const ALL_ZEROS = /^0+$/;

/** Git's lines on standard input -> [{ localRef, localSha, remoteRef, remoteSha }]. Blank and short lines are ignored. */
export function parsePushLines(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 4) continue;
    out.push({ localRef: parts[0], localSha: parts[1], remoteRef: parts[2], remoteSha: parts[3] });
  }
  return out;
}

/**
 * The commits one pushed ref would send: everything reachable from the new tip that the online copy does not have.
 * A new branch (remote sha of zeros) and a remote sha this computer has never fetched are both read as "everything that no
 * remote-tracking branch of that remote holds". When the remote is only an address, no commit counts as already sent.
 * Returns { revs, error }.
 */
function commitsFor(root, remote, line) {
  const args = ['rev-list', line.localSha];
  const exclude = [];
  if (remote && git(['remote', 'get-url', remote], { cwd: root }).ok) exclude.push(`--remotes=${remote}`);
  if (!ALL_ZEROS.test(line.remoteSha) && git(['cat-file', '-e', `${line.remoteSha}^{commit}`], { cwd: root }).ok) exclude.push(line.remoteSha);
  const listed = git(exclude.length ? [...args, '--not', ...exclude] : args, { cwd: root, timeout: 120_000 });
  if (!listed.ok) return { revs: [], error: listed.stderr.split(/\r?\n/)[0] || 'git could not list the commits.' };
  return { revs: listed.stdout.split(/\r?\n/).filter(Boolean), error: null };
}

/**
 * Decide an upload. `stdin` is git's text. Returns { ok, reason, plain, checked, message }:
 * reason 'off' (encryption is not on), 'nothing' (nothing to send), 'clean', 'plain' (refuse) or 'unchecked' (refuse).
 */
export function checkPush(root, remote, stdin) {
  if (!encryptionEnabled(root)) return { ok: true, reason: 'off', plain: [], checked: 0, message: '' };
  const lines = parsePushLines(stdin).filter((l) => !ALL_ZEROS.test(l.localSha)); // a deleted branch sends no commits
  if (!lines.length) return { ok: true, reason: 'nothing', plain: [], checked: 0, message: '' };

  const revs = new Set();
  for (const line of lines) {
    if (!/^[0-9a-f]{40,64}$/i.test(line.localSha)) return unchecked('git gave an upload line this check does not understand');
    const found = commitsFor(root, remote, line);
    if (found.error) return unchecked(found.error);
    for (const r of found.revs) revs.add(r);
  }
  const audit = auditCommits(root, [...revs]);
  if (audit.error) return unchecked(audit.error);
  if (audit.plain.length) {
    const n = audit.plain.length;
    const what = n === 1 ? 'one of your private notes would have' : `${n} of your private notes would have`;
    return {
      ok: false,
      reason: 'plain',
      plain: audit.plain,
      checked: audit.checked,
      message: `${PUSH_REFUSED_PREFIX} because ${what} been sent without encryption. Nothing was sent. Open Claude and type /health-check`,
    };
  }
  return { ok: true, reason: 'clean', plain: [], checked: audit.checked, message: '' };
}

function unchecked(detail) {
  return {
    ok: false,
    reason: 'unchecked',
    plain: [],
    checked: 0,
    detail,
    message: `${PUSH_REFUSED_PREFIX} because it could not check that your private notes are encrypted. Nothing was sent. Open Claude and type /health-check`,
  };
}

/** Standard input as text; empty when there is none (a person ran the script by hand). */
function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function main(argv) {
  const top = git(['rev-parse', '--show-toplevel'], { cwd: process.cwd() });
  if (!top.ok || !top.stdout) return 0; // not inside a working folder (a bare copy): nothing private lives here
  const root = top.stdout.split(/\r?\n/)[0];
  process.env.CLAUDE_PROJECT_DIR = root; // the task list belongs to this folder, whatever the caller's environment says
  let verdict;
  try {
    verdict = checkPush(root, argv[0], await readStdin());
  } catch (e) {
    verdict = unchecked(String((e && e.message) || e));
  }
  if (verdict.ok) return 0;
  process.stderr.write(`${verdict.message}\n`);
  try {
    addTask({ text: verdict.reason === 'plain' ? PUSH_PLAIN_TASK_TEXT : PUSH_UNCHECKED_TASK_TEXT, tag: 'git', priority: 'high' });
  } catch {
    /* the refusal above is what matters; a task is a nice-to-have */
  }
  return 1;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
