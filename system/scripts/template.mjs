#!/usr/bin/env node
// Templates for documents and decks: list, show, resolve, check and inspect. Zero dependencies (Node 20+).
//
//   node system/scripts/template.mjs list [--json]
//   node system/scripts/template.mjs show <slug> [--json]
//   node system/scripts/template.mjs resolve --kind <kind> [--for <source path>] [--json]
//   node system/scripts/template.mjs check <folder> [--json]
//   node system/scripts/template.mjs inspect <file.pptx|.potx|.docx|.dotx> [--json]
//
// Exit code: 0 = fine, 1 = problems found, 2 = usage problem.
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { isMainModule, projectRoot } from '../lib/paths.mjs';
import {
  KINDS, BUILTIN_DIR, checkTemplate, findTemplate, listTemplates, resolveTemplate, templateWarnings,
} from '../lib/templates.mjs';

// Layout names Quarto looks for in a PowerPoint reference-doc. "For each name, the first layout found with that name
// will be used"; a missing one is taken from the default document, with a warning.
// Source: https://quarto.org/docs/presentations/powerpoint.html (checked 2026-10-08).
// The Word reference-doc page (https://quarto.org/docs/output-formats/ms-word-templates.html) does not list style
// names, so none are hard-coded for .docx.
export const QUARTO_PPTX_LAYOUTS = [
  'Title Slide', 'Title and Content', 'Section Header', 'Two Content', 'Comparison', 'Content with Caption', 'Blank',
];

/** Which of the layouts Quarto needs are not in `layouts` (compared ignoring case and spacing). */
export function missingLayouts(layouts) {
  const have = new Set((layouts || []).map((l) => String(l).trim().toLowerCase()));
  return QUARTO_PPTX_LAYOUTS.filter((n) => !have.has(n.toLowerCase()));
}

async function loadOoxml() {
  try {
    return await import("../lib/ooxml.mjs");
  } catch (err) {
    throw new Error(`I cannot read Office files here yet (${err.message}).`);
  }
}

/** Colours, fonts and layouts of an Office file. */
export async function inspectFile(file) {
  const ext = extname(file).toLowerCase();
  if (!['.pptx', '.potx', '.docx', '.dotx'].includes(ext)) throw new Error('inspect reads .pptx, .potx, .docx and .dotx files.');
  if (!existsSync(file)) throw new Error(`The file ${file} does not exist.`);
  const o = await loadOoxml();
  const theme = o.theme(file);
  const isDeck = ext === '.pptx' || ext === '.potx';
  const layouts = isDeck ? o.slideLayouts(file) : [];
  const hex = (c) => (c ? `#${String(c).replace(/^#/, '').toUpperCase()}` : '');
  const colours = {};
  for (const [k, v] of Object.entries(theme.colours || {})) colours[k] = hex(v);
  return {
    file, kind: isDeck ? 'deck' : 'document', template_file: ext === '.potx' || ext === '.dotx',
    colours, fonts: theme.fonts || {}, layouts,
    missing_layouts: isDeck ? missingLayouts(layouts) : [],
    advice: ext === '.potx' || ext === '.dotx'
      ? `This is a template file. For Quarto, open it, save a copy as ${isDeck ? '.pptx' : '.docx'}, and use that copy as the reference document.`
      : '',
  };
}

function usage() {
  console.error([
    'Usage:',
    '  node system/scripts/template.mjs list [--json]',
    '  node system/scripts/template.mjs show <slug> [--json]',
    '  node system/scripts/template.mjs resolve --kind <kind> [--for <source path>] [--json]',
    '  node system/scripts/template.mjs check <folder> [--json]',
    '  node system/scripts/template.mjs inspect <file.pptx|.potx|.docx|.dotx> [--json]',
    `Kinds: ${KINDS.join(', ')}.`,
  ].join('\n'));
}

const emit = (json, value, human) => console.log(json ? JSON.stringify(value, null, 2) : human);

async function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const cmd = args[0];
  const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] ?? null; };
  const positional = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !['--kind', '--for'].includes(all[i - 1]));
  const root = projectRoot();
  if (!cmd || cmd === '--help' || cmd === '-h') { usage(); return 2; }

  if (cmd === 'list') {
    const rows = listTemplates(root).map((t) => ({
      slug: t.slug, name: t.name, kind: t.kind, source: t.source, location: t.builtin ? 'built-in' : t.rel,
    }));
    emit(json, rows, rows.length
      ? rows.map((r) => `${r.slug.padEnd(22)} ${r.kind.padEnd(10)} ${r.source.padEnd(9)} ${r.name}${r.location === 'built-in' ? '' : `  (${r.location})`}`).join('\n')
      : 'No templates found.');
    return 0;
  }

  if (cmd === 'show') {
    if (positional.length !== 1) { usage(); return 2; }
    const t = findTemplate(positional[0], root);
    if (!t) { console.error(`There is no template called "${positional[0]}". Run "list" to see them.`); return 1; }
    const problems = checkTemplate(t.dir, { builtin: t.builtin });
    const warnings = templateWarnings(t.dir);
    const value = { slug: t.slug, dir: t.dir, builtin: t.builtin, problems, warnings, ...t.data };
    const lines = Object.entries(t.data).map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length ? `\n  - ${v.join('\n  - ')}` : '[]') : v}`);
    emit(json, value, [`Template ${t.slug} (${t.builtin ? 'built-in' : t.rel})`, ...lines, ...problems.map((p) => `Problem: ${p}`)].join('\n'));
    return problems.length ? 1 : 0;
  }

  if (cmd === 'resolve') {
    const kind = flag('--kind');
    if (!kind) { usage(); return 2; }
    const r = resolveTemplate({ kind, source: flag('--for') || '', root });
    if (!r.ok) { console.error(r.warnings.join(' ')); return 2; }
    let human;
    if (r.tie) human = `Two templates fit equally well (${r.tie.join(', ')}) at the ${r.tie_level} level. Ask which one.`;
    else if (r.template) human = `Template: ${r.template.slug} (${r.template.level}, ${r.template.source}). Style: ${r.style}. Tone: ${r.tone} (${r.tone_source}).`;
    else human = `No template for a ${kind}. Tone: ${r.tone} (${r.tone_source}).`;
    emit(json, r, [human, ...r.warnings.map((w) => `Note: ${w}`)].join('\n'));
    return 0;
  }

  if (cmd === 'check') {
    if (positional.length !== 1) { usage(); return 2; }
    const dir = resolve(positional[0]);
    const builtin = dir.toLowerCase().startsWith(BUILTIN_DIR.toLowerCase());
    const problems = checkTemplate(dir, { builtin });
    emit(json, { folder: dir, ok: problems.length === 0, problems }, problems.length ? problems.map((p) => `Problem: ${p}`).join('\n') : 'The template is fine.');
    return problems.length ? 1 : 0;
  }

  if (cmd === 'inspect') {
    if (positional.length !== 1) { usage(); return 2; }
    try {
      const r = await inspectFile(resolve(positional[0]));
      const human = [
        `${r.file}`,
        'Colours:', ...Object.entries(r.colours).map(([k, v]) => `  ${k}: ${v}`),
        `Fonts: headings ${r.fonts.major || '?'}, body ${r.fonts.minor || '?'}`,
        ...(r.kind === 'deck' ? [`Slide layouts: ${r.layouts.join(', ') || 'none found'}`,
          r.missing_layouts.length ? `Quarto also looks for: ${r.missing_layouts.join(', ')}. Missing ones are taken from Quarto's default, so they will look different.` : 'All the layouts Quarto looks for are there.'] : []),
        ...(r.advice ? [r.advice] : []),
      ].join('\n');
      emit(json, r, human);
      return 0;
    } catch (err) {
      console.error(err.message);
      return 1;
    }
  }
  usage();
  return 2;
}

if (isMainModule(import.meta.url)) {
  main(process.argv).then((c) => { process.exitCode = c; });
}
