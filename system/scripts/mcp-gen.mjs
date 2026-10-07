// Build .mcp.json from the user's choices (spec section 15).
//
//   node system/scripts/mcp-gen.mjs [--dry-run] [--json]
//
// Reads  config/mcp.selected.json   { "schema": 1, "enabled": ["id", ...] }
//        system/catalogue/mcp.json  the catalogue (entry shape: spec section 16)
// Writes .mcp.json                  { "mcpServers": { "<id>": { command, args, env } } }
//
// On Windows, tools that are launched through a .cmd shim (npx, uvx, ...) are
// wrapped as { command: "cmd", args: ["/c", "npx", ...] }.
//
// Secrets never go in the file. Env values are ${VAR} placeholders (Claude Code
// fills them in from the environment). Short plain settings such as "true" are
// allowed for names that do not look like secrets. The one placeholder we fill
// in ourselves is ${CLAUDE_PROJECT_DIR}, because it is only a folder path (written with
// forward slashes, which work on Windows too).
//
// Exit codes: 0 ok, 1 problems (unknown ids, unusable entries, missing config), 2 wrong usage.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, rootPath, toRel, isMainModule } from '../lib/paths.mjs';
import { readJson, writeText } from '../lib/fsx.mjs';

// Launchers that need "cmd /c" on Windows.
const WIN_SHIMS = new Set(['npx', 'uvx', 'npm', 'pnpm', 'yarn', 'bunx']);
const PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
// Names that suggest a secret: those values must always be a ${VAR} placeholder.
const SECRETISH_KEY = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH|SESSION|COOKIE|HASH|API)/i;
// The one placeholder we fill in ourselves (a folder path, not a secret).
const PROJECT_DIR_PLACEHOLDER = '${CLAUDE_PROJECT_DIR}';

/** True when a value is a ${VAR} placeholder. */
export function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER.test(value);
}

/**
 * True when an env value may be written into .mcp.json: a ${VAR} placeholder,
 * or a short plain setting (like "true" or "300") whose name does not suggest a secret.
 */
export function isSafeEnvValue(key, value) {
  if (isPlaceholder(value)) return true;
  if (typeof value !== 'string' || SECRETISH_KEY.test(String(key))) return false;
  if (!/^[A-Za-z0-9_.:/-]{0,64}$/.test(value)) return false;
  if (/^(sk-|ghp_|gho_|xox|AKIA)/.test(value) || /^[A-Fa-f0-9]{32,}$/.test(value)) return false;
  return true;
}

/**
 * Pull the list of entries out of a parsed catalogue file. Accepts:
 *   [ {id,...} ]   |   { servers|entries|catalogue|items: [ ... ] }
 *   { id: {...} }  (an object map)   |   { servers: { id: {...} } }
 */
export function extractEntries(json) {
  const asList = (v) => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      return Object.entries(v)
        .filter(([k, x]) => k !== 'schema' && x && typeof x === 'object' && !Array.isArray(x))
        .map(([k, x]) => ({ id: k, ...x }));
    }
    return null;
  };
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['servers', 'entries', 'catalogue', 'items']) {
    if (json[key] !== undefined) {
      const list = asList(json[key]);
      if (list) return list;
    }
  }
  return asList(json) || [];
}

/** Wrap a launcher for Windows when needed. Returns { command, args }. */
export function wrapCommand(command, args, platform = process.platform) {
  const base = String(command || '').toLowerCase().replace(/\.(cmd|exe|bat)$/, '');
  if (platform === 'win32' && WIN_SHIMS.has(base)) {
    return { command: 'cmd', args: ['/c', command, ...args] };
  }
  return { command, args };
}

/** Names of ${VAR} placeholders used in a server's env values and headers (not the project folder). */
export function placeholderNames(server) {
  const names = new Set();
  for (const bag of [server.env, server.headers]) {
    for (const v of Object.values(bag || {})) {
      for (const m of String(v).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) names.add(m[1]);
    }
  }
  names.delete('CLAUDE_PROJECT_DIR');
  return [...names];
}

/**
 * Pure builder. Returns { servers, skipped, info, unknown, warnings }.
 *  servers  { id: { command, args, env? } } (or { type, url, headers? } for remote entries)
 *  skipped  [ { id, reason } ]   known but could not be written (a problem)
 *  info     [ { id, reason } ]   known, deliberately not written (claude.ai connectors)
 *  unknown  [ id ]               not in the catalogue
 * `projectDir` (optional): replaces the ${CLAUDE_PROJECT_DIR} placeholder with a real path.
 */
export function buildMcpConfig({ enabled, entries, platform = process.platform, projectDir = null }) {
  const byId = new Map();
  for (const e of entries) if (e && typeof e.id === 'string') byId.set(e.id, e);
  const fill = (s) => (projectDir ? String(s).split(PROJECT_DIR_PLACEHOLDER).join(projectDir) : String(s));

  const servers = {};
  const skipped = [];
  const info = [];
  const unknown = [];
  const warnings = [];
  const seen = new Set();

  for (const rawId of enabled) {
    if (typeof rawId !== 'string' || !rawId.trim()) {
      warnings.push(`Ignored an empty or invalid id in your selection (${JSON.stringify(rawId)}).`);
      continue;
    }
    const id = rawId.trim();
    if (seen.has(id)) continue;
    seen.add(id);

    const entry = byId.get(id);
    if (!entry) {
      unknown.push(id);
      continue;
    }
    if (entry.tier === 'avoid') {
      skipped.push({ id, reason: 'This tool is marked "avoid" in the catalogue, so I left it out.' });
      continue;
    }
    if (entry.blueprint_only || entry.transport === 'none') {
      skipped.push({ id, reason: 'This is a guide only, with no tool to switch on. Ask me to build it from its blueprint.' });
      continue;
    }
    if (entry.tier === 'high-risk') {
      warnings.push(`${id} is marked high-risk. Make sure you really want it switched on.`);
    }

    const transport = entry.transport || 'stdio';
    if (transport === 'connector') {
      info.push({ id, reason: 'This one is a claude.ai connector. Switch it on in claude.ai, not here.' });
      continue;
    }

    // Environment: ${VAR} placeholders, or plain non-secret settings.
    const env = {};
    for (const [k, v] of Object.entries(entry.env || {})) {
      if (isSafeEnvValue(k, v)) env[k] = fill(v);
      else warnings.push(`${id}: the value for ${k} looks like a real secret, so I left it out. Use a \${VAR} placeholder.`);
    }

    if (transport === 'stdio') {
      if (typeof entry.command !== 'string' || !entry.command) {
        skipped.push({ id, reason: 'The catalogue entry has no command to run.' });
        continue;
      }
      const args = Array.isArray(entry.args) ? entry.args.map(fill) : [];
      const wrapped = wrapCommand(fill(entry.command), args, platform);
      const server = { command: wrapped.command, args: wrapped.args };
      if (Object.keys(env).length) server.env = env;
      servers[id] = server;
    } else if (transport === 'http' || transport === 'sse') {
      if (typeof entry.endpoint !== 'string' || !/^https?:\/\//.test(entry.endpoint)) {
        skipped.push({ id, reason: 'The catalogue entry has no web address (endpoint) to connect to.' });
        continue;
      }
      const server = { type: transport, url: entry.endpoint };
      // Remote servers take secrets as headers, not environment variables.
      const headers = {};
      for (const [k, v] of Object.entries(entry.headers || {})) {
        if (isPlaceholder(v) || /^Bearer \$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(String(v))) headers[k] = v;
        else warnings.push(`${id}: the header ${k} is not a \${VAR} placeholder, so I left it out.`);
      }
      if (!Object.keys(headers).length) {
        const secretVar = Object.entries(env).find(([k, v]) => isPlaceholder(v) && SECRETISH_KEY.test(k));
        if (secretVar) headers.Authorization = `Bearer ${secretVar[1]}`;
      }
      if (Object.keys(headers).length) server.headers = headers;
      servers[id] = server;
    } else {
      skipped.push({ id, reason: `I do not know the transport "${transport}".` });
    }
  }
  return { servers, skipped, info, unknown, warnings };
}

/** Variable names defined in a .env.local style file (names only, never values). */
export function envFileKeys(file) {
  const keys = new Set();
  if (!existsSync(file)) return keys;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\S/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

const USAGE = `mcp-gen: builds .mcp.json from your chosen tools

  node system/scripts/mcp-gen.mjs [--dry-run] [--json]

  --dry-run   show what would be written, change nothing
  --json      machine-readable output`;

export function run(argv) {
  const flags = new Set();
  for (const a of argv) {
    if (a === '--dry-run' || a === '--json' || a === '--help') flags.add(a);
    else if (a.startsWith('--platform=')) flags.add(a); // test hook: --platform=win32|darwin|linux
    else {
      console.error(`I do not know "${a}".\n\n${USAGE}`);
      return 2;
    }
  }
  if (flags.has('--help')) {
    console.log(USAGE);
    return 0;
  }
  const json = flags.has('--json');
  const dryRun = flags.has('--dry-run');
  const platformFlag = [...flags].find((f) => f.startsWith('--platform='));
  const platform = platformFlag ? platformFlag.slice('--platform='.length) : process.platform;

  const selectedFile = rootPath('config', 'mcp.selected.json');
  const catalogueFile = rootPath('system', 'catalogue', 'mcp.json');
  const target = rootPath('.mcp.json');

  const fail = (message, extra = {}) => {
    if (json) console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
    else console.error(message);
    return 1;
  };

  if (!existsSync(selectedFile)) {
    return fail('I could not find config/mcp.selected.json. Run the onboarding first, or ask me to choose your tools.');
  }
  const selected = readJson(selectedFile, null);
  if (!selected || !Array.isArray(selected.enabled)) {
    return fail('config/mcp.selected.json is not readable. It should look like {"schema":1,"enabled":["id"]}.');
  }
  if (!existsSync(catalogueFile)) return fail('I could not find system/catalogue/mcp.json.');
  const catalogue = readJson(catalogueFile, null);
  if (catalogue === null) return fail('system/catalogue/mcp.json is not valid JSON.');

  const entries = extractEntries(catalogue);
  const result = buildMcpConfig({ enabled: selected.enabled, entries, platform, projectDir: projectRoot().split(sep).join('/') });

  // Friendly heads-up when a tool needs a key that is not set yet (names only, never values).
  const defined = envFileKeys(rootPath('.env.local'));
  if (!existsSync(rootPath('.env.local')) && existsSync(rootPath('.env.local.txt'))) {
    result.warnings.push('I found .env.local.txt, but the file must be called exactly .env.local. Rename it (remove the .txt at the end).');
  }
  for (const [id, server] of Object.entries(result.servers)) {
    const missing = placeholderNames(server).filter((n) => !process.env[n] && !defined.has(n));
    if (missing.length) {
      result.warnings.push(`${id} needs ${missing.join(', ')}. Add ${missing.length === 1 ? 'it' : 'them'} to .env.local before using this tool.`);
    }
  }

  const content = JSON.stringify({ mcpServers: result.servers }, null, 2) + '\n';
  const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
  const changed = current !== content;
  const problems = result.unknown.length + result.skipped.length;
  if (!dryRun && changed) writeText(target, content);

  const ok = problems === 0;
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok,
          dryRun,
          file: toRel(target),
          changed,
          written: !dryRun && changed,
          platform,
          servers: Object.keys(result.servers),
          unknown: result.unknown,
          skipped: result.skipped,
          info: result.info,
          warnings: result.warnings,
          config: { mcpServers: result.servers },
        },
        null,
        2,
      ),
    );
    return ok ? 0 : 1;
  }

  const names = Object.keys(result.servers);
  console.log(dryRun ? 'Dry run: nothing will be written.' : changed ? 'Updated .mcp.json.' : '.mcp.json is already up to date.');
  console.log(names.length ? `Tools switched on (${names.length}): ${names.join(', ')}` : 'No tools are switched on.');
  for (const id of result.unknown) console.log(`Not in the catalogue, so skipped: ${id}`);
  for (const s of result.skipped) console.log(`Skipped ${s.id}: ${s.reason}`);
  for (const i of result.info) console.log(`Left out ${i.id}: ${i.reason}`);
  for (const w of result.warnings) console.log(`Note: ${w}`);
  if (dryRun) console.log('\n' + content.trimEnd());
  if (problems) console.log('\nFix the ids in config/mcp.selected.json (or the catalogue) and run this again.');
  return ok ? 0 : 1;
}

function isMain() {
  return isMainModule(import.meta.url);
}

if (isMain()) process.exitCode = run(process.argv.slice(2));
