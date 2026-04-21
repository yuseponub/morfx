# Standalone: CRM Stage Integrity - Context

**Gathered:** 2026-04-21
**Status:** Ready for research + planning
**Origin:** Auditoría de bug productivo — pedidos que se "devuelven" de un stage a otro despues de ser movidos (reportado por usuario 2026-04-21)

<domain>
## Phase Boundary

Eliminar el bug donde pedidos del CRM se devuelven automaticamente de un stage a otro despues de que el usuario los mueve. El domain layer (`src/lib/domain/orders.ts`) es la unica fuente de mutacion de `stage_id` (Regla 3), y debe garantizar que NINGUNA fuente (manual via Kanban, automatizaciones via Inngest, webhooks Shopify, agentes CRM-writer, robots) pueda:

1. Mutar stage con data stale (write-write race).
2. Crear loops circulares Stage A → B → A.
3. Cambiar stage sin dejar trail auditable de quien/cuando/por que.
4. Sobreescribir un cambio manual sin que el usuario vea la correccion.

El fix abarca 5 capas:
- **Domain layer** (`src/lib/domain/orders.ts:557-648`) — compare-and-swap al UPDATE.
- **Audit log** — nueva tabla `order_stage_history` con `source` + `actor_id` + `cascade_depth`.
- **Inngest runners** (`src/inngest/functions/automation-runner.ts:363`) — concurrency per-orderId.
- **Builder validation** (`src/lib/builder/validation.ts:252-502`) — cycle detection cubre AND/OR + todas las condiciones + runtime kill-switch.
- **Kanban UI** (`src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx`) — Supabase Realtime + rollback con toast.

**Fuera de scope:**
- Refactor completo del motor de automatizaciones (solo tocamos cycle detection y concurrency).
- UI timeline visual de `order_stage_history` en la sheet del pedido (se puede hacer en fase posterior cuando la tabla ya exista y tenga data).
- Cambios al schema de `automations` o `pipeline_stages`.
- Migracion de data historica de `mutation_audit` → `order_stage_history` (solo tracking desde deploy en adelante).
- Cambios al `crm-reader` bot (read-only, no muta).
- Rediseno del Kanban drag-and-drop (solo agregamos Realtime + recovery, no cambiamos dnd-kit).

</domain>

<decisions>
## Implementation Decisions

### Scope y calidad

- **D-01:** Usuario delega las decisiones tecnicas a Claude (rol builder) con el mandato: "hazlo lo mas funcional posible sin bugs" + "investiga lo que ya se aplica antes de implementar". Todas las decisiones D-02 en adelante son de Claude bajo discrecion, documentadas aqui para trazabilidad.
- **D-02:** Alcance completo en un standalone (no dividir en P0/P1). Razon: los 5 bugs estan acoplados — arreglar locking sin cycle detection o sin audit log dejaria puntos ciegos. Regla 0 del proyecto: calidad sobre velocidad.
- **D-03:** Audit log **CONFIRMADO POR USUARIO** — crear tabla `order_stage_history`. No duplica `mutation_audit` (generico JSONB) porque agrega semantica critica: `source`, `actor_id`, `cascade_depth`, `automation_id`, `previous_stage_id`, `new_stage_id` como columnas first-class indexables. Query por orderId + rango de tiempo debe ser O(log n).

### DB-level locking (Claude's Discretion)

- **D-04:** **Optimistic compare-and-swap** en `domain.moveOrderToStage`. Al UPDATE, agregar `.eq('stage_id', previousStageId)` — si `count === 0`, retornar `{ success: false, error: 'stage_changed_concurrently', currentStageId }` sin mutar. El caller decide si reintenta o notifica.
- **D-05:** NO usar version field incremental ni advisory locks. Razon: compare-and-swap es suficiente para el caso (stage_id es el unico campo que mueve con cascadas), no requiere migracion de schema nueva, y es el patron mas simple que funciona.
- **D-06:** Compare-and-swap aplica a TODOS los callers de `moveOrderToStage` (Kanban server action, action-executor, crm-writer two-step, webhook handlers). El check se hace en domain layer — callers solo manejan el error.

### Cycle detection (Claude's Discretion)

- **D-07:** **Defense-in-depth** — tres capas:
  - **Capa 1 (build-time):** Mejorar `conditionsPreventActivation` para cubrir operadores AND/OR + todos los tipos de condicion (no solo stage/pipeline/tag). Cubre campos custom, valores numericos, tags de contacto, etc.
  - **Capa 2 (runtime kill-switch):** Antes de ejecutar `executeChangeStage`, query `order_stage_history` por orderId en ultimos 60s. Si hay >5 cambios automaticos — bloquear con error `too_many_stage_changes` + log a observability.
  - **Capa 3 (cascade cap):** Mantener `MAX_CASCADE_DEPTH = 3` tal cual, pero cuando se alcanza, ademas de suprimir el emit, registrar en `order_stage_history` un row con `source='cascade_capped'` para que sea visible en logs/UI.

### Inngest concurrency (Claude's Discretion)

- **D-08:** Agregar concurrency scope `event.data.orderId` con `limit: 1` al runner `automation-order-stage-changed` (`src/inngest/functions/automation-runner.ts:363`). Mantener el limit por workspaceId. Serializa cambios del mismo pedido sin bloquear workspace.
- **D-09:** No afecta a otros runners (tag.assigned, order.created, etc.) — solo el de stage_changed. Razon: es el unico trigger que puede recursar sobre si mismo via `change_stage` action.

### Audit log (order_stage_history)

- **D-10:** Nueva tabla `order_stage_history`:
  ```
  id uuid PK DEFAULT gen_random_uuid()
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE
  workspace_id uuid NOT NULL
  previous_stage_id uuid NULL (null solo en create order)
  new_stage_id uuid NOT NULL
  source text NOT NULL CHECK (source IN ('manual','automation','webhook','agent','robot','cascade_capped','system'))
  actor_id uuid NULL (user_id si manual, automation_id si automation, etc.)
  actor_label text NULL (nombre legible para UI: "Jose Romero", "Automation: Nuevo pedido → En preparacion")
  cascade_depth smallint NOT NULL DEFAULT 0
  trigger_event text NULL (si source='automation': el trigger_type que lo causo)
  changed_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW())
  metadata jsonb NULL
  ```
- **D-11:** Indices: `(order_id, changed_at DESC)` para timeline UI, `(workspace_id, changed_at DESC)` para reportes, `(order_id, changed_at DESC) WHERE source != 'manual'` para kill-switch query.
- **D-12:** Escrito por `domain.moveOrderToStage` como parte de la misma transaccion logica que el UPDATE al orders table. Orden: compare-and-swap UPDATE → insert a order_stage_history → emit trigger. Si UPDATE falla, history NO se escribe (consistencia).
- **D-13:** RLS: scoped por `workspace_id` igual que la tabla orders. Acceso read-only desde UI (no delete, no update — append-only ledger).

### Kanban UX (Claude's Discretion)

- **D-14:** Agregar Supabase Realtime subscription a `kanban-board.tsx` escuchando `orders` con filtro `pipeline_id=eq.${pipelineId}`. Cuando llega UPDATE con cambio de `stage_id`, resincronizar `localOrdersByStage` — EXCEPTO si `recentMoveRef.current === true` (respeta el optimistic update local).
- **D-15:** Cuando `moveOrderToStage` retorna error `stage_changed_concurrently`:
  - Revertir optimistic update (el pedido vuelve a su stage anterior en UI local).
  - Mostrar toast rojo: "Este pedido fue movido por otra fuente. Refrescando..."
  - Trigger una resincronizacion forzada (`setLocalOrdersByStage(ordersByStage)` sin esperar Effect).
- **D-16:** Mantener timeout bounce-back actual (2000ms) — el Realtime cubre el gap cuando revalidatePath tarda mas.

### Feature flag strategy (Regla 6)

- **D-17:** Compare-and-swap → **detras de flag** `crm_stage_integrity_cas_enabled` en `platform_config` (patron Phase 44.1). Default `false` para que deploy inicial sea no-op. Se activa manualmente por workspace-id tras pruebas.
- **D-18:** Audit log `order_stage_history` → escritura activa desde deploy (sin flag). Razon: append-only, no cambia comportamiento visible al usuario, pero captura data desde dia 1 para debugging. Insert a history no puede romper produccion.
- **D-19:** Inngest concurrency per-orderId → sin flag. Razon: additive, no puede causar regression (solo serializa mas agresivamente).
- **D-20:** Cycle detection mejorada en Builder → sin flag para la mejora de `conditionsPreventActivation`. Runtime kill-switch (capa 2) detras de flag `crm_stage_integrity_killswitch_enabled` para permitir rollback rapido si se descubre que bloquea casos legitimos.
- **D-21:** Kanban Realtime → sin flag (additive, no puede causar regression). Rollback via toast requiere compare-and-swap, asi que efectivamente sigue el mismo flag que D-17.

### Observability

- **D-22:** Eventos `pipeline_decision:*` a emitir (patron existente en el proyecto):
  - `stage_change_rejected_cas` — cuando compare-and-swap falla
  - `stage_change_killswitch_triggered` — cuando capa 2 bloquea por demasiados cambios
  - `stage_change_cascade_capped` — cuando MAX_CASCADE_DEPTH se alcanza
  - `stage_change_cycle_detected_buildtime` — cuando Builder rechaza automation con cycle
- **D-23:** Todos los rows de `order_stage_history` con `source='cascade_capped'` o donde `kill_switch_triggered` se loggean como warning a Vercel logs + se incluyen en el reporte del pedido.

### Migracion de data historica

- **D-24:** NO backfill de `order_stage_history` desde `mutation_audit`. Razon: `mutation_audit` guarda JSONB completo del row, extraer stage changes requeriria parseo complejo y el signal-to-noise seria bajo. Tracking empieza desde deploy.

### Testing

- **D-25:** Tests deben cubrir al menos:
  - Compare-and-swap rechaza segundo UPDATE concurrente.
  - Cycle A→B→A bloqueado por kill-switch despues de 5 cambios/60s.
  - Cycle build-time detectado cuando condiciones usan AND/OR con multiples tipos.
  - Inngest concurrency serializa 2 eventos para el mismo orderId (verificar via test con `inngest-test-engine` si existe, sino integracion).
  - Kanban Realtime actualiza UI cuando otro cliente mueve pedido.
  - Kanban rollback con toast cuando servidor rechaza.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Domain layer y arquitectura
- `CLAUDE.md` §Regla 3 — Domain layer como unica fuente de mutacion.
- `CLAUDE.md` §Regla 5 — Migracion antes de deploy (aplica a la nueva tabla).
- `CLAUDE.md` §Regla 6 — Proteger agente en produccion (aplica a feature flags).
- `.claude/rules/agent-scope.md` §CRM Writer Bot — Todas las mutaciones del writer pasan por domain; el fix del domain las cubre.
- `src/lib/domain/orders.ts` linea 557-648 — `moveOrderToStage` actual (a modificar).
- `src/lib/domain/orders.ts` linea 565-583 — read-then-write sin lock (bug raiz #1).

### Motor de automatizaciones
- `src/lib/automations/constants.ts` linea 11 — `MAX_CASCADE_DEPTH = 3`.
- `src/lib/automations/action-executor.ts` linea 301-323 — `executeChangeStage`.
- `src/lib/automations/trigger-emitter.ts` linea 28-35 — `isCascadeSuppressed`.
- `src/lib/builder/validation.ts` linea 252-502 — `detectCycles` (a reescribir linea 390-437).
- `src/inngest/functions/automation-runner.ts` linea 358-618 — runner de `order.stage_changed` (agregar concurrency per-orderId).

### Kanban UI
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` — componente principal.
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` linea 103-110 — prop sync skip.
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` linea 205-307 — `handleDragEnd`.
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` linea 268-272 — bounce-back timeout.
- `src/app/actions/orders.ts` linea 573-614 — server action `moveOrderToStage`.

### Audit trail existente
- `supabase/migrations/20260213000001_mutation_audit.sql` — tabla `mutation_audit` generica (complementada por `order_stage_history`, NO reemplazada).

### Integracion con Agentes CRM
- `src/lib/agents/crm-writer/two-step.ts` — unico archivo del writer que muta; todas sus llamadas a `moveOrderToStage` heredan el fix.
- `src/lib/agents/crm-writer/tools/orders.ts` linea 27-116 — tool `moveOrderToStage` (propone, no muta).

### Patrones de referencia en el codebase
- `supabase/migrations/` con `platform_config` para ejemplos de feature flags (usado en Phase 44.1).
- `.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md` — ejemplo de observability events `pipeline_decision:*` (patron a seguir en D-22).

### Web research needed (fase de research)
- Patrones Postgres de optimistic concurrency control con Supabase JS (RETURNING + affected_rows).
- Inngest concurrency keys + semantica de limit=1 por key.
- Supabase Realtime filters + race conditions con optimistic updates en React.
- Cycle detection en motores de automation reactivos (best practices: kill-switch count, TTL, etc.).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`mutation_audit` table**: Audit generico existente. NO reemplazar, complementar con `order_stage_history` especifica.
- **`platform_config` table**: Usada en Phase 44.1 para flags de CRM bots. Usar mismo patron para los dos flags nuevos (D-17, D-20).
- **`domain.moveOrderToStage`**: Unica funcion que muta stage_id — no hay otros paths. El fix al compare-and-swap cubre TODOS los callers automaticamente.
- **`proposeAction` pattern (crm-writer two-step)**: Ya genera correlation IDs para rastrear mutaciones por agent. Se puede reusar `actor_id` + `actor_label` de ahi.
- **`isCascadeSuppressed`**: Ya existe la infraestructura para suprimir emits cuando se alcanza cascade depth. Solo agregar el insert a history cuando se suprime (D-07 capa 3).
- **`pipeline_decision:*` event emission**: Patron establecido en Somnio Recompra (Phase 44 + standalone somnio-recompra-crm-reader). Reusar.

### Established Patterns
- **Compare-and-swap no existe hoy en el codebase** — este standalone introduce el patron. Documentar en `src/lib/domain/CONVENTIONS.md` (si existe) o crear guia.
- **Inngest concurrency keys**: Ya se usa por workspaceId en runners. Agregar orderId es natural.
- **Supabase Realtime**: Ya se usa en WhatsApp (`chat-view.tsx`, `contact-panel.tsx`). NO se usa en Kanban todavia — primera vez para pedidos. Pattern establecido, solo aplicar al nuevo contexto.
- **Feature flags via platform_config**: Patron Phase 44.1. SQL `INSERT INTO platform_config (key, value, workspace_id) VALUES (...)`, leido con `getPlatformConfig(workspaceId, key)`.
- **Domain source field**: `DomainContext.source` ya existe con valores `'webhook' | 'automation' | 'manual' | 'agent'` (Regla 3). Reusar para poblar `order_stage_history.source`.

### Integration Points
- `orders` table — no cambia schema, solo queries usando compare-and-swap.
- `moveOrderToStage` callers (6 confirmados tras auditoria profunda):
  1. `src/app/actions/orders.ts:518, 605, 825` — Kanban manual + bulk.
  2. `src/app/api/mobile/orders/[id]/stage/route.ts:51` — Mobile API (Phase 43).
  3. `src/lib/automations/action-executor.ts:314` — `executeChangeStage`.
  4. `src/lib/agents/crm-writer/two-step.ts` — confirm step (via proposeAction).
  5. `src/lib/agents/crm-writer/tools/orders.ts:27-116` — propone, no muta.
  6. `src/lib/tools/handlers/crm/index.ts` — agent tool handlers.
  Todos heredan el fix de D-04.
- `automation-runner.ts` — solo el runner de `order.stage_changed` necesita el nuevo concurrency scope per-orderId.
- `kanban-board.tsx` — agregar subscription en `useEffect` que ya existe para sync.

### Vectores indirectos (NO mutan stage, emiten triggers que las automations procesan)
- **Shopify webhook handler** (`src/lib/shopify/webhook-handler.ts`): `processShopifyOrderUpdated` (linea 249-337) solo emite `shopify.order_updated`, NO toca `stage_id`. `processShopifyOrderCreated` (linea 43-237) crea orden con stage inicial via `createOrderWithProducts` (linea 499) y emite `shopify.order_created` (linea 162). NO emite `order.stage_changed`.
- **Robot callback** (`src/app/api/webhooks/robot-callback/route.ts`): Linea 144 invoca `updateJobItemResult` que escribe solo `tracking_number` + `carrier`, NO `stage_id`. Los stages configurados en `carrier_configs.dispatch_stage_id` / `guide_lookup_stage_id` NO se usan en el callback para mover pedidos.
- **DB triggers Postgres**: `orders_set_workspace`, `orders_updated_at`, `update_order_total`, `audit_orders`. Ninguno modifica `stage_id` — descarta H5 de origen en DB.

### Callers de riesgo especial
- **`duplicateOrder`** (`src/lib/domain/orders.ts:722-949`): emite `order.created` con `cascadeDepth` heredado del contexto (lineas 877, 910). Si una automation escucha `order.created` + hace `change_stage`, forma vector de cascada. Parte del mecanismo H1.
- **`recompraOrder`** (`src/lib/domain/orders.ts:973-1102`): invoca `duplicateOrder` internamente — hereda el mismo riesgo.
- **`bulkMoveOrdersToStage`** (`src/app/actions/orders.ts:810-831`): itera llamando `moveOrderToStage` una por una SIN locking. Race condition confirmada. Cada iteracion se protege con compare-and-swap (D-04), pero el bulk en conjunto no es atomico. Documentar en plan: errores parciales debe retornar lista `{ moved: N, failed: [orderIds], reasons: [...] }` en lugar de un count simple.

### Creative Options
- `order_stage_history` habilita UI futura: timeline de cambios en sheet del pedido (fuera de scope de este standalone, pero queda la data).
- Runtime kill-switch (D-07 capa 2) puede usarse tambien para tags.assigned loops en el futuro (patron generalizable).

</code_context>

<specifics>
## Specific Ideas

- Bug reportado por usuario 2026-04-21: "aveces se devuelven pedidos de un stage a otro despues de haberlos movido" — sin secuencia especifica conocida (A→B→A vs A→B→C→A).
- Usuario pidio explicitamente: "necesito que todo este muy solido" — el alcance full-stack (no hotfix parcial) refleja este mandato.

### Hipotesis del bug (ranking post-auditoria profunda 2026-04-21)

Tras segunda ronda de auditoria (Shopify webhook, robot-callback, duplicateOrder/recompraOrder, bulkMoveOrdersToStage, DB triggers, callers list):

- **H1: Automatizaciones circulares con `change_stage` + `duplicate_order`** — **70-75%**
  - Evidencia confirmada: `duplicateOrder` (orders.ts:877, 910) emite `order.created` con `cascadeDepth` heredado. Si una automation escucha `order.created` → `change_stage`, y otra escucha `order.stage_changed` → `duplicate_order`, forma loop A→B→dup→A hasta MAX_CASCADE_DEPTH=3.
  - El pedido original queda en stage intermedio cuando se alcanza el cap (bug visible).

- **H2: Race condition `bulkMoveOrdersToStage` + automations concurrentes** — **25-30%** (subio desde 20-25%)
  - Evidencia: `bulkMoveOrdersToStage` (actions/orders.ts:810-831) itera llamando `moveOrderToStage` UNA POR UNA sin locking. Dos llamadas concurrentes leen el mismo `previousStageId`. Multiplica triggers emitidos.

- **H4 NUEVA: Automation en `order.stage_changed` → `change_stage` a otro stage** — **15-20%**
  - Mecanica simple: `X entra a stage B` dispara `change_stage C`. Usuario ve B fugazmente y luego C. "Se devolvio" desde la perspectiva del usuario aunque tecnicamente no fue el stage anterior.

- **H3: Kanban bounce-back 2s timeout** — **5-10%** (bajo desde 10-15%)
  - Nueva auditoria confirmo que no hay rebote automatico en UI. Solo pasaria si `revalidatePath` tarda >2s Y DB fue modificada por fuente externa en esa ventana. Raro pero posible.

- **H5 DESCARTADAS:** Shopify webhook directo, robot callbacks directos, DB triggers. Ninguno muta `stage_id` — solo emiten triggers que las automations procesan. Son vectores indirectos, no causa raiz.

### Callers de `moveOrderToStage` (lista completa confirmada)
1. `src/app/actions/orders.ts:518, 605, 825` — Kanban manual + bulk.
2. `src/app/api/mobile/orders/[id]/stage/route.ts:51` — Mobile API (Phase 43).
3. `src/lib/automations/action-executor.ts:314` — `executeChangeStage`.
4. `src/lib/agents/crm-writer/tools/orders.ts` — tool propose (via two-step).
5. `src/lib/agents/crm-writer/two-step.ts` — confirm step.
6. `src/lib/tools/handlers/crm/index.ts` — agent tool handlers.

Todos heredan el fix de compare-and-swap en domain (D-04). **Cero gaps de cobertura.**

</specifics>

<deferred>
## Deferred Ideas

- **UI timeline visual** de `order_stage_history` en la sheet del pedido. Util para que usuario/soporte diagnostique devoluciones historicas. Dejar para fase posterior cuando tabla tenga data acumulada.
- **Backfill de `order_stage_history` desde `mutation_audit`**: baja prioridad, alto costo. Solo si aparece necesidad real.
- **Generalizar kill-switch** a otros triggers (tag.assigned, contact.created): esperar a ver si aparecen loops en esos. YAGNI por ahora.
- **Refactor completo del cycle detector**: la mejora de `conditionsPreventActivation` (D-07 capa 1) es incremental — un refactor completo seria su propia fase.
- **WebSocket-level presence en Kanban** (ver quien esta viendo/moviendo un pedido en tiempo real): UX nice-to-have, sin relacion con el bug actual.
- **Make move_order_to_stage idempotent desde agents** (por correlation_id): el two-step pattern del crm-writer ya cubre esto. No duplicar aqui.

</deferred>

---

*Standalone: crm-stage-integrity*
*Context gathered: 2026-04-21*
