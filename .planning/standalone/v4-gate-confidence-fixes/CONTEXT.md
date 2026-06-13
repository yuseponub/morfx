# v4-gate-confidence-fixes — Context

**Gathered:** 2026-06-13
**Status:** Ready for research
**Type:** Standalone (no roadmap phase — orquestación manual, mismo patrón que `v4-observability-completeness`)

<domain>
## Phase Boundary

Tres fixes **aditivos** al agente `somnio-sales-v4` (DORMANT en prod), descubiertos con causa raíz dura usando la observabilidad nueva (standalone `v4-observability-completeness`, shipped 2026-06-13). Diagnóstico completo + evidencia de turnos reales en `FINDINGS.md`.

**EN SCOPE (3 fixes):**
1. **Puerta del CRM gate** — reforzar `crmGateFired` para que NO prenda por la extracción incidental de un solo shipping field (`ciudad`) en una pregunta informacional.
2. **Guardar `secondary_confidence`** en observabilidad — hoy es punto ciego (el secondary intent se mide pero su confidence no se loguea).
3. **`RESPONSE_CONFIDENCE_THRESHOLD` → `platform_config`** — hoy hardcodeado; volverlo parametrizable por SQL (perilla para calibrar el flip sin deploy).

**NO ES ESTA FASE (deferidos, ver `<deferred>`):**
- Blindaje del crash `AI_NoObjectGeneratedError` en el sub-loop CRM (try/catch).
- Zombie de 70s (P0 — requiere investigar el gap de 31.8s sin heartbeat).
- Enriquecer KB de interacciones (alcohol/medicamentos) para resolver el flip de fondo.

**Regla 6:** todo aditivo. v4 sigue DORMANT en prod; cero cambio de comportamiento para v3/godentist/recompra/pw-confirmation. El default 0.70 del threshold migrado preserva el comportamiento actual exacto.
</domain>

<decisions>
## Implementation Decisions

### D-01 — Puerta del CRM gate (fix #1.a)
- **Decisión:** reemplazar el trigger `(b) newFields ∩ SHIPPING_FIELDS` de `crmGateFired` (`crm-gate.ts:87-97`) por **`changes.datosCriticosJustCompleted`** — el gate prende SOLO el turno en que TODOS los campos críticos pasan de incompletos a completos (momento real de crear pedido).
- **Razón:** alinea con `buildCrmHint` (`crm-gate.ts:188`), que ya keyea el cascarón de createOrder en `datosCriticosJustCompleted`. El caso Bucaramanga (solo `ciudad` extraída, `category='pregunta'`) deja de prender.
- **`changes.datosCriticosJustCompleted` ya está disponible** dentro de `runCrmGate` (se pasa vía `changes`). No requiere threadear `gates.datosCriticos` (eso era la alternativa B descartada).
- **Triggers (a) y (c) — a validar en planning:** (a) `accion ∈ {mostrar_confirmacion, confirmar_orden}` debe QUEDAR (confirmaciones de pedido). (c) `category === 'datos'` (red anti-falso-negativo para mensajes de datos puros) **probablemente queda** — el caso Bucaramanga era `category='pregunta'`, así que (c) no lo dispara. El planner valida que (c) no abra su propio falso positivo.
- **CRITICAL_FIELDS_NORMAL** = `[nombre, apellido, telefono, direccion, ciudad, departamento]` (6); `CRITICAL_FIELDS_OFI_INTER` = 5 (sin direccion) — `constants.ts:94-110`.

### D-02 — Guardar secondary_confidence en observabilidad (fix #2)
- **Decisión:** agregar `secondary_confidence` + `secondary_confidence_reasoning` (y opcionalmente `secondary` + `secondary_query`) al payload de **dos** eventos donde el valor YA está en scope:
  - `comprehension_completed` (`comprehension.ts:227`) — hoy loguea `secondary` (label) pero no su confidence.
  - `comprehension_completed_v4` (`somnio-v4-agent.ts:437`) — hoy loguea el `intent_confidence` del primary pero ningún campo del secondary.
- **Razón:** el sistema dual (primary + secondary, cada uno con su confidence + su `runSubLoop`) funciona bien, pero el secondary es invisible post-mortem. Probado en vivo: `tiempo_entrega` reportó `secondary_confidence=0.88` (bien calibrado) en `scripts/_v4-probe-comprehension.ts`.
- **Aditivo puro** — misma clase que `v4-observability-completeness`. Sin cambio de comportamiento.

### D-03 — RESPONSE_CONFIDENCE_THRESHOLD a platform_config (fix #3)
- **Decisión:** mover la constante hardcodeada `RESPONSE_CONFIDENCE_THRESHOLD = 0.70` (`sub-loop/index.ts:48`) a `platform_config`, key sugerida **`somnio_v4_response_confidence_threshold`**, **default 0.70 (sin cambio de comportamiento — Regla 6)**.
- **Patrón:** clonar el de `threshold.ts` (lookup con cache 60s + fallback robusto a 0.70 si la key no existe / valor inválido / DB error). Mismo `createAdminClient` contra `platform_config` (excepción de domain wrapper ya autorizada para esa tabla utilitaria).
- **Consumidor:** `sub-loop/index.ts:447` (`if generation.responseConfidence < THRESHOLD → no_match → handoff`). El threshold pasa a leerse async/cacheado en vez de la constante.
- **Razón:** este es el threshold que causa el flip (alcohol 0.6 < 0.70 → handoff). Volverlo tuneable permite calibrar el flip por SQL + observar tráfico real sin deploy. NO arregla el flip — da la perilla.
- **Alcance del cambio de threshold de generación:** SOLO el path RAG generativo de v4. El threshold de ESCALACIÓN (`somnio_v4_low_confidence_threshold`, `threshold.ts`) NO se toca — es independiente.

### Claude's Discretion
- Nombre exacto de la key de `platform_config` (sugerido `somnio_v4_response_confidence_threshold`).
- Si `comprehension_completed_v4` también agrega `secondary` + `secondary_query` (además del confidence + reasoning) — deseable para trazabilidad completa.
- Cómo se cablea el threshold async en `sub-loop/index.ts` (lookup arriba del check vs inyección por args).
- Si se mantiene el trigger (c) `category==='datos'` del gate tal cual o se le agrega un guard adicional (validar en planning que no abra falso positivo propio).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Diagnóstico (fuente de verdad de este standalone)
- `.planning/standalone/v4-gate-confidence-fixes/FINDINGS.md` — diagnóstico completo: 4 fallas, causa raíz con file:line, evidencia de turnos reales (`c0f4b3c1`, `44204b79`), mecanismos verificados (intent_confidence = template-fit, sistema dual, un solo call, dos thresholds 0.70).

### Fix #1 — Puerta del gate
- `src/lib/agents/somnio-v4/crm-gate.ts` — `crmGateFired` (:87-97 triggers), `SHIPPING_FIELDS` (:69-75), `buildCrmHint` createOrder cascarón keyeado en `datosCriticosJustCompleted` (:188), call a `runCrmSubLoop` SIN try/catch (:358).
- `src/lib/agents/somnio-v4/state.ts` — `datosCriticosJustCompleted` computado (:201), `datosCriticosOk` (:225).
- `src/lib/agents/somnio-v4/constants.ts` — `CRITICAL_FIELDS_NORMAL` / `CRITICAL_FIELDS_OFI_INTER` (:90-110).
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — call site `runCrmGate` (:616, recibe `changes` + `category`).

### Fix #2 — secondary_confidence logging
- `src/lib/agents/somnio-v4/comprehension.ts` — evento `comprehension_completed` (:227), retorno `{ analysis, tokensUsed }`.
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — evento `comprehension_completed_v4` (:437).
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — `secondary_confidence` (:61), `secondary_confidence_reasoning` (:67), `secondary_query` (:70).
- `src/lib/agents/somnio-v4/slots.ts` — `computeSlots` slot dual (:102-158).

### Fix #3 — response_confidence threshold
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — `RESPONSE_CONFIDENCE_THRESHOLD = 0.70` (:48), check (:447).
- `src/lib/agents/somnio-v4/threshold.ts` — PATRÓN a clonar (lookup platform_config + cache 60s + fallback).
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` — `responseConfidence` (:53, "Threshold 0.70 → handoff D-19").

### Reglas
- `CLAUDE.md` Regla 6 (aditivo, v4 dormant) + Regla 3 (no createAdminClient fuera de domain; excepción autorizada para `platform_config` en `threshold.ts`).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `threshold.ts` `getLowConfidenceThreshold()` — patrón exacto a clonar para el fix #3 (cache + fallback + admin client a platform_config).
- `recordV4Event` (`observability.ts`) — helper no-throw para emitir eventos (del standalone observabilidad) si se necesita un evento nuevo.
- `changes.datosCriticosJustCompleted` — señal ya computada y ya pasada al gate; el fix #1 solo la consume.
- `scripts/_v4-probe-comprehension.ts` — probe read-only para verificar confidences (temp=0) sobre cualquier mensaje.

### Established Patterns
- Convención `category::label` para eventos. `pipeline_decision` default.
- El gate decide internamente si prende (`crmGateFired`) y emite `crm_gate_skipped`/`crm_gate_completed` (aditivo del standalone observabilidad).

### Integration Points
- Fix #1: solo `crm-gate.ts` (`crmGateFired` + posiblemente `RunCrmGateArgs` si se pasa más señal).
- Fix #2: `comprehension.ts` + `somnio-v4-agent.ts` (2 payloads de evento).
- Fix #3: `sub-loop/index.ts` (consume) + nuevo módulo lookup tipo `threshold.ts` + key en `platform_config` (sin migración de schema — `platform_config` es key/value jsonb).

### Constraint (Regla 6)
- Cero cambio de comportamiento. El default 0.70 del threshold migrado es idéntico al hardcodeado. El fix #1 SOLO quita un falso positivo (no agrega disparos nuevos). El fix #2 es observabilidad pura.
</code_context>

<specifics>
## Specific Ideas

- Evidencia viva del fix #1 que motiva todo: turno `44204b79` — cliente preguntó "Cuanto demora en llegar a bucaramanga", se extrajo `ciudad`, prendió el gate, su sub-loop `crm_mutation` crasheó (`AI_NoObjectGeneratedError`) y mató el turno → cliente recibió `[ERROR AGENTE] V4_AGENT_ERROR @ crm-gate`.
- Verificación de contaminación de confidences (hipótesis del usuario): NO se sostiene en el caso probado — `tiempo_entrega` combinado 0.88 == aislado 0.88; primary alcohol 0.3 vs aislado 0.25 (granularidad). El secondary se mide bien.
- El default 0.70 del fix #3 es deliberado: el usuario eligió "sin cambio" (Regla 6) sobre "bajarlo ya". La calibración del flip se hará después por SQL observando tráfico.
</specifics>

<deferred>
## Deferred Ideas

- **Blindaje del crash del sub-loop CRM (#1.b):** try/catch alrededor de `runCrmSubLoop` (`crm-gate.ts:358`) para que `AI_NoObjectGeneratedError` degrade a `no_match`/handoff limpio en vez de matar el turno. DIFERIDO por decisión del usuario (el gate es para mutaciones, no para responder). **Riesgo residual:** un turno legítimo de pedido (`datos` reales) que falle el schema seguirá muriendo hasta hacer esto. Standalone follow-up.
- **Zombie de 70s (P0):** turno largo supera el TTL del lock; gap de 31.8s sin heartbeat (send-loop bloqueante vs suspensión de lambda Fluid Compute). Cliente sin respuesta / recibe error crudo. Requiere investigar el tramo post-handoff en `turn-orchestrator.ts` / `V4MessagingAdapter`. Standalone follow-up (el más grave — atacar primero tras éste).
- **KB de interacciones pobre (flip de fondo):** enriquecer material de `interaccion_alcohol`/`interaccion_medicamentos` para que la generación reporte confianza ≥0.70 y responda en vez de derivar. Es el arreglo REAL del flip (el fix #3 solo da la perilla del threshold).
</deferred>

---

*Standalone: v4-gate-confidence-fixes*
*Context gathered: 2026-06-13*
