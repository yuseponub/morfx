# CONTEXT — v4-hybrid-template-rag-turn

**Standalone #3** del [[somnio_v4_architecture_roadmap]] (tras #1 `somnio-v4-turn-ledger` ✅ + #2 `somnio-v4-crm-subloop` ✅, ambos SHIPPED + merged a main).
**Discuss-phase:** completo 2026-05-29 (orquestado a mano — `gsd-tools init` no descubre standalones).
**v4 status:** DORMANT en prod (0 workspaces) → Regla 6 satisfecha por construcción.
**Branch de integración:** `exec/debounce-v2-wave6` (ff a main). Baseline para diffs Regla 6 = HEAD del standalone al arrancar.

---

## Goal

Permitir que **un solo turno combine respuesta determinista (templates) + respuesta generativa (RAG)** cuando el mensaje del cliente tiene 2 intenciones con cobertura distinta. Eliminar la palanca binaria actual (escalar TODO al RAG vía return temprano, decidida por un solo intent) y reemplazarla por una **decisión de cobertura por-intent** que combina fuentes en el mismo turno.

Caso canónico: *"cuánto vale y lo puedo tomar si tengo apnea?"* → template(precio) + RAG(apnea), en un turno, sin que el RAG repita el precio ni el template invente sobre apnea.

## Por qué ahora (dependencias satisfechas)
- **#1 turn-ledger** (✅): contrato del ledger `atendido[]` — registro de qué se atendió por turno (la nota D-06 del turn-ledger anticipó que el híbrido agregaría lectura intra-turno).
- **#2 crm-subloop** (✅): CRM consolidado al sub-loop; el sub-loop ya es el lugar canónico de decisión+ejecución.

## Problema de fondo (verificado en código)

| Hecho | Evidencia (file:line) |
|------|------------------------|
| La escalación al sub-loop usa SOLO el primary | `somnio-v4-agent.ts:222-228` + `escalation.ts:49-64` (nunca mira `secondary`) |
| Return temprano excluyente: si el primary escala, response-track NUNCA corre | `somnio-v4-agent.ts:243-314` (`runSubLoop` + `return`) |
| `secondary` sin confidence propio; se apila su template sin medir cobertura | `comprehension-schema.ts:29-35` (un solo `intent_confidence`, del primary) + `response-track.ts:90-96` |
| `intent_confidence` lo auto-reporta Gemini en el mismo call, sin fórmula posterior | `comprehension.ts:84-89` + `comprehension-schema.ts:13,45` + `comprehension-prompt.ts:39-52` |
| El RAG produce 1 topic / 1 respuesta por invocación | `sub-loop/index.ts:266-583` (`topic_seleccionado`/`responseText` singulares) |
| El RAG recibe el `userMessage` crudo | `sub-loop/index.ts:276,376` |
| 2º threshold 0.70 hardcoded sobre `responseConfidence` (≠ threshold de comprehension en DB) | `sub-loop/index.ts:44` vs `platform_config.somnio_v4_low_confidence_threshold` |
| El RAG puede auto-decidir handoff → hoy marca todo el turno `requiresHuman` | `sub-loop/index.ts:415,428,472,496` |

## Decisiones LOCKED

| # | Decisión | Razón |
|---|----------|-------|
| **D-01** | **Confidence per-intent vía comprehension extendido (Opción A):** nuevos campos `secondary_confidence` (+reasoning) en el MISMO call de comprehension. | El modelo ya auto-reporta el del primary ahí; evita +1 round-trip. ⚠️ validar con smoke (riesgo fragilidad schema — lección `AI_NoOutputGeneratedError` RAG Plan 09). |
| **D-02** | **Matriz de 4 casos** sobre cobertura {primary, secondary}: cubierto+cubierto → template+template (ya hoy); cubierto+low → template+RAG; low+cubierto → RAG+template; low+low → RAG+RAG. | Generaliza la palanca binaria a per-intent. |
| **D-03** | **Solo el intent low escala.** Si solo el primary es low → RAG(primary)+template(secondary), NO ambos al RAG. | No desperdiciar un template válido ni meter riesgo de alucinación donde había respuesta enlatada. |
| **D-04** | **comprehension parte el mensaje:** emite `secondary_query` (sub-query segmentada del 2º intent) que se le pasa al RAG como su `userMessage`. | Resuelve H2 — el RAG no debe ver el mensaje entero o duplicaría la parte del template. La partición nace donde se ve el mensaje completo (comprehension). |
| **D-05** | **La respuesta del RAG entra como CORE** en el block-composer; composición igual que hoy. | Reusa la maquinaria de composición existente. |
| **D-06** | **Máximo 2 intents** (ya forzado por schema primary+secondary). >2 → se atienden los 2 principales. | Acota el alcance; el schema ya lo garantiza. |
| **D-07** | **Handoff PARCIAL:** si un intent escala a humano pero el otro tiene respuesta → manda lo resuelto + escala SOLO la parte no resuelta. | Mejor UX (el cliente recibe lo que sí se sabe). ⚠️ requiere mecanismo nuevo: mensaje enviado + flag handoff conviviendo (hoy `requiresHuman` es todo-el-turno). |
| **D-08** | **RAG+RAG = 2 invocaciones separadas** (una por sub-query). | Reusa el RAG actual (H1) sin reescritura a multi-topic. |
| **D-09** | **Mismo threshold** para primary y secondary (`platform_config.somnio_v4_low_confidence_threshold`). | Una sola perilla a calibrar. |
| **D-10** | **Sin feature flag.** | v4 DORMANT → Regla 6 ya aísla; patrón #1/#2. |
| **D-11** | **(Discretion) Orden de mensajes = orden de intents** (primary→secondary), composición CORE/COMPLEMENTARIA y delays normales, sea template o RAG. | Natural; ajustable en research si mejora coherencia. |

## Riesgos / lo más delicado (para research)
1. **Handoff parcial (D-07)** — mecanismo nuevo en el orquestador: hoy el flujo o responde o escala (binario). Hay que permitir "responde parte + escala parte" sin romper el ledger ni el lifecycle CRM (#2). Mayor riesgo de la fase.
2. **Reemplazo del return temprano** (`somnio-v4-agent.ts:243-314`) por un orquestador de "slots por intent" — sin romper los paths existentes (crm_mutation/cas_reject del sub-loop, guards R0/R1, CKPTs de interrupción, gate CRM #2).
3. **Fragilidad del schema extendido (D-01)** — añadir campos a un structured output ya causó `AI_NoOutputGeneratedError` en el RAG. Validar con smoke antes de confiar.
4. **Coherencia "una sola voz"** — template (tono fijo) + RAG (TONE_BASE) en el mismo turno no deben sentirse como dos remitentes ni contradecirse. Riesgo de calidad, se valida con smoke.
5. **Costo/latencia** — peor caso (ambos low, RAG+RAG) = 2 tooling + 2 generation + 2 compliance calls en un turno. Medir.
6. **Interacción con el gate CRM (#2)** y los CKPTs de interrupción (debounce-v2) en el nuevo flujo de slots.

## Restricción transversal (Regla 6)
v4 DORMANT → cambios v4-specific. NO tocar comportamiento de los 5 siblings (somnio-v3, godentist, godentist-fb-ig, somnio-recompra-v1, somnio-sales-v3-pw-confirmation). El plan DEBE incluir greps/diff de no-regresión contra el baseline del standalone (NO main — la rama está adelante con trabajo ajeno). Sandbox simula. Posible migración: ninguna prevista (los thresholds ya existen en `platform_config`); si surge → Regla 5.

## Canonical refs (file:line)
- Orquestador: `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (escalación 222-228, return temprano 243-314, response-track 493-501).
- Escalación: `src/lib/agents/somnio-v4/escalation.ts:49-64`.
- Comprehension: `comprehension.ts:84-89`, `comprehension-schema.ts:29-55`, `comprehension-prompt.ts:39-52`.
- Response-track: `response-track.ts:43-233` (secondary 90-96, block-composer 178-199).
- Sub-loop RAG: `sub-loop/index.ts` (runRagSubLoop 266-583, threshold 44, handoffs 415/428/472/496).
- Ledger (#1): `atendido[]` en turn_ledger_dims.

## Deferred ideas (NO en esta fase)
- 3+ intents (hoy máx 2 por schema).
- RAG multi-topic en una invocación (D-08 eligió 2 calls).
- Lectura intra-turno de turnos PREVIOS del ledger (la nota D-06 del turn-ledger) — solo si research muestra que el híbrido la necesita; el alcance actual es intra-mensaje (primary+secondary del mismo turno), no cross-turno.

## Next
`research-phase` (orquestar a mano): investigar el mecanismo de handoff parcial (D-07), el refactor del return temprano a slots, el patrón de extensión del schema de comprehension sin fragilidad, y la composición template+RAG. Luego `plan-phase`.
