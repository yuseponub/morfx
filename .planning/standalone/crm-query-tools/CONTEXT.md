# Standalone: CRM Query Tools - Context

**Gathered:** 2026-04-29
**Status:** Ready for research + planning
**Origin:** Refactor de cómo agentes conversacionales consumen contexto CRM. Hoy `somnio-recompra-v1` y `somnio-sales-v3-pw-confirmation` invocan al agente `crm-reader` (segundo LLM call) y/o dependen de un preload Inngest bloqueante. Reemplazar por tools deterministas embebidas que llaman directo a domain layer.

<domain>
## Phase Boundary

Construir un módulo compartido `src/lib/agents/shared/crm-query-tools/` con 5 query tools deterministas (sin LLM intermedio) que cualquier agente conversacional pueda registrar para consultar contactos y pedidos directamente desde domain layer:

1. `getContactByPhone(phone)` — contacto + tags + custom_fields
2. `getLastOrderByPhone(phone)` — último pedido del contacto (DESC created_at) + items + stage + dirección
3. `getOrdersByPhone(phone, { limit?, offset? })` — historial de pedidos del contacto
4. `getActiveOrderByPhone(phone, { pipelineId? })` — pedido en stage NO terminal (config-driven)
5. `getOrderById(orderId)` — un pedido específico (espejo de crm-reader.ordersGet)

Las tools leen una **configuración persistente por workspace** (qué stages son "activos" vs "terminales", qué pipeline scope) gestionada vía nueva sección UI en `/agentes` (junto con router y auditoría). Migración DB + domain layer + UI + tools + tests Playwright E2E entregados juntos.

**Fuera de scope (deferred a standalones follow-up):**
- Migrar `somnio-recompra-v1` a usar las tools nuevas → standalone `crm-query-tools-recompra-integration`.
- Migrar `somnio-sales-v3-pw-confirmation` a usar las tools nuevas → standalone `crm-query-tools-pw-confirmation-integration`.
- Borrar `src/inngest/functions/recompra-preload-context.ts` (cleanup vive en standalone de integración recompra).
- Simplificar `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` (cleanup vive en standalone de integración pw-confirmation).
- Borrar las keys legacy `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order` de `session_state.datos_capturados`.
- Actualizar scope en `CLAUDE.md` de los 2 agentes Somnio.
- Tools de mutación (writes) — crm-writer sigue siendo el único path de mutación.
- Modificar crm-reader o crm-writer (siguen vivos para otros usos).
- Tools para agentes que aún no existen.

</domain>

<decisions>
## Implementation Decisions

### Pre-discussion (locked antes de discuss-phase)

- **D-01:** Coexistencia con crm-reader. El agente `crm-reader` no se elimina ni se modifica — sigue disponible para casos open-ended ("busca contactos que cumplan X criterio"), evaluaciones futuras, o agentes que prefieran síntesis vía LLM. Las query tools nuevas son **adicionales**, no reemplazo del módulo crm-reader.
- **D-02:** 5 tools iniciales: `getContactByPhone`, `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`. Lista cerrada para este standalone. Tools adicionales (ej. `getOrdersByEmail`, `getContactByCustomField`) son scope creep — backlog.
- **D-03:** Reemplazar el patrón preload Inngest por on-demand tool-call. **Pero el cleanup del código viejo no vive en este standalone** — vive en los standalones follow-up de integración por agente (cada agente tiene cleanup propio: state machine, prompts, scope rules, dispatch, además de simplemente borrar Inngest function).
- **D-04:** Módulo compartido en `src/lib/agents/shared/crm-query-tools/`. Export `createCrmQueryTools(ctx, options?)` que retorna las 5 tools listas para registrar via spread en `tools: { ...createCrmQueryTools(ctx) }`. DRY entre futuros agentes consumidores.
- **D-05:** Workspace isolation via `ctx.workspaceId`. El `phone` viene del input. Domain layer filtra por `workspace_id` en cada query (Regla 3). Las tools NUNCA aceptan `workspaceId` como input directo — viene exclusivamente del execution context del agente.
- **D-06:** Actualizar scope `CLAUDE.md` de los agentes consumidores. **Aplica a follow-ups, no a este standalone.** En este standalone, agregar al `CLAUDE.md` la sección nueva `Module Scope: crm-query-tools` describiendo el contrato del módulo (qué PUEDE leer, qué NO PUEDE mutar).

### Error handling y normalización (de discuss-phase)

- **D-07:** Contrato de retorno = **typed result espejo crm-reader**. Cada tool retorna `ToolLookupResult<T> | ToolListResult<T>` con `status: 'found' | 'not_found' | 'no_orders' | 'no_active_order' | 'multiple_active' | 'error'` (subset por tool según aplique). NUNCA throw para casos esperados (not_found, no_orders) — solo throw para fallos reales (DB down, validation broken). Razón: agente ya conoce el shape del crm-reader, errores no rompen el turn.
- **D-08:** Si 2+ contactos comparten el mismo phone en el workspace (caso raro), tools retornan **el contacto con `created_at` DESC más reciente** + flag `duplicates_count: number` (>0 si hay otros) + `duplicates: string[]` con los otros contact_ids. El agente puede decidir si advertir al operador. Aplica a `getContactByPhone`, `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`.
- **D-09:** Phone normalization se hace **dentro de la tool** (no en el agente). Tool acepta cualquier formato razonable (raw `'3001234567'`, `'+57 300 123 4567'`, `'(57) 300-123-4567'`), normaliza a E.164 antes de query usando el helper existente del proyecto (mismo que `webhook-processor.ts` usa al matchear inbound). Si no se puede normalizar a E.164 válido, retorna `{ status: 'error', error: { code: 'invalid_phone' } }`. **Investigar en research:** localizar helper exacto de normalización (probable `src/lib/whatsapp/phone-utils.ts` o `src/lib/utils/phone.ts`).
- **D-10:** Si phone NO existe → `{ status: 'not_found' }`. Si phone existe pero contacto no tiene pedidos → `{ status: 'no_orders', contact: ContactDetail }`. El agente distingue "phone desconocido" (saludo neutro) vs "cliente registrado sin compras" (saludo personalizado, ej. "Hola Juan, ¿en qué te ayudo?").

### Definición de "pedido activo" — config-driven via UI (de discuss-phase)

- **D-11:** Definición de "stages activos" + "pipeline scope" se almacena como **configuración persistente por workspace** en DB. NO hardcoded, NO param del caller, NO heurística por nombre. Tools leen la config en runtime al ejecutarse.
- **D-12:** Granularidad = **una config compartida por workspace**. Todos los agentes del workspace usan la misma definición. Si en futuro un agente necesita override, agregamos param opcional en la tool — pero default es leer config workspace.
- **D-13:** Stages se referencian por **UUID de `pipeline_stages`** (no por nombre). Estable contra renames. UI muestra nombres pero guarda IDs. Validación runtime: si stage_id en config ya no existe (eliminado), domain limpia entrada y emite warning log. **Investigar en research:** ¿hay FK constraint que borre la config si stage se elimina, o validación en código?
- **D-14:** UI vive como **sección nueva en `/agentes`**, junto con las secciones existentes "router" y "auditoría". Slug exacto lo decide el planner (ej. `/agentes/configuracion-tools`, `/agentes/crm-tools`, `/agentes/herramientas`). La UX debe ser consistente con el resto de `/agentes` (sidebar, layout, tema editorial post-Plan-04).
- **D-15:** Si `getActiveOrderByPhone` encuentra 2+ pedidos en stages activos (ej. cliente con FALTA INFO + FALTA CONFIRMAR simultáneo), retorna **el más reciente por `created_at` DESC** + flag `other_active_orders_count > 0`. Coherente con D-08. Si agente necesita la lista completa, llama `getOrdersByPhone` aparte y filtra.
- **D-16:** Pipeline scope = **todas las pipelines del workspace por default**, con param opcional `pipelineId` para restringir. La config UI permite pickear "pipeline scope" como UUID opcional (null = todas). Si caller pasa `pipelineId` explícito, override config. Si ambos null, busca en todas.
- **D-17:** Si NO hay pedido activo (todos terminales o ninguno existe), retorna `{ status: 'no_active_order', contact: ContactDetail, last_terminal_order?: OrderDetail }`. `last_terminal_order` = el más reciente entre stages terminales (útil para post-venta sin tener que hacer 2da call). Agente decide si usarlo.

### Output schema y cache (de discuss-phase)

- **D-18:** Shape de retorno = **espejo de `OrderDetail` y `ContactDetail` del crm-reader**. Reusar interfaces de `src/lib/agents/crm-reader/types.ts` (o donde estén definidas) — NUNCA copy-paste/duplicar tipos. Si el shape del crm-reader es insuficiente, **extender** el tipo (no fork). Tests y types compartidos. Pro: futuros migrators no reaprenden.
- **D-19:** **Sin cache**. Cada tool-call llega a domain layer y hace query Supabase fresh. Latencia esperada ~50-150ms por query (Supabase RTT desde Vercel). Aceptable para 1-2 calls por turn. Eliminamos clase de bugs de stale data (especialmente crítico cuando pw-confirmation muta stages mid-turn).
- **D-20:** **Todo siempre incluido** en el output (tags, custom_fields, order_products items, addresses). Sin params verbose/opt-in. Justificación: la mayoría de casos consumidores los necesitan, y la simplicidad de API supera el ahorro de tokens. Si futuro tool requiere ahorro, fork con sufijo (ej. `getActiveOrderByPhone_lite`).
- **D-21:** Tools **NO escriben** las keys legacy (`_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order`) en `session_state.datos_capturados`. Las tools son puro return value — el caller decide si persistir. El cleanup de esas keys es responsabilidad de los standalones follow-up de integración por agente.

### Cleanup, observability, tests, rollout (de discuss-phase)

- **D-22:** **Cleanup del Inngest preload NO se hace en este standalone.** Se hace en cada standalone follow-up de integración por agente, porque cada agente necesita cleanup propio (estado, prompts, dispatch, scope rules). Razón: decoupling — construir tools robustas, validarlas con tests, y migrar producción en pasos atómicos por agente.
- **D-23:** Observability = **emitir eventos `pipeline_decision:crm_query_*`** + structured logs. Eventos: `crm_query_invoked` (qué tool, params), `crm_query_completed` (latencyMs, status), `crm_query_failed` (error code). Structured logs incluyen: `queryName`, `latencyMs`, `resultStatus`, `workspaceId`, `actorAgentId`. Consistente con patrón actual de Somnio (recompra y pw-confirmation ya emiten `pipeline_decision:*`).
- **D-24:** Cobertura tests = **Unit + Integration + E2E completo (Playwright UI)**.
  - **Unit:** cada tool con mocks de domain (~25-30 tests, happy + edge cases). Cubre normalización phone, status enums, duplicates flag, multi-active flag, no_orders/no_active_order.
  - **Integration:** seed config en DB → llamar tool con ctx real → verificar resultado respeta config + workspace isolation (cross-workspace leak check).
  - **E2E (Playwright):** abre browser en `/agentes/[config-page]`, selecciona stages activos via multi-select UI, selecciona pipeline scope, guarda, luego helper invoca tool con phone seed, verifica que respeta lo guardado. Único momento donde se valida UI ↔ DB ↔ tool integrada.
- **D-25:** **Rollout cambió de scope** (decisión D-22). En este standalone NO hay rollout a agentes. El standalone entrega: (a) tools listas, (b) UI configurable, (c) `INTEGRATION-HANDOFF.md` con todo el contexto necesario para integrar cada agente Somnio en standalones separados.
- **D-26:** **Handoff = `INTEGRATION-HANDOFF.md`** en `.planning/standalone/crm-query-tools/` + project skill descubrible (`crm-query-tools` en `.claude/skills/` o equivalente). El MD contiene: cómo invocar cada tool, qué retornan (con ejemplos JSON), cómo cleanup Inngest preload por agente Somnio (snippet de qué borrar/modificar), ejemplos de wiring en `tools: { ... }`, scope CLAUDE.md update template. Snapshot del momento de ship — no cambia post-merge. Project skill es la versión "viva" descubrible.

### Claude's Discretion

Áreas donde el usuario delegó al builder:
- Slug exacto de la ruta UI bajo `/agentes` (ej. `crm-tools`, `configuracion-tools`, `herramientas`).
- Nombre exacto de la tabla DB (ej. `crm_query_tools_config`, `agent_query_config`, `workspace_crm_config`) — research-phase determina patrón.
- Nombre exacto de la project skill (`crm-query-tools` por default).
- Estructura interna del módulo `src/lib/agents/shared/crm-query-tools/` (un archivo por tool vs. uno solo).
- Naming de eventos `pipeline_decision:crm_query_*` (sufijos exactos).
- Decidir si la migración crea **tabla nueva** dedicada o agrega **columna JSONB** a tabla existente — research-phase evalúa.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CRM Reader (patrón a espejar)
- `src/lib/agents/crm-reader/tools/contacts.ts` — `contactsSearch`, `contactsGet` shape de tool y output (ToolListResult, ToolLookupResult)
- `src/lib/agents/crm-reader/tools/orders.ts` — `ordersList`, `ordersGet` shape; especialmente cómo se forma `OrderDetail` con order_products nested
- `src/lib/agents/crm-reader/tools/index.ts` — patrón `createReaderTools()` para crear el agregador

### Domain Layer (queries a reusar)
- `src/lib/domain/contacts.ts` — `searchContacts`, `getContactById` contracts (filtrado workspace_id, retorno con tags/custom_fields)
- `src/lib/domain/orders.ts` (líneas ~1684-1725 según mapeo) — `listOrders`, `getOrderById` contracts (filtros pipelineId, stageId, contactId, ordering)
- `src/lib/domain/orders.ts` (sección moveOrderToStage) — para entender stage_changed_concurrently y por qué cache stale es peligroso (D-19)

### Inngest preload viejo (a heredar contexto, NO modificar en este standalone)
- `src/inngest/functions/recompra-preload-context.ts` — referencia para entender qué info se sintetiza hoy y qué shape espera el agente recompra
- `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` (especialmente `extractActiveOrderJson` líneas ~118-150) — shape del JSON `_v3:active_order` que el follow-up tendrá que reemplazar

### Agente consumidor de active_order (referencia de shape)
- `src/lib/agents/somnio-pw-confirmation/state.ts` (líneas 48-76 `ActiveOrderPayload` interface) — shape esperado del active order, se usa para alinear D-18 (output de getActiveOrderByPhone debe poder mapearse 1:1 a este interface)

### Scope rules y patrones del proyecto
- `CLAUDE.md` — Reglas 0 (GSD obligatorio), 3 (domain layer), 5 (migración antes de deploy), 6 (proteger agente prod), sección "OBLIGATORIO al Crear un Agente Nuevo" (aplica al módulo de tools por extensión)
- `.claude/rules/agent-scope.md` — patrón de cómo documentar scope (PUEDE/NO PUEDE) — referencia para nueva sección "Module Scope: crm-query-tools" en CLAUDE.md (D-06)

### UI (sección nueva en /agentes)
- `src/app/(dashboard)/agentes/**` — patrón de la página existente con secciones "router" y "auditoría" para alinear UX (sidebar, layout, theming)
- `src/app/(dashboard)/agentes/routing-editor/**` — referencia de patrón "config persistente con UI editorial" (multi-select, save flow)

### Observability
- Buscar emisores existentes de `pipeline_decision:*` (probable `src/lib/observability/` o helper en `src/lib/agents/observability.ts`) — research-phase los localiza para reusar el helper

### Tests
- Buscar suite Playwright existente (probable `e2e/` o `tests/e2e/`) — research-phase identifica patrón actual de Playwright en el proyecto
- `src/lib/agents/somnio-recompra/__tests__/` — referencia de unit tests con vitest (mismo proyecto, mismo agent pattern)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`ToolLookupResult<T>` / `ToolListResult<T>`** (en crm-reader): tipos de retorno típed con `status` discriminated union. Reusables 1:1 (D-07).
- **`OrderDetail`, `ContactDetail`** (en crm-reader): interfaces espejables/extensibles para D-18.
- **Helper de phone normalization** (ubicación a confirmar en research): mismo helper que `webhook-processor.ts` usa para matchear inbound — D-09 lo reusa.
- **`createAdminClient()`** (en `src/lib/supabase/`): solo lo usa domain layer (Regla 3). Las tools nunca lo invocan directo.
- **Domain functions `searchContacts`, `getContactById`, `listOrders`, `getOrderById`**: ya filtran por `workspace_id`. Las tools nuevas las llaman directo (D-05).

### Established Patterns

- **Two-layer pattern (tools → domain)**: las tools en `src/lib/agents/*/tools/**` nunca tocan Supabase directo, siempre via `@/lib/domain/*`. Las query tools nuevas siguen este patrón estricto.
- **Status discriminated union para retornos**: `{ status: 'found' | 'not_found' | 'error', data?, error? }`. Patrón consolidado en crm-reader/crm-writer.
- **Workspace isolation via execution context**: `ctx.workspaceId` viene del agent invocation (header `x-workspace-id` o session_state), nunca del body/input. Domain filtra siempre.
- **Atomic commits + push Vercel post-cambio** (Regla 1): cada plan del standalone termina con commit + push.
- **Migración antes de deploy** (Regla 5): plan de migración pausa para aplicación SQL manual antes de pushear código que la usa.
- **Pipeline_decision events para observability** (D-23): patrón ya usado por agentes Somnio.

### Integration Points

- **`src/lib/agents/shared/crm-query-tools/`** (nuevo) — módulo a crear. No existe `shared/` aún bajo `src/lib/agents/` — research-phase confirma o sugiere ubicación alternativa.
- **`src/app/(dashboard)/agentes/[nueva-seccion]/`** — UI a crear. Patrón heredado de `routing-editor`.
- **DB migration en `supabase/migrations/`** — nueva migración para tabla/columna de config (D-11). Requiere apply manual (Regla 5).
- **`CLAUDE.md`** — agregar sección "Module Scope: crm-query-tools" (D-06 adaptado al módulo).

</code_context>

<specifics>
## Specific Ideas

- El usuario explícitamente quiere que la **definición de "stages activos" sea editable por el operador via UI**, no hardcoded. Esto fue un pivot importante en la discusión y debe respetarse en el planning — no skipear la UI ni sembrar config solo por SQL.
- El usuario quiere que el **cleanup de cada agente Somnio sea su propio standalone** porque cada agente tiene "limpieza propia más allá de Inngest" (state machine, prompts, scope, dispatch). El presente standalone es **solo infraestructura**.
- Patrón consistente: el usuario prefiere recommended/default options en la mayoría — solo desvió en (a) verbosity (eligió "todo siempre" en vez de opt-out), (b) tests (E2E completo en vez de solo unit+integration), (c) scope (NO migrar agentes en este standalone).
- Para D-18 (output shape espejo crm-reader): si futuro reveal que hay shape duplicado entre crm-reader y crm-query-tools, el módulo compartido **gana** y crm-reader debería refactorizarse para importar del módulo. Pero esto NO se hace en este standalone — solo se anota para evaluar en standalones futuros.

</specifics>

<deferred>
## Deferred Ideas

- **Migración de `somnio-recompra-v1` a usar las tools nuevas** + cleanup `recompra-preload-context.ts` + cleanup CLAUDE.md scope → standalone follow-up: `crm-query-tools-recompra-integration`.
- **Migración de `somnio-sales-v3-pw-confirmation` a usar las tools nuevas** + cleanup step 1 de `pw-confirmation-preload-and-invoke.ts` + cleanup CLAUDE.md scope → standalone follow-up: `crm-query-tools-pw-confirmation-integration`.
- **Borrado de keys legacy** `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order` de session_state — ocurre dentro de los standalones de integración por agente.
- **Tools adicionales** (ej. `getOrdersByEmail`, `getContactByCustomField`, `getOrdersByDateRange`, `getActiveOrderByContactId`) — backlog. Solo se construyen cuando agentes futuros las requieran.
- **Refactor crm-reader para importar del módulo compartido** si shapes convergen — evaluación futura, no parte del standalone actual ni de las integraciones inmediatas.
- **Override per-agente de la config** (D-12 alternativa rechazada: "por agente registrado en routing"). Si un agente futuro requiere su propia definición de "activo" distinta del default workspace, agregar param opcional `excludeStageIds` a la tool en ese momento — no anticipar.
- **Tools de mutación / escritura** — fuera de scope absoluto. crm-writer es el único path de mutación.

### Reviewed Todos (not folded)

No se cruzaron todos en cross_reference durante esta discusión.

</deferred>

---

*Standalone: crm-query-tools*
*Context gathered: 2026-04-29*
