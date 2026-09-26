// Jev client. Jev answers fixed-choice questions with probabilities in well
// under a second, which is what makes a check every 45 seconds affordable.

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const OPENROUTER_URL = 'https://openrouter.ai/api/alpha/decisions';
const OPENROUTER_MODEL = '~typesafe/jev-latest';
const MAX_LOG_CHARS = 6000;

export const PROBLEMS = ['looping', 'off_task', 'stalled'];

export function resolveKey(env = process.env) {
  return env.JEV_WATCH_API_KEY || env.OPENROUTER_API_KEY || env.TYPESAFE_API_KEY || '';
}

export function buildRequest({ task, log, files, elapsedMin }, { key, env = process.env }) {
  const openrouter = key.startsWith('sk-or-');
  const body = {
    model: env.JEV_WATCH_MODEL || (openrouter ? OPENROUTER_MODEL : 'jev-latest'),
    state: {
      task: task.slice(0, 1500),
      minutes_running: elapsedMin,
      files_changed: files.slice(0, 40),
      recent_output: log.slice(-MAX_LOG_CHARS),
    },
    questions: {
      status: {
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
      },
    },
  };
  if (openrouter) body.provider = { zdr: true, data_collection: 'deny' };
  const url = env.JEV_WATCH_API_URL || (openrouter ? OPENROUTER_URL : TYPESAFE_URL);
  return { url, body };
}

// Never throws: a failed call returns { error } and the watcher simply skips the check.
export async function askJev(input, { key = resolveKey(), fetchFn = fetch, timeoutMs = 8000, env } = {}) {
  if (!key) return { error: 'missing_api_key' };
  const { url, body } = buildRequest(input, { key, env });
  const started = Date.now();
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { error: `http_${res.status}`, ms: Date.now() - started };
    const status = ((await res.json()).answers || {}).status || {};
    return { choice: status.choice, probabilities: status.probabilities || {}, ms: Date.now() - started };
  } catch (err) {
    return { error: err.name || 'request_failed', ms: Date.now() - started };
  }
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
