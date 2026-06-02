# Research: Comportamiento Humano para Somnio en WhatsApp

**Fecha:** 2026-02-20
**Objetivo:** Hacer que Somnio se comporte como un vendedor humano real en WhatsApp
**Scope:** Solo COMO y CUANDO dice las cosas — no cambia QUE dice (prompts, intents, templates)

---

## Diagnóstico de la Arquitectura Actual (5 Problemas)

### Problema 1: Sin Message Debouncing
**Archivo:** `src/lib/whatsapp/webhook-handler.ts:250-296`

El webhook handler llama `processMessageWithAgent()` DIRECTAMENTE (inline, sin Inngest). Cada mensaje de texto dispara el pipeline completo del agente inmediatamente. Si el cliente envía 3 mensajes en 10 segundos ("Hola" → "Quiero comprar" → "Cuanto vale?"), cada uno genera una respuesta completa por separado.

La función Inngest `whatsappAgentProcessor` con concurrency 1/conversación existe en `agent-production.ts` pero NO es el path activo — el webhook handler hace la llamada directa.

### Problema 2: Envío de mensajes como loop simple
**Archivo:** `src/lib/agents/engine-adapters/production/messaging.ts:99-105`

`ProductionMessagingAdapter` usa un `for` loop con `sleep()` para enviar secuencias de mensajes. No verifica si el cliente respondió entre mensajes. No detecta interrupciones. No tiene awareness del estado de la conversación.

```typescript
// Código actual (línea 99-105):
for (let i = 0; i < templates.length; i++) {
  const template = templates[i]
  if (i > 0 && template.delaySeconds > 0 && this.responseSpeed > 0) {
    await sleep(template.delaySeconds * this.responseSpeed * 1000)  // delay FIJO
  }
  // ... enviar mensaje
}
```

### Problema 3: MessageSequencer e InterruptionHandler desconectados
**Archivos:**
- `src/lib/agents/somnio/message-sequencer.ts` — Tiene `buildSequence()`, `executeSequence()`, `checkForInterruption()`, `mergeWithPending()`
- `src/lib/agents/somnio/interruption-handler.ts` — Tiene `detectInterruption()`, `savePendingMessages()`, `shouldAppendPending()` con lógica de intents complementarios vs conflictivos

Ambos fueron diseñados en Phase 14 con detección de interrupciones vía timestamp de sesión. NUNCA se conectaron a producción. El `InterruptionHandler` tiene:
- COMPLEMENTARY_INTENTS: precio, pago, envio, garantia, etc. → SI append pending
- CONFLICTING_INTENTS: asesor, queja, cancelar, no_gracias → NO append pending
- Pending message storage en `session_state.datos_capturados` con keys especiales (`__pending_messages`, `__interrupted_at`, `__sequence_id`)

### Problema 4: Sin clasificación previa al agente
**Archivo:** `src/lib/agents/somnio/message-classifier.ts`

El `MessageClassifier` ya clasifica mensajes como `irrelevante` para "ok", "gracias", "👍". Pero SOLO se usa durante `collecting_data` mode en `IngestManager`. No hay gate-keeper que filtre mensajes antes de ejecutar el pipeline completo del agente (IntentDetector + Orchestrator = 2 llamadas a Claude Sonnet).

### Problema 5: Sin typing indicator real en WhatsApp
**Archivo:** `src/lib/agents/production/webhook-processor.ts:149-156`

El webhook-processor emite typing indicator via Supabase Broadcast al inicio y lo apaga al final. Esto es para el DASHBOARD WEB, no para WhatsApp. No se envía typing indicator real via la API de WhatsApp/360dialog.

---

## 7 Propuestas Priorizadas

---

### PROPUESTA 1: Typing Indicator Real via WhatsApp API
**Impacto:** Alto | **Complejidad:** Baja | **Dependencias:** Ninguna

**Problema que resuelve:** Bot responde "mágicamente" sin indicar que está pensando/escribiendo.

**Comportamiento humano:** Abre el mensaje → checks azules → "escribiendo..." → mensaje.

**Investigación:**
- WhatsApp Cloud API tiene endpoint para typing indicators (fuente: botsailor.com, twilio.com)
- Al enviarlo: marca mensaje como leído (checks azules) + muestra "escribiendo..."
- Desaparece cuando se envía respuesta o después de 25 segundos
- Gratis (no cuesta tokens de WhatsApp)
- Twilio lo tiene en Public Beta; 360dialog generalmente sigue la spec de Meta

**Implementación:**

```typescript
// NUEVO: src/lib/whatsapp/typing.ts
async function sendTypingIndicator(apiKey: string, phone: string, messageId: string): Promise<void> {
  // Opción A: Via endpoint de 360dialog (verificar spec)
  await fetch('https://waba.360dialog.io/v1/messages', {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'typing',
      status: 'read',
      message_id: messageId,
    }),
  })
}
```

**Dónde insertar:**
1. En `webhook-processor.ts`, justo antes de llamar al engine (step 5), enviar typing indicator
2. En `ProductionMessagingAdapter.send()`, antes de cada mensaje de la secuencia

**Trade-offs:**
- Pro: Implementación trivial (una función helper + llamadas). Impacto visual inmediato.
- Pro: Gratis.
- Con: Verificar que 360dialog soporta el endpoint exacto (la API Cloud de Meta lo soporta).
- Con: El indicador dura máximo 25 segundos — si procesamiento tarda más, desaparece.

---

### PROPUESTA 2: Delays Dinámicos entre Mensajes
**Impacto:** Alto | **Complejidad:** Baja | **Dependencias:** Ninguna

**Problema que resuelve:** Mensajes se envían con delays fijos que no sienten naturales. Bloque de 4 mensajes llega en ráfaga.

**Investigación académica:**
- Paper "Faster Is Not Always Better" (Gnewuch et al., ECIS 2018) — delays DINÁMICOS (proporcionales a complejidad del mensaje) aumentan percepción de humanidad y satisfacción
- Rango óptimo: 1-3 segundos para mensajes normales
- Paper Springer 2022 — delays variables son clave; humanos varían su tiempo dependiendo de lo que leen y escriben
- Delay de ~1 segundo identificado como óptimo en múltiples estudios
- Variabilidad es crucial — humanos pausan para pensar o corregir

**Fórmula propuesta:**

```typescript
function calculateHumanDelay(messageContent: string, position: number): number {
  // Tiempo base de "lectura" (solo para primer mensaje)
  const readingTimeMs = position === 0 ? randomBetween(1500, 3000) : 0

  // Tiempo de "escritura" proporcional a longitud
  const charCount = messageContent.length
  const typingSpeedMs = charCount * randomBetween(30, 60) // 30-60ms por caracter
  const typingTimeMs = Math.min(typingSpeedMs, 5000) // cap en 5 segundos

  // Varianza natural (±20%)
  const variance = 1 + (Math.random() * 0.4 - 0.2)

  return Math.round((readingTimeMs + typingTimeMs) * variance)
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
```

**Dónde insertar:**
- Reemplazar `sleep(template.delaySeconds * responseSpeed * 1000)` en `ProductionMessagingAdapter.send()` con la fórmula
- Combinar con typing indicator (Propuesta 1) antes de cada mensaje

**Trade-offs:**
- Pro: Cambio mínimo (solo `messaging.ts`). Efecto inmediato.
- Pro: No requiere nueva infraestructura.
- Con: Aumenta tiempo total de respuesta (pero esto es deseable).
- Con: Si cliente interrumpe durante delay largo, sin Propuesta 5 no se detecta.

---

### PROPUESTA 3: Soft Signal Gate — Clasificar antes de procesar
**Impacto:** Medio-Alto | **Complejidad:** Baja | **Dependencias:** Ninguna

**Problema que resuelve:** "Ok", "👍", "jaja", "Gracias" disparan pipeline completo (IntentDetector + Orchestrator = 2 llamadas Claude Sonnet) y generan respuesta innecesaria.

**Comportamiento humano:** Lee "Ok" y no responde. Lee "jaja" y no responde.

**Implementación:**

```typescript
const SOFT_SIGNALS = new Set([
  'ok', 'okey', 'oki', 'dale', 'listo', 'ya', 'si', 'sip',
  'gracias', 'grax', 'ty', 'thanks',
  'jaja', 'jajaja', 'jeje', 'haha', 'lol',
  'perfecto', 'genial', 'excelente', 'bueno', 'vale',
])

const SOFT_EMOJIS = /^[\p{Emoji}]{1,3}$/u

function isSoftSignal(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[.,!?¿¡]+$/, '')
  if (SOFT_SIGNALS.has(normalized)) return true
  if (SOFT_EMOJIS.test(normalized)) return true
  if (normalized.length <= 5 && !normalized.includes('?')) return true
  return false
}
```

**MATIZ IMPORTANTE:** "Si" y "Ok" a veces SON significativos (confirmación de compra en modo `resumen`). Solución: soft signal gate SOLO aplica fuera de estados confirmatorios:
- En `collecting_data`, `resumen`, `confirmado` → todo pasa al agente
- En `conversacion`, `bienvenida` → soft signals se filtran

**Dónde insertar:**
- En el debouncer (Propuesta 4), después de concatenar mensajes
- O en `webhook-handler.ts` antes de llamar al agente (si no se implementa debouncer)
- Si TODOS los mensajes pendientes son soft signals → no procesar
- Si hay soft signals + mensajes reales → filtrar soft signals, procesar reales

**Trade-offs:**
- Pro: Cero llamadas a Claude para mensajes que no necesitan respuesta
- Pro: Ahorra tokens (~$0.003 por llamada Sonnet × miles de mensajes/día)
- Pro: Implementación trivial (función pura, sin LLM)
- Con: Riesgo de falso positivo. Mitigado por exclusión en estados confirmatorios.

---

### PROPUESTA 4: Message Debouncer con Inngest
**Impacto:** Alto | **Complejidad:** Media | **Dependencias:** Migración DB (campo `processed_by_agent`)

**Problema que resuelve:** Bot responde a cada mensaje individual instantáneamente en vez de esperar a que el cliente termine de escribir.

**Comportamiento humano:** Vendedor ve "Hola", espera 2-3 segundos, ve que cliente sigue escribiendo, espera a que termine, responde a todo junto.

**Investigación — Inngest Debounce (fuente: inngest.com/docs/guides/debounce):**
- `debounce.period`: Time delay before execution; resets when new event arrives
- `debounce.key`: Expression targeting event data for per-entity debounce
- `debounce.timeout`: Maximum duration before forced execution
- Entrega solo el ÚLTIMO evento (no todos) — necesitamos buffer en DB
- NO funciona con batchEvents (incompatible)
- Mínimo 1 segundo, máximo 7 días

**Investigación — Inngest batchEvents (fuente: inngest.com/docs/guides/batching):**
- Entrega array de TODOS los eventos
- Pero: NO funciona con cancellation events, rate limiting, priority, ni concurrency key
- Para nuestro caso, estas limitaciones son dealbreakers

**Solución: Debounce + Buffer en DB**

```typescript
// REEMPLAZA la llamada directa en webhook-handler.ts:250-296
// Webhook handler ahora SOLO emite evento Inngest (no llama agente directamente)

// NUEVA función Inngest:
const whatsappAgentDebounced = inngest.createFunction(
  {
    id: 'whatsapp-agent-debounced',
    debounce: {
      key: 'event.data.conversationId',  // debounce por conversación
      period: '3s',                       // esperar 3 segundos sin nuevos mensajes
      timeout: '15s',                     // máximo 15s de espera total
    },
    concurrency: [{
      key: 'event.data.conversationId',
      limit: 1,
    }],
  },
  { event: 'agent/whatsapp.message_received' },
  async ({ event, step }) => {
    const { conversationId, workspaceId, phone } = event.data

    // 1. Leer todos los mensajes no procesados desde la DB
    const pendingMessages = await step.run('fetch-pending', async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('messages')
        .select('id, content, timestamp, type')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .eq('processed_by_agent', false)  // NUEVO campo
        .order('timestamp', { ascending: true })
      return data ?? []
    })

    if (pendingMessages.length === 0) return { status: 'no_messages' }

    // 2. Extraer texto de los mensajes
    const textMessages = pendingMessages
      .filter(m => m.type === 'text')
      .map(m => (m.content as { body?: string })?.body ?? '')
      .filter(Boolean)

    if (textMessages.length === 0) return { status: 'no_text_messages' }

    // 3. Soft signal gate (Propuesta 3)
    // Si TODOS son soft signals, marcar como procesados y no responder
    // (solo fuera de estados confirmatorios — verificar mode del agente)

    // 4. Concatenar y procesar como un solo mensaje
    const combinedMessage = textMessages.join('\n')

    const result = await step.run('process-message', async () => {
      const { processMessageWithAgent } = await import(
        '@/lib/agents/production/webhook-processor'
      )
      return processMessageWithAgent({
        conversationId,
        messageContent: combinedMessage,
        workspaceId,
        phone,
        contactId: null,
      })
    })

    // 5. Marcar todos como procesados
    await step.run('mark-processed', async () => {
      const supabase = createAdminClient()
      const ids = pendingMessages.map(m => m.id)
      await supabase
        .from('messages')
        .update({ processed_by_agent: true })
        .in('id', ids)
    })

    return result
  }
)
```

**Cambio en webhook-handler.ts:**
```typescript
// ANTES (línea 250-296): llamada directa a processMessageWithAgent
// DESPUÉS: emitir evento Inngest y ya (el debouncer se encarga)
if (msg.type === 'text') {
  try {
    const { inngest } = await import('@/inngest/client')
    await inngest.send({
      name: 'agent/whatsapp.message_received',
      data: {
        conversationId,
        contactId: contactId ?? null,
        messageContent: msg.text?.body ?? '',
        workspaceId,
        phone,
        messageId: domainResult.data?.messageId ?? msg.id,
      },
    })
  } catch (agentError) {
    // Non-blocking
    console.error('Failed to emit agent event:', agentError)
  }
}
```

**Migración DB necesaria:**
```sql
ALTER TABLE messages ADD COLUMN processed_by_agent BOOLEAN DEFAULT true;
-- Default true para mensajes existentes (ya procesados)
-- Nuevos mensajes inbound se insertan con false
```

Y en `domain/messages.ts` → `receiveMessage()` agregar `processed_by_agent: false` al insert.

**Trade-offs:**
- Pro: Solución con Inngest puro, sin infraestructura adicional
- Pro: Reduce número de llamadas al agente (3 mensajes → 1 procesamiento)
- Pro: Respuesta más coherente a mensajes múltiples
- Pro: El debounce `key` por conversationId aísla cada conversación
- Pro: El `timeout: 15s` garantiza que nunca esperamos más de 15 segundos
- Con: Requiere migración DB (campo `processed_by_agent`)
- Con: Latencia mínima de 3 segundos (configurable)
- Con: Inngest debounce mínimo 1 segundo de periodo

---

### PROPUESTA 5: Interruption-Aware Message Sending
**Impacto:** Alto | **Complejidad:** Media | **Dependencias:** Propuestas 1+2

**Problema que resuelve:** Bot envía 4 mensajes en secuencia sin importar si cliente responde en medio.

**Comportamiento humano:** Está enviando mensaje largo en partes, cliente interrumpe, vendedor para, lee lo que dijo, adapta.

**El código ya existe:** `MessageSequencer` y `InterruptionHandler` están diseñados y escritos. Solo necesitan conectarse.

**Solución — Modificar `ProductionMessagingAdapter.send()`:**

```typescript
async send(params) {
  const sendingStartedAt = new Date().toISOString()
  let sentCount = 0

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]

    // Delay dinámico (Propuesta 2)
    if (i > 0) {
      const delay = calculateHumanDelay(template.content, i)
      await sleep(delay)
    }

    // Check for interruption (nuevo mensaje inbound desde que empezamos)
    if (i > 0) {
      const hasNewMessage = await this.checkForNewInbound(
        params.conversationId, sendingStartedAt
      )
      if (hasNewMessage) {
        logger.info(
          { position: i, remaining: templates.length - i },
          'Interruption detected, stopping sequence'
        )
        return {
          messagesSent: sentCount,
          interrupted: true,
          pendingTemplates: templates.slice(i)
        }
      }
    }

    // Typing indicator antes de enviar (Propuesta 1)
    if (this.phoneNumber && apiKey) {
      await sendTypingIndicator(apiKey, this.phoneNumber, lastInboundMessageId)
      await sleep(randomBetween(500, 1500)) // Simular tiempo de escritura
    }

    // Enviar mensaje via domain
    await domainSendTextMessage(ctx, { ... })
    sentCount++
  }

  return { messagesSent: sentCount }
}

// Detección de interrupciones via query a DB
private async checkForNewInbound(
  conversationId: string,
  since: string
): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .gt('timestamp', since)
  return (count ?? 0) > 0
}
```

**Los pending templates se pueden:**
1. Guardar en session_state (usando InterruptionHandler existente)
2. Pasar al siguiente turno del agente como contexto adicional
3. O simplemente descartar (el agente generará respuesta apropiada al nuevo mensaje)

**Trade-offs:**
- Pro: Usa DB existente (Supabase) — no requiere Redis ni Realtime
- Pro: Un query simple por mensaje de la secuencia (típicamente 2-4 mensajes → 1-3 queries, ~50-100ms cada uno)
- Pro: Los templates pendientes se pueden pasar al siguiente turno
- Con: Si cliente envía mensaje durante el último template, no se detecta (edge case aceptable)

---

### PROPUESTA 6: Audio/Image Awareness
**Impacto:** Bajo-Medio | **Complejidad:** Baja | **Dependencias:** Ninguna

**Problema que resuelve:** Cliente envía audio y bot no sabe qué hacer. Envía imagen y bot la ignora.

**Estado actual:** `webhook-handler.ts:250` solo procesa `msg.type === 'text'`. Audio, imágenes, stickers se guardan en DB pero nunca llegan al agente.

**Implementación — en webhook-handler.ts después del bloque de agent routing:**

```typescript
// Después del bloque if (msg.type === 'text') { ... }
// Agregar manejo de tipos no-text:

if (['audio', 'voice'].includes(msg.type)) {
  // Respuesta humana — no procesar por agente
  try {
    const apiKey = await getWhatsAppApiKey(workspaceId)
    if (apiKey) {
      await sendTextMessage(apiKey, phone,
        'Disculpa, no puedo escuchar audios en este momento 🙏 ¿Podrías escribirme tu mensaje?')
      // Guardar respuesta en DB via domain
    }
  } catch { /* non-blocking */ }
}

if (['image', 'video'].includes(msg.type)) {
  try {
    const apiKey = await getWhatsAppApiKey(workspaceId)
    if (apiKey) {
      await sendTextMessage(apiKey, phone,
        '¡Gracias por la imagen! Por ahora solo puedo leer mensajes de texto. ¿En qué te puedo ayudar?')
    }
  } catch { /* non-blocking */ }
}

if (msg.type === 'sticker') {
  // Silencio intencional — un humano no respondería a un sticker
}

if (msg.type === 'reaction') {
  // Silencio intencional — un humano no responde a reacciones
}
```

**Futuro:** Integrar Whisper API (transcripción audio) y Claude Vision (imágenes). Eso es feature separada.

**Trade-offs:**
- Pro: Implementación de ~20 líneas. Mejora inmediata en UX.
- Con: Respuesta genérica puede sentirse robótica. Pero mejor que silencio total.

---

### PROPUESTA 7: Silencio Intencional + Read Receipt Strategy
**Impacto:** Medio | **Complejidad:** Ninguna (emergente) | **Dependencias:** Propuestas 1-5

**Problema que resuelve:** Un humano a veces lee un mensaje y NO responde inmediatamente. Bot siempre responde a todo.

**Investigación:** Paper de Gnewuch confirma que la ausencia de respuesta inmediata (pero con indicador de "leído") aumenta percepción de humanidad.

**Patrones de silencio intencional:**

1. **Read without reply:** Para soft signals (Propuesta 3), marcar como leído (checks azules) pero no responder. Si cliente manda otro mensaje, recién responder.

2. **Delayed acknowledgment:** Para confirmaciones triviales, esperar 5-15 segundos y enviar solo emoji (👍 o ✅) en vez de texto.

3. **Variable first-message delay:** Primer mensaje no se envía instantáneamente. Delay de 2-5 segundos simulando "lectura + pensar + escribir".

**No requiere componente propio:** Es la combinación emergente de:
- Propuesta 1 (typing indicator = sensación de humanidad)
- Propuesta 2 (delays = ritmo natural)
- Propuesta 3 (soft signal gate = no responder a todo)
- Propuesta 4 (debounce 3s = delay natural de primera respuesta)

---

## Plan de Implementación por Fases

| Fase | Propuestas | Días | Descripción |
|------|-----------|------|-------------|
| **A: Quick Wins** | 1, 2, 3, 6 | 1-2 | Typing indicator, delays dinámicos, soft signal gate, audio awareness |
| **B: Core Architecture** | 4 | 3-4 | Message debouncer con Inngest + migración DB |
| **C: Full Integration** | 5 | 2-3 | Interruption-aware message sending |
| **D: Emergente** | 7 | 0 | Sale de la combinación de A+B+C |

**Total estimado:** ~6-9 días (1 milestone de ~4 phases)

---

## Decisiones Arquitectónicas Justificadas

### ¿Por qué Inngest Debounce y no batchEvents?
- `batchEvents` NO funciona con cancellation events, concurrency key, rate limiting, ni priority
- `debounce` funciona con concurrency y es más predecible
- `debounce` + buffer en DB da lo mejor de ambos mundos
- Fuente: inngest.com/docs/guides/batching (limitaciones documentadas)

### ¿Por qué no Redis/Upstash?
- Supabase ya tiene los mensajes guardados — no necesitamos otro store para buffering
- Un query `SELECT FROM messages WHERE processed_by_agent = false` es suficiente
- Menos infraestructura = menos puntos de falla en serverless

### ¿Por qué no Temporal.io o Trigger.dev?
- Ya tenemos Inngest con 4 timer functions funcionando perfectamente
- El patrón debounce + waitForEvent cubre todos los casos
- Migrar workflow engine sería cambio masivo sin beneficio proporcional

### ¿Por qué no Supabase Realtime para interruption signaling?
- Funciones serverless de Vercel NO mantienen conexiones WebSocket
- Query a DB para detectar interrupciones es más confiable y simple
- Supabase Broadcast es para client→client, no function→function en serverless

### ¿Por qué no Edge Functions para clasificación rápida?
- El soft signal gate es regex/keywords (0ms) — no necesita Edge Function ni LLM
- Si en el futuro necesitamos clasificación más sofisticada, Haiku en Edge sería opción

---

## Archivos Clave Afectados (por propuesta)

### Propuesta 1 (Typing Indicator)
- NUEVO: `src/lib/whatsapp/typing.ts` — helper para enviar typing indicator
- MODIFICAR: `src/lib/agents/production/webhook-processor.ts` — llamar typing antes de engine
- MODIFICAR: `src/lib/agents/engine-adapters/production/messaging.ts` — typing entre mensajes

### Propuesta 2 (Delays Dinámicos)
- MODIFICAR: `src/lib/agents/engine-adapters/production/messaging.ts` — reemplazar sleep fijo

### Propuesta 3 (Soft Signal Gate)
- NUEVO: `src/lib/agents/somnio/soft-signal-gate.ts` — función de clasificación rápida
- MODIFICAR: `src/lib/whatsapp/webhook-handler.ts` — gate antes de agent routing
- O MODIFICAR: nueva función Inngest (si se implementa Propuesta 4)

### Propuesta 4 (Message Debouncer)
- NUEVA FUNCIÓN INNGEST: `src/inngest/functions/agent-debounced.ts`
- MODIFICAR: `src/lib/whatsapp/webhook-handler.ts` — emitir evento en vez de llamar directo
- MODIFICAR: `src/lib/domain/messages.ts` — agregar `processed_by_agent: false` en receiveMessage
- MIGRACIÓN: `ALTER TABLE messages ADD COLUMN processed_by_agent BOOLEAN DEFAULT true`
- MODIFICAR: `src/inngest/events.ts` — (el evento ya existe, posiblemente agregar campos)

### Propuesta 5 (Interruption-Aware)
- MODIFICAR: `src/lib/agents/engine-adapters/production/messaging.ts` — agregar checkForNewInbound
- POSIBLE: Conectar `InterruptionHandler` existente para pending messages

### Propuesta 6 (Audio/Image)
- MODIFICAR: `src/lib/whatsapp/webhook-handler.ts` — agregar handlers para audio/image/sticker

### Propuesta 7 (Silencio Intencional)
- No requiere archivos nuevos — emerge de la combinación

---

## Fuentes de Investigación

- [Inngest Debounce Documentation](https://www.inngest.com/docs/guides/debounce)
- [Inngest Event Batching](https://www.inngest.com/docs/guides/batching)
- [Inngest step.waitForEvent](https://www.inngest.com/docs/reference/functions/step-wait-for-event)
- ["Faster Is Not Always Better" — Gnewuch et al., ECIS 2018](https://www.researchgate.net/publication/324949980)
- [Opposing Effects of Response Time — Springer 2022](https://link.springer.com/article/10.1007/s12599-022-00755-x)
- [WhatsApp Typing Indicators — BotSailor](https://botsailor.com/blog/new-typing-indicators-in-whatsapp-cloud-api)
- [Twilio WhatsApp Typing Indicators](https://www.twilio.com/docs/whatsapp/api/typing-indicators-resource)
- [360dialog Messaging API](https://docs.360dialog.com/docs/waba-messaging/messaging)
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Upstash Redis + Vercel](https://upstash.com/docs/redis/tutorials/nextjs_with_redis)
- [Chatbot Message Delays — Tars](https://hellotars.com/blog/chatbot-message-delays)
- [Rasa Forum — Wait for user typing](https://forum.rasa.com/t/wait-user-typing-messages-which-are-broken-into-many-lines-for-chatbots-question/50239)
- [Kore.ai Interruption Management](https://developer.kore.ai/docs/bots/bot-intelligence/interruption-handling-context-switching-intents/)
- [ManyChat — Stop Automation After Reply](https://community.manychat.com/general-q-a-43/how-to-stop-automation-after-customer-replies-2560)
