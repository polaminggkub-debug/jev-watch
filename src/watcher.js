// The watch loop: collect output, run the free rules every interval, ask Jev
// when the log has moved, and stop the worker once something is wrong.

import { createWriteStream } from 'node:fs';
import { Rules } from './rules.js';
import { askJev, jevProblem } from './jev.js';
import { changedFiles, fingerprint } from './git.js';
import { extractSessionId } from './session.js';

const TAIL_CHARS = 64 * 1024;

export const DEFAULTS = {
  intervalSec: 45,
  threshold: 0.8,
  strikes: 2,
  repeat: 3,
  idleMin: 10,
  noChangeMin: 20,
  jev: true,
  verbose: false,
};

// Resolves once the source ends, with everything the report needs.
export function watch({ source, cwd, task, logPath, opts = {}, ask = askJev, now = Date.now }) {
  const o = { ...DEFAULTS, ...opts };
  const rules = new Rules({ repeat: o.repeat, idleMin: o.idleMin, noChangeMin: o.noChangeMin, now });
  const log = logPath ? createWriteStream(logPath, { flags: 'a' }) : null;
  const s = { tail: '', sessionId: null, stopped: null, lastJev: null, strikes: 0, jevCalls: 0, grew: false };
  const startedAt = now();
  let fp = fingerprint(cwd);

  source.onData((text) => {
    log?.write(text);
    if (o.verbose) process.stderr.write(text);
    s.tail = (s.tail + text).slice(-TAIL_CHARS);
    s.sessionId ||= extractSessionId(s.tail);
    s.grew = true;
    rules.feed(text);
  });

  const stop = (hit) => {
    if (s.stopped) return;
    s.stopped = hit;
    source.stop();
  };

  const check = async () => {
    rules.tick();
    const next = fingerprint(cwd);
    if (next !== fp) rules.fileChanged();
    fp = next;
    const hit = rules.check();
    if (hit) return stop({ ...hit, by: 'rules' });
    if (!o.jev || !s.grew) return;
    s.grew = false;
    s.jevCalls += 1;
    const answer = await ask({ task, log: s.tail, files: changedFiles(cwd), elapsedMin: minutesSince(startedAt, now) });
    if (answer.error) return;
    s.lastJev = answer;
    const found = jevProblem(answer, o.threshold);
    s.strikes = found ? s.strikes + 1 : 0;
    if (found && s.strikes >= o.strikes) {
      stop({ problem: found.problem, reason: `Jev: ${found.problem} ${found.p.toFixed(2)} in ${s.strikes} checks in a row`, by: 'jev' });
    }
  };

  return new Promise((resolve) => {
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || s.stopped) return;
      busy = true;
      try {
        await check();
      } finally {
        busy = false;
      }
    }, o.intervalSec * 1000);

    const onSignal = () => stop({ problem: 'cancelled', reason: 'jev-watch was interrupted', by: 'user' });
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    source.onExit((code, error) => {
      clearInterval(timer);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      log?.end();
      resolve({
        outcome: s.stopped ? 'stopped' : error ? 'failed' : code === null ? 'ended' : code === 0 ? 'done' : 'failed',
        exitCode: code,
        error: error ? error.message : null,
        stop: s.stopped,
        sessionId: s.sessionId,
        lastJev: s.lastJev,
        jevCalls: s.jevCalls,
        elapsedMin: minutesSince(startedAt, now),
        files: changedFiles(cwd),
        repeated: rules.repeatedErrors().slice(0, 3),
        tail: s.tail,
      });
    });
  });
}

function minutesSince(start, now) {
  return Math.round(((now() - start) / 60000) * 10) / 10;
}
