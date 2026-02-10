---
phase: 16-whatsapp-agent-integration
plan: 01
subsystem: agent-config
tags: [database, rls, agent-config, server-actions, supabase]

dependency-graph:
  requires: [15.8]
  provides: [workspace_agent_config table, agent resolution logic, agent config server actions, conversation agent columns, message agent attribution]
  affects: [16-02, 16-03, 16-04, 16-05, 16-06]

tech-stack:
  added: []
  patterns: [global+per-chat agent resolution, upsert config pattern, admin client for production agent ops]

key-files:
  created:
    - supabase/migrations/20260209_agent_production.sql
    - src/lib/agents/production/agent-config.ts
    - src/app/actions/agent-config.ts
  modified:
    - src/lib/whatsapp/types.ts

decisions:
  - id: "16-01-01"
    decision: "Use existing is_workspace_member/is_workspace_admin SQL functions for RLS policies"
    reason: "Consistent with all other tables, avoids duplicating workspace membership checks"
  - id: "16-01-02"
    decision: "Agent config uses createAdminClient for all DB operations"
    reason: "Production agent code runs in webhook/background context without user session; workspace isolation via explicit workspace_id filters"
  - id: "16-01-03"
    decision: "NULL per-conversation override = inherit global, false = explicitly disabled, true = explicitly enabled"
    reason: "Three-state override allows admin to enable globally while users can opt-out specific conversations"
  - id: "16-01-04"
    decision: "DEFAULT_AGENT_CONFIG exported for server actions to return meaningful defaults when no row exists"
    reason: "Avoids null propagation in UI; new workspaces get sensible defaults without requiring setup"

metrics:
  duration: "5m 24s"
  completed: "2026-02-09"
---

# Phase 16 Plan 01: Agent Production Config Foundation Summary

Database schema and config resolution layer for production agent integration with global workspace toggle and per-conversation overrides.

## One-liner

workspace_agent_config table + 3-state resolution logic (global OFF > per-chat OFF > ON) + server actions with role-based auth

## What Was Built

### Task 1: Database Migration (20260209_agent_production.sql)

**workspace_agent_config table** with:
- `workspace_id` (PK, FK to workspaces)
- `agent_enabled` (global on/off toggle, default false)
- `conversational_agent_id` (default 'somnio-sales-v1')
- `crm_agents_enabled` (JSONB map of CRM agent toggles)
- `handoff_message` (default Spanish message)
- `timer_preset` (CHECK constraint: real/rapido/instantaneo)
- `response_speed` (NUMERIC(3,1), default 1.0)
- RLS: SELECT for members, INSERT/UPDATE for owner/admin

**conversations table** additions:
- `agent_conversational BOOLEAN DEFAULT NULL` (3-state override)
- `agent_crm BOOLEAN DEFAULT NULL` (3-state override)
- Partial index on workspace_id WHERE overrides are non-null

**messages table** addition:
- `sent_by_agent BOOLEAN NOT NULL DEFAULT false`

### Task 2: Agent Config Module + Server Actions

**src/lib/agents/production/agent-config.ts:**
- `AgentConfig` interface matching DB schema
- `DEFAULT_AGENT_CONFIG` constant for sensible defaults
- `getWorkspaceAgentConfig()` - read config from DB
- `upsertWorkspaceAgentConfig()` - create or update with onConflict
- `isAgentEnabledForConversation()` - resolution logic (global > per-chat > CRM JSONB)
- `setConversationAgentOverride()` - update per-conversation column

**src/app/actions/agent-config.ts:**
- `getAgentConfig()` - returns config or defaults, auth required
- `updateAgentConfig()` - owner/admin only, upserts config
- `toggleConversationAgent()` - member, validates conversation ownership
- `getConversationAgentStatus()` - returns resolved status for both agent types

**src/lib/whatsapp/types.ts:**
- Added `agent_conversational` and `agent_crm` to Conversation interface
- Added `sent_by_agent` to Message interface

## Decisions Made

1. **Existing RLS helpers reused** - `is_workspace_member` and `is_workspace_admin` functions already defined in workspaces migration.
2. **Admin client for all agent config ops** - Webhook and background contexts lack user sessions; workspace isolation enforced via explicit filters.
3. **Three-state per-conversation override** - NULL inherits, false disables, true enables. Enables granular control.
4. **DEFAULT_AGENT_CONFIG exported** - Server actions return defaults for workspaces without config rows.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] Migration SQL syntactically correct (8 SQL statements)
- [x] workspace_agent_config has RLS policies for workspace members
- [x] Resolution logic: global OFF -> false, per-chat OFF -> false, otherwise true
- [x] Server actions check workspace membership and role
- [x] TypeScript compiles cleanly (no errors in project files)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 5a8eb29 | feat(16-01): database migration for agent production config |
| 2 | aa610b7 | feat(16-01): agent config resolution logic, server actions, and types |

## Next Phase Readiness

Plan 16-02 (Webhook Agent Processor) depends on:
- `isAgentEnabledForConversation` -- provided
- `getWorkspaceAgentConfig` -- provided
- `sent_by_agent` column on messages -- provided
- Agent resolution logic -- working

All dependencies for Plan 16-02 are satisfied.
