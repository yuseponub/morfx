---
phase: somnio-sales-v4
plan: 08
subsystem: timers (Inngest functions)
tags: [inngest, agent-timers, v4-timer, crm-mutation-tools, d-22, d-07, pitfall-10, pitfall-5]

# Dependency graph
requires:
  - phase: somnio-sales-v4
    provides: "Plan 04 — SOMNIO_V4_AGENT_ID + SOMNIO_WORKSPACE_ID literals"
  - phase: somnio-sales-v4
    provides: "Plan 06 — V4_TIMER_DURATIONS en constants.ts (D-21)"
  - phase: somnio-sales-v4
    provides: "Plan 07 — somnio-v4-agent.processMessage (timer path)"
  - phase: crm-mutation-tools
    provides: "createCrmMutationTools factory + tools.createOrder (15 tools shipped 2026-04-29)"
  - phase: somnio-sales-v3
    provides: "agent-timers-v3.ts plantilla (clonado byte-by-byte con renames)"

provides:
  - "v4Timer Inngest function (id='v4-timer', event='agent/v4.timer.started')"
  - "v4TimerFunctions array export para registry"
  - "V4TimerEvents type en Inngest event registry (agent/v4.timer.started + agent/v4.timer.cancelled)"
  - "createTimerOrderV4 helper interno — INLINE crm-mutation-tools.createOrder via OrderCreator (shared) + queries directas pipeline/stage"

affects:
  - "Plan 09 — observation loop puede consumir events 'pipeline_decision:*' emitidos por v4 timer (mismo schema que happy path)"
  - "Plan 12 — webhook-processor + v4 sales-track timer adapter (Plan futuro o adaptado del v3-timer adapter) emitiran 'agent/v4.timer.started'"
  - "Plan 13 — flip atomico (D-40) cierra sesiones v3 abiertas; v3 timers in-flight quedan colgados pero hacen no-op via checkSessionActive guard (D-43); a partir del flip, v4 timers son los que disparan"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: Inngest function clonado de v3 con event name + id distintos (Pitfall 10) — primer ejemplo en codebase de coexistencia paralela de 2 agente-timer functions con duraciones identicas (D-21)"
    - "Pattern: Inline createOrder helper que resuelve contactId/pipelineId/stageId UUID antes de llamar crm-mutation-tools.createOrder (sin replicar OrderCreator entero — solo findOrCreateContact + 2 queries Supabase)"
    - "Pattern: idempotencyKey con tag por nivel timer 'somnio-v4-createOrder-{sessionId}-timer_L{level}' (Pitfall 5) — distingue retries=3 de Inngest + L3 vs L4 vs happy path"
    - "Pattern: V4TimerEvents type registry — clone de V3TimerEvents con event name distinto, ampliado al type union AllAgentEvents que el Inngest client consume via EventSchemas.fromRecord<>"

key-files:
  created:
    - "src/inngest/functions/agent-timers-v4.ts (721 lines — clone v3 [491] + helper createTimerOrderV4)"
  modified:
    - "src/inngest/events.ts (+50 lines — V4TimerEvents type + AllAgentEvents amplia con & V4TimerEvents)"
    - "src/app/api/inngest/route.ts (+3 lines — import v4TimerFunctions + spread en serve.functions + comment docstring)"

key-decisions:
  - "D-07: order creation timer-driven via crm-mutation-tools (NO createProductionAdapters({agentId:'somnio-sales-v3'}))"
  - "D-13: SOMNIO_V4_AGENT_ID literal en createCrmMutationTools invoker"
  - "D-19: createOrder mutation cableada (1 de 5 mutations D-19 alcanzada por timer path; las otras 4 viven en invocations.ts del happy path Plan 07)"
  - "D-20: createOrder failure NO emite template post-success — el helper createTimerOrderV4 retorna {success:false} con errorCode; el caller loggea pero ya envio templates upstream (gap V1.1 — orden de send-then-create heredado de v3 pattern)"
  - "D-21: timer durations identicas a v3 — V4_TIMER_DURATIONS imported desde @/lib/agents/somnio-v4/constants"
  - "D-22: Inngest function v4 separada — id='v4-timer', event='agent/v4.timer.started', NO modifica v3"
  - "D-23: scope = exclusivamente Somnio — sin branching godentist/recompra/v3 en el dispatch"
  - "D-24: cero imports desde @/lib/agents/somnio-v3/* — verificable via grep (0 matches)"
  - "D-43: defensive guard checkSessionActive preservado — v4 timers hacen no-op si la sesion fue cerrada (post-flip rollback safety)"
  - "Pitfall 10: Inngest id + event name distintos para evitar colision con v3-timer (id='v4-timer' vs 'v3-timer'; event 'agent/v4.timer.started' vs 'agent/v3.timer.started')"
  - "Pitfall 5: idempotencyKey con tag distintivo por nivel timer ('somnio-v4-createOrder-{sessionId}-timer_L{level}')"
  - "Regla 6: v3 timer function INTACTO — v3TimerFunctions sigue registrado en /api/inngest/route.ts; v4 corre en paralelo sin afectar tráfico v3"

patterns-established:
  - "Pattern: Plan documenta que registry vive en 'src/inngest/index.ts' pero en este proyecto Inngest serve route es 'src/app/api/inngest/route.ts'. Future agentes pueden seguir el mismo patron (registrar en route.ts) — el archivo src/inngest/index.ts NO existe en el codebase."
  - "Pattern: createTimerOrderV4 INLINE resolution — usa OrderCreator (shared, en @/lib/agents/somnio/) para findOrCreateContact + queries directas Supabase (createAdminClient OK aqui porque es Inngest function code, no agent code; Regla 3 aplica al modulo del agente). El call final pasa por crm-mutation-tools que usa domain layer (Regla 3 cumplida en la mutation real)."
  - "Pattern: AI SDK v6 typed Tool.execute? cast helper — `tools.createOrder.execute as unknown as (input) => Promise<Outcome>`. Misma técnica que invocations.ts (Plan 07) con asExec<I,O>."

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-05-01
---

# Plan 08: agent-timers-v4 (Wave 4) Summary

**Inngest function `agent-timers-v4.ts` clonada de v3 con renames Pitfall 10 y order creation REEMPLAZADA por `crm-mutation-tools.createOrder` directo (D-07/D-22). Registrada en el Inngest serve route. v3 timer queda intacto (Regla 6 — corre en paralelo hasta el flip de Plan 13). 2 commits atómicos. TS clean. Tests v4 49/49 PASS.**

## Performance

- **Duration:** ~30min
- **Started:** 2026-05-01 (post Plan 07 commit `a856f1a`)
- **Completed:** 2026-05-01
- **Tasks:** 3 ejecutados (Task 3 push diferido por constraint del prompt — pushes hasta antes de Plan 11)
- **Files created:** 1 (agent-timers-v4.ts — 721 lines)
- **Files modified:** 2 (events.ts amplia event registry + route.ts registra funcion)
- **Commits atómicos:** 2 (Task 1 + Task 2; Task 3 = sin push)
- **Tests:** 49/49 PASS Plan 07 acumulado (Plan 08 no introduce tests nuevos — los tests del v4 timer son E2E vía Inngest dashboard post-deploy en Plan 13)
- **TypeScript:** clean (`npx tsc --noEmit -p tsconfig.json` exit 0)

## Accomplishments

### `src/inngest/functions/agent-timers-v4.ts` (Task 1)

Clone byte-by-byte de `agent-timers-v3.ts` (491 → 721 lines, +230 lines del helper `createTimerOrderV4` reemplazando 25 lines del bloque legacy de adapters).

**Pitfall 10 renames aplicados:**

- `id: 'v3-timer'` → `id: 'v4-timer'`
- `name: 'V3 Agent Timer'` → `name: 'V4 Agent Timer'`
- Event listen: `event: 'agent/v3.timer.started'` → `event: 'agent/v4.timer.started'`
- Event emit (timer chaining L3→L4): `inngest.send({ name: 'agent/v3.timer.started', ... })` → `'agent/v4.timer.started'`
- Module logger: `'agent-timers-v3'` → `'agent-timers-v4'`
- Imports types: `'@/lib/agents/somnio-v3/types'` → `'@/lib/agents/somnio-v4/types'`
- Imports constants: `V3_TIMER_DURATIONS from '@/lib/agents/somnio-v3/constants'` → `V4_TIMER_DURATIONS from '@/lib/agents/somnio-v4/constants'` (D-21 — duraciones idénticas a v3)
- V3AgentInput/V3AgentOutput → V4AgentInput/V4AgentOutput
- Exports: `v3Timer` → `v4Timer`; `v3TimerFunctions` → `v4TimerFunctions`
- Comments + docstring V3 → V4 con menciones explícitas a Standalone somnio-sales-v4
- META prefix lookup: `_v3:accionesEjecutadas` → `_v4:accionesEjecutadas` (D-30 isolation)

**Routing dispatch v4-only (D-23/D-24):**

Reemplazado el bloque v3 (líneas 308-330) que branchea entre `'somnio-v3' | 'godentist' | 'somnio-recompra'` por dispatch directo:

```typescript
const { processMessage } = await import('@/lib/agents/somnio-v4/somnio-v4-agent')
const output: V4AgentOutput = await processMessage(v4Input)
```

v4 scope es exclusivamente Somnio (D-23) y godentist/recompra tienen sus propias funciones Inngest (no se mezclan).

**Order creation INLINE via crm-mutation-tools (D-07/D-22) — el cambio principal del Plan 08:**

El bloque legacy (v3 líneas 410-434) que invoca `createProductionAdapters({agentId:'somnio-sales-v3'}).orders.createOrder` queda REEMPLAZADO por la helper `createTimerOrderV4` que:

1. Importa `createCrmMutationTools` desde `@/lib/agents/shared/crm-mutation-tools` (D-07).
2. Resuelve `contactId` via `OrderCreator.findOrCreateContact` (shared helper en `@/lib/agents/somnio/`, NO somnio-v3 — Pitfall: aunque el path se llama "somnio", `OrderCreator` es código compartido pre-existente, no v3-specific).
3. Lookup default pipeline + 'NUEVO PEDIDO' stage via queries Supabase directas (mismo patron que `ProductionOrdersAdapter`).
4. Build items array desde `OrderCreator.mapPackToProduct(pack)` + `effectivePrice` (timer-aware via `valorOverride`).
5. Llama `tools.createOrder.execute({...})` con todos los UUIDs resueltos + `idempotencyKey: 'somnio-v4-createOrder-{sessionId}-timer_L{level}'` (Pitfall 5 — distingue retries Inngest + L3 vs L4 vs happy path).
6. Retorna `{success, orderId?, contactId?, error?, errorCode?}` que el caller usa para loggear y emitir observability event.

**Defensive guard checkSessionActive preservado (D-43):**

El guard step (`v3` líneas 261-268) clonado idénticamente — devuelve `{status:'skipped', action:'session_not_active'}` si la sesión fue cerrada (mismo patrón Phase 42). Importante para post-flip de Plan 13: cuando el SQL bulk-cierre cierra todas las sesiones v3 (D-38/D-40), los timers v3 in-flight hacen no-op vía este guard. El mismo guard protege v4 timers en caso de rollback inverso.

### `src/inngest/events.ts` (Task 1 — Deviation Rule 3)

Agregado `V4TimerEvents` type con 2 events:

- `'agent/v4.timer.started'` — disparado por v4 sales-track adapter (Plan 12 futuro), consume `v4Timer`. Mismo schema de data que v3 (sessionId/conversationId/workspaceId/level/timerDurationMs/phoneNumber/contactId).
- `'agent/v4.timer.cancelled'` — observability-only (clonado de v3 pattern, no afecta cancellation real que va via `agent/customer.message` waitForEvent match).

`AllAgentEvents` ampliado con `& V4TimerEvents`. Sin esto, el TS rechazaba `inngest.send({ name: 'agent/v4.timer.started', ... })` en el chained-timers step.

### `src/app/api/inngest/route.ts` (Task 2)

Inngest serve route registry — donde realmente se sirven las funciones a Inngest Cloud. Plan dice 'src/inngest/index.ts' pero ese archivo no existe en este proyecto. La realidad de codebase: serve route = `route.ts` con `serve({ functions: [...] })`.

Cambios:

- Import `v4TimerFunctions` desde `@/inngest/functions/agent-timers-v4`.
- Spread `...v4TimerFunctions` agregado al array de funciones (junto a `...v3TimerFunctions`).
- Docstring del comment header amplia con la nueva línea v4-timer.

`v3TimerFunctions` queda intacto (Regla 6 — proteger agente v3 en producción). Inngest Cloud dispatchea por event name distinto.

## Task Commits

1. **Task 1: agent-timers-v4 + V4TimerEvents** — `2c895e8` (feat) — 2 archivos, 770 inserciones
2. **Task 2: registrar v4TimerFunctions en serve route** — `cc6662b` (feat) — 1 archivo, 3 inserciones

(Task 3 push diferido por constraint del prompt — pushes hasta antes de Plan 11.)

## Files Created/Modified

### Created (1)

- `src/inngest/functions/agent-timers-v4.ts` (721 lines)

### Modified (2)

- `src/inngest/events.ts` (+50 lines — V4TimerEvents block + AllAgentEvents union)
- `src/app/api/inngest/route.ts` (+3 lines — import + spread + docstring)

## Decisions Made

Plan ejecutado siguiendo decisions del CONTEXT.md `addresses_decisions`:

- **D-13:** `SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'` literal en `invoker` de createCrmMutationTools.
- **D-19:** `createOrder` mutation cableada timer-driven (1 de 5 mutations D-19 alcanzada por timer path; las otras 4 viven en `invocations.ts` happy path Plan 07).
- **D-20:** `createOrder` failure NO emite template post-success — `createTimerOrderV4` retorna `{success:false, errorCode}`, el caller loggea (gap V1.1 documentado: el template post-success ya se envió antes de la mutación, mismo orden que v3 — V1.1 reordena send-then-create).
- **D-21:** timer durations idénticas a v3 — `V4_TIMER_DURATIONS` importado desde `@/lib/agents/somnio-v4/constants` (Plan 06 ya copió el objeto byte-by-byte de v3).
- **D-22:** Inngest function v4 separada — id `'v4-timer'`, event `'agent/v4.timer.started'`, sin modificar v3.
- **D-24:** cero imports desde `@/lib/agents/somnio-v3/*` (verificado via grep — 0 matches).
- **D-43:** defensive guard `checkSessionActive` preservado — v4 timers hacen no-op si sesión cerrada.

## Deviations from Plan

### Rule 3 — Blocking

**1. [Rule 3 — Blocking] Inngest event registry requería `V4TimerEvents` type ampliado**

- **Found during:** Task 1 (TypeScript check post-creation del archivo)
- **Issue:** TS error 2322 — `'agent/v4.timer.started'` no asignable a tipos del registry actual (`agent/session.started` etc.). Inngest client en `src/inngest/client.ts` usa `EventSchemas.fromRecord<AllAgentEvents>()` con `AllAgentEvents = AgentEvents & ... & V3TimerEvents & ...`. Sin agregar `V4TimerEvents` al union, `inngest.send({ name: 'agent/v4.timer.started', ... })` no compila.
- **Fix:** Agregado `V4TimerEvents` type clonado de `V3TimerEvents` con event names distintos. `AllAgentEvents` ampliado con `& V4TimerEvents`. Sin migración DB ni breaking change a consumers existentes — ampliación pura del registry.
- **Files modified:** `src/inngest/events.ts` (+50 lines)
- **Verification:** `npx tsc --noEmit` exit 0 post-fix.
- **Committed in:** `2c895e8` (Task 1 commit, fix bundled).
- **Plan impact:** El plan Task 1 listaba solo `src/inngest/functions/agent-timers-v4.ts`. Esta deviation amplía a `events.ts` por necesidad TypeScript — sin esta ampliación el archivo nuevo no compila. Documented en commit + summary frontmatter `key-files.modified`.

### Rule 1 — Defensive cleanup

**2. [Rule 1 — Defensive cleanup] grep gate D-07 fallaba por anti-pattern explícito en comments**

- **Found during:** Task 1 (post-creation grep verification del gate `createProductionAdapters.*'somnio-sales-v3'`)
- **Issue:** 3 ocurrencias de `createProductionAdapters({agentId:'somnio-sales-v3'})` en docstrings JSDoc para documentar el anti-pattern que evitamos. Grep gate matcheaba esos comments → 3 matches en lugar de 0.
- **Fix:** Reescribir las 3 ocurrencias semánticamente equivalentes: "el legacy production adapter del agente v3 (D-07)" / "el production adapter del agente legacy". Misma información documental, NO grep-friendly al anti-pattern check.
- **Files modified:** `src/inngest/functions/agent-timers-v4.ts` (3 comment edits)
- **Verification:** `grep -E "createProductionAdapters.*'somnio-sales-v3'" ... | wc -l` → 0 post-fix.
- **Committed in:** `2c895e8` (Task 1 commit, comment cleanup bundled antes del commit).
- **Pattern continuation:** Misma lección que Plan 07 Task 4 (LEARNINGS Plan 07 deviation #3). Documentar anti-patterns en grep-friendly form invalida los gates de aceptación. Future plans: usar paráfrasis cuando se documenten anti-patterns.

### Rule 3 — Plan path assumption

**3. [Rule 3 — Blocking] Plan asumía registry en `src/inngest/index.ts` que NO existe**

- **Found during:** Task 2 (al buscar el archivo del plan)
- **Issue:** Plan task 2 dice "Editar `src/inngest/index.ts`". Ese archivo no existe en el proyecto — Inngest Next.js usa `src/app/api/inngest/route.ts` con `serve({ functions: [...] })` (patrón estándar Next.js App Router + Inngest).
- **Fix:** Aplicar Task 2 al archivo real del registry. La acceptance criteria del plan ("`v4TimerFunctions` importado + agregado al export del registry + `pnpm typecheck` ok") se cumple igualmente — el spread en `serve.functions` cumple "agregado al export". `route.ts` es el único archivo que Inngest Cloud invoca (`/api/inngest` GET/POST/PUT).
- **Files modified:** `src/app/api/inngest/route.ts` (en lugar del plan-mentioned `src/inngest/index.ts`)
- **Verification:** Gate del plan (`grep "v4TimerFunctions" + grep "agent-timers-v4"`) PASS sobre route.ts.
- **Committed in:** `cc6662b` (Task 2 commit).
- **Plan impact:** Cero — la realidad del codebase es que `route.ts` cumple la función que el plan asignó conceptualmente a `index.ts`. Future plans del standalone (o futuros agentes) deben referenciar `src/app/api/inngest/route.ts` directamente.

---

**Total deviations:** 3 (1 Rule 3 blocking real + 1 Rule 3 path assumption + 1 Rule 1 defensive cleanup).

**Impact on plan:** Las 3 deviaciones son adaptaciones a la realidad del codebase. Cero impacto en interfaces / decisions / consumidores. El verify gate del plan PASA en su forma original. La deviation #1 (V4TimerEvents) amplía levemente los archivos modificados respecto al plan declarado pero es necesaria para que el archivo nuevo compile.

## TDD Gate Compliance

Plan 08 NO es plan-level TDD (frontmatter `type` no es `tdd`). Ningún task lleva `tdd="true"`. No aplica gate sequence.

Tests v4 acumulados (Plan 07): 49/49 PASS — verificación de no-regresión post Plan 08 cambios. Plan 08 no introduce tests nuevos porque la unidad real de prueba es el Inngest function que requiere infrastructure E2E (Inngest dashboard, real Supabase). Esos tests viven en Plan 13 smoke + post-flip observability.

## Issues Encountered

- **Pre-existing dirty working tree:** trabajado solo con `git add <archivos-específicos>` por task; ningún commit incluyó archivos fuera del scope del plan + la deviation V4TimerEvents.
- **Push diferido por constraint del prompt:** los 2 commits de Plan 08 se quedan locales hasta antes del Plan 11. Vercel deploy NO ocurrió. La Regla 1 del CLAUDE.md (push después de cambios) está intencionalmente diferida en somnio-sales-v4 hasta Plan 11.
- **No tests E2E del v4 timer en este Plan:** correcto — v4 timer requiere infra Inngest + Supabase + WhatsApp para test real. Plan 08 acceptance verifica via grep gates + TS clean + 49/49 tests v4 acumulados (no-regresión). Smoke real ocurre en Plan 13 post-flip.

## User Setup Required

Ninguno para Plan 08 en sí. Para futuro deployment (cuando v4 reciba tráfico — Plan 13):

- **`SOMNIO_CANCELED_STAGE_UUID` env var** ya documentada como required por Plan 07 (consumido por `invocations.ts` happy path; el timer path no la usa porque timer path NO ejecuta `cancelar`).
- **Vercel deploy** — al pushear el commit del Plan 11 (que incluirá Plan 08), Vercel registrará automáticamente la nueva función `v4-timer` con Inngest Cloud (Inngest hace re-discovery via GET `/api/inngest`).
- **Inngest dashboard verification post-deploy** — confirmar que `v4-timer` aparece en la lista de funciones registradas y que su event listener es `agent/v4.timer.started`. NO traffic real hasta Plan 13 flip.

## Next Phase Readiness

**Listo para consumir desde:**

- **Plan 09 (observation loop):** los events `pipeline_decision:*` que el v4 timer emite via `getCollector()` (al call `processMessage` interno) son del mismo schema que el happy path. Sin cambios necesarios en el observation loop schema.
- **Plan 12 (sales-track timer adapter v4):** Plan 12 cableará el adapter que emite `inngest.send({ name: 'agent/v4.timer.started', ... })` cuando v4 sales-track produce un `TimerSignal` de tipo `'start'`. Mismo patrón que `V3ProductionTimerAdapter`. v4 sales-track ya emite TimerSignals (Plan 06 — ver `transitions.ts` v4 ofrecer_promos y mostrar_confirmacion siguen el patrón v3).
- **Plan 13 (flip atómico):** post-flip, las nuevas sesiones Somnio quedan asignadas a v4 vía routing rule. v4 sales-track emite TimerSignals → adapter → v4Timer Inngest function → on timeout → v4 processMessage(systemEvent). El loop completo cierra en Plan 13.

**Sin blockers detectados.**

## Self-Check

Verificación post-write de claims del SUMMARY:

**Files (1 nuevo + 2 modificados):**

```
[ -f src/inngest/functions/agent-timers-v4.ts ]                                 # FOUND
git diff --stat HEAD~2 HEAD -- src/inngest/events.ts                            # MODIFIED (+50)
git diff --stat HEAD~2 HEAD -- src/app/api/inngest/route.ts                     # MODIFIED (+3)
```

**Commits (2 task-commits):**

```
git log --oneline | grep "feat(somnio-v4): plan-08 task-1" → 2c895e8 FOUND
git log --oneline | grep "feat(somnio-v4): plan-08 task-2" → cc6662b FOUND
```

**Gates:**

- `grep -q "id: 'v4-timer'" src/inngest/functions/agent-timers-v4.ts` — OK
- `grep -q "'agent/v4.timer.started'" src/inngest/functions/agent-timers-v4.ts` — OK
- `grep -q "createCrmMutationTools" src/inngest/functions/agent-timers-v4.ts` — OK
- `grep -q "invoker: SOMNIO_V4_AGENT_ID" src/inngest/functions/agent-timers-v4.ts` — OK
- `grep -q "somnio-v4-createOrder-" src/inngest/functions/agent-timers-v4.ts` — OK (idempotencyKey)
- `grep -q "timer_L" src/inngest/functions/agent-timers-v4.ts` — OK (level tag)
- `grep -q "checkSessionActive" src/inngest/functions/agent-timers-v4.ts` — OK (D-43 guard preserved)
- `grep -E "id: 'v3-timer'|'agent/v3\\.timer" src/inngest/functions/agent-timers-v4.ts | grep -v '^//' | grep -v '^[[:space:]]*\*'` → 0 matches (Pitfall 10)
- `grep -E "createProductionAdapters.*'somnio-sales-v3'" src/inngest/functions/agent-timers-v4.ts | wc -l` → 0 (D-07)
- `grep -rE "from '@/lib/agents/somnio-v3" src/inngest/functions/agent-timers-v4.ts | wc -l` → 0 (D-24)
- `grep -q "v4TimerFunctions" src/app/api/inngest/route.ts` — OK
- `grep -q "agent-timers-v4" src/app/api/inngest/route.ts` — OK
- `npx tsc --noEmit -p tsconfig.json` exit 0 — OK
- `pnpm vitest run src/lib/agents/somnio-v4/` → `Test Files 8 passed (8)` + `Tests 49 passed (49)` — OK (no regresión)
- `grep -q "V4TimerEvents" src/inngest/events.ts` — OK
- `grep -q "& V4TimerEvents" src/inngest/events.ts` — OK (union ampliado)

## Self-Check: PASSED

---
*Phase: somnio-sales-v4*
*Plan: 08*
*Completed: 2026-05-01*
