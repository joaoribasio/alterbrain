// Tests for system/scripts/jobs/adzuna.mjs. fetch is mocked; no network, no real keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  defaultCountry,
  main,
  DAILY_STOP,
  MIN_GAP_MS,
  usageFile,
} from '../../system/scripts/jobs/adzuna.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = () => mkdtempSync(join(tmpdir(), 'ab-adz-'));

// A throw-away project under state/local/tmp with a config/brain.json, reached through CLAUDE_PROJECT_DIR.
function withProject(brain, fn) {
  const base = join(REPO, 'state', 'local', 'tmp');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'ab-adz-proj-'));
  mkdirSync(join(dir, 'system'), { recursive: true });
  mkdirSync(join(dir, 'config'), { recursive: true });
  if (brain !== undefined) writeFileSync(join(dir, 'config', 'brain.json'), typeof brain === 'string' ? brain : JSON.stringify(brain));
  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = dir;
  const restore = () => {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
    rmSync(dir, { recursive: true, force: true });
  };
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(restore);
}
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
  const res = await main(['--what', 'consultant', '--where', 'Rotterdam', '--results', '5', '--json'], { fetch: mockFetch(() => ok(SAMPLE)), env: ENV, cacheDir: dir, brainFile: join(dir, 'no-brain.json'), ...fast });
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
  const res = await main(['--what', 'consultant'], { fetch: mockFetch(() => ok(SAMPLE)), env: ENV, cacheDir: dir, brainFile: join(dir, 'no-brain.json'), ...fast });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /1\. Strategy Consultant - Example Consulting B\.V\./);
  assert.match(res.stdout, /Jobs by Adzuna/);
  assert.match(res.stdout, /estimated by Adzuna/);
  assert.match(res.stdout, /Dutch: required\./);
  assert.match(res.stdout, /EUR 52,000/);
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

// ---------- other countries and the config default ----------

const GB_SAMPLE = {
  count: 1,
  results: [
    {
      id: '900',
      title: 'Operations Analyst',
      company: { display_name: 'Example Ltd' },
      location: { display_name: 'Leeds, West Yorkshire' },
      redirect_url: 'https://www.adzuna.co.uk/jobs/details/900',
      created: '2026-10-05T08:00:00Z',
      salary_min: 38000,
      salary_max: 42000,
      salary_is_predicted: '0',
      // Dutch wording in a gb advert is still not labelled: the Dutch guess belongs to the Netherlands only.
      description: 'Wij zoeken een analist met goede beheersing van de Nederlandse taal in woord en geschrift.',
    },
  ],
};

test('normaliseJob: the dutch field is added for nl and not for other countries', () => {
  const raw = SAMPLE.results[0];
  assert.ok(normaliseJob(raw).dutch, 'no country given behaves as nl');
  assert.ok(normaliseJob(raw, { country: 'nl' }).dutch);
  assert.ok(normaliseJob(raw, { country: 'NL' }).dutch, 'case does not matter');
  assert.equal('dutch' in normaliseJob(raw, { country: 'gb' }), false);
});

test('main --country gb: calls the gb endpoint, no dutch field, no Dutch line, no euro sign', async () => {
  const dir = tmp();
  const fetch = mockFetch(() => ok(GB_SAMPLE));
  const deps = { fetch, env: ENV, cacheDir: dir, brainFile: join(dir, 'no-brain.json'), ...fast };
  const json = await main(['--what', 'analyst', '--country', 'GB', '--json'], deps);
  assert.equal(json.code, 0);
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1/api/jobs/gb/search/1');
  const out = JSON.parse(json.stdout);
  assert.equal(out.country, 'gb');
  assert.equal(out.jobs.length, 1);
  assert.equal('dutch' in out.jobs[0], false, 'a Dutch-language guess makes no sense outside the Netherlands');
  const human = await main(['--what', 'analyst', '--country', 'gb'], deps);
  assert.equal(human.code, 0);
  assert.match(human.stdout, /Operations Analyst - Example Ltd/);
  assert.doesNotMatch(human.stdout, /Dutch/);
  assert.doesNotMatch(human.stdout, /EUR/);
  assert.match(human.stdout, /local currency/);
  assert.match(human.stdout, /Jobs by Adzuna/);
  rmSync(dir, { recursive: true, force: true });
});

test('defaultCountry: jobs.country from config/brain.json when it is two letters, else nl', async () => {
  const dir = tmp();
  const file = join(dir, 'brain.json');
  assert.equal(defaultCountry(join(dir, 'missing.json')), 'nl');
  writeFileSync(file, JSON.stringify({ jobs: { country: 'DE' } }));
  assert.equal(defaultCountry(file), 'de');
  writeFileSync(file, JSON.stringify({ jobs: { country: ' gb ' } }));
  assert.equal(defaultCountry(file), 'gb');
  for (const bad of ['', 'Netherlands', 'N1', null, 7]) {
    writeFileSync(file, JSON.stringify({ jobs: { country: bad } }));
    assert.equal(defaultCountry(file), 'nl', `value ${JSON.stringify(bad)}`);
  }
  writeFileSync(file, '{oops');
  assert.equal(defaultCountry(file), 'nl');
  rmSync(dir, { recursive: true, force: true });
});

test('main with no --country uses jobs.country from the project config (CLAUDE_PROJECT_DIR)', async () => {
  const cache = tmp();
  await withProject({ jobs: { country: 'GB' } }, async () => {
    const fetch = mockFetch(() => ok(GB_SAMPLE));
    const res = await main(['--what', 'analyst', '--json'], { fetch, env: ENV, cacheDir: cache, ...fast });
    assert.equal(res.code, 0);
    assert.equal(new URL(fetch.calls[0].url).pathname, '/v1/api/jobs/gb/search/1');
    const out = JSON.parse(res.stdout);
    assert.equal(out.country, 'gb');
    assert.equal('dutch' in out.jobs[0], false);
    // an explicit --country still wins over the config
    const fetch2 = mockFetch(() => ok(SAMPLE));
    const res2 = await main(['--what', 'analyst', '--country', 'nl', '--json'], { fetch: fetch2, env: ENV, cacheDir: cache, ...fast });
    assert.equal(new URL(fetch2.calls[0].url).pathname, '/v1/api/jobs/nl/search/1');
    assert.ok(JSON.parse(res2.stdout).jobs[0].dutch);
  });
  await withProject({ jobs: { country: 'NL' } }, async () => {
    const fetch = mockFetch(() => ok(SAMPLE));
    const res = await main(['--what', 'analyst', '--json'], { fetch, env: ENV, cacheDir: cache, ...fast });
    assert.equal(JSON.parse(res.stdout).country, 'nl');
    assert.ok(JSON.parse(res.stdout).jobs[0].dutch);
  });
  await withProject(undefined, async () => {
    const fetch = mockFetch(() => ok(SAMPLE));
    const res = await main(['--what', 'analyst', '--json'], { fetch, env: ENV, cacheDir: cache, ...fast });
    assert.equal(JSON.parse(res.stdout).country, 'nl', 'no config at all: nl, as before');
  });
  await withProject({ jobs: { country: 'Holland' } }, async () => {
    const fetch = mockFetch(() => ok(SAMPLE));
    const res = await main(['--what', 'analyst', '--json'], { fetch, env: ENV, cacheDir: cache, ...fast });
    assert.equal(JSON.parse(res.stdout).country, 'nl', 'a value that is not two letters falls back to nl');
  });
  rmSync(cache, { recursive: true, force: true });
});

test('a country Adzuna refuses gets a plain-language message, not a bare HTTP code', async () => {
  const dir = tmp();
  for (const code of [400, 404]) {
    const res = await main(['--what', 'x', '--country', 'zz'], { fetch: mockFetch(() => status(code)), env: ENV, cacheDir: dir, brainFile: join(dir, 'no-brain.json'), ...fast });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /may not offer the country "zz"/);
    assert.match(res.stderr, /jobs\.country/);
    assert.match(res.stderr, new RegExp(`HTTP ${code}`));
  }
  rmSync(dir, { recursive: true, force: true });
});
