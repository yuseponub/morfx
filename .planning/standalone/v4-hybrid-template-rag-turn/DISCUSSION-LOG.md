# DISCUSSION-LOG — v4-hybrid-template-rag-turn

**Date:** 2026-05-29
**Mode:** discuss-phase (standalone, orquestado a mano — `gsd-tools init` no lo descubre)
**Standalone #3** del [[somnio_v4_architecture_roadmap]] (tras #1 turn-ledger ✅ + #2 crm-subloop ✅).
**v4 status:** DORMANT en prod (0 workspaces) → Regla 6.

---

## Problema de fondo (verificado en código esta sesión)

Hoy v4 tiene **una sola palanca binaria por turno**: escalar TODO al RAG, o no — decidida por **un solo intent** (el primary). No existe *"este pedazo del mensaje lo cubre un template y este otro necesita RAG"*.

Evidencia (file:line):
- Escalación usa SOLO el primary: `somnio-v4-agent.ts:222-228` pasa `intent_confidence` (del primary) + `intent.primary` a `decideSubLoopReason`; `escalation.ts:49-64` nunca mira el `secondary`.
- **Return temprano excluyente:** `somnio-v4-agent.ts:243-314` — si el primary escala → `runSubLoop(userMessage crudo)` + `return`. El response-track (templates) NUNCA corre.
- Si el primary NO escala → `response-track.ts:90-96` apila el template del `secondary` **si es informacional**, sin medir si está cubierto.
- `intent_confidence` lo **auto-reporta Gemini** en el mismo call de comprehension (`comprehension-schema.ts:45`), calibrado por few-shot (`comprehension-prompt.ts:39-52`), **sin fórmula posterior** (D-64/D-65). Mide SOLO el primary.

**Caso real que lo evidenció (sesión Jose):** *"cuanto vale eso y lo puedo tomar si tengo apnea del sueño"* → primary=precio (conf 0.900 ≥ 0.70, no escala) + secondary=contraindicaciones. Respondió template de precio + template de contraindicaciones **genérico**; la pregunta "apnea" (caso específico, NO cubierto) nunca pasó por confidence ni por RAG.

## Terreno del sub-loop RAG (verificado — `sub-loop/index.ts`)
- **H1** — El RAG produce **1 respuesta sobre 1 topic** por invocación (`runRagSubLoop` 266-583; `topic_seleccionado`/`responseText` singulares). NO multi-topic.
- **H2** — El RAG recibe el `userMessage` **crudo** (líneas 276, 376). Para template+RAG hay que pasarle la **sub-query** del intent que escala, no el mensaje entero (sino duplica lo del template).
- **H3** — Hay un **segundo threshold** `RESPONSE_CONFIDENCE_THRESHOLD = 0.70` **hardcoded** (`index.ts:44`) sobre `responseConfidence` post-generación — distinto del threshold de comprehension (`platform_config.somnio_v4_low_confidence_threshold`, DB). Dos gates en serie.
- **H4** — El RAG puede decidir handoff por su cuenta (responseConfidence<0.70 / binary FALTA_INFO|FUERA_SCOPE / compliance) → hoy marca TODO el turno como `requiresHuman`.

---

## Decisiones LOCKED (acordadas esta sesión)

- **D-01** — **Confidence per-intent vía comprehension extendido (Opción A).** Pedir `secondary_confidence` (+ reasoning) como campos nuevos del MISMO call de comprehension (no un 2º call). Razón: el modelo ya auto-reporta el del primary ahí mismo; evita +1 round-trip. ⚠️ A validar con smoke por riesgo de fragilidad de schema (lección `AI_NoOutputGeneratedError` del RAG, STATUS rag-generative Plan 09).
- **D-02** — **Matriz de 4 casos** sobre {primary, secondary} cobertura:
  - cubierto + cubierto → template + template (ya funciona hoy)
  - cubierto + low → template + RAG (el caso apnea)
  - low + cubierto → RAG + template
  - low + low → RAG + RAG
- **D-03** — **Solo el intent low escala** (corrige la simplificación inicial de Jose). Si solo el primary es low → RAG(primary) + template(secondary). NO mandar ambos al RAG.
- **D-04** — **comprehension parte el mensaje:** quien mide el `secondary_confidence` también emite la **sub-query segmentada** (`secondary_query`) que se le pasa al RAG (resuelve H2). La partición nace en comprehension (ve el mensaje completo), no en el sub-loop.
- **D-05** — **La respuesta del RAG entra como CORE** en el block-composer (misma composición que hoy, solo que el texto generativo se prioriza CORE). Orden relativo template-CORE vs RAG-CORE → pendiente (ver gray areas abiertas).
- **D-06** — **Máximo 2 intents** (ya lo fuerza el schema primary+secondary). Si hay >2 intenciones, se atienden las 2 principales (el LLM elige).

## Decisiones LOCKED (gray areas resueltas — 2026-05-29)

- **D-07 (A-1) — Handoff PARCIAL.** Si el RAG de un intent decide handoff (H4) pero el otro intent sí tiene respuesta (template o RAG ok) → se manda lo que SÍ se pudo responder y se escala a humano SOLO la parte no resuelta. ⚠️ **Implicación técnica (para research):** hoy `requiresHuman:true` marca el turno ENTERO (`somnio-v4-agent.ts`). El handoff parcial requiere un mecanismo nuevo: enviar mensaje(s) de la parte resuelta Y marcar la conversación para intervención humana sobre la parte escalada, simultáneamente. Es el punto más delicado de la fase.
- **D-08 (A-2) — RAG+RAG = 2 invocaciones separadas.** Cuando ambos intents son low → 2 llamadas al RAG (una por sub-query). Reusa el RAG actual (1 topic/1 respuesta, H1) sin reescritura a multi-topic. Costo/latencia extra solo en el caso raro ambos-low.
- **D-09 (A-3) — Mismo threshold para ambos intents.** `secondary_confidence` se compara contra el mismo `platform_config.somnio_v4_low_confidence_threshold` que el primary. Una sola perilla.
- **D-10 (A-5) — Sin feature flag.** v4 DORMANT (0 workspaces) → Regla 6 ya aísla. Mismo patrón que #1/#2. Se activa al prender v4 en un workspace.
- **D-11 (A-4 — Claude's Discretion) — Orden de mensajes = orden de los intents.** Los mensajes salen en el orden de aparición (primary luego secondary), con la composición CORE/COMPLEMENTARIA y delays normales del block-composer, sea template o RAG. No se reordena por fuente. Ajustable en research si un orden distinto mejora coherencia.

## Restricción transversal
v4 DORMANT → Regla 6. Cambios v4-specific. Sandbox simula. Depende del contrato del ledger (#1) + CRM consolidado (#2), ambos SHIPPED. Branch de integración: `exec/debounce-v2-wave6` (ff a main).
