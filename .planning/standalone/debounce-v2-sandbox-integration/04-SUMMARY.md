---
phase: standalone-debounce-v2-sandbox-integration
plan: 04
subsystem: somnio-v4-sandbox-tests
tags: [interruption-v2, sandbox, vitest, regla-6-anchor, long-poll]
dependency_graph:
  requires:
    - Plan 01 (debounce-v2-sandbox-integration) — SomnioV4Engine restart-loop scaffolding shipped 2026-05-27 (commits ddd0078b + 5280e912)
    - Plan 02 (debounce-v2-sandbox-integration) — sandbox/process v4 branch + long-poll endpoint shipped 2026-05-27 (commits 8f8e2f20, 9c5db514, 8ee4ae52, ab2110bd)
    - debounce-interruption-system-v2 shipped 2026-05-26 (createMockRedis helper at `src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts`)
  provides:
    - 20 vitest scenarios codifying the Plans 01 + 02 contract as CI-enforced invariants
    - 4 Regla 6 negative-assertion anchors (R6/R7/R8/R9) preventing future leaks of interruption-system-v2 primitives into non-v4 branches
    - Pitfall 5 sandbox-result ordering enforcement (E1 + E7)
    - L1/L2 long-poll endpoint coverage with vi.useFakeTimers (no real 30s wait)
  affects:
    - 3 NEW test files only — zero production code touched
tech-stack:
  added: []  # zero new deps
  patterns:
    - vi.mock factory closure for redis-client + observability + checkpoints
    - Controllable closure-bound override (`checkpointOverrideRef`) for per-ckptId test behavior — alternative to vi.resetModules/vi.doMock pairs that OOM the worker on heavy module trees
    - vi.hoisted() for static-import paths (long-poll endpoint test) — required when route uses `import { redis }` at top-level (sandbox/process gets away with naive const decls because it uses dynamic imports inside the v4 branch)
    - BLOCKER 2 negative-assertion pattern: try/catch wraps tolerate non-v4 engine throws under mocks; load-bearing claim is the negative spy assertion, NOT engine success
    - vi.useFakeTimers + vi.advanceTimersByTimeAsync for L2 timeout (promise-aware advance for awaited mock resolution)
key-files:
  created:
    - src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts (642 LOC, 8 scenarios E1..E8)
    - src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts (481 LOC, 10 scenarios R1..R10)
    - src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts (112 LOC, 2 scenarios L1+L2)
  modified: []
decisions:
  - "D-15: src/lib/agents/interruption-system-v2/ NO modificado (`git diff --stat 992486ef -- src/lib/agents/interruption-system-v2/ | wc -l` returns 0)."
  - "D-02 anti-Pitfall 1: cero `channel: 'sandbox'` literales en los 3 test files (grep -c returns 0/0/0). Tests usan `'whatsapp'` como channel literal (D-02 Option C compliance)."
  - "BLOCKER 2 negative-assertion pattern: R6/R7/R8/R9 envuelven `await POST(...)` en try/catch porque las ramas v1/v2/v3/recompra fallan bajo nuestros mocks minimos. La aserción load-bearing es la negativa (`expect(acquireLockMock).not.toHaveBeenCalled()`), NO el éxito del engine."
  - "E5/E6 implementation choice (vs Plan 04 step 3 NOTE): NO usamos `vi.resetModules()` + `vi.doMock` por OOM en el worker. En su lugar implementamos un closure-bound `checkpointOverrideRef.current` que tests setean en cada `it()` y la `vi.mock('@/lib/agents/interruption-system-v2/checkpoints')` factory lee. Patrón identico para E7 (LostLockError) — el override retorna `{ proceed: false, lostLock: true }` sin necesidad de instanciar un nuevo módulo."
  - "L2 fake-timer mechanism: `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(300)` por iteración hasta exceder POLL_TIMEOUT_MS=30000. Wall-clock duration <20s para toda la suite del archivo (vs 30s+ que tomaría sin fake timers)."
  - "Pitfall 5 verification: E1 + E7 usan `vi.spyOn(mockRedis, 'set')` para detectar el write de `sandbox-result:{id}` ANTES del finally release. Mock-redis `__getAll().store` también funcionaría pero el spy es mas declarativo + permite assertion sobre el `ex: 60` option."
  - "L1 happy path test uses REAL timers (no fake timers needed) — first poll returns null, second poll returns the result, inter-poll setTimeout is 300ms (negligible)."
metrics:
  start: "2026-05-27"
  end: "2026-05-27"
  duration: "~30min"
  tasks: 3
  commits: 3
  loc_delta: "+1235 / -0 (target ~+460 — overshoot por documentation comments + 1 line per param destructure inside test scenarios)"
---

# Phase Standalone debounce-v2-sandbox-integration Plan 04: Test Suite Coverage Summary

**One-liner:** Codifica los contratos shipped en Plans 01 + 02 como 20 vitest scenarios green (8 engine + 10 route + 2 long-poll). Future edits que rompan el restart-loop / HOLDER-FOLLOWER discriminator / D-02 lock-key shape / Regla 6 byte-identity / Pitfall 5 sandbox-result ordering ahora fallan CI.

## Lo que se hizo

### Task 4.1: engine-v4-lock.test.ts con 8 scenarios E1..E8 (commit `615ca7a6`)

`src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` (642 LOC):

- **E1 happy path:** lockHandle present + 1 agent call success → `lock_released_normal` emit + `sandbox-result:{id}` write detected via `vi.spyOn(mockRedis, 'set')` + tokens (100) match agent return.
- **E2 CKPT-0 interrupt:** Pre-stage msg2 en pending + interrupt key → engine drain en CKPT-0 + combine `'msg1\nmsg2'` (chronological order verbatim del commit `494d3bb4`) + restart-iteration=1 + iter 2 agent recibe el combined message.
- **E3 agent-discriminator:** Iter 1 agent returns `errorMessage: 'interrupted_at_ckpt_3_post_tooling'` → iter 2 success. Tokens accumulate (50 iter1 + 80 iter2 = 130). `at_step` payload = `'interrupted_at_ckpt_3_post_tooling'` verbatim.
- **E4 CKPT-6 interrupt:** Override del checkpoint helper para retornar interrupted=true en CKPT-6 primera vez, proceed segunda vez. Iter 1 agent stages msg2 en pending durante su call. CKPT-6 catches → restart. Tokens accumulate.
- **E5 CKPT-7.N i=0:** Override retorna interrupted=true solo cuando `ckptId === 'ckpt_7_pre_template' && templateIndex === 0`. Resultado: messages empty (break before push). Emit es `msg_aborted_path_a_combined` con `templates_sent_before_abort: 0`. NO restart_iteration field en ningun ckpt_7 event.
- **E6 CKPT-7.N i>0:** Override interrupted=true para `templateIndex === 1`. Primera template `msg-A` pushed, segunda aborts. Emit es `msg_aborted_path_b_solo` con `templates_sent_before_abort: 1`.
- **E7 LostLockError:** Override retorna `{ proceed: false, lostLock: true }` siempre. CKPT-0 throws `LostLockError` → outer catch emite `zombie_lambda_exit` + retorna V4EngineOutput con `error.code: 'V4_ZOMBIE_LAMBDA_EXIT'` + `success: false` + `messages: []` + sandbox-result key escribirse via spy detection (Pitfall 5 — incluso zombie path escribe para que FOLLOWER long-poll no cuelgue).
- **E8 lockHandle null:** Pass `withLock=false` → engine corre sin checkpoints, sin heartbeat, sin release. Zero lock/abort/interrupt/zombie events. Agent invoked normally.

**Key implementation decision (override pattern vs vi.resetModules):**

El Plan 04 step 3 NOTE sugería usar `vi.resetModules()` + `vi.doMock` para E5/E6/E7. Falló con `ERR_WORKER_OUT_OF_MEMORY` después de 60s (los v4 module tree imports incluyen Anthropic SDK + Supabase + KB modules transitively cuando se re-importan). **Decision change:** usamos un closure-bound `checkpointOverrideRef.current` set en cada `it()` que la `vi.mock('@/lib/agents/interruption-system-v2/checkpoints')` factory lee. La default behavior de la factory peek en mock-redis y retorna interrupted=true si encuentra interrupt key (mimics real checkpoint), lo que mantiene E2 (interrupt key pre-staged) corriendo sin override.

### Task 4.2: route-v4-lock.test.ts con 10 scenarios R1..R10 (commit `ac048439`)

`src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` (481 LOC):

- **R1 HOLDER:** `acquireLockMock.mockResolvedValueOnce({ key, holderUuid: 'h-uuid-1', startedAt })` → engine called con `lockHandle.holderUuid === 'h-uuid-1'`, `lockChannel === 'whatsapp'`, `lockIdentifier === 'sandbox-abc'`, `sandboxSessionId === 'abc'`, `ownPendingEntryJson === '{"content":"hello"}'`. `lock_acquired` emit verified.
- **R2 FOLLOWER:** `acquireLockMock.mockResolvedValueOnce(null)` → HTTP 200 con body exactamente `{ success: true, deferred: true, sandboxSessionId: 'abc', reason: 'follower_appended_to_pending', pendingListLength: 2 }`. Engine NOT invoked. `pushToPending` + `redis.set('interrupt:...', ..., { ex: 60 })` verified. Emits `lock_acquire_failed_follower` + `interrupt_written` verified.
- **R3 D-02 Option C:** `acquireLockMock.mock.calls[0]` args inspection → `[1] === 'whatsapp'` (LITERAL — NEVER 'sandbox'), `[2].startsWith('sandbox-')` + `=== 'sandbox-abc'`.
- **R4 fail-open:** `acquireLockMock.mockRejectedValueOnce(new Error('Redis down'))` → emit `redis_unavailable_fallback_failed` + engine called con `lockHandle: null` + HTTP 200 (not 500).
- **R5 missing sandboxSessionId:** HTTP 400 + `{ error: 'sandboxSessionId required for v4 sandbox' }`. Cero invocaciones a acquireLock / pushToPending / emitLockEvent / engine.
- **R6/R7/R8/R9 Regla 6 anchors (BLOCKER 2 negative-assertion pattern):** Cada uno envuelve `await POST(...)` en `try { ... } catch { /* expected — engine may fail under mock */ }` (single-line catch para que el grep gate del Plan 04 `grep -cE "try \{ await POST|catch \{ /\* expected"` returne 4). Load-bearing claim es la triple negative assertion: `acquireLockMock.not.toHaveBeenCalled()` + `pushToPendingMock.not.toHaveBeenCalled()` + `emitLockEventMock.not.toHaveBeenCalled()`. **TODOS R6/R7/R8/R9 reportan ZERO invocations sobre los 3 spies del lock subsystem — la BLOCKER-2 reframing es real: las negative assertions execute REGARDLESS del resultado del engine bajo nuestros mocks.**
- **R10 collector wrap (Pitfall 3):** `runWithCollectorMock.toHaveBeenCalledTimes(1)` + `[collectorArg, fnArg]` shape verified + `typeof fnArg === 'function'` + `ObservabilityCollectorCtorMock.toHaveBeenCalledWith({ workspaceId: 'ws-test-1', conversationId: 'abc', agentId: 'somnio-sales-v4', triggerKind: 'sandbox', ... })`. **`triggerKind: 'sandbox'` requires Task 2.0's TriggerKind union extension (WARNING 1 fix).**

**Mock setup pattern:** 5 interruption-v2 imports + 4 sibling agent engines + UnifiedEngine + createSandboxAdapters + observability + supabase auth + side-effect import stubs (somnio + crm + initializeTools). Todos como naive `const spyMock = vi.fn()` + `vi.mock(...)` factory porque sandbox/process/route.ts usa **dynamic imports** (`await import(...)` inside the v4 branch) — esto evita el hoisting issue que sí ocurre en long-poll endpoint test (Task 4.3).

### Task 4.3: lock-result/[sandboxSessionId]/__tests__/route.test.ts con 2 scenarios L1+L2 (commit `98060ca6`)

`src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` (112 LOC):

- **L1 happy:** `redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(fakeResult))` → endpoint polls twice (300ms inter-poll setTimeout en REAL timers, negligible). Response es `{ ready: true, result: fakeResult }` y `redis.del('sandbox-result:abc')` invoked.
- **L2 timeout:** `redisGetMock.mockResolvedValue(null)` (siempre) + `vi.useFakeTimers()`. Loop `for (let elapsed = 0; elapsed < 31000; elapsed += 300) await vi.advanceTimersByTimeAsync(300)` exhausts POLL_TIMEOUT_MS=30000. Response es `{ ready: false, timeout: true }` y `redis.del` NO invoked.

**vi.hoisted() requirement:** El lock-result route usa **static** `import { redis } from '@/lib/agents/interruption-system-v2/redis-client'` at top-level. La factory `vi.mock(...)` se hoisting above all imports + top-level decls. Naive `const redisGetMock = vi.fn()` causa `ReferenceError: Cannot access 'redisGetMock' before initialization`. **Fix:** `const { redisGetMock, redisDelMock } = vi.hoisted(() => ({ redisGetMock: vi.fn(), redisDelMock: vi.fn() }))` declara los mocks DENTRO del hoisted block, garantizando que la factory `vi.mock` los resuelve correctamente. (Sandbox/process gets away con naive decls porque sus interruption-v2 imports son dynamic inside async — module evaluation occurs at request-time, not import-time.)

## Verificaciones

### Acceptance gates Task 4.1
| Check | Esperado | Actual |
|---|---|---|
| `test -f .../engine-v4-lock.test.ts` | exists | exists |
| `grep -c "it('E[1-8]"` | ≥8 | 8 |
| `npx vitest run .../engine-v4-lock.test.ts` exit code | 0 | 0 (8 passed) |
| `npx vitest run .../interruption-v2/__tests__/` exit code (no regression) | 0 | 0 (46 passed) |
| `grep -c "lockChannel = 'sandbox'\|channel: 'sandbox'"` (anti-Pitfall 1) | 0 | 0 |

### Acceptance gates Task 4.2
| Check | Esperado | Actual |
|---|---|---|
| `test -f .../route-v4-lock.test.ts` | exists | exists |
| `grep -cE "it\\('R[0-9]+"` | ≥10 | 10 |
| `npx vitest run .../route-v4-lock.test.ts` exit code | 0 | 0 (10 passed) |
| `grep -c "'whatsapp'"` (D-02 Option C) | ≥1 | 3 |
| `grep -c "channel: 'sandbox'"` (D-02 Option C compliance) | 0 | 0 |
| `grep -cE "try \\{ await POST\|catch \\{ /\\* expected"` (BLOCKER 2) | ≥4 | 4 |
| R6/R7/R8/R9 negative spy assertions PASS | YES | YES (zero invocations on the 3 spies in each scenario) |
| `grep -c "triggerKind: 'sandbox'"` (R10 collector ctor) | ≥1 | 1 |

### Acceptance gates Task 4.3
| Check | Esperado | Actual |
|---|---|---|
| `test -f .../lock-result/[sandboxSessionId]/__tests__/route.test.ts` | exists | exists |
| `grep -cE "it\\('L[12]"` | ≥2 | 2 |
| `grep -c "useFakeTimers\|advanceTimersByTimeAsync\|spyOn.*setTimeout"` | ≥1 | 4 |
| `npx vitest run` exit code | 0 | 0 (2 passed) |
| Wall-clock duration | <5s tests time | 316ms (within 15.27s total file run incl. transform) |

### Verification §1-§6 (Plan 04 verification block)

```bash
# §1 All 3 new test files + 20 total scenarios
$ npx vitest run \
    src/lib/agents/interruption-system-v2/__tests__/ \
    src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts \
    src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts \
    'src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts'
# → Test Files 9 passed (9) — Tests 66 passed (66)

# §2 Parent suite no-regression
# (Same command above — 46/46 from parent + 20/20 new = 66 total)
# → 0 regressions

# §3 D-15 module untouched gate
$ git diff --stat 992486ef -- src/lib/agents/interruption-system-v2/ | wc -l
# → 0

# §5 Regla 6 anti-leak in tests
$ grep -c "channel: 'sandbox'" \
    src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts \
    src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts
# → 0/0

# §6 BLOCKER 2 negative-assertion pattern
$ grep -cE "try \{ await POST|catch \{ /\* expected" \
    src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts
# → 4
```

All 6 verifications **PASS.**

## Notas TypeScript

- `V4EngineInput`'s 5 new optional lock fields (lockHandle, lockChannel, lockIdentifier, ownPendingEntryJson, sandboxSessionId) match exactly los tipos del Plan 01 SUMMARY. No narrowing issues con el `V4AgentOutput` cast en `makeAgentOutputSuccess` / `makeAgentOutputInterrupt`.
- `CheckpointResultMock` interface en engine-v4-lock.test.ts es un local shape mirror del real `CheckpointResult` — no importamos el tipo del módulo para evitar coupling test→production type.
- `ObservabilityCollectorCtorMock` es `vi.fn().mockImplementation(...)` — TypeScript narrows correctly cuando inspeccionamos `mock.calls[0][0]`.

## Deviaciones del plan

**Una deviación documentada:** Plan 04 step 3 NOTE for E5/E6 sugería usar `vi.resetModules()` + `vi.doMock`. Tras OOM en el worker (60s + ERR_WORKER_OUT_OF_MEMORY), pivot a closure-bound `checkpointOverrideRef.current` setter pattern. Resultado: 8/8 scenarios E1..E8 verdes con setup uniforme (cero per-it module resets); estrategia documentada arriba en §Task 4.1 §Key implementation decision.

**Cero deviaciones para Tasks 4.2 + 4.3.** Tasks 4.2 + 4.3 ejecutaron verbatim según plan, con una corrección menor de formatting en R6/R7/R8/R9 (catch en línea para que el grep gate del Plan 04 matchee).

## Auth gates

Ninguno. Tests-only plan. No requirió credenciales, OAuth, ni interacción manual.

## Self-Check

- [x] `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` existe — FOUND
- [x] `src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` existe — FOUND
- [x] `src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` existe — FOUND
- [x] Commit `615ca7a6` (Task 4.1) — FOUND
- [x] Commit `ac048439` (Task 4.2) — FOUND
- [x] Commit `98060ca6` (Task 4.3) — FOUND
- [x] 20 vitest scenarios totales: 8 E + 10 R + 2 L = 20
- [x] Todos los scenarios verdes (`npx vitest run` exit 0 en cada uno)
- [x] Parent interruption-v2 suite sigue verde (46/46) — cero regresión
- [x] D-02 Option C anti-Pitfall 1: cero `channel: 'sandbox'` literales en los 3 test files
- [x] D-15: zero diff sobre `src/lib/agents/interruption-system-v2/`
- [x] BLOCKER 2 negative-assertion pattern present (4 try/catch wraps en route-v4-lock.test.ts)
- [x] L2 fake timers wall-clock <5s (316ms en tests time + 15.27s total file run)
- [x] R6/R7/R8/R9 acquireLock spy reports ZERO invocations
- [x] Pitfall 5 sandbox-result write verified en E1 y E7 via `vi.spyOn(mockRedis, 'set')`

## Self-Check: PASSED

## Cross-reference a Plan 05

Este plan establece la red de seguridad CI. **Plan 05** ejecuta los smokes manuales E2E (S1/S2/S3) en sandbox UI con dos pestañas concurrentes (D-09 isolation test), confirma `pnpm next build` clean, y produce el LEARNINGS.md + SUMMARY.md del standalone padre. Si Plan 05 descubre un bug de integración que estos tests no detectaron, agregar un nuevo it() a uno de los 3 test files de Plan 04 como red de seguridad permanente — pattern documentado en el último párrafo del §success_criteria del Plan 04.
