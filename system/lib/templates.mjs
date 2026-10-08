// Templates: read, check, list and resolve document templates. Zero dependencies (Node 20+).
//
// A template is a folder with a flat template.yml (parsed with parseFlatYaml). Built-in templates live in
// system/quarto/templates/<name>/. The user's own live in vault/80_me/templates/<slug>/ (user data).
//
// Resolution, most specific first:
//   deliverable (its front matter) > project/assignment > course > programme > config default > built-in.
// Two candidates of the requested kind at the same level are a tie: the caller asks. Tone, citation style and the
// upload limit are resolved in the same walk. Anything missing falls back quietly (no templates folder, no
// templates key, notes without the new keys): see SPEC 15a.5.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlatYaml, splitFrontmatter } from './frontmatter.mjs';
import { readJson } from './fsx.mjs';
import { projectRoot } from './paths.mjs';

export const KINDS = ['deck', 'report', 'memo', 'letter', 'cv', 'essay', 'workbook', 'one-pager'];
export const STYLES = ['reading-deck', 'presenting-deck', 'report', 'memo'];
export const BASES = ['cv', 'cv-ats', 'letter', 'report', 'deck', 'none'];
export const SOURCES = ['built-in', 'school', 'employer', 'provider', 'custom'];
export const OUTPUTS = ['pdf', 'docx', 'pptx', 'html', 'xlsx'];
export const TONES = ['academic', 'professional', 'conversational'];
/** Which built-in template a kind falls back to (workbook has none). */
export const KIND_TO_BUILTIN = {
  report: 'report', memo: 'report', essay: 'report', 'one-pager': 'report', deck: 'deck', letter: 'letter', cv: 'cv', workbook: null,
};
/** A template of these kinds also serves the listed kinds (a "report" template covers memos, essays and one-pagers). */
export const KIND_FAMILY = { memo: ['report'], essay: ['report'], 'one-pager': ['report'] };
const DEFAULT_STYLE = { deck: 'presenting-deck', memo: 'memo', 'one-pager': 'memo' };
/** Reference documents Quarto can use, by kind. The .potx/.dotx forms are template files and must be saved as .pptx/.docx. */
const REFERENCE_EXT = { deck: '.pptx', report: '.docx', memo: '.docx', essay: '.docx', letter: '.docx', 'one-pager': '.docx' };

export const BUILTIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'quarto', 'templates');
export function userTemplatesDir(root = projectRoot()) {
  return join(root, 'vault', '80_me', 'templates');
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const asList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : typeof v === 'string' && v.trim() ? [v.trim()] : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readText(file) {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
}
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function dirNames(dir) {
  try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; }
}

// ---------------------------------------------------------------- reading and checking

/** Read <folder>/template.yml. Returns { data, errors }. Never throws. */
export function readTemplate(folder) {
  const file = join(folder, 'template.yml');
  const text = readText(file);
  if (text === null) return { data: null, errors: [`There is no template.yml in ${folder}.`] };
  return { data: parseFlatYaml(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')), errors: [] };
}

/** Plain-sentence problems with a template folder (empty list = fine). */
export function checkTemplate(folder, { builtin = false } = {}) {
  const { data, errors } = readTemplate(folder);
  if (!data) return errors;
  const out = [];
  const slugOf = basename(resolve(folder));
  const bad = (field, value, allowed) => out.push(`"${field}" is "${value}", which is not one of: ${allowed.join(', ')}.`);
  if (data.schema !== 1) out.push('"schema" must be 1.');
  if (!str(data.name)) out.push('"name" is empty. Give the template a short name.');
  const slug = str(data.slug);
  if (!/^[a-z0-9-]+$/.test(slug)) out.push(`"slug" must use only lower-case letters, digits and hyphens (it is "${slug}").`);
  else if (slug !== slugOf) out.push(`"slug" is "${slug}" but the folder is called "${slugOf}". They must match.`);
  if (!KINDS.includes(str(data.kind))) bad('kind', str(data.kind), KINDS);
  if (data.style !== undefined && data.style !== '' && !STYLES.includes(str(data.style))) bad('style', str(data.style), STYLES);
  if (data.base !== undefined && data.base !== '' && !BASES.includes(str(data.base))) bad('base', str(data.base), BASES);
  if (!SOURCES.includes(str(data.source))) bad('source', str(data.source), SOURCES);
  if (builtin && str(data.source) && str(data.source) !== 'built-in') out.push('A built-in template must have source "built-in".');
  for (const o of asList(data.outputs)) if (!OUTPUTS.includes(o)) bad('outputs', o, OUTPUTS);
  for (const key of ['max_upload_mb', 'page_limit', 'font_size_pt']) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '' && !(typeof data[key] === 'number' && data[key] > 0)) {
      out.push(`"${key}" must be a number above 0, or null.`);
    }
  }
  for (const key of ['fonts', 'house_rules', 'structure', 'outputs']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) out.push(`"${key}" must be a list.`);
  }
  const brand = str(data.brand);
  if (brand && !existsSync(join(folder, brand))) out.push(`The brand file "${brand}" is not in the template folder.`);
  const ref = str(data.reference_doc);
  if (ref) {
    const ext = extname(ref).toLowerCase();
    if (ext === '.potx' || ext === '.dotx') {
      const want = ext === '.potx' ? '.pptx' : '.docx';
      out.push(`"${ref}" is a template file (${ext}). Open it, save a copy as ${want}, put that in the folder and name it as reference_doc.`);
    } else if (!existsSync(join(folder, ref))) {
      out.push(`The reference document "${ref}" is not in the template folder.`);
    } else {
      const want = REFERENCE_EXT[str(data.kind)];
      if (want && ext !== want) out.push(`A ${str(data.kind)} needs a ${want} reference document, but "${ref}" is a ${ext || 'file with no extension'}.`);
    }
  }
  const csl = str(data.csl);
  if (csl && csl !== 'apa' && !existsSync(join(folder, csl))) out.push(`The citation style file "${csl}" is not in the template folder (or use "apa").`);
  const ext = str(data.quarto_extension);
  if (ext && !isDir(join(folder, '_extensions', ext))) out.push(`The Quarto extension "${ext}" is not in the template folder under _extensions/.`);
  return out;
}

/**
 * Things that will not stop a render but mean the template does not do what its author expects (empty list = fine).
 * A reference document is only used for Word or PowerPoint output, and a Quarto extension only when "format" names
 * the format it contributes, so neither works with an empty or different "format".
 */
export function templateWarnings(folder) {
  const { data } = readTemplate(folder);
  if (!data) return [];
  const out = [];
  const format = str(data.format);
  const outputs = asList(data.outputs);
  const ref = str(data.reference_doc);
  const refExt = extname(ref).toLowerCase();
  const want = refExt === '.pptx' ? 'pptx' : refExt === '.docx' ? 'docx' : '';
  // A reference document is the point of the template when "format" is its format; it is an extra copy on request
  // (--format) when "outputs" lists it. With neither, nothing ever uses it.
  if (want && format !== want && !outputs.includes(want)) {
    out.push(format
      ? `The reference document "${ref}" is only used for ${want} output, but "format" is "${format}" and "outputs" does not list ${want}. Set "format" to "${want}", or add ${want} to "outputs".`
      : `The reference document "${ref}" is only used for ${want} output, and "format" is empty, so documents will not use it. Set "format" to "${want}" (or add ${want} to "outputs" if it is only for a ${want} copy on request).`);
  }
  if (want && format === want && outputs.length && !outputs.includes(want)) out.push(`"outputs" does not list ${want}, but "format" is "${want}".`);
  const ext = str(data.quarto_extension);
  if (ext && !format) out.push(`The Quarto extension "${ext}" is only used when "format" names the format it adds (see _extensions/${ext}/_extension.yml, for example "${ext}-pdf"). "format" is empty.`);
  return out;
}

// ---------------------------------------------------------------- listing

function describe(dir, source, root) {
  const { data } = readTemplate(dir);
  if (!data) return null;
  return {
    slug: basename(dir),
    dir,
    rel: relative(root, dir).split(sep).join('/'),
    builtin: source === 'built-in',
    name: str(data.name) || basename(dir),
    kind: str(data.kind),
    source: str(data.source) || (source === 'built-in' ? 'built-in' : 'custom'),
    data,
  };
}

/** User templates (vault/80_me/templates/*). A missing folder means none. */
export function listUserTemplates(root = projectRoot()) {
  const base = userTemplatesDir(root);
  return dirNames(base).map((n) => describe(join(base, n), 'user', root)).filter(Boolean);
}
export function listBuiltinTemplates(root = projectRoot()) {
  return dirNames(BUILTIN_DIR).map((n) => describe(join(BUILTIN_DIR, n), 'built-in', root)).filter(Boolean);
}
export function listTemplates(root = projectRoot()) {
  return [...listUserTemplates(root), ...listBuiltinTemplates(root)];
}
/** One template by slug: the user's own first, then the built-in. */
export function findTemplate(slug, root = projectRoot()) {
  const s = str(slug).replace(/^\[\[|\]\]$/g, '');
  return listTemplates(root).find((t) => t.slug === s) || null;
}

// ---------------------------------------------------------------- notes in the vault

function frontOf(file) {
  const text = file ? readText(file) : null;
  return text === null ? {} : splitFrontmatter(text).data;
}
/**
 * What a link names. Accepts [[Strategy]], [[20_areas/courses/strategy/course]], [[20_areas/programmes/MBA]] and plain text:
 * any folder path is dropped, a trailing ".md" is dropped, and for ".../<folder>/course" the folder name is used.
 */
function linkTarget(v) {
  const s = str(v);
  const m = s.match(/^\[\[([^\]|#]+)/);
  const parts = (m ? m[1] : s).trim().replaceAll('\\', '/').split('/').map((x) => x.trim()).filter(Boolean);
  let last = (parts.pop() || '').replace(/\.md$/i, '');
  if (squash(last) === 'course' && parts.length) last = parts.pop();
  return last;
}
const squash = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/** The course note a link points to: by folder name or by the note's heading. */
export function findCourse(link, root = projectRoot()) {
  const want = squash(linkTarget(link));
  if (!want) return null;
  const base = join(root, 'vault', '20_areas', 'courses');
  for (const name of dirNames(base)) {
    const file = join(base, name, 'course.md');
    const text = readText(file);
    if (text === null) continue;
    const heading = (splitFrontmatter(text).body.match(/^#\s+(.+)$/m) || [])[1] || '';
    if (squash(name) === want || squash(heading) === want) return { file, data: splitFrontmatter(text).data };
  }
  return null;
}
export function findProgramme(link, root = projectRoot()) {
  const want = squash(linkTarget(link));
  if (!want) return null;
  const base = join(root, 'vault', '20_areas', 'programmes');
  let files = [];
  try { files = readdirSync(base).filter((f) => f.toLowerCase().endsWith('.md')); } catch { return null; }
  const hit = files.find((f) => squash(f.slice(0, -3)) === want);
  if (!hit) return null;
  const file = join(base, hit);
  return { file, data: frontOf(file) };
}
/** The assignment.md or project.md files in the vault/10_projects folder a source sits in. */
function projectNotes(sourceAbs, root) {
  const base = join(root, 'vault', '10_projects') + sep;
  if (!sourceAbs || !sourceAbs.toLowerCase().startsWith(base.toLowerCase())) return [];
  const folder = sourceAbs.slice(base.length).split(sep)[0];
  if (!folder) return [];
  return ['assignment.md', 'project.md']
    .map((n) => join(base, folder, n))
    .filter((f) => existsSync(f) && resolve(f).toLowerCase() !== resolve(sourceAbs).toLowerCase())
    .map((file) => ({ file, data: frontOf(file) }));
}

// ---------------------------------------------------------------- tone

/** Recommended tone when nothing sets one. */
export function defaultTone({ learnerKind = null, kind = '' } = {}) {
  if (kind === 'cv' || kind === 'letter') return 'professional';
  if (learnerKind === 'degree' || learnerKind === 'online' || learnerKind === 'other') return 'academic';
  return 'professional'; // mba, professional, or no context
}

/** The learner kind from config/brain.json, with the same fallback as onboarding (old installs are mba). */
export function learnerKindOf(brain) {
  if (!isObject(brain)) return null;
  const raw = isObject(brain.learner) ? str(brain.learner.kind).toLowerCase() : '';
  if (['mba', 'degree', 'online', 'professional', 'other'].includes(raw)) return raw;
  const packs = Array.isArray(brain.packs) ? brain.packs : [];
  if (packs.includes('mba') || Object.prototype.hasOwnProperty.call(brain, 'school')) return 'mba';
  return null;
}

// ---------------------------------------------------------------- resolving

/**
 * Resolve the template for a deliverable.
 *   resolveTemplate({ kind, source, root })
 * Returns { ok, kind, template: { slug, dir, level, source } | null, tie: [slugs] | null, base, format, style, brand,
 * reference_doc, quarto_extension, csl, max_upload_mb, page_limit, fonts, house_rules, structure, tone, tone_source, warnings }.
 */
export function resolveTemplate({ kind, source = '', root = projectRoot() } = {}) {
  const warnings = [];
  const out = {
    ok: true, kind, template: null, tie: null, base: 'none', format: '', style: '', brand: '', reference_doc: '', quarto_extension: '',
    csl: '', csl_missing: false, max_upload_mb: null, page_limit: null, font_size_pt: null, fonts: [], house_rules: [], structure: [], tone: '', tone_source: '', warnings,
  };
  if (!KINDS.includes(kind)) {
    out.ok = false;
    warnings.push(`"${kind}" is not a kind of deliverable. Choose one of: ${KINDS.join(', ')}.`);
    return out;
  }
  const brain = readJson(join(root, 'config', 'brain.json'), null);
  const sourceAbs = source ? (isAbsolute(source) ? source : resolve(root, source)) : '';
  const srcData = sourceAbs ? frontOf(existsSync(sourceAbs) ? sourceAbs : null) : {};
  const projects = projectNotes(sourceAbs, root);
  const own = sourceAbs && basename(sourceAbs).toLowerCase() === 'assignment.md' ? [{ file: sourceAbs, data: srcData }] : [];
  const projectLevel = [...own, ...projects];

  // Course and programme: follow the first course link found on the source or the project notes.
  const courseLink = [srcData, ...projectLevel.map((p) => p.data)].map((d) => d.course).find((c) => str(c));
  const course = courseLink ? findCourse(courseLink, root) : null;
  if (courseLink && !course) warnings.push(`The course "${linkTarget(courseLink)}" is linked, but I cannot find its course note, so the course settings were not applied.`);
  const progLink = course ? course.data.programme : [srcData, ...projectLevel.map((p) => p.data)].map((d) => d.programme).find((c) => str(c));
  const programme = progLink ? findProgramme(progLink, root) : null;
  if (progLink && !programme) warnings.push(`The programme "${linkTarget(progLink)}" is linked, but I cannot find its programme note, so the programme settings were not applied.`);

  // Template choice, most specific level first.
  const slugsAt = (datas) => [...new Set(datas.flatMap((d) => [...asList(d.template), ...asList(d.templates)]))];
  const levels = [
    ['deliverable', slugsAt([srcData].filter(() => !own.length)), srcData],
    ['project', slugsAt(projectLevel.map((p) => p.data)), null],
    ['course', course ? slugsAt([course.data]) : [], null],
    ['programme', programme ? slugsAt([programme.data]) : [], null],
    ['config', (() => {
      const defs = isObject(brain?.templates?.defaults) ? brain.templates.defaults : {};
      const d = [kind, ...(KIND_FAMILY[kind] || [])].map((k) => str(defs[k])).find(Boolean);
      return d ? [d] : [];
    })(), null],
  ];
  let chosen = null;
  for (const [level, slugs] of levels) {
    const exact = [];
    const family = [];
    for (const raw of slugs) {
      const t = findTemplate(raw, root);
      if (!t) { warnings.push(`The ${level} names the template "${raw}", but I cannot find it.`); continue; }
      // A template of another kind is not a candidate, except its family (report covers memo, essay, one-pager).
      const bucket = t.kind === kind ? exact : (KIND_FAMILY[kind] || []).includes(t.kind) ? family : null;
      if (bucket && !bucket.some((m) => m.slug === t.slug)) bucket.push(t);
    }
    const matches = exact.length ? exact : family;
    if (matches.length > 1) {
      out.tie = matches.map((m) => m.slug);
      out.tie_level = level;
      chosen = false;
      break;
    }
    if (matches.length === 1) { chosen = { t: matches[0], level }; break; }
  }
  if (chosen === null) {
    const slug = KIND_TO_BUILTIN[kind];
    const t = slug ? listBuiltinTemplates(root).find((b) => b.slug === slug) : null;
    if (t) chosen = { t, level: 'built-in' };
  }
  const data = chosen ? chosen.t.data : {};
  if (chosen) {
    const t = chosen.t;
    out.template = { slug: t.slug, dir: t.dir, level: chosen.level, source: t.source };
    out.base = str(data.base) || 'none';
    out.format = str(data.format);
    out.brand = str(data.brand) ? join(t.dir, str(data.brand)) : '';
    out.reference_doc = str(data.reference_doc) ? join(t.dir, str(data.reference_doc)) : '';
    out.quarto_extension = str(data.quarto_extension) ? join(t.dir, '_extensions', str(data.quarto_extension)) : '';
    const csl = str(data.csl);
    out.csl = csl && csl !== 'apa' ? join(t.dir, csl) : csl;
    out.max_upload_mb = num(data.max_upload_mb);
    out.page_limit = num(data.page_limit);
    out.font_size_pt = num(data.font_size_pt);
    out.fonts = asList(data.fonts);
    out.house_rules = asList(data.house_rules);
    out.structure = asList(data.structure);
  } else if (out.tie) {
    out.base = KIND_TO_BUILTIN[kind] || 'none';
  }
  // Citation style and upload limit: the template's value, else the programme's. A programme value is a file name
  // ("own.csl") or a bare style name ("chicago"); it becomes a path when "<value>" or "<value>.csl" is a file in the
  // chosen template's folder or in a user template folder named by the programme. Otherwise it stays a name and a note says so.
  if ((!out.csl || (out.csl === 'apa' && (!chosen || !chosen.t || chosen.t.builtin))) && programme && str(programme.data.csl)) {
    const want = str(programme.data.csl);
    const dirs = [chosen && chosen.t ? chosen.t.dir : null, ...slugsAt([programme.data]).map((sl) => findTemplate(sl, root)?.dir)].filter(Boolean);
    const names = /\.csl$/i.test(want) ? [want] : [want, `${want}.csl`];
    const hit = dirs.flatMap((d) => names.map((n) => join(d, n))).find((f) => existsSync(f) && statSync(f).isFile());
    if (hit) out.csl = hit;
    else if (want !== 'apa') {
      out.csl = want;
      out.csl_missing = true;
      warnings.push(`The programme requires the citation style "${want}", but there is no style file for it. Put ${/\.csl$/i.test(want) ? want : `${want}.csl`} in the template folder and the reports will use it.`);
    }
  }
  if (out.max_upload_mb === null && programme) out.max_upload_mb = num(programme.data.max_upload_mb);

  // Style: the deliverable may override the template's.
  const styleOverride = str(srcData.style);
  out.style = STYLES.includes(styleOverride) ? styleOverride : (STYLES.includes(str(data.style)) ? str(data.style) : DEFAULT_STYLE[kind] || (kind === 'deck' ? 'presenting-deck' : 'report'));

  // Tone: deliverable > project/assignment > course > programme > the recommended default.
  const toneLevels = [
    ['deliverable', srcData], ...projectLevel.map((p) => ['project', p.data]), ['course', course?.data], ['programme', programme?.data],
  ];
  for (const [level, d] of toneLevels) {
    const t = d ? str(d.tone).toLowerCase() : '';
    if (TONES.includes(t)) { out.tone = t; out.tone_source = level; break; }
  }
  if (!out.tone) {
    out.tone = defaultTone({ learnerKind: learnerKindOf(brain), kind });
    out.tone_source = 'default';
  }
  return out;
}
