// Reading files for a Jev call: whole text or a reason why not. Never truncates,
// because a judgment about half a file is worse than no judgment.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Jev has a 32K token window; leave room for the task and the question.
export const MAX_FILE_CHARS = 96000;
export const MAX_FILES = 255;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);

function looksBinary(buf) {
  return buf.subarray(0, 8192).includes(0);
}

// { content } or { error } where error is not_found, not_file, binary or too_large.
export function readText(file, { maxChars = MAX_FILE_CHARS } = {}) {
  let info;
  try {
    info = statSync(file);
  } catch {
    return { error: 'not_found' };
  }
  if (!info.isFile()) return { error: 'not_file' };
  if (info.size > maxChars * 4) return { error: 'too_large' };
  const buf = readFileSync(file);
  if (looksBinary(buf)) return { error: 'binary' };
  const content = buf.toString('utf8');
  return content.length > maxChars ? { error: 'too_large' } : { content };
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    else if (entry.isFile()) out.push(path.join(dir, entry.name));
  }
}

// Files and directories to a flat file list, capped at `limit`.
export function expandPaths(inputs, { cwd = process.cwd(), limit = MAX_FILES } = {}) {
  const all = [];
  for (const input of inputs) {
    const full = path.resolve(cwd, input);
    if (statSync(full, { throwIfNoEntry: false })?.isDirectory()) walk(full, all);
    else all.push(full);
  }
  const unique = [...new Set(all)];
  return { files: unique.slice(0, limit), dropped: unique.slice(limit) };
}
