import { parseArgs } from 'node:util';
import { UsageError } from './usage.js';

const OPTIONS = {
  task: { type: 'string' },
  interval: { type: 'string' },
  threshold: { type: 'string' },
  strikes: { type: 'string' },
  repeat: { type: 'string' },
  'idle-min': { type: 'string' },
  'no-change-min': { type: 'string' },
  'max-resumes': { type: 'string' },
  'no-jev': { type: 'boolean' },
  verbose: { type: 'boolean' },
  resume: { type: 'string' },
  log: { type: 'string' },
  pid: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

const NUMERIC = {
  interval: 'intervalSec', threshold: 'threshold', strikes: 'strikes',
  repeat: 'repeat', 'idle-min': 'idleMin', 'no-change-min': 'noChangeMin',
};

// Everything before `--` is ours; everything after is the worker command.
export function parseCli(argv) {
  const cut = argv.indexOf('--');
  const own = cut >= 0 ? argv.slice(0, cut) : argv;
  const cmd = cut >= 0 ? argv.slice(cut + 1) : [];
  try {
    const { values, positionals } = parseArgs({ args: own, options: OPTIONS, allowPositionals: true });
    return { values, positionals, cmd };
  } catch (err) {
    throw new UsageError(err.message);
  }
}

// Only the options actually given, so a resume can layer them over the saved ones.
export function givenOpts(values) {
  const opts = {};
  for (const [flag, key] of Object.entries(NUMERIC)) {
    if (values[flag] === undefined) continue;
    const n = Number(values[flag]);
    if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${flag} must be a positive number`);
    opts[key] = n;
  }
  if (values['no-jev']) opts.jev = false;
  if (values.verbose) opts.verbose = true;
  return opts;
}

export function maxResumes(values) {
  if (values['max-resumes'] === undefined) return 3;
  const n = Number(values['max-resumes']);
  if (!Number.isInteger(n) || n < 0) throw new UsageError('--max-resumes must be 0 or more');
  return n;
}
