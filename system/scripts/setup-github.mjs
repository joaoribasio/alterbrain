#!/usr/bin/env node
// setup-github: gives the user their OWN private online copy (backup) of
// this folder on GitHub.
//   node system/scripts/setup-github.mjs [--name <repo>] [--dry-run] [--json]
//   node system/scripts/setup-github.mjs --detach-only [--dry-run] [--json]
//        (only disconnects the public Alterbrain repo, for users who skip the backup)
// If the folder still points at the public Alterbrain repo (or any repo that
// is not the user's), that address is remembered in state/release-origin.json
// and removed, so the user never pushes their notes to somebody else's repo.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, rootPath, isDevMode, isMainModule } from '../lib/paths.mjs';
import { readJson, writeJson, today } from '../lib/fsx.mjs';
import { has, run } from '../lib/proc.mjs';
import {
  git, gitInstalled, lfsInstalled, isRepo, hasCommits, remoteUrl, parseRepoUrl, commitAll, ensurePreCommitHook, PRE_COMMIT_HOOK_TEXT,
} from '../lib/git.mjs';
import { findSecret } from '../hooks/block_secrets.mjs';

const DEFAULT_NAME = 'my-alterbrain';
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function parseArgs(argv) {
  const opts = { name: DEFAULT_NAME, dryRun: false, json: false, detachOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--detach-only') opts.detachOnly = true;
    else if (a === '--name') opts.name = argv[++i];
    else return null;
  }
  if (!opts.name || !NAME_RE.test(opts.name) || /^\.+$/.test(opts.name)) return null;
  return opts;
}

/** Decide what to do about the existing origin. Pure, so it is easy to test. */
export function judgeOrigin(url, { releaseRepo, login }) {
  if (!url) return { kind: 'none' };
  const parsed = parseRepoUrl(url);
  const slug = parsed ? `${parsed.owner}/${parsed.name}`.toLowerCase() : null;
  if (!parsed) return { kind: 'foreign', reason: 'unrecognised address', slug: null };
  if (releaseRepo && slug === String(releaseRepo).toLowerCase()) {
    return { kind: 'foreign', reason: 'the public Alterbrain repo', slug: `${parsed.owner}/${parsed.name}` };
  }
  if (login && parsed.owner.toLowerCase() === login.toLowerCase()) return { kind: 'own', slug: `${parsed.owner}/${parsed.name}` };
  if (login) return { kind: 'foreign', reason: 'a repo that is not yours', slug: `${parsed.owner}/${parsed.name}` };
  return { kind: 'unknown', slug: `${parsed.owner}/${parsed.name}` };
}

/**
 * Disconnect the folder from the public Alterbrain repo, without needing GitHub
 * or creating anything. Used when the user skips the backup, so the automatic
 * save never pulls from, or pushes to, the public repo. Any other origin is left alone.
 */
export function detachPublicOrigin(opts) {
  const root = projectRoot();
  const release = readJson(rootPath('system', 'release.json'), {}) || {};
  const steps = [];
  const dry = !!opts.dryRun;
  if (isDevMode()) {
    steps.push({ id: 'dev-mode', text: 'Developer mode is on, so the online copy is left exactly as it is.', status: 'skipped' });
    return { ok: true, dry_run: dry, steps, blockers: [] };
  }
  if (!gitInstalled() || !isRepo(root)) {
    steps.push({ id: 'no-repo', text: 'This folder is not under version control yet, so there is nothing to disconnect.', status: 'skipped' });
    return { ok: true, dry_run: dry, steps, blockers: [] };
  }
  const url = remoteUrl(root);
  const verdict = judgeOrigin(url, { releaseRepo: release.repo, login: null });
  if (verdict.kind !== 'foreign' || verdict.reason !== 'the public Alterbrain repo') {
    steps.push({ id: 'no-public-origin', text: url ? 'This folder is not connected to the public Alterbrain repo. Nothing to disconnect.' : 'This folder has no online copy connected. Nothing to disconnect.', status: 'skipped' });
    return { ok: true, dry_run: dry, steps, blockers: [] };
  }
  steps.push({ id: 'record-origin', text: 'Remember where this copy came from in state/release-origin.json.', status: dry ? 'planned' : 'done' });
  steps.push({ id: 'remove-origin', text: 'Disconnect this folder from the public Alterbrain repo, so your notes can never be sent there.', status: dry ? 'planned' : 'done' });
  if (dry) return { ok: true, dry_run: true, steps, blockers: [] };
  const file = rootPath('state', 'release-origin.json');
  const existing = readJson(file, null);
  if (!existing || !existing.url) writeJson(file, { schema: 1, repo: verdict.slug, url, recorded: today() });
  const rm = git(['remote', 'remove', 'origin'], { cwd: root });
  if (!rm.ok) {
    const fix = rm.stderr || 'Run: git remote remove origin';
    steps[1].status = 'failed';
    steps[1].fix = fix;
    return { ok: false, dry_run: false, steps, blockers: [{ id: 'remove-origin', text: 'The old connection could not be removed.', fix }] };
  }
  return { ok: true, dry_run: false, steps, blockers: [] };
}

export function setupGithub(opts) {
  if (opts.detachOnly) return detachPublicOrigin(opts);
  const root = projectRoot();
  const release = readJson(rootPath('system', 'release.json'), {}) || {};
  const steps = [];
  const blockers = [];
  const dry = opts.dryRun;
  const step = (id, text, status = dry ? 'planned' : 'done', extra = {}) => {
    const s = { id, text, status, ...extra };
    steps.push(s);
    return s;
  };
  const fail = (id, text, fix) => {
    blockers.push({ id, text, fix });
    steps.push({ id, text, status: 'failed', fix });
  };

  if (isDevMode()) {
    step('dev-mode', 'Developer mode is on, so the online copy is left exactly as it is.', 'skipped');
    return { ok: true, dry_run: dry, steps, blockers };
  }
  if (!gitInstalled()) {
    fail('git', 'Git is not installed.', 'Install it with: winget install --id Git.Git -e (Windows) or brew install git (Mac).');
    return { ok: false, dry_run: dry, steps, blockers };
  }

  // 1. Is the user signed in to GitHub?
  let authed = false;
  let login = null;
  if (!has('gh')) {
    fail('gh', 'The GitHub tool (gh) is not installed.', 'Install it with: winget install --id GitHub.cli -e (Windows) or brew install gh (Mac).');
  } else if (!run('gh', ['auth', 'status'], { timeout: 30_000 }).ok) {
    fail('gh-auth', 'You are not signed in to GitHub yet.', 'Run: gh auth login   (choose GitHub.com, HTTPS, and sign in with your browser), then run this again.');
  } else {
    authed = true;
    const who = run('gh', ['api', 'user', '--jq', '.login'], { timeout: 30_000 });
    login = who.ok && who.stdout ? who.stdout.trim() : null;
    step('gh-auth', login ? `Signed in to GitHub as ${login}.` : 'Signed in to GitHub.', 'done');
  }

  // Large-file support must exist before anything is changed.
  const lfsOk = lfsInstalled();
  if (!lfsOk) {
    fail('lfs', 'Git LFS is not installed (it stores files of 50 MB or more, such as long videos and big datasets; everyday notes and documents do not need it).', 'Install it with: winget install --id GitHub.GitLFS -e (Windows) or brew install git-lfs (Mac).');
  }

  // Change nothing until every check above has passed.
  if (!dry && blockers.length) return { ok: false, dry_run: dry, steps, blockers, login, repo_name: opts.name };

  // 2. Make sure this folder is a git repository.
  const repoReady = isRepo(root);
  if (!repoReady) {
    step('git-init', 'Start version control in this folder (git init).');
    if (!dry) git(['init', '-b', 'main'], { cwd: root });
  }

  // 3. Where does origin point now?
  const url = repoReady ? remoteUrl(root) : null;
  const verdict = judgeOrigin(url, { releaseRepo: release.repo, login });
  let needCreate = true;
  if (verdict.kind === 'foreign' || (verdict.kind === 'unknown' && dry)) {
    const label = verdict.kind === 'unknown' ? 'a repo that may not be yours (it will be checked once you are signed in)' : verdict.reason;
    step('record-origin', `Remember where this copy came from (${label}) in state/release-origin.json.`);
    step('remove-origin', 'Disconnect this folder from that repo, so your notes can never be sent there.');
    if (!dry && verdict.kind === 'foreign') {
      const file = rootPath('state', 'release-origin.json');
      const existing = readJson(file, null);
      if (!existing || !existing.url) {
        writeJson(file, { schema: 1, repo: verdict.slug, url, recorded: today() });
      }
      const rm = git(['remote', 'remove', 'origin'], { cwd: root });
      if (!rm.ok) {
        fail('remove-origin', 'The old connection could not be removed.', rm.stderr || 'Run: git remote remove origin');
        return { ok: false, dry_run: dry, steps, blockers };
      }
    }
  } else if (verdict.kind === 'own') {
    step('origin-own', `This folder already uses your own repo (${verdict.slug}). Nothing to create.`, 'skipped');
    needCreate = false;
  } else if (verdict.kind === 'unknown') {
    fail('origin-unknown', 'Could not tell whose repo this folder points to.', 'Sign in with: gh auth login, then run this again.');
    return { ok: false, dry_run: dry, steps, blockers };
  }

  // 4. Large-file support.
  if (lfsOk) {
    step('lfs', 'Switch on Git LFS (it stores files of 50 MB or more, so a long video or a big dataset does not slow your backup down).');
    if (!dry) git(['lfs', 'install', '--local'], { cwd: root });
  }

  // 4b. Obsidian Git saves by itself and never goes through the automatic save, so Git runs the same big-file check for it.
  const check = step('big-file-check', 'Switch on the check that sends big files to Git LFS before any Git tool, Obsidian Git included, saves them as ordinary files.');
  if (!dry) {
    const hook = ensurePreCommitHook(root);
    if (hook.state !== 'active') {
      check.status = 'skipped';
      check.text = hook.message || PRE_COMMIT_HOOK_TEXT[hook.state] || PRE_COMMIT_HOOK_TEXT.error;
    }
  }

  // 5. GitHub needs at least one saved version to upload.
  if (!repoReady || !hasCommits(root)) {
    step('first-commit', 'Save a first version of your folder.');
    if (!dry && blockers.length === 0) {
      // Everything is about to be uploaded for the first time: leave out any file that looks like it holds a password or key.
      const c = commitAll(root, 'auto: first version', {}, { scan: (text) => { const h = findSecret(text); return h && h.level === 'high' ? h : null; } });
      if (!c.ok) fail('first-commit', 'The first version could not be saved.', c.error || 'Check that Git has your name set.');
      else {
        if (c.held && c.held.length) {
          step('held-back', `Left out of the first upload because they look like they hold a password or key: ${c.held.map((h) => h.file).join(', ')}. Take the secret out of them (keys belong in .env.local); they are saved with the next save.`, 'done');
        }
        // Big files are stored through Git LFS; the ones that cannot be (see prepareBigFiles) stay on this computer.
        const leftOut = (c.big && c.big.left_out) || [];
        if (leftOut.length) {
          step('held-back-big', `Left out of the first upload because they are too big to store safely: ${leftOut.map((l) => (l.reason === 'private' ? 'a very large private file' : l.path)).join(', ')}. They stay on this computer, and the next automatic save adds a task that explains what to do.`, 'done');
        }
      }
    }
  }

  // 6. Create the private repo and upload.
  if (needCreate) {
    step('create', `Create a PRIVATE repo called "${opts.name}" on your GitHub account and upload your folder.`);
    if (!dry && blockers.length === 0 && authed) {
      const created = run('gh', ['repo', 'create', opts.name, '--private', '--source', '.', '--remote', 'origin', '--push'], { cwd: root, timeout: 300_000 });
      if (!created.ok) {
        const text = `${created.stderr} ${created.stdout}`;
        const taken = /already exists|name already/i.test(text);
        fail('create', taken ? `A repo called "${opts.name}" already exists on your account.` : 'GitHub could not create the repo.', taken ? 'Pick another name: node system/scripts/setup-github.mjs --name <new-name>' : text.trim().slice(0, 300));
      }
    }
  }

  return { ok: blockers.length === 0, dry_run: dry, steps, blockers, login, repo_name: opts.name };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts) {
    console.error('Usage: node system/scripts/setup-github.mjs [--name <repo>] [--dry-run] [--json]');
    console.error('       node system/scripts/setup-github.mjs --detach-only [--dry-run] [--json]');
    console.error('The name may contain letters, numbers, dots, dashes and underscores.');
    return 2;
  }
  const res = setupGithub(opts);
  if (opts.json) {
    console.log(JSON.stringify(res));
  } else {
    console.log(opts.dryRun ? 'Dry run: nothing will be changed. This is what would happen.' : opts.detachOnly ? 'Checking that your notes cannot be sent to the public Alterbrain repo.' : 'Setting up your private online backup.');
    for (const s of res.steps) {
      const mark = { done: '[done]', planned: '[plan]', skipped: '[skip]', failed: '[fail]' }[s.status] || '[ ]';
      console.log(`${mark} ${s.text}`);
      if (s.status === 'failed' && s.fix) console.log(`       Fix: ${s.fix}`);
    }
    if (!opts.dryRun && res.ok && opts.detachOnly) console.log('Done. Your notes stay on this computer until you set up your own private backup.');
    else if (!opts.dryRun && res.ok) console.log(`Done. Your private repo "${opts.name}" is ready. Saving and backing up now happen on their own.`);
    if (opts.dryRun && res.blockers.length) console.log('Before you run it for real, fix the [fail] items above.');
  }
  if (opts.dryRun) return 0;
  return res.ok ? 0 : 1;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
