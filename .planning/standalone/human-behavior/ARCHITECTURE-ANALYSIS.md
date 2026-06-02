# Análisis de Arquitectura: Agente Conversacional Somnio

**Fecha:** 2026-02-23
**Propósito:** Mapear la infraestructura actual del agente para planificar la integración del Sistema de Comportamiento Humano (5 etapas).

---

## 1. FLUJO ACTUAL COMPLETO (de webhook a respuesta)

```
360dialog HTTP POST
│
▼
route.ts [/api/webhooks/whatsapp]
  ├── Verifica HMAC-SHA256
  └──► processWebhook()                    [webhook-handler.ts]
        ├── Guarda raw payload en whatsapp_webhook_events
        └──► processIncomingMessage()
              │
              ├── normalizePhone()
              ├── domainFindOrCreateConversation()     [domain/conversations.ts]
              ├── linkContactToConversation()
              ├── buildMessageContent()
              ├── downloadAndUploadMedia()             [si es media → Supabase Storage]
              ├── domainReceiveMessage()               [domain/messages.ts]
              │     ├── INSERT messages (inbound)
              │     ├── UPDATE conversations.last_message_at
              │     ├── emitWhatsAppMessageReceived()  [→ Inngest automation trigger]
              │     └── checkKeywordMatches()          [→ keyword automations]
              │
              └── [SOLO si msg.type === 'text']  ◄── AQUÍ ESTÁ EL FILTRO DE MEDIA
                  └──► processMessageWithAgent()       [webhook-processor.ts]
                        │                               ★ LLAMADA INLINE (NO Inngest)
                        │
                        ├── isAgentEnabledForConversation()
                        ├── conversationHasTag('WPP' | 'P/W') → skip
                        ├── autoCreateContact() si falta
                        ├── broadcast typing=true (Supabase Realtime)
                        │
                        └──► UnifiedEngine.processMessage()  [unified-engine.ts]
                              │
                              ├── storage.getOrCreateSession()
                              ├── storage.getHistory()
                              │
                              └──► SomnioAgent.processMessage()  [somnio-agent.ts]
                                    │
                                    │  ┌─────────────────────────────────────┐
                                    │  │   PIPELINE ACTUAL (14 pasos)       │
                                    │  ├─────────────────────────────────────┤
                                    │  │ 1. Get agentConfig                  │
                                    │  │ 2. Init tracking vars              │
                                    │  │ 3. [collecting_data] → IngestMgr   │
                                    │  │ 4. [else] → checkImplicitYes       │
                                    │  │ 5. IntentDetector.detect()  ★      │
                                    │  │ 6. Update intentsVistos            │
                                    │  │ 7. Handle handoff                  │
                                    │  │ 8. Build mockSession               │
                                    │  │ 9. SomnioOrchestrator.orchestrate()│
                                    │  │ 10. Build state updates            │
                                    │  │ 11. Timer signal decisions         │
                                    │  │ 12. Extract response messages      │
                                    │  │ 13. shouldCreateOrder?             │
                                    │  │ 14. Return SomnioAgentOutput       │
                                    │  └─────────────────────────────────────┘
                              │
                              ├── [Routes output to 5 adapters:]
                              │
                              ├── StorageAdapter   → DB: session_state, agent_turns
                              ├── TimerAdapter     → Inngest: agent/customer.message,
                              │                      collecting_data.started, promos.offered,
                              │                      resumen.started, ingest.*
                              ├── OrdersAdapter    → domain/orders: crear pedido
                              ├── MessagingAdapter → domain/messages: enviar por 360dialog
                              │     └── sleep(template.delaySeconds * responseSpeed)
                              │         para CADA plantilla
                              └── DebugAdapter     → no-op en producción
                        │
                        ├── broadcast typing=false
                        ├── mark messages sent_by_agent=true
                        └── tag 'WPP' + handoff si aplica
```

---

## 2. HALLAZGOS CRÍTICOS PARA EL SISTEMA NUEVO

### H1: processMessageWithAgent se ejecuta INLINE (no Inngest)

**Estado actual:** El webhook llama `processMessageWithAgent()` **directamente** dentro del request HTTP. NO pasa por Inngest.

**Existe** `whatsappAgentProcessor` en `agent-production.ts` con `concurrency: { key: 'event.data.conversationId', limit: 1 }` — pero NO está en el flujo activo. El webhook no emite `agent/whatsapp.message_received`.

**Impacto:** Para Etapa 3A (check pre-envío + agrupación natural), NECESITAMOS mover a Inngest con concurrency 1. Este es el **cambio arquitectónico más grande**.

### H2: Solo texto llega al agente

**Línea exacta:** `webhook-handler.ts` — solo procesa `msg.type === 'text'`.

Audio, imagen, video, sticker se guardan en DB (domainReceiveMessage) pero NUNCA llegan a `processMessageWithAgent()`.

**Impacto:** Etapa 4 requiere un Media Gate ANTES de decidir si procesar con agente.

### H3: ConfidenceThresholds existen pero NO se usan en producción

**En tipos:** `types.ts:50-69` define 4 bandas: proceed(85), reanalyze(60), clarify(40), handoff(0).

**IntentDetector** implementa `routeByConfidence()` y retorna `ConfidenceAction` — pero `SomnioAgent` **ignora el campo `action`** del `IntentDetectionResult`. Solo usa `intent.intent` y `intent.confidence` superficialmente.

**SomnioOrchestrator** es 100% determinístico — no llama Claude para orquestar, no consulta thresholds.

**Impacto:** Etapa 5 puede reutilizar `IntentDetector.routeByConfidence()` pero necesita rewire para que el resultado sea vinculante.

### H4: No existe gate de clasificación rápida pre-IntentDetector

**Estado actual:** Cada mensaje de texto va directo a `IntentDetector.detect()` (Claude Sonnet, ~$0.003).

**No hay filtro** para mensajes como "Ok", "👍", "Jaja" que no necesitan procesamiento.

**Excepción:** En `collecting_data` mode, `IngestManager` clasifica con `MessageClassifier` primero, y si es `datos` o `irrelevante`, NO pasa por IntentDetector. Pero esto solo aplica en ese mode específico.

**Impacto:** Etapa 2 agrega un gate ANTES de IntentDetector para todos los modes.

### H5: Sistema de delays actual es fijo por plantilla

**En `ProductionMessagingAdapter.send()`** (`messaging.ts:99-105`):
```typescript
sleep(template.delaySeconds * responseSpeed * 1000)
```
- `delaySeconds` viene de `agent_templates.delay_s` (campo por plantilla en DB)
- `responseSpeed` viene de workspace settings (ej: 1.0, 0.5)

**Impacto:** Etapa 1 reemplaza `template.delaySeconds` con cálculo por caracteres.

### H6: InterruptionHandler existe pero con limitaciones

**`interruption-handler.ts`:** Guarda pending messages en `datos_capturados` con keys `__prefixed`. Define CONFLICTING_INTENTS (asesor, queja, cancelar, no_gracias) y COMPLEMENTARY_INTENTS.

**`message-sequencer.ts`:** Tiene `checkForInterruption()` basado en `session.last_activity_at` con ventana de 2 segundos. **Bug conocido #6:** SessionManager puede devolver datos cacheados.

**Impacto:** Etapa 3B puede reutilizar conceptos pero necesita reescritura. El check pre-envío nuevo (query directa a `messages` table) es más confiable que el check por `last_activity_at`.

### H7: Dos engines coexisten

- **SomnioEngine** (Phase 14-15): Lee/escribe DB directamente. Usa MessageSequencer. Emite Inngest events directo.
- **UnifiedEngine + SomnioAgent** (Phase 16.1): Ports/Adapters. SomnioAgent es stateless, UnifiedEngine routea output a adapters.

**Flujo activo en producción:** UnifiedEngine path.

**Impacto:** Todos los cambios van sobre UnifiedEngine/SomnioAgent path. SomnioEngine queda como legacy.

---

## 3. COMPONENTES EXISTENTES REUTILIZABLES

| Componente | Archivo | Qué se reutiliza | Qué cambia |
|---|---|---|---|
| IntentDetector | `intent-detector.ts` | Clase, prompt, `detect()` | `routeByConfidence()` se vuelve vinculante (Etapa 5) |
| ConfidenceThresholds | `types.ts:50-69` | Estructura de tipos | Simplificar a 2 bandas V1 (80/0) |
| MessageClassifier | `message-classifier.ts` | Pattern de clasificación rápida | Inspiración para Etapa 2 gate (pero Etapa 2 es regex, no Claude) |
| IngestManager | `ingest-manager.ts` | Lógica de silent accumulation | Sin cambios directos |
| InterruptionHandler | `interruption-handler.ts` | Conceptos de pending messages | Reescribir: query a `messages` en vez de `last_activity_at` |
| ProductionTimerAdapter | `timer.ts` | Pattern de emit Inngest events | Agregar `agent/silence.detected` event |
| ProductionMessagingAdapter | `messaging.ts` | Estructura de send loop | Agregar: char delay + check pre-envío |
| TemplateManager | `template-manager.ts` | Selección de templates | Agregar campo `priority` (CORE/COMP/OPC) |
| TransitionValidator | `transition-validator.ts` | Validación de transiciones | Sin cambios |
| SessionManager | `session-manager.ts` | Gestión de sesión/estado | Agregar campo `processed_by_agent` a messages |
| whatsappAgentProcessor | `agent-production.ts` | **Inngest function YA EXISTE** con concurrency 1 | Activar (hoy no está en el flujo) |

---

## 4. MAPA DE INTEGRACIÓN: ETAPAS 2, 3 Y 5 COMO LAYERS

Las etapas no son features independientes — son **capas secuenciales** en el pipeline de procesamiento de mensajes. Aquí está cómo se integran:

```
MENSAJE ENTRANTE (cualquier tipo)
│
▼
═══════════════════════════════════════════════════
LAYER 0: WEBHOOK (cambio mínimo)
═══════════════════════════════════════════════════
  webhook-handler.ts:
    ├── Guarda mensaje en DB (processed_by_agent: false)  ★ NUEVO campo
    ├── Emite evento Inngest 'agent/whatsapp.message_received'  ★ CAMBIO
    └── FIN del webhook (~200ms)

    ANTES: llamaba processMessageWithAgent() inline
    AHORA: solo emite evento, Inngest toma el control
│
▼
═══════════════════════════════════════════════════
LAYER 1: INNGEST PROCESSOR (concurrency 1/conversación)
═══════════════════════════════════════════════════
  whatsappAgentProcessor (YA EXISTE en agent-production.ts)
    ├── Concurrency: { key: conversationId, limit: 1 }
    └── Garantiza: UN solo mensaje procesado a la vez por conversación
         → Mensajes siguientes ESPERAN en cola de Inngest
│
▼
═══════════════════════════════════════════════════
LAYER 2: MEDIA GATE (Etapa 4) — NUEVO
═══════════════════════════════════════════════════
  Antes de cualquier procesamiento:
    ├── texto    → continúa ↓
    ├── audio    → Whisper → texto (o handoff si 3+ intents)
    ├── imagen   → HANDOFF directo
    ├── video    → HANDOFF directo
    ├── sticker  → Vision → texto (o handoff)
    └── reacción → interpretar emoji → texto (o handoff)
│
▼
═══════════════════════════════════════════════════
LAYER 3: CLASIFICACIÓN RÁPIDA (Etapa 2) — NUEVO
═══════════════════════════════════════════════════
  Gate de regex/keywords ANTES de Claude:
    ├── SILENCIOSO ("ok", "👍", "jaja") → timer retoma 90s, NO IntentDetector
    ├── HANDOFF ("asesor", "queja", "cancelar") → handoff, NO IntentDetector
    └── RESPONDIBLE → continúa ↓

  AHORRO: Evita 2 llamadas Claude Sonnet (~$0.003/msg) para mensajes filtrados
│
▼
═══════════════════════════════════════════════════
LAYER 4: INTENT DETECTION + CONFIDENCE (existente + Etapa 5) — MODIFICAR
═══════════════════════════════════════════════════
  IntentDetector.detect() [Claude Sonnet] — ya existe
    ├── ≥ 80% → continúa ↓ con intent detectado          ★ CAMBIO threshold
    └── < 80% → HANDOFF + LOG en disambiguation_log       ★ NUEVO

  HOY: IntentDetector retorna action pero se ignora
  NUEVO: action es VINCULANTE — si < 80%, se para
│
▼
═══════════════════════════════════════════════════
LAYER 5: ORCHESTRATION (existente) — SIN CAMBIOS DIRECTOS
═══════════════════════════════════════════════════
  SomnioOrchestrator.orchestrate() — determinístico
    ├── TransitionValidator
    ├── DataExtractor (en collecting_data)
    ├── Pack detection
    ├── TemplateManager.getTemplatesForIntents()
    └── Retorna: templates[], nextMode, shouldCreateOrder
│
▼
═══════════════════════════════════════════════════
LAYER 6: MERGE DE PENDIENTES (Etapa 3B) — NUEVO
═══════════════════════════════════════════════════
  Después de obtener templates del orchestrator:
    ├── Recuperar pendientes de secuencia interrumpida anterior
    ├── Merge por prioridad: CORE > COMPLEMENTARIA > OPCIONAL
    ├── Cap a 3 plantillas máximo
    └── Pendiente CORE desplaza nueva COMPLEMENTARIA/OPCIONAL
│
▼
═══════════════════════════════════════════════════
LAYER 7: NO-REPETICIÓN ESCALONADA (Etapa 3C) — NUEVO
═══════════════════════════════════════════════════
  Para cada plantilla candidata:
    ├── Nivel 1: ¿ID en templates_enviados? → skip (0ms, $0)
    ├── Nivel 2: ¿Tema cubierto? → Haiku compara minifrases (~200ms)
    │     ├── NO_ENVIAR → skip
    │     ├── ENVIAR → mantener
    │     └── PARCIAL ↓
    └── Nivel 3: Lee mensaje completo → decide con contexto real
│
▼
═══════════════════════════════════════════════════
LAYER 8: ENVÍO CON CHECK PRE-ENVÍO (Etapas 1 + 3A) — MODIFICAR MessagingAdapter
═══════════════════════════════════════════════════
  ProductionMessagingAdapter.send() — REESCRIBIR loop:
    Para cada plantilla:
      1. calculateCharDelay(content.length) × speedFactor    ★ Etapa 1
      2. sleep(delay)
      3. CHECK DB: ¿hay nuevo inbound desde processingStartedAt?  ★ Etapa 3A
         → SÍ → PARAR secuencia
                 → Guardar plantillas no enviadas como "pendientes"
                 → Mensaje nuevo ya espera en cola Inngest (concurrency 1)
         → NO → Enviar plantilla
                 → Registrar en no-repetición
```

---

## 5. PUNTOS DE INSERCIÓN EN CÓDIGO EXISTENTE

### 5.1 webhook-handler.ts — Cambio de inline a Inngest

```
ANTES (línea ~250):
  if (msg.type === 'text') {
    await processMessageWithAgent(...)  // inline
  }

DESPUÉS:
  // Para TODOS los tipos de mensaje (no solo texto):
  await inngest.send({
    name: 'agent/whatsapp.message_received',
    data: { conversationId, contactId, messageContent, messageType, workspaceId, phone, messageId }
  })
  // FIN — no esperar respuesta
```

### 5.2 agent-production.ts — Activar y extender whatsappAgentProcessor

```
ANTES: Función existe pero no se usa
DESPUÉS: Es el entry point principal
  step.run('process-message', async () => {
    // Layer 2: Media Gate
    // Layer 3: Clasificación rápida
    // Layer 4-8: processMessageWithAgent() (modificado)
  })
```

### 5.3 ProductionMessagingAdapter.send() — Reescribir loop

```
ANTES (messaging.ts:99-105):
  for (const template of templates) {
    await sleep(template.delaySeconds * responseSpeed * 1000)
    await domainSendTextMessage(...)
  }

DESPUÉS:
  for (const template of templates) {
    const delay = calculateCharDelay(template.content.length) * speedFactor
    await sleep(delay)

    // Check pre-envío
    const hasNewInbound = await checkForNewInbound(conversationId, processingStartedAt)
    if (hasNewInbound) {
      savePendingTemplates(remaining)
      break  // nuevo mensaje ya espera en cola Inngest
    }

    await domainSendTextMessage(...)
    recordSentTemplate(template.id, template.minifrase)
  }
```

### 5.4 SomnioAgent.processMessage() — Insertar Etapa 5

```
ANTES (paso 5-7):
  5. IntentDetector.detect()
  6. Update intentsVistos
  7. Handle handoff if action === 'handoff'

DESPUÉS:
  5. IntentDetector.detect()
  5.1 ★ NUEVO: if (confidence < 80) {
        logToDisambiguationLog(situation)
        return HANDOFF
      }
  6. Update intentsVistos
  7. Handle handoff (mantener)
```

### 5.5 Nuevos archivos necesarios

| Archivo | Propósito |
|---|---|
| `src/lib/agents/somnio/message-gate.ts` | Etapa 2: clasificación RESPONDIBLE/SILENCIOSO/HANDOFF |
| `src/lib/agents/somnio/media-gate.ts` | Etapa 4: procesamiento de medios |
| `src/lib/agents/somnio/char-delay.ts` | Etapa 1: cálculo de delay por caracteres |
| `src/lib/agents/somnio/no-repeat.ts` | Etapa 3C: sistema de no-repetición escalonada |
| `src/lib/agents/somnio/pending-merge.ts` | Etapa 3B: merge de pendientes por prioridad |
| `src/lib/agents/somnio/disambiguation-log.ts` | Etapa 5: logging de situaciones ambiguas |
| `src/inngest/functions/silence-timer.ts` | Timer de retoma 90s (Etapa 2) |

---

## 6. DEPENDENCIAS ENTRE ETAPAS (orden de implementación)

```
                    ┌──────────┐
                    │ Etapa 1  │  Delays por chars
                    │ (aislada)│  Sin dependencias
                    └────┬─────┘
                         │ se integra en Layer 8
                         ▼
┌──────────┐     ┌──────────────────┐     ┌──────────┐
│ Etapa 4  │────►│ MIGRACIÓN A      │◄────│ Etapa 2  │
│ Media    │     │ INNGEST          │     │ Clasif.  │
│ Gate     │     │ (prerequisito)   │     │ rápida   │
└──────────┘     └────────┬─────────┘     └──────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ Etapa 3A              │
              │ Check pre-envío       │
              │ (requiere Inngest +   │
              │  campo processed_by)  │
              └───────────┬───────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Etapa 3B │ │ Etapa 3C │ │ Etapa 5  │
        │ Merge    │ │ No-Rep   │ │ Confid.  │
        │ pendient │ │ escalon. │ │ + Log    │
        └──────────┘ └──────────┘ └──────────┘
```

**Prerequisito fundamental:** Migrar de inline a Inngest. Sin esto, Etapa 3A no funciona (no hay cola que garantice secuencialidad). Etapa 2 tampoco (el timer de retoma necesita eventos Inngest).

**Orden sugerido:**
1. **Migración a Inngest** — activar `whatsappAgentProcessor`, cambiar webhook
2. **Etapa 1** — char delays (cambio aislado en MessagingAdapter)
3. **Etapa 2** — gate de clasificación + timer retoma
4. **Etapa 4** — media gate (depende de Inngest para recibir todos los tipos)
5. **Etapa 5** — confidence vinculante + disambiguation_log
6. **Etapa 3A** — check pre-envío + campo `processed_by_agent`
7. **Etapa 3B** — merge de pendientes por prioridad
8. **Etapa 3C** — no-repetición escalonada

---

## 7. RIESGOS Y CONSIDERACIONES

### R1: Migración inline → Inngest es el cambio más peligroso
- Hoy el webhook procesa y responde en ~5-15s dentro del mismo request
- Con Inngest, el webhook retorna en ~200ms pero el procesamiento es async
- **Riesgo:** Si Inngest tiene latencia, el cliente espera más
- **Mitigación:** Inngest típicamente despacha en <500ms para eventos con runners disponibles

### R2: Ventana ciega de 3A (~250ms)
- Entre el check DB y el envío real a 360dialog hay ~250ms donde puede llegar un nuevo mensaje
- **Mitigación:** Aceptado como riesgo menor en diseño. Revisar en producción.

### R3: Coexistencia de SomnioEngine y UnifiedEngine
- SomnioEngine (legacy) sigue existiendo y tiene paths que emiten Inngest events directamente
- **Recomendación:** Todos los cambios van sobre UnifiedEngine path. Eventualmente deprecar SomnioEngine.

### R4: MessageSequencer y InterruptionHandler quedan obsoletos
- Con el nuevo sistema de check pre-envío en MessagingAdapter, `MessageSequencer` y `InterruptionHandler` ya no se necesitan
- **Recomendación:** No modificarlos — crear sistema nuevo. Deprecar después.

### R5: Campo `delay_s` en agent_templates queda sin uso
- Etapa 1 calcula delays dinámicamente por caracteres
- **Recomendación:** Mantener campo en DB pero ignorarlo en código. Cleanup posterior.

---

## 8. TABLAS DB CON CAMBIOS NECESARIOS

| Tabla | Cambio | Propósito |
|---|---|---|
| `messages` | ADD `processed_by_agent BOOLEAN DEFAULT true` | Etapa 3A: check pre-envío |
| `agent_templates` | ADD `priority TEXT DEFAULT 'CORE'` | Etapa 3B: merge por prioridad |
| `agent_templates` | ADD `minifrase TEXT` | Etapa 3C: no-repetición |
| **NUEVA** `disambiguation_log` | CREATE TABLE | Etapa 5: log de ambigüedades |

### Nuevos eventos Inngest necesarios

| Evento | Propósito |
|---|---|
| `agent/silence.detected` | Etapa 2: activar timer de retoma |
| (reutilizar `agent/customer.message`) | Etapa 2: cancelar timer de retoma |

---

## 9. RESUMEN EJECUTIVO

**Lo que hay hoy:**
- Pipeline lineal: webhook → inline processing → Claude Sonnet (IntentDetector) → Orchestrator determinístico → templates → envío con delay fijo
- Solo texto se procesa, media se ignora
- Confidence thresholds definidos pero no activos
- InterruptionHandler existe pero con bug de cache
- whatsappAgentProcessor (Inngest, concurrency 1) existe pero no se usa

**Lo que se necesita:**
- Migrar a Inngest como procesador principal (activar lo que ya existe)
- Agregar 4 layers nuevos: Media Gate, Clasificación rápida, Merge pendientes, No-repetición
- Modificar 2 layers existentes: Confidence vinculante, Delays por caracteres + check pre-envío
- 1 migración DB (campo + tabla nueva)
- ~7 archivos nuevos + ~4 archivos modificados

**El cambio más grande** es la migración de inline a Inngest — es prerequisito de casi todo lo demás y afecta la arquitectura fundamental del flujo de mensajes.
