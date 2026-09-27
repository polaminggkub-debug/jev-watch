// Claude Code PreToolUse hook: any Bash call that starts a Codex or OpenCode
// worker is wrapped in jev-watch and sent to the background, so the lead agent
// sleeps until the worker finishes or needs a correction.

const WORKER = /^\s*(codex\s+exec|opencode\s+run)\b/;
const SHELL_OPS = /[;&|<>`]|\$\(/;
const QUOTED = /(["'])(?:\\.|(?!\1).)*\1/g;
// Words that can sit in front of a command without changing what runs.
const PREFIX = /^(?:\w+=\S*\s+|(?:exec|time|nohup|command|then|do|else)\s+)*/;
// Opted out, or already running under jev-watch (`jev-watch -- …`, `--resume`).
const OPT_OUT = /no-jev-watch|JEV_WATCH_DISABLE=1|\bjev-watch(\.js)?'?\s+-/;

const BLOCK_REASON =
  'jev-watch: this Bash call starts a Codex/OpenCode worker inside a compound shell command ' +
  '(;, &&, |, redirects or cd), so it cannot be watched. An unwatched worker can wait for input ' +
  'for hours and nobody is told. Run the worker as one plain command instead, for example: ' +
  'codex exec -C /path/to/repo -s workspace-write "Read /path/to/task.md and do every step." ' +
  'Use -C instead of cd, no pipes, no redirects, no 2>&1 | tail. "$(cat file)" inside quotes is fine. ' +
  'jev-watch runs it in the background and wakes you when it finishes or gets stuck. ' +
  'To run it unwatched on purpose, add # no-jev-watch at the end.';

function shellQuote(text) {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

// The wrapped command, or null to leave the call alone. Compound shell
// commands are skipped: splitting them safely is not worth the risk.
export function wrapCommand(command, pluginRoot) {
  if (typeof command !== 'string' || !WORKER.test(command)) return null;
  if (OPT_OUT.test(command)) return null;
  if (SHELL_OPS.test(command.replace(QUOTED, '""'))) return null;
  return `node ${shellQuote(`${pluginRoot}/bin/jev-watch.js`)} -- ${command.trim()}`;
}

// True when a worker starts somewhere in the command, e.g. after `cd x &&`.
export function startsWorker(command) {
  if (typeof command !== 'string' || OPT_OUT.test(command)) return false;
  const parts = command.replace(QUOTED, '""').split(/[;&|(){}`\n]|\$\(/);
  return parts.some((part) => WORKER.test(part.trim().replace(PREFIX, '')));
}

function output(extra) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...extra } };
}

// Hook output for one PreToolUse payload, or null for "no change".
// A plain worker command is wrapped and the user's permission rules still
// apply. A worker hidden in a compound command is blocked with the reason, so
// the lead agent reruns it in a form jev-watch can watch.
export function preToolUse(payload, env = process.env) {
  if (env.JEV_WATCH_DISABLE === '1' || payload?.tool_name !== 'Bash') return null;
  const root = env.CLAUDE_PLUGIN_ROOT;
  const command = payload.tool_input?.command;
  if (!root) return null;
  const wrapped = wrapCommand(command, root);
  // Keep the caller's other fields (description, timeout) so the task stays named.
  if (wrapped) return output({ updatedInput: { ...payload.tool_input, command: wrapped, run_in_background: true } });
  if (startsWorker(command)) return output({ permissionDecision: 'deny', permissionDecisionReason: BLOCK_REASON });
  return null;
}
