# SUMMARY — debounce-v2-sandbox-integration

**Status:** SHIPPED
**Shipped date:** 2026-05-28
**Plans:** 5 (01-engine, 02-route, 03-debug-panel, 04-tests, 05-smoke-close)
**Waves:** 4 (W1=01; W2=02; W3=03‖04; W4=05) + serie de bug-fixes post-plan (esta sesión)
**Sibling:** debounce-v2-interrupt-reprocess (shipped 2026-05-26)
**Parent:** debounce-interruption-system-v2 (shipped 2026-05-26)

---

## What shipped

El path v4 del sandbox (`/sandbox` → `agentId='somnio-sales-v4'`) ahora ejercita el
MISMO sistema de interrupción (lock Redis + 8 checkpoints + eventos de observabilidad)
que producción WhatsApp. El engine envuelve con
`try { startHeartbeat; while(shouldRestart){ CKPT-0; agent; CKPT-6; for-msg CKPT-7.N }; sandbox-result write } finally { stopHeartbeat; releaseLockIfOwner }`.
El route hace discriminación HOLDER/FOLLOWER + collector wrap + respuesta NDJSON
streaming. La UI hilvana el `sandboxLockSessionId` por tab + maneja el deferred del
FOLLOWER vía long-poll. La pestaña Interruption del debug-panel consume el
conversation_id real.

Durante los smokes se descubrieron y arreglaron bugs que los Plans 01-04 no
contemplaban (loop infinito Path A, "hola" fantasma, re-saludo Path B, drop del
mensaje que interrumpe). Varios eran **latentes en producción** — se arreglaron en
ambos lados, espejando el mecanismo.

## Decisiones honradas

D-01..D-15 verdes (ver LEARNINGS §Decisiones honradas + per-plan SUMMARYs).
**Cambio de comportamiento (decisión usuario 2026-05-28):** Path B ya NO difiere el
mensaje que interrumpe — lo reprocesa en el mismo lambda (descarta el resto de msg1,
contesta el mensaje nuevo limpio, sin re-saludar ni re-enviar). El mensaje que
interrumpe NUNCA se dropea.

## Cierra parent D-19 Phase 4

El parent (`debounce-interruption-system-v2`) difirió D-19 Phase 4 (sandbox visual
smoke) "explícitamente a este standalone". Este standalone lo entrega (S1/S2/S3 PASS).

Parent D-19 Phase 3 (Vercel preview + WhatsApp real) sigue diferido a la activación
per-workspace de v4.

## v4 production status

DORMANT. 0 workspaces con `conversational_agent_id='somnio-sales-v4'`. Activación
per-workspace vía SQL (un UPDATE, sin migración, sin flag). Este standalone NO cambia
el estado de activación. El mecanismo de interrupción ya está completo y correcto en
producción; el path RAG-generativo de envío queda pendiente del standalone
`somnio-v4-rag-generative`.

## Manual smoke results

Ver `SMOKE-RESULTS.md` (commit independiente per BLOCKER 3).
- S1 (happy): ✅ PASS
- S2 (Path A combo): ✅ PASS (Primary)
- S3 (Path B solo): ✅ PASS (Primary)

## Test suite

- `somnio-v4/__tests__/engine-v4-lock.test.ts` — 11 escenarios E1..E10 (+ fantasma + no-regreet)
- `engine/__tests__/v4-production-runner-restart.test.ts` — 6 (combine + fantasma)
- `engine/__tests__/v4-production-runner-pathb.test.ts` — 2 (Path B reprocess + acumulación) **NEW**
- `app/api/sandbox/process/__tests__/route-v4-lock.test.ts` — HOLDER/FOLLOWER + Regla 6
- `app/api/sandbox/lock-result/.../route.test.ts` — long-poll
- `interruption-system-v2/__tests__/` — lock/pending/checkpoints/restart-loop(S4 reescrito)/observability

77/77 verdes en los suites relacionados. Typecheck limpio.

## Documentación de arquitectura

NEW `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` — contrato de paridad
producción ↔ sandbox (no existía doc de arquitectura v4). Punteros en el header de
`engine-v4.ts` + `v4-production-runner.ts` + `.claude/rules/agent-scope.md`.

## Follow-ups

- Envío RAG en producción (standalone `somnio-v4-rag-generative`).
- Fallback de Gemini ante saturación (deuda P1-3, diferido a fallo en prod).
- D-19 Phase 3 (WhatsApp real) a la activación de v4.
- Doc robusto de arquitectura COMPLETA de v4 (no solo interrupción) — pendiente de
  auditoría en sesión dedicada.

---

**References:**
- Parent: `.planning/standalone/debounce-interruption-system-v2/SUMMARY.md`
- Sibling: `.planning/standalone/debounce-v2-interrupt-reprocess/SUMMARY.md`
- Plans: 01-PLAN.md … 05-PLAN.md + per-plan 01-SUMMARY.md … 04-SUMMARY.md
- Smoke: SMOKE-RESULTS.md (atomic commit #1)
- Patrones: LEARNINGS.md (este commit)
- Paridad: `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md`
