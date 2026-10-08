import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MigrationStop, readJsonFile, runMigration, setFrontmatterLine, unreadableSettings, writeFileAtomic, writeJsonAtomic } from '../../system/lib/migrate.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB_URL = pathToFileURL(join(REPO, 'system', 'lib', 'migrate.mjs')).href;
const TMP_BASE = join(REPO, 'state', 'local', 'tmp');
mkdirSync(TMP_BASE, { recursive: true });
const made = [];

/** A throw-away project folder (it needs a system/ folder for projectRoot()). */
function project() {
  const root = mkdtempSync(join(TMP_BASE, 'mig-lib-'));
  mkdirSync(join(root, 'system'), { recursive: true });
  made.push(root);
  return root;
}
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

// The upgrade script used for the command-line contract. MODE picks what the upgrade does.
function script(root) {
  const file = join(root, 'upgrade.mjs');
  writeFileSync(
    file,
    `import { runMigration, MigrationStop, writeFileAtomic } from ${JSON.stringify(LIB_URL)};
import { join } from 'node:path';
await runMigration(async ({ root, dryRun, report }) => {
  const mode = process.env.MODE;
  if (mode === 'nothing') return;
  if (mode === 'two') { report('First change.'); await Promise.resolve(); report('Second change.'); report('   '); return; }
  if (mode === 'stop') { report('Half done.'); throw new MigrationStop('Your notes folder is locked, so I stopped.'); }
  if (mode === 'boom') throw new Error('boom');
  if (mode === 'write') { writeFileAtomic(join(root, 'out.txt'), 'written\\n'); report('Wrote a file.'); return; }
  if (mode === 'info') { report(root + '|' + dryRun); return; }
});
`,
  );
  return file;
}

function run(root, mode, args = []) {
  const res = spawnSync(process.execPath, [script(root), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, MODE: mode },
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

test('runMigration: no change prints exactly "Nothing to do." and exits 0', () => {
  const r = run(project(), 'nothing');
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'Nothing to do.');
  assert.equal(r.stderr, '');
});

test('runMigration: each reported sentence is on its own line; blank ones are ignored', () => {
  const r = run(project(), 'two');
  assert.equal(r.code, 0);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['First change.', 'Second change.']);
});

test('runMigration: the folder and the dry-run flag are passed in', () => {
  const root = project();
  const r = run(root, 'info');
  assert.equal(r.stdout.trim(), `${root}|false`);
  assert.equal(run(root, 'info', ['--dry-run']).stdout.trim(), `Would: ${root}|true`);
});

test('runMigration: a MigrationStop prints its sentence on standard error and exits 1', () => {
  const r = run(project(), 'stop');
  assert.equal(r.code, 1);
  assert.equal(r.stderr.trim(), 'Your notes folder is locked, so I stopped.');
  assert.equal(r.stdout, '', 'a stopped upgrade reports nothing as done');
});

test('runMigration: any other error is turned into one plain sentence and exits 1', () => {
  const r = run(project(), 'boom');
  assert.equal(r.code, 1);
  assert.equal(r.stderr.trim(), 'This upgrade stopped because of an unexpected problem (boom). Nothing else was changed.');
  assert.doesNotMatch(r.stderr, /\bat \w+.*\.mjs/, 'no stack trace');
});

test('runMigration: --dry-run starts each sentence with "Would: " and writes nothing', () => {
  const root = project();
  const dry = run(root, 'write', ['--dry-run']);
  assert.equal(dry.code, 0);
  assert.equal(dry.stdout.trim(), 'Would: Wrote a file.');
  assert.equal(existsSync(join(root, 'out.txt')), false);
  const real = run(root, 'write');
  assert.equal(real.stdout.trim(), 'Wrote a file.');
  assert.equal(readFileSync(join(root, 'out.txt'), 'utf8'), 'written\n');
  // with nothing to say, a dry run still says exactly "Nothing to do."
  assert.equal(run(root, 'nothing', ['--dry-run']).stdout.trim(), 'Nothing to do.');
});

test('runMigration: an unknown option prints the usage and exits 2', () => {
  const root = project();
  for (const args of [['--force'], ['--dry-run', '--dry-run'], ['extra']]) {
    const r = run(root, 'nothing', args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.stderr, /Usage:/);
    assert.equal(r.stdout, '');
  }
});

test('runMigration: returns the exit code it sets (used by the harness)', async () => {
  const before = process.exitCode;
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await runMigration(async () => {}, ['--nope']), 2);
  } finally {
    console.error = original;
    process.exitCode = before;
  }
});

// ---------------------------------------------------------------- readJsonFile
test('readJsonFile: missing, valid with a byte order mark, and unreadable', () => {
  const root = project();
  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = root;
  try {
    mkdirSync(join(root, 'config'), { recursive: true });
    const file = join(root, 'config', 'brain.json');
    assert.deepEqual(readJsonFile(file), { exists: false });
    writeFileSync(file, '﻿{"schema":1}');
    assert.deepEqual(readJsonFile(file), { exists: true, value: { schema: 1 } });
    writeFileSync(file, '{oops');
    assert.throws(() => readJsonFile(file), (e) => {
      assert.ok(e instanceof MigrationStop);
      assert.equal(e.message, 'Your settings file config/brain.json could not be read, so I changed nothing. Run /health-check, then finish the update again.');
      return true;
    });
    assert.ok(unreadableSettings(file) instanceof MigrationStop);
    writeFileSync(file, '');
    assert.throws(() => readJsonFile(file), MigrationStop, 'an empty file is not valid JSON');
  } finally {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
  }
});

// ---------------------------------------------------------------- atomic writes
test('writeFileAtomic: creates folders, replaces the file and leaves no temporary file', () => {
  const root = project();
  const file = join(root, 'a', 'b', 'note.md');
  assert.equal(writeFileAtomic(file, 'one\n'), true);
  assert.equal(readFileSync(file, 'utf8'), 'one\n');
  writeFileAtomic(file, 'two\n');
  assert.equal(readFileSync(file, 'utf8'), 'two\n');
  assert.deepEqual(readdirSync(join(root, 'a', 'b')), ['note.md']);
  writeFileAtomic(file, '﻿with a mark\n');
  assert.equal(readFileSync(file)[0], 0xef, 'a byte order mark in the text is kept');
});

test('writeFileAtomic: a target that cannot be replaced stops with a plain sentence and leaves no temporary file', () => {
  const root = project();
  const target = join(root, 'config', 'brain.json');
  mkdirSync(join(target, 'inside'), { recursive: true }); // a folder where the file should go
  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = root;
  try {
    assert.throws(() => writeFileAtomic(target, 'x'), (e) => {
      assert.ok(e instanceof MigrationStop);
      assert.match(e.message, /^I could not save config\/brain\.json/);
      assert.match(e.message, /finish the update again\.$/);
      return true;
    });
  } finally {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
  }
  assert.equal(existsSync(`${target}.ab-tmp`), false);
  assert.ok(existsSync(join(target, 'inside')), 'what was there is untouched');
});

test('writeJsonAtomic: two-space indent and a final newline', () => {
  const root = project();
  const file = join(root, 'x.json');
  writeJsonAtomic(file, { a: [1, 2], b: { c: null } });
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify({ a: [1, 2], b: { c: null } }, null, 2) + '\n');
});

// ---------------------------------------------------------------- setFrontmatterLine
const NOTE = ['---', 'type: "course"', 'code: "STR"', 'term: "Block 1"', 'school: "Example Business School"', 'ai_policy: "unknown"', '---', '# Strategy', '', 'Body line.', ''];
const lf = (lines) => lines.join('\n');
const crlf = (lines) => lines.join('\r\n');
const AFTER = { after: ['school', 'term', 'code'] };

test('setFrontmatterLine: inserts after the first key of "after" that exists (LF)', () => {
  const out = setFrontmatterLine(lf(NOTE), 'programme', '"[[MBA]]"', AFTER);
  assert.equal(out, lf([...NOTE.slice(0, 5), 'programme: "[[MBA]]"', ...NOTE.slice(5)]));
});

test('setFrontmatterLine: the order of "after" decides, not the order in the file', () => {
  const noSchool = NOTE.filter((l) => !l.startsWith('school:'));
  const out = setFrontmatterLine(lf(noSchool), 'programme', '"x"', AFTER);
  assert.ok(out.includes('term: "Block 1"\nprogramme: "x"\n'), out);
});

test('setFrontmatterLine: goes before the closing --- when none of the "after" keys exist', () => {
  const out = setFrontmatterLine(lf(NOTE), 'programme', '"x"', { after: ['nothing-here'] });
  assert.ok(out.includes('ai_policy: "unknown"\nprogramme: "x"\n---\n'), out);
  assert.equal(setFrontmatterLine(lf(NOTE), 'programme', '"x"'), out, 'no "after" list: same place');
});

test('setFrontmatterLine: replaces a line that already exists, including its list lines', () => {
  const withEmpty = lf([...NOTE.slice(0, 5), 'programme: ""', ...NOTE.slice(5)]);
  assert.equal(setFrontmatterLine(withEmpty, 'programme', '"[[MBA]]"', AFTER), lf([...NOTE.slice(0, 5), 'programme: "[[MBA]]"', ...NOTE.slice(5)]));
  const withList = lf([...NOTE.slice(0, 5), 'programme:', '  - old', '  - older', ...NOTE.slice(5)]);
  assert.equal(setFrontmatterLine(withList, 'programme', '"[[MBA]]"', AFTER), lf([...NOTE.slice(0, 5), 'programme: "[[MBA]]"', ...NOTE.slice(5)]));
});

test('setFrontmatterLine: a key with a list is skipped over when inserting after it', () => {
  const note = lf(['---', 'type: "course"', 'school:', '  - Alpha', '  - Beta', 'term: "1"', '---', 'Body']);
  assert.equal(setFrontmatterLine(note, 'programme', '"x"', { after: ['school'] }), lf(['---', 'type: "course"', 'school:', '  - Alpha', '  - Beta', 'programme: "x"', 'term: "1"', '---', 'Body']));
});

test('setFrontmatterLine: CRLF files stay CRLF, for an insert and for a replace', () => {
  const inserted = setFrontmatterLine(crlf(NOTE), 'programme', '"x"', AFTER);
  assert.equal(inserted, crlf([...NOTE.slice(0, 5), 'programme: "x"', ...NOTE.slice(5)]));
  assert.equal(inserted.replace(/\r\n/g, '').includes('\n'), false, 'no bare line feed appears');
  const replaced = setFrontmatterLine(crlf([...NOTE.slice(0, 5), 'programme: ""', ...NOTE.slice(5)]), 'programme', '"y"', AFTER);
  assert.equal(replaced, crlf([...NOTE.slice(0, 5), 'programme: "y"', ...NOTE.slice(5)]));
});

test('setFrontmatterLine: a leading byte order mark is kept', () => {
  const out = setFrontmatterLine(`﻿${lf(NOTE)}`, 'programme', '"x"', AFTER);
  assert.equal(out.charCodeAt(0), 0xfeff);
  assert.equal(out.slice(1), setFrontmatterLine(lf(NOTE), 'programme', '"x"', AFTER));
  const both = setFrontmatterLine(`﻿${crlf(NOTE)}`, 'programme', '"x"', AFTER);
  assert.equal(both, `﻿${setFrontmatterLine(crlf(NOTE), 'programme', '"x"', AFTER)}`);
});

test('setFrontmatterLine: no frontmatter, or one that never closes, returns the text unchanged', () => {
  for (const text of ['# Just a note\n\nschool: "x"\n', '', '---\ntype: "course"\nno closing line\n', 'text first\n---\nschool: "x"\n---\n']) {
    assert.equal(setFrontmatterLine(text, 'programme', '"x"', AFTER), text);
  }
});

test('setFrontmatterLine: never touches the body, even a line that looks like the key or another ---', () => {
  const note = lf([...NOTE.slice(0, 5), '---', '# Strategy', 'programme: "in the body"', '---', 'school: "also body"', '']);
  const out = setFrontmatterLine(note, 'programme', '"[[MBA]]"', AFTER);
  assert.equal(out, lf([...NOTE.slice(0, 5), 'programme: "[[MBA]]"', '---', '# Strategy', 'programme: "in the body"', '---', 'school: "also body"', '']));
});

test('setFrontmatterLine: does not mistake a key that only starts the same way', () => {
  const note = lf(['---', 'programme_notes: "x"', 'school: "S"', '---', '']);
  assert.equal(setFrontmatterLine(note, 'programme', '"y"', AFTER), lf(['---', 'programme_notes: "x"', 'school: "S"', 'programme: "y"', '---', '']));
});
