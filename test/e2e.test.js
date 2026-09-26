import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from '../src/features/watch/index.js';
import { spawnSource } from '../src/shared/process/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, '..', 'bin', 'jev-watch.js');
const FIX = path.join(here, 'fixtures');
const WORKER = path.join(FIX, 'worker.js');

function cli(args, extraEnv = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jev-watch-'));
  const env = {
    ...process.env, JEV_WATCH_HOME: tmp, JEV_WATCH_API_KEY: '', OPENROUTER_API_KEY: '', TYPESAFE_API_KEY: '',
    PATH: `${FIX}${path.delimiter}${process.env.PATH}`, ...extraEnv,
  };
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: tmp, env, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: r.stdout, err: r.stderr, env, runId: (r.stdout.match(/^jev-watch (\S+)/) || [])[1] };
}

const FAST = ['--interval', '0.1'];

test('a worker that finishes is reported DONE with exit 0', () => {
  const r = cli([...FAST, '--', process.execPath, WORKER, 'ok']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /DONE after/);
  assert.match(r.out, /all done/);
  assert.match(r.err, /no API key found/);
});

test('a failing worker exits 1', () => {
  const r = cli([...FAST, '--no-jev', '--', process.execPath, WORKER, 'fail']);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAILED .*exit 1/);
});

test('a looping worker is stopped by the rules, and only the report is printed', () => {
  const r = cli([...FAST, '--no-jev', '--', process.execPath, WORKER, 'loop']);
  assert.equal(r.code, 2);
  assert.match(r.out, /STOPPED \(looping\).*same error in \d+ checks/);
  assert.match(r.out, /resume needs a codex or opencode command/);
  assert.ok(r.out.split('\n').length < 80, 'report stays short');
});

test('a stopped codex run is resumed in the same session', () => {
  const r = cli([...FAST, '--no-jev', '--', 'codex', 'exec', '-s', 'danger-full-access', 'fix the import']);
  assert.equal(r.code, 2, r.err);
  assert.match(r.out, /Session: 0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/);
  assert.match(r.out, new RegExp(`--resume ${r.runId}`));

  const argsFile = path.join(r.env.JEV_WATCH_HOME, 'args.jsonl');
  const env = { ...r.env, FAKE_CODEX_ARGS: argsFile };
  const again = spawnSync(process.execPath, [BIN, '--resume', r.runId, 'import from @/entities/order/index'], { env, encoding: 'utf8', timeout: 20000 });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /attempt 2\/4/);
  assert.match(again.stdout, /DONE/);
  assert.deepEqual(JSON.parse(readFileSync(argsFile, 'utf8').trim()), [
    'exec', 'resume', '-c', 'sandbox_mode="danger-full-access"', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 'import from @/entities/order/index',
  ]);
});

test('out of corrections means ask the user', () => {
  const r = cli([...FAST, '--no-jev', '--max-resumes', '0', '--', 'codex', 'exec', 'fix it']);
  assert.equal(r.code, 3);
  assert.match(r.out, /Ask the user/);
  const again = spawnSync(process.execPath, [BIN, '--resume', r.runId, 'try again'], { env: r.env, encoding: 'utf8' });
  assert.equal(again.status, 3);
});

test('usage errors exit 64', () => {
  assert.equal(cli([]).code, 0);
  assert.equal(cli(['--interval', '0.1']).code, 64);
  assert.equal(cli(['--resume', 'nope']).code, 64);
});

test('Jev must flag a problem in consecutive checks before the worker is stopped', async () => {
  const answers = ['off_task', 'progressing', 'off_task', 'off_task'];
  let calls = 0;
  const ask = async () => ({ probabilities: { [answers[calls++] || 'progressing']: 0.9 }, ms: 5 });
  const source = spawnSource([process.execPath, WORKER, 'chatty'], os.tmpdir());
  const r = await watch({ source, cwd: os.tmpdir(), task: 't', opts: { intervalSec: 0.05 }, ask });
  assert.equal(r.outcome, 'stopped');
  assert.equal(r.stop.by, 'jev');
  assert.equal(r.stop.problem, 'off_task');
  assert.equal(r.jevCalls, 4);
});
