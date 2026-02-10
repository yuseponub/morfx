---
phase: 16-whatsapp-agent-integration
plan: 02
subsystem: agent-production
tags: [inngest, webhook, somnio-engine, handoff, round-robin, typing-indicator]
dependency-graph:
  requires: [16-01]
  provides: [webhook-to-engine-pipeline, handoff-workflow, agent-message-marking]
  affects: [16-03, 16-04, 16-05]
tech-stack:
  added: []
  patterns: [inngest-concurrency-per-conversation, supabase-realtime-broadcast, auto-contact-creation, round-robin-assignment]
key-files:
  created:
    - src/inngest/functions/agent-production.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/lib/agents/production/handoff-handler.ts
  modified:
    - src/inngest/events.ts
    - src/app/api/inngest/route.ts
    - src/lib/whatsapp/webhook-handler.ts
decisions:
  - id: 16-02-01
    summary: "Inngest event emitted for ALL text messages; agent-config check inside processMessageWithAgent"
    rationale: "Simplifies webhook handler (no config lookup needed), defers decision to async processing"
  - id: 16-02-02
    summary: "Typing indicator via Supabase Realtime broadcast on conversation channel"
    rationale: "Uses existing Supabase infrastructure, no new dependencies; channel pattern matches existing realtime usage"
  - id: 16-02-03
    summary: "sent_by_agent marked by timestamp range (all outbound after processingStartedAt)"
    rationale: "MessageSequencer may send multiple messages with delays; timestamp range catches all of them"
  - id: 16-02-04
    summary: "Auto-contact creation uses phone as name fallback when no profileName"
    rationale: "Minimal contact needed for SomnioEngine; better than failing with no contact"
  - id: 16-02-05
    summary: "Re-check agent enabled BEFORE executing handoff (handles toggle-off during processing)"
    rationale: "Processing may take 10+ seconds; user could disable agent in that time"
metrics:
  duration: 10m
  completed: 2026-02-10
---

# Phase 16 Plan 02: Backend Agent Integration Summary

**One-liner:** Inngest-queued webhook-to-SomnioEngine pipeline with concurrency control, typing indicators, auto-contact creation, sent_by_agent marking, and round-robin handoff

## What Was Built

### 1. Inngest Event + Production Function (Task 1)

**New event:** `agent/whatsapp.message_received` added to `AgentEvents` in `events.ts` with conversationId, contactId, messageContent, workspaceId, phone, and messageId fields.

**New function:** `whatsapp-agent-processor` in `agent-production.ts`:
- Triggered by the new event
- Concurrency limit of 1 per conversationId (prevents race conditions)
- 2 retries on failure
- Calls `processMessageWithAgent` inside `step.run`

**Webhook integration:** Modified `processIncomingMessage` in `webhook-handler.ts`:
- After message storage succeeds, emits Inngest event for text messages only
- Wrapped in try/catch (non-blocking: agent failures never break message reception)
- Dynamic import of inngest client to avoid circular deps
- Gets contact_id from conversation for the event payload

**Route update:** Added `agentProductionFunctions` to the Inngest serve route.

### 2. Webhook Processor (Task 2)

**`processMessageWithAgent` in `webhook-processor.ts`:**
- Checks `isAgentEnabledForConversation` before any processing (early return if disabled)
- Fetches conversation details from DB
- Auto-creates minimal contact if conversation has no linked contact (handles 23505 race condition)
- Records `processingStartedAt` timestamp for sent_by_agent marking
- Broadcasts typing indicator START via Supabase Realtime channel
- Creates SomnioEngine instance and calls `processMessage`
- In `finally` block: broadcasts typing indicator STOP (always sent, even on error)
- After processing: marks all outbound messages after processingStartedAt as `sent_by_agent=true`
- Re-checks agent enabled status before executing handoff (handles toggle-off during processing)
- If handoff signaled and agent still enabled: calls `executeHandoff`

### 3. Handoff Handler (Task 2)

**`executeHandoff` in `handoff-handler.ts`:**
- Sends configurable handoff message via WhatsApp (using `executeToolFromAgent`)
- Marks handoff message as `sent_by_agent=true`
- Toggles OFF conversational agent only via `setConversationAgentOverride('conversational', false)` - CRM stays active
- Creates high-priority task linked to conversation and contact
- Assigns task to next available agent via round-robin

**`getNextAvailableAgent`:**
- Queries team_members joined with teams for workspace isolation
- Filters by `is_online = true`
- Orders by `last_assigned_at ASC, NULLS FIRST` (fair distribution)
- Updates `last_assigned_at` for selected member

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 16-02-01 | Event emitted for ALL text messages, config check deferred to processor | Simplifies webhook, no config lookup in hot path |
| 16-02-02 | Typing indicator via Supabase Realtime broadcast | Uses existing infra, no new deps |
| 16-02-03 | sent_by_agent marked by timestamp range | Catches all messages from MessageSequencer delays |
| 16-02-04 | Auto-contact uses phone as name fallback | Minimal contact needed for engine |
| 16-02-05 | Re-check agent enabled before handoff | Handles toggle-off during 10+ second processing |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 001bf43 | feat(16-02): Inngest event + production function + webhook integration |
| 2 | 88e88a0 | feat(16-02): webhook processor + handoff handler |

## Verification Checklist

- [x] Inngest event agent/whatsapp.message_received defined in events.ts
- [x] Inngest function has concurrency limit per conversationId
- [x] Webhook handler emits event non-blocking (try/catch)
- [x] processMessageWithAgent checks agent config before processing
- [x] processMessageWithAgent broadcasts typing indicator via Supabase Realtime
- [x] Auto-contact creation handles race conditions (23505)
- [x] Handoff only disables conversational agent, CRM stays active
- [x] Round-robin uses last_assigned_at for fair distribution
- [x] sent_by_agent column set on agent outbound messages
- [x] TypeScript compiles cleanly

## Next Phase Readiness

Plan 03 (UI Integration) can proceed:
- `sent_by_agent` marking is active for bot badge display
- `agent_conversational` / `agent_crm` columns used for toggle UI
- Typing indicator broadcasts on `conversation:{id}` channel ready for frontend subscription
