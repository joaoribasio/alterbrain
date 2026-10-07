#!/usr/bin/env node
// doctor: a health check for Alterbrain. Every problem comes with a one-line fix.
//   node system/scripts/doctor.mjs [--json] [--ci]
// --ci skips checks about this particular computer (GitHub sign-in, the Obsidian
// app, Claude Code, vault contents) and fails only on repository problems.
// Exit codes: 0 = no failures (warnings are fine), 1 = something failed, 2 = usage.
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { projectRoot, rootPath, vaultPath, isDevMode, isMainModule } from '../lib/paths.mjs';
import { readJson } from '../lib/fsx.mjs';
import { has, run, cmpVersion, IS_WINDOWS } from '../lib/proc.mjs';
import {
  PRE_COMMIT_HOOK_TEXT, git, gitInstalled, hasCommits, isRepo, lfsInstalled, lfsMinBytes, parseRepoUrl, preCommitHookStatus, remoteUrl,
  unpushedOversizedBlobs,
} from '../lib/git.mjs';
import { getStatus } from '../lib/vaultkey.mjs';
import { normaliseManifest, fileMatchesSha } from './update.mjs';

const IS_MAC = process.platform === 'darwin';
const VAULT_DIRS = ['00_inbox', '10_projects', '20_areas', '30_wiki', '40_sources', '50_learning', '60_people', '70_journal', '80_me'];
const VAULT_FILES = ['Home.md', '00_inbox/Tasks.md'];

const installHint = (win, mac) => (IS_WINDOWS ? `Run: ${win}` : IS_MAC ? `Run: ${mac}` : 'Install it with your package manager.');

/** Collect results. `machine` checks are skipped in --ci mode. */
function makeReporter(ci) {
  const checks = [];
  // `tip` is advice on a check that is still ok (printed as "Tip:"). It is not a problem and never counts as one.
  const add = (id, label, status, detail, fix = null, { machine = false, tip = null } = {}) => {
    if (machine && ci) {
      checks.push({ id, label, status: 'skip', detail: 'Skipped in CI (this checks one computer, not the repository).', fix: null });
      return;
    }
    checks.push({ id, label, status, detail, fix: status === 'ok' || status === 'skip' ? null : fix, ...(tip && status === 'ok' ? { tip } : {}) });
  };
  return { checks, add };
}

function checkNode(r, release) {
  const min = release.min_node || '20.0.0';
  const ok = cmpVersion(process.versions.node, min) >= 0;
  r.add('node', 'Node.js', ok ? 'ok' : 'fail', `Version ${process.versions.node} (needs ${min} or newer).`,
    installHint('winget install --id OpenJS.NodeJS.LTS -e', 'brew install node'));
}

function checkGit(r, root, dev) {
  if (!gitInstalled()) {
    r.add('git', 'Git', 'fail', 'Git is not installed.', installHint('winget install --id Git.Git -e', 'brew install git'));
    return;
  }
  const v = git(['--version']).stdout.replace(/^git version\s*/i, '');
  r.add('git', 'Git', 'ok', `Version ${v}.`);
  if (isRepo(root)) r.add('git-repo', 'Version control', 'ok', 'This folder is under Git.', null, { machine: true });
  else r.add('git-repo', 'Version control', dev ? 'ok' : 'warn', 'This folder is not under Git, so nothing is saved automatically.', 'Run: git init -b main   (then node system/scripts/setup-github.mjs)', { machine: true });
}

/** "50 MB" for the size limit of big files (a whole number of megabytes when it is one). */
export function describeLimit(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Git LFS stores only files at or above the size limit (50 MB by default, ADR 0020). Ordinary documents, slides and
 * PDFs are saved as normal files, so a missing Git LFS matters only for files that big.
 */
function checkLfs(r, root) {
  if (!gitInstalled()) {
    r.add('git-lfs', 'Git LFS (big files)', 'skip', 'Needs Git first.', null, { machine: true });
    return;
  }
  const ok = lfsInstalled();
  const limit = describeLimit(lfsMinBytes(root));
  r.add('git-lfs', 'Git LFS (big files)', ok ? 'ok' : 'warn',
    ok ? `Installed. It stores files of ${limit} or more; everything else is saved as a normal file.`
      : `Not installed. Only files of ${limit} or more need it, so your notes and documents are saved normally, but bigger files are left out of your backup until it is installed.`,
    installHint('winget install --id GitHub.GitLFS -e', 'brew install git-lfs'), { machine: true });
}

/**
 * Obsidian Git saves and uploads on its own and never goes through git-auto, so a small check that Git runs before every
 * save (a pre-commit hook) sends big files to Git LFS for it (ADR 0020). git-auto installs the check on its first run.
 */
function checkBigFileHook(r, root, dev) {
  if (!gitInstalled() || !isRepo(root)) {
    r.add('big-file-hook', 'Big-file check for Obsidian Git', 'skip', 'Needs a Git folder.', null, { machine: true });
    return;
  }
  const hook = preCommitHookStatus(root);
  const limit = describeLimit(lfsMinBytes(root));
  if (hook.state === 'active' && !hook.outdated) {
    r.add('big-file-hook', 'Big-file check for Obsidian Git', 'ok', `In place, so Obsidian Git and other Git tools send files of ${limit} or more to Git LFS before saving them.`, null, { machine: true });
    return;
  }
  const fix = hook.state === 'foreign' || hook.state === 'hooks-path'
    ? 'Keep Obsidian Git switched off for big files, or ask Claude to run /health-check for the options.'
    : 'Run: node system/scripts/git-auto.mjs hook';
  const detail = hook.state === 'active' ? 'Installed, but out of date.' : hook.state === 'missing' ? PRE_COMMIT_HOOK_TEXT.missing : hook.message || PRE_COMMIT_HOOK_TEXT[hook.state] || PRE_COMMIT_HOOK_TEXT.error;
  r.add('big-file-hook', 'Big-file check for Obsidian Git', dev && hook.state === 'missing' ? 'ok' : 'warn', detail, fix, { machine: true });
}

/** Saved ordinary files that GitHub would refuse (about 100 MB): the online backup cannot go through until they are dealt with. */
function checkOversizedFiles(r, root) {
  if (!gitInstalled() || !isRepo(root) || !hasCommits(root) || !remoteUrl(root)) {
    r.add('big-blobs', 'Files too big to upload', 'skip', 'Needs a saved version and an online copy.', null, { machine: true });
    return;
  }
  const found = unpushedOversizedBlobs(root);
  if (found.error) {
    r.add('big-blobs', 'Files too big to upload', 'skip', 'Could not be checked.', null, { machine: true });
    return;
  }
  if (!found.files.length) {
    r.add('big-blobs', 'Files too big to upload', 'ok', 'No saved file is too big for the online backup.', null, { machine: true });
    return;
  }
  const n = found.files.length;
  r.add('big-blobs', 'Files too big to upload', 'fail',
    `${n === 1 ? 'One saved file is' : `${n} saved files are`} stored as an ordinary file and too big for GitHub (about 100 MB), so the online backup cannot go through. Your work is safe on this computer.`,
    'Open Claude and type /health-check. It can fix this without touching anything that is already online, with your OK.', { machine: true });
}

// The saved history, as git reports it: loose objects plus packs, in KiB. GitHub recommends keeping a repository small;
// the figures it names are [Unverified] (from memory), so the two levels below are Alterbrain's own: a gentle note
// from 1 GB and a warning from 4 GB. Git LFS files are stored elsewhere and are not counted here.
export const REPO_NOTE_KIB = 1024 * 1024;
export const REPO_WARN_KIB = 4 * 1024 * 1024;

/** Read `git count-objects -v`: { loose_kib, pack_kib }, or null when the text has no sizes. */
export function parseCountObjects(text) {
  const num = (key) => {
    const m = new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'm').exec(String(text || ''));
    return m ? Number(m[1]) : null;
  };
  const loose = num('size');
  const pack = num('size-pack');
  return loose === null && pack === null ? null : { loose_kib: loose || 0, pack_kib: pack || 0 };
}

/** "420 MB" or "1.3 GB" for a size in KiB. */
export function describeSize(kib) {
  return kib >= 1024 * 1024 ? `${(kib / (1024 * 1024)).toFixed(1)} GB` : `${Math.max(1, Math.round(kib / 1024))} MB`;
}

/** The verdict for a repository of this size: { level: 'ok'|'note'|'warn', status, detail, tip, fix }. */
export function repoSizeVerdict(kib) {
  const size = describeSize(kib);
  const advice = 'Put new big files you do not need to back up in vault/40_sources/raw/_local/ (it stays on this computer only).';
  if (kib >= REPO_WARN_KIB) {
    return {
      level: 'warn', status: 'warn', tip: null,
      detail: `The saved history of your notes is ${size}, which is large for an online backup and will get slower to save and join.`,
      fix: `${advice} Files already saved stay in the history, so ask Claude to run /health-check for the options.`,
    };
  }
  if (kib >= REPO_NOTE_KIB) {
    return { level: 'note', status: 'ok', fix: null, detail: `The saved history of your notes is ${size}. That is fine, but it is getting big.`, tip: `GitHub recommends keeping repositories small. ${advice}` };
  }
  return { level: 'ok', status: 'ok', fix: null, tip: null, detail: `The saved history of your notes is ${size}.` };
}

function checkRepoSize(r, root) {
  if (!gitInstalled() || !isRepo(root)) {
    r.add('repo-size', 'Backup size', 'skip', 'Needs a Git folder.', null, { machine: true });
    return;
  }
  const res = git(['count-objects', '-v'], { cwd: root });
  const sizes = res.ok ? parseCountObjects(res.stdout) : null;
  if (!sizes) {
    r.add('repo-size', 'Backup size', 'skip', 'Could not be read.', null, { machine: true });
    return;
  }
  const v = repoSizeVerdict(sizes.loose_kib + sizes.pack_kib);
  r.add('repo-size', 'Backup size', v.status, v.detail, v.fix, { machine: true, tip: v.tip });
}

function checkGh(r) {
  if (!has('gh')) {
    r.add('gh', 'GitHub sign-in', 'warn', 'The GitHub tool (gh) is not installed.', installHint('winget install --id GitHub.cli -e', 'brew install gh'), { machine: true });
    return;
  }
  const auth = run('gh', ['auth', 'status'], { timeout: 20_000 });
  r.add('gh', 'GitHub sign-in', auth.ok ? 'ok' : 'warn', auth.ok ? 'Signed in to GitHub.' : 'You are not signed in to GitHub.',
    'Run: gh auth login   (choose GitHub.com and sign in with your browser)', { machine: true });
}

function checkOrigin(r, root, release, dev) {
  if (!isRepo(root) || !gitInstalled()) {
    r.add('origin', 'Online backup', 'skip', 'Needs a Git folder.', null, { machine: true });
    return;
  }
  const url = remoteUrl(root);
  if (!url) {
    r.add('origin', 'Online backup', dev ? 'ok' : 'warn', 'No online copy yet, so your work is only on this computer.', 'Run: node system/scripts/setup-github.mjs', { machine: true });
    return;
  }
  const parsed = parseRepoUrl(url);
  const slug = parsed ? `${parsed.owner}/${parsed.name}`.toLowerCase() : '';
  if (!dev && release.repo && slug === String(release.repo).toLowerCase()) {
    r.add('origin', 'Online backup', 'warn', 'This folder still points at the public Alterbrain repo, not your own private one.', 'Run: node system/scripts/setup-github.mjs', { machine: true });
    return;
  }
  r.add('origin', 'Online backup', 'ok', `Backed up to ${parsed ? `${parsed.owner}/${parsed.name}` : 'a remote'}.`, null, { machine: true });
}

/**
 * Optional encryption of private notes (ADR 0019). Quiet when it is off. When it is on: is the tool here, is this
 * computer unlocked, is anything stored as plain text, has the key backup been tested.
 */
function checkEncryption(r, root) {
  if (!isRepo(root) || !gitInstalled()) return;
  const st = getStatus(root);
  if (!st.enabled) return;
  const fixOf = (id) => (st.problems.find((p) => p.id === id) || {}).fix || null;
  r.add('encryption-tool', 'Encryption tool (git-crypt)', st.git_crypt_installed ? 'ok' : 'warn',
    st.git_crypt_installed ? `Installed${st.git_crypt_version ? ` (version ${st.git_crypt_version})` : ''}.` : 'Not installed, so changes to your private notes cannot be saved.',
    fixOf('tool-missing'), { machine: true });
  r.add('encryption-unlocked', 'Private notes unlocked', st.unlocked ? 'ok' : 'warn',
    st.unlocked ? 'This computer holds the key.' : 'This computer is locked, so private notes are unreadable here and changes to them are not saved.',
    fixOf('locked'), { machine: true });
  const plain = st.plain.length;
  const gaps = st.attribute_files_missing.length + st.not_covered.length;
  const checkFailed = st.problems.some((p) => p.id === 'check-failed');
  r.add('encryption-files', 'Private notes encrypted online', plain || gaps || checkFailed ? 'fail' : 'ok',
    checkFailed ? 'The saved notes could not be checked.' : plain ? `${plain} saved private note(s) are stored without encryption.` : gaps ? 'The settings that choose which notes are encrypted are incomplete.' : `${st.encrypted} of ${st.tracked_in_scope} saved private notes are encrypted.`,
    fixOf('plain-files') || fixOf('attributes-missing') || fixOf('not-covered') || fixOf('check-failed'), { machine: true });
  // The upload check inside git (ADR 0019): it stops Obsidian Git and other Git tools from uploading a plain private note.
  if (st.pre_push_hook) {
    const hookProblem = st.problems.find((p) => String(p.id).startsWith('push-hook-'));
    r.add('encryption-push-hook', 'Upload check for private notes', st.pre_push_hook === 'active' ? 'ok' : 'warn',
      st.pre_push_hook === 'active' ? 'In place, so Obsidian Git and other Git tools cannot upload a private note without encryption.' : (hookProblem && hookProblem.message) || 'Not in place.',
      (hookProblem && hookProblem.fix) || 'Run: node system/scripts/vault-key.mjs setup', { machine: true });
  }
  r.add('encryption-backup', 'Vault key backup tested', st.key_backup_checked ? 'ok' : 'warn',
    st.key_backup_checked ? `Last tested on ${st.key_backup_checked}.` : 'The backup copy of your key file has never been tested. If you lose this computer, an untested copy may not save your notes.',
    'Run: node system/scripts/vault-key.mjs export --out <a folder outside this project>   then: node system/scripts/vault-key.mjs check --key <that file>', { machine: true });
}

function checkQuarto(r, release) {
  if (!has('quarto')) {
    r.add('quarto', 'Quarto (for PDFs)', 'warn', 'Not installed. It is only needed to make PDF reports.', installHint('winget install --id Posit.Quarto -e', 'brew install --cask quarto'), { machine: true });
    return;
  }
  const probe = IS_WINDOWS ? run('quarto --version', [], { shell: true, timeout: 20_000 }) : run('quarto', ['--version'], { timeout: 20_000 });
  const v = probe.stdout.trim().split(/\s+/)[0];
  const min = release.min_quarto || '1.0.0';
  const ok = v && cmpVersion(v, min) >= 0;
  r.add('quarto', 'Quarto (for PDFs)', ok ? 'ok' : 'warn', `Version ${v || 'unknown'} (wants ${min} or newer).`, installHint('winget upgrade --id Posit.Quarto -e', 'brew upgrade --cask quarto'), { machine: true });
}

function obsidianInstalled() {
  if (IS_WINDOWS) {
    const roots = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Obsidian'), process.env.ProgramFiles && join(process.env.ProgramFiles, 'Obsidian')].filter(Boolean);
    return roots.some((d) => existsSync(join(d, 'Obsidian.exe')));
  }
  if (IS_MAC) return existsSync('/Applications/Obsidian.app') || existsSync(join(homedir(), 'Applications', 'Obsidian.app'));
  return has('obsidian');
}

function checkObsidian(r, root) {
  const found = obsidianInstalled();
  r.add('obsidian-app', 'Obsidian app', found ? 'ok' : 'warn', found ? 'Installed.' : 'Not found on this computer.',
    installHint('winget install --id Obsidian.Obsidian -e', 'brew install --cask obsidian'), { machine: true });

  const dir = vaultPath('.obsidian');
  const problems = [];
  for (const f of ['app.json', 'core-plugins.json', 'community-plugins.json']) {
    const file = join(dir, f);
    if (!existsSync(file)) problems.push(`${f} is missing`);
    else if (readJson(file, undefined) === undefined) problems.push(`${f} is not valid`);
  }
  const catalogue = readJson(rootPath('system', 'catalogue', 'obsidian-plugins.json'), {}) || {};
  const wanted = readJson(join(dir, 'community-plugins.json'), []);
  for (const id of Array.isArray(wanted) ? wanted : []) {
    for (const f of ['main.js', 'manifest.json']) {
      if (!existsSync(join(dir, 'plugins', id, f))) problems.push(`plugin ${id} is not downloaded`);
    }
    const pin = catalogue[id]?.files?.['main.js'];
    const file = join(dir, 'plugins', id, 'main.js');
    if (pin && existsSync(file) && !fileMatchesSha(file, 'main.js', pin)) problems.push(`plugin ${id} does not match its pinned version`);
  }
  r.add('obsidian-config', 'Obsidian settings', problems.length ? 'warn' : 'ok',
    problems.length ? [...new Set(problems)].join('; ') + '.' : 'Settings and plugins are in place.',
    'Run: node system/scripts/obsidian-setup.mjs', { machine: true });
}

function checkClaudeCode(r, release) {
  if (!has('claude')) {
    r.add('claude-code', 'Claude Code', 'skip', 'Not on the command line (fine if you use the Claude desktop app).', null, { machine: true });
    return;
  }
  const res = IS_WINDOWS ? run('claude --version', [], { shell: true, timeout: 30_000 }) : run('claude', ['--version'], { timeout: 30_000 });
  const v = (res.stdout.match(/\d+\.\d+\.\d+/) || [])[0];
  const min = release.min_claude_code;
  if (!v) {
    r.add('claude-code', 'Claude Code', 'warn', 'Could not read its version.', 'Run: claude update', { machine: true });
    return;
  }
  const ok = !min || cmpVersion(v, min) >= 0;
  r.add('claude-code', 'Claude Code', ok ? 'ok' : 'warn', `Version ${v}${min ? ` (needs ${min} or newer)` : ''}.`, 'Run: claude update   (or update the Claude desktop app)', { machine: true });
}

function checkSettings(r, root, ci) {
  const file = rootPath('.claude', 'settings.json');
  if (!existsSync(file)) {
    r.add('settings', 'Claude settings', 'fail', '.claude/settings.json is missing.', 'Run the update again: /update-alterbrain (or restore the file from the Alterbrain repo).');
    return;
  }
  const s = readJson(file, undefined);
  if (s === undefined || s === null || typeof s !== 'object') {
    r.add('settings', 'Claude settings', 'fail', '.claude/settings.json is not valid JSON.', 'Restore it: git checkout -- .claude/settings.json');
    return;
  }
  if (s.model !== 'sonnet') {
    r.add('settings', 'Claude settings', ci ? 'fail' : 'warn', `The main model is "${s.model ?? 'not set'}", but Alterbrain expects "sonnet".`, 'Restore it: git checkout -- .claude/settings.json');
    return;
  }
  r.add('settings', 'Claude settings', 'ok', 'Main model is sonnet.');
}

function isOnboarded() {
  const d = readJson(rootPath('state', 'onboarding.json'), null);
  if (!d || typeof d !== 'object') return false;
  return d.complete === true || d.completed === true || Boolean(d.completed_at) || ['complete', 'completed', 'done', 'minimum_done'].includes(String(d.status || '').toLowerCase());
}

function checkOnboarding(r) {
  const done = isOnboarded();
  const state = readJson(rootPath('state', 'onboarding.json'), null);
  const essentialsOnly = String(state?.status || '').toLowerCase() === 'minimum_done';
  const detail = essentialsOnly ? 'The essential steps are done. The optional ones can wait.' : done ? 'Finished.' : 'Not finished yet.';
  r.add('onboarding', 'Onboarding', done ? 'ok' : 'warn', detail, 'Open Claude in this folder and type: /onboard', { machine: true });
}

function checkVault(r, onboarded) {
  const missing = [
    ...VAULT_DIRS.filter((d) => !existsSync(vaultPath(d))),
    ...VAULT_FILES.filter((f) => !existsSync(vaultPath(...f.split('/')))),
  ];
  const bad = missing.length > 0;
  r.add('vault', 'Vault folders', bad ? (onboarded ? 'fail' : 'warn') : 'ok',
    bad ? `Missing: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.` : 'All the standard folders are there.',
    onboarded ? 'Open Claude and type: /health-check   (it will put the folders back)' : 'Open Claude in this folder and type: /onboard   (it creates them)', { machine: true });
}

function checkManifest(r, dev) {
  const raw = readJson(rootPath('system', 'manifest.json'), null);
  if (!raw) {
    r.add('manifest', 'Framework files', 'warn', 'system/manifest.json is missing, so file integrity cannot be checked.', 'Developers: node system/scripts/validate.mjs --write-manifest. Others: /update-alterbrain');
    return;
  }
  const m = normaliseManifest(raw);
  const missing = [];
  const changed = [];
  let checked = 0;
  for (const [path, e] of m.files) {
    if (e.class !== 'code') continue;
    checked++;
    const abs = rootPath(...path.split('/'));
    if (!existsSync(abs)) missing.push(path);
    else if (!fileMatchesSha(abs, path, e.sha256)) changed.push(path);
  }
  const problems = missing.length + changed.length;
  if (!problems) {
    r.add('manifest', 'Framework files', 'ok', `${checked} code files match the release.`);
    return;
  }
  const parts = [];
  if (changed.length) parts.push(`changed: ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ` and ${changed.length - 4} more` : ''}`);
  if (missing.length) parts.push(`missing: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`);
  r.add('manifest', 'Framework files', dev ? 'warn' : 'fail', `Code files differ from the release (${parts.join('; ')}).`,
    dev ? 'Developers: node system/scripts/validate.mjs --write-manifest' : 'Restore the originals: open Claude and type /update-alterbrain');
}

function describeProblem(p) {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object') return [p.file || p.path, p.message || p.error || p.problem].filter(Boolean).join(': ') || JSON.stringify(p);
  return String(p);
}

function checkValidate(r) {
  const script = rootPath('system', 'scripts', 'validate.mjs');
  if (!existsSync(script)) {
    r.add('validate', 'Skills and agents check', 'skip', 'validate.mjs is not there yet.');
    return;
  }
  const res = spawnSync(process.execPath, [script, '--json'], { cwd: projectRoot(), encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() } });
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    /* plain text output is fine too */
  }
  if (res.status === 0) {
    r.add('validate', 'Skills and agents check', 'ok', 'All skills, agents and catalogues are valid.');
    return;
  }
  const list = parsed && (parsed.problems || parsed.errors || parsed.issues);
  const items = Array.isArray(list) ? list.map(describeProblem) : [];
  const detail = items.length
    ? `${items.length} problem(s): ${items.slice(0, 3).join(' | ')}${items.length > 3 ? ' ...' : ''}`
    : `The check reported problems (exit code ${res.status}).`;
  r.add('validate', 'Skills and agents check', 'fail', detail, 'Run: node system/scripts/validate.mjs   to see everything, then fix the files it names.');
}

function checkMcp(r) {
  const file = rootPath('.mcp.json');
  if (!existsSync(file)) {
    r.add('mcp-json', 'Connections (.mcp.json)', 'ok', 'Not generated yet. That is normal before onboarding.');
    return;
  }
  const j = readJson(file, undefined);
  const servers = j && typeof j === 'object' ? j.mcpServers : null;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    r.add('mcp-json', 'Connections (.mcp.json)', 'fail', '.mcp.json is not valid (it needs an "mcpServers" section).', 'Run: node system/scripts/mcp-gen.mjs   to rebuild it.');
    return;
  }
  const broken = Object.entries(servers).filter(([, s]) => !s || typeof s !== 'object' || !(typeof s.command === 'string' || typeof s.url === 'string')).map(([k]) => k);
  if (broken.length) {
    r.add('mcp-json', 'Connections (.mcp.json)', 'fail', `These connections have no command or address: ${broken.join(', ')}.`, 'Run: node system/scripts/mcp-gen.mjs   to rebuild it.');
    return;
  }
  r.add('mcp-json', 'Connections (.mcp.json)', 'ok', `${Object.keys(servers).length} connection(s) configured.`);
  // .mcp.json holds this computer's folder paths and is not saved to git: after a move it points at the old place.
  const here = projectRoot().split(sep).join('/');
  const text = JSON.stringify(j).replace(/\\\\/g, '/'); // a stringified backslash is two characters
  if (/(?:[A-Za-z]:\/|\/(?:Users|home)\/)/.test(text) && !text.toLowerCase().includes(here.toLowerCase())) {
    r.add('mcp-paths', 'Connections point at this folder', 'warn', '.mcp.json names a folder that is not this one (the vault moved or came from another computer).', 'Run: node system/scripts/mcp-gen.mjs   to rebuild it (this also happens when Claude starts).', { machine: true });
  }
  // Some connections (markitdown, fetch) are Python packages started with uv. Only matters if one is switched on.
  const usesUv = Object.values(servers).some((s) => [s && s.command, ...(Array.isArray(s && s.args) ? s.args.slice(0, 2) : [])].some((w) => /^uvx?(\.exe|\.cmd)?$/i.test(String(w))));
  if (usesUv) {
    const ok = has('uv') || has('uvx');
    r.add('uv', 'uv (for some connections)', ok ? 'ok' : 'warn', ok ? 'Installed.' : 'Not installed, so the connections that need it (such as markitdown or fetch) cannot start.', installHint('winget install --id astral-sh.uv -e', 'brew install uv'), { machine: true });
  }
}

/** A keys file saved by Notepad or Finder with a hidden extension is easy to miss. Reported only when found. */
function checkEnvFile(r, root) {
  const wrong = ['.env.local.txt', '.env.local.md', 'env.local', '.env.txt'].find((n) => existsSync(join(root, n)));
  if (!wrong) return;
  const how = IS_WINDOWS
    ? `In File Explorer choose View > Show > File name extensions, then rename ${wrong} to .env.local (delete the .txt at the end).`
    : `In Terminal run: mv ${wrong} .env.local`;
  r.add('env-file', 'Keys file (.env.local)', 'warn', `I found ${wrong}, but the keys file must be called exactly .env.local.`, how, { machine: true });
}

/**
 * The safety hooks must actually answer. A hook that never starts (a wrong path, a link that is not followed, a broken
 * Node) fails open: nothing is blocked and nothing says so. Ask one hook to refuse a force-push and check that it does.
 */
function checkHooks(r, root) {
  const hook = rootPath('system', 'hooks', 'block_dangerous_git.mjs');
  if (!existsSync(hook)) {
    r.add('hooks', 'Safety hooks', 'skip', 'The hooks are not there yet.');
    return;
  }
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push --force' } }),
    encoding: 'utf8', timeout: 15_000, windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const answered = /"permissionDecision":"deny"/.test(res.stdout || '');
  r.add('hooks', 'Safety hooks', answered ? 'ok' : 'fail',
    answered ? 'They answer, so dangerous actions are stopped.' : 'The safety hooks started but stayed silent, so nothing is being checked.',
    'Open the real project folder (not a shortcut or alias to it), or ask Claude: /health-check. Developers: run node system/hooks/block_dangerous_git.mjs with a Bash payload.');
}

function checkDisk(r, root) {
  try {
    const s = statfsSync(root);
    const free = Number(s.bavail) * Number(s.bsize);
    const gb = free / 1024 ** 3;
    const status = gb < 0.2 ? 'fail' : gb < 2 ? 'warn' : 'ok';
    r.add('disk', 'Free disk space', status, `${gb.toFixed(1)} GB free.`, 'Free up space: empty the recycle bin or move large files elsewhere.', { machine: true });
  } catch {
    r.add('disk', 'Free disk space', 'skip', 'Could not be read on this system.', null, { machine: true });
  }
}

export function runDoctor({ ci = false } = {}) {
  const root = projectRoot();
  const dev = isDevMode();
  const release = readJson(rootPath('system', 'release.json'), {}) || {};
  const r = makeReporter(ci);

  checkNode(r, release);
  checkGit(r, root, dev);
  checkLfs(r, root);
  checkRepoSize(r, root);
  checkBigFileHook(r, root, dev);
  checkOversizedFiles(r, root);
  checkGh(r);
  checkOrigin(r, root, release, dev);
  if (!ci) checkEncryption(r, root);
  checkQuarto(r, release);
  checkObsidian(r, root);
  checkClaudeCode(r, release);
  checkSettings(r, root, ci);
  const onboarded = isOnboarded();
  checkOnboarding(r);
  checkVault(r, onboarded);
  checkManifest(r, dev);
  checkValidate(r);
  checkMcp(r);
  checkEnvFile(r, root);
  checkHooks(r, root);
  checkDisk(r, root);

  const summary = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of r.checks) summary[c.status]++;
  return { ok: summary.fail === 0, ci, dev_mode: dev, version: release.version || null, summary, checks: r.checks };
}

/** The printed lines for one check: the result line, then its "Fix:" (a problem) or "Tip:" (advice on a check that is fine). */
export function renderCheck(c) {
  const mark = { ok: '[ok]  ', warn: '[!]   ', fail: '[FAIL]', skip: '[skip]' };
  const lines = [`${mark[c.status]} ${c.label}${c.detail ? `: ${c.detail}` : ''}`];
  if (c.fix) lines.push(`       Fix: ${c.fix}`);
  else if (c.tip) lines.push(`       Tip: ${c.tip}`);
  return lines;
}

function main(argv) {
  const json = argv.includes('--json');
  const ci = argv.includes('--ci');
  if (argv.some((a) => !['--json', '--ci'].includes(a))) {
    console.error('Usage: node system/scripts/doctor.mjs [--json] [--ci]');
    return 2;
  }
  const res = runDoctor({ ci });
  if (json) {
    console.log(JSON.stringify(res));
    return res.ok ? 0 : 1;
  }
  console.log(`Alterbrain health check${ci ? ' (CI mode)' : ''}${res.dev_mode ? ' - developer mode' : ''}`);
  console.log('');
  for (const c of res.checks) for (const line of renderCheck(c)) console.log(line);
  console.log('');
  const { fail, warn } = res.summary;
  if (fail) console.log(`${fail} problem(s) need fixing. Start with the [FAIL] lines above, or open Claude and type /health-check to be walked through them.`);
  else if (warn) console.log(`No failures. ${warn} thing(s) could be better (the [!] lines). Open Claude and type /health-check for help with them.`);
  else console.log('Everything looks good.');
  return res.ok ? 0 : 1;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
