# Deferred Items — v4-hybrid-template-rag-turn

## Plan 03 — out-of-scope test failures (pre-existing, NOT this plan's regressions)

- `sub-loop/__tests__/few-shots.test.ts > M1 probability framing` — stale assertion debt from somnio-v4-rag-generative standalone (sub-loop generation prompt refactored, test not updated). Sub-loop unchanged since baseline.
- `__tests__/smoke-rag-a.test.ts` — live-LLM timeout (Test timed out 120000ms). Environmental.
- `__tests__/smoke-rag-b.test.ts` (2 cases) — `expected 'generated' to be 'no_match'` on razonamiento_libre cases. Calls runSubLoop() DIRECTLY (not processMessage), so untouched by Plan 03's orchestrator change. Live-LLM nondeterminism in the sub-loop.

These are live smoke tests; their validation belongs to Plan 05, not Plan 03. Plan 03 unit target (somnio-v4-agent.test.ts) is 16/16 green + tsc clean.
