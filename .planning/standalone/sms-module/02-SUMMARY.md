---
phase: sms-module
plan: 02
subsystem: sms
tags: [onurix, sms, inngest, automation-action, domain-layer]

# Dependency graph
requires:
  - phase: sms-module-01
    provides: "Onurix client, domain sendSMS, sms_messages table"
provides:
  - "Inngest sms-delivery-check function (2-stage polling)"
  - "Onurix-based send_sms automation action (replaces Twilio)"
affects: [sms-module-03, sms-module-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inngest 2-stage polling: step.sleep(10s) + check, step.sleep(50s) + check"
    - "Automation action delegates to domain layer instead of provider SDK directly"

key-files:
  created:
    - src/inngest/functions/sms-delivery-check.ts
  modified:
    - src/app/api/inngest/route.ts
    - src/lib/automations/action-executor.ts
    - src/lib/automations/constants.ts

key-decisions:
  - "Onurix 'Enviado' state maps to 'delivered', anything else maps to 'failed'"
  - "Maximum 2 Onurix status checks per SMS (10s and 60s after send)"
  - "send_sms action type key preserved for DB compatibility (existing automation configs)"
  - "mediaUrl param removed from ACTION_CATALOG (Onurix does not support MMS)"

patterns-established:
  - "Inngest delivery verification: durable step.sleep for delayed checks, not setTimeout"
  - "SMS automation action through domain layer: validation, balance, send, log, deduct, verify"

# Metrics
duration: 4min
completed: 2026-03-16
---

# SMS Module Plan 02: Inngest Delivery + Automation Action Summary

**Inngest 2-stage SMS delivery verification and Twilio-to-Onurix migration in automation action executor**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T21:13:02Z
- **Completed:** 2026-03-16T21:17:00Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 3

## Accomplishments
- Inngest function `sms-delivery-check` with durable 2-stage polling (10s + 60s) for SMS delivery verification
- Replaced Twilio SDK in automation action executor with domain/sms.ts sendSMS
- Updated ACTION_CATALOG: category 'Twilio' to 'SMS', removed MMS mediaUrl param
- Complete SMS pipeline: automation fires -> domain sendSMS -> Onurix API -> log -> Inngest delivery check -> status update

## Task Commits

Each task was committed atomically:

1. **Task 1: Inngest delivery verification function** - `a3ba9a9` (feat)
2. **Task 2: Replace Twilio send_sms action with Onurix domain** - `74fe386` (feat)

## Files Created/Modified
- `src/inngest/functions/sms-delivery-check.ts` - 2-stage delivery verification: check at 10s, retry at 60s, update sms_messages status
- `src/app/api/inngest/route.ts` - Register smsDeliveryFunctions in Inngest serve handler
- `src/lib/automations/action-executor.ts` - Remove Twilio imports, delegate to domain sendSMS
- `src/lib/automations/constants.ts` - ACTION_CATALOG send_sms: category SMS, no mediaUrl

## Decisions Made
- Onurix state 'Enviado' = delivered; anything else after 2 checks = failed
- Maximum 2 API calls per SMS to avoid excessive polling
- mediaUrl param removed (Onurix is SMS-only, no MMS support)
- Action type key 'send_sms' unchanged for backward compatibility with existing automations in DB

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness
- SMS sending pipeline is complete end-to-end: automation action -> domain -> Onurix -> delivery verification
- Next plan (03) can build the SMS dashboard UI (saldo, historial, estadisticas)
- No new migrations required for this plan

---
*Phase: sms-module*
*Completed: 2026-03-16*
