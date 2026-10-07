// Tests for zip files and --course in system/scripts/ingest.mjs. Synthetic data only.
// The zips are built at runtime (tests/fixtures/scripts/zip-helpers.mjs), so no real tool or download is needed to
// make them. Tests that really unpack a zip need the computer's own tool (bsdtar, built into Windows 10+ and macOS)
// and are skipped, with a visible message, on a computer that has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { makeProject, runScript, read } from '../fixtures/scripts/helpers.mjs';
import { buildZip } from '../fixtures/scripts/zip-helpers.mjs';
import {
  checkUnpackedCount,
  checkZipIndex,
  cleanCourse,
  expectedZipFiles,
  findZipTool,
  inspectUnpacked,
  isInside,
  readZipIndex,
  unsafeZipName,
} from '../../system/scripts/ingest.mjs';

const MANIFEST = 'vault/40_sources/manifest.jsonl';
const tool = findZipTool();
const NEEDS_TOOL = tool ? false : 'this computer has no tool that opens zips (bsdtar or unzip)';
const NEEDS_BSDTAR = tool?.kind === 'bsdtar' ? false : 'only bsdtar is known to refuse a zip whose sizes do not add up';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const manifestLines = (p) =>
  read(p, MANIFEST)
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const names = (files) => files.map((f) => f.path.split(/[\\/]/).pop());

/** Two scratch folders: the project and a place for the files the user "downloaded". */
function setup() {
  const p = makeProject();
  const box = makeProject();
  const cleanProject = p.cleanup;
  p.cleanup = () => {
    cleanProject();
    box.cleanup();
  };
  return { p, box };
}

/** Folders left behind by a zip that was opened (there must be none). */
function leftovers(p) {
  const tmp = p.path('state', 'local', 'tmp');
  return existsSync(tmp) ? readdirSync(tmp).filter((n) => n.startsWith('ingest-zip-')) : [];
}

const COURSE_FILES = [
  { name: 'Strategy/' },
  { name: 'Strategy/Week 1/' },
  { name: 'Strategy/Week 1/Slides.md', data: '# Week 1\nPorter in one page.\n', deflate: true },
  { name: 'Strategy/Week 1/Reading.html', data: '<html><head><title>Reading</title></head><body><p>Hello</p></body></html>' },
  { name: 'Strategy/Data.csv', data: 'segment,revenue\nstudents,120\n' },
  { name: 'Strategy/Syllabus.pdf', data: '%PDF-1.4 a pretend syllabus' },
  { name: '__MACOSX/Strategy/._Slides.md', data: 'junk' },
  { name: 'Strategy/.DS_Store', data: 'junk' },
  { name: 'Strategy/.env', data: 'nothing real\n' },
];

// ------------------------------------------------------------- opening a zip
test('a zip is opened: each file is ingested with origin "<zip>/<path>", junk and secret names are skipped, the zip is not stored', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Strategy.zip'), buildZip(COURSE_FILES));
    const r = runScript('ingest.mjs', [box.path('Strategy.zip'), '--json'], p);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const out = r.json();
    assert.equal(out.counts.new, 4);
    assert.equal(out.counts.zips, 1);
    assert.equal(out.counts.error, 0);
    assert.equal(out.counts.found, 6, 'the two junk folders are not entered; six real entries remain');
    assert.deepEqual(names(out.files.filter((f) => f.reason === 'junk')), ['.DS_Store']);
    assert.deepEqual(names(out.files.filter((f) => /password or key file/.test(f.reason || ''))), ['.env']);
    assert.equal(out.zips.length, 1);
    assert.equal(out.zips[0].zip, 'Strategy.zip');
    assert.equal(out.zips[0].status, 'opened');
    assert.equal(out.zips[0].files, 6);

    const lines = manifestLines(p);
    assert.deepEqual(
      lines.map((e) => e.origin).sort(),
      [
        'Strategy.zip/Strategy/Data.csv',
        'Strategy.zip/Strategy/Syllabus.pdf',
        'Strategy.zip/Strategy/Week 1/Reading.html',
        'Strategy.zip/Strategy/Week 1/Slides.md',
      ],
    );
    for (const e of lines) {
      assert.ok(existsSync(p.path(...e.stored.split('/'))), `${e.stored} should exist`);
      assert.doesNotMatch(e.stored, /\.zip$/);
      assert.equal('course' in e, false, 'no --course, no course key');
    }
    const slides = lines.find((e) => e.origin.endsWith('Slides.md'));
    assert.equal(sha(readFileSync(p.path(...slides.stored.split('/')))), sha(Buffer.from('# Week 1\nPorter in one page.\n')));
    assert.equal(slides.text_status, 'done');
    assert.equal(lines.find((e) => e.origin.endsWith('Syllabus.pdf')).kind, 'pdf');

    // the zip itself was not copied, and the private folder is gone
    const raw = p.path('vault', '40_sources', 'raw');
    const stored = readdirSync(raw, { recursive: true }).map(String);
    assert.ok(!stored.some((n) => /\.zip$/i.test(n)));
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

test('a zip made by the computer\'s own tool (bsdtar) is read correctly too', { skip: tool?.kind === 'bsdtar' ? false : 'needs bsdtar to make the zip' }, () => {
  const { p, box } = setup();
  try {
    const src = box.path('src');
    mkdirSync(join(src, 'Week 1'), { recursive: true });
    writeFileSync(join(src, 'Week 1', 'Notes.md'), '# Notes\nA real zip.\n');
    writeFileSync(join(src, 'Readme.txt'), 'plain text');
    const made = spawnSync(tool.cmd, ['-a', '-cf', box.path('Made by tar.zip'), '-C', src, 'Week 1', 'Readme.txt'], { encoding: 'utf8', windowsHide: true });
    assert.equal(made.status, 0, made.stderr);
    assert.deepEqual(
      readZipIndex(box.path('Made by tar.zip')).filter((e) => !e.dir).map((e) => e.name).sort(),
      ['Readme.txt', 'Week 1/Notes.md'],
    );
    const out = runScript('ingest.mjs', [box.path('Made by tar.zip'), '--json'], p).json();
    assert.equal(out.counts.new, 2);
    assert.deepEqual(manifestLines(p).map((e) => e.origin).sort(), ['Made by tar.zip/Readme.txt', 'Made by tar.zip/Week 1/Notes.md']);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

test('opening the same zip again adds nothing (every file is a duplicate)', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Strategy.zip'), buildZip(COURSE_FILES));
    runScript('ingest.mjs', [box.path('Strategy.zip')], p);
    const before = read(p, MANIFEST);
    const out = runScript('ingest.mjs', [box.path('Strategy.zip'), '--json'], p).json();
    assert.equal(out.counts.new, 0);
    assert.equal(out.counts.duplicate, 4);
    assert.equal(read(p, MANIFEST), before);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

test('a zip inside a folder is opened; a zip inside a zip is kept as an ordinary file and not opened', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    const inner = buildZip([{ name: 'inner.md', data: '# Inside the inner zip\n' }]);
    const outer = buildZip([
      { name: 'a.md', data: '# A\n' },
      { name: 'Extra/inner.zip', data: inner },
    ]);
    mkdirSync(box.path('Downloads'));
    writeFileSync(box.path('Downloads', 'outer.zip'), outer);
    writeFileSync(box.path('Downloads', 'loose.md'), '# Loose\n');
    const out = runScript('ingest.mjs', [box.path('Downloads'), '--json'], p).json();
    assert.equal(out.counts.new, 3);
    assert.equal(out.counts.zips, 1, 'only the outer zip is opened');
    const lines = manifestLines(p);
    assert.deepEqual(lines.map((e) => e.origin).sort(), ['loose.md', 'outer.zip/Extra/inner.zip', 'outer.zip/a.md']);
    const nested = lines.find((e) => e.origin.endsWith('inner.zip'));
    assert.equal(nested.text_status, 'none');
    assert.match(nested.note, /zip inside a zip/);
    assert.ok(!lines.some((e) => /inner\.md/.test(e.origin)), 'what is inside the inner zip is not ingested');
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

test('--latest-only works inside a zip and reports the path inside the zip', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Cases.zip'), buildZip([
      { name: 'Report_v1.md', data: 'one\n' },
      { name: 'Report_v2.md', data: 'two\n' },
    ]));
    const out = runScript('ingest.mjs', [box.path('Cases.zip'), '--latest-only', '--json'], p).json();
    assert.equal(out.counts.new, 1);
    const older = out.files.find((f) => f.reason === 'older-version');
    assert.equal(older.path, 'Cases.zip/Report_v1.md');
    assert.equal(older.superseded_by, 'Cases.zip/Report_v2.md');
  } finally {
    p.cleanup();
  }
});

test('names with accents and with characters Windows does not allow still go in', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Names.zip'), buildZip([
      { name: 'Café notes.md', data: '# Café\n' },
      { name: 'Week 1: Intro?.txt', data: 'intro' },
    ]));
    const out = runScript('ingest.mjs', [box.path('Names.zip'), '--json'], p).json();
    assert.equal(out.counts.new, 2, JSON.stringify(out.files));
    const origins = manifestLines(p).map((e) => e.origin);
    assert.ok(origins.includes('Names.zip/Café notes.md'.normalize('NFC')));
  } finally {
    p.cleanup();
  }
});

test('a zip with a comment, and a zip64 zip, are both read', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    const files = [{ name: 'a.md', data: '# A\n' }, { name: 'b.md', data: '# B\n' }];
    writeFileSync(box.path('Commented.zip'), buildZip(files, { comment: 'Downloaded from a learning platform, PK\u0005\u0006 inside the comment' }));
    writeFileSync(box.path('Big.zip'), buildZip(files, { zip64: true }));
    for (const zip of ['Commented.zip', 'Big.zip']) {
      assert.deepEqual(readZipIndex(box.path(zip)).map((e) => e.name), ['a.md', 'b.md'], zip);
    }
    const out = runScript('ingest.mjs', [box.path('Commented.zip'), box.path('Big.zip'), '--json'], p).json();
    assert.equal(out.counts.zips, 2);
    assert.equal(out.counts.new, 2, 'both zips hold the same two files, so the second one only finds duplicates');
    assert.equal(out.counts.duplicate, 2);
  } finally {
    p.cleanup();
  }
});

test('a zip of 300 files is opened in one go', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    const entries = [];
    for (let i = 0; i < 300; i++) entries.push({ name: `Week ${1 + (i % 12)}/Note ${i}.md`, data: `# Note ${i}\nUnique text ${i}.\n` });
    writeFileSync(box.path('Many.zip'), buildZip(entries));
    const out = runScript('ingest.mjs', [box.path('Many.zip'), '--json'], p).json();
    assert.equal(out.counts.new, 300);
    assert.equal(manifestLines(p).length, 300);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- zip-slip and other refusals
test('zip-slip: a name that leads outside the folder refuses the whole zip, and nothing is written anywhere', () => {
  for (const bad of ['../evil.txt', 'a/../../evil.txt', '..\\evil.txt', '/evil.txt', 'C:/evil.txt', '\\\\server\\share\\evil.txt']) {
    const { p, box } = setup();
    try {
      writeFileSync(box.path('Slip.zip'), buildZip([{ name: 'ok.md', data: '# ok\n' }, { name: bad, data: 'not good' }]));
      const r = runScript('ingest.mjs', [box.path('Slip.zip'), '--json'], p);
      assert.equal(r.status, 1, bad);
      const out = r.json();
      assert.equal(out.counts.new, 0, `${bad}: nothing from a refused zip is used, not even the harmless file`);
      assert.equal(out.zips[0].status, 'refused');
      assert.match(out.zips[0].reason, /outside its own folder/, bad);
      assert.equal(existsSync(p.path(...MANIFEST.split('/'))), false);
      for (const dir of [p.dir, p.path('state'), p.path('state', 'local'), p.path('state', 'local', 'tmp'), box.dir]) {
        assert.equal(existsSync(join(dir, 'evil.txt')), false, `${bad}: no evil.txt in ${dir}`);
      }
      assert.deepEqual(leftovers(p), []);
    } finally {
      p.cleanup();
    }
  }
});

test('unsafeZipName and isInside', () => {
  for (const bad of ['../x', 'a/../../x', 'a/..', '..\\x', 'a\\..\\..\\x', '/x', '\\x', 'C:/x', 'c:\\x', '\\\\server\\share', 'a\u0000b']) {
    assert.equal(unsafeZipName(bad), true, JSON.stringify(bad));
  }
  for (const fine of ['a.md', 'Week 1/Slides.pdf', 'dir/sub/file.name.v2.txt', '..hidden', 'a/..b/c', 'Week 1: Intro.txt', 'Strategy/', './x.md']) {
    assert.equal(unsafeZipName(fine), false, fine);
  }
  const root = resolve('/a/b');
  assert.equal(isInside(root, root), true);
  assert.equal(isInside(root, resolve('/a/b/c/d.txt')), true);
  assert.equal(isInside(root, resolve('/a/bc')), false, 'a folder whose name only starts the same is not inside');
  assert.equal(isInside(root, resolve('/a')), false);
  assert.equal(isInside(root, resolve('/a/b/../x')), false);
});

test('after unpacking: a file next to the folder, a link, or too much data refuses the zip', (t) => {
  const { p, box } = setup();
  try {
    const parent = box.path('unpacked');
    const dest = join(parent, 'files');
    mkdirSync(join(dest, 'Week 1'), { recursive: true });
    writeFileSync(join(dest, 'Week 1', 'a.md'), 'fine');
    assert.deepEqual(inspectUnpacked(parent, dest).map((i) => i.inner), ['Week 1/a.md']);

    writeFileSync(join(parent, 'evil.txt'), 'landed next to the folder');
    assert.throws(() => inspectUnpacked(parent, dest), /outside its own folder/);
    rmSync(join(parent, 'evil.txt'));

    assert.throws(() => inspectUnpacked(parent, dest, { maxFiles: 0 }), /more than my limits/);
    assert.throws(() => inspectUnpacked(parent, dest, { maxBytes: 1 }), /more than my limits/);

    mkdirSync(box.path('elsewhere'));
    writeFileSync(box.path('elsewhere', 'secret.md'), 'outside');
    try {
      symlinkSync(box.path('elsewhere'), join(dest, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (e) {
      t.diagnostic(`could not make a link here (${e.code}); that part of the check is skipped`);
      return;
    }
    assert.throws(() => inspectUnpacked(parent, dest), /links/);
  } finally {
    p.cleanup();
  }
});

test('a zip that holds a link entry is refused', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Links.zip'), buildZip([{ name: 'ok.md', data: '# ok\n' }, { name: 'shortcut', data: '../../', symlink: true }]));
    const r = runScript('ingest.mjs', [box.path('Links.zip'), '--json'], p);
    assert.equal(r.status, 1);
    assert.match(r.json().zips[0].reason, /links/);
    assert.equal(r.json().counts.new, 0);
  } finally {
    p.cleanup();
  }
});

test('a password protected zip is refused with a plain message', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Locked.zip'), buildZip([{ name: 'a.md', data: 'x', encrypted: true }]));
    const r = runScript('ingest.mjs', [box.path('Locked.zip')], p);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /! Locked\.zip: This zip is password protected/);
    assert.match(r.stdout, /Problems: +1/);
  } finally {
    p.cleanup();
  }
});

test('a file called .zip that is not a zip, or is cut short, is refused with a plain message', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Fake.zip'), 'this is just text, not a zip file at all');
    const whole = buildZip([{ name: 'a.md', data: 'hello' }]);
    writeFileSync(box.path('Cut.zip'), whole.subarray(0, whole.length - 30));
    writeFileSync(box.path('Tiny.zip'), 'PK');
    const r = runScript('ingest.mjs', [box.path('Fake.zip'), box.path('Cut.zip'), box.path('Tiny.zip'), '--json'], p);
    assert.equal(r.status, 1);
    const out = r.json();
    assert.equal(out.counts.error, 3);
    for (const z of out.zips) assert.match(z.reason, /cannot read it.*damaged or only partly downloaded/, z.zip);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

test('a zip with no files in it is skipped without trying to unpack it', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Empty.zip'), buildZip([]));
    writeFileSync(box.path('Folders only.zip'), buildZip([{ name: 'Week 1/' }, { name: 'Week 2/' }]));
    const r = runScript('ingest.mjs', [box.path('Empty.zip'), box.path('Folders only.zip'), '--json'], p, { ALTERBRAIN_NO_ZIP_TOOL: '1' });
    assert.equal(r.status, 0, r.stdout);
    const out = r.json();
    assert.equal(out.counts.new, 0);
    assert.equal(out.counts.skipped, 2);
    assert.ok(out.files.every((f) => f.reason === 'the zip holds no files'));
  } finally {
    p.cleanup();
  }
});

test('with no tool to open zips the user is told to unzip it themselves', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Strategy.zip'), buildZip(COURSE_FILES));
    const r = runScript('ingest.mjs', [box.path('Strategy.zip'), '--json'], p, { ALTERBRAIN_NO_ZIP_TOOL: '1' });
    assert.equal(r.status, 1);
    assert.match(r.json().zips[0].reason, /cannot open zip files on this computer.*give me the folder/);
    assert.equal(r.json().counts.new, 0);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- names that clash on Windows and macOS
const CLASH = /holds two files whose names Windows and macOS treat as the same file/;

test('two names that differ only by letter case refuse the whole zip, before anything is unpacked (no silent loss)', () => {
  const pairs = [
    ['Week 1/Notes.md', 'Week 1/notes.md'], // the file name
    ['Week 1/Notes.md', 'week 1/notes.md'], // the folder name too
    ['Café.md', 'Café.md'], // the same accent written two ways
    ['x.md', 'x.md'], // the same name twice
    ['./x.md', 'x.md'], // a leading "./"
    ['a\\Notes.md', 'a/notes.md'], // a backslash is a folder separator
    ['a//Notes.md', 'a/notes.md'], // an empty folder name
  ];
  for (const [first, second] of pairs) {
    const { p, box } = setup();
    try {
      // 'ok.md' is harmless on its own, and must not be used either when the zip is refused
      writeFileSync(box.path('Case.zip'), buildZip([{ name: 'ok.md', data: '# ok\n' }, { name: first, data: '# first version\n' }, { name: second, data: '# second, different text\n' }]));
      // No zip tool is needed, which shows the refusal comes before any unpacking.
      const r = runScript('ingest.mjs', [box.path('Case.zip'), '--json'], p, { ALTERBRAIN_NO_ZIP_TOOL: '1' });
      const label = JSON.stringify([first, second]);
      assert.equal(r.status, 1, label + r.stdout);
      const out = r.json();
      assert.equal(out.ok, false, label);
      assert.equal(out.counts.new, 0, `${label}: nothing from a refused zip is used`);
      assert.equal(out.counts.error, 1, label);
      assert.equal(out.zips[0].status, 'refused', label);
      assert.match(out.zips[0].reason, CLASH, label);
      assert.match(out.zips[0].reason, /rename one of the two/, label);
      assert.equal(existsSync(p.path(...MANIFEST.split('/'))), false, label);
      assert.equal(existsSync(p.path('state', 'local', 'tmp')), false, `${label}: nothing was unpacked`);
    } finally {
      p.cleanup();
    }
  }
});

test('the refusal names both files in one tidy line', () => {
  assert.throws(() => checkZipIndex([{ name: 'Week 1/Notes.md', size: 1 }, { name: 'Week 1/notes.md', size: 1 }]), (e) => {
    assert.match(e.message, /"Week 1\/Notes\.md" and "Week 1\/notes\.md"/);
    return true;
  });
  const long = 'x'.repeat(300);
  assert.throws(() => checkZipIndex([{ name: `${long}.md`, size: 1 }, { name: `${long.toUpperCase()}.MD`, size: 1 }]), (e) => {
    assert.ok(e.message.length < 600, 'a very long name is cut short');
    assert.doesNotMatch(e.message, /x{100}/);
    return true;
  });
  assert.throws(() => checkZipIndex([{ name: 'a\nb.md', size: 1 }, { name: 'A\nB.md', size: 1 }]), (e) => {
    assert.doesNotMatch(e.message, /\n/, 'a line break in a name does not break the message');
    return true;
  });
});

test('names that are different, or that only look alike where it does not matter, are not refused', () => {
  const file = (name) => ({ name, size: 1, dir: false });
  const dir = (name) => ({ name, size: 0, dir: true });
  // different folders, similar names, a name that only starts the same
  assert.deepEqual(checkZipIndex([file('Week 1/Notes.md'), file('Week 2/Notes.md'), file('Week 1/Notes 2.md'), file('Notes.md'), file('Notes.md.txt')]), { files: 5, bytes: 5 });
  // a folder entry never clashes with the files in it
  assert.equal(checkZipIndex([dir('Week 1/'), dir('week 1/'), file('Week 1/a.md')]).files, 1);
  // junk is dropped later anyway, so a clash among junk is harmless
  assert.equal(checkZipIndex([file('__MACOSX/a/._x.md'), file('__macosx/A/._X.md'), file('.DS_Store'), file('.ds_store'), file('Week 1/.git/config'), file('Week 1/.GIT/CONFIG')]).files, 6);
});

test('expectedZipFiles lists the files that must come out: no folders, no junk folders, no junk names', () => {
  const entries = [
    { name: 'Strategy/', dir: true },
    { name: 'Strategy/Slides.md', dir: false },
    { name: 'Strategy\\Data.csv', dir: false },
    { name: '__MACOSX/Strategy/._Slides.md', dir: false },
    { name: 'Strategy/node_modules/x/index.js', dir: false },
    { name: 'Strategy/.DS_Store', dir: false },
    { name: 'Strategy/~$Draft.docx', dir: false },
    { name: 'Strategy/.env', dir: false },
    { name: '.git', dir: false }, // a file called .git is an ordinary file, not a folder
  ];
  assert.deepEqual(expectedZipFiles(entries).map((e) => e.name), ['Strategy/Slides.md', 'Strategy\\Data.csv', 'Strategy/.env', '.git']);
});

test('checkUnpackedCount: a file lost or added while unpacking refuses the zip, junk is not counted', () => {
  const entries = [
    { name: 'a.md', dir: false },
    { name: 'b.md', dir: false },
    { name: '__MACOSX/._a.md', dir: false },
    { name: '.DS_Store', dir: false },
  ];
  const real = (n) => ({ junk: false, inner: n });
  const junk = (n) => ({ junk: true, inner: n });
  // right number, with and without the junk file that is on disk
  checkUnpackedCount(entries, [real('a.md'), real('b.md')]);
  checkUnpackedCount(entries, [real('a.md'), real('b.md'), junk('.DS_Store')]);
  // one lost: the case that used to pass without a word
  assert.throws(() => checkUnpackedCount(entries, [real('a.md'), junk('.DS_Store')]), /lists 2 files, but 1 came out.*used none of it/);
  // one more than the zip lists
  assert.throws(() => checkUnpackedCount(entries, [real('a.md'), real('b.md'), real('c.md')]), /lists 2 files, but 3 came out/);
  // a junk file cannot hide a lost real file
  assert.throws(() => checkUnpackedCount(entries, [real('a.md'), junk('.DS_Store'), junk('._b.md')]), /lists 2 files, but 1 came out/);
});

test('files that do not all come out are never dropped quietly (Windows rewrites ":" and "?" in names)', { skip: NEEDS_BSDTAR }, () => {
  const { p, box } = setup();
  try {
    // On Windows the tool turns both of these into the same name. Another computer may keep both, which is fine too.
    writeFileSync(box.path('Odd names.zip'), buildZip([
      { name: 'ok.md', data: '# ok\n' },
      { name: 'Week 1/Intro: part 1.md', data: '# first\n' },
      { name: 'Week 1/Intro? part 1.md', data: '# second\n' },
    ]));
    const r = runScript('ingest.mjs', [box.path('Odd names.zip'), '--json'], p);
    const out = r.json();
    if (out.counts.new === 3) {
      assert.equal(r.status, 0, r.stdout);
      assert.equal(out.zips[0].files, 3);
    } else {
      assert.equal(r.status, 1, r.stdout);
      assert.equal(out.counts.new, 0, 'a zip that lost a file is used for nothing');
      assert.equal(out.zips[0].status, 'refused');
      assert.match(out.zips[0].reason, /lists 3 files, but 2 came out|could not unpack this zip cleanly/);
      assert.equal(existsSync(p.path(...MANIFEST.split('/'))), false);
    }
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- limits
test('limit on the number of files is checked before anything is unpacked', () => {
  const { p, box } = setup();
  try {
    const entries = [{ name: 'Week 1/' }];
    for (let i = 1; i <= 5; i++) entries.push({ name: `Week 1/n${i}.md`, data: `note ${i}` });
    writeFileSync(box.path('Five.zip'), buildZip(entries));
    const r = runScript('ingest.mjs', [box.path('Five.zip'), '--json'], p, { ALTERBRAIN_MAX_ZIP_FILES: '3' });
    assert.equal(r.status, 1);
    assert.equal(r.json().counts.new, 0);
    assert.match(r.json().zips[0].reason, /holds 5 files, more than my limit of 3 for one zip/);
    assert.match(r.json().zips[0].reason, /one course folder at a time/);
    assert.equal(existsSync(p.path('state', 'local', 'tmp')), false, 'nothing was unpacked, so no private folder was even made');
  } finally {
    p.cleanup();
  }
});

test('limit on the size is checked before anything is unpacked, and a zip64 size over the limit is understood', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Heavy.zip'), buildZip([{ name: 'a.txt', data: 'x'.repeat(80) }, { name: 'b.txt', data: 'y'.repeat(80) }]));
    const r = runScript('ingest.mjs', [box.path('Heavy.zip'), '--json'], p, { ALTERBRAIN_MAX_ZIP_BYTES: '100' });
    assert.equal(r.status, 1);
    assert.match(r.json().zips[0].reason, /would unpack to about 160 bytes, more than my limit of 100 bytes/);

    writeFileSync(box.path('Huge.zip'), buildZip([{ name: 'recording.bin', data: 'x', zip64Size: 5 * 1024 ** 3 }]));
    const huge = runScript('ingest.mjs', [box.path('Huge.zip'), '--json'], p);
    assert.equal(huge.status, 1);
    assert.match(huge.json().zips[0].reason, /would unpack to about 5\.0 GB, more than my limit of 2\.0 GB/);
  } finally {
    p.cleanup();
  }
});

test('a zip exactly at the file limit is opened', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Three.zip'), buildZip([1, 2, 3].map((i) => ({ name: `n${i}.md`, data: `note ${i}` }))));
    const r = runScript('ingest.mjs', [box.path('Three.zip'), '--json'], p, { ALTERBRAIN_MAX_ZIP_FILES: '3' });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.json().counts.new, 3);
  } finally {
    p.cleanup();
  }
});

test('a zip whose headers lie about its size is still stopped, and the private folder is deleted', { skip: NEEDS_BSDTAR }, () => {
  const { p, box } = setup();
  try {
    // The headers say 10 bytes; the data is 3 MB of the same letter (a few KB once compressed).
    writeFileSync(box.path('Liar.zip'), buildZip([{ name: 'big.txt', data: 'A'.repeat(3 * 1024 * 1024), deflate: true, declaredSize: 10 }]));
    const r = runScript('ingest.mjs', [box.path('Liar.zip'), '--json'], p, { ALTERBRAIN_MAX_ZIP_BYTES: String(1024 * 1024) });
    assert.equal(r.status, 1, r.stdout);
    const out = r.json();
    assert.equal(out.counts.new, 0);
    assert.match(out.zips[0].reason, /unpacked to more than my limits|could not unpack this zip cleanly/);
    assert.equal(existsSync(p.path(...MANIFEST.split('/'))), false);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

test('a zip that does not unpack cleanly is not used at all', { skip: NEEDS_BSDTAR }, () => {
  const { p, box } = setup();
  try {
    // Small lie: the data is bigger than the headers say, but far below any limit.
    writeFileSync(box.path('Odd.zip'), buildZip([
      { name: 'good.md', data: '# good\n' },
      { name: 'odd.txt', data: 'B'.repeat(5000), deflate: true, declaredSize: 10 },
    ]));
    const r = runScript('ingest.mjs', [box.path('Odd.zip'), '--json'], p);
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.json().counts.new, 0, 'not even the good file is kept');
    assert.match(r.json().zips[0].reason, /could not unpack this zip cleanly.*used none of it/);
    assert.deepEqual(leftovers(p), []);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- --course
test('--course is written on every new entry, as the last key, with tidy spacing', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Notes.md'), '# Notes\nCourse notes.\n');
    const r = runScript('ingest.mjs', [box.path('Notes.md'), '--course', '  Corporate   Finance \n', '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const [e] = manifestLines(p);
    assert.equal(e.course, 'Corporate Finance');
    assert.deepEqual(Object.keys(e).slice(-2), ['note', 'course']);
    assert.equal(r.json().files[0].course, 'Corporate Finance');

    const p2 = makeProject();
    try {
      runScript('ingest.mjs', [box.path('Notes.md'), '--course=Strategy'], p2);
      assert.equal(manifestLines(p2)[0].course, 'Strategy');
    } finally {
      p2.cleanup();
    }
  } finally {
    p.cleanup();
  }
});

test('--course: a missing or empty name is a usage error; a file already in the vault keeps its first course', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Notes.md'), '# Notes\n');
    assert.equal(runScript('ingest.mjs', [box.path('Notes.md'), '--course'], p).status, 2);
    assert.equal(runScript('ingest.mjs', [box.path('Notes.md'), '--course', ''], p).status, 2);
    assert.equal(runScript('ingest.mjs', [box.path('Notes.md'), '--course', '   '], p).status, 2);
    assert.equal(existsSync(p.path(...MANIFEST.split('/'))), false, 'a usage error stores nothing');

    runScript('ingest.mjs', [box.path('Notes.md'), '--course', 'Strategy'], p);
    const again = runScript('ingest.mjs', [box.path('Notes.md'), '--course', 'Marketing', '--json'], p).json();
    assert.equal(again.counts.duplicate, 1);
    assert.equal(again.files[0].course, 'Strategy');
    assert.equal(manifestLines(p).length, 1);
    assert.equal(manifestLines(p)[0].course, 'Strategy');
  } finally {
    p.cleanup();
  }
});

test('--course on a zip is written on every file that came out of it', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Strategy.zip'), buildZip(COURSE_FILES));
    const r = runScript('ingest.mjs', [box.path('Strategy.zip'), '--course', 'Strategy', '--json'], p);
    assert.equal(r.status, 0, r.stdout);
    const lines = manifestLines(p);
    assert.equal(lines.length, 4);
    for (const e of lines) assert.equal(e.course, 'Strategy');
  } finally {
    p.cleanup();
  }
});

test('cleanCourse keeps one tidy line of at most 120 characters', () => {
  assert.equal(cleanCourse('  Corporate\tFinance\n'), 'Corporate Finance');
  assert.equal(cleanCourse(undefined), '');
  assert.equal(cleanCourse(null), '');
  assert.equal(cleanCourse('x'.repeat(300)).length, 120);
  assert.equal(cleanCourse('A\u0000B'), 'A B');
});

// ------------------------------------------------------------- plain-language output
test('the human summary names the zips that were opened', { skip: NEEDS_TOOL }, () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Strategy.zip'), buildZip(COURSE_FILES));
    const r = runScript('ingest.mjs', [box.path('Strategy.zip')], p);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /Ingest finished\. I looked at 6 files\./);
    assert.match(r.stdout, /Zips opened: +1 \(Strategy\.zip\)/);
    assert.match(r.stdout, /New: +4/);
  } finally {
    p.cleanup();
  }
});

test('readZipIndex and checkZipIndex are usable on their own', () => {
  const { p, box } = setup();
  try {
    writeFileSync(box.path('Plain.zip'), buildZip([{ name: 'Week 1/' }, { name: 'Week 1/a.md', data: 'hello' }, { name: 'b.md', data: 'hi!' }]));
    const entries = readZipIndex(box.path('Plain.zip'));
    assert.deepEqual(entries.map((e) => [e.name, e.dir, e.size]), [['Week 1/', true, 0], ['Week 1/a.md', false, 5], ['b.md', false, 3]]);
    assert.deepEqual(checkZipIndex(entries), { files: 2, bytes: 8 });
  } finally {
    p.cleanup();
  }
});
