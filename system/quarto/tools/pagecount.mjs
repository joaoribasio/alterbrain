// Count the pages of a PDF with no extra software. Zero dependencies.
//
//   node system/quarto/tools/pagecount.mjs <file.pdf> [--max <pages>] [--json]
//
// Exit code: 0 = fine (or no limit given), 1 = more pages than the limit, 2 = usage problem or unreadable PDF.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isMainModule } from '../../lib/paths.mjs';

/** Return the text of the PDF dictionary that starts at the "<<" before `index` (nesting aware). */
function dictAround(text, index) {
  const open = text.lastIndexOf('<<', index);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < text.length - 1; i++) {
    if (text[i] === '<' && text[i + 1] === '<') { depth++; i++; }
    else if (text[i] === '>' && text[i + 1] === '>') {
      depth--; i++;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open, open + 600);
}

/** Collect text sources: the raw file, plus every zlib-compressed stream (object streams hide page trees there). */
function sources(buf) {
  const out = [buf.toString('latin1')];
  const raw = out[0];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const dictStart = raw.lastIndexOf('<<', m.index);
    const head = dictStart === -1 ? '' : raw.slice(dictStart, m.index);
    if (/FlateDecode/.test(head) && /\/ObjStm/.test(head)) {
      try {
        out.push(inflateSync(buf.subarray(start, end)).toString('latin1'));
      } catch { /* not readable: ignore this stream */ }
    }
    re.lastIndex = end;
  }
  return out;
}

/** Number of pages in a PDF held in a Buffer. Throws if it does not look like a PDF. */
export function countPagesInBuffer(buf) {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('This is not a PDF file.');
  let best = 0;
  let leaves = 0;
  for (const text of sources(buf)) {
    const treeRe = /\/Type\s*\/Pages\b/g;
    let m;
    while ((m = treeRe.exec(text))) {
      const dict = dictAround(text, m.index);
      const count = /\/Count\s+(\d+)/.exec(dict);
      if (count && !/\/Parent\b/.test(dict)) best = Math.max(best, Number(count[1]));
    }
    const leafRe = /\/Type\s*\/Page(?![A-Za-z])/g;
    leaves += (text.match(leafRe) || []).length;
  }
  if (best > 0) return best;
  if (leaves > 0) return leaves;
  throw new Error('Could not find any pages in this PDF.');
}

export function countPages(file) {
  return countPagesInBuffer(readFileSync(file));
}

/** Plain-English verdict for a page limit. */
export function checkLimit(pages, max) {
  if (max == null) return { ok: true, message: `${pages} page${pages === 1 ? '' : 's'}.` };
  if (pages <= max) {
    const spare = max - pages;
    return { ok: true, message: `${pages} of ${max} pages used${spare ? ` (${spare} spare)` : ''}.` };
  }
  const over = pages - max;
  return {
    ok: false,
    message: `Too long: ${pages} pages and the limit is ${max}. Cut about ${over} page${over === 1 ? '' : 's'}.`,
  };
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  let max = null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max') { max = Number(args[++i]); continue; }
    if (args[i] === '--json') continue;
    files.push(args[i]);
  }
  if (files.length !== 1 || (max !== null && !(max > 0))) {
    console.error('Usage: node system/quarto/tools/pagecount.mjs <file.pdf> [--max <pages>] [--json]');
    return 2;
  }
  try {
    const pages = countPages(resolve(files[0]));
    const verdict = checkLimit(pages, max);
    if (json) console.log(JSON.stringify({ file: files[0], pages, max, ok: verdict.ok, message: verdict.message }));
    else console.log(verdict.message);
    return verdict.ok ? 0 : 1;
  } catch (err) {
    if (json) console.log(JSON.stringify({ file: files[0], ok: false, message: err.message }));
    else console.error(`Could not count the pages: ${err.message}`);
    return 2;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv);
}
