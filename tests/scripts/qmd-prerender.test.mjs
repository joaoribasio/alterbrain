import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { convertNote, prerenderFile, wikilinksToText, findVaultRoot } from '../../system/scripts/qmd-prerender.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'system', 'scripts', 'qmd-prerender.mjs');
const VAULT = join(HERE, '..', 'fixtures', 'text', 'qmd-vault');
const NOTE = join(VAULT, '20_areas', 'courses', 'pricing', 'Pricing Report.md');

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function tmp() {
  return mkdtempSync(join(tmpdir(), 'qmd-'));
}

// The fixture's own top-level sections, in order. (Embedded notes bring their own "##" headings.)
const SECTIONS = ['Key idea', 'Only one section', 'One block', 'Picture', 'Callouts'];

function section(qmd, heading) {
  const start = qmd.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `heading ${heading} not found`);
  const nextName = SECTIONS[SECTIONS.indexOf(heading) + 1];
  const end = nextName ? qmd.indexOf(`## ${nextName}\n`) : -1;
  return end === -1 ? qmd.slice(start) : qmd.slice(start, end);
}

const convertFixture = (extra = {}) => {
  const outDir = tmp();
  const result = convertNote(readFileSync(NOTE, 'utf8'), { notePath: NOTE, vaultRoot: VAULT, outDir, ...extra });
  return { ...result, outDir };
};

test('wikilinksToText: plain, alias, heading, block, path', () => {
  assert.equal(wikilinksToText('See [[Porter Five Forces]].'), 'See Porter Five Forces.');
  assert.equal(wikilinksToText('[[Porter Five Forces|the forces]]'), 'the forces');
  assert.equal(wikilinksToText('[[Porter Five Forces#Threat of entry]]'), 'Porter Five Forces > Threat of entry');
  assert.equal(wikilinksToText('[[#Local heading]]'), 'Local heading');
  assert.equal(wikilinksToText('[[Note#^abc123]]'), 'Note');
  assert.equal(wikilinksToText('[[30_wiki/concepts/Price Elasticity.md]]'), 'Price Elasticity');
  assert.equal(wikilinksToText('| [[A\\|b]] |'), '| b |');
});

test('frontmatter: kept, Obsidian-only keys removed, wikilinks resolved, title added', () => {
  const { qmd, title } = convertFixture();
  const fm = qmd.split('---\n')[1];
  assert.equal(title, 'Coffee shop pricing report');
  assert.match(fm, /^title: "Coffee shop pricing report"/);
  assert.match(fm, /type: "note"/);
  assert.match(fm, /course: "Pricing Strategy"/);
  assert.match(fm, /tags:\n  - pricing/);
  assert.ok(!/aliases|Coffee report|cssclasses/.test(fm), fm);
  // The H1 became the title, so it is not repeated in the body.
  assert.ok(!/^# Coffee shop pricing report/m.test(qmd));
});

test('title: existing frontmatter title wins, file name is the last fallback', () => {
  const a = convertNote('---\ntitle: "Given"\n---\n# Other\n\nText.\n', { notePath: join(tmpdir(), 'x.md'), vaultRoot: tmpdir() });
  assert.match(a.qmd, /^---\ntitle: "Given"\n---\n/);
  assert.match(a.qmd, /^# Other$/m);
  const b = convertNote('Just text, no heading.\n', { notePath: join(tmpdir(), 'My Note.md'), vaultRoot: tmpdir() });
  assert.match(b.qmd, /^---\ntitle: "My Note"\n---\n\nJust text/);
});

test('no Obsidian link syntax is left over', () => {
  const { qmd } = convertFixture();
  const withoutCode = qmd.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  assert.ok(!withoutCode.includes('[['), 'wikilink left');
  assert.ok(!withoutCode.includes('%%'), 'comment left');
  assert.ok(!/\^para-1|\^key-point/.test(qmd), 'block id left');
  assert.ok(!/#pricing|#course\/mba/.test(withoutCode.split('---\n').slice(2).join('')), 'tag left in body');
  assert.ok(!qmd.includes('dataview'));
  assert.ok(qmd.includes('See Price Elasticity and the five forces.'));
  assert.ok(qmd.includes('Price Elasticity > Measuring it'));
  assert.ok(qmd.includes('Visible text after an inline comment.'));
  assert.ok(!qmd.includes('A block comment'));
});

test('embeds: whole note, one section, one block (one level deep)', () => {
  const { qmd, warnings } = convertFixture();
  const full = section(qmd, 'Key idea');
  assert.match(full, /Price elasticity tells you how much demand changes/);
  assert.match(full, /Other notes/);
  const part = section(qmd, 'Only one section');
  assert.match(part, /Divide the percentage change/);
  assert.ok(!/Other notes/.test(part));
  assert.ok(!/Price elasticity tells you/.test(part));
  const block = section(qmd, 'One block');
  assert.match(block, /This is the key point of the note\./);
  assert.ok(!/Divide the percentage/.test(block));
  // The nested embed is not opened.
  assert.ok(warnings.some((w) => /inside another embedded note/.test(w)));
  assert.ok(qmd.includes('*Porter Five Forces*'));
});

test('images: kept as Markdown images, sizes and alt text, paths relative to the output', () => {
  const { qmd, outDir } = convertFixture();
  const pic = section(qmd, 'Picture');
  assert.match(pic, /!\[Demand falls as price rises\]\([^)]*demand%20curve\.png\)\{width=300px\}/);
  assert.match(pic, /\{width=200px height=100px\}/);
  const m = pic.match(/\]\(([^)]*)\)/);
  assert.ok(m[1].startsWith('..'), 'path should be relative to the output folder');
  assert.ok(!m[1].includes('\\'));
  assert.ok(!m[1].includes(' '));
  const abs = join(outDir, decodeURIComponent(m[1]));
  assert.ok(existsSync(abs), `image path does not resolve: ${abs}`);
  rmSync(outDir, { recursive: true, force: true });
});

test('callouts become Quarto callouts', () => {
  const { qmd } = convertFixture();
  assert.match(qmd, /^::: \{\.callout-note title="A plain note"\}$/m);
  assert.match(qmd, /^::: \{\.callout-tip title="Folded tip" collapse="true"\}$/m);
  assert.match(qmd, /^::: \{\.callout-warning\}$/m);
  assert.match(qmd, /^::: \{\.callout-tip title="Done well"\}$/m);
  assert.match(qmd, /^> \*\*A classmate\*\*$/m); // quote callout becomes a blockquote
  // Nested callouts use more colons on the outer fence.
  assert.match(qmd, /^:::: \{\.callout-note title="Outer"\}$/m);
  assert.match(qmd, /^::: \{\.callout-caution title="Inner"\}$/m);
  assert.match(qmd, /^::::$/m);
  assert.ok(!/\[!/.test(qmd));
  // Body text of the first callout is intact and unquoted.
  assert.match(qmd, /^The owner wants to raise the price\.\nSecond line\.$/m);
});

test('highlights become mark spans', () => {
  const { qmd } = convertFixture();
  assert.ok(qmd.includes('A [highlighted phrase]{.mark} sits in this line.'));
});

test('code is untouched, Obsidian-only blocks removed, mermaid converted', () => {
  const { qmd } = convertFixture();
  assert.ok(qmd.includes('Inline `[[not a link]]` and `%% not a comment %%` stay.'));
  assert.ok(qmd.includes('print("[[not a link]]")  # %% stays %%'));
  assert.ok(!qmd.includes('TABLE file.name'));
  assert.match(qmd, /^```\{mermaid\}$/m);
});

test('tables keep their pipes when a wikilink has an escaped alias', () => {
  const { qmd } = convertFixture();
  assert.match(qmd, /^\| Elasticity \| elasticity \|$/m);
});

test('missing embeds are reported and replaced by a visible marker', () => {
  const { qmd, warnings, embeds } = convertFixture();
  assert.ok(qmd.includes('*[note not found: Does Not Exist]*'));
  assert.ok(warnings.some((w) => /Does Not Exist/.test(w)));
  assert.ok(warnings.some((w) => /missing picture\.png/.test(w)));
  assert.ok(embeds.some((e) => e.kind === 'image' && e.found === false));
  assert.ok(embeds.some((e) => e.kind === 'note' && e.found === true));
});

test('keepTags keeps #tags in the text', () => {
  const { qmd } = convertFixture({ keepTags: true });
  assert.ok(qmd.includes('#pricing #course/mba'));
});

test('an unclosed %% comment is left in place with a warning', () => {
  const r = convertNote('Text %% never closed\n\nMore.\n', { notePath: join(tmpdir(), 'a.md'), vaultRoot: tmpdir() });
  assert.ok(r.warnings.some((w) => /no closing/.test(w)));
  assert.ok(r.qmd.includes('%% never closed'));
});

test('callout without body, and fold marker without title', () => {
  const r = convertNote('> [!note]+\n\nAfter.\n\n> [!bug] Broken\n> Steps.\n', { notePath: join(tmpdir(), 'c.md'), vaultRoot: tmpdir() });
  assert.match(r.qmd, /^::: \{\.callout-note title="Note" collapse="false"\}$/m);
  assert.match(r.qmd, /^::: \{\.callout-caution title="Broken"\}$/m);
});

test('findVaultRoot: explicit folder, then nearest .obsidian', () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, '.obsidian'));
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    assert.equal(findVaultRoot(join(dir, 'a', 'b', 'n.md')), dir);
    assert.equal(findVaultRoot(join(dir, 'a', 'b', 'n.md'), VAULT), VAULT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prerenderFile writes the file and creates folders', () => {
  const dir = tmp();
  try {
    const out = join(dir, 'deep', 'er', 'report.qmd');
    const r = prerenderFile(NOTE, { out, vault: VAULT });
    assert.equal(r.out, out);
    assert.ok(readFileSync(out, 'utf8').startsWith('---\ntitle: "Coffee shop pricing report"'));
    assert.ok(!readFileSync(out, 'utf8').includes('\r'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --out writes the file, warnings give exit 1', () => {
  const dir = tmp();
  try {
    const out = join(dir, 'r.qmd');
    const r = run([NOTE, '--vault', VAULT, '--out', out]);
    assert.equal(r.code, 1);
    assert.match(r.err, /Warning: I could not find the note to embed: Does Not Exist/);
    assert.ok(existsSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: a clean note exits 0, prints to stdout, finds the vault through .obsidian', () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, '.obsidian'));
    mkdirSync(join(dir, 'notes'));
    mkdirSync(join(dir, 'pics'));
    writeFileSync(join(dir, 'pics', 'chart.png'), 'x');
    writeFileSync(join(dir, 'notes', 'Other.md'), '---\ntype: "concept"\n---\nOther text.\n');
    writeFileSync(join(dir, 'notes', 'Main.md'), '# Main\r\n\r\nSee [[Other]].\r\n\r\n![[Other]]\r\n\r\n![[chart.png]]\r\n');
    const r = run([join(dir, 'notes', 'Main.md')]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^---\ntitle: "Main"\n---\n/);
    assert.match(r.out, /See Other\./);
    assert.match(r.out, /\nOther text\.\n/);
    assert.match(r.out, /!\[\]\(\.\.\/pics\/chart\.png\)/);
    assert.ok(!r.out.includes('\r'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --json report', () => {
  const r = run([NOTE, '--vault', VAULT, '--json']);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, false);
  assert.equal(j.title, 'Coffee shop pricing report');
  assert.ok(j.qmd.startsWith('---\n'));
  assert.ok(j.warnings.length >= 3);
  assert.ok(Array.isArray(j.embeds));
});

test('CLI: usage errors exit 2', () => {
  assert.equal(run([]).code, 2);
  assert.equal(run(['--nope']).code, 2);
  assert.equal(run([join(VAULT, 'missing.md')]).code, 2);
  assert.equal(run([NOTE, '--vault', join(VAULT, 'nope')]).code, 2);
  assert.equal(run([NOTE, NOTE]).code, 2);
});

/* ---------------- code-safety hardening ---------------- */

test('F16: an embed cannot reach outside the vault, nor pull in a secret file or a non-note', () => {
  const root = tmp();
  try {
    const vault = join(root, 'vault');
    mkdirSync(join(vault, '20_areas'), { recursive: true });
    mkdirSync(join(vault, '.git'), { recursive: true });
    writeFileSync(join(root, '.env.local'), 'API_KEY=topsecretvalue123\n');
    writeFileSync(join(root, 'outside.md'), 'OUTSIDE-NOTE-TEXT\n');
    writeFileSync(join(vault, '.env.local'), 'INSIDE_KEY=anothersecret456\n');
    writeFileSync(join(vault, '.git', 'config.md'), 'GIT-INTERNALS\n');
    writeFileSync(join(vault, 'server.pem.md'), 'not a secret name\n');
    writeFileSync(join(vault, 'data.txt'), 'PLAIN-TEXT-FILE\n');
    writeFileSync(join(vault, '20_areas', 'inner.md'), 'INNER-NOTE-TEXT\n');
    const note = join(vault, '20_areas', 'Note.md');
    const text = [
      '# Note', '',
      '![[../../.env.local]]', '', '![[../../../.env.local]]', '', '![[../../../outside.md]]', '', '![[../../.env.local.md]]', '',
      '![[.env.local]]', '', '![[.git/config.md]]', '', '![[data.txt]]', '', '![[inner]]', '', '![[../server.pem.md]]', '',
    ].join('\n');
    const r = convertNote(text, { notePath: note, vaultRoot: vault, outDir: join(root, 'out') });
    assert.doesNotMatch(r.qmd, /topsecretvalue123|anothersecret456|OUTSIDE-NOTE-TEXT|GIT-INTERNALS|PLAIN-TEXT-FILE/);
    assert.match(r.qmd, /INNER-NOTE-TEXT/, 'a normal note inside the vault is still embedded');
    assert.match(r.qmd, /not a secret name/, 'a file name that merely contains .pem is fine');
    assert.ok(r.warnings.some((w) => /could not find|Only Markdown notes/.test(w)), r.warnings.join(' | '));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
