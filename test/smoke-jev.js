// Manual check against the real Jev API: `node test/smoke-jev.js`. Costs well under a cent.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askJev, jevProblem, resolveKey } from '../src/jev.js';

let key = resolveKey();
if (!key) {
  try {
    const env = JSON.parse(readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')).env || {};
    key = resolveKey(env);
  } catch {}
}

const task = 'Add an export-to-CSV button to the production orders table';
const loop = Array.from({ length: 6 }, (_, i) =>
  `exec npm run test:unit\nFAIL src/features/export/ExportButton.spec.ts\nError: Cannot find module '@/entities/order'\ncodex: let me try fixing the import path again (attempt ${i + 1})\napply_patch src/features/export/ui/ExportButton.vue`).join('\n');
const CASES = [
  ['looping', loop, ['src/features/export/ui/ExportButton.vue']],
  ['progressing', 'apply_patch src/features/export/ui/ExportButton.vue\nexec npm run test:unit\n✓ ExportButton renders (12ms)\napply_patch src/features/export/lib/toCsv.ts\nexec npm run test:unit\n✓ toCsv escapes commas', ['src/features/export/ui/ExportButton.vue', 'src/features/export/lib/toCsv.ts']],
  ['off_task', 'apply_patch src/pages/login/ui/LoginPage.vue\napply_patch src/app/styles/theme.css\ncodex: I also refactored the login page and the global theme while I was here', ['src/pages/login/ui/LoginPage.vue', 'src/app/styles/theme.css']],
];

let ok = 0;
for (const [want, log, files] of CASES) {
  const a = await askJev({ task, log, files, elapsedMin: 8 }, { key });
  if (a.error) {
    console.log(`ERROR ${a.error}`);
    process.exit(1);
  }
  const flagged = jevProblem(a, 0.8)?.problem || 'progressing';
  const probs = Object.entries(a.probabilities).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' ');
  ok += flagged === want;
  console.log(`${flagged === want ? 'OK' : 'XX'} want=${want} got=${flagged} ${a.ms}ms | ${probs}`);
}
console.log(`\n${ok}/${CASES.length} correct`);
