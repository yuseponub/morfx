# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-28)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.
**Current focus:** MVP v2.0 — Phase 17 in progress (CRM Automations Engine)

## Current Position

Phase: 17 of 18 (CRM Automations Engine) — IN PROGRESS
Plan: 1 of 10 (17-01 complete)
Status: In progress
Last activity: 2026-02-12 — Completed 17-01-PLAN.md (Foundation: DB + Types + Constants)

Progress: [##########] 100% MVP v1 | [██████████████████░] 98% MVP v2

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- Phase 11 (Shopify Integration) verified by user
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Started (2026-02-04)

**Milestone Goal:** Agente de ventas Somnio funcionando en codigo propio, reemplazando n8n.

5 phases planned:
- Phase 12: Action DSL Real (4 plans) — COMPLETE
- Phase 13: Agent Engine Core (6 plans) — COMPLETE
- Phase 14: Agente Ventas Somnio (6 plans) — COMPLETE
- Phase 15: Agent Sandbox (5 plans) — COMPLETE
- Phase 15.5: Somnio Ingest System (TBD plans) — INSERTED (urgent fix)
- Phase 15.6: Sandbox Evolution (6 plans) — INSERTED — COMPLETE
- Phase 15.7: Ingest Timer Pluggable (3 plans) — INSERTED
- Phase 15.8: Codebase Cleanup (4 plans) — INSERTED — COMPLETE
- Phase 16: WhatsApp Agent Integration (6 plans) — IN PROGRESS (5/6)
- Phase 16.1: Engine Unification (6 plans) — INSERTED — COMPLETE
- Phase 17: CRM Automations Engine (10 plans) — IN PROGRESS (1/10)
- Phase 18: AI Automation Builder (TBD plans)

## Performance Metrics

**MVP v1 Velocity:**
- Total phases completed: 15 (11 planned + 4 inserted)
- Total plans completed: 51
- Total execution time: ~10 days (2026-01-26 to 2026-02-04)

**By Phase (recent):**

| Phase | Plans | Status |
|-------|-------|--------|
| 10. Search, Tasks & Analytics | 6/6 | Complete |
| 10.1 Task Notes & History | 4/4 | Complete |
| 11. Shopify Integration | 7/7 | Complete |
| 12. Action DSL Real | 4/4 | Complete |
| 13. Agent Engine Core | 6/6 | Complete |
| 14. Agente Ventas Somnio | 6/6 | Complete |
| 15. Agent Sandbox | 4/4 | Complete |
| 15.6 Sandbox Evolution | 6/6 | Complete |
| 15.7 Ingest Timer Pluggable | 2/3 | In Progress |
| 15.8 Codebase Cleanup | 4/4 | Complete |
| 16. WhatsApp Agent Integration | 5/6 | In Progress |
| 16.1 Engine Unification | 6/6 | Complete |
| 17. CRM Automations Engine | 1/10 | In Progress |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting MVP v2 work:

- [Research]: Use AI SDK 6 (@ai-sdk/anthropic) for Claude integration, not raw SDK
- [Research]: Use zustand for agent state management
- [Research]: 3 new tables: agents, agent_sessions, agent_turns
- [Research]: Preserve session versioning pattern from n8n agents
- [Research]: Token budget enforcement critical (50K max per conversation)
- [Research]: Hybrid execution: Next.js API routes + Supabase Edge Functions
- [12-01]: ToolResult<T> discriminated union with success boolean for handler responses
- [12-01]: In-memory sliding window rate limiter (not Redis) for single-process deployment
- [12-01]: Tool logger switched to createAdminClient (critical bug fix for API/agent contexts)
- [12-01]: agent_session_id added to ExecutionContext + ToolExecutionRecord for agent tracing
- [12-02]: All 9 CRM handlers real with createAdminClient and workspace isolation
- [12-02]: Tag operations use tag NAME (not ID) for agent-friendly interface
- [12-02]: Order create auto-resolves default pipeline and first stage
- [12-02]: Contact list supports ALL-match tag filtering
- [12-03]: All 7 WhatsApp handlers real with 360dialog integration, 24h window enforcement, template approval checks
- [12-03]: Conversation close maps to 'archived' status (DB constraint)
- [12-03]: Template lookup by name (not ID) for agent-friendly interface
- [12-04]: Domain-specific timeouts: CRM 5s, WhatsApp 15s, System 10s
- [12-04]: Rate limit enforced before handler execution (fail-fast)
- [12-04]: API route returns structured errors with HTTP status mapping (429, 504)
- [12-04]: executeToolFromAgent accepts optional agentSessionId for agent tracing
- [13-01]: Session-to-state relationship 1:1 via session_id PK/FK
- [13-01]: VersionConflictError is retryable, BudgetExceededError is not
- [13-01]: Tool calls stored as JSONB array with name/input/result structure
- [13-01]: Error class hierarchy with retryable flag for automatic retry decisions
- [13-02]: SessionManager uses admin client to bypass RLS (workspace isolation via explicit filters)
- [13-02]: PGRST116 error code for version conflict detection in optimistic locking
- [13-02]: Atomic session creation (agent_sessions + session_state with rollback)
- [13-02]: AgentRegistry.get throws AgentNotFoundError (not undefined return)
- [13-03]: Using claude-sonnet-4-5 for both models until Haiku 4.5 available
- [13-03]: Tool names converted: dots to underscores for Claude API, underscores to dots for Action DSL
- [13-03]: TokenUsage simplified to totalTokens instead of split input/output
- [13-04]: ConfidenceAction type and DEFAULT_CONFIDENCE_THRESHOLDS added to types.ts
- [13-04]: IntentDetectionError added to errors.ts for intent-specific failures
- [13-04]: Handoff/clarify actions handled locally without Claude call (saves tokens)
- [13-04]: Confidence routing: 85+ proceed, 60-84 reanalyze, 40-59 clarify, <40 handoff
- [13-05]: AgentEngine processMessage as main entry point with full flow
- [13-05]: Version conflict retry pattern (max 3 retries) for optimistic locking
- [13-05]: Dynamic inngest import to avoid circular dependencies
- [13-05]: Inngest event emission is non-blocking (failures logged but don't stop processing)
- [13-06]: Event naming convention: agent/{entity}.{action}
- [13-06]: waitForEvent match on data.sessionId for timer cancellation
- [13-06]: Lazy SessionManager initialization in Inngest functions
- [13-06]: 6-min data collection timeout, 10-min promos timeout
- [14-01]: 22 base intents + 11 hola+X combinations = 33 total intent definitions
- [14-01]: Intent categories: informativo (13), flujo_compra (8), escape (1), combinacion (11)
- [14-01]: 6 agent states: conversacion, collecting_data, ofrecer_promos, resumen, confirmado, handoff
- [14-01]: Agent registered as 'somnio-sales-v1' via module-level registration
- [14-02]: Using claude-haiku-4-5 for data extraction (fast, cheap)
- [14-02]: N/A as explicit value for negated fields (vs empty string)
- [14-02]: 5 critical fields for minimum data (timer trigger), 8 total for auto ofrecer_promos
- [14-02]: Normalization order: city first, then infer departamento
- [14-03]: SOMNIO_PRICES hardcoded ($77,900 / $109,900 / $139,900) - configurable prices deferred post-MVP
- [14-03]: Template cache 5-minute expiry for balance between freshness and performance
- [14-03]: Fallback from siguientes to primera_vez if no siguientes templates exist
- [14-04]: Pending messages stored in datos_capturados with __pending_messages key as JSON
- [14-04]: Interruption detected when last_activity_at is within 2 seconds of current time
- [14-04]: Complementary intents append pending, conflicting intents (asesor, queja) discard
- [14-04]: setTimeout for delays in non-Inngest context (Inngest uses step.sleep)
- [14-05]: resumen_* intents require ofrecer_promos seen first (CONTEXT.md rule)
- [14-05]: compra_confirmada requires resumen_* seen first (CONTEXT.md rule)
- [14-05]: ofrecer_promos auto-triggers when 8 fields complete (5 critical + 3 additional)
- [14-05]: shouldCreateOrder flag signals SomnioEngine to invoke OrderCreator
- [14-05]: Pack detection via regex patterns for natural language (quiero el de 2, dame el 3x)
- [15-01]: SandboxEngine uses mock session object for orchestrator compatibility
- [15-01]: localStorage MAX_SESSIONS=20 to prevent quota issues
- [15-01]: Session ID format: sandbox-{timestamp}-{random7chars}
- [15-02]: Inverted theme for sandbox: user=right/primary, agent=left/muted (opposite of inbox)
- [15-02]: HH:mm:ss timestamp format always visible on messages
- [15-02]: Message delays simulated 2-6 seconds for realistic agent typing
- [15-03]: JsonViewEditor from @uiw/react-json-view/editor for state editing (v2 API)
- [15-03]: Confidence thresholds: 85+ green, 60-84 yellow, 40-59 orange, <40 red
- [15-03]: Token budget warning at 40K (80% of 50K limit)
- [15-04]: Session controls in center of header (between agent selector and stats)
- [15-04]: Confirmation dialog before New session if messages exist
- [15-04]: Sandbox visible to all authenticated users (not adminOnly)
- [15.5-01]: MessageClassifier uses Haiku-first with Sonnet fallback pattern
- [15.5-01]: 4 classification categories: datos, pregunta, mixto, irrelevante
- [15.5-01]: Hola+datos classified as mixto (Pitfall 5 from research)
- [15.5-01]: Default to irrelevante with 30% confidence on parse failure
- [15.5-02]: IngestManager returns silent action for datos classification (no response)
- [15.5-02]: Timer starts on FIRST data only, does NOT restart on additional data
- [15.5-02]: 6min timeout for partial data, 10min for no data
- [15.5-02]: AllAgentEvents type combines base + ingest events for Inngest client
- [15.5-03]: SomnioEngine routes through IngestManager BEFORE intent detection in collecting_data
- [15.5-03]: Return undefined response (silent) for datos classification
- [15.5-03]: Emit agent/ingest.started on first data, agent/ingest.completed on 8 fields
- [15.5-03]: Implicit yes: datos outside collecting_data triggers mode transition + extraction
- [15.5-03]: IngestStatus tracks active, startedAt, firstDataAt, fieldsAccumulated, timerType
- [15.5-03]: Sandbox shows classification in debug: [SANDBOX: Silent - clasificacion: datos]
- [15.6-01]: ModelTokenEntry uses ClaudeModel type for type-safe model identity
- [15.6-01]: Orchestrator token split approximated 70/30 input/output (exact split unavailable)
- [15.6-01]: IngestStatus.timeline is required field (not optional) for simpler consumer code
- [15.6-01]: No changes to production SomnioOrchestrator/SomnioEngine - only sandbox pipeline
- [15.6-02]: Default visible tabs: Tools + Estado (matching CONTEXT.md)
- [15.6-02]: Max 3 visible panels enforced in handleToggleTab state logic
- [15.6-02]: Ingest panel shows placeholder text until Plan 04 creates IngestTab
- [15.6-03]: CRM agents separated from conversational agents; Somnio never calls CRM agents directly
- [15.6-03]: Self-registration pattern: importing crm/index.ts registers all CRM agents
- [15.6-03]: Live mode stubs return dry-run data with _note marker; real wiring in Plan 05
- [15.6-03]: OrderManagerMode: full (8 fields + pack), no_promo (8 fields, default 1x), draft (nombre + telefono)
- [15.6-04]: Timer presets: Real (360s/600s), Rapido (30s/60s), Instantaneo (0s/0s)
- [15.6-04]: Slider ranges: partial 0-600s step 10, noData 0-900s step 10
- [15.6-04]: Model display names: claude-haiku-4-5 -> Haiku, claude-sonnet-4-5 -> Sonnet
- [15.6-04]: Model color coding: Haiku=sky, Sonnet=violet for visual distinction
- [15.6-04]: Per-turn model badges use compact format: Haiku: 120in/45out
- [15.6-05]: CRM agents loaded via /api/sandbox/crm-agents route (dynamic from registry)
- [15.6-05]: CRM state reset to disabled+dry-run on session reset
- [15.6-05]: Live mode uses executeToolFromAgent with workspace='sandbox'
- [15.6-05]: ToolExecution.mode optional field for DRY/LIVE visual differentiation
- [15.6-05]: CRM orchestrator invoked only when shouldCreateOrder + order-manager in crmModes
- [15.7-01]: TIMER_MINIMUM_FIELDS (6 fields incl. apellido) separate from CRITICAL_FIELDS (5 fields)
- [15.7-01]: IngestTimerSimulator pure-logic class with no React deps (setTimeout/setInterval)
- [15.7-01]: Timer state in instance properties to avoid stale closure pitfall
- [15.7-01]: timerExpiresAt kept null for backward compat; new timer reads from TimerState
- [15.7-01]: 5 timer levels: Sin datos (600s), Datos parciales (360s), Datos minimos (120s), Promos sin respuesta (600s), Pack sin confirmar (600s)
- [15.7-01]: 3 presets: real, rapido (scaled 10x), instantaneo (1-2s minimum)
- [15.7-02]: timerExpireRef callback ref pattern prevents stale closures in simulator
- [15.7-02]: shadcn Switch component for timer enable/disable toggle
- [15.7-02]: Per-level slider ranges: L2 max 300s, L0/L3/L4 max 900s, L1 max 600s
- [15.7-02]: TimerDisplay shows M:SS format with level identifier and inline pause button
- [15.8-01]: State mutation in handleIngestMode/checkImplicitYes is intentional (document, don't refactor)
- [15.8-01]: Bug #8 timer signal override is intentional two-step design (cancel ingest -> start promos)
- [15.8-01]: Bug #5 ingest-timer stale closure already fixed in Phase 15.7 via contextProvider
- [15.8-01]: Bug #6 race condition documented as known limitation for Phase 16+
- [15.8-02]: DataExtractor model from constructor param (not hardcoded)
- [15.8-02]: WhatsApp HMAC verification env-gated (WHATSAPP_WEBHOOK_SECRET)
- [15.8-02]: Sandbox auth + workspace membership for LIVE mode only
- [15.8-02]: UUID regex validation for workspaceId in template-manager query
- [15.8-03]: constants.ts has ZERO imports from project files (prevents circular deps)
- [15.8-03]: CRITICAL_FIELDS, TIMER_MINIMUM_FIELDS, MIN_FIELDS_FOR_AUTO_PROMO consolidated in constants.ts
- [15.8-03]: Early expiration in reevaluateLevel documented with comment (no TimerAction type change)
- [15.8-04]: normalizePhoneRaw in phone.ts as canonical raw phone normalizer (without + prefix)
- [15.8-04]: CLAUDE_MODELS constant object in types.ts replaces scattered string literals
- [15.8-04]: createDefaultSessionState factory helper eliminates duplicate state construction
- [15.8-04]: message-classifier.ts keeps direct API model ID (uses Anthropic SDK directly, not ClaudeClient)
- [16-01]: workspace_agent_config table with global toggle, agent selection, handoff, timer preset, response speed
- [16-01]: 3-state per-conversation override: NULL=inherit, false=disabled, true=enabled
- [16-01]: Agent config uses createAdminClient for all DB operations (webhook/background context)
- [16-01]: DEFAULT_AGENT_CONFIG exported for server actions to return defaults when no row exists
- [16-02]: Inngest event emitted for ALL text messages; agent-config check deferred to processMessageWithAgent
- [16-02]: Typing indicator via Supabase Realtime broadcast on conversation:{id} channel
- [16-02]: sent_by_agent marked by timestamp range (all outbound after processingStartedAt)
- [16-02]: Auto-contact creation handles 23505 race condition (phone as name fallback)
- [16-02]: Handoff toggles only conversational agent OFF (CRM stays active)
- [16-02]: Round-robin assignment via last_assigned_at ASC NULLS FIRST
- [16-03]: Typing broadcast channel is conversation:{id} (matches webhook-processor, not agent-typing:{id})
- [16-03]: Agent filter uses agent_conversational !== false (includes null/inherit)
- [16-03]: Agent toggles only render after status loads (null guard prevents flash)
- [16-04]: SlidersHorizontal icon for agent config button (distinct from Bot toggle in header)
- [16-04]: Debounce 300ms for textarea/slider saves, immediate for toggles/selects
- [16-04]: Panel switching via rightPanel state ('contact' | 'agent-config') in inbox-layout
- [16-05]: Blended token cost rate $3/1M tokens (Haiku/Sonnet ~80/20 mix)
- [16-05]: avgResponseTimeMs returns 0 for MVP (needs instrumentation)
- [16-05]: 3 metric groups x 3 cards = 9 total (conversations, handoffs, costs)
- [16-05]: ConfigPanel reuses AgentConfigSlider data model with full-page descriptive layout
- [16.1-01]: AgentSessionLike uses SessionState directly (not simplified shape) for full orchestrator compatibility
- [16.1-01]: Debug-related fields use 'any' to keep engine types environment-agnostic
- [16.1-01]: TimerAdapter.signal() synchronous void (sandbox accumulates, production fire-and-forget)
- [16.1-01]: engine/ directory coexists with engine.ts; bundler resolution prefers file over directory for existing imports
- [16.1-02]: SomnioAgent uses explicit return types (IngestModeResult, ImplicitYesResult) instead of state mutation
- [16.1-02]: Mock session built inside agent with intentsVistos BEFORE current intent for primera_vez detection
- [16.1-02]: Timer signals as array (not single value) to preserve two-step cancel+start pattern
- [16.1-02]: IngestStatus types use unknown to keep agent environment-agnostic
- [16.1-03]: SandboxStorageAdapter adds created_at/updated_at/last_activity_at for AgentSessionWithState compat
- [16.1-03]: SandboxOrdersAdapter uses dynamic import for crmOrchestrator to avoid circular deps
- [16.1-03]: ProductionTimerAdapter emits 5 Inngest events covering 4 lifecycle points (non-blocking)
- [16.1-03]: ProductionStorageAdapter uses cast for AgentSessionLike (structural compat with AgentSessionWithState)
- [16.1-03]: SandboxTimerAdapter overwrites on each signal() call (supports cancel+start two-step)
- [16.1-04]: Engine created per-request (not module-level) because sandbox adapters hold per-request state
- [16.1-04]: EngineOutput mapped to SandboxEngineResult shape explicitly in route for frontend compatibility
- [16.1-04]: Order result messages generated by engine (not agent) since they depend on adapter CRM mode config
- [16.1-05]: Dynamic import of ../engine/unified-engine directly (not barrel) for parallel plan compatibility
- [16.1-05]: EngineOutput mapped to SomnioEngineResult with retryable defaulting to true for backward compat
- [16.1-05]: EngineOutput type imported statically from engine/types.ts; UnifiedEngine class uses dynamic import
- [17-01]: 10 trigger types (CRM + WhatsApp + Tasks), 11 action types including duplicate_order
- [17-01]: Recursive ConditionGroup type for nested AND/OR condition trees
- [17-01]: constants.ts has ZERO imports — catalogs read programmatically by Phase 18
- [17-01]: MAX_CASCADE_DEPTH=3, MAX_ACTIONS=10, MAX_AUTOMATIONS=50 as starting limits
- [17-01]: source_order_id on orders distinct from linked_order_id (automation-created vs returns)
- [17-01]: automation_executions is SELECT-only via RLS (created by system, not users)

### Project Rules

Established in `CLAUDE.md`:
1. ALWAYS restart server after code changes before testing
2. ALWAYS use America/Bogota timezone for dates
3. ALWAYS follow GSD workflow completely

### Pending Todos

- Configure SMTP in Supabase for production email sending
- Mobile nav workspace switcher
- Apply migrations to Supabase (all pending)
- Configure 360dialog webhook URL and env vars
- Set WHATSAPP_WEBHOOK_SECRET env var in Vercel for production HMAC verification
- Configure Inngest env vars (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY)

### Future Phase: Somnio Sales Agent v2

**Problema identificado:** Templates con contenido duplicado se envían múltiples veces en la misma conversación.

**Solución propuesta:**
1. Concepto de "primera duda" vs "dudas siguientes" basado en turno de intents
2. Templates modulares reutilizables (tiempoefecto1, modopago, etc.)
3. Primera duda: 3 templates (respuesta + complemento1 + complemento2)
4. Dudas siguientes: 2 templates (respuesta + complemento), sin repetir contenido ya enviado
5. Filtrado por contenido (hash) además de por template ID
6. El intent "hola" podría no contarse como intent real para este cálculo

### Roadmap Evolution

- Phase 16.1 inserted after Phase 16: Engine Unification - Unificar SandboxEngine y SomnioEngine en un solo flujo con adapters (URGENT)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 17-01-PLAN.md (Foundation: DB + Types + Constants)
Resume file: None
Next: 17-02-PLAN.md (Condition Evaluator)
