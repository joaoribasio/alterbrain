// Check that the fonts a brand file asks for are installed. Zero dependencies.
//
//   node system/quarto/tools/fonts.mjs [--brand <_brand.yml>] [--need "Font A,Font B"] [--list] [--json]
//
// With no options it reads vault/80_me/brand/_brand.yml (or the default brand) and lists what is missing.
// Exit code: 0 = all fonts found, 1 = something is missing, 2 = usage problem or Quarto not installed.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBrand, fontFolders, readTextSafe, runQuarto, repoRoot } from './lib.mjs';
import { isMainModule } from '../../lib/paths.mjs';

/** Families that Quarto and Typst always have, so a brand never has to install them. */
const BUNDLED = ['libertinus serif', 'new computer modern', 'dejavu sans mono', 'font awesome 6 free', 'font awesome 6 brands'];

/** All font families installed or bundled, lower-cased. Returns null when Quarto cannot be run. */
export function installedFonts(root = repoRoot()) {
  const res = runQuarto(['typst', 'fonts'], { timeout: 60_000, root });
  if (!res.ok) return null;
  // Typst prints the list on one of the two streams depending on the version, so read both.
  const names = [res.stdout, res.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('-'))
    .map((l) => l.toLowerCase());
  return new Set([...names, ...BUNDLED]);
}

/** Font families named in a brand file (typography.base, headings, monospace, fonts list) and in `mainfont:` lines. */
export function fontsInBrand(text) {
  const found = new Set();
  // Spaces and tabs only ([ \t]), never newlines: a value must be on the same line as its key.
  const re = /^[ \t]*(?:-[ \t]*)?(?:family|base|headings|monospace|monospace-inline|monospace-block|mainfont)[ \t]*:[ \t]*(.*)$/gim;
  let m;
  while ((m = re.exec(text))) {
    let v = m[1].replace(/\s+#.*$/, '').trim();
    v = v.replace(/^["']|["']$/g, '').trim();
    if (!v || /^[{[|>]/.test(v) || /^\d+(\.\d+)?(pt|px|em|rem)?$/.test(v)) continue;
    found.add(v);
  }
  return [...found];
}

export function checkFonts(families, installed) {
  const missing = [];
  const ok = [];
  for (const f of families) (installed.has(f.toLowerCase()) ? ok : missing).push(f);
  return { ok, missing };
}

export function adviceFor(missing) {
  if (!missing.length) return 'All the fonts are installed.';
  const list = missing.map((m) => `"${m}"`).join(', ');
  return (
    `Missing: ${list}. Until it is installed, documents use a plain substitute font and the page count may differ. ` +
    'To fix it: download the font file (.ttf or .otf), double-click it and choose Install. ' +
    'Or copy the file into system/quarto/fonts/ (or vault/80_me/brand/fonts/) and run this check again. ' +
    'If you do not want to install anything, change the font in your brand file to Arial.'
  );
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  let brand = null;
  let need = [];
  let list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--brand') brand = args[++i];
    else if (args[i] === '--need') need = String(args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (args[i] === '--list') list = true;
    else if (args[i] !== '--json') {
      console.error('Usage: node system/quarto/tools/fonts.mjs [--brand <_brand.yml>] [--need "Font A,Font B"] [--list] [--json]');
      return 2;
    }
  }
  const installed = installedFonts();
  if (!installed) {
    const msg = 'Could not list fonts: Quarto is not installed or did not run. Install Quarto from quarto.org.';
    console.error(json ? JSON.stringify({ ok: false, message: msg }) : msg);
    return 2;
  }
  if (list) {
    const names = [...installed].sort();
    console.log(json ? JSON.stringify({ fonts: names }) : names.join('\n'));
    return 0;
  }
  const brandFile = chooseBrand({ explicit: brand });
  const text = existsSync(brandFile) ? readTextSafe(brandFile) : '';
  const wanted = [...new Set([...need, ...fontsInBrand(text)])];
  const { ok, missing } = checkFonts(wanted, installed);
  const result = {
    ok: missing.length === 0,
    brand: brandFile,
    checked: wanted,
    found: ok,
    missing,
    extraFolders: fontFolders(),
    message: wanted.length ? adviceFor(missing) : 'The brand file does not ask for any special fonts.',
  };
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`Brand file: ${brandFile}`);
    if (wanted.length) console.log(`Fonts asked for: ${wanted.join(', ')}`);
    console.log(result.message);
  }
  return result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv);
}
