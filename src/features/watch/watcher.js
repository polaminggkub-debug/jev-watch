// The watch loop: collect output, run the free rules every interval, ask Jev
// when the log has moved, and stop the worker once something is wrong.

import { createWriteStream } from 'node:fs';
import { Rules, askJev, jevProblem } from '../../entities/detection/index.js';
import { extractSessionId } from '../../entities/worker/index.js';
import { changedSince, fingerprint, snapshot } from '../../shared/git/index.js';

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

class Watcher {
  constructor({ source, cwd, task, logPath, opts, ask, now }) {
    this.o = { ...DEFAULTS, ...opts };
    Object.assign(this, { source, cwd, task, ask, now });
    this.rules = new Rules({ repeat: this.o.repeat, idleMin: this.o.idleMin, noChangeMin: this.o.noChangeMin, now });
    this.log = logPath ? createWriteStream(logPath, { flags: 'a' }) : null;
    Object.assign(this, { tail: '', sessionId: null, stopped: null, lastJev: null, strikes: 0, jevCalls: 0, grew: false });
    this.startedAt = now();
    this.fp = fingerprint(cwd);
    this.before = snapshot(cwd);
    source.onData((text) => this.onData(text));
  }

  onData(text) {
    this.log?.write(text);
    if (this.o.verbose) process.stderr.write(text);
    this.tail = (this.tail + text).slice(-TAIL_CHARS);
    this.sessionId ||= extractSessionId(this.tail);
    this.grew = true;
    this.rules.feed(text);
  }

  stop(hit) {
    if (this.stopped) return;
    this.stopped = hit;
    this.source.stop();
  }

  async check() {
    this.rules.tick();
    const next = fingerprint(this.cwd);
    if (next !== this.fp) this.rules.fileChanged();
    this.fp = next;
    const hit = this.rules.check();
    if (hit) return this.stop({ ...hit, by: 'rules' });
    if (this.o.jev && this.grew) await this.checkJev();
  }

  async checkJev() {
    this.grew = false;
    this.jevCalls += 1;
    const input = { task: this.task, log: this.tail, files: changedSince(this.cwd, this.before), elapsedMin: this.elapsedMin() };
    const answer = await this.ask(input);
    if (answer.error) return;
    this.lastJev = answer;
    const found = jevProblem(answer, this.o.threshold);
    this.strikes = found ? this.strikes + 1 : 0;
    if (found && this.strikes >= this.o.strikes) {
      const reason = `Jev: ${found.problem} ${found.p.toFixed(2)} in ${this.strikes} checks in a row`;
      this.stop({ problem: found.problem, reason, by: 'jev' });
    }
  }

  elapsedMin() {
    return Math.round(((this.now() - this.startedAt) / 60000) * 10) / 10;
  }

  outcome(code, error) {
    if (this.stopped) return 'stopped';
    if (error) return 'failed';
    if (code === null) return 'ended';
    return code === 0 ? 'done' : 'failed';
  }

  result(code, error) {
    return {
      outcome: this.outcome(code, error),
      exitCode: code,
      error: error ? error.message : null,
      stop: this.stopped,
      sessionId: this.sessionId,
      lastJev: this.lastJev,
      jevCalls: this.jevCalls,
      elapsedMin: this.elapsedMin(),
      files: changedSince(this.cwd, this.before),
      repeated: this.rules.repeatedErrors().slice(0, 3),
      tail: this.tail,
    };
  }

  // One check at a time; a slow Jev call skips ticks instead of piling up.
  run() {
    return new Promise((resolve) => {
      let busy = false;
      const timer = setInterval(async () => {
        if (busy || this.stopped) return;
        busy = true;
        await this.check().finally(() => (busy = false));
      }, this.o.intervalSec * 1000);
      const onSignal = () => this.stop({ problem: 'cancelled', reason: 'jev-watch was interrupted', by: 'user' });
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
      this.source.onExit((code, error) => {
        clearInterval(timer);
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        this.log?.end();
        resolve(this.result(code, error));
      });
    });
  }
}

// Resolves once the source ends, with everything the report needs.
export function watch({ source, cwd, task, logPath, opts = {}, ask = askJev, now = Date.now }) {
  return new Watcher({ source, cwd, task, logPath, opts, ask, now }).run();
}
