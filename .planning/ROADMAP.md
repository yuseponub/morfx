# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp SaaS platform for e-commerce COD businesses. This roadmap delivers the v1 MVP through 11 phases, starting with foundational infrastructure (auth, workspaces, Action DSL), building up the CRM module (contacts, orders), then the WhatsApp module, culminating in the core value: synchronized tags and states between CRM and WhatsApp, and completing with Shopify integration for automatic order sync.

**MVP v2** focuses on Conversational Agents: connecting the Action DSL with real operations, building a generic agent engine with Claude API, implementing the Somnio Sales Agent, a sandbox for testing, and finally integrating agents with WhatsApp for automated customer service.

## Milestones

- **MVP v1.0** - Phases 1-11 (Complete 2026-02-04)
- **MVP v2.0 Agentes Conversacionales** - Phases 12-19 (In progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>MVP v1.0 (Phases 1-11) - COMPLETE 2026-02-04</summary>

- [x] **Phase 1: Foundation & Auth** - Project scaffold, Supabase setup, authentication
- [x] **Phase 2: Workspaces & Roles** - Multi-tenant isolation with RLS
- [x] **Phase 3: Action DSL Core** - Tool registry and structured logging
- [x] **Phase 4: Contacts Base** - Basic contact CRUD with tags
- [x] **Phase 5: Contacts Extended** - Custom fields, import/export, notes, history
- [x] **Phase 6: Orders** - Order CRUD, Kanban pipeline, multi-products
- [x] **Phase 7: WhatsApp Core** - 360dialog integration, inbox, messaging
- [x] **Phase 8: WhatsApp Extended** - Templates, assignment, quick replies
- [x] **Phase 8.1: Settings Navigation WhatsApp** - WhatsApp config accessible from Settings (INSERTED)
- [x] **Phase 8.2: Quick Replies con Media** - Fotos y archivos en respuestas rapidas (INSERTED)
- [x] **Phase 9: CRM-WhatsApp Sync** - Tags and states synchronized (core value)
- [x] **Phase 9.1: Order States Config** - Estados de pedido configurables con emoji (INSERTED)
- [x] **Phase 10: Search, Tasks & Analytics** - Global search, reminders, dashboard
- [x] **Phase 10.1: Task Notes & History** - Notas en tareas e historial de cambios (INSERTED)
- [x] **Phase 11: Shopify Integration** - Webhooks de pedidos, auto-crear contactos y pedidos

</details>

### MVP v2.0: Agentes Conversacionales

- [x] **Phase 12: Action DSL Real** - Conectar handlers placeholder con operaciones reales
- [x] **Phase 13: Agent Engine Core** - Motor generico de ejecucion de agentes
- [x] **Phase 14: Agente Ventas Somnio** - Implementar el agente de ventas existente en codigo
- [x] **Phase 15: Agent Sandbox** - UI para probar agentes sin afectar WhatsApp real
- [ ] **Phase 15.5: Somnio Ingest System** - Acumulacion de datos con deteccion datos vs pregunta (INSERTED)
- [ ] **Phase 15.6: Sandbox Evolution** - Debug multi-panel, tools visibility, agent separation, ingest testing (INSERTED)
- [ ] **Phase 15.7: Ingest Timer Pluggable** - Timer funcional con 5 niveles, configurable en sandbox, simulacion completa (INSERTED)
- [x] **Phase 15.8: Codebase Cleanup** - Corregir bugs, seguridad, duplicados e inconsistencias del audit (INSERTED)
- [ ] **Phase 16: WhatsApp Agent Integration** - Conectar agentes con inbox de WhatsApp
- [x] **Phase 16.1: Engine Unification** - Unificar SandboxEngine y SomnioEngine en un solo flujo con adapters (INSERTED)
- [x] **Phase 17: CRM Automations Engine** - Motor de automatizaciones trigger/accion entre CRM, tareas y WhatsApp
- [x] **Phase 18: Domain Layer Foundation** - Capa domain/ como unica fuente de verdad para todas las mutaciones, habilitando IA distribuida
- [x] **Phase 19: AI Automation Builder** - Meta-agente que crea automatizaciones por lenguaje natural con verificacion

---

## Phase Details

> **REGLA GLOBAL - LEARNINGS.md OBLIGATORIO**
>
> Cada fase DEBE incluir un archivo `{phase}-LEARNINGS.md` antes de marcarse como completa.
> Este documento alimentara agentes de IA para la vision de IA Distribuida.
>
> **Una fase sin LEARNINGS.md NO esta completa.**
>
> Template: `.planning/templates/LEARNINGS-TEMPLATE.md`

<details>
<summary>MVP v1.0 Phase Details (Phases 1-11)</summary>

### Phase 1: Foundation & Auth
**Goal**: Users can register, login, and access a working Next.js application shell
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, UIUX-01, UIUX-02, UIUX-03, UIUX-04
**Success Criteria** (what must be TRUE):
  1. User can register with email and password, receiving confirmation
  2. User can login and maintain session across browser refresh
  3. User can logout from any page in the application
  4. User can reset forgotten password via email link
  5. Application shell displays with navigation between CRM, WhatsApp, and Settings sections
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md - Project scaffold with Next.js, Supabase clients, shadcn/ui, and theme support
- [x] 01-02-PLAN.md - Authentication flows (register, login, logout, password reset)
- [x] 01-03-PLAN.md - Application shell with sidebar navigation and protected routes

### Phase 2: Workspaces & Roles
**Goal**: Users belong to isolated workspaces with role-based access control
**Depends on**: Phase 1
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05
**Success Criteria** (what must be TRUE):
  1. User can create a new workspace and become its Owner
  2. Owner can invite other users to the workspace via email
  3. Each role (Owner, Admin, Agent) has distinct capabilities enforced by the system
  4. Data from one workspace is completely invisible to users in other workspaces
**Plans**: TBD

Plans:
- [x] 02-01: Workspace data model and RLS policies
- [x] 02-02: Workspace creation and invitation flow
- [x] 02-03: Role definitions and permission enforcement

### Phase 3: Action DSL Core
**Goal**: Every operation in the system is a logged, executable tool
**Depends on**: Phase 2
**Requirements**: ADSL-01, ADSL-02, ADSL-03, ADSL-04, ADSL-05
**Success Criteria** (what must be TRUE):
  1. Tool registry exists with list of available operations
  2. Any CRM operation can be invoked as a tool via internal API
  3. Any WhatsApp operation can be invoked as a tool via internal API
  4. Every tool execution generates a structured log entry with inputs, outputs, and metadata
  5. Tools can be discovered and invoked programmatically
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md - Foundation: dependencies, database tables, and type definitions
- [x] 03-02-PLAN.md - Registry Core: Tool Registry with Ajv validation and Executor with dry-run
- [x] 03-03-PLAN.md - Tool Schemas: CRM and WhatsApp tool definitions with placeholder handlers
- [x] 03-04-PLAN.md - API Layer: External API endpoints with API key authentication

### Phase 4: Contacts Base
**Goal**: Users can manage contacts with basic fields and tags
**Depends on**: Phase 3
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-07, CONT-08
**Success Criteria** (what must be TRUE):
  1. User can view a list of all contacts in their workspace
  2. User can create a new contact with name, phone, email, address, and city
  3. User can edit and delete contacts (with appropriate permissions)
  4. User can add and remove tags from contacts
  5. User can filter the contact list by one or more tags
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md - Database schema, phone normalization, and Server Actions for contact/tag CRUD
- [x] 04-02-PLAN.md - TanStack Table, contact forms, dialogs, and detail page
- [x] 04-03-PLAN.md - Tag system with colors, filtering, and bulk operations

### Phase 5: Contacts Extended
**Goal**: Contacts have custom fields, notes, import/export, and activity history
**Depends on**: Phase 4
**Requirements**: CONT-06, CONT-09, CONT-10, CONT-11, CONT-12
**Success Criteria** (what must be TRUE):
  1. Workspace admin can define custom fields for contacts
  2. User can import contacts from a CSV file
  3. User can export contacts to a CSV file
  4. User can add internal notes to any contact
  5. User can view complete activity history of a contact (all interactions)
**Plans**: 4 plans

Plans:
- [x] 05-01-PLAN.md - Database schema for custom fields, notes, and activity with PostgreSQL triggers
- [x] 05-02-PLAN.md - Custom fields system: Server Actions, Zod validation, builder UI, contact display
- [x] 05-03-PLAN.md - Notes and activity history: Server Actions, timeline UI, filters
- [x] 05-04-PLAN.md - CSV import with column mapping and export with column selection

### Phase 6: Orders
**Goal**: Users can manage orders with Kanban pipeline and multi-products
**Depends on**: Phase 4
**Requirements**: ORDR-01, ORDR-02, ORDR-03, ORDR-04, ORDR-05, ORDR-06, ORDR-07, ORDR-08, ORDR-09
**Success Criteria** (what must be TRUE):
  1. User can view orders in a list and Kanban board view
  2. User can create an order with contact, multiple products, value, and tracking info
  3. User can edit and delete orders (with appropriate permissions)
  4. User can drag-and-drop orders between pipeline stages
  5. Workspace admin can configure the pipeline stages
**Plans**: 5 plans

Plans:
- [x] 06-01-PLAN.md - Database foundation: products, pipelines, stages, orders, order_products with triggers and RLS
- [x] 06-02-PLAN.md - Product catalog: Server Actions and UI for product CRUD
- [x] 06-03-PLAN.md - Pipeline configuration: Server Actions and UI for pipeline/stage management with drag-reorder
- [x] 06-04-PLAN.md - Order CRUD: Server Actions, list view, order form with contact selector and product picker
- [x] 06-05-PLAN.md - Kanban board: @dnd-kit DnD, pipeline tabs, fuzzy search, view toggle, order detail sheet

### Phase 7: WhatsApp Core
**Goal**: Users can receive and send WhatsApp messages through 360dialog
**Depends on**: Phase 4
**Requirements**: WAPP-01, WAPP-02, WAPP-03, WAPP-11, INTG-03, INTG-04, INTG-05
**Success Criteria** (what must be TRUE):
  1. System connects to 360dialog and receives incoming messages
  2. User can view inbox of all conversations
  3. User can view complete message history of any conversation
  4. User can send messages within the 24-hour window
  5. Conversations are automatically linked to contacts by phone number
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md - Database schema, 360dialog API client, webhook handler, conversation Server Actions
- [x] 07-02-PLAN.md - Conversation list UI, contact panel, real-time hooks, search/filters
- [x] 07-03-PLAN.md - Chat view with virtualization, message bubbles, message input with emoji picker

### Phase 8: WhatsApp Extended
**Goal**: Users can manage templates, assign conversations, track messaging costs, and use quick replies
**Depends on**: Phase 7
**Requirements**: WAPP-04, WAPP-05, WAPP-06, WAPP-07, WAPP-08, WAPP-09, WAPP-12, WAPP-13
**Success Criteria** (what must be TRUE):
  1. Admin can create and manage WhatsApp message templates (with Meta approval flow)
  2. User can send templates outside the 24-hour window
  3. User can assign conversations to other agents
  4. Manager+ can see all conversations; Agent only sees assigned or unassigned
  5. User can save and use quick replies for common responses
  6. System tracks message costs by category (marketing, utility, authentication, service)
  7. Admin can view usage dashboard with costs per workspace (for billing pass-through)
**Plans**: 9 plans

Plans:
- [x] 08-01-PLAN.md - Database foundation: templates, teams, quick_replies, message_costs, workspace_limits with RLS
- [x] 08-02-PLAN.md - Server Actions: teams, quick replies, assignment, and usage tracking
- [x] 08-03-PLAN.md - Template management UI: list, create form, variable mapper, status badges
- [x] 08-04-PLAN.md - Template sending: modal with preview, variable substitution, 24h window integration
- [x] 08-05-PLAN.md - Team management: configuration page, member management, assignment dropdown
- [x] 08-06-PLAN.md - Role-based visibility: RLS policies for manager vs agent conversation access
- [x] 08-07-PLAN.md - Quick replies: management page and slash-command autocomplete in chat
- [x] 08-08-PLAN.md - Usage tracking: webhook cost recording and cost dashboard with charts
- [x] 08-09-PLAN.md - Super Admin panel: workspace configuration and consolidated costs

### Phase 8.1: Settings Navigation WhatsApp (INSERTED)
**Goal**: WhatsApp configuration accessible from main Settings page
**Depends on**: Phase 8
**Requirements**: UIUX
**Success Criteria** (what must be TRUE):
  1. User can access WhatsApp configuration (templates, equipos, quick replies, costos) from /settings page
**Plans**: 1 plan

Plans:
- [x] 08.1-01-PLAN.md - Add WhatsApp settings link to main settings page

### Phase 8.2: Quick Replies con Media (INSERTED)
**Goal**: Quick replies pueden incluir fotos y archivos adjuntos
**Depends on**: Phase 8
**Requirements**: WAPP-09 (extended)
**Success Criteria** (what must be TRUE):
  1. User can create quick reply with imagen adjunta
  2. Al usar el atajo, se envia texto + imagen en un solo flujo
  3. Preview de imagen visible en el formulario de creacion
**Plans**: 1 plan

Plans:
- [x] 08.2-01-PLAN.md - Quick replies con soporte de media (fotos)

### Phase 9: CRM-WhatsApp Sync
**Goal**: Tags and order states synchronize between CRM and WhatsApp modules (core value)
**Depends on**: Phase 6, Phase 8
**Requirements**: ORDR-10, ORDR-11, WAPP-10
**Note**: Shopify integration deferred to Phase 11+ (see 09-CONTEXT.md)
**Success Criteria** (what must be TRUE):
  1. When a tag is added to a contact in CRM, it appears in their WhatsApp conversation
  2. When a tag is added to a conversation in WhatsApp, it appears on the contact in CRM
  3. When an order state changes in CRM, it reflects in the linked WhatsApp conversation
  4. Tags can be scoped to specific contexts (WhatsApp-only, Orders-only, or both)
**Plans**: 8 plans

Plans:
- [x] 09-01-PLAN.md - Database foundation: conversation_tags table, tags.applies_to field, auto-tag trigger, stage-phases utility
- [x] 09-02-PLAN.md - Server Actions: conversation tag CRUD, tag scope filtering, extended queries
- [x] 09-03-PLAN.md - Types extension: ConversationWithDetails with contactTags, OrderSummary, order fetching
- [x] 09-04-PLAN.md - WhatsApp UI: OrderStatusIndicator, conversation-item with indicators, contact-panel dual tags
- [x] 09-05-PLAN.md - Tag management: ConversationTagInput, chat header tag controls
- [x] 09-06-PLAN.md - Integration wiring: useConversations with orders, realtime subscriptions, batch loading
- [x] 09-07-PLAN.md - CRM reverse sync: WhatsAppSection in contact detail, conversation tags in CRM
- [x] 09-08-PLAN.md - Final integration: tag scope UI, end-to-end verification

### Phase 9.1: Order States Config (INSERTED)
**Goal**: Admin puede configurar estados de pedido con emoji que reemplazan el mapeo hardcodeado
**Depends on**: Phase 9
**Requirements**: SYNC (extended)
**Success Criteria** (what must be TRUE):
  1. Admin puede crear/editar estados de pedido (order_states) a nivel workspace
  2. Cada estado tiene: nombre y emoji (obligatorios)
  3. Admin puede asignar stages del pipeline a un estado
  4. El indicador en WhatsApp usa el emoji configurado del estado
  5. Estados se pueden reordenar con drag-and-drop
**Plans**: 4 plans

Plans:
- [x] 09.1-01-PLAN.md - Database foundation: order_states table, FK on pipeline_stages, Server Actions
- [x] 09.1-02-PLAN.md - Configuration UI: settings page with dnd-kit reorder, emoji picker, stage assignment
- [x] 09.1-03-PLAN.md - WhatsApp integration: emoji on avatar indicator (Callbell style), DB-driven lookup
- [x] 09.1-04-PLAN.md - Wiring and verification: order queries with order_state join, end-to-end testing

### Phase 10: Search, Tasks & Analytics
**Goal**: Users have global search, task reminders, and a metrics dashboard
**Depends on**: Phase 9
**Requirements**: SRCH-01, SRCH-02, SRCH-03, TASK-01, TASK-02, TASK-03, TASK-04, ANLT-01, ANLT-02, ANLT-03, ANLT-04
**Success Criteria** (what must be TRUE):
  1. User can search globally across contacts, orders, and conversations
  2. Search results show type and preview, with optional filtering by type
  3. User can create tasks linked to contacts, orders, or conversations
  4. System notifies user when a task is approaching its deadline
  5. Dashboard displays key metrics: total orders, total value, conversion rate, avg ticket

> **Note:** ANLT-03 (tiempo promedio de respuesta WhatsApp) deferred per CONTEXT.md to future phase
**Plans**: 6 plans

Plans:
- [x] 10-01-PLAN.md - Tasks database foundation: tasks table with exclusive arc pattern, task_types, RLS policies, TypeScript types
- [x] 10-02-PLAN.md - Task management core: Server Actions, /tareas page, task list, form, filters
- [x] 10-03-PLAN.md - Task integration: contextual creation from entities, sidebar badge, task settings page
- [x] 10-04-PLAN.md - Global search: command palette with Cmd+K, Fuse.js, entity filtering, sidebar integration
- [x] 10-05-PLAN.md - Analytics dashboard: metrics Server Actions, /analytics page with cards and charts, role-based access
- [x] 10-06-PLAN.md - Final integration: sidebar navigation update, role-based visibility, human verification

### Phase 10.1: Task Notes & History (INSERTED)
**Goal**: Tareas tienen notas internas e historial de cambios para detectar postergaciones
**Depends on**: Phase 10
**Requirements**: TASK (extended)
**Success Criteria** (what must be TRUE):
  1. User puede agregar notas a una tarea
  2. Sistema registra automaticamente cambios de fecha limite (historial)
  3. User puede ver historial de cambios en la tarea
  4. Se muestra indicador visual cuando una tarea ha sido postergada multiples veces
**Plans**: 4 plans

Plans:
- [x] 10.1-01-PLAN.md - Database foundation: task_notes, task_activity tables, log_task_changes trigger, postponement_count
- [x] 10.1-02-PLAN.md - Server Actions: task notes CRUD, task activity fetching with formatting helpers
- [x] 10.1-03-PLAN.md - UI components: PostponementBadge, TaskNotesSection, TaskHistoryTimeline, list integration
- [x] 10.1-04-PLAN.md - Task detail view: tabbed interface with Info, Notas, Historial tabs

### Phase 11: Shopify Integration
**Goal**: Pedidos de Shopify se sincronizan automaticamente con MorfX
**Depends on**: Phase 6 (Orders)
**Requirements**: INTG-01, INTG-02
**Success Criteria** (what must be TRUE):
  1. Admin puede configurar conexion con tienda Shopify (API credentials)
  2. Sistema recibe webhooks de Shopify cuando se crea un pedido
  3. Pedido de Shopify auto-crea contacto si no existe (por telefono/email)
  4. Pedido de Shopify auto-crea pedido en MorfX con productos y monto
  5. Productos se matchean por SKU con catalogo existente
**Plans**: 7 plans

Plans:
- [x] 11-01-PLAN.md - Database foundation: integrations, webhook_events tables, orders.shopify_order_id column
- [x] 11-02-PLAN.md - Core utilities: HMAC verification, phone normalization, contact matching with fuzzy logic
- [x] 11-03-PLAN.md - Order mapping and webhook handler: Shopify to MorfX order transformation
- [x] 11-04-PLAN.md - Server Actions: connection test, integration CRUD with Owner-only access
- [x] 11-05-PLAN.md - Webhook endpoint: /api/webhooks/shopify with HMAC verification
- [x] 11-06-PLAN.md - Configuration UI: /configuracion/integraciones with form and sync status
- [x] 11-07-PLAN.md - Navigation wiring and end-to-end verification

</details>

---

## MVP v2.0: Agentes Conversacionales

**Milestone Goal:** Replicar el agente de ventas de Somnio (actualmente en n8n) en codigo TypeScript controlado, integrado con MorfX CRM y WhatsApp.

### Phase 12: Action DSL Real
**Goal**: Los handlers placeholder del Action DSL ejecutan operaciones reales de CRM y WhatsApp
**Depends on**: Phase 11 (MVP v1 complete)
**Requirements**: ADSL-R01, ADSL-R02, ADSL-R03, ADSL-R04, ADSL-R05, ADSL-R06, ADSL-R07, ADSL-R08, ADSL-R09
**Success Criteria** (what must be TRUE):
  1. Handler `crm.create_contact` crea un contacto real en Supabase y retorna el ID
  2. Handler `crm.create_order` crea un pedido real con productos y calcula el total
  3. Handler `whatsapp.send_message` envia mensaje real via 360dialog API
  4. API `/api/v1/tools` permite invocar cualquier tool y recibe respuesta estructurada
  5. Cada ejecucion de tool genera log forense con inputs, outputs, duracion y errores
**Plans**: 4 plans

Plans:
- [x] 12-01-PLAN.md — Foundation: ToolResult types, rate limiter, migration, enhanced logging
- [x] 12-02-PLAN.md — CRM handlers real: 9 handlers (contact CRUD, tags, orders)
- [x] 12-03-PLAN.md — WhatsApp handlers real: 7 handlers (message send, templates, conversations)
- [x] 12-04-PLAN.md — Executor enhancement: timeout, rate limiting, API route structured responses

### Phase 13: Agent Engine Core
**Goal**: Motor generico que ejecuta agentes conversacionales con Claude API, tools, y persistencia de sesion
**Depends on**: Phase 12
**Requirements**: AGEN-01, AGEN-02, AGEN-03, AGEN-04, AGEN-05, AGEN-06, AGEN-07, AGEN-08, AGEN-09, AGEN-10, AGEN-11
**Success Criteria** (what must be TRUE):
  1. Sistema puede registrar multiples agentes con configuracion distinta (system prompt, tools, estados)
  2. Sesion de conversacion persiste en Supabase con versionado para detectar interrupciones
  3. Motor usa Claude API para detectar intents y generar respuestas con streaming
  4. Motor puede ejecutar tools del Action DSL y retornar resultados al modelo
  5. Motor aplica token budget por conversacion (50K max) y registra cada turno para auditoria
**Plans**: 6 plans

Plans:
- [x] 13-01-PLAN.md — Database foundation: agent_sessions, agent_turns, session_state tables with RLS and types
- [x] 13-02-PLAN.md — Agent Registry and Session Manager with optimistic locking
- [x] 13-03-PLAN.md — Claude Client with streaming and Token Budget Manager
- [x] 13-04-PLAN.md — Intent Detector and Orchestrator components with confidence routing
- [x] 13-05-PLAN.md — Agent Engine main loop with tool execution and retry logic
- [x] 13-06-PLAN.md — Inngest timer workflows for proactive agent actions

### Phase 14: Agente Ventas Somnio
**Goal**: El agente de ventas de Somnio funciona como el actual en n8n pero con codigo controlado
**Depends on**: Phase 13
**Requirements**: VTAS-01, VTAS-02, VTAS-03, VTAS-04, VTAS-05, VTAS-06, VTAS-07, VTAS-08, VTAS-09, VTAS-10
**Success Criteria** (what must be TRUE):
  1. Agente detecta los 17 intents de Somnio (hola, precio, captura, promo, etc.)
  2. Agente extrae 8 campos de datos del cliente durante la conversacion
  3. Agente selecciona y envia templates con variables sustituidas ({{nombre}}, {{precio}})
  4. Agente crea contacto y orden en MorfX cuando se confirma la compra
  5. Agente aplica delays entre mensajes (2-6 segundos) y detecta interrupciones para abortar secuencia
**Plans**: 6 plans

Plans:
- [x] 14-01-PLAN.md — Database schema for templates + Somnio agent config with 20 intents and prompts
- [x] 14-02-PLAN.md — Data Extractor component with normalization and inference
- [x] 14-03-PLAN.md — Template Manager with variable substitution
- [x] 14-04-PLAN.md — Message Sequencer with delays and interruption handling
- [x] 14-05-PLAN.md — Somnio Orchestrator with transition validation and flow logic
- [x] 14-06-PLAN.md — Order Creator and API endpoint for end-to-end flow

### Phase 15: Agent Sandbox
**Goal**: UI de pruebas para simular conversaciones sin afectar WhatsApp real
**Depends on**: Phase 14
**Requirements**: SAND-01, SAND-02, SAND-03, SAND-04, SAND-05, SAND-06, SAND-07, SAND-08
**Success Criteria** (what must be TRUE):
  1. Usuario puede acceder a /sandbox y seleccionar agente a probar
  2. Usuario escribe mensajes como "cliente" y ve respuestas del agente en tiempo real
  3. UI muestra tools ejecutados con inputs/outputs para transparencia
  4. Usuario puede ver estado actual de la sesion (JSON viewer) y resetear para nueva prueba
  5. Sesiones de prueba se guardan para revision posterior
**Plans**: 5 plans

Plans:
- [x] 15-01-PLAN.md — Foundation: dependencies, types, SandboxEngine, session persistence, typing indicator
- [x] 15-02-PLAN.md — Chat UI: Allotment layout, message bubbles with inverted theme, input
- [x] 15-03-PLAN.md — Debug panel: 4 tabs (Tools, Estado, Intent, Tokens) with editable JSON viewer
- [x] 15-04-PLAN.md — Session management: save/load/new controls, sidebar navigation
- [ ] 15-05-PLAN.md — Human verification: end-to-end testing of all SAND-* requirements

### Phase 15.5: Somnio Ingest System (INSERTED)
**Goal**: Sistema de acumulacion de datos con deteccion datos vs pregunta, timer de espera, y silencio mientras compila
**Depends on**: Phase 15
**Requirements**: INGS-01, INGS-02, INGS-03, INGS-04, INGS-05
**Success Criteria** (what must be TRUE):
  1. En modo collecting_data, sistema detecta si mensaje es DATOS o PREGUNTA
  2. Si es DATOS: acumula silenciosamente sin responder
  3. Si es PREGUNTA: responde normalmente sin interrumpir acumulacion
  4. Timer de 6 min para datos parciales, 10 min sin datos
  5. Cliente puede enviar datos sin decir "si" primero (si implicito)
**Plans**: 4 plans

Plans:
- [ ] 15.5-01-PLAN.md — Message Classifier with Claude Haiku structured outputs
- [ ] 15.5-02-PLAN.md — Ingest Manager and Timer with 6min/10min conditional timeout
- [ ] 15.5-03-PLAN.md — Engine Integration and Sandbox IngestStatus visibility
- [ ] 15.5-04-PLAN.md — Human verification: end-to-end ingest testing

### Phase 15.6: Sandbox Evolution (INSERTED)
**Goal**: Evolucionar sandbox con debug multi-panel, tools visibility con dry-run/live toggle, separacion agentes conversacionales vs CRM, tab de ingest configurable, y tokens por modelo
**Depends on**: Phase 15.5
**Requirements**: SEVO-01, SEVO-02, SEVO-03, SEVO-04, SEVO-05, SEVO-06
**Success Criteria** (what must be TRUE):
  1. Tab Tools muestra que tools se ejecutarian (dry-run) con inputs/outputs simulados
  2. Toggle permite ejecutar tools reales desde sandbox (modo live)
  3. Agentes separados: conversacional (flujo de venta) vs CRM (operaciones de datos)
  4. Debug panel permite ver hasta 3 tabs simultaneamente
  5. Tab Ingest permite configurar timers (ej: 10s en vez de 6min) para testing rapido
  6. Tab Tokens desglosa uso por modelo (Haiku vs Sonnet) con costos distintos
**Plans**: 6 plans

Plans:
- [ ] 15.6-01-PLAN.md — Foundation types + per-model token tracking pipeline
- [ ] 15.6-02-PLAN.md — Multi-panel debug UI with DnD tab bar
- [ ] 15.6-03-PLAN.md — CRM agent system (types, registry, Order Manager)
- [ ] 15.6-04-PLAN.md — Ingest tab + Tokens tab per-model enhancement
- [ ] 15.6-05-PLAN.md — CRM sandbox integration (header, engine, tools tab)
- [ ] 15.6-06-PLAN.md — Human verification of all success criteria

### Phase 15.7: Ingest Timer Pluggable (INSERTED)
**Goal**: Timer funcional del ingest con 5 niveles escalonados, configurable en sandbox con presets y sliders, simulacion completa sin Inngest
**Depends on**: Phase 15.6
**Requirements**: ITIM-01, ITIM-02, ITIM-03, ITIM-04, ITIM-05
**Success Criteria** (what must be TRUE):
  1. Timer de ingest funciona en sandbox con los 5 niveles (sin datos, parcial, minimo, promos sin respuesta, pack sin confirmar)
  2. Cada nivel ejecuta su accion correspondiente (reminder, pedir faltantes, avanzar promos, crear orden)
  3. Presets (Real/Rapido/Instantaneo) controlan los tiempos reales del timer
  4. 5 sliders independientes permiten ajustar cada nivel individualmente
  5. Countdown numerico visible en el debug panel mostrando tiempo restante y nivel actual
  6. Datos nuevos re-evaluan el nivel del timer; preguntas no interrumpen el timer
**Plans**: 3 plans

Plans:
- [ ] 15.7-01-PLAN.md — Types + IngestTimerSimulator engine + SandboxEngine signal fix
- [ ] 15.7-02-PLAN.md — SandboxLayout timer integration + IngestTab 5-level UI
- [ ] 15.7-03-PLAN.md — Human verification of all success criteria

### Phase 15.8: Codebase Cleanup (INSERTED)
**Goal**: Corregir los 16 bugs, 11 vulnerabilidades de seguridad, codigo duplicado y inconsistencias identificados en la auditoria profunda del codebase
**Depends on**: Phase 15.7
**Requirements**: Audit findings from `.planning/codebase/audit/` (BUGS.md, SECURITY.md, DUPLICATES.md, CONSISTENCY.md)
**Success Criteria** (what must be TRUE):
  1. Los 6 bugs criticos corregidos (stale closures, state mutation, race conditions)
  2. Los 7 bugs de alta severidad corregidos (null access, logic errors, missing error handling)
  3. Los 3 bugs de media severidad corregidos (timer leak, logic errors)
  4. Vulnerabilidades de seguridad criticas/altas mitigadas (sandbox auth, webhook HMAC, workspace isolation)
  5. Phone normalization consolidada en una sola implementacion
  6. CRITICAL_FIELDS y constantes duplicadas consolidadas
  7. Supabase admin client unificado
  8. TypeScript compila sin errores despues de todos los cambios
**Plans**: 4 plans

Plans:
- [x] 15.8-01-PLAN.md -- Critical bugs: stale closures (#1-3), state mutation (#4), timer signal verify (#8), closure verify (#5), race condition (#6)
- [x] 15.8-02-PLAN.md -- High severity bugs (#7-13) + security fixes (sandbox auth, webhook HMAC, workspace isolation)
- [x] 15.8-03-PLAN.md -- Medium bugs (#14-16) + constants consolidation (CRITICAL_FIELDS, TIMER_MINIMUM_FIELDS)
- [x] 15.8-04-PLAN.md -- Code consolidation (phone normalization, admin client, state factory, model IDs)

### Phase 16: WhatsApp Agent Integration
**Goal**: Agentes conectados con inbox de WhatsApp real con handoff humano-robot
**Depends on**: Phase 15.8
**Requirements**: WINT-01, WINT-02, WINT-03, WINT-04, WINT-05, WINT-06, WINT-07
**Success Criteria** (what must be TRUE):
  1. Conversacion de WhatsApp puede tener agente asignado que procesa mensajes automaticamente
  2. Agente puede ser habilitado/deshabilitado por conversacion individual
  3. Sistema soporta handoff bidireccional: agente a humano y humano a agente
  4. Manager puede ver conversaciones atendidas por agente (filtro especial)
  5. Sistema registra metricas de conversaciones automatizadas (tiempo respuesta, resolucion, handoffs)
**Plans**: 6 plans

Plans:
- [ ] 16-01-PLAN.md -- DB foundation: workspace_agent_config table, conversation columns, messages column, server actions
- [ ] 16-02-PLAN.md -- Backend: Webhook-to-agent routing via Inngest, handoff handler, auto-contact creation
- [ ] 16-03-PLAN.md -- Inbox UX: Bot badge, avatar overlay, per-chat toggles, typing indicator
- [ ] 16-04-PLAN.md -- Agent config slider, inbox panel switching, sidebar/mobile navigation
- [ ] 16-05-PLAN.md -- Agentes module: metrics dashboard, config page, period selector
- [ ] 16-06-PLAN.md -- Human verification of all success criteria

### Phase 16.1: Engine Unification (INSERTED)
**Goal**: Unificar SandboxEngine y SomnioEngine en un solo flujo con adapters para storage, messaging y debug
**Depends on**: Phase 16
**Requirements**: Architectural debt - ~800 lines of duplicated flow logic between sandbox and production engines
**Success Criteria** (what must be TRUE):
  1. Un solo processMessage() con la logica de flujo completa (intent, ingest, orchestrate, order, response)
  2. Adapter pattern para storage (in-memory vs DB), messaging (return array vs MessageSequencer), orders (CRM orch vs OrderCreator)
  3. Sandbox usa adapters in-memory — muestra resultado en UI igual que antes
  4. Produccion usa adapters de DB + WhatsApp — envia mensajes reales igual que antes
  5. Cambios en la logica del flujo se aplican automaticamente en ambos entornos
  6. Configuraciones independientes: sandbox y produccion no se afectan mutuamente
  7. webhook-processor.ts sigue funcionando sin cambios en su interfaz externa
**Plans**: 6 plans

Plans:
- [x] 16.1-01-PLAN.md — Adapter interfaces, engine types, and shared state shapes
- [x] 16.1-02-PLAN.md — SomnioAgent extraction (shared business logic from both engines)
- [x] 16.1-03-PLAN.md — Sandbox + Production adapter implementations (10 adapters + factories)
- [x] 16.1-04-PLAN.md — UnifiedEngine class + wire sandbox API route
- [x] 16.1-05-PLAN.md — Wire production webhook-processor with backward compat
- [x] 16.1-06-PLAN.md — TypeScript verification + human sandbox testing

### Phase 17: CRM Automations Engine
**Goal**: Motor de automatizaciones configurable con triggers y acciones entre modulos (CRM, tareas, WhatsApp)
**Depends on**: Phase 16.1
**Requirements**: TBD during /gsd:discuss-phase
**Success Criteria** (what must be TRUE):
  1. Usuario puede crear automatizaciones con trigger (evento) + condiciones + accion
  2. Triggers soportados: cambio de stage en orden, asignacion de tag, creacion de contacto/orden, mensaje de WhatsApp
  3. Acciones soportadas: crear orden en otro pipeline, asignar tag, enviar mensaje WhatsApp, crear tarea
  4. Condiciones combinables: stage = X AND tag = Y, campo = valor
  5. Automatizaciones se ejecutan en tiempo real cuando el trigger se dispara
  6. Panel de historial muestra ejecuciones con estado (exito/error) y detalle
  7. Automatizaciones habilitables/deshabilitables por toggle
**Plans**: 10 plans

Plans:
- [ ] 17-01-PLAN.md — DB schema (automations + automation_executions) + TypeScript types + constants catalog
- [ ] 17-02-PLAN.md — Condition evaluator (AND/OR groups) + variable resolver ({{path}} templates)
- [ ] 17-03-PLAN.md — Automation CRUD server actions + execution history queries
- [ ] 17-04-PLAN.md — Action executor (11 action types via tool handlers) + trigger emitter (cascade protection)
- [ ] 17-05-PLAN.md — Builder wizard UI (3-step: trigger, conditions, actions)
- [ ] 17-06-PLAN.md — Inngest automation runner functions (10 trigger types) + route registration
- [ ] 17-07-PLAN.md — Wire trigger emission into existing server actions (orders, tags, contacts, tasks, WhatsApp)
- [ ] 17-08-PLAN.md — Automation list page + execution history page + sidebar navigation with badge
- [ ] 17-09-PLAN.md — Connected orders (source_order_id) + related orders UI
- [ ] 17-10-PLAN.md — TypeScript verification + human verification of all success criteria

### Phase 18: Domain Layer Foundation
**Goal**: Crear capa `src/lib/domain/` como unica fuente de verdad para todas las mutaciones del sistema, eliminando duplicacion entre server actions, tool handlers, action executor y adapters. Fundacion para IA distribuida.
**Depends on**: Phase 17
**Requirements**: TBD during /gsd:discuss-phase
**Success Criteria** (what must be TRUE):
  1. Toda operacion que modifica datos pasa por domain/ — server actions, tool handlers, action executor, adapters y webhooks
  2. Todas las funciones domain emiten triggers de automatizacion cuando corresponde
  3. Tool handlers existentes (9 CRM + 7 WhatsApp) refactoreados para usar domain/
  4. Action executor refactoreado para usar domain/ (eliminar duplicacion de logica CRM directa)
  5. Nuevos tool handlers creados: tareas (create, update, complete, list), order CRUD extendido, notas, custom fields
  6. Triggers muertos activados: whatsapp.keyword_match (wiring en webhook), task.overdue (cron/scheduler)
  7. Shopify webhook emite triggers de automatizacion al crear ordenes/contactos
  8. Regla permanente en CLAUDE.md: domain/ es la unica fuente de verdad para mutaciones
  9. Bot WhatsApp puede disparar automatizaciones identicas a las del CRM UI
**Plans**: 10 plans

Plans:
- [ ] 18-01-PLAN.md -- Foundation: domain types, DB audit trigger, CLAUDE.md rule
- [ ] 18-02-PLAN.md -- Orders domain functions (7 functions: create, update, move, delete, duplicate, addTag, removeTag)
- [ ] 18-03-PLAN.md -- Orders wiring: all callers to domain + 4 new order tool handlers
- [ ] 18-04-PLAN.md -- Contacts + Tags domain functions (4 contact + 2 tag functions)
- [ ] 18-05-PLAN.md -- Contacts + Tags wiring: all callers to domain
- [ ] 18-06-PLAN.md -- Messages/WhatsApp domain + wiring + keyword_match activation
- [ ] 18-07-PLAN.md -- Tasks domain + wiring + 4 new task tool handlers
- [ ] 18-08-PLAN.md -- Notes + Custom Fields domain + wiring + 5 new tool handlers
- [ ] 18-09-PLAN.md -- Conversations domain + wiring + task.overdue cron activation
- [ ] 18-10-PLAN.md -- TypeScript verification + human verification of all success criteria

### Phase 19: AI Automation Builder
**Goal**: Meta-agente de IA que crea y configura automatizaciones por lenguaje natural con verificacion de recursos
**Depends on**: Phase 18
**Requirements**: TBD during /gsd:discuss-phase
**Success Criteria** (what must be TRUE):
  1. Usuario describe automatizacion en lenguaje natural y el agente la crea
  2. Agente verifica que los recursos referenciados existan (pipelines, stages, tags, templates)
  3. Si un recurso no existe, el agente avisa al usuario (marca visual en diagrama) — NO auto-crea (decidido en discuss-phase)
  4. Agente muestra preview de la automatizacion antes de activarla
  5. Flujos creados son editables manualmente despues de creacion por IA
  6. Agente puede modificar automatizaciones existentes por instruccion natural
  7. Sistema valida la automatizacion completa antes de activar (endpoints existen, permisos correctos, sin ciclos)
**Plans**: 10 plans

Plans:
- [ ] 19-01-PLAN.md — Foundation: deps install (ai, @ai-sdk/anthropic, @xyflow/react), builder types, builder_sessions DB migration
- [ ] 19-02-PLAN.md — System prompt with catalog knowledge + 9 builder tool definitions
- [ ] 19-03-PLAN.md — Streaming API route (/api/builder/chat) + session store persistence
- [ ] 19-04-PLAN.md — Diagram generator (automation → React Flow nodes/edges) + validation (resources, cycles, duplicates)
- [ ] 19-05-PLAN.md — Builder page + chat UI with useChat hook + message rendering with parts
- [ ] 19-06-PLAN.md — React Flow preview component + custom nodes (trigger/condition/action) + confirmation buttons
- [ ] 19-07-PLAN.md — Wire diagram preview into chat + confirmation flow (confirm → create, modify → refocus)
- [ ] 19-08-PLAN.md — Session history UI + sessions API endpoint + resume past conversations
- [ ] 19-09-PLAN.md — Navigation (automation list CTA) + modify/clone/explain flow polish
- [ ] 19-10-PLAN.md — TypeScript verification + human verification of all success criteria

### Phase 20: Integration Automations (Twilio + Shopify)
**Goal**: Expandir el motor de automatizaciones con integracion Twilio (SMS/llamadas como action types) y triggers directos de Shopify (orders/draft orders) para control granular desde el builder
**Depends on**: Phase 17, Phase 19
**Requirements**: TBD during /gsd:discuss-phase
**Success Criteria** (what must be TRUE):
  1. Credenciales Twilio configurables desde /configuracion/integraciones
  2. Action types send_sms y make_call disponibles en el builder de automatizaciones
  3. Triggers Shopify en catálogo: shopify.order_created, shopify.draft_order_created
  4. Webhook de Shopify emite triggers directos (no solo crea orden en MorfX)
  5. Usuario puede decidir desde automatizaciones qué hacer con ordenes/draft orders de Shopify
  6. SMS/llamadas Twilio se envian correctamente desde el action executor
**Plans**: TBD

Plans:
- [ ] 20-01: TBD during /gsd:plan-phase

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> ... -> 11 (v1) -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19 -> 20 (v2)

### MVP v1.0 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 3/3 | Complete | 2026-01-26 |
| 2. Workspaces & Roles | manual | Complete | 2026-01-28 |
| 3. Action DSL Core | 4/4 | Complete | 2026-01-28 |
| 4. Contacts Base | 3/3 | Complete | 2026-01-29 |
| 5. Contacts Extended | 4/4 | Complete | 2026-01-29 |
| 6. Orders | 5/5 | Complete | 2026-01-29 |
| 7. WhatsApp Core | 3/3 | Complete | 2026-01-30 |
| 8. WhatsApp Extended | 9/9 | Complete | 2026-01-31 |
| 8.1 Settings Navigation | 1/1 | Complete | 2026-01-31 |
| 8.2 Quick Replies Media | 1/1 | Complete | 2026-02-01 |
| 9. CRM-WhatsApp Sync | 8/8 | Complete | 2026-02-03 |
| 9.1 Order States Config | 4/4 | Complete | 2026-02-03 |
| 10. Search, Tasks & Analytics | 6/6 | Complete | 2026-02-04 |
| 10.1 Task Notes & History | 4/4 | Complete | 2026-02-04 |
| 11. Shopify Integration | 7/7 | Complete | 2026-02-04 |

### MVP v2.0: Agentes Conversacionales

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 12. Action DSL Real | 4/4 | Complete | 2026-02-05 |
| 13. Agent Engine Core | 6/6 | Complete | 2026-02-06 |
| 14. Agente Ventas Somnio | 6/6 | Complete | 2026-02-06 |
| 15. Agent Sandbox | 4/5 | In progress | - |
| 15.5. Somnio Ingest System | 3/4 | In progress | - |
| 15.6. Sandbox Evolution | 6/6 | Complete | 2026-02-08 |
| 15.7. Ingest Timer Pluggable | 2/3 | In progress | - |
| 15.8. Codebase Cleanup | 4/4 | Complete | 2026-02-09 |
| 16. WhatsApp Agent Integration | 5/6 | In progress | - |
| 16.1. Engine Unification | 6/6 | Complete | 2026-02-10 |
| 17. CRM Automations Engine | 10/10 | Complete | 2026-02-13 |
| 18. Domain Layer Foundation | 10/10 | Complete | 2026-02-13 |
| 19. AI Automation Builder | 10/10 | Complete | 2026-02-16 |
| 20. Integration Automations (Twilio + Shopify) | TBD | Not started | - |

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-02-16 (Phase 19 complete — MVP v2.0 Agentes Conversacionales milestone)*
