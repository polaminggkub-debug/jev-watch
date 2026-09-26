// Knows just enough about each worker CLI to find its session id in the log and
// to build the command that continues that session with a new message.

import path from 'node:path';

const SESSION_PATTERNS = [
  /session id:\s*([0-9a-f-]{36})/i, // codex exec header
  /"thread_id"\s*:\s*"([^"]+)"/, // codex exec --json
  /"session_id"\s*:\s*"([^"]+)"/,
  /"sessionID"\s*:\s*"(ses_[A-Za-z0-9]+)"/, // opencode run --format json
];

export function detectTool(argv) {
  const name = path.basename(argv[0] || '');
  if (name === 'codex') return 'codex';
  if (name === 'opencode') return 'opencode';
  return null;
}

export function extractSessionId(text) {
  for (const re of SESSION_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

// The prompt is the last argument that is not a flag.
export function guessTask(argv) {
  const last = argv[argv.length - 1] || '';
  return argv.length > 1 && !last.startsWith('-') ? last : argv.join(' ');
}

// Copy the flags `names` from argv. `valued` flags take the next argument too.
function carry(argv, flags) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    if (!(flag in flags)) continue;
    if (!flags[flag]) out.push(argv[i]);
    else if (inline !== undefined) out.push(argv[i]);
    else out.push(argv[i], argv[++i]);
  }
  return out;
}

function valueOf(argv, names) {
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    if (names.includes(flag)) return inline !== undefined ? inline : argv[i + 1];
  }
  return undefined;
}

const CODEX_FLAGS = {
  '-m': true, '--model': true, '-c': true, '--config': true, '--enable': true, '--disable': true,
  '--dangerously-bypass-approvals-and-sandbox': false, '--skip-git-repo-check': false, '--json': false,
};
const OPENCODE_FLAGS = {
  '-m': true, '--model': true, '--agent': true, '--variant': true, '--format': true, '--dir': true,
  '--auto': false, '--thinking': false,
};

// `codex exec resume` has no --sandbox or --cd, so the sandbox becomes a config
// override and the directory becomes the spawn cwd.
function codexResume(argv, sessionId, message) {
  const flags = carry(argv, CODEX_FLAGS);
  const sandbox = valueOf(argv, ['-s', '--sandbox']) || (argv.includes('--full-auto') ? 'workspace-write' : null);
  if (sandbox) flags.push('-c', `sandbox_mode="${sandbox}"`);
  return [argv[0], 'exec', 'resume', ...flags, ...(sessionId ? [sessionId] : ['--last']), message];
}

function opencodeResume(argv, sessionId, message) {
  const flags = carry(argv, OPENCODE_FLAGS);
  return [argv[0], 'run', ...flags, ...(sessionId ? ['--session', sessionId] : ['--continue']), message];
}

export function resumeCommand(tool, argv, sessionId, message) {
  if (tool === 'codex') return codexResume(argv, sessionId, message);
  if (tool === 'opencode') return opencodeResume(argv, sessionId, message);
  throw new Error(`resume is only supported for codex and opencode, not ${argv[0]}`);
}

// Where the worker actually runs: codex -C/--cd and opencode --dir override our cwd.
export function workerCwd(tool, argv, cwd) {
  const dir = tool === 'codex' ? valueOf(argv, ['-C', '--cd']) : tool === 'opencode' ? valueOf(argv, ['--dir']) : null;
  return dir ? path.resolve(cwd, dir) : cwd;
}
