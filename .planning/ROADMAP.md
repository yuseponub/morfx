# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp SaaS platform for e-commerce COD businesses. This roadmap delivers the v1 MVP through 11 phases, starting with foundational infrastructure (auth, workspaces, Action DSL), building up the CRM module (contacts, orders), then the WhatsApp module, culminating in the core value: synchronized tags and states between CRM and WhatsApp, and completing with Shopify integration for automatic order sync.

**MVP v2** will focus on Conversational Agents: connecting the Action DSL with real operations, building an agent engine with Claude API, a sandbox for testing, and finally integrating agents with WhatsApp for automated customer service.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

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
- [ ] **Phase 11: Shopify Integration** - Webhooks de pedidos, auto-crear contactos y pedidos

---

### MVP v2: Agentes Conversacionales (Post-MVP v1)

- [ ] **Phase 12: Agent Architecture & DSL Connection** - Conectar Action DSL con funciones reales, diseño de arquitectura de agentes
- [ ] **Phase 13: Conversational Agent Engine** - Motor de agente con Claude API, configuración de contexto y herramientas
- [ ] **Phase 14: Agent Sandbox** - UI de pruebas para simular conversaciones cliente-robot
- [ ] **Phase 15: WhatsApp Agent Integration** - Conectar agentes con WhatsApp real, handoff humano-robot

## Phase Details

> **REGLA GLOBAL - LEARNINGS.md OBLIGATORIO**
>
> Cada fase DEBE incluir un archivo `{phase}-LEARNINGS.md` antes de marcarse como completa.
> Este documento alimentara agentes de IA para la vision de IA Distribuida.
>
> **Una fase sin LEARNINGS.md NO esta completa.**
>
> Template: `.planning/templates/LEARNINGS-TEMPLATE.md`

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
- [ ] 02-01: Workspace data model and RLS policies
- [ ] 02-02: Workspace creation and invitation flow
- [ ] 02-03: Role definitions and permission enforcement

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
- [x] 06-01-PLAN.md — Database foundation: products, pipelines, stages, orders, order_products with triggers and RLS
- [x] 06-02-PLAN.md — Product catalog: Server Actions and UI for product CRUD
- [x] 06-03-PLAN.md — Pipeline configuration: Server Actions and UI for pipeline/stage management with drag-reorder
- [x] 06-04-PLAN.md — Order CRUD: Server Actions, list view, order form with contact selector and product picker
- [x] 06-05-PLAN.md — Kanban board: @dnd-kit DnD, pipeline tabs, fuzzy search, view toggle, order detail sheet

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
- [x] 07-01-PLAN.md — Database schema, 360dialog API client, webhook handler, conversation Server Actions
- [x] 07-02-PLAN.md — Conversation list UI, contact panel, real-time hooks, search/filters
- [x] 07-03-PLAN.md — Chat view with virtualization, message bubbles, message input with emoji picker

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
- [x] 08-01-PLAN.md — Database foundation: templates, teams, quick_replies, message_costs, workspace_limits with RLS
- [x] 08-02-PLAN.md — Server Actions: teams, quick replies, assignment, and usage tracking
- [x] 08-03-PLAN.md — Template management UI: list, create form, variable mapper, status badges
- [x] 08-04-PLAN.md — Template sending: modal with preview, variable substitution, 24h window integration
- [x] 08-05-PLAN.md — Team management: configuration page, member management, assignment dropdown
- [x] 08-06-PLAN.md — Role-based visibility: RLS policies for manager vs agent conversation access
- [x] 08-07-PLAN.md — Quick replies: management page and slash-command autocomplete in chat
- [x] 08-08-PLAN.md — Usage tracking: webhook cost recording and cost dashboard with charts
- [x] 08-09-PLAN.md — Super Admin panel: workspace configuration and consolidated costs

### Phase 8.1: Settings Navigation WhatsApp (INSERTED)
**Goal**: WhatsApp configuration accessible from main Settings page
**Depends on**: Phase 8
**Requirements**: UIUX
**Success Criteria** (what must be TRUE):
  1. User can access WhatsApp configuration (templates, equipos, quick replies, costos) from /settings page
**Plans**: 1 plan

Plans:
- [x] 08.1-01-PLAN.md — Add WhatsApp settings link to main settings page

### Phase 8.2: Quick Replies con Media (INSERTED)
**Goal**: Quick replies pueden incluir fotos y archivos adjuntos
**Depends on**: Phase 8
**Requirements**: WAPP-09 (extended)
**Success Criteria** (what must be TRUE):
  1. User can create quick reply with imagen adjunta
  2. Al usar el atajo, se envia texto + imagen en un solo flujo
  3. Preview de imagen visible en el formulario de creacion
**Plans**: TBD

Plans:
- [x] 08.2-01-PLAN.md — Quick replies con soporte de media (fotos)

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
- [ ] 09-01-PLAN.md — Database foundation: conversation_tags table, tags.applies_to field, auto-tag trigger, stage-phases utility
- [ ] 09-02-PLAN.md — Server Actions: conversation tag CRUD, tag scope filtering, extended queries
- [ ] 09-03-PLAN.md — Types extension: ConversationWithDetails with contactTags, OrderSummary, order fetching
- [ ] 09-04-PLAN.md — WhatsApp UI: OrderStatusIndicator, conversation-item with indicators, contact-panel dual tags
- [ ] 09-05-PLAN.md — Tag management: ConversationTagInput, chat header tag controls
- [ ] 09-06-PLAN.md — Integration wiring: useConversations with orders, realtime subscriptions, batch loading
- [ ] 09-07-PLAN.md — CRM reverse sync: WhatsAppSection in contact detail, conversation tags in CRM
- [ ] 09-08-PLAN.md — Final integration: tag scope UI, end-to-end verification

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
- [ ] 09.1-01-PLAN.md — Database foundation: order_states table, FK on pipeline_stages, Server Actions
- [ ] 09.1-02-PLAN.md — Configuration UI: settings page with dnd-kit reorder, emoji picker, stage assignment
- [ ] 09.1-03-PLAN.md — WhatsApp integration: emoji on avatar indicator (Callbell style), DB-driven lookup
- [ ] 09.1-04-PLAN.md — Wiring and verification: order queries with order_state join, end-to-end testing

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
- [x] 10-01-PLAN.md — Tasks database foundation: tasks table with exclusive arc pattern, task_types, RLS policies, TypeScript types
- [x] 10-02-PLAN.md — Task management core: Server Actions, /tareas page, task list, form, filters
- [x] 10-03-PLAN.md — Task integration: contextual creation from entities, sidebar badge, task settings page
- [x] 10-04-PLAN.md — Global search: command palette with Cmd+K, Fuse.js, entity filtering, sidebar integration
- [x] 10-05-PLAN.md — Analytics dashboard: metrics Server Actions, /analytics page with cards and charts, role-based access
- [x] 10-06-PLAN.md — Final integration: sidebar navigation update, role-based visibility, human verification

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
- [x] 10.1-01-PLAN.md — Database foundation: task_notes, task_activity tables, log_task_changes trigger, postponement_count
- [x] 10.1-02-PLAN.md — Server Actions: task notes CRUD, task activity fetching with formatting helpers
- [x] 10.1-03-PLAN.md — UI components: PostponementBadge, TaskNotesSection, TaskHistoryTimeline, list integration
- [x] 10.1-04-PLAN.md — Task detail view: tabbed interface with Info, Notas, Historial tabs

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
**Plans**: TBD

---

## MVP v2: Agentes Conversacionales

> **Nota:** Estas fases se planificaran despues de completar MVP v1.
> La arquitectura se basara en los agentes existentes de n8n pero con codigo propio para mayor control.

### Phase 12: Agent Architecture & DSL Connection
**Goal**: Action DSL conectado con funciones reales + diseño de arquitectura de agentes
**Depends on**: Phase 11 (MVP v1 complete)
**Requirements**: ADSL (extended)
**Success Criteria** (what must be TRUE):
  1. Handlers del Action DSL ejecutan operaciones reales (no placeholders)
  2. API /api/v1/tools funciona para operaciones CRM y WhatsApp
  3. Documento de arquitectura de agentes conversacionales aprobado
  4. Logging forense captura todas las ejecuciones de tools
**Plans**: TBD

### Phase 13: Conversational Agent Engine
**Goal**: Motor de agente conversacional con Claude API
**Depends on**: Phase 12
**Requirements**: AGENT-01 (new)
**Success Criteria** (what must be TRUE):
  1. Agente puede recibir mensaje y generar respuesta contextual
  2. Agente tiene acceso a herramientas del Action DSL
  3. Configuracion de prompt del sistema y contexto de negocio
  4. Historial de conversacion mantenido por sesion
**Plans**: TBD

### Phase 14: Agent Sandbox
**Goal**: UI de pruebas para simular conversaciones cliente-robot
**Depends on**: Phase 13
**Requirements**: AGENT-02 (new)
**Success Criteria** (what must be TRUE):
  1. Usuario puede crear sesion de prueba en /sandbox
  2. Usuario escribe como "cliente", agente responde
  3. UI muestra herramientas que el agente usa (transparencia)
  4. Historial de sesiones de prueba guardado
**Plans**: TBD

### Phase 15: WhatsApp Agent Integration
**Goal**: Agentes conectados con WhatsApp real
**Depends on**: Phase 14
**Requirements**: AGENT-03 (new)
**Success Criteria** (what must be TRUE):
  1. Conversacion de WhatsApp puede ser atendida por agente automaticamente
  2. Handoff de robot a humano cuando se requiere
  3. Configuracion de cuando el agente interviene vs humano
  4. Metricas de conversaciones manejadas por agente
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

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
| 9. CRM-WhatsApp Sync | 7/8 | Complete | 2026-02-03 |
| 9.1 Order States Config | 3/4 | Complete | 2026-02-03 |
| 10. Search, Tasks & Analytics | 6/6 | Complete | 2026-02-04 |
| 10.1 Task Notes & History | 4/4 | Complete | 2026-02-04 |
| **11. Shopify Integration** | 0/? | **Next** | - |

### MVP v2: Agentes Conversacionales (Futuro)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 12. Agent Architecture & DSL Connection | TBD | Planned | - |
| 13. Conversational Agent Engine | TBD | Planned | - |
| 14. Agent Sandbox | TBD | Planned | - |
| 15. WhatsApp Agent Integration | TBD | Planned | - |

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-02-04 (Phase 11 added, MVP v2 roadmap defined)*
