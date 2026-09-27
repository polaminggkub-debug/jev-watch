import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preToolUse, startsWorker, wrapCommand } from '../src/app/hook.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(root, 'hooks', 'pre-tool-use.js');

test('worker commands are wrapped, everything else is left alone', () => {
  const wrap = (c) => wrapCommand(c, "/p/it's here");
  assert.equal(wrap('codex exec -s workspace-write "fix a && b"'), `node '/p/it'\\''s here/bin/jev-watch.js' -- codex exec -s workspace-write "fix a && b"`);
  assert.match(wrap("  opencode run --auto 'add button'"), /-- opencode run --auto 'add button'$/);
  assert.equal(wrap('npm test'), null);
  assert.equal(wrap('codex exec "x" && npm test'), null);
  assert.equal(wrap('codex exec "x" | tee out'), null);
  assert.equal(wrap('jev-watch -- codex exec "x"'), null);
  assert.equal(wrap('jev-watch --resume abc "codex exec again"'), null);
  assert.equal(wrap('codex exec "x" # no-jev-watch'), null);
  assert.equal(wrap('JEV_WATCH_DISABLE=1 codex exec "x"'), null);
  assert.equal(wrap('codex login'), null);
  assert.match(wrap('codex exec -C ~/jev-watch "x"'), /-- codex exec -C ~\/jev-watch "x"$/);
});

test('a worker hidden in a compound command is found, other commands are not', () => {
  const incident = `cd /repo; S=/tmp/x; codex exec -m m --sandbox workspace-write -C "$PWD" "$(cat $S/fix.md)" < /dev/null 2>&1 | tail -40`;
  assert.equal(startsWorker(incident), true);
  assert.equal(startsWorker('cd ~/jev-watch && codex exec "x"'), true);
  assert.equal(startsWorker('npm test && FOO=1 opencode run "x"'), true);
  assert.equal(startsWorker('(nohup codex exec "x") &'), true);
  assert.equal(startsWorker('git commit -m "codex exec is watched"'), false);
  assert.equal(startsWorker('echo codex exec'), false);
  assert.equal(startsWorker('cd /repo && codex exec "x" # no-jev-watch'), false);
  assert.equal(startsWorker('JEV_WATCH_DISABLE=1 codex exec "x" | tail'), false);
  assert.equal(startsWorker(`node '/p/bin/jev-watch.js' -- codex exec "x"`), false);
  assert.equal(startsWorker('jev-watch --task "t" -- codex exec "x" 2>&1'), false);
});

test('the hook blocks a worker it cannot wrap and says how to rerun it', () => {
  const env = { CLAUDE_PLUGIN_ROOT: '/p' };
  const out = preToolUse({ tool_name: 'Bash', tool_input: { command: 'cd /r && codex exec "x" | tail -40' } }, env);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /one plain command[\s\S]*no-jev-watch/);
  assert.equal(preToolUse({ tool_name: 'Bash', tool_input: { command: 'npm test | tail' } }, env), null);
});

test('the hook output edits the command and backgrounds it without deciding permission', () => {
  const env = { CLAUDE_PLUGIN_ROOT: '/p' };
  const out = preToolUse({ tool_name: 'Bash', tool_input: { command: 'codex exec "x"' } }, env);
  assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ['hookEventName', 'updatedInput']);
  assert.equal(out.hookSpecificOutput.updatedInput.run_in_background, true);
  const named = preToolUse({ tool_name: 'Bash', tool_input: { command: 'codex exec "x"', description: 'Fix chapter 5' } }, env);
  assert.equal(named.hookSpecificOutput.updatedInput.description, 'Fix chapter 5');
  assert.equal(preToolUse({ tool_name: 'Read', tool_input: {} }, env), null);
  assert.equal(preToolUse({ tool_name: 'Bash', tool_input: { command: 'codex exec "x"' } }, { ...env, JEV_WATCH_DISABLE: '1' }), null);
});

test('the hook script prints JSON for workers and nothing otherwise, even on bad input', () => {
  const run = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: root } });
  const hit = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'codex exec "x"' } }));
  assert.equal(hit.status, 0);
  assert.match(JSON.parse(hit.stdout).hookSpecificOutput.updatedInput.command, /jev-watch\.js' -- codex exec/);
  assert.equal(run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })).stdout, '');
  const bad = run('not json');
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
});

test('the plugin bin wrapper runs the CLI', () => {
  const r = spawnSync(path.join(root, 'bin', 'jev-watch'), ['--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /watch a coding agent/);
});
