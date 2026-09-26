# Notes for AI coding agents

- Run `npm run check` before every commit. It runs ESLint, the architecture guard and the tests.
- Follow ARCHITECTURE.md. Put new code in the lowest layer that can own it, and export it through that slice's `index.js`.
- Keep files near 300 lines (hard cap 500) and functions near 30 lines (hard cap 50). Split before you hit the cap.
- No runtime dependencies. Use Node built-ins only; dev dependencies are fine.
- Tests never call a real API. Use the fake workers in `test/fixtures` and an injected `ask` function for Jev.
- `test/smoke-jev.js` is the only script that calls the real Jev API, and only when a human runs it.
