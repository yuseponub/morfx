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

### 3. Handoff R0/R1 explícito ("quiero un asesor") es SILENCIOSO (sin ack al cliente)
expected: Tras gap-fix A (commit `a6dbd7ee`), enviar "quiero hablar con un asesor" NO debe responder "un asesor te contactará"; el cliente queda en silencio y solo aparece la nota `⚠ HANDOFF SUGERIDO` en el inbox.
result: [pending re-test]

### 4. La nota inbox muestra la razón REAL del handoff de contenido (no el string genérico)
expected: Tras gap-fix B (commit `a6dbd7ee`), un handoff de contenido (antidepresivos/alcohol) debe mostrar la razón real (`escalation_trigger_match: ...` / `low_response_confidence` / `no_relevant_hit`), NO `No transition - response track handles informational`.
result: [pending re-test]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

### GAP-01 — Handoff R0/R1 enviaba ack al cliente (no silencioso) — RESUELTO
status: resolved
Detectado en UAT live 2026-06-14. El ack `rag:handoff_ack` ("un asesor te contactará") contradecía soft mode. Fix A (commit `a6dbd7ee`): handoff R0/R1 silencioso; el operador ve la señal vía nota inbox + observability.

### GAP-02 — Nota inbox mostraba razón genérica del sales-track en handoffs de contenido — RESUELTO
status: resolved
Detectado en UAT live 2026-06-14 (antidepresivos/alcohol mostraban "No transition - response track handles informational"). Root cause: el runner usaba `decisionInfo.reason` (genérico en partial-handoff) para la nota+gate. Fix B (commit `a6dbd7ee`): campo aditivo `V4AgentOutput.handoffReasonDetail` con `handoffSlots[].reason`; runner lo prefiere. También corrige el `gate` mal clasificado.

### GAP-03 — ¿Alcohol debe escalar a humano? — PENDIENTE (revisión KB, fuera de scope de esta fase)
status: open
"puedo tomarlo si tomo alcohol?" hizo handoff. Esta fase no decide *cuándo* se escala, solo lo hace visible. Tras GAP-02, la nota mostrará la razón real (probable `escalation_trigger_match` por depresores SNC, igual que antidepresivos — ver CONTEXT caso `993f9d07`). Decisión: re-probar en vivo, leer la razón real, y decidir si la regla `cuando_escalar` del KB de Somnio v4 es muy agresiva para alcohol. Tratar como ajuste de contenido/KB separado.
