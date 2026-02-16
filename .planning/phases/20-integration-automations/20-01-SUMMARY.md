---
phase: 20-integration-automations
plan: 01
subsystem: automations-engine
tags: [twilio, shopify, types, constants, migration, sms]
dependency-graph:
  requires: [17-01, 18-01]
  provides: [type-definitions, catalog-entries, twilio-client, sms-migration]
  affects: [20-02, 20-03, 20-04, 20-05, 20-06, 20-07]
tech-stack:
  added: [twilio@5.12.x]
  patterns: [per-workspace-credential-factory, catalog-extension]
key-files:
  created:
    - src/lib/twilio/types.ts
    - src/lib/twilio/client.ts
    - supabase/migrations/20260216_sms_messages.sql
  modified:
    - src/lib/automations/types.ts
    - src/lib/automations/constants.ts
    - src/lib/shopify/types.ts
    - package.json
    - package-lock.json
decisions:
  - "require('twilio') instead of ESM import (no default ESM export)"
  - "Twilio client typed as any to avoid @types/twilio dependency"
  - "ShopifyDraftOrderWebhook as separate interface (not extending ShopifyOrderWebhook) for clarity"
  - "auto_sync_orders defaults to undefined/true for backward compatibility"
  - "sms_messages RLS: SELECT for workspace members, all writes via createAdminClient"
metrics:
  duration: ~15 minutes
  completed: 2026-02-16
---

# Phase 20 Plan 01: Foundation - Types, Constants, Twilio Client, Migration Summary

**One-liner:** Extended automations engine with 3 Shopify triggers + send_sms action in catalogs, Twilio client factory with per-workspace credentials, and sms_messages migration.

## What Was Done

### Task 1: Extend Automations Type System and Catalogs
- Added 3 Shopify trigger types to `TriggerType` union: `shopify.order_created`, `shopify.draft_order_created`, `shopify.order_updated`
- Added `send_sms` to `ActionType` union
- Added 3 Shopify entries to `TRIGGER_CATALOG` with category "Shopify" and full variable lists
- Added `send_sms` entry to `ACTION_CATALOG` with category "Twilio" and 3 params (body, to, mediaUrl)
- Added 3 Shopify variable sets to `VARIABLE_CATALOG` covering order data, contact data, and Shopify-specific fields
- **Counts:** TriggerType=13, ActionType=12, TRIGGER_CATALOG=13, ACTION_CATALOG=12, VARIABLE_CATALOG=13
- `constants.ts` maintains ZERO imports from project files

### Task 2: Twilio Client Module, Shopify Draft Type, DB Migration
- Created `src/lib/twilio/types.ts` with `TwilioConfig`, `SmsMessage`, `SmsStatus` types
- Created `src/lib/twilio/client.ts` with `getTwilioConfig()` (queries integrations table) and `createTwilioClient()` (wraps Twilio SDK)
- Added `ShopifyDraftOrderWebhook` interface to `src/lib/shopify/types.ts` with draft-specific fields (status, invoice_url, fulfillment_status always null)
- Added `auto_sync_orders?: boolean` to `ShopifyConfig` for the dual-behavior toggle
- Created `supabase/migrations/20260216_sms_messages.sql` with workspace isolation, indexes, and RLS
- Installed `twilio` npm package v5.12.x (required `--legacy-peer-deps` due to React 19 peer dep conflict)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 6fa5830 | feat(20-01): extend automations type system with Shopify triggers and SMS action |
| 2 | 7c142f2 | feat(20-01): add Twilio client module, Shopify draft order type, and SMS migration |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm install peer dependency conflict**
- **Found during:** Task 2 (twilio install)
- **Issue:** `npm install twilio` failed with ERESOLVE due to `@webscopeio/react-textarea-autocomplete` requiring React ^16-18, conflicting with React 19
- **Fix:** Used `--legacy-peer-deps` flag (same pattern established in Phase 19-01)
- **Files modified:** package.json, package-lock.json

**2. [Rule 3 - Blocking] npm install corrupted Next.js type declarations**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** After installing twilio, `npx tsc --noEmit` showed ~50 Next.js type errors (next/server module declarations missing)
- **Fix:** Reinstalled `next@latest --legacy-peer-deps` to restore type declarations
- **Files modified:** node_modules (not committed)

## Decisions Made

1. **require('twilio') over ESM import** -- The twilio package lacks a proper ESM default export, so `require()` is used with `any` return type to avoid needing `@types/twilio`.
2. **ShopifyDraftOrderWebhook as separate interface** -- Rather than extending ShopifyOrderWebhook, created a standalone interface for clarity since draft orders have meaningful structural differences (status vs financial_status, invoice_url, fulfillment_status always null).
3. **sms_messages RLS: read-only for users** -- Only SELECT policy for workspace members. All writes go through `createAdminClient()` in the action executor and status callback (system-level operations).

## Verification Results

- TypeScript compilation: only expected exhaustive-switch error for `send_sms` in action-executor.ts (fixed in Plan 02)
- All new files exist and are syntactically correct
- No new errors introduced in any modified files
- Catalog counts verified: 13 triggers, 12 actions, 13 variable sets

## Next Phase Readiness

Plan 02 depends on:
- `send_sms` ActionType exists in types.ts (done)
- `ACTION_CATALOG` has send_sms entry (done)
- Twilio client module ready (done)
- sms_messages migration exists (done)

Plan 03 depends on:
- 3 Shopify trigger types in TriggerType (done)
- `TRIGGER_CATALOG` has 3 Shopify entries (done)
- `VARIABLE_CATALOG` has 3 Shopify keys (done)
- ShopifyDraftOrderWebhook type exists (done)
- ShopifyConfig.auto_sync_orders field exists (done)

No blockers for subsequent plans.
