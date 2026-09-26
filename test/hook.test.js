import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preToolUse, wrapCommand } from '../src/app/hook.js';

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
});

test('the hook output edits the command and backgrounds it without deciding permission', () => {
  const env = { CLAUDE_PLUGIN_ROOT: '/p' };
  const out = preToolUse({ tool_name: 'Bash', tool_input: { command: 'codex exec "x"' } }, env);
  assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ['hookEventName', 'updatedInput']);
  assert.equal(out.hookSpecificOutput.updatedInput.run_in_background, true);
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
