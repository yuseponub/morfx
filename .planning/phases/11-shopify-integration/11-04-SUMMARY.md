---
phase: 11-shopify-integration
plan: 04
subsystem: integrations
tags: [shopify, server-actions, connection-test, owner-only]
dependency_graph:
  requires: [11-01, 11-02]
  provides: [connection-testing, integration-crud, shopify-actions]
  affects: [11-03]
tech_stack:
  added: ["@shopify/shopify-api"]
  patterns: [server-actions, owner-only-access]
key_files:
  created:
    - src/lib/shopify/connection-test.ts
    - src/app/actions/shopify.ts
  modified: []
decisions:
  - id: use-shopify-sdk
    choice: "@shopify/shopify-api for connection test"
    rationale: "Official SDK provides reliable API access, proper error handling, and session management"
  - id: owner-only-writes
    choice: "All write operations require Owner role"
    rationale: "Integration credentials are sensitive, only workspace owner should manage them"
  - id: test-before-save
    choice: "Connection test mandatory before save"
    rationale: "Prevents storing invalid credentials that would cause webhook failures"
metrics:
  duration: "10 minutes"
  completed: "2026-02-04"
---

# Phase 11 Plan 04: Connection Testing & Server Actions Summary

**One-liner:** Shopify connection test utility and Owner-only Server Actions for integration CRUD

## What Was Built

### Task 1: Shopify Connection Test Utility
**File:** `src/lib/shopify/connection-test.ts`

Created a robust connection testing utility that:
- Uses official Shopify SDK (@shopify/shopify-api) for API access
- Validates credentials by calling `oauth/access_scopes` endpoint
- Verifies required scopes: `read_orders`, `read_customers`
- Returns shop name on success for UI confirmation
- Normalizes shop domain input (accepts full URL, domain, or just store name)
- Comprehensive Spanish error messages for common failures

**Key exports:**
- `testShopifyConnection(shopDomain, accessToken, apiSecret)` - Tests credentials
- `normalizeShopDomain(input)` - Normalizes domain format
- `ConnectionTestResult` - TypeScript interface for results

### Task 2: Server Actions for Integration CRUD
**File:** `src/app/actions/shopify.ts`

Created complete Server Actions for integration management:

**Read Operations (any authenticated user):**
- `getShopifyIntegration()` - Get workspace's Shopify integration
- `getWebhookEvents(limit)` - Get webhook events with stats
- `getPipelinesForConfig()` - Get pipelines for settings dropdown
- `getIntegrationStatus()` - Get status summary for UI

**Write Operations (Owner only):**
- `testConnection(formData)` - Test credentials without saving
- `saveShopifyIntegration(formData)` - Create or update integration
- `toggleShopifyIntegration(isActive)` - Enable/disable integration
- `deleteShopifyIntegration()` - Remove integration and webhook events

**Security:** All write operations verify workspace Owner role before proceeding.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SDK for connection test | @shopify/shopify-api | Official SDK, handles session management properly |
| Owner-only writes | Role check on all mutations | Credentials are sensitive, limit access |
| Test before save | Mandatory connection test | Prevent invalid credentials from being stored |
| Workspace from cookie | morfx_workspace cookie | Consistent with existing actions pattern |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added isEmbeddedApp property to SDK config**
- **Found during:** Task 1 compilation
- **Issue:** TypeScript error - `isEmbeddedApp` is required by Shopify SDK
- **Fix:** Added `isEmbeddedApp: false` to shopifyApi config
- **Files modified:** `src/lib/shopify/connection-test.ts`

## Dependencies

**New packages installed:**
- `@shopify/shopify-api@12.3.0` - Shopify Admin API SDK

## Verification Results

- [x] Connection test uses official Shopify SDK
- [x] Required scopes validated (read_orders, read_customers)
- [x] Server Actions enforce Owner-only access
- [x] Test connection before save prevents invalid credentials
- [x] All files compile without TypeScript errors

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| 476cd9a | feat(11-04): add Shopify connection test utility | package.json, pnpm-lock.yaml, src/lib/shopify/connection-test.ts |
| f97c9c6 | feat(11-04): add Server Actions for Shopify integration CRUD | src/app/actions/shopify.ts |

## Next Phase Readiness

**Ready for 11-03:** The connection test and Server Actions are complete. Plan 11-03 can now:
- Use `testShopifyConnection` to validate credentials in the settings UI
- Call `saveShopifyIntegration` to store credentials
- Use `getPipelinesForConfig` to populate the pipeline dropdown
- Display status with `getIntegrationStatus`
