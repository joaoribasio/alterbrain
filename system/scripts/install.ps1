# Alterbrain installer for Windows.
#
# This is a fallback for people who cannot use the "paste a prompt into Claude" route.
# Please download this file, read it, then run it:
#
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# Options:
#   -Folder <path>   where to put Alterbrain (default: Alterbrain in your home folder)
#   -Yes             skip the question (only if you have already read the list below)
#
# What it does, in order:
#   1. Looks for the programs Alterbrain needs and lists any that are missing.
#   2. Asks you ONCE whether it may install them (using winget, which is part of Windows).
#   3. Installs the missing ones, one at a time: Git, GitHub CLI, Node.js (LTS),
#      Obsidian and Quarto. (Git for Windows already includes Git LFS.)
#   4. Copies Alterbrain from https://github.com/joaoribasio/alterbrain into your folder.
#   5. Runs a health check and tells you what to do next.
#
# It never asks for a password and never sends anything about you anywhere.

param(
    [string]$Folder = (Join-Path $HOME 'Alterbrain'),
    [switch]$Yes
)

$ErrorActionPreference = 'Continue'
$RepoUrl = 'https://github.com/joaoribasio/alterbrain'

function Say([string]$text) { Write-Host $text }
function Good([string]$text) { Write-Host ("  [ok] " + $text) -ForegroundColor Green }
function Warn([string]$text) { Write-Host ("  [!]  " + $text) -ForegroundColor Yellow }
function Fail([string]$text) { Write-Host ("  [x]  " + $text) -ForegroundColor Red }

function Test-Command([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
    # Programs installed a moment ago are not on this window's PATH yet. Reload it.
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $machine + ';' + $user
}

function Test-ObsidianInstalled {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Obsidian\Obsidian.exe'),
        (Join-Path $env:ProgramFiles 'Obsidian\Obsidian.exe')
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $true } }
    return $false
}

# Each item: a plain name, the winget id, and how to tell it is already there.
$Packages = @(
    @{ Name = 'Git (with Git LFS for big files)'; Id = 'Git.Git';            Present = { Test-Command 'git' } },
    @{ Name = 'GitHub CLI';                       Id = 'GitHub.cli';         Present = { Test-Command 'gh' } },
    @{ Name = 'Node.js (LTS)';                    Id = 'OpenJS.NodeJS.LTS';  Present = { Test-Command 'node' } },
    @{ Name = 'Obsidian';                         Id = 'Obsidian.Obsidian';  Present = { Test-ObsidianInstalled } },
    @{ Name = 'Quarto';                           Id = 'Posit.Quarto';       Present = { Test-Command 'quarto' } }
)

Say ''
Say 'Welcome to the Alterbrain installer.'
Say '--------------------------------------'
Say ''

# --- 1. What is missing? ------------------------------------------------------
$missing = @()
Say 'Checking what is already on this computer:'
foreach ($p in $Packages) {
    if (& $p.Present) { Good ($p.Name + ' is installed.') }
    else { Warn ($p.Name + ' is missing.'); $missing += $p }
}
Say ''

if ($missing.Count -gt 0) {
    if (-not (Test-Command 'winget')) {
        Fail 'winget (the Windows app installer) was not found.'
        Say  '  Fix: open the Microsoft Store, search for "App Installer", update it, then run this again.'
        exit 1
    }
    Say 'I would like to install these, one at a time, using winget:'
    foreach ($p in $missing) { Say ('  - ' + $p.Name + '   (winget id: ' + $p.Id + ')') }
    Say ''
    Say 'Windows may show its own permission window for each one. That is normal.'
    Say ''
}

Say ('Alterbrain will be copied from ' + $RepoUrl)
Say ('into this folder: ' + $Folder)
Say ''

# --- 2. Ask once --------------------------------------------------------------
if (-not $Yes) {
    $answer = Read-Host 'Is that OK? Type Y and press Enter to continue, or anything else to stop'
    if ($answer -notmatch '^(y|yes)$') {
        Say 'No problem. Nothing was changed.'
        exit 0
    }
}
Say ''

# --- 3. Install what is missing ----------------------------------------------
$notInstalled = @()
foreach ($p in $missing) {
    Say ('Installing ' + $p.Name + ' ...')
    & winget install --id $p.Id -e --accept-package-agreements --accept-source-agreements
    $code = $LASTEXITCODE
    Update-SessionPath
    if (& $p.Present) { Good ($p.Name + ' is ready.') }
    else {
        Fail ($p.Name + ' could not be confirmed (winget code ' + $code + ').')
        $notInstalled += $p
    }
    Say ''
}

Update-SessionPath

# Git and Node are essential. The others can be added later.
if (-not (Test-Command 'git') -or -not (Test-Command 'node')) {
    Fail 'Git and Node.js are both needed before I can continue.'
    Say  '  Fix: close this window, open a NEW PowerShell window, and run this installer again.'
    Say  '  (Windows only notices new programs in windows opened after the install.)'
    exit 1
}

# --- 4. Copy Alterbrain -------------------------------------------------------
$alreadyThere = (Test-Path (Join-Path $Folder '.git')) -and (Test-Path (Join-Path $Folder 'system\release.json'))
if ($alreadyThere) {
    Good ('Alterbrain is already in ' + $Folder + '. I will leave it as it is.')
}
else {
    if ((Test-Path $Folder) -and (Get-ChildItem -Force $Folder -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        Fail ('The folder ' + $Folder + ' already has other files in it.')
        Say  '  Fix: run this again with an empty or new folder, for example:'
        Say  '       powershell -ExecutionPolicy Bypass -File install.ps1 -Folder "$HOME\Alterbrain2"'
        exit 1
    }
    Say 'Copying Alterbrain ...'
    & git clone $RepoUrl $Folder
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $Folder 'system'))) {
        Fail 'The copy did not work.'
        Say  '  If the message said "not found", the project may still be private. Then:'
        Say  '    1. Run: gh auth login   (choose GitHub.com and sign in with your browser)'
        Say  ('    2. Run: gh repo clone joaoribasio/alterbrain "' + $Folder + '"')
        Say  '    3. Run this installer again.'
        exit 1
    }
    Good ('Alterbrain is now in ' + $Folder)

    # The copy still points at the public Alterbrain page. Disconnect it at once, so that nothing from the public page is
    # merged in behind your back and your notes can never be sent there. (The address is remembered in state\release-origin.json.)
    & node (Join-Path $Folder 'system\scripts\setup-github.mjs') --detach-only | Out-Null
    if ($LASTEXITCODE -eq 0) { Good 'Disconnected from the public Alterbrain page, so your notes stay private.' }
    else { Warn 'Could not disconnect from the public Alterbrain page. Later, run: node system\scripts\setup-github.mjs --detach-only' }
}

& git -C $Folder lfs install --local 2>$null | Out-Null

# --- 5. Health check ----------------------------------------------------------
Say ''
Say 'Running the health check ...'
Say ''
& node (Join-Path $Folder 'system\scripts\doctor.mjs')
$doctorCode = $LASTEXITCODE

Say ''
Say '--------------------------------------'
if ($notInstalled.Count -gt 0) {
    Warn 'These could not be installed. You can add them later:'
    foreach ($p in $notInstalled) { Say ('  winget install --id ' + $p.Id + ' -e') }
    Say ''
}
if ($doctorCode -ne 0) {
    Warn 'The health check found something to fix. The lines marked FAIL say what to do.'
    Say ''
}
Say 'Next steps:'
Say '  1. Open the Claude desktop app and go to the Code tab.'
Say ('  2. Choose this folder: ' + $Folder)
Say '  3. Type:  /onboard'
Say ''
Say 'Claude will ask you a few questions and set everything up. Nothing is sent anywhere without your say-so.'
Say ''
