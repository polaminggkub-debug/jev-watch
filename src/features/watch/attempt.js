// One watched attempt of a run: watch the source, save the outcome, write and
// print the report, and turn the outcome into an exit code.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatReport, runDir, saveRun } from '../../entities/run/index.js';
import { resolveKey } from '../../shared/jev/index.js';
import { watch } from './watcher.js';

export const EXIT = { done: 0, failed: 1, stopped: 2, outOfResumes: 3, usage: 64 };

function exitCode(outcome, state) {
  if (outcome === 'done' || outcome === 'ended') return EXIT.done;
  if (outcome === 'failed') return EXIT.failed;
  return state.attempt > state.maxResumes ? EXIT.outOfResumes : EXIT.stopped;
}

export async function runAttempt(state, source) {
  const dir = runDir(state.runId);
  const logPath = path.join(dir, `log-${state.attempt}.txt`);
  const opts = { ...state.opts };
  if (opts.jev !== false && !resolveKey()) {
    console.error('jev-watch: no API key found, running with rules only');
    opts.jev = false;
  }
  const result = await watch({ source, cwd: state.cwd, task: state.task, logPath, opts });
  state.sessionId = result.sessionId || state.sessionId;
  state.outcome = result.outcome;
  saveRun(state);
  const report = formatReport(result, { ...state, logPath, canResume: Boolean(state.tool) });
  writeFileSync(path.join(dir, `report-${state.attempt}.txt`), report + '\n');
  console.log(report);
  return exitCode(result.outcome, state);
}
