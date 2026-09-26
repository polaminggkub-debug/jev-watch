#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { watch } from '../src/watcher.js';
import { resolveKey } from '../src/jev.js';
import { spawnSource, tailSource } from '../src/sources.js';
import { detectTool, guessTask, resumeCommand, workerCwd } from '../src/session.js';
import { createRun, loadRun, newRunId, runDir, saveRun } from '../src/runs.js';
import { formatReport } from '../src/report.js';

const USAGE = `jev-watch: watch a coding agent, stop it when it loops, stalls or drifts

  jev-watch [options] -- <command...>        run and watch a worker
  jev-watch --resume <runId> "<message>"     continue a stopped run's session
  jev-watch --log <file> [--pid N] --task T  watch a log another script writes

Options:
  --task <text>          what the worker should do (default: the command's prompt)
  --interval <sec>       seconds between checks (45)
  --threshold <p>        Jev confidence that counts as a problem (0.8)
  --strikes <n>          Jev problems in a row before stopping (2)
  --repeat <n>           checks the same error must appear in (3)
  --idle-min <m>         minutes without output before stopping (10)
  --no-change-min <m>    minutes without file changes before stopping (20)
  --max-resumes <n>      corrections before asking the user (3)
  --no-jev               rules only, no API calls
  --verbose              also print the worker's output

Key: JEV_WATCH_API_KEY, else OPENROUTER_API_KEY, else TYPESAFE_API_KEY.
Exit: 0 done · 1 worker failed · 2 stopped by the watcher · 3 out of resumes · 64 usage`;

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

const NUMERIC = { interval: 'intervalSec', threshold: 'threshold', strikes: 'strikes', repeat: 'repeat', 'idle-min': 'idleMin', 'no-change-min': 'noChangeMin' };

function usageError(msg) {
  console.error(`${msg}\n\n${USAGE}`);
  process.exit(64);
}

// Only the options actually given, so a resume can layer them over the saved ones.
function givenOpts(values) {
  const opts = {};
  for (const [flag, key] of Object.entries(NUMERIC)) {
    if (values[flag] === undefined) continue;
    const n = Number(values[flag]);
    if (!Number.isFinite(n) || n <= 0) usageError(`--${flag} must be a positive number`);
    opts[key] = n;
  }
  if (values['no-jev']) opts.jev = false;
  if (values.verbose) opts.verbose = true;
  return opts;
}

async function run(state, source, spawnCwd) {
  const dir = runDir(state.runId);
  const logPath = path.join(dir, `log-${state.attempt}.txt`);
  const opts = { ...state.opts };
  if (opts.jev !== false && !resolveKey()) {
    console.error('jev-watch: no API key found, running with rules only');
    opts.jev = false;
  }
  const result = await watch({ source: source(spawnCwd), cwd: state.cwd, task: state.task, logPath, opts });
  state.sessionId = result.sessionId || state.sessionId;
  state.outcome = result.outcome;
  saveRun(state);
  const report = formatReport(result, { ...state, logPath, canResume: Boolean(state.tool) });
  writeFileSync(path.join(dir, `report-${state.attempt}.txt`), report + '\n');
  console.log(report);
  if (result.outcome === 'done' || result.outcome === 'ended') return 0;
  if (result.outcome === 'failed') return 1;
  return state.attempt > state.maxResumes ? 3 : 2;
}

function start(values, cmd) {
  const opts = givenOpts(values);
  const maxResumes = values['max-resumes'] ? Number(values['max-resumes']) : 3;
  if (values.log) {
    if (!values.task) usageError('--log needs --task');
    const pid = values.pid ? Number(values.pid) : null;
    const state = { runId: newRunId(), tool: null, argv: null, cwd: process.cwd(), task: values.task, attempt: 1, maxResumes, opts };
    createRun(state);
    return run(state, () => tailSource(path.resolve(values.log), pid), null);
  }
  if (!cmd.length) usageError('nothing to watch: put the worker command after --');
  const tool = detectTool(cmd);
  const state = {
    runId: newRunId(), tool, argv: cmd, cwd: workerCwd(tool, cmd, process.cwd()),
    task: values.task || guessTask(cmd), sessionId: null, attempt: 1, maxResumes, opts,
  };
  createRun(state);
  return run(state, (cwd) => spawnSource(cmd, cwd), process.cwd());
}

function resume(values, positionals) {
  const message = positionals.join(' ').trim();
  if (!message) usageError('--resume needs the correction message');
  const state = loadRun(values.resume);
  if (!state.tool) usageError('this run was not started by jev-watch with codex or opencode, so it cannot be resumed');
  if (state.attempt > state.maxResumes) {
    console.log(`jev-watch: run ${state.runId} already used ${state.maxResumes} corrections. Ask the user first.`);
    return 3;
  }
  state.attempt += 1;
  state.opts = { ...state.opts, ...givenOpts(values) };
  state.task = `${state.task.split('\nLatest correction:')[0]}\nLatest correction: ${message}`;
  const argv = resumeCommand(state.tool, state.argv, state.sessionId, message);
  saveRun(state);
  return run(state, (cwd) => spawnSource(argv, cwd), state.cwd);
}

async function main(argv) {
  const cut = argv.indexOf('--');
  const own = cut >= 0 ? argv.slice(0, cut) : argv;
  const cmd = cut >= 0 ? argv.slice(cut + 1) : [];
  let parsed;
  try {
    parsed = parseArgs({ args: own, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    usageError(err.message);
  }
  const { values, positionals } = parsed;
  if (values.help || !argv.length) {
    console.log(USAGE);
    return 0;
  }
  if (values.resume) return resume(values, positionals);
  return start(values, cmd);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`jev-watch: ${err.message}`);
    process.exit(1);
  },
);
