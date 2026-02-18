---
phase: quick
plan: 001
subsystem: whatsapp
tags: [optimistic-ui, realtime, useMessages, message-input, message-bubble]
dependency-graph:
  requires: []
  provides: [optimistic-text-send, non-blocking-message-input]
  affects: []
tech-stack:
  added: []
  patterns: [optimistic-ui-with-realtime-replacement, client-only-status-sentinel]
key-files:
  created: []
  modified:
    - src/hooks/use-messages.ts
    - src/app/(dashboard)/whatsapp/components/message-input.tsx
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx
decisions:
  - id: QK001-D1
    decision: "'sending' status is client-only sentinel, not added to MessageStatus type union"
    reason: "Server/DB never produces 'sending' — it's purely for optimistic UI feedback before Realtime INSERT arrives"
metrics:
  duration: "7 minutes"
  completed: "2026-02-18"
---

# Quick Task 001: Optimistic WhatsApp Text Send Summary

**One-liner:** Non-blocking text send with instant optimistic message display, Realtime-based replacement, and retry-on-failure toast.

## What Was Done

### Task 1: useMessages hook — addOptimisticMessage + Realtime replacement
- Added `addOptimisticMessage(text: string)` function that creates a temporary `Message` object with `id: 'optimistic-{timestamp}'` and `status: 'sending'`
- Modified Realtime INSERT handler: for outbound text messages, finds matching optimistic message by content body and replaces it with the real DB message (prevents duplicates)
- Inbound and non-text messages bypass optimistic logic entirely
- Updated `UseMessagesReturn` interface to expose `addOptimisticMessage`

### Task 2: Non-blocking send + visual indicator + wiring
- **message-input.tsx**: Text sends no longer block with `setIsLoading(true)`. Input clears instantly, `addOptimisticMessage` is called before the server action fires in the background. Failed sends show a toast with a "Reintentar" button. Media/file sends retain existing blocking behavior.
- **message-bubble.tsx**: Added `Clock` icon (animate-pulse) for `'sending'` status and `opacity-70` on the bubble div for optimistic messages.
- **chat-view.tsx**: Destructures `addOptimisticMessage` from `useMessages` and passes it as a prop to `MessageInput`.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 9d31548 | feat(quick-001): add addOptimisticMessage to useMessages hook |
| 2 | 893b332 | feat(quick-001): optimistic text send with instant UI feedback |

## Verification Results

1. `npx tsc --noEmit` — passes cleanly, no new errors
2. All key links verified: hook -> chat-view -> message-input wiring confirmed via grep
3. Optimistic replacement logic uses content-body matching to prevent duplicates
4. Media/file send paths unchanged (still use `setIsLoading(true)` blocking pattern)

## Architecture Notes

- **Client-only sentinel value**: `'sending'` is cast via `as Message['status']` — it never touches the DB or server. The Realtime INSERT replaces it with the real status (`pending` -> `sent` -> `delivered` -> `read`).
- **Content-body matching**: Optimistic replacement matches by `(msg.content as TextContent).body === newBody` rather than by ID, since the optimistic ID is synthetic (`optimistic-{timestamp}`) and cannot match the real UUID.
- **No cleanup needed**: If the server action fails, the optimistic message stays in the array with `sending` status. The error toast with retry gives the user a clear path to resend. On page refresh or conversation switch, the optimistic message disappears since it was never persisted.
