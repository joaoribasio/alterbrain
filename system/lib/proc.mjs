// Cross-platform process helpers (no shell string interpolation).
import { spawnSync } from 'node:child_process';

export const IS_WINDOWS = process.platform === 'win32';

/**
 * Run a command synchronously. Returns { ok, code, stdout, stderr }.
 * On Windows, .cmd shims (npx, gh installed via scoop, etc.) need shell:true.
 */
export function run(cmd, args = [], opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 60_000,
    maxBuffer: opts.maxBuffer ?? 256 * 1024 * 1024, // the default (1 MB) makes a big diff look like a failure
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    shell: opts.shell ?? (IS_WINDOWS && /^(npx|npm|uvx|quarto)$/i.test(cmd)),
    windowsHide: true,
    input: opts.input,
  });
  return {
    ok: res.status === 0 && !res.error,
    code: res.status ?? -1,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || (res.error ? String(res.error.message) : '')).trim(),
  };
}

/** True if an executable is on PATH. */
export function has(cmd) {
  const probe = IS_WINDOWS ? run('where', [cmd], { timeout: 10_000 }) : run('which', [cmd], { timeout: 10_000 });
  return probe.ok && probe.stdout.length > 0;
}

/** Compare dotted versions: returns -1, 0, 1. */
export function cmpVersion(a, b) {
  const pa = String(a).match(/\d+/g)?.map(Number) || [];
  const pb = String(b).match(/\d+/g)?.map(Number) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
