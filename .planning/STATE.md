# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos, automatizaciones inteligentes y agentes IA.
**Current focus:** Phase 36 Shopify Product Conditional Assignment (v4.0)

## Current Position

Phase: 36 of 36 (Shopify Product Conditional Assignment) -- IN PROGRESS
Plan: 1 of 2 complete (01)
Status: Plan 01 complete -- conditional product mapping backend (resolveConditionalProducts + 3-mode executeCreateOrder)
Standalone: Debug Panel v4.0 — COMPLETE (5/5 plans)
Standalone: v3-state-machine — IN PROGRESS (3/4 plans)
Standalone: v3-two-track-decision — IN PROGRESS (1/2 plans)
Standalone: Robot GoDentist Integration — COMPLETE (4/4 plans)
Standalone: Conversation Tags to Contact — COMPLETE (2/2 plans)
Standalone: GoDentist Scraping General — COMPLETE (2/2 plans)
Standalone: v3-ofi-inter — IN PROGRESS (1/2 plans)
Standalone: GoDentist Followup Ultimatum — IN PROGRESS (1/3 plans)
Standalone: SMS Module — IN PROGRESS (3/4 plans)
Standalone: v3-tiempo-entrega — IN PROGRESS (2/3 plans)
Standalone: Shopify Contact Resolution — COMPLETE (3/3 plans)
Standalone: Agent GoDentist — COMPLETE (7/7 plans, verified 15/15)
Last activity: 2026-03-18 — Completed agent-godentist: full agent pipeline + 73 templates

Progress: [##########] 100% MVP v1 | [##########] 100% MVP v2 | [##########] 100% v3.0 | [#########-] 95% v4.0

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Complete (2026-02-16)

All 9 phases + 5 inserted phases completed:
- 83 plans executed across 14 phases
- 441 commits, 454 files, 121K lines added

### v3.0 Logistica (8/8 phases complete — SHIPPED 2026-02-24)

| Phase | Name | Status |
|-------|------|--------|
| 21 | DB + Domain Foundation | COMPLETE (4/4 plans) |
| 22 | Robot Coordinadora Service | COMPLETE (3/3 plans) |
| 23 | Inngest Orchestrator + Callback API | COMPLETE (3/3 plans) |
| 24 | Chat de Comandos UI | COMPLETE (3/3 plans) |
| 25 | Pipeline Config UI + Docs | COMPLETE (2/2 plans) |
| 26 | Robot Lector de Guias Coordinadora | COMPLETE (3/3 plans) |
| 27 | Robot OCR de Guias | COMPLETE (4/4 plans) |
| 28 | Robot Creador de Guias PDF | COMPLETE (5/5 plans) |

### v4.0 Comportamiento Humano (Planned)

| Phase | Name | Status |
|-------|------|--------|
| 29 | Inngest Migration + Character Delays | COMPLETE (4/4 plans) |
| 30 | Message Classification + Silence Timer | COMPLETE (3/3 plans) |
| 31 | Pre-Send Check + Interruption + Pending Merge | COMPLETE (4/4 plans) |
| 32 | Media Processing | COMPLETE (3/3 plans) |
| 33 | Confidence Routing + Disambiguation Log | COMPLETE (2/2 plans, verified 8/8) |
| 34 | No-Repetition System | COMPLETE (4/4 plans) |
| 35 | Flujo Ofi Inter | COMPLETE (2/2 plans, v1 only — v3 reimpl as standalone) |
| 36 | Shopify Product Conditional | IN PROGRESS (1/2 plans) |

### Standalone Work (between v2.0 and v3.0)

- WhatsApp Performance (4 plans) — COMPLETE
- Real Fields Fix (3 plans) — COMPLETE
- Action Fields Audit (4 plans) — COMPLETE
- CRM Orders Performance (2/3 plans) — IN PROGRESS
- WhatsApp Phone Resilience (2 plans) — COMPLETE
- Bulk Actions for Orders (1/2 plans) — IN PROGRESS
- Order Notes System (2/2 plans) — COMPLETE
- WhatsApp Webhook Resilience v2 (3/3 plans) — COMPLETE
- Robot Coordinadora Hardening (5/5 plans) — COMPLETE
- Debug Panel v4.0 (5/5 plans) — COMPLETE
- Robot GoDentist Integration (4/4 plans) — COMPLETE
- Conversation Tags to Contact (2/2 plans) — COMPLETE
- GoDentist Scraping General (2/2 plans) — COMPLETE
- GoDentist Followup Ultimatum (1/3 plans) — IN PROGRESS
- v3-ofi-inter (1/2 plans) — IN PROGRESS
- Shopify Contact Resolution (3/3 plans) — COMPLETE
- Agent GoDentist (2/7 plans) — IN PROGRESS
- Quick fixes: 28 completed

## Performance Metrics

**Overall:**
- Total phases completed: 42 (36 milestone + 6 standalone)
- Total plans completed: 217
- Total execution time: ~31 days (2026-01-26 to 2026-02-26)

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.

Phase 28 decisions:
- Guide gen config stored on same carrier_configs row (carrier='coordinadora') alongside dispatch/OCR config
- Non-fatal tag fetch: getOrdersForGuideGeneration proceeds without tags on error
- destStageId nullable (optional post-generation stage move)
- bwip-js imported via 'bwip-js/node' subpath (bundler moduleResolution cannot resolve root conditional exports)
- Claude AI normalization fallback: buildFallbackOrder() returns usable defaults instead of throwing
- valorCobrar set to "$0" when pagoAnticipado is true (prepaid = nothing to collect)
- Per-order barcode try/catch: failed barcode skips without crashing the entire PDF
- GuideGenCard sub-component for DRY carrier config cards (pipeline + source stage + dest stage)
- Pipeline change resets both source and dest stage selections
- Generate + upload in same Inngest step.run to avoid 4MB step output limit
- Stage move errors non-fatal: logged but don't fail the job

Order notes system decisions:
- No activity logging for order notes (no order_activity table exists)
- Extended existing domain/notes.ts rather than creating new file
- Notes loaded via useEffect on sheet open, not in initial page query
- WhatsApp view shows notes read-only (no CRUD buttons)
- 'Notas' label reserved exclusively for notes entity; 'Descripcion' for order.description

Phase 29 decisions:
- processAgentInline helper: DRY extraction for shared inline/fallback path
- processed_by_agent marks ALL unprocessed inbound messages (batch case)
- Inngest send failure falls back to inline processing (safety net)

Phase 30 decisions:
- no_gracias intent NOT created: existing no_interesa covers polite refusals
- fallback triggers emptied: overlapping keywords moved to dedicated asesor intent
- bienvenida state added to SOMNIO_STATES for explicit state machine correctness
- ACKNOWLEDGMENT_PATTERNS uses regex array (not Set) for pattern matching flexibility
- Retake message is a constant (not AI-generated) for predictability
- 90s timeout hardcoded (not configurable via workspace preset)
- is_agent_enabled guard before timer-triggered retake messages (prevents retake after HANDOFF)
- Non-blocking onSilenceDetected: log failure but don't crash request
- classifyMessage checks raw message text for SILENCIOSO (not intent name) -- IntentDetector maps "ok" to varying intents
- Step 5.5 placed after step 6 (needs newIntentsVistos), before step 7 (preserves low-confidence handoff path)
- HANDOFF early return includes cancel timer signal to stop active timers on handoff

Recent decisions affecting v4.0:
- Inngest migration with USE_INNGEST_PROCESSING feature flag for instant rollback
- Character delay curve: min 2s, cap 12s at 250 chars, logarithmic
- Classification post-IntentDetector (not pre-gate regex)
- SILENCIOSO only in non-confirmatory states (resumen/collecting_data/confirmado are always RESPONDIBLE)
- Debounce eliminated -- check pre-envio + char delay is the natural window
- Priorities CORE/COMP/OPC per template per intent (not global)
- No-repetition: 3 escalating levels (ID lookup, minifrase Haiku, full context)
- Confidence V1: 2 bands (80%+ respond, <80% handoff+log), disambiguator built later with real data
- Ofi Inter: always confirm, never assume; 3 detection paths

Phase 31 decisions (Plan 01):
- Dedup across block/pool: shouldReplace() replaces block entries when pending pool candidate has same templateId and is preferred
- Excess intent overflow classified individually: OPC dropped, CORE/COMP to pending
- Pool sort: PRIORITY_RANK primary, isNew tiebreaker (pending first), orden final

Phase 31 decisions (Plan 02):
- Priority as TEXT with CHECK constraint (not Postgres enum) for flexibility
- Default priority CORE for backward compatibility
- Seed priorities by orden (0=CORE, 1=COMP, 2+=OPC)
- isValidTemplatePriority as standalone type guard (not importing from parallel plan files)

Phase 31 decisions (Plan 03):
- Pre-send check runs AFTER char delay and BEFORE send (customer types during delay)
- Check applies to every template including index 0 (first one)
- Lightweight count query with head:true (no row data fetched)
- Interrupted result captured but NOT acted upon yet (Plan 04 handles pending storage)

Phase 31 decisions (Plan 04):
- Block composition guard: hasTemplates && !forceIntent (sandbox + timer bypass)
- sentMessageContents tracks actually-sent template content for accurate assistant turn recording
- Silence timer sends up to 3 pending templates with char-delay before retake message
- Retake message is separate from template cap (system message, not a template)
- sentCount=0 interruption discards all templates and clears pending (fresh recalculation)

Resilience v2 decisions (Plan 01):
- Idempotent DDL with IF EXISTS/IF NOT EXISTS for safe migration re-runs
- Partial index for replay queries: only indexes failed rows with retry_count < 3
- Regla 5 added to CLAUDE.md: migration must be applied in production before deploying dependent code

Resilience v2 decisions (Plan 02):
- processWebhook swallows errors when stored=true (ACK for replay)
- processWebhook re-throws only when eventId=null (no safety net)
- replayWebhookPayload intentionally duplicates inner processing loop (different responsibilities)
- updateWhatsAppWebhookEvent uses Record<string, unknown> for conditional field updates

Resilience v2 decisions (Plan 03):
- dotenv/config as first import before any app imports (env must load before process.env reads)
- Script manages status updates directly via its own Supabase client (not through domain layer)
- 2-second delay between events for rate limiting during batch replay

Robot Coordinadora Hardening decisions (Plan 02):
- Fetch timeout formula: 60s/order + 10min base margin (same for fetch and waitForEvent)
- Error propagation via pending robot_job_items (no schema migration needed)
- Settle sleep increased from 2s to 5s (mitigates Inngest waitForEvent race #1433)

Robot Coordinadora Hardening decisions (Plan 04):
- Flag reset on inngest.send failure allows retry to re-attempt emission
- 500 response on send failure (robot service retries on 5xx; returning 200 caused silent data loss)
- UUID regex validation prevents unnecessary DB lookups with garbage IDs
- errorMessage truncated to 500 chars to prevent oversized payloads in DB

Robot Coordinadora Hardening decisions (Plan 03):
- Soft tracking number validation: warn on suspicious lengths (< 3 or > 50) but don't block (carrier formats vary)
- Safe access filter pattern: pedidoNumbers uses .map().filter(NonNullable) instead of non-null assertions
- createOcrRobotJob domain function for OCR jobs (null order_id, workspace-scoped)

Robot Coordinadora Hardening decisions (Plan 01):
- SECURITY DEFINER on increment_robot_job_counter RPC for admin-level counter updates
- Error items are re-processable (not terminal) to support retry scenarios; only success is terminal
- Auto-completion logic moved to SQL (prevents application-level race on status transition)

Phase 32 decisions (Plan 01):
- Heart emoji mapped with and without variation selector U+FE0F for WhatsApp client compatibility
- ReactionAction as intermediate type before conversion to MediaGateResult (separation of concerns)
- Inngest event media fields are optional for backward compatibility with existing text-only flow

Phase 32 decisions (Plan 02):
- Claude Sonnet 4 for sticker vision (matches OCR module pattern, ~$0.001-0.005/sticker)
- Dynamic media_type detection from Content-Type header for sticker interpretation (not hardcoded webp)
- handleReaction is synchronous (no async needed, pure function delegation to reaction-mapper)

Phase 32 decisions (Plan 03):
- AGENT_PROCESSABLE_TYPES as local const inside processIncomingMessage (scoping clarity)
- Reactions pass raw emoji to Inngest (not '[Reaccion]'), media gate's mapReaction handles mapping
- Inline fallback restricted to text-only: media messages silently skip when Inngest unavailable
- Media handoff uses executeHandoff directly (bypasses engine), requires explicit silence timer cancellation
- notify_host uses domain createTask (Rule 3), not raw supabase insert
- No messageType added to ProcessMessageInput: media gate resolves everything to text before processMessageWithAgent

Phase 33 decisions (Plan 01):
- LOW_CONFIDENCE_THRESHOLD = 80 as simple numeric constant (not configurable per workspace yet)
- Rule 1.5 placed after HANDOFF_INTENTS check: explicit handoff intents bypass confidence check
- Reason string format low_confidence:N enables Plan 02 to parse confidence value for logging
- contact_id nullable with ON DELETE SET NULL (contact may be deleted after log entry)
- No updated_at column on disambiguation_log (records immutable once reviewed; reviewed_at suffices)

Phase 33 decisions (Plan 02):
- Fire-and-forget pattern: .catch() ensures handoff proceeds regardless of log failure
- Only low-confidence handoffs logged (reason.startsWith('low_confidence:')), not intent-based handoffs
- Admin client direct write for disambiguation_log (audit/diagnostic table, not domain layer)
- Last 10 conversation turns captured (input.history.slice(-10)), no LLM summarization
- Step 7 timer cancel fix: empty array -> [{type: 'cancel', reason: 'handoff'}] (phantom timer prevention)

Phase 34 decisions (Plan 02):
- Sonnet 4 for all Haiku calls (claude-sonnet-4-20250514) until Haiku 4 available
- Fail-open on all error paths (ENVIAR on API/parse errors, send rather than block)
- Template minifrases cached per-instance (Map) to avoid repeated DB queries in same request
- Level 3 only receives entries with fullContent (human/AI), not templates
- Minifrase generation uses Promise.all for parallel Haiku calls
- Fallback minifrase: first 15 words of content (no LLM call needed)

Phase 34 decisions (Plan 03):
- Anthropic client as module-level singleton (matching message-classifier.ts pattern)
- MIN_CONTENT_LENGTH=20 threshold to skip paraphrasing very short templates
- MAX_LENGTH_RATIO=1.3 validation (paraphrased max 30% longer than original)
- REPEATED_INTENT_MAX_TEMPLATES=2 cap (top 2 by priority for repeated intents)
- processTemplates now async with isRepeated parameter (backward compatible default=false)
- visitType always returns 'primera_vez' (siguientes logic completely removed from TemplateManager)

Phase 34 decisions (Plan 04):
- Only useBlockComposition path gets no-rep filter (forceIntent and sandbox bypass it)
- Fail-open at pipeline level: entire no-rep crash falls back to sending full block
- Two-phase save: pre-send saves base templates_enviados, post-send appends only sent IDs
- Empty filtered block sends nothing, clears stale pending, logs the event
- Interruption slicing uses filteredBlock (not composed.block) for accurate pending storage

Phase 35 decisions (Plan 01):
- OFI_INTER_CRITICAL_FIELDS uses 'ciudad' not 'municipio' (reuses existing field, zero schema changes)
- REMOTE_MUNICIPALITIES stored as accent-stripped Set for O(1) lookup
- hasCriticalDataInter requires 4 critical + 2 additional = 6 minimum (cedula optional)
- New mode-aware methods added alongside existing ones for backward compatibility
- CONFIRMATORY_MODES includes collecting_data_inter (RESPONDIBLE, not SILENCIOSO)

Phase 35 decisions (Plan 02):
- Route 1 transitions immediately to collecting_data_inter (direct mention dominates)
- Route 3 saves city but does NOT change mode (waits for customer answer)
- Route 2 only fires in collecting_data mode (not collecting_data_inter)
- Implicit yes always uses normal mode hasCriticalData (ofi inter only via explicit Routes 1-3)
- IngestResult action union extended with ask_ofi_inter for Route 2
- checkAutoTriggersForMode replaces checkAutoTriggers in orchestrator for mode-aware auto-trigger

Phase 36 decisions (Plan 01):
- productMappings takes precedence over copyProducts when both present (3-mode priority)
- Numeric normalization via parseFloat for decimal comparison (109994.80 vs 109994.8)
- Product not found returns empty array (graceful degradation, no throw)
- Empty match result treated as undefined (no products) for domain layer
- product_mapping param type registered in ACTION_CATALOG for custom UI in Plan 02

Debug Panel v4.0 decisions (Plan 01):
- Debug data flows through SomnioAgentOutput (not separate channels) per RESEARCH.md
- All new DebugTurn fields optional for backward compatibility with saved sessions
- rulesChecked re-evaluates all 4 classifier rules for debug visibility
- Template selection reconstructed from orchestrator result (no internal exposure)
- Transition validation inferred from orchestrator result (allowed = has response/templates)
- Ofi Inter Route 2 captured in handleIngestMode ask_ofi_inter early return
- DebugParaphrasing DEFERRED (no engine capture exists yet)

Debug Panel v4.0 decisions (Plan 02):
- FilteredTemplateEntry accessed via f.template.templateId (not f.templateId) per no-repetition-types.ts
- Spread array instead of .concat() to fix TypeScript literal type narrowing conflict
- No-rep disabled path records { enabled: false } explicitly for frontend "off" vs "no data" distinction
- Timer signals always recorded with ?? [] fallback for consistent debug output

Debug Panel v4.0 decisions (Plan 04):
- Turn chip flags use unicode characters for compact inline display
- PipelineStep uses -- prefix for skipped steps instead of block characters
- Claude call estimator is heuristic: counts intent + classifier + extractor + per-template L2/L3
- Auto-select latest turn via useEffect on debugTurns.length change
- Safe index clamping prevents out-of-bounds on session reset

Debug Panel v4.0 decisions (Plan 05):
- Timer controls (toggle, presets, sliders) migrated to Config tab; timer display (countdown, pause) stays in Ingest
- Paraphrasing section deferred from Bloques tab (no recordParaphrasing() or engine capture)
- No-rep Level badges use single-char abbreviations (P/F/E/N/~) for compact table columns
- pending_templates display skipped (SandboxState lacks the field)

Conversation Tags to Contact decisions:
- addTagToConversation/removeTagFromConversation delegate to contact actions via dynamic import (preserves signatures)
- godentist.ts changed from entityType 'conversation' to 'contact' (only remaining caller)
- getTagsForContact server action for efficient realtime refetch by contactId
- contact_tags requires ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags for realtime events
- contacts.ts getContactConversations still queries conversation_tags (out of scope, future cleanup)
- conversation-tag-input shows "Vincular contacto primero" when contactId is null

### Pending Todos

- Run ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags in Supabase SQL editor
- Configure SMTP in Supabase for production email sending
- Set USE_NO_REPETITION=true in Vercel env vars when ready to activate no-repetition system (Phase 34)
- Configure 360dialog webhook URL and env vars
- Set WHATSAPP_WEBHOOK_SECRET env var in Vercel
- Configure Inngest env vars (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY)
- Set USE_INNGEST_PROCESSING=true in Vercel to enable async agent processing
- Set ROBOT_CALLBACK_SECRET env var in Vercel and Railway
- Set OPENAI_API_KEY env var in Vercel for Whisper audio transcription (Phase 32)
- Apply migration `20260319100000_composite_indexes_conversations.sql` in production (composite indexes for inbox queries)
- Delete deprecated files (SomnioEngine, SandboxEngine, /api/agents/somnio)
- Complete bulk-actions-orders-002 (integration into table/kanban)
- Complete CRM Orders Performance plan 003 (virtualization)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 007 | Soporte tag P/A en subir ordenes Coordinadora | 2026-03-05 | 622dadb | [007-pago-anticipado-coordinadora](./quick/007-pago-anticipado-coordinadora/) |
| 008 | Validacion COD en robot Coordinadora | 2026-03-06 | 91a544c | [008-validacion-cod-coordinadora](./quick/008-validacion-cod-coordinadora/) |
| 009 | accionesEjecutadas como campo propio en sandbox v3 | 2026-03-07 | 263fca8 | [009-acciones-ejecutadas-campo-propio-sandbox-v3](./quick/009-acciones-ejecutadas-campo-propio-sandbox-v3/) |
| 010 | Filtro por etiqueta en inbox WhatsApp | 2026-03-07 | e45c03f | [010-filtro-tag-inbox-whatsapp](./quick/010-filtro-tag-inbox-whatsapp/) |
| 011 | Debug panel cleanup post two-track refactor | 2026-03-08 | f7039b8 | [011-debug-panel-cleanup-two-track](./quick/011-debug-panel-cleanup-two-track/) |
| 012 | Eliminar ingest y unificar timers en sales track | 2026-03-08 | 1d2c1f9 | [012-eliminar-ingest-unificar-timers](./quick/012-eliminar-ingest-unificar-timers/) |
| 013 | Refactor sandbox timer countdown only | 2026-03-09 | fe78256 | [013-refactor-sandbox-timer-countdown-only](./quick/013-refactor-sandbox-timer-countdown-only/) |
| 014 | Unificar silence L5 y eliminar catch-all | 2026-03-09 | 6c3ffb4 | [014-unificar-silence-l5-eliminar-catchall](./quick/014-unificar-silence-l5-eliminar-catchall/) |
| 015 | Cleanup v3 pipeline dead code y legacy naming | 2026-03-09 | 6b71677 | [015-cleanup-v3-pipeline-codigo-muerto-legacy](./quick/015-cleanup-v3-pipeline-codigo-muerto-legacy/) |
| 016 | Eliminar ack routing, comprehension como autoridad unica | 2026-03-10 | 63dbc76 | [016-eliminar-ack-routing-comprehension-autoridad](./quick/016-eliminar-ack-routing-comprehension-autoridad/) |
| 017 | Accion retoma para L5 en initial con template retoma_inicial | 2026-03-10 | f34aa99 | [017-accion-retoma-l5-initial-template-retoma](./quick/017-accion-retoma-l5-initial-template-retoma/) |
| 018 | Eliminar templateIntents decorativos de transitions.ts | 2026-03-10 | a8a3208 | [018-eliminar-templateintents-decorativos-transitions](./quick/018-eliminar-templateintents-decorativos-transitions/) |
| 019 | Acciones retoma_datos (L0) y retoma_datos_parciales (L1) con templates dedicados | 2026-03-10 | 5afff86 | [019-retoma-datos-l0-l1-templates](./quick/019-retoma-datos-l0-l1-templates/) |
| 020 | Separar system events del pipeline + fix camposFaltantes barrio | 2026-03-10 | 9ae89ee | [020-system-event-separation](./quick/020-system-event-separation/) |
| 021 | Consistencia datosCriticos/datosCompletos (rename + correo en extras) | 2026-03-11 | 30c7738 | [021-consistencia-datos-criticos-completos](./quick/021-consistencia-datos-criticos-completos/) |
| 022 | crear_orden_sin_promo/sin_confirmar + crmAction flag | 2026-03-11 | 601a646 | [022-crear-orden-sin-promo-confirmar-crmaction](./quick/022-crear-orden-sin-promo-confirmar-crmaction/) |
| 023 | Sandbox template interruption v3 (pre-send check frontend) | 2026-03-14 | 511e9f6 | [023-sandbox-template-interruption-v3](./quick/023-sandbox-template-interruption-v3/) |
| 024 | Sandbox message accumulation v3 (two-path post-interruption) | 2026-03-15 | 7b14a9e | [024-sandbox-message-accumulation-v3](./quick/024-sandbox-message-accumulation-v3/) |
| 025 | Independizar templates v3 de v1 | 2026-03-15 | cf8249d | [025-independizar-templates-v3-de-v1](./quick/025-independizar-templates-v3-de-v1/) |
| 027 | Integrar v3 a produccion - Fase 1 Foundation | 2026-03-16 | 6c087a5 | [027-integrar-v3-a-produccion-fase-1-foundati](./quick/027-integrar-v3-a-produccion-fase-1-foundati/) |
| 028 | V3 production timer system (fase 2) | 2026-03-16 | 0ada8b0 | [028-v3-production-fase-2-timer-system](./quick/028-v3-production-fase-2-timer-system/) |
| 029 | Fix WhatsApp inbox: sidebar nav, realtime, query perf | 2026-03-19 | 0d68c56 | [029-fix-whatsapp-inbox-sidebar-realtime-perf](./quick/029-fix-whatsapp-inbox-sidebar-realtime-perf/) |

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-19 COT
Stopped at: Completed quick-029 (WhatsApp inbox sidebar nav, realtime, query perf)
Resume file: None
Next: Apply migration 20260319100000 in production, then push code
