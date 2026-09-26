// File progress as git sees it. Outside a git repo every call returns empty
// results and the no-change rule simply never fires.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}

export function isRepo(cwd) {
  return git(cwd, ['rev-parse', '--is-inside-work-tree']) !== null;
}

// Paths with uncommitted changes, relative to the repo root.
export function changedFiles(cwd) {
  const out = git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ''));
}

function signature(root, file) {
  try {
    const s = statSync(path.join(root, file));
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return 'gone';
  }
}

// Size and mtime of every file that is already dirty, taken when a run starts.
export function snapshot(cwd) {
  const root = (git(cwd, ['rev-parse', '--show-toplevel']) || cwd).trim();
  return new Map(changedFiles(cwd).map((f) => [f, signature(root, f)]));
}

// Dirty files that are new or different since `before`: what the worker touched,
// not what was already lying around uncommitted.
export function changedSince(cwd, before) {
  const root = (git(cwd, ['rev-parse', '--show-toplevel']) || cwd).trim();
  return changedFiles(cwd).filter((f) => before.get(f) !== signature(root, f));
}

// Changes whenever tracked content or any untracked file changes.
export function fingerprint(cwd) {
  const diff = git(cwd, ['diff', 'HEAD']);
  if (diff === null) return '';
  const root = (git(cwd, ['rev-parse', '--show-toplevel']) || cwd).trim();
  const hash = createHash('sha1').update(diff);
  for (const file of changedFiles(cwd)) hash.update(`${file}:${signature(root, file)}`);
  return hash.digest('hex');
}
