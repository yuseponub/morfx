---
phase: quick-023
plan: 01
subsystem: sandbox
tags: [sandbox, v3, template-interruption, pre-send-check, frontend]
completed: 2026-03-14
duration: ~4min
tech-stack:
  patterns: [ref-based-async-check, recursive-message-processing]
key-files:
  modified:
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
decisions:
  - queuedMessagesRef mirrors queuedMessages state for async delay loop access (React state is stale in async)
  - Ref updated synchronously inside setState callback for immediate visibility
  - Only last queued message processed recursively (most recent user intent)
  - isTyping=false before recursive call ensures normal path execution (no infinite recursion)
  - Interruption check after delay await and before message display (fail-safe: better to not send than to duplicate)
---

# Quick 023: Sandbox Template Interruption v3 Summary

**Ref-based interruption check in v3 sandbox delay loop with recursive queued message processing**

## What Was Done

### Task 1: Implement template interruption in sandbox-layout.tsx delay loop

Added interruption logic to the v3 template delay display loop in the sandbox frontend:

1. **queuedMessagesRef** - A `useRef<string[]>([])` that mirrors the `queuedMessages` state, kept in sync via `useEffect` and also updated synchronously inside the `setQueuedMessages` callback for immediate visibility in the async delay loop.

2. **Interruption check in delay loop** - After each delay `await` and before adding the assistant message, checks `queuedMessagesRef.current.length > 0`. If a user message was queued during the delay:
   - Breaks out of the loop
   - Adds a system note: `[SANDBOX: Secuencia interrumpida - N template(s) no enviado(s)]`
   - Logs to console with index details

3. **preSendCheck debug data** - When interruption occurs, populates `result.debugTurn.preSendCheck` with per-template check results (`ok` vs `interrupted`) for debug panel visibility.

4. **Post-loop queued message processing** - Instead of discarding queued messages with `setQueuedMessages([])`, grabs the last queued message and calls `handleSendMessage` recursively. The recursive call goes through the normal path because `isTyping` is set to `false` before recursion.

5. **PROD-TRANSLATE comments** - Three key comments explaining the production equivalent:
   - Ref check = ProductionMessagingAdapter.hasNewInboundMessage() DB query
   - Recursive processing = webhook creates new Inngest job (no recursion in prod)
   - Debug recording = DebugAdapter.recordPreSendCheck() with real query results

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles cleanly (`npx tsc --noEmit` - no sandbox errors)
- Manual verification requires running sandbox with v3 agent (not automated)

## Commits

| Hash | Message |
|------|---------|
| 511e9f6 | feat(quick-023): template interruption in sandbox v3 delay loop |
