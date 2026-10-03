// Run by a human with a real key: node test/smoke-triage.js [dir]
// Asks Jev the same question with a Thai and an English task and compares the
// verdicts, to show whether the task language changes what Jev says.

import { triageFiles } from '../src/features/triage/index.js';
import { resolveKey } from '../src/shared/jev/index.js';

const TASKS = {
  thai: 'แก้บั๊กใน hook ที่ wrap คำสั่ง worker',
  english: 'Fix the bug in the PreToolUse hook that wraps worker commands',
};

if (!resolveKey()) {
  console.error('Set JEV_WATCH_API_KEY, OPENROUTER_API_KEY or TYPESAFE_API_KEY first.');
  process.exit(1);
}

const dir = process.argv[2] || 'src';
const runs = {};
for (const [name, task] of Object.entries(TASKS)) runs[name] = await triageFiles([dir], { task });

const tag = (r) => `${r.verdict}${r.probs ? ` (skip ${(r.probs.skip ?? 0).toFixed(2)})` : ''}`;
for (const [i, r] of runs.thai.results.entries()) {
  console.log(`${r.path.padEnd(42)} thai: ${tag(r).padEnd(18)} english: ${tag(runs.english.results[i])}`);
}
for (const [name, run] of Object.entries(runs)) {
  const n = (v) => run.results.filter((r) => r.verdict === v).length;
  console.log(`${name}: read ${n('read')} · skim ${n('skim')} · skip ${n('skip')} · ${run.calls} calls`);
}
