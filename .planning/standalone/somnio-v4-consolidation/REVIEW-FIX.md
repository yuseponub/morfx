---
phase: somnio-v4-consolidation
fixed_at: 2026-06-10
review_path: .planning/standalone/somnio-v4-consolidation/REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# somnio-v4-consolidation — Code Review Fix Report

**Fixed at:** 2026-06-10
**Source review:** `.planning/standalone/somnio-v4-consolidation/REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, H-01, H-02, M-01)
- Fixed: 4
- Skipped: 0
- Out of scope (NOT touched): M-02 (pre-existing) + 5 Low findings (L-02..L-05). L-01 (param muerto `systemEvent`) se resolvió de paso como parte del fix de H-02.

**Gates:**
- `npx tsc --noEmit` → exit 0 (0 errores fuera de `.next/`).
- Canonical suite → **358 passed | 7 skipped | 0 failed** (baseline 353 + 5 tests aditivos). Asserts existentes intactos.

---

## Fixed Issues

### CR-01 [Critical] — El sandbox perdió `simulate: true` (gate CRM ejecutaba mutation-tools REALES)

**Files modified:** `src/lib/agents/somnio-v4/core/types.ts`, `src/lib/agents/somnio-v4/core/turn-orchestrator.ts`, `src/lib/agents/somnio-v4/engine-v4.ts`, `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts`
**Commit:** `73e9a7e8`
**Applied fix:** Campo neutral `simulate?: boolean` añadido a `TurnCoreInput`; el core lo threadea al `V4AgentInput` (`simulate: input.simulate ?? false`). El wrapper sandbox (`engine-v4.ts`) setea `simulate: true` en `coreInput`; el runner prod no lo setea (default false → mutation-tools reales). Restaura el `simulate: true` que el engine viejo (`1af5c49c:283`) pasaba y que el Plan 11 dropeó. Arquitectura limpia: campo neutral en el core (no se acopla el sandbox dentro del core), ambos wrappers lo threadean.
**Test evidence:** Test aditivo **E11** en `engine-v4-lock.test.ts` — asierta `agentMockFn.mock.calls[0][0].simulate === true` en el path sandbox (cierra el blind spot del mock que el review identificó).

### H-02 [High] — `systemEvent` perdido en el rewrite (simulación de timers del sandbox rota)

**Files modified:** `src/lib/agents/somnio-v4/core/types.ts`, `src/lib/agents/somnio-v4/core/turn-orchestrator.ts`, `src/lib/agents/somnio-v4/engine-v4.ts`, `src/lib/agents/somnio-v4/sandbox-adapters.ts`, `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts`
**Commit:** `73e9a7e8`
**Applied fix:** Campo neutral `systemEvent?: SystemEvent` añadido a `TurnCoreInput` (es un struct `{ type, level }` de somnio-v4, no tipo de canal — compatible con D-05); el core lo threadea al `V4AgentInput`. El wrapper sandbox lo provee desde `V4EngineInput.systemEvent`; el runner prod no lo setea (timers reales van por `agent-timers-v4.ts` directo). Ahora un turno de timer simulado entra por `processSystemEvent` (retomas D-21) en vez de `processUserMessage` con mensaje vacío. Eliminado de paso el parámetro muerto `systemEvent` de `CreateSandboxAdaptersArgs` (era L-01) y su destructuring + el import `SystemEvent` no usado — contrato del adapter limpio.
**Test evidence:** Test aditivo **E12** en `engine-v4-lock.test.ts` — input con `systemEvent: { type: 'timer_expired', level: 3 }` → asierta `agentInput.systemEvent` equal al evento + `agentInput.simulate === true`.

### H-01 [High] — El retry de `VersionConflictError` (B9) era código muerto

**Files modified:** `src/lib/agents/engine/v4-production-runner.ts`, `src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts`
**Commit:** `6affc832`
**Applied fix:** `commitTurn` (vía `storage.updateMode` con optimistic-locking, fuente del `VersionConflictError`) corre DENTRO de `loopBody()` del core; el catch del core convierte todo lo que no es `LostLockError` a `{ kind: 'error', cause }` SIN re-lanzar → el `catch (error)` del wrapper nunca veía el error (código muerto). Fix per la guía del review: el wrapper inspecciona `result.cause instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES` tras `runTurn` y reintenta `processMessage(input, retryCount + 1)`. El campo `cause` ya existía en `TurnResult` para esto. El re-entry corre con el lock ya liberado por el finally del core; `releaseLockIfOwner` owner-checked hace el doble release un no-op safe, y el re-fetch de sesión en `getSeedState` toma la versión fresca. Conservé la rama `catch`-thrown defensiva por si una futura ruta re-lanza sin envolver.
**Test evidence:** 2 tests aditivos en `v4-production-runner-pathb.test.ts`: (1) `updateMode` lanza `VersionConflictError` en el 1er intento, OK en el 2do → `output.success === true`, `output.newMode === 'sales'`, `updateMode` invocado 2×, agente invocado 2×; (2) `updateMode` lanza siempre → tras agotar los 3 reintentos retorna `V4_ENGINE_ERROR`, `updateMode` invocado 4× (inicial + 3 retries). (Grep `VersionConflict` en las suites era 0 antes — el gate no lo veía.)

### M-01 [Medium] — Early-return de CKPT-6b Path B (pending vacío) exponía el output DESCARTADO (handoff fantasma posible)

**Files modified:** `src/lib/agents/somnio-v4/core/types.ts`, `src/lib/agents/somnio-v4/core/turn-orchestrator.ts` (commit `73e9a7e8`), `src/lib/agents/engine/v4-production-runner.ts`, `src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts` (commit `6affc832`)
**Commit:** `73e9a7e8` (flag en el core) + `6affc832` (supresión en el runner mapResult + test)
**Applied fix:** Flag `outputDiscarded?: boolean` añadido a la variante `kind: 'completed'` de `TurnResult`; el early-return de CKPT-6b Path B con pending vacío (`turn-orchestrator.ts`) lo setea `true` (el `output` adjunto es el de msg1 descartado — solo se enviaron los pending-templates de un turno previo, el output no se envió ni se commiteó). `mapResult` del runner suprime `newMode`/`orderCreated`/`orderId`/`messages` cuando `outputDiscarded === true`, restaurando el shape del runner viejo (`{ success: true, messages: [] }` sin `newMode`). Esto evita que `webhook-processor.ts:1053` (NO modificado) ejecute un handoff fantasma de un turno no persistido. `webhook-processor.ts` permanece intacto (Regla 6 — solo consumidor).
**Test evidence:** Test aditivo **M-01** en `v4-production-runner-pathb.test.ts` — `getPendingTemplates` devuelve 1 template del turno previo (CKPT-6a lo envía → `actuallySentIds > 0`); override fuerza CKPT-6b (`hasSentAnything: true`) a interrumpir con `pendingListLength: 0` + lista real vacía; el output de msg1 trae `newMode: 'handoff'` + `crmResult.success`. Asierta `output.newMode`/`orderCreated`/`orderId` todos `undefined` (NO propagados) + agente invocado 1× (output descartado, no recombinado).

## Skipped Issues

Ninguna. Las 4 findings en scope se fijaron.

---

## Notas de implementación

- **Arquitectura respetada (requisito 2):** `simulate` y `systemEvent` viajan como campos NEUTRALES de `TurnCoreInput` (no como special-casing del sandbox dentro del core). Ambos wrappers los threadean: prod los deja default (false/undefined), sandbox los setea (true / `input.systemEvent`). El core no conoce la diferencia de entorno (D-05). `M-01` usa el flag `outputDiscarded` análogo a `wasInterruptedWithZeroSends` ya existente.
- **Tests aditivos (requisito 3):** 5 tests nuevos, todos cierran el blind spot del mock identificado por el review (E11/E12 asertan campos del `V4AgentInput` que el agente mockeado recibe; H-01 ×2 + M-01 cubren los paths que no tenían cobertura). Asserts existentes intactos.
- **Regla 6:** NO se tocaron `v3-production-runner.ts`, `messaging.ts`, archivos godentist/recompra/pw-confirmation, ni `webhook-processor.ts`. Solo el wrapper prod v4, el core v4, el wrapper sandbox v4 y sus suites.
- **Out of scope:** M-02 (pre-existente, documentado) y L-02..L-05 NO se tocaron. L-01 se resolvió incidentalmente como parte del fix limpio de H-02 (el param muerto era síntoma directo de H-02).
- **Commit grouping:** CR-01/H-02 y el flag-core de M-01 comparten `core/types.ts` + `turn-orchestrator.ts` (edits interleaved en los mismos archivos — git stagea archivos completos), por eso van en `73e9a7e8`. La supresión de M-01 en el runner + H-01 comparten `v4-production-runner.ts` + el pathb test, por eso van en `6affc832`. Cada commit es self-consistent y buildable (typecheck + suite verdes).

---

_Fixed: 2026-06-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
