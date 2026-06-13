---
phase: v4-observability-completeness
plan: 04
subsystem: v4 production runner — clean error message al chat del operador
tags: [observability, somnio-v4, runner, error-path, regla-6, D-01]
requires: [01, 02]
provides:
  - "buildCleanErrorMessage(output): motivo REAL del error (output.errorMessage) redactado, sin stack y con stage al error.message del chat — cierra la mitad-chat de D-01"
  - "Una sola fuente: el fix de mapResult alimenta chat + webhook (ambos leen error.message vía `[ERROR AGENTE] {code}: {message}`)"
affects:
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts
tech-stack:
  added: []
  patterns:
    - "función pura a nivel módulo exportada (buildCleanErrorMessage) — testeable directo sin mockear TurnResult completo"
    - "strip stack vía `raw.split(' :: ')[0]` — el errorMessage es `errMsg :: errStack` (contrato Plan 02)"
    - "PII-safe: bodyTruncate(firstSegment, 150) — el stack NUNCA va al chat (vive en engine_error.stackFrames de observabilidad)"
key-files:
  created:
    - src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts
  modified:
    - src/lib/agents/engine/v4-production-runner.ts
decisions:
  - "buildCleanErrorMessage exportada como función pura a nivel módulo (vs método estático) — el plan la recomienda 'preferir exportar' para testear directo sin construir un TurnResult completed mockeado"
  - "RUNNER-ONLY: el sandbox engine-v4.ts tiene su propio mapeo de error — paridad de error limpio en sandbox es follow-up DEFERIDO (no en este plan, alineado con el objective)"
metrics:
  duration: "~10 min"
  completed: "2026-06-13"
  tasks: 1
  files: 2
---

# Phase v4-observability-completeness Plan 04: Runner clean-error message Summary

Cierra la mitad-chat de D-01 ("una sola fuente"): el chat del operador ya NO muestra el genérico `[ERROR AGENTE] V4_AGENT_ERROR: V4 agent processing failed`, ahora muestra `[ERROR AGENTE] V4_AGENT_ERROR: V4_AGENT_ERROR @ {stage}: {motivo limpio}` con el motivo REAL del error (sin stack, PII-truncado). El `code V4_AGENT_ERROR` se mantiene IDÉNTICO (Pitfall 4 / Regla 6).

## Qué se construyó

**Task 1 — buildCleanErrorMessage + fix de mapResult :597-600 (D-01, RUNNER-ONLY)**

- Import añadido: `import { bodyTruncate } from '@/lib/agents/shared/crm-mutation-tools/helpers'`.
- Helper puro exportado `buildCleanErrorMessage(output: V4AgentOutput): string`:
  - `raw = output.errorMessage ?? 'V4 agent processing failed'` (fallback sin reventar).
  - `firstSegment = raw.split(' :: ')[0]` — strip del stack (Pitfall 5; el errorMessage es `errMsg :: errStack` por contrato Plan 02).
  - `reason = bodyTruncate(firstSegment, 150)` — PII-safe (~150 chars).
  - Formato: `V4_AGENT_ERROR @ {stage}: {reason}` cuando hay `errorStage`; `V4_AGENT_ERROR: {reason}` cuando no (sin ` @ undefined`).
- Reemplazado el bloque hardcodeado `:597-600` en `mapResult` (rama `kind === 'completed'`):
  ```typescript
  error: output.success ? undefined : {
    code: 'V4_AGENT_ERROR',                      // UNCHANGED — Pitfall 4 / Regla 6
    message: buildCleanErrorMessage(output),     // D-01: motivo real, limpio, SIN stack
  },
  ```
- Suite nueva `v4-runner-error-message.test.ts` (6 tests) que prueba la función pura directa: stage incluido + stack strippeado, sin frames (` | `, `at `, `.ts:`), code siempre arranca `V4_AGENT_ERROR` (Pitfall 4), fallbacks sin stage / sin reason, y truncado a ~150.

## Formato del mensaje del chat (cierre del agujero negro)

El chat del operador es `[ERROR AGENTE] {code}: {message}` (webhook-processor:665-668, truncado a 500). Al mejorar `message` se mejora chat + webhook de un solo cambio — **una sola fuente** (D-01). Las 2 superficies del agujero negro ahora muestran el motivo real:

| Superficie | Antes | Ahora |
|------------|-------|-------|
| Chat del operador | `V4_AGENT_ERROR: V4 agent processing failed` | `V4_AGENT_ERROR: V4_AGENT_ERROR @ crm-gate: boom reason` |
| Observabilidad (evento engine_error, Plan 02) | (ya emitía motivo real + stack) | sin cambio — el stack vive SOLO aquí |

El stack NUNCA llega al chat (Pitfall 5): vive solo en `engine_error.stackFrames` de la DB de observabilidad (Plan 02).

## RUNNER-ONLY — paridad sandbox DEFERIDA

El fix es exclusivo del runner de producción (`v4-production-runner.ts`). El sandbox engine (`engine-v4.ts`) tiene su propio mapeo de error. La paridad de error limpio en el sandbox es **follow-up deferible** — NO está en este plan (alineado con el objective y la nota del CLAUDE.md `INTERRUPTION-PARITY.md`: el mecanismo compartido vive en `core/`, pero el mapeo `TurnResult → EngineOutput` es por-adapter).

## Regla 6 — cero behavior change downstream

Solo cambia el string `message`. El `code: 'V4_AGENT_ERROR'` queda EXACTAMENTE igual (Pitfall 4); `success`, `messages`, `newMode`, `orderCreated`, `orderId`, `contactId` NO se tocan. Los consumidores downstream (webhook-processor, handoff) discriminan por `code`, no por `message` — comportamiento idéntico.

## Deviations from Plan

None — plan ejecutado exactamente como está escrito. La función se exportó (no método estático) tal como el plan recomienda ("preferir exportar la función pura").

## Verification results

- `npx vitest run src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts` → 6/6 PASS
- `npx tsc --noEmit` → exit 0
- Grep gates:
  - `grep -c "message: 'V4 agent processing failed'" v4-production-runner.ts` → 0 (hardcodeado eliminado del objeto error)
  - `grep -c "code: 'V4_AGENT_ERROR'"` → 1 (Pitfall 4 intacto)
  - `grep -c "buildCleanErrorMessage"` → 2 (definición + uso)
  - `grep -c "split(' :: ')"` → 1 (strip stack — Pitfall 5)
  - `git diff | grep '^+' | grep -c "createAdminClient\|@supabase/supabase-js"` → 0 (Regla 3)
- Sin deleciones en el commit; sin archivos src nuevos sin trackear (los untracked pre-existentes son out-of-scope).

## CHECKPOINT — push pendiente de autorización del operador

Este plan es `autonomous: false`; su Task 2 (checkpoint:human-verify) cierra el wave con `git push origin main` → deploy a Vercel producción. **El push NO se ejecutó** — requiere autorización explícita del operador (Regla 1). Pendiente: el operador autoriza el push y confirma el deploy verde en Vercel.

## Recordatorio (Regla 0 / CLAUDE.md)

Al cerrar el standalone, documentar `LEARNINGS.md` de `v4-observability-completeness` (bugs encontrados, patrones aprendidos del agujero negro de observabilidad v4).

## Self-Check: PASSED

- src/lib/agents/engine/v4-production-runner.ts (modificado) — FOUND
- src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts — FOUND
- Commit 635d6b00 — FOUND
