---
phase: v4-handoff-soft-signal
plan: 02
subsystem: agents
tags: [somnio-v4, handoff, inbox-note, soft-signal, webhook-processor]

requires:
  - phase: v4-handoff-soft-signal
    plan: 01
    provides: "soft-branch skeleton (result.handoffSuggested) + handoffSignal in EngineOutput"

provides:
  - "Inbox note '⚠ HANDOFF SUGERIDO — motivo: <reason>' inserted on v4 soft handoff (D-05)"
  - "direction:'outbound' — note visible in inbox, NOT sent to customer via WhatsApp"
  - "try/catch wrapping — note insert failure is non-blocking (turn completes normally)"
  - "Admin client supabase bypasses RLS — no silent 0-row risk"

affects:
  - v4-handoff-soft-signal-03
  - handoff-agent (future — operators will see inbox reason until agent exists)

tech-stack:
  added: []
  patterns:
    - "Inbox note insert: clone of [ERROR AGENTE] pattern (webhook-handler.ts:546-554) — direction:'outbound' + direct DB insert, NOT executeToolFromAgent"
    - "Non-blocking try/catch for inbox notes: failure logged as warn, turn unaffected"
    - "result.handoffSignal?.reason ?? 'unknown' — safe access with fallback for missing signal"

key-files:
  created: []
  modified:
    - src/lib/agents/production/webhook-processor.ts

key-decisions:
  - "D-05 implemented: '⚠ HANDOFF SUGERIDO — motivo: <reason>' — exact text per CONTEXT.md"
  - "direction:'outbound' — inbox note, never sent to customer (WhatsApp is out-of-scope for this insert)"
  - "Non-blocking: try/catch wraps the insert; warn on failure but do NOT abort turn"
  - "supabase = createAdminClient() already in scope at line 140 — no new import added (Regla 3 safe)"
  - "executeHandoff in HARD path (!handoffSuggested) left entirely untouched — Regla 6"

requirements-completed: []

duration: 15min
completed: 2026-06-14
---

# Phase v4-handoff-soft-signal Plan 02: Inbox note insert para handoff sugerido

**Operadores del inbox ahora ven la razon exacta por la que v4 sugiere handoff — nota interna direction:'outbound', no enviada al cliente.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-14T15:04:00Z
- **Completed:** 2026-06-14T20:17:00Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- Reemplazado el skeleton placeholder `logger.info('inbox note pending Plan 02')` con el insert real a la tabla `messages`
- Insert usa `direction:'outbound'`, `type:'text'`, `content:{body:'⚠ HANDOFF SUGERIDO — motivo: ${handoffReason}'}` (D-05 exacto)
- Insert envuelto en try/catch no-bloqueante: si falla, se loggea como warn y el turno continua normalmente
- Usa el cliente `supabase = createAdminClient()` ya en scope en linea 140 — bypass RLS, cero riesgo de 0-row silencioso
- `executeHandoff` en el HARD path (`!result.handoffSuggested`) permanece intacto e inalterado (Regla 6)

## Task Commits

1. **Task 1: Replace soft branch skeleton with inbox note insert** - `b01a7962` (feat)

## Files Created/Modified

- `src/lib/agents/production/webhook-processor.ts` — Reemplaza el bloque `logger.info(... 'inbox note pending Plan 02')` con insert real de nota de handoff en tabla messages (lineas 1113-1136)

## Deviations from Plan

None — plan ejecutado exactamente como escrito.

## Known Stubs

None — la nota de inbox ahora se inserta con contenido real. El SOFT path esta completo.
El HARD path (`executeHandoff`) sigue vivo para agentes existentes hasta que Plan 03 (zombie suppression) o hasta activacion manual de v4.

## Threat Flags

None — el campo `handoffReason` proviene de `result.handoffSignal?.reason` (output interno del agente somnio-v4), no de input del usuario. Sin riesgo de XSS (el inbox renderiza texto plano). El bloque T-hs-05 (DoS via insert failure) esta mitigado por el try/catch no-bloqueante.

## Self-Check

**Files exist:**
- `src/lib/agents/production/webhook-processor.ts` — FOUND (HANDOFF SUGERIDO at line 1125)

**Commits exist:**
- `b01a7962` — FOUND (Task 1)

**Verification gates:**
- `grep -n "HANDOFF SUGERIDO" webhook-processor.ts` → 1 match (line 1125, inside result.handoffSuggested branch)
- `grep -n "direction.*outbound" webhook-processor.ts` → line 1123 inside the soft branch
- `grep -c "executeHandoff" webhook-processor.ts` → 2 (import + call, both in the HARD path at !handoffSuggested)
- `tsc --noEmit` → exit code 0
- 104/104 unit tests pass (9 test files, non-smoke)

## Self-Check: PASSED
