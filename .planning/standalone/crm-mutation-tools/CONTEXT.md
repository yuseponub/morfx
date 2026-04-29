# Standalone: CRM Mutation Tools - Context

**Gathered:** 2026-04-29
**Status:** Ready for research + planning
**Origin:** Refactor de cómo agentes conversacionales mutan CRM (crear / actualizar / mover stage / archivar / cerrar pedidos, contactos, notas, tareas). Hoy `somnio-sales-v3-pw-confirmation` y futuros agentes usan `crm-writer` (two-step propose+confirm + tabla `crm_bot_actions` + Inngest expire cron). Reemplazar por tools deterministas embebidas que llaman directo a domain layer — patrón espejo de `crm-query-tools` (shipped 2026-04-29), pero para mutaciones.

<domain>
## Phase Boundary

Construir un módulo compartido `src/lib/agents/shared/crm-mutation-tools/` con **15 mutation tools deterministas** (sin LLM intermedio, sin propose+confirm two-step) que cualquier agente conversacional pueda registrar para mutar CRM directamente desde domain layer:

**Contactos (3):**
1. `createContact(input)` — crea contacto en workspace
2. `updateContact({ contactId, ... })` — update parcial
3. `archiveContact(contactId)` — soft-delete via `archived_at`

**Pedidos (5):**
4. `createOrder(input)` — crea pedido + items + shipping
5. `updateOrder({ orderId, ... })` — update parcial (no items en V1, deferido)
6. `moveOrderToStage({ orderId, stageId })` — CAS-protected (D-06 stage_changed_concurrently propaga verbatim)
7. `archiveOrder(orderId)` — soft-delete via `archived_at`
8. `closeOrder(orderId)` — toggle `closed_at`

**Notas (4):**
9. `addContactNote({ contactId, body })`
10. `addOrderNote({ orderId, body })`
11. `archiveContactNote(noteId)`
12. `archiveOrderNote(noteId)`

**Tareas (3):**
13. `createTask(input)` — crea task asignada a usuario o contacto
14. `updateTask({ taskId, ... })`
15. `completeTask(taskId)` — toggle `completed_at`

Las tools leen domain layer directo (cero `createAdminClient` en el módulo). Idempotencia opcional via `idempotencyKey?: string` en operaciones de creación (storage en tabla nueva `crm_mutation_idempotency_keys`). Migración DB + módulo + tests Playwright E2E entregados juntos.

**Fuera de scope (deferred a standalones follow-up):**
- Migrar `somnio-sales-v3-pw-confirmation` de `crm-writer` a usar `crm-mutation-tools` → standalone follow-up `crm-mutation-tools-pw-confirmation-integration`.
- Migrar otros agentes existentes que usen `crm-writer` (sandbox, etc.) → standalones follow-up por agente.
- Borrar `src/lib/agents/crm-writer/` o cambiar el sandbox UI — coexisten (D-01).
- Update items de un pedido (`updateOrder.products`) — V1 no incluye, deferido a V1.1 si un agente lo requiere.
- DELETE real (DROP / DELETE FROM) — solo soft-delete via `archived_at` / `closed_at` / `completed_at`.
- Mutaciones de recursos base (tags, pipelines, stages, templates, usuarios) — fuera de scope total. Operador crea manualmente desde UI.
- Tools para agentes que aún no existen.

</domain>

<decisions>
## Implementation Decisions

### Pre-discussion (locked antes de discuss-phase)

- **D-pre-01:** Patrón espejo de `crm-query-tools`. Mismo factory shape (`createCrmMutationTools(ctx)`), misma estructura de archivos (`src/lib/agents/shared/crm-mutation-tools/{index,types,contacts,orders,notes,tasks,helpers}.ts` + `__tests__/`), misma observability emit pattern, misma PII redaction.
- **D-pre-02:** Regla 3 absoluta. Cero `createAdminClient` o `@supabase/supabase-js` imports en el módulo. Toda mutación pasa por `@/lib/domain/*`. Verifiable via `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/` retornando 0 matches reales (solo doc-comments).
- **D-pre-03:** Workspace isolation absoluta. `ctx.workspaceId` viene del execution context del agente (header `x-workspace-id`, session_state, o adapter). NUNCA del input/body de la tool. Domain filtra por `workspace_id` en cada query.
- **D-pre-04:** NUNCA DELETE real. Toda eliminación es soft-delete via campos `archived_at` / `closed_at` / `completed_at` — espejo de la regla del crm-writer (Phase 44 lesson).
- **D-pre-05:** Mutaciones de recursos base fuera de scope absoluto. Si una tool requiere referenciar tag/pipeline/stage/template/user inexistente, retorna `{ status: 'resource_not_found', error: { code, message } }` y el agente avisa al operador (no auto-crea).
- **D-pre-06:** Branching strategy `none` (work directly on main, mismo que crm-query-tools). Push después de cada plan vía `git push origin main`.

### Coexistencia con crm-writer (de discuss-phase)

- **D-01:** `crm-writer` (two-step propose+confirm) sigue VIVO sin cambios. `crm-mutation-tools` es una alternativa NUEVA, no reemplazo. Agentes existentes (Somnio sales-v3 PW Confirmation, sandbox UI, futuros que usen sandbox) siguen consumiendo crm-writer. Agentes nuevos eligen mutation-tools por defecto. CLAUDE.md documenta cuándo usar cada uno: **mutation-tools** = in-loop tool calls deterministas, baja latencia; **crm-writer** = sandbox UI con preview operador, audit trail en `crm_bot_actions`, two-step idempotencia. Migración de agentes existentes vive en standalones follow-up dedicados (e.g. `crm-mutation-tools-pw-confirmation-integration`), NO en este standalone.

### Scope subset (de discuss-phase)

- **D-02:** **Full suite — 15 tools en este standalone:** contacts(3) + orders(5) + notes(4) + tasks(3). Lista cerrada para este standalone. Tools adicionales (`updateContactTags`, `bulkArchiveOrders`, `mergeContacts`, etc.) son scope creep — backlog.

### Idempotencia (de discuss-phase)

- **D-03:** Operaciones de creación (`createContact`, `createOrder`, `createTask`, `addContactNote`, `addOrderNote`) aceptan `idempotencyKey?: string` opcional en input. Storage en **tabla nueva** `crm_mutation_idempotency_keys (workspace_id UUID, tool_name TEXT, key TEXT, result_id UUID, result_payload JSONB, created_at TIMESTAMPTZ, PRIMARY KEY (workspace_id, tool_name, key))`. Segundo call con misma key (mismo workspace + mismo tool) retorna `{ status: 'duplicate', data: <re-hidratada del result_payload> }` sin volver a mutar. TTL 30 días via cron Inngest `crm-mutation-idempotency-cleanup` (research determina si cron nuevo o sumar a uno existente). Operaciones de update/move/archive/close son idempotentes por naturaleza (mismo input → mismo state) y NO requieren key.

### Authorization (de discuss-phase)

- **D-04:** Workspace membership via `ctx.workspaceId` — mismo gate que query-tools. El agente confía en que su ctx ya validó membership (header validated by middleware, session_state, etc.). Domain layer usa `createAdminClient` (bypass RLS) y filtra por `workspace_id` en cada query (Regla 3). Sin checks adicionales de admin/role para destructivas — los agentes son trusted by design para el subset de operaciones que registren. Si futuro standalone necesita admin gate (e.g. `archiveContact` solo si actor es admin), se agrega `ctx.actorRole?: 'admin' | 'member'` opcional en una iteración posterior, sin romper este standalone.

### Tests + rollout (de discuss-phase)

- **D-05:** Cobertura **máxima** — Unit + Integration + E2E Playwright.
  - **Unit (~30-40 tests):** cada tool con mocked domain (happy + edge cases por status enum). Cubre validation_error, resource_not_found, stage_changed_concurrently propagation, duplicate idempotency hit, observability emit verified, workspace_id filtered.
  - **Integration (~6-10 tests env-gated):** seed datos en DB → llamar tool con ctx real → verificar mutation persistió + workspace isolation (cross-workspace leak check) + FK CASCADE behavior + idempotency replay + soft-delete (archived_at populated, no DELETE real).
  - **E2E (Playwright spec):** runner endpoint hardened (NODE_ENV+secret+env-workspace+tool-allowlist) dispara mutaciones, luego Playwright navega a `/crm/pedidos` (Kanban) y verifica que el pedido aparece en el stage correcto / desapareció al archivar (D-10). Round-trip mutation → DB → UI render.

### Audit trail (de discuss-phase)

- **D-06:** Audit en `agent_observability_events` — mismo destination que query-tools (NO tabla nueva, NO duplicar a `crm_bot_actions`). Cada mutación emite 3 eventos `pipeline_decision:*`:
  - `crm_mutation_invoked` (inicio): `{ toolName, workspaceId, actorAgentId, inputRedacted }` (PII redaction: phone last-4, email hash, body truncated to 200 chars).
  - `crm_mutation_completed` (success): `{ toolName, workspaceId, actorAgentId, latencyMs, resultStatus, resultId? }`.
  - `crm_mutation_failed` (error): `{ toolName, workspaceId, actorAgentId, latencyMs, errorCode }`.

  Forensics via query SQL contra `agent_observability_events`. Si en futuro se necesita unificar historia con crm-writer (sandbox UI mostrando ambos), se construye view DB que UNION de las 2 tablas — NO se duplica escritura.

### Status enum (de discuss-phase)

- **D-07:** Discriminated union espejo de `crm-query-tools` (D-07 de aquel standalone). Cada tool retorna `MutationResult<T>`:

  ```typescript
  type MutationResult<T> =
    | { status: 'executed', data: T }
    | { status: 'resource_not_found', error: { code: string, message?: string, missing: { resource: 'contact'|'order'|'tag'|'pipeline'|'stage'|'note'|'task'|'user', id: string } } }
    | { status: 'stage_changed_concurrently', error: { code: 'stage_changed_concurrently', expectedStageId: string, actualStageId: string } }
    | { status: 'validation_error', error: { code: string, message: string, field?: string } }
    | { status: 'duplicate', data: T }     // idempotency hit — re-hidrata data del idempotency_keys row
    | { status: 'workspace_mismatch', error: { code: 'workspace_mismatch' } }  // intento cross-workspace
    | { status: 'error', error: { code: string, message?: string } }            // fallos no anticipados (DB down, etc.)
  ```

  NUNCA throw para casos esperados (mismo principio que query-tools — D-07). Throw solo para fallos infraestructurales que el agente no puede manejar (e.g. `createAdminClient` no se puede inicializar — pero eso ocurriría antes de llegar a la tool). Error contract `stage_changed_concurrently` se propaga verbatim del domain layer (Standalone `crm-stage-integrity` D-06 contract).

### Rollout safety (de discuss-phase)

- **D-08:** **Sin feature flag** — el módulo es nuevo y NO tiene consumidores en producción al momento de ship (los agentes existentes siguen usando crm-writer hasta que sus standalones de migración corran). Cero riesgo de regression en agentes activos. El primer agente que adopte mutation-tools va en su propio standalone follow-up con su propio rollout (feature flag o ramp-up gradual decidido en ese standalone). Verificable: `grep -rE "createCrmMutationTools|crm-mutation-tools" src/` debe retornar cero matches en `src/lib/agents/{somnio-*,crm-writer,crm-reader,sandbox,...}/` post-ship — solo en el módulo mismo y sus tests.

### Output shape (de discuss-phase)

- **D-09:** En `status='executed'`, las tools retornan **entity completa re-hidratada** desde domain layer post-mutación. `createOrder` retorna `OrderDetail` completo con items + shipping + stage poblados. `updateContact` retorna `ContactDetail` completo. `moveOrderToStage` retorna `OrderDetail` con el nuevo stage poblado. `archiveOrder` retorna `OrderDetail` con `archivedAt: <timestamp>`. Costo: 1 RTT extra por mutación (mutate + read) — total ~100-300ms. Beneficio: agente recibe el state fresh sin segunda call, evita race conditions ("re-leí pero otra fuente cambió entre tanto").

  **Reuso de tipos:** mismas interfaces `ContactDetail` (extendida en Plan 02 de query-tools con `department`) y `OrderDetail` (extendida con `shippingAddress/City/Department`) del domain layer. NoteDetail / TaskDetail si no existen aún en el domain, se crean ahí (no en el módulo de tools). Cero duplicación de tipos.

### E2E scope (de discuss-phase)

- **D-10:** E2E Playwright dispara mutaciones via runner endpoint hardened (NODE_ENV gate + `x-test-secret` header + workspace from `TEST_WORKSPACE_ID` env + tool allow-list de las 15) y luego **navega a `/crm/pedidos` (Kanban) y verifica el render**:
  - `createOrder` → pedido aparece en el stage inicial configurado.
  - `moveOrderToStage` → pedido cambió de columna en Kanban.
  - `archiveOrder` → pedido desapareció del Kanban (filter `archivedAt IS NULL` en la UI).
  - `closeOrder` → indicador visual de cerrado en card.
  - `updateOrder` → cambios reflejados en el detail page (navegación a `/crm/pedidos/[id]`).

  Para mutations sin UI directa (notes, tasks), E2E usa una segunda query Supabase post-mutación para verificar persistencia + observability event emitido. Cubre el round-trip completo.

### Claude's Discretion

Áreas donde el usuario delegó al builder:
- Slug exacto de la ruta del runner endpoint (probable `/api/test/crm-mutation-tools/runner` espejando query-tools).
- Nombre exacto de la tabla DB (`crm_mutation_idempotency_keys` por default — research-phase confirma o sugiere alternativa).
- Estructura interna del módulo (un archivo por dominio: contacts/orders/notes/tasks vs. uno por tool).
- Naming exacto de eventos `pipeline_decision:crm_mutation_*` (sufijos finales).
- Nombre exacto del cron Inngest para idempotency cleanup (`crm-mutation-idempotency-cleanup` por default).
- Estrategia de testing del runner endpoint (mismo 4-gate hardening que query-tools, pero los nombres de env vars puede divergir si hay justificación — research determina).
- Nombre exacto del project skill (`crm-mutation-tools` por default, en `.claude/skills/`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### crm-query-tools (patrón a espejar — same standalone shipped 2026-04-29)
- `src/lib/agents/shared/crm-query-tools/index.ts` — factory pattern `createCrmQueryTools(ctx)` + spread de tools
- `src/lib/agents/shared/crm-query-tools/types.ts` — discriminated union shape `CrmQueryLookupResult` / `CrmQueryListResult` (mutation-tools usa `MutationResult<T>` análogo)
- `src/lib/agents/shared/crm-query-tools/contacts.ts` — patrón de tool con domain call + observability emit + PII redaction
- `src/lib/agents/shared/crm-query-tools/orders.ts` — 4 tools en un solo archivo (orders.ts) — patrón a replicar para mutaciones (`orders.ts` con 5 mutations en este standalone)
- `src/lib/agents/shared/crm-query-tools/helpers.ts` — observability emit wrapper + PII redaction helper (re-uso o extend)
- `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` — full handoff que sirve de template para el INTEGRATION-HANDOFF de mutation-tools

### crm-writer (patrón a evitar duplicar — coexiste D-01)
- `src/lib/agents/crm-writer/two-step.ts` — UNICO archivo del crm-writer que usa `createAdminClient` (against `crm_bot_actions`). NO espejar — mutation-tools va directo a domain.
- `src/lib/agents/crm-writer/tools/**` — patrón de existence pre-checks via domain (`getContactById`, `getOrderById`, etc.) — REUSAR estos pre-checks en mutation-tools antes de mutar.
- `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts` (Somnio sales-v3 PW Plan 10) — wrapper que el agente usa para invocar crm-writer. Mutation-tools elimina la necesidad de wrappers como este.
- `src/lib/agents/crm-writer/types.ts` — `ResourceNotFoundError.resource_type` union completa (`tag | pipeline | stage | template | user | contact | order | note | task`) — REUSAR en `MutationResult.resource_not_found.missing.resource`.

### Domain Layer (queries y mutations a reusar)
- `src/lib/domain/contacts.ts` — `createContact`, `updateContact`, `archiveContact`, `getContactById` contracts.
- `src/lib/domain/orders.ts` — `createOrder`, `updateOrder`, `moveOrderToStage` (CAS-protected), `archiveOrder`, `closeOrder`, `getOrderById`, `listOrders` contracts. Esp. `moveOrderToStage` con `stage_changed_concurrently` error contract (Standalone `crm-stage-integrity` D-06).
- `src/lib/domain/notes.ts` (o donde vivan) — `createContactNote`, `createOrderNote`, `archiveContactNote`, `archiveOrderNote`. Si no existen, research-phase ubica el archivo o sugiere creación nueva.
- `src/lib/domain/tasks.ts` (o donde vivan) — `createTask`, `updateTask` (con `completed_at` toggle).
- `src/lib/domain/crm-query-tools-config.ts` (Plan 02 query-tools) — referencia de cómo se estructura un domain file completo con CRUD + types.

### Migration patterns
- `supabase/migrations/20260429172905_crm_query_tools_config.sql` — patrón a espejar para `crm_mutation_idempotency_keys` table: IF NOT EXISTS, RLS policies (member SELECT, admin INSERT/DELETE — NO UPDATE porque idempotency rows son immutables), GRANTs service_role + authenticated, comments con D-XX references, Bogota timezone defaults.

### Observability
- `src/lib/agents/shared/crm-query-tools/helpers.ts` — emit pattern para `pipeline_decision:*` events. Mutation-tools reusa o extiende.
- Buscar emisor compartido (probable `src/lib/observability/` o helper en `src/lib/agents/observability.ts`) — research-phase confirma.

### Test infrastructure
- `e2e/fixtures/{auth,seed}.ts` (Plan 01 + 06 query-tools) — auth helper + seed/cleanup fixtures Playwright. Reuso directo.
- `playwright.config.ts` — config base ya existe.
- `src/__tests__/integration/crm-query-tools/{cross-workspace,config-driven,duplicates}.test.ts` — patrón de integration tests env-gated (`describe.skipIf`). Mutation-tools agrega análogos: `cross-workspace.test.ts`, `idempotency.test.ts`, `soft-delete.test.ts`, `stage-change-concurrent.test.ts`.
- `src/app/api/test/crm-query-tools/runner/route.ts` — patrón 4-gate hardened endpoint. Mutation-tools tiene endpoint análogo en `/api/test/crm-mutation-tools/runner/route.ts`.

### Scope rules y patrones del proyecto
- `CLAUDE.md` — Reglas 0 (GSD obligatorio), 1 (push Vercel), 2 (Bogota timezone), 3 (domain layer absoluto), 5 (migración antes de deploy), 6 (proteger agente prod). Sección "Module Scope: crm-query-tools" (espejo del que se agrega en Plan 07 de mutation-tools).
- `.claude/rules/agent-scope.md` — patrón "Module Scope" (la sección crm-query-tools agregada en Plan 07 de aquel standalone) — referencia para nueva sección "Module Scope: crm-mutation-tools".
- `.claude/skills/crm-query-tools.md` — project skill template a espejar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`createCrmQueryTools(ctx)` factory pattern** (en `crm-query-tools/index.ts`): mismo shape para `createCrmMutationTools(ctx)`. Spread `{ ...createCrmMutationTools(ctx) }` directamente en `tools: { ... }` del agente.
- **`MutationResult<T>` discriminated union** (D-07 espejo de query-tools): tipo nuevo en `crm-mutation-tools/types.ts`, no duplica con `CrmQueryLookupResult/ListResult`.
- **`ContactDetail` / `OrderDetail` interfaces** (extendidas en Plan 02 de query-tools): re-hidratación post-mutación retorna estos tipos directamente.
- **`createAdminClient()`** (en `src/lib/supabase/`): SOLO domain layer lo usa. Tools NUNCA lo invocan directo.
- **Domain functions de mutación**: `createContact`, `updateContact`, `archiveContact`, `createOrder`, `updateOrder`, `moveOrderToStage`, `archiveOrder`, `closeOrder` ya existen — research-phase verifica signatures y filtra por `workspace_id`.
- **Existence pre-check pattern** (de crm-writer tools): cada mutation tool empieza llamando `getXxxById` de domain para validar que el recurso existe en el workspace ANTES de mutar — retorna `resource_not_found` si no.
- **Phone normalization helper** (D-09 de query-tools, ubicado en `src/lib/whatsapp/phone-utils.ts` o similar): si `createContact` o `updateContact` aceptan phone como input, se normaliza a E.164 inside la tool. research-phase localiza ubicación exacta.
- **PII redaction helper** (Plan 04 de query-tools, en `helpers.ts`): redact phone last-4 + email hash + body truncate. Reuso o extend para mutations (donde el body es una nota completa).

### Established Patterns

- **Two-layer pattern (tools → domain)**: las tools en `src/lib/agents/*/tools/**` y `src/lib/agents/shared/*/` NUNCA tocan Supabase directo, siempre via `@/lib/domain/*`. Verificable via grep en CI.
- **Status discriminated union para retornos**: patrón consolidado en query-tools, crm-reader, crm-writer.
- **Workspace isolation via execution context**: `ctx.workspaceId` viene del agent invocation (header validated, session_state). Tools nunca aceptan workspaceId del input.
- **Atomic commits + push Vercel post-cambio** (Regla 1): cada plan del standalone termina con commit + push.
- **Migración antes de deploy** (Regla 5): plan de migración pausa para aplicación SQL manual antes de pushear código que la usa. Aplicará al plan que crea `crm_mutation_idempotency_keys`.
- **Pipeline_decision events para observability** (D-06 espejo): patrón consolidado en query-tools y agentes Somnio.
- **Soft-delete only** (D-pre-04): `archived_at` (contacts, orders, notes), `closed_at` (orders), `completed_at` (tasks). NUNCA DELETE FROM. Patrón heredado de crm-writer (Phase 44).

### Integration Points

- **`src/lib/agents/shared/crm-mutation-tools/`** (nuevo) — módulo a crear, espejo de `crm-query-tools/`. `shared/` ya existe (creado por query-tools).
- **DB migration en `supabase/migrations/`** — nueva migration para tabla `crm_mutation_idempotency_keys`. Requiere apply manual (Regla 5).
- **Inngest cron `crm-mutation-idempotency-cleanup`** — research-phase decide si crea cron nuevo (analogo a `crm-bot-expire-proposals`) o suma a uno existente. TTL 30 días.
- **`/api/test/crm-mutation-tools/runner/route.ts`** — runner endpoint hardened, espejo del de query-tools. Mismo 4-gate (NODE_ENV+secret+env-workspace+allowlist).
- **`CLAUDE.md`** — agregar sección "Module Scope: crm-mutation-tools" (espejo de la de crm-query-tools).
- **`.claude/skills/crm-mutation-tools.md`** — project skill descubrible (orchestrator pre-write necesario por sandbox restriction — patrón aprendido en Plan 07 de query-tools).
- **`.claude/rules/agent-scope.md`** — cross-reference adicional (orchestrator pre-edit por mismo motivo).

</code_context>

<specifics>
## Specific Ideas

- El usuario explícitamente eligió **Opción B determinista** sobre Opción A (reusar crm-writer two-step). Razón: latencia mitad (50-150ms vs 150-300ms), determinismo del control flow (un solo estado intermedio vs propose+confirm), simetría con query-tools.
- El usuario eligió **Full suite (15 ops)** sobre MVPs más pequeños. Implica un standalone grande pero scope cerrado — research/plan deben dimensionar wave count realista (estimado: 8-12 plans, similar a query-tools en complejidad).
- El usuario eligió **E2E Playwright máximo** (D-05) y **runner endpoint + verify Kanban UI** (D-10). Implica que el runner endpoint debe poder ejecutar las 15 mutaciones y la suite Playwright debe cubrir al menos los happy paths visibles en UI (orders mostly).
- **Audit en `agent_observability_events`** (D-06) — cero schema nuevo de audit. Si en futuro el sandbox UI quiere mostrar mutaciones de mutation-tools, se construye view DB que UNION ambas tablas.
- El usuario eligió **`Idempotency-Key` opcional + tabla dedicada** (D-03) sobre alternativas. Implica:
  - Una migración nueva (junto a la del schema, posiblemente misma SQL file).
  - Cron de cleanup (research decide ubicación).
  - Logic de hidratación: cuando hit idempotency, RE-LEER la entity (no usar el `result_payload` cacheado si es stale) — research-phase decide si payload almacenado o re-leer por `result_id`.

</specifics>

<deferred>
## Deferred Ideas

- **Migración de `somnio-sales-v3-pw-confirmation` a usar `crm-mutation-tools`** + cleanup del `crm-writer-adapter.ts` + cleanup CLAUDE.md scope → standalone follow-up `crm-mutation-tools-pw-confirmation-integration`.
- **Migración de otros agentes que usen crm-writer** (sandbox, futuros) → standalones follow-up por agente.
- **Borrado de `crm-writer` y su tabla `crm_bot_actions`** — solo si TODOS los consumidores migran. Probablemente nunca: sandbox UI necesita preview-flow que mutation-tools no provee. crm-writer queda como herramienta de "preview before commit".
- **Update items de un pedido** (`updateOrder.products`) — V1.1 si un agente lo requiere. V1 escala a handoff humano si cliente pide cambiar items.
- **Mutaciones de recursos base** (tags, pipelines, stages, templates, usuarios) — fuera de scope absoluto. Operador crea manualmente. Si futuro agente requiere, se construye `config-builder-*` skill (existe ya `config-builder-whatsapp-templates`).
- **Bulk operations** (`bulkArchiveOrders`, `bulkMoveOrdersToStage`, `bulkUpdateContactTags`) — solo cuando un agente futuro las requiera (riesgo de mutation explosion sin paginación clara).
- **Admin gate para destructivas** (D-04 alternativa rechazada) — solo si agente futuro lo requiere. Se agrega `ctx.actorRole?: 'admin' | 'member'` opcional sin romper el módulo.
- **Tools de re-hidratación opt-out** (lite mode que retorna solo `{ id, updated_at }` en vez de entity completa) — solo si latencia se vuelve issue medible. Default es entity completa (D-09).
- **Optimistic concurrency en updates** (similar al CAS de moveOrderToStage) — `updateOrder` actualmente es last-write-wins en domain. Si 2 agentes concurren, uno sobreescribe. Mitigación futura: agregar `version` column + WHERE version=?. Defer.
- **Tabla unificada `crm_mutations_log`** (D-06 alternativa rechazada) — schema dedicado con index para forensics. Defer hasta dolor concreto.

### Reviewed Todos (not folded)

No se cruzaron todos en cross_reference durante esta discusión.

</deferred>

---

*Standalone: crm-mutation-tools*
*Context gathered: 2026-04-29*
*Mirror of crm-query-tools (shipped 2026-04-29) — same patterns, opposite verb (mutate vs read).*
