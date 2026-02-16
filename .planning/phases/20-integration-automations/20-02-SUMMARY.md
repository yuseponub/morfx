---
phase: 20-integration-automations
plan: 02
subsystem: automations-engine
tags: [shopify, inngest, trigger-emitter, variable-resolver, automation-runner]
dependency-graph:
  requires: [20-01]
  provides: [shopify-emitters, shopify-events, shopify-runners, shopify-variables]
  affects: [20-04, 20-05, 20-06, 20-07]
tech-stack:
  added: []
  patterns: [factory-runner, fire-and-forget-emitter, namespace-variable-resolver]
file-tracking:
  key-files:
    modified:
      - src/lib/automations/trigger-emitter.ts
      - src/inngest/events.ts
      - src/lib/automations/variable-resolver.ts
      - src/inngest/functions/automation-runner.ts
decisions:
  - id: shopify-no-config-filters
    description: "Shopify triggers always match (no configFields), unlike order.stage_changed which filters by pipeline/stage"
    rationale: "Shopify events are workspace-scoped at webhook level; filtering happens by event type, not config"
metrics:
  duration: ~3 min
  completed: 2026-02-16
---

# Phase 20 Plan 02: Shopify Automations Engine Summary

Shopify trigger emitters, Inngest event types, automation runners, and variable resolver namespace for 3 Shopify triggers (order_created, draft_order_created, order_updated).

## What Was Done

### Task 1: Add Shopify trigger emitters and Inngest events
- Added 3 emitter functions to `trigger-emitter.ts`: `emitShopifyOrderCreated`, `emitShopifyDraftOrderCreated`, `emitShopifyOrderUpdated`
- Each follows existing fire-and-forget pattern with cascade depth suppression
- Added 3 event types to `AutomationEvents` in `events.ts` with full typed data shapes
- Updated emitter count comment from 10 to 13
- Commit: `fd89321`

### Task 2: Extend variable resolver and automation runners for Shopify
- Added `shopify.*` namespace in `buildTriggerContext` with 12 mapped fields (order_number, total, financial_status, fulfillment_status, email, phone, note, productos, direccion_envio, ciudad_envio, tags, status)
- Added 3 entries to `EVENT_TO_TRIGGER` mapping in `automation-runner.ts`
- Added 3 Shopify cases to `matchesTriggerConfig` (always return true, no config filters)
- Created 3 runners via `createAutomationRunner` factory pattern
- Added all 3 to `automationFunctions` export array (total: 13 runners)
- Updated runner count comment from 10 to 13
- Commit: `48212cf`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| `grep -c 'emitShopify' trigger-emitter.ts` | 3 | 3 |
| `grep -c 'automation/shopify' events.ts` | 3 | 3 |
| `grep 'shopify' automation-runner.ts \| wc -l` | >= 6 | 18 |
| `grep 'shopify' variable-resolver.ts \| wc -l` | >= 5 | 15 |
| TypeScript errors | 0 | 0 |

## Key Artifacts

| File | What It Provides |
|------|-----------------|
| `src/lib/automations/trigger-emitter.ts` | 3 Shopify emitters (callable from webhook handler in Plan 04) |
| `src/inngest/events.ts` | 3 Shopify event type definitions |
| `src/inngest/functions/automation-runner.ts` | 3 Shopify runners + EVENT_TO_TRIGGER + matchesTriggerConfig |
| `src/lib/automations/variable-resolver.ts` | `shopify.*` namespace with 12 fields |

## Next Phase Readiness

- Plan 04 (Shopify Webhook Handler) can now emit Shopify events via the 3 emitter functions
- Plan 05/06/07 (UI) can reference `shopify.*` variables in automation templates
- All 13 trigger types now have full engine support (emitter + event + runner + variables)
