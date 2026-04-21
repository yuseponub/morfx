---
phase: somnio-recompra-crm-reader
plan: 04
wave: 3
status: complete
completed_at: 2026-04-21T14:07:00Z
---

# Plan 04 — Webhook-processor dispatch (Wave 3)

## Commits

- **Task 1:** `95e864d` — `feat(somnio-recompra-crm-reader-04-T1): dispatch recompra/preload-context event post-runner with feature flag gate`
- **Task 2:** `c5d9066` — `test(somnio-recompra-crm-reader-04-T2): add unit test for webhook-processor recompra dispatch`

## Files Changed

| File | Task | Change |
|------|------|--------|
| `src/lib/agents/production/webhook-processor.ts` | 1 | +75 lines — dispatch block inserted at line 233 (between `runner.processMessage` return and `recompraResult` construction) |
| `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` | 2 | New — 4 unit tests (155 lines) |

## Insertion Point

```
webhook-processor.ts:222-231  → engineOutput = await runner.processMessage(...)
webhook-processor.ts:233-309  → ★ NEW dispatch block (if (engineOutput.sessionId) { ... })
webhook-processor.ts:311-325  → recompraResult = { ... } as SomnioEngineResult
```

The block sits **inside** the existing `if (contactData?.is_client && recompraEnabled)` branch and **inside** the outer `try { ... } catch (engineError) { ... }` that was already there.

## Contract Preserved

| Contract | Value | Code |
|----------|-------|------|
| Event name | `'recompra/preload-context'` (literal) | line 272 |
| Feature flag key | `'somnio_recompra_crm_reader_enabled'` | line 257 |
| Invoker literal | `'somnio-recompra-v1'` | line 278 |
| Await on inngest.send | `await inngest.send(...)` | line 271 (Pitfall 1 satisfied) |
| Guard on sessionId | `if (engineOutput.sessionId)` | line 251 |
| recordEvent BEFORE send | order: `getCollector()...recordEvent` (line 263) → `await inngest.send` (line 271) | D-16 |
| Fail-open catch | `logger.warn(..., 'Failed to dispatch ... (fail-open, greeting already sent)')` | line 302 |
| Type safety | no `as any` — `inngest.send` is fully typed via `RecompraPreloadEvents` (Plan 02) | n/a |

## Test Run (Task 2)

```
$ npm run test -- src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts

 RUN  v1.6.1 /mnt/c/Users/Usuario/Proyectos/morfx-new

 ✓ src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts  (4 tests) 57ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  7.75s
```

Tests:
1. `does NOT dispatch when feature flag is false (Regla 6)`
2. `dispatches with correct payload when flag=true and sessionId present`
3. `does NOT dispatch when sessionId is empty string (runner did not create session)`
4. `records dispatched event BEFORE send (so intent is logged even if send throws)`

## TypeScript

`npx tsc --noEmit | grep webhook-processor` → empty (clean).

## Push to Vercel (Regla 1)

```
$ git push origin main
To https://github.com/yuseponub/morfx.git
   6d288a7..c5d9066  main -> main
```

Range pushed: `6d288a7..c5d9066` — includes Plans 02+03+04 (events.ts + ReaderInput + Inngest function + route + webhook-processor dispatch + tests + vitest.config). Vercel will run `pnpm install` + `next build`; Inngest Cloud auto-discovers `recompra-preload-context` on the next GET to `/api/inngest`.

## Production State Post-Push

| Component | State |
|-----------|-------|
| `platform_config.somnio_recompra_crm_reader_enabled` | `false` (seeded by Plan 01 Task 3) |
| webhook-processor dispatch | **Inert** — `crmPreloadEnabled` resolves to `false`, skips `inngest.send` entirely |
| Inngest function | Registered in Inngest Cloud, idle (no events being dispatched) |
| Production agent behavior | **Byte-identical** to pre-phase (Regla 6 respected) |

## Verification — success_criteria

- [x] In production post-deploy: client contact entering recompra → runner creates session → greeting sent → flag=false so dispatch skipped. Runtime behavior identical to pre-phase.
- [x] Flipping flag=true will start dispatches within 30s (platform_config cache TTL).
- [x] Inngest Cloud will register `recompra-preload-context` function on next sync.
- [x] End-to-end type safety: webhook-processor → event schema → function handler (no `as any`).

## Next

Proceed to Wave 4 (Plans 05 + 06 — **can run in parallel** since they touch disjoint files):
- **Plan 05:** poll helper in `somnio-recompra-agent.ts` + `V3AgentInput.sessionId?` + `v3-production-runner.ts` pass-through + unit test.
- **Plan 06:** `buildSystemPrompt` CRM context injection in `comprehension-prompt.ts` + `_v3:*` key filtering from `DATOS YA CAPTURADOS` JSON dump + unit test.
