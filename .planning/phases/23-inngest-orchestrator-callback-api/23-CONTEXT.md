# Phase 23: Inngest Orchestrator + Callback API - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect MorfX to the robot-coordinadora service: dispatch robot jobs via Inngest events, receive batch results via a callback API endpoint, and route all updates through the domain layer so automation triggers fire. No UI in this phase — backend orchestration and API only.

</domain>

<decisions>
## Implementation Decisions

### Callback flow
- Robot reports results as a **single batch callback** when the entire batch finishes (not per-order)
- No real-time progress needed — the Chat de Comandos (Phase 24) shows results after the batch completes
- Callback URL: Claude's discretion (passed in request payload vs env var)
- Callback authentication: Claude's discretion (shared secret vs job token)

### Domain updates on success
- When robot reports an order as successful:
  1. Update `tracking_number` with Coordinadora's # pedido
  2. Update `carrier` field with "COORDINADORA"
  3. Fire new trigger: `robot.coord.completed` per order
- The user configures automations on `robot.coord.completed` (move to pipeline stage, send WhatsApp, etc.)
- The trigger carries order data so automations can reference the tracking number, carrier, etc.

### Domain updates on failure
- When robot reports an order as failed: update `robot_job_item` status and error details only
- **No automation trigger for errors** (v3.0) — errors are visible in Chat de Comandos
- Error trigger deferred to future version if needed

### Batch summary format
- After batch completes, the callback data must support generating a rich summary (for Chat de Comandos, Phase 24):
  - Successful orders: # pedido, recipient name, address, city (CITY/DEPT format), phone, total amount
  - Failed orders: recipient name, address, city, phone, amount, error reason
  - Counts: success_count, error_count, total
- Reference format (from previous n8n+Slack robot):
  ```
  ✅ 4 pedido(s) creado(s):
  • #10107 - Elena Beltrán  📍 calle 49f  🏙️ MANIZALES (CDAS)  📱 3133477968  💰 $139.900
  ❌ Pedidos rechazados:
  • Delia Rojas  📍 Calle 10# 11 32  🏙️ BUENAVISTA (CORD)  ❌ No se encontró el municipio
  ```

### New trigger type: robot.coord.completed
- New automation trigger type specific to Coordinadora robot success
- Fires per-order (not per-batch) so automations run per order
- Context includes: order data, tracking_number, carrier, city, amount

### Retry & failure strategy
- **Fail-fast**: if robot service is unreachable, mark job as failed immediately (no retries from Inngest)
- Reason: avoid risk of duplicate order submissions on the portal. Safety over convenience.
- Operator retries manually from Chat de Comandos (Phase 24) — robot's idempotency protects against duplicates on manual retry

### Job states on batch results
- **Mixed results (some success, some error)**: job status = `completed` with success_count and error_count
- **All failed**: job status = `failed`
- **All success**: job status = `completed`
- The operator sees the breakdown in the batch summary

### Callback timeout
- **Proportional to batch size**: timeout = (N orders × 30 seconds) + 5 minutes margin
- If callback doesn't arrive within timeout, Inngest marks job as failed
- Operator can retry the failed orders manually

### Claude's Discretion
- Callback URL strategy (in payload vs env var)
- Callback authentication mechanism (shared secret vs per-job token)
- Exact Inngest function structure (steps, sleep patterns)
- HTTP client details for robot service calls
- Timeout implementation mechanism in Inngest
- Error message formatting for failed jobs

</decisions>

<specifics>
## Specific Ideas

- The batch summary format is modeled after the existing n8n+Slack robot output — operators are already familiar with this format
- The `robot.coord.completed` trigger enables the user to configure any downstream action (pipeline stage change, WhatsApp notification, etc.) without hardcoding behavior
- Retry from Chat de Comandos creates a new job with only the failed orders from the previous batch (uses `retryFailedItems` from Phase 21 domain)
- Robot's existing idempotency (jobId cache + per-order lock) protects against duplicates even on manual retry

</specifics>

<deferred>
## Deferred Ideas

- `robot.coord.failed` trigger for automation on errors — future version if operators need automated error handling
- Real-time per-order progress via Supabase Realtime — decided not needed for v3.0, batch result is sufficient
- Inngest retry with backoff — deferred in favor of fail-fast to avoid duplicate risk (can revisit once idempotency is battle-tested)

</deferred>

---

*Phase: 23-inngest-orchestrator-callback-api*
*Context gathered: 2026-02-20*
