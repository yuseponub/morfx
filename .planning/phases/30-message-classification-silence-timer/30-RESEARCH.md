# Phase 30: Message Classification + Silence Timer - Research

**Researched:** 2026-02-25
**Domain:** Agent message classification + Inngest durable timers (pure TypeScript + existing patterns)
**Confidence:** HIGH

## Summary

This phase adds a post-IntentDetector classification layer that maps `(intent, session_state.current_mode)` to one of three categories: RESPONDIBLE, SILENCIOSO, or HANDOFF. The classification is pure TypeScript -- a deterministic mapping table with no Claude calls. The silence timer reuses the exact same `step.waitForEvent()` + timeout pattern already proven in 4 existing Inngest timer functions.

Research focused on two areas: (1) understanding the exact insertion point in the SomnioAgent pipeline and what data is available at that point, and (2) documenting the existing timer pattern precisely so the planner can create tasks that copy it exactly.

**Primary recommendation:** Add classification as step 5.5 in SomnioAgent.processMessage() (after IntentDetector, before orchestrator), with a new `classifyMessage()` function that returns `{ category: 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF', reason: string }`. For SILENCIOSO, return early with no messages and emit `agent/silence.detected` event. For HANDOFF, override existing handoff flow with the 6 specified intents. Timer follows the exact `dataCollectionTimer` pattern.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | strict | Classification logic (intent+state mapping) | Already in codebase, no external deps needed |
| Inngest | existing | Silence timer (step.waitForEvent + timeout) | 4 timers already use this exact pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | No new dependencies needed | - |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeScript map | Claude classification | Unnecessary cost/latency -- classification is deterministic given intent+state |
| New timer lib | Inngest step.waitForEvent | No reason to deviate -- existing pattern works |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
src/lib/agents/somnio/
├── message-category-classifier.ts   # NEW: (intent, mode) → RESPONDIBLE | SILENCIOSO | HANDOFF
├── somnio-agent.ts                  # MODIFIED: step 5.5 classification after intent detection
├── intents.ts                       # MODIFIED: add 4 new HANDOFF intents
├── config.ts                        # MODIFIED: add handoff transitions from all states
└── constants.ts                     # MODIFIED: add HANDOFF_INTENTS, CONFIRMATORY_MODES, ACKNOWLEDGMENT_PATTERNS

src/inngest/
├── events.ts                        # MODIFIED: add agent/silence.detected event type
└── functions/
    └── agent-timers.ts              # MODIFIED: add silenceTimer function

src/lib/agents/engine-adapters/production/
└── timer.ts                         # MODIFIED: add onSilenceDetected hook
```

### Pattern 1: Classification Lookup Table

**What:** Pure TypeScript function that maps (intent, current_mode) to a message category.
**When to use:** After IntentDetector.detect() returns intent result, before orchestrator.
**Rationale:** Classification is 100% deterministic -- no ambiguity that requires Claude.

```typescript
// Source: Codebase pattern analysis

type MessageCategory = 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'

interface ClassificationResult {
  category: MessageCategory
  reason: string
}

// The 6 HANDOFF intents (from CONTEXT.md decisions)
const HANDOFF_INTENTS = new Set([
  'asesor', 'queja', 'cancelar', 'no_gracias', 'no_interesa', 'fallback'
])

// Modes where "ok", "si", "jaja" are confirmations (RESPONDIBLE)
const CONFIRMATORY_MODES = new Set([
  'resumen', 'collecting_data', 'confirmado'
])

// Patterns that are acknowledgments in non-confirmatory modes
const ACKNOWLEDGMENT_PATTERNS = [
  /^(ok|okey|okay|va|vale|listo|jaja|jeje|ja|je|👍|👌|🤣|😂|😊|si|sí|bueno|dale|genial|perfecto|excelente)$/i,
  /^(gracias|grax|ty|thx|thanks)$/i,
]

function classifyMessage(
  intent: string,
  confidence: number,
  currentMode: string,
  message: string
): ClassificationResult {
  // Rule 1: HANDOFF intents always → HANDOFF
  if (HANDOFF_INTENTS.has(intent)) {
    return { category: 'HANDOFF', reason: `handoff_intent:${intent}` }
  }

  // Rule 2: Check for SILENCIOSO (acknowledgments in non-confirmatory modes)
  if (!CONFIRMATORY_MODES.has(currentMode)) {
    const isAcknowledgment = ACKNOWLEDGMENT_PATTERNS.some(p => p.test(message.trim()))
    if (isAcknowledgment && (intent === 'otro' || confidence < 50)) {
      return { category: 'SILENCIOSO', reason: 'acknowledgment_non_confirmatory' }
    }
  }

  // Rule 3: Everything else → RESPONDIBLE
  return { category: 'RESPONDIBLE', reason: 'default_respondible' }
}
```

### Pattern 2: Silence Timer (Inngest step.waitForEvent + timeout)

**What:** An Inngest function triggered by `agent/silence.detected` that waits 90s for a customer message.
**When to use:** When a message is classified SILENCIOSO.
**Source:** Exact pattern from `dataCollectionTimer` in `/src/inngest/functions/agent-timers.ts`.

```typescript
// Source: src/inngest/functions/agent-timers.ts (dataCollectionTimer pattern)

export const silenceTimer = inngest.createFunction(
  {
    id: 'silence-retake-timer',
    name: 'Silence Retake Timer',
    retries: 3,
  },
  { event: 'agent/silence.detected' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId } = event.data

    // Let concurrent events settle (same pattern as dataCollectionTimer)
    await step.sleep('settle', '5s')

    // Wait for customer message or 90s timeout
    const customerMessage = await step.waitForEvent('wait-for-response', {
      event: 'agent/customer.message',
      timeout: '90s',
      match: 'data.sessionId',
    })

    if (customerMessage) {
      return { status: 'responded', action: 'customer_replied' }
    }

    // Timeout: send retake message redirecting to sale
    await step.run('send-retake', async () => {
      // Send WhatsApp retake message
      await sendWhatsAppMessage(workspaceId, conversationId, RETAKE_MESSAGE)
    })

    return { status: 'timeout', action: 'retake_sent' }
  }
)
```

### Pattern 3: HANDOFF Flow (Existing Pattern)

**What:** When classification returns HANDOFF, disable bot for conversation and notify host.
**When to use:** For 6 specified HANDOFF intents.
**Source:** Existing handoff handling in `somnio-agent.ts` (step 7) and `webhook-processor.ts` (step 11).

The existing handoff mechanism already:
1. Sets session mode to 'handoff' (somnio-agent.ts line 304)
2. `webhook-processor.ts` detects `newMode === 'handoff'` (line 297)
3. Calls `executeHandoff()` which:
   - Sends handoff message via WhatsApp ("Regalame 1 min")
   - Calls `setConversationAgentOverride(conversationId, 'conversational', false)`
   - Creates a task for next available human agent

**IMPORTANT:** The existing handoff path already works for `fallback` (confidence < 40) and `no_interesa`. Phase 30 extends this to cover 4 new intents (asesor, queja, cancelar, no_gracias) that currently don't exist as named Somnio intents.

### Pattern 4: Pipeline Insertion Point

**What:** Where to insert classification in SomnioAgent.processMessage() flow.
**When to use:** Always.

Current pipeline (from `somnio-agent.ts`):
```
1. Get agent config
2. Initialize tracking
3. Check ingest mode (collecting_data only)
4. Check implicit yes
5. Detect intent (IntentDetector.detect())
6. Update intentsVistos
7. Handle handoff (currently: confidence < 40 || fallback)
8. Build mock session
9. Orchestrate
10-14. State updates, timers, messages, order, return
```

**Insertion at step 5.5 (after 5, replacing step 7):**
```
5. Detect intent
5.5 NEW: Classify message → RESPONDIBLE | SILENCIOSO | HANDOFF
    - SILENCIOSO → emit silence event, return early (no messages)
    - HANDOFF → set mode 'handoff', return early with handoff message
    - RESPONDIBLE → continue to step 6
6. Update intentsVistos
7. Handle handoff (remove old logic, now handled by 5.5)
...
```

### Anti-Patterns to Avoid

- **Don't use Claude for classification:** The mapping is deterministic (intent + state → category). Using Claude would add latency and cost for zero benefit.
- **Don't create a separate classification microservice:** This is a pure function, no need for external calls.
- **Don't check raw message text for HANDOFF:** Use the detected intent name, not regex on message. IntentDetector already handles NLU.
- **Don't skip the 5s settle period on the timer:** The existing timers have this for a reason -- prevents customer.message from the same request from cancelling the timer immediately.
- **Don't fire-and-forget Inngest events:** Per MEMORY.md learning, always `await` inngest.send() in serverless.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timer wait/cancel | Custom setTimeout/setInterval | Inngest step.waitForEvent() | Durable across server restarts, proven pattern |
| WhatsApp message sending | Direct API call | Existing `sendWhatsAppMessage()` helper | Already handles API key lookup, message DB insert, conversation touch |
| Bot disable on handoff | Direct DB update | Existing `executeHandoff()` flow | Already handles agent toggle, task creation, round-robin assignment |
| Event type safety | Loose string events | Inngest EventSchemas + AllAgentEvents type | Type-checked event data across all functions |

**Key insight:** 100% of the infrastructure needed already exists. The only new code is (a) classification logic (~50 lines), (b) 4 new intent definitions, (c) 1 new Inngest function (~40 lines), and (d) pipeline wiring (~20 lines).

## Common Pitfalls

### Pitfall 1: Concurrent Timer Problem (Settle Period)

**What goes wrong:** Customer sends "ok" (SILENCIOSO), silence timer starts. In the same request, `agent/customer.message` is also emitted by the production timer adapter, immediately cancelling the silence timer.
**Why it happens:** The engine always emits `agent/customer.message` for every incoming message (timer.ts line 83-99). If silence timer starts and customer.message is emitted in the same request, the timer cancels instantly.
**How to avoid:** The `step.sleep('settle', '5s')` pattern (used in all 4 existing timers) prevents this. The silence timer MUST include this same settle step.
**Warning signs:** Timer always returns `{ status: 'responded' }` immediately in production.

### Pitfall 2: Missing Intent Definitions

**What goes wrong:** Classification checks for `HANDOFF_INTENTS.has('asesor')` but IntentDetector never outputs "asesor" because it's not in the intent list.
**Why it happens:** The CONTEXT.md specifies 6 HANDOFF intents but only 2 (`fallback`, `no_interesa`) currently exist in `intents.ts`. The other 4 (`asesor`, `queja`, `cancelar`, `no_gracias`) need to be added.
**How to avoid:** Add 4 new IntentDefinition entries to `intents.ts` before implementing the classifier. The prompt is auto-generated from SOMNIO_INTENTS, so adding entries automatically updates the prompt.
**Warning signs:** Messages like "quiero hablar con un asesor" get classified as `fallback` instead of `asesor`.

### Pitfall 3: Timer Not Cancelling on HANDOFF

**What goes wrong:** Customer sends "ok" (SILENCIOSO, timer starts), then sends "quiero un asesor" (HANDOFF). The 90s silence timer is still running and sends a retake message after the bot has been disabled.
**Why it happens:** `agent/customer.message` is emitted on every message (cancels existing timers), but only if `!input.forceIntent`. For HANDOFF, the message IS from the customer, so customer.message IS emitted -- the silence timer SHOULD be cancelled by it.
**How to avoid:** Verify that HANDOFF messages still go through the normal `onCustomerMessage` hook in UnifiedEngine. Currently they do (step 4b, line 117). The customer.message event with matching sessionId will cancel the pending silence timer via step.waitForEvent() match.
**Warning signs:** Retake messages sent to conversations where bot is already disabled.

### Pitfall 4: State-Dependent Nuance — "bienvenida" Mode

**What goes wrong:** Customer says "si" in `bienvenida` mode, classified as SILENCIOSO. But the `bienvenida` state is the initial greeting state -- "si" might mean "yes, I'm interested".
**Why it happens:** The CONTEXT.md specifies bienvenida as non-confirmatory, but `bienvenida` is functionally the start of the conversation.
**How to avoid:** The CONTEXT.md explicitly lists `bienvenida` as non-confirmatory. Follow the user's decision. If "si" in bienvenida should do something, the IntentDetector should classify it differently (e.g., as `captura_datos_si_compra`). The classifier only acts on intent+state, not on raw text interpretation.
**Warning signs:** None -- follow the CONTEXT.md decisions as specified.

### Pitfall 5: Inngest Function Registration

**What goes wrong:** Silence timer function created but never fires.
**Why it happens:** Forgot to register the new function in `src/app/api/inngest/route.ts`.
**How to avoid:** Add `silenceTimer` to the `agentTimerFunctions` array in `agent-timers.ts`, which is already imported by the Inngest route.
**Warning signs:** Inngest dashboard shows no function registered with id 'silence-retake-timer'.

### Pitfall 6: Missing Event Type in AllAgentEvents

**What goes wrong:** TypeScript error when emitting `agent/silence.detected` -- event name not in type union.
**Why it happens:** `AllAgentEvents` in `events.ts` is the type constraint for Inngest client. New events must be added to `AgentEvents`.
**How to avoid:** Add `'agent/silence.detected'` event definition to the `AgentEvents` type in `src/inngest/events.ts` before using it.
**Warning signs:** TypeScript compilation error: "Type 'agent/silence.detected' is not assignable to parameter..."

## Code Examples

### Example 1: New Intents to Add

```typescript
// Source: Pattern from existing intents.ts

// Add to INTENTS_FLUJO_COMPRA or create new INTENTS_HANDOFF array:

const INTENTS_HANDOFF: IntentDefinition[] = [
  {
    name: 'asesor',
    description: 'Cliente pide hablar con un asesor humano',
    examples: [
      'Quiero hablar con un asesor',
      'Necesito un humano',
      'Pasame con alguien',
      'Quiero que me atienda una persona',
      'Me pueden llamar?',
    ],
    triggers: ['asesor', 'humano', 'persona', 'llamar', 'hablar con'],
    category: 'escape',
  },
  {
    name: 'queja',
    description: 'Cliente tiene una queja o reclamo',
    examples: [
      'Tengo una queja',
      'Quiero poner un reclamo',
      'El producto no me llego',
      'No estoy conforme',
      'Quiero devolver el producto',
    ],
    triggers: ['queja', 'reclamo', 'devolver', 'no llego', 'no conforme'],
    category: 'escape',
  },
  {
    name: 'cancelar',
    description: 'Cliente quiere cancelar un pedido o proceso en curso',
    examples: [
      'Quiero cancelar',
      'Cancela mi pedido',
      'Ya no quiero',
      'Mejor no',
    ],
    triggers: ['cancelar', 'cancela', 'anular'],
    category: 'escape',
  },
  {
    name: 'no_gracias',
    description: 'Cliente rechaza educadamente la oferta',
    examples: [
      'No gracias',
      'Gracias pero no',
      'Por ahora no',
      'Luego veo',
      'Lo pienso',
    ],
    triggers: ['no gracias', 'gracias pero no', 'por ahora no'],
    category: 'escape',
  },
]
```

### Example 2: Event Type Definition

```typescript
// Source: Pattern from src/inngest/events.ts (AgentEvents type)

/**
 * Emitted when a customer message is classified as SILENCIOSO.
 * Triggers 90-second silence retake timer.
 */
'agent/silence.detected': {
  data: {
    sessionId: string
    conversationId: string
    workspaceId: string
    /** The original message that was classified silent */
    message: string
    /** The intent that was detected */
    intent: string
    /** Timer duration in ms (default 90000) */
    timerDurationMs?: number
  }
}
```

### Example 3: Timer Adapter Hook

```typescript
// Source: Pattern from production/timer.ts (onModeTransition)

/**
 * Emit agent/silence.detected event to start silence retake timer.
 */
async onSilenceDetected(
  sessionId: string,
  conversationId: string,
  message: string,
  intent: string
): Promise<void> {
  try {
    const { inngest } = await import('@/inngest/client')
    await inngest.send({
      name: 'agent/silence.detected',
      data: {
        sessionId,
        conversationId,
        workspaceId: this.workspaceId,
        message,
        intent,
        timerDurationMs: 90_000,
      },
    })
    logger.info({ sessionId }, 'Emitted agent/silence.detected event')
  } catch (error) {
    logger.warn({ error, sessionId }, 'Failed to emit silence.detected event')
  }
}
```

### Example 4: SomnioAgent Pipeline Modification

```typescript
// Source: somnio-agent.ts processMessage() modification

// After step 5 (intent detection), before step 6:

// 5.5 Classify message category
const classification = this.messageCategoryClassifier.classify(
  intent.intent,
  intent.confidence,
  currentMode,
  input.message
)

// SILENCIOSO: return early with no messages, emit silence event
if (classification.category === 'SILENCIOSO') {
  return {
    success: true,
    messages: [],  // NO response
    stateUpdates: {
      newMode: currentMode,  // Don't change mode
      newIntentsVistos: newIntentsVistos,
      newTemplatesEnviados: input.session.state.templates_enviados ?? [],
      newDatosCapturados: currentData,
      newPackSeleccionado: input.session.state.pack_seleccionado,
    },
    shouldCreateOrder: false,
    timerSignals: [],
    silenceDetected: true,  // Signal for engine to emit silence event
    totalTokens,
    tokenDetails,
    intentInfo,
    tools: [],
  }
}

// HANDOFF: override existing handoff logic
if (classification.category === 'HANDOFF') {
  return {
    success: true,
    messages: [],  // webhook-processor handles handoff message
    stateUpdates: {
      newMode: 'handoff',
      newIntentsVistos: newIntentsVistos,
      newTemplatesEnviados: input.session.state.templates_enviados ?? [],
      newDatosCapturados: currentData,
      newPackSeleccionado: input.session.state.pack_seleccionado,
    },
    shouldCreateOrder: false,
    timerSignals: [{ type: 'cancel', reason: 'handoff' }],
    totalTokens,
    tokenDetails,
    intentInfo,
    tools: [],
  }
}

// RESPONDIBLE: continue normal flow (step 6+)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All messages go through orchestrator | Phase 30: classify first, skip orchestrator for SILENCIOSO/HANDOFF | Phase 30 | Saves ~500ms + tokens per silent message |
| Handoff only on confidence < 40 | Phase 30: handoff on 6 specific intents regardless of confidence | Phase 30 | More predictable handoff behavior |
| No re-engagement after silence | Phase 30: 90s retake timer | Phase 30 | Reduces abandoned conversations |

**Important: NOT deprecated/changing:**
- IntentDetector still runs on ALL messages (no pre-gate regex)
- ConfidenceThresholds exist but are NOT enforced in Phase 30 (Phase 33)
- Existing timer infrastructure unchanged (just adding one more timer)

## Open Questions

1. **Retake message text**
   - What we know: Should sound natural, redirect to sale. Example from CONTEXT.md: "Por cierto, te cuento sobre las promociones? :)"
   - What's unclear: Exact text (Claude's Discretion per CONTEXT.md)
   - Recommendation: Use a simple, warm message that redirects to the sales flow. Make it configurable via constant.

2. **"otro" intent handling**
   - What we know: The DEFAULT_INTENT_PROMPT has "otro" as an intent. The Somnio INTENT_DETECTOR_PROMPT does NOT have "otro" -- it uses `fallback` for unclassifiable messages.
   - What's unclear: Whether IntentDetector will ever return "otro" with the Somnio prompt.
   - Recommendation: Include "otro" in the SILENCIOSO check as a safety net, but the primary path is through the 31 Somnio intents. Test with edge cases.

3. **Multiple concurrent silence timers**
   - What we know: Customer could send "ok" (SILENCIOSO), then another "jaja" (SILENCIOSO) before 90s. Each triggers `agent/silence.detected`.
   - What's unclear: Should the second SILENCIOSO reset the 90s timer?
   - Recommendation: Yes. The second message emits `agent/customer.message` (which cancels the first timer) AND emits a new `agent/silence.detected` (which starts a new timer). This is the natural behavior with the existing event system -- no special handling needed.

4. **ofrecer_promos mode classification**
   - What we know: `ofrecer_promos` is NOT in CONFIRMATORY_MODES. Customer saying "ok" in promos mode would be SILENCIOSO.
   - What's unclear: Is "ok" in ofrecer_promos really a silent acknowledgment? Customer might mean "ok, show me the promos".
   - Recommendation: Follow CONTEXT.md decision. `ofrecer_promos` is NOT confirmatory. The IntentDetector should classify "ok quiero el de 2" as `resumen_2x`, not as a bare acknowledgment. Only bare "ok" with no further content would be SILENCIOSO.

## Sources

### Primary (HIGH confidence)
- `/src/inngest/functions/agent-timers.ts` — 4 existing timer patterns (dataCollectionTimer, promosTimer, resumenTimer, ingestTimer)
- `/src/inngest/events.ts` — Event type definitions including agent/customer.message
- `/src/lib/agents/somnio/somnio-agent.ts` — Full pipeline flow (14 steps), insertion point analysis
- `/src/lib/agents/somnio/intents.ts` — Current 31 intents, 4 missing HANDOFF intents identified
- `/src/lib/agents/somnio/config.ts` — SOMNIO_STATES, SOMNIO_TRANSITIONS
- `/src/lib/agents/production/handoff-handler.ts` — Existing handoff mechanism (message + toggle + task)
- `/src/lib/agents/production/webhook-processor.ts` — How handoff is triggered from engine output
- `/src/lib/agents/engine-adapters/production/timer.ts` — How Inngest events are emitted from engine
- `/src/lib/agents/engine/unified-engine.ts` — How agent output routes to adapters
- `/src/lib/agents/somnio/message-classifier.ts` — Existing ingest classifier (NOT the same as Phase 30 classifier)
- `/src/lib/agents/somnio/interruption-handler.ts` — CONFLICTING_INTENTS already lists asesor, queja, cancelar, no_gracias

### Secondary (MEDIUM confidence)
- `.planning/phases/30-message-classification-silence-timer/30-CONTEXT.md` — User decisions constraining implementation

### Tertiary (LOW confidence)
- None — all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries, all patterns exist in codebase
- Architecture: HIGH — Pipeline insertion point clearly identified, timer pattern proven x4
- Pitfalls: HIGH — All 6 pitfalls verified against actual code paths

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable — internal codebase patterns, no external API changes)
