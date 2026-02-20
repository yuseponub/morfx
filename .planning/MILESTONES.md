# Milestones: MorfX Platform

## Active Milestone

### v3.0 — Logística (Started: 2026-02-20)

**Goal:** Integrar robots de logística al CRM de MorfX, empezando por Coordinadora. Chat de comandos para operaciones, pipeline integration, protección anti-duplicados.

**Phases:** 21-25 (5 phases, 17 requirements)

| Phase | Name | Requirements |
|-------|------|--------------|
| 21 | DB + Domain Foundation | DATA-01→04 |
| 22 | Robot Coordinadora Service | ROBOT-01→05 |
| 23 | Inngest Orchestrator + Callback API | PIPE-02, PIPE-03 |
| 24 | Chat de Comandos UI | CHAT-01→04 |
| 25 | Pipeline Integration + Docs | PIPE-01, DOC-01 |

**Key architectural decisions:**
- Playwright runs as separate Docker service on Railway (Vercel incompatible)
- Inngest orchestrates robot jobs (same pattern as automation runners)
- Domain layer handles all robot result updates (triggers automations)
- Anti-duplicate: workspace lock + per-order lock + batch idempotency

---

## Completed Milestones

### MVP v2.0 — Agentes Conversacionales (Shipped: 2026-02-16)

**Delivered:** Agente de ventas Somnio replicado en codigo TypeScript controlado, motor de automatizaciones CRM con wizard y AI builder, domain layer como fuente de verdad, e integraciones Twilio SMS + Shopify triggers.

**Phases completed:** 12-20 (83 plans total, 14 phases including 5 inserted)

**Key accomplishments:**
- Agent engine with Claude API: 33 intents, data extraction, template management, order creation
- UnifiedEngine with ports/adapters: one codebase for sandbox + production
- CRM Automations Engine: 10 triggers, 11 actions, Inngest runners, wizard UI
- Domain Layer Foundation: 33 functions across 8 modules, single source of truth
- AI Automation Builder: natural language creation with React Flow diagrams and validation
- Integration Automations: Twilio SMS + 3 Shopify triggers with dual-behavior control

**Stats:**
- 454 files created/modified
- 121,699 lines added (92,093 total LOC TypeScript)
- 14 phases, 83 plans, ~441 commits
- 12 days from start to ship (2026-02-04 to 2026-02-16)

**Git range:** `feat(12-01)` to `fix(20)`

**What's next:** v3.0 — Logística

---

### MVP v1.0 — CRM + WhatsApp Platform (Shipped: 2026-02-04)

**Delivered:** Plataforma SaaS multi-tenant CRM + WhatsApp para negocios e-commerce COD con sincronizacion de tags y estados, Shopify integration, busqueda global, tareas y analytics.

**Phases completed:** 1-11 (+ 8.1, 8.2, 9.1, 10.1 inserted — 15 phases, 51 plans total)

**Key accomplishments:**
- Authentication & Workspaces with RLS multi-tenant
- Action DSL Core (16 tools registered)
- Contacts module (CRUD, tags, custom fields, notes, activity, import/export)
- Orders module (CRUD, Kanban pipeline, multi-products)
- WhatsApp module (inbox, messaging, templates, teams, quick replies, costs)
- CRM <-> WhatsApp Sync (tags, order states with emoji)
- Shopify integration (webhooks, auto-create contacts/orders)
- Global search, tasks, analytics dashboard

**Stats:**
- 15 phases, 51 plans
- 10 days from start to ship (2026-01-26 to 2026-02-04)

**Git range:** `feat(01-01)` to `feat(11-07)`

**What's next:** MVP v2.0 — Agentes Conversacionales

---

*Last updated: 2026-02-20 after starting v3.0*
