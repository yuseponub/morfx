---
phase: somnio-v4-crm-subloop
plan: 02
subsystem: agents
tags: [somnio-v4, crm-grounding, crm-query-tools, session-state, env-bridge]

requires:
  - phase: somnio-v4-turn-ledger
    provides: CrmActionRegistrada + TurnLedgerDims (Vista B del grounding)
  - phase: somnio-v4-crm-subloop/01
    provides: 3 TipoAccion symbols + lifecycle re-pointing (depende en grafo, no en codigo de Plan 02)
provides:
  - "interface CrmGrounding tipado fuerte (Vista A DB + Vista B ledger + mensaje crudo)"
  - "buildCrmGrounding() lazy read-only con fallback config_not_set (Pitfall 3)"
  - "snapshot helpers _v4:crm_snapshot (read/write graceful, NO _v3:*)"
  - "env-bridge getConfirmadoStageUuid/getNuevoPedidoStageUuid (fail-closed) + getPipelineUuid (fallback)"
  - "PRE_CONFIRMATION_STAGE_UUIDS set + STAGE_NAME_BY_UUID map"
affects: [somnio-v4-crm-subloop Plan 05 (sub-loop tools), Plan 06 (gate de activacion)]

tech-stack:
  added: []
  patterns:
    - "env-bridge lazy fail-closed (espejo getCanceledStageUuid de invocations.ts) para stage UUIDs"
    - "asExec cast helper para AI SDK v6 tool.execute union type (Result | AsyncIterable)"
    - "grounding lazy puro: el gate del Plan 06 lo invoca solo cuando prende (D-11)"

key-files:
  created:
    - src/lib/agents/somnio-v4/crm-grounding.ts
    - src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts
  modified:
    - src/lib/agents/somnio-v4/config.ts

key-decisions:
  - "Snapshot bajo clave propia _v4:crm_snapshot (D-21 — query-tools no escriben _v3:crm_context/_v3:active_order)"
  - "Vista A con fallback robusto: si getActiveOrderByPhone=config_not_set -> getLastOrderByPhone + razonar stage contra PRE_CONFIRMATION_STAGE_UUIDS (Pitfall 3, caso Somnio HOY)"
  - "activeOrderQueryStatus conserva el status ORIGINAL (config_not_set) como senal de observabilidad incluso tras rescatar el pedido por fallback"
  - "stageName resuelto via STAGE_NAME_BY_UUID (Pitfall 4 — OrderDetail no trae stageName) sin domain read extra"
  - "getPipelineUuid es EXCEPCION al fail-closed: fallback verificado al default Somnio (a0ebcb1e...) porque el pipeline default es estable"

patterns-established:
  - "Cast helper asExec<I,O> para invocar programaticamente tools del factory crm-query-tools (mismo patron que invocations.ts:46-50)"
  - "Subset *Like interfaces (OrderDetailLike/ContactDetailLike) para desacoplar el grounding del shape completo de domain"

requirements-completed: [D-08, D-09, D-10, D-11, D-21]

duration: 18min
completed: 2026-05-29
---

# Phase somnio-v4-crm-subloop Plan 02: Capa Grounding Summary

**Modulo nuevo `crm-grounding.ts` que ensambla las dos vistas de verdad (DB via crm-query-tools + ledger) + mensaje crudo en un `CrmGrounding` tipado fuerte, con fallback robusto para `config_not_set` (caso Somnio HOY) y snapshot lazy bajo clave propia `_v4` — base de hechos confiable para que el sub-loop decida crear-vs-actualizar sin duplicar pedidos (clase Doralba).**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2/2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

### Task 1 — Env-bridge stage UUIDs + pipelineId + STAGE_NAME map (config.ts)
- `getConfirmadoStageUuid()` / `getNuevoPedidoStageUuid()` — lazy, fail-closed (null si falta env var; el caller del Plan 06 omite la mutacion + loggea). Espejo exacto de `getCanceledStageUuid` (invocations.ts:64-66).
- `getPipelineUuid()` — lazy con fallback verificado al default Somnio (`a0ebcb1e-d79a-4588-a569-d2bcef23e6b8`, "Ventas Somnio Standard", is_default, live-verified 2026-05-29). EXCEPCION consciente al patron fail-closed.
- `PRE_CONFIRMATION_STAGE_UUIDS` — set v4-local (NUEVO PEDIDO / FALTA INFO / FALTA CONFIRMAR). Hardcode aceptado per CONTEXT Deferred.
- `STAGE_NAME_BY_UUID` — mapea los 5 UUIDs del pipeline a nombre legible (resuelve Pitfall 4 sin domain read extra).
- Commit: `eef4f4cb`

### Task 2 (TDD) — crm-grounding.ts + tests
- `interface CrmGrounding`: `activeOrder` (Vista A, descope V1 sin historial) + `contact` + `activeOrderQueryStatus` + `ledgerCrmActions` (Vista B passthrough) + `rawMessage` (D-09).
- `buildCrmGrounding()` lazy read-only:
  - phone null -> grounding minimo `not_found`.
  - `getActiveOrderByPhone`=found -> Vista A poblada, stageName via map.
  - **Fallback Pitfall 3:** `config_not_set`/`error` -> `getLastOrderByPhone`; expone el pedido solo si su `stageId ∈ PRE_CONFIRMATION_STAGE_UUIDS`; terminal -> `activeOrder=null`. Conserva el status ORIGINAL como senal.
- Snapshot helpers: `CRM_SNAPSHOT_KEY='_v4:crm_snapshot'`, `writeCrmSnapshot` (JSON.stringify, NUNCA `_v3:*`), `readCrmSnapshot` (null graceful ante ausencia o JSON invalido).
- 7 tests verdes (View A found, config_not_set fallback pre-confirmacion + terminal, View B passthrough, phone null, snapshot roundtrip + JSON invalido, anti-_v3).
- Cero `createAdminClient` (Regla 3 — solo consume crm-query-tools). Cero mutacion.
- Commit: `9eebd6f5`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI SDK v6 tool.execute union type rompe tsc**
- **Found during:** Task 2 (typecheck post-implementacion)
- **Issue:** `createCrmQueryTools(...)` retorna AI SDK `tool` objects cuyo `.execute?` esta tipado como `(Result | AsyncIterable<Result>)` con firma `(input, options)`. Llamarlo programaticamente con un solo arg + acceder `.status`/`.data` fallaba con 18 errores TS (TS2722/TS18048/TS2554/TS2339).
- **Fix:** Agregado helper `asExec<I,O>` que castea `tool.execute` a `(input) => Promise<CrmQueryLookupResult<O>>` — patron IDENTICO a `asExec` ya usado en `invocations.ts:46-50` para crm-mutation-tools. Subset interfaces `OrderDetailLike`/`ContactDetailLike` para narrowear el `data`.
- **Files modified:** `src/lib/agents/somnio-v4/crm-grounding.ts`
- **Commit:** `9eebd6f5` (mismo commit del Task 2)

**Nota:** El plan anticipaba el riesgo en `<interfaces>` ("para uso programatico LLAMAR `.execute({...})`"). La resolucion via `asExec` es el patron canonico del codebase, no una desviacion de diseno.

## TDD Gate Compliance

Task 2 marcado `tdd="true"`. Por el riesgo de tipos del AI SDK (necesidad de que el modulo exista para resolver el cast helper), se escribio el modulo de produccion y el archivo de test juntos en el mismo ciclo, ejecutando los 7 tests inmediatamente (todos GREEN en la primera corrida). No hubo un commit `test()` separado del `feat()`; ambos viven en el commit GREEN `9eebd6f5`. RED conceptual verificado: los tests fallarian sin la implementacion (importan `buildCrmGrounding`/`writeCrmSnapshot`/`readCrmSnapshot`/`CRM_SNAPSHOT_KEY` que no existian antes). Sin gate `test()` aislado — documentado aqui.

## Threat Model Compliance

- **T-grd-01 (cross-workspace) mitigate:** `buildCrmGrounding` recibe `workspaceId` y lo pasa a `createCrmQueryTools({ workspaceId, invoker })`; el domain filtra por workspace (Regla 3 via crm-query-tools). Cero acceso directo a DB.
- **T-grd-03 (config vacia oculta pedido -> duplicado) mitigate:** fallback `getLastOrderByPhone` + `PRE_CONFIRMATION_STAGE_UUIDS` implementado y testeado (Test 2a/2b).
- **T-grd-02 (snapshot stale) accept:** re-query fresco antes de createOrder vive en el Plan 06; invalidacion por edicion humana DEFERRED (CONTEXT). Sin cambio en Plan 02.

## Regla 6 Compliance

Cambios SOLO en `src/lib/agents/somnio-v4/**` (config.ts + crm-grounding.ts + __tests__). Cero cambios a los 5 siblings (somnio-sales-v3, godentist, godentist-fb-ig, somnio-recompra-v1, somnio-sales-v3-pw-confirmation) ni a modulos compartidos (crm-query-tools solo CONSUMIDO, no modificado). v4 sigue DORMANT.

## Known Stubs

Ninguno. `buildCrmGrounding` es funcion pura completa; el grounding es LAZY por diseno (D-11) — el gate del Plan 06 lo invoca. No hay datos hardcoded que fluyan a UI.

## Verification

- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts` -> 7/7 verde.
- `npx vitest run src/lib/agents/somnio-v4/` -> 180 passed, 3 failed (PRE-EXISTENTES: few-shots.test.ts "M1 probability framing" + smoke-rag-b.test.ts network-bound x2 — documentados en runtime notes). Cero regresiones nuevas.
- `npx tsc --noEmit` -> archivos tocados LIMPIOS (config.ts, crm-grounding.ts, crm-grounding.test.ts). Errores pre-existentes en conversations.test.ts + validator.ts NO tocados.
- Greps Regla 3: `grep createAdminClient|@supabase/supabase-js crm-grounding.ts` -> VACIO.
- Greps anti-legacy: `grep '_v3:' crm-grounding.ts` -> VACIO.

## Self-Check: PASSED

- crm-grounding.ts: FOUND
- crm-grounding.test.ts: FOUND
- config.ts: FOUND
- 02-SUMMARY.md: FOUND
- commit eef4f4cb (Task 1): FOUND
- commit 9eebd6f5 (Task 2): FOUND
