---
phase: crm-stage-integrity
plan: 03
subsystem: automation-runner-runtime-integrity
tags: [inngest-concurrency, kill-switch, cascade-capped, audit-log, flag-gated, automation-runner, observability]
provides:
  - checkKillSwitch(admin, orderId, threshold=5, windowMs=60_000) pure helper (exported, flag-gated consumer)
  - logCascadeCap(admin, params) pure helper (exported, no flag — additive audit)
  - Stacked Inngest concurrency — `[{ workspaceId:5 }, { orderId:1 }]` ONLY for order.stage_changed runner
  - Cascade-capped history row from BOTH paths — runner (post-dequeue) + trigger-emitter (pre-emit), distinguished by actor_label suffix
  - executeChangeStage populates DomainContext with actorId=automation.id, actorLabel="Automation: {name}", triggerEvent
  - Narrow `stage_changed_concurrently` in executeChangeStage → runner logs `stage_change_rejected_cas` distinctly (D-22)
  - 2 unit test files covering helpers directly (WARNING 3 fix — regression signal real)
requires:
  - Plan 01 migration aplicada en prod (order_stage_history + platform_config flags + supabase_realtime on orders)
  - Plan 02 DomainContext extendido con actorId/actorLabel/triggerEvent + moveOrderToStage escribe history rows best-effort
affects:
  - Plan 04: builder validation (independiente de Wave 2 runtime)
  - Plan 05: Kanban Realtime + LEARNINGS wrap-up; puede observar `cascade_capped` / `stage_change_rejected_cas` events post-deploy
tech-stack:
  added: []
  patterns:
    - "Inngest v3 stacked concurrency: `[C] | [C, C]` mutable tuple branched by trigger literal (Shared Pattern 4 RESEARCH)"
    - "Flag-gated runtime kill-switch via `getPlatformConfig<boolean>(key, false)` — fail-open on DB error (Pattern 5 RESEARCH)"
    - "Doble cobertura de cascade_capped: runner escribe post-dequeue + emitter escribe pre-emit; actor_label suffix discrimina (Pitfall 9 RESEARCH)"
    - "Helpers puros exportados para testability (WARNING 3 fix) — tests importan, NO re-implementan"
    - "Error string-marker propagation para CAS reject: `throw new Error('stage_changed_concurrently')` narrow en action-executor → runner narrow → `stage_change_rejected_cas` warning log (D-22)"
    - "Actor mapping in DomainContext: `actorId=automation.id`, `actorLabel='Automation: {name}'`, `triggerEvent=triggerType` (Pitfall 10 RESEARCH)"
key-files:
  created:
    - src/inngest/functions/__tests__/automation-runner-killswitch.test.ts
    - src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts
  modified:
    - src/inngest/functions/automation-runner.ts (commit e78f061 — export helpers + stacked concurrency + cap-audit + kill-switch + automationContext plumbing)
    - src/lib/automations/action-executor.ts (commits e78f061 + ad2cc64 — executeAction signature extension + executeChangeStage plumbing + CAS narrow)
    - src/lib/automations/trigger-emitter.ts (commit 1b84a6e — isCascadeSuppressed async + pre-emit cap audit + 16 callers awaited)
decisions:
  - D-07 defense-in-depth layer 2 (kill-switch) + layer 3 (cascade_capped audit) — doble cobertura
  - D-08 stacked concurrency: per-workspace + per-orderId scopes
  - D-09 concurrency per-orderId ONLY for order.stage_changed runner (no efecto en otros triggers)
  - D-10 actor mapping en history rows: automation_id + "Automation: {name}" + trigger_event
  - D-18 cascade_capped audit escribe SIN flag (additive)
  - D-19 concurrency per-orderId SIN flag (additive, solo serializa)
  - D-20 kill-switch runtime CON flag (crm_stage_integrity_killswitch_enabled, default false, fail-closed)
  - D-22 observability events: `stage_change_rejected_cas`, `kill_switch_triggered`, cascade_capped ledger rows
  - D-23 warning logs en kill-switch + cascade cap + CAS reject (console.warn — no bubble-up)
  - D-25 unit tests cubren helpers exportados (NO re-implementan logica)
metrics:
  duration: ~1h 15min
  completed: 2026-04-22
---

# Plan 03: Inngest Concurrency + Runtime Kill-Switch + Cascade-Capped Audit Summary

**One-liner:** Automation-runner ahora (a) serializa eventos `order.stage_changed` por-orderId via Inngest stacked concurrency, (b) expone 2 helpers puros exportados (`checkKillSwitch` flag-gated + `logCascadeCap` additive), (c) escribe row `source='cascade_capped'` a `order_stage_history` desde dos caminos (runner post-dequeue + trigger-emitter pre-emit, discriminados por `actor_label` suffix), y (d) mapea metadata de automation (`actor_id=automation.id`, `actor_label="Automation: {name}"`, `trigger_event`) al DomainContext para que el audit trail muestre QUIEN cambio la etapa. Tests unitarios importan los helpers directamente (WARNING 3 fix — regression signal real).

## What Shipped

**Comportamiento nuevo desde primer evento post-deploy (D-18 + D-19 additive, sin flag):**

1. **Stacked concurrency** — runner `order.stage_changed` ahora tiene `concurrency: [{ key: 'event.data.workspaceId', limit: 5 }, { key: 'event.data.orderId', limit: 1 }]`. Dos eventos simultaneos sobre el mismo orderId se serializan 1-at-a-time sin bloquear otros orders del workspace. Otros runners (tag.assigned, order.created, etc.) siguen con el scope single-element `[{ workspaceId: 5 }]` intacto (D-09).

2. **Cascade-capped audit (doble cobertura)** — cuando `cascadeDepth >= MAX_CASCADE_DEPTH` (= 3):
   - **Runner** (`automation-runner.ts`): `step.run('cap-audit-${triggerType}')` invoca `logCascadeCap(createAdminClient(), {...})` → INSERT row con `source='cascade_capped'`, `actor_label='Cascade capped at depth N'` (sin suffix). Solo activa para `order.stage_changed` + `orderId` presente (Pitfall 4 RESEARCH).
   - **Trigger-emitter** (`trigger-emitter.ts`): `isCascadeSuppressed` async ahora acepta `orderContext?` y si `triggerType === 'order.stage_changed'` + `orderId`, hace INSERT con `source='cascade_capped'`, `actor_label='Cascade capped at depth N (pre-emit)'` (suffix discrimina). Try/catch: history failure NO bloquea suppression.
   - Doble cobertura intencional (Pitfall 9 RESEARCH): runner catchea el caso "evento ya en cola"; emitter catchea el caso "source detecta pre-emit".

3. **Actor mapping en DomainContext** — `executeChangeStage` ahora recibe `automationContext = { automationId, automationName, triggerType }` y popula:
   - `actorId = automation.id`
   - `actorLabel = "Automation: {name}"`
   - `triggerEvent = triggerType`
   Estos fields son consumidos por `domain/orders.moveOrderToStage` (Plan 02) → `order_stage_history.actor_id/actor_label/trigger_event` pobladas con datos reales (no más "source='automation'" abstracto).

**Comportamiento flag-gated (D-20, default OFF — Regla 6):**

4. **Runtime kill-switch** — cuando usuario flipee `crm_stage_integrity_killswitch_enabled=true`:
   - `step.run('kill-switch-flag')` lee el flag via `getPlatformConfig<boolean>('crm_stage_integrity_killswitch_enabled', false)` (TTL 30s cache).
   - Si true, `step.run('kill-switch-check')` invoca `checkKillSwitch(createAdminClient(), orderId)`.
   - Query: `.from('order_stage_history').select('id', {count:'exact', head:true}).eq('order_id',X).neq('source','manual').gt('changed_at', sinceIso)`.
   - Si `count > 5` → `console.warn('[kill-switch] order X: N non-manual changes in 60s. Skipping.')` + return `{ skipped: true, reason: 'kill_switch_triggered', recentChanges }` (D-22 + D-23).
   - Fail-open: query error → `{ shouldSkip: false }` (Pattern 5 RESEARCH).
   - SOLO aplica a `triggerType === 'order.stage_changed'` + `eventData.orderId` presente (Pitfall 4 RESEARCH).

**Error narrow (D-22):**

5. **CAS reject observability** — cuando `moveOrderToStage` retorna `error='stage_changed_concurrently'` (Plan 02 flag CAS ON + colision mid-air):
   - `executeChangeStage` re-throw: `throw new Error('stage_changed_concurrently')` (exacto string preservado).
   - Runner narrow: `if (actionResult.error === 'stage_changed_concurrently') console.warn('[automation-runner] stage_change_rejected_cas for order X via automation Y')`.
   - Automation chain aborta naturalmente (existing "stop on first failure" branch) — NO bubble-up, NO crash.

## Commits

| Task | Commit | Scope | Archivos |
|------|--------|-------|----------|
| 1 | `e78f061` | Runner helpers + stacked concurrency + cap-audit + kill-switch + signature extension de executeAction | `src/inngest/functions/automation-runner.ts` (+170/-2), `src/lib/automations/action-executor.ts` (+9/-4) |
| 2 | `1b84a6e` | trigger-emitter.ts — isCascadeSuppressed async + pre-emit cap audit + 16 callers awaited | `src/lib/automations/trigger-emitter.ts` (+67/-20) |
| 3 | `ad2cc64` | executeChangeStage plumbing automationContext + CAS narrow | `src/lib/automations/action-executor.ts` (+45/-6) |
| 4 | `9f017f3` | 2 unit test files importando los helpers exportados | `src/inngest/functions/__tests__/automation-runner-killswitch.test.ts` (+102), `src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts` (+131) |

**Total:** 4 commits atómicos, 5 archivos tocados (3 modificados + 2 creados).

## Verification

```bash
# Typecheck (ejecutado al final de cada task):
$ npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(error TS)"
# (no output — zero errors)

# Greps Task 1 acceptance criteria (automation-runner.ts):
OK: createAdminClient
OK: getPlatformConfig
OK: export async function checkKillSwitch
OK: export async function logCascadeCap
OK: event.data.orderId
OK: triggerType === 'order.stage_changed'
OK: cap-audit-
OK: 'cascade_capped'
OK: cascade_depth_exceeded
OK: kill-switch-flag
OK: kill-switch-check
OK: crm_stage_integrity_killswitch_enabled
OK: kill_switch_triggered
OK: stage_change_rejected_cas
OK: .neq('source', 'manual')
OK: .gt('changed_at'
OK: shouldSkip

# Greps Task 2 acceptance criteria (trigger-emitter.ts):
OK: async function isCascadeSuppressed
OK: orderContext?
OK: cascade_capped
OK: pre-emit
OK: createAdminClient
OK: all callers awaited (16 non-definition callers via sed replace pattern)

# Greps Task 3 acceptance criteria (action-executor.ts):
OK: automationContext
OK: automationId: string
OK: automationName: string
OK: actorId: automationContext
OK: Automation: ${automationContext.automationName}
OK: stage_changed_concurrently
OK: cascadeDepth + 1

# Vitest unit tests (Task 4):
$ npx vitest run src/inngest/functions/__tests__/automation-runner-killswitch.test.ts src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts
 ✓ src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts  (6 tests) 9ms
 ✓ src/inngest/functions/__tests__/automation-runner-killswitch.test.ts  (8 tests) 14ms

 Test Files  2 passed (2)
      Tests  14 passed (14)
   Duration  18.22s
```

## Deviations from Plan

### Rule 3 - Blocking Issue: Inngest tuple-type compile error

**Found during:** Task 1 (stacked concurrency extension)
**Issue:** El plan propuso `concurrency: [{ workspaceId:5 }, ...(triggerType === 'order.stage_changed' ? [{ orderId:1 }] : [])]`. El type checker de Inngest v3 rechaza esto con `TS2322: Type '[{...}, ...{...}[]]' is not assignable to type 'number | ConcurrencyOption | [ConcurrencyOption] | [ConcurrencyOption, ConcurrencyOption]'` — el spread genera variable-length, pero Inngest requiere tuple fijo `[C] | [C, C]`.
**Fix:** Branch conditional con tipo explícito mutable tuple:
```typescript
const concurrency: [{ key: string; limit: number }] | [{ key: string; limit: number }, { key: string; limit: number }] =
  triggerType === 'order.stage_changed'
    ? [{ workspaceId:5 }, { orderId:1 }]
    : [{ workspaceId:5 }]
```
El `as const` inicial también fue rechazado porque produce readonly tuple (no assignable a mutable Inngest type). La solucion con anotacion explicita mutable + ternary preserva la arity exacta que Inngest quiere.
**Files modified:** `src/inngest/functions/automation-runner.ts`
**Commit:** `e78f061` (inline durante construccion de Task 1).

### Plan structure preserved (no re-numeration)

4 tasks atómicas del plan → 4 commits atómicos del repo. Task 1 incluyo la extension de firma de `executeAction` en `action-executor.ts` (arg opcional `automationContext`) para que el runner compile inmediatamente tras Task 1 (el consumo real del arg en `executeChangeStage` va en Task 3 — backward-compat garantiza que Task 1 funciona sin Task 3). Esto no rompe atomicidad porque `executeAction` ignora el arg hasta Task 3.

## Open Items / Deuda Tecnica

1. **Flag `crm_stage_integrity_killswitch_enabled` sigue en `false`:** NO se flipeo en este plan. Decisión post-observación del usuario. Para activar tras ver telemetría en Inngest dashboard (busque eventos `stage_change_rejected_cas` / `cascade_capped` rows):
   ```sql
   UPDATE platform_config
   SET value = 'true'::jsonb
   WHERE key = 'crm_stage_integrity_killswitch_enabled';
   -- Esperar 30-60s (Pitfall 11 Plan 02 — getPlatformConfig TTL cache per-lambda).
   ```

2. **Inngest TS types y concurrency tuple:** el branch `[C] | [C, C]` con annotacion explicita mutable es el patron que Inngest v3 requiere. Follow-up en librery upgrade: verificar si `as const` funciona con versiones futuras del SDK (actualmente rechazado).

3. **Post-deploy observación sugerida** (cuando el usuario pushee esta branch a origin):
   ```sql
   -- Rows cascade_capped nuevas:
   SELECT source, COUNT(*) FROM order_stage_history
   WHERE source = 'cascade_capped' AND changed_at > NOW() - INTERVAL '1 hour'
   GROUP BY source;

   -- Rows con actor_label "Automation: ..." nuevas (Wave 2 actor mapping ON):
   SELECT actor_label, COUNT(*) FROM order_stage_history
   WHERE actor_label LIKE 'Automation:%' AND changed_at > NOW() - INTERVAL '1 hour'
   GROUP BY actor_label ORDER BY COUNT(*) DESC LIMIT 10;

   -- Dashboard Inngest (web UI): filtrar por function "automation-order-stage-changed"
   -- → buscar runs con step output `{skipped: true, reason: 'cascade_depth_exceeded'}`
   -- (debe haber ~0-pocos hasta que una automation loop aparezca en prod).
   ```

4. **Kill-switch threshold hardcoded = 5 + windowMs = 60_000:** los defaults se cubren por tests (count=5 → false, count=6 → true). Si en el futuro se decide parametrizar via `platform_config`, los tests ya cubren custom threshold y custom windowMs pasados como args (regresion-safe).

## Authentication Gates

Ninguno durante este plan — ejecución fully autonomous sin auth prompts.

## What This Unblocks

- **Plan 04** (builder validation): independiente de runtime de Wave 2. Puede referenciar `checkKillSwitch` / `logCascadeCap` como helpers exportados si el builder necesita simulacion de runtime.
- **Plan 05** (Kanban Realtime + UX + LEARNINGS wrap-up):
  - Puede render toast dedicado cuando action retorna `stage_change_rejected_cas` observability event.
  - Puede subscribirse a `order_stage_history` via Realtime para mostrar timeline en detalle del pedido (incluyendo rows `cascade_capped` con `actor_label` suffix discriminante).
  - LEARNINGS puede documentar Wave 2 como playbook para futuras "runtime integrity" features (kill-switch flag-gated + additive audit + stacked concurrency pattern).

## Threat Flags

Ninguno — el plan no introduce nuevos endpoints HTTP, paths de auth, acceso a filesystem, ni cambios de schema en trust boundaries. `checkKillSwitch` y `logCascadeCap` reads/writes ya protegidos por workspace_id filtering en `order_stage_history` (Plan 01 RLS).

## Self-Check: PASSED

- File check `src/inngest/functions/__tests__/automation-runner-killswitch.test.ts`: FOUND
- File check `src/inngest/functions/__tests__/automation-runner-cascade-capped.test.ts`: FOUND
- Commit `e78f061`: FOUND (Task 1 runner + helpers + signature extension)
- Commit `1b84a6e`: FOUND (Task 2 trigger-emitter)
- Commit `ad2cc64`: FOUND (Task 3 action-executor)
- Commit `9f017f3`: FOUND (Task 4 tests)
- TypeScript compile: zero new errors project-wide
- Vitest: 14/14 tests passed
- Flags estado final: `crm_stage_integrity_cas_enabled=false`, `crm_stage_integrity_killswitch_enabled=false` (sin flip en este plan)
