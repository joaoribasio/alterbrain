#!/usr/bin/env node
// obsidian-setup: prepares vault/.obsidian so the vault opens ready to use.
//   node system/scripts/obsidian-setup.mjs [--offline] [--json]
//        [--vault <folder>] [--catalogue <file>] [--base-url <url>]
// Writes app.json, core-plugins.json, daily-notes.json, community-plugins.json
// and downloads the pinned community plugins (sha256 checked) into
// .obsidian/plugins/<id>/. Safe to run again: it only adds or updates the
// settings it manages and keeps the rest.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { rootPath, vaultPath, isMainModule } from '../lib/paths.mjs';
import { readJson, writeJson } from '../lib/fsx.mjs';

export const CORE_PLUGINS = [
  'file-explorer', 'global-search', 'graph', 'backlink', 'canvas', 'outline',
  'page-preview', 'tag-pane', 'properties', 'bases', 'templates', 'daily-notes',
  'command-palette',
];

export const COMMUNITY_PLUGINS = ['obsidian-tasks-plugin', 'obsidian-git'];

export const APP_SETTINGS = {
  // Pasted images and files land next to quick captures, never in the raw archive.
  attachmentFolderPath: '00_inbox/captures/attachments',
  newFileLocation: 'folder',
  newFileFolderPath: '00_inbox',
  useMarkdownLinks: false, // [[wikilinks]]
  newLinkFormat: 'shortest',
  alwaysUpdateLinks: true,
  propertiesInDocument: 'visible',
  promptDelete: true,
  // "Detect all file extensions": Word, PowerPoint and Excel files show in the file list. The key name comes from plugin
  // sources that set it through Obsidian's own API; Obsidian publishes no app.json reference [Unverified].
  showUnsupportedFiles: true,
};

export const DAILY_NOTES_SETTINGS = { folder: '70_journal/daily', format: 'YYYY-MM-DD', template: '' };

// Obsidian Git settings (names verified against obsidian-git 2.41.1 source).
// The vault sits inside the git repository (the repository root is the parent
// of vault/). Obsidian Git finds that root by itself (it asks git for the
// top-level folder), so `basePath` stays empty: in this plugin it is a folder
// INSIDE the vault and cannot point upwards.
export const OBSIDIAN_GIT_SETTINGS = {
  autoSaveInterval: 10, // commit-and-sync every 10 minutes
  differentIntervalCommitAndPush: false,
  autoPushInterval: 0,
  autoPullInterval: 0,
  autoPullOnBoot: true,
  disablePush: false, // commit-and-sync includes the push
  pullBeforePush: true,
  syncMethod: 'rebase',
  commitMessage: 'auto (obsidian): {{date}}',
  autoCommitMessage: 'auto (obsidian): {{date}}',
  commitDateFormat: 'YYYY-MM-DD HH:mm',
  customMessageOnAutoBackup: false,
  autoBackupAfterFileChange: false,
  listChangedFilesInMessageBody: false,
  basePath: '',
  limitToVault: false,
  showBranchStatusBar: false, // one branch only: nothing to show
  disablePopups: true,
};

const PLUGIN_DATA = { 'obsidian-git': OBSIDIAN_GIT_SETTINGS };

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function mergeJson(file, managed) {
  const existing = readJson(file, {});
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  writeJson(file, { ...base, ...managed });
}

function writeCorePlugins(file) {
  const existing = readJson(file, null);
  let ids = [...CORE_PLUGINS];
  if (Array.isArray(existing)) ids = [...new Set([...existing, ...CORE_PLUGINS])];
  else if (existing && typeof existing === 'object') {
    ids = [...new Set([...Object.keys(existing).filter((k) => existing[k]), ...CORE_PLUGINS])];
  }
  writeJson(file, ids);
}

function writeCommunityPlugins(file) {
  const existing = readJson(file, []);
  const ids = Array.isArray(existing) ? existing : [];
  writeJson(file, [...new Set([...ids, ...COMMUNITY_PLUGINS])]);
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Install the files of one plugin. Returns a list of per-file results. */
async function installPlugin(id, entry, pluginsDir, { offline, baseUrl }) {
  const dir = join(pluginsDir, id);
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const [name, expected] of Object.entries(entry.files || {})) {
    if (!expected) {
      out.push({ plugin: id, file: name, status: 'not-shipped' });
      continue;
    }
    const target = join(dir, name);
    if (existsSync(target) && sha256(readFileSync(target)) === expected) {
      out.push({ plugin: id, file: name, status: 'present' });
      continue;
    }
    if (offline) {
      out.push({ plugin: id, file: name, status: 'skipped-offline' });
      continue;
    }
    const url = `${baseUrl.replace(/\/$/, '')}/${entry.repo}/releases/download/${entry.version}/${name}`;
    try {
      const buf = await download(url);
      const got = sha256(buf);
      if (got !== expected) {
        out.push({ plugin: id, file: name, status: 'rejected', error: 'The download does not match the pinned checksum, so it was not installed.' });
        continue;
      }
      const tmp = `${target}.part`;
      writeFileSync(tmp, buf);
      renameSync(tmp, target);
      out.push({ plugin: id, file: name, status: 'installed' });
    } catch (err) {
      rmSync(`${target}.part`, { force: true });
      out.push({ plugin: id, file: name, status: 'failed', error: String(err.message || err) });
    }
  }
  return out;
}

export async function setupObsidian({ vault, catalogueFile, offline = false, baseUrl = 'https://github.com' } = {}) {
  const vaultDir = vault ? resolve(vault) : vaultPath();
  const obs = join(vaultDir, '.obsidian');
  mkdirSync(obs, { recursive: true });

  mergeJson(join(obs, 'app.json'), APP_SETTINGS);
  writeCorePlugins(join(obs, 'core-plugins.json'));
  mergeJson(join(obs, 'daily-notes.json'), DAILY_NOTES_SETTINGS);
  writeCommunityPlugins(join(obs, 'community-plugins.json'));

  const catalogue = readJson(catalogueFile || rootPath('system', 'catalogue', 'obsidian-plugins.json'), null);
  const files = [];
  const problems = [];
  if (!catalogue) {
    problems.push('The plugin list (system/catalogue/obsidian-plugins.json) could not be read.');
  } else {
    for (const id of COMMUNITY_PLUGINS) {
      const entry = catalogue[id];
      if (!entry) {
        problems.push(`No pinned release found for ${id}.`);
        continue;
      }
      files.push(...(await installPlugin(id, entry, join(obs, 'plugins'), { offline, baseUrl })));
      if (PLUGIN_DATA[id]) {
        const pluginDir = join(obs, 'plugins', id);
        mkdirSync(pluginDir, { recursive: true });
        mergeJson(join(pluginDir, 'data.json'), PLUGIN_DATA[id]);
      }
    }
  }
  for (const f of files) {
    if (f.status === 'rejected' || f.status === 'failed') problems.push(`${f.plugin}/${f.file}: ${f.error}`);
  }
  const missing = files.filter((f) => f.status === 'skipped-offline').length;
  return { ok: problems.length === 0, vault: vaultDir, offline, files, problems, plugins_pending: missing };
}

function parseArgs(argv) {
  const opts = { json: false, offline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--offline') opts.offline = true;
    else if (a === '--vault') opts.vault = argv[++i];
    else if (a === '--catalogue') opts.catalogueFile = argv[++i];
    else if (a === '--base-url') opts.baseUrl = argv[++i];
    else return null;
  }
  if (opts.vault === undefined && argv.includes('--vault')) return null;
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (!opts) {
    console.error('Usage: node system/scripts/obsidian-setup.mjs [--offline] [--json] [--vault <folder>] [--catalogue <file>] [--base-url <url>]');
    return 2;
  }
  const res = await setupObsidian(opts);
  if (opts.json) {
    console.log(JSON.stringify(res));
    return res.ok ? 0 : 1;
  }
  console.log('Obsidian is set up for your vault.');
  console.log('- Settings written: new notes go to 00_inbox, daily notes to 70_journal/daily, [[wikilinks]] on.');
  const installed = res.files.filter((f) => f.status === 'installed').length;
  const present = res.files.filter((f) => f.status === 'present').length;
  if (installed) console.log(`- Plugins downloaded and checked: ${installed} files.`);
  if (present) console.log(`- Plugin files already in place: ${present}.`);
  if (res.plugins_pending) console.log('- Plugins were not downloaded (offline mode). Run this again when you are online.');
  for (const p of res.problems) console.log(`! ${p}`);
  console.log('');
  console.log('One-time steps in Obsidian:');
  console.log('1. Open Obsidian, choose "Open folder as vault", and pick the "vault" folder inside Alterbrain.');
  console.log('2. When asked about plugins, choose "Turn on community plugins".');
  console.log('   This is safe: the two plugins (Tasks and Git) are checked against fixed checksums.');
  return res.ok ? 0 : 1;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = await main(process.argv.slice(2));
