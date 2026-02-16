---
phase: 20
plan: 03
subsystem: automations
tags: [twilio, sms, action-executor, webhook, builder-validation]
dependency_graph:
  requires: ["20-01"]
  provides: ["send_sms action handler", "Twilio status callback endpoint", "builder validation for send_sms"]
  affects: ["20-04", "20-05"]
tech_stack:
  added: []
  patterns: ["Twilio SDK fire-and-forget with async status callback", "form-encoded webhook parsing"]
key_files:
  created:
    - src/app/api/webhooks/twilio/status/route.ts
  modified:
    - src/lib/automations/action-executor.ts
    - src/lib/builder/validation.ts
decisions:
  - id: "20-03-01"
    decision: "SMS does not cascade — no triggers emitted after send"
    rationale: "SMS is a terminal action like WhatsApp sends; no CRM state change occurs"
  - id: "20-03-02"
    decision: "Status callback returns 200 even on processing errors"
    rationale: "Prevents Twilio from retrying failed callbacks, which would cause duplicate processing"
  - id: "20-03-03"
    decision: "Price stored as Math.abs since Twilio returns negative for outbound"
    rationale: "Consistent positive values for cost reporting"
metrics:
  duration: "~4 minutes"
  completed: "2026-02-16"
---

# Phase 20 Plan 03: Twilio SMS Action Summary

**One-liner:** executeSendSms action handler sends SMS via Twilio SDK, stores records in sms_messages, with async status callback for price/delivery updates.

## What Was Done

### Task 1: Implement executeSendSms in action executor
- Added `getTwilioConfig` and `createTwilioClient` imports from `@/lib/twilio/client`
- Added `case 'send_sms'` to exhaustive `executeByType` switch dispatcher
- Implemented `executeSendSms` function that:
  - Resolves recipient phone from explicit `to` param or `context.contactPhone`
  - Loads Twilio credentials via `getTwilioConfig(workspaceId)`
  - Builds status callback URL from `NEXT_PUBLIC_APP_URL`
  - Sends SMS via Twilio SDK `client.messages.create()`
  - Stores SMS record in `sms_messages` table with all tracking fields
  - Supports optional MMS `mediaUrl` parameter
- **Commit:** `8458915`

### Task 2: Twilio status callback endpoint + builder validation
- Created `POST /api/webhooks/twilio/status` endpoint that:
  - Parses Twilio form-encoded status callback data
  - Extracts MessageSid, MessageStatus, Price, PriceUnit, ErrorCode, ErrorMessage
  - Updates `sms_messages` by `twilio_sid` with final status and pricing
  - Returns 200 even on errors to prevent Twilio retries
- Added `send_sms: []` to `ACTION_TO_TRIGGER_MAP` in builder validation
  - Empty array = SMS produces no cascading triggers
  - Cycle detection now aware of send_sms as terminal action
- **Commit:** `d703906`

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 20-03-01 | SMS does not cascade | Terminal action like WhatsApp sends; no CRM state change |
| 20-03-02 | Status callback returns 200 on errors | Prevents Twilio retry loops on our processing failures |
| 20-03-03 | Price stored as Math.abs | Twilio returns negative for outbound; we want positive for reporting |

## Verification Results

- 0 TypeScript errors
- `executeSendSms` function exists and dispatches correctly
- `case 'send_sms'` in exhaustive switch — no more TS exhaustive check error
- Status callback endpoint exists at expected path
- `send_sms` in `ACTION_TO_TRIGGER_MAP` with empty trigger array

## Next Phase Readiness

- Plan 20-04 (SMS inbound handler) can build on this foundation
- The status callback pattern can be extended for inbound SMS webhooks
- Builder validation is complete for send_sms cycle detection
