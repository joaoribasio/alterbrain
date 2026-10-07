// Tests for system/scripts/jobs/ind-sponsors.mjs. Network is mocked; nothing real is downloaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseRegister,
  normaliseName,
  lookup,
  ensureRegister,
  cachePaths,
  parseThresholds,
  loadThresholds,
  pickThresholdKey,
  annualVerdict,
  salaryVerdict,
  main,
  REGISTER_URL,
} from '../../system/scripts/jobs/ind-sponsors.mjs';

// ---- synthetic register page (no real organisations) ----
function fakeRegister({ extraRows = [], rows = 1200, updated = '5 October 2026' } = {}) {
  const base = Array.from({ length: rows }, (_, i) => [`Filler Company ${i} B.V.`, String(10000000 + i)]);
  const named = [
    ['""Quote"" Machines B.V.', '11111111'],
    ['Example Analytics B.V.', '22222222'],
    ['Example Analytics Holding B.V.', '22222223'],
    ['Acme &amp; Sons N.V.', '33333333'],
    ['Caf&eacute; Noord Netherlands B.V.', '44444444'],
    ['Globex Consulting Nederland B.V.', '55555555'],
    ['Initech Recruitment B.V.', '66666666'],
    ...extraRows,
  ];
  const tr = [...named, ...base].map(([n, k]) => `<tr><th scope="row">${n}</th><td>${k}</td></tr>`).join('');
  return `<html><body><p>The overview was last updated on ${updated}.</p><div class="ind-table-wrapper"><table><thead><tr><th scope="col">Organisation</th><th scope="col">KVK (Chamber of Commerce) number</th></tr></thead><tbody>${tr}</tbody></table></div></body></html>`;
}

function mockFetch(html, { status = 200 } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, text: async () => html };
  };
  fn.calls = calls;
  return fn;
}

const tmp = () => mkdtempSync(join(tmpdir(), 'ab-ind-'));

test('parseRegister reads rows, decodes entities and fixes doubled quotes', () => {
  const entries = parseRegister(fakeRegister({ rows: 3 }));
  assert.equal(entries.length, 10);
  assert.equal(entries[0].name, '"Quote" Machines B.V.');
  assert.equal(entries[0].kvk, '11111111');
  assert.equal(entries[3].name, 'Acme & Sons N.V.');
  assert.ok(entries[4].name.startsWith('Caf'));
});

test('normaliseName drops legal forms and filler words', () => {
  assert.equal(normaliseName('Example Analytics B.V.'), 'example analytics');
  assert.equal(normaliseName('EXAMPLE ANALYTICS Holding BV'), 'example analytics');
  assert.equal(normaliseName('Example Analytics N.V.'), 'example analytics');
  assert.equal(normaliseName('Example Analytics B. V.'), 'example analytics');
  assert.equal(normaliseName('Globex Consulting Nederland'), 'globex consulting');
  assert.equal(normaliseName('Booking.com B.V.'), 'booking');
  assert.equal(normaliseName('Café Noord'), 'cafe noord');
  // a name that is only filler keeps its words so it is still searchable
  assert.equal(normaliseName('Holding B.V.'), 'holding');
});

test('lookup: exact match ignores B.V., Holding and case', () => {
  const entries = parseRegister(fakeRegister({ rows: 5 }));
  const r = lookup(entries, 'example analytics bv');
  assert.equal(r.status, 'recognised');
  assert.deepEqual(r.matches.map((m) => m.kvk).sort(), ['22222222', '22222223']);
  assert.ok(r.matches.every((m) => m.match === 'exact'));
});

test('lookup: partial name gives possible matches', () => {
  const entries = parseRegister(fakeRegister({ rows: 5 }));
  const r = lookup(entries, 'Globex');
  assert.equal(r.status, 'possible');
  assert.equal(r.matches[0].name, 'Globex Consulting Nederland B.V.');
  assert.equal(r.matches[0].match, 'close');
});

test('lookup: typo is caught by similarity, unrelated name is not found', () => {
  const entries = parseRegister(fakeRegister({ rows: 5 }));
  const typo = lookup(entries, 'Initech Recrutment');
  assert.equal(typo.status, 'possible');
  assert.equal(typo.matches[0].kvk, '66666666');
  assert.equal(lookup(entries, 'Totally Different Name').status, 'not_found');
  assert.equal(lookup(entries, '').status, 'not_found');
  assert.equal(lookup(entries, 'B.V.').status, 'not_found');
});

test('lookup: very short queries only match exactly', () => {
  const entries = parseRegister(fakeRegister({ rows: 5, extraRows: [['AB Tools B.V.', '77777777']] }));
  assert.equal(lookup(entries, 'AB').status, 'not_found');
});

test('ensureRegister downloads once, then reuses the copy for a week', async () => {
  const dir = tmp();
  const fetch = mockFetch(fakeRegister());
  const now = new Date('2026-10-07T10:00:00Z');
  const first = await ensureRegister({ cacheDir: dir, fetch, now });
  assert.equal(first.downloaded, true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0], REGISTER_URL);
  assert.ok(existsSync(cachePaths(dir).html));
  assert.equal(first.meta.updated_text, '5 October 2026');
  assert.ok(first.meta.count >= 1200);

  const again = await ensureRegister({ cacheDir: dir, fetch, now: new Date('2026-10-10T10:00:00Z') });
  assert.equal(again.downloaded, false);
  assert.equal(fetch.calls.length, 1);

  const later = await ensureRegister({ cacheDir: dir, fetch, now: new Date('2026-10-15T10:00:00Z') });
  assert.equal(later.downloaded, true);
  assert.equal(fetch.calls.length, 2);

  const forced = await ensureRegister({ cacheDir: dir, fetch, force: true, now: new Date('2026-10-15T11:00:00Z') });
  assert.equal(forced.downloaded, true);
  rmSync(dir, { recursive: true, force: true });
});

test('ensureRegister: offline mode never touches the network', async () => {
  const dir = tmp();
  const fetch = mockFetch(fakeRegister());
  await assert.rejects(() => ensureRegister({ cacheDir: dir, fetch, offline: true }), /No saved copy/);
  assert.equal(fetch.calls.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('ensureRegister: failed refresh falls back to the old copy with a warning', async () => {
  const dir = tmp();
  await ensureRegister({ cacheDir: dir, fetch: mockFetch(fakeRegister()), now: new Date('2026-10-01T10:00:00Z') });
  const down = async () => {
    throw new Error('network down');
  };
  const r = await ensureRegister({ cacheDir: dir, fetch: down, now: new Date('2026-10-20T10:00:00Z') });
  assert.equal(r.downloaded, false);
  assert.match(r.warning, /Using the copy saved/);
  rmSync(dir, { recursive: true, force: true });
});

test('ensureRegister: refuses a page that is not the register and keeps no junk', async () => {
  const dir = tmp();
  await assert.rejects(() => ensureRegister({ cacheDir: dir, fetch: mockFetch('<html>Please accept cookies</html>') }), /did not look like the register/);
  assert.equal(existsSync(cachePaths(dir).html), false);
  await assert.rejects(() => ensureRegister({ cacheDir: dir, fetch: mockFetch('', { status: 503 }) }), /HTTP 503/);
  rmSync(dir, { recursive: true, force: true });
});

test('main lookup --json end to end with a mocked download', async () => {
  const dir = tmp();
  const res = await main(['lookup', '--company', 'Example Analytics B.V.', '--json'], { cacheDir: dir, fetch: mockFetch(fakeRegister()), now: new Date('2026-10-07T10:00:00Z') });
  assert.equal(res.code, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.status, 'recognised');
  assert.equal(out.register.updated, '5 October 2026');
  assert.match(out.caveat, /legal entities/);
  const human = await main(['--company', 'Nobody Here Ltd'], { cacheDir: dir, fetch: mockFetch(''), now: new Date('2026-10-08T10:00:00Z') });
  assert.equal(human.code, 0);
  assert.match(human.stdout, /No match/);
  rmSync(dir, { recursive: true, force: true });
});

test('main: usage errors exit 2, network failure with no cache exits 1', async () => {
  const dir = tmp();
  assert.equal((await main([], { cacheDir: dir })).code, 2);
  assert.equal((await main(['lookup'], { cacheDir: dir })).code, 2);
  assert.equal((await main(['lookup', '--company', 'X', '--wat'], { cacheDir: dir })).code, 2);
  const failing = async () => {
    throw new Error('offline');
  };
  const r = await main(['lookup', '--company', 'Example'], { cacheDir: dir, fetch: failing });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Could not download/);
  rmSync(dir, { recursive: true, force: true });
});

test('main status reflects the cache age', async () => {
  const dir = tmp();
  const none = JSON.parse((await main(['status', '--json'], { cacheDir: dir })).stdout);
  assert.equal(none.cached, false);
  await ensureRegister({ cacheDir: dir, fetch: mockFetch(fakeRegister()), now: new Date('2026-10-01T00:00:00Z') });
  const s = JSON.parse((await main(['status', '--json'], { cacheDir: dir, now: new Date('2026-10-10T00:00:00Z') })).stdout);
  assert.equal(s.cached, true);
  assert.equal(s.due_for_refresh, true);
  rmSync(dir, { recursive: true, force: true });
});

// ---- thresholds ----
const DOC = `---
type: "reference"
valid_year: 2026
---
# Thresholds
<!-- thresholds:start -->
| key | monthly_eur | applies_to |
|---|---|---|
| hsm_30_plus | 6,000 | Thirty or older |
| hsm_under_30 | 4,000 | Younger |
| hsm_reduced | 3,000 | Recent graduates |
<!-- thresholds:end -->
`;

test('parseThresholds reads the table from the doc (made-up numbers, not hard-coded)', () => {
  const t = parseThresholds(DOC);
  assert.equal(t.valid_year, 2026);
  assert.equal(t.amounts.hsm_30_plus.monthly_eur, 6000);
  assert.equal(t.amounts.hsm_reduced.monthly_eur, 3000);
  assert.throws(() => parseThresholds('# nothing here'), /not found/);
});

test('the real pack doc parses and has the three keys the skill needs', () => {
  const t = loadThresholds();
  for (const k of ['hsm_30_plus', 'hsm_under_30', 'hsm_reduced']) assert.ok(t.amounts[k].monthly_eur > 1000, k);
  assert.ok(t.amounts.hsm_reduced.monthly_eur < t.amounts.hsm_under_30.monthly_eur);
  assert.ok(t.amounts.hsm_under_30.monthly_eur < t.amounts.hsm_30_plus.monthly_eur);
  assert.ok(Number.isInteger(t.valid_year));
});

test('pickThresholdKey: reduced beats age band', () => {
  assert.equal(pickThresholdKey({ reduced: true, ageBand: '30plus' }), 'hsm_reduced');
  assert.equal(pickThresholdKey({ ageBand: 'under30' }), 'hsm_under_30');
  assert.equal(pickThresholdKey({ ageBand: '30plus' }), 'hsm_30_plus');
  assert.equal(pickThresholdKey({}), null);
});

test('salary verdicts allow for the 8% holiday allowance', () => {
  // threshold 3000/month: cautious annual bar = 3000*12*1.08 = 38880; generous bar = 36000
  assert.equal(annualVerdict(40000, 3000), 'meets');
  assert.equal(annualVerdict(37000, 3000), 'unclear');
  assert.equal(annualVerdict(30000, 3000), 'below');
  assert.equal(annualVerdict(null, 3000), 'unknown');
  assert.equal(salaryVerdict(null, null, 3000), 'unknown');
  assert.equal(salaryVerdict(40000, 50000, 3000), 'meets');
  assert.equal(salaryVerdict(30000, 45000, 3000), 'unclear'); // the top of the range could clear it
  assert.equal(salaryVerdict(20000, 30000, 3000), 'below');
  assert.equal(salaryVerdict(null, 50000, 3000), 'meets');
});

test('main thresholds: flags out-of-date year and gives a verdict', async () => {
  const live = JSON.parse((await main(['thresholds', '--age-band', '30plus', '--annual', '90000', '--json'], { now: new Date('2026-12-01T00:00:00Z') })).stdout);
  assert.equal(live.stale, false);
  assert.equal(live.selected.key, 'hsm_30_plus');
  assert.equal(live.selected.verdict, 'meets');
  const stale = JSON.parse((await main(['thresholds', '--reduced', '--json'], { now: new Date('2099-01-01T00:00:00Z') })).stdout);
  assert.equal(stale.stale, true);
  assert.match(stale.note, /out of date/);
  assert.equal((await main(['thresholds', '--age-band', 'old'])).code, 2);
});
