# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp + Automations + AI Agents SaaS platform for e-commerce COD businesses. Two milestones shipped: v1.0 (CRM + WhatsApp core) and v2.0 (Conversational Agents + Automations + Domain Layer + Integration Automations).

## Milestones

- **v1.0 MVP** — Phases 1-11 (shipped 2026-02-04)
- **v2.0 Agentes Conversacionales** — Phases 12-20 (shipped 2026-02-16)

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

## Standalone Phases (between milestones)

- [x] **WhatsApp Performance** — Realtime consolidation, panel lazy-loading, infrastructure (4 plans)
- [x] **Real Fields Fix** — DB migrations, backend pipeline, CRM UI for new fields (3 plans)
- [x] **Action Fields Audit** — Executor field pass-through, duplicate_order toggles, UI catalog + "Agregar campo", AI builder sync (4 plans)
- [ ] **CRM Orders Performance** — Kanban scroll, infinite scroll, virtualization (2/3 plans)

## Progress

### Summary

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1-11 (+4 inserted) | 51 | Complete | 2026-02-04 |
| v2.0 Agentes | 12-20 (+5 inserted) | 83 | Complete | 2026-02-16 |
| Standalone | 4 phases | 14 | 3 complete, 1 in progress | |
| **Total** | **33 phases** | **148 plans** | | |

### Next Milestone

TBD — run `/gsd:new-milestone` to start planning.

---

> **REGLA GLOBAL - LEARNINGS.md OBLIGATORIO**
>
> Cada fase DEBE incluir un archivo LEARNINGS.md antes de marcarse como completa.
> Template: `.planning/templates/LEARNINGS-TEMPLATE.md`

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-02-17 (standalone/action-fields-audit complete)*
