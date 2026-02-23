# Architecture: Human Behavior System Integration

**Domain:** WhatsApp sales agent behavioral layer
**Researched:** 2026-02-23
**Confidence:** HIGH (based on full codebase analysis + existing design docs)

---

## 1. Current Architecture (Before)

```
360dialog HTTP POST
  |
  v
route.ts [/api/webhooks/whatsapp]
  |
  v
processWebhook()                           [webhook-handler.ts]
  |-- Save raw payload in whatsapp_webhook_events
  |-- processIncomingMessage()
  |     |-- normalizePhone()
  |     |-- domainFindOrCreateConversation()
  |     |-- domainReceiveMessage()          [domain/messages.ts]
  |     |     |-- INSERT messages (inbound)
  |     |     |-- UPDATE conversations.last_message_at
  |     |     |-- emitWhatsAppMessageReceived() -> Inngest automation trigger
  |     |     |-- checkKeywordMatches()
  |     |
  |     |-- [ONLY if msg.type === 'text']   <<< MEDIA GATE (line 250)
  |           |
  |           v
  |       processMessageWithAgent()         [webhook-processor.ts]
  |         |-- isAgentEnabledForConversation()
  |         |-- conversationHasTag('WPP' | 'P/W')
  |         |-- autoCreateContact()
  |         |-- broadcast typing=true
  |         |-- UnifiedEngine.processMessage()
  |         |     |-- storage.getOrCreateSession()
  |         |     |-- storage.getHistory()
  |         |     |-- SomnioAgent.processMessage()
  |         |     |     |-- [collecting_data] -> IngestManager
  |         |     |     |-- [else] -> checkImplicitYes
  |         |     |     |-- IntentDetector.detect()    <<< CLAUDE CALL
  |         |     |     |-- SomnioOrchestrator.orchestrate()
  |         |     |     |-- Return SomnioAgentOutput
  |         |     |-- Route to 5 adapters:
  |         |     |     |-- StorageAdapter -> DB
  |         |     |     |-- TimerAdapter -> Inngest events
  |         |     |     |-- OrdersAdapter -> domain/orders
  |         |     |     |-- MessagingAdapter -> domain/messages (360dialog)
  |         |     |     |     |-- FOR EACH template:
  |         |     |     |     |     sleep(template.delaySeconds * responseSpeed * 1000)
  |         |     |     |     |     domainSendTextMessage()
  |         |     |     |-- DebugAdapter -> no-op
  |         |-- broadcast typing=false
  |         |-- mark messages sent_by_agent=true
  |         |-- tag 'WPP' + handoff if needed
```

### Critical Observations

| # | Observation | File:Line | Impact |
|---|-------------|-----------|--------|
| H1 | Agent processing is **INLINE** in webhook request | `webhook-handler.ts:250-296` | Must migrate to Inngest for concurrency-1 |
| H2 | Only `msg.type === 'text'` reaches the agent | `webhook-handler.ts:250` | Media gate needs to intercept all types |
| H3 | `whatsappAgentProcessor` Inngest function **exists but is unused** | `agent-production.ts:29-78` | Already has concurrency 1 per conversationId |
| H4 | Delays are fixed per template: `template.delaySeconds * responseSpeed` | `messaging.ts:103-104` | Replace with char-based calculation |
| H5 | `routeByConfidence()` exists but result is **ignored** | `somnio-agent.ts:266-281` | action field not checked in production path |
| H6 | `InterruptionHandler` checks `last_activity_at` with 2s window | `message-sequencer.ts:381-404` | Known Bug #6: stale cache. Replace with DB query |
| H7 | MessagingAdapter sleep is `setTimeout`, NOT `step.sleep()` | `messaging.ts:22-24` | DB queries between sleeps are safe (same step.run) |

---

## 2. Target Architecture (After)

```
360dialog HTTP POST
  |
  v
route.ts [/api/webhooks/whatsapp]
  |
  v
processWebhook()                              [webhook-handler.ts] MODIFIED
  |-- Save raw payload in whatsapp_webhook_events
  |-- processIncomingMessage()
  |     |-- normalizePhone()
  |     |-- domainFindOrCreateConversation()
  |     |-- domainReceiveMessage()            [domain/messages.ts] MODIFIED
  |     |     |-- INSERT messages (inbound, processed_by_agent: false)   << NEW FIELD
  |     |     |-- UPDATE conversations.last_message_at
  |     |     |-- emitWhatsAppMessageReceived() -> Inngest automation trigger
  |     |     |-- checkKeywordMatches()
  |     |
  |     |-- [ALL message types, not just text]   << CHANGED
  |           |
  |           v
  |       inngest.send('agent/whatsapp.message_received', {  << CHANGED: emit event
  |         conversationId, contactId, messageContent, messageType,
  |         workspaceId, phone, messageId
  |       })
  |       RETURN  (~200ms total webhook time)
  |
  |
  === INNGEST BOUNDARY ===
  |
  v
whatsappAgentProcessor                        [agent-production.ts] MODIFIED
  concurrency: { key: 'event.data.conversationId', limit: 1 }
  |
  |-- step.run('process-message', async () => {
  |     |
  |     |-- [LAYER 2: MEDIA GATE]                [media-gate.ts] NEW
  |     |     |-- text -> continue
  |     |     |-- audio -> Whisper transcribe -> text (or handoff if 3+ intents)
  |     |     |-- image/video -> HANDOFF direct
  |     |     |-- sticker -> Claude Vision -> text (or handoff)
  |     |     |-- reaction -> interpret emoji -> text (or handoff)
  |     |
  |     |-- [LAYER 3: MESSAGE CLASSIFIER]         [message-classifier-v2.ts] NEW
  |     |     |-- Post IntentDetector classification:
  |     |     |     RESPONDIBLE -> continue to orchestrator
  |     |     |     SILENCIOSO  -> emit silence.detected, RETURN
  |     |     |     HANDOFF     -> handoff flow, RETURN
  |     |
  |     |-- [LAYER 4: CONFIDENCE ROUTING]          [somnio-agent.ts] MODIFIED
  |     |     |-- IntentDetector.detect()
  |     |     |-- confidence < 80% -> HANDOFF + LOG to disambiguation_log
  |     |     |-- confidence >= 80% -> continue
  |     |
  |     |-- [LAYER 5: ORCHESTRATION]               [somnio-orchestrator.ts] UNCHANGED
  |     |     |-- TransitionValidator
  |     |     |-- TemplateManager.getTemplatesForIntents()
  |     |     |-- Return templates[], nextMode, shouldCreateOrder
  |     |
  |     |-- [LAYER 6: PENDING MERGE]               [pending-merge.ts] NEW
  |     |     |-- Get pending templates from session state
  |     |     |-- Merge by priority: CORE > COMPLEMENTARIA > OPCIONAL
  |     |     |-- Cap at 3 templates max
  |     |
  |     |-- [LAYER 7: NO-REPETITION]               [no-repeat.ts] NEW
  |     |     |-- Level 1: template ID in templates_enviados -> skip ($0)
  |     |     |-- Level 2: minifrase semantic match via Haiku (~$0.0003)
  |     |     |-- Level 3: full message context check (~$0.001)
  |     |
  |     |-- [LAYER 8: SEND WITH PRE-CHECK]         [messaging.ts] MODIFIED
  |     |     |-- FOR EACH template:
  |     |     |     1. calculateCharDelay(content.length) * speedFactor
  |     |     |     2. sleep(delay)
  |     |     |     3. CHECK DB: new inbound since processingStartedAt?
  |     |     |        -> YES: save remaining as pending, BREAK
  |     |     |        -> NO: send template, register in no-repeat
  |     })
```

---

## 3. Integration Points (Specific Files + Lines)

### 3.1 webhook-handler.ts -- Inline to Inngest Migration

**File:** `src/lib/whatsapp/webhook-handler.ts`
**Lines:** 250-296 (the `if (msg.type === 'text')` block)

**Current code (lines 250-296):**
```typescript
if (msg.type === 'text') {
  try {
    const { processMessageWithAgent } = await import(...)
    const agentResult = await processMessageWithAgent({...})
    // ... error handling
  } catch (agentError) {
    // ... non-blocking error
  }
}
```

**New code:**
```typescript
// For ALL message types that should reach the agent:
const agentEligibleTypes = new Set(['text', 'audio', 'sticker', 'reaction', 'image', 'video'])
if (agentEligibleTypes.has(msg.type)) {
  try {
    const { inngest } = await import('@/inngest/client')
    await inngest.send({
      name: 'agent/whatsapp.message_received',
      data: {
        conversationId,
        contactId: contactId,
        messageContent: msg.type === 'text'
          ? normalizeWebsiteGreeting(msg.text?.body ?? '')
          : buildMessagePreview(msg),
        messageType: msg.type,          // NEW: pass type for media gate
        workspaceId,
        phone,
        messageId: domainResult.data?.messageId ?? msg.id,
      },
    })
  } catch (inngestError) {
    // Non-blocking: log but never fail message reception
    console.error('Failed to emit agent event:', inngestError)
  }
}
```

**Key changes:**
1. Remove `if (msg.type === 'text')` gate -- emit for all eligible types
2. Replace `processMessageWithAgent()` inline call with `inngest.send()`
3. Add `messageType` field to event data (for media gate in Inngest function)
4. Webhook returns in ~200ms instead of ~5-15s

### 3.2 agent-production.ts -- Activate + Extend the Existing Inngest Function

**File:** `src/inngest/functions/agent-production.ts`
**Lines:** 29-78 (entire function)

**Current code:** Single `step.run('process-message')` that calls `processMessageWithAgent()`

**New code structure:**
```typescript
export const whatsappAgentProcessor = inngest.createFunction(
  {
    id: 'whatsapp-agent-processor',
    name: 'WhatsApp Agent Message Processor',
    retries: 2,
    concurrency: [{ key: 'event.data.conversationId', limit: 1 }],
  },
  { event: 'agent/whatsapp.message_received' },
  async ({ event, step }) => {
    const { conversationId, messageContent, messageType, workspaceId, phone } = event.data

    const result = await step.run('process-message', async () => {
      // 1. Media Gate (Etapa 4) -- resolve to text or handoff
      const { processMediaGate } = await import('@/lib/agents/somnio/media-gate')
      const gateResult = await processMediaGate({
        messageType,
        messageContent,
        conversationId,
        workspaceId,
        // pass media URL if needed from event data
      })

      if (gateResult.action === 'handoff') {
        // Execute handoff, return early
        return { success: true, action: 'handoff' }
      }

      // 2. Call processMessageWithAgent with resolved text
      const { processMessageWithAgent } = await import(
        '@/lib/agents/production/webhook-processor'
      )
      return processMessageWithAgent({
        conversationId,
        contactId: event.data.contactId,
        messageContent: gateResult.resolvedText,
        workspaceId,
        phone,
      })
    })

    return result
  }
)
```

**Key insight:** The media gate runs INSIDE the single `step.run()`, which means concurrency-1 is already guaranteed. All layers (media gate, classifier, intent, orchestrator, messaging with pre-check) execute within this one step.

### 3.3 events.ts -- New Event Types

**File:** `src/inngest/events.ts`
**Additions to `AgentEvents`:**

```typescript
// Add messageType to existing event
'agent/whatsapp.message_received': {
  data: {
    conversationId: string
    contactId: string | null
    messageContent: string
    messageType: string           // NEW: 'text' | 'audio' | 'image' | etc.
    workspaceId: string
    phone: string
    messageId: string
  }
}

// NEW event for silence timer
'agent/silence.detected': {
  data: {
    sessionId: string
    conversationId: string
    workspaceId: string
  }
}
```

### 3.4 messaging.ts -- Char Delays + Pre-Send Check

**File:** `src/lib/agents/engine-adapters/production/messaging.ts`
**Lines:** 99-105 (the delay + send loop)

**Current code:**
```typescript
for (let i = 0; i < templates.length; i++) {
  const template = templates[i]
  if (i > 0 && template.delaySeconds > 0 && this.responseSpeed > 0) {
    await sleep(template.delaySeconds * this.responseSpeed * 1000)
  }
  // send via domain
}
```

**New code:**
```typescript
for (let i = 0; i < templates.length; i++) {
  const template = templates[i]

  // Etapa 1: Character-based delay (replaces fixed delaySeconds)
  if (i > 0) {
    const delay = calculateCharDelay(template.content.length) * this.responseSpeed
    await sleep(delay)
  }

  // Etapa 3A: Pre-send check -- query DB for new inbound messages
  if (i > 0) {
    const hasNewInbound = await this.checkForNewInbound(convId, processingStartedAt)
    if (hasNewInbound) {
      // Save remaining templates as pending (Etapa 3B)
      const remaining = templates.slice(i)
      await this.savePendingTemplates(sessionId, remaining)
      break
    }
  }

  // Send via domain (unchanged)
  const result = await domainSendTextMessage(ctx, {...})

  // Etapa 3C: Register in no-repeat system
  if (result.success) {
    sentCount++
    // Record template ID + minifrase for no-repeat
  }
}
```

**Critical implementation detail:** The `sleep()` in messaging.ts is a regular `Promise + setTimeout` (line 22-24), NOT Inngest's `step.sleep()`. This is correct because the entire messaging loop runs inside a single `step.run()`. DB queries between sleeps are plain async operations -- no Inngest memoization concerns.

### 3.5 somnio-agent.ts -- Confidence Routing + Classifier Integration

**File:** `src/lib/agents/somnio/somnio-agent.ts`
**Lines:** 265-281 (intent detection block) and 300-319 (handoff handling)

**Current code (step 5):**
```typescript
const detected = await this.intentDetector.detect(message, history, config)
intent = detected.intent
action = detected.action   // <-- CAPTURED but only 'handoff' is checked
```

**New code (after step 5, insert 5.1 and 5.2):**
```typescript
// 5. IntentDetector.detect() -- unchanged
const detected = await this.intentDetector.detect(message, history, config)
intent = detected.intent
action = detected.action

// 5.1 NEW: Confidence routing (Etapa 5)
if (intent.confidence < 80) {
  await logToDisambiguationLog({
    workspaceId: input.session.workspace_id,
    conversationId: input.session.conversation_id,
    customerMessage: input.message,
    agentState: currentMode,
    intentAlternatives: { [intent.intent]: intent.confidence, ...alternatives },
    confidenceTop: intent.confidence,
    templatesEnviados: input.session.state.templates_enviados,
  })
  return handoffOutput(...)
}

// 5.2 NEW: Message classification (Etapa 2)
const classification = classifyMessage(intent, currentMode)
if (classification === 'SILENCIOSO') {
  // Emit silence timer, return early (no response)
  return silentOutput(timerSignals: [{ type: 'silence', ... }])
}
if (classification === 'HANDOFF') {
  return handoffOutput(...)
}
```

### 3.6 domain/messages.ts -- processed_by_agent Field

**File:** `src/lib/domain/messages.ts`
**Function:** `receiveMessage()`

**Change:** Add `processed_by_agent: false` to the INSERT for inbound messages. When the Inngest function finishes processing, mark it `true`.

### 3.7 template-manager.ts -- Priority Field

**File:** `src/lib/agents/somnio/template-manager.ts`

**Change:** Extend `AgentTemplate` type to include `priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'` field. Read from `agent_templates.priority` column (new DB column).

---

## 4. New Components

| File | Purpose | Etapa | Complexity |
|------|---------|-------|------------|
| `src/lib/agents/somnio/char-delay.ts` | Logarithmic delay curve (min 2s, cap 12s) | 1 | Low |
| `src/lib/agents/somnio/message-classifier-v2.ts` | Post-IntentDetector RESPONDIBLE/SILENCIOSO/HANDOFF | 2 | Medium |
| `src/inngest/functions/silence-timer.ts` | 90s retake timer via step.waitForEvent | 2 | Low |
| `src/lib/agents/somnio/pending-merge.ts` | Priority-based merge of interrupted templates | 3B | Medium |
| `src/lib/agents/somnio/no-repeat.ts` | 3-level no-repetition (ID, minifrase, full context) | 3C | High |
| `src/lib/agents/somnio/media-gate.ts` | Audio/image/video/sticker/reaction routing | 4 | Medium |
| `src/lib/agents/somnio/disambiguation-log.ts` | Log ambiguous situations to DB table | 5 | Low |

### Components Made Obsolete (Deprecated, Not Deleted)

| File | Reason |
|------|--------|
| `src/lib/agents/somnio/message-sequencer.ts` | Replaced by pre-send check in MessagingAdapter |
| `src/lib/agents/somnio/interruption-handler.ts` | Replaced by pending-merge.ts + DB query check |

---

## 5. Database Changes

### New Column: messages.processed_by_agent

```sql
ALTER TABLE messages
  ADD COLUMN processed_by_agent BOOLEAN DEFAULT true;

-- Existing messages are already processed (default true for backward compat)
-- New inbound messages get false, marked true after Inngest processing
```

### New Column: agent_templates.priority

```sql
ALTER TABLE agent_templates
  ADD COLUMN priority TEXT DEFAULT 'CORE'
  CHECK (priority IN ('CORE', 'COMPLEMENTARIA', 'OPCIONAL'));
```

### New Column: agent_templates.minifrase

```sql
ALTER TABLE agent_templates
  ADD COLUMN minifrase TEXT;

-- ~30 rows to populate with manual minifrases per template
```

### New Table: disambiguation_log

```sql
CREATE TABLE disambiguation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  message_id UUID REFERENCES messages(id),
  customer_message TEXT NOT NULL,
  agent_state TEXT,
  intent_alternatives JSONB,
  confidence_top NUMERIC,
  templates_enviados TEXT[],
  pending_templates TEXT[],
  history_summary TEXT,
  correct_intent TEXT,
  correct_action TEXT,
  guidance_notes TEXT,
  reviewed BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);
```

### New Field in session_state: pending_templates

```
session_state.pending_templates: JSON array of unsent templates with priority
```

This uses the existing JSONB `state` field in `agent_sessions` -- no migration needed. The `savePendingTemplates()` and `getPendingTemplates()` functions write/read from the session state, similar to how `datos_capturados` works today.

---

## 6. Data Flow Changes: Pre-Send Check Detail

The pre-send check is the most architecturally significant change because it spans the Inngest boundary.

### How It Works

```
Inngest function (concurrency 1 per conversation)
  |
  step.run('process-message', async () => {
    |
    |-- processingStartedAt = NOW()
    |
    |-- [Layers 2-7: classify, detect, orchestrate, merge, no-repeat]
    |
    |-- MessagingAdapter.send(templates, processingStartedAt)
    |     |
    |     |-- FOR EACH template (i = 0 to N):
    |     |     |
    |     |     |-- if (i > 0): sleep(charDelay)      // regular setTimeout
    |     |     |
    |     |     |-- if (i > 0): CHECK DB
    |     |     |     SELECT count(*) FROM messages
    |     |     |     WHERE conversation_id = X
    |     |     |       AND direction = 'inbound'
    |     |     |       AND created_at > processingStartedAt
    |     |     |       AND processed_by_agent = false
    |     |     |
    |     |     |     -> count > 0: INTERRUPT
    |     |     |        |-- Save remaining templates to session state
    |     |     |        |-- BREAK loop
    |     |     |        |-- New message's Inngest event is QUEUED
    |     |     |        |     (concurrency 1 ensures it waits)
    |     |     |
    |     |     |     -> count = 0: CONTINUE
    |     |     |        |-- domainSendTextMessage()
    |     |     |        |-- Record in no-repeat registry
    |     |
    |-- Mark processed_by_agent = true for triggering message
    |
    |-- RETURN result
  })
  |
  |-- Next queued event starts (the interrupting message)
  |     step.run('process-message', async () => {
  |       |-- [Layers 2-7 again]
  |       |-- Layer 6: getPendingTemplates() -> merge with new templates
  |       |-- [Layer 8: send with pre-check again]
  |     })
```

### Why This Works

1. **Inngest concurrency 1** ensures only one message processes at a time per conversation
2. **Regular sleep()** in MessagingAdapter means the entire send loop runs in one step.run()
3. **DB query** during sleep window catches messages that arrived while sleeping
4. **processed_by_agent: false** flag distinguishes unprocessed inbound messages
5. **Pending templates in session state** persist across Inngest function invocations
6. **Blind window ~250ms** between DB check and actual send is accepted risk

### Why Not step.sleep() for Each Template

Using Inngest's `step.sleep()` would require splitting each template into a separate `step.run()`. This breaks the current adapter pattern where MessagingAdapter owns the send loop. It would also cause function re-executions (Inngest memoizes completed steps), adding latency. The regular `setTimeout` sleep inside a single `step.run()` is simpler and sufficient.

---

## 7. Timer Integration: Retake Timer (90s) Coexistence

### Existing Timer Pattern (from agent-timers.ts)

```typescript
// Pattern: emit event -> waitForEvent with timeout -> action on timeout
export const dataCollectionTimer = inngest.createFunction(
  { id: 'data-collection-timer', retries: 3 },
  { event: 'agent/collecting_data.started' },
  async ({ event, step }) => {
    await step.sleep('settle', '5s')  // let concurrent events settle

    const customerMessage = await step.waitForEvent('wait-for-data', {
      event: 'agent/customer.message',
      timeout: `${timeoutMs}ms`,
      match: 'data.sessionId',
    })

    if (customerMessage) return { status: 'responded' }

    // Timeout: evaluate and execute action
    await step.run('evaluate-and-execute', async () => { ... })
  }
)
```

### New Silence Timer (Same Pattern)

```typescript
export const silenceTimer = inngest.createFunction(
  { id: 'silence-timer', retries: 2 },
  { event: 'agent/silence.detected' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId } = event.data

    // Wait for customer message or 90s timeout
    const customerMessage = await step.waitForEvent('wait-for-response', {
      event: 'agent/customer.message',
      timeout: '90s',
      match: 'data.sessionId',
    })

    if (customerMessage) return { status: 'customer_replied' }

    // Timeout: send retake message
    await step.run('send-retake', async () => {
      await sendWhatsAppMessage(workspaceId, conversationId,
        'Por cierto, te cuento sobre las promociones que tenemos?')
    })

    return { status: 'retake_sent' }
  }
)
```

### Coexistence Rules

| Situation | Data Collection Timer | Promos Timer | Silence Timer |
|-----------|----------------------|--------------|---------------|
| Customer in `bienvenida`, sends "ok" (SILENCIOSO) | Not active | Not active | STARTS (90s) |
| Customer writes again within 90s | N/A | N/A | CANCELLED (customer.message event) |
| Customer enters `collecting_data` | STARTS | Not active | CANCELLED (if active) |
| Customer provides data | REEVALUATED | Not active | Not active |
| Ingest completes -> `ofrecer_promos` | CANCELLED | STARTS | Not active |
| HANDOFF triggered | CANCELLED | CANCELLED | CANCELLED |

**Cancellation mechanism:** All timers use `step.waitForEvent('agent/customer.message', match: 'data.sessionId')`. The existing `ProductionTimerAdapter.onCustomerMessage()` already emits this event. No change needed for cancellation -- silence timer automatically cancelled when customer sends any message.

**HANDOFF cancellation:** When HANDOFF occurs, silence timer is cancelled by the customer.message event emitted during handoff processing. If handoff happens WITHOUT a customer message (e.g., confidence < 80%), explicitly emit a cancellation event.

---

## 8. Pending Messages: Persistence + Merge

### Current State (InterruptionHandler)

The existing `InterruptionHandler` stores pending messages in `session_state.datos_capturados` using special `__pending_messages` key (JSON string). This is a workaround because datos_capturados is Record<string, string>.

### New Approach

Store pending templates in a dedicated field within session state:

```typescript
// In session_state (JSONB), add:
{
  // existing fields...
  datos_capturados: { nombre: 'Juan', ... },
  templates_enviados: ['hola', 'precio', ...],
  pack_seleccionado: '1x',

  // NEW:
  pending_templates: [
    {
      id: 'precio',
      content: 'Nuestro ELIXIR DEL SUEÑO...',
      priority: 'CORE',
      originalIntent: 'precio',
      minifrase: 'precio $77,900 con envio gratis, 90 comprimidos'
    }
  ]
}
```

**Access pattern:**
- `savePendingTemplates(sessionId, templates[])` -- called by MessagingAdapter on interrupt
- `getPendingTemplates(sessionId)` -- called by pending-merge.ts at Layer 6
- `clearPendingTemplates(sessionId)` -- called after merge is consumed

**Merge algorithm (pending-merge.ts):**
```
1. newTemplates = orchestrator output for new intent
2. pendingTemplates = getPendingTemplates(sessionId)
3. combined = [...newTemplates, ...pendingTemplates]
4. Sort by priority: CORE > COMPLEMENTARIA > OPCIONAL
5. Apply no-repeat filter (Layer 7) to all
6. If length > 3: drop OPCIONAL first, then COMPLEMENTARIA
7. CORE never dropped
8. clearPendingTemplates(sessionId)
9. Return final list
```

---

## 9. Where Classification Happens (Etapa 2 Detail)

**Design decision from DISCUSSION.md:** Classification is POST IntentDetector, not pre-IntentDetector. There is no regex gate. Everything goes through Claude first.

### Integration Point

**File:** `src/lib/agents/somnio/somnio-agent.ts`
**After:** Step 5 (IntentDetector.detect())
**Before:** Step 6 (Update intentsVistos)

```typescript
// After IntentDetector returns:
const classification = classifyResponseType(intent, currentMode)

switch (classification) {
  case 'SILENCIOSO':
    // States where "ok", "si" are meaningful (confirmatory):
    // resumen, collecting_data, confirmado -> NOT SILENCIOSO, treat as RESPONDIBLE
    // States where they are noise:
    // conversacion, bienvenida -> SILENCIOSO
    return {
      success: true,
      messages: [],
      stateUpdates: { /* preserve current state */ },
      shouldCreateOrder: false,
      timerSignals: [{ type: 'silence' }],
      // ...
    }

  case 'HANDOFF':
    // Intents: asesor, queja, cancelar, no_gracias, no_interesa, fallback
    return handoffOutput(...)

  case 'RESPONDIBLE':
    // Continue normal flow
    break
}
```

**New file: `message-classifier-v2.ts`**

```typescript
const HANDOFF_INTENTS = new Set([
  'asesor', 'queja', 'cancelar', 'no_gracias', 'no_interesa', 'fallback'
])

const CONFIRMATORY_STATES = new Set([
  'resumen', 'collecting_data', 'confirmado'
])

export function classifyResponseType(
  intent: IntentResult,
  currentMode: string
): 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF' {
  // HANDOFF intents always handoff
  if (HANDOFF_INTENTS.has(intent.intent)) return 'HANDOFF'

  // "otro" with low confidence = acknowledgment
  if (intent.intent === 'otro' && intent.confidence < 60) {
    // But in confirmatory states, treat as RESPONDIBLE
    if (CONFIRMATORY_STATES.has(currentMode)) return 'RESPONDIBLE'
    return 'SILENCIOSO'
  }

  return 'RESPONDIBLE'
}
```

---

## 10. Dependency Graph + Suggested Build Order

```
                    +------------------+
                    | DB Migrations    |  processed_by_agent, priority,
                    | (prerequisite)   |  minifrase, disambiguation_log
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+         +---------v---------+
    | Inngest Migration |         | Char Delay (E1)   |
    | webhook -> event  |         | Standalone, no    |
    | (CRITICAL PATH)   |         | dependencies      |
    +--------+----------+         +---------+---------+
             |                              |
    +--------v----------+                   |
    | Message Classifier|                   |
    | + Silence Timer   |                   |
    | (Etapa 2)         |                   |
    +--------+----------+                   |
             |                              |
    +--------v----------+                   |
    | Confidence Routing|                   |
    | + disambiguation_ |                   |
    | log (Etapa 5)     |                   |
    +--------+----------+                   |
             |                              |
    +--------v----------+         +---------v---------+
    | Pre-Send Check    |<--------+ Integrated into   |
    | (Etapa 3A)        |         | messaging.ts      |
    +--------+----------+         +-------------------+
             |
    +--------v----------+
    | Pending Merge     |
    | (Etapa 3B)        |
    +--------+----------+
             |
    +--------v----------+
    | No-Repeat         |
    | (Etapa 3C)        |
    +--------+----------+
             |
    +--------v----------+
    | Media Gate         |
    | (Etapa 4)         |
    +-------------------+
```

### Recommended Phase Order

| Phase | Components | Risk | Rationale |
|-------|------------|------|-----------|
| **Phase 1: Foundation** | DB migrations + Inngest migration (webhook -> event) | HIGH | Everything depends on this. Most dangerous change. Must have rollback plan. |
| **Phase 2: Char Delays** | `char-delay.ts` + modify `messaging.ts` | LOW | Isolated change. Can be done in parallel with Phase 1. |
| **Phase 3: Classification** | `message-classifier-v2.ts` + `silence-timer.ts` + modify `somnio-agent.ts` | MEDIUM | Requires Inngest migration complete. New behavior for some messages. |
| **Phase 4: Confidence** | Modify `somnio-agent.ts` confidence check + `disambiguation-log.ts` + DB table | LOW | Small code change. Mostly logging. |
| **Phase 5: Pre-Send Check** | Modify `messaging.ts` + `processed_by_agent` usage | MEDIUM | Core interruption mechanism. Requires Inngest migration. |
| **Phase 6: Pending Merge** | `pending-merge.ts` + modify session state + `priority` column usage | MEDIUM | Depends on pre-send check (Phase 5). |
| **Phase 7: No-Repeat** | `no-repeat.ts` + `minifrase` column usage + Haiku calls | HIGH | Most complex. 3-level system. Can defer Level 3 to V2. |
| **Phase 8: Media Gate** | `media-gate.ts` + Whisper integration + Claude Vision | MEDIUM | Independent of other etapas. External API dependencies (Whisper, Vision). |

### Why This Order

1. **Phase 1 first** because concurrency-1 is prerequisite for pre-send check (Phase 5) and silence timer (Phase 3)
2. **Phase 2 can parallel** with Phase 1 because it only modifies the delay calculation inside MessagingAdapter
3. **Phase 3 before Phase 5** because classification determines which messages get processed at all
4. **Phase 4 before Phase 5** because confidence routing can also short-circuit processing
5. **Phase 7 last** because it is the most complex and benefits from all other systems being stable
6. **Phase 8 can be flexible** -- it depends only on Phase 1 (Inngest migration) and nothing else depends on it

---

## 11. Patterns to Follow

### Pattern 1: Inngest Concurrency-1 Per Conversation

Already implemented in `agent-production.ts:34-38`. Use `event.data.conversationId` as concurrency key with limit 1. This guarantees sequential processing per conversation.

**Important:** A sleeping function run does NOT count against concurrency limit. So while MessagingAdapter sleeps between template sends, the Inngest queue can accept new events. They wait until the current step.run() completes.

### Pattern 2: Timer with waitForEvent + Cancellation

Same pattern as `dataCollectionTimer`, `promosTimer`, `resumenTimer`. Use `step.waitForEvent('agent/customer.message', match: 'data.sessionId')` for cancellation. Already proven in production.

### Pattern 3: Domain Layer for All Mutations

All message sends go through `domainSendTextMessage()`. The pre-send DB check is a read-only query, not a mutation. Pending template storage uses `SessionManager.updateState()` which goes through storage adapter.

---

## 12. Anti-Patterns to Avoid

### Anti-Pattern 1: step.sleep() for Template Delays

**Do NOT** use Inngest's `step.sleep()` between template sends. This would:
- Require splitting each template into a separate step.run()
- Cause function re-executions (memoization overhead)
- Break the adapter encapsulation pattern
- Add ~500ms latency per template (Inngest step overhead)

**Instead:** Use regular `setTimeout`-based sleep inside a single step.run().

### Anti-Pattern 2: Storing Pending Templates in datos_capturados

The existing `InterruptionHandler` stores pending messages as JSON in `datos_capturados.__pending_messages`. This pollutes the data collection namespace and makes the code fragile.

**Instead:** Use a dedicated `pending_templates` field in session state.

### Anti-Pattern 3: Cache-Based Interruption Detection

The existing `MessageSequencer.checkForInterruption()` reads `session.last_activity_at` which may be stale (Bug #6).

**Instead:** Query the `messages` table directly with `WHERE created_at > processingStartedAt AND processed_by_agent = false`.

### Anti-Pattern 4: Pre-IntentDetector Regex Gate

The design explicitly rejects a regex gate before IntentDetector. All messages pass through Claude for classification. The post-detection classification (RESPONDIBLE/SILENCIOSO/HANDOFF) uses the intent result, not raw message text.

---

## 13. Rollback Strategy for Inngest Migration (Phase 1)

The webhook-to-Inngest migration is the highest-risk change. Rollback plan:

```typescript
// Feature flag in workspace settings or env var
const USE_INNGEST_PROCESSING = process.env.USE_INNGEST_PROCESSING === 'true'

if (USE_INNGEST_PROCESSING) {
  // NEW: emit Inngest event
  await inngest.send({ name: 'agent/whatsapp.message_received', data: {...} })
} else {
  // OLD: inline processing (current behavior)
  if (msg.type === 'text') {
    await processMessageWithAgent({...})
  }
}
```

This allows instant rollback by toggling the env var in Vercel, without a code deploy.

---

## 14. Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Inngest migration | HIGH | `whatsappAgentProcessor` already exists with correct concurrency config. Just activate it. |
| Pre-send check | HIGH | Regular sleep + DB query pattern. No Inngest durable execution concerns. |
| Timer integration | HIGH | Exact same pattern as 4 existing timer functions. Proven in production. |
| Pending merge | MEDIUM | New priority system. Needs careful testing of merge edge cases. |
| No-repeat system | MEDIUM | 3-level system is complex. Level 1 is trivial. Level 2-3 need Haiku calls. |
| Media gate | MEDIUM | Whisper and Vision are external APIs with latency/cost. Need error handling. |
| Char delay curve | HIGH | Pure math function. Easy to test and tune. |

---

*Research completed: 2026-02-23. Based on full codebase analysis of 15+ source files plus DISCUSSION.md and ARCHITECTURE-ANALYSIS.md design documents.*

Sources:
- [Inngest Concurrency Documentation](https://www.inngest.com/docs/functions/concurrency)
- [Inngest Steps & Workflows](https://www.inngest.com/docs/features/inngest-functions/steps-workflows)
- [Inngest Multi-Step Functions](https://www.inngest.com/docs/guides/multi-step-functions)
- [Inngest Durable Execution](https://www.inngest.com/docs/learn/how-functions-are-executed)
