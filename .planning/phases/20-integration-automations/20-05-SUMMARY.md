---
phase: 20-integration-automations
plan: 05
subsystem: integrations-config
tags: [twilio, shopify, config-ui, server-actions, sms-usage]
dependency-graph:
  requires: ["20-01", "20-03"]
  provides: ["twilio-config-ui", "sms-usage-dashboard", "shopify-auto-sync-toggle"]
  affects: ["20-07"]
tech-stack:
  added: []
  patterns: ["server-actions-with-role-check", "masked-credentials", "period-based-usage-chart"]
key-files:
  created:
    - src/app/actions/integrations.ts
    - src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx
    - src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx
  modified:
    - src/app/(dashboard)/configuracion/integraciones/page.tsx
    - src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
decisions:
  - id: "owner-admin-access"
    description: "Integrations page allows Owner + Admin roles (was Owner-only)"
    rationale: "Per CONTEXT.md decision: Owner + Admin can configure integrations"
  - id: "actions-file-location"
    description: "Server actions placed in src/app/actions/ not src/lib/actions/"
    rationale: "Project convention: all server actions live in src/app/actions/"
  - id: "sms-cost-4-decimals"
    description: "SMS costs displayed with 4 decimal places"
    rationale: "SMS costs are fractions of cents (e.g., $0.0079); 4 decimals needed for accuracy"
metrics:
  duration: "8 minutes"
  completed: "2026-02-16"
---

# Phase 20 Plan 05: Config UI - Twilio + Shopify Summary

Twilio credentials form with test connection, SMS usage dashboard with chart and message table, and Shopify auto-sync toggle -- all wired to server actions with Owner+Admin role authorization.

## What Was Done

### Task 1: Server actions for Twilio integration management
Created `src/app/actions/integrations.ts` with 6 server actions:
1. `saveTwilioIntegration` -- upsert Twilio credentials (Account SID, Auth Token, Phone Number) with E.164 and AC-prefix validation
2. `testTwilioConnection` -- send test SMS via Twilio SDK, store in sms_messages table
3. `getTwilioIntegration` -- load config with masked auth_token (****XXXX, last 4 chars visible)
4. `getSmsUsage` -- query sms_messages for period (day/week/month), return count, total cost, pending count, and last 50 messages
5. `getSmsUsageChart` -- aggregate SMS by date (Colombia timezone) for recharts rendering
6. `updateShopifyAutoSync` -- update Shopify integration config.auto_sync_orders field

All actions use `getIntegrationAuthContext()` helper that verifies auth + workspace membership + role. Only Owner and Admin roles can perform mutations.

### Task 2: UI components and page restructuring
- **twilio-form.tsx** (348 lines): Client component with react-hook-form, 3 credential fields, show/hide password toggle, connection status badge (Conectado/No configurado), test connection form that sends real SMS, setup instructions for new users
- **twilio-usage.tsx** (328 lines): Period selector (Dia/Semana/Mes), 3 stat cards (SMS Enviados, Costo Total USD, Pendientes), teal-themed area chart via recharts, recent messages table with status badges (delivered=green, sent=blue, failed=red, queued=gray)
- **page.tsx**: Added Twilio tab alongside Shopify in shadcn Tabs. Changed access control from Owner-only to Owner+Admin
- **shopify-form.tsx**: Added auto-sync toggle ("Crear ordenes automaticamente") with help text explaining dual behavior. Only visible when integration is configured and active

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Server actions file location**
- **Found during:** Task 1
- **Issue:** Plan specified `src/lib/actions/integrations.ts` but project convention places all server actions in `src/app/actions/`
- **Fix:** Created file at `src/app/actions/integrations.ts` instead
- **Files:** src/app/actions/integrations.ts

**2. [Rule 1 - Bug] TypeScript type assertion for ShopifyConfig**
- **Found during:** Task 2
- **Issue:** Direct cast `integration?.config as Record<string, unknown>` caused TS2352 error because ShopifyConfig type is incompatible
- **Fix:** Used double cast via `unknown`: `integration?.config as unknown as Record<string, unknown> | undefined`
- **Files:** src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| File at src/app/actions/ not src/lib/actions/ | Follows established project convention for server actions |
| Owner + Admin can access integrations | Per CONTEXT.md: "Owner + Admin pueden configurar integraciones" |
| Teal color theme for Twilio UI | Distinguishes from WhatsApp (green) and Shopify (purple) |
| 4 decimal places for SMS costs | SMS costs are fractions of cents (e.g., $0.0079) |
| "Pendiente" label for null prices | Twilio reports price asynchronously via status callback |

## Next Phase Readiness

All config UI is ready. Users can configure Twilio credentials, test the connection, and monitor SMS usage. The Shopify auto-sync toggle enables dual-behavior mode from plan 20-04.

Remaining plans: 20-06 (wizard UI for Twilio/Shopify categories) is already partially done, 20-07 (AI builder updates).
