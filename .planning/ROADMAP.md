# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp + Automations + AI Agents SaaS platform for e-commerce COD businesses. Three milestones: v1.0 (CRM + WhatsApp core), v2.0 (Conversational Agents + Automations + Domain Layer + Integration Automations), and v3.0 (Logistics robot integration with command chat and pipeline automation).

## Milestones

- **v1.0 MVP** — Phases 1-11 (shipped 2026-02-04)
- **v2.0 Agentes Conversacionales** — Phases 12-20 (shipped 2026-02-16)
- **v3.0 Logistica** — Phases 21-25 (in progress)

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

### v3.0 Logistica (Phases 21-25) — IN PROGRESS

- [ ] **Phase 21: DB + Domain Foundation**
- [ ] **Phase 22: Robot Coordinadora Service**
- [ ] **Phase 23: Inngest Orchestrator + Callback API**
- [ ] **Phase 24: Chat de Comandos UI**
- [ ] **Phase 25: Pipeline Integration + Docs**

---

### Phase 21: DB + Domain Foundation

**Goal:** The data infrastructure exists for all carrier integrations -- municipalities, coverage, workspace credentials, and robot job tracking are queryable and domain functions handle all robot-related mutations.

**Dependencies:** None (foundation phase)

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04

**Risk:** LOW

**Plans:** 4 plans

Plans:
- [ ] 21-01-PLAN.md — DANE municipalities + Coordinadora coverage tables with seed data
- [ ] 21-02-PLAN.md — Carrier configs + robot job tracking tables
- [ ] 21-03-PLAN.md — Logistics constants + carrier-coverage and carrier-configs domain modules
- [ ] 21-04-PLAN.md — Robot-jobs domain module + Inngest events + barrel exports

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

**Success Criteria:**
1. An Inngest function receives a robot job event, calls the robot service via HTTP, and handles the response (success, partial failure, or total failure)
2. When the robot service reports a result for an order (guide number or error), the callback API routes through the domain layer, updating the order and robot_job_item -- automation triggers fire on those updates
3. If the robot service is unreachable or times out, the orchestrator retries with backoff and marks the job as failed after exhausting retries

---

### Phase 24: Chat de Comandos UI

**Goal:** Operations team can issue logistics commands and monitor robot progress in real-time from within the MorfX interface, without needing Slack or external tools.

**Dependencies:** Phase 21 (job tables for history), Phase 23 (orchestrator to dispatch commands)

**Requirements:** CHAT-01, CHAT-02, CHAT-03, CHAT-04

**Risk:** LOW

**Success Criteria:**
1. A terminal-style panel with monospace font and dark background is accessible from the logistics section, with a text input for commands and scrollable output
2. User can type fixed commands (`subir ordenes coord`, `validar ciudades`, `estado`, `ayuda`) and the system parses and executes them -- unrecognized commands show help text
3. While a robot job is running, per-order progress updates appear in real-time (via Supabase Realtime) showing which order is processing, succeeded, or failed
4. User can view a history of past jobs with their results, success/error counts, and timestamps

---

### Phase 25: Pipeline Integration + Docs

**Goal:** Robot execution is tied to pipeline stages so that moving orders to a specific stage triggers the corresponding carrier robot, and the architecture is documented for adding future carriers.

**Dependencies:** Phase 23 (orchestrator), Phase 24 (UI for verification)

**Requirements:** PIPE-01, DOC-01

**Risk:** LOW

**Success Criteria:**
1. Workspace admin can configure which pipeline stage triggers which robot (e.g., "Despacho Coordinadora" stage triggers Coordinadora robot)
2. When orders are moved to a robot-linked stage, the system initiates a robot job for those orders automatically
3. Architecture documentation exists that describes the robot service pattern, communication flow, and step-by-step guide for adding a new carrier (Inter, Envia, Bogota) without implementing code

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
| v3.0 Logistica | 21-25 | 4 (Phase 21) | In Progress | — |
| Standalone | 5 phases | 16 | 4 complete, 1 in progress | |
| **Total** | **39 phases** | **154+ plans** | | |

### Current Phase

Phase 21: DB + Domain Foundation — Planning complete, ready for execution

---

> **REGLA GLOBAL - LEARNINGS.md OBLIGATORIO**
>
> Cada fase DEBE incluir un archivo LEARNINGS.md antes de marcarse como completa.
> Template: `.planning/templates/LEARNINGS-TEMPLATE.md`

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-02-20 (Phase 21 planned: 4 plans in 3 waves)*
