---
status: diagnosed
phase: 30-message-classification-silence-timer
source: [30-01-SUMMARY.md, 30-02-SUMMARY.md, 30-03-SUMMARY.md]
started: 2026-02-26T20:00:00Z
updated: 2026-02-26T20:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. SILENCIOSO - Acknowledgment sin respuesta
expected: En sandbox, enviar "ok" o "jaja" en estado inicial (bienvenida/conversacion). El bot NO responde. Classify tab muestra SILENCIOSO.
result: issue
reported: "jaja manda a HANDOFF en vez de SILENCIOSO. IntentDetector clasifica jaja como fallback, Rule 1 (HANDOFF_INTENTS) dispara antes de Rule 2 (acknowledgment check). Hay que mover Rule 2 antes de Rule 1."
severity: major

### 2. HANDOFF - Intent de escape
expected: Enviar "quiero hablar con un asesor" o "tengo una queja". El bot responde con mensaje de handoff ("Regalame 1 min" o similar) y el modo cambia a handoff.
result: pass

### 3. RESPONDIBLE - Pregunta normal
expected: Enviar una pregunta como "que productos tienen?" o "cuanto cuesta?". El bot responde normalmente con templates. Classify tab muestra RESPONDIBLE.
result: pass

### 4. RESPONDIBLE en modo confirmatorio
expected: Llegar a resumen o collecting_data (avanzar la conversacion hasta datos). Enviar "ok". El bot DEBE responder (no silenciarlo). Classify tab muestra RESPONDIBLE.
result: pass

### 5. Timer retoma 90s (produccion)
expected: En produccion (WhatsApp real con Inngest activo), enviar un acknowledgment (clasificado SILENCIOSO). Esperar ~90s sin escribir. El bot envia un mensaje de retoma calido redirigiendo a la venta.
result: skipped
reason: Bloqueado por bug del test 1 — acknowledgments disparan HANDOFF, no llegan a SILENCIOSO ni activan el timer

### 6. Timer se cancela con nuevo mensaje
expected: En produccion, enviar acknowledgment (SILENCIOSO). Antes de 90s, enviar otro mensaje. El timer se cancela y no llega mensaje de retoma.
result: skipped
reason: Bloqueado por bug del test 1 — misma causa que test 5

## Summary

total: 6
passed: 3
issues: 1
pending: 0
skipped: 2

## Gaps

- truth: "Acknowledgments (jaja, ok, etc) en modo no-confirmatorio deben ser SILENCIOSO"
  status: failed
  reason: "User reported: jaja manda a HANDOFF. IntentDetector clasifica como fallback, Rule 1 dispara antes de Rule 2."
  severity: major
  test: 1
  root_cause: "Rule order in classifyMessage(): HANDOFF_INTENTS check (Rule 1) runs before ACKNOWLEDGMENT_PATTERNS check (Rule 2). When IntentDetector classifies acknowledgments as fallback, Rule 1 catches them first."
  artifacts:
    - path: "src/lib/agents/somnio/message-category-classifier.ts"
      issue: "Rule 2 must execute before Rule 1 for acknowledgment patterns"
  missing:
    - "Move acknowledgment check (Rule 2) before HANDOFF_INTENTS check (Rule 1) in classifyMessage()"
