import { triageFiles } from '../features/triage/index.js';
import { EXIT } from '../features/watch/index.js';
import { resolveKey } from '../shared/jev/index.js';
import { UsageError } from './usage.js';

const ORDER = { read: 0, skim: 1, unjudged: 2, skip: 3 };

function line(r) {
  const p = r.p === null || r.p === undefined ? '   -' : r.p.toFixed(2);
  return `${r.verdict.padEnd(8)} ${p}  ${r.path}${r.reason ? `  (${r.reason})` : ''}`;
}

export function skipAt(values) {
  if (values['skip-at'] === undefined) return undefined;
  const n = Number(values['skip-at']);
  if (!(n > 0 && n <= 1)) throw new UsageError('--skip-at must be between 0 and 1');
  return n;
}

// Which of these files does the agent need to read for the task? One Jev call
// per file; only a confident "skip" skips, so anything unsure stays "read".
export async function triage(values, paths) {
  if (!values.task) throw new UsageError('--triage needs --task');
  if (!paths.length) throw new UsageError('--triage needs files or directories to judge');
  if (!resolveKey()) throw new Error('--triage needs a key: set JEV_WATCH_API_KEY, OPENROUTER_API_KEY or TYPESAFE_API_KEY');
  const out = await triageFiles(paths, { task: values.task, skipAt: skipAt(values) });
  const sorted = [...out.results].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  if (values.json) {
    console.log(JSON.stringify({ ...out, results: sorted }, null, 2));
    return EXIT.done;
  }
  for (const r of sorted) console.log(line(r));
  const count = (v) => sorted.filter((r) => r.verdict === v).length;
  console.log(`jev-watch: ${out.calls} Jev calls · read ${count('read')} · skim ${count('skim')} · skip ${count('skip')} · unjudged ${count('unjudged')}`);
  if (out.dropped.length) console.log(`jev-watch: ${out.dropped.length} files over the 255 limit were not judged`);
  return EXIT.done;
}
