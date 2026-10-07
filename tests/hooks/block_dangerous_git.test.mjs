import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bash, decisionOf, makeProject, powershell, reasonOf, runHook } from '../fixtures/hooks/helpers.mjs';
import { checkCommand } from '../../system/hooks/block_dangerous_git.mjs';

const denied = (cmd, shell = 'bash') => {
  const reason = checkCommand(cmd, shell);
  assert.ok(reason, `should be denied (${shell}): ${cmd}`);
  assert.match(reason, /^[A-Z]/, 'reasons are plain sentences');
  return reason;
};
const allowed = (cmd, shell = 'bash') => assert.equal(checkCommand(cmd, shell), null, `should be allowed (${shell}): ${cmd}`);

test('force pushes are denied in every spelling', () => {
  for (const cmd of [
    'git push --force',
    'git push -f origin main',
    'git push origin main --force-with-lease',
    'git push --force-with-lease=main:abc123',
    'git push --force-if-includes',
    'git push -fu origin main',
    'git push -uf origin main',
    'git push origin +main',
    'git push origin +HEAD:main',
    'git push --mirror',
    'git -C vault push -f',
    'git -c user.name=x push --force',
    '/usr/bin/git push -f',
    'git.exe push -f',
    'cd vault && git push -f',
    'git add -A; git commit -m x; git push --force',
    'git status | cat; git push -f',
    '(git push -f)',
    'echo done && { git push -f; }',
    'sudo git push -f',
    'GIT_TRACE=1 git push -f',
    'env FOO=bar git push -f',
    'bash -c "git push --force"',
    "sh -lc 'git push -f origin main'",
    'echo "$(git push -f)"',
    'eval "git push -f"',
    'x=`git push -f`',
  ]) {
    assert.match(denied(cmd), /Force-pushing/, cmd);
  }
});

test('hard reset and clean are denied, dry runs are fine', () => {
  for (const cmd of ['git reset --hard', 'git reset --hard HEAD~1', 'git reset HEAD --hard', 'git -C . reset --hard origin/main']) {
    assert.match(denied(cmd), /hard reset/, cmd);
  }
  for (const cmd of ['git clean -f', 'git clean -fd', 'git clean -fdx', 'git clean -xdf', 'git clean --force', 'git clean -d -f']) {
    assert.match(denied(cmd), /permanently delete/, cmd);
  }
  for (const cmd of ['git clean -n', 'git clean -nd', 'git clean -nfd', 'git clean --dry-run', 'git reset', 'git reset HEAD vault/x.md', 'git reset --soft HEAD~1', 'git reset --mixed HEAD~1']) {
    allowed(cmd);
  }
});

test('deleting or moving .git is denied (bash, PowerShell and cmd)', () => {
  for (const cmd of [
    'rm -rf .git',
    'rm -fr ./.git',
    'rm -r .git/',
    'rm -rf vault/.git',
    'rm -rf "C:/Users/x/project/.git"',
    'rm -rf .git/*',
    'rmdir .git',
    'mv .git ../backup',
    'cd project && rm -rf .git',
  ]) {
    assert.match(denied(cmd), /\.git folder/, cmd);
  }
  for (const cmd of [
    'Remove-Item .git -Recurse -Force',
    'Remove-Item -Recurse -Force .\\.git',
    "Remove-Item -Path '.git' -Recurse",
    'Remove-Item -LiteralPath C:\\Users\\x\\project\\.git -Recurse -Force',
    'Remove-Item -Path:.git -Recurse',
    'rm -r -fo .git',
    'ri .git -r',
    'del /s /q .git',
    'rd /s /q .git',
    'cmd /c rd /s /q .git',
    'Move-Item .git ..\\backup',
    'powershell -Command "Remove-Item .git -Recurse -Force"',
    'pwsh -NoProfile -c "Remove-Item .git -Recurse"',
    'if (Test-Path .git) { Remove-Item .git -Recurse -Force }',
  ]) {
    assert.match(denied(cmd, 'powershell'), /\.git folder/, cmd);
  }
});

test('rewriting history and extra branches are denied', () => {
  for (const cmd of ['git filter-branch --tree-filter "rm x" HEAD', 'git filter-repo --path x']) assert.match(denied(cmd), /Rewriting history/, cmd);
  for (const cmd of [
    'git worktree add ../other',
    'git worktree add -b x ../other',
    'git checkout -b feature',
    'git checkout -B feature',
    'git checkout --orphan clean',
    'git checkout main -b feature',
    'git switch -c feature',
    'git switch -C feature',
    'git switch --create feature',
    'git switch --orphan x',
    'git branch feature',
    'git branch feature main',
    'git branch -f feature',
    'git branch -m old new',
    'git branch -M new',
    'git branch -c a b',
    'git branch --move a b',
    'git branch --copy a b',
  ]) {
    assert.match(denied(cmd), /one branch/, cmd);
  }
});

test('interactive rebase is denied, other rebase use is not', () => {
  for (const cmd of ['git rebase -i HEAD~3', 'git rebase --interactive main', 'git rebase -ri main', 'git rebase main -i']) assert.match(denied(cmd), /interactive rebase/i, cmd);
  for (const cmd of ['git rebase main', 'git rebase --continue', 'git rebase --abort', 'git rebase -Xpatience main', 'git rebase --autostash main', 'git pull --rebase --autostash']) allowed(cmd);
});

test('everyday git commands and look-alikes are allowed', () => {
  for (const cmd of [
    'git status',
    'git status --short',
    'git log --oneline -5',
    'git log --format=%(refname)',
    'git log HEAD@{1}',
    'git diff',
    'git diff --stat HEAD~1',
    'git show HEAD:.gitignore',
    'git add -A',
    'git add .',
    'git commit -m "auto: 2026-10-07 14:00 · 3 files"',
    'git commit -m "docs: why we never run git push --force"',
    'git commit -m "docs: never git reset --hard or rm -rf .git"',
    'git pull --rebase --autostash',
    'git fetch origin',
    'git push',
    'git push origin main',
    'git push -u origin main',
    'git push --set-upstream origin main',
    'git push --follow-tags',
    'git push -o ci.skip origin main',
    'git branch',
    'git branch --list',
    'git branch --list "feat*"',
    'git branch -l',
    'git branch -v',
    'git branch -vv',
    'git branch -a',
    'git branch -r',
    'git branch --show-current',
    'git branch --contains abc123',
    'git branch --merged main',
    'git branch --sort=-committerdate',
    'git branch --sort -committerdate',
    'git branch -d old-branch',
    'git checkout main',
    'git checkout -- vault/00_inbox/Tasks.md',
    'git checkout HEAD -- vault/Home.md',
    'git switch main',
    'git worktree list',
    'git stash',
    'git remote -v',
    'git lfs install',
    'echo "git push --force"',
    "echo 'git reset --hard'",
    'rm -rf node_modules',
    'rm .git/index.lock',
    'rm -f .gitignore.bak',
    'rm -rf .github/old',
    'rm vault/old-notes.md',
    'mv .gitattributes .gitattributes.bak',
    'ls -la .git',
    'cat .git/config',
    'node system/scripts/git-auto.mjs commit',
  ]) {
    allowed(cmd);
  }
  for (const cmd of [
    'git status',
    'Write-Host "git push --force"',
    'git commit -m "explain Remove-Item .git -Recurse"',
    'Remove-Item vault\\old.md',
    'Remove-Item .gitignore',
    'Remove-Item .git\\index.lock',
    'Get-ChildItem .git',
    "git commit -m 'do not git reset --hard'",
  ]) {
    allowed(cmd, 'powershell');
  }
});

test('PowerShell syntax: call operator, encoded commands, script blocks', () => {
  const encoded = Buffer.from('git push --force', 'utf16le').toString('base64');
  assert.match(denied('& git push -f', 'powershell'), /Force-pushing/);
  assert.match(denied('& "C:\\Program Files\\Git\\cmd\\git.exe" push -f', 'powershell'), /Force-pushing/);
  assert.match(denied("& 'C:\\Program Files\\Git\\cmd\\git.exe' reset --hard", 'powershell'), /hard reset/);
  assert.match(denied('git push --force; Write-Host done', 'powershell'), /Force-pushing/);
  assert.match(denied('if ($true) { git push -f }', 'powershell'), /Force-pushing/);
  assert.match(denied('git add . && git reset --hard', 'powershell'), /hard reset/);
  assert.match(denied(`powershell -NoProfile -EncodedCommand ${encoded}`, 'powershell'), /Force-pushing/);
  assert.match(denied('git branch feature', 'powershell'), /one branch/);
  assert.match(denied('Invoke-Expression "git push -f"', 'powershell'), /Force-pushing/);
  assert.match(denied("iex 'git reset --hard'", 'powershell'), /hard reset/);
  assert.match(denied('Start-Process git -ArgumentList "push --force" -Wait', 'powershell'), /Force-pushing/);
  assert.match(denied('Start-Process -FilePath git -ArgumentList "switch -c x"', 'powershell'), /one branch/);
  allowed('Start-Process notepad vault\Home.md', 'powershell');
  assert.match(denied('git switch -c feature', 'powershell'), /one branch/);
  assert.match(denied('git rebase -i HEAD~2', 'powershell'), /interactive rebase/i);
  assert.match(denied('git checkout -b feature', 'powershell'), /one branch/);
  // Backslash paths stay literal in PowerShell.
  assert.match(denied('Remove-Item C:\\projects\\alterbrain\\.git -Recurse', 'powershell'), /\.git folder/);
  allowed('git commit -m "it`"s fine"', 'powershell');
});

test('heredoc commit messages are text, but a heredoc fed to a shell still runs', () => {
  allowed("git commit -m \"$(cat <<'EOF'\nfix: handle the case\n\ngit push --force is never used here\nEOF\n)\"");
  assert.match(denied("bash <<'EOF'\ngit push --force\nEOF"), /Force-pushing/);
  allowed("cat > notes.md <<'EOF'\ngit reset --hard\nEOF");
  allowed('$text = @\'\ngit push --force\n\'@\nSet-Content notes.md $text', 'powershell');
});

test('hook answers with a deny decision and the plain reason', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  const r = runHook(p, 'block_dangerous_git', bash('git push --force origin main'));
  assert.equal(r.code, 0);
  assert.equal(decisionOf(r), 'deny');
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(reasonOf(r), /overwrite your saved work/);

  const ps = runHook(p, 'block_dangerous_git', powershell('Remove-Item .git -Recurse -Force'));
  assert.equal(decisionOf(ps), 'deny');
  assert.match(reasonOf(ps), /\.git folder/);

  for (const ok of [bash('git status'), powershell('git branch'), bash('git branch --show-current'), bash('ls')]) {
    const res = runHook(p, 'block_dangerous_git', ok);
    assert.equal(res.code, 0);
    assert.equal(res.stdout, '');
  }
});

test('ignores other tools and fails open on malformed input', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(runHook(p, 'block_dangerous_git', { tool_name: 'Write', tool_input: { file_path: 'x', content: 'git push -f' } }).stdout, '');
  for (const raw of ['', 'garbage', '[]', '{"tool_name":"Bash","tool_input":{"command":']) {
    const r = runHook(p, 'block_dangerous_git', null, { raw });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.equal(runHook(p, 'block_dangerous_git', { tool_name: 'Bash', tool_input: {} }).stdout, '');
  assert.equal(runHook(p, 'block_dangerous_git', { tool_name: 'Bash', tool_input: { command: 42 } }).stdout, '');
});

test('still active in dev mode', (t) => {
  const p = makeProject({ devMode: true });
  t.after(p.cleanup);
  assert.equal(decisionOf(runHook(p, 'block_dangerous_git', bash('git reset --hard'))), 'deny');
});
