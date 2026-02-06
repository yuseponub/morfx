# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-28)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.
**Current focus:** MVP v2.0 — Phase 13: Agent Engine Core

## Current Position

Phase: 13 of 16 (Agent Engine Core)
Plan: 4 of 6
Status: In progress
Last activity: 2026-02-06 — Completed 13-04-PLAN.md (Intent Detector & Orchestrator)

Progress: [##########] 100% MVP v1 | [█████░░░░░] 44% MVP v2

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- Phase 11 (Shopify Integration) verified by user
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Started (2026-02-04)

**Milestone Goal:** Agente de ventas Somnio funcionando en codigo propio, reemplazando n8n.

5 phases planned:
- Phase 12: Action DSL Real (4 plans) — COMPLETE
- Phase 13: Agent Engine Core (6 plans) — IN PROGRESS (3/6)
- Phase 14: Agente Ventas Somnio (TBD plans)
- Phase 15: Agent Sandbox (TBD plans)
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
| 13. Agent Engine Core | 4/6 | In Progress |

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

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 13-04-PLAN.md (Intent Detector & Orchestrator)
Resume file: .planning/phases/13-agent-engine-core/13-05-PLAN.md
Next: Execute Plan 05 - Agent Engine
