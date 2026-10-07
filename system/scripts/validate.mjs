// Alterbrain lint (spec sections 6, 7, 8, 15, 16).
//
//   node system/scripts/validate.mjs [--json] [--write-manifest [--sign-key <ed25519-private-key.pem>]]
//
// Checks: skill and agent frontmatter, blueprint sections, routing.json,
// mcp.json (the catalogue) and .claude/settings.json (valid JSON).
// --write-manifest regenerates system/manifest.json (release tooling).
//
// Output with --json: { ok, errors: [], warnings: [], checked: {...} }
// Exit codes: 0 no errors (warnings are fine), 1 errors found, 2 wrong usage.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, isMainModule } from '../lib/paths.mjs';
import { splitFrontmatter } from '../lib/frontmatter.mjs';
import { signManifest, writeManifest } from '../lib/manifest.mjs';
import { validateLimits } from '../lib/rateguard.mjs';
import { extractEntries, isSafeEnvValue } from './mcp-gen.mjs';

const MODELS = ['haiku', 'sonnet', 'opus', 'fable', 'inherit'];
const EFFORTS = ['low', 'medium', 'high'];
const EFFORTS_WARN = ['xhigh', 'max'];
const SKILL_KEYS = ['name', 'description', 'model', 'effort', 'argument-hint'];
const AGENT_KEYS = ['name', 'description', 'model', 'effort', 'tools', 'disallowedTools'];
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_MAX_LINES = 250;
const DESCRIPTION_MAX = 1024;
// Vendored from kepano/obsidian-skills: their body layout is upstream's, so only the frontmatter is linted.
const VENDORED_SKILLS = new Set(['obsidian-markdown', 'obsidian-bases', 'json-canvas', 'obsidian-cli', 'defuddle']);

const SKILL_SECTIONS = ['When to use', 'Before you start', 'Steps', 'Outputs', 'Safety'];
const BLUEPRINT_SECTIONS = [
  'What it does',
  "You'll need",
  'Cost and risk',
  "Questions I'll ask you",
  'Build steps',
  'How to test',
  'How to undo',
];
const BLUEPRINT_KEYS = ['type', 'title', 'kind', 'status', 'risk', 'cost'];
const ROUTING_CLASSES = ['deterministic', 'triage', 'work', 'review', 'judgement'];
const MCP_TIERS = ['core', 'optional', 'high-risk', 'avoid'];
const MCP_TRANSPORTS = ['stdio', 'http', 'sse', 'connector', 'none'];
const MCP_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const MCP_AUTH = ['none', 'api-key', 'oauth', 'connector'];
const MCP_TOS = ['low', 'medium', 'high'];
// Agents that must stay quarantined (no write, no send, no web).
const QUARANTINE_FORBIDDEN = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch'];
// The Gmail connector's tools that write, send or delete. mail-reader may never use them.
const GMAIL_WRITE_TOOLS = [
  'mcp__claude_ai_Gmail__send_message',
  'mcp__claude_ai_Gmail__reply',
  'mcp__claude_ai_Gmail__forward',
  'mcp__claude_ai_Gmail__create_draft',
  'mcp__claude_ai_Gmail__update_draft',
  'mcp__claude_ai_Gmail__trash_message',
];
const QUARANTINE_BLOCKED = [...QUARANTINE_FORBIDDEN, ...GMAIL_WRITE_TOOLS];

/** Collect problems with a readable prefix. */
class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  error(where, msg) {
    this.errors.push(`${where}: ${msg}`);
  }
  warn(where, msg) {
    this.warnings.push(`${where}: ${msg}`);
  }
}

const readText = (file) => readFileSync(file, 'utf8').replace(/^﻿/, '');
const normApostrophe = (s) => s.replace(/[‘’`´]/g, "'");

function readJsonStrict(file) {
  try {
    return { data: JSON.parse(readText(file)) };
  } catch (e) {
    return { error: e.message };
  }
}

/** Headings (## level) outside code fences, in order. */
function headings(body, level = 2) {
  const found = [];
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = line.match(new RegExp(`^#{${level}}\\s+(.+?)\\s*#*\\s*$`));
    if (m) found.push(m[1].trim());
  }
  return found;
}

function hasH1(body) {
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && /^#\s+\S/.test(line)) return true;
  }
  return false;
}

function checkModelEffort(r, where, data) {
  const has = (v) => v !== undefined && v !== '';
  // Missing keys are reported separately as "missing required key".
  if (has(data.model) && (typeof data.model !== 'string' || !MODELS.includes(data.model))) {
    const hint = typeof data.model === 'string' && /claude-|\d/.test(data.model) ? ' Use the short name, not a full model ID.' : '';
    r.error(where, `model must be one of ${MODELS.join(', ')} (found ${JSON.stringify(data.model)}).${hint}`);
  }
  if (has(data.effort)) {
    if (typeof data.effort !== 'string' || ![...EFFORTS, ...EFFORTS_WARN].includes(data.effort)) {
      r.error(where, `effort must be one of ${EFFORTS.join(', ')} (found ${JSON.stringify(data.effort)}).`);
    } else if (EFFORTS_WARN.includes(data.effort)) {
      r.warn(where, `effort "${data.effort}" is allowed but expensive. Check it is really needed.`);
    }
  }
}

function checkDescription(r, where, data) {
  const d = data.description;
  if (typeof d !== 'string' || !d.trim()) {
    r.error(where, 'description is missing or empty.');
    return;
  }
  if (d === '>' || d === '|' || d === '>-' || d === '|-') {
    r.error(where, 'description must be on a single line (no folded or block text).');
    return;
  }
  if (d.length < 20) r.warn(where, 'description is very short. Say what it does and when to use it.');
  if (d.length > DESCRIPTION_MAX) r.warn(where, `description is over ${DESCRIPTION_MAX} characters. Shorten it.`);
}

function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- skills
function checkSkills(root, r) {
  const dir = join(root, '.claude', 'skills');
  let count = 0;
  for (const e of listDir(dir)) {
    if (!e.isDirectory()) {
      r.warn(`.claude/skills/${e.name}`, 'stray file. Skills live in folders: .claude/skills/<name>/SKILL.md.');
      continue;
    }
    count++;
    const where = `.claude/skills/${e.name}/SKILL.md`;
    const file = join(dir, e.name, 'SKILL.md');
    if (!existsSync(file)) {
      r.error(where, 'SKILL.md is missing.');
      continue;
    }
    const text = readText(file);
    const { data, body, raw } = splitFrontmatter(text);
    if (!raw) {
      r.error(where, 'no frontmatter found (the file must start with --- and end the block with ---).');
      continue;
    }
    for (const key of ['name', 'description', 'model', 'effort']) {
      if (data[key] === undefined || data[key] === '') r.error(where, `missing required key "${key}".`);
    }
    for (const key of Object.keys(data)) {
      if (!SKILL_KEYS.includes(key)) r.error(where, `unknown frontmatter key "${key}". Allowed: ${SKILL_KEYS.join(', ')}.`);
    }
    if (typeof data.name === 'string' && data.name) {
      if (data.name !== e.name) r.error(where, `name "${data.name}" must match the folder name "${e.name}".`);
      if (!NAME_RE.test(data.name)) r.error(where, `name "${data.name}" must be lower-case words joined by hyphens.`);
    }
    checkModelEffort(r, where, data);
    if (data.description !== undefined) checkDescription(r, where, data);

    const lines = text.replace(/\r?\n$/, '').split(/\r?\n/).length;
    if (lines > SKILL_MAX_LINES) r.error(where, `${lines} lines. SKILL.md must be ${SKILL_MAX_LINES} lines or fewer. Move detail to references/ or workflows/.`);

    // Body shape (warnings: the content is judged by people, not by this lint).
    if (VENDORED_SKILLS.has(e.name)) continue;
    if (!hasH1(body)) r.warn(where, 'no "# Title" line.');
    const found = headings(body, 2).map((h) => h.toLowerCase());
    let last = -1;
    for (const want of SKILL_SECTIONS) {
      const idx = found.findIndex((h) => h.startsWith(want.toLowerCase()));
      if (idx === -1) r.warn(where, `missing section "## ${want}".`);
      else {
        if (idx < last) r.warn(where, `section "## ${want}" is out of order (see spec section 7).`);
        last = Math.max(last, idx);
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------- agents
function toolList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function checkAgents(root, r) {
  const dir = join(root, '.claude', 'agents');
  let count = 0;
  for (const e of listDir(dir)) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    count++;
    const where = `.claude/agents/${e.name}`;
    const text = readText(join(dir, e.name));
    const { data, body, raw } = splitFrontmatter(text);
    if (!raw) {
      r.error(where, 'no frontmatter found.');
      continue;
    }
    // mail-reader may use `disallowedTools` instead of a `tools` list: the Gmail connector's read tool
    // names are not known in advance, so it inherits tools and blocks the dangerous ones.
    const emptyKey = (key) => data[key] === undefined || data[key] === '' || (Array.isArray(data[key]) && data[key].length === 0);
    for (const key of ['name', 'description', 'model', 'effort', 'tools']) {
      if (!emptyKey(key)) continue;
      if (key === 'tools' && data.name === 'mail-reader' && !emptyKey('disallowedTools')) continue;
      r.error(where, key === 'tools' ? 'agents must declare "tools" (least privilege).' : `missing required key "${key}".`);
    }
    for (const key of Object.keys(data)) {
      if (!AGENT_KEYS.includes(key)) r.warn(where, `unusual frontmatter key "${key}".`);
    }
    const stem = e.name.replace(/\.md$/, '');
    if (typeof data.name === 'string' && data.name && data.name !== stem) {
      r.error(where, `name "${data.name}" must match the file name "${stem}".`);
    }
    if (typeof data.name === 'string' && data.name && !NAME_RE.test(data.name)) {
      r.error(where, `name "${data.name}" must be lower-case words joined by hyphens.`);
    }
    checkModelEffort(r, where, data);
    if (data.description !== undefined) checkDescription(r, where, data);

    if (data.name === 'mail-reader') {
      const allowed = toolList(data.tools);
      const blocked = toolList(data.disallowedTools).map((t) => t.toLowerCase());
      // With a tools list, nothing that writes, sends or browses may be in it.
      const blockedLower = QUARANTINE_BLOCKED.map((t) => t.toLowerCase());
      const bad = allowed.filter((t) => blockedLower.includes(t.toLowerCase()));
      if (bad.length) r.error(where, `mail-reader must stay quarantined (no write, no send, no web). Remove: ${bad.join(', ')}.`);
      // With no tools list, it inherits everything, so disallowedTools must cover every write, send and web tool.
      if (allowed.length === 0) {
        const missing = QUARANTINE_BLOCKED.filter((t) => !blocked.includes(t.toLowerCase()));
        if (missing.length) {
          r.error(where, `mail-reader has no "tools" list, so "disallowedTools" must block write, send and web tools. Add: ${missing.join(', ')}.`);
        }
      }
    }
    if (!/\bnever\b/i.test(body)) r.warn(where, 'no "Never" list found in the body (spec section 8).');
  }
  return count;
}

// ------------------------------------------------------------- blueprints
function checkBlueprints(root, r) {
  const dir = join(root, 'system', 'blueprints');
  let count = 0;
  for (const e of listDir(dir)) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    if (e.name.startsWith('_') || e.name.toLowerCase() === 'readme.md') continue;
    count++;
    const where = `system/blueprints/${e.name}`;
    const { data, body, raw } = splitFrontmatter(readText(join(dir, e.name)));
    if (!raw) {
      r.error(where, 'no frontmatter found.');
      continue;
    }
    for (const key of BLUEPRINT_KEYS) {
      if (data[key] === undefined || data[key] === '') r.error(where, `missing frontmatter key "${key}".`);
    }
    if (data.type !== undefined && data.type !== 'blueprint') r.error(where, 'type must be "blueprint".');
    if (data.status !== undefined && data.status !== '' && data.status !== 'available') {
      r.warn(where, `status is "${data.status}". Blueprints normally say "available".`);
    }
    const found = headings(body, 2).map((h) => normApostrophe(h).toLowerCase());
    for (const want of BLUEPRINT_SECTIONS) {
      const w = normApostrophe(want).toLowerCase();
      if (!found.some((h) => h === w || h.startsWith(w))) r.error(where, `missing section "## ${want}".`);
    }
  }
  return count;
}

// ---------------------------------------------------------------- routing
function checkRouting(root, r) {
  const rel = 'system/catalogue/routing.json';
  const file = join(root, 'system', 'catalogue', 'routing.json');
  if (!existsSync(file)) {
    r.error(rel, 'file is missing.');
    return false;
  }
  const { data, error } = readJsonStrict(file);
  if (error) {
    r.error(rel, `not valid JSON (${error}).`);
    return false;
  }
  if (data.schema !== 1) r.error(rel, 'schema must be 1.');
  if (!data.classes || typeof data.classes !== 'object' || Array.isArray(data.classes)) {
    r.error(rel, '"classes" must be an object.');
  } else {
    for (const c of ROUTING_CLASSES) if (!data.classes[c]) r.error(rel, `missing class "${c}".`);
    for (const [name, cls] of Object.entries(data.classes)) {
      if (!cls || typeof cls !== 'object') {
        r.error(rel, `class "${name}" must be an object.`);
        continue;
      }
      if (name === 'deterministic') {
        if (cls.model !== undefined && cls.model !== 'script' && cls.model !== null) {
          r.error(rel, 'class "deterministic" should use model "script" (no AI model).');
        }
      } else {
        if (!MODELS.includes(cls.model)) r.error(rel, `class "${name}": model must be one of ${MODELS.join(', ')}.`);
        if (![...EFFORTS, ...EFFORTS_WARN].includes(cls.effort)) r.error(rel, `class "${name}": effort must be one of ${EFFORTS.join(', ')}.`);
        else if (EFFORTS_WARN.includes(cls.effort)) r.warn(rel, `class "${name}": effort "${cls.effort}" is expensive.`);
      }
      if (cls.examples !== undefined && !Array.isArray(cls.examples)) r.error(rel, `class "${name}": examples must be a list.`);
    }
  }
  const caps = data.caps;
  if (!caps || typeof caps !== 'object') r.error(rel, '"caps" must be an object like {"pro":3,"max":8}.');
  else {
    for (const tier of ['pro', 'max']) {
      if (!Number.isInteger(caps[tier]) || caps[tier] < 1) r.error(rel, `caps.${tier} must be a whole number of 1 or more.`);
    }
    if (Number.isInteger(caps.pro) && Number.isInteger(caps.max) && caps.max < caps.pro) r.error(rel, 'caps.max must not be lower than caps.pro.');
  }
  return true;
}

// ---------------------------------------------------------------- rate-guard limits
/** system/catalogue/limits.json: checked when present (the hook fails closed on a bad file, so catch it here first). */
function checkLimits(root, r) {
  const rel = 'system/catalogue/limits.json';
  const file = join(root, 'system', 'catalogue', 'limits.json');
  if (!existsSync(file)) return 0;
  const { data, error } = readJsonStrict(file);
  if (error) {
    r.error(rel, `not valid JSON (${error}).`);
    return 0;
  }
  for (const problem of validateLimits(data)) r.error(rel, `${problem}.`);
  return data && data.servers && typeof data.servers === 'object' ? Object.keys(data.servers).length : 0;
}

// ---------------------------------------------------------------- catalogue
function isPinned(entry) {
  const cmd = String(entry.command || '').toLowerCase().replace(/\.(cmd|exe)$/, '');
  if (!['npx', 'uvx', 'pipx', 'bunx', 'pnpx'].includes(cmd)) return true; // not a package launcher
  const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
  const pkgs = args.filter((a) => !a.startsWith('-'));
  if (pkgs.some((a) => /@latest$/i.test(a))) return false;
  return pkgs.some((a) => /(?:@|==|~=)v?\d/.test(a));
}

function checkCatalogue(root, r) {
  const rel = 'system/catalogue/mcp.json';
  const file = join(root, 'system', 'catalogue', 'mcp.json');
  if (!existsSync(file)) {
    r.error(rel, 'file is missing.');
    return 0;
  }
  const { data, error } = readJsonStrict(file);
  if (error) {
    r.error(rel, `not valid JSON (${error}).`);
    return 0;
  }
  const entries = extractEntries(data);
  if (entries.length === 0) r.error(rel, 'no catalogue entries found.');
  const ids = new Set();
  entries.forEach((e, i) => {
    const label = e && typeof e.id === 'string' ? `${rel} [${e.id}]` : `${rel} [entry ${i}]`;
    if (!e || typeof e !== 'object') {
      r.error(label, 'entry must be an object.');
      return;
    }
    if (typeof e.id !== 'string' || !MCP_ID_RE.test(e.id)) r.error(label, 'id must be lower-case letters, numbers, hyphens or underscores.');
    else if (ids.has(e.id)) r.error(label, 'duplicate id.');
    else ids.add(e.id);
    for (const key of ['name', 'licence', 'what']) {
      if (typeof e[key] !== 'string' || !e[key].trim()) r.error(label, `missing "${key}".`);
    }
    if (typeof e.url !== 'string' || !/^https:\/\//.test(e.url)) r.error(label, '"url" must be an https link.');
    if (!MCP_TIERS.includes(e.tier)) r.error(label, `tier must be one of ${MCP_TIERS.join(', ')}.`);
    const transport = e.transport ?? 'stdio';
    if (!MCP_TRANSPORTS.includes(transport)) r.error(label, `transport must be one of ${MCP_TRANSPORTS.join(', ')}.`);
    // Entries that will never be switched on (avoid tier, guide-only) need no command.
    const noTool = e.tier === 'avoid' || e.blueprint_only === true || transport === 'none';
    if (transport === 'none' && e.blueprint_only !== true) r.error(label, 'transport "none" is only for entries marked blueprint_only.');
    if (transport === 'stdio' && !noTool) {
      if (typeof e.command !== 'string' || !e.command) r.error(label, 'stdio entries need a "command".');
      if (!Array.isArray(e.args)) r.error(label, 'stdio entries need "args" as a list.');
      else if (!isPinned(e)) r.warn(label, 'package version is not pinned (use name@1.2.3). Unpinned tools can change under you.');
    } else if (transport === 'http' || transport === 'sse') {
      if (typeof e.endpoint !== 'string' || !/^https?:\/\//.test(e.endpoint)) r.error(label, `${transport} entries need an "endpoint" web address.`);
    }
    if (e.auth !== undefined && !MCP_AUTH.includes(e.auth)) r.error(label, `auth must be one of ${MCP_AUTH.join(', ')}.`);
    if (e.auth === undefined) r.warn(label, 'missing "auth".');
    if (e.tos_risk !== undefined && !MCP_TOS.includes(e.tos_risk)) r.error(label, `tos_risk must be one of ${MCP_TOS.join(', ')}.`);
    if (e.writes !== undefined && typeof e.writes !== 'boolean') r.error(label, '"writes" must be true or false.');
    if (e.env !== undefined) {
      if (!e.env || typeof e.env !== 'object' || Array.isArray(e.env)) r.error(label, '"env" must be an object.');
      else for (const [k, v] of Object.entries(e.env)) if (!isSafeEnvValue(k, v)) r.error(label, `env ${k} must be a \${VAR} placeholder, never a real value.`);
    }
    if (e.verified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.verified))) r.error(label, '"verified" must be a date like 2026-10-06.');
    if (e.writes === true && e.channel === undefined) r.warn(label, 'a tool that can write or send should name its "channel" (for the outbound guard).');
  });
  checkCatalogueMarkdown(root, r, entries);
  return entries.length;
}

/** The human page (MCP-CATALOGUE.md) says the json file wins: its Risk column must match tos_risk. */
function checkCatalogueMarkdown(root, r, entries) {
  const rel = 'system/catalogue/MCP-CATALOGUE.md';
  const file = join(root, 'system', 'catalogue', 'MCP-CATALOGUE.md');
  if (!existsSync(file)) return;
  const byId = new Map(entries.filter((e) => e && typeof e.id === 'string').map((e) => [e.id, e]));
  let riskCol = -1;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      riskCol = -1;
      continue;
    }
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const header = cells.findIndex((c) => c.toLowerCase() === 'risk');
    if (header !== -1 && cells[0].toLowerCase() === 'name') {
      riskCol = header;
      continue;
    }
    if (riskCol === -1 || /^[-: ]+$/.test(cells[0])) continue;
    const entry = byId.get(cells[0].replace(/`/g, ''));
    const word = (cells[riskCol] || '').toLowerCase();
    if (entry && entry.tos_risk && ['low', 'medium', 'high'].includes(word) && word !== entry.tos_risk) {
      r.error(rel, `${entry.id}: the page says risk "${word}" but mcp.json says "${entry.tos_risk}".`);
    }
  }
}

// ---------------------------------------------------------------- attribution
/** Every file UPSTREAM-SYNC.md lists as "adapted" must carry its attribution line (spec section 18). */
function checkAttribution(root, r) {
  const file = join(root, 'UPSTREAM-SYNC.md');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4 || cells[2] !== 'adapted') continue;
    for (const path of [...cells[0].matchAll(/`([^`]+)`/g)].map((m) => m[1])) {
      const abs = join(root, ...path.split('/'));
      if (!existsSync(abs)) continue;
      if (!/Adapted from |@ [0-9a-f]{40}/i.test(readFileSync(abs, 'utf8'))) r.error(path, 'listed as adapted in UPSTREAM-SYNC.md but has no "Adapted from ... @ <sha>" line.');
    }
  }
}

// ---------------------------------------------------------------- main check
/** Run every check against a project. Returns { ok, errors, warnings, checked }. */
export function validateProject(root = projectRoot()) {
  const r = new Report();
  const checked = {};
  checked.skills = checkSkills(root, r);
  checked.agents = checkAgents(root, r);
  checked.blueprints = checkBlueprints(root, r);
  checked.routing = checkRouting(root, r);
  checked.mcp_entries = checkCatalogue(root, r);
  checked.limits_servers = checkLimits(root, r);
  checkAttribution(root, r);

  const settings = join(root, '.claude', 'settings.json');
  if (existsSync(settings)) {
    const res = readJsonStrict(settings);
    if (res.error) r.error('.claude/settings.json', `not valid JSON (${res.error}).`);
  }
  if (checked.skills === 0) r.warn('.claude/skills', 'no skills found.');
  return { ok: r.errors.length === 0, errors: r.errors, warnings: r.warnings, checked };
}

const USAGE = `validate: checks that skills, agents, blueprints and catalogues are well formed

  node system/scripts/validate.mjs [--json] [--write-manifest]

  --write-manifest   rewrite system/manifest.json (for releases)
  --sign-key <pem>   with --write-manifest: also sign it (writes system/manifest.sig; the public key goes in system/release.json as signing_public_key)
  --json             machine-readable output`;

export function run(argv) {
  const known = new Set(['--json', '--write-manifest', '--sign-key', '--help']);
  const signAt = argv.indexOf('--sign-key');
  const signKeyFile = signAt === -1 ? null : argv[signAt + 1];
  if (signAt !== -1 && (!signKeyFile || signKeyFile.startsWith('--') || !argv.includes('--write-manifest'))) {
    console.error(`--sign-key needs a key file and goes together with --write-manifest.\n\n${USAGE}`);
    return 2;
  }
  for (const [i, a] of argv.entries()) {
    if (signAt !== -1 && i === signAt + 1) continue; // the key file name
    if (!known.has(a)) {
      console.error(`I do not know "${a}".\n\n${USAGE}`);
      return 2;
    }
  }
  if (argv.includes('--help')) {
    console.log(USAGE);
    return 0;
  }
  const json = argv.includes('--json');
  const root = projectRoot();
  const result = validateProject(root);

  let manifest = null;
  if (argv.includes('--write-manifest')) {
    const m = writeManifest(root);
    manifest = { path: 'system/manifest.json', files: m.files.length };
    if (signKeyFile) {
      try {
        signManifest(root, signKeyFile);
        manifest.signed = 'system/manifest.sig';
      } catch (e) {
        console.error(`Could not sign the manifest: ${e.message || e}`);
        return 1;
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ ...result, ...(manifest ? { manifest } : {}) }, null, 2));
    return result.ok ? 0 : 1;
  }

  const c = result.checked;
  console.log(
    `Checked ${c.skills} skill(s), ${c.agents} agent(s), ${c.blueprints} blueprint(s) and ${c.mcp_entries} catalogue entr${c.mcp_entries === 1 ? 'y' : 'ies'}.`,
  );
  if (manifest) console.log(`Wrote ${manifest.path} (${manifest.files} files).${manifest.signed ? ` Signed it: ${manifest.signed}.` : ''}`);
  if (result.errors.length) {
    console.log(`\nProblems to fix (${result.errors.length}):`);
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  if (result.warnings.length) {
    console.log(`\nWorth a look (${result.warnings.length}):`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  if (result.ok) console.log(result.warnings.length ? '\nNo problems, only notes.' : '\nAll good.');
  return result.ok ? 0 : 1;
}

function isMain() {
  return isMainModule(import.meta.url);
}

if (isMain()) process.exitCode = run(process.argv.slice(2));
