---
phase: 16-whatsapp-agent-integration
plan: 03
subsystem: whatsapp-inbox-ui
tags: [whatsapp, agent, ui, toggles, typing-indicator, realtime]
dependency-graph:
  requires: [16-01, 16-02]
  provides: [agent-visual-indicators, per-chat-agent-toggles, typing-indicator-ui, agent-filter]
  affects: [16-05, 16-06]
tech-stack:
  added: []
  patterns: [optimistic-updates, realtime-broadcast-subscription, safety-timeout]
key-files:
  created: []
  modified:
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
decisions:
  - id: "16-03-01"
    description: "Typing broadcast channel is conversation:{id} not agent-typing:{id}"
    rationale: "Matched actual webhook-processor implementation from Plan 16-02"
  - id: "16-03-02"
    description: "Agent filter uses agent_conversational !== false (includes null/inherit)"
    rationale: "null means inherit global setting, so it could be agent-attended"
  - id: "16-03-03"
    description: "Agent toggles only shown after status loads (null guard)"
    rationale: "Prevents showing incorrect toggle state during loading"
metrics:
  duration: ~15min
  completed: 2026-02-10
---

# Phase 16 Plan 03: Agent UI Indicators & Controls Summary

**One-liner:** Per-chat agent toggles with optimistic updates, bot badges on messages, typing indicator via Realtime broadcast, and agent filter for managers.

## What Was Built

### Task 1: Bot Badge + Avatar Overlay
- **message-bubble.tsx**: Added Bot icon + "Bot" text label above outbound messages where `sent_by_agent === true`. Wrapped bubble in a flex column container to position badge above without breaking existing layout.
- **conversation-item.tsx**: Added blue circle (w-4 h-4) with Bot icon overlay at bottom-right of avatar when `conversation.agent_conversational === true`. Positioned with absolute positioning, similar to existing emoji indicator.

### Task 2: Per-Chat Agent Toggles + Typing Indicator
- **chat-header.tsx**:
  - Added `agentConversational` and `agentCrm` state with `null` guard (loading state)
  - useEffect loads status via `getConversationAgentStatus` on conversation change with cancellation
  - Two compact Switch toggles (size="sm"): Bot icon for conversational, "CRM" text for CRM agents
  - Optimistic updates with error rollback via toast
  - Toggles separated from action buttons by `border-r`
  - Also accepts `onOpenAgentConfig` prop for agent config slider (from Plan 16-04 integration)
- **chat-view.tsx**:
  - Subscribes to Supabase Realtime broadcast channel `conversation:{conversationId}` with event `typing`
  - Filters for `source === 'agent'` in payload
  - 30-second safety timeout auto-clears typing if stop event is missed
  - "Bot escribiendo..." indicator with blue Bot icon and animate-pulse, positioned between message list and input

### Task 3: Agent Filter in Conversation List
- **conversation-list.tsx**:
  - Added `agentFilter` state: 'all' | 'agent-attended'
  - Bot icon toggle button placed next to InboxFilters, changes variant when active
  - `filteredConversations` memo applies agent filter after existing search/filter logic
  - Filter shows conversations where `agent_conversational !== false`
  - Custom empty state: "No hay conversaciones con agente activo"
  - Results count shown when agent filter is active

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Typing indicator channel mismatch**
- **Found during:** Task 2
- **Issue:** Plan specified channel `agent-typing:{conversationId}` but webhook-processor (Plan 16-02) actually broadcasts on `conversation:{conversationId}` with event `typing`
- **Fix:** Used correct channel name `conversation:{conversationId}` to match server-side broadcast
- **Files modified:** chat-view.tsx
- **Commit:** 0a34b45

**2. [Note] Task 2 commit merged with Plan 16-04 auto-commit**
- The linter/auto-save process added Plan 16-04 changes (onOpenAgentConfig prop, SlidersHorizontal icon, agent config slider button) to chat-header.tsx and chat-view.tsx simultaneously with Task 2 changes
- Both sets of changes were committed together in 0a34b45
- All Task 2 code is present and verified in the commit

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 2ae7da1 | feat(16-03): bot badge on agent messages + bot avatar overlay on conversations |
| 2 | 0a34b45 | feat(16-04): inbox panel switching + Agentes nav item (includes Task 2 changes) |
| 3 | a65b4a7 | feat(16-03): agent filter in conversation list |

## Verification Results

- [x] Bot badge on outbound agent messages - `sent_by_agent` in message-bubble.tsx
- [x] Bot overlay on conversation avatar when agent active - `agent_conversational` in conversation-item.tsx
- [x] Two toggles in chat header - `toggleConversationAgent` in chat-header.tsx
- [x] Bot typing indicator via Realtime - `isAgentTyping` + `Bot escribiendo...` in chat-view.tsx
- [x] Agent filter in conversation list - `agentFilter` in conversation-list.tsx
- [x] TypeScript compiles (0 project errors)

## Decisions Made

1. **Typing channel name**: Used `conversation:{id}` to match webhook-processor, not `agent-typing:{id}` from plan
2. **Agent filter semantics**: `!== false` includes both `true` (explicit) and `null` (inherit global) since both could be agent-attended
3. **Toggle visibility**: Toggles only render after status loads (prevents flash of wrong state)
4. **Safety timeout**: 30s auto-clear for typing indicator prevents stuck state if server fails to send stop event

## Next Phase Readiness

Plan 16-03 provides all visual indicators needed for the WhatsApp agent UX:
- Messages clearly show which were sent by the bot
- Conversations show agent status at a glance
- Users can control agent per-conversation with immediate feedback
- Typing indicator provides real-time processing feedback
- Managers can filter to agent-attended conversations

Ready for Plan 16-05 (Agent Settings Page) and Plan 16-06 (End-to-End Testing).
