import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bash, contextOf, decisionOf, makeProject, runHook, write } from '../fixtures/hooks/helpers.mjs';
import {
  commandSegments, isGit, parseGit, programName, projectRel, stripHeredocs, tokenizeShell, toolInfo,
} from '../../system/lib/hookio.mjs';

test('tokenizeShell splits on separators and keeps quoted text together', () => {
  assert.deepEqual(tokenizeShell('git add -A && git commit -m "a b; c" ; ls | wc'), [
    ['git', 'add', '-A'],
    ['git', 'commit', '-m', 'a b; c'],
    ['ls'],
    ['wc'],
  ]);
  assert.deepEqual(tokenizeShell("echo 'one two' \"three four\" five"), [['echo', 'one two', 'three four', 'five']]);
  assert.deepEqual(tokenizeShell('a\nb\r\nc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(tokenizeShell('(cd x; git push -f)'), [['cd', 'x'], ['git', 'push', '-f']]);
  assert.deepEqual(tokenizeShell('echo hi # git push -f'), [['echo', 'hi']]);
  assert.deepEqual(tokenizeShell('echo a#b'), [['echo', 'a#b']]);
  assert.deepEqual(tokenizeShell('echo ""'), [['echo', '']]);
});

test('tokenizeShell: bash escapes versus PowerShell escapes', () => {
  assert.deepEqual(tokenizeShell('echo \\"hi\\" a\\ b', 'bash'), [['echo', '"hi"', 'a b']]);
  assert.deepEqual(tokenizeShell('echo "say \\"hi\\""', 'bash'), [['echo', 'say "hi"']]);
  // PowerShell: backslash is a path character, the backtick escapes, and doubled quotes are one quote.
  assert.deepEqual(tokenizeShell('Remove-Item C:\\a\\.git -Recurse', 'powershell'), [['Remove-Item', 'C:\\a\\.git', '-Recurse']]);
  assert.deepEqual(tokenizeShell('echo "say `"hi`""', 'powershell'), [['echo', 'say "hi"']]);
  assert.deepEqual(tokenizeShell('echo "say ""hi"""', 'powershell'), [['echo', 'say "hi"']]);
  assert.deepEqual(tokenizeShell("echo 'it''s'", 'powershell'), [['echo', "it's"]]);
});

test('commandSegments strips env assignments and wrappers, and unwraps shells', () => {
  assert.deepEqual(commandSegments('FOO=1 BAR=2 git status'), [['git', 'status']]);
  assert.deepEqual(commandSegments('sudo -n git status'), [['git', 'status']]);
  assert.deepEqual(commandSegments('env -i X=1 git status'), [['git', 'status']]);
  const inner = commandSegments('bash -c "cd x && git push -f"').map((s) => s.join(' '));
  assert.ok(inner.includes('git push -f'));
  assert.ok(commandSegments('cmd /c git reset --hard', 'powershell').some((s) => s.join(' ') === 'git reset --hard'));
  assert.ok(commandSegments('echo "$(git reset --hard)"').some((s) => s.join(' ') === 'git reset --hard'));
  assert.deepEqual(commandSegments(''), []);
  assert.deepEqual(commandSegments(undefined), []);
  assert.deepEqual(commandSegments('a;'.repeat(5) + 'bash -c "' + 'bash -c \\"'.repeat(6) + 'git push -f' + '\\"'.repeat(6) + '"').length > 0, true); // deep nesting stays bounded
});

test('programName and git parsing', () => {
  assert.equal(programName('C:\\Program Files\\Git\\cmd\\git.exe'), 'git');
  assert.equal(programName('/usr/bin/GIT'), 'git');
  assert.equal(programName('Remove-Item'), 'remove-item');
  assert.equal(isGit(['git', 'status']), true);
  assert.equal(isGit(['gitk']), false);
  assert.deepEqual(parseGit(['git', '-C', 'vault', '-c', 'a=b', '--no-pager', 'push', '-f']), { sub: 'push', args: ['-f'] });
  assert.deepEqual(parseGit(['git', '--git-dir=x', 'Status']), { sub: 'status', args: [] });
  assert.deepEqual(parseGit(['git']), { sub: '', args: [] });
});

test('stripHeredocs removes bodies of text heredocs and PowerShell here-strings only', () => {
  assert.equal(stripHeredocs("cat <<'EOF'\nhello\nEOF"), "cat <<'EOF'");
  assert.equal(stripHeredocs('cat <<-X\n\tbody\n\tX\necho after'), 'cat <<-X\necho after');
  assert.equal(stripHeredocs("bash <<'EOF'\nls\nEOF"), "bash <<'EOF'\nls\nEOF");
  assert.equal(stripHeredocs("$a = @'\nline\n'@"), "$a = @''@");
  assert.equal(stripHeredocs('echo hi'), 'echo hi');
});

test('toolInfo reads every kind of PreToolUse payload', () => {
  const w = toolInfo({ tool_name: 'Write', tool_input: { file_path: 'a.md', content: 'x' } });
  assert.deepEqual([w.isEdit, w.filePaths, w.contents], [true, ['a.md'], ['x']]);
  const e = toolInfo({ tool_name: 'Edit', tool_input: { file_path: 'a.md', old_string: 'o', new_string: 'n' } });
  assert.deepEqual(e.contents, ['n']);
  const m = toolInfo({ tool_name: 'MultiEdit', tool_input: { file_path: 'a.md', edits: [{ old_string: 'a', new_string: 'b' }, { new_string: 'c' }, null] } });
  assert.deepEqual(m.contents, ['b', 'c']);
  const n = toolInfo({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'n.ipynb', new_source: 's' } });
  assert.deepEqual([n.filePaths, n.contents], [['n.ipynb'], ['s']]);
  const b = toolInfo({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.deepEqual([b.isShell, b.command, b.shell], [true, 'ls', 'bash']);
  const ps = toolInfo({ tool_name: 'PowerShell', tool_input: { command: 'dir' } });
  assert.deepEqual([ps.isShell, ps.shell], [true, 'powershell']);
  const g = toolInfo({ tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: { to: 'x' } });
  assert.deepEqual([g.isMcp, g.server, g.tool], [true, 'claude_ai_Gmail', 'send_message']);
  const p = toolInfo({ tool_name: 'mcp__plugin_x_y__do__thing' });
  assert.deepEqual([p.server, p.tool], ['plugin_x_y', 'do__thing']);
  for (const bad of [null, undefined, {}, { tool_name: 5 }, { tool_name: 'Bash', tool_input: 'x' }]) {
    const info = toolInfo(bad);
    assert.deepEqual([info.filePaths, info.contents, info.command], [[], [], '']);
  }
});

test('projectRel resolves against the project root, never the current directory', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = p.root;
  t.after(() => {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
  });
  assert.equal(projectRel(join(p.root, 'system', 'core.md')), 'system/core.md');
  assert.equal(projectRel('system/core.md'), 'system/core.md');
  assert.equal(projectRel('system\\core.md'), process.platform === 'win32' ? 'system/core.md' : 'system\\core.md');
  assert.equal(projectRel('./a/../b.md'), 'b.md');
  assert.equal(projectRel(join(p.root, 'new', 'deep', 'file.md')), 'new/deep/file.md');
  assert.equal(projectRel(join(tmpdir(), 'elsewhere.md')), null);
  assert.equal(projectRel('../outside.md'), null);
  assert.equal(projectRel(''), null);
  assert.equal(projectRel(undefined), null);
});

test('hooks work in a project folder whose name contains spaces', (t) => {
  const p = makeProject({ spaces: true, gitAuto: true });
  t.after(p.cleanup);
  assert.match(p.root, / /);
  assert.equal(decisionOf(runHook(p, 'protect_paths', write(p.path('system', 'core.md')))), 'deny');
  assert.equal(decisionOf(runHook(p, 'block_dangerous_git', bash('git push -f'))), 'deny');
  assert.match(contextOf(runHook(p, 'session_start', { source: 'startup' })), /Today is /);
  runHook(p, 'session_end', { hook_event_name: 'SessionEnd' });
  assert.deepEqual(p.gitCalls().slice(-2), ['commit', 'push']);
});

test('every hook exits 0 and stays quiet when run with no input at all', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const hook of ['protect_paths', 'block_secrets', 'block_dangerous_git', 'session_start', 'session_end']) {
    const r = runHook(p, hook, null, { raw: '' });
    assert.equal(r.code, 0, hook);
    assert.equal(r.stdout, '', hook);
  }
  // outbound_guard is the one hook that fails closed.
  const og = runHook(p, 'outbound_guard', null, { raw: '' });
  assert.equal(og.code, 0);
  assert.equal(decisionOf(og), 'deny');
});

test('a hook answers even if the caller never closes stdin', async (t) => {
  const { spawn } = await import('node:child_process');
  const p = makeProject();
  t.after(p.cleanup);
  const child = spawn(process.execPath, [join(p.root, 'system', 'hooks', 'protect_paths.mjs')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: p.root },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stdin.write(JSON.stringify(write(p.path('system', 'core.md'))));
  // stdin is deliberately left open
  const started = Date.now();
  const code = await new Promise((resolve) => {
    const guard = setTimeout(() => {
      child.kill();
      resolve('timeout');
    }, 3000);
    child.on('exit', (c) => {
      clearTimeout(guard);
      resolve(c);
    });
  });
  assert.equal(code, 0);
  assert.ok(Date.now() - started < 3000);
  assert.match(out, /"permissionDecision":"deny"/);
});

test('a payload sent in several chunks is read in full', async (t) => {
  const { spawn } = await import('node:child_process');
  const p = makeProject();
  t.after(p.cleanup);
  const child = spawn(process.execPath, [join(p.root, 'system', 'hooks', 'protect_paths.mjs')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: p.root },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const payload = JSON.stringify(write(p.path('system', 'core.md'), 'x'.repeat(200_000)));
  const exited = new Promise((resolve) => child.on('exit', resolve));
  for (let i = 0; i < payload.length; i += 50_000) {
    child.stdin.write(payload.slice(i, i + 50_000));
    await new Promise((r) => setTimeout(r, 20));
  }
  child.stdin.end();
  assert.equal(await exited, 0);
  assert.match(out, /"permissionDecision":"deny"/);
});
