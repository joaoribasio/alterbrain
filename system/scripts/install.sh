#!/usr/bin/env bash
# Alterbrain installer for macOS.
#
# This is a fallback for people who cannot use the "paste a prompt into Claude" route.
# Please download this file, read it, then run it:
#
#   bash install.sh
#
# Options:
#   --folder <path>   where to put Alterbrain (default: ~/Alterbrain)
#   --yes             skip the question (only if you have already read the list below)
#
# What it does, in order:
#   1. Looks for the programs Alterbrain needs and lists any that are missing.
#   2. Asks you ONCE whether it may install them (using Homebrew).
#   3. Installs the missing ones, one at a time: Git, Git LFS, GitHub CLI, Node.js (LTS),
#      Obsidian and Quarto.
#   4. Copies Alterbrain from https://github.com/joaoribasio/alterbrain into your folder.
#   5. Runs a health check and tells you what to do next.
#
# It never asks for a password of yours and never sends anything about you anywhere.
# (macOS itself may ask for your Mac password when an app is installed. That is normal.)

set -u

REPO_URL="https://github.com/joaoribasio/alterbrain"
FOLDER="${HOME}/Alterbrain"
ASSUME_YES=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --folder) shift; FOLDER="${1:-}" ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "I did not understand: $1"; echo "Usage: bash install.sh [--folder <path>] [--yes]"; exit 2 ;;
  esac
  shift
done

if [ -z "$FOLDER" ]; then
  echo "Please give a folder after --folder."
  exit 2
fi

say()  { printf '%s\n' "$*"; }
good() { printf '  [ok] %s\n' "$*"; }
warn() { printf '  [!]  %s\n' "$*"; }
fail() { printf '  [x]  %s\n' "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

obsidian_present() {
  [ -d "/Applications/Obsidian.app" ] || [ -d "${HOME}/Applications/Obsidian.app" ]
}

git_lfs_present() { have git && git lfs version >/dev/null 2>&1; }

say ""
say "Welcome to the Alterbrain installer."
say "--------------------------------------"
say ""

if [ "$(uname -s)" != "Darwin" ]; then
  fail "This installer is for macOS. On Windows, use install.ps1 instead."
  say  "  On Linux, please install Git, Git LFS, GitHub CLI, Node.js 20 or newer and Quarto yourself,"
  say  "  then copy Alterbrain with: git clone ${REPO_URL}"
  exit 1
fi

# name | how to test | brew install command
NAMES=("Git" "Git LFS (big files)" "GitHub CLI" "Node.js (LTS)" "Obsidian" "Quarto")
MISSING=()

check() {
  # $1 = index, $2 = test result (0 = present)
  if [ "$2" -eq 0 ]; then good "${NAMES[$1]} is installed."; else warn "${NAMES[$1]} is missing."; MISSING+=("$1"); fi
}

say "Checking what is already on this computer:"
have git;            check 0 $?
git_lfs_present;     check 1 $?
have gh;             check 2 $?
have node;           check 3 $?
obsidian_present;    check 4 $?
have quarto;         check 5 $?
say ""

if [ "${#MISSING[@]}" -gt 0 ]; then
  if ! have brew; then
    fail "Homebrew (the Mac app installer) was not found."
    say  "  Fix: open https://brew.sh in your browser, follow the steps on that page,"
    say  "       then run this installer again."
    exit 1
  fi
  say "I would like to install these, one at a time, using Homebrew:"
  for i in "${MISSING[@]}"; do say "  - ${NAMES[$i]}"; done
  say ""
fi

say "Alterbrain will be copied from ${REPO_URL}"
say "into this folder: ${FOLDER}"
say ""

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Is that OK? Type Y and press Enter to continue, or anything else to stop: '
  read -r answer
  case "$answer" in
    y|Y|yes|YES|Yes) ;;
    *) say "No problem. Nothing was changed."; exit 0 ;;
  esac
fi
say ""

FAILED=()

install_one() {
  # $1 = index
  case "$1" in
    0) brew install git ;;
    1) brew install git-lfs ;;
    2) brew install gh ;;
    3)
      if ! brew install node@24; then brew install node; fi
      if ! have node; then brew link --overwrite --force node@24 >/dev/null 2>&1 || true; fi
      ;;
    4) brew install --cask obsidian ;;
    5) brew install --cask quarto ;;
  esac
}

for i in "${MISSING[@]:-}"; do
  [ -n "$i" ] || continue
  say "Installing ${NAMES[$i]} ..."
  install_one "$i"
  hash -r
  ok=1
  case "$i" in
    0) have git || ok=0 ;;
    1) git_lfs_present || ok=0 ;;
    2) have gh || ok=0 ;;
    3) have node || ok=0 ;;
    4) obsidian_present || ok=0 ;;
    5) have quarto || ok=0 ;;
  esac
  if [ "$ok" -eq 1 ]; then good "${NAMES[$i]} is ready."; else fail "${NAMES[$i]} could not be confirmed."; FAILED+=("${NAMES[$i]}"); fi
  say ""
done

if ! have git || ! have node; then
  fail "Git and Node.js are both needed before I can continue."
  say  "  Fix: close this Terminal window, open a new one, and run this installer again."
  exit 1
fi

# --- Copy Alterbrain ----------------------------------------------------------
if [ -d "${FOLDER}/.git" ] && [ -f "${FOLDER}/system/release.json" ]; then
  good "Alterbrain is already in ${FOLDER}. I will leave it as it is."
else
  if [ -d "$FOLDER" ] && [ -n "$(ls -A "$FOLDER" 2>/dev/null)" ]; then
    fail "The folder ${FOLDER} already has other files in it."
    say  "  Fix: run this again with an empty or new folder, for example:"
    say  "       bash install.sh --folder \"\$HOME/Alterbrain2\""
    exit 1
  fi
  say "Copying Alterbrain ..."
  if ! git clone "$REPO_URL" "$FOLDER" || [ ! -d "${FOLDER}/system" ]; then
    fail "The copy did not work."
    say  "  If the message said \"not found\", the project may still be private. Then:"
    say  "    1. Run: gh auth login   (choose GitHub.com and sign in with your browser)"
    say  "    2. Run: gh repo clone joaoribasio/alterbrain \"${FOLDER}\""
    say  "    3. Run this installer again."
    exit 1
  fi
  good "Alterbrain is now in ${FOLDER}"

  # The copy still points at the public Alterbrain page. Disconnect it at once, so that nothing from the public page is
  # merged in behind your back and your notes can never be sent there. (The address is remembered in state/release-origin.json.)
  if node "${FOLDER}/system/scripts/setup-github.mjs" --detach-only >/dev/null 2>&1; then
    good "Disconnected from the public Alterbrain page, so your notes stay private."
  else
    warn "Could not disconnect from the public Alterbrain page. Later, run: node system/scripts/setup-github.mjs --detach-only"
  fi
fi

git -C "$FOLDER" lfs install --local >/dev/null 2>&1 || true

# --- Health check -------------------------------------------------------------
say ""
say "Running the health check ..."
say ""
node "${FOLDER}/system/scripts/doctor.mjs"
DOCTOR_CODE=$?

say ""
say "--------------------------------------"
if [ "${#FAILED[@]}" -gt 0 ]; then
  warn "These could not be installed. You can add them later:"
  for n in "${FAILED[@]}"; do say "  ${n}"; done
  say ""
fi
if [ "$DOCTOR_CODE" -ne 0 ]; then
  warn "The health check found something to fix. The lines marked FAIL say what to do."
  say ""
fi
say "Next steps:"
say "  1. Open the Claude desktop app and go to the Code tab."
say "  2. Choose this folder: ${FOLDER}"
say "  3. Type:  /onboard"
say ""
say "Claude will ask you a few questions and set everything up. Nothing is sent anywhere without your say-so."
say ""
