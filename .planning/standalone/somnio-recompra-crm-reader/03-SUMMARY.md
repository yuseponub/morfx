---
phase: somnio-recompra-crm-reader
plan: 03
wave: 2
status: complete
completed_at: 2026-04-21T11:20:00Z
---

# Plan 03 — Inngest function `recompra-preload-context` (Wave 2)

## Commits

- **Task 1:** `7cd5ef7` — `feat(somnio-recompra-crm-reader-03-T1): add Inngest function recompra-preload-context`
- **Task 2:** `756ba4c` — `feat(somnio-recompra-crm-reader-03-T2): register recompra-preload-context Inngest function + unit test`

## Files Changed

| File | Task | Change |
|------|------|--------|
| `src/inngest/functions/recompra-preload-context.ts` | 1 | New — 251 lines (min_lines target ≥150 met) |
| `src/app/api/inngest/route.ts` | 2 | Import + spread `...recompraPreloadContextFunctions` in serve({functions}); JSDoc updated |
| `src/inngest/functions/__tests__/recompra-preload-context.test.ts` | 2 | New — 5 unit tests covering all 5 control-flow branches |
| `vitest.config.ts` | 2 | New — `@/` → `./src/` alias + exclude `.claude/**` (Plan 01 pre-authorized) |

## Locked Decisions Applied

| Decision | Value | Code location |
|----------|-------|---------------|
| Event name | `'recompra/preload-context'` literal | `{ event: 'recompra/preload-context' }` line ~58 |
| Feature flag key | `'somnio_recompra_crm_reader_enabled'` | `FEATURE_FLAG_KEY` line 30 |
| Reader timeout | `12_000` ms | `READER_TIMEOUT_MS` line 29 |
| Retries | `1` | config line 52 |
| Concurrency | `[{ key: 'event.data.sessionId', limit: 1 }]` | config line 53 |
| Marker status values | `'ok' | 'empty' | 'error'` | lines 139, 158 |
| D-08 prompt | Verbatim 4-item template, spanish no tildes, "sin listas markdown" | `buildReaderPrompt` lines 37-46 |
| Invoker literal | `'somnio-recompra-v1'` (from event type) | threaded via `event.data.invoker` |

## Pitfall → Code Map

| Pitfall | Line(s) | Mitigation |
|---------|---------|-----------|
| Pitfall 2 (merge-safe write) | 138-142, 168-171 | `SessionManager.updateCapturedData(sessionId, { '_v3:crm_context': ..., '_v3:crm_context_status': ... })` — spreads over existing `datos_capturados` inside `updateState` |
| Pitfall 4 (error marker before throw) | 163-182 | Nested try/catch in reader catch path writes `status='error'` + `crm_context=''` before returning; inner failure swallowed last-resort |
| Pitfall 5 (AbortSignal 12s) | 124-126, 193 | `new AbortController()` + `setTimeout(abort, READER_TIMEOUT_MS)` + `clearTimeout` in `finally`; signal passed to `processReaderMessage({ abortSignal })` |
| Pitfall 6 (flag via DB not env) | 63-64 | `await getPlatformConfig<boolean>(FEATURE_FLAG_KEY, false)` — no `process.env` read |
| Pitfall 8 (typed event) | n/a | Event schema registered in Plan 02 (`RecompraPreloadEvents`); `event.data` is fully typed |
| D-15 idempotency | 72-90 | Early-return `skipped/already_processed` if `_v3:crm_context_status` in `['ok','empty','error']` |
| D-16 observability | 216-238 | Emits `pipeline_decision:crm_reader_completed` (ok|empty) OR `crm_reader_failed` (error) with metrics |
| Observability merge pattern | 95-103, 108-117, 202-213, 241-247 | Outer `collector` → inner `stepCollector` inside `step.run('call-reader-and-persist')` → `__obs` return → `collector.mergeFrom(__obs)` → final `step.run('observability-flush', flush)` |

## Test Run

```
$ npm run test -- src/inngest/functions/__tests__/recompra-preload-context.test.ts

 RUN  v1.6.1 /mnt/c/Users/Usuario/Proyectos/morfx-new

 ✓ src/inngest/functions/__tests__/recompra-preload-context.test.ts  (5 tests) 1892ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  12.13s
```

Test coverage:
1. `short-circuits with skipped/feature_flag_off when platform_config=false`
2. `short-circuits with skipped/already_processed when _v3:crm_context_status already present (D-15)`
3. `calls reader and writes status=ok on success`
4. `writes status=empty when reader returns empty text`
5. `writes status=error marker BEFORE returning when reader throws (Pitfall 4)`

## Sub-deviations

1. **`vitest.config.ts` created** — Plan 01 said "NO crear vitest.config.ts" but also authorized it "si algun test futuro necesita config custom (path aliases, setup files), se agrega entonces". Plan 03's test file imports via `@/` alias (consistent with the repo's TS convention), so adding the config is within pre-authorized scope. Config is minimal (alias + exclude `.claude/**`), not a vitest setup file.

## Verification — success_criteria

- [x] Inngest Cloud will discover + register function on next `/api/inngest` sync.
- [x] `skipped/feature_flag_off` short-circuit works when flag=false (test 1).
- [x] `skipped/already_processed` short-circuit works on re-entry (test 2, D-15).
- [x] Reader + 12s timeout + merge-safe persist in happy path (test 3).
- [x] `_v3:crm_context_status='error'` marker written BEFORE return on reader throw (test 5, Pitfall 4).
- [x] Observability events emitted in outer scope and flushed as last step.
- [x] Plan 04 can dispatch with type safety (event schema from Plan 02).
- [x] Plan 05 can rely on marker being written (even in error path).

## Next

Proceed to Wave 3 (Plan 04 — `webhook-processor.ts` dispatch of `recompra/preload-context` event behind the same feature flag, post-`runner.processMessage` with engineOutput.sessionId present).
