# Somnio Sales Agent v1 — Analisis Profundo

## Resumen Ejecutivo

14 archivos analizados. ~3,500 lineas de codigo total.
- 3 llamadas a Claude (intent detection, message classification, data extraction)
- 1 clasificador puro TS (SILENCIOSO/RESPONDIBLE/HANDOFF)
- 36 intents, 10 modos, 24 transiciones, 5 reglas de transicion
- ~100+ valores hardcoded (strings, numeros, patterns)

---

## 1. somnio-agent.ts (1,175 lineas) — Cerebro Principal

### Pipeline de 14 pasos

```
1. Get agent config
2. Initialize tracking vars
3. Check ingest mode (collecting_data?) → handleIngestMode()
   - Puede retornar early (silent accumulation)
4. Check implicit yes (datos fuera de collecting_data → transicion directa)
5. Ofi Inter detection (3 rutas)
   - Ruta 1: Mencion directa ("ofi inter", "recojo en oficina")
   - Ruta 3: Municipio remoto → preguntar preferencia
   - Ruta 2: Durante ingest (manejado por IngestManager)
6. Detect intent (Claude o forceIntent de timer)
7. Update intentsVistos (captura ANTES de agregar current)
8. Classify message category (RESPONDIBLE/SILENCIOSO/HANDOFF)
   - Regla 0: Acknowledgment en modo no-confirmatorio → SILENCIOSO
   - Regla 1: Intent de handoff → HANDOFF
   - Regla 1.5: Confidence < 80% → HANDOFF
   - Excepcion: Acknowledgment despues de oferta de compra → RESPONDIBLE
9. Build mock session (para orchestrator)
10. Orchestrate (SomnioOrchestrator.orchestrate())
11. Build new state
12. Timer signals (start/reevaluate/cancel)
13. Extract messages
14. Signal order creation
```

### Decisiones clave

| Decision | Logica |
|----------|--------|
| Ingest vs normal | Si modo=collecting_data → ingest pipeline |
| Implicit yes | Datos fuera de collecting → transicion a ofrecer_promos |
| Silent accumulation | IngestManager clasifica "datos" → no responder |
| Ingest completion | 8 campos completos → auto ofrecer_promos |
| Order creation | Solo en: compra_confirmada, timer_sinpack, timer_pendiente |
| Timer start | Al transicionar a collecting_data |
| Handoff | Confidence < 80%, intent fallback, o clasificacion HANDOFF |

### Hardcoded

- 8 campos criticos para completar ingest
- Patterns de oferta de compra (regex)
- Threshold de confidence: 80%
- Substring limit: 100 chars para debug

---

## 2. somnio-orchestrator.ts (642 lineas) — State Machine

### Pipeline de 10 pasos

```
1. Check auto-triggers (puede override intent detectado)
2. Validate transition (TransitionValidator)
3. Extract data (solo en collecting_data)
4. Detect pack selection (intent name > message patterns)
5. Select templates (TemplateManager, split combos hola+x)
6. Determine next mode (state machine)
7. Check order creation
8. Build tool calls (CRM update, order signal)
9. Build state updates
10. Determine action type (handoff/execute_tool/proceed)
```

### Pack Detection Patterns (hardcoded)

```
1x: /\b1x\b/, /\buno\s*solo\b/, /\buna?\s*unidad\b/, /\bel\s*(de)?\s*uno\b/, etc.
2x: /\b2x\b/, /\bdos\s*unidades?\b/, /\bel\s*(de)?\s*dos\b/, /\bquiero\s*(el)?\s*2\b/, etc.
3x: /\b3x\b/, /\btres\s*unidades?\b/, /\bel\s*(de)?\s*tres\b/, /\bquiero\s*(el)?\s*3\b/, etc.
```

### Blocked Transition Responses (hardcoded)

- resumen_x sin ofrecer_promos: "Primero dejame mostrarte las promociones..."
- compra_confirmada sin resumen: "Antes de confirmar, necesito que elijas cual pack..."

---

## 3. prompts.ts — 3 Prompts de Claude

### INTENT_DETECTOR_PROMPT
- Clasifica mensaje en 1 de 36 intents
- Output: `{ intent, confidence (0-100), alternatives[], reasoning }`
- Incluye reglas para combos hola+X, pack detection, fallback
- Escala: 90-100 (claro), 70-89 (probable), 50-69 (ambiguo), 0-49 (incierto)

### ORCHESTRATOR_PROMPT
- Producto: Somnio (90 comprimidos, melatonina+magnesio)
- Precios: 1x=$77,900, 2x=$109,900, 3x=$139,900
- Estados: conversacion → collecting_data → ofrecer_promos → resumen → confirmado
- 5 campos criticos + 4 adicionales
- Output: `{ action, nextMode, response, toolCalls[], extractedData }`

### DATA_EXTRACTOR_PROMPT
- 10 campos: 5 criticos + 5 adicionales
- Normalizacion: telefono (57XXXXXXXXXX), ciudad (proper case), direccion (abreviaturas)
- Output: `{ extracted{}, confidence{} }`

---

## 4. message-classifier.ts — Clasificador de Mensajes (Claude)

- Modelo: claude-sonnet-4-20250514
- Max tokens: 256
- Categorias: datos, pregunta, mixto, irrelevante
- Retry: 1 vez en APIError
- Prompt incluye ejemplos especificos

---

## 5. data-extractor.ts — Extractor de Datos (Claude)

- Modelo: claude-sonnet-4-20250514
- Extrae 10 campos con confidence por campo
- Detecta negaciones ("no tengo correo" → correo="N/A")
- Normaliza: telefono, ciudad, direccion, departamento, barrio
- Infiere departamento desde ciudad (40+ mappings)
- Funciones helper:
  - `mergeExtractedData()` — merge no-destructivo
  - `hasMinimumData()` — 5 campos criticos
  - `hasCriticalData()` — 5 criticos + 3 adicionales = 8
  - `hasCriticalDataInter()` — 4 criticos + 2 adicionales = 6
  - `isDataComplete()` — dispatcher por modo

---

## 6. message-category-classifier.ts — SILENCIOSO/RESPONDIBLE/HANDOFF (puro TS)

**NO usa Claude.** 100% deterministico.

```
Regla 0: Acknowledgment (ok, jaja, gracias, 👍) en modo no-confirmatorio → SILENCIOSO
Regla 1: Intent en HANDOFF_INTENTS (asesor, queja, cancelar, no_interesa, fallback) → HANDOFF
Regla 1.5: Confidence < 80% → HANDOFF
Regla 2: Default → RESPONDIBLE
```

Patterns anclados (^...$) para evitar falsos positivos como "quiero un asesor".

---

## 7. ingest-manager.ts — Acumulacion Silenciosa

Coordina el modo collecting_data:

```
mensaje → MessageClassifier → datos/pregunta/mixto/irrelevante
  datos → DataExtractor → merge → check completion → silent/complete
  pregunta → respond (sale del ingest, va a intent flow)
  mixto → extract + respond
  irrelevante → ignore
```

- Ruta 2 (ofi inter): Si extrajo ciudad SIN direccion/barrio → preguntar preferencia
- Timer: 6min (partial data) o 10min (no data)
- State: `{ active, startedAt, firstDataAt, fieldsCollected[] }`

---

## 8. config.ts — Configuracion Central

### 10 Modos

| Modo | Proposito |
|------|-----------|
| bienvenida | Primer contacto |
| conversacion | Estado inicial, responder preguntas |
| collecting_data | Capturando datos para orden |
| collecting_data_inter | Variante oficina inter |
| ofrecer_promos | Mostrando packs 1x/2x/3x |
| resumen | Cliente eligio pack, mostrando resumen |
| confirmado | Compra confirmada, orden creada |
| pedido_sinpack | Timer L3: timeout sin pack |
| pedido_pendiente | Timer L4: pack elegido, valor=0 |
| handoff | Transferido a humano |

### 24 Transiciones Validas

```
bienvenida      → [conversacion, collecting_data, collecting_data_inter, handoff]
conversacion    → [conversacion, collecting_data, collecting_data_inter, handoff]
collecting_data → [collecting_data, collecting_data_inter, ofrecer_promos, handoff]
collecting_data_inter → [collecting_data_inter, collecting_data, ofrecer_promos, handoff]
ofrecer_promos  → [resumen, pedido_sinpack, handoff]
resumen         → [confirmado, pedido_pendiente, ofrecer_promos, handoff]
confirmado      → [conversacion, handoff]
pedido_sinpack  → [conversacion, handoff]
pedido_pendiente → [conversacion, handoff]
handoff         → [] (terminal)
```

### Modelos Claude
- Intent Detector: claude-sonnet-4-5, max 256 tokens
- Orchestrator: claude-sonnet-4-5, max 1024 tokens

### Confidence Thresholds
- 85+: Proceder
- 60-84: Re-analizar
- 40-59: Pedir clarificacion
- <40: Handoff

---

## 9. intents.ts — 36 Intents

### Por Categoria

| Categoria | Cantidad | Intents |
|-----------|----------|---------|
| Informativos | 13 | hola, precio, info_promociones, contenido_envase, como_se_toma, modopago, metodos_de_pago, modopago2, envio, invima, ubicacion, contraindicaciones, sisirve |
| Flujo Compra | 8 | captura_datos_si_compra, ofrecer_promos, resumen_1x, resumen_2x, resumen_3x, compra_confirmada, no_confirmado, no_interesa |
| Escape | 4 | fallback, asesor, queja, cancelar |
| Combinaciones | 11 | hola+precio, hola+como_se_toma, hola+envio, hola+modopago, hola+ubicacion, hola+contenido_envase, hola+invima, hola+contraindicaciones, hola+sisirve, hola+info_promociones, hola+captura_datos_si_compra |

### Estructura de cada intent
```typescript
{ name, description, examples[], triggers?, category }
```

### Helpers
- `isCombinationIntent()` — detecta hola+X
- `splitCombinationIntent()` — separa en [primary, secondary]

---

## 10. constants.ts — Constantes

| Constante | Valor | Uso |
|-----------|-------|-----|
| CRITICAL_FIELDS | [nombre, telefono, direccion, ciudad, departamento] | Minimo para orden |
| MIN_FIELDS_FOR_AUTO_PROMO | 8 | Auto ofrecer_promos |
| MIN_FIELDS_FOR_AUTO_PROMO_INTER | 6 | Auto ofrecer_promos (ofi inter) |
| LOW_CONFIDENCE_THRESHOLD | 80 | Handoff threshold |
| HANDOFF_INTENTS | {asesor, queja, cancelar, no_interesa, fallback} | Escalacion |
| CONFIRMATORY_MODES | {resumen, collecting_data, collecting_data_inter, confirmado} | Ack→confirmacion |
| ACKNOWLEDGMENT_PATTERNS | 3 regex (ok/si/jaja, gracias, emojis) | Deteccion silencio |
| SILENCE_RETAKE_DURATION_MS | 90,000 | Timer retoma |
| BLOCK_MAX_TEMPLATES | 3 | Max templates por bloque |
| BLOCK_MAX_INTENTS | 3 | Max intents por bloque |
| OFI_INTER_PATTERNS | 11 regex | Deteccion ofi inter |

---

## 11. transition-validator.ts — 5 Reglas de Transicion

| Intent | Regla | Condicion |
|--------|-------|-----------|
| resumen_1x | requiredIntents | ofrecer_promos visto |
| resumen_2x | requiredIntents | ofrecer_promos visto |
| resumen_3x | requiredIntents | ofrecer_promos visto |
| compra_confirmada | requiredIntentsAny | algun resumen_Xx visto |
| ofrecer_promos | minFields | 8+ campos completos |

### Auto-triggers
- 8+ campos + ofrecer_promos no visto → auto-trigger ofrecer_promos
- Mode-aware: 6+ campos en collecting_data_inter

---

## 12. block-composer.ts — Composicion de Bloques

### Algoritmo de 7 pasos

```
1. Cap intents (max 3)
2. Extract CORE templates (1 per intent, lowest orden)
3. Fill block with CORE first
4. Build pool (non-CORE + pending from previous cycle)
5. Deduplicate pool (prefer higher priority, then pending)
6. Sort pool (CORE > COMP > OPCIONAL, pending first, lower orden)
7. Fill block from pool (up to max 3)
   - OPCIONAL overflow → dropped (permanente)
   - CORE/COMP overflow → pending (siguiente ciclo)
```

### Prioridades
- CORE (rank 0) — template principal por intent
- COMPLEMENTARIA (rank 1) — info adicional
- OPCIONAL (rank 2) — nice-to-have, se puede perder

---

## 13. no-repetition-filter.ts — Filtro Anti-Repeticion

### 3 Niveles Escalating

```
Level 1: ID lookup (instant, $0)
  → templateId en templatesEnviados? → FILTERED

Level 2: Minifrase comparison (~$0.0003)
  → Claude Sonnet compara tema vs temas previos
  → ENVIAR / NO_ENVIAR / PARCIAL

Level 3: Full content check (si Level 2 = PARCIAL)
  → Claude Sonnet compara contenido completo
  → ENVIAR / NO_ENVIAR
```

- **Fail-open**: Cualquier error → ENVIAR (mejor repetir que omitir)
- Modelo: claude-sonnet-4-20250514 (no Haiku pese a comentarios)
- Cache de minifrases a nivel de instancia

---

## 14. template-manager.ts — Gestion de Templates

### Flujo de seleccion

```
1. Load templates from DB (cache 5 min)
2. Determine first vs repeated visit
3. Filter: agent_id + intent + visit_type='primera_vez'
4. Exclude already-sent (by ID OR content)
5. Sort by orden
6. If repeated + USE_NO_REPETITION: cap at top 2
7. Process: variable substitution + optional paraphrase
```

### Variable Substitution
- `{{nombre}}`, `{{ciudad}}`, `{{pack}}` → valores del contexto
- Paraphrase (opcional): Claude reescribe para repeticiones

---

## Llamadas a Claude por Turn

| Componente | Modelo | Cuando | Tokens max |
|------------|--------|--------|------------|
| MessageClassifier | Sonnet | Solo en collecting_data | 256 |
| DataExtractor | Sonnet | Solo en collecting_data (datos/mixto) | ~500 |
| IntentDetector | Sonnet | Siempre (excepto timer-forced) | 256 |
| NoRepetition L2 | Sonnet | Por cada template candidato | 256 |
| NoRepetition L3 | Sonnet | Solo si L2=PARCIAL | 256 |

**Peor caso por turn**: 5 llamadas a Claude (classifier + extractor + intent + 2x norep)
**Mejor caso**: 1 llamada (solo intent detection en modo conversacion)

---

## Lo que v2 debe cambiar fundamentalmente

1. **UNA sola llamada Claude** en Capa 1 (intent + datos + clasificacion) vs 3 separadas
2. **Sin modos rigidos** — fase del funnel se computa del estado
3. **Sin transiciones hardcoded** — reglas de decision basadas en estado completo
4. **Pack selection es dato** — no intent (resumen_2x desaparece)
5. **No hay collecting_data mode** — siempre se extraen datos + intent
6. **Interrupcion check-before-send** — verificar inbox antes de cada template
7. **Acumulacion de mensajes** — si se aborta, combinar mensajes en un solo input
