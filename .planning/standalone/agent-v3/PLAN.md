# Somnio Sales Agent v3 — Plan de Implementacion

## Meta

Construir el agente v3 completo como modulo independiente.
v1 permanece intacto en produccion. v3 se activa con feature flag.

## Arquitectura

v3 es un modulo autocontenido en `src/lib/agents/somnio-v3/`.
Reutiliza de v1: TemplateManager, normalizers, variable-substitutor, block-composer, char-delay, OrderCreator.
Reutiliza infraestructura: UnifiedEngine, ProductionAdapters, SessionManager, Inngest.
Pipeline nuevo: Comprehension -> StateMerge -> Ingest -> Gates -> Decision -> Response.

## Archivos a Crear

```
src/lib/agents/somnio-v3/
  types.ts                  # Estado, Decision, gates, interfaces
  constants.ts              # Campos criticos, precios, patterns, intents
  config.ts                 # AgentConfig para registry
  comprehension-schema.ts   # Zod schema para structured output
  comprehension-prompt.ts   # System prompt de comprehension
  comprehension.ts          # C2: Claude Haiku structured output
  state.ts                  # C3: merge + C5: gates
  ingest.ts                 # C4: logica de ingest silencioso
  decision.ts               # C6: motor de decision R0-R9
  response.ts               # C7: composicion de respuesta
  somnio-v3-agent.ts        # Pipeline principal (C0.5 -> C11)
  index.ts                  # Registro en agentRegistry
```

## Archivos a Modificar

```
src/lib/agents/production/webhook-processor.ts  # Feature flag USE_SOMNIO_V3 + tag RECO
src/inngest/functions/agent-timers.ts           # Timers para v3 (agent_id aware)
```

## Tareas por Wave

### Wave 1: Tipos y Constantes (sin dependencias)

**T1.1** `types.ts` — Interfaces completas
- AgentState: datos, pack, ofiInter, historial, timing, turnCount
- Decision: accion, templateIntents, extraContext, timerSignal, reason
- Gates: datosOk, packElegido (computados)
- IngestResult: accion (silent/respond/complete/ask_ofi_inter), timerSignal
- TimerSignal: type (start/cancel/reevaluate), level, reason

**T1.2** `constants.ts` — Constantes v3
- CRITICAL_FIELDS_NORMAL: 6 (nombre, apellido, telefono, direccion, ciudad, departamento)
- CRITICAL_FIELDS_OFI_INTER: 5 (sin direccion)
- V3_INTENTS: 20 intents (11 info + 4 accion + 4 escape + 1 fallback)
- ESCAPE_INTENTS: Set
- NEVER_SILENCE_INTENTS: Set
- PACK_PRICES: Record
- ACK_PATTERNS: regex[]
- OFI_INTER_PATTERNS: regex[]
- CONFIRMATORY_CONTEXTS: Set

**T1.3** `config.ts` — Configuracion del agente
- id: 'somnio-sales-v3'
- Modelo comprehension: claude-haiku-4-5
- Registrar en agentRegistry

**T1.4** `comprehension-schema.ts` — Zod schema
- MessageAnalysis: intent (primary, secondary, confidence, reasoning)
- extracted_fields: todos los campos de datos
- classification: category (datos/pregunta/mixto/irrelevante), sentiment, is_acknowledgment
- negations: campos negados

### Wave 2: Comprehension + State (depende de Wave 1)

**T2.1** `comprehension-prompt.ts` — System prompt
- Lista de 20 intents con descripciones y ejemplos
- Instrucciones de extraccion de datos
- Instrucciones de clasificacion
- Formato structured output

**T2.2** `comprehension.ts` — Capa 2
- analyzeMessage(message, history, datosExistentes): MessageAnalysis
- Claude Haiku 4.5, structured output via Zod
- Prompt caching (cache_control ephemeral)
- safeParse + sanitizacion de intents invalidos
- 1 llamada por turno

**T2.3** `state.ts` — Capa 3 + Capa 5
- mergeAnalysis(estado, analysis): nuevo estado (inmutable)
  - Merge datos (no sobrescribir null sobre existentes)
  - Actualizar pack si extraido
  - Detectar ofiInter
  - Normalizar (telefono, ciudad, departamento inferido)
  - Marcar negaciones
  - Actualizar intentsVistos, turnCount
- computeGates(estado): { datosOk, packElegido }
  - datosOk: todos los campos criticos llenos (mode-aware)
  - packElegido: pack !== null
- camposFaltantes(estado): string[]
- createInitialState(): AgentState

### Wave 3: Ingest + Decision (depende de Wave 2)

**T3.1** `ingest.ts` — Capa 4
- evaluateIngest(analysis, estado, gates): IngestResult
- Si enCaptura=true:
  - datos -> silent + reevaluar timer
  - pregunta -> respond
  - mixto -> respond + acumular
  - irrelevante -> silent (sin efecto en timer)
- Si enCaptura=false: passthrough
- Auto-trigger: datosOk + !packElegido -> OFRECER_PROMOS
- Auto-trigger: datosOk + packElegido -> MOSTRAR_CONFIRMACION
- Route ofi inter: ciudad sin direccion
- Timer signals: start L0/L1/L2, cancel on complete

**T3.2** `decision.ts` — Capa 6
- decide(analysis, estado, gates, ingestResult): Decision
- Reglas R0-R9 del CONTEXT.md:
  - R0: confidence < 80 + otro -> handoff
  - R1: escape intents -> handoff + cancel timers
  - R2: no_interesa -> responder despedida + cancel
  - R3: ack + no confirmatorio -> silencio + timer silence
    - Excepcion: post-promos -> no silenciar
    - Excepcion: post-confirmacion -> tratar como confirmar
  - R4: rechazar -> farewell + cancel
  - R5: confirmar + datosOk + packElegido -> crear orden
    - sin datosOk -> pedir datos
    - sin pack -> ofrecer promos
  - R6: seleccion_pack + datosOk -> mostrar confirmacion
    - sin datosOk -> pedir datos (guardar pack)
  - R7: quiero_comprar + datosOk -> ofrecer promos
    - sin datosOk -> pedir datos + entrar captura
  - R8: datosOk + packElegido + promos mostradas -> auto confirmacion
  - R9: default -> responder intent + secondary
- Timer signals integrados en decision
- Timer expirado signals (L0-L4, silence)

### Wave 4: Response + Agent (depende de Wave 3)

**T4.1** `response.ts` — Capa 7
- composeResponse(decision, estado, workspaceId): ResponseResult
- Resolver templates desde DB (TemplateManager con agentId='somnio-sales-v3')
- Fallback a agentId='somnio-sales-v1' si v3 no tiene templates propios
- Sustitucion de variables
- No-repeticion: templateId en templatesMostrados -> flag para parafraseo
- Max 3 templates por bloque (block-composer)

**T4.2** `somnio-v3-agent.ts` — Pipeline completo
- processMessage(input): V3AgentOutput
- Pipeline:
  1. C2: comprehension.analyzeMessage()
  2. C3: state.mergeAnalysis()
  3. C4: ingest.evaluateIngest()
  4. Si ingest dice 'silent' -> return (no responder)
  5. C5: state.computeGates()
  6. C6: decision.decide()
  7. Si decision dice 'silence' -> return con timerSignal
  8. Si decision dice 'handoff' -> return handoff
  9. C7: response.composeResponse()
  10. Return output con templates, stateUpdates, timerSignals, orderData
- Serializar/deserializar estado desde session_state

**T4.3** `index.ts` — Registro
- Import config
- Registrar en agentRegistry
- Exportar componentes

### Wave 5: Integracion (depende de Wave 4)

**T5.1** Webhook processor — Feature flag
- Agregar 'RECO' a tags de skip
- Feature flag USE_SOMNIO_V3: si true, usar v3 para nuevas conversaciones
- Import somnio-v3 barrel para trigger self-registration
- Routing: if USE_SOMNIO_V3 -> instanciar con somnio-v3 config

**T5.2** Templates v3 — Seed migration
- Crear migration que copie templates de v1 a v3 (cambiar agent_id)
- O: hacer que v3 use templates de v1 como fallback (mas simple para MVP)

**T5.3** Inngest timers v3
- Adaptar agent-timers.ts para ser agent_id-aware
- O: crear funciones separadas para v3 timers
- Misma logica de waitForEvent + timeout

## Criterios de Exito

1. v3 compila sin errores TypeScript
2. v1 sigue funcionando identico (zero changes a archivos v1)
3. Pipeline v3 procesa un mensaje y retorna decision correcta
4. Feature flag desactivado por defecto
5. Templates v3 se cargan (propios o fallback a v1)

## Complejidad Estimada

- ~12 archivos nuevos, ~2 archivos modificados
- ~1500-2000 lineas de codigo nuevo
- Reutiliza ~3000 lineas de v1 (normalizers, templates, orders, adapters)

## Decisiones de Diseno

1. **Sin interruption system** — se agrega despues con pruebas en sandbox
2. **Templates fallback a v1** — para MVP, v3 usa templates de v1
3. **Estado en session_state existente** — usar columnas existentes + JSONB para extras v3
4. **Pre-send check simple** — reusar hasNewInboundMessage de ProductionMessagingAdapter
5. **Comprehension = unica llamada a Claude** — Haiku 4.5, structured output
6. **Decision 100% determinista** — sin Claude en motor de decision
