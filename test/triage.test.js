import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { triageFiles } from '../src/features/triage/index.js';
import { expandPaths, readText } from '../src/shared/files/index.js';

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'triage-'));
  mkdirSync(path.join(dir, 'src'));
  mkdirSync(path.join(dir, 'node_modules'));
  writeFileSync(path.join(dir, 'src/billing.js'), 'export const tax = 7;\n');
  writeFileSync(path.join(dir, 'src/logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]));
  writeFileSync(path.join(dir, 'src/readme.txt'), 'unrelated notes\n');
  writeFileSync(path.join(dir, 'node_modules/dep.js'), 'x');
  return dir;
}

// Fake Jev: judges by whether the file content mentions tax.
function fakeFetch(calls) {
  return async (_url, init) => {
    const { state } = JSON.parse(init.body);
    calls.push(state.path);
    const answer = state.content.includes('tax')
      ? { choice: 'must_read', probabilities: { must_read: 0.95, skim: 0.03, skip: 0.02 } }
      : { choice: 'skip', probabilities: { must_read: 0.02, skim: 0.03, skip: 0.95 } };
    return { ok: true, json: async () => ({ answers: { relevance: answer }, usage: { input_tokens: 42 } }) };
  };
}

test('directories expand without node_modules, binaries are not judged', async () => {
  const dir = project();
  const calls = [];
  const out = await triageFiles(['.'], { task: 'fix the tax bug', cwd: dir, clientOpts: { key: 'k', fetchFn: fakeFetch(calls) } });
  const byPath = Object.fromEntries(out.results.map((r) => [r.path, r]));
  assert.equal(byPath[path.join('src', 'billing.js')].verdict, 'read');
  assert.equal(byPath[path.join('src', 'readme.txt')].verdict, 'skip');
  assert.equal(byPath[path.join('src', 'logo.png')].verdict, 'unjudged');
  assert.equal(byPath[path.join('src', 'logo.png')].reason, 'binary');
  assert.equal(out.calls, 2);
  assert.equal(calls.length, 2);
  assert.ok(!out.results.some((r) => r.path.includes('node_modules')));
  assert.equal(byPath[path.join('src', 'billing.js')].tokens, 42);
});

test('an API failure leaves every file marked read', async () => {
  const dir = project();
  const down = async () => ({ ok: false, status: 503 });
  const out = await triageFiles(['src/billing.js'], { task: 't', cwd: dir, clientOpts: { key: 'k', fetchFn: down } });
  assert.equal(out.results[0].verdict, 'read');
  assert.equal(out.results[0].reason, 'http_503');
});

test('files are never truncated and the file count is capped', () => {
  const dir = project();
  assert.equal(readText(path.join(dir, 'src/billing.js'), { maxChars: 5 }).error, 'too_large');
  assert.equal(readText(path.join(dir, 'nope.js')).error, 'not_found');
  const { files, dropped } = expandPaths(['src'], { cwd: dir, limit: 1 });
  assert.equal(files.length, 1);
  assert.equal(dropped.length, 2);
});
