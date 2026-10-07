# Fixes for each health check

Use this table after `node system/scripts/doctor.mjs --json`. Match on the check name or its plain-language meaning, because the exact check ids may differ slightly. Always ask before running a fix.

Commands are written for the terminal Claude Code already uses. On Windows use `winget`. On macOS use `brew`.

## Required checks

| Check | What to tell the user | Fix |
|---|---|---|
| **Node.js 20 or newer** | Node is the engine that runs Alterbrain's small helper programs. Yours is missing or too old. | Windows: `winget install OpenJS.NodeJS.LTS`. macOS: `brew install node`. Then ask the user to restart Claude Code. |
| **git** | Git keeps a safe history of your files. It is not installed. | Windows: `winget install Git.Git`. macOS: `xcode-select --install` or `brew install git`. Restart Claude Code afterwards. |
| **git-lfs** | Git LFS lets git store big files such as PDFs without slowing down. | Windows: `winget install GitHub.GitLFS`. macOS: `brew install git-lfs`. Then run `git lfs install`. |
| **GitHub sign-in (gh)** | Alterbrain backs up your work to a private GitHub repository. You are not signed in. | The user runs `gh auth login` in their own terminal and follows the prompts. Do not run it for them. If `gh` is missing: Windows `winget install GitHub.cli`, macOS `brew install gh`. |
| **Backup repository (origin)** | Your work is not yet backed up online. | Run `node system/scripts/setup-github.mjs --name <repo-name>` (it creates a private repository). Ask the user for the repo name, suggest `alterbrain-<their first name>`. |
| **Model is sonnet** | Alterbrain works best on the Sonnet model. It saves your allowance. | Tell the user to type `/model sonnet` in Claude Code. Do not edit `.claude/settings.json`. |
| **Claude Code version** | Your Claude Code is older than the minimum Alterbrain needs (see `min_claude_code` in `system/release.json`). | Tell the user to update Claude Code with the method they installed it with (the desktop app updates itself; the terminal version uses `claude update`). Ask them to restart afterwards. |
| **Onboarding finished** | Alterbrain has not finished getting to know you. | Offer to run `/onboard`. |
| **Vault folders** | Some folders in `vault/` are missing. | With approval, create only the missing empty folders listed in SPEC section 3. Never overwrite a file. If `Home.md` or `Tasks.md` is missing, copy it from `system/templates/` only if the template exists; otherwise offer `/onboard`. |
| **Framework files unchanged** | A protected framework file differs from the released version. It may have been edited by hand or damaged. | Do not edit it. Offer `/update-alterbrain`, which restores released files safely. In dev mode, ignore this check. |
| **Skills and agents valid** (`validate.mjs`) | One of the skill or agent files has a formatting mistake. | Run `node system/scripts/validate.mjs` and read the message. If the file is the user's own (`my-` prefix), offer to fix the header. If it is a framework file, offer `/update-alterbrain`. |
| **Tool connections file (`.mcp.json`)** | The file that lists connected tools is missing or broken. | Run `node system/scripts/mcp-gen.mjs --dry-run` first and show the result. With approval, run `node system/scripts/mcp-gen.mjs`. |
| **Disk space** | Your disk is nearly full. | Explain that big files can stay on this machine only (`vault/40_sources/raw/_local/`). Offer to list the five largest files in `vault/40_sources/raw/` (read-only). Never delete anything. |

## Optional checks

| Check | What to tell the user | Fix |
|---|---|---|
| **Quarto** | Quarto turns your notes into polished PDFs. You only need it for `/render` and assignments. | Windows: `winget install Posit.Quarto`. macOS: `brew install --cask quarto`. |
| **Obsidian settings** | Obsidian has not been set up with Alterbrain's recommended settings. | With approval, run `node system/scripts/obsidian-setup.mjs`. It downloads a few pinned plugins and checks them. Tell the user it needs internet. |

## After a fix

- Re-run the doctor.
- If a fix needs a restart (Node, git, Claude Code), say so plainly and stop there. Do not try to continue in the old session.
- If a fix fails twice, stop, explain in one sentence, add a task with `--tag health-check`, and move on to the next problem.
