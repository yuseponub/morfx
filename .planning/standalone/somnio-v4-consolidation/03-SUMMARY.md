---
phase: somnio-v4-consolidation
plan: 03
subsystem: agents
tags: [somnio-v4, runner, observability, dead-code-removal, D-14, D-18, G-3, crash-recovery]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation Plan 01
    provides: "BASELINE.md con SUITE_CMD canónico (gate D-09) + criterio de equivalencia D-10"
provides:
  - "Runner sin branch fallback messages-sin-templates (D-14) — reemplazado por warning observable v4_messages_without_templates"
  - "Bug G-3 muerto: ningún texto jamás enviado se registra en sentMessageContents"
  - "Crash-recovery _v3:pendingUserMessage documentado in-situ (D-18) — conservado, no tocado"
  - "Comentario ~:435 corregido (ya no menciona el mapper de outcome borrado en Plan 02)"
affects: [Plan 04 (Wave 2 extracción del core), planes 05..12 de somnio-v4-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "warning-observable-en-lugar-de-fallback-inerte (pipeline_decision channel, NO LockEventLabel — Pitfall 10)"
    - "documentar-in-situ-código-legacy-funcional-con-condición-de-borrado (D-18)"

key-files:
  created:
    - .planning/standalone/somnio-v4-consolidation/03-SUMMARY.md
  modified:
    - src/lib/agents/engine/v4-production-runner.ts

key-decisions:
  - "D-14: el branch fallback :949-961 era inerte (el adapter parent dropea sends sin templates) → se reemplaza por warning observable en vez de borrarlo en silencio"
  - "El payload del warning trunca preview a 120 chars (T-cons-03 mitigate — sin teléfonos ni PII)"
  - "D-18: el crash-recovery _v3:pendingUserMessage se CONSERVA (funcional — edge interrupt con pending vacío + 0 sends); solo se documenta su porqué y su condición de borrado (muerte de v3 / D-38)"

patterns-established:
  - "Warning observable: cuando un branch defensivo no debería ejecutarse nunca, emitir telemetría visible (recordEvent + console.warn) en vez de un envío silenciosamente fallido"
  - "Comentario-bloque con condición de borrado para código legacy funcional, evitando que se borre 'por legacy' sin leer el porqué"

requirements-completed: [D-14, D-18]

# Metrics
duration: ~20min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 03: Limpieza del Runner (D-14 + D-18) Summary

**Borrado del branch fallback messages-sin-templates del v4-production-runner (mata el bug G-3 de log de texto jamás enviado) reemplazado por un warning observable `pipeline_decision:v4_messages_without_templates`, y documentación in-situ del crash-recovery `_v3:pendingUserMessage` (conservado, no tocado).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-10
- **Tasks:** 2
- **Files modified:** 1 (`src/lib/agents/engine/v4-production-runner.ts`)

## Accomplishments

- **D-14:** Eliminado el branch fallback `} else if (output.messages.length > 0) {` (antes `:949-961`) que enviaba `output.messages` cuando no había templates. Ese send nunca llegaba a nada (el messaging adapter parent dropea todo send sin templates desde el passthrough `rag:*`), y su `sentMessageContents.push(...output.messages)` registraba texto JAMÁS enviado (bug **G-3**). Reemplazado por `getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {...})` + `console.warn` — lo que antes fallaba en silencio ahora es VISIBLE.
- **G-3 muerto:** ya no existe ningún `push` a `sentMessageContents` de texto no enviado en ese path.
- Corregido el comentario `~:435` que aún mencionaba el mapper de outcome del agente (borrado en Plan 02) — ahora indica que el discriminator `interrupted_at_ckpt_*` lo produce hoy el path del slot resolver (`resolveLowSlot`).
- **D-18:** Documentado in-situ el crash-recovery `_v3:pendingUserMessage` con un comentario-bloque en el site de lectura/combine (por qué existe, orden crítico Pitfall 7, condición de borrado) + comentarios de una línea en los otros 2 sites (`wasInterruptedWithZeroSends` y rollback/save). **Cero cambio de lógica.**
- `messaging.ts` (parent adapter compartido con v3/godentist/recompra/pw) **NO fue tocado** (Regla 6).

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: D-14 — borra branch fallback + warning observable (mata G-3)** - `7bfbf188` (refactor)
2. **Task 2: D-18 — documenta in-situ el crash-recovery _v3:pendingUserMessage** - `e330585b` (docs)

## Files Created/Modified

- `src/lib/agents/engine/v4-production-runner.ts` - D-14 (borrado del branch fallback + warning observable + corrección comentario :435) y D-18 (comentarios del crash-recovery)
- `.planning/standalone/somnio-v4-consolidation/03-SUMMARY.md` - este summary

## Decisions Made

- **D-14 — warning en lugar de borrado silencioso:** el branch era inerte pero borrarlo a secas dejaría sin observabilidad el caso (improbable) de que `output.messages` llegue sin templates. Se emite por el canal `pipeline_decision` (NO `LockEventLabel` — es evento del pipeline, no del lock, Pitfall 10).
- **Redacción del payload del warning:** `preview` truncado a 120 chars (patrón de redaction del proyecto; T-cons-03 mitigate — sin teléfonos ni datos de contacto).
- **D-18 — conservar, no borrar:** el crash-recovery es funcional (edge de interrupt con pending-list Redis vacía y 0 sends). Se documenta su porqué y su condición de borrado (muerte de v3 / D-38 / cosecha S-7) para que nadie lo elimine "por legacy".

## Deviations from Plan

None - plan executed exactly as written.

(Nota: el plan pedía actualizar el comentario `~:435` y evitar dejar `mapOutcomeToAgentOutput` literal en el archivo. La primera redacción del comentario corregido aún incluía el token literal `mapOutcomeToAgentOutput`, lo que rompía el acceptance criterion `grep -c "mapOutcomeToAgentOutput" = 0`; se reescribió a "el antiguo mapper de outcome del agente fue borrado en Plan 02" antes de commitear. Esto es parte de la ejecución de la tarea, no una desviación del plan.)

## Issues Encountered

- El plan citaba 2 sites para D-18 además del site de lectura/combine, pero el grep mostró 2 sites de asignación `wasInterruptedWithZeroSends = true` (lock-path y fail-open path). Se añadió el comentario de una línea en el primer site (lock-path) y en el bloque rollback/save, satisfaciendo `grep -c "D-18" >= 3` sin tocar lógica.

## Verification

- **D-09 (gate por commit):** `npx tsc --noEmit` exit 0 + SUITE_CMD `348 passed | 7 skipped | 0 failed` tras cada task — idéntico al baseline del Plan 01.
- **Acceptance Task 1:**
  - `grep -c "v4_messages_without_templates"` = **1** ✓
  - `grep -c "mapOutcomeToAgentOutput"` = **0** ✓
  - Ningún `send` de `output.messages` sin templates sobrevive (los 2 sites restantes son `messageCount` del evento `agent_routed` y el return payload) ✓
  - `messaging.ts` ausente del diff ✓
- **Acceptance Task 2:**
  - `grep -c "D-18"` = **3** ✓
  - `grep -c "Pitfall 7"` = **2** (≥1) ✓
  - `git diff -w` del task = solo líneas de comentario añadidas (cero código modificado) ✓
- **Plan-level (D-11 + Regla 6):** `git diff --name-only <base>..HEAD -- src/` = solo `src/lib/agents/engine/v4-production-runner.ts`; `messaging.ts` y `v3-production-runner.ts` ausentes del diff ✓

## Next Phase Readiness

- El runner queda limpio del branch muerto ANTES de la extracción del core (Wave 2 / Plan 04): el core nunca contendrá la rama fallback ni el `sentMessageContents.push` de G-3.
- El warning `v4_messages_without_templates` viajará al core con el send-prep en W2 (Pitfall 10).
- El crash-recovery `_v3:pendingUserMessage` queda documentado con su ordering constraint (Pitfall 7) — insumo directo para `drainPendingAndCombine()` del core (preservar el orden CKPT-0 drena ANTES del combine legacy).

## Self-Check: PASSED

- Archivo clave existe: `.planning/standalone/somnio-v4-consolidation/03-SUMMARY.md` ✓
- Commits verificados en git log: `7bfbf188` (Task 1), `e330585b` (Task 2) ✓
- 0 deletions inesperadas: solo el branch fallback intencional de D-14 ✓

---
*Phase: somnio-v4-consolidation*
*Plan: 03*
*Completed: 2026-06-10*
