---
phase: 34
plan: 04
subsystem: unified-engine
tags: [no-repetition, engine-integration, over-count-fix, two-phase-save]
requires: [34-01, 34-02, 34-03]
provides: [no-rep-filter-live, over-count-bug-fix, templates-enviados-accuracy]
affects: []
tech-stack:
  added: []
  patterns: [two-phase-save, fail-open-pipeline, post-send-tracking]
key-files:
  created: []
  modified:
    - src/lib/agents/engine/unified-engine.ts
    - src/lib/agents/somnio/somnio-agent.ts
decisions:
  - Only useBlockComposition path gets no-rep filter (forceIntent and sandbox bypass it)
  - Fail-open at pipeline level: entire no-rep crash falls back to sending full block
  - Two-phase save: pre-send saves base templates_enviados, post-send appends only sent IDs
  - Empty filtered block sends nothing, clears stale pending, logs the event
  - Interruption slicing uses filteredBlock (not composed.block) for accurate pending storage
metrics:
  duration: ~6min
  completed: 2026-02-24
---

# Phase 34 Plan 04: Engine Integration + Over-Count Fix Summary

**One-liner:** NoRepetitionFilter wired between BlockComposer and MessagingAdapter in unified-engine.ts with two-phase save fixing the templates_enviados over-count bug.

## Tasks Completed

| Task | Name | Commit | Key Change |
|------|------|--------|------------|
| 1 | Fix over-count bug in SomnioAgent | 9ba2477 | Removed orchestrator templatesSent from newTemplatesEnviados |
| 2 | Integrate NoRepetitionFilter into engine | 71336c0 | Full no-rep pipeline + two-phase save + empty block handling |

## What Was Built

### Over-Count Bug Fix (Task 1)
- `somnio-agent.ts` no longer spreads `orchestratorResult.stateUpdates.templatesSent` into `newTemplatesEnviados`
- `newTemplatesEnviados` now only contains the base `input.session.state.templates_enviados`
- The engine (Task 2) handles appending actually-sent IDs post-send
- This fixes the bug where interrupted sends permanently marked unsent templates as sent

### Engine Integration (Task 2)
- **Imports:** `NoRepetitionFilter`, `buildOutboundRegistry`, `generateMinifrases` added to unified-engine.ts
- **Pipeline placement:** After `composeBlock()` (line 278) and before `messaging.send()` (line 342)
- **No-rep filter flow:**
  1. Build outbound registry from conversation (3 DB sources)
  2. Generate minifrases for human/AI entries via Haiku (parallel)
  3. Filter composed block through 3-level check (ID -> minifrase -> full context)
- **Two-phase save pattern:**
  - Pre-send: `saveState()` saves base `templates_enviados` (existing behavior, now correctly empty of new IDs)
  - Post-send: `saveState()` appends only IDs of templates that were actually sent via messaging adapter
- **Empty filtered block:** When all templates filtered by no-rep, engine sends nothing, clears stale pending, logs event
- **Fail-open:** If entire no-rep pipeline crashes (try/catch), falls back to sending the full composed block
- **Bypass paths:** `forceIntent` (timer-triggered) and sandbox (no templates) skip the filter entirely via `useBlockComposition` guard
- **Interruption handling:** Uses `filteredBlock.slice(sentIndex)` for pending storage (not `composed.block`)

## Deviations from Plan

None -- plan executed exactly as written.

## Authentication Gates

None.

## Decisions Made

1. **Pipeline-level fail-open:** Beyond the per-level fail-open in NoRepetitionFilter itself, the engine wraps the entire no-rep pipeline in try/catch. Any crash falls back to sending the full composed block.
2. **Two-phase save pattern:** Pre-send saveState is unchanged (saves base templates_enviados). Post-send saveState only runs if sentTemplateIds.length > 0, appending only actually-sent IDs.
3. **Empty filtered block behavior:** Sends nothing (correct behavior), clears stale pending templates, logs for diagnostics. messagesSent stays 0, sentMessageContents stays empty.
4. **filteredBlock for interruption:** Unsent templates from interruption are sliced from `filteredBlock` (surviving templates), not from `composed.block` (which may contain filtered-out templates).
5. **Bypass via useBlockComposition guard:** The existing `!input.forceIntent` guard naturally excludes timer-triggered paths from the no-rep filter, which is correct since those paths bypass block composition entirely.

## Phase 34 Complete

All 4 plans are now complete:
- **34-01:** DB foundation (minifrase column + outbound registry types)
- **34-02:** Minifrase generator + NoRepetitionFilter class (3-level)
- **34-03:** Template paraphraser + repeated intent handling
- **34-04:** Engine integration + over-count bug fix (this plan)

The no-repetition system is fully wired end-to-end:
- Templates are seeded with minifrases in DB
- Outbound registry reconstructs all sent messages from 3 DB sources
- Human/AI minifrases are generated on-the-fly via Haiku
- 3-level filter (ID -> minifrase Haiku -> full context Haiku) runs between BlockComposer and MessagingAdapter
- Only actually-sent template IDs are tracked (over-count bug fixed)
- Repeated intents get top 2 templates, paraphrased via Claude
