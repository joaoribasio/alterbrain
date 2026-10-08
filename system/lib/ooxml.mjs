// Read text out of Word, PowerPoint and Excel files (OOXML zips) with no dependencies.
// A .docx/.pptx/.xlsx is a zip of XML parts. bsdtar (the "tar" in Windows 10+ and macOS) opens zips, so we unpack
// single parts to memory with it. Nothing is written to disk. Same tool rule as ingest.mjs findZipTool (reimplemented
// here so a lib never imports a script). The XML is read with small regular expressions: enough for text, names and
// cell values, not a general XML parser.
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const MAX_PART_BYTES = 50 * 1024 * 1024; // size cap for one part read into memory

const NO_TOOL =
  'I cannot open Word, PowerPoint or Excel files here because this computer has no zip tool I can use (the "tar" that comes with Windows 10 and later, or macOS). Check the file in Word, PowerPoint or Excel yourself.';

let toolState; // undefined = not looked for yet

/** The bsdtar command for this computer, or null. Windows: System32\tar.exe by name (a PATH "tar" can be Git's GNU tar). */
export function zipTool() {
  if (process.env.ALTERBRAIN_NO_ZIP_TOOL === '1') return null;
  if (toolState !== undefined) return toolState;
  const candidates = [];
  if (process.platform === 'win32') candidates.push(join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'tar.exe'));
  if (process.platform === 'darwin') candidates.push('/usr/bin/tar');
  candidates.push('bsdtar', 'tar');
  toolState = null;
  for (const cmd of candidates) {
    const probe = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
    if (probe.status === 0 && !probe.error && /bsdtar|libarchive/i.test(probe.stdout || '')) {
      toolState = cmd;
      break;
    }
  }
  return toolState;
}

function needTool() {
  const cmd = zipTool();
  if (!cmd) throw new Error(NO_TOOL);
  return cmd;
}

/** Names of all parts in the zip. */
export function listParts(file) {
  const cmd = needTool();
  const r = spawnSync(cmd, ['-tf', resolve(file)], { encoding: 'utf8', timeout: 60_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || r.error) throw new Error(`I cannot open ${file}. It may be damaged, password protected or not an Office file.`);
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/** One part as UTF-8 text, or null when the file has no such part. Throws when the file cannot be read or the part is over 50 MB. */
export function readPart(file, partName) {
  const cmd = needTool();
  const r = spawnSync(cmd, ['-xOf', resolve(file), partName], { timeout: 60_000, windowsHide: true, maxBuffer: MAX_PART_BYTES });
  if (r.error && /ENOBUFS|maxBuffer/i.test(String(r.error.message))) throw new Error(`The part ${partName} in ${file} is larger than 50 MB, so I did not read it.`);
  if (r.status !== 0 || r.error) {
    if (/not found in archive/i.test(String(r.stderr || ''))) return null;
    throw new Error(`I cannot read ${partName} in ${file}. The file may be damaged or password protected.`);
  }
  return r.stdout.toString('utf8').replace(/^\uFEFF/, '');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode XML character references and the five named entities. */
export function decodeXml(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return ENTITIES[e];
  });
}

/** Text of the paragraphs in an XML part. `p` is the paragraph tag ('w:p' or 'a:p'), `t` the text-run tag. */
function paragraphs(xml, p, t) {
  const out = [];
  const para = new RegExp(`<${p}[ >/][\\s\\S]*?</${p}>`, 'g');
  const run = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>|<(w:tab|w:br|a:br)\\s*/?>`, 'g');
  for (const m of xml.matchAll(para)) {
    let line = '';
    for (const r of m[0].matchAll(run)) {
      if (r[1] !== undefined) line += decodeXml(r[1]);
      else line += r[2] === 'w:tab' ? '\t' : ' ';
    }
    out.push(line);
  }
  return out;
}

function sortedParts(parts, re) {
  return parts
    .filter((n) => re.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0));
}

/** All text in a .docx (body, headers, footers, footnotes), one paragraph per line. */
export function docxText(file) {
  const parts = listParts(file);
  const names = ['word/document.xml', ...sortedParts(parts, /^word\/(header|footer)\d*\.xml$/), ...parts.filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n))];
  const lines = [];
  for (const name of names) {
    const xml = parts.includes(name) ? readPart(file, name) : null;
    if (xml) lines.push(...paragraphs(xml, 'w:p', 'w:t'));
  }
  return lines.join('\n');
}

function relTargets(xml) {
  const out = [];
  for (const m of (xml || '').matchAll(/<Relationship\b[^>]*>/g)) {
    const type = m[0].match(/\bType="([^"]*)"/)?.[1] || '';
    const target = m[0].match(/\bTarget="([^"]*)"/)?.[1] || '';
    out.push({ type, target });
  }
  return out;
}

function shapeText(shapeXml) {
  return paragraphs(shapeXml, 'a:p', 'a:t').filter((l) => l.trim() !== '');
}

/**
 * Slides of a .pptx: [{ n, title, texts[], notes, hasChart, hasTable }].
 * n is the slide file number. title is the title placeholder text ('' when none). texts are the other text shapes
 * (one string per paragraph). notes is the speaker notes text ('' when none).
 */
export function pptxSlides(file) {
  const parts = listParts(file);
  const slides = sortedParts(parts, /^ppt\/slides\/slide\d+\.xml$/);
  const result = [];
  for (const name of slides) {
    const n = Number(name.match(/(\d+)\.xml$/)[1]);
    const xml = readPart(file, name) || '';
    const relsName = `ppt/slides/_rels/slide${n}.xml.rels`;
    const rels = parts.includes(relsName) ? relTargets(readPart(file, relsName)) : [];
    let title = '';
    const texts = [];
    for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
      const ph = sp[0].match(/<p:ph\b([^>]*)\/?>/);
      const phType = ph ? ph[1].match(/\btype="([^"]*)"/)?.[1] || 'body' : null;
      if (phType === 'sldNum' || phType === 'dt' || phType === 'ftr') continue;
      const lines = shapeText(sp[0]);
      if (phType === 'title' || phType === 'ctrTitle') title = title ? `${title} ${lines.join(' ')}` : lines.join(' ');
      else texts.push(...lines);
    }
    // Text inside tables counts as slide text too.
    for (const tbl of xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)) texts.push(...shapeText(tbl[0]));
    let notes = '';
    const noteRel = rels.find((r) => /notesSlide$/.test(r.type));
    if (noteRel) {
      const noteName = join('ppt', 'notesSlides', noteRel.target.split('/').pop()).replace(/\\/g, '/');
      const nxml = parts.includes(noteName) ? readPart(file, noteName) : null;
      if (nxml) {
        const lines = [];
        for (const sp of nxml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
          const ph = sp[0].match(/<p:ph\b([^>]*)\/?>/);
          const phType = ph ? ph[1].match(/\btype="([^"]*)"/)?.[1] || 'body' : null;
          if (phType === 'sldNum' || phType === 'sldImg' || phType === 'hdr' || phType === 'dt' || phType === 'ftr') continue;
          lines.push(...shapeText(sp[0]));
        }
        notes = lines.join('\n');
      }
    }
    const hasChart = rels.some((r) => /\/chart$/.test(r.type)) || /drawingml\/2006\/chart/.test(xml);
    const hasTable = /<a:tbl>/.test(xml);
    result.push({ n, title, texts, notes, hasChart, hasTable });
  }
  return result;
}

/**
 * Cells of an .xlsx: { sheets: [{ name, cells: [{ ref, formula, value, type }] }] }.
 * formula is the formula text without "=" (an empty string for a shared formula that refers to another cell), or null
 * when the cell holds no formula. value is the stored (cached) value as text, or null when there is none.
 * type is 'string' | 'number' | 'boolean' | 'error'.
 */
export function xlsxCells(file) {
  const parts = listParts(file);
  const wb = readPart(file, 'xl/workbook.xml');
  if (wb === null) throw new Error(`${file} does not look like an Excel workbook.`);
  const relsXml = readPart(file, 'xl/_rels/workbook.xml.rels') || '';
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]*)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]*)"/)?.[1];
    if (id && target) relMap[id] = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const shared = [];
  if (parts.includes('xl/sharedStrings.xml')) {
    const sx = readPart(file, 'xl/sharedStrings.xml') || '';
    for (const si of sx.matchAll(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g)) {
      let s = '';
      for (const t of si[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1]);
      shared.push(s);
    }
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(m[0].match(/\bname="([^"]*)"/)?.[1] || '');
    const rid = m[0].match(/\br:id="([^"]*)"/)?.[1];
    const partName = rid && relMap[rid] ? relMap[rid] : null;
    const xml = partName && parts.includes(partName) ? readPart(file, partName) || '' : '';
    const cells = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] || '';
      const ref = attrs.match(/\br="([^"]*)"/)?.[1] || '';
      const t = attrs.match(/\bt="([^"]*)"/)?.[1] || 'n';
      const f = inner.match(/<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/);
      const formula = f ? decodeXml(f[1] || '') : null;
      let value = null;
      let type = 'number';
      if (t === 'inlineStr') {
        const is = inner.match(/<is>([\s\S]*?)<\/is>/);
        if (is) {
          value = '';
          for (const x of is[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) value += decodeXml(x[1]);
        }
        type = 'string';
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        const raw = v ? decodeXml(v[1]) : null;
        if (t === 's') {
          value = raw === null ? null : shared[Number(raw)] ?? null;
          type = 'string';
        } else if (t === 'str') {
          value = raw;
          type = 'string';
        } else if (t === 'e') {
          value = raw;
          type = 'error';
        } else if (t === 'b') {
          value = raw;
          type = 'boolean';
        } else {
          value = raw;
          type = 'number';
        }
      }
      if (formula === null && value === null) continue; // an empty styled cell
      cells.push({ ref, formula, value, type });
    }
    sheets.push({ name, cells });
  }
  return { sheets };
}

const CLR_KEYS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

/** Theme colours and fonts: { colours: { dk1.. accent6 -> 'RRGGBB' }, fonts: { major, minor } }. Empty values when there is no theme. */
export function theme(file) {
  const parts = listParts(file);
  const name = parts.find((n) => /^(ppt|word|xl)\/theme\/theme1\.xml$/.test(n)) || parts.find((n) => /\/theme\/theme\d+\.xml$/.test(n));
  const out = { colours: {}, fonts: { major: '', minor: '' } };
  const xml = name ? readPart(file, name) : null;
  if (!xml) return out;
  const scheme = xml.match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)?.[0] || '';
  for (const key of CLR_KEYS) {
    const m = scheme.match(new RegExp(`<a:${key}>([\\s\\S]*?)</a:${key}>`));
    if (!m) continue;
    const val = m[1].match(/srgbClr\s+val="([0-9A-Fa-f]{6})"/)?.[1] || m[1].match(/lastClr="([0-9A-Fa-f]{6})"/)?.[1];
    if (val) out.colours[key] = val.toUpperCase();
  }
  out.fonts.major = xml.match(/<a:majorFont>\s*<a:latin\b[^>]*typeface="([^"]*)"/)?.[1] || '';
  out.fonts.minor = xml.match(/<a:minorFont>\s*<a:latin\b[^>]*typeface="([^"]*)"/)?.[1] || '';
  return out;
}

/** Names of the slide layouts in a .pptx/.potx, in file order. */
export function slideLayouts(file) {
  const parts = listParts(file);
  const names = [];
  for (const part of sortedParts(parts, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/)) {
    const xml = readPart(file, part) || '';
    names.push(decodeXml(xml.match(/<p:cSld\b[^>]*\bname="([^"]*)"/)?.[1] || ''));
  }
  return names;
}
