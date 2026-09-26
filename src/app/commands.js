import path from 'node:path';
import { runAttempt, EXIT } from '../features/watch/index.js';
import { createRun, loadRun, newRunId } from '../entities/run/index.js';
import { detectTool, guessTask, resumeCommand, workerCwd } from '../entities/worker/index.js';
import { spawnSource, tailSource } from '../shared/process/index.js';
import { givenOpts, maxResumes } from './options.js';
import { UsageError } from './usage.js';

export function startLog(values) {
  if (!values.task) throw new UsageError('--log needs --task');
  const pid = values.pid ? Number(values.pid) : null;
  const state = {
    runId: newRunId(), tool: null, argv: null, cwd: process.cwd(), task: values.task,
    attempt: 1, maxResumes: maxResumes(values), opts: givenOpts(values),
  };
  createRun(state);
  return runAttempt(state, tailSource(path.resolve(values.log), pid));
}

export function startCommand(values, cmd) {
  if (!cmd.length) throw new UsageError('nothing to watch: put the worker command after --');
  const tool = detectTool(cmd);
  const state = {
    runId: newRunId(), tool, argv: cmd, cwd: workerCwd(tool, cmd, process.cwd()),
    task: values.task || guessTask(cmd), sessionId: null,
    attempt: 1, maxResumes: maxResumes(values), opts: givenOpts(values),
  };
  createRun(state);
  return runAttempt(state, spawnSource(cmd, process.cwd()));
}

// `codex exec resume` has no --cd, so a resumed worker runs in the saved cwd.
export function resume(values, positionals) {
  const message = positionals.join(' ').trim();
  if (!message) throw new UsageError('--resume needs the correction message');
  const state = loadRun(values.resume);
  if (!state.tool) throw new UsageError('this run did not start codex or opencode through jev-watch, so it cannot be resumed');
  if (state.attempt > state.maxResumes) {
    console.log(`jev-watch: run ${state.runId} already used ${state.maxResumes} corrections. Ask the user first.`);
    return EXIT.outOfResumes;
  }
  state.attempt += 1;
  state.opts = { ...state.opts, ...givenOpts(values) };
  state.task = `${state.task.split('\nLatest correction:')[0]}\nLatest correction: ${message}`;
  const argv = resumeCommand(state.tool, state.argv, state.sessionId, message);
  return runAttempt(state, spawnSource(argv, state.cwd));
}
