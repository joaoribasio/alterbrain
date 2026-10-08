#!/usr/bin/env node
// ab-migration: If your settings name a school or programme, creates a programme note from them and links your courses to it.
//
// Releases before 0.2.0 kept the school and programme in config/brain.json ("school": { name, programme }). From 0.2.0
// they live once in a programme note, vault/20_areas/programmes/<Programme name>.md, and each course note links to it
// with a "programme" property. This only ADDS: the school keys stay in config/brain.json and in the course notes (the
// code reads them as a fallback), no course folder moves, and no other line of a course note changes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigration, readJsonFile, writeFileAtomic, setFrontmatterLine, unreadableSettings } from '../../lib/migrate.mjs';
import { splitFrontmatter } from '../../lib/frontmatter.mjs';
import { today } from '../../lib/fsx.mjs';

const EN_DASH = '–';
const RESERVED = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== '');
const yamlString = (s) => `"${String(s).replace(/[\r\n\t]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A name that is safe as a file name and as an Obsidian link: no \ / : * ? " < > | # ^ [ ] or control characters. */
function noteTitle(raw) {
  let t = String(raw).replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\.+$/, '').trim();
  if (t.length > 100) {
    const cut = t.slice(0, 100);
    const space = cut.lastIndexOf(' ');
    t = (t[100] === ' ' || space <= 0 ? cut : cut.slice(0, space)).trim().replace(/\.+$/, '').trim();
  }
  return RESERVED.test(t) ? '' : t;
}

/** The frozen text of a new programme note. It never reads system/templates, which can change in later releases. */
function programmeNote(title, provider, created) {
  return [
    '---',
    'type: "programme"',
    `created: "${created}"`,
    'status: "active"',
    `provider: ${yamlString(provider)}`,
    'level: ""',
    'start: ""',
    'end: ""',
    'ai_policy: "unknown"',
    'ai_policy_quote: ""',
    'grading_scale: ""',
    '---',
    `# ${title}`,
    '',
    'Made from your settings during an Alterbrain update. Fill in the rest when you next set up a course, or say "update my programme note".',
    '',
    '## Terms',
    '',
    '| Term | Start | End |',
    '|---|---|---|',
    '',
    '## AI rule',
    '',
    '## Grading',
    '',
    '## Submission conventions',
    '',
    '## Career services',
    '',
    '## Courses',
    '',
    'Courses link here with the programme property.',
    '',
  ].join('\n');
}

await runMigration(async ({ root, report }) => {
  const file = join(root, 'config', 'brain.json');
  const brain = readJsonFile(file);
  if (!brain.exists) return;
  if (!isObject(brain.value)) throw unreadableSettings(file);
  if (!isObject(brain.value.school)) return;
  const name = text(brain.value.school.name);
  const prog = text(brain.value.school.programme);
  if (!name && !prog) return;

  const title = noteTitle(name && prog ? `${prog} ${EN_DASH} ${name}` : prog || name);
  if (!title) {
    report('Your school name cannot be used as a file name, so no programme note was made.');
    return;
  }

  // The note: an existing one with the same name (any capitals) is used as it is and never rewritten.
  const programmes = join(root, 'vault', '20_areas', 'programmes');
  const found = existsSync(programmes)
    ? readdirSync(programmes, { withFileTypes: true }).find((e) => e.isFile() && e.name.toLowerCase() === `${title.toLowerCase()}.md`)
    : null;
  let noteName = title;
  let created = false;
  if (found) {
    noteName = found.name.slice(0, -3);
  } else {
    writeFileAtomic(join(programmes, `${title}.md`), programmeNote(title, name, today()));
    created = true;
  }

  // The courses: flat folders under vault/20_areas/courses/, each with a course.md.
  const coursesDir = join(root, 'vault', '20_areas', 'courses');
  let linked = 0;
  let otherSchool = 0;
  const folders = existsSync(coursesDir) ? readdirSync(coursesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  for (const folder of folders) {
    const courseFile = join(coursesDir, folder, 'course.md');
    if (!existsSync(courseFile)) continue;
    let original;
    try {
      original = readFileSync(courseFile, 'utf8');
    } catch {
      continue;
    }
    const { data, raw } = splitFrontmatter(original);
    if (!raw || data.type !== 'course') continue;
    if (hasValue(data.programme) || hasValue(data.provider)) continue;
    const school = squash(data.school);
    if (school && name && school !== squash(name)) {
      otherSchool++;
      continue;
    }
    const updated = setFrontmatterLine(original, 'programme', yamlString(`[[${noteName}]]`), { after: ['school', 'term', 'code'] });
    if (updated === original) continue;
    writeFileAtomic(courseFile, updated);
    linked++;
  }

  if (created) report(`Created your programme note "${title}" in your Areas folder (programmes).`);
  if (linked) report(linked === 1 ? 'Linked 1 course to it.' : `Linked ${linked} courses to it.`);
  if (otherSchool && (created || linked)) {
    report(otherSchool === 1 ? 'Left 1 course alone because it names a different school.' : `Left ${otherSchool} courses alone because they name a different school.`);
  }
});
