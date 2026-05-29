# RESEARCH — v4-hybrid-template-rag-turn

**Standalone #3** del roadmap v4 (tras #1 turn-ledger ✅ + #2 crm-subloop ✅).
**Fecha:** 2026-05-29
**Branch:** `exec/debounce-v2-wave6`
**Baseline Regla 6 (para diffs):** HEAD `9fd422f0` (`docs(v4-hybrid-template-rag-turn): discuss-phase`)
**v4 status:** DORMANT en prod (0 workspaces) → Regla 6 satisfecha por construcción.
**Convención:** prosa en español; código/paths/símbolos en inglés. `[VERIFICADO file:line]` = leído en código esta sesión; `[INFERIDO]` = razonamiento sobre lo verificado.

---

<user_constraints>
## User Constraints (de CONTEXT.md / DISCUSSION-LOG.md)

### Locked Decisions (D-01..D-11 — copiadas verbatim)
- **D-01** — Confidence per-intent vía comprehension extendido (Opción A): nuevos campos `secondary_confidence` (+reasoning) en el MISMO call de comprehension. ⚠️ validar con smoke (riesgo fragilidad schema — lección `AI_NoOutputGeneratedError` RAG Plan 09).
- **D-02** — Matriz de 4 casos sobre cobertura {primary, secondary}: cubierto+cubierto → template+template (ya hoy); cubierto+low → template+RAG; low+cubierto → RAG+template; low+low → RAG+RAG.
- **D-03** — Solo el intent low escala. Si solo el primary es low → RAG(primary)+template(secondary), NO ambos al RAG.
- **D-04** — comprehension parte el mensaje: emite `secondary_query` (sub-query segmentada del 2º intent) que se pasa al RAG como su `userMessage`. Resuelve H2.
- **D-05** — La respuesta del RAG entra como CORE en el block-composer; composición igual que hoy.
- **D-06** — Máximo 2 intents (ya forzado por schema primary+secondary). >2 → se atienden los 2 principales.
- **D-07** — Handoff PARCIAL: si un intent escala a humano pero el otro tiene respuesta → manda lo resuelto + escala SOLO la parte no resuelta. ⚠️ requiere mecanismo nuevo.
- **D-08** — RAG+RAG = 2 invocaciones separadas (una por sub-query).
- **D-09** — Mismo threshold para primary y secondary (`platform_config.somnio_v4_low_confidence_threshold`).
- **D-10** — Sin feature flag (v4 DORMANT → Regla 6 ya aísla).
- **D-11** — (Discretion) Orden de mensajes = orden de intents (primary→secondary), composición CORE/COMPLEMENTARIA y delays normales. Ajustable en research si mejora coherencia.

### Deferred (FUERA DE SCOPE)
- 3+ intents (hoy máx 2 por schema).
- RAG multi-topic en una invocación (D-08 eligió 2 calls).
- Lectura intra-turno de turnos PREVIOS del ledger (alcance actual = intra-mensaje).
</user_constraints>

---

## Resumen ejecutivo

El cambio es **estructuralmente acotado y de bajo riesgo arquitectónico**, contrario a lo que la palabra "handoff parcial" sugiere. La razón:

1. **El handoff parcial NO requiere mecanismo nuevo de "enviar + escalar simultáneo".** Ya existe y está probado en producción: el runner v4 **envía los templates en el bloque 5h (líneas 750-951) ANTES de ejecutar el handoff (línea 1123)**. Cuando `output.newMode === 'handoff'`, el webhook-processor (`webhook-processor.ts:1041`) llama `executeHandoff` que (a) envía un mensaje genérico de handoff, (b) apaga el agente conversacional, (c) crea una tarea. **Hoy el handoff manda 0 templates solo porque el path `no_match` setea `messages:[]` — no porque el motor lo prohíba.** El nuevo flujo solo necesita poblar `output.templates` con la parte resuelta Y mantener `newMode='handoff'`. `[VERIFICADO v4-production-runner.ts:750-951 + 1122-1128; webhook-processor.ts:1041-1063; handoff-handler.ts:43-171]`

2. **El refactor del return temprano (`somnio-v4-agent.ts:243-314`) es el verdadero corazón de la fase.** Hoy ese bloque es un short-circuit: `runSubLoop(primary crudo)` + `return mapOutcomeToAgentOutput(...)`, saltándose guards, sales-track, gate CRM y response-track. El nuevo flujo debe convertir ese `return` excluyente en un **orquestador de 2 slots** que resuelve primary y secondary por separado, los combina, y SOLO ENTONCES retorna. El reto técnico es preservar todo lo que el return temprano hace hoy (captureUnknownCase, observability, ledger, CKPTs) y NO romper los otros 6 paths del mismo archivo.

3. **El schema de comprehension NO es la fuente principal de riesgo** (la lección `AI_NoOutputGeneratedError` fue en el **sub-loop tooling schema** con ~32 combinaciones nullable, no en `MessageAnalysisSchema`). El comprehension de v4 corre sobre **Gemini 2.5 Flash** con un schema rico y estable; añadir 2 campos opcionales es bajo riesgo, pero D-01 manda smoke. `[VERIFICADO comprehension.ts:84-101 + rag-generative STATUS.md Plan 09]`

**Recomendación primaria:** Implementar un **resolvedor de 2 slots** que reemplace el return temprano, donde cada slot resuelve {template | RAG | handoff-parcial} independientemente, y combinarlos en `output.templates` + `newMode`. Reusar la maquinaria de handoff existente (newMode='handoff' + send-before-handoff). NO inventar un campo de "handoff parcial" — el flag `requiresHuman` + `newMode='handoff'` es suficiente y ya está cableado. **Sin migración DB.**

---

## Architectural Responsibility Map

| Capability | Tier dueño | Tier secundario | Rationale |
|------------|-----------|----------------|-----------|
| Segmentar mensaje en sub-queries (D-04) | Comprehension (`comprehend`) | — | Es donde se ve el mensaje completo; nace ahí la partición. `[VERIFICADO comprehension.ts]` |
| Medir cobertura per-intent (D-01) | Comprehension schema (`secondary_confidence`) | Escalation (`decideSubLoopReason`) | El modelo ya auto-reporta el del primary ahí. |
| Decidir slots {template/RAG/handoff} por intent (D-02/D-03) | Orquestador (`somnio-v4-agent.ts`) | Escalation | Es donde hoy vive el return binario. |
| Producir respuesta generativa por sub-query (D-08) | Sub-loop RAG (`runRagSubLoop`) | — | 1 invocación = 1 topic/1 respuesta (H1). |
| Producir respuesta enlatada por intent | Response-track (templates) | TemplateManager + block-composer | Maquinaria existente. |
| Componer template+RAG en orden (D-05/D-11) | Orquestador + Response-track | block-composer | El orquestador inyecta texto RAG como CORE. |
| Materializar handoff (parcial o total) | Runner v4 + webhook-processor | handoff-handler | Send-before-handoff ya cableado. |
| Coordinación interrupción (CKPTs) | interruption-system-v2 | runner + agente + sub-loop | NO tocar el módulo; solo sus call-sites v4. |

---

## R1 — Handoff PARCIAL (el más delicado) — VERIFICADO

### Cómo se propaga el handoff HOY (cadena completa)

1. **Sub-loop** decide handoff: `runRagSubLoop` retorna `LoopOutcome` con `status:'no_match'`, `requiresHuman:true`, `responseTemplate:'handoff_humano'`. Triggers: tooling `should_handoff` (`index.ts:310-365`), `responseConfidence < 0.70` (`index.ts:415`), binary backstop `FALTA_INFO|FUERA_SCOPE` (`index.ts:428`), compliance `nuncaDecirViolation`/`escalationTrigger` (`index.ts:472,496`). `[VERIFICADO]`
2. **Agente** (`mapOutcomeToAgentOutput`, `somnio-v4-agent.ts:983-1024`): outcome `no_match` → `messages:[]`, `newMode:'handoff'`, `requiresHuman:true`, ledger `atendido:[{kind:'handoff'}]`. Excepción: si `outcome.reason` empieza con `interrupted_at_ckpt_` → propaga como `errorMessage` SIN handoff (no es escalación real). `[VERIFICADO somnio-v4-agent.ts:1002-1009]`
3. **Runner** (`v4-production-runner.ts`): envía `output.templates` en 5h (750-951) → DESPUÉS, en POST-SEND, si `output.newMode === 'handoff'` llama `storage.handoff(session.id, version)` (1122-1128) que setea `agent_sessions.status='handed_off'`. `[VERIFICADO]`
4. **webhook-processor** (`webhook-processor.ts:1041-1063`): si `result.success && result.newMode === 'handoff'` y el agente sigue habilitado → `executeHandoff(conversationId, workspaceId, {handoffMessage})`. `[VERIFICADO]`
5. **handoff-handler** (`handoff-handler.ts:43-171`): (a) envía `handoffMessage` genérico vía `whatsapp.message.send`, (b) `setConversationAgentOverride(conversationId, 'conversational', false)` apaga el agente, (c) crea `task` round-robin para humano. `[VERIFICADO]`

### Tabla/campo/evento que marca handoff

| Marca | Dónde | Persistido |
|-------|-------|-----------|
| `agent_sessions.status='handed_off'` | `session-manager.ts:323-327` `handoffSession` (CAS por version) | SÍ (DB) |
| `conversations` agent override OFF | `setConversationAgentOverride('conversational', false)` | SÍ (DB) |
| `tasks` row (alta prioridad, asignada) | `handoff-handler.ts:135-147` | SÍ (DB) |
| `V4AgentOutput.requiresHuman` | runtime only | **NO persistido como columna** (solo informativo; `session_state.requires_human` NO existe para v4 — solo pw-confirmation lo usa internamente) `[VERIFICADO grep migrations]` |

### ¿Se puede ENVIAR mensajes Y marcar handoff en el mismo turno?

**SÍ, ya es posible y está cableado.** `[VERIFICADO]` El orden del runner es:
`send(output.templates)` (5h, ~L807) → `storage.handoff()` (POST-SEND, L1123) → (webhook) `executeHandoff` envía mensaje genérico + apaga agente + crea task.

Hoy NO ocurre solo porque `mapOutcomeToAgentOutput` para `no_match` pone `messages:[]`/`templates:undefined`. **No hay barrera técnica.**

### Precedente "responde + escala" en otros agentes

- **pw-confirmation** (`sales-track.ts:184-187`, `somnio-pw-confirmation-agent.ts:170`): `cancelar_con_agendar_pregunta` emite un TEMPLATE y, en el 2º "no", setea `requires_human=true` → `newMode='handoff'`. Es decir: **un turno con template enviado + handoff ya existe en prod.** `[VERIFICADO]`
- **recompra / v3**: no tienen un precedente distinto; usan el mismo `newMode='handoff'` del engine compartido.

### Mecanismo de handoff parcial PROPUESTO `[INFERIDO sobre VERIFICADO]`

> **No se necesita ningún campo nuevo ni columna.** El handoff parcial = **slot resuelto poblado en `output.templates`/`messages` + `newMode='handoff'` + `requiresHuman:true`**.

- **Qué se envía:** los templates/texto-RAG del slot que SÍ se resolvió, vía `output.templates` (los manda el runner en 5h ANTES del handoff).
- **Cómo se marca la conversación:** el flujo de handoff existente (status `handed_off` + agente OFF + task). El `handoffMessage` genérico de `executeHandoff` actúa como "te paso con un asesor para la otra parte". **Decisión técnica abierta (ver §Decisiones):** ¿el `handoffMessage` genérico es suficiente o se quiere un mensaje específico de la sub-parte escalada? Recomendación: en V1, reusar el genérico (cero código nuevo); el cliente ya recibió la respuesta a la parte cubierta.
- **Qué ve el operador:** la task de handoff + el inbox con `status=handed_off`. El ledger registra `atendido:[{kind:'template_intent'|'kb_topic', ...}, {kind:'handoff', reason:...}]` — **el ledger ya soporta múltiples `Atendido` en `atendido[]`** `[VERIFICADO types.ts:385-390, 413-416]`, así que un turno mixto "respondió X + escaló Y" se representa naturalmente.

**Pitfall R1-A:** el orden importa. Si en el nuevo flujo el slot resuelto produce templates, hay que asegurarse de que `output.newMode='handoff'` NO impida que el runner los envíe. El runner SÍ los envía (send precede handoff), pero **verificar que `mapOutcomeToAgentOutput` / el nuevo combinador no ponga `messages:[]` cuando hay un slot resuelto**. `[INFERIDO — es exactamente el bug que el refactor debe evitar]`

**Pitfall R1-B (interrupción):** el discriminador `interrupted_at_ckpt_` (`somnio-v4-agent.ts:1002`) NO debe confundirse con handoff. Si UN slot RAG se interrumpe, el comportamiento correcto es propagar `errorMessage` (Path A restart), NO handoff parcial. Con 2 invocaciones RAG esto se complica (ver R5/R6).

---

## R2 — Refactor del return temprano a "slots por intent" — VERIFICADO

### Qué hace HOY el return temprano (`somnio-v4-agent.ts:243-314`)

Cuando `earlyReason === 'low_confidence' || 'razonamiento_libre'` (solo del **primary**, `escalation.ts:49-64` nunca mira secondary `[VERIFICADO]`):
1. `recordEvent('subloop_low_confidence_invoked')` (244-251)
2. `runSubLoop({reason, ctx:{userMessage: input.message CRUDO, ...lock fields}})` (252-273) — **pasa el mensaje entero, no la sub-query** `[VERIFICADO 258]`
3. Si `outcome.status === 'no_match'`: `captureUnknownCase(...)` fire-and-forget (276-302) + `recordEvent('handoff_low_confidence_fallback')`
4. `return mapOutcomeToAgentOutput({outcome, state:mergedState, analysis, tokensUsed, timerSignals, subLoopReason, threshold, subLoopDebug, prevMode})` (303-313)

`mapOutcomeToAgentOutput` (901-1134) construye TODO el `V4AgentOutput`: ledger (`commitTurn`), `turnLedgerSummary`, `intentInfo`, `subLoopDebug`, `decisionInfo`. Maneja 3 outcomes: `no_match`→handoff, `generated`→`messages:[responseText]`, `template`→`templates` via responseTemplate.

### Lo que el return temprano SE SALTA hoy (y el nuevo flujo debe reconciliar)
- Guards R0/R1 (316-381) — escape intents
- CKPT-2 post-state-machine (397-428)
- Sales-track (431-460)
- Gate CRM #2 (462-490)
- Response-track / templates (492+)

### CRÍTICO: el nuevo flujo corre ANTES o DESPUÉS del gate CRM?

`[INFERIDO sobre VERIFICADO]` **El resolvedor de slots debe correr DESPUÉS del sales-track + gate CRM, NO en el lugar actual del return temprano (paso 6, pre-guards).** Razones:

1. El return temprano actual está en el paso 6 (pre-guards, pre-sales-track) porque era binario: "si el primary no es confiable, escala TODO y no necesitas state-machine". Pero en el modelo de slots, **el secondary template puede venir del response-track determinista**, que necesita sales-track + gate CRM corridos. Mover el resolvedor al final (donde hoy está response-track, ~L492) permite que:
   - El sales-track determinista resuelva su `accion`/`secondarySalesAction` normalmente.
   - El gate CRM corra (es aditivo, no early-return — `crm-gate.ts:312`).
   - El response-track produzca los templates de la parte cubierta.
   - **El resolvedor de slots solo INYECTA texto RAG para el/los intent(s) low**, combinándolo con los templates ya resueltos.

2. **Conviven escalación-por-intent y sales-track determinista** así: el sales-track sigue gobernando las **acciones de venta** (mostrar_confirmacion, pedir_datos, etc.) y el gate CRM las mutaciones. La escalación per-intent es una capa de **enriquecimiento informacional** (responder preguntas de KB) que se superpone, NO reemplaza el flujo de venta. El caso canónico "cuánto vale + apnea" tiene primary=precio cubierto (template via response-track) + secondary=contraindicaciones low (RAG). Ninguno toca venta/CRM.

**Excepción importante:** Si el **primary** es `razonamiento_libre`/`otro` (sumidero D-69) o el primary mismo es low, el sales-track puede no producir nada útil. Hay que decidir (ver §Decisiones) si en ese caso el slot primary va a RAG y el sales-track simplemente no aplica (su `accion` será null/silence). **Esto preserva el comportamiento actual** porque para esos intents el sales-track hoy tampoco produce venta.

### Diseño del flujo de slots (diagrama textual del nuevo `somnio-v4-agent` flow)

```
comprehend(message)  →  analysis { intent.primary, intent.secondary,
                                     intent_confidence, secondary_confidence (NEW D-01),
                                     secondary_query (NEW D-04) }
   │
   ├─ CKPT-1 post-comprehension  (sin cambios)
   ├─ mergeAnalysis + computeGates + getLowConfidenceThreshold  (sin cambios)
   │
   ├─ [NUEVO] computeSlots(analysis, threshold):
   │      primarySlot   = coverage(intent_confidence, primary)   → 'covered' | 'low'
   │      secondarySlot = (secondary !== 'ninguno')
   │                        ? coverage(secondary_confidence, secondary) → 'covered'|'low'
   │                        : 'none'
   │      // 'low' también captura razonamiento_libre/otro (reusar decideSubLoopReason por-intent)
   │
   ├─ Guards R0/R1   (sin cambios — corren igual)
   ├─ CKPT-2 post-state-machine   (sin cambios)
   ├─ Sales-track (resolveSalesTrack)   (sin cambios — gobierna venta)
   ├─ Gate CRM (runCrmGate)   (sin cambios — aditivo)
   ├─ Response-track (resolveResponseTrack)  → templates de intents CUBIERTOS
   │                                            (filtrar: NO emitir template del intent low)
   │
   ├─ [NUEVO] resolveLowSlots():
   │      for slot in [primary, secondary] where slot === 'low':
   │          subQuery = (slot==='secondary') ? analysis.intent.secondary_query
   │                                            : input.message  // o sub-query del primary
   │          outcome = runRagSubLoop({ reason, ctx:{ userMessage: subQuery, lock... } })
   │          if outcome.status === 'generated'  → ragText[slot] = outcome.responseText  (CORE)
   │          if outcome.status === 'no_match'   → handoffSlots.push(slot)  // handoff PARCIAL
   │          if outcome.reason ~ interrupted_   → return errorMessage (Path A restart)
   │
   ├─ [NUEVO] combineSlots():
   │      messages/templates = ORDEN por intents (D-11):
   │          primary  → (covered? template_primary : ragText[primary] CORE)
   │          secondary→ (covered? template_secondary : ragText[secondary] CORE)
   │      newMode = handoffSlots.length>0 ? 'handoff' : computeMode(state)
   │      requiresHuman = handoffSlots.length>0
   │      ledger.atendido = [ ...covered template_intents, ...generated kb_topics,
   │                          ...handoffSlots→{kind:'handoff'} ]
   │
   └─ commitTurn + return V4AgentOutput  (single return point)
```

**Preservación de efectos del return temprano:**
- `captureUnknownCase` → se llama por cada slot que dé `no_match` (mover dentro de `resolveLowSlots`).
- Observability events → emitir per-slot (`subloop_low_confidence_invoked` con `intent` del slot).
- `subLoopDebug` → el `onDebug` closure captura el ÚLTIMO o se acumula en array (decisión: 2 invocaciones RAG = 2 payloads; el debug panel hoy renderiza 1 — ver §Decisiones).
- Ledger → `commitTurn` una sola vez al final con `atendido[]` combinado.
- CKPTs → ver R6.

**No romper los otros paths:**
- Guards R0/R1 (316-381): intactos, corren antes del resolvedor de slots.
- Gate CRM #2 (462-490): intacto, sigue siendo aditivo.
- CKPT-1/CKPT-2: intactos.
- crm_mutation/cas_reject del sub-loop: **estos NUNCA pasan por low_confidence** (`escalation.ts` prioriza cas_reject/crm_mutation sobre low_confidence). El gate CRM los invoca por su cuenta (`runCrmGate` → `runCrmSubLoop reason:'crm_mutation'`). El resolvedor de slots SOLO maneja low_confidence/razonamiento_libre. **No hay solape.** `[VERIFICADO escalation.ts:49-64, crm-gate.ts:338-353]`

---

## R3 — Extensión del schema de comprehension sin fragilidad — VERIFICADO

### Estado HOY (`comprehension-schema.ts:28-103`)
`MessageAnalysisSchema` (Zod, sobre Gemini 2.5 Flash `Output.object`). `intent` tiene: `primary` (enum), `secondary` (enum+'ninguno'), `confidence` (legacy 0-100), `reasoning`, `intent_confidence` (0..1 del PRIMARY), `intent_confidence_reasoning?`. Más `extracted_fields`, `classification`, `negations`. **Schema rico pero ESTABLE en prod** (corre en cada turno v4 sandbox sin `AI_NoOutputGeneratedError`). `[VERIFICADO]`

### La lección `AI_NoOutputGeneratedError` fue en OTRO schema
`[VERIFICADO rag-generative STATUS.md Plan 09]` El error fue en el **sub-loop tooling schema** (`ToolingOutputSchema`), no en `MessageAnalysisSchema`. Causa: ~32 combinaciones nullable. Mitigación: discriminated union. **`MessageAnalysisSchema` NO tiene ese patrón** (campos `.nullable()` en `extracted_fields` pero estructura fija sin combinatoria explosiva). Riesgo de añadir 2 campos: **bajo, pero D-01 manda smoke.**

### Cómo añadir los campos minimizando fragilidad `[INFERIDO sobre VERIFICADO]`

**Recomendación: campos OPCIONALES con `.describe()`, condicionados semánticamente al secondary en el prompt (NO en el schema).**

```ts
// dentro de intent: z.object({...})
secondary_confidence: z.number().min(0).max(1).nullable().describe(
  '0..1 self-reported confidence en la clasificación SECUNDARIA. ' +
  'null si secondary === "ninguno". Misma calibración template-fit que intent_confidence.'
),
secondary_confidence_reasoning: z.string().nullable().describe(...),  // observability
secondary_query: z.string().nullable().describe(
  'Sub-query segmentada del SEGUNDO intent — la parte del mensaje que corresponde al ' +
  'secondary, reformulada como pregunta auto-contenida. null si secondary === "ninguno". ' +
  'Ej: "cuánto vale y lo puedo tomar si tengo apnea?" → secondary_query="¿puedo tomar el ' +
  'producto si tengo apnea del sueño?"'
),
```

**Por qué `.nullable()` en vez de `.optional()`:** Gemini structured output es más robusto con campos siempre-presentes que nullable que con opcionales que aparecen/desaparecen (la nullabilidad es un valor, no una variación de shape — evita combinatoria de shapes que causó el bug del tooling). `[INFERIDO — coherente con la lección del discriminated union: shapes estables > shapes variables]`

**Condicional al `secondary !== 'ninguno'`:** NO en el schema (mantener shape fijo), SÍ en el **prompt** (`comprehension-prompt.ts`): instrucción "si secondary='ninguno', poné secondary_confidence=null y secondary_query=null". El `parseAnalysis` (`comprehension.ts:169-203`) ya sanea; añadir null-default defensivo si el modelo omite.

### Few-shot calibration para el secondary
El framing actual (`comprehension-prompt.ts:39-185`) es "¿la respuesta automática del intent puede responder ESTA pregunta?". **Reusar el MISMO framing para el secondary**, añadiendo 2-3 anclas multi-intent:
- `"cuánto vale y lo puedo tomar si tengo apnea?"` → primary=precio (CUBRE 0.92), secondary=contraindicaciones, secondary_query="¿puedo tomarlo con apnea del sueño?" (NO CUBRE 0.25)
- `"ok pero la entrega cuándo?"` → primary=acknowledgment, secondary=tiempo_entrega (CUBRE 0.88)

### Riesgo de confundir primary/secondary confidence `[INFERIDO]`
Riesgo REAL: el modelo puede asignar el confidence del primary al secondary o viceversa. Mitigación: (a) `secondary_confidence_reasoning` para auditar en smoke, (b) anclas explícitas que muestren AMBOS confidences en el mismo ejemplo, (c) smoke con casos donde primary y secondary tienen coberturas OPUESTAS (precio-cubierto + apnea-low) para detectar el swap.

---

## R4 — Composición template + RAG en un turno (D-05/D-11) — VERIFICADO

### Estado HOY
- `resolveResponseTrack` (`response-track.ts:43-233`) devuelve `ProcessedMessage[]` (`{templateId, content, contentType, delayMs, priority}`). Combina sales templates (CORE) + info templates (COMPLEMENTARIA), pasa por `block-composer` (`composeBlock`). `[VERIFICADO]`
- El RAG (`runRagSubLoop`) devuelve texto suelto en `outcome.responseText`; `mapOutcomeToAgentOutput` lo pone en `messages:[outcome.responseText]` (`somnio-v4-agent.ts:1066`), SIN pasar por block-composer ni `ProcessedMessage`. `[VERIFICADO]`

### Cómo inyectar el texto RAG manteniendo orden (D-11) y delays `[INFERIDO sobre VERIFICADO]`

El texto RAG debe convertirse en un `ProcessedMessage` sintético para entrar al mismo pipeline de envío:

```ts
const ragMessage: ProcessedMessage = {
  templateId: `rag:${outcome.sourceTopic}`,   // pseudo-id, no es template real
  content: outcome.responseText,
  contentType: 'texto',
  delayMs: 0,                                  // CORE = 0 (D-05)
  priority: 'CORE',
}
```

**Orden (D-11 = orden de intents):** el combinador arma el array final respetando primary→secondary:
- primary slot → su `ProcessedMessage` (template o RAG) primero
- secondary slot → su `ProcessedMessage` después

**Decisión sobre block-composer:** el RAG ya viene como UN solo mensaje coherente; **NO necesita pasar por `composeBlock`** (que dedup/ordena templates por intent). Recomendación: resolver los templates de los slots cubiertos vía response-track normal (que ya usa block-composer), y luego **prepend/append** los `ragMessage` sintéticos en la posición correcta según D-11. El `templateId` pseudo (`rag:topic`) NO debe entrar a `templatesMostrados`/`templates_enviados` (no es template real) — **el no-repetition filter y el ledger deben tratarlo distinto** (ver Pitfall R4-A).

**Pitfall R4-A:** `v4-production-runner.ts:1075-1082` guarda `actuallySentIds` en `templates_enviados`. Si el `rag:topic` pseudo-id se persiste como template enviado, el TemplateManager podría confundirse en turnos futuros. **El plan debe filtrar pseudo-ids `rag:*` del set de `templates_enviados`** o el ledger ya lo maneja vía `atendido:[{kind:'kb_topic'}]` (que es el registro canónico del RAG, distinto de `template_intent`). `[VERIFICADO types.ts:385-390; runner 1075-1082]`

**Pitfall R4-B (no-repetition filter):** si `USE_NO_REPETITION_V4='true'` (default OFF, `v4-production-runner.ts:759`), el filtro corre sobre `output.templates`. Un `ragMessage` con content generativo único nunca colisiona, pero el filtro asume `intent` (`output.intentInfo?.intent`). **Verificar que el filtro no descarte el RAG por falta de intent.** Bajo riesgo porque el flag está OFF por defecto. `[VERIFICADO 754-804]`

### Coherencia de tono (template fijo vs TONE_BASE del RAG) `[INFERIDO]`
El template tiene tono fijo (catálogo Somnio); el RAG usa `TONE_BASE` (`sub-loop/tone-base.ts`, inyectado en `buildGenerationPrompt`, `index.ts:371-375`). Riesgo de "dos voces". Mitigación: **NO es código, es smoke** (D-01/riesgo #4 del CONTEXT). El plan debe incluir un smoke que valide que template(precio enlatado) + RAG(apnea generativo) se sienten como un solo remitente. Posible ajuste: pasar al `buildGenerationPrompt` una señal de que el RAG acompaña un template (para que no re-salude ni repita), pero esto es refinamiento post-smoke.

---

## R5 — RAG+RAG = 2 invocaciones (D-08) + costo/latencia — VERIFICADO

### Estado HOY: costo por invocación RAG
`runRagSubLoop` (`sub-loop/index.ts:266-583`) por invocación hace, en el peor caso de éxito:
1. **Call 1 — Tooling** (`runToolingCall`): GPT-4.1-mini + `kb_search` + `Output.object`. `stopWhen: stepCountIs(6)` (legacy) — el RAG tooling es 1 paso + kb_search. `[VERIFICADO index.ts:269-285]`
2. **Call 2 — Generation** (`runGenerationCall`): Gemini Flash + `Output.object` SIN tools. `[VERIFICADO 367-388]`
3. **Call 3 — Compliance** (`checkCompliance`): Gemini Flash independiente. `[VERIFICADO 444-449]`

= **3 LLM calls por invocación RAG** (tooling + generation + compliance). El handoff temprano (tooling decide handoff) corta a 1 call. `[VERIFICADO]`

### Matriz de 4 casos — LLM calls por turno `[INFERIDO sobre VERIFICADO]`

| Caso | primary | secondary | Comprehension | RAG invocaciones | LLM calls totales (peor caso) |
|------|---------|-----------|---------------|------------------|-------------------------------|
| cubierto+cubierto | template | template | 1 (Gemini) | 0 | **1** |
| cubierto+low | template | RAG | 1 | 1 (3 calls) | **4** |
| low+cubierto | RAG | template | 1 | 1 (3 calls) | **4** |
| low+low | RAG | RAG | 1 | 2 (6 calls) | **7** |

Más: gate CRM (si prende) añade su propia invocación `runCrmSubLoop` (1 generateText) `[VERIFICADO crm-gate.ts:338]`. El caso canónico (precio+apnea) cae en **cubierto+low = 4 calls**, sin CRM (no hay datos de envío).

### Secuencial o paralelo `[INFERIDO]`

**Recomendación: SECUENCIAL en V1.** Razones:
1. Los CKPTs de interrupción (R6) son más simples en secuencial — cada invocación pasa por CKPT-3/4/5 y un interrupt entre ellas se detecta limpio.
2. El caso low+low es RARO (ambos intents fuera de scope). Optimizar latencia ahí es prematuro.
3. Paralelo (`Promise.all`) complica: 2 invocaciones compitiendo por checkpoints sobre el MISMO lock, debug payloads concurrentes, y manejo de interrupt ambiguo (¿cuál slot se interrumpió?).

**Latencia estimada peor caso (low+low, secuencial):** comprehension ~1-2s + RAG×2 (cada uno tooling ~2-4s + generation ~2-4s + compliance ~0.5-1s ≈ 5-9s) = **~11-20s**. `[INFERIDO — basado en latencias típicas Gemini Flash + GPT-4.1-mini; NO medido esta sesión]`

### ¿Excede límite de webhook/Inngest? `[VERIFICADO parcial]`
- El webhook responde 200 inmediato (la nota de MEMORY: "Webhook must respond 200 in <5s — inngest.send sin await"). El procesamiento real corre en el runner dentro del lambda con lock + heartbeat (TTL 45s, renovado cada 5s — `INTERRUPTION-PARITY.md`). **~11-20s está MUY por debajo del TTL de 45s.** `[VERIFICADO INTERRUPTION-PARITY.md]`
- El heartbeat (`startHeartbeat`, `v4-production-runner.ts:110`) mantiene el lock vivo durante las 2 invocaciones secuenciales. **Sin riesgo de expiración.**
- **Pitfall R5-A:** el caso low+low+CRM (7+1 calls) podría acercarse a ~20-25s. Sigue bajo 45s, pero el plan debe **medir en smoke** el peor caso real. Si se acerca a Vercel function timeout (verificar config — típicamente 60-300s en funciones Inngest), no es bloqueante.

---

## R6 — Interacción con gate CRM (#2) y CKPTs de interrupción — VERIFICADO

### Gate CRM #2
El gate (`runCrmGate`, `crm-gate.ts:312`) es **aditivo, NO early-return** (D-05 del standalone #2). Corre post-sales-track, prende por accion/shipping/category, ejecuta su propio `runCrmSubLoop` y CAE a response-track. **El resolvedor de slots NO interfiere con el gate** porque:
- El gate maneja CRM/mutaciones (reason `crm_mutation`).
- El resolvedor de slots maneja info/KB (reason `low_confidence`/`razonamiento_libre`).
- Son ortogonales. El resolvedor de slots corre DESPUÉS del gate (ver R2). `[VERIFICADO crm-gate.ts:312-370]`

### CKPTs de interrupción (debounce-v2) — VERIFICADO
Distribución actual:
- CKPT-1 (post-comprehension): `somnio-v4-agent.ts:179-210`
- CKPT-2 (post-state-machine): `somnio-v4-agent.ts:397-428`
- CKPT-3/4/5 (post-tooling/generation/compliance): DENTRO de `runRagSubLoop` (`sub-loop/index.ts:293,398,456`)
- CKPT-6a/6b (pre-send-loop): runner (`v4-production-runner.ts:526,645`)
- CKPT-7.N (per-template): `V4MessagingAdapter.shouldAbortBeforeTemplate`
- CKPT-0 (post-acquire): runner (`v4-production-runner.ts:216`)

### ¿Dónde encajan los CKPTs con 2 invocaciones RAG? `[INFERIDO sobre VERIFICADO]`

Cada llamada a `runRagSubLoop` dispara su PROPIO CKPT-3/4/5 (están dentro de la función, `ckptInSubLoop`). Con 2 invocaciones secuenciales:
- Invocación 1 (primary low): CKPT-3a/4a/5a
- Invocación 2 (secondary low): CKPT-3b/4b/5b

**Pitfall R6-A (interrupt mid-slots):** si la invocación 1 retorna `generated` (texto OK) pero la invocación 2 se INTERRUMPE en CKPT-3b → ¿qué pasa? El sub-loop retorna `no_match` con `reason:'interrupted_at_ckpt_3_post_tooling'`. En el modelo actual, eso propaga `errorMessage` → Path A restart (descarta TODO el turno). **Con 2 slots, descartar el turno entero es correcto (Path A re-combina el mensaje), pero hay que asegurar que el texto del slot 1 NO se haya enviado todavía.** Como el envío ocurre en el runner (5h) DESPUÉS de que el agente retorna, **el texto del slot 1 sigue en `output.templates` sin enviar → Path A restart lo descarta limpio.** `[VERIFICADO — send es post-return del agente]` Esto es seguro: la regla "no sends antes del último CKPT pre-send" se mantiene.

**Pitfall R6-B (CheckpointId duplicado):** el `CheckpointId` union (8 valores, `interruption-system-v2/checkpoints.ts`) NO tiene IDs distintos para "slot 1" vs "slot 2". Las 2 invocaciones emiten el MISMO `ckpt_3_post_tooling` dos veces. **Esto es aceptable** (los eventos de observability se duplican pero son idempotentes; el checkpoint solo lee el lock/interrupt key, no muta estado). **NO añadir nuevos CheckpointId** — el CLAUDE.md scope de interruption-system-v2 lista los 8 como exhaustivos y verificables por grep. Cambiar eso violaría el gate de ese módulo. `[VERIFICADO CLAUDE.md interruption-system-v2 scope]`

### Paridad runner ↔ engine-v4 (INTERRUPTION-PARITY.md) — VERIFICADO
`[VERIFICADO INTERRUPTION-PARITY.md]` Producción (`v4-production-runner.ts`) y sandbox (`somnio-v4/engine-v4.ts`) NO comparten código pero DEBEN comportarse igual. **El cambio de este standalone vive en `somnio-v4-agent.ts` (compartido por ambos lados vía `processMessage`)** — el agente es el MISMO en prod y sandbox. Los runners solo orquestan I/O. **Por tanto, el refactor de slots en `somnio-v4-agent.ts` se refleja automáticamente en ambos lados** (ambos llaman `processMessage`). `[VERIFICADO engine-v4.ts:35 import processMessage; v4-production-runner.ts:417 import processMessage]`

**ÚNICO punto de paridad a vigilar:** si el resolvedor de slots cambia el SHAPE de `V4AgentOutput` (ej. añade un campo nuevo que el runner debe enviar), AMBOS runners deben consumirlo igual. Si solo se pueblan `templates`/`messages`/`newMode` (campos existentes), **no hay trabajo de paridad** — ambos runners ya los manejan.

---

## Migración DB — NO REQUERIDA `[VERIFICADO]`

- Thresholds: `platform_config.somnio_v4_low_confidence_threshold` ya existe (`threshold.ts`). D-09 reusa la MISMA key para secondary. **Sin migración.**
- Handoff parcial: se materializa via `agent_sessions.status='handed_off'` (ya existe, `20260205000000_agent_sessions.sql:24`) + `requiresHuman` runtime + ledger `atendido[]` (ya soporta múltiples entries). **NO se necesita columna `session_state.requires_human`** (esa es de pw-confirmation, no v4). `[VERIFICADO grep migrations]`
- Ledger: `turn_ledger_dims` (columna existente, `20260528000000`) ya persiste `atendido[]` con múltiples entries. **Sin migración.**

**Conclusión:** Regla 5 NO aplica. Si durante el plan surge una necesidad de columna nueva (improbable), pausar y aplicar SQL antes de push.

---

## Decisiones técnicas que el planner debe tomar

| # | Decisión | Opciones | Recomendación research |
|---|----------|----------|------------------------|
| T-1 | ¿Dónde corre el resolvedor de slots? | (a) en lugar del return temprano (pre-guards); (b) al final, post-gate-CRM | **(b)** — permite que sales-track/gate CRM/response-track corran para la parte cubierta (ver R2). |
| T-2 | ¿`secondary_query` para el PRIMARY low también? | Hoy D-04 solo menciona secondary_query. Si primary es low, ¿se le pasa el mensaje crudo o una sub-query del primary? | Pasar **mensaje crudo** al RAG del primary low (comportamiento actual). Solo el secondary necesita partición (D-04 resuelve H2 para el caso template-primary + RAG-secondary). En low+low, primary=crudo, secondary=secondary_query. |
| T-3 | ¿`handoffMessage` genérico o específico de la sub-parte? | (a) reusar genérico de `executeHandoff`; (b) mensaje custom | **(a)** en V1 (cero código nuevo). El cliente ya recibió la parte cubierta. |
| T-4 | ¿2 RAG secuencial o paralelo? | secuencial / Promise.all | **Secuencial** (R5 — simplicidad de CKPTs + caso raro). |
| T-5 | ¿`secondary_confidence` `.nullable()` o `.optional()`? | nullable / optional | **`.nullable()`** (shape fijo, anti-fragilidad — R3). |
| T-6 | ¿El `subLoopDebug` con 2 invocaciones? | último / array | El debug panel hoy renderiza 1 payload. **V1: capturar el último** (o el del slot que escaló). Mejorar a array es deferible. `[VERIFICADO somnio-v4-agent.ts:142 closure]` |
| T-7 | ¿pseudo-id `rag:topic` entra a `templates_enviados`? | sí / filtrar | **Filtrar** — el registro canónico del RAG es `atendido:[{kind:'kb_topic'}]`, no `templates_enviados` (R4-A). |
| T-8 | ¿Filtrar el template del intent LOW del response-track? | sí / no | **SÍ** — si el secondary es low, NO emitir su template (D-03: el low escala a RAG, no a template genérico). Hoy `response-track.ts:90-96` apila el template del secondary si es informacional, SIN medir cobertura — esto es exactamente el bug a corregir. `[VERIFICADO]` |

---

## Blockers / Pitfalls descubiertos (consolidado)

1. **R1-A** — El combinador NO debe poner `messages:[]` cuando hay un slot resuelto + handoff parcial (el bug central del refactor).
2. **R1-B / R6-A** — Interrupt mid-slots: propagar `errorMessage` (Path A) NO handoff. Seguro porque send es post-return.
3. **R4-A** — pseudo-id `rag:*` NO debe contaminar `templates_enviados`.
4. **R4-B** — no-repetition filter (flag OFF default) asume `intent`; verificar que no descarte RAG.
5. **R5-A** — medir peor caso low+low+CRM (~20-25s) en smoke; bajo TTL 45s del lock.
6. **R6-B** — NO añadir nuevos `CheckpointId` (violaría gate de interruption-system-v2). Las 2 invocaciones reusan los 8 existentes (eventos duplicados aceptables).
7. **R3** — riesgo de swap primary/secondary confidence; mitigar con anclas + smoke de coberturas opuestas.
8. **Response-track L90-96** — el apilado actual del template secondary SIN medir cobertura es el bug; el plan debe gate-arlo por `secondary_confidence`.

---

## No-regresión Regla 6 (greps/diffs contra baseline `9fd422f0`)

> v4 DORMANT → todo cambio es v4-specific. Diff contra el **baseline del standalone** (`9fd422f0`), NO contra main (la rama está adelante con trabajo ajeno — debounce, crm-subloop).

El plan DEBE incluir estas verificaciones:

```bash
# 1. NINGÚN archivo de los 5 siblings tocado (Regla 6 baseline-scoped):
git diff --name-only 9fd422f0..HEAD -- \
  src/lib/agents/somnio-v3/ \
  src/lib/agents/godentist/ \
  src/lib/agents/godentist-fb-ig/ \
  src/lib/agents/somnio-recompra/ \
  src/lib/agents/somnio-pw-confirmation/
# Esperado: 0 líneas.

# 2. El runner v3 (atiende los 5 siblings) NO tocado:
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine/v3-production-runner.ts
# Esperado: 0 líneas.

# 3. El módulo interruption-system-v2 NO tocado (solo sus call-sites v4):
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/interruption-system-v2/
# Esperado: 0 líneas (NO añadir CheckpointId / labels — R6-B).

# 4. CheckpointId sigue siendo exactamente 8 valores (gate del módulo):
grep -oE "'(ckpt_0_post_acquire|ckpt_1_post_comprehension|ckpt_2_post_state_machine|ckpt_3_post_tooling|ckpt_4_post_generation|ckpt_5_post_compliance|ckpt_6_pre_send_loop|ckpt_7_pre_template)'" \
  src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l
# Esperado: 8.

# 5. ProductionMessagingAdapter (parent — Phase 31 polling de los 5 siblings) NO tocado:
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine-adapters/production/messaging.ts
# Esperado: 0 líneas.

# 6. El handoff-handler compartido NO tocado (T-3 reusa el genérico):
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/production/handoff-handler.ts
# Esperado: 0 líneas (si T-3=(a)).

# 7. Cambios CONFINADOS a v4:
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/somnio-v4/
# Esperado: SOLO archivos somnio-v4/* (comprehension-schema, comprehension-prompt,
#   somnio-v4-agent, response-track, posiblemente sub-loop si se ajusta el input).

# 8. Comprehension de los siblings (Haiku) NO afectada — v4 usa Gemini propio:
git diff --name-only 9fd422f0..HEAD | grep -v "somnio-v4" | grep -i "comprehension"
# Esperado: 0 líneas.
```

**Test de no-regresión conductual (clonar patrón de debounce-v2):** correr la suite de los siblings y verificar que comprehension de un sibling NO emite `secondary_confidence` (el campo es v4-only). El schema de v4 (`comprehension-schema.ts`) es exclusivo de v4 — los siblings usan sus propios schemas, así que añadir campos al de v4 es naturalmente aislado. `[VERIFICADO — schemas separados por agente]`

---

## Confianza

| Área | Nivel | Razón |
|------|-------|-------|
| Handoff parcial (R1) | **ALTO** | Mecanismo send-before-handoff verificado end-to-end (runner→webhook→handler). |
| Refactor slots (R2) | **ALTO** | Return temprano + paths verificados; ortogonalidad con gate CRM/escalation verificada. |
| Schema (R3) | **MEDIO-ALTO** | Lección AI_NoOutputGeneratedError confirmada como otro schema; D-01 manda smoke. |
| Composición (R4) | **ALTO** | ProcessedMessage shape + block-composer verificados; pitfalls de pseudo-id identificados. |
| Costo/latencia (R5) | **MEDIO** | LLM calls por celda VERIFICADO; latencias INFERIDAS (no medidas) — medir en smoke. |
| CKPTs / paridad (R6) | **ALTO** | Distribución CKPTs + paridad-via-processMessage compartido verificadas. |
| Migración DB | **ALTO** | Confirmado: ninguna requerida. |

## Assumptions Log

| # | Claim | Sección | Riesgo si falso |
|---|-------|---------|-----------------|
| A1 | Latencias RAG ~5-9s/invocación (low+low ~11-20s) | R5 | Si mayor, acercarse a TTL 45s — medir en smoke. |
| A2 | Gemini structured output es más robusto con nullable que optional | R3 | Si falso, posible fragilidad; smoke lo detecta. |
| A3 | El RAG del primary low recibe mensaje crudo (no sub-query) | T-2 | Si el primary low necesita partición, ajustar D-04. |
| A4 | block-composer NO necesita procesar el ragMessage | R4 | Si el orden/dedup falla, pasar RAG por composeBlock. |

## Open Questions

1. **¿El `handoffMessage` genérico confunde al cliente que ya recibió respuesta parcial?** — Recomendación: smoke con el caso "precio(template)+apnea(handoff)" para validar UX. Si confunde, T-3=(b) con mensaje custom.
2. **¿Coherencia de tono template+RAG?** — Solo se valida con smoke (riesgo #4 CONTEXT). No bloquea diseño.

## Sources (verificados esta sesión)

- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (return temprano 243-314, mapOutcome 901-1134, CKPT-1/2)
- `src/lib/agents/somnio-v4/comprehension-schema.ts` + `comprehension.ts` + `comprehension-prompt.ts`
- `src/lib/agents/somnio-v4/escalation.ts` (49-64)
- `src/lib/agents/somnio-v4/response-track.ts` (43-233, secondary 90-96)
- `src/lib/agents/somnio-v4/sub-loop/index.ts` (runRagSubLoop 266-583) + `output-schema.ts`
- `src/lib/agents/somnio-v4/crm-gate.ts` (312-397)
- `src/lib/agents/somnio-v4/types.ts` (V4AgentOutput, Atendido, TurnLedger)
- `src/lib/agents/engine/v4-production-runner.ts` (send 750-951, handoff 1122-1128)
- `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` + `storage.ts` (handoff 141-143)
- `src/lib/agents/production/webhook-processor.ts` (1041-1063) + `handoff-handler.ts` (43-171)
- `src/lib/agents/session-manager.ts` (handoffSession 323-327)
- `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md`
- `.planning/standalone/somnio-v4-rag-generative/STATUS.md` (Plan 09 AI_NoOutputGeneratedError)
- `supabase/migrations/` (grep: requires_human, agent_sessions status, turn_ledger_dims)
- CLAUDE.md (scope interruption-system-v2 — CheckpointId gate)
```
