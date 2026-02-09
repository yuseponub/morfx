# CONSISTENCY AUDIT - MorfX Codebase

**Date:** 2026-02-09
**Scope:** Phase 16 WhatsApp Integration Preparation
**Focus:** Sandbox vs Production, Type Consistency, Naming, Flow Disconnects

---

## EXECUTIVE SUMMARY

This audit identifies **CRITICAL inconsistencies** between sandbox and production paths that will cause failures when connecting real WhatsApp to the production engine. The most severe issues are:

1. **MISSING PRODUCTION FLOW:** No WhatsApp webhook → agent engine connection exists
2. **Timer Signal Disconnect:** Sandbox emits timer signals, production has no equivalent
3. **State Type Mismatch:** SandboxState vs SessionState have incompatible fields
4. **Naming Chaos:** Same concept with 3+ different names (datos_capturados/datosCapturados/extractedData)

---

## 1. SANDBOX VS PRODUCTION DIFFERENCES

### 1.1 Engine Architecture

**CRITICAL MISMATCH:**

| Aspect | Sandbox | Production |
|--------|---------|------------|
| **Engine Class** | `SandboxEngine` | `SomnioEngine` |
| **File** | `src/lib/sandbox/sandbox-engine.ts` | `src/lib/agents/somnio/somnio-engine.ts` |
| **State Management** | In-memory, passed in/out | Database-backed via SessionManager |
| **Session Persistence** | None (client-side localStorage) | Database tables (agent_sessions, session_state, agent_turns) |
| **Message Delivery** | Returns array, client handles display | MessageSequencer with delays, sends to WhatsApp |
| **API Endpoint** | `/api/sandbox/process` | `/api/agents/somnio` |

**Impact:** These are fundamentally different execution paths. Code tested in sandbox will behave differently in production.

---

### 1.2 State Structure Mismatch

**CRITICAL TYPE INCONSISTENCY:**

**SandboxState** (`src/lib/sandbox/types.ts` L99-107):
```typescript
interface SandboxState {
  currentMode: string
  intentsVistos: string[]              // ❌ Simple array
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: PackSelection | null
  ingestStatus?: IngestStatus          // ❌ Only in sandbox
}
```

**SessionState** (`src/lib/agents/types.ts` L250-269):
```typescript
interface SessionState {
  session_id: string                   // ❌ Not in sandbox
  intents_vistos: IntentRecord[]       // ❌ Complex array with orden + timestamp
  templates_enviados: string[]
  datos_capturados: Record<string, string>
  pack_seleccionado: PackSelection | null
  proactive_started_at: string | null  // ❌ Not in sandbox
  first_data_at: string | null         // ❌ Not in sandbox
  min_data_at: string | null           // ❌ Not in sandbox
  ofrecer_promos_at: string | null     // ❌ Not in sandbox
  updated_at: string                   // ❌ Not in sandbox
}
```

**Recommendations:**
1. **BLOCKER:** `intents_vistos` format differs - sandbox uses `string[]`, production uses `IntentRecord[]` with `{intent, orden, timestamp}`
2. **MISSING:** Sandbox lacks timer timestamp fields that production uses for Inngest workflows
3. **EXTRA:** Sandbox has `ingestStatus` for debug visibility - production tracks this differently

---

### 1.3 Message Flow Comparison

**Sandbox Flow:**
```
User input → /api/sandbox/process → SandboxEngine.processMessage()
→ IntentDetector → SomnioOrchestrator → state update → return messages array
→ Client displays messages with simulated delays
```

**Production Flow (INCOMPLETE):**
```
WhatsApp webhook → /api/webhooks/whatsapp → processWebhook()
→ Store message in DB → ??? (NO AGENT ENGINE INVOCATION) → ???
```

**CRITICAL GAP:** WhatsApp webhook handler (`src/lib/whatsapp/webhook-handler.ts`) does NOT invoke the agent engine. It only:
- Stores incoming message in `messages` table
- Updates conversation stats
- Links to contact if phone matches

**Missing Production Steps:**
1. Session lookup/creation
2. Agent engine invocation (SomnioEngine.processMessage)
3. Response generation
4. Message sending back to customer

**Recommendation:**
- **BLOCKER:** Need to add SomnioEngine invocation to webhook handler after message storage
- Pattern should match `/api/agents/somnio` route but called from webhook context

---

### 1.4 Error Handling Differences

**Sandbox:**
- Returns `SandboxEngineResult` with `success: boolean` + `error?: {code, message}`
- Client displays errors as messages in chat
- No retry logic (user must manually retry)

**Production:**
- SomnioEngine returns `SomnioEngineResult` with similar structure
- `/api/agents/somnio` maps errors to HTTP status codes (503 for retryable)
- Webhook handler catches errors but still returns 200 (to prevent 360dialog retries)

**Inconsistency:** Sandbox treats all errors as non-retryable, production distinguishes retryable errors.

---

### 1.5 Tool Execution

**Sandbox:**
- CRM tools available (Phase 15.6)
- Execution mode configurable: `dry-run` (mock) or `live` (real DB)
- Tool results included in debug panel

**Production:**
- ActionDSL tools available (Phase 12)
- Always executes in "live" mode
- Tool results stored in `agent_turns.tools_called` JSONB column

**Missing in Production:**
- No equivalent to sandbox's CRM mode switcher
- No debug visibility of tool execution (would need separate admin UI)

---

### 1.6 Timer Signal System (Phase 15.7)

**CRITICAL DISCONNECT:**

**Sandbox** (`src/lib/sandbox/sandbox-engine.ts` L46, L93, L405):
- Emits `TimerSignal` in result: `{type: 'start' | 'reevaluate' | 'cancel', reason?: string}`
- Client-side `IngestTimerSimulator` consumes signals
- Evaluates timer level based on current state
- Executes actions when timer expires (sends message, transitions mode)

**Production:**
- **NO EQUIVALENT SIGNAL SYSTEM**
- Uses Inngest events instead:
  - `agent/collecting_data.started` - starts timer workflow
  - `agent/customer.message` - cancels pending timeout
  - `agent/ingest.started` - starts ingest timer (from SomnioEngine)
  - `agent/ingest.completed` - cancels ingest timer

**Missing Production Implementation:**
- SomnioEngine emits Inngest events (`emitIngestStarted`, `emitIngestCompleted`) but has no equivalent to sandbox's "reevaluate" signal
- No dynamic timer level evaluation (Inngest timers are fixed duration)
- No production implementation of Phase 15.7's multi-level timer system

**Recommendation:**
- **DECISION NEEDED:** Should production use Inngest step functions for timer levels, or implement a dynamic timer service?
- Sandbox timer levels (L1: 10min no data, L2: 6min partial data, L3: 2min promos, L4: resumen) have no production equivalent

---

## 2. TYPE CONSISTENCY ISSUES

### 2.1 Intent Tracking Format

**Inconsistency:** Same data, different shapes

**Sandbox:**
```typescript
intentsVistos: string[]  // ['precio', 'hola+envio', 'captura_datos_si_compra']
```

**Production:**
```typescript
intents_vistos: IntentRecord[]  // [{intent: 'precio', orden: 1, timestamp: '2026-02-09T...'}, ...]
```

**Files:**
- `src/lib/sandbox/types.ts` L101
- `src/lib/agents/types.ts` L254
- DB schema: `supabase/migrations/20260205_agent_sessions.sql` L76

**Impact:** Cannot directly migrate sandbox session to production session without data transformation.

---

### 2.2 Mode Name Consistency

**GOOD:** Mode names are consistent across sandbox and production:
- `conversacion`
- `collecting_data`
- `ofrecer_promos`
- `resumen_1x` / `resumen_2x` / `resumen_3x`
- `compra_confirmada`
- `no_compra`
- `handoff`

**Verified in:**
- `src/lib/agents/somnio/config.ts` (production states)
- `src/lib/sandbox/sandbox-engine.ts` L61 (initial sandbox state)
- `src/lib/agents/somnio/intents.ts` (intent definitions)

---

### 2.3 Data Field Names (CRITICAL INCONSISTENCY)

**THE PROBLEM:** Same concept with multiple names throughout codebase

**Concept: Customer Data**

| Location | Name | Type |
|----------|------|------|
| Sandbox State | `datosCapturados` | `Record<string, string>` |
| Session State | `datos_capturados` | `Record<string, string>` |
| IngestManager result | `extractedData.normalized` | `Record<string, string>` |
| DataExtractor result | `normalized` | `Record<string, string>` |
| Orchestrator updates | `datosCapturados` | `Record<string, string>` |

**Files:**
- `src/lib/sandbox/types.ts` L103 - `datosCapturados`
- `src/lib/agents/types.ts` L258 - `datos_capturados` (snake_case, matches DB)
- `src/lib/agents/somnio/ingest-manager.ts` L98 - `extractedData`
- `src/lib/agents/somnio/data-extractor.ts` L87 - `normalized`

**Impact:** Code that works with sandbox `datosCapturados` will fail when accessing production `datos_capturados`.

**Recommendation:** Standardize on `datos_capturados` (snake_case to match DB schema).

---

### 2.4 Pack Selection Type

**GOOD:** Consistent across sandbox and production

```typescript
type PackSelection = '1x' | '2x' | '3x'
```

**Verified in:**
- `src/lib/sandbox/types.ts` L9 (imports from agents/types)
- `src/lib/agents/types.ts` L244
- DB CHECK constraint: `supabase/migrations/20260205_agent_sessions.sql` L79

---

### 2.5 IngestStatus vs Timer Timestamps

**Sandbox:**
```typescript
interface IngestStatus {
  active: boolean
  startedAt: string | null
  firstDataAt: string | null
  fieldsAccumulated: string[]
  timerType: 'partial' | 'no_data' | null
  timerExpiresAt: string | null
  lastClassification?: MessageClassification
  timeline: IngestTimelineEntry[]
}
```

**Production (SessionState):**
```typescript
proactive_started_at: string | null
first_data_at: string | null
min_data_at: string | null
ofrecer_promos_at: string | null
```

**Mismatch:**
- Sandbox tracks `startedAt`, production uses `proactive_started_at`
- Sandbox tracks `fieldsAccumulated` - production has no equivalent
- Sandbox has `timeline` for debug - production has no equivalent
- Production has `min_data_at` and `ofrecer_promos_at` - sandbox doesn't track these

**Recommendation:**
- Production timestamp fields are for Inngest timer coordination
- Sandbox fields are for debug visibility
- These serve different purposes - no fix needed, but document the distinction

---

## 3. NAMING INCONSISTENCIES

### 3.1 State Field Naming Convention

**Inconsistency:** camelCase vs snake_case

| Sandbox (camelCase) | Production (snake_case) | Notes |
|---------------------|-------------------------|-------|
| `datosCapturados` | `datos_capturados` | ❌ Different |
| `intentsVistos` | `intents_vistos` | ❌ Different |
| `templatesEnviados` | `templates_enviados` | ❌ Different |
| `packSeleccionado` | `pack_seleccionado` | ❌ Different |
| `currentMode` | `current_mode` | ❌ Different |

**Explanation:** Sandbox uses JavaScript camelCase conventions. Production uses snake_case to match PostgreSQL column names.

**Impact:** Direct property access will fail when migrating code between sandbox and production.

**Recommendation:**
- Keep snake_case for production (matches DB schema)
- Consider adding mapper functions for sandbox ↔ production state conversion

---

### 3.2 Tool/Action Naming

**GOOD:** Tool names follow consistent Action DSL format

Pattern: `module.entity.action`

Examples:
- `whatsapp.message.send`
- `crm.contact.create`
- `crm.contact.update`
- `crm.tag.add`
- `crm.order.create`

**Verified in:**
- `src/lib/tools/registry.ts`
- `src/lib/agents/somnio/config.ts` (tools array)

---

### 3.3 Event Naming

**GOOD:** Inngest events follow consistent pattern

Pattern: `agent/{resource}.{action}`

Examples:
- `agent/customer.message` - customer sent message
- `agent/collecting_data.started` - entered collecting_data mode
- `agent/promos.offered` - entered ofrecer_promos mode
- `agent/ingest.started` - ingest timer started (Phase 15.5)
- `agent/ingest.completed` - ingest timer completed

**Verified in:**
- `src/lib/agents/engine.ts` L378, L414, L426
- `src/lib/agents/somnio/somnio-engine.ts` L757, L797
- `src/inngest/functions/agent-timers.ts` L45, L66, L144

---

### 3.4 Classification Types

**Inconsistency:** Enum-like strings not type-enforced

**MessageClassification** (`src/lib/agents/somnio/message-classifier.ts`):
```typescript
'datos' | 'pregunta' | 'mixto' | 'irrelevante'
```

**IngestAction** (inferred from code):
```typescript
'silent' | 'respond' | 'complete'
```

**Problem:** These strings are scattered in code with no central enum definition.

**Recommendation:** Create enums or const objects:
```typescript
export const MESSAGE_CLASSIFICATIONS = {
  DATOS: 'datos',
  PREGUNTA: 'pregunta',
  MIXTO: 'mixto',
  IRRELEVANTE: 'irrelevante',
} as const

export type MessageClassification = typeof MESSAGE_CLASSIFICATIONS[keyof typeof MESSAGE_CLASSIFICATIONS]
```

---

## 4. FLOW DISCONNECTS

### 4.1 Production WhatsApp Message Flow

**CRITICAL GAP:** No connection from webhook to agent engine

**Current Flow:**
```
WhatsApp → /api/webhooks/whatsapp (route.ts L47)
  → processWebhook() (webhook-handler.ts L36)
    → processIncomingMessage() (L86)
      → Insert into messages table (L118)
      → Update conversation stats (L146)
      → FLOW STOPS HERE ❌
```

**Expected Flow (Based on Sandbox):**
```
WhatsApp → webhook → store message
  → SomnioEngine.processMessage()
    → IntentDetector
      → SomnioOrchestrator
        → MessageSequencer
          → Send response to WhatsApp
```

**Missing Implementation:**
```typescript
// In processIncomingMessage() after line 159:

// Get workspace config to check if agent is enabled
const workspaceConfig = await getWorkspaceConfig(workspaceId)

if (workspaceConfig.somnioAgentEnabled) {
  // Invoke Somnio agent
  const engine = new SomnioEngine(workspaceId)

  const result = await engine.processMessage({
    conversationId,
    contactId: contactInfo?.wa_id ?? phone,
    messageContent: msg.text?.body ?? '[non-text message]',
    workspaceId,
    phoneNumber: phone,
  })

  logger.info({
    conversationId,
    sessionId: result.sessionId,
    messagesSent: result.messagesSent
  }, 'Agent response sent')
}
```

**Files to modify:**
- `src/lib/whatsapp/webhook-handler.ts` (add agent invocation)
- Create `src/lib/workspace/config.ts` (workspace settings for agent enablement)
- Update DB schema to add `agent_enabled` to workspaces table

---

### 4.2 Timer Action Execution Gap

**Sandbox Flow:**
```
Timer expires → IngestTimerSimulator.executeAction()
  → buildTimerAction() determines action
    → 'send_message': append to messages array
    → 'transition_mode': update state.currentMode
    → 'create_order': call /api/sandbox/process with forceIntent
```

**Production Flow:**
```
Timer expires → Inngest step function timeout
  → dataCollectionTimer workflow (agent-timers.ts L45)
    → executeToolFromAgent('whatsapp.message.send', ...)
  → ??? (No equivalent for mode transition or order creation on timer)
```

**Missing Production Implementations:**

1. **Level 3 Timer (Promos No Response):**
   - Sandbox: Re-sends promo templates after 2min silence
   - Production: No implementation

2. **Level 4 Timer (Resumen No Response):**
   - Sandbox: Auto-confirms order after timeout in resumen mode
   - Production: No implementation

**Recommendation:**
- Implement `promosNoResponseTimer` Inngest function
- Implement `resumenAutoConfirmTimer` Inngest function
- Pattern similar to existing `dataCollectionTimer` but with different actions

---

### 4.3 Session State Synchronization

**Sandbox:**
- State passed in, processed, returned in result
- Client updates React state with `newState` from result
- No persistence between page refreshes (localStorage only)

**Production:**
- SessionManager reads state from DB
- Updates state via `updateState()`
- Optimistic locking via `version` column
- Concurrent updates handled via retry logic

**Potential Issue:**
- Sandbox never encounters version conflicts
- Production code must handle `VersionConflictError`
- Testing in sandbox won't expose concurrency bugs

**Recommendation:**
- Add concurrent request testing for production engine
- Document that sandbox is single-threaded and doesn't test concurrency

---

### 4.4 Template Selection Path

**Sandbox:**
```
SomnioOrchestrator.orchestrate()
  → templateManager.selectTemplates(intent, visitType, session.state)
    → Returns templates array
      → Sandbox returns templates in result.templates
        → Client displays with delays
```

**Production:**
```
SomnioOrchestrator.orchestrate()
  → templateManager.selectTemplates(intent, visitType, session.state)
    → Returns templates array
      → SomnioEngine receives templates
        → MessageSequencer.buildSequence()
          → MessageSequencer.executeSequence()
            → Sends to WhatsApp with delays
```

**Consistency:** ✅ Template selection logic is SHARED between sandbox and production (same orchestrator). Good!

**Difference:** Only the final delivery mechanism differs (client display vs WhatsApp send).

---

### 4.5 Order Creation Trigger

**Sandbox:**
```
orchestratorResult.shouldCreateOrder === true
  → SandboxEngine checks CRM agent modes (L344)
    → Routes to crmOrchestrator.route() (L348)
      → Tool execution in DRY-RUN or LIVE mode
        → Result displayed in debug panel
```

**Production:**
```
orchestratorResult.shouldCreateOrder === true
  → SomnioEngine.processMessage() (L271)
    → OrderCreator.createContactAndOrder() (L295)
      → Always LIVE execution
        → Inserts contact + order in DB
          → No visibility of tool execution (stored in agent_turns)
```

**Inconsistency:**
- Sandbox uses CRM orchestrator (newer system from Phase 15.6)
- Production uses OrderCreator (legacy system from Phase 14)

**Recommendation:**
- **BLOCKER:** Migrate production to use CRM orchestrator
- Remove OrderCreator class (duplicate logic)
- This will unify order creation path between sandbox and production

---

## 5. DATABASE SCHEMA VS CODE

### 5.1 Agent Sessions Table

**Schema:** `supabase/migrations/20260205_agent_sessions.sql`

**agent_sessions columns:**
```sql
id UUID
agent_id TEXT                    -- Code reference, not FK
conversation_id UUID             -- FK to conversations
contact_id UUID                  -- FK to contacts
workspace_id UUID                -- FK to workspaces
version INTEGER                  -- Optimistic locking
status TEXT                      -- 'active' | 'paused' | 'closed' | 'handed_off'
current_mode TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
last_activity_at TIMESTAMPTZ
```

**AgentSession type:** `src/lib/agents/types.ts` L119-135

**Consistency:** ✅ Type matches schema exactly

---

### 5.2 Session State Table

**Schema:** `supabase/migrations/20260205_agent_sessions.sql` L72-89

**session_state columns:**
```sql
session_id UUID PRIMARY KEY      -- FK to agent_sessions
intents_vistos JSONB             -- IntentRecord[]
templates_enviados JSONB         -- string[]
datos_capturados JSONB           -- Record<string, string>
pack_seleccionado TEXT           -- '1x' | '2x' | '3x' | NULL
proactive_started_at TIMESTAMPTZ
first_data_at TIMESTAMPTZ
min_data_at TIMESTAMPTZ
ofrecer_promos_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**SessionState type:** `src/lib/agents/types.ts` L250-269

**Consistency:** ✅ Type matches schema

---

### 5.3 Agent Turns Table

**Schema:** `supabase/migrations/20260205_agent_sessions.sql` L41-65

**agent_turns columns:**
```sql
id UUID
session_id UUID                  -- FK to agent_sessions
turn_number INTEGER
role TEXT                        -- 'user' | 'assistant' | 'system'
content TEXT
intent_detected TEXT             -- For user turns
confidence NUMERIC(5,2)          -- For user turns
tools_called JSONB               -- For assistant turns: ToolCallRecord[]
tokens_used INTEGER
created_at TIMESTAMPTZ
```

**AgentTurn type:** `src/lib/agents/types.ts` L191-211

**Consistency:** ✅ Type matches schema

---

### 5.4 JSONB Field Structures

**intents_vistos:**

DB stores: `[{intent: 'precio', orden: 1, timestamp: '2026-02-09T...'}, ...]`
Type expects: `IntentRecord[]`
✅ Consistent

**templates_enviados:**

DB stores: `['template_1', 'template_2']`
Type expects: `string[]`
✅ Consistent

**datos_capturados:**

DB stores: `{nombre: 'Juan', telefono: '+573001234567', ...}`
Type expects: `Record<string, string>`
✅ Consistent

**tools_called:**

DB stores: `[{name: 'crm.contact.create', input: {...}, result: {...}}, ...]`
Type expects: `ToolCallRecord[]`
✅ Consistent

---

### 5.5 Missing Indexes

**Performance Concern:** Some common query patterns lack indexes

**Missing:**
```sql
-- Often query by phone to find conversation/contact
CREATE INDEX idx_conversations_phone ON conversations(workspace_id, phone);
CREATE INDEX idx_contacts_phone ON contacts(workspace_id, phone);

-- Often query recent sessions for a contact
CREATE INDEX idx_agent_sessions_contact ON agent_sessions(workspace_id, contact_id, last_activity_at DESC);

-- Often get total tokens for budget checks
CREATE INDEX idx_agent_turns_tokens ON agent_turns(session_id) INCLUDE (tokens_used);
```

**Recommendation:** Add these indexes in a new migration for Phase 16.

---

## 6. CONFIGURATION INCONSISTENCIES

### 6.1 Agent Configuration

**Somnio Agent Config:** `src/lib/agents/somnio/config.ts`

**Sandbox Usage:**
```typescript
import { somnioAgentConfig } from '@/lib/agents/somnio/config'

// Uses config values:
- initialState: 'conversacion'
- states: ['conversacion', 'collecting_data', ...]
- validTransitions: {...}
- intentDetector.systemPrompt
- orchestrator.systemPrompt
```

**Production Usage:**
```typescript
const agentConfig = agentRegistry.get('somnio-sales-v1')

// Uses SAME config values via registry
```

**Consistency:** ✅ Both use the SAME config object. Good!

---

### 6.2 Confidence Thresholds

**Default:** `src/lib/agents/types.ts` L53-58
```typescript
export const DEFAULT_CONFIDENCE_THRESHOLDS = {
  proceed: 85,
  reanalyze: 60,
  clarify: 40,
  handoff: 0,
}
```

**Somnio Config:** Uses defaults from types.ts

**Sandbox:** Uses agentConfig.confidenceThresholds
**Production:** Uses agentConfig.confidenceThresholds

**Consistency:** ✅ Same source for both

---

### 6.3 Environment Variables

**Sandbox:**
```
ANTHROPIC_API_KEY - Used for Claude API calls
```

**Production:**
```
ANTHROPIC_API_KEY - Claude API
WHATSAPP_API_TOKEN - 360dialog API token
WHATSAPP_WEBHOOK_VERIFY_TOKEN - Webhook verification
WHATSAPP_DEFAULT_WORKSPACE_ID - Workspace for webhooks
INNGEST_EVENT_KEY - Inngest event publishing
INNGEST_SIGNING_KEY - Inngest signature verification
```

**Missing Documentation:**
- No `.env.example` showing all required variables
- No startup validation to check if required vars are set

**Recommendation:** Create env validation on app startup:
```typescript
// src/lib/config/validate-env.ts
const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'WHATSAPP_API_TOKEN',
  // ...
]

export function validateEnv() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v])
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }
}
```

---

### 6.4 Timer Durations

**Sandbox:** Configurable via UI (Phase 15.7)
```typescript
// Default timer durations
TIMER_DEFAULTS: {
  levels: {
    1: 600,   // 10 minutes (no data)
    2: 360,   // 6 minutes (partial data)
    3: 120,   // 2 minutes (promos offered)
    4: 120,   // 2 minutes (resumen shown)
  }
}
```

**Production:** Hardcoded in Inngest functions
```typescript
// agent-timers.ts L66
timeout: '6m'  // Data collection timer

// agent-timers.ts L140
await step.sleep('wait-before-promos', '2m')
```

**Inconsistency:** Sandbox supports multiple levels, production only implements Level 2.

**Recommendation:**
- Implement all 4 timer levels in production
- Extract durations to config file (don't hardcode in Inngest functions)

---

## 7. CRITICAL RECOMMENDATIONS FOR PHASE 16

### Priority 1: BLOCKERS (Must fix before production)

1. **Connect WhatsApp webhook to SomnioEngine**
   - File: `src/lib/whatsapp/webhook-handler.ts`
   - Add: Call `SomnioEngine.processMessage()` after storing message
   - Add: Workspace config check for agent enablement

2. **Fix State Field Naming**
   - Options:
     a) Rename sandbox fields to snake_case (breaking change for sandbox UI)
     b) Add mapper functions: `toProductionState()` / `toSandboxState()`
   - Recommended: Option B (keeps sandbox JS conventions, maps at boundary)

3. **Unify Order Creation**
   - Remove: `OrderCreator` class
   - Use: CRM orchestrator for all order creation
   - File: `src/lib/agents/somnio/somnio-engine.ts` L269-322

4. **Implement Missing Timer Levels**
   - Add: `promosNoResponseTimer` Inngest function (Level 3)
   - Add: `resumenAutoConfirmTimer` Inngest function (Level 4)
   - Extract: Timer durations to config file

### Priority 2: Quality (Should fix soon)

5. **Add Intent Type Mapper**
   ```typescript
   function convertSandboxIntent(intent: string): IntentRecord {
     return {
       intent,
       orden: getCurrentOrden(),
       timestamp: new Date().toISOString(),
     }
   }
   ```

6. **Standardize Error Handling**
   - Create: Common error type for sandbox and production
   - Add: `retryable` flag to all errors
   - Document: Which errors should trigger retry vs handoff

7. **Add Missing DB Indexes**
   - See section 5.5 above
   - Create migration: `20260210_performance_indexes.sql`

### Priority 3: Nice to Have (Technical debt)

8. **Create Enum Constants**
   - For: Message classifications
   - For: Ingest actions
   - For: Session statuses
   - Pattern: See section 3.4 above

9. **Add Environment Validation**
   - See section 6.3 above
   - Call on app startup
   - Fail fast with clear error messages

10. **Unify Debug Visibility**
    - Production has no tool execution visibility
    - Consider: Admin UI for viewing agent_turns.tools_called
    - Or: Add webhook for debug events (dev environments only)

---

## 8. TESTING GAPS

### What Sandbox CANNOT Test

1. **Concurrency Issues**
   - Version conflicts during concurrent updates
   - Race conditions in session creation
   - Message ordering when multiple customers write simultaneously

2. **Database Performance**
   - Query performance with large conversation histories
   - JSONB field query optimization
   - Index effectiveness

3. **Inngest Timer Behavior**
   - Workflow persistence across deploys
   - Retry logic on failures
   - Event ordering guarantees

4. **WhatsApp API Edge Cases**
   - Rate limiting
   - Media message handling
   - Template approval status
   - 24-hour window expiration

5. **Multi-Workspace Isolation**
   - RLS policy enforcement
   - Workspace ID validation
   - Cross-workspace data leaks

### Recommended Production Tests

```typescript
// Test: Concurrent session updates
// Test: Large conversation history (1000+ turns)
// Test: Inngest timer cancellation
// Test: WhatsApp webhook deduplication
// Test: Multi-workspace isolation
```

---

## 9. MIGRATION PATH

### Converting Sandbox Sessions to Production

**Scenario:** User tests conversation in sandbox, wants to "promote" to production

**Required Transformations:**

```typescript
function sandboxToProduction(sandbox: SandboxState): Partial<SessionState> {
  return {
    // Convert intent array to IntentRecord array
    intents_vistos: sandbox.intentsVistos.map((intent, idx) => ({
      intent,
      orden: idx + 1,
      timestamp: new Date().toISOString(),
    })),

    templates_enviados: sandbox.templatesEnviados,

    // Convert camelCase to snake_case
    datos_capturados: sandbox.datosCapturados,
    pack_seleccionado: sandbox.packSeleccionado,

    // Initialize production-only fields
    proactive_started_at: null,
    first_data_at: null,
    min_data_at: null,
    ofrecer_promos_at: null,
  }
}
```

**Recommendation:** Add `/api/sandbox/promote` endpoint to create production session from sandbox session.

---

## 10. CONCLUSION

### High-Severity Issues (Block Production)

1. ❌ **WhatsApp webhook does NOT invoke agent engine** - messages are stored but never processed
2. ❌ **Timer signal system only exists in sandbox** - no production equivalent for Phase 15.7 timers
3. ❌ **State field naming mismatch** - camelCase vs snake_case will cause runtime errors
4. ❌ **Order creation uses two different systems** - OrderCreator vs CRM orchestrator

### Medium-Severity Issues (Degrade Quality)

5. ⚠️ **Intent format differs** - string[] vs IntentRecord[] requires transformation
6. ⚠️ **Missing timer levels 3 & 4** - only Level 2 (data collection) implemented in production
7. ⚠️ **No production debug visibility** - tool execution hidden in JSONB column

### Low-Severity Issues (Technical Debt)

8. ℹ️ **Missing database indexes** - performance will degrade at scale
9. ℹ️ **No environment validation** - app may start with missing config
10. ℹ️ **Enum values as magic strings** - no compile-time validation

### What's Working Well

✅ Agent configuration shared between sandbox and production
✅ Template selection logic unified
✅ Database schema matches TypeScript types
✅ Tool naming follows consistent Action DSL pattern
✅ Inngest event naming is consistent

---

**Next Steps:**
1. Review this audit with the team
2. Prioritize fixes for Phase 16 planning
3. Create tasks for each blocker
4. Update architecture docs with findings
