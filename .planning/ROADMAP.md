# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp + Automations + AI Agents SaaS platform for e-commerce COD businesses. Three milestones: v1.0 (CRM + WhatsApp core), v2.0 (Conversational Agents + Automations + Domain Layer + Integration Automations), and v3.0 (Logistics robot integration with command chat and pipeline automation).

## Milestones

- **v1.0 MVP** — Phases 1-11 (shipped 2026-02-04)
- **v2.0 Agentes Conversacionales** — Phases 12-20 (shipped 2026-02-16)
- **v3.0 Logistica** — Phases 21-28 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v1.0 MVP (Phases 1-11) — SHIPPED 2026-02-04</summary>

- [x] **Phase 1: Foundation & Auth** - Project scaffold, Supabase setup, authentication
- [x] **Phase 2: Workspaces & Roles** - Multi-tenant isolation with RLS
- [x] **Phase 3: Action DSL Core** - Tool registry and structured logging
- [x] **Phase 4: Contacts Base** - Basic contact CRUD with tags
- [x] **Phase 5: Contacts Extended** - Custom fields, import/export, notes, history
- [x] **Phase 6: Orders** - Order CRUD, Kanban pipeline, multi-products
- [x] **Phase 7: WhatsApp Core** - 360dialog integration, inbox, messaging
- [x] **Phase 8: WhatsApp Extended** - Templates, assignment, quick replies
- [x] **Phase 8.1: Settings Navigation WhatsApp** (INSERTED)
- [x] **Phase 8.2: Quick Replies con Media** (INSERTED)
- [x] **Phase 9: CRM-WhatsApp Sync** - Core value: tags and states sync
- [x] **Phase 9.1: Order States Config** (INSERTED)
- [x] **Phase 10: Search, Tasks & Analytics**
- [x] **Phase 10.1: Task Notes & History** (INSERTED)
- [x] **Phase 11: Shopify Integration** - Webhooks, auto-create contacts/orders

</details>

<details>
<summary>v2.0 Agentes Conversacionales (Phases 12-20) — SHIPPED 2026-02-16</summary>

- [x] **Phase 12: Action DSL Real** - 16 real handlers (9 CRM + 7 WhatsApp)
- [x] **Phase 13: Agent Engine Core** - Claude API, sessions, tools, token budget
- [x] **Phase 14: Agente Ventas Somnio** - 33 intents, data extraction, templates
- [x] **Phase 15: Agent Sandbox** - Debug panels, sessions, chat UI
- [x] **Phase 15.5: Somnio Ingest System** (INSERTED) - Data accumulation, classification
- [x] **Phase 15.6: Sandbox Evolution** (INSERTED) - Multi-panel debug, CRM agents
- [x] **Phase 15.7: Ingest Timer Pluggable** (INSERTED) - 5-level timer with presets
- [x] **Phase 15.8: Codebase Cleanup** (INSERTED) - 16 bugs, security, consolidation
- [x] **Phase 16: WhatsApp Agent Integration** - Routing, handoff, metrics
- [x] **Phase 16.1: Engine Unification** (INSERTED) - UnifiedEngine, 10 adapters
- [x] **Phase 17: CRM Automations Engine** - 10 triggers, 11 actions, wizard
- [x] **Phase 18: Domain Layer Foundation** - 33 domain functions, single source of truth
- [x] **Phase 19: AI Automation Builder** - Natural language, React Flow diagrams
- [x] **Phase 20: Integration Automations** - Twilio SMS + 3 Shopify triggers

</details>

### v3.0 Logistica (Phases 21-28) — IN PROGRESS

- [x] **Phase 21: DB + Domain Foundation**
- [x] **Phase 22: Robot Coordinadora Service**
- [x] **Phase 23: Inngest Orchestrator + Callback API**
- [x] **Phase 24: Chat de Comandos UI**
- [x] **Phase 25: Pipeline Config UI + Docs**
- [ ] **Phase 26: Robot Lector de Guías Coordinadora**
- [ ] **Phase 27: Robot OCR de Guías**
- [ ] **Phase 28: Robot Creador de Guías PDF**

---

### Phase 21: DB + Domain Foundation

**Goal:** The data infrastructure exists for all carrier integrations -- municipalities, coverage, workspace credentials, and robot job tracking are queryable and domain functions handle all robot-related mutations.

**Dependencies:** None (foundation phase)

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04

**Risk:** LOW

**Plans:** 4 plans

Plans:
- [x] 21-01-PLAN.md — DANE municipalities + Coordinadora coverage tables with seed data
- [x] 21-02-PLAN.md — Carrier configs + robot job tracking tables
- [x] 21-03-PLAN.md — Logistics constants + carrier-coverage and carrier-configs domain modules
- [x] 21-04-PLAN.md — Robot-jobs domain module + Inngest events + barrel exports

**Success Criteria:**
1. A query for any Colombian municipality returns its DANE code, department, and alternative names (1,122+ municipalities loaded)
2. Given a city name or DANE code, the system can answer whether Coordinadora covers it and whether COD is available there
3. Workspace admin can configure carrier credentials and pickup address, and these are retrievable per-workspace
4. When a robot job is created with N orders, each order has an independent tracking row with status, guide number, and error fields that update through domain functions (triggering automations)

---

### Phase 22: Robot Coordinadora Service

**Goal:** A standalone microservice can reliably create shipping orders on Coordinadora's portal via browser automation, handling batches, sessions, and failures gracefully.

**Dependencies:** Phase 21 (city validation requires coverage tables)

**Requirements:** ROBOT-01, ROBOT-02, ROBOT-03, ROBOT-04, ROBOT-05

**Risk:** MEDIUM (Playwright portal interaction, external dependency)

**Plans:** 3 plans

Plans:
- [x] 22-01-PLAN.md — Project scaffold, types, and locking middleware
- [x] 22-02-PLAN.md — CoordinadoraAdapter Playwright automation port
- [x] 22-03-PLAN.md — Express server, Dockerfile, and entry point

**Success Criteria:**
1. The Express + Playwright service runs in a Docker container on Railway and responds to health checks
2. Before submitting an order to the portal, the service validates the destination city against Coordinadora coverage and rejects invalid cities with a clear error
3. A batch of N orders is processed with individual per-order status tracking -- successful orders get a guide number, failed orders get an error message, and other orders continue processing
4. The service reuses a persisted browser session (cookies) across batches, only re-authenticating when the session expires
5. Concurrent batch requests for the same workspace are rejected (workspace lock), orders already being processed are skipped (per-order lock), and re-submitting a batch ID returns cached results (idempotency)

---

### Phase 23: Inngest Orchestrator + Callback API

**Goal:** MorfX can trigger robot jobs and receive results back through the domain layer, so that order updates from robots fire automation triggers like any other CRM mutation.

**Dependencies:** Phase 21 (robot_jobs tables), Phase 22 (robot service endpoints)

**Requirements:** PIPE-02, PIPE-03

**Risk:** LOW

**Plans:** 3 plans

Plans:
- [x] 23-01-PLAN.md — Event types + robot.coord.completed automation trigger registration
- [x] 23-02-PLAN.md — Inngest robot orchestrator (dispatch + waitForEvent + timeout)
- [x] 23-03-PLAN.md — Callback API route + domain idempotency guard + robot server patch

**Success Criteria:**
1. An Inngest function receives a robot job event, calls the robot service via HTTP, and handles the response (success, partial failure, or total failure)
2. When the robot service reports a result for an order (guide number or error), the callback API routes through the domain layer, updating the order and robot_job_item -- automation triggers fire on those updates
3. If the robot service is unreachable or times out, the orchestrator marks the job as failed (fail-fast, no retries to prevent duplicate submissions)

---

### Phase 24: Chat de Comandos UI

**Goal:** Operations team can issue logistics commands and monitor robot progress in real-time from within the MorfX interface, without needing Slack or external tools.

**Dependencies:** Phase 21 (job tables for history), Phase 23 (orchestrator to dispatch commands)

**Requirements:** CHAT-01, CHAT-02, CHAT-03, CHAT-04

**Risk:** LOW

**Plans:** 3 plans

Plans:
- [x] 24-01-PLAN.md — Migration + domain extensions (dispatch stage, job queries, Realtime publication)
- [x] 24-02-PLAN.md — Server actions (subir ordenes coord flow) + Realtime hook
- [x] 24-03-PLAN.md — UI components (page, split panel, command panel, history panel, sidebar)

**Success Criteria:**
1. A split-panel interface following MorfX design system is accessible from /comandos in the sidebar, with command interaction on the left and job history on the right
2. User can type fixed commands (`subir ordenes coord`, `estado`, `ayuda`) and the system parses and executes them -- unrecognized commands show help text
3. While a robot job is running, per-order progress updates appear in real-time (via Supabase Realtime) showing which order is processing, succeeded, or failed
4. User can view a history of past jobs with their results, success/error counts, and timestamps

---

### Phase 25: Pipeline Config UI + Docs

**Goal:** Workspace admin can visually configure which pipeline stage feeds which robot via a simple settings UI, and the robot architecture is documented for adding future carriers.

**Dependencies:** Phase 24 (dispatch stage columns + commands already working)

**Requirements:** PIPE-01, DOC-01

**Risk:** LOW

**Plans:** 2 plans

Plans:
- [x] 25-01-PLAN.md — Settings UI: server action, page, client form, settings hub link
- [x] 25-02-PLAN.md — Robot architecture documentation + E2E verification checkpoint

**Success Criteria:**
1. A "Logistica" section in settings shows a simple list of bindings: Etapa -> Robot, with dropdowns to select pipeline stage and robot, and add/remove capability
2. Coordinadora appears as active carrier; future carriers (Inter, Envia, Bogota) appear as disabled placeholders ("Proximamente")
3. Toggle on/off per binding to activate/deactivate without deleting the configuration
4. Architecture documentation describes the robot service pattern, communication flow, and step-by-step guide for adding a new carrier
5. E2E verification of the full flow: config -> move orders to stage -> command -> robot -> callbacks -> CRM updates

---

### Phase 26: Robot Lector de Guias Coordinadora

**Goal:** A robot reads assigned guide numbers from the Coordinadora portal and updates CRM orders with the corresponding tracking/guide data.

**Dependencies:** Phase 22 (same portal, Playwright session reuse), Phase 25 (config UI)

**Risk:** MEDIUM (portal scraping, data mapping)

**Success Criteria:**
1. Robot navigates the Coordinadora portal and reads guide numbers assigned to pedidos
2. Each guide number is mapped back to the corresponding CRM order (by pedido number)
3. CRM orders are updated with guide numbers through the domain layer (triggering automations)
4. Activated via command in Chat de Comandos (e.g., `leer guias coord`)

---

### Phase 27: Robot OCR de Guias

**Goal:** A robot reads physical/PDF shipping guides, verifies shipping data integrity, and extracts guide numbers to update CRM orders.

**Dependencies:** Phase 25 (config UI), Phase 21 (order data)

**Risk:** HIGH (OCR accuracy, data verification logic)

**Success Criteria:**
1. Robot reads PDF or image shipping guides and extracts client name, destination, and guide number
2. Robot verifies extracted data matches the expected order data in CRM (correct client, correct destination)
3. Guide numbers are mapped to corresponding CRM orders and updated through domain layer
4. Mismatches or unreadable guides are flagged with clear error messages
5. Activated via command in Chat de Comandos

---

### Phase 28: Robot Creador de Guias PDF

**Goal:** Integrate existing guide PDF generator (from GitHub/n8n) into MorfX so orders can generate printable shipping guide PDFs from within the platform.

**Dependencies:** Phase 25 (config UI), Phase 21 (order data)

**Risk:** LOW (existing code, integration only)

**Success Criteria:**
1. Existing PDF guide generator is integrated into MorfX infrastructure (replacing n8n connection)
2. Given CRM orders, the robot generates printable PDF shipping guides with correct order and shipping data
3. Generated PDFs are accessible from the MorfX interface
4. Activated via command in Chat de Comandos

---

## Standalone Phases (between milestones)

- [x] **WhatsApp Performance** — Realtime consolidation, panel lazy-loading, infrastructure (4 plans)
- [x] **Real Fields Fix** — DB migrations, backend pipeline, CRM UI for new fields (3 plans)
- [x] **Action Fields Audit** — Executor field pass-through, duplicate_order toggles, UI catalog + "Agregar campo", AI builder sync (4 plans)
- [ ] **CRM Orders Performance** — Kanban scroll, infinite scroll, virtualization (2/3 plans)
- [x] **WhatsApp Phone Resilience** — Secondary phone extraction from Shopify note_attributes, fallback chain in action executor (2 plans)

## Progress

### Summary

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1-11 (+4 inserted) | 51 | Complete | 2026-02-04 |
| v2.0 Agentes | 12-20 (+5 inserted) | 83 | Complete | 2026-02-16 |
| v3.0 Logistica | 21-28 | 15 (Phases 21-25) | Phase 25 Complete | — |
| Standalone | 5 phases | 16 | 4 complete, 1 in progress | |
| **Total** | **39 phases** | **166+ plans** | | |

### Current Phase

Phase 25: Pipeline Config UI + Docs — COMPLETE (2 plans, 2 waves)

---

> **REGLA GLOBAL - LEARNINGS.md OBLIGATORIO**
>
> Cada fase DEBE incluir un archivo LEARNINGS.md antes de marcarse como completa.
> Template: `.planning/templates/LEARNINGS-TEMPLATE.md`

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-02-21 (Phase 25 complete: 2 plans in 2 waves)*
