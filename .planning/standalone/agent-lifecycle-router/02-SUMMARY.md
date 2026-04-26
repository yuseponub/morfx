---
phase: agent-lifecycle-router
plan: 02
wave: 1
status: complete
completed: 2026-04-25
---

# Plan 02 Summary — Wave 1: Domain Layer + JSON Schema Validator

## What was built

Wave 1 entrega la base de I/O para el router. Single-source-of-truth (Regla 3)
para todas las mutaciones de las 3 tablas `routing_*` y todas las extensiones
read-only que Plan 03 fact resolvers van a importar (consolidadas aqui via
B-4 fix para evitar file conflict en wave paralela).

### 1. Ajv-compiled schema validator (Task 1)

- `src/lib/agents/routing/schema/validate.ts` (commit `08c5c3a`)
  - **Ajv2020** (no Ajv default) — el `rule-v1.schema.json` declara
    `$schema: "https://json-schema.org/draft/2020-12/schema"`. Default Ajv
    constructor solo conoce draft-07 y arroja `"no schema with key or ref
    ...draft/2020-12/schema"` al compilar. Misma version ajv@8.17 ya instalada,
    cero deps nuevas.
  - `validateRule(rule)` retorna `ValidationResult` (`{ ok: true }` o
    `{ ok: false; errors: string[] }`).
  - Compila al import (no lazy) — primera llamada hot.
  - Pitfall 2 mitigation: el schema rechaza `path` field via
    `additionalProperties:false` en `leafCondition` (CVE-2025-1302
    jsonpath-plus RCE surface) — verificado por test.

- `src/lib/agents/routing/__tests__/fixtures.ts` (commit `08c5c3a`)
  - Exportes reusables por Plans 03, 05, 06: `validClassifierRule`,
    `validRouterRule`, `validRouterRule_humanHandoff` (D-16 agent_id:null),
    `ruleWithPathField`, `ruleWithUnknownLifecycleState`,
    `ruleWithNestedAnyAll`, helper `makeRule(overrides)`.

- `src/lib/agents/routing/__tests__/schema.test.ts` (commit `08c5c3a`)
  - 10 tests verdes: 8 lifecycle states (D-03), 15 operators, schema_version
    pinning, priority bounds 1..100000, Pitfall 2 path-rejection, nested
    any/all, human handoff (agent_id:null).

### 2. Domain layer routing.ts — CRUD + audit + facts (Task 2)

- `src/lib/domain/routing.ts` (commit `92ca534`)
  - **8 exports** (todos los que Plans 03/06 necesitan):
    - `listRules`, `getRule`, `upsertRule`, `deleteRule` (CRUD; soft delete only)
    - `recordAuditLog` (4-reason enum D-16 con validacion app-layer pre-insert)
    - `listFactsCatalog` (read-only)
    - `loadActiveRulesForWorkspace` (active=true split por rule_type)
    - `getMaxUpdatedAt` (version-column para Plan 03 LRU revalidation, PGRST116→null)
  - `upsertRule` invoca `validateRule()` ANTES del DB call (Pitfall 2 + Pitfall 5).
    Reglas invalidas nunca llegan a Supabase. `workspace_id` se fuerza a
    `ctx.workspaceId` en el payload (multi-tenant safety, Regla 3).
  - `deleteRule` hace UPDATE active=false (NO `.delete()` real — Pitfall 5
    requiere historial para audit/forensics).
  - `recordAuditLog` valida `reason` contra `VALID_REASONS` Set antes del
    insert (defense-in-depth vs DB CHECK constraint).
  - **DomainContext local** al modulo: solo requiere `workspaceId` (la wider
    DomainContext en `types.ts` requiere `source` para audit, pero los writes
    de routing carrean su propia metadata en `RoutingAuditEntry`).

- `src/lib/agents/routing/__tests__/domain.test.ts` (commit `92ca534`)
  - 13 tests verdes: rechazo Pitfall 2 sin tocar DB, multi-tenant filter,
    soft delete UPDATE, 4 reasons (it.each), invalid-reason short-circuit,
    facts catalog query shape, getMaxUpdatedAt happy + PGRST116, classifier/
    router split.

### 3. Domain extensions — orders, tags, messages, workspace-agent-config (Task 3)

- `src/lib/domain/orders.ts` (APPEND — commit `b09cd5d`):
  - `getActiveOrderForContact(contactId, ws)` → `{ id, stage_kind, created_at } | null`
    Joins `pipeline_stages!inner(name, is_closed)`; archived_at IS NULL;
    devuelve null cuando el ultimo pedido esta en stage terminal-closed.
    `stage_kind` carga el **NAME** crudo (ej. "REPARTO") — Plan 03 facts.ts
    hace el mapping textual a kind canonico (`preparation`/`transit`/
    `delivered`) per Plan 01 SNAPSHOT.md.
  - `getLastDeliveredOrderDate(contactId, ws)` → ISO | null
    `ILIKE %entregad%` en `pipeline_stages.name` (snapshot identifico
    "ENTREGADO" como label delivered).
  - `countOrdersInLastNDays(contactId, ws, days)` → number
    `head:true` count + `gte('created_at', NOW - days*86_400_000)`.
  - `isContactInRecompraPipeline(contactId, ws)` → boolean
    Join `pipelines!inner(name)` filtrado a `RECOMPRA_PIPELINE_NAME`
    constant ('Ventas Somnio Standard'); count > 0.

- `src/lib/domain/tags.ts` (APPEND — commit `b09cd5d`):
  - `getContactTags(contactId, ws)` → `string[]` — nombres de tags; nunca
    arroja (fact resolvers Plan 03 dependen de reads estables, Pitfall 4).
  - `listAllTags({ workspaceId })` → `DomainResult<{ name, color }[]>` —
    para Plan 06 admin form TagPicker.

- `src/lib/domain/messages.ts` (APPEND — commit `b09cd5d`):
  - `getLastInboundMessageAt(contactId, ws)` → ISO | null
  - `getInboundConversationsLastNDays(ws, daysBack, limit=500)` → dedup
    `[{ conversation_id, contact_id, inbound_message_at }]` para Plan 05
    dry-run replay.

- `src/lib/domain/workspace-agent-config.ts` (NEW — B-1 fix — commit `b09cd5d`):
  - `getWorkspaceRecompraEnabled(workspaceId)` → boolean. Lee
    `workspace_agent_config.recompra_enabled`. Default **true** si no hay
    config (matches webhook-processor.ts:172 fallback `?? true`).
  - Read-only. Writes siguen en `src/lib/agents/production/agent-config.ts`
    (Regla 6 — proteger agente productivo: ese path sigue siendo SoT hasta
    que `lifecycle_routing_enabled` flippee ON per-workspace en Plan 07).

- `src/lib/agents/routing/__tests__/domain-extensions.test.ts` (commit `b09cd5d`):
  - 17 tests verdes cubriendo happy path + null/empty + workspace_id filter
    shape de los 9 functions nuevos.

## Verification

Todos los criterios de aceptacion en `<verification>` y
`<acceptance_criteria>` del PLAN → pass:

- ✅ 5 archivos creados (validate.ts, fixtures.ts, schema.test.ts,
  domain.test.ts, routing.ts) + 4 archivos extendidos/creados
  (orders.ts, tags.ts, messages.ts, workspace-agent-config.ts) + 1 test
  adicional (domain-extensions.test.ts)
- ✅ TypeScript compila sin errores: `npx tsc --noEmit` exit 0 project-wide
- ✅ **40/40 tests verdes** (10 schema + 13 domain + 17 extensions)
- ✅ Pitfall 2 mitigation verificada: rule con `path` rechazada por Ajv
  (test "rejects rule with path field in leaf condition")
- ✅ **Regla 3 enforcement**: `grep -rn "createAdminClient"
  src/lib/agents/routing/ --exclude-dir=__tests__` → **VACIO** (zero leaks).
  Solo 1 archivo en `src/lib/agents/routing/` importa supabase/admin
  indirecto via mock en tests.
- ✅ B-1 fix shipped: `getWorkspaceRecompraEnabled` con fallback `true`
  preservando comportamiento legacy
- ✅ B-4 fix shipped: todas las extensiones que Plan 03 necesita estan en
  Plan 02 (Plan 03 frontmatter `files_modified` ya NO incluye
  orders/tags/messages/workspace-agent-config — solo importa)

**Pre-existing failures unrelated (out of scope):** 4 integration tests en
`src/__tests__/integration/crm-bots/` requieren `TEST_WORKSPACE_ID` y
`TEST_API_KEY` env vars (commit `b8f9185868`, 2026-04-18 — predates Plan 02).

## Wave 2 readiness

- ✅ Plan 03 `cache.ts` puede importar `loadActiveRulesForWorkspace`,
  `getMaxUpdatedAt` desde `@/lib/domain/routing`.
- ✅ Plan 03 `cache.ts` puede importar `validateRule` desde
  `@/lib/agents/routing/schema/validate` para on-load validation (Pitfall 5).
- ✅ Plan 03 `route.ts` puede importar `recordAuditLog` para fire-and-forget
  audit logging.
- ✅ Plan 03 `facts.ts` puede importar:
  - `getActiveOrderForContact`, `getLastDeliveredOrderDate`,
    `countOrdersInLastNDays`, `isContactInRecompraPipeline` desde
    `@/lib/domain/orders`
  - `getContactTags` desde `@/lib/domain/tags`
  - `getLastInboundMessageAt` desde `@/lib/domain/messages`
  - `getWorkspaceRecompraEnabled` desde `@/lib/domain/workspace-agent-config`
- ✅ Plan 05 dry-run puede importar `getInboundConversationsLastNDays` desde
  `@/lib/domain/messages`.
- ✅ Plan 06 admin form puede usar `upsertRule`, `listRules`, `deleteRule`,
  `listFactsCatalog`, `listAllTags` via Server Actions sin tocar Supabase
  directo.
- ✅ Tests fixtures reusables por Plans 03, 05, 06 (`validClassifierRule`,
  `validRouterRule`, `makeRule`, etc.).

## Commits

- `08c5c3a` — Task 1 — Ajv validator + fixtures + schema tests
- `92ca534` — Task 2 — domain.routing CRUD + recordAuditLog + tests
- `b09cd5d` — Task 3 — domain extensions (orders/tags/messages/workspace-agent-config) + tests

## Deviations from plan

Tracked inline in commit messages. None bypassed user intent — all are
Rule 1 / Rule 3 fixes for schema reality vs plan assumptions:

1. **[Rule 1 - Bug] Ajv → Ajv2020** — Plan asumia `import Ajv from 'ajv'`
   pero el schema usa Draft 2020-12. Switch a `import Ajv2020 from
   'ajv/dist/2020.js'` es el patron oficial (mismo paquete `ajv@8.17`,
   cero deps nuevas). Sin este fix, el modulo arrojaba al cargar.

2. **[Rule 1 - Bug] Skip deps install commit** — el plan sugeria un commit
   separado para `npm install ajv-formats`, pero ambos `ajv@^8.17` y
   `ajv-formats@^3.0.1` ya estan instalados (`grep package.json`). No
   hay deps nuevas — saltado.

3. **[Rule 1 - Bug] `stage_kind` retorna stage NAME, no kind canonico** —
   `pipeline_stages` schema NO tiene columna `kind` (verified
   `20260129000003_orders_foundation.sql`). El plan incluyo nota
   "ajustar si schema no coincide, mantener contrato de retorno". Plan 01
   SNAPSHOT.md linea 71-72 confirma "Plan 03 hace la traducción de nombres
   a kinds" — asi que el contracto de Plan 02 es: devolver el name crudo
   en el field nombrado `stage_kind`. Plan 03 facts.ts hace el mapping
   textual (CONFIRMADO/SOMNIO ENVIOS/AGENDADO/BOGOTA/etc → preparation,
   REPARTO/ENVIA/NOVEDAD/OFI INTER/COORDINADORA → transit, ENTREGADO/
   SOLUCIONADA → delivered, CANCELADO/DEVOLUCION/CANCELA → terminal_closed).
   El `is_closed` join filter ya filtra `terminal_closed` desde Plan 02
   antes de que Plan 03 vea la fila.

4. **[Rule 1 - Bug] `tsc` cast en `getContactTags`** — supabase-js types el
   embed `tags!inner(...)` como array union; iterar directamente fallaba
   tsc strict. Cast a `any[]` solo dentro de `getContactTags` para iterar;
   el tipo de retorno publico (`string[]`) sigue siendo strict.

5. **[Rule 1 - Bug] `upsertRule` Omit incluye audit metadata** — el plan
   declaraba Omit<RoutingRule, 'id' | 'created_at' | 'updated_at'>, pero
   las fixtures (`validClassifierRule`, etc.) tambien omiten
   `created_by_user_id` / `created_by_agent_id` (esos los setea la API
   layer en Plan 06 desde el auth context). Ampliado el Omit para que
   las fixtures + futuras Server Actions compilen sin friccion.

## Notes for Wave 2+

- **Plan 03 `activeOrderStage` resolver** debe hacer un `switch` textual
  sobre el `stage_kind` (raw name) que devuelve `getActiveOrderForContact`.
  Mapping observado en Plan 01 snapshot:
  - `preparation`: `CONFIRMADO`, `SOMNIO ENVIOS`, `AGENDADO`, `BOGOTA`,
    `FALTA *`, `NUEVO *`
  - `transit`: `REPARTO`, `ENVIA`, `NOVEDAD`, `OFI INTER`, `COORDINADORA`
  - `delivered`: `ENTREGADO`, `SOLUCIONADA`
  - `terminal_closed`: `CANCELADO`, `DEVOLUCION`, `CANCELA` (ya filtrados
    por `is_closed=true` en `getActiveOrderForContact`).

- **`getLastDeliveredOrderDate` solo matchea ENTREGADO** (no SOLUCIONADA)
  via `ILIKE %entregad%`. Si Plan 03 facts requiere SOLUCIONADA tambien,
  considerar ampliar el filtro a `OR ilike(name, '%solucionad%')` — pero
  por ahora ENTREGADO domina (350 vs 4 en snapshot, ratio ~98:1).

- **Recompra pipeline name = 'Ventas Somnio Standard'** (constante
  `RECOMPRA_PIPELINE_NAME` ya importada de `@/lib/orders/constants`). Es
  el sales pipeline donde aterrizan los recompras — no hay un pipeline
  llamado "RECOMPRA" en produccion (snapshot no lo lista). Plan 07 puede
  necesitar ajustar esta semantica si el usuario clarifica.

- **Migracion sigue NO aplicada** en prod (Regla 5). Plan 07 Task 1
  pausa para pedir al usuario que aplique
  `supabase/migrations/20260425220000_agent_lifecycle_router.sql` antes
  del push.

## Self-Check: PASSED

- 7/7 expected files exist on disk:
  - `src/lib/agents/routing/schema/validate.ts`
  - `src/lib/agents/routing/__tests__/fixtures.ts`
  - `src/lib/agents/routing/__tests__/schema.test.ts`
  - `src/lib/agents/routing/__tests__/domain.test.ts`
  - `src/lib/agents/routing/__tests__/domain-extensions.test.ts`
  - `src/lib/domain/routing.ts`
  - `src/lib/domain/workspace-agent-config.ts`
- 3/3 commits exist in git log: `08c5c3a`, `92ca534`, `b09cd5d`
