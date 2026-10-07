import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeProject, runScript, write, sha, cleanup, existsSync, join,
} from '../fixtures/ops/helpers.mjs';

const RELEASE = {
  name: 'alterbrain', version: '0.1.0', tag: 'v0.1.0', repo: 'joaoribasio/alterbrain',
  min_claude_code: '2.1.283', min_node: '20.0.0', min_quarto: '1.10.0',
};

const HOOK = '// a code file\n';

/** A small, healthy project: settings, release file, one code file, a matching manifest. */
function healthy({ dev = false, model = 'sonnet' } = {}) {
  const p = makeProject({ dev });
  const { root } = p;
  write(join(root, 'system', 'release.json'), JSON.stringify(RELEASE));
  write(join(root, '.claude', 'settings.json'), JSON.stringify({ model }));
  write(join(root, 'system', 'hooks', 'x.mjs'), HOOK);
  write(join(root, 'system', 'manifest.json'), JSON.stringify({
    schema: 1, version: '0.1.0', tag: 'v0.1.0',
    files: {
      'system/hooks/x.mjs': { class: 'code', sha256: sha(HOOK) },
      'README.md': { class: 'text', sha256: sha('anything') },
    },
  }));
  return p;
}

const doctor = (root, args = []) => {
  const r = runScript('doctor.mjs', ['--json', ...args], root);
  return { ...r, out: JSON.parse(r.stdout) };
};
const byId = (out, id) => out.checks.find((c) => c.id === id);

const MACHINE_IDS = ['git-repo', 'git-lfs', 'gh', 'origin', 'quarto', 'obsidian-app', 'obsidian-config', 'claude-code', 'onboarding', 'vault', 'disk'];

test('--ci passes on a healthy repository and skips every machine-specific check', () => {
  const { parent, root } = healthy();
  try {
    const r = doctor(root, ['--ci']);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.out.ok, true);
    assert.equal(r.out.ci, true);
    for (const id of MACHINE_IDS) assert.equal(byId(r.out, id).status, 'skip', id);
    assert.equal(byId(r.out, 'node').status, 'ok');
    assert.equal(byId(r.out, 'git').status, 'ok');
    assert.equal(byId(r.out, 'settings').status, 'ok');
    assert.equal(byId(r.out, 'manifest').status, 'ok');
    assert.equal(byId(r.out, 'validate').status, 'skip', 'validate.mjs is tolerated when absent');
    assert.equal(byId(r.out, 'mcp-json').status, 'ok');
  } finally {
    cleanup(parent);
  }
});

test('a changed code file fails the manifest check (and only warns in developer mode)', () => {
  const normal = healthy();
  const dev = healthy({ dev: true });
  try {
    for (const p of [normal, dev]) write(join(p.root, 'system', 'hooks', 'x.mjs'), '// tampered\n');
    const a = doctor(normal.root, ['--ci']);
    assert.equal(a.code, 1);
    assert.equal(byId(a.out, 'manifest').status, 'fail');
    assert.match(byId(a.out, 'manifest').detail, /system\/hooks\/x\.mjs/);
    assert.ok(byId(a.out, 'manifest').fix);
    const b = doctor(dev.root, ['--ci']);
    assert.equal(b.code, 0);
    assert.equal(byId(b.out, 'manifest').status, 'warn');
  } finally {
    cleanup(normal.parent, dev.parent);
  }
});

test('a deleted code file fails the manifest check; CRLF line endings do not', () => {
  const { parent, root } = healthy();
  try {
    write(join(root, 'system', 'hooks', 'x.mjs'), HOOK.replace(/\n/g, '\r\n'));
    assert.equal(byId(doctor(root, ['--ci']).out, 'manifest').status, 'ok');
    write(join(root, 'system', 'hooks', 'x.mjs'), '');
    cleanup(join(root, 'system', 'hooks', 'x.mjs'));
    const r = doctor(root, ['--ci']);
    assert.equal(byId(r.out, 'manifest').status, 'fail');
    assert.match(byId(r.out, 'manifest').detail, /missing/);
  } finally {
    cleanup(parent);
  }
});

test('a missing manifest is a warning, not a failure', () => {
  const { parent, root } = healthy();
  try {
    cleanup(join(root, 'system', 'manifest.json'));
    const r = doctor(root, ['--ci']);
    assert.equal(r.code, 0);
    assert.equal(byId(r.out, 'manifest').status, 'warn');
  } finally {
    cleanup(parent);
  }
});

test('settings: wrong model warns locally and fails in CI; broken JSON always fails', () => {
  const { parent, root } = healthy({ model: 'opus' });
  try {
    assert.equal(byId(doctor(root).out, 'settings').status, 'warn');
    const ci = doctor(root, ['--ci']);
    assert.equal(ci.code, 1);
    assert.equal(byId(ci.out, 'settings').status, 'fail');
    write(join(root, '.claude', 'settings.json'), '{ not json');
    assert.equal(byId(doctor(root).out, 'settings').status, 'fail');
    cleanup(join(root, '.claude', 'settings.json'));
    assert.equal(byId(doctor(root).out, 'settings').status, 'fail');
  } finally {
    cleanup(parent);
  }
});

test('validate.mjs: its problems are surfaced, success passes', () => {
  const { parent, root } = healthy();
  try {
    write(join(root, 'system', 'scripts', 'validate.mjs'), 'console.log(JSON.stringify({ ok: false, problems: ["skill ask: missing effort", {file: "a.md", message: "bad"}] })); process.exit(1);\n');
    // a code file in the scripts folder would break the manifest check: it is not listed, so it is simply ignored
    const bad = doctor(root, ['--ci']);
    assert.equal(bad.code, 1);
    assert.equal(byId(bad.out, 'validate').status, 'fail');
    assert.match(byId(bad.out, 'validate').detail, /2 problem/);
    assert.match(byId(bad.out, 'validate').detail, /missing effort/);
    write(join(root, 'system', 'scripts', 'validate.mjs'), 'console.log(JSON.stringify({ ok: true })); process.exit(0);\n');
    const good = doctor(root, ['--ci']);
    assert.equal(good.code, 0);
    assert.equal(byId(good.out, 'validate').status, 'ok');
  } finally {
    cleanup(parent);
  }
});

test('.mcp.json: valid passes, invalid fails', () => {
  const { parent, root } = healthy();
  try {
    write(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { fetch: { command: 'npx', args: ['-y', 'x'] }, web: { url: 'https://example.invalid/mcp' } } }));
    assert.equal(byId(doctor(root, ['--ci']).out, 'mcp-json').status, 'ok');
    write(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { broken: { args: [] } } }));
    const r = doctor(root, ['--ci']);
    assert.equal(byId(r.out, 'mcp-json').status, 'fail');
    assert.match(byId(r.out, 'mcp-json').detail, /broken/);
    write(join(root, '.mcp.json'), '{{{');
    assert.equal(byId(doctor(root, ['--ci']).out, 'mcp-json').status, 'fail');
  } finally {
    cleanup(parent);
  }
});

test('uv is only checked when a connection that needs it is configured', () => {
  const { parent, root } = healthy();
  try {
    write(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { a: { command: 'npx', args: ['-y', 'x'] } } }));
    assert.equal(byId(doctor(root).out, 'uv'), undefined, 'no uv check without a uvx server');
    write(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { fetch: { command: 'cmd', args: ['/c', 'uvx', 'mcp-server-fetch'] } } }));
    assert.ok(['ok', 'warn'].includes(byId(doctor(root).out, 'uv').status));
    assert.equal(byId(doctor(root, ['--ci']).out, 'uv').status, 'skip', 'machine check is skipped in CI');
  } finally {
    cleanup(parent);
  }
});

test('full mode reports every check; every non-ok check carries a one-line fix', () => {
  const { parent, root } = healthy();
  try {
    const r = doctor(root);
    const ids = r.out.checks.map((c) => c.id);
    for (const id of ['node', 'git', 'git-lfs', 'gh', 'origin', 'quarto', 'obsidian-app', 'obsidian-config', 'claude-code', 'settings', 'onboarding', 'vault', 'manifest', 'validate', 'mcp-json', 'disk']) {
      assert.ok(ids.includes(id), `check ${id} is reported`);
    }
    for (const c of r.out.checks) {
      assert.ok(['ok', 'warn', 'fail', 'skip'].includes(c.status));
      if (c.status === 'warn' || c.status === 'fail') assert.ok(c.fix && !c.fix.includes('\n'), `${c.id} has a one-line fix`);
    }
    assert.equal(byId(r.out, 'vault').status, 'warn', 'no vault skeleton before onboarding is only a warning');
    assert.equal(byId(r.out, 'onboarding').status, 'warn');
    assert.equal(r.out.summary.ok + r.out.summary.warn + r.out.summary.fail + r.out.summary.skip, r.out.checks.length);
  } finally {
    cleanup(parent);
  }
});

test('onboarding counts as fine once the essential steps are done (minimum_done)', () => {
  const { parent, root } = healthy();
  try {
    write(join(root, 'state', 'onboarding.json'), JSON.stringify({ status: 'in_progress' }));
    assert.equal(byId(doctor(root).out, 'onboarding').status, 'warn');
    write(join(root, 'state', 'onboarding.json'), JSON.stringify({ status: 'minimum_done' }));
    const c = byId(doctor(root).out, 'onboarding');
    assert.equal(c.status, 'ok');
    assert.match(c.detail, /essential/);
  } finally {
    cleanup(parent);
  }
});

test('vault skeleton and onboarding state are understood', () => {
  const { parent, root } = healthy();
  try {
    for (const d of ['00_inbox', '10_projects', '20_areas', '30_wiki', '40_sources', '50_learning', '60_people', '70_journal', '80_me']) {
      write(join(root, 'vault', d, '.keep'), '');
    }
    write(join(root, 'vault', 'Home.md'), '# Home\n');
    write(join(root, 'vault', '00_inbox', 'Tasks.md'), '# Tasks\n');
    write(join(root, 'state', 'onboarding.json'), JSON.stringify({ status: 'complete' }));
    const r = doctor(root);
    assert.equal(byId(r.out, 'vault').status, 'ok');
    assert.equal(byId(r.out, 'onboarding').status, 'ok');
    cleanup(join(root, 'vault', '30_wiki'));
    const after = doctor(root);
    assert.equal(byId(after.out, 'vault').status, 'fail', 'missing folders after onboarding is a failure');
    assert.match(byId(after.out, 'vault').detail, /30_wiki/);
  } finally {
    cleanup(parent);
  }
});

test('obsidian settings check understands a prepared vault', () => {
  const { parent, root } = healthy();
  try {
    const dir = join(root, 'vault', '.obsidian');
    for (const f of ['app.json', 'core-plugins.json']) write(join(dir, f), '{}');
    write(join(dir, 'community-plugins.json'), JSON.stringify(['demo']));
    assert.equal(byId(doctor(root).out, 'obsidian-config').status, 'warn');
    write(join(dir, 'plugins', 'demo', 'main.js'), 'x');
    write(join(dir, 'plugins', 'demo', 'manifest.json'), '{}');
    assert.equal(byId(doctor(root).out, 'obsidian-config').status, 'ok');
  } finally {
    cleanup(parent);
  }
});

test('text output is readable and exit codes follow the contract', () => {
  const { parent, root } = healthy();
  try {
    const ok = runScript('doctor.mjs', ['--ci'], root);
    assert.equal(ok.code, 0);
    assert.match(ok.stdout, /Alterbrain health check \(CI mode\)/);
    assert.match(ok.stdout, /\[ok\]/);
    write(join(root, 'system', 'hooks', 'x.mjs'), '// changed\n');
    const bad = runScript('doctor.mjs', ['--ci'], root);
    assert.equal(bad.code, 1);
    assert.match(bad.stdout, /\[FAIL\]/);
    assert.match(bad.stdout, /Fix: /);
    assert.equal(runScript('doctor.mjs', ['--wat'], root).code, 2);
    assert.equal(existsSync(join(root, 'state', 'local', 'tmp')), false, 'doctor writes nothing');
  } finally {
    cleanup(parent);
  }
});
