# v4-gate-confidence-fixes — Findings & Scope (pre-discuss)

**Fecha:** 2026-06-13
**Origen:** diagnóstico en vivo del agente `somnio-sales-v4` usando la observabilidad nueva (standalone `v4-observability-completeness`, shipped mismo día).
**Estado:** exploración completa, scope acordado, **pendiente `/gsd-discuss-phase`**.

---

## Turnos reales analizados (workspace Somnio `a3843b3f...`, cliente +57…9286)

Dos rondas de prueba, cada una = "Hola" + 2 mensajes seguidos (interrupt Path A combinó los 2):

### Ronda 1 — turn `c0f4b3c1-cbc6-4930-8e46-3c811a1cf042` (session `9e8e8f37`)
Mensajes: *"Lo puedo tomar si tomo alcohol?"* + *"Como se toma eso"*.
- Respondió `como_se_toma` (3 templates) ✅.
- Alcohol → sub-loop low_confidence: tooling 10.4s + generación 9.8s → `responseConfidence=0.6 < 0.7` → handoff silencioso.
- **Turno total 63s → lock TTL expiró → `V4_ZOMBIE_LAMBDA_EXIT` llegó al cliente.** Gap muerto de 31.8s post-handoff sin heartbeat (send-loop o suspensión Fluid Compute).

### Ronda 2 — turn `44204b79-4512-4785-9732-070cb96f4daf` (session `702c3e1c`)
Mensajes: *"Lo puedo tomar si tomo alcohol?"* + *"Cuanto demora en llegar a bucaramanga"*.
- Comprehension extrajo `ciudad` (Bucaramanga) → **CRM gate disparó** (trigger `newFields ∩ SHIPPING_FIELDS`).
- Sub-loop `crm_mutation` reventó: `AI_NoObjectGeneratedError: response did not match schema` (steps=0). El modelo había decidido bien (`no_match → handoff_humano`) pero el texto no validó el schema de `generateObject`.
- **Sin try/catch en `crm-gate.ts:358` → mató el turno (`success=false`, 0 msgs). El cliente recibió `[ERROR AGENTE] V4_AGENT_ERROR @ crm-gate`.**

---

## 4 fallas confirmadas (causa raíz dura)

| # | Falla | Causa raíz (con evidencia) | Prioridad |
|---|---|---|---|
| 1 | crm-gate dispara mal + su sub-loop crashea | `crmGateFired` (`crm-gate.ts:87-97`) abre con UN solo shipping field (`ciudad`), aunque sea pregunta informacional sin pedido. Sub-loop sin try/catch (`crm-gate.ts:358`) | P0 |
| 2 | Zombie 70s | turno largo (restart + sub-loop ~20s + gap 31.8s sin heartbeat) supera TTL del lock → cliente sin respuesta / recibe error crudo | P0 |
| 3 | Flip generated↔no_match | retrieval OK (`interaccion_alcohol` @ 0.54); `responseConfidence` rozando 0.70 (0.6); KB de interacciones pobre | P1 |
| 4 | Handoff silencioso | manda `como_se_toma` (otra pregunta) y deriva a humano sin avisar | P1 |

---

## Mecanismos verificados (sin asumir)

- **`intent_confidence` NO mide claridad del intent → mide "template-fit"** (`comprehension-prompt.ts:41-52`): "¿la respuesta automática para ese intent responde ESTA pregunta?". 0.85+ cubre, 0.20-0.40 fuera de scope. Alcohol = 0.25 porque el template de `contraindicaciones` solo cubre medicamentos cardíacos → escala al KB (correcto y por diseño).
- **Sistema dual SÍ existe** (`slots.ts:102` `computeSlots`): slot por intent (primary `intent_confidence` + secondary `secondary_confidence`), cada uno con `decideSubLoopReason` + su propio `runSubLoop`. Resolución secuencial primary→secondary (`somnio-v4-agent.ts:818-822`).
- **Un solo LLM call** mide ambos confidences (`comprehend()` = un `generateText` con structured output, Gemini 2.5 Flash, fallback Haiku 4.5).
- **Contaminación cruzada — NO se sostiene (1 dato, temp=0):** probe `scripts/_v4-probe-comprehension.ts` sobre el mensaje combinado real → `tiempo_entrega` secondary_confidence = **0.88** (idéntico a aislado 0.88); alcohol primary 0.3 (vs aislado 0.25, granularidad de redondeo). El secondary se mide BIEN; el primary bajo NO lo arrastró.
- **Dos thresholds 0.70 distintos:**
  - Escalación (`intent_confidence`): `platform_config.somnio_v4_low_confidence_threshold` = 0.7, parametrizable, compartido primary/secondary (`slots.ts:87`).
  - Generación (`responseConfidence`): `RESPONSE_CONFIDENCE_THRESHOLD = 0.70` **hardcodeado** en `sub-loop/index.ts:48` (el que causó el flip).
- **`secondary_confidence` NO se loguea** en `comprehension_completed` (`comprehension.ts:227`) ni en `comprehension_completed_v4` (`somnio-v4-agent.ts:437`) → punto ciego de observabilidad (el valor existe en `analysis.intent.secondary_confidence`, solo falta emitirlo).

---

## Scope ACORDADO para el standalone

| Item | Decisión | Detalle |
|---|---|---|
| **#1.a Puerta del gate** | ✅ IN | Reforzar `crmGateFired`: disparar por `datosCriticos`/`datosCriticosJustCompleted` (o contexto de pedido), NO por un solo shipping field. `datosCriticosJustCompleted` ya existe (`state.ts:201`). CRITICAL_FIELDS_NORMAL = 6 campos. |
| **#1.b Blindaje del crash** | ⏸ DIFERIDO | El gate es para mutaciones CRM, no para responder al cliente. Reforzar la puerta (#1.a) elimina el crash observado. **Riesgo residual:** un turno legítimo de pedido que falle el schema seguirá muriendo hasta hacer el try/catch en `crm-gate.ts:358`. Deuda anotada. |
| **#2 Guardar secondary_confidence** | ✅ IN | Agregar `secondary_confidence` + `secondary_confidence_reasoning` (+ opcional `secondary`, `secondary_query`) a los eventos `comprehension_completed` (`comprehension.ts:227`) y `comprehension_completed_v4` (`somnio-v4-agent.ts:437`). Aditivo. |
| **#3 Response confidence a platform_config** | ✅ IN | Mover `RESPONSE_CONFIDENCE_THRESHOLD` (hoy hardcodeado `sub-loop/index.ts:48`) a `platform_config` (key tipo `somnio_v4_response_confidence_threshold`, mismo patrón que `threshold.ts`: cache 60s + fallback 0.70). Da perilla para calibrar el flip por SQL sin deploy. NO arregla el flip — lo hace tuneable. |
| **Zombie 70s (#2 de fallas)** | ⏸ PENDIENTE | P0 pero requiere investigar el gap de 31.8s (send-loop bloqueante vs suspensión de lambda Fluid Compute que congela el heartbeat). Standalone aparte o sumar a éste — decidir en discuss. |
| **Flip / KB pobre (#3 de fallas)** | ⏸ PENDIENTE | Enriquecer KB de interacciones (alcohol/medicamentos) — decidir en discuss si entra. |

**Regla 6:** todo aditivo, v4 sigue DORMANT en prod. Ningún cambio toca el comportamiento de v3/godentist/recompra/pw-confirmation.

---

## Scripts read-only usados (reusables)
- `scripts/_v4-drill-turn.mjs <turn_id>` — timeline completo de un turno.
- `scripts/_v4-recent.mjs` / `_v4-window.mjs` — turnos recientes + gaps >10s.
- `scripts/_v4-probe-comprehension.ts` — corre `comprehend()` real (temp=0) para ver ambos confidences de un mensaje (verificación de contaminación / valores).
