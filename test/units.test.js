import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rules, errorSignature, askJev, jevProblem, statusRequest } from '../src/entities/detection/index.js';
import { buildRequest, resolveKey } from '../src/shared/jev/index.js';
import { extractSessionId, resumeCommand, guessTask, workerCwd, detectTool } from '../src/entities/worker/index.js';

test('error signatures ignore numbers, hashes and positions', () => {
  const a = errorSignature('Error: timeout 3000ms at src/a.ts:12:5 (abc1234f)');
  const b = errorSignature('Error: timeout 5000ms at src/a.ts:99:1 (ffee0099)');
  assert.equal(a, b);
  assert.equal(errorSignature('all 12 tests passed'), null);
});

test('one test run printing an error many times is not a loop', () => {
  const rules = new Rules({ repeat: 3 });
  rules.feed('Error: expected 1 got 2\n'.repeat(10));
  assert.equal(rules.check(), null);
});

test('the same error across three checks is a loop', () => {
  const rules = new Rules({ repeat: 3 });
  for (let i = 0; i < 3; i++) {
    rules.feed('Error: Cannot find module x\n');
    rules.tick();
  }
  const hit = rules.check();
  assert.equal(hit.problem, 'looping');
  assert.match(hit.reason, /3 checks/);
});

test('error lines from a test run that passes are not a loop', () => {
  const rules = new Rules({ repeat: 3 });
  for (let i = 0; i < 3; i++) {
    rules.feed('...............failed r/Broken: upstream unavailable\n');
    rules.feed('Ran 33 tests in 1.3s\n');
    rules.feed('  OK\n');
    rules.tick();
  }
  assert.equal(rules.check(), null);
});

test('diff lines the worker writes are not errors', () => {
  const rules = new Rules({ repeat: 3 });
  for (let i = 0; i < 3; i++) {
    rules.feed("+    assert.equal(x, 0, 'Neutral mentions cannot reach 15 opinions');\n");
    rules.tick();
  }
  assert.equal(rules.check(), null);
});

test('silence and no file changes count as stalled', () => {
  let t = 0;
  const rules = new Rules({ idleMin: 10, noChangeMin: 20, now: () => t });
  t = 9 * 60000;
  assert.equal(rules.check(), null);
  t = 11 * 60000;
  assert.match(rules.check().reason, /no output/);
  t = 15 * 60000;
  rules.feed('still busy\n');
  t = 21 * 60000;
  assert.match(rules.check().reason, /no file changes/);
});

test('key order and OpenRouter routing', () => {
  assert.equal(resolveKey({ OPENROUTER_API_KEY: 'sk-or-b', JEV_WATCH_API_KEY: 'sk-or-a' }), 'sk-or-a');
  const request = statusRequest({ task: 't', log: 'x'.repeat(10000), files: [], elapsedMin: 1 });
  assert.equal(request.state.recent_output.length, 6000);
  const or = buildRequest(request, { key: 'sk-or-1', env: {} });
  assert.match(or.url, /openrouter/);
  assert.equal(or.body.model, '~typesafe/jev-latest');
  assert.deepEqual(or.body.provider, { zdr: true, data_collection: 'deny' });
  assert.match(buildRequest(request, { key: 'ts-1', env: {} }).url, /typesafe/);
});

test('askJev parses answers and never throws', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ answers: { status: { choice: 'looping', probabilities: { looping: 0.9 } } } }) });
  const input = { task: 't', log: '', files: [], elapsedMin: 0 };
  assert.equal((await askJev(input, { key: 'k', fetchFn: ok })).choice, 'looping');
  assert.equal((await askJev(input, { key: 'k', fetchFn: async () => ({ ok: false, status: 402 }) })).error, 'http_402');
  assert.equal((await askJev(input, { key: 'k', fetchFn: async () => { throw new TypeError('x'); } })).error, 'TypeError');
  assert.equal((await askJev(input, { key: '' })).error, 'missing_api_key');
});

test('jevProblem picks the surest problem above the threshold', () => {
  const answer = { probabilities: { progressing: 0.05, looping: 0.82, off_task: 0.9, stalled: 0.1 } };
  assert.deepEqual(jevProblem(answer, 0.8), { problem: 'off_task', p: 0.9 });
  assert.equal(jevProblem({ probabilities: { progressing: 0.95 } }, 0.8), null);
  assert.equal(jevProblem({ error: 'x' }, 0.8), null);
});

test('session ids from codex and opencode output', () => {
  assert.equal(extractSessionId('model: gpt\nsession id: 0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b\n'), '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
  assert.equal(extractSessionId('{"type":"thread.started","thread_id":"abc-1"}'), 'abc-1');
  assert.equal(extractSessionId('{"type":"step","sessionID":"ses_9XyZ"}'), 'ses_9XyZ');
  assert.equal(extractSessionId('nothing here'), null);
});

test('codex resume keeps model and sandbox but drops --cd', () => {
  const argv = ['codex', 'exec', '-m', 'gpt-5', '-s', 'danger-full-access', '-C', 'app', '--json', 'fix login'];
  assert.equal(detectTool(argv), 'codex');
  assert.equal(guessTask(argv), 'fix login');
  assert.equal(workerCwd('codex', argv, '/repo'), '/repo/app');
  assert.deepEqual(resumeCommand('codex', argv, 'sid', 'wrong file, fix X'), [
    'codex', 'exec', 'resume', '-m', 'gpt-5', '--json', '-c', 'sandbox_mode="danger-full-access"', 'sid', 'wrong file, fix X',
  ]);
  assert.deepEqual(resumeCommand('codex', ['codex', 'exec', '--full-auto', 'x'], null, 'm').slice(-3), ['sandbox_mode="workspace-write"', '--last', 'm']);
});

test('opencode resume continues the session', () => {
  const argv = ['/usr/local/bin/opencode', 'run', '--model=deepseek/v4', '--auto', 'add export button'];
  assert.deepEqual(resumeCommand('opencode', argv, 'ses_1', 'do Y'), [
    '/usr/local/bin/opencode', 'run', '--model=deepseek/v4', '--auto', '--session', 'ses_1', 'do Y',
  ]);
  assert.throws(() => resumeCommand(null, ['aider'], null, 'm'), /only supported/);
});
