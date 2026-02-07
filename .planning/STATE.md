# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-28)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.
**Current focus:** MVP v2.0 — Phase 16: WhatsApp Agent Integration

## Current Position

Phase: 15.5 of 17 (Somnio Ingest System - INSERTED)
Plan: 2 of 4
Status: In progress
Last activity: 2026-02-07 — Completed 15.5-02-PLAN.md (Ingest Manager)

Progress: [##########] 100% MVP v1 | [████████████░░] 91% MVP v2

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
- Phase 16: WhatsApp Agent Integration (TBD plans)

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

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed 15.5-02-PLAN.md (Ingest Manager)
Resume file: None
Next: 15.5-03-PLAN.md (SomnioEngine Integration)
