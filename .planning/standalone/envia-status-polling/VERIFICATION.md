---
phase: envia-status-polling
verified: 2026-04-10T00:00:00Z
status: passed
score: 10/10 must-haves verified
---

# envia-status-polling Verification Report

**Phase Goal:** Automatic polling of Envia Colvanes shipment statuses via their public REST API. Cron every 2h, store state changes in order_carrier_events, show tracking timeline in order UI, feature flag for auto-stage-move OFF by default.
**Verified:** 2026-04-10
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                   | Status     | Evidence |
|----|-------------------------------------------------------------------------|------------|----------|
| 1  | order_carrier_events table migration exists with correct schema          | VERIFIED   | `supabase/migrations/20260410000003_order_carrier_events.sql` — all 9 columns present including novedades JSONB, raw_response JSONB, created_at with America/Bogota TZ |
| 2  | All 4 indexes exist (order_id, workspace_id, guia, created_at)          | VERIFIED   | Migration creates idx_order_carrier_events_order, _workspace, _guia, _created (created_at DESC) |
| 3  | carrier_configs has status_polling_pipeline_id and status_polling_stage_ids | VERIFIED | `supabase/migrations/20260410000004_carrier_configs_polling.sql` — both columns added |
| 4  | fetchEnviaStatus exported from envia-api.ts                             | VERIFIED   | `src/lib/carriers/envia-api.ts` line 35 — exported async function, returns `EnviaStatusResponse | null`, 10s AbortSignal.timeout |
| 5  | carrier-events.ts exports insertCarrierEvent, getLastCarrierEvent, getCarrierEventsByOrder | VERIFIED | All three exported from `src/lib/domain/carrier-events.ts`, all use createAdminClient + workspace_id filter |
| 6  | carrier-configs.ts has status_polling fields in CarrierConfig interface + getStatusPollingStages | VERIFIED | Interface lines 39-40, getStatusPollingStages exported line 444, returns { pipelineId, stageIds } |
| 7  | Cron polls every 2h 5am-7pm Colombia with change detection              | VERIFIED   | `src/inngest/functions/envia-status-polling.ts` — cron `TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *`, change detection via cod_estado comparison in step 3 |
| 8  | Feature flag ENVIA_AUTO_STAGE_MOVE OFF by default                       | VERIFIED   | Line 210: `process.env.ENVIA_AUTO_STAGE_MOVE === 'true'` — only activates if env var explicitly set to string `'true'` |
| 9  | enviaStatusPollingCron registered in route.ts                           | VERIFIED   | `src/app/api/inngest/route.ts` line 29 import + line 63 in functions array |
| 10 | Tracking timeline visible for Envia orders in order detail sheet        | VERIFIED   | `OrderTrackingSection` imported and rendered in `order-sheet.tsx` line 467, gated on `order.carrier` containing 'envia' (case-insensitive check in component line 20) |

**Score:** 10/10 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/20260410000003_order_carrier_events.sql` | VERIFIED | 38 lines, full schema + indexes + RLS |
| `supabase/migrations/20260410000004_carrier_configs_polling.sql` | VERIFIED | 9 lines, ALTER TABLE adds both columns |
| `src/lib/carriers/envia-api.ts` | VERIFIED | 47 lines, exports fetchEnviaStatus, typed response interface |
| `src/lib/domain/carrier-events.ts` | VERIFIED | 145 lines, 3 exported functions, createAdminClient, workspace_id filters |
| `src/lib/domain/carrier-configs.ts` | VERIFIED | Extended with status_polling fields, getStatusPollingStages exported at line 444 |
| `src/inngest/functions/envia-status-polling.ts` | VERIFIED | 235 lines, 3-step Inngest cron, batch polling, change detection, feature flag |
| `src/app/api/inngest/route.ts` | VERIFIED | enviaStatusPollingCron imported and registered |
| `src/app/actions/order-tracking.ts` | VERIFIED | 50 lines, exports getOrderTrackingEvents, auth + workspace cookie, delegates to domain |
| `src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx` | VERIFIED | 102 lines, exports OrderTrackingSection, loading/empty/events states, novedades sub-items |
| `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` | VERIFIED | OrderTrackingSection imported, rendered after Shipping section for Envia orders |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| envia-status-polling.ts | envia-api.ts | fetchEnviaStatus | WIRED | Line 13 import, called in poll-batch step |
| envia-status-polling.ts | carrier-events domain | insertCarrierEvent, getLastCarrierEvent | WIRED | Line 14 import, called in process-changes step |
| envia-status-polling.ts | carrier_configs table | direct adminClient query | WIRED | Step 1 queries carrier_configs for polling config |
| order-tracking.ts | carrier-events domain | getCarrierEventsByOrder | WIRED | Line 5 import, called in action body |
| order-tracking-section.tsx | order-tracking.ts | getOrderTrackingEvents | WIRED | Line 7 import, called in useEffect |
| order-sheet.tsx | order-tracking-section.tsx | OrderTrackingSection | WIRED | Line 42 import, rendered at line 467 |

---

## Anti-Patterns Found

None detected. No TODO/FIXME/placeholder stubs, no empty handlers, no hardcoded return values. Feature flag pattern is intentional and documented.

---

## Nuances

**"Tracking section only appears for orders with carrier events"** — The component renders for ALL Envia-carrier orders regardless of whether events exist yet. An empty state ("Sin eventos de tracking aun") is shown when no events exist. This is a deliberate design choice documented in 03-SUMMARY: "Empty state shows 'Sin eventos de tracking aun' (cron hasn't run yet)." The section is not hidden when events are absent — it informs the user that tracking is configured and will populate once the cron runs.

---

## Human Verification Required

### 1. Envia API Endpoint Reachability

**Test:** Manually call `https://hub.envia.co/ServicioRestConsultaEstados/Service1Consulta.svc/ConsultaEstadoGuia/{guia}` with a real guide number
**Expected:** Returns JSON with estado, cod_estadog, novedades fields matching `EnviaStatusResponse` interface
**Why human:** Envia's external API availability and response schema cannot be verified programmatically without a real guide number

### 2. Cron Execution in Inngest Cloud

**Test:** Check Inngest Cloud dashboard for `envia-status-polling` function schedule registration
**Expected:** Function visible, cron schedule shows `0 5,7,9,11,13,15,17,19 * * *` with TZ=America/Bogota
**Why human:** Inngest function registration requires the production app to be synced with Inngest Cloud

### 3. End-to-End Tracking Timeline

**Test:** Open any order in the Pedidos sheet where carrier contains "envia"
**Expected:** "Tracking Envia" section appears below Shipping section with loading state then timeline (or empty state)
**Why human:** Visual rendering and real data flow require a browser session with production data

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
