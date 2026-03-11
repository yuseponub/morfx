---
phase: quick-020
plan: 01
subsystem: agent-v3
tags: [somnio-v3, sales-track, discriminated-union, timer, bug-fix]
requires: []
provides:
  - SalesEvent discriminated union type
  - Clean system event / user message separation
  - camposFaltantes barrio bug fix
affects:
  - standalone/v3-state-machine (sales-track interface changed)
tech-stack:
  added: []
  patterns:
    - Discriminated union for event routing (SalesEvent)
    - Two-path agent pipeline (system vs user)
key-files:
  created: []
  modified:
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/sales-track.ts
    - src/lib/agents/somnio-v3/state.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
    - src/lib/agents/somnio-v3/response-track.ts
    - src/lib/agents/somnio-v3/engine-v3.ts
decisions:
  - id: q020-d1
    title: SalesEvent discriminated union over optional params
    choice: Option C — TypeScript enforces correctness at compile time
  - id: q020-d2
    title: intentInfo optional, not filled with fake data
    choice: System events don't have intents — omit the field entirely
  - id: q020-d3
    title: camposFaltantes includes barrio
    choice: Fixes empty retoma_datos_parciales template when only barrio is missing
metrics:
  duration: ~10min
  completed: 2026-03-10
---

# Quick 020: System Event Separation Summary

**One-liner:** Discriminated union SalesEvent splits timer events from user messages, eliminating fake 'otro' analysis hack and fixing empty barrio template.

## What Changed

### 1. SalesEvent Discriminated Union (types.ts)
- Added `SalesEvent = { type: 'user_message'; ... } | { type: 'timer_expired'; level }` type
- Made `intentInfo` optional in `V3AgentOutput` — system events have no intent
- TypeScript compiler now prevents accessing `intent` on timer events

### 2. Two-Path Pipeline (somnio-v3-agent.ts)
- `processMessage()` routes to `processSystemEvent()` or `processUserMessage()`
- **processSystemEvent**: deserializeState -> derivePhase -> computeGates -> resolveSalesTrack -> resolveResponseTrack -> serialize. NO comprehension, NO mergeAnalysis, NO guards, NO intentInfo, NO turnCount++, NO intentsVistos push.
- **processUserMessage**: identical to previous full pipeline with real comprehension
- Catch block no longer returns fake `intentInfo: { intent: 'otro' }`

### 3. Sales Track Interface (sales-track.ts)
- Changed from `{ intent, changes, category, systemEvent? }` to `{ event: SalesEvent }`
- Timer events: early return after transition lookup
- User messages: destructure intent/category/changes from event, proceed as before

### 4. Response Track (response-track.ts)
- `intent` parameter now optional
- Informational intent check guarded: `if (intent && INFORMATIONAL_INTENTS.has(intent))`

### 5. Engine V3 (engine-v3.ts)
- debugTurn.intent construction wrapped in conditional for optional intentInfo
- Fallback: `{ intent: 'system_event', confidence: 0, reasoning: 'Timer event - no comprehension' }`

### 6. Bug Fix: camposFaltantes includes barrio (state.ts)
- Added barrio to missing fields list when not present AND not negated
- Fixes empty `retoma_datos_parciales` template when critical fields are complete but barrio is missing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Circular import type resolution**
- types.ts imports `StateChanges` from state.ts (type-only import)
- state.ts imports types from types.ts
- TypeScript `import type` handles this correctly (erased at compile time)

**2. [Rule 1 - Bug] String literal type mismatch in camposFaltantes**
- `fields.filter()` returned typed literal array, couldn't push `'barrio'`
- Fix: explicit `const missing: string[]` annotation

**3. [Rule 1 - Bug] SystemEvent union narrowing in router**
- `input.systemEvent` is `SystemEvent` (includes `{ type: 'auto' }`)
- Added `&& input.systemEvent.type === 'timer_expired'` to router condition
- Auto events from sales-track are internal, not from input.systemEvent

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b568621 | SalesEvent type, sales-track refactor, camposFaltantes barrio fix |
| 2 | c52465b | Split processMessage, fix engine-v3, make intent optional |

## Verification

- `npx tsc --noEmit` — zero errors
- `grep -c "'otro'" somnio-v3-agent.ts` — 0 (fake analysis eliminated)
- `processSystemEvent` and `processUserMessage` both exist
- `intentInfo?` confirmed optional in types.ts
- `barrio` included in camposFaltantes when missing and not negated
