---
phase: 32-media-processing
plan: 03
subsystem: agents
tags: [inngest, whatsapp, media-gate, audio-transcription, handoff, sticker, reaction, whisper]

# Dependency graph
requires:
  - phase: 32-media-processing (plan 01)
    provides: MediaGateInput/MediaGateResult types, REACTION_MAP, Inngest event extension
  - phase: 32-media-processing (plan 02)
    provides: processMediaGate, transcribeAudioFromUrl, interpretSticker, media barrel export
  - phase: 29-inngest-migration
    provides: USE_INNGEST_PROCESSING feature flag, processAgentInline, Inngest agent pipeline
  - phase: 31-pre-send-check
    provides: messageTimestamp for pre-send check, silence timer cancellation
provides:
  - Expanded webhook handler routing 6 message types (text, audio, sticker, image, video, reaction)
  - Media gate step in Inngest pipeline before agent engine
  - Media handoff with silence timer cancellation
  - Host notification via domain createTask for negative reactions
  - Complete media processing pipeline (all 4 MEDIA requirements live)
affects: [33-confidence-routing, 34-no-repetition, 35-flujo-ofi-inter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Media gate as Inngest step before agent engine (processMediaGate -> branch)"
    - "Silence timer cancellation on media handoff (engine bypassed, timer would fire stale retake)"
    - "Domain layer createTask for host notifications (Rule 3 compliant)"
    - "AGENT_PROCESSABLE_TYPES set for expandable message routing"

key-files:
  created: []
  modified:
    - src/lib/whatsapp/webhook-handler.ts
    - src/inngest/functions/agent-production.ts
    - src/lib/agents/production/webhook-processor.ts

key-decisions:
  - "AGENT_PROCESSABLE_TYPES as local const inside processIncomingMessage (not module-level) for scoping clarity"
  - "Reactions pass raw emoji to Inngest (not '[Reaccion]' preview), media gate's mapReaction handles mapping"
  - "Inline fallback restricted to text-only: media messages silently skip when Inngest unavailable"
  - "Media handoff uses executeHandoff directly (bypasses UnifiedEngine), requires explicit timer cancellation"
  - "notify_host uses domain createTask (Rule 3), not raw supabase insert like handoff-handler"
  - "No messageType added to ProcessMessageInput: media gate resolves everything to text before processMessageWithAgent"

patterns-established:
  - "Media gate pattern: Inngest step.run('media-gate') as first step, branch on action result"
  - "Timer cancellation pattern: emit agent/customer.message when engine is bypassed for media handoff"

# Metrics
duration: 9min
completed: 2026-02-24
---

# Phase 32 Plan 03: Webhook + Inngest Media Pipeline Integration Summary

**Wired media gate into WhatsApp pipeline: webhook handler routes 6 message types to Inngest, media-gate step branches to passthrough/handoff/notify/ignore before agent engine**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-24T16:45:46Z
- **Completed:** 2026-02-24T16:55:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Webhook handler expanded from text-only to 6 message types (text, audio, sticker, image, video, reaction) via AGENT_PROCESSABLE_TYPES set
- Media gate integrated as first Inngest step before agent engine, branching on passthrough/handoff/notify_host/ignore
- Media handoff (image/video/failed transcription) triggers executeHandoff + silence timer cancellation
- Host notification for negative reactions via domain createTask (Rule 3 compliant)
- Complete media processing pipeline: all 4 MEDIA requirements (MEDIA-01 through MEDIA-04) are now live

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand webhook handler to route media messages to Inngest** - `4da0e66` (feat)
2. **Task 2: Add media gate step in Inngest function + handle results** - `0189c38` (feat)

## Files Created/Modified
- `src/lib/whatsapp/webhook-handler.ts` - Expanded agent routing with AGENT_PROCESSABLE_TYPES, media metadata in Inngest event, text-only inline fallback
- `src/inngest/functions/agent-production.ts` - Media gate step, 4-way branch (passthrough/handoff/notify_host/ignore), silence timer cancellation
- `src/lib/agents/production/webhook-processor.ts` - Updated JSDoc documenting post-media-gate text transformation

## Decisions Made
- **AGENT_PROCESSABLE_TYPES scoping:** Defined as local const inside processIncomingMessage rather than module-level, since it's only used in one place and keeps the routing logic self-contained.
- **Reactions pass raw emoji:** Webhook sends `msg.reaction?.emoji` (not '[Reaccion]') so the media gate's mapReaction can map emoji to text/notify/ignore.
- **Inline fallback text-only:** When Inngest is unavailable, only text messages get processed inline. Media messages require async processing (Whisper/Vision) and are silently skipped rather than failing loudly.
- **Explicit timer cancellation on media handoff:** The UnifiedEngine normally emits agent/customer.message in its step 6, which cancels the silence timer. Since media handoff bypasses the engine entirely, an explicit cancel-silence-timer step was added.
- **Domain createTask for notify_host:** Used `createTask` from `src/lib/domain/tasks` (not raw supabase insert) per CLAUDE.md Rule 3. The handoff-handler.ts still uses raw insert -- that's pre-existing debt, not introduced here.
- **No messageType on ProcessMessageInput:** The media gate resolves all message types to plain text before calling processMessageWithAgent. Adding messageType would leak the media abstraction.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (OPENAI_API_KEY for Whisper was already noted in Plan 02.)

## Next Phase Readiness
- Phase 32 is now COMPLETE (3/3 plans)
- All 4 MEDIA requirements are structurally wired:
  - MEDIA-01: Audio transcription via Whisper -> passthrough to agent
  - MEDIA-02: Image/video -> immediate handoff with timer cancellation
  - MEDIA-03: Sticker interpretation via Claude Vision -> passthrough or ignore
  - MEDIA-04: Reaction mapping -> passthrough, notify_host, or ignore
- Ready for Phase 33 (Confidence Routing + Disambiguation Log)
- Pending: Set USE_INNGEST_PROCESSING=true and OPENAI_API_KEY in Vercel to activate media processing in production

---
*Phase: 32-media-processing*
*Completed: 2026-02-24*
