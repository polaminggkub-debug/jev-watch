// A source is where the worker's output comes from. Both kinds expose the same
// shape: onData(cb), onExit(cb) with (code, error), and stop().

import { spawn } from 'node:child_process';
import { openSync, readSync, closeSync, statSync } from 'node:fs';

// Starts the worker in its own process group so stop() takes its children too.
export function spawnSource(argv, cwd) {
  const child = spawn(argv[0], argv.slice(1), { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const dataCbs = [];
  child.stdout.on('data', (b) => dataCbs.forEach((cb) => cb(b.toString('utf8'))));
  child.stderr.on('data', (b) => dataCbs.forEach((cb) => cb(b.toString('utf8'))));
  const signal = (sig) => {
    try {
      process.kill(-child.pid, sig);
    } catch {
      child.kill(sig);
    }
  };
  return {
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => {
      child.on('error', (err) => cb(null, err));
      child.on('close', (code, sig) => cb(code ?? (sig ? 128 : 1), null));
    },
    stop() {
      signal('SIGTERM');
      setTimeout(() => signal('SIGKILL'), 5000).unref();
    },
  };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Follows a log file another script writes. With a pid the run ends when that
// process exits and stop() terminates it; without one it ends only on stop().
export function tailSource(file, pid, pollMs = 1000) {
  const dataCbs = [];
  let exitCb = () => {};
  let offset = 0;
  const read = () => {
    let size;
    try {
      size = statSync(file).size;
    } catch {
      return;
    }
    if (size < offset) offset = 0;
    if (size === offset) return;
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    closeSync(fd);
    offset = size;
    const text = buf.toString('utf8');
    dataCbs.forEach((cb) => cb(text));
  };
  const timer = setInterval(() => {
    read();
    if (pid && !alive(pid)) finish(null);
  }, pollMs);
  const finish = (code) => {
    clearInterval(timer);
    read();
    exitCb(code, null);
    exitCb = () => {};
  };
  return {
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => {
      exitCb = cb;
    },
    stop() {
      if (pid) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {}
      }
      finish(null);
    },
  };
}
