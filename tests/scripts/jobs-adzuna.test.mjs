// Tests for system/scripts/jobs/adzuna.mjs. fetch is mocked; no network, no real keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseEnv,
  loadEnvLocal,
  normaliseJob,
  buildUrl,
  searchJobs,
  bumpDailyUsage,
  politeWait,
  resetRateLimiter,
  dutchSignal,
  guessLanguage,
  main,
  DAILY_STOP,
  MIN_GAP_MS,
  usageFile,
} from '../../system/scripts/jobs/adzuna.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'ab-adz-'));
// Fake credentials are built at run time so no secret-looking literal sits in the repo.
const FAKE_ID = ['test', 'id', '1'].join('-');
const FAKE_KEY = ['test', 'key', '2'].join('-');
const ENV = { ADZUNA_APP_ID: FAKE_ID, ADZUNA_APP_KEY: FAKE_KEY };
const fast = { sleep: async () => {}, clock: () => Date.now() };

const SAMPLE = {
  count: 2,
  results: [
    {
      id: '123',
      title: 'Strategy <strong>Consultant</strong>',
      company: { display_name: 'Example Consulting B.V.' },
      location: { display_name: 'Rotterdam, Zuid-Holland', area: ['Netherlands', 'Zuid-Holland', 'Rotterdam'] },
      redirect_url: 'https://www.adzuna.nl/land/ad/123',
      created: '2026-10-05T08:00:00Z',
      salary_min: 52000.4,
      salary_max: '62000',
      salary_is_predicted: '0',
      description: 'You will advise clients.  Dutch is a plus. English is the working language &amp; we are friendly.',
    },
    {
      id: 456,
      title: 'Analist',
      company: { display_name: 'Voorbeeld Groep' },
      location: { display_name: 'Utrecht' },
      redirect_url: 'https://www.adzuna.nl/land/ad/456',
      created: '2026-10-04T08:00:00Z',
      salary_is_predicted: '1',
      salary_min: 40000,
      salary_max: 40000,
      description: 'Wij zoeken een analist met goede beheersing van de Nederlandse taal in woord en geschrift.',
    },
  ],
};

function mockFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responder(url, calls.length);
  };
  fn.calls = calls;
  return fn;
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const status = (s) => ({ ok: s < 400, status: s, json: async () => ({}) });

test('parseEnv handles comments, quotes and export', () => {
  const env = parseEnv('# comment\nADZUNA_APP_ID=abc\nexport ADZUNA_APP_KEY="q w"\nEMPTY=\nBAD LINE\nX=1 # trailing');
  assert.equal(env.ADZUNA_APP_ID, 'abc');
  assert.equal(env.ADZUNA_APP_KEY, 'q w');
  assert.equal(env.EMPTY, '');
  assert.equal(env.X, '1');
  assert.equal(env['BAD LINE'], undefined);
});

test('loadEnvLocal reads the file, real environment wins, missing file is fine', () => {
  const dir = tmp();
  const file = join(dir, '.env.local');
  writeFileSync(file, 'ADZUNA_APP_ID=from-file\nADZUNA_APP_KEY=file-key\n');
  const merged = loadEnvLocal(file, { ADZUNA_APP_ID: 'from-env' });
  assert.equal(merged.ADZUNA_APP_ID, 'from-env');
  assert.equal(merged.ADZUNA_APP_KEY, 'file-key');
  assert.deepEqual(loadEnvLocal(join(dir, 'nope'), {}), {});
  rmSync(dir, { recursive: true, force: true });
});

test('normaliseJob gives the Alterbrain shape and cleans markup', () => {
  const jobs = SAMPLE.results.map(normaliseJob);
  const a = jobs[0];
  assert.equal(a.title, 'Strategy Consultant');
  assert.equal(a.company, 'Example Consulting B.V.');
  assert.equal(a.location, 'Rotterdam, Zuid-Holland');
  assert.equal(a.url, 'https://www.adzuna.nl/land/ad/123');
  assert.equal(a.created, '2026-10-05T08:00:00Z');
  assert.equal(a.salary_min, 52000);
  assert.equal(a.salary_max, 62000);
  assert.equal(a.source, 'adzuna');
  assert.ok(a.description_snippet.includes('working language & we'));
  assert.ok(a.description_snippet.length <= 300);
  assert.equal(a.salary_predicted, false);
  assert.equal(jobs[1].salary_predicted, true);
  assert.equal(jobs[1].id, '456');
  // missing fields become null, not crashes
  const bare = normaliseJob({});
  assert.equal(bare.company, null);
  assert.equal(bare.salary_min, null);
  assert.equal(bare.url, null);
});

test('buildUrl uses https, the right country and encodes the query', () => {
  const url = buildUrl({ country: 'nl', page: 2, appId: FAKE_ID, appKey: FAKE_KEY, what: 'strategy & ops', where: 'Den Haag', results: 500, maxDaysOld: 7 });
  const u = new URL(url);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.hostname, 'api.adzuna.com');
  assert.equal(u.pathname, '/v1/api/jobs/nl/search/2');
  assert.equal(u.searchParams.get('what'), 'strategy & ops');
  assert.equal(u.searchParams.get('where'), 'Den Haag');
  assert.equal(u.searchParams.get('results_per_page'), '50'); // capped
  assert.equal(u.searchParams.get('max_days_old'), '7');
  assert.equal(u.searchParams.get('app_id'), FAKE_ID);
});

test('searchJobs: normalises results and sends a clear User-Agent', async () => {
  const dir = tmp();
  const fetch = mockFetch(() => ok(SAMPLE));
  const r = await searchJobs({ what: 'consultant' }, { fetch, env: ENV, cacheDir: dir, ...fast });
  assert.equal(r.count, 2);
  assert.equal(r.jobs.length, 2);
  assert.match(fetch.calls[0].init.headers['User-Agent'], /Alterbrain/);
  rmSync(dir, { recursive: true, force: true });
});

test('searchJobs: missing keys give a friendly message and no network call', async () => {
  const dir = tmp();
  const fetch = mockFetch(() => ok(SAMPLE));
  await assert.rejects(() => searchJobs({ what: 'x' }, { fetch, env: {}, cacheDir: dir, ...fast }), /keys are missing/);
  assert.equal(fetch.calls.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('searchJobs: 401, 429, 500 and network failure are explained in plain words', async () => {
  const dir = tmp();
  const run = (resp) => searchJobs({ what: 'x' }, { fetch: mockFetch(resp), env: ENV, cacheDir: dir, ...fast });
  await assert.rejects(() => run(() => status(401)), /rejected the keys/);
  await assert.rejects(() => run(() => status(429)), /too fast/);
  await assert.rejects(() => run(() => status(500)), /HTTP 500/);
  await assert.rejects(
    () => run(() => {
      throw new Error('ENOTFOUND');
    }),
    /Could not reach Adzuna/
  );
  rmSync(dir, { recursive: true, force: true });
});

test('searchJobs: one retry after a 5xx, then success', async () => {
  const dir = tmp();
  const fetch = mockFetch((_, n) => (n === 1 ? status(502) : ok(SAMPLE)));
  const r = await searchJobs({ what: 'x' }, { fetch, env: ENV, cacheDir: dir, ...fast });
  assert.equal(r.jobs.length, 2);
  assert.equal(fetch.calls.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('daily counter counts calls and stops before the free-tier limit', () => {
  const dir = tmp();
  const now = new Date('2026-10-07T09:00:00');
  assert.equal(bumpDailyUsage({ cacheDir: dir, now }), 1);
  assert.equal(bumpDailyUsage({ cacheDir: dir, now }), 2);
  writeFileSync(usageFile(dir), JSON.stringify({ date: '2026-10-07', count: DAILY_STOP }));
  assert.throws(() => bumpDailyUsage({ cacheDir: dir, now }), /daily limit/);
  // a new day starts again at 1
  assert.equal(bumpDailyUsage({ cacheDir: dir, now: new Date('2026-10-08T09:00:00') }), 1);
  assert.deepEqual(JSON.parse(readFileSync(usageFile(dir), 'utf8')), { date: '2026-10-08', count: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test('politeWait keeps calls at least MIN_GAP_MS apart', async () => {
  resetRateLimiter();
  let t = 1_000_000;
  const waits = [];
  const clock = () => t;
  const sleep = async (ms) => {
    waits.push(ms);
    t += ms;
  };
  await politeWait({ clock, sleep }); // first call: no wait
  await politeWait({ clock, sleep }); // immediately again: must wait
  t += 10_000;
  await politeWait({ clock, sleep }); // long gap: no wait
  assert.equal(waits.length, 1);
  assert.equal(waits[0], MIN_GAP_MS);
  resetRateLimiter();
});

test('dutchSignal: required, preferred, not_required, likely, unknown', () => {
  assert.equal(dutchSignal('We need vloeiend Nederlands and English.').signal, 'required');
  assert.equal(dutchSignal('Goede beheersing van de Nederlandse taal in woord en geschrift').signal, 'required');
  assert.equal(dutchSignal('Fluent in Dutch is required').signal, 'required');
  assert.equal(dutchSignal('Dutch level NT2 is needed').signal, 'required');
  assert.equal(dutchSignal('Taalniveau C1 Nederlands').signal, 'required');
  assert.equal(dutchSignal('Dutch is a plus, English is the working language').signal, 'not_required');
  assert.equal(dutchSignal('Nederlands is een pre. Great team!').signal, 'preferred');
  assert.equal(dutchSignal('Knowledge of Dutch is an advantage.').signal, 'preferred');
  assert.equal(dutchSignal('No Dutch required for this role.').signal, 'not_required');
  assert.equal(dutchSignal('Customer success associate at a fast growing scale-up in Amsterdam.').signal, 'unknown');
  const nl = 'Wij zijn op zoek naar een enthousiaste collega voor ons team in Utrecht. Je werkt met de klanten van ons bedrijf en je bent een echte teamspeler.';
  assert.equal(dutchSignal(nl).signal, 'likely');
  assert.equal(guessLanguage(nl), 'nl');
  assert.equal(guessLanguage('short'), 'unknown');
});

test('main --json prints jobs and the Adzuna credit line', async () => {
  const dir = tmp();
  const res = await main(['--what', 'consultant', '--where', 'Rotterdam', '--results', '5', '--json'], { fetch: mockFetch(() => ok(SAMPLE)), env: ENV, cacheDir: dir, ...fast });
  assert.equal(res.code, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.source, 'adzuna');
  assert.equal(out.jobs.length, 2);
  assert.equal(out.jobs[1].dutch.signal, 'required');
  assert.match(out.credit, /Adzuna/);
  rmSync(dir, { recursive: true, force: true });
});

test('main human output lists jobs and credits Adzuna', async () => {
  const dir = tmp();
  const res = await main(['--what', 'consultant'], { fetch: mockFetch(() => ok(SAMPLE)), env: ENV, cacheDir: dir, ...fast });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /1\. Strategy Consultant - Example Consulting B\.V\./);
  assert.match(res.stdout, /Jobs by Adzuna/);
  assert.match(res.stdout, /estimated by Adzuna/);
  rmSync(dir, { recursive: true, force: true });
});

test('main exit codes: usage errors 2, missing keys 1, empty result 0', async () => {
  const dir = tmp();
  assert.equal((await main([], {})).code, 2);
  assert.equal((await main(['--what', 'x', '--bogus'], {})).code, 2);
  assert.equal((await main(['--what', 'x', '--results', 'many'], {})).code, 2);
  assert.equal((await main(['--what', 'x', '--country', 'netherlands'], {})).code, 2);
  assert.equal((await main(['--help'], {})).code, 0);
  const noKeys = await main(['--what', 'x'], { fetch: mockFetch(() => ok(SAMPLE)), env: {}, cacheDir: dir, ...fast });
  assert.equal(noKeys.code, 1);
  assert.match(noKeys.stderr, /developer\.adzuna\.com/);
  const empty = await main(['--what', 'zzzz'], { fetch: mockFetch(() => ok({ count: 0, results: [] })), env: ENV, cacheDir: dir, ...fast });
  assert.equal(empty.code, 0);
  assert.match(empty.stdout, /No jobs found/);
  rmSync(dir, { recursive: true, force: true });
});
