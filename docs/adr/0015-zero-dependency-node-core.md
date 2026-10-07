# 0015. Zero-dependency Node core

Status: accepted

## Context
Windows machines often lack a working Python (`python3` is missing or points to a store stub). Installing packages adds steps and supply-chain risk. Claude Code itself already works with Node.

## Decision
- Hooks, scripts and libraries are ESM `.mjs` files using only Node built-ins (Node 20 or newer). No `npm install`.
- No Python in the core. Python is allowed only in optional blueprints and in a few catalogue MCP servers (`markitdown`, `fetch`) that start with `uvx`. These are off by default and are enabled only after `uv` is installed; `doctor.mjs` warns if one is configured and `uv` is missing. Alterbrain's own scripts never need Python.
- No bash-only syntax, no `/tmp`, no symlinks. Use `path.join` and `os.tmpdir()`. Line endings are LF.
- Tests use `node --test`.
- CI runs on Windows and macOS.

## Consequences
- Install is simple, and behaviour is the same on both systems.
- We write small helpers ourselves instead of using libraries.

## Alternatives considered
- **Python core.** Not reliably present on Windows.
- **npm packages.** Install steps and supply-chain exposure.
- **Shell scripts.** Not portable.
