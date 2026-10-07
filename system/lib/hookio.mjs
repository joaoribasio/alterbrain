// Shared helpers for Claude Code hooks (spec section 14 and 17).
//
// What is in here:
//   - stdin / stdout plumbing (readInput, deny, ask, allow, context, runHook)
//   - reading the tool name, file paths, content and command from a PreToolUse payload
//   - a small shell tokenizer so hooks can look at git commands in bash AND PowerShell
//
// Zero dependencies. Never relies on the current directory: use projectRel() for paths.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isMainModule, projectRoot } from './paths.mjs';

/* ------------------------------------------------------------------ */
/* stdin and stdout                                                    */
/* ------------------------------------------------------------------ */

/** Read all of stdin as text. Resolves with '' on a terminal, on error, or after timeoutMs. */
export function readStdin(timeoutMs = 4000) {
  return new Promise((resolvePromise) => {
    if (process.stdin.isTTY) {
      resolvePromise('');
      return;
    }
    const chunks = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        process.stdin.destroy();
      } catch {
        /* nothing to clean up */
      }
      resolvePromise(Buffer.concat(chunks).toString('utf8'));
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.on('data', (c) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      // Do not wait for the pipe to close if the whole JSON object has already arrived.
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (text.endsWith('}')) {
        try {
          JSON.parse(text.replace(/^﻿/, ''));
          finish();
        } catch {
          /* still incomplete: keep reading */
        }
      }
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    process.stdin.on('close', finish);
  });
}

/** Parse the hook payload. Returns a plain object, or null when stdin is empty or malformed. */
export async function readInput(timeoutMs = 4000) {
  const text = (await readStdin(timeoutMs)).replace(/^﻿/, '').trim();
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Write one JSON object to stdout. Non-ASCII is escaped so the console code page cannot garble it. */
export function emit(obj) {
  const json = JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  process.stdout.write(json + '\n');
}

/** Emit a PreToolUse permission decision. */
export function preToolUse(decision, reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: String(reason || ''),
    },
  });
}

export const deny = (reason) => preToolUse('deny', reason);
export const ask = (reason) => preToolUse('ask', reason);
export const allow = (reason) => preToolUse('allow', reason);

/** Emit additional context for the model (SessionStart by default). */
export function context(text, eventName = 'SessionStart') {
  emit({ hookSpecificOutput: { hookEventName: eventName, additionalContext: String(text) } });
}

/**
 * Run a hook body. Never throws and always leaves exit code 0 (the decision is in the JSON).
 * Pass onError to turn a crash into a decision (outbound_guard fails closed that way).
 */
export async function runHook(main, { onError } = {}) {
  try {
    await main();
  } catch (err) {
    try {
      if (onError) onError(err);
    } catch {
      /* the hook itself must stay quiet */
    }
  }
  process.exitCode = 0;
}

// One helper for every hook and script (it compares real paths, so a symlink or junction is fine).
export { isMainModule };

/* ------------------------------------------------------------------ */
/* PreToolUse payloads                                                 */
/* ------------------------------------------------------------------ */

export const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/**
 * Pull the useful parts out of a PreToolUse payload.
 * Returns { name, toolInput, isEdit, isShell, isMcp, filePaths, contents, command, shell, server, tool }.
 */
export function toolInfo(input) {
  const name = input && typeof input.tool_name === 'string' ? input.tool_name : '';
  const toolInput = input && input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const isEdit = EDIT_TOOLS.has(name);
  const isShell = SHELL_TOOLS.has(name);
  const isMcp = name.startsWith('mcp__');

  const filePaths = [];
  if (isEdit) {
    // Write/Edit/MultiEdit use file_path. NotebookEdit uses notebook_path.
    for (const key of ['file_path', 'notebook_path']) {
      const v = toolInput[key];
      if (typeof v === 'string' && v.trim() && !filePaths.includes(v)) filePaths.push(v);
    }
  }

  // Text that would end up in the file.
  const contents = [];
  if (isEdit) {
    const push = (v) => {
      if (typeof v === 'string' && v) contents.push(v);
    };
    push(toolInput.content); // Write
    push(toolInput.new_string); // Edit
    push(toolInput.new_source); // NotebookEdit
    if (Array.isArray(toolInput.edits)) for (const e of toolInput.edits) push(e && e.new_string); // MultiEdit
  }

  const command = isShell && typeof toolInput.command === 'string' ? toolInput.command : '';
  const shell = name === 'PowerShell' ? 'powershell' : 'bash';

  let server = '';
  let tool = '';
  if (isMcp) {
    const m = /^mcp__(.+?)__(.+)$/.exec(name);
    if (m) {
      server = m[1];
      tool = m[2];
    }
  }
  return { name, toolInput, isEdit, isShell, isMcp, filePaths, contents, command, shell, server, tool };
}

/** realpath of the nearest existing ancestor (the native call also expands Windows 8.3 short names), plus the part that does not exist yet. */
function realpathNearest(abs) {
  let probe = abs;
  const tail = [];
  for (let i = 0; i < 64; i++) {
    if (existsSync(probe)) {
      try {
        return join(realpathSync.native(probe), ...tail.reverse());
      } catch {
        return abs;
      }
    }
    const up = dirname(probe);
    if (up === probe) return abs;
    tail.push(probe.slice(up.length).replace(/^[\\/]+/, ''));
    probe = up;
  }
  return abs;
}

/**
 * Collapse the spellings Windows maps onto the same file: the extended-path prefix (two backslashes and
 * a "?" or "."), "name." and "name " (the
 * Win32 layer drops trailing dots and spaces), and the NTFS stream suffix "name::$DATA" / "name:stream".
 * Pure string work, so it is testable on every platform. projectRel applies it on Windows only.
 */
export function winAliasNormalise(p) {
  let s = String(p);
  s = s.replace(/^[\\/]{2}[?.][\\/]/, '');
  if (/^UNC[\\/]/i.test(s)) s = '\\\\' + s.slice(4);
  let drive = '';
  const m = /^([A-Za-z]:)(.*)$/s.exec(s);
  if (m) {
    drive = m[1];
    s = m[2];
  }
  const lead = (/^[\\/]+/.exec(s) || [''])[0].replace(/\//g, '\\');
  const parts = s.slice(lead.length).split(/[\\/]+/);
  const out = [];
  for (let seg of parts) {
    if (seg === '.' || seg === '..') {
      out.push(seg);
      continue;
    }
    seg = seg.split(':')[0]; // stream suffix
    if (/^[. ]*$/.test(seg)) {
      const t = seg.replace(/ +$/, '');
      if (t === '.' || t === '..') out.push(t); // ".. " is ".."
      continue;
    }
    seg = seg.replace(/[. ]+$/, '');
    if (seg) out.push(seg);
  }
  return drive + lead + out.join('\\');
}

const outsideRel = (rel) => rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel);

function relInside(root, abs) {
  const rel = relative(root, abs);
  if (outsideRel(rel)) return null;
  return rel.split(sep).join('/').normalize('NFC');
}

/**
 * Every project-relative spelling of a path that could refer to the same file: the lexical one and the
 * real one (symlinks, junctions, 8.3 short names, macOS /var versus /private/var). Hooks must check all of
 * them. Forward slashes; empty when the path is not given or outside the project.
 */
export function projectRels(p) {
  if (typeof p !== 'string' || !p.trim()) return [];
  const root = projectRoot();
  const raw = process.platform === 'win32' ? winAliasNormalise(p) : p;
  const abs = resolve(root, raw);
  const out = [];
  const add = (rel) => {
    if (rel !== null && !out.includes(rel)) out.push(rel);
  };
  add(relInside(root, abs));
  try {
    add(relInside(realpathSync.native(root), realpathNearest(abs)));
  } catch {
    /* no real path: the lexical spelling stands */
  }
  return out;
}

/**
 * Project-relative path with forward slashes, or null when the path is outside the project.
 * Relative inputs are resolved against the project root, never the current directory.
 */
export function projectRel(p) {
  const rels = projectRels(p);
  return rels.length ? rels[0] : null;
}

/** "claude_ai_Gmail", "sendMessage", "send-message" -> ['claude','ai','gmail'] ... */
export function splitWords(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Shell command analysis (bash and PowerShell)                        */
/* ------------------------------------------------------------------ */

const SEPARATORS_COMMON = new Set([';', '|', '&', '\n', '\r', '(', ')', '{', '}']);

const ANSI_SIMPLE = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };

/** Decode one backslash escape of a $'...' string starting at text[i] === '\\'. Returns { text, next }. */
function decodeAnsiC(text, i) {
  const c = text[i + 1];
  if (c in ANSI_SIMPLE) return { text: ANSI_SIMPLE[c], next: i + 2 };
  let m;
  const rest = text.slice(i + 1, i + 12);
  if ((m = /^x([0-9a-fA-F]{1,2})/.exec(rest))) return { text: String.fromCharCode(parseInt(m[1], 16)), next: i + 1 + m[0].length };
  if ((m = /^([0-7]{1,3})/.exec(rest))) return { text: String.fromCharCode(parseInt(m[1], 8) & 255), next: i + 1 + m[0].length };
  if ((m = /^u([0-9a-fA-F]{1,4})/.exec(rest))) return { text: String.fromCodePoint(parseInt(m[1], 16)), next: i + 1 + m[0].length };
  if ((m = /^U([0-9a-fA-F]{1,8})/.exec(rest))) {
    const cp = parseInt(m[1], 16);
    return { text: cp <= 0x10ffff ? String.fromCodePoint(cp) : '', next: i + 1 + m[0].length };
  }
  return { text: '\\' + (c || ''), next: i + 2 };
}

/**
 * Split a command line into segments of tokens. Quotes are respected, so text inside a quoted
 * string (a commit message that mentions "git push --force") is NOT treated as a command.
 * Separators outside quotes: ; | & newline ( ) { } and, in bash, backticks.
 * shell: 'bash' (backslash escapes) or 'powershell' (backtick escapes, backslash is literal).
 */
export function tokenizeShell(command, shell = 'bash') {
  const ps = shell === 'powershell';
  const text = typeof command === 'string' ? command : '';
  const n = text.length;
  const segments = [];
  let seg = [];
  let cur = '';
  let has = false;
  let i = 0;

  const pushTok = () => {
    if (has) seg.push(cur);
    cur = '';
    has = false;
  };
  const pushSeg = () => {
    pushTok();
    if (seg.length) segments.push(seg);
    seg = [];
  };

  while (i < n) {
    const c = text[i];

    if (!ps && c === '$' && text[i + 1] === "'") {
      // ANSI-C quoting: $'-f' and $'\x2df' are the plain text -f.
      has = true;
      i += 2;
      while (i < n && text[i] !== "'") {
        if (text[i] === '\\' && i + 1 < n) {
          const dec = decodeAnsiC(text, i);
          cur += dec.text;
          i = dec.next;
          continue;
        }
        cur += text[i++];
      }
      i++;
      continue;
    }
    if (!ps && c === '$' && text[i + 1] === '"') {
      i++; // $"text" is "text" with translation: drop the dollar
      continue;
    }

    if (c === "'") {
      has = true;
      i++;
      while (i < n) {
        if (text[i] === "'") {
          if (ps && text[i + 1] === "'") {
            cur += "'";
            i += 2;
            continue;
          }
          break;
        }
        cur += text[i++];
      }
      i++;
      continue;
    }

    if (c === '"') {
      has = true;
      i++;
      while (i < n) {
        const d = text[i];
        if (d === '"') {
          if (ps && text[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          break;
        }
        if (ps && d === '`' && i + 1 < n) {
          cur += text[i + 1];
          i += 2;
          continue;
        }
        if (!ps && d === '\\' && i + 1 < n && '"\\$`'.includes(text[i + 1])) {
          cur += text[i + 1];
          i += 2;
          continue;
        }
        cur += d;
        i++;
      }
      i++;
      continue;
    }

    if (c === ' ' || c === '\t') {
      pushTok();
      i++;
      continue;
    }

    if (c === '#' && !has) {
      // Comment to the end of the line.
      while (i < n && text[i] !== '\n') i++;
      continue;
    }

    if (!ps && c === '\\') {
      if (text[i + 1] === '\n') {
        i += 2; // line continuation
        continue;
      }
      if (i + 1 < n) {
        cur += text[i + 1];
        has = true;
        i += 2;
        continue;
      }
    }
    if (ps && c === '`') {
      if (i + 1 < n && text[i + 1] !== '\n' && text[i + 1] !== '\r') {
        cur += text[i + 1];
        has = true;
        i += 2;
        continue;
      }
      i += 2; // backtick + newline = continuation
      continue;
    }

    if (SEPARATORS_COMMON.has(c) || (!ps && c === '`')) {
      pushSeg();
      i++;
      continue;
    }

    cur += c;
    has = true;
    i++;
  }
  pushSeg();
  return segments;
}

/** Lower-cased program name without folder or .exe/.cmd/.bat/.ps1 suffix. */
export function programName(token) {
  if (typeof token !== 'string') return '';
  const base = token.split(/[\\/]/).pop() || '';
  return base.toLowerCase().replace(/\.(exe|cmd|bat|ps1|com)$/, '');
}

const KEYWORD_PREFIXES = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', 'time', 'call', 'exec', 'command', 'builtin', 'nohup', 'setsid', 'unbuffer', 'chronic', 'caffeinate']);
// Wrappers that take options, some with a value (sudo -u root, nice -n 10, timeout 10 ...) and
// then the real command. short: letters whose option takes a value. long: long names that do.
// pos: how many plain arguments come before the real command (timeout DURATION cmd).
const WRAPPERS = {
  sudo: { short: 'ughpCDRTU', long: ['user', 'group', 'host', 'prompt', 'chdir', 'chroot', 'role', 'type', 'close-from', 'other-user'], pos: 0 },
  doas: { short: 'uC', long: [], pos: 0 },
  env: { short: 'uCSP', long: ['unset', 'chdir', 'split-string', 'default-signal', 'ignore-signal', 'block-signal'], pos: 0 },
  nice: { short: 'n', long: ['adjustment'], pos: 0 },
  ionice: { short: 'cnpP', long: ['class', 'classdata', 'pid'], pos: 0 },
  timeout: { short: 'sk', long: ['signal', 'kill-after'], pos: 1 },
  xargs: { short: 'nIPLdsEalR', long: ['max-args', 'max-procs', 'max-lines', 'delimiter', 'replace', 'arg-file', 'eof'], pos: 0 },
  stdbuf: { short: 'ioe', long: ['input', 'output', 'error'], pos: 0 },
  flock: { short: 'wEn', long: ['timeout', 'conflict-exit-code'], pos: 1 },
  runas: { short: '', long: [], pos: 0 },
};
const SHELL_PROGRAMS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'ash']);
const POWERSHELL_PROGRAMS = new Set(['pwsh', 'powershell']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Drop leading env assignments and wrapper words so segment[0] is the real program. */
function stripPrefixes(seg) {
  const out = seg.slice();
  for (let guard = 0; guard < 20 && out.length; guard++) {
    const first = out[0];
    const prog = programName(first);
    if (ASSIGNMENT.test(first) || /^\$env:[A-Za-z_][A-Za-z0-9_]*=/i.test(first)) {
      out.shift();
    } else if (KEYWORD_PREFIXES.has(prog)) {
      out.shift();
    } else if (Object.prototype.hasOwnProperty.call(WRAPPERS, prog)) {
      const spec = WRAPPERS[prog];
      out.shift();
      while (out.length && out[0].startsWith('-') && out[0] !== '-') {
        const t = out.shift();
        if (t === '--') break;
        if (t.startsWith('--')) {
          if (!t.includes('=') && spec.long.includes(t.slice(2))) out.shift();
        } else if (/^-[A-Za-z]$/.test(t) && spec.short.includes(t[1])) {
          out.shift();
        }
      }
      while (out.length && ASSIGNMENT.test(out[0])) out.shift();
      for (let k = 0; k < spec.pos && out.length && !out[0].startsWith('-'); k++) out.shift();
    } else {
      break;
    }
  }
  return out;
}

/** The pseudo program that stands for "a command this analysis cannot read" (a variable, a built string). */
export const UNRESOLVED = '__unresolved__';

/** Commands inside a wrapper (bash -c "...", powershell -Command "...", cmd /c ..., eval ...). */
function unwrap(seg, depth) {
  const prog = programName(seg[0]);
  const rest = seg.slice(1);
  const out = [];
  if (SHELL_PROGRAMS.has(prog)) {
    const idx = rest.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    if (idx !== -1 && rest[idx + 1] !== undefined) out.push(...commandSegments(rest[idx + 1], 'bash', depth + 1));
  } else if (POWERSHELL_PROGRAMS.has(prog)) {
    const idx = rest.findIndex((a) => /^-(c|command|commandwithargs)$/i.test(a));
    if (idx !== -1 && rest[idx + 1] !== undefined) out.push(...commandSegments(rest.slice(idx + 1).join(' '), 'powershell', depth + 1));
    const enc = rest.findIndex((a) => /^-(e|ec|enc|encodedcommand)$/i.test(a));
    if (enc !== -1 && rest[enc + 1] !== undefined) {
      try {
        const decoded = Buffer.from(rest[enc + 1], 'base64').toString('utf16le');
        out.push(...commandSegments(decoded, 'powershell', depth + 1));
      } catch {
        /* not valid base64: ignore */
      }
    }
  } else if (prog === 'cmd') {
    const idx = rest.findIndex((a) => /^\/[ckr]$/i.test(a));
    if (idx !== -1) out.push(...commandSegments(rest.slice(idx + 1).join(' '), 'powershell', depth + 1));
  } else if (prog === 'eval') {
    const code = rest.join(' ');
    if (/^"?\$\{?[A-Za-z_]\w*\}?"?$/.test(code.trim())) out.push([UNRESOLVED, 'eval']); // eval "$cmd": what runs is unknown
    else out.push(...commandSegments(code, 'bash', depth + 1));
  } else if (prog === 'invoke-expression' || prog === 'iex') {
    const code = rest.join(' ');
    if (/[$+(]|["']\s*-f\s|\s-join\s/i.test(code)) out.push([UNRESOLVED, 'iex']); // a built or variable string: unknown
    else out.push(...commandSegments(code, 'powershell', depth + 1));
  } else if (prog === 'wsl') {
    const idx = rest.findIndex((a) => programName(a) === 'git');
    if (idx !== -1) out.push(rest.slice(idx));
  } else if (prog === 'start' || prog === 'start-process' || prog === 'saps') {
    // Start-Process git -ArgumentList "push -f" or -ArgumentList "push","-f": the arguments arrive as one token.
    const idx = rest.findIndex((a) => programName(a) === 'git');
    if (idx !== -1) {
      const args = rest
        .slice(idx + 1)
        .filter((a) => !/^-(argumentlist|wait|nonewwindow|passthru|windowstyle|workingdirectory)$/i.test(a))
        .flatMap((a) => a.split(/[\s,]+/).filter(Boolean));
      out.push([rest[idx], ...args]);
    }
  }
  return out;
}

const SHELL_READERS = /\b(?:ba|z|da|k|a)?sh\b|\bpwsh\b|\bpowershell\b|\beval\b|\bsource\b|\biex\b|\binvoke-expression\b/i;
// "... | bash", "... | sudo sh", "... | pwsh", "... | iex": text on the left is executed as commands.
const PIPED_SHELL =
  /\|&?\s*(?:(?:sudo|env|nohup|exec|command)\s+(?:-\S+\s+)*)*(?:[^\s|;&]*[\\/])?(?:(?:ba|z|da|k|a|c|tc)?sh|fish|pwsh|powershell|iex|invoke-expression)(?:\.exe)?(?=\s|$|[;&|)])/i;

/**
 * Remove heredoc bodies (bash) and here-strings (PowerShell): they are text, like the body of a
 * commit message, not commands. A heredoc fed to a shell (bash <<EOF, cat <<EOF | bash) is kept, because it runs.
 */
export function stripHeredocs(text) {
  const heredoc = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\r?\n|$|\))/g;
  let out = text.replace(heredoc, (m, _quote, _word, offset, whole) => {
    const lineStart = whole.lastIndexOf('\n', offset - 1) + 1;
    const beforeMarker = whole.slice(lineStart, offset); // e.g. "bash " in "bash <<'EOF'"
    const firstLine = m.slice(0, m.indexOf('\n')); // includes what follows the marker, e.g. "<<EOF | bash"
    return SHELL_READERS.test(beforeMarker) || PIPED_SHELL.test(firstLine) ? m : firstLine;
  });
  out = out.replace(/@(['"])[ \t]*\r?\n[\s\S]*?\r?\n\1@/g, '@$1$1@');
  return out;
}

/**
 * Every command in a command line, flattened: pipelines, chains, sub-shells, $(...), backticks and
 * wrappers such as bash -c / powershell -Command are all expanded. Each segment starts with the
 * real program (env assignments and sudo/env/time are stripped). Depth is capped.
 * Text piped into a shell ("echo 'git push -f' | sh") is analysed as commands too. A command that
 * cannot be read (iex of a built string, eval "$var") yields the segment [UNRESOLVED, name].
 */
export function commandSegments(rawCommand, shell = 'bash', depth = 0) {
  const out = [];
  if (typeof rawCommand !== 'string' || !rawCommand.trim() || depth > 3) return out;
  const command = stripHeredocs(rawCommand);
  // $( ... ) can hide inside double quotes, where the tokenizer leaves it alone.
  for (const m of command.matchAll(/\$\(([^()]*)\)/g)) out.push(...commandSegments(m[1], shell, depth + 1));
  if (shell === 'bash') for (const m of command.matchAll(/`([^`]*)`/g)) out.push(...commandSegments(m[1], shell, depth + 1));
  const piped = PIPED_SHELL.test(command);
  for (const raw of tokenizeShell(command, shell)) {
    const seg = stripPrefixes(raw);
    if (!seg.length) continue;
    out.push(seg);
    out.push(...unwrap(seg, depth));
    if (piped && raw.length > 1) {
      const args = raw.slice(1);
      out.push(...commandSegments(args.join(' '), shell, depth + 1));
      for (const a of args) if (/\s/.test(a)) out.push(...commandSegments(a, shell, depth + 1));
    }
  }
  // iex ("git" + " push -f"), Invoke-Expression $cmd: the parenthesis or variable hides what is run.
  if (shell === 'powershell' && /(?:^|[\s;|&(])(?:iex|invoke-expression)\s*[($]/i.test(command)) out.push([UNRESOLVED, 'iex']);
  return out;
}

const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);

/** True if a segment runs git. */
export function isGit(seg) {
  return Array.isArray(seg) && seg.length > 0 && programName(seg[0]) === 'git';
}

/** Split a git segment into { sub, args }: global options such as -C <dir> or -c k=v are skipped. */
export function parseGit(seg) {
  const args = seg.slice(1);
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    i += GIT_VALUE_OPTIONS.has(args[i]) ? 2 : 1;
  }
  return { sub: (args[i] || '').toLowerCase(), args: args.slice(i + 1) };
}

/** The global options in front of the git subcommand, as { configs: ['key=value'], flags: ['--exec-path', ...] }. */
export function gitGlobalOptions(seg) {
  const args = seg.slice(1);
  const configs = [];
  const flags = [];
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    if ((a === '-c' || a === '--config-env') && args[i + 1] !== undefined) {
      configs.push(args[i + 1]);
      i += 2;
      continue;
    }
    if (a.startsWith('-c') && a.length > 2 && !a.startsWith('--')) configs.push(a.slice(2));
    flags.push(a);
    i += GIT_VALUE_OPTIONS.has(a) ? 2 : 1;
  }
  return { configs, flags };
}
