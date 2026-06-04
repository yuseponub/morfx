---
status: partial
phase: 39-whatsapp-outbound-templates
source: [39-VERIFICATION.md]
started: 2026-06-04
updated: 2026-06-04
---

## Current Test

[awaiting time-gated confirmation — both items depend on external timing, not code]

## Tests

### 1. WA-09 — template-status webhook push
expected: When Meta approves `confirmacion_pedido_prueba` (currently "In review" in WhatsApp Manager), MorfX updates the local `whatsapp_templates` row to APPROVED automatically via webhook push — WITHOUT clicking "Resync".
prerequisite: The test number's WABA must be subscribed to the `message_templates` webhook field (Plan 06 operator action). If not subscribed, the push won't fire and the status stays PENDING until manual Resync.
result: [pending — Meta still reviewing the template as of 2026-06-04]

### 2. D-04 — 24h window block (inherited behavior)
expected: A free-text send outside the 24h customer-service window is blocked with "Ventana de 24h cerrada. Usa un template." on the meta_direct test number, identical to 360dialog.
result: [pending — cannot verify until >24h elapse since last inbound on the test conversation]

## Smoke items already PASSED live (2026-06-04, test number +57 310 5197782, meta_direct)

- WA-01 text send — PASS
- WA-02 outbound media (image + document) — PASS (+ optimistic-bubble flicker fix shipped)
- WA-06 inbound media rehost — PASS
- WA-07 read receipts — PASS
- WA-08 template create via Meta — PASS (confirmed "In review" in Meta WhatsApp Manager — ground truth)
- Regla 6 — Somnio + all 360dialog workspaces unaffected (no 131047) — PASS

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

Note: WA-04 (interactive button/list send) is NOT operator-testable — no compose UI exists
in MorfX for any provider. The Meta send primitive + clamping are covered by automated tests
(meta-whatsapp-sender.test.ts 3/3). A composer UI is parked as backlog Phase 999.1.
