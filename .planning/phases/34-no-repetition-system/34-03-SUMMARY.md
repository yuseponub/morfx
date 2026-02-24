---
phase: 34
plan: 03
subsystem: somnio-agent
tags: [no-repetition, paraphraser, template-manager, repeated-intents]
requires: [34-01]
provides: [template-paraphraser, repeated-intent-handling, isRepeatedVisit-flag]
affects: [34-04]
tech-stack:
  added: []
  patterns: [claude-paraphrasing, fail-safe-pattern, repeated-intent-cap]
key-files:
  created:
    - src/lib/agents/somnio/template-paraphraser.ts
  modified:
    - src/lib/agents/somnio/template-manager.ts
    - src/lib/agents/somnio/somnio-orchestrator.ts
decisions:
  - Anthropic client as module-level singleton (matching message-classifier pattern)
  - claude-sonnet-4-20250514 for paraphrasing (Sonnet until Haiku 4 available)
  - MIN_CONTENT_LENGTH=20 threshold to skip paraphrasing very short templates
  - MAX_LENGTH_RATIO=1.3 validation (paraphrased text max 30% longer than original)
  - REPEATED_INTENT_MAX_TEMPLATES=2 cap (top 2 by priority for repeated intents)
  - processTemplates now async with isRepeated parameter (backward compatible default=false)
  - visitType always returns 'primera_vez' (siguientes logic completely removed)
metrics:
  duration: ~5min
  completed: 2026-02-24
---

# Phase 34 Plan 03: Template Paraphraser + Repeated Intent Handling Summary

**One-liner:** Claude-powered template paraphraser with fail-safe returns original on error, TemplateManager always uses primera_vez with repeated intents capped at top 2 and paraphrased via Haiku.

## Tasks Completed

| Task | Name | Commit | Key Change |
|------|------|--------|------------|
| 1 | Template paraphraser module | a323d8c | paraphraseTemplate function with Claude call, fail-safe, and validation |
| 2 | Update TemplateManager for repeated intents | 6f1bf64 | Always primera_vez, cap at 2, async processTemplates with paraphrase |

## What Was Built

### Template Paraphraser (Task 1)
- `paraphraseTemplate(originalContent)` function calling Claude Sonnet 4
- PARAPHRASE_PROMPT preserves all factual data (prices, numbers, times, quantities, ingredients)
- Fail-safe behavior: returns original content on API error, empty response, or too-long result
- Skips templates shorter than 20 chars (not worth paraphrasing)
- Module-level Anthropic client singleton (same pattern as MessageClassifier)
- Validation: paraphrased text cannot exceed 1.3x original length

### TemplateManager Updates (Task 2)
- `getTemplatesForIntent` always queries `visit_type='primera_vez'` (siguientes no longer exist)
- `isRepeatedVisit` flag computed via `!isFirstVisit(intent, intentsVistos)`
- Repeated intents capped at top 2 templates sorted by priority (CORE > COMP > OPC)
- `processTemplates` now async with `isRepeated` parameter (default false for backward compat)
- When `isRepeated=true`, each template content is paraphrased AFTER variable substitution
- `TemplateSelection` interface extended with `isRepeatedVisit: boolean`

### Orchestrator Wiring (Task 2)
- `somnio-orchestrator.ts` passes `selection.isRepeatedVisit` to `processTemplates`
- Properly awaits the now-async `processTemplates` call

## Deviations from Plan

None -- plan executed exactly as written.

## Authentication Gates

None.

## Decisions Made

1. **Anthropic client singleton:** Module-level `clientInstance` initialized lazily, matching message-classifier.ts pattern
2. **Sonnet 4 model:** Using `claude-sonnet-4-20250514` until Haiku 4 is available (same decision as other Haiku-intended calls)
3. **MIN_CONTENT_LENGTH=20:** Templates shorter than 20 chars skip paraphrasing (e.g., single emojis, very short acknowledgments)
4. **MAX_LENGTH_RATIO=1.3:** Paraphrased text validated to not exceed 130% of original length; exceeding returns original
5. **REPEATED_INTENT_MAX_TEMPLATES=2:** Repeated visits get max 2 templates (CORE priority first)
6. **processTemplates backward compatible:** Default `isRepeated=false` means existing callers work unchanged
7. **visitType always 'primera_vez':** The `siguientes` concept is fully removed from operational logic; type guard remains for DB schema compatibility

## Next Phase Readiness

Plan 03 provides:
- **paraphraseTemplate** function ready for Plan 04 integration (no-rep filter can also use it)
- **isRepeatedVisit flag** available in TemplateSelection for downstream consumers
- **Async processTemplates** wired through orchestrator -> unified-engine pipeline

No blockers for Plan 04.
