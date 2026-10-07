// Stand-in for system/scripts/git-auto.mjs in the hook tests.
// Records each call in state/local/tmp/git-calls.log and behaves as the environment says:
//   FAKE_GIT_EXIT_<COMMAND>   exit code (default 0)
//   FAKE_GIT_STATUS_<COMMAND> status printed with --json (default ok, or failed when the exit code is not 0)
//   FAKE_GIT_MESSAGE          message printed
//   FAKE_GIT_SLEEP_MS         wait this long before answering
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const command = process.argv[2] || '';
const root = process.env.CLAUDE_PROJECT_DIR;
const dir = join(root, 'state', 'local', 'tmp');
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, 'git-calls.log'), `${[command, ...process.argv.slice(3)].join(' ')}\n`);

const sleep = Number(process.env.FAKE_GIT_SLEEP_MS || 0);
if (sleep > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleep);

const key = command.toUpperCase();
const exit = Number(process.env[`FAKE_GIT_EXIT_${key}`] ?? 0);
const status = process.env[`FAKE_GIT_STATUS_${key}`] || (exit === 0 ? 'ok' : 'failed');
const message = process.env.FAKE_GIT_MESSAGE || 'fake message';
if (process.argv.includes('--json')) console.log(JSON.stringify({ command, status, message }));
else console.log(`git-auto ${command}: ${message}`);
process.exit(exit);
