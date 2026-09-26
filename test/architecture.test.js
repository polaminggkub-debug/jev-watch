import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImport, checkRepo, importsOf } from '../scripts/check-architecture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const at = (rel) => path.join(src, rel);

test('the repo follows its own architecture rules', () => {
  assert.deepEqual(checkRepo(root), []);
});

test('imports are found in static, re-export and dynamic forms', () => {
  const code = "import a from './a.js';\nexport { b } from '../b/index.js';\nconst c = await import('./c.js');";
  assert.deepEqual(importsOf(code), ['./a.js', '../b/index.js', './c.js']);
});

test('each rule catches its violation', () => {
  const rule = (from, spec) => checkImport(at(from), spec, src)?.rule ?? null;
  assert.equal(rule('shared/git/status.js', '../../entities/run/index.js'), 'layer-direction');
  assert.equal(rule('entities/run/report.js', '../worker/index.js'), 'cross-slice');
  assert.equal(rule('features/watch/attempt.js', '../../shared/jev/client.js'), 'public-api');
  assert.equal(rule('app/cli.js', 'chalk'), 'runtime-import');
  assert.equal(rule('app/cli.js', '../features/watch/index.js'), null);
  assert.equal(rule('entities/run/report.js', './store.js'), null);
  assert.equal(rule('app/cli.js', 'node:fs'), null);
});
