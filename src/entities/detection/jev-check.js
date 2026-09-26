// The one question jev-watch asks Jev each check, and how to read the answer.

import { decide } from '../../shared/jev/index.js';

const MAX_LOG_CHARS = 6000;

export const PROBLEMS = ['looping', 'off_task', 'stalled'];

const STATUS_QUESTION = {
  type: 'choice',
  instructions:
    'A coding agent is working on `task` unattended. `recent_output` is the tail of its log and ' +
    '`files_changed` is what it has modified so far. What is the agent doing right now?',
  criteria: {
    progressing: 'Making real progress on the task: new edits, new problems being solved, tests moving forward',
    looping: 'Repeating the same attempt, the same fix or the same error without getting anywhere new',
    off_task: 'Working on files, features or goals the task did not ask for',
    stalled: 'Idle, waiting, hung, or asking a question nobody will answer',
    finishing: 'Wrapping up: final checks, summary, or the task already looks complete',
  },
};

export function statusRequest({ task, log, files, elapsedMin }) {
  return {
    state: {
      task: task.slice(0, 1500),
      minutes_running: elapsedMin,
      files_changed: files.slice(0, 40),
      recent_output: log.slice(-MAX_LOG_CHARS),
    },
    questions: { status: STATUS_QUESTION },
  };
}

export async function askJev(input, clientOpts) {
  const res = await decide(statusRequest(input), clientOpts);
  if (res.error) return res;
  const status = res.answers.status || {};
  return { choice: status.choice, probabilities: status.probabilities || {}, ms: res.ms };
}

// The problem Jev is at least `threshold` sure about, or null.
export function jevProblem(answer, threshold) {
  if (!answer || answer.error) return null;
  let best = null;
  for (const name of PROBLEMS) {
    const p = answer.probabilities[name] || 0;
    if (p >= threshold && (!best || p > best.p)) best = { problem: name, p };
  }
  return best;
}
