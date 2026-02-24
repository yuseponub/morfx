---
phase: 34
plan: 02
subsystem: somnio-agent
tags: [no-repetition, minifrase, haiku, filter, semantic-comparison]
requires: [34-01]
provides: [minifrase-generator, no-repetition-filter-class]
affects: [34-03, 34-04]
tech-stack:
  added: []
  patterns: [escalating-filter-pipeline, fail-open-strategy, haiku-as-judge]
key-files:
  created:
    - src/lib/agents/somnio/minifrase-generator.ts
    - src/lib/agents/somnio/no-repetition-filter.ts
  modified: []
decisions:
  - Sonnet 4 used for all Haiku calls (claude-sonnet-4-20250514) until Haiku 4 available
  - Fail-open on all error paths (send rather than block on API/parse errors)
  - Template minifrases cached per-instance (Map) to avoid repeated DB queries in same request
  - Level 3 only receives entries with fullContent (human/AI), not templates (which have no fullContent)
  - Minifrase generation uses Promise.all for parallel Haiku calls
  - Fallback minifrase is first 15 words of content (no LLM call)
metrics:
  duration: ~7min
  completed: 2026-03-03
---

# Phase 34 Plan 02: Minifrase Generator + No-Repetition Filter Summary

**One-liner:** Haiku-based minifrase generator for human/AI messages and 3-level escalating NoRepetitionFilter (ID lookup -> minifrase comparison -> full context) with fail-open strategy.

## Tasks Completed

| Task | Name | Commit | Key Change |
|------|------|--------|------------|
| 1 | Minifrase generator for human/AI messages | e07f1b5 | generateMinifrases() fills empty tema via Haiku with fallback |
| 2 | NoRepetitionFilter class with 3 escalating levels | 0687b22 | filterBlock() with Level 1/2/3 pipeline, fail-open on all errors |

## What Was Built

### Minifrase Generator (Task 1)
- `generateMinifrases(entries: OutboundEntry[])` modifies entries in-place
- Filters for entries where `tema === ''` and `fullContent` exists
- Calls Haiku (Sonnet 4) with MINIFRASE_PROMPT to generate ~15-word thematic descriptors
- Parallel generation via `Promise.all()` for efficiency
- Fallback on error: first 15 words of content (no LLM needed)
- Follows message-classifier.ts Anthropic SDK direct-call pattern

### NoRepetitionFilter (Task 2)
- **Level 1 (ID lookup):** `templatesEnviados.includes(template.templateId)` -- instant, $0, catches ~60% of cases
- **Level 2 (minifrase Haiku):** Compares candidate template minifrase against all outbound registry minifrases. Returns ENVIAR/NO_ENVIAR/PARCIAL. Cost: ~200ms, ~$0.0003
- **Level 3 (full context):** Only for PARCIAL cases. Compares full template content against human/AI message contents. Returns ENVIAR/NO_ENVIAR. Cost: ~1-3s
- **Fail-open strategy:** All error paths (API failure, parse failure, missing data) default to ENVIAR
- **Template minifrase cache:** `Map<string, string>` within filter instance avoids repeated DB queries
- **Workspace-scoped queries:** `agent_templates` filtered by `workspace_id.is.null,workspace_id.eq.{workspaceId}`
- **Structured logging:** Every filter decision logged with templateId, level, and reason

## Deviations from Plan

None -- plan executed exactly as written.

## Authentication Gates

None.

## Decisions Made

1. **Sonnet 4 for all Haiku calls:** `claude-sonnet-4-20250514` used consistently (matches message-classifier.ts pattern, MODEL_MAP maps Haiku to Sonnet 4)
2. **Fail-open everywhere:** Three distinct fail-open points (Level 2, Level 3, minifrase lookup). Better to occasionally repeat than suppress useful information.
3. **Per-instance minifrase cache:** Map lives for the duration of a single filterBlock call. No cross-request caching needed since serverless functions are short-lived.
4. **Level 3 only uses fullContent entries:** Templates don't have fullContent in the outbound registry (they have minifrases instead). Level 3 compares template content against human/AI full messages.
5. **Sequential per-template, parallel minifrases:** Filter processes templates sequentially (short-circuit saves cost), but minifrase generation is parallel (independent calls).

## Next Phase Readiness

Plan 02 provides the intelligence for Plans 03 and 04:
- **Plan 03** will integrate NoRepetitionFilter into the unified engine pipeline (between BlockComposer and MessagingAdapter)
- **Plan 04** will add template paraphrasing for repeated intents and fix the templates_enviados over-count bug

No blockers for Plan 03.
