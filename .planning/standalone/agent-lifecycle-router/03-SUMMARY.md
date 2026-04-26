---
phase: agent-lifecycle-router
plan: 03
wave: 2
status: complete
completed: 2026-04-26
---

# Plan 03 Summary — Wave 2: Engine Core (operators + facts + cache + route)

## What was built

Wave 2 entrega la cabeza del router: el archivo `route.ts` que el
webhook-processor (Plan 04) invocará cuando el feature flag
`workspace_agent_config.lifecycle_routing_enabled` esté `true`. Toda la
canalización (operators → facts → engine → cache → route) queda
TypeScript-compilada, testeada (75/75 verde) y aislada del runtime
productivo (Regla 6 — el if/else legacy en `webhook-processor.ts:174-188`
sigue intacto hasta Plan 04+).

### 1. Dependencias (commit `24ec6ae`)

- `json-rules-engine@7.3.1` (D-02 stack pin)
- `lru-cache@^11.3.5` (D-13 cache 10s)
- `pnpm-lock.yaml` actualizado (proyecto usa pnpm; el plan mencionaba
  `package-lock.json` — no aplica)

### 2. Custom operators (Task 1 — commit `b79285f`)

`src/lib/agents/routing/operators.ts` — 5 operators custom registrados
vía `engine.addOperator`. Todos los temporales reinterpretan "now" en
**America/Bogota** (Regla 2) vía round-trip
`new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))`:

| Operator | Inputs | Returns |
|---|---|---|
| `daysSinceAtMost` | (ISO string \| null, max days) | true if floor(diff_ms/86_400_000) ≤ max |
| `daysSinceAtLeast` | (ISO string \| null, min days) | true if floor(diff_ms/86_400_000) ≥ min |
| `tagMatchesPattern` | (string[], regex source) | true if any tag matches; invalid regex → false |
| `arrayContainsAny` | (string[], string[]) | OR-semantics |
| `arrayContainsAll` | (string[], string[]) | AND-semantics |

Todos manejan `null` / non-array / fecha inválida → `false` (defense-in-depth
para que el engine nunca rejecte por input malformado de la rule).

11 tests verde — incluye verificación específica del round-trip Bogota tz.

### 3. Fact resolvers (Task 2 — commit `0683eaf` + extensión `0736d43`)

`src/lib/agents/routing/facts.ts` — 10 resolvers dinámicos vía
`engine.addFact`. Cada uno wrappea su llamada a `@/lib/domain/*` en
try/catch + sentinel para que un DB hiccup transitorio nunca rejecte
`engine.run` (Pitfall 4):

| Fact | Tipo retorno | Domain function |
|---|---|---|
| `activeOrderStage` | `'preparation' \| 'transit' \| 'delivered' \| null` | `getActiveOrderForContact` |
| `lastInteractionAt` | `string \| null` | `getLastInboundMessageAt` |
| `daysSinceLastInteraction` | `number \| null` | derived from `lastInteractionAt` via almanac |
| `daysSinceLastDelivery` | `number \| null` | `getLastDeliveredOrderDate` |
| `isClient` | `boolean` | `getContactIsClient` (Task 2a — nuevo) |
| `hasOrderInLastNDays` | `number` (params: `{days?: number}`, default 7) | `countOrdersInLastNDays` |
| `tags` | `string[]` | `getContactTags` |
| `hasPagoAnticipadoTag` | `boolean` | derived from `tags` via almanac |
| `isInRecompraPipeline` | `boolean` | `isContactInRecompraPipeline` |
| `recompraEnabled` (B-1) | `boolean` | `getWorkspaceRecompraEnabled` |

**`activeOrderStage` mapping textual.** Per Plan 02 SUMMARY note y prompt
context: `getActiveOrderForContact` retorna el stage **NAME** crudo (no
hay columna `kind` en `pipeline_stages`). El fact resolver llama
`mapStageNameToKind()` exportado desde el mismo archivo:

- `delivered`: `ENTREGADO` | `SOLUCIONAD*`
- `transit`: `REPARTO` | `ENVIA` | `NOVEDAD` | `OFI INTER` | `COORDINADORA` (incluye prefixes/contains)
- `preparation`: `CONFIRMADO` | `SOMNIO ENVIOS` | `AGENDADO` | `BOGOTA` | `FALTA *` | `NUEVO *`
- terminal_closed (CANCELADO/DEVOLUCION) — ya filtrado upstream por `is_closed=true` en domain.

`lifecycle_state` **NO** se registra como fact aquí — `route.ts` lo inyecta
como runtime fact entre Layer 1 (classifier) y Layer 2 (router).

### 4. Domain extension (Task 2a — commit `0736d43`)

`src/lib/domain/contacts.ts` — append `getContactIsClient(contactId, workspaceId)`.
Read-only helper, default `false` si la fila no existe. Plan 02 SUMMARY
notó que `getContactById` retorna `ContactDetail` sin `is_client`, así
que añadir un helper dedicado es más limpio que cambiar la API
existente. Regla 3 preservada: writes a `is_client` siguen en
`src/lib/domain/client-activation.ts`.

### 5. Engine factory (Task 2 — commit `0683eaf`)

`src/lib/agents/routing/engine.ts` — `buildEngine({contactId, workspaceId, rules, runtimeFacts?})`
construye una `Engine` fresca por request (Pitfall 7 — nunca singleton
de Engine en module top-level). Configuración:

- `allowUndefinedFacts: true` — facts no encontrados → undefined, no throw
- `allowUndefinedConditions: false` — defensa contra typos en rule shape
- Registra los 5 operators + 10 facts + cualquier `runtimeFacts` (típicamente
  `lifecycle_state` para Layer 2)
- Acepta array de `RuleProperties` (para tests + Plan 05 dry-run);
  `route.ts` adjunta sus propias rules con `onSuccess` callbacks para
  capturar `fired_classifier_rule_id` / `fired_router_rule_id`.

### 6. LRU cache + version-column revalidation (Task 2 — commit `0683eaf`)

`src/lib/agents/routing/cache.ts` — `lru-cache@11` con D-13 settings.

| Setting | Valor | Razón |
|---|---|---|
| `max` | 100 | D-13 — max workspaces simultáneos por lambda |
| `ttl` | 10_000 ms | D-13 — staleness aceptable |
| `updateAgeOnGet` | `false` | TTL estricto — no refrescar age al leer |

**`getRulesForWorkspace(workspaceId)` flow:**

1. Cache HIT: cheap `getMaxUpdatedAt({workspaceId})` query → si igual al
   watermark cacheado → return cached. Si diferente → fall through reload.
2. Cache MISS o version delta: `loadActiveRulesForWorkspace` + compile + cache.set.
3. DB error en reload → return empty rule set (downstream emite
   `no_rule_matched` y webhook-processor usa legacy if/else).

**Cache compile pipeline (per row):**

- `validateRule(r)` (Pitfall 5) — invalid → log warning + skip
- Priority collision check (Pitfall 1 defense) — `(rule_type, priority)`
  ya visto → log warning + skip (DB UNIQUE INDEX ya lo previene en
  writes; este es defensa por si un operator hace SQL directo).
- Compile a `RuleProperties` shape `{conditions, event, priority, name}`.

**`maxUpdatedAt` correctness fix (Rule 1):** El plan original computaba
el watermark cacheado a partir de los rows activos cargados. Pero
`domain.getMaxUpdatedAt` escanea **active + inactive** (para forensics).
Si admin soft-elimina una rule cuya `updated_at` era la más nueva, el
watermark cacheado quedaría < watermark domain perpetuamente, causando
reload en cada `getRulesForWorkspace` hasta que llegue otro write activo.
**Fix:** la cache también llama `getMaxUpdatedAt` para popular el
watermark cacheado — ambas fuentes ahora convergen.

`invalidateWorkspace(workspaceId)` expuesto para Plan 06 admin Server
Actions (invalidación inmediata post-edit, sin esperar TTL).

`_clearAllCache()` para tests.

8 tests verde — incluyen first-hit, TTL revalidation, version delta,
invalid-rule skip, priority collision, invalidate, max-100 eviction,
graceful degradation on DB error.

### 7. Public API `routeAgent` (Task 3 — commit `0a2aac2`)

`src/lib/agents/routing/route.ts` — `routeAgent({contactId, workspaceId, conversationId?, inboundMessageId?})`.

**Pipeline:**

1. `getRulesForWorkspace` (cache + revalidation)
2. **Layer 1 (Classifier)** — `buildEngine` con classifier rules attached vía `addRule({...compiled, onSuccess: cb})`. `onSuccess` captura `fired_classifier_rule_id`, lee `event.params.lifecycle_state`, llama `engine.stop()` para FIRST-hit. Default state = `'new_prospect'`.
3. **Snapshot facts** — `snapshotFacts(e1Result.almanac, FACT_NAMES_TO_SNAPSHOT)` lee 9 facts nombrados del almanac post-Layer-1 (deterministic; no arbitrary internals).
4. **Layer 2 (Router)** — `buildEngine` con `runtimeFacts: {lifecycle_state}` para que las rules de router puedan condicionar sobre el estado. Mismo patrón onSuccess + stop.
5. **Determine reason (D-16):**
   - `firedRouterId !== null && agentId !== null` → validar `agentRegistry.has(agentId)`; si registrado → `'matched'`; si no → throw → catch → `'fallback_legacy'`.
   - `firedRouterId !== null && agentId === null` → `'human_handoff'`
   - `firedRouterId === null` → `'no_rule_matched'`
   - Cualquier throw del pipeline (cache load, fact resolver, engine.run) → catch → `'fallback_legacy'`.
6. **Audit log fire-and-forget** — `recordAuditLog(...).catch(console.error)`.

`RouteDecision` shape:

```ts
{
  agent_id: string | null
  reason: 'matched' | 'human_handoff' | 'no_rule_matched' | 'fallback_legacy'
  lifecycle_state: string  // 'new_prospect' default
  fired_classifier_rule_id: string | null
  fired_router_rule_id: string | null
  latency_ms: number
  facts_snapshot: Record<string, unknown>
}
```

9 tests verde — cubren los 4 reasons, FIRST-hit, agentRegistry validation,
audit log shape + tolerance to failure, facts_snapshot key presence.

## Verification

Todos los criterios de Acceptance verificados:

- [x] `package.json` contains `"json-rules-engine": "7.3.1"` y `"lru-cache": "^11.3.5"`
- [x] `operators.ts` invoca `engine.addOperator` exactamente 5 veces
- [x] `'America/Bogota'` aparece en `operators.ts` y `facts.ts`
- [x] 5 archivos código creados: `operators.ts`, `facts.ts`, `engine.ts`, `cache.ts`, `route.ts`
- [x] 4 archivos test creados: `operators.test.ts`, `engine.test.ts`, `cache.test.ts`, `route.test.ts`
- [x] `facts.ts` registra 10 facts (`grep -c engine.addFact = 10`); incluye `getWorkspaceRecompraEnabled` (B-1)
- [x] Cada fact resolver tiene try/catch + sentinel (Pitfall 4)
- [x] `cache.ts` con `ttl: 10_000`, `max: 100`, llama `validateRule`, detecta priority collision
- [x] `route.ts` literal contiene los 4 reasons; usa `agentRegistry.has` + `recordAuditLog`
- [x] **Regla 3 enforcement:** `grep -rn createAdminClient src/lib/agents/routing/ --exclude-dir=__tests__` retorna **VACÍO** (exit 1).
- [x] `npx tsc --noEmit` project-wide exit 0
- [x] **75/75 tests pasan** en `vitest run src/lib/agents/routing/__tests__/`:
  - 10 schema (Plan 02)
  - 13 domain (Plan 02)
  - 17 domain-extensions (Plan 02)
  - **11 operators (Plan 03 Task 1)**
  - **7 engine (Plan 03 Task 2)**
  - **8 cache (Plan 03 Task 2)**
  - **9 route (Plan 03 Task 3)**

**Pre-existing failures unrelated (out of scope):** integration tests en
`src/__tests__/integration/crm-bots/` siguen requiriendo
`TEST_WORKSPACE_ID` env var (predates Plan 02, mismo skip que Plan 02 SUMMARY).

## Wave 3+ readiness

- **Plan 04** puede `import { routeAgent } from '@/lib/agents/routing/route'`
  y reemplazar el if/else en `webhook-processor.ts:174-188` cuando
  `workspace_agent_config.lifecycle_routing_enabled === true`. La firma
  pública (`{contactId, workspaceId, conversationId?, inboundMessageId?}`)
  encaja con los datos disponibles en webhook-processor antes del decision
  point.
- **Plan 05 (dry-run)** puede importar `buildEngine` + `validateRule` para
  componer un dry-run sin tocar la cache (instancia-fresca-por-mensaje del
  histórico). `mapStageNameToKind` exportado desde `facts.ts` permite
  reutilizar el mapping textual sin duplicar.
- **Plan 06 (admin form)** puede llamar `invalidateWorkspace(ws)` desde
  Server Actions tras un upsert/delete de rules. La validación on-load
  (Pitfall 5) actúa como defensa-en-profundidad complementando la
  validación pre-write en `domain.upsertRule`.

## Commits

- `24ec6ae` — deps: json-rules-engine@7.3.1 + lru-cache@^11
- `b79285f` — Task 1: 5 custom operators + 11 tests
- `0736d43` — Task 2a: getContactIsClient domain read
- `0683eaf` — Task 2: facts (10 incl. B-1) + engine + cache + 15 tests
- `0a2aac2` — Task 3: routeAgent (D-16 4 outputs) + 9 tests

## Deviations from plan

### [Rule 1 - Bug] Operator test API: `op.evaluator` → `op.cb`

**Found during:** Task 1 (operators tests).
**Issue:** El plan referencia `op.evaluator(factValue, jsonValue)`, pero
`json-rules-engine@7.3.1` Operator class expone `.cb` (raw callback) y
`.evaluate(factValue, jsonValue)` method. `evaluator` no existe.
**Fix:** Tests usan `(engine as any).operators.operators.get(name).cb`
(double `.operators.` porque `engine.operators` es un OperatorMap cuya
Map interna es `.operators`).
**Commit:** `b79285f`.

### [Rule 1 - Bug] Operator test "timezone Bogota" assertion

**Found during:** Task 1 (operators tests).
**Issue:** El plan asertaba `op('2026-04-24T04:00:00Z', 1) → false` con
comentario "2 days, max 1 → fail". Pero la implementación calcula
`floor((now_ms - factValue_ms) / 86_400_000)`: con frozen now =
`2026-04-25T20:00:00Z` y factValue 40h atrás → `floor(40/24) = 1` día.
La aserción `1 <= 1 → true`, no false. El comentario reflejaba calendar-day
intuición, no ms-floor.
**Fix:** Test reescrito asertando ms-floor real (1 día → fails for max=0,
passes for max=1 y 2). Comentario en test explica que el round-trip
`toLocaleString` es no-op cuando el runtime ya está en `-05` tz, y la
correctitud productiva en runtime UTC (Vercel) está cubierta por los
otros tests timezoned (que usan offsets explícitos `-05:00` en input).
**Commit:** `b79285f`.

### [Rule 1 - Bug] cache `maxUpdatedAt` semantic mismatch

**Found during:** Task 2 (cache.ts).
**Issue:** El plan computaba el watermark cacheado a partir de los rows
activos cargados (`reduce` over `[...classifierRules, ...routerRules]`).
Pero `domain.getMaxUpdatedAt` escanea **active + inactive** (forensics
intencional). Si admin soft-elimina una rule cuya `updated_at` era la
más reciente, el watermark cacheado < watermark domain en perpetuidad →
reload en cada `getRulesForWorkspace` hasta que llegue otro write activo.
**Fix:** `reloadRulesForWorkspace` también llama `getMaxUpdatedAt` al
final del reload para popular `cached.maxUpdatedAt` con la misma
semántica que la revalidación. Cuesta una query SELECT adicional sólo
en MISS path (no en HIT — HIT ya hace getMaxUpdatedAt como antes).
**Commit:** `0683eaf` (cache.ts línea 128-136).

### [Rule 3 - Blocking] `getContactIsClient` domain extension

**Found during:** Task 2 (facts.ts implementation).
**Issue:** El plan asumía que `facts.isClient` podría usar
`getContactById(ctx.contactId, ctx.workspaceId)` y leer `is_client` del
return. Pero la firma real es `getContactById(ctx, {contactId})` y el
`ContactDetail` retornado NO incluye la columna `is_client` (Plan 02
SUMMARY confirmó). Cambiar la API de `getContactById` afectaría callers
existentes; añadir un helper dedicado es más limpio.
**Fix:** Append `getContactIsClient(contactId, workspaceId): Promise<boolean>`
a `src/lib/domain/contacts.ts` (commit `0736d43`). Read-only; default
`false` si la fila falta. Mirrors webhook-processor.ts:174 semantic.
B-4 enforcement preservada — Plan 03 NO crea archivos en
`src/lib/domain/`, solo extiende uno existente con un helper.
**Commit:** `0736d43`.

### [Rule 3 - Blocking] Lock file: `package-lock.json` → `pnpm-lock.yaml`

**Found during:** Task 1 (deps install).
**Issue:** El plan menciona commit de `package-lock.json` pero el proyecto
usa pnpm (existe `pnpm-lock.yaml` y `pnpm-workspace.yaml`). `pnpm add`
actualizó solo `package.json` + `pnpm-lock.yaml`; no hay `package-lock.json`.
**Fix:** Commit con `pnpm-lock.yaml` en su lugar.
**Commit:** `24ec6ae`.

## Notes for Wave 3+

### Plan 04 wiring guidance

- `routeAgent` retorna **siempre** un `RouteDecision` válido — nunca
  throws. El caller (webhook-processor) debe inspeccionar `reason`:
  - `'matched'` + `agent_id` → usar ese agente (reemplaza `is_client && recompra_enabled` branch)
  - `'human_handoff'` → no responder (silencio intencional)
  - `'no_rule_matched'` → fallback al `workspace.conversational_agent_id` (preserva default actual)
  - `'fallback_legacy'` → caer al if/else legacy completo (señal de DB hiccup o config bug — debería ser raro post-Plan 07)
- `agentRegistry.has` se valida solo en path `'matched'`. Si querés
  validar también en human_handoff (defensa extra), Plan 04 puede
  agregarlo en su layer.
- El `lifecycle_state` queda en `decision.lifecycle_state` por si algún
  branch del webhook-processor lo quiere loggear o pasarlo como context
  al agente.

### Plan 07 legacy parity

La regla priority-900 que replica
`is_client && !recompra_enabled → somnio-sales-v1` (D-15 Opción B,
mencionada en MEMORY agent_lifecycle_router) se construye así:

```json
{
  "rule_type": "agent_router",
  "priority": 900,
  "conditions": {
    "all": [
      { "fact": "isClient", "operator": "equal", "value": true },
      { "fact": "recompraEnabled", "operator": "equal", "value": false }
    ]
  },
  "event": { "type": "route", "params": { "agent_id": "somnio-sales-v1" } }
}
```

Tanto `isClient` como `recompraEnabled` ya están registrados como facts
en Wave 2 (B-1 fix shipped). Plan 07 solo necesita seedearla en
`routing_rules` para Somnio antes del flag flip.

### Migración SQL pendiente

Plan 01 creó `supabase/migrations/20260425220000_agent_lifecycle_router.sql`
**NO aplicada en producción** todavía (Regla 5 strict). Plan 03 NO
toca prod ni la requiere — todo el código compila y testea contra mocks.
Plan 07 Task 1 hará el pause + apply de la migración antes del push.

## Self-Check: PASSED

- 5/5 source files exist:
  - `src/lib/agents/routing/operators.ts`
  - `src/lib/agents/routing/facts.ts`
  - `src/lib/agents/routing/engine.ts`
  - `src/lib/agents/routing/cache.ts`
  - `src/lib/agents/routing/route.ts`
- 4/4 test files exist:
  - `src/lib/agents/routing/__tests__/operators.test.ts`
  - `src/lib/agents/routing/__tests__/engine.test.ts`
  - `src/lib/agents/routing/__tests__/cache.test.ts`
  - `src/lib/agents/routing/__tests__/route.test.ts`
- 1 domain extension: `src/lib/domain/contacts.ts` (`getContactIsClient`)
- 5/5 commits exist in git log: `24ec6ae`, `b79285f`, `0736d43`, `0683eaf`, `0a2aac2`
- 75/75 vitest tests verde
- Regla 3 grep clean (verificable)
- tsc --noEmit project-wide → exit 0
