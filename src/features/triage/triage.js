// Judge many files against one task with one Jev call per file, in parallel.

import path from 'node:path';
import { expandPaths, readText } from '../../shared/files/index.js';
import { askRelevance, readVerdict } from '../../entities/relevance/index.js';

const CONCURRENCY = 8;

async function judge(file, { task, cwd, skipAt, clientOpts }) {
  const rel = path.relative(cwd, file) || file;
  const text = readText(file);
  if (text.error) return { path: rel, verdict: 'unjudged', reason: text.error };
  const answer = await askRelevance({ task, path: rel, content: text.content }, clientOpts);
  return { path: rel, ...readVerdict(answer, { skipAt }), tokens: answer.usage?.input_tokens ?? null };
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  return results;
}

// { results, dropped, calls } where each result has a verdict of read, skim,
// skip or unjudged (binary, too large, missing).
export async function triageFiles(inputs, { task, cwd = process.cwd(), skipAt, clientOpts, concurrency = CONCURRENCY }) {
  const { files, dropped } = expandPaths(inputs, { cwd });
  const results = await pool(files, concurrency, (file) => judge(file, { task, cwd, skipAt, clientOpts }));
  // A result with a reason never got an answer (unreadable file or API error).
  const calls = results.filter((r) => !r.reason).length;
  return { results, dropped: dropped.map((f) => path.relative(cwd, f)), calls };
}
