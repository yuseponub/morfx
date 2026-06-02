# V3 Production Integration — CONTEXT

## Objetivo

Conectar el agente v3 a produccion como sistema completamente independiente del v1.
El v1 queda vivo pero desconectable — plug in/out via configuracion.

**Principio rector:** Todo lo que funciona en sandbox DEBE funcionar identico en produccion. Cero improvisacion. Cero asunciones.

---

## Estado Actual

### V3 en Sandbox (FUNCIONAL)
- Pipeline completo: C2 (comprehension Haiku) → C3 (merge) → C5 (gates) → Guards → Sales Track → Response Track
- 22 intents, 20 acciones, 9 niveles de timer (L0-L8)
- Templates independientes en DB con `agent_id='somnio-sales-v3'` (quick-025)
- Block composition integrada en response-track (saludo combined path)
- System events (timer_expired) procesados sin comprehension
- Estado serializado con prefijo `_v3:` en datosCapturados
- Interruption + message accumulation funcionales (quick-023, quick-024)
- Debug panel completo con sales track info + response track info

### V1 en Produccion (ACTIVO)
- `UnifiedEngine` hardcodeado a `new SomnioAgent()` (v1)
- 5 production adapters: Storage, Timer, Messaging, Orders, Debug
- 5 Inngest timer functions: ingestTimer, dataCollectionTimer, promosTimer, resumenTimer, silenceTimer
- Session management via `SessionManager` (agent_sessions + session_state + agent_turns)
- Media gate (Phase 32): audio transcription, sticker vision, reaction mapping
- Pre-send check (Phase 31): interruption por mensaje nuevo durante delay
- No-repetition filter (Phase 34): 3 niveles, feature flag `USE_NO_REPETITION`
- Webhook: `360dialog → route.ts → webhook-handler.ts → Inngest → agent-production.ts → webhook-processor.ts → UnifiedEngine`

### Mecanismo Plug In/Out (YA EXISTE)
- `workspace_agent_config.conversational_agent_id` — default `'somnio-sales-v1'`
- Campo ya existe en la tabla, solo hay que leerlo en webhook-processor.ts
- Actualmente webhook-processor.ts IGNORA este campo — siempre usa v1

---

## Gap Analysis: V3 Sandbox vs Produccion

### GAP 1: No existe runner de produccion para v3

**Problema:** `UnifiedEngine` es especifico de v1:
- Constructor: `this.somnioAgent = new SomnioAgent()` (hardcoded v1)
- Input: `SomnioAgent.processMessage()` recibe `{ message, session: AgentSessionLike, history, turnNumber, forceIntent }`
- V3 `processMessage()` recibe `V3AgentInput` con campos planos: `{ message, currentMode, intentsVistos, templatesEnviados, datosCapturados, packSeleccionado, accionesEjecutadas, history, workspaceId, systemEvent }`
- Los outputs son completamente diferentes (SomnioAgentOutput vs V3AgentOutput)

**Solucion:** Crear `V3ProductionRunner` — thin I/O runner especifico para v3:
- Usa los MISMOS production adapters (Storage, Timer, Messaging, Orders, Debug)
- Lee session via StorageAdapter → convierte a V3AgentInput (deserializar _v3: keys)
- Llama v3 `processMessage()`
- Convierte V3AgentOutput → llamadas a adapters

**Archivo:** `src/lib/agents/engine/v3-production-runner.ts`

### GAP 2: Block composition duplicada

**Problema:** V3 hace block composition en `resolveResponseTrack()` (composeBlock + saludo combined path). UnifiedEngine TAMBIEN hace block composition (lineas 257-472). Si v3 pasa por UnifiedEngine, los templates se componen dos veces.

**Solucion:** V3ProductionRunner NO hace block composition extra. Los templates que v3 retorna ya estan compuestos. El runner solo:
1. Recibe `V3AgentOutput.templates` (ya compuesto por response-track)
2. Los pasa directo al messaging adapter para envio
3. Aplica no-repetition filter ENTRE response-track y messaging (si USE_NO_REPETITION=true)
4. Aplica pre-send check durante el envio

### GAP 3: Serialization/deserialization de estado v3

**Problema:** V3 usa `serializeState()`/`deserializeState()` con prefijo `_v3:` en datosCapturados para persistir:
- `_v3:accionesEjecutadas` (array serializado)
- `_v3:templatesMostrados` (array serializado)
- `_v3:ofiInter` (boolean)
- `_v3:enCapturaSilenciosa` (boolean)
- `_v3:negaciones` (object serializado)
- `_v3:turnCount` (number)

En sandbox, esto funciona porque SandboxState.datosCapturados es un Record plano.
En produccion, `session_state.datos_capturados` es JSONB — funciona igual.

**Solucion:** Reusar serialize/deserialize tal cual. El runner lee `session_state.datos_capturados` (JSONB) y lo pasa directo como `datosCapturados` a V3AgentInput. Los `_v3:` keys ya estan ahi.

Campos adicionales:
- `session_state.intents_vistos` → `V3AgentInput.intentsVistos`
- `session_state.templates_enviados` → `V3AgentInput.templatesEnviados`
- `session_state.pack_seleccionado` → `V3AgentInput.packSeleccionado`
- `agent_sessions.current_mode` → `V3AgentInput.currentMode`
- `session_state.datos_capturados._v3:accionesEjecutadas` → `V3AgentInput.accionesEjecutadas`

El campo `accionesEjecutadas` existe como campo propio de SandboxState (quick-009), pero en produccion se serializa en datosCapturados. El runner debe:
1. Leer `datos_capturados['_v3:accionesEjecutadas']` → parse JSON → pasar como `accionesEjecutadas`
2. O usar `session_state.acciones_ejecutadas` si se crea columna dedicada (decision pendiente)

**Recomendacion:** Usar `_v3:accionesEjecutadas` en datos_capturados tal como sandbox. Cero migraciones de schema extra. Si en el futuro se quiere columna dedicada, es refactor interno.

### GAP 4: Timer system incompatible

**Problema:** V1 y V3 tienen sistemas de timer completamente diferentes:

| Aspecto | V1 | V3 |
|---------|----|----|
| Niveles | L0-L4 (5 niveles) | L0-L8 (9 niveles) |
| Evaluacion | `TIMER_LEVELS[].evaluate(ctx)` con TimerEvalContext | `resolveSalesTrack()` con `{ type: 'timer_expired', level }` |
| Acciones | `send_message`, `transition_mode`, `create_order` | TipoAccion via sales-track → response-track → templates |
| State format | `TimerEvalContext { fieldsCollected, currentMode, packSeleccionado, promosOffered }` | `AgentState` completo deserializado |
| forceIntent | Si (timer → engine.processMessage con forceIntent) | No. V3 usa `systemEvent: { type: 'timer_expired', level }` |
| Inngest functions | 5 funciones separadas por tipo | Necesita 1 funcion que llame v3 con systemEvent |

**V3 timer flow en sandbox:**
1. Timer expira → sandbox UI envia systemEvent `{ type: 'timer_expired', level: N }`
2. `processMessage()` detecta systemEvent → entra en `processSystemEvent()`
3. `processSystemEvent()` hace: deserialize → computeGates → resolveSalesTrack(timer event) → resolveResponseTrack
4. Sales track consulta la transition table para timers (ej: L5 en initial → accion: retoma)
5. Response track carga templates para la accion
6. Output: messages + templates + newMode + timerSignals + shouldCreateOrder

**Solucion:** Crear Inngest timer function(s) para v3:
- Opcion A: 1 funcion generica que recibe sessionId + level → llama v3ProductionRunner con systemEvent
- Opcion B: N funciones por tipo (como v1)

**Recomendacion:** Opcion A — 1 funcion generica `v3-timer`. V3 ya tiene toda la logica de evaluacion de nivel internamente. La funcion Inngest solo necesita:
1. waitForEvent (customer.message) con timeout segun nivel
2. Si timeout: leer session → construir V3AgentInput con systemEvent → llamar v3 processMessage → enviar respuesta

El ProductionTimerAdapter actual emite eventos Inngest especificos (`agent/collecting_data.started`, `agent/promos.offered`, etc.). V3 necesita sus propios eventos o adaptar el timer adapter.

**V3 timer signals (de sales-track):**
- `{ type: 'start', level: 'L0' }` — iniciar timer de nivel L0
- `{ type: 'cancel', reason: 'customer_replied' }` — cancelar timer activo
- `{ type: 'start', level: 'L5' }` — silence retake timer

Estos signals necesitan mapearse a eventos Inngest en el V3 ProductionTimerAdapter.

### GAP 5: webhook-processor.ts no rutea por agent_id

**Problema:** `webhook-processor.ts` siempre importa `../somnio` (v1) y crea `new UnifiedEngine()`:
```typescript
// Linea 178: siempre v1
await import('../somnio')
const { UnifiedEngine } = await import('../engine/unified-engine')
```

**Solucion:** Leer `conversational_agent_id` de `workspace_agent_config` y rutear:
```typescript
const agentConfig = await getWorkspaceAgentConfig(workspaceId)
const agentId = agentConfig?.conversational_agent_id ?? 'somnio-sales-v1'

if (agentId === 'somnio-sales-v3') {
  // V3 path
  await import('../somnio-v3')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, { workspaceId })
  engineOutput = await runner.processMessage(...)
} else {
  // V1 path (unchanged)
  await import('../somnio')
  const { UnifiedEngine } = await import('../engine/unified-engine')
  const engine = new UnifiedEngine(adapters, { workspaceId })
  engineOutput = await engine.processMessage(...)
}
```

### GAP 6: agent-timers.ts hardcodeado a v1

**Problema:** `callEngineWithForceIntent()` en agent-timers.ts siempre usa v1:
```typescript
await import('@/lib/agents/somnio')
const engine = new UnifiedEngine(adapters, { workspaceId })
```

**Solucion:** Los timers de v1 siguen funcionando para v1. Crear timers de v3 separados que llamen al V3ProductionRunner con systemEvent.

### GAP 7: Session agent_id

**Problema:** Las sessions en `agent_sessions` tienen `agent_id`. V1 usa `'somnio-sales-v1'`, v3 necesita `'somnio-sales-v3'`. Actualmente el SessionManager crea sessions con el agent_id del config.

**Solucion:** SessionManager ya acepta agent_id parametrizado. Verificar que getOrCreateSession use el agent_id correcto segun el runner.

### GAP 8: No-repetition filter y pre-send check

**Problema:** UnifiedEngine aplica no-repetition filter (Phase 34) y pre-send check (Phase 31) DESPUES de block composition. V3 hace block composition en response-track pero no tiene no-rep ni pre-send.

**Solucion:** V3ProductionRunner aplica:
1. No-repetition filter sobre `V3AgentOutput.templates` (ya compuestos) — misma logica que UnifiedEngine
2. Pre-send check durante envio via MessagingAdapter — ya implementado en el adapter

### GAP 9: Silence detection (Phase 30)

**Problema:** V1 tiene `MessageClassifier.classifyMessage()` que determina SILENCIOSO/RESPONDIBLE. V3 NO tiene clasificador — usa comprehension (C2) que detecta `acknowledgment` intent, y el sales-track decide si es silence o respond.

**Solucion:** V3 ya maneja silence naturalmente:
- Intent `acknowledgment` + no sales action = natural silence (0 templates)
- El V3ProductionRunner detecta esta situacion (messages.length === 0 + intent = acknowledgment) y emite silence timer signal si corresponde

Pero V3 tiene su propio mecanismo de silence via timer signals:
- Sales track emite `{ type: 'start', level: 'L5' }` para silencio (retoma timer)
- Esto lo produce el sales-track cuando el intent es `acknowledgment` en ciertas fases

El runner traduce `timerSignals[].level === 'L5'` → emite `agent/silence.detected` Inngest event.

---

## Arquitectura Propuesta

### Diagrama de flujo v3 en produccion

```
WhatsApp msg → webhook → Inngest → media-gate → webhook-processor.ts
                                                      ↓
                                        [leer conversational_agent_id]
                                                      ↓
                              ┌────────────────┬──────┴──────────────────┐
                              │ somnio-sales-v1 │     somnio-sales-v3    │
                              │                 │                        │
                              │ UnifiedEngine   │  V3ProductionRunner    │
                              │ + SomnioAgent   │  + v3 processMessage   │
                              │                 │                        │
                              │ forceIntent     │  systemEvent           │
                              │ for timers      │  for timers            │
                              │                 │                        │
                              │ v1 block comp   │  v3 response-track     │
                              │ in engine       │  (block ya compuesto)  │
                              └────────────────┴────────────────────────┘
                                                      ↓
                                        [production adapters compartidos]
                                        Storage | Timer | Messaging | Orders | Debug
```

### Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| `src/lib/agents/engine/v3-production-runner.ts` | Thin I/O runner para v3 (equivalente a UnifiedEngine pero para v3) |
| `src/inngest/functions/agent-timers-v3.ts` | Inngest timer functions para v3 (systemEvent en vez de forceIntent) |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/agents/production/webhook-processor.ts` | Rutear por `conversational_agent_id`: v1 → UnifiedEngine, v3 → V3ProductionRunner |
| `src/lib/agents/engine-adapters/production/timer.ts` | Adapter v3 timer signals → Inngest events (o crear V3TimerAdapter separado) |
| `src/inngest/functions/index.ts` | Exportar nuevas timer functions v3 |

### Archivos que NO tocar

| Archivo | Razon |
|---------|-------|
| `src/lib/agents/engine/unified-engine.ts` | Es del v1, sigue funcionando |
| `src/lib/agents/somnio/**` | Codigo v1, produccion activa |
| `src/lib/agents/somnio-v3/**` | Ya funcional en sandbox, no necesita cambios para produccion |
| `src/lib/agents/somnio/template-manager.ts` | Generico, lo usan ambos |
| `src/lib/agents/somnio/block-composer.ts` | Generico, lo usan ambos |
| `src/lib/agents/somnio/no-repetition-filter.ts` | Generico, reutilizable |
| `src/lib/agents/somnio/char-delay.ts` | Generico, reutilizable |
| `src/lib/agents/session-manager.ts` | Generico, ya soporta multiples agent_id |
| `src/app/api/webhooks/whatsapp/route.ts` | No cambia — sigue emitiendo mismo Inngest event |
| `src/inngest/functions/agent-production.ts` | No cambia — sigue llamando webhook-processor |
| `src/inngest/functions/agent-timers.ts` | Timers v1, siguen funcionando para v1 |

---

## Mapeo Detallado: V3ProductionRunner

### Input: Session → V3AgentInput

```typescript
// Leer de production adapters
const session = await adapters.storage.getOrCreateSession(conversationId, contactId)
const history = await adapters.storage.getHistory(session.id)

// Mapear a V3AgentInput
const v3Input: V3AgentInput = {
  message: input.message,
  history,
  currentMode: session.current_mode,
  intentsVistos: session.state.intents_vistos ?? [],
  templatesEnviados: session.state.templates_enviados ?? [],
  datosCapturados: session.state.datos_capturados ?? {},
  packSeleccionado: session.state.pack_seleccionado as string | null,
  accionesEjecutadas: JSON.parse(
    session.state.datos_capturados?.['_v3:accionesEjecutadas'] ?? '[]'
  ),
  turnNumber: history.length + 1,
  workspaceId: input.workspaceId,
  // systemEvent: solo para timers (no para mensajes de usuario)
}
```

### Output: V3AgentOutput → Adapter Calls

```typescript
const output = await processMessage(v3Input)

// 1. Storage: save state
await adapters.storage.saveState(session.id, {
  datos_capturados: output.datosCapturados,
  templates_enviados: output.templatesEnviados,
  pack_seleccionado: output.packSeleccionado,
  // intents_vistos se actualiza via addIntentSeen
})

// 2. Storage: update mode
if (output.newMode && output.newMode !== session.current_mode) {
  await adapters.storage.updateMode(session.id, session.version, output.newMode)
}

// 3. Storage: add turn
await adapters.storage.addTurn({
  sessionId: session.id, turnNumber, role: 'user',
  content: input.message,
  intentDetected: output.intentInfo?.intent,
  confidence: output.intentInfo?.confidence,
  tokensUsed: output.totalTokens,
})

// 4. Storage: add intent
if (output.intentInfo?.intent) {
  await adapters.storage.addIntentSeen(session.id, output.intentInfo.intent)
}

// 5. Storage: handoff
if (output.newMode === 'handoff') {
  await adapters.storage.handoff(session.id, session.version)
}

// 6. Timer: emit signals
for (const signal of output.timerSignals) {
  adapters.timer.signal(signal)
}
// + lifecycle hooks (onCustomerMessage, onModeTransition, etc.)

// 7. Orders: create if needed
if (output.shouldCreateOrder && output.orderData) {
  await adapters.orders.createOrder({
    datosCapturados: output.orderData.datosCapturados,
    packSeleccionado: output.orderData.packSeleccionado,
    workspaceId, sessionId: session.id,
    valorOverride: output.orderData.valorOverride,
    isOfiInter: ..., cedulaRecoge: ...,
  })
}

// 8. Messaging: send templates
if (output.templates && output.templates.length > 0) {
  // v3 templates ya estan compuestos por response-track
  // Aplicar no-rep filter aqui si USE_NO_REPETITION=true
  // Enviar via messaging adapter (pre-send check incluido)
  await adapters.messaging.send({
    sessionId: session.id,
    conversationId: input.conversationId,
    messages: output.messages,
    templates: output.templates.map(t => ({
      id: t.templateId, content: t.content,
      contentType: t.contentType, delaySeconds: 0,
    })),
    workspaceId, phoneNumber: input.phoneNumber,
    triggerTimestamp: input.messageTimestamp,
  })
}

// 9. Assistant turn recording
if (sentMessages.length > 0) {
  await adapters.storage.addTurn({
    sessionId: session.id, turnNumber: turnNumber + 1,
    role: 'assistant', content: sentMessages.join('\n'),
  })
}
```

---

## Mapeo Detallado: V3 Timers en Produccion

### Timer Signals emitidos por V3

| Signal | Cuando | Inngest Event |
|--------|--------|---------------|
| `{ type: 'start', level: 'L0' }` | Entra en captura silenciosa con datos minimos | `agent/v3.timer.started` |
| `{ type: 'start', level: 'L1' }` | Entra en captura con datos parciales | `agent/v3.timer.started` |
| `{ type: 'start', level: 'L5' }` | Silence/acknowledgment detectado | `agent/v3.timer.started` |
| `{ type: 'cancel', reason: 'customer_replied' }` | Cliente envia nuevo mensaje | `agent/customer.message` (reusar v1) |
| `{ type: 'cancel', reason: 'ingest_complete' }` | Todos los campos recolectados | `agent/v3.timer.cancelled` |

### Inngest Timer Function V3

```typescript
// 1 funcion generica para todos los niveles
export const v3Timer = inngest.createFunction(
  { id: 'v3-timer', retries: 3 },
  { event: 'agent/v3.timer.started' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId, level, timerDurationMs } = event.data

    // Wait for customer message or timeout
    const reply = await step.waitForEvent('wait', {
      event: 'agent/customer.message',
      timeout: `${timerDurationMs}ms`,
      match: 'data.sessionId',
    })

    if (reply) return { status: 'responded' }

    // Timeout: call v3 with systemEvent
    await step.run('execute-timer', async () => {
      // Read session, build V3AgentInput with systemEvent
      // Call processMessage with { systemEvent: { type: 'timer_expired', level } }
      // Send response templates via WhatsApp
      // Save state updates
    })
  }
)
```

### Timer Duration por Nivel

| Nivel | Descripcion | Duration (preset: real) |
|-------|-------------|------------------------|
| L0 | Retoma datos minimos | 6 min |
| L1 | Retoma datos parciales | 4 min |
| L2 | Ofrecer promos | 10 min |
| L3 | Promos sin respuesta | 10 min |
| L4 | Pack sin confirmar | 10 min |
| L5 | Silence retake | 90 sec |
| L6 | Retoma datos implicito | 6 min |
| L7 | Retoma ofi inter | 4 min |
| L8 | Pedir datos quiero_comprar_implicito | 6 min |

**NOTA:** Estos durations los define el timer system del sandbox. Hay que extraer los valores exactos de `src/lib/sandbox/timer-config.ts` o equivalente para confirmar.

---

## Mapeo Detallado: Timer Adapter V3

El `ProductionTimerAdapter` actual emite eventos especificos de v1:
- `agent/collecting_data.started`
- `agent/promos.offered`
- `agent/resumen.started`
- `agent/ingest.started`
- `agent/ingest.completed`
- `agent/silence.detected`
- `agent/customer.message`

V3 necesita un timer adapter que:
1. Traduce V3 timer signals a eventos Inngest
2. Los timer signals vienen del sales-track, no del engine

**Opciones:**
- A: Crear `V3ProductionTimerAdapter` separado
- B: Extender `ProductionTimerAdapter` con logica v3
- C: El V3ProductionRunner maneja los timer signals directamente (sin adapter)

**Recomendacion:** Opcion A. Adapter separado, limpio, sin contaminar v1.

---

## Mapeo: ofiInter en produccion

V3 detecta ofi inter via 3 senales en comprehension:
1. `entrega_oficina` = true → ofiInter = true, mode = captura_inter
2. `menciona_inter` = true → sales action: ask_ofi_inter (pregunta al cliente)
3. `datos.ciudad` en CAPITAL_CITIES → sales action: ask_ofi_inter

El state `ofiInter` se serializa en `datos_capturados['_v3:ofiInter']`.
El mode `collecting_data_inter` se guarda en `agent_sessions.current_mode`.

Para ordenes ofi inter, V3ProductionRunner pasa `isOfiInter` y `cedulaRecoge` al OrdersAdapter:
```typescript
const isOfiInter = output.newMode === 'captura_inter' ||
  session.current_mode === 'captura_inter' ||
  output.datosCapturados['_v3:ofiInter'] === 'true'
const cedulaRecoge = output.datosCapturados.cedula_recoge
```

---

## Decisiones RESUELTAS

### D1: accionesEjecutadas storage → **B: Columna dedicada**
Agregar columna `acciones_ejecutadas JSONB DEFAULT '[]'` a `session_state`.
Requiere migracion SQL. Lo mas limpio.

### D2: Timer durations → **B: Reusar timer_preset con mapping v3 propio**
El preset (real/rapido/instantaneo) es un concepto de workspace compartido.
V3 tiene su propia tabla de duraciones por nivel en codigo, independiente de TIMER_LEVELS v1.
Cero campos nuevos en DB.

### D3: Eventos Inngest → **A: Eventos nuevos separados**
`agent/v3.timer.started`, `agent/v3.timer.cancelled`, etc.
Separacion total. V1 no se ve afectado.

### D4: No-repetition filter → **A: Aplicar en V3ProductionRunner**
TODAS las features de sandbox deben funcionar en produccion. Sin excepcion.

---

## Auditoria Completa: Features Sandbox → Produccion

### LISTAS (ya funcionan o estan en el pipeline v3 sin cambios)

| # | Feature | Como funciona en sandbox | Produccion equivalente | Status |
|---|---------|-------------------------|----------------------|--------|
| 1 | **Core Pipeline** (C2→C3→C5→Guards→Sales→Response) | v3 processMessage() | Mismo codigo, llamado desde V3ProductionRunner | ✅ READY |
| 2 | **Comprehension** (Haiku structured output) | comprehend() con Zod schema | Mismo codigo | ✅ READY |
| 3 | **Bot Context** (recent bot messages para comprehension) | history filtrado a assistant | Production lee history de agent_turns via StorageAdapter | ✅ READY |
| 4 | **Block Composition** (saludo combined path, max 3) | response-track → composeBlock | Mismo codigo en response-track | ✅ READY |
| 5 | **Template Loading** (agent_id='somnio-sales-v3') | TemplateManager con cache 5min | Mismo TemplateManager, misma DB | ✅ READY |
| 6 | **Variable Substitution** ({{campos_faltantes}}, etc) | processTemplates() | Mismo codigo | ✅ READY |
| 7 | **Order Creation** (shouldCreateOrder flag) | SandboxOrdersAdapter | ProductionOrdersAdapter | ✅ READY |
| 8 | **Handoff** (R0 baja confianza, R1 escape intents) | newMode='handoff' → debug panel | StorageAdapter.handoff() + handoff-handler.ts | ✅ READY |
| 9 | **Ofi Inter** (3 senales, captura_inter mode) | Pipeline + _v3:ofiInter serialized | Mismo pipeline, _v3: keys en JSONB | ✅ READY |
| 10 | **State Serialization** (_v3: prefix) | serializeState/deserializeState | Mismo codigo, JSONB compatible | ✅ READY |
| 11 | **Acciones Ejecutadas** (first-class field) | SandboxState.accionesEjecutadas | Columna dedicada en session_state (D1) | ✅ READY (post-migracion) |
| 12 | **Character Delay** (logarithmic curve) | calculateCharDelay() × slider | ProductionMessagingAdapter con responseSpeed | ✅ READY |
| 13 | **Media Gate** (audio/sticker/reaction/image) | N/A (sandbox es solo texto) | agent-production.ts processMediaGate() | ✅ READY |
| 14 | **Typing Indicator** | N/A (sandbox no usa) | webhook-processor.ts broadcast typing | ✅ READY |
| 15 | **sent_by_agent marking** | N/A | webhook-processor.ts post-processing | ✅ READY |
| 16 | **processed_by_agent marking** | N/A | webhook-processor.ts post-processing | ✅ READY |
| 17 | **WPP tag on order** | N/A | webhook-processor.ts post-order tagging | ✅ READY |
| 18 | **Session Persistence** | localStorage (browser) | SessionManager (agent_sessions + session_state) | ✅ READY |
| 19 | **Optimistic Locking** | N/A (single user) | SessionManager version conflict retry | ✅ READY |
| 20 | **Agent Enablement Check** | N/A (sandbox siempre enabled) | isAgentEnabledForConversation() | ✅ READY |
| 21 | **Skip Tags** (WPP, P/W, RECO) | N/A | conversationHasAnyTag() check | ✅ READY |

### NECESITAN CONSTRUIR

| # | Feature | Como funciona en sandbox | Que falta en produccion |
|---|---------|-------------------------|------------------------|
| 22 | **V3 Production Runner** | SomnioV3Engine (thin runner) | Crear `v3-production-runner.ts`: session → V3AgentInput, V3AgentOutput → adapter calls |
| 23 | **Agent Routing** (v1 vs v3) | Sandbox API route discrimina por agentId | webhook-processor.ts leer `conversational_agent_id` y rutear |
| 24 | **Timer System L0-L8** | IngestTimerSimulator (pure countdown) → systemEvent | Inngest function(s) v3: waitForEvent + timeout → call v3 con systemEvent |
| 25 | **Timer Adapter V3** | Timer signals → frontend countdown | V3ProductionTimerAdapter: timer signals → Inngest events |
| 26 | **No-Repetition Filter** | N/A en sandbox v3 (solo v1 engine) | Aplicar NoRepetitionFilter en V3ProductionRunner antes de enviar |
| 27 | **Pre-Send Check** | queuedMessagesRef en React | MessagingAdapter.send() ya lo tiene — solo necesita wiring correcto |
| 28 | **Message Accumulation** | queuedMessages state en React | Inngest concurrency=1 per conversation + re-processing natural |
| 29 | **Pending Templates** (interruption recovery) | Frontend maneja pending | ProductionStorageAdapter.savePendingTemplates() — wiring en runner |
| 30 | **Assistant Turn Recording** | Debug panel muestra turns | StorageAdapter.addTurn(role='assistant') despues de envio |
| 31 | **Silence Retake** (L5 specific behavior) | Timer L5 → systemEvent → retoma template | Inngest v3 timer con L5 → v3 processMessage con systemEvent |
| 32 | **acciones_ejecutadas column** | N/A | Migracion SQL: ALTER TABLE session_state ADD COLUMN |
| 33 | **Inngest Event Types** | N/A | Registrar `agent/v3.timer.started` etc en events.ts |
| 34 | **Inngest Function Registration** | N/A | Exportar v3 timer functions en inngest/functions/index.ts |
| 35 | **Timer Duration Mapping** | TIMER_DURATIONS object per preset | V3_TIMER_DURATIONS: mapping nivel × preset → duration en codigo |

### SANDBOX-ONLY (no necesitan produccion)

| # | Feature | Razon |
|---|---------|-------|
| S1 | Debug Panel v3 (sales track, response track, pipeline vis) | Solo para desarrollo/testing |
| S2 | Session Save/Load (localStorage) | Produccion usa DB |
| S3 | Response Delay Slider | Produccion usa responseSpeed de config |
| S4 | Timer Enable/Disable Toggle | Produccion siempre tiene timers |
| S5 | Timer Pause/Resume | Solo para debugging |
| S6 | CRM Agent dry-run mode | Produccion siempre es live |
| S7 | Token Warning (40K) | Solo para desarrollo |
| S8 | Turn Selector (navigate debug history) | Solo para debugging |
| S9 | Interrupciones Section (debug display) | Solo para debugging |
| S10 | Contexto Raw Section (JSON view) | Solo para debugging |

---

## Orden de Implementacion

### Fase 1: Foundation (migraciones + runner)
1. Migracion SQL: `acciones_ejecutadas JSONB DEFAULT '[]'` en session_state
2. **PAUSAR** — aplicar migracion en produccion
3. Crear `v3-production-runner.ts` (items #22, #27, #28, #29, #30 de la auditoria)
4. Crear `V3_TIMER_DURATIONS` mapping en constants (item #35)
5. Modificar `webhook-processor.ts` para rutear por `conversational_agent_id` (item #23)
6. Verificar que `workspace_agent_config.conversational_agent_id` funciona como se espera

### Fase 2: Timer System
1. Registrar eventos v3 en `inngest/events.ts` (item #33)
2. Crear `V3ProductionTimerAdapter` (item #25)
3. Crear `agent-timers-v3.ts` con funcion generica (items #24, #31)
4. Exportar en `inngest/functions/index.ts` (item #34)

### Fase 3: No-Repetition + Pending Templates
1. No-repetition filter en V3ProductionRunner (item #26)
2. Pending templates wiring (item #29)
3. Pre-send check verification (item #27)

### Fase 4: Deploy + Testing
1. Push a Vercel (v3 inactivo por default — conversational_agent_id='somnio-sales-v1')
2. Aplicar migracion de templates v3 si no aplicada
3. Cambiar config a v3 para workspace de prueba
4. Test flujo completo
5. Test timers
6. Test ofi inter
7. Test handoff
8. Test plug in/out

---

## Verificacion Post-Implementacion

1. `npx tsc --noEmit` — sin errores de tipo
2. V1 sigue funcionando exactamente igual (zero regression)
3. V3 procesa mensajes en produccion y envia respuestas correctas
4. Timers v3 funcionan (retoma, silence, promos timeout)
5. Ordenes se crean correctamente (incluido ofi inter)
6. Handoff funciona (baja confianza, escape intents)
7. Plug in/out: cambiar `conversational_agent_id` cambia de agente sin deploy
8. Media gate funciona con v3 (audio, stickers, reactions)
9. Pre-send check funciona (interruption durante delay)
10. `_v3:` keys se persisten y restauran correctamente entre turnos

---

## Interfaz V3AgentOutput (referencia rapida)

```typescript
interface V3AgentOutput {
  success: boolean
  messages: string[]                    // Contenido texto de cada template
  templates?: ProcessedMessage[]        // Templates ya compuestos (id, content, contentType, priority)
  newMode?: string                      // Nuevo mode para session

  // State updates para persistir
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>  // Incluye _v3: keys serializados
  packSeleccionado: string | null
  accionesEjecutadas: AccionRegistrada[]

  // Intent info
  intentInfo?: { intent, confidence, secondary?, reasoning?, timestamp }

  // Order
  totalTokens: number
  shouldCreateOrder: boolean
  orderData?: { datosCapturados, packSeleccionado, valorOverride? }

  // Timers
  timerSignals: TimerSignal[]  // { type: 'start'|'cancel', level?: 'L0'-'L8', reason? }

  // Debug
  decisionInfo?: { action, reason, templateIntents?, gates? }
  salesTrackInfo?: { accion?, reason, enterCaptura? }
  responseTrackInfo?: { salesTemplateIntents, infoTemplateIntents, totalMessages }
  classificationInfo?: { category, sentiment }
}
```

## Interfaz V3AgentInput (referencia rapida)

```typescript
interface V3AgentInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas?: AccionRegistrada[]
  turnNumber: number
  workspaceId: string
  systemEvent?: { type: 'timer_expired'; level: 0|1|2|3|4|5|6|7|8 }
}
```
