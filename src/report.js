// The report is what the orchestrator reads instead of the whole log, so it
// stays short: verdict, why, what changed, and the last lines of output.

const TAIL_LINES = 50;
const MAX_LINE = 300;

function tailLines(text, n) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((l) => l.trim())
    .slice(-n)
    .map((l) => (l.length > MAX_LINE ? l.slice(0, MAX_LINE) + ' …' : l));
}

function headline(r) {
  if (r.outcome === 'stopped') return `STOPPED (${r.stop.problem}) after ${r.elapsedMin} min: ${r.stop.reason}`;
  if (r.outcome === 'done') return `DONE after ${r.elapsedMin} min (exit 0)`;
  if (r.outcome === 'ended') return `ENDED after ${r.elapsedMin} min (exit code unknown)`;
  return `FAILED after ${r.elapsedMin} min: ${r.error || `exit ${r.exitCode}`}`;
}

function jevLine(jev) {
  if (!jev) return 'none';
  const probs = Object.entries(jev.probabilities)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
    .join(' ');
  return `${probs} (${jev.ms}ms)`;
}

// `next` is the line telling the orchestrator what it can do now.
export function formatReport(r, { runId, task, attempt, maxResumes, logPath, canResume }) {
  const out = [
    `jev-watch ${runId} · attempt ${attempt}/${maxResumes + 1}`,
    headline(r),
    `Task: ${task.replace(/\s+/g, ' ').slice(0, 200)}`,
    `Last Jev check: ${jevLine(r.lastJev)} · ${r.jevCalls} Jev calls`,
  ];
  if (r.repeated.length) {
    out.push('Repeated errors:', ...r.repeated.map((e) => `  ${e.count} checks: ${e.line}`));
  }
  out.push(r.files.length ? `Files changed (${r.files.length}): ${r.files.slice(0, 15).join(', ')}` : 'Files changed: none');
  out.push(`Session: ${r.sessionId || 'not found in output'}`);
  out.push('', `Last ${TAIL_LINES} lines:`, ...tailLines(r.tail, TAIL_LINES).map((l) => `  ${l}`), '');
  out.push(`Full log: ${logPath}`);
  out.push(nextStep(r, { runId, attempt, maxResumes, canResume }));
  return out.join('\n');
}

function nextStep(r, { runId, attempt, maxResumes, canResume }) {
  if (r.outcome === 'done') return 'Next: review the diff.';
  if (!canResume) return 'Next: fix it yourself or restart the worker; resume needs a codex or opencode command.';
  if (attempt > maxResumes) return `Next: ${maxResumes} corrections did not help. Ask the user before trying again.`;
  return `Next: jev-watch --resume ${runId} "<what went wrong and what to do instead>"`;
}
