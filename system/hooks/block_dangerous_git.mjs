#!/usr/bin/env node
// PreToolUse (Bash|PowerShell): stop git commands that destroy history or work, redirect the backup, or leave the
// single main branch.
//
// Denied (bash and PowerShell syntax alike):
//   push --force | -f | --force-with-lease | +refspec | --mirror | --delete | -d | --prune | :ref, and pushing to
//   anything but origin (a URL, another remote); reset --hard | --keep | --merge; clean -f; checkout/restore/switch
//   that throw away the whole tree (checkout ., restore ., -f, --discard-changes); stash drop|clear; branch -d|-D;
//   tag -d; commit --amend; update-ref; reflog expire|delete; gc --prune; lfs prune; rm of the whole tree;
//   deleting or moving the .git folder; recursive deletes of the project folder or the vault; filter-branch /
//   filter-repo; worktree add; checkout -b, switch -c, branch <new name>; rebase -i; remote add|set-url|rename|remove;
//   git config / git -c for settings that run programs or redirect (core.hooksPath, core.sshCommand, alias.*, ...);
//   --no-index and --output on the read-only commands (diff, log, show ...), which can read or write any file.
// Allowed: `git branch` with no name (and --list, -v, --show-current, ...), `git clean -n`, `git restore --staged .`,
// and text that only MENTIONS a command inside quotes (a commit message about "git push --force").
//
// This is a best-effort guard, not a sandbox: a script can still do anything. It also refuses commands it cannot
// read (git called through a variable or a built string), which keeps irreversible actions behind the prompt.
// Fails open on malformed input.
import {
  UNRESOLVED, commandSegments, deny, gitGlobalOptions, isGit, isMainModule, parseGit, programName, projectRels, readInput, runHook, toolInfo,
} from '../lib/hookio.mjs';

const REASON = {
  force:
    'Force-pushing can overwrite your saved work online, and that cannot be undone. Alterbrain never does it.',
  hard: 'A hard reset throws away your unsaved changes for good. Alterbrain never does it.',
  clean: 'This would permanently delete files that are not saved in your history. Alterbrain never does it.',
  gitDir: 'Deleting or moving the .git folder would erase your whole saved history. Alterbrain never does it.',
  rewrite: 'Rewriting history can destroy your saved versions. Alterbrain never does it.',
  branch:
    'Alterbrain keeps all your work on one branch (main), so saving and backing up stay automatic. ' +
    'It does not create or switch branches or work trees.',
  rebase: 'An interactive rebase rewrites your saved history and needs a text editor. Alterbrain does not use it.',
  delete: 'Deleting a branch, a tag or something online can destroy saved work. Alterbrain never does it.',
  discard: 'This throws away your unsaved changes for good. Alterbrain never does it.',
  history: 'This rewrites or erases saved history. Alterbrain never does it.',
  remote:
    'Alterbrain keeps one online backup (origin). Adding or changing other online addresses could send your notes to the wrong place, ' +
    'so it does not do that. Ask me to run the setup step instead.',
  config: 'This git setting can run programs or redirect your backup, so Alterbrain never changes it.',
  readonly: 'That option lets a read-only git command read or write any file on this computer, so Alterbrain does not use it.',
  dynamic: 'This command is built from a variable or another command, so Alterbrain cannot check that it is safe. Write it out in full.',
  wipe: 'This would delete the whole project folder or your vault. Alterbrain never does it.',
};

const hasShortFlag = (arg, letters) => new RegExp(`^-[a-zA-Z]*[${letters}][a-zA-Z]*$`).test(arg);
const isShort = (a) => a.startsWith('-') && !a.startsWith('--');
// A cluster of single-letter flags such as -fu. A long single-dash word (git's "--sort -committerdate") is a value.
const isCluster = (a) => /^-[a-zA-Z]{1,5}$/.test(a);
const isDynamic = (a) => /^\$|\$\(|\$\{|^%\w+%$/.test(a);

// Settings that run a program, redirect traffic or add configuration from elsewhere.
const RISKY_CONFIG =
  /^(?:core\.(?:hookspath|sshcommand|fsmonitor|pager|editor|gitproxy|askpass|attributesfile|excludesfile)|alias\.|remote\.|url\.|credential\.|include|filter\.|diff\..*\.(?:command|textconv)|diff\.external|merge\..*\.driver|protocol\.|http\.|sequence\.editor|gpg\.|uploadpack\.|receive\.|safe\.|submodule\.)/i;

// Commands that only read. Their --no-index and --output options can still read or write any file.
const READ_ONLY_SUBS = new Set(['diff', 'log', 'show', 'status', 'blame', 'shortlog', 'whatchanged', 'grep', 'ls-files', 'ls-tree', 'cat-file', 'range-diff', 'diff-tree', 'diff-files', 'diff-index']);

// Subcommands where a variable or built string in the arguments could hide a destructive option.
const DYNAMIC_SUBS = new Set([
  'push', 'reset', 'clean', 'checkout', 'restore', 'switch', 'branch', 'stash', 'rebase', 'remote', 'config', 'update-ref',
  'reflog', 'gc', 'tag', 'rm', 'filter-branch', 'worktree', 'prune',
]);

function checkPush(args) {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--push-option' || a === '--receive-pack' || a === '--exec') {
      i++;
      continue;
    }
    if (a === '--repo' || a.startsWith('--repo=')) return REASON.remote;
    if (a.startsWith('--')) {
      const name = a.split('=')[0];
      if (['--force', '--force-with-lease', '--force-if-includes', '--mirror'].includes(name)) return REASON.force;
      if (name === '--delete' || name === '--prune') return REASON.delete;
    } else if (a.startsWith('-')) {
      if (hasShortFlag(a, 'f')) return REASON.force;
      if (isCluster(a) && hasShortFlag(a, 'd')) return REASON.delete;
    } else if (a.startsWith('+') && a.length > 1) {
      return REASON.force; // "+main" is a force-push refspec
    } else {
      positional.push(a);
    }
  }
  // push <remote> <refspec>...: only origin, and no ":ref" (an empty source deletes the remote ref).
  if (positional.length && positional[0] !== 'origin') return REASON.remote;
  if (positional.slice(1).some((r) => /^:[^:]/.test(r))) return REASON.delete;
  return null;
}

function checkClean(args) {
  const dry = args.some((a) => a === '--dry-run' || (!a.startsWith('--') && hasShortFlag(a, 'n')));
  const force = args.some((a) => a === '--force' || (!a.startsWith('--') && hasShortFlag(a, 'f')));
  return force && !dry ? REASON.clean : null;
}

/** True when `git branch ...` would create or rename a branch. */
function branchCreates(args) {
  const LIST_FLAGS = new Set(['--list', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--show-current']);
  const VALUE_LONG = new Set(['--sort', '--format', '--abbrev', '--set-upstream-to']);
  let list = false;
  let rename = false;
  let del = false;
  let positional = 0;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positional += args.length - i - 1;
      break;
    }
    if (a.startsWith('--')) {
      const name = a.split('=')[0];
      if (LIST_FLAGS.has(name)) list = true;
      if (name === '--move' || name === '--copy') rename = true;
      if (name === '--delete') del = true;
      if (!a.includes('=') && VALUE_LONG.has(name)) i++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      const letters = a.slice(1);
      if (/[mMcC]/.test(letters)) rename = true;
      if (/[dD]/.test(letters)) del = true;
      if (letters.includes('l')) list = true;
      if (letters === 'u') i++;
      continue;
    }
    positional++;
  }
  return rename || (positional > 0 && !list && !del);
}

/** A pathspec that stands for the whole working tree. */
const WHOLE_TREE = new Set(['.', './', '*', ':/', ':(top)', ':/*', ':(top)*', '.\\', '.\\*', './*']);
const wholeTree = (a) => WHOLE_TREE.has(a);

function checkConfig(args) {
  const flags = args.filter((a) => a.startsWith('-'));
  const pos = args.filter((a) => !a.startsWith('-'));
  if (flags.some((a) => a === '-e' || a === '--edit')) return REASON.config;
  if (flags.some((a) => /^--(?:get|get-all|get-regexp|get-urlmatch|list|name-only|show-origin|show-scope)$/.test(a) || a === '-l')) return null;
  const key = pos[0];
  if (!key) return null;
  const writes = flags.some((a) => /^--(?:add|replace-all|unset|unset-all|rename-section|remove-section)$/.test(a)) || pos.length >= 2;
  return writes && RISKY_CONFIG.test(key) ? REASON.config : null;
}

function checkGit(sub, args, seg) {
  // Arguments after "--" are file names, not options.
  const upToDashes = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;

  // -c key=value in front of the subcommand.
  const globals = gitGlobalOptions(seg);
  if (globals.configs.some((c) => RISKY_CONFIG.test(c.split('=')[0]))) return REASON.config;
  if (globals.flags.some((f) => f.startsWith('--exec-path'))) return REASON.config;

  if (isDynamic(sub)) return REASON.dynamic; // git $CMD: what runs is unknown
  if (DYNAMIC_SUBS.has(sub) && args.some(isDynamic)) return REASON.dynamic;

  if (READ_ONLY_SUBS.has(sub)) {
    if (upToDashes.some((a) => a === '--no-index' || a === '--output' || a.startsWith('--output=') || a === '-O' || a.startsWith('--open-files-in-pager'))) return REASON.readonly;
    return null;
  }

  switch (sub) {
    case 'push':
      return checkPush(args);
    case 'reset':
      return upToDashes.some((a) => a === '--hard' || a === '--keep' || a === '--merge') ? REASON.hard : null;
    case 'clean':
      return checkClean(args);
    case 'filter-branch':
    case 'filter-repo':
      return REASON.rewrite;
    case 'worktree': {
      const first = args.find((a) => !a.startsWith('-'));
      return first === 'add' ? REASON.branch : null;
    }
    case 'checkout':
      if (upToDashes.some((a) => a === '--orphan' || a.startsWith('--orphan=') || (!a.startsWith('--') && hasShortFlag(a, 'bB')))) return REASON.branch;
      if (upToDashes.some((a) => a === '--force' || (isCluster(a) && hasShortFlag(a, 'f')))) return REASON.discard;
      return args.some(wholeTree) ? REASON.discard : null;
    case 'restore': {
      if (!args.some(wholeTree)) return null;
      const staged = upToDashes.some((a) => a === '--staged' || (isCluster(a) && hasShortFlag(a, 'S')));
      const worktree = upToDashes.some((a) => a === '--worktree' || (isCluster(a) && hasShortFlag(a, 'W')));
      return staged && !worktree ? null : REASON.discard; // "restore --staged ." only un-stages
    }
    case 'switch':
      if (upToDashes.some((a) => ['--create', '--force-create', '--orphan'].includes(a.split('=')[0]) || (!a.startsWith('--') && hasShortFlag(a, 'cC')))) {
        return REASON.branch;
      }
      return upToDashes.some((a) => a === '--force' || a === '--discard-changes' || (isCluster(a) && hasShortFlag(a, 'f'))) ? REASON.discard : null;
    case 'branch':
      // "branch -d" (only a branch that is already merged) is fine; -D and "--delete --force" are not.
      if (upToDashes.some((a) => isCluster(a) && a.includes('D'))) return REASON.delete;
      if (upToDashes.some((a) => a === '--delete' || (isCluster(a) && a.includes('d'))) && upToDashes.some((a) => a === '--force' || (isCluster(a) && a.includes('f')))) return REASON.delete;
      return branchCreates(args) ? REASON.branch : null;
    case 'tag':
      return upToDashes.some((a) => a === '--delete' || a === '--force' || (isCluster(a) && hasShortFlag(a, 'df'))) ? REASON.delete : null;
    case 'stash': {
      const first = args.find((a) => !a.startsWith('-'));
      return first === 'drop' || first === 'clear' ? REASON.history : null;
    }
    case 'commit':
      return upToDashes.includes('--amend') ? REASON.history : null;
    case 'update-ref':
    case 'prune':
      return REASON.history;
    case 'reflog': {
      const first = args.find((a) => !a.startsWith('-'));
      return first === 'expire' || first === 'delete' ? REASON.history : null;
    }
    case 'gc':
      return args.some((a) => a === '--prune' || a.startsWith('--prune=')) ? REASON.history : null;
    case 'lfs': {
      const first = args.find((a) => !a.startsWith('-'));
      return first === 'prune' ? REASON.history : null;
    }
    case 'rm':
      return args.some(wholeTree) && !upToDashes.includes('--cached') ? REASON.discard : null;
    case 'remote': {
      const first = args.find((a) => !a.startsWith('-'));
      return ['add', 'set-url', 'rename', 'remove', 'rm', 'set-head', 'set-branches', 'prune'].includes(first) ? REASON.remote : null;
    }
    case 'config':
      return checkConfig(args);
    case 'rebase':
      return upToDashes.some((a) => {
        if (a === '--interactive' || a.startsWith('--interactive=')) return true;
        if (a.startsWith('--') || /^-[XSsxCO]/.test(a)) return false; // options that carry a value
        return hasShortFlag(a, 'i');
      })
        ? REASON.rebase
        : null;
    default:
      return null;
  }
}

// rm / Remove-Item / rd / del / mv ... pointed at a .git folder.
const REMOVERS = new Set([
  'rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'rimraf', 'unlink', 'shred', 'trash',
  'mv', 'move', 'move-item', 'mi', 'ren', 'rename', 'rename-item', 'rni',
]);
// Commands that name a path which a pipeline or sub-expression then hands to a remover.
const PATH_PRODUCERS = new Set(['join-path', 'get-item', 'gi', 'get-childitem', 'gci', 'ls', 'dir', 'find', 'resolve-path', 'split-path']);

/** Does a glob (* ? [..]) in this path part possibly match the name ".git"? */
function globMatchesGit(part) {
  if (!/[*?[]/.test(part)) return false;
  try {
    const rx = part
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${rx}$`, 'i').test('.git');
  } catch {
    return false;
  }
}

function pathValues(args) {
  const out = [];
  for (const raw of args) {
    let value = raw;
    if (value.startsWith('-')) {
      const m = /^-[A-Za-z]+[:=](.+)$/.exec(value); // -Path:.git
      if (!m) continue;
      value = m[1];
    } else if (/^\/[a-zA-Z]$/.test(value)) {
      continue; // cmd switch such as /s or /q
    }
    out.push(value);
  }
  return out;
}

function touchesGitDir(args) {
  for (const value of pathValues(args)) {
    const t = value.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = t.split('/');
    const direct = /(^|\/)\.git(\/|\*|\?|$)/i.test(t);
    if (!direct && !parts.some(globMatchesGit)) continue;
    const inside = /(^|\/)\.git\//i.test(t);
    if (inside && /\.lock$/i.test(t)) continue; // clearing a stale index.lock is fine
    return true;
  }
  return false;
}

const isRecursive = (args) =>
  args.some((a) => (isShort(a) && /^-[a-zA-Z]*[rR]/.test(a)) || /^--recursive$/i.test(a) || /^-recurse(?:[:=].*)?$/i.test(a) || /^\/s$/i.test(a));

/** A recursive delete aimed at the project folder, its parent, a drive, the home folder or the vault. */
function wipesWorkFolder(args) {
  if (!isRecursive(args)) return false;
  for (const value of pathValues(args)) {
    const t = value.replace(/\\/g, '/');
    if (/^(?:\.\.?\/?|\.\/\*|\*|\/\*?|~\/?\*?|\.\.\/\*|[A-Za-z]:\/?\*?)$/.test(t)) return true;
    if (/^\$(?:home|env:userprofile|env:homepath)\b|^\$\{?home\}?$/i.test(t)) return true;
    if (projectRels(value).some((r) => r === '' || r === '*' || r === 'vault' || r === 'vault/*')) return true;
  }
  return false;
}

const FIND_FILTERS = new Set(['-name', '-iname', '-path', '-ipath', '-regex', '-iregex', '-newer', '-mtime', '-mmin', '-atime', '-size', '-empty', '-user']);

/** Other ways to empty a folder: find -delete, rsync --delete, robocopy /MIR, .NET Directory.Delete. */
function bulkDelete(prog, args) {
  const lower = args.map((a) => a.toLowerCase());
  if (prog === 'find' && (lower.includes('-delete') || (lower.includes('-exec') && lower.some((a) => ['rm', 'rmdir', 'del'].includes(a))))) return true;
  if (prog === 'rsync' && lower.some((a) => a === '--delete' || a.startsWith('--delete-') || a === '--remove-source-files')) return true;
  if (prog === 'robocopy' && lower.some((a) => a === '/mir' || a === '/purge' || a === '/move')) return true;
  return false;
}

/** Returns a plain-English deny reason for a shell command, or null when it is fine. */
export function checkCommand(command, shell) {
  const segs = commandSegments(command, shell);
  let remover = false;
  let producerTouchesGit = false;
  for (const seg of segs) {
    if (seg[0] === UNRESOLVED) return REASON.dynamic;
    const prog = programName(seg[0]);
    if (isGit(seg)) {
      const { sub, args } = parseGit(seg);
      const reason = checkGit(sub, args, seg);
      if (reason) return reason;
      continue;
    }
    if (/^\$[A-Za-z_{(]/.test(seg[0]) && seg.slice(1).some((a) => DYNAMIC_SUBS.has(a.toLowerCase()))) return REASON.dynamic;
    if (REMOVERS.has(prog)) {
      remover = true;
      if (touchesGitDir(seg.slice(1))) return REASON.gitDir;
      if (wipesWorkFolder(seg.slice(1))) return REASON.wipe;
    }
    if (PATH_PRODUCERS.has(prog) && touchesGitDir(seg.slice(1))) producerTouchesGit = true;
    if (bulkDelete(prog, seg.slice(1))) {
      const narrowed = prog === 'find' && seg.slice(1).some((a) => FIND_FILTERS.has(a.toLowerCase()));
      if (touchesGitDir(seg.slice(1)) || prog === 'rsync' || prog === 'robocopy' || (!narrowed && wipesWorkFolder(['-r', ...seg.slice(1)]))) return REASON.wipe;
    }
  }
  // Get-Item .git | Remove-Item -Recurse   /   Remove-Item (Join-Path . .git)
  if (remover && producerTouchesGit) return REASON.gitDir;
  if (/\[(?:system\.)?io\.directory\]::\s*delete\s*\(/i.test(command)) return REASON.wipe;
  return null;
}

async function main() {
  const input = await readInput();
  if (!input) return; // malformed: fail open
  const info = toolInfo(input);
  if (!info.isShell || !info.command) return;
  const reason = checkCommand(info.command, info.shell);
  if (reason) deny(reason);
}

if (isMainModule(import.meta.url)) await runHook(main);
