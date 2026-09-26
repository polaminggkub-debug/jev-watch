// Claude Code PreToolUse hook: any Bash call that starts a Codex or OpenCode
// worker is wrapped in jev-watch and sent to the background, so the lead agent
// sleeps until the worker finishes or needs a correction.

const WORKER = /^\s*(codex\s+exec|opencode\s+run)\b/;
const SHELL_OPS = /[;&|<>`]|\$\(/;

function shellQuote(text) {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

// The wrapped command, or null to leave the call alone. Compound shell
// commands are skipped: splitting them safely is not worth the risk.
export function wrapCommand(command, pluginRoot) {
  if (typeof command !== 'string' || !WORKER.test(command)) return null;
  if (command.includes('jev-watch') || command.includes('no-jev-watch')) return null;
  if (SHELL_OPS.test(command.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""'))) return null;
  return `node ${shellQuote(`${pluginRoot}/bin/jev-watch.js`)} -- ${command.trim()}`;
}

// Hook output for one PreToolUse payload, or null for "no change".
// No permissionDecision: the user's normal permission rules still apply.
export function preToolUse(payload, env = process.env) {
  if (env.JEV_WATCH_DISABLE === '1' || payload?.tool_name !== 'Bash') return null;
  const root = env.CLAUDE_PLUGIN_ROOT;
  const wrapped = root ? wrapCommand(payload.tool_input?.command, root) : null;
  if (!wrapped) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { command: wrapped, run_in_background: true },
    },
  };
}
