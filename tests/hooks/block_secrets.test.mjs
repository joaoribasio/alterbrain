import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REPO, bash, decisionOf, edit, fakeSecrets, makeProject, multiEdit, notebookEdit, powershell, reasonOf, runHook, write,
} from '../fixtures/hooks/helpers.mjs';
import { checkCommand, entropy, findSecret, isEnvFileArg } from '../../system/hooks/block_secrets.mjs';
import { release } from '../fixtures/scripts/release.mjs';

const secrets = fakeSecrets();

function ask(project, input, opts) {
  return runHook(project, 'block_secrets', input, opts);
}

test('findSecret spots every kind of secret from the spec', () => {
  const expected = {
    privateKey: 'a private key',
    skKey: 'an API key',
    skAnthropic: 'an API key',
    githubPat: 'a GitHub token',
    githubOauth: 'a GitHub token',
    slack: 'a Slack token',
    aws: 'an AWS access key',
    google: 'a Google API key',
    jwt: 'a login token',
    genericKeyLine: 'a password or key',
    envStyleLine: 'a password or key',
    tokenYaml: 'a password or key',
    passwordLine: 'a password or key',
  };
  for (const [name, kind] of Object.entries(expected)) {
    const hit = findSecret(`some text\nbefore ${secrets[name]} and after\n`);
    assert.ok(hit, `${name} should be detected`);
    assert.equal(hit.kind, kind, name);
  }
});

test('findSecret leaves ordinary text, placeholders and references alone', () => {
  const fine = [
    'sk-learn is a Python library',
    'a risk-assessment-framework-for-2026-q3 approach',
    'api_key=',
    'ADZUNA_APP_KEY=',
    'api_key: ${API_KEY}',
    'const key = process.env.OPENAI_API_KEY;',
    'token_file = ./secrets/tokens-2026.json',
    'credentials_file: credentials-2026-prod.json',
    'password = get_password_from_vault()',
    'Authorization: Bearer YOUR_TOKEN_HERE',
    'AKIAIOSFODNN7EXAMPLE',
    'gh' + 'p_' + 'x'.repeat(36),
    'sk' + '-' + 'x'.repeat(40),
    '"sha256": "' + 'ab12'.repeat(16) + '"',
    '"token_count": 1234567890123456',
    'public_key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"',
    'The password is chosen by the user, never stored.',
    '',
  ];
  for (const text of fine) assert.equal(findSecret(text), null, text);
});

test('entropy is higher for random-looking strings', () => {
  assert.ok(entropy('aaaaaaaaaaaaaaaa') < 0.1);
  assert.ok(entropy(secrets.skKey.slice(3)) > 4);
  assert.ok(entropy('abababababababab') < 1.1);
});

test('denies each kind of secret in a Write, without echoing it', release(), (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const [name, value] of Object.entries(secrets)) {
    const r = ask(p, write(p.path('vault', '10_projects', 'notes.md'), `# Notes\n\n${value}\n`));
    assert.equal(r.code, 0, name);
    assert.equal(decisionOf(r), 'deny', name);
    assert.ok(!r.stdout.includes(value), `${name}: the reason must not repeat the secret`);
    assert.match(reasonOf(r), /\.env\.local/);
    assert.match(reasonOf(r), /never paste it into the chat/);
  }
});

test('checks Edit, MultiEdit and NotebookEdit content', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const file = p.path('vault', '10_projects', 'notes.md');
  assert.equal(decisionOf(ask(p, edit(file, `x ${secrets.githubPat} y`))), 'deny');
  assert.equal(decisionOf(ask(p, multiEdit(file, ['fine text', `key ${secrets.skKey}`]))), 'deny');
  assert.equal(decisionOf(ask(p, notebookEdit(p.path('vault', 'n.ipynb'), secrets.genericKeyLine))), 'deny');
  assert.equal(ask(p, multiEdit(file, ['fine text', 'also fine'])).stdout, '');
  assert.equal(ask(p, edit(file, 'plain edit')).stdout, '');
});

test('only the new text is checked, not the text being replaced', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = ask(p, edit(p.path('vault', 'x.md'), 'redacted', secrets.skKey));
  assert.equal(r.stdout, '');
});

test('allows secrets in .env.local and under tests/fixtures, but not in other .env files', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const body = `${secrets.envStyleLine}\n${secrets.skKey}\n`;
  assert.equal(ask(p, write(p.path('.env.local'), body)).stdout, '');
  assert.equal(ask(p, write('.env.local', body)).stdout, '');
  assert.equal(ask(p, write(p.path('tests', 'fixtures', 'hooks', 'sample.json'), body)).stdout, '');
  assert.equal(decisionOf(ask(p, write(p.path('.env'), body))), 'deny');
  assert.equal(decisionOf(ask(p, write(p.path('.env.production'), body))), 'deny');
  assert.equal(decisionOf(ask(p, write(p.path('tests', 'hooks', 'real.test.mjs'), body))), 'deny');
  // The template with empty values is fine.
  assert.equal(ask(p, write(p.path('.env.example'), 'ADZUNA_APP_ID=\nADZUNA_APP_KEY=\n')).stdout, '');
});

test('allows ordinary writes', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = ask(p, write(p.path('vault', 'Home.md'), '# Home\n\nsk-learn, risk-assessment and api_key= are just words here.\n'));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('git commit with a secret in the message is denied (bash and PowerShell)', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const msg = `fix: rotate ${secrets.githubPat}`;
  assert.equal(decisionOf(ask(p, bash(`git commit -m "${msg}"`))), 'deny');
  assert.equal(decisionOf(ask(p, powershell(`git commit -m "${msg}"`))), 'deny');
  assert.equal(decisionOf(ask(p, bash(`git add -A && git commit -am '${msg}'`))), 'deny');
  assert.equal(decisionOf(ask(p, bash(`git commit -m "$(cat <<'EOF'\nsave ${secrets.skKey}\nEOF\n)"`))), 'deny');
  const r = ask(p, bash(`git commit -m "${msg}"`));
  assert.ok(!r.stdout.includes(secrets.githubPat));
});

test('a clean git commit passes, and so do other commands that merely carry text', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(ask(p, bash('git commit -m "auto: 2026-10-07 14:00 · 3 files"')).stdout, '');
  assert.equal(ask(p, powershell('git commit -m "docs: explain api_key= placeholders"')).stdout, '');
  assert.equal(ask(p, bash('git status')).stdout, '');
  assert.equal(ask(p, bash(`echo ${secrets.skKey} > /dev/null`)).stdout, ''); // not a commit: out of scope
});

test('git add of .env files is denied, templates are fine', release(), (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const cmd of [
    'git add .env',
    'git add .env.local',
    'git add -A .env.production',
    'git add vault/x.md .env',
    'git add ./config/.env',
    'git add *.env',
    'git add .env*',
    'cd vault && git add .env.local',
    'git add -- .env',
    'git -C . add .env',
  ]) {
    const r = ask(p, bash(cmd));
    assert.equal(decisionOf(r), 'deny', cmd);
    assert.match(reasonOf(r), /never be added/, cmd);
  }
  assert.equal(decisionOf(ask(p, powershell('git add .env.local'))), 'deny');
  assert.equal(decisionOf(ask(p, powershell('git add .\\config\\.env'))), 'deny');
  for (const cmd of ['git add .env.example', 'git add -A', 'git add .', 'git add vault/Home.md', 'git add .gitignore', 'git add .github/workflows/ci.yml', 'git add .environment-notes.md']) {
    assert.equal(ask(p, bash(cmd)).stdout, '', cmd);
  }
});

test('git add --force is denied because it skips .gitignore', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const cmd of ['git add -f vault/x.md', 'git add --force .', 'git add -Af .']) {
    const r = ask(p, bash(cmd));
    assert.equal(decisionOf(r), 'deny', cmd);
    assert.match(reasonOf(r), /safety list/, cmd);
  }
});

test('isEnvFileArg', () => {
  for (const yes of ['.env', '.env.local', '.env.production', 'config/.env', 'C:\\x\\.env', 'prod.env', '.env*']) assert.equal(isEnvFileArg(yes), true, yes);
  for (const no of ['.env.example', '.env.sample', '.env.template', 'environment.md', '.environment', 'vault/Home.md', '.gitignore']) assert.equal(isEnvFileArg(no), false, no);
});

test('checkCommand ignores quoted mentions of git add', () => {
  assert.equal(checkCommand('echo "git add .env"', 'bash'), null);
  assert.equal(checkCommand("git commit -m 'never git add .env files'", 'bash'), null);
});

test('fails open on malformed input', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const raw of ['', 'oops', '[]', '{"tool_name":"Write","tool_input":']) {
    const r = ask(p, null, { raw });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  // A payload with the wrong shape is not a decision either.
  assert.equal(ask(p, { tool_name: 'Write', tool_input: 'text' }).stdout, '');
  assert.equal(ask(p, { tool_name: 'Bash' }).stdout, '');
});

test('the framework sources and tests do not trip the secret check themselves', () => {
  const files = [];
  for (const dir of ['system/hooks', 'system/lib', 'tests/hooks']) {
    for (const f of readdirSync(join(REPO, dir))) if (f.endsWith('.mjs')) files.push(join(REPO, dir, f));
  }
  files.push(join(REPO, 'system', 'templates', 'claude-settings.json'));
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // the settings template may not exist yet when this runs in isolation
    }
    assert.equal(findSecret(text), null, file);
  }
});

/* ------------------------------ vault key files (ADR 0019) ------------------------------ */

const outsideDir = join(tmpdir(), 'ab-key-copies').replace(/\\/g, '/');

test('a vault key file is never written into the project, whatever it contains', release(), (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  // A password-protected key copy is JSON with base64 fields: no secret pattern would catch it, the name does.
  const body = JSON.stringify({ format: 'alterbrain-vault-key', v: 1, ct: Buffer.alloc(40, 3).toString('base64') });
  for (const file of [
    p.path('vault-key-alterbrain.key'),
    p.path('vault', '80_me', 'backup.abkey'),
    p.path('keys', 'My Notes.ABKEY'),
    'backup.abkey', // relative paths count from the project folder
    p.path('.git', 'git-crypt', 'keys', 'default'),
  ]) {
    for (const input of [write(file, body), edit(file, body), multiEdit(file, [body])]) {
      const r = ask(p, input);
      assert.equal(decisionOf(r), 'deny', file);
      assert.match(reasonOf(r), /vault key file/, file);
      assert.match(reasonOf(r), /node system\/scripts\/vault-key\.mjs export --out/, 'it says what to do instead');
      assert.ok(!r.stdout.includes(body), 'the reason does not repeat the content');
    }
  }
  // Outside the project, and ordinary files that merely end in .key, are not touched by this rule.
  assert.equal(ask(p, write(`${outsideDir}/vault-key-x.abkey`, body)).stdout, '');
  assert.equal(ask(p, write(p.path('Slides', 'talk.key'), 'Keynote file')).stdout, '');
  assert.equal(ask(p, write(p.path('vault', 'keys-notes.md'), 'about keys')).stdout, '');
});

test('shell commands cannot write, read, copy or add a vault key file', release(), (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const denied = [
    bash('echo hello > backup.abkey'),
    bash('echo hello >> vault/80_me/vault-key-x.key'),
    bash(`cp ${outsideDir}/k.txt vault-key-a.key`),
    bash('mv something.txt backup.abkey'),
    powershell('Set-Content -Path vault-key-a.key -Value x'),
    powershell('Copy-Item C:/temp/x.bin ./backup.abkey'),
    bash(`cat ${outsideDir}/vault-key-a.abkey`),
    bash('cat .git/git-crypt/keys/default'),
    bash('base64 backup.abkey'),
    bash('grep ct backup.abkey'),
    powershell('Get-Content .git/git-crypt/keys/default'),
    powershell('type vault-key-a.key'),
    bash('git add vault-key-a.key'),
    bash('git add -- backup.abkey'),
    bash('git update-index --add backup.abkey'),
  ];
  for (const input of denied) {
    const r = ask(p, input);
    assert.equal(decisionOf(r), 'deny', JSON.stringify(input.tool_input));
    assert.match(reasonOf(r), /vault key file/);
  }
});

test('git-crypt export-key is allowed only to a place outside the project, never to the screen', release(), (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const inside = p.root.replace(/\\/g, '/');
  for (const command of [
    'git-crypt export-key keys/out.bin',
    'git-crypt export-key ./out.bin',
    'git-crypt export-key -',
    'git-crypt export-key',
    'git-crypt export-key - > somewhere.txt',
    'cd .. && git-crypt export-key out/x', // relative paths count from the project folder, as for every hook
    'sudo git-crypt export-key out.bin',
    `git-crypt export-key ${inside}/vault/x.bin`,
  ]) {
    const r = ask(p, bash(command));
    assert.equal(decisionOf(r), 'deny', command);
  }
  assert.equal(decisionOf(ask(p, powershell('git-crypt export-key ./out.bin'))), 'deny');
  assert.equal(decisionOf(ask(p, powershell('& git-crypt export-key -'))), 'deny');
  for (const command of [
    `git-crypt export-key ${outsideDir}/vault-key-x.key`,
    'git-crypt export-key ~/Documents/Alterbrain/k.key',
    'git-crypt export-key ../outside/k.key',
    'git-crypt status',
    'git-crypt --version',
    'node system/scripts/vault-key.mjs export --out ~/Documents/Alterbrain/vault-key-x.abkey',
    'node system/scripts/vault-key.mjs check --key ~/Documents/Alterbrain/vault-key-x.abkey',
    'node system/scripts/vault-key.mjs status',
  ]) {
    assert.equal(ask(p, bash(command)).stdout, '', command);
  }
});

test('the project ignores vault key copies, so a stray one cannot be saved by mistake', () => {
  const ignore = readFileSync(join(REPO, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(ignore.includes('*.abkey'));
  assert.ok(ignore.includes('vault-key-*.key'));
});
