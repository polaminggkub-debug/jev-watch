---
name: jev-watch
description: Use whenever you delegate coding work to Codex (`codex exec`) or OpenCode (`opencode run`), or when a background jev-watch run finishes. Explains how the worker is watched, what the exit codes mean, and how to send a correction back into the same worker session.
---

# Delegating to Codex or OpenCode under jev-watch

This plugin wraps every Bash call that starts with `codex exec` or `opencode run` in `jev-watch` and runs it in the background. You do not need to poll, `sleep`, or tail logs: you are woken when the background command exits.

Write the worker command as one plain command, not part of a `&&` / `|` chain, so the wrap applies. If you hide the worker inside a compound command (`cd … &&`, `;`, `|`, `2>&1 | tail`, `< /dev/null`), the hook blocks the call: rerun it as one plain command. Use `-C <dir>` instead of `cd`. For a long prompt, write it to a file and tell the worker to read it, or pass `"$(cat file)"` inside quotes:

```bash
codex exec -s workspace-write "Add an export-to-CSV button to the orders table. Run npm test when done."
```

Give the worker a clear, self-contained task with acceptance criteria. jev-watch compares the worker's progress against that text.

## When the background command exits

Read the report it printed. The first line says the outcome.

| Exit | Meaning | What you do |
|---|---|---|
| 0 | `DONE` | Review the diff and run the checks yourself before reporting done. |
| 1 | `FAILED` | The worker crashed or exited non-zero. Read the tail, fix the cause or restart. |
| 2 | `STOPPED` | jev-watch stopped the worker: looping, stalled, or off task. See below. |
| 3 | out of corrections | Stop and ask the user how to proceed. Do not resume again. |

## After a STOPPED report (exit 2)

1. Read the reason, the repeated errors, the changed files and the last lines. Open the full log only if the tail is not enough.
2. Work out the real cause. Check the code yourself if needed; the worker was stuck, so its own theory is suspect.
3. Send a specific correction into the same session, as a background command:

```bash
jev-watch --resume <runId> "You kept re-importing @/entities/order. The slice has no index.js; create src/entities/order/index.js exporting useOrder, then rerun npm test."
```

A good correction names what went wrong, where, and the exact next step. "Try again" wastes a round.

If the fix is small (a few lines), it is usually faster to make it yourself and then resume the worker for the rest.

## Options you may need

- `jev-watch --task "<goal>" -- codex exec "..."`: the goal to judge against, if the prompt alone is vague.
- Prefix the command with `JEV_WATCH_DISABLE=1 `, or add `# no-jev-watch` at the end: run a worker without the wrap.
- `--no-jev`: local rules only, no API calls.
