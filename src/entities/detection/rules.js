// Deterministic checks. They cost nothing and never guess, so a hit stops the
// worker right away; Jev only covers what these cannot see.

import { stripAnsi } from '../../shared/text/index.js';

const ERROR_LINE = /\b(error|failed|failure|exception|traceback|cannot|fatal)\b|✘|✗/i;
const WINDOW_MS = 10 * 60 * 1000;
// A test run that ends green: its "failed"-looking lines were expected output.
const PASS_LINE = /^OK\b|^#\s*fail\s+0\b|\b0 failed\b|\b\d+ passed\b(?!.*\bfailed\b)/i;

// Collapse the parts of an error line that change between identical failures
// (numbers, hashes, line:col, timestamps) so repeats compare equal.
export function errorSignature(line) {
  const text = line.trim();
  if (text.length < 8 || !ERROR_LINE.test(text)) return null;
  return stripAnsi(text)
    .replace(/\b[0-9a-f]{7,}\b/gi, '#')
    .replace(/\d+(\.\d+)?(ms|s)\b/g, '#')
    .replace(/:\d+(:\d+)?/g, ':#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

export class Rules {
  constructor({ repeat = 3, idleMin = 10, noChangeMin = 20, now = Date.now } = {}) {
    this.repeat = repeat;
    this.idleMs = idleMin * 60 * 1000;
    this.noChangeMs = noChangeMin * 60 * 1000;
    this.now = now;
    this.hits = [];
    this.lastOutputAt = now();
    this.lastChangeAt = now();
    this.partial = '';
    this.tickNo = 0;
  }

  // One failing test run can print the same error several times, so repeats are
  // counted per check interval, not per line.
  tick() {
    this.tickNo += 1;
  }

  feed(chunk) {
    this.lastOutputAt = this.now();
    const lines = (this.partial + chunk).split('\n');
    this.partial = lines.pop();
    for (const line of lines) {
      if (PASS_LINE.test(stripAnsi(line).trim())) {
        this.hits = this.hits.filter((h) => h.tick !== this.tickNo);
        continue;
      }
      const sig = errorSignature(line);
      if (sig) this.hits.push({ sig, line: line.trim().slice(0, 300), at: this.now(), tick: this.tickNo });
    }
  }

  fileChanged() {
    this.lastChangeAt = this.now();
  }

  // Errors seen in at least `repeat` separate checks in the last ten minutes.
  repeatedErrors() {
    const since = this.now() - WINDOW_MS;
    this.hits = this.hits.filter((h) => h.at >= since);
    const counts = new Map();
    for (const h of this.hits) {
      const entry = counts.get(h.sig) || { line: h.line, ticks: new Set() };
      entry.ticks.add(h.tick);
      entry.line = h.line;
      counts.set(h.sig, entry);
    }
    return [...counts.values()]
      .map((e) => ({ line: e.line, count: e.ticks.size }))
      .filter((e) => e.count >= this.repeat)
      .sort((a, b) => b.count - a.count);
  }

  check() {
    const repeated = this.repeatedErrors();
    if (repeated.length) {
      const top = repeated[0];
      return { problem: 'looping', reason: `same error in ${top.count} checks: "${top.line}"` };
    }
    const now = this.now();
    if (now - this.lastOutputAt >= this.idleMs) {
      return { problem: 'stalled', reason: `no output for ${minutes(now - this.lastOutputAt)} min` };
    }
    if (now - this.lastChangeAt >= this.noChangeMs) {
      return { problem: 'stalled', reason: `no file changes for ${minutes(now - this.lastChangeAt)} min` };
    }
    return null;
  }
}

function minutes(ms) {
  return Math.round(ms / 60000);
}
