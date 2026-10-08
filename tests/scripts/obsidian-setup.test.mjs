import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import {
  tmp, cleanup, write, sha, runScript, runScriptAsync, FIXTURES, REPO_ROOT, join,
} from '../fixtures/ops/helpers.mjs';

const PLUGIN_FIXTURES = join(FIXTURES, 'plugins');
const fx = (dir, name) => readFileSync(join(PLUGIN_FIXTURES, dir, name));

const catalogue = {
  'obsidian-tasks-plugin': {
    repo: 'fake/tasks',
    version: '1.0.0',
    files: {
      'main.js': sha(fx('fake-tasks', 'main.js')),
      'manifest.json': sha(fx('fake-tasks', 'manifest.json')),
      'styles.css': sha(fx('fake-tasks', 'styles.css')),
    },
  },
  'obsidian-git': {
    repo: 'fake/git',
    version: '2.0.0',
    files: {
      'main.js': sha(fx('fake-git', 'main.js')),
      'manifest.json': sha(fx('fake-git', 'manifest.json')),
      'styles.css': null,
    },
  },
};

let server;
let baseUrl;
let tamper = false;
const served = [];

before(async () => {
  server = createServer((req, res) => {
    served.push(req.url);
    const m = req.url.match(/^\/fake\/(tasks|git)\/releases\/download\/([^/]+)\/(.+)$/);
    const dir = m && (m[1] === 'tasks' ? 'fake-tasks' : 'fake-git');
    const file = m && join(PLUGIN_FIXTURES, dir, m[3]);
    if (!file || !existsSync(file)) {
      res.writeHead(404).end('nope');
      return;
    }
    let body = readFileSync(file);
    if (tamper && m[3] === 'main.js') body = Buffer.concat([body, Buffer.from('\n/* evil */\n')]);
    res.writeHead(200).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function setup() {
  const dir = tmp('ab-obs-');
  const vault = join(dir, 'vault');
  const catFile = join(dir, 'catalogue.json');
  write(catFile, JSON.stringify(catalogue));
  return { dir, vault, catFile, root: dir };
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('offline mode writes the settings and skips downloads', () => {
  const { dir, vault, catFile, root } = setup();
  try {
    const r = runScript('obsidian-setup.mjs', ['--offline', '--json', '--vault', vault, '--catalogue', catFile], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, true);
    assert.ok(out.plugins_pending > 0);

    const app = readJson(join(vault, '.obsidian', 'app.json'));
    assert.equal(app.newFileLocation, 'folder');
    assert.equal(app.newFileFolderPath, '00_inbox');
    assert.equal(app.useMarkdownLinks, false);
    assert.equal(app.showUnsupportedFiles, true, 'Word, PowerPoint and Excel files show in the file list');
    assert.match(app.attachmentFolderPath, /^00_inbox\//);

    const core = readJson(join(vault, '.obsidian', 'core-plugins.json'));
    for (const id of ['bases', 'properties', 'templates', 'daily-notes', 'canvas', 'backlink', 'file-explorer', 'global-search', 'graph', 'outline', 'page-preview', 'tag-pane', 'command-palette']) {
      assert.ok(core.includes(id), `core plugin ${id}`);
    }
    assert.equal(readJson(join(vault, '.obsidian', 'daily-notes.json')).folder, '70_journal/daily');
    assert.deepEqual(readJson(join(vault, '.obsidian', 'community-plugins.json')), ['obsidian-tasks-plugin', 'obsidian-git']);

    const gitData = readJson(join(vault, '.obsidian', 'plugins', 'obsidian-git', 'data.json'));
    assert.equal(gitData.autoSaveInterval, 10);
    assert.equal(gitData.autoPullOnBoot, true);
    assert.equal(gitData.autoCommitMessage, 'auto (obsidian): {{date}}');
    assert.equal(gitData.basePath, '', 'the plugin finds the repository above the vault itself');
    assert.equal(existsSync(join(vault, '.obsidian', 'plugins', 'obsidian-git', 'main.js')), false);
  } finally {
    cleanup(dir);
  }
});

test('downloads pinned plugins, verifies sha256 and is repeatable', async () => {
  const { dir, vault, catFile, root } = setup();
  try {
    const args = ['--json', '--vault', vault, '--catalogue', catFile, '--base-url', baseUrl];
    const first = await runScriptAsync('obsidian-setup.mjs', args, root);
    assert.equal(first.code, 0, first.stdout + first.stderr);
    const out = JSON.parse(first.stdout);
    assert.equal(out.files.filter((f) => f.status === 'installed').length, 5);
    assert.ok(out.files.some((f) => f.plugin === 'obsidian-git' && f.file === 'styles.css' && f.status === 'not-shipped'));
    const main = join(vault, '.obsidian', 'plugins', 'obsidian-tasks-plugin', 'main.js');
    assert.equal(sha(readFileSync(main)), catalogue['obsidian-tasks-plugin'].files['main.js']);
    assert.equal(existsSync(join(vault, '.obsidian', 'plugins', 'obsidian-git', 'styles.css')), false);

    const before = served.length;
    const second = await runScriptAsync('obsidian-setup.mjs', args, root);
    assert.equal(second.code, 0);
    assert.equal(served.length, before, 'files already in place are not downloaded again');
  } finally {
    cleanup(dir);
  }
});

test('a download that does not match its checksum is rejected and not written', async () => {
  const { dir, vault, catFile, root } = setup();
  tamper = true;
  try {
    const r = await runScriptAsync('obsidian-setup.mjs', ['--json', '--vault', vault, '--catalogue', catFile, '--base-url', baseUrl], root);
    assert.equal(r.code, 1);
    const out = JSON.parse(r.stdout);
    assert.ok(out.files.some((f) => f.file === 'main.js' && f.status === 'rejected'));
    assert.equal(existsSync(join(vault, '.obsidian', 'plugins', 'obsidian-tasks-plugin', 'main.js')), false);
    assert.equal(existsSync(join(vault, '.obsidian', 'plugins', 'obsidian-tasks-plugin', 'main.js.part')), false);
    // the honest files still arrive
    assert.ok(existsSync(join(vault, '.obsidian', 'plugins', 'obsidian-tasks-plugin', 'manifest.json')));
  } finally {
    tamper = false;
    cleanup(dir);
  }
});

test('an existing file with the wrong content is replaced by the verified one', async () => {
  const { dir, vault, catFile, root } = setup();
  try {
    const main = join(vault, '.obsidian', 'plugins', 'obsidian-tasks-plugin', 'main.js');
    write(main, 'old and wrong');
    const r = await runScriptAsync('obsidian-setup.mjs', ['--vault', vault, '--catalogue', catFile, '--base-url', baseUrl], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(sha(readFileSync(main)), catalogue['obsidian-tasks-plugin'].files['main.js']);
  } finally {
    cleanup(dir);
  }
});

test('keeps settings the user already had', () => {
  const { dir, vault, catFile, root } = setup();
  try {
    write(join(vault, '.obsidian', 'app.json'), JSON.stringify({ fontSize: 18, newFileLocation: 'root' }));
    write(join(vault, '.obsidian', 'core-plugins.json'), JSON.stringify({ 'random-note': true, sync: false }));
    write(join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify(['dataview']));
    const r = runScript('obsidian-setup.mjs', ['--offline', '--vault', vault, '--catalogue', catFile], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const app = readJson(join(vault, '.obsidian', 'app.json'));
    assert.equal(app.fontSize, 18);
    assert.equal(app.newFileLocation, 'folder');
    assert.equal(app.showUnsupportedFiles, true, 'a re-run adds the setting to an existing app.json');
    const core = readJson(join(vault, '.obsidian', 'core-plugins.json'));
    assert.ok(core.includes('random-note'));
    assert.ok(!core.includes('sync'));
    assert.deepEqual(readJson(join(vault, '.obsidian', 'community-plugins.json')), ['dataview', 'obsidian-tasks-plugin', 'obsidian-git']);
  } finally {
    cleanup(dir);
  }
});

test('usage error exits with 2', () => {
  const { dir, root } = setup();
  try {
    assert.equal(runScript('obsidian-setup.mjs', ['--nonsense'], root).code, 2);
  } finally {
    cleanup(dir);
  }
});

test('the real plugin catalogue is well formed and pins the two plugins', () => {
  const real = readJson(join(REPO_ROOT, 'system', 'catalogue', 'obsidian-plugins.json'));
  assert.deepEqual(Object.keys(real).sort(), ['obsidian-git', 'obsidian-tasks-plugin']);
  for (const [id, e] of Object.entries(real)) {
    assert.match(e.repo, /^[\w.-]+\/[\w.-]+$/, id);
    assert.match(e.version, /^\d+\.\d+\.\d+$/, id);
    for (const name of ['main.js', 'manifest.json', 'styles.css']) {
      assert.ok(name in e.files, `${id} lists ${name}`);
      if (e.files[name] !== null) assert.match(e.files[name], /^[0-9a-f]{64}$/, `${id}/${name}`);
    }
  }
});
