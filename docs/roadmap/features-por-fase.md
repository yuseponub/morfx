# Features por Fase — Estado Real

**Actualizado:** 19 de Febrero 2026

---

## Resumen de Ejecucion

| Milestone | Fases | Planes | Dias | Estado |
|-----------|-------|--------|------|--------|
| v1.0 CRM + WhatsApp | 15 (11 + 4 inserted) | 51 | 10 | ✅ SHIPPED |
| v2.0 Agentes + Automaciones | 14 (9 + 5 inserted) | 83 | 12 | ✅ SHIPPED |
| Standalone (entre milestones) | 4 + 2 quick fixes | 16 | 2 | ✅ SHIPPED |
| **TOTAL** | **33 fases** | **151 planes** | **23 dias** | **99.3% completo** |

---

## v1.0 — CRM + WhatsApp (26 Ene - 4 Feb 2026)

### Fase 1: Foundation & Auth ✅
- Next.js 15 + React 19 + TypeScript + Supabase + Tailwind
- Login/signup/logout con Supabase Auth
- Multi-tenant workspaces con RLS desde dia 1
- Sidebar navigation, dark/light theme
- Port 3020 fijo

### Fase 2: Workspaces ✅
- Workspace creation flow
- Member management (invite, remove, roles)
- Cookie-based workspace switching
- `is_workspace_member()` helper para RLS

### Fase 3: Action DSL Core ✅
- Tool registry con JSON Schema (Ajv validation)
- 16 tools registrados con placeholder handlers
- API endpoints `/api/v1/tools` (discovery) y `/api/v1/tools/[name]` (execution)
- API key authentication con SHA-256
- Pino structured logging
- Tool execution audit trail

### Fase 4: Contacts Base ✅
- Contacts CRUD (create, edit, delete)
- DataTable con TanStack Table (columns factory, memoized)
- Tags system (shared across modules)
- CityCombobox con autocomplete
- Phone validation E.164
- Workspace isolation en server actions

### Fase 5: Contacts Extended ✅
- Custom fields (JSONB) con definitions tipadas (12 field types)
- Contact notes con timeline UI
- Activity log automatico (trigger DB para JSONB diffs)
- CSV import (react-csv-importer, batch 100) y export (BOM para Excel)
- Contact detail view (5 tabs)
- Global search

### Fase 6: Orders ✅
- Orders CRUD con Kanban board (@dnd-kit)
- Multi-pipeline support
- Snapshot pricing en order_products
- Products catalog
- Drag-and-drop entre stages
- WIP limits por stage
- Fuse.js client-side search

### Fase 7: WhatsApp Core ✅
- 360dialog API integration (send text, media, templates)
- Webhook handler con HMAC verification
- Message deduplication (wamid unique)
- Inbox UI con conversation list
- Chat view con virtual scrolling
- Supabase Realtime para mensajes nuevos
- Emoji picker (frimousse, 2kb)

### Fase 8: WhatsApp Extended ✅
- WhatsApp templates (CRUD + 360dialog sync + Meta approval flow)
- Teams y assignment (round-robin tracking)
- Quick replies (!shortcut system)
- Message cost tracking por categoria/pais
- Workspace limits

### Fase 8.1: CRM-WhatsApp Sync ✅ (inserted)
- conversation_tags (M2M junction)
- tags.applies_to scope (whatsapp/orders/both)
- Auto-tag "Cliente" cuando orden → "Ganado"

### Fase 8.2: Quick Replies Media ✅ (inserted)
- Media support en quick replies (images, max 5MB)
- Upload a Supabase Storage
- Thumbnail preview

### Fase 9: Global Search & Tasks ✅
- Tasks module completo (CRUD, priority, due dates, exclusive arc)
- Task types customizables
- Task notes y activity
- set_task_completed_at trigger

### Fase 9.1: Order States ✅ (inserted)
- order_states table (emoji indicators)
- Stage-to-state mapping
- Phase indicators en Kanban

### Fase 10: Settings ✅
- Configuration hub
- Team management UI
- Template management UI
- Quick replies UI
- Cost tracking UI

### Fase 10.1: Analytics ✅ (inserted)
- Sales analytics dashboard
- Order metrics (count, revenue, avg)
- Sales trend charts
- Period selector

### Fase 11: Shopify Integration ✅
- Shopify webhooks (orders/create, orders/updated, draft_orders/create)
- HMAC verification
- Contact matching (exact phone + fuzzy name+city)
- Product matching (SKU, name, price)
- Auto-sync vs trigger-only mode
- Webhook event logging + idempotency

---

## v2.0 — Agentes + Automaciones (4 Feb - 16 Feb 2026)

### Fase 12: Action DSL Real ✅
- 9 real handlers reemplazando placeholders
- contact.create/update/get, order.create/update, tag.add
- message.send, template.send
- Forensic logging completo

### Fase 13: Agent Engine Foundation ✅
- SomnioAgent base con IntentDetector
- Session management (agent_sessions, agent_turns)
- Claude Sonnet integration
- State machine con mode transitions

### Fase 14: Agente Ventas Somnio ✅
- 33 intents con confidence routing
- Data extraction (8 campos)
- Template selection (primera_vez vs siguientes)
- SomnioOrchestrator response generation
- Order creation flow

### Fase 15: Agent Sandbox ✅
- Multi-panel debug UI (Tools, Estado, Intent, Tokens, Ingest)
- In-memory sandbox engine
- `/api/sandbox/process` (server-side, protege API key)
- DRY/LIVE mode badges
- Session save/load

### Fase 15.5: Somnio Ingest System ✅ (inserted)
- MessageClassifier (4 categorias: datos/pregunta/mixto/irrelevante)
- Silent accumulation (no responder cuando solo dan datos)
- Structured outputs con Zod (elimina JSON parsing errors)
- Timer signal pattern (shouldEmitTimerStart/Complete)

### Fase 15.6: Sandbox Evolution ✅ (inserted)
- CRM agent framework (BaseCrmAgent → OrderManagerAgent)
- Agent registry con self-registration
- Per-model token tracking (Haiku vs Sonnet)
- DRY/LIVE modes para CRM agents
- PointerSensor 5px threshold (DnD + clicks)

### Fase 15.7: Ingest Timer Pluggable ✅ (inserted)
- IngestTimerSimulator client-side
- 5 timer levels (L0-L4)
- Ref pattern para stale closures
- contextProvider para fresh state en callbacks
- forceIntent pattern para timer-forced transitions

### Fase 15.8: Integration Cleanup ✅ (inserted)
- Constants consolidation (zero imports)
- Agent-to-engine signal flow cleanup

### Fase 16.1: Engine Unification ✅ (inserted — mas grande que lo planeado)
- UnifiedEngine con Ports/Adapters pattern
- 5 adapters: Storage, Timer, Messaging, Orders, Debug
- Sandbox + Production desde mismo codebase
- 14 production hotfixes resueltos
- Inngest Cloud wiring (middleware bypass, deployment protection)
- MessageSequencer para WhatsApp con delays
- Cancel-before-start pattern para timers
- initializeTools() safety net

### Fase 17: CRM Automations Engine ✅
- 10 trigger types con TRIGGER_CATALOG
- 11 action types con ACTION_CATALOG
- Recursive AND/OR condition groups (14 operadores)
- Variable resolution (mustache templates, Spanish namespaces)
- Inngest factory pattern (1 funcion → 13 runners)
- Cascade depth prevention (MAX=3)
- Automation wizard UI (3 pasos)
- Execution history con paginacion

### Fase 18: Domain Layer Foundation ✅
- 8 domain modules, 33 functions
- Single source of truth para mutaciones
- createAdminClient() + workspace_id filtering
- DomainResult<T> wrapper
- Trigger emission desde domain (no desde server actions)
- 13 tool handlers migrados a domain layer

### Fase 19: AI Automation Builder ✅
- Chat con Claude via AI SDK v6 (streaming)
- Natural language automation creation
- React Flow diagrams (inline en chat)
- Validation (resources, cycles, duplicates)
- Builder sessions con persistencia
- Key-based remount para session switching

### Fase 20: Integration Automations ✅
- 3 Shopify triggers (order_created, draft_order_created, order_updated)
- send_sms action (Twilio)
- webhook action (custom HTTP)
- resolveOrCreateContact para triggers externos
- Action enrichment con trigger data
- Dual context: TriggerContext (flat) + variableContext (nested)
- Fire-and-forget → await (critical fix para Vercel serverless)

---

## Standalone Phases (17 Feb 2026)

### WhatsApp Performance ✅
- 4 Realtime channels → 1 consolidado
- Surgical state updates (no full refetch)
- Query ligero (sin address/city en lista)
- Debounced safety-net refetch

### Real Fields Fix ✅
- orders.name, contacts.department, orders.shipping_department como columnas DB reales
- Domain + trigger + UI updates
- Variable resolution ahora funciona para {{orden.nombre}}

### Action Fields Audit ✅
- 12 action types auditados en 4 capas
- Executor field pass-through completado
- Broken toggle wiring corregido
- UI "Agregar campo" dropdown para params opcionales
- AI Builder prompt actualizado

### WhatsApp Phone Resilience ✅
- Secondary phone extraction de Shopify note_attributes
- Additive-only pattern para custom_fields.secondary_phone

### CRM Orders Performance ⚠️ (2/3 planes completos)
- Kanban scroll fix (h calc en vez de min-h)
- Paginated server actions (getOrdersForStage, getStageOrderCounts)
- Pendiente: Virtualization e infinite scroll (Plan 03)

---

## Quick Fixes (18 Feb 2026)

### 001: Optimistic WhatsApp Text Send ✅
- addOptimisticMessage() con status 'sending'
- Non-blocking server action
- Realtime INSERT reemplaza optimistic message

### 002: Inbound Media Null URL ✅
- downloadAndUploadMedia() en webhook-handler
- 360dialog download → Supabase Storage re-host
- getExtensionFromMime() helper

---

## Features NO Implementadas (Futuro)

### Diseñadas pero No Construidas
- **Sistema Retroactivo** — Comparacion con conversaciones exitosas (doc existe: `02-sistema-retroactivo.md`)
- **Carolina Logistica** — Chatbot interno para operaciones (doc existe: `03-carolina-logistica.md`)

### Planeadas para v3+
- Multi-agent orchestration (routing entre agentes)
- Agent canvas visual (editor de flujos)
- Agentes adicionales (recompra, seguimiento, customer service)
- Email como canal
- Inventario management
- Payments/billing
- White label (logo, colores, dominio custom)
- Subdominios por workspace
- Exportar reportes PDF
- Twilio inbound SMS

---

*Reescrito completamente el 19 Feb 2026 basado en .planning/STATE.md, ROADMAP.md, y LEARNINGS de 33 fases. Reemplaza version pre-codigo del 23 Ene 2026.*
