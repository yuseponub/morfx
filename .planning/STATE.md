# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-28)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.
**Current focus:** MVP v2.0 — Phase 19 in progress (AI Automation Builder)

## Current Position

Phase: 19 of 19 (AI Automation Builder) — IN PROGRESS
Plan: 4 of TBD (diagram generator & validation)
Status: In progress
Last activity: 2026-02-14 — Completed 19-04-PLAN.md

Progress: [##########] 100% MVP v1 | [████████████████████████] 98% MVP v2

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
- Phase 17: CRM Automations Engine (10 plans) — COMPLETE (2026-02-13)
- Phase 18: Domain Layer Foundation (10 plans) — COMPLETE (2026-02-13)
- Phase 19: AI Automation Builder (TBD plans) — IN PROGRESS (4/TBD)

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
| 17. CRM Automations Engine | 10/10 | Complete |
| 18. Domain Layer Foundation | 10/10 | Complete |
| 19. AI Automation Builder | 4/TBD | In Progress |

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
- [17-02]: String coercion for equals/not_equals allows number-to-string comparison
- [17-02]: Vacuous truth for empty condition groups (no conditions = match all)
- [17-02]: not_equals/not_contains/not_in return true for null/missing values (logically correct)
- [17-02]: buildTriggerContext maps 8 Spanish namespaces: contacto, orden, tag, mensaje, conversacion, tarea, campo, entidad
- [17-02]: resolveVariables leaves {{path}} unchanged for missing top-level keys, empty string for null values
- [17-03]: getAuthContext() helper combines auth+workspace membership check for all 11 server actions
- [17-03]: getAutomations() enriches with _recentExecutions and _lastExecutionStatus (last 24h)
- [17-03]: duplicateAutomation truncates name to 92 chars before ' (copia)' to respect 100 char limit
- [17-03]: getExecutionHistory uses separate count+data queries for accurate pagination
- [17-03]: getAutomationStats returns 100% success rate when zero executions (avoids division by zero)
- [17-04]: WhatsApp media uses direct 360dialog sendMediaMessage API (no tool handler for media)
- [17-04]: Lazy import of trigger-emitter from action-executor to avoid circular dependency
- [17-04]: Inngest send cast via (inngest.send as any) to bypass typed event schema until Plan 06
- [17-04]: CRM state-modifying actions emit cascade events; WhatsApp/webhook/task do not cascade
- [17-04]: Custom fields merged into JSONB via read-modify-write on custom_fields column
- [17-05]: Wizard state via useState in container, passed as props to step components (not context)
- [17-05]: Trigger type change resets conditions to null (variables differ per trigger)
- [17-05]: ConditionGroupEditor with 1 level nesting (depth < 1 check)
- [17-05]: ActionParamField dynamically renders UI control based on param.type from ACTION_CATALOG
- [17-05]: readonly string[] cast for as-const options to avoid TypeScript mutable/readonly mismatch
- [17-05]: ActionSelector popover grouped by category for action type selection
- [17-05]: KeyValueEditor sub-component for headers and WhatsApp template variables
- [17-06]: Factory pattern creates all 10 runners from single createAutomationRunner function
- [17-06]: Mid-execution disable check reads is_enabled from DB before each action
- [17-06]: Actions stop on first failure with remaining actions marked as skipped
- [17-06]: Concurrency limited to 5 per workspace via Inngest concurrency key
- [17-06]: Cascade depth double-checked: trigger-emitter + runner entry point (defense in depth)
- [17-06]: Execution record created before actions, updated after completion
- [17-07]: Tag emissions require extra queries for tag name and workspace_id (not in function params)
- [17-07]: Bulk tag operations emit per-contact events (not batched) for accurate automation triggering
- [17-07]: updateOrder emits both field.changed AND order.stage_changed when stage changes
- [17-07]: WhatsApp automation emission fires for ALL message types (not just text)
- [17-07]: Dynamic import of trigger-emitter in webhook handler to avoid circular dependency
- [17-08]: badgeType field replaces hasBadge boolean for multi-badge sidebar support
- [17-08]: Category colors: CRM=blue, WhatsApp=green, Tareas=yellow matching TRIGGER_CATALOG
- [17-08]: List page uses enriched _lastExecutionStatus from getAutomations (avoids N+1 client fetches)
- [17-08]: History page uses URL searchParams for server-side pagination
- [17-08]: useAutomationBadge hook polls getRecentFailures every 5 minutes
- [17-09]: RelatedOrders placed in OrderSheet (side panel) since no standalone order detail page exists
- [17-09]: Related orders fetched client-side via useEffect (non-blocking sheet render)
- [17-09]: In-sheet navigation for same-pipeline orders, router.push fallback for cross-pipeline
- [17-09]: stage_color added to RelatedOrder type for visual stage badges
- [18-01]: DomainContext.source typed as string (not union) for extensibility
- [18-01]: DomainResult<T> uses optional data/error fields (not discriminated union) for simplicity
- [18-01]: No RLS on mutation_audit (system table, never exposed via API)
- [18-01]: contact_tags and order_tags audit only INSERT/DELETE (no UPDATE on junction tables)
- [18-01]: Zero-import pattern: domain/types.ts has ZERO project imports to prevent circular deps
- [18-02]: Domain function signature: (ctx: DomainContext, params: XxxParams) => Promise<DomainResult<XxxResult>>
- [18-02]: Tag domain functions lookup by name only (error if not found), no find-or-create
- [18-02]: duplicateOrder copies carrier, tracking_number, custom_fields (more complete than action-executor)
- [18-02]: updateOrder emits per-field triggers + custom_fields as JSON-stringified comparison
- [18-02]: total_value recalculated after product insert (manual re-read, DB trigger may also fire)
- [18-02]: stageId typed as string (not string|null) after resolution — initialized to '' for falsy check
- [18-03]: Server action addOrderTag/removeOrderTag keep tagId param (UI sends tagId), adapter looks up tagName before calling domain
- [18-03]: Action executor splits by entity type: orders via domain, contacts still direct DB (to be migrated in Plan 05)
- [18-03]: Shopify webhook sets shopify_order_id via direct DB update AFTER domain createOrder (domain-agnostic field)
- [18-03]: Production adapter uses OrderCreator only for contact findOrCreate, order creation fully via domain
- [18-03]: WIP limit check stays in server action moveOrderToStage as adapter concern (not in domain)
- [18-03]: deleteOrders bulk action loops over domain deleteOrder per ID (sequential, not batch)
- [18-03]: updateOrder server action handles stage_id change via separate domainMoveOrderToStage call before domainUpdateOrder
- [18-04]: departamento stored in custom_fields (not a standard contacts table column)
- [18-04]: createContact tags param is best-effort: skip silently if tag not found (no auto-create per domain design)
- [18-04]: orders.ts addOrderTag/removeOrderTag delegate to shared tags.ts (single source of truth)
- [18-04]: updateContact emits per-key field.changed for custom_fields with custom_fields.{key} as fieldName
- [18-04]: Shared entity module pattern: tags.ts handles both contact and order entity types via entityType param
- [18-05]: Server actions keep auth/Zod/revalidatePath as adapter concerns, delegate all mutations to domain
- [18-05]: Tag ops in server actions look up tagName from tagId (UI sends tagId, domain expects tagName)
- [18-05]: Lazy trigger emitter fully removed from action-executor (all CRM entities via domain)
- [18-05]: bulkCreateContacts falls back to per-item domain calls on batch failure for CSV import error reporting
- [18-06]: apiKey passed as param to domain message functions (caller resolves credentials)
- [18-06]: receiveMessage returns empty messageId for duplicates (dedup via wamid constraint)
- [18-06]: Keyword match emits once per automation (first matching keyword wins)
- [18-06]: Unarchive (archived→active on send) stays in callers as adapter concern
- [18-06]: Action executor removed tool executor + whatsapp/api imports — fully domain-powered for WhatsApp
- [18-06]: resolveWhatsAppContext helper for shared contact→conversation→apiKey lookup in action executor
- [18-07]: No task.created trigger emitted (not in TRIGGER_CATALOG); only task.completed
- [18-07]: task_type_id and created_by are server-action adapter concerns (not in domain params)
- [18-07]: Task tool permissions mapped to contacts.* (no tasks.* in Permission type)
- [18-07]: completeTask is idempotent: already-completed tasks return success without re-emitting trigger
- [18-07]: completed_at uses Colombia timezone via toLocaleString('sv-SE', { timeZone: 'America/Bogota' })
- [18-08]: Activity logging (contact_activity/task_activity) is a domain concern, moved from server actions
- [18-08]: Custom field DEFINITIONS CRUD stays in server actions (admin config, not CRM mutation)
- [18-08]: Note tool handlers use createdBy='bot' for activity attribution
- [18-08]: Custom field trigger uses custom.{key} fieldName pattern for namespace clarity
- [18-08]: Action executor contact custom fields use domain/custom-fields instead of domainUpdateContact
- [18-09]: unarchiveConversation stays as direct DB (reverse of archive, not in domain spec)
- [18-09]: findOrCreateConversation handles race condition via 23505 duplicate key retry (same as webhook)
- [18-09]: 24h window dedup for task.overdue cron (tasks overdue >24h skipped to avoid re-emitting ancient tasks)
- [18-09]: 200 task safety cap per cron run to prevent overload
- [18-09]: Resolution text storage on conversation close stays as adapter concern in tool handler
- [19-01]: BuilderSession.messages typed as unknown[] for JSONB serialization; cast to UIMessage at usage site
- [19-01]: DiagramNodeData uses optional fields (not discriminated union) for simpler React Flow integration
- [19-01]: builder_sessions RLS: workspace members SELECT/INSERT, owner-only UPDATE/DELETE
- [19-02]: AI SDK v6 tool() requires inputSchema (not parameters) property for zod v4 TypeScript compatibility
- [19-02]: ACTION_TO_TRIGGER_MAP: static mapping from action types to trigger types for DFS cycle detection
- [19-02]: WhatsApp send actions mapped to whatsapp.message_received in cycle detection (conservative)
- [19-02]: generatePreview returns empty DiagramData; real diagram generation deferred to Plan 04
- [19-02]: Template approval status validation: warns about non-APPROVED templates in resource validation
- [19-01]: --legacy-peer-deps required for npm install due to React 19 peer dep conflict with @webscopeio/react-textarea-autocomplete
- [19-03]: AI SDK v6 uses toUIMessageStreamResponse (not toDataStreamResponse) and stopWhen: stepCountIs(N) (not maxSteps)
- [19-03]: UIMessage has parts[] not content; use convertToModelMessages() to bridge UIMessage to ModelMessage for streamText
- [19-03]: Session store uses createAdminClient + workspace_id filter for all 6 CRUD functions
- [19-04]: DiagramNodeData extended with category and conditionCount fields for richer node rendering
- [19-04]: Validation errors inferred to nodeIds by matching resource references in trigger_config/action params
- [19-04]: WhatsApp send actions excluded from cycle detection graph (outgoing messages don't trigger automation handlers)
- [19-04]: Duplicate detection uses type-specific trigger_config comparison (pipeline+stage for orders, keywords overlap for keyword_match)

### Project Rules

Established in `CLAUDE.md`:
1. ALWAYS restart server after code changes before testing
2. ALWAYS use America/Bogota timezone for dates
3. ALWAYS follow GSD workflow completely
4. ALL mutations through src/lib/domain/ (Regla 3)

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
- Phase 18 added: Domain Layer Foundation - Capa domain/ como unica fuente de verdad para mutaciones. Descubierto durante verificacion de Fase 17: bot WhatsApp no dispara automatizaciones porque tool handlers bypasean trigger emissions. AI Automation Builder movido a Phase 19.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-14
Stopped at: Completed 19-04-PLAN.md (diagram generator & validation)
Resume file: None
Next: 19-05-PLAN.md
