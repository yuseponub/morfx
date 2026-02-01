# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp SaaS platform for e-commerce COD businesses. This roadmap delivers the v1 MVP through 10 phases, starting with foundational infrastructure (auth, workspaces, Action DSL), building up the CRM module (contacts, orders), then the WhatsApp module, and culminating in the core value: synchronized tags and states between CRM and WhatsApp. The journey ends with polish features (search, tasks, analytics) that enhance but don't define the product.

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
- [ ] **Phase 9: CRM-WhatsApp Sync** - Tags and states synchronized (core value)
- [ ] **Phase 10: Search, Tasks & Analytics** - Global search, reminders, dashboard

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

### Phase 9: CRM-WhatsApp Sync
**Goal**: Tags and order states synchronize between CRM and WhatsApp modules (core value)
**Depends on**: Phase 6, Phase 8
**Requirements**: ORDR-10, ORDR-11, WAPP-10, INTG-01, INTG-02
**Success Criteria** (what must be TRUE):
  1. When a tag is added to a contact in CRM, it appears in their WhatsApp conversation
  2. When a tag is added to a conversation in WhatsApp, it appears on the contact in CRM
  3. When an order state changes in CRM, it reflects in the linked WhatsApp conversation
  4. Shopify orders received via webhook create/update contacts and orders in MorfX
  5. Contact, order, and conversation data remain consistent across modules
**Plans**: TBD

Plans:
- [ ] 09-01: Bidirectional tag synchronization
- [ ] 09-02: Order state to WhatsApp sync
- [ ] 09-03: Shopify webhook integration

### Phase 10: Search, Tasks & Analytics
**Goal**: Users have global search, task reminders, and a metrics dashboard
**Depends on**: Phase 9
**Requirements**: SRCH-01, SRCH-02, SRCH-03, TASK-01, TASK-02, TASK-03, TASK-04, ANLT-01, ANLT-02, ANLT-03, ANLT-04
**Success Criteria** (what must be TRUE):
  1. User can search globally across contacts, orders, and conversations
  2. Search results show type and preview, with optional filtering by type
  3. User can create tasks linked to contacts, orders, or conversations
  4. System notifies user when a task is approaching its deadline
  5. Dashboard displays key metrics: total orders, total value, conversion rate, response time
**Plans**: TBD

Plans:
- [ ] 10-01: Global search implementation
- [ ] 10-02: Tasks and reminders system
- [ ] 10-03: Analytics dashboard

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
| 9. CRM-WhatsApp Sync | 0/3 | Not started | - |
| 10. Search, Tasks & Analytics | 0/3 | Not started | - |

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-01-31 (Phase 8 complete)*
