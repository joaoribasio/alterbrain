import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, makeProject, runScript, read } from '../fixtures/scripts/helpers.mjs';
import { aiRestrictionHits, applyLatestOnly, htmlToText, inferKind, isJunk, sanitiseName, toFenced } from '../../system/scripts/ingest.mjs';

const MANIFEST = 'vault/40_sources/manifest.jsonl';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const manifestLines = (p) =>
  read(p, MANIFEST)
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

/** A project plus a private copy of the ingest fixtures and some runtime junk. */
function setup() {
  const p = makeProject();
  const box = makeProject();
  const inbox = box.path('inbox');
  const cleanProject = p.cleanup;
  p.cleanup = () => {
    cleanProject();
    box.cleanup();
  };
  cpSync(join(FIXTURES, 'ingest'), inbox, { recursive: true });
  rmSync(join(inbox, 'no-ai.md')); // the AI-notice test copies it on its own
  writeFileSync(join(inbox, '.DS_Store'), 'junk');
  writeFileSync(join(inbox, '~$lock.docx'), 'junk');
  writeFileSync(join(inbox, 'Thumbs.db'), 'junk');
  for (const d of ['.git', 'node_modules', '.obsidian']) {
    mkdirSync(join(inbox, d), { recursive: true });
    writeFileSync(join(inbox, d, 'inside.md'), `junk in ${d}`);
  }
  return { p, inbox };
}

test('ingests a folder recursively, skips junk, dedupes by content, writes the manifest', () => {
  const { p, inbox } = setup();
  try {
    const r = runScript('ingest.mjs', [inbox, '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const out = r.json();
    // 12 real files: notes, duplicate of notes, html, csv, pptx, deep.txt and 6 in series/
    assert.equal(out.counts.new, 11);
    assert.equal(out.counts.duplicate, 1);
    assert.equal(out.counts.error, 0);
    const junk = out.files.filter((f) => f.reason === 'junk');
    assert.equal(junk.length, 3, 'only the three junk files at the top level are seen; junk folders are not entered');
    assert.ok(!out.files.some((f) => /inside\.md$/.test(f.path)));

    const lines = manifestLines(p);
    assert.equal(lines.length, 11);
    const date = /^vault\/40_sources\/raw\/\d{4}\/\d{4}-\d{2}-\d{2} /;
    for (const e of lines) {
      assert.deepEqual(
        Object.keys(e),
        ['id', 'sha256', 'origin', 'stored', 'text', 'text_status', 'size', 'ext', 'kind', 'ingested', 'local_only', 'note'],
      );
      assert.equal(e.id, e.sha256.slice(0, 8));
      assert.match(e.stored, date);
      assert.ok(existsSync(p.path(...e.stored.split('/'))), `${e.stored} should exist`);
      assert.equal(e.local_only, false);
      assert.ok(!Number.isNaN(Date.parse(e.ingested)));
      // The raw copy is byte-for-byte the original.
      assert.equal(sha(readFileSync(p.path(...e.stored.split('/')))), e.sha256);
    }
  } finally {
    p.cleanup();
  }
});

test('text extraction rules: md and txt copied, html stripped, csv fenced, other types pending', () => {
  const { p, inbox } = setup();
  try {
    runScript('ingest.mjs', [inbox], p);
    const byExt = (name) => manifestLines(p).find((e) => e.origin.endsWith(name));

    const md = byExt('notes.md');
    assert.equal(md.text_status, 'done');
    assert.match(md.text, /raw|text/);
    assert.match(md.text, /^vault\/40_sources\/text\/\d{4}\/\d{4}-\d{2}-\d{2} notes\.md$/, 'no double .md');
    assert.equal(read(p, md.text), readFileSync(join(inbox, 'notes.md'), 'utf8'));

    const txt = byExt('deep.txt');
    assert.match(txt.text, /deep\.txt\.md$/);

    const html = byExt('page.html');
    const htmlText = read(p, html.text);
    assert.match(htmlText, /^# Market entry/m);
    assert.match(htmlText, /Alex & team study demand\./);
    assert.match(htmlText, /^- First point$/m);
    assert.match(htmlText, /^- Second point$/m);
    assert.doesNotMatch(htmlText, /var x|color:red|hidden|<b>/);
    assert.equal(html.kind, 'web');

    const csv = byExt('table.csv');
    assert.match(read(p, csv.text), /^```csv\nsegment,revenue\nstudents,120\nalumni,80\n```\n$/);
    assert.equal(csv.kind, 'sheet');

    const pptx = byExt('deck.pptx');
    assert.equal(pptx.text, null);
    assert.equal(pptx.text_status, 'pending');
    assert.equal(pptx.kind, 'slides');
    assert.ok(readdirSync(p.path('vault', '40_sources', 'text')).length > 0);
  } finally {
    p.cleanup();
  }
});

test('running it twice ingests nothing new (sha256 dedupe against the manifest)', () => {
  const { p, inbox } = setup();
  try {
    runScript('ingest.mjs', [inbox], p);
    const before = read(p, MANIFEST);
    const r = runScript('ingest.mjs', [inbox, '--json'], p);
    assert.equal(r.status, 0);
    const out = r.json();
    assert.equal(out.counts.new, 0);
    assert.equal(out.counts.duplicate, 12);
    assert.equal(read(p, MANIFEST), before);
    const dup = out.files.find((f) => f.status === 'duplicate');
    assert.ok(dup.id && dup.stored);
  } finally {
    p.cleanup();
  }
});

test('--latest-only keeps the highest version of a series (numeric, not alphabetical)', () => {
  const { p, inbox } = setup();
  try {
    const r = runScript('ingest.mjs', [join(inbox, 'series'), '--latest-only', '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const out = r.json();
    const added = out.files.filter((f) => f.status === 'new').map((f) => f.path.split(/[\\/]/).pop()).sort();
    assert.deepEqual(added, ['Other_v2.md', 'Report_v1.10.md', 'Unversioned.md']);
    const older = out.files.filter((f) => f.reason === 'older-version').map((f) => f.path.split(/[\\/]/).pop()).sort();
    assert.deepEqual(older, ['Report_v0.1.md', 'Report_v1.0.md', 'Report_v1.2.md']);
    assert.equal(manifestLines(p).length, 3);
  } finally {
    p.cleanup();
  }
});

test('--kind and --origin are recorded; a bad --kind is a usage error', () => {
  const { p, inbox } = setup();
  try {
    const r = runScript('ingest.mjs', [join(inbox, 'page.html'), '--kind', 'email', '--origin', 'https://example.com/page', '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const [e] = manifestLines(p);
    assert.equal(e.kind, 'email');
    assert.equal(e.origin, 'https://example.com/page');
    assert.equal(runScript('ingest.mjs', [join(inbox, 'notes.md'), '--kind', 'banana'], p).status, 2);
    assert.equal(runScript('ingest.mjs', [], p).status, 2);
    assert.equal(runScript('ingest.mjs', [inbox, '--wat'], p).status, 2);
  } finally {
    p.cleanup();
  }
});

test('a missing path is reported and exits 1, other files still go in', () => {
  const { p, inbox } = setup();
  try {
    const r = runScript('ingest.mjs', [join(inbox, 'notes.md'), join(inbox, 'nope.pdf'), '--json'], p);
    assert.equal(r.status, 1);
    const out = r.json();
    assert.equal(out.counts.new, 1);
    assert.equal(out.counts.error, 1);
    assert.equal(out.files.find((f) => f.status === 'error').reason, 'not found');
  } finally {
    p.cleanup();
  }
});

test('files over the size limit go to raw/_local and are flagged local_only', () => {
  const { p, inbox } = setup();
  try {
    const big = join(inbox, 'lecture-recording.mp4');
    writeFileSync(big, Buffer.alloc(64, 7));
    const r = runScript('ingest.mjs', [big, '--json'], p, { ALTERBRAIN_MAX_RAW_BYTES: '10' });
    assert.equal(r.status, 0, r.stderr);
    const [e] = manifestLines(p);
    assert.equal(e.local_only, true);
    assert.match(e.stored, /^vault\/40_sources\/raw\/_local\/\d{4}-\d{2}-\d{2} lecture-recording\.mp4$/);
    assert.ok(existsSync(p.path(...e.stored.split('/'))));
    assert.equal(e.text_status, 'none');
    assert.match(e.note, /Too big|No text/);
  } finally {
    p.cleanup();
  }
});

test('two different files with the same name on the same day do not overwrite each other', () => {
  const { p, inbox } = setup();
  try {
    mkdirSync(join(inbox, 'a'));
    mkdirSync(join(inbox, 'b'));
    writeFileSync(join(inbox, 'a', 'Summary.pdf'), 'first pdf');
    writeFileSync(join(inbox, 'b', 'Summary.pdf'), 'second pdf');
    const r = runScript('ingest.mjs', [join(inbox, 'a'), join(inbox, 'b'), '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const stored = manifestLines(p).map((e) => e.stored);
    assert.equal(new Set(stored).size, 2);
    assert.ok(stored.some((s) => /Summary \(2\)\.pdf$/.test(s)));
    for (const e of manifestLines(p)) assert.equal(e.kind, 'pdf');
  } finally {
    p.cleanup();
  }
});

test('empty files are skipped, not ingested', () => {
  const { p, inbox } = setup();
  try {
    writeFileSync(join(inbox, 'empty.txt'), '');
    const out = runScript('ingest.mjs', [join(inbox, 'empty.txt'), '--json'], p).json();
    assert.equal(out.counts.new, 0);
    assert.equal(out.files[0].reason, 'empty');
  } finally {
    p.cleanup();
  }
});

test('a damaged manifest line does not stop ingestion', () => {
  const { p, inbox } = setup();
  try {
    mkdirSync(p.path('vault', '40_sources'), { recursive: true });
    writeFileSync(p.path(...MANIFEST.split('/')), 'this is not json\n');
    const out = runScript('ingest.mjs', [join(inbox, 'notes.md'), '--json'], p).json();
    assert.equal(out.counts.new, 1);
    assert.equal(out.manifest_bad_lines, 1);
  } finally {
    p.cleanup();
  }
});

test('human summary is plain English', () => {
  const { p, inbox } = setup();
  try {
    const r = runScript('ingest.mjs', [join(inbox, 'notes.md'), join(inbox, 'deck.pptx')], p);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Ingest finished\. I looked at 2 files\./);
    assert.match(r.stdout, /New: +2/);
    assert.match(r.stdout, /Claude will read 1 file directly/);
  } finally {
    p.cleanup();
  }
});

// ------------------------------------------------------------- unit tests
test('sanitiseName makes names safe for Windows and macOS', () => {
  assert.equal(sanitiseName('Report: Q1 <draft>?.pdf'), 'Report- Q1 -draft--.pdf');
  assert.equal(sanitiseName('a/b\\c.txt'), 'a-b-c.txt');
  assert.equal(sanitiseName('CON.txt'), '_CON.txt');
  assert.equal(sanitiseName('trailing dots...md'), 'trailing dots.md');
  assert.equal(sanitiseName('...'), 'file');
  assert.ok(sanitiseName('x'.repeat(400) + '.pdf').length <= 140);
  assert.ok(sanitiseName('x'.repeat(400) + '.pdf').endsWith('.pdf'));
});

test('isJunk and inferKind', () => {
  for (const n of ['.DS_Store', 'Thumbs.db', '~$Budget.xlsx', '._notes.md', '.~lock.file.docx#', 'download.crdownload']) {
    assert.equal(isJunk(n), true, n);
  }
  for (const n of ['notes.md', 'Budget.xlsx', 'tilde~name.md']) assert.equal(isJunk(n), false, n);
  assert.equal(inferKind('Syllabus.PDF'), 'pdf');
  assert.equal(inferKind('call transcript.txt'), 'transcript');
  assert.equal(inferKind('mystery.xyz'), 'other');
  assert.equal(inferKind('model.xlsx'), 'sheet');
});

test('htmlToText strips tags and decodes entities; toFenced survives backticks', () => {
  const t = htmlToText('<html><head><title>My &quot;page&quot;</title></head><body><p>Hello&nbsp;<i>world</i> &#38; &#x263A;</p></body></html>');
  assert.match(t, /^# My "page"/);
  assert.match(t, /Hello world & ☺/);
  const f = toFenced('a,b\n```\n1,2\n', 'csv');
  assert.ok(f.startsWith('````csv\n'));
  assert.ok(f.trimEnd().endsWith('````'));
});

test('applyLatestOnly only compares files in the same folder with the same extension', () => {
  const box = makeProject();
  try {
    const files = [
      'one/Plan_v1.md', 'one/Plan_v2.md', // same series: v2 wins
      'one/Plan_v3.txt', // different extension: its own series
      'two/Plan_v1.md', // same name, other folder: its own series
      'one/Plan (v4).docx', 'one/Plan [v5].docx', // bracket styles
    ].map((rel) => {
      const abs = box.path(...rel.split('/'));
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, rel);
      return { abs, junk: false };
    });
    const { keep, dropped } = applyLatestOnly(files);
    const rel = (f) => f.abs.slice(box.dir.length + 1).split(/[\\/]/).join('/');
    assert.deepEqual(keep.map(rel).sort(), ['one/Plan [v5].docx', 'one/Plan_v2.md', 'one/Plan_v3.txt', 'two/Plan_v1.md']);
    assert.deepEqual(dropped.map((d) => rel(d.item)).sort(), ['one/Plan (v4).docx', 'one/Plan_v1.md']);
  } finally {
    box.cleanup();
  }
});

/* ---------------- code-safety hardening ---------------- */

test('F15: files that look like secrets are never copied into the vault', () => {
  const p = makeProject();
  const box = makeProject();
  try {
    const inbox = box.path('inbox');
    mkdirSync(join(inbox, '.ssh'), { recursive: true });
    const names = ['.env', '.env.local', 'server.pem', 'id_rsa', 'id_ed25519.pub', 'credentials.json', 'credentials-prod.json', 'client_secret_123.json', 'my passwords.csv', 'passwords.xlsx', '.npmrc', 'cert.p12', 'secrets.yaml'];
    for (const n of names) writeFileSync(join(inbox, n), 'something\n');
    writeFileSync(join(inbox, '.ssh', 'config'), 'Host x\n');
    writeFileSync(join(inbox, '.env.example'), 'API_KEY=\n');
    writeFileSync(join(inbox, 'Lecture notes.md'), '# Lecture\nNothing secret here.\n');
    const out = runScript('ingest.mjs', [inbox, '--json'], p).json();
    const skipped = out.files.filter((f) => f.status === 'skipped' && /password or key file/.test(f.reason)).map((f) => f.path.split(/[\\/]/).pop());
    assert.deepEqual(skipped.sort(), [...names, 'config'].sort());
    const fresh = out.files.filter((f) => f.status === 'new').map((f) => f.path.split(/[\\/]/).pop()).sort();
    assert.deepEqual(fresh, ['.env.example', 'Lecture notes.md']);
    assert.equal(readdirSync(p.path('vault', '40_sources', 'raw', String(new Date().getFullYear()))).length, 2);
    assert.equal(manifestLines(p).length, 2);
  } finally {
    p.cleanup();
    box.cleanup();
  }
});

test('F15: a text file that holds a key is taken out again right after the copy', () => {
  const p = makeProject();
  const box = makeProject();
  try {
    const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
    writeFileSync(box.path('notes.md'), `My notes\n${pem}\nabc\n`);
    writeFileSync(box.path('Slides.key'), `${pem}\nabc\n`); // a private key that happens to end in .key
    writeFileSync(box.path('Keynote.key'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3])); // a Keynote file is a zip
    const out = runScript('ingest.mjs', [box.path('notes.md'), box.path('Slides.key'), box.path('Keynote.key'), '--json'], p).json();
    const by = Object.fromEntries(out.files.map((f) => [f.path.split(/[\\/]/).pop(), f]));
    assert.equal(by['notes.md'].status, 'skipped');
    assert.match(by['notes.md'].reason, /holds a private key/);
    assert.equal(by['Slides.key'].status, 'skipped');
    assert.equal(by['Keynote.key'].status, 'new', 'a Keynote presentation is not a key');
    assert.doesNotMatch(JSON.stringify(out), /BEGIN/, 'the key is never echoed');
    // nothing of the notes file is left behind
    const raws = readdirSync(p.path('vault', '40_sources', 'raw', String(new Date().getFullYear())));
    assert.deepEqual(raws.filter((n) => /notes|Slides/.test(n)), []);
    assert.equal(existsSync(p.path('vault', '40_sources', 'text')) ? readdirSync(p.path('vault', '40_sources', 'text', String(new Date().getFullYear()))).filter((n) => /notes|Slides/.test(n)).length : 0, 0);
    assert.equal(manifestLines(p).length, 1);
  } finally {
    p.cleanup();
    box.cleanup();
  }
});

test('F15: the manifest keeps the file name, not the folder path, unless --origin says otherwise', () => {
  const p = makeProject();
  const box = makeProject();
  try {
    mkdirSync(box.path('Users', 'alex', 'Documents'), { recursive: true });
    const file = box.path('Users', 'alex', 'Documents', 'Brief.md');
    writeFileSync(file, '# Brief\nA plain note.\n');
    runScript('ingest.mjs', [file], p);
    const [entry] = manifestLines(p);
    assert.equal(entry.origin, 'Brief.md');
    assert.doesNotMatch(JSON.stringify(entry), /alex/i);
    const p2 = makeProject();
    try {
      runScript('ingest.mjs', [file, '--origin', 'Email from the programme office'], p2);
      assert.equal(manifestLines(p2)[0].origin, 'Email from the programme office');
    } finally {
      p2.cleanup();
    }
  } finally {
    p.cleanup();
    box.cleanup();
  }
});

test('C10: a file that says it must not be used with AI tools is copied and flagged', () => {
  const p = makeProject();
  try {
    const f = p.path('no-ai.md');
    cpSync(join(FIXTURES, 'ingest', 'no-ai.md'), f);
    const plain = p.path('plain.md');
    writeFileSync(plain, '# Plain\n\nNothing special here.\n');
    const r = runScript('ingest.mjs', [f, plain, '--json'], p);
    assert.equal(r.status, 0, r.stderr);
    const out = r.json();
    const flagged = out.files.find((x) => /no-ai.md$/.test(x.path));
    const clean = out.files.find((x) => /plain.md$/.test(x.path));
    assert.equal(flagged.status, 'new', 'the raw copy is still made');
    assert.equal(flagged.ai_notice, true);
    assert.match(flagged.ai_notice_text, /must not be used with generative AI tools/);
    assert.equal(clean.ai_notice, undefined);
    // the manifest keeps its usual keys
    assert.ok(!manifestLines(p).some((e) => 'ai_notice' in e));
  } finally {
    p.cleanup();
  }
  const q = makeProject();
  try {
    const g = q.path('no-ai.md');
    cpSync(join(FIXTURES, 'ingest', 'no-ai.md'), g);
    const human = runScript('ingest.mjs', [g], q);
    assert.match(human.stdout, /This file says it must not be used with AI tools/);
  } finally {
    q.cleanup();
  }
});

test('C10: aiRestrictionHits finds the usual phrasings and nothing else', () => {
  assert.ok(aiRestrictionHits('These notes may not be used with AI.').length === 1);
  assert.ok(aiRestrictionHits('The data must not be uploaded to any AI chatbot.').length === 1);
  assert.ok(aiRestrictionHits('Generative AI tools are not permitted for this brief.').length === 1);
  assert.deepEqual(aiRestrictionHits('A normal reading about market entry and pricing.'), []);
  assert.deepEqual(aiRestrictionHits(''), []);
  assert.deepEqual(aiRestrictionHits(null), []);
});

test('C10: the AI term is anchored, so airline, aims and aircraft are not flagged', () => {
  for (const ok of [
    'Do not share this case outside the airline industry panel.',
    'These figures may not be used for aims other than the course.',
    'This data should not be used in aircraft maintenance decisions.',
    'Do not use it for aid projects.',
    'Never paste it into an ai thing.',
  ]) assert.deepEqual(aiRestrictionHits(ok), [], ok);
});

test('C10: aiRestrictionHits also finds training, prohibition and chatbot phrasings', () => {
  for (const bad of [
    'This text may not be used for training AI models.',
    'Use of ChatGPT is prohibited.',
    'Do not enter this into any chatbot.',
    'This brief must not be uploaded to ChatGPT.',
    'Do not use generative AI tools for the assignment.',
    'The use of A.I. tools is strictly forbidden.',
  ]) assert.equal(aiRestrictionHits(bad).length, 1, bad);
});

test('C10: --ai-pending flags a saved file with no note, keeps the answer in state/local, and the manifest stays plain', () => {
  const p = makeProject();
  try {
    const f = p.path('no-ai.md');
    cpSync(join(FIXTURES, 'ingest', 'no-ai.md'), f);
    const plain = p.path('plain.md');
    writeFileSync(plain, '# Plain\n\nNothing special here.\n');
    assert.equal(runScript('ingest.mjs', [f, plain], p).status, 0);
    // a later session: the flag is worked out again from the files
    const first = runScript('ingest.mjs', ['--ai-pending', '--json'], p);
    assert.equal(first.status, 0, first.stderr);
    const a = first.json();
    assert.equal(a.flagged.length, 1);
    assert.equal(a.flagged[0].ai_notice, true);
    assert.match(a.flagged[0].ai_notice_text, /must not be used with generative AI tools/);
    assert.equal(a.flagged[0].decision, null);
    assert.equal(a.undecided, 1);
    assert.ok(!manifestLines(p).some((e) => 'ai_notice' in e));
    // the answer is saved once, on this computer only
    const d = runScript('ingest.mjs', ['--ai-decide', a.flagged[0].id, 'held'], p);
    assert.equal(d.status, 0, d.stderr);
    assert.ok(existsSync(p.path('state', 'local', 'ai-decisions.json')));
    const b = runScript('ingest.mjs', ['--ai-pending', '--json'], p).json();
    assert.equal(b.flagged[0].decision, 'held');
    assert.equal(b.undecided, 0);
    assert.equal(b.held, 1);
    // a note for the file ends the check
    const sha256 = manifestLines(p).find((e) => /no-ai/.test(e.stored)).sha256;
    mkdirSync(p.path('vault', '40_sources', 'notes'), { recursive: true });
    writeFileSync(p.path('vault', '40_sources', 'notes', 'Briefing.md'), `---\nsha256: ${sha256}\n---\nNote\n`);
    assert.equal(runScript('ingest.mjs', ['--ai-pending', '--json'], p).json().flagged.length, 0);
    // bad input
    assert.equal(runScript('ingest.mjs', ['--ai-decide', 'zzzzzzzz', 'held'], p).status, 2);
    assert.equal(runScript('ingest.mjs', ['--ai-decide', sha256, 'maybe'], p).status, 2);
  } finally {
    p.cleanup();
  }
});
