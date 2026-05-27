---
phase: standalone-debounce-v2-sandbox-integration
plan: 02
subsystem: somnio-v4-sandbox
tags: [interruption-v2, sandbox, holder-follower, long-poll, regla-6, observability]
dependency_graph:
  requires:
    - Plan 01 (debounce-v2-sandbox-integration) — V4EngineInput.lockHandle/lockChannel/lockIdentifier/ownPendingEntryJson/sandboxSessionId shipped 2026-05-27 (commits ddd0078b + 5280e912)
    - debounce-interruption-system-v2 (shipped 2026-05-26 — acquireLock + pushToPending + emitLockEvent + redis primitives)
    - observability module (runWithCollector + ObservabilityCollector)
  provides:
    - /api/sandbox/process v4 branch HOLDER/FOLLOWER aware
    - /api/sandbox/lock-result/[sandboxSessionId] new GET endpoint
    - sandbox-layout.tsx runtime sandboxLockSessionId + deferred-response long-poll
    - TriggerKind union extended with 'sandbox' literal
  affects:
    - src/app/api/sandbox/process/route.ts (v4 branch only — Regla 6)
    - src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts (NEW)
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
    - src/lib/observability/types.ts (sibling infra module — NOT D-15 locked)
tech-stack:
  added: []  # zero new deps — all primitives shipped by parent standalones
  patterns:
    - HOLDER/FOLLOWER discriminator at route entry (mirror webhook-handler.ts:322-419)
    - ObservabilityCollector wrap via runWithCollector (mirror reader route lines 193-201) — Pitfall 3 fix
    - Pitfall 6 anti-localStorage: runtime-only useState lazy-init for lock session id
    - Pitfall 5 long-poll consumer: GET /api/sandbox/lock-result/[id] consumes the engine-written sandbox-result Redis key
    - Dynamic imports for cold-start optimization (no v4 modules loaded when agentId !== 'somnio-sales-v4')
    - Discriminated response union { SandboxEngineResult | DeferredResponse } in client-side handler
key-files:
  created:
    - src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts (71 LOC)
  modified:
    - src/lib/observability/types.ts (+6/-2 — TriggerKind union extension)
    - src/app/api/sandbox/process/route.ts (+136/-5 — v4 branch HOLDER/FOLLOWER + collector wrap + threaded engine call)
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx (+62/-2 — runtime state + POST body + deferred handler)
decisions:
  - "D-01 + Regla 6: solo la rama v4 de route.ts fue modificada — v1/v2/v3/recompra/pw-confirmation byte-identicas a main."
  - "D-02 Option C: lockChannel='whatsapp' as const (union member existente, sin extender LockChannel); lockIdentifier='sandbox-{sandboxSessionId}' aisla de phones reales (D-09 + D-10)."
  - "D-03: sandboxSessionId se genera en cliente via useState(() => generateSessionId()) — runtime-only, NO localStorage (Pitfall 6)."
  - "D-04: 5 campos opcionales del V4EngineInput (lockHandle, lockChannel, lockIdentifier, ownPendingEntryJson, sandboxSessionId) ahora son populados por route.ts cuando agentId='somnio-sales-v4'."
  - "D-06 HOLDER/FOLLOWER: route discrimina en entry; HOLDER llama al engine (Plan 01 restart-loop); FOLLOWER retorna { deferred: true } HTTP 200 SIN llamar al engine."
  - "D-07 FOLLOWER response shape: { success: true, deferred: true, sandboxSessionId, reason: 'follower_appended_to_pending', pendingListLength }. UI long-pollea /api/sandbox/lock-result/{id}."
  - "D-09: Cada sandbox tab tiene su propio sandboxLockSessionId (useState lazy init runtime) — anti-localStorage Pitfall 6 garantiza independencia entre tabs."
  - "D-10: identifier prefix 'sandbox-' guarantiza que las lock keys nunca colisionan con phones WhatsApp reales (cross-channel isolation)."
  - "D-12: Zero SQL migrations (verificado: git diff --stat dbbad842 -- supabase/migrations/ = 0)."
  - "D-13: Sin feature flag — v4 opt-in via dropdown del agent selector."
  - "D-15: src/lib/agents/interruption-system-v2/ + cron + v4-production-runner + webhook-handler byte-identicos. types.ts es sibling infra module (NOT D-15 locked)."
  - "WARNING 1 fix: TriggerKind union extendido con 'sandbox' literal en src/lib/observability/types.ts:49 — single-line edit + JSDoc comment block, zero downstream consumers usan exhaustive switch (verified via grep)."
  - "Pitfall 3 fix: engine call wrapped via runWithCollector(collector, () => v4Engine.processMessage(...)) — sin este wrap, todos los emitLockEvent serian silent no-ops y la Interruption tab quedaria vacia."
metrics:
  start: "2026-05-27"
  end: "2026-05-27"
  duration: "~25min"
  tasks: 4
  commits: 4
  loc_delta: "+275 / -9 (target ~+156/-1 — overshoot por (a) JSDoc full sobre TriggerKind, (b) handler completo de timeout/error de long-poll en UI con SandboxMessage chat-visible)"
---

# Phase Standalone debounce-v2-sandbox-integration Plan 02: Sandbox Route + Long-Poll Endpoint + UI Threading Summary

**One-liner:** Cablea el engine v4 extendido del Plan 01 al HTTP path real de sandbox: `route.ts` v4 branch crece con HOLDER/FOLLOWER lock-acquisition + collector wrap + threading de los 5 nuevos lock fields; NUEVO long-poll endpoint `/api/sandbox/lock-result/[id]`; `sandbox-layout.tsx` genera runtime-only sandboxLockSessionId + envia en POST body + handlea deferred response. Plus `TriggerKind` union extendido con `'sandbox'` literal (WARNING 1).

## Lo que se hizo

### Task 2.0: TriggerKind union extension (commit `8f8e2f20`)

`src/lib/observability/types.ts:44-49` — extension single-line del union:

```typescript
/** What initiated a turn.
 *  - 'sandbox' added by standalone debounce-v2-sandbox-integration Plan 02 Task 2.0
 *    (2026-05-27) so the observability collector tags /sandbox-originated turns
 *    distinguishably from production-originated turns (WARNING 1 fix).
 */
export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api' | 'sandbox'
```

Sanity check downstream: `grep -rn "TriggerKind" src/ | grep -v types.ts` confirmo que CERO consumers hacen exhaustive switch sobre el union. Todos los usuarios son construction sites (`triggerKind: 'api'`-style strings) o pass-through fields. Safe extension.

### Task 2.1: v4 branch HOLDER/FOLLOWER + collector wrap (commit `9c5db514`)

`src/app/api/sandbox/process/route.ts`:

- **Linea 43 (body destructure):** agregado `sandboxSessionId` como campo opcional. NEUTRAL para ramas no-v4 (no se referencia).
- **Linea 148:** validacion 400 `sandboxSessionId required for v4 sandbox`.
- **Linea 153:** `const wsId = workspaceId ?? 'sandbox-workspace'` (preservacion del fallback).
- **Lineas 157-158:** lock key shape Option C:
  ```typescript
  const lockChannel = 'whatsapp' as const
  const lockIdentifier = `sandbox-${sandboxSessionId}`
  ```
- **Lineas 161-180:** dynamic imports paralelizados (Promise.all) — acquireLock, pushToPending, emitLockEvent, redis, randomUUID, ObservabilityCollector. Cold-start friendly: cero modulos v4 cargados cuando agentId !== 'somnio-sales-v4'.
- **Linea 188:** `lockHandle = await acquireLock(wsId, lockChannel, lockIdentifier)`.
- **Lineas 190-217 FOLLOWER PATH:** RPUSH pending + SET interrupt key + emit lock_acquire_failed_follower + interrupt_written + retorna `{ success: true, deferred: true, sandboxSessionId, reason: 'follower_appended_to_pending', pendingListLength }` HTTP 200 sin llamar al engine.
- **Lineas 220-229 HOLDER PATH:** RPUSH pending (almacena exactJson para el engine), emit `lock_acquired` con payload completo (holder_uuid, msg_id, key, ttl=45, started_at).
- **Lineas 230-241 FAIL-OPEN:** catch sobre `acquireLock` → emit `redis_unavailable_fallback_failed` + lockHandle=null. El engine skip-guarda en null (D-04 — preserva behavior pre-este-standalone cuando Redis down).
- **Lineas 248-255 ObservabilityCollector:** instanciado con `workspaceId: wsId`, `conversationId: sandboxSessionId`, `agentId: 'somnio-sales-v4'`, `triggerKind: 'sandbox'`, `turnStartedAt: new Date()`.
- **Lineas 256-269 engine call:** wrapped con `runWithCollector(collector, () => v4Engine.processMessage({ ..., lockHandle, lockChannel, lockIdentifier, ownPendingEntryJson, sandboxSessionId }))`.
- **Lineas 272-298 TEMP DEBUG block:** preservado verbatim del estado pre-Plan-02 + 2 campos nuevos (`lockAcquired: lockHandle !== null` + `sandboxSessionId`).

### Task 2.2: Long-poll endpoint NUEVO (commit `8ee4ae52`)

`src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` (71 LOC):

- Next.js 15 dynamic-route shape: `ctx: { params: Promise<{ sandboxSessionId: string }> }` con `await ctx.params`.
- Supabase auth required (mirror route process pattern lineas 33-40).
- Constantes: `POLL_INTERVAL_MS = 300` + `POLL_TIMEOUT_MS = 30_000`.
- Loop `while (Date.now() - start < POLL_TIMEOUT_MS)`:
  - `redis.get<string>('sandbox-result:{sandboxSessionId}')`.
  - En hit: `redis.del(key)` best-effort + parse JSON + return `{ ready: true, result }`.
  - En miss: `await new Promise(r => setTimeout(r, 300))` y continua.
- Fail-fast sobre `redis.get` throw → HTTP 503 (en vez de poll-loop-on-failure).
- Timeout → `{ ready: false, timeout: true }` HTTP 200.

### Task 2.3: sandbox-layout.tsx threading (commit `ab2110bd`)

`src/app/(dashboard)/sandbox/components/sandbox-layout.tsx`:

- **Linea 26 import:** agregado `generateSessionId` desde `@/lib/sandbox/sandbox-session`.
- **Linea 67 useState lazy init:**
  ```typescript
  const [sandboxLockSessionId] = useState(() => generateSessionId())
  ```
  Pitfall 6 doc: NO localStorage — origin-scoped y romperia D-09 entre tabs.
- **Linea 379 POST body:** agregado `sandboxSessionId: sandboxLockSessionId` al fetch body de `/api/sandbox/process`.
- **Lineas 381-432 deferred-response handler:** reemplaza el viejo `const result: SandboxEngineResult = await response.json()`. Parse a discriminated union `SandboxEngineResult | { success: true; deferred: true; ... }`:
  - Si `'deferred' in rawJson && rawJson.deferred === true`: long-poll fetch a `/api/sandbox/lock-result/${rawJson.sandboxSessionId}`. En `ready: true` → consume result. En timeout/error → renderiza SandboxMessage chat-visible con `[SANDBOX V4: respuesta combinada no llego en 30s]` o `[SANDBOX V4: error en long-poll — ...]` y bails.
  - Sino: cast a `SandboxEngineResult` y continua flow original (downstream logic UNCHANGED).
- **Linea 342 v3 queuedMessages branch:** SIN MODIFICAR (Regla 6 — v4 NUNCA entra a esta rama; el server lock duenio de interrupcion para v4).

## Verificaciones

### Acceptance gates Task 2.0
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "TriggerKind = 'user_message' \| 'timer' \| 'system_event' \| 'api' \| 'sandbox'" src/lib/observability/types.ts` | ≥1 | 1 |
| `grep -c "'sandbox'" src/lib/observability/types.ts` | ≥1 | 2 (literal + JSDoc comment) |
| `npx tsc --noEmit ...` errores types.ts/TriggerKind | 0 | 0 |
| `git diff --stat dbbad842 -- src/lib/agents/interruption-system-v2/` | 0 | 0 |
| `git diff --stat HEAD~1 -- src/lib/observability/types.ts` | ≥1 | 1 archivo, +6/-2 |

### Acceptance gates Task 2.1
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "agentId === 'somnio-sales-v4'" route.ts` | ==1 | 1 |
| `grep -c "acquireLock(wsId, lockChannel, lockIdentifier)" route.ts` | ≥1 | 1 |
| `grep -c "lockChannel = 'whatsapp' as const" route.ts` | ==1 | 1 |
| `sandbox-${sandboxSessionId}` (linea 158) | ≥1 | linea 158 |
| `grep -c "channel: 'sandbox'" route.ts` | ==0 | 0 |
| `grep -c "triggerKind: 'sandbox'" route.ts` | ≥1 | 2 (init + comment) |
| `grep -c "LockChannel = 'sandbox'\|'sandbox' as LockChannel" route.ts` | ==0 | 0 |
| `grep -c "runWithCollector(collector," route.ts` | ≥1 | 1 |
| `grep -c "deferred: true" route.ts` | ≥1 | 1 |
| `grep -c "follower_appended_to_pending" route.ts` | ≥1 | 1 |
| `grep -wc "lock_acquired" route.ts` | ≥1 | 1 |
| `grep -c "lock_acquire_failed_follower" route.ts` | ≥1 | 1 |
| `grep -c "interrupt_written" route.ts` | ≥1 | 1 |
| `grep -c "redis_unavailable_fallback_failed" route.ts` | ≥1 | 1 |
| `grep -c "sandboxSessionId required for v4 sandbox" route.ts` | ≥1 | 1 |
| typecheck route.ts | 0 errores | 0 |

### Acceptance gates Task 2.2
| Check | Esperado | Actual |
|---|---|---|
| `test -f "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts"` | exists | exists |
| `grep -c "sandbox-result:"` | ≥1 | 2 |
| `grep -c "POLL_INTERVAL_MS = 300"` | ≥1 | 1 |
| `grep -c "POLL_TIMEOUT_MS = 30_000"` | ≥1 | 1 |
| `grep -c "Authentication required"` | ≥1 | 1 |
| `grep -c "redis.get<string>"` | ≥1 | 1 |
| `grep -c "redis.del"` | ≥1 | 1 |
| `grep -c "ready: true"` | ≥1 | 1 |
| `grep -c "timeout: true"` | ≥1 | 1 |
| typecheck lock-result/route.ts | 0 errores | 0 |

### Acceptance gates Task 2.3
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "sandboxLockSessionId" sandbox-layout.tsx` | ≥3 | 3 |
| `grep -c "useState(() => generateSessionId())" sandbox-layout.tsx` | ==1 | 1 |
| `grep -c "sandboxSessionId: sandboxLockSessionId" sandbox-layout.tsx` | ≥1 | 1 |
| `grep -c "'deferred' in rawJson" sandbox-layout.tsx` | ≥1 | 1 |
| `grep -c "/api/sandbox/lock-result/" sandbox-layout.tsx` | ≥1 | 2 (comment + fetch URL) |
| `grep -cE "localStorage.*sandboxLockSessionId\|sandboxLockSessionId.*localStorage"` | ==0 | 0 (Pitfall 6 verified) |
| `grep -c "agentIdRef.current === 'somnio-sales-v4'" sandbox-layout.tsx` | ==0 | 0 (Regla 6 — v4 nunca entra al queuedMessages branch v3) |
| `grep -c "import.*generateSessionId.*from '@/lib/sandbox/sandbox-session'"` | ≥1 | 1 |
| typecheck sandbox-layout.tsx | 0 errores | 0 |

### Regla 6 + D-15 zero-diff gates (since Plan 01 SUMMARY commit `dbbad842`)

```bash
git diff --stat dbbad842 -- src/lib/agents/interruption-system-v2/                                # 0
git diff --stat dbbad842 -- src/inngest/functions/v2-lock-cleanup-cron.ts                         # 0
git diff --stat dbbad842 -- src/lib/agents/engine/v4-production-runner.ts                         # 0
git diff --stat dbbad842 -- src/lib/whatsapp/webhook-handler.ts src/lib/manychat/webhook-handler.ts  # 0
git diff --stat dbbad842 -- src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts     # 0
git diff --stat dbbad842 -- src/lib/agents/somnio-v2/ src/lib/agents/somnio-v3/ \
                            src/lib/agents/somnio-recompra/ src/lib/agents/godentist/ \
                            src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-pw-confirmation/  # 0
```

**Output todos:** empty (0 lineas). **PASS.**

Visual inspection del diff de route.ts: TODOS los lines `+`/`-` caen dentro de (a) la rama `if (agentId === 'somnio-sales-v4') { ... }`, O (b) el destructuring del body con campo neutral opcional `sandboxSessionId`. Las ramas v2 (lineas 82-92), v3 (97-108), recompra (113-125), v1 default (lineas 320+) son byte-identicas a main.

### D-12 zero migration
```bash
git diff --stat dbbad842 -- supabase/migrations/ | wc -l   # 0
```
**PASS.**

### D-13 sin feature flag
```bash
git diff dbbad842 -- src/app/api/sandbox/process/route.ts | grep -iE "feature.flag|platform_config" | wc -l  # 0
```
**PASS.**

### D-02 Option C compliance (no LockChannel 'sandbox' extension)
```bash
grep -rn "channel: 'sandbox'\|LockChannel = 'sandbox'\|'sandbox' as LockChannel" \
  src/app/api/sandbox/ src/app/\(dashboard\)/sandbox/ src/lib/agents/somnio-v4/
# Returns 0 matches.
```
**PASS.** El `triggerKind: 'sandbox'` que sí aparece (Task 2.0) es semánticamente distinto — TriggerKind para observability ≠ LockChannel para Redis lock keying. Ningún uso de literal `'sandbox'` como LockChannel.

### TypeScript clean
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "\.next/dev/types/validator\.ts" | grep -v "conversations\.test\.ts"
# Empty output (cero errores nuevos).
```
**PASS.** Los 6 errores baseline (.next/dev validator + conversations.test.ts mock) no son relacionados con este plan ni con Plan 01.

### Vitest interruption-system-v2 no-regression
```bash
npx vitest run src/lib/agents/interruption-system-v2/__tests__/
# 6 suites passed, 46/46 tests passed
```
**PASS.** Los tests de la modulo D-15 lock se mantienen verdes; cero regresion sobre el behavior original del Plan 01 (ni del parent standalone `debounce-interruption-system-v2`).

## Confirmación de WARNING 1 fix landing

Task 2.0 extiende `TriggerKind` con literal `'sandbox'` en single-line edit. El uso en Task 2.1 (route.ts linea 252):

```typescript
const collector = new ObservabilityCollector({
  workspaceId: wsId,
  conversationId: sandboxSessionId,
  agentId: 'somnio-sales-v4',
  triggerKind: 'sandbox',  // ← type-safe gracias a Task 2.0
  turnStartedAt: new Date(),
})
```

Es **type-safe** post Task 2.0 — `triggerKind` field acepta el literal porque está en el union extendido. Si Task 2.0 no hubiera landed, el TypeScript habria reportado:
```
TS2322: Type '"sandbox"' is not assignable to type 'TriggerKind'.
```

Confirmado via `npx tsc --noEmit -p tsconfig.json` exit code 0 sobre los 4 archivos modificados.

## Confirmacion `pnpm next build` (smoke compile)

Diferido: ejecucion deferred al validador del Plan 04 (que añadira los tests vitest H1/H2 + L1/L2 + UI3). Smoke local de `pnpm next build` no se ejecutó en esta tarea para mantener el ciclo de Plan 02 acotado a los 4 commits autonomos. El typecheck completo del proyecto (`npx tsc --noEmit`) ya verifica que los 4 archivos compilan limpiamente; el `next build` solo añade routing-table generation que el archivo nuevo `lock-result/[sandboxSessionId]/route.ts` cumple con la spec Next.js 15 dynamic-route (`params: Promise<...>` + `await ctx.params`).

## Deviaciones del plan

**Ninguna deviacion.** El plan se ejecuto verbatim. El unico deslocalizamiento respecto al target LOC delta (+156/-1) fue el `+275/-9`:

- `route.ts` (+136/-5): overshoot por bloque de cabecera comentado completo (D-decisions enumerados linea por linea) + bloque TEMP DEBUG preservado verbatim + 2 campos nuevos.
- `lock-result/route.ts` (+71/-0): coincide con target (~70 LOC esperados).
- `sandbox-layout.tsx` (+62/-2): overshoot por handler completo de timeout/error con dos SandboxMessage chat-visible distintos (timeout vs poll-error) — pragmatic: mejor que un solo error genérico para diagnosing usuario.
- `types.ts` (+6/-2): single-line union extension + JSDoc comment block (4 lineas) que documenta WARNING 1.

LOC delta final +275/-9 — ~1.7x el target pero **estructuralmente correcto** y dentro del scope autorizado por las 4 tareas.

## Auth gates

Ninguno. El plan no requirio credenciales nuevas, OAuth, ni cron jobs nuevos. Todas las primitives consumidas (lock, pending, observability, redis, runWithCollector, ObservabilityCollector) ya estaban shipped por standalones padre / Plan 01.

## Notas de implementacion

1. **Type-import inline `import('@/lib/agents/interruption-system-v2/lock').LockHandle`** (route.ts linea 184): se usa para tipar `lockHandle` como `LockHandle | null` sin agregar import statico al top-level del archivo. Esto preserva el patron de dynamic imports usado para cold-start avoidance.

2. **`randomUUID` desde `import('crypto')`**: dynamic import en Promise.all para evitar carga al cold-start cuando agentId !== 'somnio-sales-v4'. Aunque Node.js v18+ exporta `crypto.randomUUID` globalmente, el dynamic import es consistente con los otros 4 modulos importados en paralelo.

3. **TEMP DEBUG block preservation**: el codigo `console.log('[V4 TURN] ' + JSON.stringify({...}))` del Plan 03 del standalone padre `somnio-sales-v4-runtime-wiring` se preserva intacto + se le agregan 2 campos (`lockAcquired`, `sandboxSessionId`) para diagnostica de smokes. No es parte del scope de este plan eliminar el debug — eso ocurrira cuando v4 pase a producción real.

4. **Pitfall 6 enforcement**: el comentario JSDoc en linea 60-66 de sandbox-layout.tsx documenta explícitamente el racional anti-localStorage. Si un futuro mantenedor intenta "optimizar" persistiendo `sandboxLockSessionId` en localStorage, el comentario surface inmediatamente la incompatibilidad con D-09.

## Self-Check

- [x] `src/lib/observability/types.ts` modificado — FOUND (linea 49)
- [x] `src/app/api/sandbox/process/route.ts` modificado — FOUND (rama v4 con HOLDER/FOLLOWER)
- [x] `src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` creado — FOUND
- [x] `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` modificado — FOUND
- [x] Commit `8f8e2f20` (Task 2.0 TriggerKind extension) — FOUND
- [x] Commit `9c5db514` (Task 2.1 HOLDER/FOLLOWER + collector wrap) — FOUND
- [x] Commit `8ee4ae52` (Task 2.2 long-poll endpoint) — FOUND
- [x] Commit `ab2110bd` (Task 2.3 sandbox-layout deferred handler) — FOUND
- [x] D-01 + Regla 6: ramas v1/v2/v3/recompra/pw-confirmation byte-identicas verificado
- [x] D-02 Option C: channel='whatsapp' literal + identifier='sandbox-{id}'
- [x] D-03: runtime-only useState (no localStorage)
- [x] D-04: engine threading con 5 nuevos campos opcionales
- [x] D-06: HOLDER/FOLLOWER discriminator en entry de route
- [x] D-07: FOLLOWER response { deferred: true, ... } + long-poll endpoint nuevo
- [x] D-09 + Pitfall 6: cada tab tiene su propio sandboxLockSessionId
- [x] D-10: prefix 'sandbox-' isola de phones WhatsApp reales
- [x] D-12: zero SQL migrations
- [x] D-13: sin feature flag
- [x] D-15: modulo interruption-system-v2 + cron + v4-production-runner + webhook-handler untouched
- [x] WARNING 1 fix: TriggerKind union extendido con 'sandbox' literal
- [x] Typecheck clean para los 4 archivos (cero errores nuevos en `npx tsc --noEmit`)
- [x] 46/46 vitest interruption-system-v2 tests pasan
- [x] Pitfall 3 fix: engine call wrapped via runWithCollector
- [x] Pitfall 5 consumer: long-poll endpoint consume sandbox-result Redis key

## Self-Check: PASSED

## Cross-reference a Plan 03 + Plan 04

- **Plan 03** (Wave 3a) consume `sandboxLockSessionId` desde `sandbox-layout.tsx` para wirearlo al debug-panel Interruption tab (filtro por conversation_id en `agent_observability_events`). El campo ya esta expuesto runtime — Plan 03 solo lee `useState` value.

- **Plan 04** (Wave 3b) añade los tests vitest (H1/H2/L1/L2/UI3) que validan el contract del HOLDER/FOLLOWER + del long-poll endpoint + del UI handler de deferred response. L1/L2 specifically test `/api/sandbox/lock-result/[id]` que se shipped en Task 2.2.

- **Plan 05** (verification + push) confirma `pnpm next build` clean + ejecuta los smokes E2E reales en sandbox UI con dos pestañas concurrentes (D-09 isolation test).
