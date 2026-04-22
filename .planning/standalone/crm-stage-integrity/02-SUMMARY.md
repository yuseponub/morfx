---
phase: crm-stage-integrity
plan: 02
subsystem: crm-orders-integrity
tags: [cas, audit-log, flag-gated, domain-layer, mobile-api, crm-writer]
provides:
  - DomainContext.actorId/actorLabel/triggerEvent (opcionales) — audit trail trazable
  - moveOrderToStage con compare-and-swap flag-gated (crm_stage_integrity_cas_enabled)
  - order_stage_history con rows reales desde primer move post-deploy (source/actor/cascade)
  - string-marker 'stage_changed_concurrently' propagado por 3 callers (server action, mobile 409, crm-writer two-step)
  - bulkMoveOrdersToStage retorna failed list granular (Pitfall 12 cerrado)
  - integration tests CAS + RLS con describe.skipIf (activables via .env.test)
requires:
  - Plan 01 migration aplicada en prod (order_stage_history + flags + realtime)
affects:
  - Plan 03: puede consumir order_stage_history como source of truth para audit UI + automation introspection
  - Plan 04: puede flipear crm_stage_integrity_killswitch_enabled asumiendo CAS disponible
  - Plan 05: Kanban Realtime + toast 'stage_changed_concurrently' + LEARNINGS wrap-up
tech-stack:
  added: []
  patterns:
    - "Compare-and-swap via Supabase JS v2: .update(...).eq('stage_id', prev).select('id') -> affected=0 detecta race (Pattern 1 RESEARCH)"
    - "Flag-gated rollout: getPlatformConfig<boolean>(key, default=false) — fail-closed, Regla 6"
    - "Best-effort audit insert: console.error on history fail, NO return — move succeeded (Pitfall 3)"
    - "Short-circuit same-stage drop ANTES del CAS (Pitfall 2) — evita falso reject"
    - "String-marker propagation cross-callers: Error.code custom property + substring fallback (D-06)"
key-files:
  created:
    - src/__tests__/integration/orders-cas.test.ts
    - src/__tests__/integration/order-stage-history-rls.test.ts
    - .env.test.example
  modified:
    - src/lib/domain/types.ts (commit 8dc4159 — DomainContext extendido)
    - src/lib/domain/orders.ts (commit 8dc4159 — moveOrderToStage reescrito)
    - src/app/actions/orders.ts (commit 7353182 — getAuthContext + narrow + bulk failed list)
    - src/app/api/mobile/orders/[id]/stage/route.ts (commit 95a4b85 — actorId + 409)
    - src/lib/agents/crm-writer/two-step.ts (commit 99aa3e7 — unwrap .code + confirm narrow)
    - .gitignore (commit dae94bc — whitelist .env.test.example)
decisions:
  - D-04 actor_id / actor_label persistidos en audit trail
  - D-06 string-marker 'stage_changed_concurrently' preservado por todos los callers
  - D-15 narrow del marker en UI layer (409 mobile, dedicated toast pendiente en Kanban Plan 05)
  - D-17 CAS detrás de flag, fail-closed (default false)
  - D-18 audit trail additive SIN flag (empieza a escribirse desde deploy)
  - D-25 integration tests con describe.skipIf (no-fail sin env vars)
metrics:
  duration: ~2h (incluyendo Tasks 1-2 bundled del agente previo)
  completed: 2026-04-22
---

# Plan 02: Domain CAS + Audit Log Insert Summary

**One-liner:** `moveOrderToStage` reescrito con compare-and-swap flag-gated + audit trail additive a `order_stage_history`, con string-marker `stage_changed_concurrently` propagado por los 3 callers (server action, mobile route retorna 409, crm-writer two-step persiste en `crm_bot_actions.error`), y `bulkMoveOrdersToStage` expone `failed` list granular (Pitfall 12 cerrado).

## What Shipped

Comportamiento nuevo con flag `crm_stage_integrity_cas_enabled=false` (default actual):
- `moveOrderToStage` short-circuitea cuando `previousStageId === newStageId` (Pitfall 2 — no CAS reject falso, no history row).
- UPDATE legacy (sin `.eq('stage_id', ...)`) preservado byte-identical — Regla 6 respetada.
- Tras cada UPDATE exitoso, `order_stage_history` recibe una row nueva con: `source` mapeado (manual/automation/webhook/agent/robot/system), `actor_id` (real user.id desde JWT/session), `actor_label`, `cascade_depth`, `trigger_event`. Insert best-effort: si falla, `console.error` pero el move ya commiteó.
- Emit `emitOrderStageChanged` preservado byte-identical — automation pipeline intacto.

Comportamiento nuevo cuando el usuario flipee `crm_stage_integrity_cas_enabled=true` manualmente:
- UPDATE incluye `.eq('stage_id', previousStageId).select('id')`. Si affected=0 → re-fetch current stage y retorna `{ success: false, error: 'stage_changed_concurrently', data: { currentStageId } }`.
- Historia NO se escribe en CAS reject (consistencia: history solo refleja UPDATEs efectivos).

Consumers actualizados:
- **Server action** (`src/app/actions/orders.ts moveOrderToStage`): construye `DomainContext` con `actorId=userId` (del `getAuthContext` extendido) y `actorLabel='user:<8chars>'`. Narrows el marker preservando shape `{ error: 'stage_changed_concurrently', data }`. `bulkMoveOrdersToStage` retorna `{ moved, failed: Array<{ orderId, reason }> }`.
- **Mobile API** (`src/app/api/mobile/orders/[id]/stage/route.ts`): destructura `user` de `requireMobileAuth`, pasa `actorId=user.id, actorLabel='mobile-api'`. Narrows el marker a **HTTP 409 Conflict** con payload `{ error, currentStageId }` (Cache-Control: no-store).
- **crm-writer two-step** (`src/lib/agents/crm-writer/two-step.ts`): `unwrap()` attach `err.code = rawError` (structured), `confirmAction` catch narrow `err.code === 'stage_changed_concurrently'` → persiste `failed = { code: 'stage_changed_concurrently', message }` en `crm_bot_actions.error` JSONB. Idempotencia optimistic UPDATE preservada byte-identical.

## Commits

| Task | Commit | Scope | Archivos |
|------|--------|-------|----------|
| 1+2 bundled | `8dc4159` | Domain + types — CAS flag-gated + history insert + DomainContext extendido | `src/lib/domain/orders.ts` (+133/-11), `src/lib/domain/types.ts` (+8/-1) |
| 3 | `7353182` | Server action + bulk failed list | `src/app/actions/orders.ts` (+35/-9) |
| 4 | `95a4b85` | Mobile route 409 Conflict + actorId | `src/app/api/mobile/orders/[id]/stage/route.ts` (+21/-2) |
| 5 | `99aa3e7` | crm-writer confirm narrow marker | `src/lib/agents/crm-writer/two-step.ts` (+26/-3) |
| 6 | `cbebd35` | CAS integration test (describe.skipIf) | `src/__tests__/integration/orders-cas.test.ts` (+146) |
| 7 | `dae94bc` | RLS append-only test + .env.test.example | `.gitignore`, `.env.test.example`, `src/__tests__/integration/order-stage-history-rls.test.ts` (+126) |

**Total:** 6 commits, 8 archivos tocados (5 modificados + 3 creados). SUMMARY.md pendiente (este archivo + commit final `docs(...)`).

## Verification

```bash
# TypeScript (ejecutado al final de Task 5 y Task 7):
$ npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(error TS)"
# (no output — zero errors)

# Greps de Task 3 (server action):
userId: string OK, userId: user.id OK, actorId: userId OK,
actorLabel: user: OK, stage_changed_concurrently OK, failed: Array OK

# Greps de Task 4 (mobile):
mobile-api OK, actorId: user.id OK, stage_changed_concurrently OK, status 409 OK

# Greps de Task 5 (two-step):
stage_changed_concurrently presente 6 veces (unwrap + confirm narrow + comments)

# Greps de Task 6+7 (tests + env):
.env.test.example OK, TEST_STAGE_A/B/C OK, TEST_PIPELINE_ID OK,
TEST_WORKSPACE_ID OK, NEXT_PUBLIC_SUPABASE_URL OK, SUPABASE_SERVICE_ROLE_KEY OK
orders-cas.test.ts: describe.skipIf OK, stage_changed_concurrently OK, Promise.all OK, crm_stage_integrity_cas_enabled OK
order-stage-history-rls.test.ts: describe.skipIf OK, append-only OK, UPDATE rejected OK, DELETE rejected OK

# Smoke test vitest (sin env vars):
$ npx vitest run src/__tests__/integration/orders-cas.test.ts src/__tests__/integration/order-stage-history-rls.test.ts
 ↓ src/__tests__/integration/order-stage-history-rls.test.ts  (3 tests | 3 skipped)
 ↓ src/__tests__/integration/orders-cas.test.ts  (4 tests | 4 skipped)
 Test Files  2 skipped (2)
      Tests  7 skipped (7)
 Duration  19.59s
# -> graceful skip confirmed (no fail, no pass silencioso)
```

## Deviations from Plan

### Rule 3 - Blocking Issue: TypeScript conversion error en two-step.ts

**Found during:** Task 5 (crm-writer two-step)
**Issue:** `(err as { code?: unknown }).code` fallaba con `TS2352: Conversion of type 'Error' to type '{ code: string; }' may be a mistake` porque Error y `{ code }` no se overlap suficientemente.
**Fix:** Doble cast via `unknown`: `(err as unknown as { code?: unknown }).code`. Patrón estándar TS para casts entre tipos no-overlap.
**Files modified:** `src/lib/agents/crm-writer/two-step.ts`
**Commit:** `99aa3e7` (incluido en el mismo commit que el cambio principal — fix inline durante la construcción del archivo).

### Rule 2 - Auto-added critical functionality: .gitignore whitelist

**Found during:** Task 7 (`.env.test.example` creation)
**Issue:** `.gitignore` linea 34 tiene `.env*` con solo `!.env.example` como excepción — el nuevo `.env.test.example` caería bajo el pattern ignore y `git add` fallaría silenciosamente.
**Fix:** Agregada línea `!.env.test.example` a `.gitignore` (justo debajo de `!.env.example`). Verificado con `git check-ignore -v` que el match es la regla `!` (file NO ignored).
**Files modified:** `.gitignore`
**Commit:** `dae94bc` (bundled con Task 7 — mismo scope).

### Plan re-numeration (consume context)

El plan original tiene 4 tasks (Task 1 domain / Task 2 callers bundled / Task 3 tests / Task 4 push). El objetivo del orchestrador re-numeró para commits atómicos:
- Plan Task 1 → commit `8dc4159` (bundled con partes de Task 2 Paso 0 — `getAuthContext` extension también incluida).
- Plan Task 2 split en 3 commits atómicos por archivo: `7353182` (server action + bulk), `95a4b85` (mobile route), `99aa3e7` (two-step).
- Plan Task 3 split en 2 commits: `cbebd35` (CAS test), `dae94bc` (RLS test + env template + gitignore).
- Plan Task 4 (push) **skipped explícitamente** por el orchestrador (NO push entre waves).

Resultado final: 6 commits atómicos + 1 commit SUMMARY (este).

## Open Items / Deuda Técnica

1. **`actor_label` server-action fallback:** hoy usa `'user:' + userId.slice(0,8)` (ej. `'user:abc12345'`). Follow-up para enriquecer con `workspace_members.full_name` vía join adicional. Documentar en Plan 05 LEARNINGS.md como deuda P3.
2. **Flag `crm_stage_integrity_cas_enabled` sigue en `false`:** NO se flipeó en este plan. Decision del usuario post-observación (Open Question 1 RESEARCH). Para activar:
   ```sql
   UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'crm_stage_integrity_cas_enabled';
   -- Esperar 30-60s (Pitfall 11 — getPlatformConfig TTL cache).
   ```
3. **Integration tests activables pendiente env setup:** `.env.test` no commiteado (gitignored). Para correr los 7 tests, el dev/CI necesita seedear el workspace/pipeline/stages testeo + llenar `.env.test` usando `.env.test.example` como template.
4. **Post-deploy observación sugerida** (cuando se pushee esta branch):
   ```sql
   SELECT COUNT(*), source FROM order_stage_history GROUP BY source ORDER BY source;
   ```
   Tras 5-10min de uso activo deberían aparecer rows con `source='manual'` (Kanban drags) + posibles `'automation'`.

## Authentication Gates

Ninguno durante este plan — ejecución fully autonomous sin auth prompts.

## What This Unblocks

- **Plan 03** (observability + automation audit surface): puede leer `order_stage_history` como source of truth completo para UI de auditoría + consulta `cascade_depth`/`trigger_event` para debug de cascadas. El field mapper `mapDomainSourceToHistorySource` cubre los 6 `DomainContext.source` hoy existentes.
- **Plan 04** (kill-switch activable): asume `crm_stage_integrity_killswitch_enabled` flag presente (Plan 01) + CAS como defensa en profundidad (Plan 02 flag ON cuando el usuario decida). Kill-switch puede depender del marker `stage_changed_concurrently` para reportes.
- **Plan 05** (Kanban Realtime + UX + LEARNINGS wrap-up): UI puede suscribirse a `supabase_realtime` sobre `orders` (Plan 01 publication) + render toast dedicado cuando action retorna `error === 'stage_changed_concurrently'` (web + mobile paths consistentes).

## Self-Check: PASSED

- File check `src/__tests__/integration/orders-cas.test.ts`: FOUND
- File check `src/__tests__/integration/order-stage-history-rls.test.ts`: FOUND
- File check `.env.test.example`: FOUND
- Commit `8dc4159`: FOUND (bundled Tasks 1+2 previo)
- Commit `7353182`: FOUND (Task 3)
- Commit `95a4b85`: FOUND (Task 4)
- Commit `99aa3e7`: FOUND (Task 5)
- Commit `cbebd35`: FOUND (Task 6)
- Commit `dae94bc`: FOUND (Task 7)
- TypeScript compile: no errors project-wide
- Vitest smoke test: 7 skipped cleanly (no fail)
