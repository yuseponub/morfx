# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-28)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.
**Current focus:** MVP v2.0 — Phase 12: Action DSL Real

## Current Position

Phase: 12 of 16 (Action DSL Real)
Plan: 1 of 4
Status: In progress
Last activity: 2026-02-05 — Completed 12-01-PLAN.md (Foundation Types, Rate Limiter & Logging)

Progress: [##########] 100% MVP v1 | [█░░░░░░░░░] 25% Phase 12 | [░░░░░░░░░░] 5% MVP v2

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- Phase 11 (Shopify Integration) verified by user
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Started (2026-02-04)

**Milestone Goal:** Agente de ventas Somnio funcionando en codigo propio, reemplazando n8n.

5 phases planned:
- Phase 12: Action DSL Real (9 requirements)
- Phase 13: Agent Engine Core (11 requirements)
- Phase 14: Agente Ventas Somnio (10 requirements)
- Phase 15: Agent Sandbox (8 requirements)
- Phase 16: WhatsApp Agent Integration (7 requirements)

Total: 45 requirements mapped

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
| 12. Action DSL Real | 1/4 | In progress |

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

Last session: 2026-02-05
Stopped at: Completed 12-01-PLAN.md (Foundation Types, Rate Limiter & Logging)
Resume file: .planning/phases/12-action-dsl-real/12-02-PLAN.md
