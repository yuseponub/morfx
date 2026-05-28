# SMOKE-RESULTS — debounce-v2-sandbox-integration

**Date:** 2026-05-28
**Tester:** usuario (Jose)
**Environment:** Vercel Production (v4 DORMANT — `/sandbox` con `agentId='somnio-sales-v4'`)
**Build:** `f6178081` (post bug-fix series 47152c28 → f6178081)

> **Nota de contexto:** los smokes se ejecutaron DESPUÉS de una serie de fixes
> descubiertos durante esta sesión (no contemplados en los Plans 01-04 originales):
> loop infinito Path A, "hola" fantasma duplicado, re-saludo en Path B, y el
> reproceso Path B (sandbox + producción). Los verdicts abajo reflejan el
> comportamiento FINAL post-fix, validado a mano por el usuario.

---

## S1: Happy path (1 msg, sin interrupción)

**Steps:** `/sandbox` → seleccionar `somnio-sales-v4` → enviar "hola" → esperar respuesta → pestaña Interruption.
**Resultado:** el bot responde normal; la pestaña Interruption muestra `lock_acquired` + `lock_released_normal`, sin eventos de restart ni follower.
**Verdict:** ✅ PASS
**Notas:** durante una corrida apareció un fallo transitorio de Gemini ("high demand" → `AI_RetryError`) — NO es bug del sistema de interrupción; es saturación del proveedor. Documentado como deuda P1-3 en `docs/analysis/04-estado-actual-plataforma.md`. Reintentar el turno resuelve.

---

## S2: Path A combo (msg1 + msg2 antes de que el bot envíe nada)

**Steps:** enviar "hola", e inmediatamente (antes del primer mensaje del bot) enviar un segundo mensaje.
**Substitution method:** Primary (timing real con el delay simulado del engine que abre la ventana de interrupción).
**Resultado:** el bot responde UNA sola vez con la respuesta combinada de ambos mensajes; sin "hola" duplicado en el combine.
**Interruption tab:** `lock_acquired` (msg1) → `lock_acquire_failed_follower` + `interrupt_written` (msg2) → `msg_aborted_path_a_combined` + `pending_list_combined` con `restart_iteration: 1` → `lock_released_normal`. El FOLLOWER mostró nota breve "se combinará" y resolvió con la respuesta combinada.
**Verdict:** ✅ PASS
**Notas:** dos bugs encontrados y arreglados antes de este PASS — (1) loop infinito por no borrar la interrupt key tras drenar (commit 47152c28); (2) "hola" fantasma porque el combine incluía la entrada propia del holder (commit 73eb0762, `dropOwnEntry`).

---

## S3: Path B solo (msg1 envió ≥1 template, msg2 mid-stream)

**Steps:** enviar "hola" → esperar a que aparezca el PRIMER mensaje del bot → enviar "que precio".
**Resultado:** el primer mensaje queda visible; el resto de la respuesta de msg1 se descarta; el bot contesta el mensaje nuevo ("que precio") limpio, SIN re-saludar.
**Interruption tab:** `lock_acquired` → `msg_aborted_path_b_solo` (CKPT-7.N) → `pending_list_combined` (reproceso) → `lock_released_normal`.
**Verdict:** ✅ PASS
**Notas:** comportamiento CAMBIADO respecto al diseño original del Plan (que difería msg2 al próximo turno). Decisión del usuario 2026-05-28: el mensaje que interrumpe NUNCA se dropea — se contesta en el mismo turno. Dos bugs arreglados antes del PASS: (1) Path B descartaba el mensaje nuevo (commit e1af015b); (2) re-saludo porque el reproceso no arrastraba el estado (commit 73eb0762, `carryState`).

---

## Overall verdict

| Escenario | Verdict | Método |
|---|---|---|
| S1 happy | ✅ PASS | — |
| S2 Path A combo | ✅ PASS | Primary |
| S3 Path B solo | ✅ PASS | Primary |

**Standalone status:** SHIPPED

## Follow-ups identificados

- **Envío RAG en producción:** el runner de prod solo envía por el path de `templates`; la respuesta RAG-generativa (`output.messages` sin templates) aún no se envía — gap de wiring del standalone `somnio-v4-rag-generative` (en progreso), NO del sistema de interrupción.
- **Fallback de Gemini ante saturación:** deuda P1-3 documentada — fallback a Haiku/GPT-4o-mini cuando Gemini esté saturado. Diferido hasta que falle en prod.
- **D-19 Phase 3 (parent):** smoke con WhatsApp real, diferido a la activación per-workspace de v4.
