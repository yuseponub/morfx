---
phase: v4-media-audio-image
plan: "02"
subsystem: domain-messages + whatsapp-types
tags: [domain, audio, transcription, types, tdd, v4-only]
dependency_graph:
  requires: [01]   # messages.transcription column must exist in prod (Regla 5, Wave 0)
  provides:
    - setMessageTranscription domain function
    - Message.transcription field
  affects:
    - src/lib/domain/messages.ts
    - src/lib/whatsapp/types.ts
    - src/hooks/use-messages.ts (Rule 1 fix — optimistic mock)
tech_stack:
  patterns:
    - "DomainResult<T> discriminated union — consistent with all other domain fns"
    - "UPDATE by wamid + workspace_id (never INSERT — message row pre-exists from receiveMessage)"
    - "TDD RED/GREEN: test commit 5c59c15f, impl commit 3c4bb0dc"
key_files:
  created:
    - src/lib/domain/__tests__/messages-transcription.test.ts
  modified:
    - src/lib/domain/messages.ts
    - src/lib/whatsapp/types.ts
    - src/hooks/use-messages.ts
decisions:
  - "Transcript is an UPDATE not an INSERT: message row was INSERTed by receiveMessage (keyed by wamid) before the Inngest media-gate runs (RQ-6 / Pitfall 2)"
  - "workspace_id filter on the UPDATE (Regla 3) — wamid alone is not sufficient for workspace isolation"
  - "Short-circuit on empty wamid returns { success: false } without hitting DB (defensive guard)"
  - "Rule 1 deviation: addOptimisticMessage in use-messages.ts needed transcription: null added to satisfy TS2741"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-01T16:44:04Z"
  tasks_completed: 2
  files_changed: 4
  commits: 3
---

# Phase v4-media-audio-image Plan 02: Domain Write Path + Message Type Summary

Domain write path for audio transcript persistence and `Message.transcription` field for inbox display.

## What Was Built

### New Domain Function: `setMessageTranscription`

**File:** `src/lib/domain/messages.ts`

**Signature:**
```ts
export async function setMessageTranscription(
  ctx: DomainContext,
  params: { wamid: string; transcription: string }
): Promise<DomainResult<{ updated: boolean }>>
```

**Behavior:**
- Issues `UPDATE messages SET transcription = $transcription WHERE wamid = $wamid AND workspace_id = $workspaceId`
- The UPDATE is safe because `receiveMessage` already INSERTed the row (keyed by `wamid`) before the Inngest media-gate runs (RQ-6 / Pitfall 2 from RESEARCH.md)
- Short-circuits with `{ success: false, error: 'missing wamid' }` when `wamid` is empty (no DB call)
- Supabase errors are caught and returned as `{ success: false, error: message }` (no throw) — mirrors `receiveMessage` error handling
- Regla 3 compliant: `createAdminClient()` + `workspace_id` filter on every mutation, zero `@supabase/supabase-js` imports

**Called by:** Wave 2 Inngest function (v4 media-gate only — Regla 6).

### Updated Type: `Message.transcription`

**File:** `src/lib/whatsapp/types.ts`

**Added field:**
```ts
/** Whisper transcript for audio messages — null for all other types (D-04/D-09). */
transcription: string | null
```

Placed adjacent to `media_filename` for cohesion with other media-related fields. The inbox fetch uses `.select('*')` (RQ-5) so the column flows through automatically with no query change needed.

**Consumed by:** Wave 4 inbox UI (conversation view will display the transcript under audio bubbles).

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `5c59c15f` | test (RED) | Failing test for setMessageTranscription — 3 cases |
| 2 | `3c4bb0dc` | feat (GREEN) | setMessageTranscription implementation + CTX.source fix |
| 3 | `cfaa3cf7` | feat | Message.transcription field + optimistic mock fix |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DomainContext.source` required but missing in test CTX**
- **Found during:** Task 1 tsc check
- **Issue:** `CTX = { workspaceId: 'ws-abc', cascadeDepth: 0 }` missing required `source` field
- **Fix:** Added `source: 'tool-handler'` to CTX
- **Files modified:** `src/lib/domain/__tests__/messages-transcription.test.ts`
- **Commit:** `3c4bb0dc` (included in GREEN commit)

**2. [Rule 1 - Bug] `addOptimisticMessage` literal in `use-messages.ts` missing `transcription`**
- **Found during:** Task 2 tsc check (TS2741 — property missing in type)
- **Issue:** Adding `transcription: string | null` to `Message` interface caused an existing inline object literal to fail typechecking
- **Fix:** Added `transcription: null` to the optimistic message object (line 163)
- **Files modified:** `src/hooks/use-messages.ts`
- **Commit:** `cfaa3cf7` (Task 2 commit)
- **Note:** Pre-existing `conversations.test.ts` TS7022 error (self-referential `eqMock`) and `.next/dev/types/validator.ts` errors are out of scope — not caused by this plan

## Known Stubs

None — `setMessageTranscription` is a complete domain write with no placeholder behavior. `Message.transcription` is a nullable column that flows through `select('*')` — no stub.

## Self-Check: PASSED

- `src/lib/domain/messages.ts` FOUND, exports `setMessageTranscription`
- `src/lib/whatsapp/types.ts` FOUND, contains `transcription: string | null`
- `src/lib/domain/__tests__/messages-transcription.test.ts` FOUND, 3 tests pass
- Commits `5c59c15f`, `3c4bb0dc`, `cfaa3cf7` verified in git log
- `npx tsc --noEmit` clean for all plan-touched files
