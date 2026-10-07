// Minimal YAML frontmatter reader for the flat key/value frontmatter used by
// skills, agents, blueprints and notes. Supports: scalars, quoted strings,
// inline lists [a, b], and block lists (- item). Not a general YAML parser.

export function splitFrontmatter(text) {
  const t = text.replace(/^﻿/, '');
  if (!t.startsWith('---')) return { data: {}, body: t, raw: '' };
  const end = t.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: t, raw: '' };
  const raw = t.slice(t.indexOf('\n') + 1, end);
  const after = t.indexOf('\n', end + 4);
  const body = after === -1 ? '' : t.slice(after + 1);
  return { data: parseFlatYaml(raw.replace(/\r\n?/g, '\n')), body, raw };
}

function parseScalar(v) {
  const s = v.trim();
  if (s === '') return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((x) => parseScalar(x));
  }
  return s;
}

export function parseFlatYaml(raw) {
  const data = {};
  let listKey = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s+(.*)$/) || line.match(/^-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(parseScalar(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      const cleaned = value.replace(/\s+#.*$/, '');
      if (cleaned.trim() === '') {
        data[key] = [];
        listKey = key;
      } else {
        data[key] = parseScalar(cleaned);
        listKey = null;
      }
    }
  }
  return data;
}
