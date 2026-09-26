#!/usr/bin/env node
// Fails open: any problem here leaves the tool call untouched.
import { preToolUse } from '../src/app/hook.js';

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  try {
    const out = preToolUse(JSON.parse(input || '{}'));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {}
  process.exit(0);
});
