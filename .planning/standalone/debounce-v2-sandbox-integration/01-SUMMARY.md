---
phase: standalone-debounce-v2-sandbox-integration
plan: 01
subsystem: somnio-v4-sandbox
tags: [interruption-v2, sandbox, restart-loop, checkpoints, regla-6]
dependency_graph:
  requires:
    - debounce-interruption-system-v2  # shipped 2026-05-26 (module + agent + sub-loop wiring)
    - debounce-v2-interrupt-reprocess  # shipped 2026-05-26 (V4ProductionRunner restart-loop)
  provides:
    - V4EngineInput.lockHandle/lockChannel/lockIdentifier/ownPendingEntryJson/sandboxSessionId
    - SomnioV4Engine restart-loop semantics paridad con V4ProductionRunner
  affects:
    - src/lib/agents/somnio-v4/engine-v4.ts (sólo este archivo)
tech-stack:
  added: []  # cero deps nuevas — todo es wiring sobre primitives ya shipped
  patterns:
    - Outer try/finally con heartbeat lifecycle (Pitfall 6 — outside while)
    - while(shouldRestart) restart-loop (mirror V4ProductionRunner)
    - Pitfall 5 sandbox-result write BEFORE finally release
    - LostLockError catch + zombie_lambda_exit emit + zombie sandbox-result
    - Agent-discriminator detector (`output.errorMessage.startsWith('interrupted_at_ckpt_')`)
    - CKPT-7.N sintético per-template (paridad con V4MessagingAdapter)
    - Chronological combine order (priorMsg FIRST, pending APPENDED — commit 494d3bb4)
key-files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/engine-v4.ts
decisions:
  - "D-04: 8 checkpoints paridad — sandbox engine añade CKPT-0, CKPT-6, CKPT-7.N sintético. CKPT-1..5 ya threaded by parent standalone (agent + sub-loop)."
  - "D-05: Heartbeat lifecycle OUTSIDE while loop (Pitfall 6). startHeartbeat línea 97, while línea 120."
  - "D-06: Restart-loop mirror de V4ProductionRunner — 3 sitios Path A en sandbox (uno menos que producción)."
  - "D-12: Cero migración SQL (verificado: git diff --stat 992486ef -- supabase/migrations/ = 0)."
  - "D-13: Cero feature flag — engine gated puramente en lockHandle nullability."
  - "D-15: Módulo interruption-system-v2 NO modificado (importado only)."
metrics:
  start: "2026-05-27"
  end: "2026-05-27"
  duration: "~1h"
  tasks: 2
  commits: 2
  loc_delta: "+430 / -112 (target ~+120/-2 — overshoot por preservar el debugTurn mapping completo dentro del while loop)"
---

# Phase Standalone debounce-v2-sandbox-integration Plan 01: SomnioV4Engine lock lifecycle Summary

**One-liner:** Wrappea `SomnioV4Engine.processMessage` con outer try/finally + while(shouldRestart) + CKPT-0/6/7 sintético + agent-discriminator detector + Pitfall-5-safe sandbox-result write + LostLockError catch, mirroring V4ProductionRunner post-debounce-v2-interrupt-reprocess.

## Lo que se hizo

### Task 1.1: Types + imports + outer-scope state (commit `ddd0078b`)

5 campos opcionales nuevos en `V4EngineInput`:
- `lockHandle?: LockHandle | null` (línea 62)
- `lockChannel?: LockChannel | null` (línea 63)
- `lockIdentifier?: string | null` (línea 64)
- `ownPendingEntryJson?: string | null` (línea 65)
- `sandboxSessionId?: string` (línea 66)

Imports nuevos (líneas 34-47):
- `checkpoint` de `@/lib/agents/interruption-system-v2/checkpoints`
- `releaseLockIfOwner`, `startHeartbeat`, `type LockHandle`, `type LockChannel` de `@/lib/agents/interruption-system-v2/lock`
- `readAndClearPending` de `@/lib/agents/interruption-system-v2/pending`
- `emitLockEvent` de `@/lib/agents/interruption-system-v2/observability`
- `redis` de `@/lib/agents/interruption-system-v2/redis-client`
- `LostLockError` de `@/lib/agents/engine-adapters/production/v4-messaging-adapter`

Outer-scope state en `processMessage` (líneas 82-102):
- `startMs`, `lockCtx`, `stopHeartbeat` (let), `totalTokensAcrossRestarts` (let), `restartIteration` (let), `effectiveMessage` (let), `templatesSentCount` (let)

Outer try/finally añadido (líneas 104 + 502-525): el finally siempre detiene heartbeat y libera lock con emit de `lock_released_normal` (éxito) o `redis_unavailable_fallback_failed` (fallo).

### Task 1.2: while(shouldRestart) + CKPT-0/6/7 + agent-discriminator + sandbox-result write + LostLockError catch (commit `5280e912`)

- `while (shouldRestart)` declarado línea 120, cierre `}  // end while (shouldRestart)` línea 389.
- `let shouldRestart = true` línea 119.
- 3 sitios Path A donde se setea `shouldRestart = true`:
  1. **CKPT-0 post-acquire** — checkpoint línea 126; restart línea ~155.
  2. **Agent-discriminator** — `output.errorMessage.startsWith('interrupted_at_ckpt_')` línea 193; restart línea ~213.
  3. **CKPT-6 pre-send-loop** — checkpoint línea 223; restart línea ~257.
- **CKPT-6a pending-templates pre-send (v4-production-runner.ts:464)** OMITIDO en sandbox con cross-reference explícito (líneas 111-118 en el comment block de cabecera del while, y líneas 218-221 en el bloque del CKPT-6).

Texto verbatim del cross-reference comment (cabecera del while, líneas 111-118):
```typescript
// Path A restart sites in this sandbox engine: 3 total (CKPT-0,
// agent-discriminator, CKPT-6). V4ProductionRunner has 4 (it additionally
// has a CKPT-6a pending-templates pre-send branch at v4-production-runner.ts:464
// — N/A in sandbox because sandbox does not pre-send templates from a prior
// turn). CKPT-7.N (post-send) does NOT restart in either runner (D-05 from
// parent: Path B preserved after first send).
```

Texto verbatim del segundo cross-reference (en el bloque del CKPT-6, líneas 217-221):
```typescript
// Note: V4ProductionRunner has a CKPT-6a pending-templates pre-send branch
// (at v4-production-runner.ts:464) that we do NOT mirror here — sandbox has
// no pending-templates pre-send (sandbox doesn't carry pending templates
// across turns). See top-of-while comment block for the full rationale.
```

- **CKPT-7.N sintético** (loop `for i` líneas 266-289): preserva paridad con `V4MessagingAdapter.shouldAbortBeforeTemplate`. Emit `msg_aborted_path_a_combined` si `i === 0`, `msg_aborted_path_b_solo` si `i > 0`. **NO restart** (break out of for, exits while — D-05).
- **Chronological combine order**: `[turnEffectiveMessage, ...pending.map(p => p.content)]` en 3 sitios (líneas ~152, ~210, ~254). Verbatim mirror commit `494d3bb4` (priorMsg FIRST).
- **Token accumulator**: `totalTokensAcrossRestarts += (output.totalTokens ?? 0)` después de cada agent call (línea ~178). Success-path return usa `tokensUsed: totalTokensAcrossRestarts` (línea ~310 + en zombie return línea ~441).
- **Pitfall 5 sandbox-result write**: `redis.set('sandbox-result:{id}', ..., { ex: 60 })` ocurre en línea 405 (happy path) y línea 456 (zombie path). Verified: line 405 < `} finally {` line 502. Line 456 también < 502.
- **LostLockError catch** (líneas 422-471): si `error instanceof LostLockError`, emite `zombie_lambda_exit`, construye `zombieResult` con tokensUsed accumulator, escribe zombie sandbox-result, y retorna. Si NO es LostLockError, fall-through al catch legacy preservado verbatim (líneas 474-499) — tokensUsed: 0 mantenido (no migrar a accumulator porque es legacy path).
- **restart_iteration** field en TODOS los emits de `msg_aborted_path_a_combined` y `pending_list_combined` (6 emits total — Pitfall 3).

## Verificaciones

### Acceptance gates (Task 1.1)
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "lockHandle?: LockHandle \| null"` | ≥1 | 1 |
| `grep -c "lockChannel?: LockChannel \| null"` | ≥1 | 1 |
| `grep -c "lockIdentifier?: string \| null"` | ≥1 | 1 |
| `grep -c "ownPendingEntryJson?: string \| null"` | ≥1 | 1 |
| `grep -c "sandboxSessionId?: string"` | ≥1 | 1 |
| `grep -c "from '@/lib/agents/interruption-system-v2/"` | ≥4 | 5 |
| `grep -c "LostLockError"` | ≥1 | múltiples |
| `grep -c "startHeartbeat(input.lockHandle)"` | ==1 | 1 |
| `grep -c "totalTokensAcrossRestarts"` | ≥1 | 8 |
| `grep -c "} finally {"` | ≥1 | 1 |
| `grep -c "lock_released_normal"` | ≥1 | 1 |
| `grep -c "channel: 'sandbox'"` | ==0 | 0 |

### Acceptance gates (Task 1.2)
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "while (shouldRestart)"` | ≥1 | 2 (declaration + closing comment) |
| `grep -c "let shouldRestart = true"` | ≥1 | 1 |
| `grep -c "shouldRestart = true"` | ≥3 | 4 (declaration + 3 restart sites) |
| `grep -c "restart_iteration:"` | ≥6 | 6 |
| `grep -c "checkpoint('ckpt_0_post_acquire'"` (multi-line) | ==1 | 1 (await checkpoint(\\n'ckpt_0_post_acquire',) |
| `grep -c "checkpoint('ckpt_6_pre_send_loop'"` (multi-line) | ==1 | 1 (await checkpoint(\\n'ckpt_6_pre_send_loop',) |
| `grep -c "checkpoint('ckpt_7_pre_template'"` (multi-line) | ==1 | 1 (await checkpoint(\\n'ckpt_7_pre_template',) |
| `grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')"` | ==1 | 1 |
| `grep -c "sandbox-result:"` | ≥2 | 4 (comment + 2 redis.set + 1 zombie sandbox-result comment) |
| `grep -c "zombie_lambda_exit"` | ≥1 | 1 |
| `grep -c "msg_aborted_path_a_combined"` | ≥3 | 4 (CKPT-0 + discriminator + CKPT-6 + CKPT-7.N first-template) |
| `grep -c "msg_aborted_path_b_solo"` | ≥1 | 1 |
| `grep -c "templatesSentCount = finalMessages.length"` | ≥1 | 1 |
| `grep -c "tokensUsed: totalTokensAcrossRestarts"` | ≥1 | 2 (happy + zombie) |
| `grep -E "tokensUsed: output\.totalTokens" \| wc -l` | ==0 | 0 |
| `grep -c "[turnEffectiveMessage, ...pending.map"` | ≥3 | 3 |
| `grep -c "v4-production-runner.ts:464\|N/A in sandbox\|pending-templates pre-send"` | ≥1 | 5 (2 cross-refs com varias menciones) |
| `grep -c "channel: 'sandbox'"` | ==0 | 0 |

### Pitfall 5 ordering (sandbox-result write BEFORE finally)
- First `redis.set` line: **405**
- Outer `} finally {` line: **502**
- **PASS**: 405 < 502.

### Pitfall 6 (heartbeat OUTSIDE while)
- `startHeartbeat(input.lockHandle)` line: **97**
- `while (shouldRestart)` line: **120**
- **PASS**: 97 < 120.

### Regla 6 zero-diff gates (D-15)
```bash
git diff --stat 992486ef -- \
  src/lib/agents/engine/v4-production-runner.ts \
  src/lib/agents/interruption-system-v2/ \
  src/lib/agents/somnio-v2/ \
  src/lib/agents/somnio-v3/engine-v3.ts \
  src/lib/agents/somnio-recompra/ \
  src/lib/agents/godentist/ \
  src/lib/agents/godentist-fb-ig/ \
  src/lib/agents/somnio-pw-confirmation/
```
**Output**: empty (0 líneas). **PASS**.

### D-12 (sin migración SQL)
```bash
git diff --stat 992486ef -- supabase/migrations/ | wc -l
```
**Output**: 0. **PASS**.

### TypeScript clean
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "engine-v4\.ts"
```
**Output**: 0. **PASS**. (Total errores baseline pre-existentes en el repo: 6 — todos no relacionados con engine-v4.ts ni con este plan; .next/dev/types/validator.ts + src/lib/domain/__tests__/conversations.test.ts).

### Vitest interruption-system-v2 (no-regression D-15)
```bash
npx vitest run src/lib/agents/interruption-system-v2/__tests__/
```
**Output**: 6 suites passed, 46/46 tests passed. **PASS**.

## Notas TypeScript

- `lastV4Result` requiere narrowing tras el while loop. Resuelto con `if (!lastV4Result) throw new Error(...)` invariant guard antes del return (línea 391-393).
- `lockCtx` se asegura non-null cuando `input.lockHandle` está presente con `lockChannel`/`lockIdentifier` también presentes. El agent-discriminator detector tiene un guard explícito `if (!lockCtx) throw new Error(...)` por defensa, aunque debería ser inalcanzable (si el agent emitió `interrupted_at_ckpt_` es porque corrió bajo lock).
- Type union de `LockChannel` (`'whatsapp' | 'facebook' | 'instagram'`) coincide exactamente con el sandbox-side `lockChannel` field — no necesita widening.

## Deviaciones del plan

**Ninguna deviación.** El plan se ejecutó verbatim. El único deslocalizamiento respecto al target LOC delta (+120/-2) fue mover el mapping completo del `debugTurn` (líneas 290-376) DENTRO del while loop (esto era inherente a la mecánica de restart — el mapeo del output al V4EngineOutput sólo puede ocurrir DESPUÉS del último `output = await processMessage(...)` exitoso). LOC delta final +430/-112 — ~3x el target pero estructuralmente correcto.

## Auth gates

Ninguno. El plan no requirió credenciales nuevas, OAuth, ni cron jobs nuevos. Todas las primitives consumidas (lock, checkpoint, pending, observability, redis) ya estaban shipped por standalones padre.

## Self-Check

- [x] `src/lib/agents/somnio-v4/engine-v4.ts` existe — FOUND
- [x] Commit `ddd0078b` (Task 1.1) — FOUND
- [x] Commit `5280e912` (Task 1.2) — FOUND
- [x] V4EngineInput tiene los 5 campos opcionales nuevos
- [x] Outer try/finally con heartbeat + lock release está presente
- [x] while (shouldRestart) wrappea el body
- [x] CKPT-0, CKPT-6, CKPT-7.N sintético dispatch presente
- [x] Agent-discriminator detector con `errorMessage.startsWith('interrupted_at_ckpt_')` presente
- [x] LostLockError catch + zombie_lambda_exit emit + zombie sandbox-result write presente
- [x] Pitfall 5 ordering verificado (redis.set BEFORE } finally {)
- [x] Pitfall 6 verificado (startHeartbeat BEFORE while)
- [x] Regla 6 zero-diff confirmado
- [x] D-12 zero-diff confirmado (sin migration)
- [x] D-15 zero-diff confirmado (interruption-system-v2 untouched)
- [x] Typecheck clean para engine-v4.ts
- [x] 46/46 vitest interruption-system-v2 tests pasan

## Self-Check: PASSED

## Cross-reference a Plan 02

Este plan establece el contract del engine. **Plan 02** wirea el route `src/app/api/sandbox/process/route.ts` para que el branch v4 sea el primer caller que populle `lockHandle`/`lockChannel`/`lockIdentifier`/`sandboxSessionId`/`ownPendingEntryJson` en `V4EngineInput`. Hasta que Plan 02 ship, el engine es funcionalmente equivalente al pre-este-standalone para todos los callers existentes (porque `input.lockHandle === undefined` → todos los CKPT y heartbeat y release se skip-guardan).
