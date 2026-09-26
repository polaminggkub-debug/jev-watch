import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedSince, snapshot } from '../src/shared/git/index.js';

test('only files touched after the snapshot count as changed', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'jev-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  writeFileSync(path.join(dir, 'a.txt'), 'a');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  writeFileSync(path.join(dir, 'old-junk.txt'), 'left over before the run');

  const before = snapshot(dir);
  assert.deepEqual(changedSince(dir, before), []);

  writeFileSync(path.join(dir, 'a.txt'), 'edited by the worker');
  writeFileSync(path.join(dir, 'new.txt'), 'created by the worker');
  assert.deepEqual(changedSince(dir, before).sort(), ['a.txt', 'new.txt']);
});
