# jev-watch

[![CI](https://github.com/polaminggkub-debug/jev-watch/actions/workflows/ci.yml/badge.svg)](https://github.com/polaminggkub-debug/jev-watch/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

**jev-watch is a watchdog for AI coding agents.** It runs Codex, OpenCode or any coding CLI in the background, notices when the agent is **looping on the same error, stalled, or drifting off task**, stops it, and hands a short report to your lead agent (Claude Code, or you). The lead writes a correction and jev-watch **resumes the same Codex/OpenCode session**.

It is built for the "one smart orchestrator, cheaper workers" setup: Claude Code plans and reviews, Codex or OpenCode writes the code. Without a watchdog the orchestrator sits in a `sleep 60; tail log` loop, paying premium tokens to read logs that say "still working", or it only finds out 30 minutes later that the worker spent the whole time fixing the same import.

jev-watch checks every 45 seconds with **free local rules** and one question to [Jev](https://typesafe.ai), TypeSafe's fast decision model (sub-second, a fraction of a cent, available through OpenRouter). Your orchestrator stays idle and costs nothing until something actually needs a decision.

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

### Claude Code plugin (recommended, ready to use)

```bash
claude plugin marketplace add polaminggkub-debug/jev-watch
claude plugin install jev-watch@jev-watch
```

Then put your key in `~/.claude/settings.json` so the watcher can ask Jev (skip it to run on local rules only):

```json
{ "env": { "OPENROUTER_API_KEY": "sk-or-..." } }
```

That is all. The plugin brings three things:

- **A hook.** Every time Claude runs `codex exec ...` or `opencode run ...`, the call is wrapped in jev-watch and moved to the background. Your normal permission rules still apply. If the worker is buried in a compound command (`cd x && codex exec ... | tail`), jev-watch cannot watch it, so the hook blocks the call and tells Claude to rerun it as one plain command. An unwatched worker could otherwise sit waiting for input for hours without anyone being told.
- **A skill.** Claude learns what the report means, how to write a correction, and when to stop and ask you.
- **The `jev-watch` command** on Claude's PATH, for `--resume`. No npm install needed.

Turn it off for one command by starting it with `JEV_WATCH_DISABLE=1 ` or ending it with `# no-jev-watch`.

### Standalone CLI

```bash
npm install -g github:polaminggkub-debug/jev-watch
```

Node 20 or newer. Zero runtime dependencies. macOS and Linux.

Key lookup: `JEV_WATCH_API_KEY`, else `OPENROUTER_API_KEY`, else `TYPESAFE_API_KEY`. Keys starting with `sk-or-` go through OpenRouter with zero data retention. With no key, jev-watch still runs on its local rules.

## Use

```bash
# Run and watch a worker
jev-watch -- codex exec -s workspace-write "add an export button to the orders table"
jev-watch -- opencode run --auto "migrate the settings page to PrimeVue"

# After a stop: send a correction into the same session and keep watching
jev-watch --resume 20260926-0735-a1b2 "stop editing OrderList.vue, the bug is in useOrders.ts"

# Watch a log your own script writes (stopping needs --pid)
jev-watch --log worker.log --pid 4242 --task "fix the failing checkout test"
```

With the plugin, Claude does all of this for you: it only ever types `codex exec "..."`.

## Should the agent read this file?

`jev-watch --triage --task "fix the tax bug" src/` asks Jev once per file whether the agent needs to read it, so the agent can skip files without loading them into its context. Each file gets `read`, `skim` or `skip`. Only a confident skip (Jev at least 0.8 sure, change it with `--skip-at`) skips a file; doubt or an API error means `read`. Binary files, files too big for one Jev call (about 96K characters) and anything past 255 files are reported as unjudged, never truncated. Add `--json` for machine-readable output. Cost is one Jev input read of each file, so it pays off on large files, not on a handful of small ones.

## What counts as a problem

| Check | Cost | Default |
|---|---|---|
| Same error in 3 separate checks within 10 min | free | `--repeat 3` |
| No output at all | free | `--idle-min 10` |
| No file changes (git) | free | `--no-change-min 20` |
| Jev says `looping`, `off_task` or `stalled` | <0.01¢ per check | `--threshold 0.8`, `--strikes 2` in a row |

Most local rules stop the worker on the first hit. For repeated errors, if Jev's latest check says progressing ≥0.5 or looping <0.2, jev-watch asks again before stopping: a looping confirmation or a Jev error stops the worker, while another progress answer lets it continue. Jev-reported problems otherwise must agree twice in a row, so one odd answer never kills a good run. Jev is only asked when the log has moved since the last check. A 30-minute run costs well under 1¢.

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

## FAQ

### How do I stop Codex from looping on the same error?
Run it through `jev-watch -- codex exec "..."`. When the same error shows up in three separate checks, jev-watch stops Codex, prints the repeated error and the last 50 log lines, and gives you a `--resume` command to send a correction into the same Codex session.

### How do I monitor OpenCode or Codex running in the background from Claude Code?
Install the jev-watch Claude Code plugin. Its hook runs every `codex exec` / `opencode run` in the background under jev-watch, and Claude is woken only when the worker finishes or needs a correction. No polling, no reading logs, no CLAUDE.md edits.

### Does jev-watch replace my orchestrator?
No. Tools like foreman put a model in charge of the workers. jev-watch only watches and stops; your orchestrator (Claude Code, another agent, or you) still decides what the correction is.

### What does it cost?
The local rules are free. Each Jev check sends about 2,000 tokens and costs well under 0.01¢. Jev is skipped when the log has not changed. Use `--no-jev` for rules only.

### Is my code sent anywhere?
Only the task, the last ~6,000 characters of the worker log and the list of changed file names go to Jev. OpenRouter requests require zero-data-retention providers. With `--no-jev`, nothing leaves your machine.

### Does it work with Aider, Claude Code subagents or other CLIs?
Any command that prints to stdout/stderr can be watched and stopped. Session resume is built in for Codex and OpenCode; other CLIs are welcome as pull requests in `src/entities/worker`.

## Development

```bash
npm ci
npm run check   # lint + architecture guard + tests
```

Architecture and guard rules are in [ARCHITECTURE.md](ARCHITECTURE.md). Tests use fake workers and a fake `codex` binary, so they never call an API. `node test/smoke-jev.js` runs three sample cases against the real Jev API.

## License

MIT
