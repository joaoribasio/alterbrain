#!/usr/bin/env node
// PreToolUse (Write|Edit|MultiEdit|NotebookEdit, Bash|PowerShell and mcp__.*): protect framework code and raw sources.
//
// Denies writes to:
//   - "code"-class files listed in system/manifest.json, plus an always-protected list (spec 14);
//   - vault/40_sources/raw/** (raw copies are immutable; only ingest.mjs writes there);
//   - the .git folder (history and hooks) and Obsidian plugin code;
//   - state/local/dev-mode, always (see below).
// Three doors are watched: the file tools, shell commands (best effort, see system/lib/protect.mjs) and the
// file-writing tools of local MCP servers (mcpvault, filesystem).
//
// Dev mode (state/local/dev-mode) allows framework edits, but the dev-mode marker itself can never be created
// or edited through any of these doors: it is switched on by hand by the owner of the computer, so a single
// approved write (or an injected instruction) cannot switch every protection off. Fails open on malformed input.
import { deny, isMainModule, projectRels, readInput, runHook, splitWords, toolInfo } from '../lib/hookio.mjs';
import { isDevMode } from '../lib/paths.mjs';
import { REASONS, manifestCodePaths, protectedHit, protectedKind, shellProtectHit } from '../lib/protect.mjs';

// MCP servers that read and write files on this computer.
const FILE_SERVER_WORDS = new Set(['mcpvault', 'obsidian', 'vault', 'filesystem', 'fs', 'files', 'file']);
const WRITE_TOOL_WORDS = new Set([
  'write', 'patch', 'delete', 'move', 'rename', 'update', 'edit', 'create', 'append', 'replace', 'remove', 'manage',
  'insert', 'set', 'copy', 'save', 'upload', 'put', 'overwrite',
]);
const PATH_KEY = /^(?:path|paths|file|files|filepath|file_path|filename|source|src|destination|dest|target|from|to|old_?path|new_?path|directory|dir|folder|note|note_?path|oldpath|newpath)$/i;

/** Path-like string values in an MCP tool input (known keys only, up to three levels deep). */
function mcpPaths(value, depth = 0, key = '') {
  const out = [];
  if (depth > 3 || value == null) return out;
  if (typeof value === 'string') {
    if (PATH_KEY.test(key) && value.length < 1024) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) out.push(...mcpPaths(v, depth + 1, key));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) out.push(...mcpPaths(v, depth + 1, k));
  }
  return out;
}

async function main() {
  const input = await readInput();
  if (!input) return; // malformed: fail open
  const info = toolInfo(input);
  const dev = isDevMode();
  let codePaths = null;
  const codes = () => (codePaths ??= manifestCodePaths());

  if (info.isEdit) {
    for (const p of info.filePaths) {
      const hit = protectedHit(p, dev ? new Set() : codes(), dev);
      if (hit) {
        deny(REASONS[hit.kind] || REASONS.system);
        return;
      }
    }
    return;
  }

  if (info.isShell) {
    const hit = shellProtectHit(info.command, info.shell, { codePaths: dev ? new Set() : codes(), dev });
    if (hit) deny(REASONS[hit.kind] || REASONS.system);
    return;
  }

  if (info.isMcp && info.server && info.tool) {
    const serverWords = splitWords(info.server);
    const toolWords = splitWords(info.tool);
    if (!serverWords.some((w) => FILE_SERVER_WORDS.has(w)) || !toolWords.some((w) => WRITE_TOOL_WORDS.has(w))) return;
    for (const raw of mcpPaths(info.toolInput)) {
      // Vault servers take vault-relative paths ("40_sources/raw/x.pdf"); others take project or absolute paths.
      const spellings = [raw, `vault/${raw.replace(/^[\\/]+/, '')}`];
      for (const sp of spellings) {
        for (const rel of projectRels(sp)) {
          const kind = protectedKind(rel, dev ? new Set() : codes(), dev);
          if (kind && kind !== 'system') {
            deny(REASONS[kind]);
            return;
          }
        }
      }
    }
  }
}

if (isMainModule(import.meta.url)) await runHook(main);
