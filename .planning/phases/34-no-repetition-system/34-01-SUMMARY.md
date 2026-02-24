---
phase: 34
plan: 01
subsystem: somnio-agent
tags: [no-repetition, outbound-registry, minifrases, types]
requires: [phase-14-agent-templates, phase-29-inngest-migration]
provides: [no-rep-types, outbound-registry-builder, minifrase-seed-data]
affects: [34-02, 34-03, 34-04]
tech-stack:
  added: []
  patterns: [outbound-registry-reconstruction, human-vs-ai-disambiguation]
key-files:
  created:
    - supabase/migrations/20260303000000_no_repetition_minifrases.sql
    - src/lib/agents/somnio/no-repetition-types.ts
    - src/lib/agents/somnio/outbound-registry.ts
  modified: []
decisions:
  - minifrase column TEXT with max 100 chars (concise thematic descriptors)
  - siguientes visit_type templates deleted (unused since Phase 31 block composer redesign)
  - 75 minifrases hand-seeded per template based on content analysis
  - Human vs AI disambiguation via agent_turns content matching
  - messages.content is JSONB - extract body via content->>'body' or content.body
  - Template content excluded from human/AI classification to avoid double counting
metrics:
  duration: ~5min
  completed: 2026-03-03
---

# Phase 34 Plan 01: DB Foundation + Shared Types + Outbound Registry Summary

**One-liner:** minifrase column seeded on 75 templates, OutboundEntry/NoRepFilterResult types, and buildOutboundRegistry that reconstructs plantilla/humano/ia entries from 3 DB sources.

## Tasks Completed

| Task | Name | Commit | Key Change |
|------|------|--------|------------|
| 1 | DB migration - minifrase column + seed data + delete siguientes | b3110f7 | Added minifrase column, seeded 75 templates, deleted visit_type='siguientes' |
| 1.5 | Apply migration in production | N/A (checkpoint) | User confirmed migration applied successfully |
| 2 | Shared types + outbound registry builder | 778bb7b | OutboundEntry, NoRepFilterResult types + buildOutboundRegistry function |

## What Was Built

### Migration (Task 1)
- Added `minifrase VARCHAR(100)` column to `agent_templates`
- Seeded all 75 primera_vez templates with descriptive minifrases
- Deleted all `visit_type='siguientes'` templates (unused since Phase 31)

### Types (Task 2)
- `OutboundEntry` — represents a single outbound message (plantilla/humano/ia) with tema and optional fullContent
- `NoRepLevel2Decision` — ENVIAR/NO_ENVIAR/PARCIAL for Haiku minifrase comparison
- `FilteredTemplateEntry` — tracks which level blocked a template and why
- `NoRepFilterResult` — surviving + filtered arrays for block-level filtering

### Outbound Registry Builder (Task 2)
- Queries 3 DB sources: agent_templates (minifrases), messages (outbound), agent_turns (assistant)
- Disambiguates human vs AI: outbound messages not in agent_turns = human
- Extracts JSONB message body correctly (messages.content is JSONB, not text)
- Excludes known template content from human/AI classification
- Leaves tema empty for human/AI entries (Plan 02 populates via Haiku)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Template content exclusion in disambiguation**
- **Found during:** Task 2 implementation
- **Issue:** Outbound messages include template sends. Without excluding them, template content would be double-counted as both plantilla AND humano/ia entries.
- **Fix:** Added templateContentSet lookup that excludes known template content from the human/AI classification loop.
- **Files modified:** src/lib/agents/somnio/outbound-registry.ts
- **Commit:** 778bb7b

## Authentication Gates

None.

## Decisions Made

1. **minifrase as VARCHAR(100):** Short enough to force conciseness, long enough for meaningful descriptors
2. **siguientes deletion:** These templates were unused since Phase 31's block composer redesign; removing prevents confusion
3. **JSONB body extraction:** messages.content is JSONB (not text), body accessed via content.body or content->>'body'
4. **Template exclusion in disambiguation:** Prevents double-counting of template content as both plantilla and humano/ia entries

## Next Phase Readiness

Plan 01 provides the foundation for the remaining plans:
- **Plan 02** will use OutboundEntry + buildOutboundRegistry to generate minifrases for human/AI messages
- **Plan 03** will use NoRepFilterResult + FilteredTemplateEntry for the 3-level filter
- **Plan 04** will integrate everything into the somnio orchestrator

No blockers for Plan 02.
