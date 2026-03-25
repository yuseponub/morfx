# Standalone: Somnio Recompra - Research

**Researched:** 2026-03-24
**Domain:** WhatsApp sales agent (v3 two-track architecture fork for returning clients)
**Confidence:** HIGH

## Summary

The Somnio Recompra agent is a simplified fork of the v3 Somnio sales agent, specialized for contacts with `is_client=true` and no active order tags. It reuses the v3 two-track architecture (comprehension + sales-track + response-track) with a fundamentally different flow: data CONFIRMATION instead of CAPTURE.

The primary challenge is properly forking the v3 pipeline. The codebase already has a proven pattern for this: the GoDentist agent (`src/lib/agents/godentist/`) is a complete v3-architecture fork with its own types, constants, transitions, comprehension prompt, etc. The recompra agent should follow the exact same pattern.

The secondary challenge is the routing changes in webhook-processor.ts: currently `is_client=true` contacts are SKIPPED entirely (line 164). This must change to route to the recompra agent instead of skip.

**Primary recommendation:** Fork `src/lib/agents/somnio-v3/` into `src/lib/agents/somnio-recompra/` following the GoDentist pattern exactly. Modify webhook-processor.ts routing and agent-timers-v3.ts to support the new agent module.

## Standard Stack

### Core (all existing -- no new libraries)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Claude Haiku (via AI SDK) | v6 | Comprehension layer | Same as v3, one call per turn |
| Inngest | existing | Timer workflows | Reuses v3 timer system |
| Supabase | existing | State persistence, order data loading | Admin client for DB queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TemplateManager | existing | Load/process WhatsApp templates | Response track template resolution |
| normalizers | existing from somnio/ | Phone, city, department normalization | State merge layer |
| block-composer | existing from somnio/ | Template block composition | Response track output |

**Installation:** No new packages needed. This is a pure TypeScript module fork.

## Architecture Patterns

### Recommended Project Structure
```
src/lib/agents/somnio-recompra/
├── index.ts                    # Entry point, auto-registro en registry
├── somnio-recompra-agent.ts    # Pipeline principal (processMessage)
├── engine-recompra.ts          # Sandbox adapter
├── types.ts                    # Types (simplified from v3)
├── state.ts                    # mergeAnalysis, computeGates, serialize
├── comprehension.ts            # Claude Haiku call
├── comprehension-schema.ts     # Zod schema for structured output
├── comprehension-prompt.ts     # System prompt for Haiku
├── guards.ts                   # R0 (low confidence) + R1 (escape)
├── sales-track.ts              # State machine (WHAT TO DO)
├── response-track.ts           # Template engine (WHAT TO SAY)
├── phase.ts                    # Phase derivation
├── transitions.ts              # Declarative transition table
├── constants.ts                # Constants (zero imports)
└── config.ts                   # Registry configuration
```

This mirrors exactly:
- `src/lib/agents/somnio-v3/` (original)
- `src/lib/agents/godentist/` (proven fork pattern)

### Pattern 1: GoDentist Fork Pattern (PROVEN)
**What:** Complete module fork with own types, constants, transitions
**When to use:** When creating a new agent that shares v3 architecture but differs in business logic
**Evidence:** GoDentist agent has identical file structure, different content in each file

Key observations from the GoDentist fork:
1. `config.ts` -- new agent ID, name, states, transitions
2. `types.ts` -- can import from v3 types or define own
3. `constants.ts` -- ZERO imports from other project files (project rule)
4. `transitions.ts` -- completely rewritten transition table
5. `index.ts` -- self-registers in agentRegistry on import
6. `comprehension-prompt.ts` -- product-specific prompt

### Pattern 2: Routing in webhook-processor.ts
**What:** Agent selection based on contact properties
**Current behavior (line 157-167):**
```typescript
// 3b. Check if contact is a client (bot should not respond)
const { data: contactData } = await supabase
  .from('contacts')
  .select('is_client')
  .eq('id', contactId)
  .single()

if (contactData?.is_client) {
  logger.info({ conversationId, contactId }, 'Contact is a client, skipping agent')
  return { success: true }
}
```

**New behavior needed:**
```typescript
if (contactData?.is_client) {
  // Route to recompra agent instead of skipping
  // But ONLY if no active order tags (WPP, P/W, RECO already checked at step 1b)
  // Since step 1b already filters those tags, arriving here means is_client + no blocking tags
  // → route to somnio-recompra-v1
}
```

### Pattern 3: V3ProductionRunner agentModule routing
**What:** The V3ProductionRunner uses `config.agentModule` to route processMessage calls
**Current code (v3-production-runner.ts line 118-127):**
```typescript
if (this.config.agentModule === 'godentist') {
  const { processMessage } = await import('../godentist/godentist-agent')
  output = await processMessage(v3Input as any) as unknown as V3AgentOutput
} else {
  const { processMessage } = await import('../somnio-v3/somnio-v3-agent')
  output = await processMessage(v3Input)
}
```

Must add `'somnio-recompra'` as a third option.

### Pattern 4: Timer routing in agent-timers-v3.ts
**What:** Timer Inngest function routes by `conversational_agent_id` to choose processMessage
**Current code (line 206-216):**
```typescript
const agentModule = agentConfig?.conversational_agent_id === 'godentist' ? 'godentist' : 'somnio-v3'
```

Must add recompra routing. BUT: the recompra agent is NOT selected via `conversational_agent_id` (that's workspace-wide). The recompra routing is per-contact (is_client). The timer function needs a different mechanism to know which agent to call -- likely stored on the session itself.

### Pattern 5: Data Preloading from Last Delivered Order
**What:** Load contact's last delivered order to pre-populate agent state
**When:** At session creation or first message processing for recompra agent
**Query pattern:**
```typescript
const { data: lastOrder } = await supabase
  .from('orders')
  .select('shipping_name, shipping_last_name, shipping_phone, shipping_address, shipping_city, shipping_department')
  .eq('contact_id', contactId)
  .eq('workspace_id', workspaceId)
  // Filter for delivered/completed orders
  .order('created_at', { ascending: false })
  .limit(1)
  .single()
```

### Anti-Patterns to Avoid
- **Modifying v3 code directly:** NEVER change somnio-v3 files. Fork completely.
- **Sharing constants.ts:** The recompra constants.ts must be self-contained (zero imports rule).
- **Using conversational_agent_id for routing:** This is workspace-level. Recompra routing is contact-level (is_client). The two must coexist -- same workspace can have v3 for new contacts and recompra for clients.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template loading/processing | Custom template fetcher | TemplateManager from somnio/ | Already handles rotation, dedup, variable substitution |
| Block composition | Custom message ordering | composeBlock from somnio/ | Handles priority, max messages, delay |
| Phone/city normalization | Custom normalizers | normalizers from somnio/ | Already handles Colombian formats, department inference |
| Timer workflow | New Inngest function | Extend agent-timers-v3.ts | Same architecture, just add routing branch |
| Session state persistence | Custom DB logic | Existing StorageAdapter | V3ProductionRunner already handles state serialization |
| Delivery zone lookup | Custom zone code | lookupDeliveryZone from delivery-zones.ts | Already maps cities to delivery zones |
| Greeting by time of day | Manual hour checking | Compute in comprehension or response-track | Simple: `new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit' })` |

## Common Pitfalls

### Pitfall 1: Agent Routing Collision (workspace vs contact level)
**What goes wrong:** The `conversational_agent_id` in workspace_agent_config is workspace-wide. Recompra is contact-specific.
**Why it happens:** v3 and godentist are selected at workspace level. Recompra coexists WITH v3 in the same workspace.
**How to avoid:** Route in webhook-processor BEFORE the agentId resolution. The is_client check already exists at step 3b -- convert it from "skip" to "route to recompra". The workspace's `conversational_agent_id` remains `somnio-sales-v3`. The override happens per-contact.
**Warning signs:** All contacts getting recompra agent, or no contacts getting it.

### Pitfall 2: Timer Agent Mismatch
**What goes wrong:** Timer fires, but calls v3's processMessage instead of recompra's processMessage.
**Why it happens:** agent-timers-v3.ts routes by `conversational_agent_id` which is workspace-level.
**How to avoid:** Store the agent module identifier on the session (e.g., in session_state or a dedicated field). The timer function reads this to route correctly.
**Warning signs:** Timer fires with wrong transitions/templates for a recompra conversation.

### Pitfall 3: Pre-populated Data Not Flowing to Comprehension
**What goes wrong:** Comprehension prompt says "no data captured" even though we preloaded from last order.
**Why it happens:** Data preloading happens at session level, but comprehension reads from `existingData` parameter.
**How to avoid:** Preloaded data must be in `datosCapturados` in session state BEFORE first processMessage call. The comprehension prompt's `buildSystemPrompt(existingData)` will then show them correctly.

### Pitfall 4: "Si" Context Mishandling for Address Confirmation
**What goes wrong:** Client says "si" to confirm address, but comprehension interprets it as `acknowledgment` instead of `confirmar` or a new intent like `confirmar_direccion`.
**Why it happens:** The comprehension prompt needs explicit context about address confirmation flow.
**How to avoid:** The comprehension prompt must document that after showing address and asking "Seria para la misma direccion?", a "si" = confirmar_direccion. The bot context section already handles this pattern -- just needs the right entries.

### Pitfall 5: Sandbox Agent Selection
**What goes wrong:** Sandbox doesn't know about recompra agent, can't test it.
**Why it happens:** Sandbox process route (`src/app/api/sandbox/process/route.ts`) dispatches by agentId. Must add recompra branch.
**How to avoid:** Add `somnio-recompra-v1` case in sandbox process route, similar to v3 case.

### Pitfall 6: OfiInter Logic Not Applicable
**What goes wrong:** Recompra agent includes ofiInter transitions inherited from v3 copy.
**Why it happens:** Blind copy of transitions.ts includes all ofiInter logic.
**How to avoid:** Recompra has simpler flow -- client already has delivery address from last order. OfiInter detection should still work (client might want to change to office pickup for recompra), but the transition table should be simplified.

## Code Examples

### Agent Registration (config.ts)
```typescript
// Source: Following godentist/config.ts pattern
import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'

export const somnioRecompraConfig: AgentConfig = {
  id: SOMNIO_RECOMPRA_AGENT_ID,
  name: 'Somnio Recompra Agent',
  description: 'Agente de recompra para clientes existentes. Pipeline v3 simplificado.',
  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — recompra uses comprehension.ts directly',
    maxTokens: 512,
  },
  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — recompra uses sales-track.ts + response-track.ts directly',
    maxTokens: 512,
  },
  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.contact.get',
    'crm.order.create',
    'whatsapp.message.send',
  ],
  states: [
    'nuevo',
    'confirmando_datos',
    'promos',
    'confirmacion',
    'orden_creada',
    'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: {
    nuevo: ['confirmando_datos', 'promos', 'handoff'],
    confirmando_datos: ['promos', 'handoff'],
    promos: ['confirmacion', 'orden_creada', 'handoff'],
    confirmacion: ['orden_creada', 'promos', 'handoff'],
    orden_creada: ['handoff'],
    handoff: [],
  },
  confidenceThresholds: { proceed: 80, reanalyze: 60, clarify: 40, handoff: 0 },
  tokenBudget: 50_000,
}
```

### Simplified Phase Derivation
```typescript
// Phases: initial → promos_shown → confirming → order_created → closed
// No capturing_data phase (datos come preloaded)
export type RecompraPhase =
  | 'initial'
  | 'promos_shown'
  | 'confirming'
  | 'order_created'
  | 'closed'

export function derivePhase(acciones: AccionRegistrada[]): RecompraPhase {
  for (let i = acciones.length - 1; i >= 0; i--) {
    const tipo = acciones[i].tipo
    switch (tipo) {
      case 'ofrecer_promos': return 'promos_shown'
      case 'mostrar_confirmacion': return 'confirming'
      case 'crear_orden':
      case 'crear_orden_sin_promo':
      case 'crear_orden_sin_confirmar': return 'order_created'
      case 'handoff':
      case 'rechazar':
      case 'no_interesa': return 'closed'
    }
  }
  return 'initial'
}
```

### Simplified Timer Constants
```typescript
// Only 3 timers: L3, L4, L5
export const RECOMPRA_TIMER_DURATIONS: Record<string, Record<number, number>> = {
  real:         { 3: 600, 4: 600, 5: 90 },
  rapido:       { 3:  60, 4:  60, 5:   9 },
  instantaneo:  { 3:   2, 4:   2, 5:   1 },
}
```

### Webhook Routing Change
```typescript
// In webhook-processor.ts, replace step 3b:
// BEFORE:
if (contactData?.is_client) {
  logger.info({ conversationId, contactId }, 'Contact is a client, skipping agent')
  return { success: true }
}

// AFTER:
if (contactData?.is_client) {
  // Route to recompra agent (tags already filtered at step 1b)
  await import('../somnio-recompra')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, {
    workspaceId,
    agentModule: 'somnio-recompra',
  })
  // ... same processMessage call pattern as v3
}
```

### Data Preloading Query
```typescript
// Load last order data for the contact
async function loadLastOrderData(contactId: string, workspaceId: string): Promise<Partial<DatosCliente>> {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from('orders')
    .select('shipping_name, shipping_last_name, shipping_phone, shipping_address, shipping_city, shipping_department')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!order) return {}
  return {
    nombre: order.shipping_name,
    apellido: order.shipping_last_name,
    telefono: order.shipping_phone,
    direccion: order.shipping_address,
    ciudad: order.shipping_city,
    departamento: order.shipping_department,
  }
}
```

### Time-of-Day Greeting
```typescript
function getGreeting(nombre: string): string {
  const now = new Date()
  const hour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit' })
  )
  const firstName = nombre.split(' ')[0]
  if (hour < 12) return `Buenos dias ${firstName}`
  if (hour < 18) return `Buenas tardes ${firstName}`
  return `Buenas noches ${firstName}`
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skip is_client contacts entirely | Route is_client to recompra agent | This phase | Clients get personalized recompra flow |
| Single agent per workspace | Multiple agents coexisting (v3 + recompra) | This phase | Contact-level routing needed |

## Key Differences: Recompra vs V3

| Aspect | V3 | Recompra |
|--------|-----|----------|
| Data flow | Capture from scratch | Preload + confirm |
| Phases | initial, capturing_data, promos_shown, confirming, order_created, closed | initial, promos_shown, confirming, order_created, closed |
| Timers | L0-L8 (9 levels) | L3, L4, L5 (3 levels) |
| Intents | 22 intents | ~17 intents (remove contenido, formula, como_se_toma, efectividad) |
| Entry scenarios | Generic (saludo, quiero_comprar, datos) | 3 specific (solo saluda, quiere pedir, datos espontaneos) |
| Address handling | Capture full address | Confirm previous OR capture new |
| OfiInter | Full ofi inter flow | Simplified (can still change to ofi inter but no L7/L8) |
| Comprehension prompt | Generic product info | Client-aware, address confirmation context |

## Integration Points (Files to Modify)

| File | Change | Risk |
|------|--------|------|
| `src/lib/agents/production/webhook-processor.ts` | Replace is_client skip with recompra routing | MEDIUM - must not break v3 |
| `src/lib/agents/engine/types.ts` | Add `'somnio-recompra'` to agentModule union | LOW |
| `src/lib/agents/engine/v3-production-runner.ts` | Add recompra branch in processMessage routing | LOW |
| `src/inngest/functions/agent-timers-v3.ts` | Add recompra routing for timer-triggered processing | MEDIUM - timer mismatch risk |
| `src/app/api/sandbox/process/route.ts` | Add recompra-v1 sandbox dispatch | LOW |
| `src/inngest/events.ts` | May need new event types if timer event names differ | LOW |

## Open Questions

1. **How to identify agent module in timer context?**
   - What we know: Timer fires per session. Session belongs to a conversation. Conversation has a contact. Contact has is_client.
   - What's unclear: Should we store `agent_module` on the session directly, or re-derive from contact at timer time?
   - Recommendation: Store `agent_module` on session state (e.g., `_v3:agentModule = 'somnio-recompra'`). Cheaper than re-querying contact at timer fire time. Already have precedent with `_v3:` prefixed metadata.

2. **WhatsApp templates for recompra?**
   - What we know: Context says "reutilizar los mismos de v3"
   - What's unclear: Are there recompra-specific templates needed (e.g., address confirmation template)?
   - Recommendation: Create new templates in the DB for recompra-specific messages (address confirmation, personalized greeting) but reuse v3 templates for promos, pack selection, order confirmation.

3. **Order data query for preloading -- what status counts as "delivered"?**
   - What we know: Context says "ultimo pedido entregado"
   - What's unclear: Exact column/value for "delivered" status in orders table
   - Recommendation: Check orders table schema. Likely a pipeline stage or status field. Need to verify during planning.

## Sources

### Primary (HIGH confidence)
- `src/lib/agents/somnio-v3/` -- All 14 files read in full (architecture source of truth)
- `src/lib/agents/godentist/` -- Fork pattern reference (config, index, types verified)
- `src/lib/agents/production/webhook-processor.ts` -- Full routing logic read
- `src/lib/agents/engine/v3-production-runner.ts` -- Full runner logic read
- `src/inngest/functions/agent-timers-v3.ts` -- Timer routing logic read
- `src/app/api/sandbox/process/route.ts` -- Sandbox dispatch logic read
- `src/lib/agents/production/agent-config.ts` -- Workspace config schema read

### Secondary (MEDIUM confidence)
- `.planning/standalone/somnio-recompra/CONTEXT.md` -- User decisions (primary design source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, pure fork of proven architecture
- Architecture: HIGH -- GoDentist fork pattern is proven, all integration points identified
- Pitfalls: HIGH -- routing collision and timer mismatch are real risks, clearly documented
- Data preloading: MEDIUM -- exact order status column for "delivered" needs verification

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable internal architecture)
