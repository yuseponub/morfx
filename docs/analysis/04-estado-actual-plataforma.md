# Estado Actual de Morfx — 19 de Febrero 2026

## Resumen Ejecutivo

Morfx es una plataforma SaaS de CRM + WhatsApp + Automatizaciones + Agentes IA construida para e-commerce COD (contra-entrega) en Colombia. En 23 dias de desarrollo (26 enero - 18 febrero 2026) se completaron 2 milestones mayores (v1.0 CRM+WhatsApp, v2.0 Agentes+Automatizaciones) con 33 fases, 151 planes ejecutados, 441+ commits y 92K LOC TypeScript.

El sistema esta **funcional en produccion** con el core completo: CRM multi-tenant, inbox WhatsApp con 360dialog, agente de ventas Somnio con IA (Claude), motor de automatizaciones con 13 triggers y 11 acciones, builder de automatizaciones con IA, integracion Shopify y SMS via Twilio. El domain layer (8 modulos, 32 funciones) es el single source of truth para todas las mutaciones.

Existen **69 issues documentados** en auditorias previas (25 de automaciones, 16 runtime, 11 seguridad, 5 hotfixes, 7 consistencia, 5 duplicaciones). Muchos fueron identificados pre-v2.0 y pueden estar resueltos; requieren verificacion cruzada con el codigo actual.

---

## Modulos del Sistema

### 1. CRM (Contactos, Pedidos, Productos)
- **Estado:** ✅ Funcional

#### Contactos (`src/lib/domain/contacts.ts`, `src/app/(dashboard)/crm/contactos/`)
- **CRUD completo:** Crear, editar, eliminar contactos con normalizacion E.164 de telefono
- **Tags:** Asignar/remover tags compartidos entre contactos, pedidos y conversaciones
- **Campos custom:** JSONB con definiciones tipadas (text, number, date, select, checkbox, URL, email, phone, currency, percentage, file, contact link)
- **Notas:** Timeline de notas con actividad automatica (trigger DB para diffs JSONB)
- **Historial:** Activity log automatico via trigger PostgreSQL
- **Import/Export:** CSV con BOM para Excel, batch inserts de 100
- **Busqueda:** Fuse.js client-side para <10K contactos
- **Vista detalle:** 5 tabs (Info, Tareas, Campos, Notas, Historial)
- **Funciona:** Todo lo listado arriba
- **Dummy/incompleto:** Nada
- **Bugs conocidos:** Phone no normalizado en `bulkCreateContacts` (D-5 audit)

#### Pedidos/Ordenes (`src/lib/domain/orders.ts`, `src/app/(dashboard)/crm/pedidos/`)
- **CRUD completo:** Crear, editar, eliminar, duplicar ordenes
- **Kanban:** Drag-and-drop con @dnd-kit, multi-pipeline, WIP limits por etapa
- **Productos:** Line items con snapshot pricing (precio al momento de la orden)
- **Etapas/Pipelines:** Configurables por workspace, order states con emoji
- **Tags de ordenes:** Junction table separada
- **Duplicacion:** Copy flags (copyContact, copyProducts, copyValue, copyTags)
- **Paginacion:** `getOrdersForStage(stageId, limit=20, offset=0)` para Kanban performante
- **Campos reales:** orders.name, orders.shipping_department (migration 20260217)
- **Recompra (quick-043, 2026-04-15):** Boton "Recompra" restringido al pipeline `Ventas Somnio Standard` (constante `RECOMPRA_PIPELINE_NAME` en `src/lib/domain/orders.ts`). UI filtra etapas al pipeline unico y usa `ProductPicker` para seleccion manual multiple (ya no copia productos del pedido origen). Defense-in-depth: domain valida nombre de pipeline + stage ∈ pipeline. Botones deshabilitados en 3 UIs (orders-table, orders-view/kanban, contact-panel WhatsApp, view-order-sheet) si el workspace no tiene ese pipeline.
- **Funciona:** Todo lo listado
- **Bugs conocidos:** Orders auto-refresh en WhatsApp inbox resuelto con polling 30s (Realtime no confiable con filtros non-PK)

#### Productos (`src/app/(dashboard)/crm/productos/`)
- **Catalogo:** CRUD completo con SKU, activo/inactivo
- **Shopify sync:** shopify_product_id para matching

#### Configuracion CRM
- **Pipelines:** CRUD completo (`/crm/configuracion/pipelines`)
- **Campos custom:** Manager completo (`/crm/configuracion/campos-custom`)
- **Estados de pedido:** Emoji-based indicators (`/crm/configuracion/estados-pedido`)

---

### 2. WhatsApp
- **Estado:** ✅ Funcional

#### Integracion 360dialog (`src/lib/whatsapp/`)
- **Envio texto:** `sendTextMessage()` via 360dialog Cloud API
- **Envio media:** Imagen, video, audio, documento, sticker con captions
- **Envio templates:** Templates Meta-aprobados con componentes dinamicos
- **Envio interactivo:** Botones (max 3, auto-truncados a 20 chars)
- **Recepcion:** Todos los tipos: texto, imagen, video, audio, documento, sticker, ubicacion, contactos, interactive replies, reacciones
- **Deduplicacion:** wamid unique constraint previene duplicados en reintentos
- **Media hosting:** Download de 360dialog (URLs expiran 5min) → re-host en Supabase Storage permanente
- **Costos:** Tracking por mensaje/pais/categoria (marketing, utility, authentication, service)

#### Inbox (`src/app/(dashboard)/whatsapp/`)
- **Conversaciones:** Lista con busqueda, filtros por estado/asignado
- **Chat:** Historial de mensajes con virtual scrolling
- **Quick replies:** Shortcuts (`!promo`) con media opcional (imagenes)
- **Templates:** Gestion completa (crear, editar, sync con 360dialog, estados PENDING/APPROVED/REJECTED)
- **Equipos:** Teams con assignment round-robin, last_assigned_at tracking
- **Emoji picker:** frimousse (2kb, React 19 compatible)
- **Envio optimistico:** Mensaje aparece instantaneamente con status 'sending', reemplazado por Realtime INSERT
- **Agent config:** Toggle agente por conversacion

#### Seguridad Webhook (`src/app/api/webhooks/whatsapp/route.ts`)
- **HMAC-SHA256:** Verificacion con timing-safe comparison
- **Token verification:** hub.verify_token para challenge
- **60s timeout:** Extendido para procesamiento de agente

#### Performance (Standalone Phase)
- **Canal consolidado:** 4 channels Realtime → 1 (`inbox:${workspaceId}`)
- **Updates quirurgicos:** No full refetch, spread payload.new
- **Query ligero:** Sin address/city en lista, solo id/name/color en tags
- **Funciona:** Todo lo listado
- **Bugs conocidos:**
  - Rate limiting no implementado en API de envio (W-1 audit)

---

### 2.5. Client Activation Badge
- **Estado:** ✅ Funcional

#### Configuracion (`/settings/activacion-cliente`)
- **is_client flag:** Campo boolean en contacts, activado por trigger DB cuando orden llega a etapa configurable
- **client_activation_config:** Tabla por workspace con enabled, all_are_clients, activation_stage_ids[]
- **Trigger DB:** `mark_client_on_stage_change()` — INSERT OR UPDATE en orders, chequea config y marca is_client + tag "Cliente"
- **Badge visual:** Circulo amber-500 con check en bottom-left del avatar en inbox WhatsApp
- **all_are_clients:** Modo frontend-only que muestra badge para todos sin escribir DB
- **Backfill:** Recalcula is_client para todo el workspace cuando cambian los stage_ids configurados
- **Realtime:** Listener en contacts.is_client para propagacion instantanea del badge
- **Backward compat:** Sigue asignando tag "Cliente" automaticamente

---

### 3. Agentes IA
- **Estado:** ✅ Funcional (session lifecycle bug corregido en Phase 42, completada 2026-04-07)

#### Agente Somnio (`src/lib/agents/somnio/`)
- **Proposito:** Bot de ventas para Somnio (almohadas) via WhatsApp
- **Intents:** 33 intents detectados (13 informativo, 8 flujo_compra, 1 escape, 11 combinaciones)
- **Intent detection:** IntentDetector con Claude Sonnet, confidence routing (proceed/clarify/handoff/reanalyze)
- **Data extraction:** 8 campos (nombre, telefono, direccion, ciudad, departamento, indicaciones, pack, cantidad)
- **Clasificacion ingest:** 4 categorias (datos=silencio, pregunta=responder, mixto=ambos, irrelevante=ignorar)
- **Templates:** Selection por intent + visit_type (primera_vez vs siguientes), configurable en DB
- **Orchestrator:** Claude Sonnet decide acciones basado en intent + conversation state
- **System prompts:** Intent (103L), Orchestrator (223L), Data Extractor (302L)

#### UnifiedEngine (`src/lib/agents/engine/unified-engine.ts`)
- **Arquitectura:** Ports/Adapters (Hexagonal) — 1 engine, 2 modos
- **Sandbox adapters:** In-memory state, no-op timers, display messaging, dry-run orders, debug collection
- **Production adapters:** SessionManager + Supabase, Inngest timers, WhatsApp messaging, real CRM orders, audit logging
- **Optimistic locking:** Version counter con retry (hasta 3 intentos)
- **Timer signals:** start/cancel/reevaluate propagados a adaptadores

#### OrderManagerAgent (`src/lib/agents/crm/order-manager/`)
- **Proposito:** Crea ordenes desde agente conversacional
- **Modos:** dry-run (mock) y live (real DB)
- **Tools:** crm.contact.create, crm.tag.add, crm.order.create

#### Agent Sandbox (`src/app/(dashboard)/sandbox/`)
- **Multi-panel debug:** Tools, Estado, Intent, Tokens, Ingest (max 3 panels)
- **CRM agent selection:** Dropdown con agentes registrados
- **DRY/LIVE badges:** Transparencia de modo
- **Per-model tokens:** Haiku vs Sonnet breakdown
- **Response speed:** Configurable (instant/normal/slow)
- **Session management:** Save/load sessions

#### Agent Config (`src/app/(dashboard)/agentes/`)
- **Metrics dashboard:** Performance por periodo
- **Config panel:** System prompt, tool availability (admin/owner only)
- **Per-workspace:** workspace_agent_config table

#### Timer System (Inngest)
- **5 niveles:** L0 (waiting) → L1 (partial) → L2 (escalate promos) → L3 (order/timeout) → L4 (final confirm)
- **Production:** Inngest durable events con step.waitForEvent() + step.sleep()
- **Sandbox:** Client-side simulation con IngestTimerSimulator
- **Cancel-before-start:** Pattern obligatorio para evitar duplicados

#### Funciona
- Intent detection + orchestration completo
- Data extraction con silent accumulation
- Template selection + substitution
- Timer system (sandbox + production)
- Order creation end-to-end
- WhatsApp integration bidireccional
- Sandbox testing environment

#### Bugs documentados (auditorias previas, verificar si resueltos)
- 6 stale closures en sandbox-layout.tsx (BUGS.md #1-3, #7)
- State mutation en sandbox-engine.ts (BUGS.md #4) — puede ser obsoleto tras UnifiedEngine
- Message sequencer race condition (BUGS.md #6)
- Template manager query injection (BUGS.md #11) — verificar si resuelto en domain layer

#### Bugs resueltos (hotfix 20 feb 2026)
- ~~ProductionOrdersAdapter no pasaba name, shippingCity, shippingDepartment a domainCreateOrder~~ — Resuelto: campos ahora se mapean desde datosCapturados
- ~~OrderCreator.updateContact no pasaba department al tool handler~~ — Resuelto: department ahora se incluye en crm.contact.update
- ~~contactUpdate tool handler no aceptaba ni delegaba department~~ — Resuelto: tipo ContactUpdateInput + domain call actualizados
- ~~webhook-processor no sincronizaba conversation.contact_id despues de order creation~~ — Resuelto: paso 9 actualiza contact_id si engine resolvio contacto diferente

#### Bugs resueltos (Phase 42, 2026-04-07 — Session Lifecycle)
- ~~`agent_sessions` nunca se cerraban en runtime~~ — Resuelto: nuevo cron Inngest `closeStaleSessionsCron` corre 02:00 COT diario y cierra sesiones con `last_activity_at < midnight Bogota`. RPC `close_stale_agent_sessions` con TZ-safe boundary
- ~~Clientes recurrentes bloqueados con error 23505~~ — Resuelto: partial unique index `(conversation_id, agent_id) WHERE status='active'` permite N filas historicas, solo 1 activa. `SessionManager.createSession` ahora hace retry-via-fetch en 23505
- ~~Bot permanentemente mudo tras decir "no" una vez~~ — Resuelto indirectamente: nuevas sesiones nacen con `accionesEjecutadas=[]`, asi `derivePhase()` no queda fossilizado en `'closed'`
- ~~Clientes con `handed_off` previo no podian reactivar conversacion~~ — Resuelto: el partial unique index ya no choca con filas `handed_off`. Validado en UAT con caso real (cliente con handed_off de 4 dias atras envio mensaje y bot respondio limpio)
- **Defensive timer-guard:** Helper `timer-guard.ts` agregado a 6 handlers V1+V3 (collecting_data, promos, resumen, cancel, etc.) hace early-return si la sesion fue cerrada por el cron mientras el timer dormia

---

### 4. Automatizaciones
- **Estado:** ✅ Funcional

#### Motor de Automatizaciones (`src/lib/automations/`)

**13 Triggers (`TRIGGER_CATALOG`):**

| Trigger | Categoria | Config |
|---------|-----------|--------|
| `order.stage_changed` | CRM | pipelineId, stageId |
| `tag.assigned` | CRM | tagId |
| `tag.removed` | CRM | tagId |
| `contact.created` | CRM | (none) |
| `order.created` | CRM | pipelineId, stageId |
| `field.changed` | CRM | fieldName |
| `whatsapp.message_received` | WhatsApp | (none) |
| `whatsapp.keyword_match` | WhatsApp | keywords[] |
| `task.completed` | Tareas | (none) |
| `task.overdue` | Tareas | (none) |
| `shopify.order_created` | Shopify | (none) |
| `shopify.draft_order_created` | Shopify | (none) |
| `shopify.order_updated` | Shopify | (none) |

**11 Acciones (`ACTION_CATALOG`):**

| Action | Categoria | Key Params |
|--------|-----------|-----------|
| `assign_tag` | CRM | tagName, entityType |
| `remove_tag` | CRM | tagName, entityType |
| `change_stage` | CRM | stageId |
| `update_field` | CRM | entityType, fieldName, value |
| `create_order` | Ordenes | pipelineId, stageId, contactId, copy flags |
| `duplicate_order` | Ordenes | targetPipelineId, copy flags |
| `send_whatsapp_template` | WhatsApp | templateName, language, variables |
| `send_whatsapp_text` | WhatsApp | text (requiere ventana 24h) |
| `send_whatsapp_media` | WhatsApp | mediaUrl, caption, filename |
| `create_task` | Tareas | title, description, priority, dueDateRelative |
| `send_sms` | Twilio | body, to, mediaUrl |
| `webhook` | Integraciones | url, headers, payloadTemplate |

**Subsistemas:**
- **Trigger emission:** 13 emitter functions, cascade depth check (MAX=3)
- **Condition evaluation:** Recursive AND/OR groups, 14 operadores
- **Variable resolution:** Dual context — TriggerContext (flat) + variableContext (nested, Spanish paths)
- **Action execution:** Domain-delegated, 1114 lines, contact resolution para triggers externos
- **Inngest runners:** Factory pattern, 13 runners durables con step.run() + step.sleep()
- **Cycle detection:** MAX_CASCADE_DEPTH=3, context-aware

#### Wizard UI (`src/app/(dashboard)/automatizaciones/`)
- **3 pasos:** Trigger → Condiciones → Acciones
- **Campos opcionales:** Dropdown "Agregar campo" para params opcionales
- **Historial:** Execution history con paginacion y filtros

#### AI Automation Builder (`src/app/(dashboard)/automatizaciones/builder/`)
- **Chat con Claude:** Streaming via AI SDK v6
- **Creacion natural language:** "Cuando un pedido llegue a Confirmado, enviar template de confirmacion"
- **React Flow diagram:** Preview visual inline en chat
- **Validacion:** Resource existence, cycle detection context-aware, duplicate detection
- **Session management:** Persistencia con createAdminClient

#### Funciona
- Engine completo (trigger → condition → action → cascade)
- Wizard UI funcional
- AI Builder funcional
- Historial de ejecuciones
- Delays en acciones (step.sleep)
- Contact resolution para triggers Shopify

#### Bugs documentados (CRM-AUTOMATIONS-AUDIT.md)
- ~~5 Critical: Variable key mismatches~~ — Resuelto: field.changed y whatsapp.* keys correctas; task.overdue fix (quick-004) agrego taskDescription y contactName
- **Major restantes:** Missing data en algunos emitters menores
- **12 Minor:** Catalog inconsistencies
- ~~AI Builder cycle detection~~ — Resuelto: usa .conditions, field names en español, soporta nested groups

---

### 5. Tareas
- **Estado:** ✅ Funcional

#### Task Management (`src/lib/domain/tasks.ts`, `src/app/(dashboard)/tareas/`)
- **CRUD:** Crear, editar, completar, eliminar tareas
- **Exclusive arc:** Una tarea se vincula a maximo 1 entidad (contacto/orden/conversacion)
- **Tipos de tarea:** Customizables por workspace (color, posicion)
- **Prioridad:** low/medium/high
- **Status lifecycle:** pending → completed (con completed_at automatico via trigger)
- **Activity log:** Immutable audit trail (created, updated, completed, reopened, due_date_changed)
- **Postponement tracking:** postponement_count incrementado cuando due_date avanza
- **Notas de tarea:** CRUD con author tracking
- **Overdue cron:** Inngest cada 15 min, emite task.overdue para automatizaciones (ventana 24h)
- **Funciona:** Todo lo listado
- **Placeholder:** Reminders/Notificaciones marcado "Proximamente"
- **Bugs:** Task timestamps usan UTC en vez de Colombia timezone (D-4 audit)

---

### 6. Analytics
- **Estado:** ✅ Funcional

#### Sales Analytics (`src/app/(dashboard)/analytics/`)
- **Metricas:** Count, total revenue, avg value por periodo
- **Trend:** Graficos de tendencia de ventas
- **Period selector:** 7 dias default, configurable
- **Role-based:** Agents redirigidos a /crm/pedidos
- **Funciona:** Metricas basicas y tendencias
- **Limitaciones:** No hay reportes exportables, no PDF, no custom date ranges avanzados

#### Metricas de Conversaciones (`src/app/(dashboard)/metricas/`)
- **Estado:** ✅ Funcional (activo solo en GoDentist Valoraciones)
- **Tipo:** Dashboard read-only con actualizacion realtime hibrida (Supabase Realtime sobre `messages` + `contact_tags`, re-fetch del RPC en cada evento)
- **Metricas calculadas:**
  - Conversaciones **nuevas** del dia (primer mensaje inbound historico del contacto)
  - Conversaciones **reabiertas** del dia (contacto que vuelve tras N dias de silencio, default 7)
  - Valoraciones **agendadas** del dia (tag configurable, default `VAL`)
- **Backend:** Postgres RPC `get_conversation_metrics(workspace_id, start, end, reopen_days, tag_name)` con CTE + `LAG()` window function, SECURITY INVOKER
- **Selector temporal:** Hoy / Ayer / 7d / 30d / rango custom (date picker)
- **Activacion por workspace:** gated por `workspaces.settings.conversation_metrics.enabled` (JSONB, default `false`). Todos los workspaces heredan el modulo pero solo lo ven si el flag esta activo.
- **Workspaces activos:** GoDentist Valoraciones
- **Permisos:**
  - Dashboard (`/metricas`): **todos** los usuarios del workspace (owner/admin/agent) — excepcion explicita vs Sales Analytics que es admin-only
  - Settings (`/metricas/settings`): solo owner/admin (agent redirigido a `/metricas`)
- **Sidebar:** item condicional via mecanismo `settingsKey` en `NavItem` (nuevo en plan 05) — se muestra solo cuando `conversation_metrics.enabled === true`
- **Configuracion editable desde UI:**
  - `enabled` (toggle)
  - `reopen_window_days` (1–90, default 7)
  - `scheduled_tag_name` (texto libre, default `VAL`)
- **Key files:**
  - `src/app/(dashboard)/metricas/page.tsx` — dashboard gated por flag
  - `src/app/(dashboard)/metricas/components/` — view, period selector, metric cards, chart, hook realtime
  - `src/app/(dashboard)/metricas/settings/page.tsx` — pagina de configuracion admin-only
  - `src/app/actions/metricas-conversaciones.ts` — server action que ejecuta el RPC
  - `src/app/actions/metricas-conversaciones-settings.ts` — server action que actualiza settings (auth + rol)
  - `src/lib/domain/workspace-settings.ts` — `updateConversationMetricsSettings` (merge en JSONB preservando siblings)
  - `src/lib/metricas-conversaciones/types.ts` — tipos `MetricsSettings`, `MetricsPayload`, `Period`, etc.
  - `supabase/migrations/` — RPC `get_conversation_metrics` + publicacion realtime de `messages` / `contact_tags`
- **Bugs conocidos:** ninguno al cierre del plan 05
- **Deuda tecnica:** ninguna al cierre del plan 05

---

### 7. Integraciones

#### Shopify (`src/lib/shopify/`, `src/app/api/webhooks/shopify/`)
- **Estado:** ✅ Funcional
- **Webhooks:** orders/create, orders/updated, draft_orders/create
- **HMAC verification:** SHA256 con timing-safe comparison
- **Dual-mode:** Auto-sync (crea contact+order) o trigger-only (solo automatizacion)
- **Contact matching:** Phone exacto → fuzzy name+city (Fuse.js + Double Metaphone)
- **Product matching:** SKU, name (fuzzy), o price-based
- **Idempotencia:** X-Shopify-Webhook-Id deduplication
- **Phone extraction:** Primary + secondary de note_attributes (Releasit COD)

#### Twilio SMS (`src/lib/twilio/`, `src/app/api/webhooks/twilio/status/`)
- **Estado:** ⚠️ Parcial
- **Envio SMS:** ✅ Funcional via automation action executor
- **Status callbacks:** ✅ Delivery status tracking (queued → sent → delivered/failed)
- **Recepcion SMS:** ❌ NO IMPLEMENTADO — no hay endpoint inbound
- **MMS:** ⚠️ Campo DB existe pero no integrado completamente

#### 360dialog WhatsApp
- **Estado:** ✅ Funcional (detallado en seccion WhatsApp)

---

### 8. Auth & Workspaces
- **Estado:** ✅ Funcional

#### Autenticacion (`src/app/(auth)/`)
- **Login:** Email + password via Supabase Auth
- **Signup:** Registro con verificacion email
- **Password reset:** Forgot + reset flow completo
- **OAuth callback:** Supabase-handled
- **Invitation links:** Token-based workspace invitations

#### Multi-tenancy
- **Workspaces:** Multi-tenant desde dia 1
- **Roles:** owner, admin, agent con permisos granulares
- **RLS:** Todas las tablas con `is_workspace_member()` helper
- **Cookie-based:** workspace_id en cookie, server actions lo leen explicitamente
- **Workspace switching:** Supported via cookie change
- **Create workspace:** Form dedicado con deteccion first-workspace
- **Funciona:** Todo lo listado
- **Placeholder:** Workspace name/slug editing marcado "Proximamente"

---

### 9. Domain Layer (`src/lib/domain/`)
- **Estado:** ✅ Funcional — Single Source of Truth

| Archivo | Funciones | Status | Triggers |
|---------|-----------|--------|----------|
| `contacts.ts` | 4 (create, update, delete, bulkCreate) | ✅ | contact.created, field.changed |
| `conversations.ts` | 4 (assign, archive, link, findOrCreate) | ✅ | None |
| `messages.ts` | 4 (sendText, sendMedia, sendTemplate, receive) | ✅ | message_received, keyword_match |
| `orders.ts` | 7 (create, update, moveStage, delete, duplicate, addTag, removeTag) | ✅ | order.created, stage_changed, field.changed, tag.* |
| `tags.ts` | 2 (assign, remove) | ✅ | tag.assigned, tag.removed |
| `tasks.ts` | 4 (create, update, complete, delete) | ✅ | task.completed |
| `notes.ts` | 6 (CRUD contact + CRUD task notes) | ✅ | None (activity logs) |
| `custom-fields.ts` | 2 (update, read) | ✅ | field.changed |

**Patron:** Todas las funciones usan `createAdminClient()`, filtran por `workspace_id`, retornan `DomainResult<T>`.

**Lo que NO pasa por domain layer (config modules):**
- Pipelines CRUD (8 server actions directas)
- Automations CRUD (5 server actions directas)
- Teams CRUD (7 server actions directas)
- Tags CRUD (3 server actions directas)
- Quick replies, workspace settings, task types

---

### 10. Logistica — Generacion de Guias

- **Estado:** ✅ Funcional
- **Flujos:** 4 — Coordinadora (robot Railway + portal), Envia (Excel .xlsx), Inter (PDF), Bogota (PDF)
- **Orchestrator:** `src/inngest/functions/robot-orchestrator.ts` (2 orchestrators: `excelGuideOrchestrator`, `pdfGuideOrchestrator`)
- **Generadores:** `src/lib/pdf/generate-guide-pdf.ts` (Inter+Bogota, PDFKit), `src/lib/pdf/generate-envia-excel.ts` (ExcelJS)
- **Normalizer:** Claude AI en `src/lib/pdf/normalize-order-data.ts` con fallback `buildFallbackOrder`
- **Server action:** `executeSubirOrdenesCoord` en `src/app/actions/comandos.ts`
- **2026-04-17 (crm-verificar-combinacion-productos):** Agregada deteccion de combinacion de productos en los 4 flujos de generacion de guias. Helpers en `src/lib/orders/product-types.ts` (`isSafeForCoord`, `isMixedOrder`, `formatProductLabels`, `detectOrderProductTypes`). Coord filtra server-side las ordenes con productos fuera de stock en bodega Coord (Ashwagandha, Magnesio Forte) y renderiza warning detallado con orderName + products + reason. Envia Excel marca filas mixed con fondo amarillo y agrega columna `COMBINACION` al final. Inter/Bogota PDF muestran caja naranja condicional "COMBINACION: {labels}" entre logo y primer separador solo para ordenes mixed (Pitfall fillColor reset mitigated). Safe orders (Elixir puro) quedan pixel-identicas al comportamiento previo. Event shapes Inngest intactos.

---

### 11. CRM Bots (Phase 44)

- **Estado:** ✅ SHIPPED 2026-04-18 (pending production kill-switch verification — Task 6)
- **Proposito:** Dos agentes IA internos expuestos como API HTTP para callers agent-to-agent (otros agentes de la plataforma o integraciones externas con API key). `crm-reader` es solo lectura; `crm-writer` es escritura con flujo obligatorio two-step propose→confirm.

#### Endpoints (`src/app/api/v1/crm-bots/`)
- `POST /api/v1/crm-bots/reader` — LLM con tools read-only: `contacts_search`, `contacts_get`, `orders_list`, `orders_get`, `pipelines_list`, `stages_list`, `tags_list`. Responde texto natural + toolCalls trazados en observability.
- `POST /api/v1/crm-bots/writer/propose` — LLM con tools mutation: `createContact`, `updateContact`, `archiveContact`, `createOrder`, `updateOrder`, `archiveOrder`, `moveOrderToStage`, `createNote`, `archiveNote`, `createTask`, `updateTask`, `completeTask`. **NO muta.** Cada tool llama `proposeAction(...)` que inserta fila en `crm_bot_actions` con status='proposed', TTL 5min, y retorna `{action_id, preview, expires_at}`.
- `POST /api/v1/crm-bots/writer/confirm` — Recibe `{actionId}`, ejecuta optimistic `UPDATE crm_bot_actions SET status='executing' WHERE id=? AND status='proposed'` (idempotencia por race), despacha el domain call real, marca 'executed' con output. **No invoca LLM.** Segundo confirm retorna `already_executed` con el mismo output.

#### Autenticacion y Aislamiento
- **API key per workspace** via `Authorization: Bearer mfx_...` + middleware inyecta `x-workspace-id` del header del API key (NUNCA del body — Pitfall 4 mitigated).
- **Agentes aislados:** `src/lib/agents/crm-reader/` y `src/lib/agents/crm-writer/` son carpetas fisicamente separadas con tool registries separados. Blocker 1 enforcement: grep verificado que ningun tool file importa `createAdminClient` o `@supabase/supabase-js` — todos pasan por domain layer. El unico archivo del writer que usa `createAdminClient` es `two-step.ts` y exclusivamente contra `crm_bot_actions`.

#### Rate Limiting + Kill-Switch
- **Rate limit:** `50 calls/min per workspace` (shared bucket `'crm-bot'` entre reader + writer — invariante Warning #8 enforced con grep: exactamente 3 call sites en los 3 endpoints). Configurable via `platform_config.crm_bot_rate_limit_per_min` (Phase 44.1).
- **Kill-switch:** `platform_config.crm_bot_enabled=false` → 503 con code=KILL_SWITCH en siguientes requests. Leido per-request via `getPlatformConfig` (cache TTL 30s — Phase 44.1 eliminates Blocker 6).
- **Phase 44.1 (2026-04-19):** las 3 vars operacionales migradas de Vercel env a `platform_config` table. Kill-switch ahora flipeable via SQL sin redeploy. Ver seccion dedicada abajo.
- **Email alerts** via Resend a `joseromerorincon041100@gmail.com`:
  - Runaway alert cuando rate-limit 429 dispara (dedupe 15 min in-memory).
  - Approaching-limit alert cuando uso >80%.
  - FROM address parametrizable via `platform_config.crm_bot_alert_from` (Phase 44.1 — antes env var).

#### Observability
- **Cada call** (reader, propose, confirm) escribe fila en `agent_observability_turns` con `trigger_kind='api'`, `agent_id` correcto ('crm-reader' o 'crm-writer'), tokens + costos + duration. Consulta retroactiva via el mismo panel que otros agentes (Phase 42.1).
- **Writer actions adicional:** cada propose + confirm se persiste en tabla nueva `crm_bot_actions` con lifecycle `proposed → executing → executed/expired/failed`. Inngest cron `crm-bot-expire-proposals` marca como `expired` las filas con `expires_at < now() - 30s` (grace period contra race con confirm in-flight, Pitfall 7).

#### Error Shape (Blocker 4)
- `ResourceNotFoundError.resource_type` cubre 9 entity types: base no-creables (`tag | pipeline | stage | template | user`) + mutables (`contact | order | note | task`). Cuando el writer recibe un `tagId` inexistente en `createContact`, retorna `resource_not_found` con `suggested_action: 'create manually in UI'` en vez de inventar el recurso.

#### Deuda Tecnica Aceptada
- **In-memory rate limiter:** Pitfall 1 accepted — en Vercel con multiples instancias warm cada una tiene su propio contador; el limite real puede ser 2-3x el configurado durante bursts. Migrar a Redis/Upstash en V2.
- **Sin daily cap:** solo deteccion de runaway con rate limit per-minute + alerta email. No hay cap diario/mensual por workspace (deliberate — MVP, revisar cuando haya datos de uso real).
- **Sin UI humana:** para revisar/aprobar actions propuestas — los actions expiran a los 5min si ningun caller los confirma. En V2 considerar dashboard para super-users que vea pending actions.
- **~~Kill-switch requiere redeploy~~:** RESUELTO en Phase 44.1 (2026-04-19). Kill-switch ahora en `platform_config.crm_bot_enabled` — flipeable via SQL sin redeploy. Propagacion visible en <=30s (cache TTL).
- **Tests de Phase 44 rotos post-44.1:** `src/__tests__/integration/crm-bots/{reader,security}.test.ts` todavia mockean `process.env.CRM_BOT_ENABLED` y fallaran contra la nueva arquitectura. Tagged out-of-scope de 44.1 (D6 — refactor solo de los 4 archivos consumidores). P1 — requiere fase follow-up para actualizar a mock de `getPlatformConfig`.

#### Referencias
- **Codigo:** `src/app/api/v1/crm-bots/`, `src/lib/agents/crm-reader/`, `src/lib/agents/crm-writer/`, `src/inngest/functions/crm-bot-expire-proposals.ts`, `src/lib/domain/platform-config.ts` (Phase 44.1)
- **Schema:** migrations `crm_bot_actions` table + `archived_at` columns en 4 tablas (contacts, orders, contact_notes, order_notes) + `platform_config` table (Phase 44.1)
- **Plan artifacts:** `.planning/phases/44-crm-bots/` (9 planes + SUMMARY + LEARNINGS + INVARIANTS), `.planning/phases/44.1-crm-bots-config-db/` (config relocation)
- **Scope enforcement:** `.claude/rules/agent-scope.md` documenta PUEDE/NO PUEDE para ambos agentes (MANDATORIO al crear agente nuevo)

---

### 11.1 Config runtime — platform_config (Phase 44.1)

- **Estado:** ✅ SHIPPED 2026-04-19
- **Proposito:** Relocar config runtime no-secret de CRM bots desde Vercel env vars a una tabla centralizada en Supabase. Habilita kill-switch via SQL sin redeploy (resuelve Blocker 6 de Phase 44) y prepara base para per-workspace overrides + admin UI en fases futuras.

#### Tabla `platform_config`

```
CREATE TABLE platform_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

Sin RLS — acceso server-only via `createAdminClient()` (mismo patron que `crm_bot_actions`). Sin indexes adicionales (3 filas seed).

#### Keys actualmente seeded

| Antigua env var (Vercel)     | Nueva key en platform_config   | Tipo JSONB     | Fallback si DB falla |
|------------------------------|--------------------------------|----------------|----------------------|
| `CRM_BOT_ENABLED`            | `crm_bot_enabled`              | boolean        | `true` (fail-open)   |
| `CRM_BOT_RATE_LIMIT_PER_MIN` | `crm_bot_rate_limit_per_min`   | number         | `50`                 |
| `CRM_BOT_ALERT_FROM`         | `crm_bot_alert_from`           | string or null | `null` → sandbox Resend |

- **Lectura:** `getPlatformConfig<T>(key, fallback)` en `src/lib/domain/platform-config.ts`. Cache in-memory 30s TTL por lambda instance (`PLATFORM_CONFIG_TTL_MS = 30_000`).
- **Kill-switch operativo:** `UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled'` en Supabase Studio. Efecto visible en <=30s, sin redeploy de Vercel.
- **Consistencia multi-instance:** hasta 30s de divergencia entre lambdas tras un flip (Pitfall 4 de 44.1-RESEARCH). Aceptable para operacion normal — kill-switch es soft-guard; hard-kill sigue siendo desactivar la API key a nivel workspace.
- **Fail-open policy:** errores de DB retornan fallback (NUNCA throw). Si DB cae, bots siguen activos con limite 50 y FROM sandbox — degradacion al estado pre-Phase-44.1.
- **`RESEND_API_KEY` SIGUE en Vercel env** — es secret y debe ser secret-managed. NO mover secrets a `platform_config`.

#### Archivos afectados (refactor)

- `src/lib/domain/platform-config.ts` (nuevo helper + cache)
- `src/app/api/v1/crm-bots/reader/route.ts`
- `src/app/api/v1/crm-bots/writer/propose/route.ts`
- `src/app/api/v1/crm-bots/writer/confirm/route.ts`
- `src/lib/agents/_shared/alerts.ts`
- `src/lib/tools/rate-limiter.ts` (nuevo param opcional `opts.limit`)

#### QA procedure update — Phase 44 Plan 09 Task 6

El QA del kill-switch de Phase 44 cambio:
- **Antigua:** "Set `CRM_BOT_ENABLED=false` in Vercel env + redeploy → verify 503"
- **Nueva:** "`UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled'` → wait 30s → verify 503 → revert con `'true'::jsonb`"

#### Deuda tecnica abierta (futuras fases, NO en 44.1)

- **Admin UI** para editar `platform_config` sin SQL (actualmente solo via Supabase Studio SQL Editor).
- **Columna `workspace_id UUID NULL`** para per-workspace overrides (D8 — schema cambio non-breaking cuando llegue).
- **Endpoint `POST /admin/invalidate-config`** con header secret para forzar cache clear — util para urgencias donde no se puede esperar 30s de propagacion.
- **Audit trail** de cambios (quien/cuando) — `platform_config.updated_at` captura timestamp, pero falta `actor_id`. Out of scope single-operator MVP.

#### Referencias

- **Codigo:** `src/lib/domain/platform-config.ts`
- **Schema:** `supabase/migrations/20260420000443_platform_config.sql`
- **Plan artifacts:** `.planning/phases/44.1-crm-bots-config-db/` (CONTEXT + RESEARCH + 01-PLAN + SUMMARY)
- **Threat model:** 44.1-01-PLAN `<threat_model>` seccion — T-44.1-01..08 documentados con dispositions.

---

### 11.2 Integracion somnio-recompra ↔ crm-reader (Standalone: somnio-recompra-crm-reader)

- **Estado:** ✅ SHIPPED 2026-04-21 (flag default `false` — Regla 6 rollout gradual; activacion manual en Task 3 checkpoint)
- **Proposito:** Enriquecer la sesion del agente `somnio-recompra-v1` con contexto rico del cliente (ultimo pedido con items, tags activos, total de pedidos, direccion mas reciente) invocando al agente `crm-reader` de forma asincrona, **sin bloquear el saludo del turno 0**. Primera integracion agent-to-agent in-process del repo.

#### Flujo end-to-end

1. `webhook-processor` crea la sesion de recompra via `V3ProductionRunner.processMessage` y envia el saludo (latencia <200ms usando solo `contact.name`).
2. Post-runner, si `platform_config.somnio_recompra_crm_reader_enabled === true`, emite `await inngest.send({ name: 'recompra/preload-context', data: { sessionId, contactId, workspaceId, invoker: 'somnio-recompra-v1' } })` con fail-open try/catch.
3. Inngest function `recompra-preload-context` (retries=1, concurrency=1 por `sessionId`) llama a `processReaderMessage` con `AbortSignal.timeout(12_000)`, y escribe merge-safe `_v3:crm_context` + `_v3:crm_context_status` (`'ok' | 'empty' | 'error'`) en `session_state.datos_capturados`.
4. En el turno 1+, `somnio-recompra-agent.processUserMessage` invoca `pollCrmContext(sessionId, datosCapturados)` antes de `comprehend`: fast-path si el marker ya esta en el snapshot, poll DB de 500ms × 6 iteraciones (3s max) si no. Timeout retorna `{ crmContext: null, status: 'timeout' }`.
5. Al obtener `status='ok'`, el helper merge el texto a `input.datosCapturados`; el `buildSystemPrompt` del `comprehension-prompt.ts` inyecta una seccion dedicada `## CONTEXTO CRM DEL CLIENTE (precargado)` ANTES de `DATOS YA CAPTURADOS` y filtra keys `_v3:*` del JSON dump. Haiku analiza con contexto rico; si status != `'ok'`, el prompt queda byte-identical al pre-fase.

#### Feature flag (Regla 6)

- Key: `somnio_recompra_crm_reader_enabled` (seed en migration `20260421155713_seed_recompra_crm_reader_flag.sql`, default `false`).
- Doble guard: webhook-processor (evita coste `inngest.send` cuando disabled) + Inngest function (defense-in-depth, early-return `skipped/feature_flag_off`).
- Flipeable via SQL sin redeploy (`UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';`); propagacion ≤30s (`getPlatformConfig` cache TTL).

#### Observability (Phase 42.1)

Emite 5 eventos `pipeline_decision:*` consumibles desde el dashboard de observability:
- `crm_reader_dispatched` — webhook-processor envio el event (intencion registrada ANTES del send).
- `crm_reader_completed` / `crm_reader_failed` — Inngest function termino ok/empty o fallo con timeout/exception (metrics: durationMs, toolCallCount, steps, textLength).
- `crm_context_used` — agent turno 1+ obtuvo `status='ok'` tras poll DB (no se emite en fast-path — el contexto ya estaba en el snapshot).
- `crm_context_missing_after_wait` — agent espero 3s sin exito (`status='timeout'|'error'|'empty'`); turno procede sin contexto (D-14).

#### Tests

- `src/inngest/functions/__tests__/recompra-preload-context.test.ts` — 5 branches (flag off, idempotency, ok, empty, error).
- `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` — 4 branches (flag off, flag on+sessionId, sessionId empty, send throws).
- `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` — 7 branches (3 fast-paths + poll ok + timeout + status=error + transient swallow) con `vi.useFakeTimers()`.
- `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` — 10 branches (inject, filter, 3 no-inject, edge cases).
- Total: **26 unit tests** todos passing.

#### Referencias

- **Codigo:** `src/inngest/functions/recompra-preload-context.ts` (Inngest function), `src/lib/agents/production/webhook-processor.ts` (dispatch, lines ~233-309), `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` (poll + processUserMessage wire), `src/lib/agents/somnio-recompra/comprehension-prompt.ts` (prompt inject), `src/inngest/events.ts` (`RecompraPreloadEvents` schema), `src/lib/agents/crm-reader/types.ts` + `index.ts` (abortSignal pass-through).
- **Schema:** `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql`.
- **Plan artifacts:** `.planning/standalone/somnio-recompra-crm-reader/` (CONTEXT + RESEARCH + PATTERNS + 01..07-PLAN + 01..07-SUMMARY).
- **Scope enforcement:** `.claude/rules/agent-scope.md` §CRM Reader Bot → "Consumidores in-process documentados" bullet (D-17).

---

## API Endpoints

| Endpoint | Metodos | Auth | Status | Funcion |
|----------|---------|------|--------|---------|
| `/api/agents/somnio` | POST | Workspace | ✅ | Procesa mensajes con SomnioEngine |
| `/api/builder/chat` | POST | Supabase + workspace | ✅ | Streaming AI builder con Claude |
| `/api/builder/sessions` | GET, DELETE | Supabase + workspace | ✅ | CRUD sesiones builder |
| `/api/inngest` | GET, POST, PUT | Inngest signature | ✅ | Execution endpoint Inngest functions |
| `/api/sandbox/crm-agents` | GET | None | ✅ | Lista agentes CRM disponibles |
| `/api/sandbox/process` | POST | Supabase | ✅ | Procesamiento sandbox UnifiedEngine |
| `/api/v1/tools` | GET | None | ✅ | Tool discovery (MCP-compatible) |
| `/api/v1/tools/[toolName]` | GET, POST | API key | ✅ | Tool execution + schema |
| `/api/v1/crm-bots/reader` | POST | API key + kill-switch | ✅ | CRM Reader Bot (Phase 44) — LLM read-only con 7 tools |
| `/api/v1/crm-bots/writer/propose` | POST | API key + kill-switch | ✅ | CRM Writer Bot propose (Phase 44) — LLM proposes mutations, no side effects |
| `/api/v1/crm-bots/writer/confirm` | POST | API key + kill-switch | ✅ | CRM Writer Bot confirm (Phase 44) — ejecuta propuesta (idempotent, no LLM) |
| `/api/webhooks/shopify` | GET, POST | HMAC-SHA256 | ✅ | Shopify order webhooks |
| `/api/webhooks/twilio/status` | POST | Trusted IP | ✅ | SMS delivery status callbacks |
| `/api/webhooks/whatsapp` | GET, POST | HMAC + token | ✅ | 360dialog message webhooks |

---

## Background Jobs (Inngest)

| Funcion | Trigger | Status | Descripcion |
|---------|---------|--------|-------------|
| `whatsappAgentProcessor` | `agent/whatsapp.message_received` | ✅ | Procesa mensajes con SomnioEngine produccion |
| Agent Timer (collecting_data) | `agent/collecting_data.started` | ✅ | Timer 6min para datos parciales |
| Agent Timer (promos) | `agent/promos.offered` | ✅ | Timer 10min para promos sin respuesta |
| Agent Timer (resumen) | `agent/resumen.started` | ✅ | Timer 10min para confirmacion final |
| Agent Timer (cancel) | `agent/customer.message` | ✅ | Cancela timers pendientes |
| `taskOverdueCron` | Cron `*/15 * * * *` | ✅ | Escanea tareas vencidas, emite triggers |
| AutomationRunner x13 | `automation/*` events | ✅ | 13 runners (1 por trigger type) via factory |
| `crmBotExpireProposals` | Cron periodic (Phase 44) | ✅ | Marca `crm_bot_actions` con `status='proposed'` y `expires_at < now()-30s` como `expired` (grace window contra race con confirm in-flight) |

---

## Base de Datos

### Tablas Principales (37 tablas)

**Core:** workspaces, workspace_members, workspace_invitations
**CRM:** contacts, contact_tags, contact_notes, contact_activity, custom_field_definitions
**Orders:** orders, order_products, order_tags, products, pipelines, pipeline_stages, order_states, saved_views
**WhatsApp:** conversations, messages, whatsapp_templates, teams, team_members, quick_replies, message_costs, workspace_limits, conversation_tags
**Tasks:** tasks, task_types, task_notes, task_activity
**Agents:** agent_sessions, agent_turns, session_state, agent_templates, workspace_agent_config
**Config:** client_activation_config
**Automations:** automations, automation_executions, builder_sessions
**Integrations:** integrations, webhook_events, sms_messages
**System:** tool_executions, api_keys

### Migraciones
- **25 migraciones aplicadas** (20260127 → 20260217)
- **11 archivos renombrados** (pendiente deploy — git status muestra rename con timestamps normalizados)
- **RLS:** Todas las tablas con policies usando `is_workspace_member()`

### Functions & Triggers DB
- `is_workspace_member()`, `is_workspace_admin()`, `is_workspace_manager()`, `is_workspace_owner()`
- `update_order_total()` — Auto-calcula total desde line items
- `update_conversation_on_message()` — Auto-actualiza preview, unread_count
- `log_contact_changes()` — JSONB diff para activity
- `log_task_changes()` — JSONB diff para task activity
- `set_task_completed_at()` — Auto-set timestamp en status='completed'
- `mark_client_on_stage_change()` — Marca is_client=true y auto-tag "Cliente" cuando orden llega a etapa de activacion configurable

---

## Tools (Action DSL)

**29 tools registrados** (22 CRM + 7 WhatsApp), todos con implementacion REAL:

**CRM (22):** contact.create/update/delete/read/list, tag.add/remove, order.create/update/updateStatus/delete/duplicate/list, task.create/update/complete/list, note.create/list/delete, custom-field.update/read
**WhatsApp (7):** message.send/list, template.send/list, conversation.list/assign/close

Todos los handlers delegan al domain layer. `initializeTools()` requerido en cualquier entry point serverless.

---

## Deuda Tecnica (Priorizada)

### P0 — Critica (Seguridad/Data Integrity)

*Todos los P0 resueltos.*

### P1 — Alta (Funcionalidad)

1. **Webhook WhatsApp sin store-before-process** — Si `processWebhook()` falla, el mensaje inbound se pierde. Se retorna 200 a 360dialog (correcto para evitar retries) pero no hay recovery. Solucion pendiente: guardar raw payload en `webhook_events` antes de procesar.
2. **AI Builder cycle detection incompleto** — Los 3 bugs criticos fueron resueltos (.conditions, Spanish names, nested groups), pero solo cubre 3 de 20+ campos de condicion y 4 de 13 trigger types. Triggers no cubiertos defaults a severity 'possible'.

### P2 — Media (Mejoras)

3. **Server actions sin domain layer** — Config modules (pipelines, teams, tags CRUD, etc.) escriben directo a Supabase
4. **No rate limiting** en API routes (sandbox, agents, tools)
5. **Twilio inbound SMS** no implementado
6. **Task timestamps UTC** — Deberian usar America/Bogota
7. **Phone normalization inconsistente** — 4 implementaciones diferentes (consolidar a 1)
8. **Unresolved variables como literal** (R-3) — `{{placeholder}}` deberia ser string vacio
9. **SessionManager bypassing src/lib/domain/** — refactor candidate (excepcion a Regla 3 ratificada en Phase 42 LEARNINGS, pendiente fase dedicada)
10. **Bug pre-existente `agent-production.ts:154`** — query filtra por columna inexistente `is_active` (out of scope Phase 42, tracked separately)
11. **Somnio V1 (`somnio-sales-v1`, `somnio-recompra-v1`) confirmed dead code** — auditoria Phase 42 verifico cero sesiones activas ni handlers vivos. Candidato a deletion en fase de cleanup

### P3 — Baja (Cleanup)

9. **Duplicaciones de codigo** — Supabase admin client duplicado, model IDs hardcoded (7 refs)
10. **Commented code** — 179 archivos con 3+ lineas de comentarios
11. **Dead code potencial** — `getTemplatesForIntents()` en template-manager.ts
12. **Workspace config UI** — Name/slug editing placeholder
13. **Task reminders** — Placeholder "Proximamente"

> **Auditado y verificado 19 feb 2026:** P0-3 (temp route), P0-2 (cycle detection), P1-5 (exito parcial), P1-6 (taskOverdue await), P1-7 (totalValue mismatch) — todos resueltos en codigo, removidos de deuda.
> **Verificado 19 feb 2026 (quick-003/004):** P0-1 (variables vacias task.overdue) — resuelto: taskDescription y contactName ahora fluyen completos. P0-4 (workspace_id missing) — resuelto: pipeline ownership validation + defense-in-depth en 8 enrichment queries. P0-2 (cycle detection) — 3 bugs criticos ya resueltos, reclasificado a P1 por cobertura incompleta. P1-3 (missing enrichment) y P1-4 (TriggerContext type gap) — resueltos en Real Fields Fix y quick-004.

---

## Presencia Publica — morfx.app (Phase 37.5 Block A)

**Estado:** ✅ Funcional — deployado 2026-04-14

### Landing bilingue (`src/app/(marketing)/[locale]/`)
- **Idiomas:** ES en `/`, EN en `/en` (next-intl 4.x `localePrefix: 'as-needed'`)
- **Ruta root:** ya NO es redirect a `/login` — sirve landing publico con hero + about + product + CTA
- **Legal:** `/privacy` (Ley 1581 + ARCO) + `/terms` (14 secciones, handwritten desde doc del equipo legal)
- **Footer:** MORFX S.A.S. + NIT 902.052.328-5 + Carrera 38 #42-17 Apto 1601B Bucaramanga + +57 313 754 9286 + morfx.colombia@gmail.com
- **SEO:** Metadata completa, OG image branded 1200x630, alternates ES/EN
- **Sin referencias:** a 360dialog (stack actual es Meta Direct), sin NIT incorrecto (`902.058.328-5`)

### Middleware composicion (pattern)
- Repo-root `middleware.ts` compone 2 middlewares: 6 paths marketing (`/`, `/en`, `/privacy`, `/en/privacy`, `/terms`, `/en/terms`) via `createMiddleware` de next-intl; todo lo demas via `updateSession` de Supabase. Preserva bypasses criticos (Inngest, cron, `_next/*`).
- **Rutas auth fuera del locale segment:** `/login`, `/signup`, `/forgot-password` no son parte de `(marketing)/[locale]/` — no tienen variantes ES/EN

### Meta Business Verification (Blocking para Phase 38 Embedded Signup)
- **Phase 37.5 Block A completo:** website publico + legal pages listas como evidencia para Meta reviewer
- **Block B (email corporativo `info@morfx.app` via Porkbun forwarding):** handled by separate instance
- **Block C (Facebook Page MORFX S.A.S. conectada a Business Portfolio):** handled by separate instance
- **Block D (Domain TXT verify + BV resubmit):** manual user action (checklist en `.planning/phases/37.5-meta-verification-website/META-VERIFICATION-CHECKLIST.md`)
- **Expected SLA Meta:** 2-5 dias habiles post-resubmit (community reports 2 semanas a 7 meses)

### Bugs conocidos Phase 37.5
- WSL + Geist fonts outage bloquea `npm run build` local (pattern conocido desde Phase 42.1-07); Vercel build funciona normal
- `--legacy-peer-deps` requerido en npm install (pre-existente: @webscopeio/react-textarea-autocomplete peer React 18 vs app React 19.2.3)

### Deuda tecnica abierta
- Legal review profesional de T&C + Privacy antes de launch mayor (v1.0 pending-legal-review banner activo)
- OG image branding iteration pendiente

---

## Configuracion Pendiente (No es codigo)

1. **SMTP** — Configurar en Supabase para emails transaccionales
2. **360dialog webhook URL** — Configurar URL de produccion + WHATSAPP_WEBHOOK_SECRET en Vercel
3. **Inngest env vars** — INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY en Vercel
4. **Migraciones DB** — 11 archivos renombrados pendientes de deploy
5. **Deprecated files cleanup** — SomnioEngine legacy, SandboxEngine legacy

---

## Proximos Pasos Recomendados

1. ~~**Wave 1 — Security Hotfixes:**~~ COMPLETADO (quick-003: workspace_id filters, temp route ya eliminado)
2. ~~**Wave 2 — Automation Variables:**~~ COMPLETADO (quick-004: task.overdue emitter fix, otros triggers verificados correctos)
3. **Wave 3 — AI Builder Coverage:** Expandir cycle detection para cubrir mas campos de condicion y trigger types (P1)
4. **Wave 4 — Resilience:** Store-before-process en webhook WhatsApp (P1)
5. **Wave 5 — Performance/Cleanup:** Consolidar phone normalization, rate limiting, Twilio inbound
6. **v3.0 Planning:** Nuevas features (multi-agent, analytics avanzados, inventario, pagos)

---

*Generado: 19 febrero 2026 — Actualizado con fixes quick-003 (workspace_id) y quick-004 (task.overdue variables)*
*Actualizado: 20 febrero 2026 — Hotfix bot CRM: mapeo name/shippingCity/shippingDepartment, department en contactUpdate, sync conversation.contact_id post-order*
*Actualizado: 14 abril 2026 — Phase 37.5 Block A completo: morfx.app con landing publico bilingue ES/EN + privacy + terms, middleware compuesto next-intl + Supabase whitelist. Listo para resubmit de Meta Business Verification.*
*Actualizado: 7 abril 2026 — Phase 42 (Session Lifecycle) completada: cron de cierre, partial unique index, retry 23505, defensive timer-guard, TZ-safe RPC*
*Actualizado: 18 abril 2026 — Phase 44 (CRM Bots Read + Write) SHIPPED: dos agentes IA internos expuestos como API (reader + writer two-step propose/confirm), aislamiento fisico por carpeta, rate-limit compartido `'crm-bot'` 50/min/workspace, kill-switch `CRM_BOT_ENABLED` (requiere Vercel redeploy — Blocker 6), Inngest cron `crmBotExpireProposals`, email alerts Resend, observability full. Pending production QA en Task 6 checkpoint.*
*Actualizado: 19 abril 2026 — Phase 44.1 (CRM Bots Config DB) SHIPPED: 3 env vars de CRM bots relocadas a tabla `platform_config` en Supabase. Nuevo helper `src/lib/domain/platform-config.ts` con cache in-memory 30s TTL. Kill-switch ahora flipeable via SQL sin redeploy (resuelve Blocker 6). `RESEND_API_KEY` permanece en Vercel (secret). QA kill-switch procedure actualizado — ver seccion 11.1.*
*Actualizado: 21 abril 2026 — Standalone `somnio-recompra-crm-reader` SHIPPED (codigo) con feature flag default `false` (Regla 6 rollout gradual): `somnio-recompra-v1` ahora enriquece la sesion con contexto rico del cliente (ultimo pedido, tags, total pedidos, direccion) via Inngest function `recompra-preload-context` que invoca al agente `crm-reader` en paralelo al saludo. Comprehension del turno 1+ inyecta seccion dedicada `## CONTEXTO CRM DEL CLIENTE (precargado)` cuando `_v3:crm_context_status === 'ok'`. 26 unit tests passing. Activacion manual via SQL en `platform_config.somnio_recompra_crm_reader_enabled`. Ver seccion 11.2.*
