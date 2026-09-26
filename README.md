# jev-watch

Watch a background coding agent (Codex, OpenCode, or any CLI) and wake your orchestrator **only** when the worker loops, stalls, or drifts off task.

If you run Claude Code (or any agent) as the lead and hand implementation to Codex or OpenCode, the lead usually sits in a `sleep 60; tail log` loop, paying tokens to read logs that say "still working". jev-watch does that watching for you. It uses free local rules plus [Jev](https://typesafe.ai), a fast decision model that answers in under a second for a fraction of a cent. The lead reads one short report when something actually needs a decision.

```
lead agent ──► jev-watch -- codex exec "fix the login page"
                  │  every 45 s: local rules + one Jev question
                  │  healthy  → keep going, lead stays asleep
                  │  problem  → stop worker, print a short report, exit 2
                  ▼
lead reads the report, decides what went wrong
                  ▼
jev-watch --resume <runId> "you are editing the wrong store, fix X in Y"
                  │  same Codex/OpenCode session, watched again
```

## Install

```bash
npm install -g jev-watch      # or: npx jev-watch ...
```

Node 18 or newer. No dependencies.

Set one key: `JEV_WATCH_API_KEY`, else `OPENROUTER_API_KEY`, else `TYPESAFE_API_KEY`. Keys starting with `sk-or-` go through OpenRouter with zero data retention. With no key, jev-watch runs on local rules only.

## Use

```bash
# Run and watch a worker
jev-watch -- codex exec -s workspace-write "add an export button to the orders table"
jev-watch -- opencode run --auto "migrate the settings page to PrimeVue"

# After a stop: send a correction into the same session and keep watching
jev-watch --resume 20260926-0735-a1b2 "stop editing OrderList.vue, the bug is in useOrders.ts"

# Watch a log your own script writes (stop needs --pid)
jev-watch --log worker.log --pid 4242 --task "fix the failing checkout test"
```

Run it as a background command from your lead agent. In Claude Code, a background Bash command wakes the agent when it exits, so the agent does nothing and costs nothing until the report arrives.

## What counts as a problem

| Check | Cost | Default |
|---|---|---|
| Same error in 3 separate checks within 10 min | free | `--repeat 3` |
| No output at all | free | `--idle-min 10` |
| No file changes (git) | free | `--no-change-min 20` |
| Jev says `looping`, `off_task` or `stalled` | <0.01¢ per check | `--threshold 0.8`, `--strikes 2` in a row |

Local rules stop the worker on the first hit. Jev must agree twice in a row, so one odd answer never kills a good run. Jev is only asked when the log has moved since the last check.

## The report

```
jev-watch 20260926-0735-a1b2 · attempt 1/4
STOPPED (looping) after 12.5 min: same error in 5 checks: "Error: Cannot find module '@/entities/order'"
Task: add an export button to the orders table
Last Jev check: looping=0.91 progressing=0.05 … (640ms) · 16 Jev calls
Repeated errors:
  5 checks: Error: Cannot find module '@/entities/order'
Files changed (3): src/features/export/ui/ExportButton.vue, …
Session: 0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b

Last 50 lines:
  …

Full log: ~/.jev-watch/runs/20260926-0735-a1b2/log-1.txt
Next: jev-watch --resume 20260926-0735-a1b2 "<what went wrong and what to do instead>"
```

After `--max-resumes` corrections (default 3) the report says to ask the user instead.

Exit codes: `0` done · `1` worker failed · `2` stopped by the watcher · `3` out of corrections · `64` usage.

## Resume support

| Worker | Session found from | Resumed with |
|---|---|---|
| Codex | `session id:` header or `--json` `thread_id` | `codex exec resume <id> "<msg>"` (model, config and sandbox carried over) |
| OpenCode | `--format json` `sessionID` | `opencode run --session <id> "<msg>"`, else `--continue` |
| Anything else | – | watched and stopped, not resumed |

## Development

```bash
npm test
```

Tests use fake workers and a fake `codex` binary, so they never call an API.

## License

MIT
