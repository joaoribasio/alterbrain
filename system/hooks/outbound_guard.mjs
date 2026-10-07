#!/usr/bin/env node
// PreToolUse (mcp__.*): the draft-only guard (spec section 14, ADR 0008).
//
// 1. Works out whether an MCP tool call would send something outside the computer (an email,
//    a calendar invite, a post, a message, a web form) from the tool name, and which channel it
//    belongs to from the server name.
// 2. Reads config/autonomy.json:   draft -> deny   approve -> ask   auto -> allow only if built.
// 3. Creating or editing drafts is never blocked. Tools that only read are never blocked.
//
// 4. Shell commands that upload or publish (curl -d, gh issue create, mail, quarto publish ...) are treated as
//    "something outside your computer". Draft-only covers MCP tools and these shell patterns; it cannot see
//    what an arbitrary script does, so scripts stay behind the permission prompt.
//
// This hook fails CLOSED for MCP calls: a payload it cannot read, or an unreadable config, means deny.
// (A crash while reading a shell command fails open: the hook sees every shell command.)
import { existsSync, readFileSync } from 'node:fs';
import { allow, ask, commandSegments, deny, isMainModule, programName, readInput, runHook, splitWords, toolInfo } from '../lib/hookio.mjs';
import { rootPath } from '../lib/paths.mjs';

export { splitWords };

const DRAFT_REASON =
  'Sending is switched off (draft-only). Your draft is saved — review and send it yourself, or ask me to change your autonomy settings.';
const UNREADABLE_REASON =
  'Alterbrain could not read your autonomy settings (config/autonomy.json), so it blocked this action to be safe. Ask me to check that file.';
const MALFORMED_REASON = 'Alterbrain could not check this action, so it was blocked to be safe.';

const LEVELS = ['draft', 'approve', 'auto'];

/* ------------------------------ classification ------------------------------ */

function stem(w) {
  if (w === 'replies') return 'reply';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const READ_VERBS = new Set([
  'get', 'list', 'search', 'read', 'fetch', 'find', 'query', 'view', 'show', 'describe', 'count', 'lookup', 'check',
  'download', 'export', 'preview', 'summarize', 'summarise', 'browse', 'snapshot', 'screenshot', 'navigate', 'wait',
  'resize', 'inspect', 'analyze', 'analyse', 'extract', 'retrieve', 'load', 'open', 'scroll', 'hover', 'take', 'history',
]);
// Verbs that send or publish by themselves (spec 14), plus a few close relatives.
const STRONG_VERBS = new Set([
  'send', 'reply', 'forward', 'post', 'publish', 'submit', 'apply', 'connect', 'invite', 'comment', 'share', 'delete',
  'tweet', 'respond', 'rsvp', 'broadcast', 'dm',
  'accept', 'decline', 'upload', 'react', 'manage', 'edit', 'deliver', 'dispatch', 'transmit', 'mail', 'push', 'merge',
]);
// Verbs that only matter together with a noun such as "event" or "message" (create_event, update_event).
const WEAK_VERBS = new Set(['create', 'update', 'add', 'insert', 'new', 'write', 'compose', 'schedule', 'quick']);
const OUTBOUND_NOUNS = new Set([
  'event', 'message', 'post', 'tweet', 'comment', 'reply', 'invite', 'invitation', 'email', 'mail', 'dm',
  'issue', 'ticket', 'task', 'page', 'file', 'record', 'document', 'pull', 'pr', 'review', 'release', 'gist', 'repo', 'commit', 'branch',
]);
// A draft tool is harmless unless the verb actually sends it.
const DRAFT_SENDERS = new Set(['send', 'publish', 'submit', 'post', 'forward', 'reply', 'share']);
const APPLY_EXCLUDE = new Set(['label', 'tag', 'patch', 'diff', 'filter', 'change', 'theme', 'style', 'format', 'template']);
// On a server we cannot place in a channel, these verbs are too generic to treat as sending.
const GENERIC_ONLY_ON_KNOWN_CHANNEL = new Set(['delete', 'connect', 'apply', 'edit', 'upload', 'manage', 'react', 'accept', 'decline']);
// Verbs that only sort or look after things the user already has: never outbound.
const ORGANISE_VERBS = new Set([
  'label', 'unlabel', 'tag', 'untag', 'archive', 'unarchive', 'star', 'unstar', 'mark', 'pin', 'unpin', 'snooze', 'trash',
  'untrash', 'restore', 'refresh', 'sync', 'authenticate', 'auth', 'login', 'logout', 'status', 'ping',
]);
// One-word tool names that only list things ("labels", "freebusy", "profile").
const READ_NOUNS = new Set([
  'labels', 'label', 'profile', 'calendars', 'calendar', 'threads', 'thread', 'messages', 'drafts', 'events', 'contacts',
  'folders', 'mailboxes', 'freebusy', 'me', 'whoami', 'user', 'users', 'channels', 'tools', 'help',
]);
// Servers that only touch this computer, by exact id (the catalogue ids, with - and . written as _). A word
// inside a longer name proves nothing: "gmail_memory" is a mail server.
const LOCAL_SERVER_IDS = new Set([
  'mcpvault', 'mcpvault_readonly', 'obsidian', 'vault', 'filesystem', 'markitdown', 'context7', 'memory', 'time', 'everything',
  'qmd', 'anki', 'zotero', 'zotero_mcp', 'obsidian_local_rest', 'sequentialthinking',
]);
// ... also when a plugin or connector prefix is in front ("plugin_x_filesystem"), for the specific ids only.
const LOCAL_SERVER_SUFFIXES = ['mcpvault', 'mcpvault_readonly', 'markitdown', 'context7', 'obsidian_local_rest', 'zotero_mcp'];
// Channels where every tool that is not a read, a draft or housekeeping is gated.
const INVERTED_CHANNELS = new Set(['email', 'calendar', 'messaging', 'social', 'linkedin', 'jobs']);

/** True for a server we know stays on this computer. A mail, chat or browser word in the name wins. */
export function isLocalServer(server) {
  if (channelFor(server) !== 'other') return false;
  const id = String(server).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return LOCAL_SERVER_IDS.has(id) || LOCAL_SERVER_SUFFIXES.some((x) => id.endsWith(`_${x}`));
}

/** Which autonomy channel a server belongs to (spec 14). */
export function channelFor(server) {
  const lower = String(server).toLowerCase().replace(/[-.\s]+/g, '_');
  const words = new Set(splitWords(server));
  const hasText = (list) => list.some((k) => lower.includes(k));
  const hasWord = (list) => list.some((k) => words.has(k));
  if (hasText(['calendar', 'gcal']) || hasWord(['cal'])) return 'calendar';
  if (hasText(['linkedin'])) return 'linkedin';
  if (hasText(['mail', 'outlook', 'imap', 'smtp', 'google_workspace', 'workspace_mcp', 'ms_365', 'ms365', 'office365', 'microsoft_365'])) return 'email';
  if (hasText(['telegram', 'whatsapp', 'slack', 'discord', 'twilio', 'imessage', 'messenger']) || hasWord(['signal', 'teams', 'sms'])) return 'messaging';
  if (
    hasText(['instagram', 'facebook', 'twitter', 'tiktok', 'mastodon', 'bluesky', 'reddit', 'youtube', 'pinterest']) ||
    hasWord(['x', 'threads'])
  ) {
    return 'social';
  }
  if (hasText(['playwright', 'puppeteer', 'selenium']) || hasWord(['browser', 'chrome'])) return 'web-forms';
  if (hasText(['adzuna', 'indeed', 'greenhouse', 'glassdoor']) || hasWord(['job', 'jobs', 'lever', 'workday'])) return 'jobs';
  return 'other';
}

function classifyWords(rawWords, channel) {
  const words = rawWords.map(stem);
  const idx = words.findIndex((w) => READ_VERBS.has(w) || STRONG_VERBS.has(w) || WEAK_VERBS.has(w));
  if (idx === -1) {
    // No verb at all. A tool simply called "message" posts a message.
    return words.length === 1 && words[0] === 'message' ? { outbound: true, verb: 'message' } : { outbound: false };
  }
  const verb = words[idx];
  const rest = words.filter((_, i) => i !== idx);
  if (READ_VERBS.has(verb)) return { outbound: false };
  if (words.includes('draft') && !DRAFT_SENDERS.has(verb)) return { outbound: false };
  if (STRONG_VERBS.has(verb)) {
    if (verb === 'apply' && rest.some((w) => APPLY_EXCLUDE.has(w))) return { outbound: false };
    if (channel === 'other' && GENERIC_ONLY_ON_KNOWN_CHANNEL.has(verb)) return { outbound: false };
    return { outbound: true, verb };
  }
  return rest.some((w) => OUTBOUND_NOUNS.has(w)) ? { outbound: true, verb } : { outbound: false };
}

const SUBMIT_TEXT =
  /\b(submit|send|apply|post|publish|confirm|place order|buy|purchase|pay|checkout|check out|sign up|signup|register|subscribe|book|reserve|donate|connect|invite|share|reply|tweet|delete)\b/i;
const CLICK_ACTIONS = new Set(['left_click', 'right_click', 'double_click', 'triple_click', 'left_click_drag', 'click', 'double-click']);
const ENTER_KEY = /(^|\+|\s)(enter|return|numpadenter)\b/i;
const SCRIPT_TOOL_WORDS = new Set(['evaluate', 'eval', 'javascript', 'js', 'script', 'execute', 'exec', 'run']);

/**
 * Browser tools. A click on a submit-like element, or typing with submit:true, sends a form (a sure hit).
 * Things that may send but cannot be told apart are "uncertain": a click that carries only coordinates (the
 * Chrome "computer" tool), the Enter key, a file upload, and scripts run inside the page (evaluate, run_code,
 * javascript_tool). Returns { verb, uncertain? } or null.
 */
function browserAction(toolWords, toolInput) {
  const words = new Set(toolWords);
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const text = ['element', 'text', 'selector', 'description', 'name']
    .map((k) => (typeof input[k] === 'string' ? input[k] : ''))
    .join(' ')
    .trim();
  const action = typeof input.action === 'string' ? input.action.toLowerCase() : '';
  const targeted = input.coordinate != null || input.ref != null || input.x != null || input.y != null || input.start_coordinate != null;

  if (words.has('type') && input.submit === true) return { verb: 'submit' };
  if (words.has('click') || CLICK_ACTIONS.has(action)) {
    if (SUBMIT_TEXT.test(text)) return { verb: 'submit' };
    if (!text && targeted) return { verb: 'click', uncertain: true };
    return null;
  }
  if ((words.has('press') && words.has('key')) || action === 'key') {
    const key = String(input.key ?? input.text ?? '');
    return ENTER_KEY.test(key) ? { verb: 'submit', uncertain: true } : null;
  }
  if (words.has('upload')) return { verb: 'upload', uncertain: true };
  if (toolWords.some((w) => SCRIPT_TOOL_WORDS.has(w)) && (words.has('code') || words.has('javascript') || words.has('evaluate') || words.has('script') || words.has('js') || words.has('eval'))) {
    return { verb: 'script', uncertain: true };
  }
  return null;
}

/** Is a tool on a known channel something that only reads, drafts or sorts? */
function isReadOrHousekeeping(rawWords) {
  const words = rawWords.map(stem);
  if (words.length === 1 && READ_NOUNS.has(words[0])) return true;
  if (words.includes('draft') && !words.some((w) => DRAFT_SENDERS.has(w))) return true;
  if (words.some((w) => ORGANISE_VERBS.has(w))) return true; // apply_label, create_label, mark_read, trash_message
  const verb = words.find((w) => READ_VERBS.has(w) || STRONG_VERBS.has(w) || WEAK_VERBS.has(w));
  // "apply" only reaches this point when classifyWords found it harmless (apply_patch, apply_theme).
  return verb !== undefined && (READ_VERBS.has(verb) || verb === 'apply');
}

/**
 * Classify an MCP tool call. Returns { outbound, channel, verb, uncertain? }.
 * server and tool come from the name "mcp__<server>__<tool>".
 * On a server in a known channel (mail, calendar, chat, social, LinkedIn, jobs) the rule is turned round: a tool
 * that is not clearly a read, a draft or housekeeping is gated ("uncertain": the user is asked, never skipped).
 */
export function classify(server, tool, toolInput = {}) {
  if (isLocalServer(server)) return { outbound: false, channel: 'local' };
  const channel = channelFor(server);
  const toolWords = splitWords(tool);
  const general = classifyWords(toolWords, channel);
  if (general.outbound) return { ...general, channel };
  if (channel === 'web-forms') {
    const b = browserAction(toolWords, toolInput);
    if (b) return { outbound: true, channel, ...b };
    return { outbound: false, channel };
  }
  if (INVERTED_CHANNELS.has(channel) && !isReadOrHousekeeping(toolWords)) {
    return { outbound: true, channel, verb: 'unknown', uncertain: true };
  }
  return { outbound: false, channel };
}

/* ------------------------------ config ------------------------------ */

/** { ok, config }. A missing file means the default (draft). A broken file means not ok. */
function loadAutonomy() {
  const file = rootPath('config', 'autonomy.json');
  if (!existsSync(file)) return { ok: true, config: { default: 'draft', channels: {} } };
  try {
    const config = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (!config || typeof config !== 'object' || Array.isArray(config)) return { ok: false };
    return { ok: true, config };
  } catch {
    return { ok: false };
  }
}

/** 'draft' | 'approve' | 'auto', or null when the config says something invalid. */
function levelFor(config, channel) {
  const channels = config.channels && typeof config.channels === 'object' ? config.channels : {};
  const entry = channels[channel];
  const fromEntry = entry && typeof entry === 'object' ? entry.level : typeof entry === 'string' ? entry : undefined;
  const level = fromEntry ?? config.default ?? 'draft';
  return LEVELS.includes(level) ? level : null;
}

const DEFAULT_AUTO_BLUEPRINT = { email: 'gmail-send-approval' };

function autoBlueprint(config, channel) {
  const entry = config.channels && typeof config.channels === 'object' ? config.channels[channel] : null;
  const configured = entry && typeof entry === 'object' ? entry.auto_blueprint ?? entry.blueprint : null;
  return (typeof configured === 'string' && configured) || DEFAULT_AUTO_BLUEPRINT[channel] || `${channel}-auto`;
}

/** Every string (names and values) in state/built.json, lower-cased. */
function builtIds() {
  const ids = new Set();
  const file = rootPath('state', 'built.json');
  if (!existsSync(file)) return ids;
  try {
    const walk = (v, depth = 0) => {
      if (depth > 6 || v == null) return;
      if (typeof v === 'string') ids.add(v.toLowerCase());
      else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
      else if (typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          ids.add(k.toLowerCase());
          walk(x, depth + 1);
        }
      }
    };
    walk(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')));
  } catch {
    /* unreadable built.json: nothing counts as built */
  }
  return ids;
}

const CHANNEL_LABEL = {
  email: 'an email',
  calendar: 'a calendar change',
  linkedin: 'a LinkedIn action',
  social: 'a social media post',
  messaging: 'a message',
  'web-forms': 'a web form',
  jobs: 'a job application',
  other: 'something outside your computer',
};

/** Decide for one classified call. Exported for tests. Returns { decision, reason } or null. */
export function decide(channel, { uncertain = false } = {}) {
  const loaded = loadAutonomy();
  if (!loaded.ok) return { decision: 'deny', reason: UNREADABLE_REASON };
  const { config } = loaded;
  const level = levelFor(config, channel);
  if (!level) return { decision: 'deny', reason: UNREADABLE_REASON };
  const label = CHANNEL_LABEL[channel] || CHANNEL_LABEL.other;
  if (level === 'draft') {
    if (uncertain) {
      // Alterbrain cannot tell whether this sends anything: ask, rather than block ordinary browsing or housekeeping.
      return { decision: 'ask', reason: `Alterbrain cannot tell whether this action sends ${label} from your computer. Sending is switched off (draft-only), so check it and approve only if it does not send anything.` };
    }
    return { decision: 'deny', reason: DRAFT_REASON };
  }
  if (level === 'approve') {
    return { decision: 'ask', reason: `Alterbrain is about to send ${label} from your computer. Check the details and approve only if they look right.` };
  }
  // auto: only once its blueprint has been built, otherwise behave like approve.
  if (builtIds().has(autoBlueprint(config, channel).toLowerCase())) {
    return { decision: 'allow', reason: `Auto mode is on for ${channel}.` };
  }
  return {
    decision: 'ask',
    reason: `Auto mode for ${channel} is not set up yet, so Alterbrain is asking you first. Check ${label} and approve only if it looks right.`,
  };
}

/* ------------------------------ shell commands ------------------------------ */

const MAIL_PROGRAMS = new Set(['mail', 'mailx', 'sendmail', 'ssmtp', 'msmtp', 'mutt', 'swaks', 'send-mailmessage']);
const NETWORK_SENDERS = new Set(['scp', 'sftp', 'ftp', 'nc', 'ncat', 'netcat', 'socat']);
const WRITE_METHOD = /^(?:post|put|patch|delete)$/i;
const GH_WRITE = {
  issue: /^(?:create|comment|edit|close|reopen|delete|transfer|lock|pin)$/,
  pr: /^(?:create|comment|edit|close|reopen|merge|review|ready)$/,
  release: /^(?:create|upload|edit|delete)$/,
  gist: /^(?:create|edit|delete)$/,
  repo: /^(?:create|fork|edit|delete|rename|archive|sync)$/,
  workflow: /^(?:run|enable|disable)$/,
  secret: /^(?:set|delete)$/,
  variable: /^(?:set|delete)$/,
  label: /^(?:create|edit|delete)$/,
  project: /^(?:create|edit|delete|item-add|item-create)$/,
};

/**
 * Does one shell segment send data off this computer? Returns a short label or null. Best effort: it knows the
 * usual command-line uploaders and publishers, not what an arbitrary script does.
 */
function segmentOutbound(seg) {
  const prog = programName(seg[0]);
  const args = seg.slice(1);
  const lower = args.map((a) => a.toLowerCase());
  if (prog === 'curl') {
    if (args.some((a) => /^(?:-d|-F|-T|--data(?:-[a-z]+)*|--form(?:-string)?|--upload-file|--json)(?:=|$)/.test(a) || /^-[dFT]./.test(a))) return 'a web upload';
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '-X' || args[i] === '--request') && WRITE_METHOD.test(args[i + 1] || '')) return 'a web upload';
      if (/^--request=/.test(args[i]) && WRITE_METHOD.test(args[i].split('=')[1])) return 'a web upload';
      if (/^-X./.test(args[i]) && WRITE_METHOD.test(args[i].slice(2))) return 'a web upload';
    }
  }
  if (prog === 'wget' && args.some((a) => /^--(?:post-data|post-file|body-data|body-file)(?:=|$)/.test(a) || (/^--method=/.test(a) && WRITE_METHOD.test(a.split('=')[1])))) return 'a web upload';
  if (['http', 'https', 'xh'].includes(prog) && args.some((a) => WRITE_METHOD.test(a))) return 'a web upload';
  if (['invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm'].includes(prog)) {
    for (let i = 0; i < lower.length; i++) {
      if (/^-(?:method|m)$/.test(lower[i]) && WRITE_METHOD.test(args[i + 1] || '')) return 'a web upload';
      if (/^-method:/.test(lower[i]) && WRITE_METHOD.test(args[i].split(':')[1])) return 'a web upload';
      if (/^-(?:body|infile)(?::|$)/.test(lower[i])) return 'a web upload';
    }
  }
  if (prog === 'gh') {
    const [a, b] = args.filter((x) => !x.startsWith('-'));
    if (a && b && GH_WRITE[a] && GH_WRITE[a].test(b)) return 'a GitHub change';
    if (a === 'api') {
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === '-X' || args[i] === '--method') && WRITE_METHOD.test(args[i + 1] || '')) return 'a GitHub change';
        if (/^--method=/.test(args[i]) && WRITE_METHOD.test(args[i].split('=')[1])) return 'a GitHub change';
        if (/^(?:-f|-F|--field|--raw-field|--input)$/.test(args[i])) return 'a GitHub change';
      }
    }
  }
  if (MAIL_PROGRAMS.has(prog)) return 'an email';
  if (NETWORK_SENDERS.has(prog)) return 'a network transfer';
  // rsync to or from another computer: "user@host:path" or "host:path" (a drive letter such as C: is not a host).
  if (prog === 'rsync' && args.some((a) => !a.startsWith('-') && /^(?:[^\s/\\:]+@)?[A-Za-z0-9][A-Za-z0-9.-]+:/.test(a))) return 'a network transfer';
  if (prog === 'quarto' && lower[0] === 'publish') return 'a published page';
  if (['npm', 'pnpm', 'yarn'].includes(prog) && lower[0] === 'publish') return 'a published package';
  if (prog === 'twine' && lower[0] === 'upload') return 'a published package';
  return null;
}

/** Label of the first outbound thing in a shell command ("a web upload", "an email" ...), or null. */
export function shellOutbound(command, shell = 'bash') {
  for (const seg of commandSegments(command, shell)) {
    const label = segmentOutbound(seg);
    if (label) return label;
  }
  return null;
}

async function main() {
  const input = await readInput();
  if (!input) {
    deny(MALFORMED_REASON);
    return;
  }
  const info = toolInfo(input);
  if (!info.name) {
    deny(MALFORMED_REASON);
    return;
  }
  if (info.isShell) {
    try {
      if (!info.command || !shellOutbound(info.command, info.shell)) return;
    } catch {
      return; // the analysis broke: do not block every shell command
    }
    const { decision, reason } = decide('other');
    if (decision === 'deny') deny(reason);
    else if (decision === 'ask') ask(reason);
    else allow(reason);
    return;
  }
  if (!info.isMcp) return; // not an MCP tool: not our job
  if (!info.server || !info.tool) {
    deny(MALFORMED_REASON);
    return;
  }
  const cls = classify(info.server, info.tool, info.toolInput);
  if (!cls.outbound) return;
  const { decision, reason } = decide(cls.channel, { uncertain: Boolean(cls.uncertain) });
  if (decision === 'deny') deny(reason);
  else if (decision === 'ask') ask(reason);
  else allow(reason);
}

if (isMainModule(import.meta.url)) await runHook(main, { onError: () => deny(MALFORMED_REASON) });
