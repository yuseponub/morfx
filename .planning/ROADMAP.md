# Roadmap: MorfX Platform

## Overview

MorfX is a CRM + WhatsApp + Automations + AI Agents SaaS platform for e-commerce COD businesses. Four milestones: v1.0 (CRM + WhatsApp core), v2.0 (Conversational Agents + Automations + Domain Layer + Integration Automations), v3.0 (Logistics robot integration with command chat and pipeline automation), and v4.0 (Human behavior system -- making Somnio feel like a real WhatsApp salesperson).

## Milestones

- **v1.0 MVP** — Phases 1-11 (shipped 2026-02-04)
- **v2.0 Agentes Conversacionales** — Phases 12-20 (shipped 2026-02-16)
- **v3.0 Logistica** — Phases 21-28 (in progress)
- **v4.0 Comportamiento Humano** — Phases 29-36 (planned)

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

<details>
<summary>v3.0 Logistica (Phases 21-28) — SHIPPED 2026-02-24</summary>

- [x] **Phase 21: DB + Domain Foundation**
- [x] **Phase 22: Robot Coordinadora Service**
- [x] **Phase 23: Inngest Orchestrator + Callback API**
- [x] **Phase 24: Chat de Comandos UI**
- [x] **Phase 25: Pipeline Config UI + Docs**
- [x] **Phase 26: Robot Lector de Guias Coordinadora**
- [x] **Phase 27: Robot OCR de Guias**
- [x] **Phase 28: Robot Creador de Guias PDF**

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

**Plans:** 3 plans

Plans:
- [x] 26-01-PLAN.md — DB migration (carrier_guide_number, job_type) + domain layer extensions
- [x] 26-02-PLAN.md — Robot endpoint + Inngest orchestrator + callback extension
- [x] 26-03-PLAN.md — Server action + Chat de Comandos UI integration

**Success Criteria:**
1. Robot navigates the Coordinadora portal and reads guide numbers assigned to pedidos
2. Each guide number is mapped back to the corresponding CRM order (by pedido number)
3. CRM orders are updated with guide numbers through the domain layer (triggering automations)
4. Activated via command in Chat de Comandos (e.g., `buscar guias coord`)

---

### Phase 27: Robot OCR de Guias

**Goal:** A robot reads physical/PDF shipping guides, verifies shipping data integrity, and extracts guide numbers to update CRM orders.

**Dependencies:** Phase 25 (config UI), Phase 21 (order data)

**Risk:** HIGH (OCR accuracy, data verification logic)

**Plans:** 4 plans

Plans:
- [x] 27-01-PLAN.md — Automation trigger registration + Inngest event types
- [x] 27-02-PLAN.md — OCR extraction library + matching algorithm + normalization
- [x] 27-03-PLAN.md — Inngest OCR orchestrator + domain queries + callback extension
- [x] 27-04-PLAN.md — Server action + file upload + Chat de Comandos UI integration

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

**Plans:** 5 plans

Plans:
- [x] 28-01-PLAN.md — DB migration + domain carrier-configs + events + orders query
- [x] 28-02-PLAN.md — PDF/Excel generation library (types, Claude normalizer, PDFKit, ExcelJS)
- [x] 28-03-PLAN.md — Settings UI: 3 real carrier config cards replacing placeholders
- [x] 28-04-PLAN.md — Inngest orchestrators: PDF guide + Excel guide
- [x] 28-05-PLAN.md — Server actions + Chat de Comandos commands, chips, download links

**Success Criteria:**
1. Existing PDF guide generator is integrated into MorfX infrastructure (replacing n8n connection)
2. Given CRM orders, the robot generates printable PDF shipping guides with correct order and shipping data
3. Generated PDFs are accessible from the MorfX interface
4. Activated via command in Chat de Comandos

</details>

---

### v4.0 Comportamiento Humano (Phases 29-35)

**Milestone Goal:** Hacer que Somnio se comporte como un vendedor humano real en WhatsApp -- delays inteligentes, clasificacion de mensajes, sistema de bloques con interrupcion y no-repeticion, procesamiento de medios, confidence thresholds, y flujo ofi inter.

- [x] **Phase 29: Inngest Migration + Character Delays** - Webhook async via Inngest concurrency-1, typing delays by character count
- [x] **Phase 30: Message Classification + Silence Timer** - RESPONDIBLE/SILENCIOSO/HANDOFF classification, 90s retake timer
- [x] **Phase 31: Pre-Send Check + Interruption + Pending Merge** - Check DB before each send, interrupt on new inbound, priority-based merge
- [ ] **Phase 32: Media Processing** - Audio transcription (Whisper), image/video handoff, sticker Vision, reaction mapping
- [ ] **Phase 33: Confidence Routing + Disambiguation Log** - 2-band threshold, disambiguation_log table, human review interface
- [ ] **Phase 34: No-Repetition System** - 3-level dedup (ID lookup, minifrase Haiku, full context), paraphrasing repeated intents
- [ ] **Phase 35: Flujo Ofi Inter** - Office pickup detection, mandatory confirmation, bifurcated data fields, ingest integration
- [ ] **Phase 36: Documentación del Agente** - Documentar arquitectura, proceso de creación y patrones de Somnio para replicar en futuros agentes

---

### Phase 29: Inngest Migration + Character Delays

**Goal:** WhatsApp messages are processed asynchronously with concurrency-1 per conversation via Inngest, and bot responses have human-like typing delays proportional to message length.

**Dependencies:** None (foundation phase for v4.0)

**Requirements:** BLOCK-01, DELAY-01, DELAY-02, INFRA-01

**Risk:** MEDIUM (Inngest migration is critical path -- message loss during deploy mitigated by feature flag)

**Plans:** 4 plans

Plans:
- [x] 29-01-PLAN.md — TDD: calculateCharDelay logarithmic curve (chars -> delay ms)
- [x] 29-02-PLAN.md — DB migration (processed_by_agent) + domain layer insert
- [x] 29-03-PLAN.md — Webhook handler Inngest wiring + feature flag + processed_by_agent lifecycle
- [x] 29-04-PLAN.md — Messaging adapter: replace fixed delay with calculateCharDelay

**Success Criteria:**
1. Webhook handler returns in ~200ms after saving the message and emitting an Inngest event (no inline agent processing)
2. Messages for the same conversation are processed one at a time (concurrency 1) -- rapid messages queue and execute sequentially
3. Bot responses have a typing delay proportional to character count (2s minimum for short messages, 12s cap for long messages) instead of the previous fixed delay
4. Workspace admin can adjust response speed via a multiplier preset (real/rapido/instantaneo) that scales the delay curve proportionally
5. A USE_INNGEST_PROCESSING feature flag allows instant rollback to inline processing without code deploy

---

### Phase 30: Message Classification + Silence Timer

**Goal:** Bot distinguishes between messages that need a response, acknowledgments that should be ignored, and negative/complex intents that require human handoff -- with a 90-second retake timer that re-engages silent customers.

**Dependencies:** Phase 29 (Inngest async processing required)

**Requirements:** CLASS-01, CLASS-02, CLASS-03, CLASS-04

**Risk:** LOW (classification is pure TypeScript logic, timer copies exact pattern from 4 existing timers)

**Plans:** 3 plans

Plans:
- [x] 30-01-PLAN.md — Intents + constants + event type + state transitions foundation
- [x] 30-02-PLAN.md — Message category classifier + SomnioAgent pipeline integration + engine wiring
- [x] 30-03-PLAN.md — Silence retake timer Inngest function + production timer adapter hook

**Success Criteria:**
1. After intent detection, each message is classified as RESPONDIBLE (proceed normally), SILENCIOSO (ignore), or HANDOFF (route to human) based on the detected intent and current session state
2. Acknowledgments like "ok", "jaja", thumbs-up in non-confirmatory states (conversacion, bienvenida) produce no bot response -- but the same messages in confirmatory states (resumen, collecting_data, confirmado) are treated as RESPONDIBLE
3. Messages with HANDOFF intents (asesor, queja, cancelar, no_gracias, no_interesa, fallback) disable the bot for that conversation, send "Regalame 1 min", and notify the human host
4. When a message is classified SILENCIOSO, a 90-second retake timer starts -- if the customer writes again before timeout the timer cancels; if timeout expires, the bot sends a re-engagement message redirecting to the sale

---

### Phase 31: Pre-Send Check + Interruption + Pending Merge

**Goal:** Bot sends responses in blocks instead of per-message, detects when the customer replies mid-sequence and stops sending, and merges unsent templates into the next response block by priority.

**Dependencies:** Phase 29 (Inngest async), Phase 30 (classification determines which messages enter the pipeline)

**Requirements:** BLOCK-02, BLOCK-03, BLOCK-04

**Risk:** MEDIUM (merge algorithm edge cases, priority ordering must be tested thoroughly)

**Plans:** 4 plans

Plans:
- [x] 31-01-PLAN.md — TDD: BlockComposer pure function (compose block + merge algorithm + priority sorting)
- [x] 31-02-PLAN.md — DB migration (priority column, pending_templates) + type updates + Inngest event timestamp
- [x] 31-03-PLAN.md — Pre-send check in MessagingAdapter + messageTimestamp pipeline wiring
- [x] 31-04-PLAN.md — Integration: BlockComposer in engine, pending storage, silence timer pending, HANDOFF clear

**Success Criteria:**
1. Before sending each template in a response sequence, the bot checks the DB for new inbound messages -- if a new message arrived during the delay, the sequence stops immediately
2. Templates not sent due to interruption are saved as pending with their CORE/COMPLEMENTARIA/OPCIONAL priority
3. The next response block merges pending templates with new templates, ordered by priority (CORE first), capped at 3 templates per block -- OPCIONAL is dropped first, CORE is never dropped
4. A pending CORE template displaces a new COMPLEMENTARIA or OPCIONAL template when the block exceeds the 3-template maximum

---

### Phase 32: Media Processing

**Goal:** Bot handles all WhatsApp media types intelligently -- transcribing voice notes, interpreting stickers, and routing images/videos to human agents -- instead of silently ignoring non-text messages.

**Dependencies:** Phase 29 (Inngest async -- media gate runs inside the Inngest function)

**Requirements:** MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04

**Risk:** MEDIUM (Whisper OGG format edge cases, sticker hallucination risk with Vision)

**Plans:** TBD

**Success Criteria:**
1. Voice notes and audio messages are transcribed via Whisper to Spanish text -- if the transcription contains 1-2 intents, they are processed normally as if the customer typed them; if 3+ intents are detected, the bot hands off to a human with a notification listing the detected topics
2. When an image or video arrives, the bot immediately hands off to the human agent with "Regalame 1 min" and a notification that media was received
3. Stickers are interpreted via Claude Vision -- recognizable ones (ok, thumbs up, greeting) are converted to equivalent text and processed normally; unrecognizable ones trigger handoff
4. Emoji reactions on messages are mapped to text equivalents (thumbs-up to "ok", heart to "ok", laugh to "jaja") and processed through the classification pipeline; ambiguous reactions trigger handoff

---

### Phase 33: Confidence Routing + Disambiguation Log

**Goal:** Bot routes low-confidence intent detections to human agents instead of guessing, and logs the full context of ambiguous situations for human review and future training.

**Dependencies:** Phase 30 (classification pipeline where confidence check integrates)

**Requirements:** CONF-01, CONF-02, CONF-03, INFRA-02

**Risk:** LOW (small code change in somnio-agent + new DB table)

**Plans:** TBD

**Success Criteria:**
1. When the IntentDetector returns confidence below 80%, the bot performs a real HANDOFF (bot off, "Regalame 1 min", notify host) instead of attempting a response
2. Every low-confidence handoff automatically creates a record in the disambiguation_log table capturing the customer message, agent state, top intent alternatives with scores, templates already sent, pending templates, and a conversation history summary
3. A human reviewer can open disambiguation_log entries (via Supabase dashboard in V1) and fill in the correct intent, correct action, and guidance notes -- marking them as reviewed
4. The disambiguation_log preserves full context from the block system (templates_enviados, pending_templates) so reviewers understand what the bot had already communicated

---

### Phase 34: No-Repetition System

**Goal:** Bot never sends the same information twice -- whether it was sent as a template, typed by a human, or generated by AI -- using a 3-level escalating verification system, and paraphrases templates for repeated intents.

**Dependencies:** Phase 31 (pre-send check provides the send loop where no-repetition integrates, templates_enviados registry must be reliable)

**Requirements:** BLOCK-05, BLOCK-06, BLOCK-07, BLOCK-08, INFRA-03

**Risk:** HIGH (3-level system is the most complex feature; Haiku accuracy for Spanish semantic comparison needs validation)

**Plans:** TBD

**Success Criteria:**
1. Level 1 -- a template whose exact ID was already sent in the conversation is never sent again (instant lookup from session_state.templates_enviados, 0ms, $0)
2. Level 2 -- a template whose minifrase theme was already covered by another outbound message (template, human, or AI) is detected and blocked via Haiku comparison (~200ms, ~$0.0003 per check)
3. Level 3 -- when Level 2 returns PARCIAL (partial thematic overlap), the system reads the full message text from DB and uses Haiku with complete context to decide whether the new template adds enough value to send (~1-3s)
4. When a customer asks about the same intent a second time, the bot sends the top 2 templates by priority (CORE first) paraphrased by Claude -- never repeating the same text verbatim
5. Each of the ~30 agent templates has a manually-defined minifrase that captures its thematic essence (used for Level 2 comparisons)

---

### Phase 35: Flujo Ofi Inter

**Goal:** Agent detects when a customer wants office pickup at Interrapidisimo (instead of home delivery) through direct mention, partial data patterns, or uncommon municipality names -- always confirming before changing the flow -- and collects the correct bifurcated data fields.

**Dependencies:** Phase 30 (classification pipeline), existing Ingest System (v2.0 Phase 15.5)

**Requirements:** OFINT-01, OFINT-02, OFINT-03, OFINT-04

**Risk:** LOW (conversation flow change within existing Somnio intent/ingest architecture)

**Plans:** TBD

**Success Criteria:**
1. The agent detects ofi inter intent through three paths: direct mention ("ofi inter", "recojo en inter"), municipality-only data without address, or uncommon/remote municipality name
2. When ofi inter is suspected, the agent ALWAYS asks "Deseas recibir en oficina de Interrapidisimo?" before changing the flow -- it never assumes office pickup
3. If confirmed as ofi inter, the data collection switches to 7 fields (nombre, apellido, telefono, cedula de quien recoge, municipio, departamento, correo) instead of the normal 8 fields (without direccion/barrio, with cedula)
4. When only a municipality arrives via the ingest system without an address, the system accumulates the data and then asks whether the customer wants office pickup or normal delivery before proceeding

---

### Phase 36: Documentación del Agente

**Goal:** Documentar completamente cómo se construyó Somnio -- arquitectura, decisiones, patrones, intents, templates, engine, adapters -- para que crear un nuevo agente en el futuro sea un proceso guiado en vez de desde cero.

**Dependencies:** None (runs in parallel with Phases 29-35, can start immediately)

**Requirements:** DOC-01

**Risk:** LOW (documentation only, no code changes)

**Plans:** TBD

**Success Criteria:**
1. Existe un documento que describe la arquitectura completa de Somnio: UnifiedEngine, adapters, tool registry, session state, intent detection, template selection, ingest system
2. El proceso de creación de un agente nuevo está documentado paso a paso: qué archivos crear, qué configurar, cómo registrar intents/templates, cómo conectar al WhatsApp pipeline
3. Las decisiones clave están documentadas con el "por qué" (no solo el "qué"): por qué plantillas y no IA generativa, por qué ports/adapters, por qué clasificación post-intent
4. Un desarrollador (humano o agente IA) puede seguir la documentación para crear un agente CRM básico sin leer el código de Somnio

---

## Standalone Phases (between milestones)

- [x] **WhatsApp Performance** — Realtime consolidation, panel lazy-loading, infrastructure (4 plans)
- [x] **Real Fields Fix** — DB migrations, backend pipeline, CRM UI for new fields (3 plans)
- [x] **Action Fields Audit** — Executor field pass-through, duplicate_order toggles, UI catalog + "Agregar campo", AI builder sync (4 plans)
- [ ] **CRM Orders Performance** — Kanban scroll, infinite scroll, virtualization (2/3 plans)
- [x] **WhatsApp Phone Resilience** — Secondary phone extraction from Shopify note_attributes, fallback chain in action executor (2 plans)
- [x] **Order Notes System** — Notes CRUD for orders + rename "Notas" to "Descripcion" (2 plans)
  Plans:
  - [x] order-notes-01-PLAN.md — DB migration + domain layer + types
  - [x] order-notes-02-PLAN.md — Server actions + UI component + integration + rename
- [x] **WhatsApp Webhook Resilience v2** — Conditional HTTP 500 for 360dialog retries, CLI replay script, Regla 5 (3 plans)
  Plans:
  - [x] resilience-v2-01-PLAN.md — DB migration (retry columns + expanded status CHECK)
  - [x] resilience-v2-02-PLAN.md — Conditional HTTP response + replayWebhookPayload export
  - [x] resilience-v2-03-PLAN.md — CLI replay script + scripts/tsconfig.json

## Progress

### Summary

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1-11 (+4 inserted) | 51 | Complete | 2026-02-04 |
| v2.0 Agentes | 12-20 (+5 inserted) | 83 | Complete | 2026-02-16 |
| v3.0 Logistica | 21-28 | 27 (Phases 21-28) | Complete | 2026-02-24 |
| v4.0 Comportamiento Humano | 29-36 | 18+ (Phases 29-31 complete) | Phase 31 Complete | — |
| Standalone | 7 phases | 21 | 6 complete, 1 in progress | |
| **Total** | **48 phases** | **182+ plans** | | |

### Current Phase

Phase 28: Robot Creador de Guias PDF — COMPLETE (5 plans, 3 waves)
Phase 31: Pre-Send Check + Interruption + Pending Merge — COMPLETE (4 plans, 3 waves)
Standalone: WhatsApp Webhook Resilience v2 — COMPLETE (3 plans, 3 waves)
Next: Phase 32 Media Processing

---

> **REGLA GLOBAL - LEARNINGS.md OBLIGATORIO**
>
> Cada fase DEBE incluir un archivo LEARNINGS.md antes de marcarse como completa.
> Template: `.planning/templates/LEARNINGS-TEMPLATE.md`

---
*Roadmap created: 2026-01-26*
*Last updated: 2026-02-23 (v4.0 Comportamiento Humano roadmap: 8 phases, 29 requirements)*
