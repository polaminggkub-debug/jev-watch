# Architecture

jev-watch uses [Feature-Sliced Design](https://feature-sliced.design) adapted for a CLI with no UI. Each layer may import only from layers below it.

```
bin/jev-watch.js          entry point, calls src/app
src/
├── app/                  CLI: argument parsing, usage, commands (start, resume, log)
├── features/
│   └── watch/            the watch loop and one watched attempt
├── entities/
│   ├── detection/        free local rules + the Jev status question
│   ├── worker/           per-CLI knowledge: session ids, resume commands (codex, opencode)
│   └── run/              run state on disk and the report
└── shared/
    ├── jev/              generic Jev client (TypeSafe or OpenRouter)
    ├── git/              file-change fingerprint
    ├── process/          worker sources: spawned command or tailed log
    └── text/             small text helpers
```

## Rules (enforced in CI)

| Rule | Checked by |
|---|---|
| Layers import downward only: `app → features → entities → shared` | `npm run check:arch` |
| Slices in `entities` and `features` never import each other | `npm run check:arch` |
| Another slice is imported through its `index.js` only | `npm run check:arch` |
| `src` imports only `node:` built-ins and relative paths (zero runtime dependencies) | `npm run check:arch` |
| No file named like a sibling directory (`lib.js` next to `lib/`) | `npm run check:arch` |
| Files ≤ 500 lines (aim for ~300), functions ≤ 50 lines (aim for ~30) | `npm run lint` |
| Max nesting depth 4, max 4 parameters, complexity ≤ 15 | `npm run lint` |

Run everything with `npm run check`.
