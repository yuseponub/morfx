---
phase: sms-module
plan: 01
subsystem: sms
tags: [onurix, sms, domain-layer, supabase-rpc, inngest]

# Dependency graph
requires:
  - phase: 20-sms-twilio
    provides: "existing sms_messages table schema"
provides:
  - "sms_workspace_config table with balance and settings"
  - "sms_balance_transactions audit log table"
  - "deduct_sms_balance and add_sms_balance atomic RPCs"
  - "Onurix API client (sendOnurixSMS, checkOnurixStatus)"
  - "sendSMS domain function (single entry point for all SMS)"
  - "Phone formatting, segment calculation, time window utilities"
affects: [sms-module-02, sms-module-03, sms-module-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Onurix API: form-urlencoded POST for send, GET for status check"
    - "Atomic balance deduction via Supabase RPC with FOR UPDATE lock"
    - "Pre-send balance check, then send, then deduct actual cost"

key-files:
  created:
    - supabase/migrations/20260316100000_sms_onurix_foundation.sql
    - src/lib/sms/types.ts
    - src/lib/sms/constants.ts
    - src/lib/sms/utils.ts
    - src/lib/sms/client.ts
    - src/lib/domain/sms.ts
  modified: []

key-decisions:
  - "Check balance BEFORE sending (pre-check), then deduct actual cost from Onurix response after send"
  - "Onurix API uses /sms/send (form-urlencoded) and /messages-state (GET) - confirmed live-tested endpoints"
  - "SMS_PRICE_COP = 97 per segment, billed by Onurix credits (actual segments used)"
  - "provider_message_id nullable (renamed from twilio_sid) to support both providers"

patterns-established:
  - "src/lib/sms/ module: types, constants, utils, client (provider-specific)"
  - "Domain sendSMS: validate phone -> check window -> check balance -> send -> log -> deduct -> emit Inngest"

# Metrics
duration: 8min
completed: 2026-03-16
---

# SMS Module Plan 01: Foundation Summary

**Onurix SMS foundation with atomic balance RPC, domain sendSMS function, and sms_messages table migration from Twilio**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T21:06:22Z
- **Completed:** 2026-03-16T21:14:00Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments
- Database migration: sms_workspace_config, sms_balance_transactions, sms_messages migration, deduct_sms_balance RPC, add_sms_balance RPC
- Onurix API client with correct live-tested endpoints (/sms/send form-urlencoded, /messages-state GET)
- Domain sendSMS function as single entry point: phone validation, time window check, balance pre-check, Onurix send, message logging, atomic deduction, Inngest delivery event emission

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration** - `b8c6727` (feat)
2. **Task 2: Onurix client, utilities, and domain sendSMS** - `5c17f54` (feat)

## Files Created/Modified
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql` - Complete DB foundation (tables, RPCs, column migration, RLS)
- `src/lib/sms/types.ts` - OnurixSendResponse, OnurixStatusItem, SmsStatus types
- `src/lib/sms/constants.ts` - SMS_PRICE_COP, segment lengths, ONURIX_BASE_URL
- `src/lib/sms/utils.ts` - formatColombianPhone, calculateSMSSegments, isWithinSMSWindow
- `src/lib/sms/client.ts` - sendOnurixSMS (POST form-urlencoded), checkOnurixStatus (GET)
- `src/lib/domain/sms.ts` - sendSMS domain function with full flow

## Decisions Made
- Pre-send balance check: estimate 1 segment cost, verify balance allows it, then send and deduct actual cost from Onurix response credits
- On insert failure after Onurix send: return success with smsMessageId='unknown' (SMS already sent, can't unsend)
- On balance deduction failure after send: log warning but don't fail (SMS already sent)
- Inngest delivery check event is fire-and-forget (non-fatal if emission fails)

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**Migration must be applied before deploy (Regla 5).** The migration file at `supabase/migrations/20260316100000_sms_onurix_foundation.sql` needs to be applied to production Supabase before any code using these tables is deployed.

**Environment variables needed:**
- `ONURIX_CLIENT_ID` - Onurix dashboard client ID
- `ONURIX_API_KEY` - Onurix dashboard API key

## Next Phase Readiness
- Foundation complete: all DB tables, RPCs, Onurix client, and domain function ready
- Next plan (02) can build Inngest delivery check function and automation action integration
- Migration must be applied to production before deploy

---
*Phase: sms-module*
*Completed: 2026-03-16*
