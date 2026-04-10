---
phase: quick-040
plan: 01
status: complete
duration: ~12min
completed: 2026-04-10
tech-stack:
  patterns:
    - "getCollector()?.recordEvent() observability pattern across all agent pipelines"
key-files:
  modified:
    - src/lib/observability/types.ts
    - src/lib/agents/somnio-v3/comprehension.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
    - src/lib/agents/somnio-v3/response-track.ts
    - src/lib/agents/godentist/comprehension.ts
    - src/lib/agents/godentist/sales-track.ts
    - src/lib/agents/godentist/godentist-agent.ts
    - src/lib/agents/godentist/response-track.ts
    - src/lib/agents/somnio-recompra/comprehension.ts
    - src/lib/agents/somnio-recompra/sales-track.ts
    - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
    - src/lib/agents/somnio-recompra/response-track.ts
    - src/lib/agents/engine/v3-production-runner.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/lib/agents/engine/unified-engine.ts
---

# Quick Task 040: Pipeline Decision recordEvents Summary

**One-liner:** 46 new recordEvent calls across 15 files making every internal pipeline decision observable on the Phase 42.1 timeline.

## What Was Done

Added `getCollector()?.recordEvent()` calls at every internal pipeline decision point across all three agent pipelines and their shared infrastructure. Total: 65 recordEvent calls (19 pre-existing + 46 new).

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 9f19fcd | feat(quick-040): instrumentar pipeline somnio-v3 con recordEvent de observabilidad |
| 2 | 22e5473 | feat(quick-040): instrumentar pipelines godentist, recompra e infraestructura compartida |

## Breakdown by File

### somnio-v3 (10 new)
- **comprehension.ts** (1): comprehension result with intent, confidence, fields extracted
- **somnio-v3-agent.ts** (7): system_event_routed, guard blocked/passed, sales_track_result, order_decision, response_track_result, natural_silence
- **response-track.ts** (2): template_selection empty_result, block_composed

### godentist (13 new)
- **comprehension.ts** (1): comprehension result with idioma field
- **sales-track.ts** (3): timer_transition, auto_trigger (datos_criticos), intent_transition
- **godentist-agent.ts** (7): system_event_routed, guard blocked/passed, english_detected, sales_track_result, appointment_decision, availability_lookup, response_track_result, natural_silence
- **response-track.ts** (2): template_selection empty_result, block_composed

### somnio-recompra (12 new)
- **comprehension.ts** (1): comprehension result
- **sales-track.ts** (2): timer_transition, intent_transition
- **somnio-recompra-agent.ts** (7): system_event_routed, guard blocked/passed, sales_track_result, order_decision, response_track_result, natural_silence
- **response-track.ts** (2): template_selection empty_result, block_composed

### Infrastructure (9 new)
- **v3-production-runner.ts** (3): agent_routed, interruption_path_a, state_committed
- **webhook-processor.ts** (4): skip_tag_detected, recompra_routed, webhook_agent_routed x2
- **unified-engine.ts** (2): order_decision (somnio-v1), mode_transition

## EventCategory Additions

Added to `src/lib/observability/types.ts`:
- `pipeline_decision` — routing, state machine outputs, order/appointment decisions
- `comprehension` — Claude comprehension layer results

Pre-existing categories reused: `guard`, `template_selection`.

## Verification

- `tsc --noEmit`: 0 errors (excluding pre-existing vitest/expo-router)
- Total recordEvent calls in `src/lib/agents/`: 65 across 17 files
- `git diff --stat`: 264 insertions, 2 deletions (import line replacements only)
- All recordEvent calls are standalone statements AFTER the decision they record
- Zero changes to existing logic, control flow, or return values

## Deviations from Plan

None - plan executed exactly as written.
