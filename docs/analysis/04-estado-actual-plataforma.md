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
  - Exito parcial cuando API envia pero DB falla (W-2 audit — mensaje enviado pero no registrado)

---

### 3. Agentes IA
- **Estado:** ✅ Funcional

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
- **5 Critical:** Variable key mismatches (field.changed, whatsapp.phone, task.overdue) — variables resuelven vacias
- **8 Major:** Missing data en emitters, taskOverdue sin await, totalValue/orderValue mismatch
- **12 Minor:** Catalog inconsistencies, missing contact enrichment en algunos emitters
- **AI Builder cycle detection:** 3 bugs combinados (usa .rules no .conditions, English field names, sin nested groups)

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

---

## Base de Datos

### Tablas Principales (36 tablas)

**Core:** workspaces, workspace_members, workspace_invitations
**CRM:** contacts, contact_tags, contact_notes, contact_activity, custom_field_definitions
**Orders:** orders, order_products, order_tags, products, pipelines, pipeline_stages, order_states, saved_views
**WhatsApp:** conversations, messages, whatsapp_templates, teams, team_members, quick_replies, message_costs, workspace_limits, conversation_tags
**Tasks:** tasks, task_types, task_notes, task_activity
**Agents:** agent_sessions, agent_turns, session_state, agent_templates, workspace_agent_config
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
- `auto_tag_cliente_on_ganado()` — Auto-tag "Cliente" cuando orden llega a "Ganado"

---

## Tools (Action DSL)

**29 tools registrados** (22 CRM + 7 WhatsApp), todos con implementacion REAL:

**CRM (22):** contact.create/update/delete/read/list, tag.add/remove, order.create/update/updateStatus/delete/duplicate/list, task.create/update/complete/list, note.create/list/delete, custom-field.update/read
**WhatsApp (7):** message.send/list, template.send/list, conversation.list/assign/close

Todos los handlers delegan al domain layer. `initializeTools()` requerido en cualquier entry point serverless.

---

## Deuda Tecnica (Priorizada)

### P0 — Critica (Seguridad/Data Integrity)

1. **Variables de automatizacion vacias** (CRM-AUTOMATIONS-AUDIT C1-C4) — Key mismatches entre emitters y variable-resolver causan que {{campo}} resuelva a vacio
2. **AI Builder cycle detection roto** (CRM-AUTOMATIONS-AUDIT C5) — Usa `.rules` en vez de `.conditions`, English field names, sin nested groups
3. **Temp route sin auth** (FIXES-PHASE1 R-1) — `src/app/api/temp-send-agendados/route.ts` debe eliminarse
4. **workspace_id missing en queries** (FIXES-PHASE1 R-5, R-6) — 4 queries en tags.ts y 2 en notes.ts sin filtro workspace

### P1 — Alta (Funcionalidad)

5. **Exito parcial retorna success:true** (FIXES-PHASE1 R-7) — Cuando API envia pero DB falla, deberia ser success:false
6. **taskOverdue sin await** (CRM-AUTOMATIONS-AUDIT M3) — Viola regla "never fire-and-forget in serverless"
7. **totalValue vs orderValue mismatch** (CRM-AUTOMATIONS-AUDIT M4) — Runner lee campo incorrecto
8. **Missing enrichment** (CRM-AUTOMATIONS-AUDIT M1-M2) — contact.created no envia departamento/direccion, task triggers no envian contacto.nombre
9. **TriggerContext type gap** (Real Fields Fix) — Faltan contactDepartment y contactAddress en interface

### P2 — Media (Mejoras)

10. **Server actions sin domain layer** — Config modules (pipelines, teams, tags CRUD, etc.) escriben directo a Supabase
11. **No rate limiting** en API routes (sandbox, agents, tools)
12. **Twilio inbound SMS** no implementado
13. **Task timestamps UTC** — Deberian usar America/Bogota
14. **Phone normalization inconsistente** — 4 implementaciones diferentes (consolidar a 1)
15. **Unresolved variables como literal** (R-3) — `{{placeholder}}` deberia ser string vacio

### P3 — Baja (Cleanup)

16. **Duplicaciones de codigo** — Supabase admin client duplicado, model IDs hardcoded (7 refs)
17. **Commented code** — 179 archivos con 3+ lineas de comentarios
18. **Dead code potencial** — `getTemplatesForIntents()` en template-manager.ts
19. **Workspace config UI** — Name/slug editing placeholder
20. **Task reminders** — Placeholder "Proximamente"

---

## Configuracion Pendiente (No es codigo)

1. **SMTP** — Configurar en Supabase para emails transaccionales
2. **360dialog webhook URL** — Configurar URL de produccion + WHATSAPP_WEBHOOK_SECRET en Vercel
3. **Inngest env vars** — INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY en Vercel
4. **Migraciones DB** — 11 archivos renombrados pendientes de deploy
5. **Deprecated files cleanup** — SomnioEngine legacy, SandboxEngine legacy

---

## Proximos Pasos Recomendados

1. **Wave 1 — Security Hotfixes:** Eliminar temp route, corregir workspace_id filters, HMAC verification (si no esta)
2. **Wave 2 — Automation Variables:** Alinear keys entre emitters y variable-resolver (5 fixes criticos)
3. **Wave 3 — AI Builder Fixes:** Corregir cycle detection, validacion de recursos
4. **Wave 4 — Enrichment:** Agregar campos faltantes a emitters de triggers
5. **Wave 5 — Performance/Cleanup:** Consolidar phone normalization, rate limiting, Twilio inbound
6. **v3.0 Planning:** Nuevas features (multi-agent, analytics avanzados, inventario, pagos)

---

*Generado: 19 febrero 2026 — Basado en auditoria exhaustiva de codigo fuente, .planning/, LEARNINGS de 33 fases*
