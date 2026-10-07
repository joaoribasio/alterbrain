// The small pieces behind the big-file handling (ADR 0020): the attribute patterns, the rules file, the size limit.
// No Git LFS program is needed here; git itself checks that every pattern matches exactly the file it was made for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LFS_DEFAULT_MIN_MB, LFS_FILE_LIMIT_BYTES, addLfsRules, attributePattern, attributeValues, classifyError, lfsMaxBytes, lfsMinBytes, lfsRuleLine,
} from '../../system/lib/git.mjs';
import { cleanup, git, makeProject, newTmp, write } from '../fixtures/scripts/lfs-helpers.mjs';

const MB = 1024 * 1024;

/** Run a function with some environment variables set (undefined removes one), then put them back. */
function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* ---------------- patterns ---------------- */

test('attributePattern: the exact file matches, look-alikes and other folders do not (git is the judge)', () => {
  const { parent, root } = makeProject();
  try {
    // [name below vault/, a look-alike that must NOT match]
    const cases = [
      ['plain.pdf', 'plain.pdx'],
      ['top.zip', 'sub/top.zip'], // a file directly in vault/ must not match the same name deeper down
      ['my file.pdf', 'my  file.pdf'],
      ['Ünï cødé.pdf', 'Unï cødé.pdf'],
      ['日本語 notes.zip', '日本語 notes.zi'],
      ['report [final] (2).pdf', 'report f (2).pdf'],
      ['a#b.pdf', 'a.pdf'],
      ['!first.pdf', 'first.pdf'],
      ['#first.pdf', 'first.pdf'],
      ['sub dir/deep file.mov', 'sub dir/deep file.mo'],
      ['a*b.pdf', 'aXb.pdf'],
      ['a?b.pdf', 'aXb.pdf'],
      ['say "hi" now.pdf', 'say hi now.pdf'],
      ['tab\there.pdf', 'tab here.pdf'],
      ['trailing space .pdf', 'trailing space.pdf'],
      ['ends with a space ', 'ends with a space'],
      [' starts with a space.pdf', 'starts with a space.pdf'],
    ];
    if (process.platform !== 'win32') cases.push(['back\\slash.pdf', 'backXslash.pdf']);
    const rules = cases.map(([name]) => lfsRuleLine(name));
    mkdirSync(join(root, 'vault'), { recursive: true });
    writeFileSync(join(root, 'vault', '.gitattributes'), `${rules.join('\n')}\n`);
    const values = attributeValues(root, cases.flatMap(([name, other]) => [`vault/${name}`, `vault/${other}`]));
    for (const [name, other] of cases) {
      assert.equal(values.get(`vault/${name}`), 'lfs', `the rule matches ${JSON.stringify(name)}\n${lfsRuleLine(name)}`);
      if (!cases.some(([n]) => n === other)) assert.equal(values.get(`vault/${other}`), 'unspecified', `the rule for ${JSON.stringify(name)} does not match ${JSON.stringify(other)}`);
    }
  } finally {
    cleanup(parent);
  }
});

test('attributePattern: wildcard characters are escaped, spaces and quotes put the pattern in double quotes', () => {
  assert.equal(attributePattern('plain.pdf'), '/plain.pdf');
  assert.equal(attributePattern('a/b.pdf'), '/a/b.pdf');
  assert.equal(attributePattern('a b.pdf'), '"/a b.pdf"');
  assert.equal(attributePattern('x [1].pdf'), '"/x \\\\[1\\\\].pdf"');
  assert.equal(attributePattern('s*.pdf'), '/s\\*.pdf');
  assert.equal(attributePattern('say "hi".pdf'), '"/say \\"hi\\".pdf"');
  assert.equal(attributePattern('日本語.pdf'), '/日本語.pdf');
  assert.equal(lfsRuleLine('a b.pdf'), '"/a b.pdf" filter=lfs diff=lfs merge=lfs -text');
});

/* ---------------- the rules file ---------------- */

test('addLfsRules: creates the file with a short explanation, keeps everything else, never repeats a rule', () => {
  const dir = newTmp('rules-');
  try {
    assert.equal(addLfsRules(dir, ['a.pdf', 'sub/b c.zip']), 2);
    const first = readFileSync(join(dir, 'vault', '.gitattributes'), 'utf8');
    assert.match(first, /^# Big files \(Git LFS\)/);
    assert.match(first, /^\/a\.pdf filter=lfs diff=lfs merge=lfs -text$/m);
    assert.match(first, /^"\/sub\/b c\.zip" filter=lfs diff=lfs merge=lfs -text$/m);
    assert.equal(addLfsRules(dir, ['a.pdf', 'sub/b c.zip']), 0, 'nothing repeated');
    assert.equal(addLfsRules(dir, ['a.pdf', 'new.mov', 'new.mov']), 1);
    assert.equal(readFileSync(join(dir, 'vault', '.gitattributes'), 'utf8').match(/filter=lfs/g).length, 3);
    assert.ok(readFileSync(join(dir, 'vault', '.gitattributes'), 'utf8').startsWith(first), 'earlier lines stay where they were');
  } finally {
    cleanup(dir);
  }
});

test('addLfsRules: the user\'s own lines stay, a missing final newline and Windows line endings are respected', () => {
  const dir = newTmp('rules-');
  try {
    mkdirSync(join(dir, 'vault'), { recursive: true });
    const file = join(dir, 'vault', '.gitattributes');
    writeFileSync(file, '# mine\r\n*.foo -diff\r\n/special.bar merge=union'); // CRLF, no newline at the end
    assert.equal(addLfsRules(dir, ['x.mov']), 1);
    assert.equal(readFileSync(file, 'utf8'), '# mine\r\n*.foo -diff\r\n/special.bar merge=union\r\n/x.mov filter=lfs diff=lfs merge=lfs -text\r\n');
    assert.equal(addLfsRules(dir, ['x.mov']), 0);
    assert.equal(existsSync(join(dir, 'vault', '.gitattributes.tmp')), false);
  } finally {
    cleanup(dir);
  }
});

/* ---------------- the size limit ---------------- */

test('lfsMinBytes: 50 MB unless config/brain.json says otherwise; nonsense is ignored; the setting is kept between 1 and 95 MB', () => {
  const dir = newTmp('limit-');
  try {
    withEnv({ ALTERBRAIN_LFS_MIN_BYTES: undefined }, () => {
      assert.equal(LFS_DEFAULT_MIN_MB, 50);
      assert.equal(lfsMinBytes(dir), 50 * MB, 'no config file');
      const set = (git) => write(dir, 'config/brain.json', JSON.stringify(git === undefined ? { schema: 1 } : { schema: 1, git }));
      set(undefined);
      assert.equal(lfsMinBytes(dir), 50 * MB, 'no git section');
      set({ auto_commit: true });
      assert.equal(lfsMinBytes(dir), 50 * MB, 'no lfs_min_mb');
      set({ lfs_min_mb: 20 });
      assert.equal(lfsMinBytes(dir), 20 * MB);
      set({ lfs_min_mb: 1.5 });
      assert.equal(lfsMinBytes(dir), 1.5 * MB);
      for (const bad of [0, -5, 'big', null, true, [], {}]) {
        set({ lfs_min_mb: bad });
        assert.equal(lfsMinBytes(dir), 50 * MB, `ignored: ${JSON.stringify(bad)}`);
      }
      set({ lfs_min_mb: 0.2 });
      assert.equal(lfsMinBytes(dir), 1 * MB, 'cut back to 1 MB');
      set({ lfs_min_mb: 500 });
      assert.equal(lfsMinBytes(dir), 95 * MB, 'cut back to 95 MB: GitHub refuses ordinary files near 100 MB');
      write(dir, 'config/brain.json', '﻿' + JSON.stringify({ git: { lfs_min_mb: 30 } }));
      assert.equal(lfsMinBytes(dir), 30 * MB, 'a byte order mark is fine');
      write(dir, 'config/brain.json', '{ "git": { "lfs_min_mb": 30 ');
      assert.equal(lfsMinBytes(dir), 50 * MB, 'an unreadable file gives the default');
    });
    withEnv({ ALTERBRAIN_LFS_MIN_BYTES: '1234' }, () => {
      write(dir, 'config/brain.json', JSON.stringify({ git: { lfs_min_mb: 30 } }));
      assert.equal(lfsMinBytes(dir), 1234, 'the test override wins');
    });
    withEnv({ ALTERBRAIN_LFS_MIN_BYTES: 'abc' }, () => assert.equal(lfsMinBytes(dir), 30 * MB));
    withEnv({ ALTERBRAIN_LFS_MIN_BYTES: '0' }, () => assert.equal(lfsMinBytes(dir), 30 * MB));
  } finally {
    cleanup(dir);
  }
});

test('lfsMaxBytes: 2 GB, with a test override', () => {
  withEnv({ ALTERBRAIN_LFS_MAX_BYTES: undefined }, () => {
    assert.equal(LFS_FILE_LIMIT_BYTES, 2_000_000_000);
    assert.equal(lfsMaxBytes(), 2_000_000_000);
  });
  withEnv({ ALTERBRAIN_LFS_MAX_BYTES: '777' }, () => assert.equal(lfsMaxBytes(), 777));
  withEnv({ ALTERBRAIN_LFS_MAX_BYTES: 'x' }, () => assert.equal(lfsMaxBytes(), 2_000_000_000));
});

/* ---------------- error kinds for uploads of big files ---------------- */

test('classifyError: Git LFS replies are sorted into the kinds git-auto already knows, plus "storage"', () => {
  assert.equal(classifyError('batch response: This repository is over its data quota. Account responsible for LFS bandwidth should purchase more data packs'), 'storage');
  assert.equal(classifyError('batch response: This repository exceeded its LFS budget.'), 'storage');
  assert.equal(classifyError('Post "https://example.invalid/x.git/info/lfs/objects/batch": dial tcp 127.0.0.1:9: connectex: No connection could be made'), 'network');
  assert.equal(classifyError('LFS: Authorization error: https://github.com/a/b.git/info/lfs/objects/batch\nCheck that you have proper access to the repository'), 'auth');
  assert.equal(classifyError('LFS: Repository or object not found: https://github.com/a/b.git/info/lfs/objects/batch'), 'auth');
  assert.equal(classifyError('something unexpected'), 'other');
  assert.equal(classifyError('fatal: unable to access: Could not resolve host: github.com'), 'network');
});
