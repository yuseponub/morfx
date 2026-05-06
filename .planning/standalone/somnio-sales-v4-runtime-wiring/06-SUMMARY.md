---
phase: somnio-sales-v4-runtime-wiring
plan: 06
subsystem: somnio-v4 runtime / no-repetition filter
tags: [v4-runtime-wiring, no-repetition-filter, env-flag, gate]
wave: 4
status: complete
date_completed: 2026-05-06
duration_estimate: ~15min
requires:
  - Plan 01 shipped (V4ProductionRunner clonado con flag legacy USE_NO_REPETITION)
  - Plan 04 shipped (webhook-processor v4 branch dormant)
  - Plan 05 shipped (model swap comprehension/sub-loop/nunca-decir)
provides:
  - "V4ProductionRunner gate del NoRepetitionFilter cableado bajo USE_NO_REPETITION_V4 (D-16)"
  - "Flag separado de v3 (toggle independiente per-agente)"
  - "Default OFF — cero impacto a v4 prod hasta que futuro standalone decida activar"
affects:
  - src/lib/agents/engine/v4-production-runner.ts (1 file modified, 9 inserts / 6 deletes)
tech-stack:
  added: []
  patterns:
    - "Gated env-var flag per-agente (D-16): v3 con USE_NO_REPETITION (legacy), v4 con USE_NO_REPETITION_V4 separado. Toggle independiente."
    - "Fail-open try/catch (preserved verbatim de v3 línea 322): si filter crashea → templatesToSend = output.templates (sender envía bloque completo)."
    - "Coverage estructural D-17: filter posicionado inmediatamente antes de messaging.send sobre output.templates (que incluye response-track + sub-loop template_match merged)."
key-files:
  created:
    - .planning/standalone/somnio-sales-v4-runtime-wiring/06-SUMMARY.md
  modified:
    - "src/lib/agents/engine/v4-production-runner.ts (lines 23-25 file header comment, lines 269-273 inline comment + gate literal)"
decisions:
  - D-3 honored: NoRepetitionFilter wired en v4 (gated por flag) aunque hoy esté OFF en prod
  - D-16 honored: flag separado USE_NO_REPETITION_V4 (no compartido con v3 legacy USE_NO_REPETITION)
  - D-17 honored: filter aplica a TODOS los templates output (response-track + sub-loop template_match merged en output.templates antes de messaging.send)
  - D-18 honored: modelo del filter NO se cambia en este Plan (deferred — el filter shared no-repetition-filter.ts queda intocado)
  - Regla 6 honored: cero edits a v3-production-runner.ts (sigue con flag legacy)
  - Regla 6 honored: cero edits a no-repetition-filter.ts / outbound-registry.ts / minifrase-generator.ts (shared filters)
metrics:
  commits: 2 (Task 1 = 12abe91, SUMMARY = pending)
  lines_added: 9
  lines_deleted: 6
  files_created: 0 (de codigo)
  files_modified: 1 (v4-production-runner.ts)
---

# Phase somnio-sales-v4-runtime-wiring Plan 06: USE_NO_REPETITION_V4 flag separado — Summary

Wave 4 cableado del flag aislado para el NoRepetitionFilter en `V4ProductionRunner`. Refactor mecánico: literal `process.env.USE_NO_REPETITION === 'true'` → `process.env.USE_NO_REPETITION_V4 === 'true'` en una sola línea del runner. Cero cambios a la lógica del filter (shared) ni al gate try/catch fail-open. v3 sigue con flag legacy (Regla 6). Gate default OFF — Plan 07/08 deploy con cero impacto a prod.

## Resultado por Task

### Task 1: Refactor flag legacy USE_NO_REPETITION → USE_NO_REPETITION_V4 (D-16) ✓

**Estado: COMMITTED en `12abe91`.**

#### Diff exacto aplicado

**Línea 269-272 (antes — clonado verbatim de v3 en Plan 01 Task 3):**

```typescript
        // No-repetition filter (if USE_NO_REPETITION=true)
        // NOTE: Plan 06 (D-16) refactoriza este flag a `USE_NO_REPETITION_V4`. Por ahora
        // se preserva el flag legacy para mantener clone fidelity con v3.
        if (process.env.USE_NO_REPETITION === 'true') {
```

**Línea 269-273 (después — Plan 06):**

```typescript
        // No-repetition filter (if USE_NO_REPETITION_V4=true)
        // D-16: flag separado v4 (no compartir con v3 prod). Default OFF — activa SOLO
        //       cuando futuro standalone decida turn ON el filter en v4. Plan 06.
        // D-17: filter aplica a TODOS los templates emitidos en el turn (response-track +
        //       outputs sub-loop template_match merged en `output.templates`).
        if (process.env.USE_NO_REPETITION_V4 === 'true') {
```

**Líneas 23-25 (file header comment — actualizado para reflejar Plan 06 done):**

Antes:
```
 * - NoRepetitionFilter wiring con flag `USE_NO_REPETITION` (Plan 06 lo refactoriza
 *   a `USE_NO_REPETITION_V4` — D-16).
```

Después:
```
 * - NoRepetitionFilter wiring con flag `USE_NO_REPETITION_V4` (D-16 — flag separado
 *   de v3 prod, default OFF). Filter aplica a TODOS los templates emitidos en el turn
 *   (response-track + sub-loop template_match merged en `output.templates`) — D-17.
```

#### Coverage check (D-17)

El bloque del filter sigue posicionado en `v4-production-runner.ts:266-317` — **inmediatamente antes de `this.adapters.messaging.send(...)`** en línea 320. Esto significa que opera sobre `templatesToSend = output.templates` que es el **único punto de emisión** de templates del agente v4:

`somnio-v4-agent.ts:507` retorna `templates: responseResult.messages` donde `responseResult` es el output combinado de:
- response-track (templates resueltos por intent del state-machine)
- sub-loop `template_match` (templates resueltos por sub-loop con outcome `template`)

Ambos paths convergen en el mismo `responseResult.messages` antes de salir del agente (verificable en `somnio-v4-agent.ts:704` y siguientes). Por tanto, posicionar el filter sobre `output.templates` cubre AMBOS orígenes — la dedupe es por contenido enviado al cliente, no por origen (D-17 satisfecho estructuralmente sin extender coverage).

#### try/catch fail-open preservado verbatim

```typescript
          } catch (noRepError) {
            console.error('[V4-RUNNER] No-rep filter crashed, sending full block (fail-open):', noRepError)
            templatesToSend = output.templates
          }
```

Patrón idéntico a `v3-production-runner.ts:321-324` con prefijo `[V3-RUNNER]` → `[V4-RUNNER]`. Si el filter (NoRepetitionFilter / buildOutboundRegistry / generateMinifrases / filterBlock) crashea por cualquier razón → `templatesToSend` revierte al bloque completo `output.templates` y el sender lo envía sin filtrar. Cero risk de message-loss por filter crash.

#### D-18 honored: modelo del filter NO se cambia

`src/lib/agents/somnio/no-repetition-filter.ts` queda intocado en este Plan. El filter tiene su modelo hardcoded internamente (probablemente Sonnet o Haiku según commit history del módulo somnio v1). Cuando el flag `USE_NO_REPETITION_V4=true` se active en producción (futuro standalone), se decide el swap del modelo del filter en ESE momento — porque hoy con flag OFF el modelo es deuda menor.

Verificable: `git diff src/lib/agents/somnio/no-repetition-filter.ts src/lib/agents/somnio/outbound-registry.ts src/lib/agents/somnio/minifrase-generator.ts` retorna empty.

#### Verification gates (todos pass)

| Gate | Resultado |
|---|---|
| 1. `grep -c "USE_NO_REPETITION_V4" v4-production-runner.ts` | 3 (≥1 ✓) — 1 en file header comment, 1 en inline comment, 1 en gate literal |
| 2. `grep -E "process\.env\.USE_NO_REPETITION\b" v4-production-runner.ts \| grep -v "_V4"` | empty (no legacy refs) ✓ |
| 3. Try/catch fail-open preservado | OK — `templatesToSend = output.templates` en catch ✓ |
| 4. `git diff --name-only HEAD~1 HEAD` solo `v4-production-runner.ts` | OK ✓ |
| 5. `git diff src/lib/agents/engine/v3-production-runner.ts` | empty (Regla 6) ✓ |
| 6. `git diff src/lib/agents/somnio/no-repetition-filter.ts outbound-registry.ts minifrase-generator.ts` | empty (D-18) ✓ |
| 7. `npx tsc --noEmit 2>&1 \| grep "v4-production-runner" \| wc -l` | 0 errors ✓ |
| 8. Env var sanity: unset → `false`, set='true' → `true` | OK ✓ |
| Bonus: v3 sigue con flag legacy `USE_NO_REPETITION` | `grep "process.env.USE_NO_REPETITION === 'true'" v3-production-runner.ts` → 1 match ✓ |

#### Cero side-effect runtime

El gate `process.env.USE_NO_REPETITION_V4 === 'true'` con la env var unset evalúa `false` → bloque skipea → `templatesToSend = output.templates` (idéntico a comportamiento previo con flag legacy off). Plan 08 deploy es seguro: a menos que alguien explícitamente setee `USE_NO_REPETITION_V4=true` en Vercel env vars, el filter no corre.

## Deviations from Plan

None — plan executed exactly as written. La sustitución textual fue trivial (un solo if statement + 2 comment blocks adyacentes para reflejar el estado correcto post-Plan 06). El comentario header del archivo (líneas 23-25) que decía "Plan 06 lo refactoriza" se actualizó para describir el estado final (D-16 + D-17 honored) — esto NO es deviation, es housekeeping del comentario que documenta el archivo y que hubiera quedado incoherente si solo se cambiara el literal del gate.

## Threat Flags

Ninguno. El cambio es puramente un rename de env var en un gate condicional. Cero nueva surface de seguridad, cero nuevos endpoints, cero nuevas auth paths, cero schema changes. El filter sigue siendo el mismo módulo shared (no-repetition-filter.ts) que ya pasó threat-model en standalone padre original somnio v1.

## Known Stubs

Ninguno. El gate compila + funciona. El "stub" del flag OFF default es **intencional** (D-3 + D-18) — wired pero off hasta que futuro standalone active el filter en v4 con modelo swap decidido en ese momento.

## Próximo paso

Plan 07 (`07-PLAN.md`): smoke wave A — sandbox testing v4 con tráfico simulado. Casos: 5 overconfidence (RESUME-NOTES original) + sub-loop trigger + KB retrieval + dedupe Nivel 1 + order creation flow. Post-aprobación operador → Plan 08 atomic flip via `routing_rules` (smoke wave B = prod con tráfico real).

## Self-Check

**Status: PASSED**

Verificaciones ejecutadas post-write:

1. `test -f src/lib/agents/engine/v4-production-runner.ts` → FOUND
2. `git log --oneline -1` muestra commit `12abe91` → FOUND
3. `grep -c "USE_NO_REPETITION_V4" v4-production-runner.ts` → 3 (≥1 expected) ✓
4. `grep -E "process\.env\.USE_NO_REPETITION\b" v4-production-runner.ts | grep -v "_V4"` → empty ✓
5. `git diff src/lib/agents/engine/v3-production-runner.ts` → empty (Regla 6) ✓
6. `git diff src/lib/agents/somnio/no-repetition-filter.ts outbound-registry.ts minifrase-generator.ts` → empty (D-18) ✓
7. `npx tsc --noEmit 2>&1 | grep "v4-production-runner"` → 0 errors ✓
8. Env var sanity: `unset → false`, `set='true' → true` ✓
9. Catch block `templatesToSend = output.templates` (fail-open) preservado ✓
10. Log prefix `[V4-RUNNER]` preservado de Plan 01 (no regresión a `[V3-RUNNER]`) ✓
