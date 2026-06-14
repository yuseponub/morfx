---
status: partial
phase: v4-handoff-soft-signal
source: [VERIFICATION.md]
started: 2026-06-14
updated: 2026-06-14
---

## Current Test

[awaiting human testing — requires v4 activation per-workspace: `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`]

## Tests

### 1. Inbox note renders as `⚠ HANDOFF SUGERIDO — motivo: X` (not sent to customer)
expected: After activation (or sandbox), trigger a content-gap handoff (e.g. low_confidence) and confirm a `direction:'outbound'` note appears in the inbox conversation WITHOUT a corresponding WhatsApp send. Bot does NOT turn off; session stays active.
result: [pending]

### 2. Zombie ckpt_0 no longer shows `[ERROR AGENTE]` in inbox; observability event still present
expected: Send 2 rapid back-to-back messages to a v4 conversation to produce a zombie lambda; confirm NO `[ERROR AGENTE] V4_ZOMBIE_LAMBDA_EXIT` note in the inbox, but `zombie_lambda_exit` event still present in `agent_observability_events`.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
