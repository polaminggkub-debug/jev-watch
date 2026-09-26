// Each run keeps its command, task and session id on disk so a later
// `--resume <runId>` can continue the same worker session.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function home(env = process.env) {
  return env.JEV_WATCH_HOME || path.join(os.homedir(), '.jev-watch');
}

export function newRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

export function runDir(runId, env) {
  if (!/^[\w-]+$/.test(runId)) throw new Error(`bad run id: ${runId}`);
  return path.join(home(env), 'runs', runId);
}

export function createRun(state, env) {
  const dir = runDir(state.runId, env);
  mkdirSync(dir, { recursive: true });
  saveRun(state, env);
  return dir;
}

export function saveRun(state, env) {
  writeFileSync(path.join(runDir(state.runId, env), 'state.json'), JSON.stringify(state, null, 2));
}

export function loadRun(runId, env) {
  const file = path.join(runDir(runId, env), 'state.json');
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`no run ${runId} (looked in ${file})`);
  }
}
