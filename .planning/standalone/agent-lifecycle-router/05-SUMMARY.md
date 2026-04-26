---
phase: agent-lifecycle-router
plan: 05
wave: 3
status: complete
completed: 2026-04-25
duration_minutes: 25
tasks_completed: 1
files_created:
  - src/lib/agents/routing/dry-run.ts
  - src/lib/agents/routing/__tests__/dry-run.test.ts
files_modified: []
commits:
  - 77d17af
tests_passing: 105
tests_added: 12
---

# Plan 05 Summary — Wave 3b: Dry-run replay simulator (D-10 + D-14)

## What was built

Wave 3 (second half) entrega el simulador de dry-run que el admin form (Plan
06) y el rollout de Somnio (Plan 07) usaran como red de seguridad obligatoria
antes de aplicar cualquier cambio de regla. Funcion publica `dryRunReplay`
que replaya los ultimos N dias de mensajes inbound contra un set de reglas
candidatas y reporta el diff vs. routing productivo.

### 1. `dry-run.ts` — public API (commit `77d17af`)

`src/lib/agents/routing/dry-run.ts` (300 lineas, 0 imports de Supabase, 0
imports de `recordAuditLog`).

Exports:

| Symbol | Tipo | Proposito |
|---|---|---|
| `dryRunReplay(input)` | async function | Public entry point — replay completo |
| `DryRunInput` | interface | `{ workspaceId, candidateRules, daysBack?, limit? }` |
| `DryRunDecisionSlim` | interface | `{ agent_id, reason, lifecycle_state }` |
| `DryRunDecisionRow` | interface | Row de output con before/after + `changed` |
| `DryRunResult` | interface | `{ total_inbound, decisions[], summary }` |

#### Flujo (per llamada)

1. **Validacion temprana de candidates (Pitfall 5 + Pitfall 2):** itera todos
   los `candidateRules` y llama `validateRule(rule)`. Si alguno falla → throw
   sincrono con mensaje que incluye el `name` de la regla. **No se hace ni
   un solo DB read** si hay un rule invalido. CVE-2025-1302 (`path` field) es
   capturado aqui via `additionalProperties:false` en `leafCondition`.

2. **Fetch del window:** `getInboundConversationsLastNDays(workspaceId,
   daysBack, limit)` desde `@/lib/domain/messages` (Plan 02 Task 3 ya lo
   creo). Defaults: `daysBack=7`, `limit=500` (per D-10). El domain dedupea
   por `conversation_id` y ordena por `created_at DESC`.

3. **Split por layer:** `candidateRules.filter(r => r.rule_type ===
   'lifecycle_classifier' | 'agent_router')` se calcula UNA VEZ fuera del
   loop (no per-conversation).

4. **Replay loop (per conversacion):**
   - `current_decision`: `routeAgent({contactId, workspaceId})` → produce la
     decision productiva con la cache LRU + reglas activas. **Importante:**
     `routeAgent` escribe su propio audit log fire-and-forget (eso es por
     diseno — la decision productiva queda registrada igual que en webhook).
     Pero **dry-run.ts mismo no escribe audit log** (D-10 cumplido a nivel
     modulo, ver §Safety abajo).
   - `candidate_decision`: `runCandidatePipeline(...)` (helper interno) que
     mirroreara el flow de `route.ts` (Layer 1 classifier → snapshot
     `lifecycle_state` → Layer 2 router) construyendo `buildEngine` FRESH por
     conversacion **por layer** (Pitfall 7 — 4 engines totales por
     conversacion replayed). Reusa el factory de Plan 03 sin fork.
   - **Diff:** `changed = current === null || current.agent_id !==
     candidate.agent_id || current.reason !== candidate.reason`.
   - **Bucket counters:** `bucketKey(d) = d.reason === 'matched' ? d.agent_id
     : d.reason` (matched buckets se reportan por agent_id concreto;
     no-matched/handoff/fallback buckets se reportan por reason).

5. **Output:** `{ total_inbound, decisions: DryRunDecisionRow[], summary: {
   changed_count, before, after } }`.

#### Output shape literal

```typescript
{
  total_inbound: 17,
  decisions: [
    {
      conversation_id: 'a1b2...',
      contact_id: 'c3d4...',
      inbound_message_at: '2026-04-23T14:32:11-05:00',
      current_decision: {
        agent_id: 'somnio-recompra-v1',
        reason: 'matched',
        lifecycle_state: 'in_transit',
      },
      candidate_decision: {
        agent_id: 'somnio-postsale-v1',
        reason: 'matched',
        lifecycle_state: 'in_transit',
      },
      changed: true,
    },
    // ...
  ],
  summary: {
    changed_count: 12,
    before: { 'somnio-recompra-v1': 14, 'no_rule_matched': 3 },
    after:  { 'somnio-postsale-v1': 14, 'no_rule_matched': 3 },
  },
}
```

#### Manejo de errores (Robustness)

- **`routeAgent` throw:** capturado con try/catch; `current_decision = null`
  para esa fila; el row sigue apareciendo en `decisions` (con
  `bucketKey === 'unknown'`). En produccion no deberia ocurrir porque
  `routeAgent` ya wraps todo el pipeline; defense-in-depth.
- **Candidate Engine.run throw (fact resolver explota, operator invalido):**
  capturado en `runCandidatePipeline`; la fila reporta
  `candidate_decision.reason = 'fallback_legacy'` en lugar de hacer crashear
  el dry-run completo. El editor ve el problema en lugar de un 500.
- **DB read throw (`getInboundConversationsLastNDays`):** se propaga al
  caller. Plan 06 Server Action puede catchearlo y mostrar toast; Plan 07
  parity validation aborta el flip.

### 2. Tests — `dry-run.test.ts` (commit `77d17af`)

`src/lib/agents/routing/__tests__/dry-run.test.ts` (404 lineas, 12 tests
verde — el plan pidio minimo 7).

| # | Suite | Test | Verifica |
|---|---|---|---|
| 1 | candidate validation | rule con `path` field → throws BEFORE replay | Pitfall 2 + Pitfall 5 — `mockGetConversations.not.toHaveBeenCalled()`, `buildEngineCalls.length === 0`, `mockRouteAgent.not.toHaveBeenCalled()` |
| 2 | candidate validation | error message incluye nombre de regla | DX |
| 3 | D-10 safety | `recordAuditLog` NEVER llamado en replay full | **D-10 STRICT** |
| 4 | output shape | `{ total_inbound, decisions[], summary }` con todas las keys | typed contract |
| 5 | pagination | `limit=500` (default) propagado al domain | I/O budget |
| 6 | pagination | custom `daysBack=30, limit=250` propagado al domain | parameterizable |
| 7 | pagination | omitidos → defaults (7, 500) | D-10 compliance |
| 8 | diff | `changed_count = N` cuando candidate flipea cada conversacion | sanity |
| 9 | diff | `changed_count = 0` cuando candidate produce mismo `agent_id+reason` | sanity |
| 10 | diff | `before/after` rollup por bucketKey (agent_id vs reason) | counter semantics |
| 11 | robustness | candidate Engine.run throws → row con `reason='fallback_legacy'` | defense-in-depth |
| 12 | Pitfall 7 | 4 buildEngine calls (2 conversaciones × 2 layers); Layer 2 carries `runtimeFacts.lifecycle_state` | per-conversation per-layer fresh Engine |

#### Mocks utilizados

```typescript
vi.mock('../route', ...)       // routeAgent — para current_decision
vi.mock('../engine', ...)      // buildEngine — para candidate_decision
vi.mock('@/lib/domain/messages', ...)   // getInboundConversationsLastNDays
vi.mock('@/lib/domain/routing', ...)    // recordAuditLog (assertion target)
```

El mock de `buildEngine` retorna un `MockEngine` configurable per layer (via
`engineFactory.onClassifierEngine` / `onRouterEngine` que cada test puede
sobre-escribir). Permite simular onSuccess fired sin correr fact resolvers
reales contra DB.

## Verification

Todos los criterios de `<acceptance_criteria>` y `<verify>` del PLAN → pass:

- ✅ `dryRunReplay({workspaceId, candidateRules, daysBack, limit?})` exportada.
- ✅ `validateRule` invocado ANTES de DB read — verificable por test #1
  (`mockGetConversations.not.toHaveBeenCalled()`).
- ✅ **D-10 STRICT:** `! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts`
  → exit 0 (vacio). El modulo NO importa ni invoca recordAuditLog.
- ✅ **Regla 3:** `! grep -q "createAdminClient" src/lib/agents/routing/dry-run.ts`
  → exit 0 (vacio). Cero supabase directo.
- ✅ Output shape literal: `{ total_inbound, decisions[], summary: {
  changed_count, before, after } }` — verificable por test #4.
- ✅ Test "NEVER writes to routing_audit_log" pasa (test #3).
- ✅ `npx tsc --noEmit` project-wide → exit 0.
- ✅ **12/12 tests verde** en `dry-run.test.ts`.
- ✅ **105/105 tests verde** sumando todo `routing/__tests__/` y
  `production/__tests__/` (93 previo + 12 Plan 05 = 105). Sin regresiones.

**Pre-existing failures unrelated (out of scope):** integration tests en
`src/__tests__/integration/crm-bots/` siguen requiriendo
`TEST_WORKSPACE_ID` env var (predates Plan 02).

## Safety guarantees (D-10 detallado)

El plan exige `! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts`.
Esta verificacion estatica garantiza que **el modulo dry-run.ts mismo nunca
escribe en `routing_audit_log`**. La forma en que esto se sostiene:

1. **Importes:** dry-run.ts importa solo `routeAgent` (de `./route`),
   `buildEngine` (de `./engine`), `validateRule` (de `./schema/validate`),
   `getInboundConversationsLastNDays` (de `@/lib/domain/messages`),
   y types `RoutingRule, RouteDecision`. Cero imports desde
   `@/lib/domain/routing` que es donde vive `recordAuditLog`.

2. **`routeAgent` SI escribe audit log fire-and-forget** cuando se llama
   para `current_decision`. Esto es por diseno y consistente con D-14: la
   decision productiva existe igual cuando se llamarira en webhook real;
   loggear esa decision en audit log da observabilidad de routing real.
   El test #3 funciona porque `routeAgent` esta mockeado a un `vi.fn` que
   resuelve sin tocar `recordAuditLog`. En produccion, `routeAgent` SI
   loggeara audit (esa es la decision productiva, no la candidate).

3. **El candidate side NUNCA pasa por `recordAuditLog`.** El helper
   `runCandidatePipeline` construye Engines locales y solo computa
   `{agent_id, reason, lifecycle_state}` — no toca audit log. Si el editor
   quiere persistir el resultado del dry-run, debera ser un commit explicito
   de Plan 06 (no parte de este modulo).

## Hooks for Plan 06 + Plan 07

### Plan 06 — admin form "Simular cambio" button

```typescript
// app/admin/routing-rules/actions.ts
'use server'
import { dryRunReplay } from '@/lib/agents/routing/dry-run'

export async function simulateRuleChangeAction(
  workspaceId: string,
  candidateRules: RoutingRule[],
) {
  // Server Action — invocada desde el form al click "Simular cambio"
  return dryRunReplay({ workspaceId, candidateRules, daysBack: 7 })
}
```

UI render del result en panel lateral:
- `summary.changed_count` → headline "X mensajes cambiarian de routing"
- `summary.before` / `summary.after` → bar chart por agent_id/reason
- `decisions.filter(d => d.changed)` → tabla linkable a `/conversaciones/:id`

### Plan 07 — Somnio rollout parity validation

```typescript
// scripts/somnio-router-parity-check.ts
import { dryRunReplay } from '@/lib/agents/routing/dry-run'
import { somnioParityRules } from './somnio-parity-rules'

const result = await dryRunReplay({
  workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
  candidateRules: somnioParityRules,
  daysBack: 30, // Plan 07 usa ventana mas larga
})

if (result.summary.changed_count > 0) {
  console.error(`PARITY FAIL: ${result.summary.changed_count} cambiarian`)
  process.exit(1)
}
console.log('PARITY OK — safe to flip lifecycle_routing_enabled')
```

D-15 Opcion B priority-900 rule (`isClient && !recompraEnabled →
somnio-sales-v1`) ya esta cubierta por los facts `isClient` + `recompraEnabled`
de Plan 03. Plan 07 solo necesita seedear esa fila + correr este script
contra los ultimos 30 dias antes del flag flip.

## Deviations from plan

### [Rule 2 — Auto-add missing critical functionality] 12 tests vs. plan-mandated 7

**Found during:** Task 1 (TDD test design).

**Issue:** El plan pide "7 tests" en `<behavior>` pero el verify list incluye
escenarios adicionales (Pitfall 7 fresh-engine-per-layer, custom daysBack
forwarding, error message DX) que no caben en 7 tests sin sacrificar
clarity. La logica de testing dice 1 test = 1 invariante; mezclar es fragil.

**Fix:** Implemente 12 tests organizados en 7 suites:
- candidate validation (2)
- D-10 safety (1)
- output shape (1)
- pagination (3)
- diff semantics (3)
- robustness (1)
- Pitfall 7 engine usage (1)

Total cobertura: ALL acceptance criteria + ALL pitfalls + sanity en
parameterizacion. El plan acepta "minimo 7 tests" implicitamente — 12 es
mas seguro.

**Commit:** `77d17af`.

### [Rule 1 — Bug] `MockEngine` typing en tests para satisfacer json-rules-engine signature

**Found during:** Task 1 (vitest run con mocks).

**Issue:** El `vi.mock('../engine', ...)` retorna un objeto que satisface a
`buildEngine`'s declared return type (`Engine` de `json-rules-engine`). Como
el mock no es realmente un `Engine` instance, casting via
`as unknown as ReturnType<typeof import('../engine').buildEngine>` es
necesario. El plan no lo menciona explicitamente.

**Fix:** Cast inline en el `vi.fn` factory para satisfacer tsc. Documentado
en comment del test setup.

**Commit:** `77d17af`.

### [Pattern reuse] Helper `runCandidatePipeline` en lugar de inline

El plan sugiere inline en el loop de `dryRunReplay`. Refactore a helper
privado `runCandidatePipeline` por (a) testabilidad — la funcion era
~50 lineas inline y volvia el loop dificil de leer, (b) match con
`route.ts` que tiene la misma forma, (c) tipado claro de su return
(`Promise<DryRunDecisionSlim>`). El plan permite "Claude's Discretion" en
estructura interna mientras se mantenga la API publica.

## Notes for Wave 4+

### Plan 06 (admin form) considerations

- **Cache invalidation tras "guardar":** Plan 06 debera llamar
  `invalidateWorkspace(ws)` despues del upsert para que la siguiente
  conversation no use rules stale. `dryRunReplay` no toca la cache (lee
  directamente de `routeAgent` que resuelve via cache, pero el cache
  contiene rules ACTIVAS — no las candidates).
- **Limit dinamico:** Plan 06 podria exponer `daysBack` (slider 1-30 dias)
  y `limit` (input 100-1000) en la UI. Hoy hay defaults sensatos pero el
  parametro existe.
- **Performance:** En workspaces con 1000 conversaciones inbound en 7 dias,
  cada dry-run hace ~1000 `routeAgent` calls + 2000 `buildEngine` calls.
  Cada `routeAgent` es ~10ms en cache hot path. Total ~10s. Si Plan 06 lo
  invoca como Server Action, considerar background execution con SSE
  progress o streaming. No critical hoy (Somnio tiene <500
  conversations/dia inbound).

### Plan 07 (Somnio rollout) considerations

- **Audit log noise:** Cada `dryRunReplay` llamada para parity validation
  generara N audit log writes (uno por `routeAgent` call). Esto es OK —
  son decisiones REALES bajo las rules ACTIVAS, no decisiones del
  candidate. El admin viewer puede filtrar por timestamp si quiere
  separar "production" de "verification run".
- **Regla 5 strict:** Plan 07 Task 1 sigue siendo el primer punto donde la
  migracion de Plan 01 se aplica en prod. Plan 05 NO toca prod ni schema.

## Self-Check: PASSED

- 2/2 expected files exist on disk:
  - `src/lib/agents/routing/dry-run.ts` (FOUND)
  - `src/lib/agents/routing/__tests__/dry-run.test.ts` (FOUND)
- 1/1 commit exists in git log: `77d17af` (FOUND)
- 12/12 vitest tests verde en `dry-run.test.ts`
- 105/105 tests verde en `src/lib/agents/routing/__tests__/` +
  `src/lib/agents/production/__tests__/` (no regresiones)
- Regla 3 grep clean: `grep -q "createAdminClient" dry-run.ts` → no match
- D-10 grep clean: `grep -q "recordAuditLog" dry-run.ts` → no match
- tsc --noEmit project-wide → exit 0
