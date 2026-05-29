---
phase: somnio-v4-crm-subloop
plan: 01
subsystem: agents
tags: [somnio-v4, state-machine, tipoaccion, lifecycle, crm-subloop, dormant]

# Dependency graph
requires: []
provides:
  - "3 nuevos miembros TipoAccion: recordar_promo, recordar_confirmacion, confirmar_orden"
  - "Desacople timer L3/L4 de creacion de orden (recordar_* fuera de CREATE_ORDER_ACTIONS)"
  - "Transicion R5 (confirmar) emite confirmar_orden (senal de moveOrderToStage, NO crear)"
  - "Templates re-apuntados a los nuevos simbolos sin cambiar la conversacion de cara al cliente"
affects: [somnio-v4-crm-subloop-plan-06, somnio-v4-crm-subloop-plan-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capa de simbolos puros separada de la capa de ejecucion CRM (Plan 06 ejecuta las mutaciones)"
    - "Cast de frontera v4->SandboxState para union TipoAccion divergente (mismo patron que packSeleccionado as PackSelection)"

key-files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/types.ts
    - src/lib/agents/somnio-v4/constants.ts
    - src/lib/agents/somnio-v4/transitions.ts
    - src/lib/agents/somnio-v4/response-track.ts
    - src/lib/agents/somnio-v4/phase.ts
    - src/lib/agents/somnio-v4/engine-v4.ts

key-decisions:
  - "recordar_* fuera de SIGNIFICANT_ACTIONS/CRM_ACTIONS/CREATE_ORDER_ACTIONS y fuera de derivePhase (no cambian fase de venta; S3/D-19)"
  - "confirmar_orden en SIGNIFICANT_ACTIONS + CRM_ACTIONS (mueve a CONFIRMADO) pero NO en CREATE_ORDER_ACTIONS (mueve, no crea; D-18)"
  - "crear_orden* legacy NO se podan en este plan (se trazan/podan en Plan 06 cuando no tengan consumer vivo)"
  - "Cast de frontera en engine-v4 en vez de modificar SandboxState (tipado contra somnio-v3) para preservar Regla 6"

patterns-established:
  - "Pattern: nuevos simbolos de state-machine se introducen primero como capa pura (templates + sets) y la ejecucion CRM se cablea en un plan posterior"
  - "Pattern: cast de frontera v4<->shared-type cuando el union v4 diverge del union v3 con shape runtime identico"

requirements-completed: [D-15, D-17, D-18, D-19]

# Metrics
duration: ~20 min
completed: 2026-05-29
---

# Phase somnio-v4-crm-subloop Plan 01: Capa de Simbolos Lifecycle Summary

**Introduce 3 nuevos TipoAccion (recordar_promo, recordar_confirmacion, confirmar_orden), desacopla los timers L3/L4 de la creacion de orden y re-apunta la transicion de confirmacion a una senal de movimiento de stage — todo como simbolos puros, sin tocar la ejecucion CRM.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 6 (5 del plan + 1 deviation)

## Accomplishments
- **D-19 (desacople timer):** L3 (`timer_expired:3`) emite `recordar_promo`; L4 (`timer_expired:4`) emite `recordar_confirmacion`. Ambos quedan FUERA de `CREATE_ORDER_ACTIONS` → `shouldCreateOrder=false` en el timer path → el timer ya no crea orden, solo recuerda. `timerSignal: { type:'cancel' }` preservado en ambos para prevenir doble-recordatorio.
- **D-18 (confirmar→mover):** R5 (`on:'confirmar'` + `datosCriticos` + `packElegido`) emite `confirmar_orden` en vez de `crear_orden`. `confirmar_orden` entra a `SIGNIFICANT_ACTIONS` + `CRM_ACTIONS` (toca CRM via `moveOrderToStage(CONFIRMADO)` en el Plan 06) pero NO a `CREATE_ORDER_ACTIONS` (mueve, no crea).
- **D-17 (pack→update):** `mostrar_confirmacion` intacto (sigue mapeando a `resumen_<pack>`). NO se toco.
- **Templates coherentes (SUP-6):** la conversacion de cara al cliente no cambia. `confirmacion_orden_*` (delivery-zone) re-apuntado de `crear_orden` a `confirmar_orden`; `pendiente_promo`/`pendiente_confirmacion` re-apuntados a `recordar_promo`/`recordar_confirmacion`.
- **phase.ts:** `confirmar_orden → order_created`; `recordar_*` quedan fuera del switch (no derivan fase, al no estar en `SIGNIFICANT_ACTIONS`).
- **Regla 6 satisfecha:** los 6 archivos modificados estan todos en `src/lib/agents/somnio-v4/**`. Cero archivos de agentes hermanos (v3/godentist/recompra/pw-confirmation) tocados. v4 sigue DORMANT.

## Task Commits

Cada tarea fue commiteada atomicamente:

1. **Task 1: 3 nuevos TipoAccion + sets CRM ajustados** - `2035c699` (feat)
2. **Task 2: Re-apuntar transiciones L3/L4/R5** - `0aa9251a` (feat)
3. **Task 3: Re-apuntar templates + phase + cast frontera (incluye deviation Rule 3)** - `fda87348` (feat)

## Files Created/Modified
- `src/lib/agents/somnio-v4/types.ts` - Agregados 3 miembros al union `TipoAccion`
- `src/lib/agents/somnio-v4/constants.ts` - `confirmar_orden` en SIGNIFICANT+CRM; recordar_* fuera de los 3 sets; ninguno de los 3 en CREATE_ORDER_ACTIONS
- `src/lib/agents/somnio-v4/transitions.ts` - R5→confirmar_orden, L3→recordar_promo, L4→recordar_confirmacion (timerSignals cancel preservados)
- `src/lib/agents/somnio-v4/response-track.ts` - `case 'crear_orden'`→`'confirmar_orden'`, `'crear_orden_sin_promo'`→`'recordar_promo'`, `'crear_orden_sin_confirmar'`→`'recordar_confirmacion'`; `mostrar_confirmacion` intacto
- `src/lib/agents/somnio-v4/phase.ts` - `confirmar_orden`→`order_created`; recordar_* fuera del switch
- `src/lib/agents/somnio-v4/engine-v4.ts` - **(deviation)** cast de frontera `accionesEjecutadas as SandboxState['accionesEjecutadas']` en 2 sitios (carryState + newState)

## Decisions Made
- Mantener `recordar_*` totalmente fuera de los 3 sets y de `derivePhase` (per S3/D-19): el recordatorio no cambia la fase de venta y el doble-recordatorio ya lo previene el `timerSignal cancel`.
- `confirmar_orden` es significativa (deriva `order_created`) y toca CRM (CRM_ACTIONS) pero NO crea (fuera de CREATE_ORDER_ACTIONS) — mueve a CONFIRMADO en el Plan 06.
- No podar los `crear_orden*` legacy en este plan (instruccion explicita: se podan en Plan 06 cuando se trace que no tienen consumer vivo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cast de frontera v4→SandboxState para el union TipoAccion divergente**
- **Found during:** Task 3 (typecheck full repo tras Task 1)
- **Issue:** Agregar los 3 nuevos miembros al union v4 `TipoAccion` rompio la asignabilidad de `AccionRegistrada[]` (v4) hacia `SandboxState.accionesEjecutadas`, que esta tipado contra el union de `somnio-v3` (que no conoce los 3 nuevos miembros). `engine-v4.ts(465)` y `(506)` fallaban con TS2322 (`somnio-v4 TipoAccion is not assignable to somnio-v3 TipoAccion`).
- **Fix:** Cast de frontera `output.accionesEjecutadas as SandboxState['accionesEjecutadas']` en los 2 sitios donde el output v4 fluye a `SandboxState` (bloque carryState + bloque newState). Mismo patron ya usado para `packSeleccionado as PackSelection | null` a 1 linea de distancia. El shape runtime es identico (`{tipo, turno, origen, crmAction}`); solo diverge el string-literal union de `tipo`. No se modifico ni `somnio-v3` ni `@/lib/sandbox/types` → Regla 6 preservada.
- **Files modified:** src/lib/agents/somnio-v4/engine-v4.ts
- **Verification:** `npx tsc --noEmit` → 0 errores en `somnio-v4/`. El cast es la opcion v4-scoped minima (tocar `SandboxState` o `somnio-v3` habria violado Regla 6 y/o el aislamiento del agente).
- **Committed in:** `fda87348` (parte del commit de Task 3)

---

**Total deviations:** 1 auto-fixed (1 blocking, Rule 3)
**Impact on plan:** El cast es necesario para que la capa de simbolos compile contra el tipo compartido del sandbox sin tocar v3. Sin scope creep — un solo archivo extra dentro del scope somnio-v4.

## Issues Encountered

**Tests preexistentes fallando (FUERA DE SCOPE — no causados por este plan):**
- `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts > "prompt contains M1 probability framing"` — el test espera el texto `compañero (humano )?experto` en el prompt de generacion; el prompt actual ya no lo emite. Verificado que el archivo fuente `few-shots.ts` contenia ese texto en el baseline HEAD~3 pero el prompt construido diverge → el test YA estaba roto antes de este plan. Archivo no tocado por este plan.
- `src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts > "2. razonamiento_libre — ayer fue un día raro"` — smoke RAG generativo, network/LLM-bound (~103s), aserción de contenido generado (flaky). Archivo no tocado por este plan.
- `src/lib/domain/__tests__/conversations.test.ts` (2 errores TS7022/TS7024) y `.next/dev/types/validator.ts` (4 errores TS2304, artefacto generado de Next) — preexistentes, ultima modificacion en commit `307aa8da` (routing-channel-fact), no en este plan.

Ninguno referencia los nuevos simbolos ni esta en los archivos modificados por este plan. Loggeados como out-of-scope (scope boundary), no corregidos.

**Tests del plan (verde):**
- `transitions.test.ts` 7/7 + `state.test.ts` 9/9 = 16/16 verde.
- Greps de acceptance de las 3 tasks: todos PASS.
- `npx tsc --noEmit` scoped a `somnio-v4/`: 0 errores.

## User Setup Required
None - sin configuracion de servicios externos. v4 DORMANT en produccion (0 workspaces). Sin migraciones DB (Regla 5 satisfecha — no se introdujo ninguna).

## Next Phase Readiness
- Capa de simbolos completa. El Plan 06 cablea la ejecucion real: `moveOrderToStage(CONFIRMADO)` para `confirmar_orden`, gate de `updateOrder` para `mostrar_confirmacion`, y nacimiento temprano del cascaron.
- El Plan 07 extiende los tests con casos D-15/D-18/D-19 sobre los nuevos simbolos.
- Pendiente para Plan 06: trazar consumidores vivos de `crear_orden*` legacy antes de podarlos.

## Self-Check: PASSED

- SUMMARY.md existe en disco.
- Los 3 commits de tarea existen en el historial (`2035c699`, `0aa9251a`, `fda87348`).
- Los 6 archivos modificados existen en disco.
- `transitions.test.ts` 7/7 + `state.test.ts` 9/9 verde; greps de acceptance PASS; `tsc` 0 errores en somnio-v4.
- Regla 6: 6/6 archivos dentro de `src/lib/agents/somnio-v4/**`, cero archivos de agentes hermanos. v4 DORMANT.

---
*Phase: somnio-v4-crm-subloop*
*Completed: 2026-05-29*
