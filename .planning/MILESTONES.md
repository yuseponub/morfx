# Milestones: MorfX Platform

## Active Milestone

### v5.0 — Meta Direct Integration (Started: 2026-03-31)

**Goal:** Eliminar intermediarios (360dialog para WhatsApp, ManyChat para FB/IG) e integrar directamente con Meta Cloud API. Multi-tenant con Embedded Signup para que cada cliente conecte su cuenta de WhatsApp, Facebook Messenger e Instagram. Migracion gradual con feature flags per-workspace.

**Phases:** 37-41 (5 phases, 33 requirements)

| Phase | Name | Requirements |
|-------|------|--------------|
| 37 | Meta App Setup + Foundation | SETUP-01, SETUP-02, SETUP-03, SETUP-04 |
| 38 | Embedded Signup + WhatsApp Inbound | SIGNUP-01, SIGNUP-02, SIGNUP-03, WA-05, HOOK-01→04 |
| 39 | WhatsApp Outbound + Templates | WA-01→04, WA-06→09, MIG-01, MIG-03 |
| 40 | Facebook Messenger Direct | SIGNUP-04, FB-01→04, MIG-02 |
| 41 | Instagram Direct | IG-01→05 |

**Key architectural decisions:**
- Zero new npm packages -- native fetch for Graph API, Node.js crypto for HMAC/AES-256-GCM
- Meta JS SDK loaded via CDN script tag (frontend only, for Embedded Signup popup)
- New `src/lib/meta/` module alongside existing `src/lib/whatsapp/` and `src/lib/manychat/`
- Three new ChannelSender implementations registered in existing registry
- `workspace_meta_accounts` table with encrypted tokens and unique indexes for O(1) webhook resolution
- Per-workspace provider flags for gradual migration (whatsapp_provider, messenger_provider)
- Unified `/api/webhooks/meta` endpoint with routing by payload.object type

---

## Completed Milestones

### v4.0 — Comportamiento Humano (Shipped: 2026-03-26)

**Delivered:** Human-like behavior for Somnio WhatsApp agent -- intelligent delays, message classification, block system with interruption and no-repetition, media processing, confidence routing, ofi inter flow, and Shopify product conditional mapping.

**Phases completed:** 29-36 (30+ plans total, 8 phases)

**Key accomplishments:**
- Inngest async processing with concurrency-1 per conversation
- Character-proportional typing delays (logarithmic curve)
- 3-category message classification (RESPONDIBLE/SILENCIOSO/HANDOFF)
- Block system with pre-send check, interruption detection, and priority-based merge
- Media processing: audio transcription (Whisper), sticker vision (Claude), reaction mapping
- Confidence routing with disambiguation log for human review
- 3-level no-repetition system (ID lookup, minifrase Haiku, full context)
- Ofi Inter office pickup detection with 3 detection paths

---

### v3.0 — Logistica (Shipped: 2026-02-24)

**Delivered:** Robot de logistica Coordinadora integrado al CRM, chat de comandos, pipeline integration, robot lector de guias, robot OCR, robot creador de guias PDF.

**Phases completed:** 21-28 (27 plans total, 8 phases)

**Key accomplishments:**
- Playwright robot on Railway for Coordinadora portal automation
- Inngest orchestration for robot jobs with domain-routed callbacks
- Chat de Comandos UI with real-time progress via Supabase Realtime
- Guide reader, OCR guide extraction (Claude Vision), PDF guide generation

---

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

---

*Last updated: 2026-03-31 after starting v5.0*
