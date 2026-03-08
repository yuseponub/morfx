---
phase: standalone/v3-two-track-decision
plan: 01
subsystem: agent-v3
tags: [state-machine, decision-engine, refactor, two-track]
depends_on: []
provides:
  - SalesTrackOutput and ResponseTrackOutput types
  - sales-track.ts pure state machine
  - response-track.ts template engine
  - INFORMATIONAL_INTENTS and ACTION_TEMPLATE_MAP constants
  - Ingest without silent returns
affects:
  - tt-02 (pipeline wiring)
tech-stack:
  added: []
  patterns:
    - "Two-track decision: sales track (WHAT TO DO) vs response track (WHAT TO SAY)"
    - "Natural silence: absence of output instead of explicit 'silent' action"
key-files:
  created:
    - src/lib/agents/somnio-v3/sales-track.ts
    - src/lib/agents/somnio-v3/response-track.ts
  modified:
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio-v3/ingest.ts
decisions:
  - id: tt01-d1
    description: "Keep IngestAction as 'respond' | 'silent' union for backward compat with somnio-v3-agent.ts"
    rationale: "somnio-v3-agent.ts checks ingestResult.action === 'silent' at line 129. Narrowing to 'respond' only causes TS2367. Plan 02 will remove the dead branch."
  - id: tt01-d2
    description: "ACTION_TEMPLATE_MAP only has static mappings; dynamic actions (mostrar_confirmacion, cambio, crear_orden, pedir_datos) resolved in response-track.ts switch"
    rationale: "Dynamic actions need state access (pack, camposFaltantes) that a static map cannot provide."
metrics:
  duration: "~8 min"
  completed: "2026-03-08"
---

# Phase standalone/v3-two-track-decision Plan 01: Types, Constants, and Core Modules Summary

Two-track decision foundation: sales-track.ts (pure state machine) and response-track.ts (template engine) with supporting type/constant changes and ingest simplification.

## What Was Done

### Task 1: Types + Constants + Ingest Simplification
- Added `SalesTrackOutput` (accion?, enterCaptura?, timerSignal?, reason) and `ResponseTrackOutput` (messages, templateIdsSent, salesTemplateIntents, infoTemplateIntents) to types.ts
- Added `INFORMATIONAL_INTENTS` set (11 informational intents) and `ACTION_TEMPLATE_MAP` (static accion-to-template mapping) to constants.ts
- Deprecated `NEVER_SILENCE_INTENTS` with JSDoc tag (kept for decision.ts backward compat)
- Removed all `action: 'silent'` returns from ingest.ts (datos and irrelevante cases now return 'respond')
- Kept `IngestAction` as union `'respond' | 'silent'` for backward compat with somnio-v3-agent.ts

### Task 2: Create sales-track.ts
- `resolveSalesTrack()` takes phase, intent, isAcknowledgment, sentiment, state, gates, systemEvent, ingestSystemEvent
- Returns `SalesTrackOutput` (accion?, enterCaptura?, timerSignal?, reason)
- Mirrors decision.ts logic flow but outputs only action + flags, never templateIntents
- Handles: system events, ingest events, acknowledgment routing, intent transitions, fallback

### Task 3: Create response-track.ts
- `resolveResponseTrack()` combines two independent template sources
- Sales action templates: dynamic resolution for mostrar_confirmacion/cambio/crear_orden/pedir_datos, static lookup for others via ACTION_TEMPLATE_MAP
- Informational templates: checks primary and secondary intent against INFORMATIONAL_INTENTS set
- Empty output = natural silence (no action + non-informational intent)
- Reuses existing TemplateManager + composeBlock infrastructure from v1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept IngestAction union type for backward compat**
- **Found during:** Task 1
- **Issue:** Narrowing IngestAction to just 'respond' caused TS2367 in somnio-v3-agent.ts line 129 where it checks `ingestResult.action === 'silent'`
- **Fix:** Kept 'silent' in the union type with deprecation JSDoc, since ingest never returns it. Plan 02 will remove the dead branch.
- **Files modified:** src/lib/agents/somnio-v3/types.ts

## Verification Results

1. `npx tsc --noEmit` passes (0 somnio-v3 errors)
2. sales-track.ts exports `resolveSalesTrack` with `SalesTrackOutput` return type
3. response-track.ts exports `resolveResponseTrack` with `ResponseTrackOutput` return type
4. ingest.ts has zero `'silent'` return values
5. constants.ts has `INFORMATIONAL_INTENTS` and `ACTION_TEMPLATE_MAP`
6. Existing `somnio-v3-agent.ts` and `decision.ts` still compile

## Next Phase Readiness

Plan 02 will:
- Wire sales-track + response-track into the somnio-v3-agent.ts pipeline
- Remove the dead `action === 'silent'` branch in the agent orchestrator
- Remove NEVER_SILENCE_INTENTS import from decision.ts
- Replace decision.ts + response.ts calls with the new two-track flow
