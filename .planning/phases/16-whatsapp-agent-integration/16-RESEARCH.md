# Phase 16: WhatsApp Agent Integration - Research

**Researched:** 2026-02-09
**Domain:** Agent-WhatsApp wiring, conversation activation/deactivation, handoff, inbox UX, metrics module
**Confidence:** HIGH (all findings from codebase investigation, no external libs needed)

## Summary

This phase connects the existing Somnio agent engine (tested in sandbox) with real WhatsApp conversations. The agent system is fully built: SomnioEngine processes messages through intent detection, orchestration, ingest management, and message sequencing. The WhatsApp webhook receives incoming messages and stores them in conversations/messages tables. The core task is wiring these two together: when an incoming WhatsApp message arrives and the agent is enabled for that conversation, route the message through SomnioEngine and send the response back via WhatsApp.

The secondary tasks are: (1) UI controls for activation/deactivation at global and per-conversation level, (2) handoff workflow with task creation and configurable message, (3) visual indicators in inbox (bot badges, "Bot escribiendo..."), (4) a new "Agentes" module with dashboard metrics and advanced config.

**Primary recommendation:** Wire the webhook handler to SomnioEngine with a new `agent_config` DB table for workspace-level settings and new columns on `conversations` for per-chat toggles. Reuse 100% of existing agent code -- the SomnioEngine already handles sessions, intent detection, orchestration, message sending, and Inngest timers. The main new code is the integration glue in the webhook, the UI components, and the metrics module.

## Standard Stack

### Core (Already in Codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SomnioEngine | - | Full agent message processing | Already built, tested in sandbox |
| SessionManager | - | Session CRUD with optimistic locking | Production-ready, uses admin client |
| AgentEngine | - | Generic engine with intent/orchestrator | Base class, used by SomnioEngine |
| MessageSequencer | - | Delayed message sending with interruption | Handles WhatsApp delays per template |
| Inngest | 3.x | Timer workflows (data collection, promos, ingest) | Already configured with events |
| 360dialog API | - | WhatsApp message sending/receiving | Already integrated |
| Supabase Realtime | - | Live updates for inbox | Already on conversations/messages tables |

### Supporting (Already in Codebase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CrmOrchestrator | - | Routes CRM commands to CRM agents | When agent creates orders (shouldCreateOrder) |
| agentRegistry | - | Code-defined agent config registry | Agent lookup by ID |
| crmAgentRegistry | - | CRM agent registry | CRM agent availability checks |
| createAdminClient | - | Supabase admin for bypassing RLS | All server-side agent operations |
| executeToolFromAgent | - | Action DSL tool execution | Agent tool calls (whatsapp.message.send, crm.order.create) |
| Recharts | 2.x | Charts for dashboard | Metrics visualization |

### New (Minimal additions)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| None needed | All libraries already in codebase | - |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── agents/
│   │   ├── production/           # NEW: Production wiring
│   │   │   ├── webhook-processor.ts   # Routes webhook messages to SomnioEngine
│   │   │   ├── agent-config.ts        # Workspace agent config CRUD
│   │   │   ├── handoff-handler.ts     # Handoff workflow (message + task + toggle)
│   │   │   └── metrics.ts            # Metrics queries for dashboard
│   │   └── ... (existing agent code unchanged)
│   └── whatsapp/
│       └── webhook-handler.ts    # MODIFIED: Add agent routing hook
├── app/
│   ├── (dashboard)/
│   │   ├── whatsapp/components/
│   │   │   ├── chat-header.tsx       # MODIFIED: Add agent toggles
│   │   │   ├── conversation-item.tsx # MODIFIED: Add bot avatar overlay
│   │   │   ├── message-bubble.tsx    # MODIFIED: Add bot badge
│   │   │   ├── inbox-layout.tsx      # MODIFIED: Add agent config slider
│   │   │   └── agent-config-slider.tsx  # NEW: Global config panel
│   │   └── agentes/                  # NEW: Agentes module
│   │       ├── page.tsx             # Dashboard tab
│   │       ├── config/page.tsx      # Config tab
│   │       └── components/          # Dashboard cards, charts
│   └── api/
│       └── webhooks/whatsapp/route.ts  # MODIFIED: Add agent processing
└── supabase/migrations/
    └── 20260209_agent_production.sql  # NEW: agent_config + conversation columns
```

### Pattern 1: Webhook-to-Agent Routing

**What:** After processIncomingMessage stores the message, check if the conversation has an active agent and route through SomnioEngine.
**When to use:** Every incoming WhatsApp text message.
**Why this pattern:** The webhook handler already processes messages synchronously (Vercel function). Adding agent processing after message storage keeps the flow simple. SomnioEngine already handles getOrCreateSession internally.

```typescript
// In webhook-handler.ts, after processIncomingMessage
async function processIncomingMessage(msg, webhookValue, workspaceId, phoneNumberId) {
  // ... existing message storage code ...

  // NEW: Check if agent is enabled for this conversation
  if (msg.type === 'text') {
    const agentEnabled = await isAgentEnabledForConversation(conversationId, workspaceId)
    if (agentEnabled) {
      await routeToAgent(conversationId, contactId, msg.text?.body ?? '', workspaceId, phone)
    }
  }
}
```

### Pattern 2: Agent Config Layer (Global + Per-Chat)

**What:** New `workspace_agent_config` table for global settings + new columns on `conversations` for per-chat overrides.
**When to use:** Toggle resolution follows: if global OFF -> agent disabled everywhere. If global ON -> check per-chat toggle. Per-chat defaults to null (inherits global).

```typescript
// Resolution logic
function isAgentEnabled(globalConfig, conversationOverride): boolean {
  if (!globalConfig.agent_enabled) return false  // Global OFF = all OFF
  if (conversationOverride.agent_conversational === false) return false  // Per-chat OFF
  return true  // Global ON and per-chat not explicitly OFF
}
```

### Pattern 3: Handoff Workflow

**What:** When agent detects handoff (intent 'asesor', queja, confidence < 40):
1. Send configurable message to customer (default: "Regalame 1 min")
2. Toggle OFF conversational agent for this conversation only (CRM stays active)
3. Create task assigned to available human (round-robin from team_members)
**When to use:** Agent engine's handleHandoff returns handoff action.

```typescript
// In handoff-handler.ts
async function executeHandoff(conversationId, workspaceId, config) {
  // 1. Send handoff message via WhatsApp
  await sendTextMessage(apiKey, phone, config.handoff_message)

  // 2. Toggle OFF conversational agent (CRM stays active)
  await supabase.from('conversations')
    .update({ agent_conversational: false })
    .eq('id', conversationId)

  // 3. Create task with round-robin assignment
  const assignee = await getNextAvailableAgent(workspaceId)
  await supabase.from('tasks').insert({
    workspace_id: workspaceId,
    title: `Handoff: ${conversationPhone}`,
    conversation_id: conversationId,
    assigned_to: assignee?.user_id ?? null,
    priority: 'high',
    status: 'pending',
  })
}
```

### Pattern 4: Bot Message Tracking

**What:** Add `sent_by_agent` boolean column to messages table. When agent sends via WhatsApp, mark messages as agent-sent.
**When to use:** All outbound messages sent through the agent engine.

```sql
ALTER TABLE messages ADD COLUMN sent_by_agent BOOLEAN NOT NULL DEFAULT false;
```

Frontend reads this to show bot badge on messages and "Bot escribiendo..." indicator.

### Pattern 5: Agent Config Slider (Overlay Panel)

**What:** A slide-over panel in the inbox that overlays the contact panel (right column). Contains global toggle, agent selector, CRM toggles, timer/speed presets.
**When to use:** When user clicks the agent config button in inbox.

```
InboxLayout (3 columns):
  [ConversationList] [ChatView] [ContactPanel | AgentConfigSlider]
```

The slider replaces the ContactPanel when open. Same w-80 width, same slot.

### Anti-Patterns to Avoid

- **Do NOT create a separate API route for agent processing.** The webhook handler already runs synchronously on Vercel. Adding agent processing inline is simpler and avoids cold start issues.
- **Do NOT modify SomnioEngine internals.** The engine is production-ready. Wire it from outside (new webhook-processor module).
- **Do NOT duplicate message sending logic.** SomnioEngine already uses MessageSequencer which calls executeToolFromAgent -> whatsapp.message.send handler. The same path works for production.
- **Do NOT create a separate realtime subscription for bot typing.** Use the existing messages realtime subscription. When agent starts processing, insert a system message with type 'typing_indicator' or use presence channels.
- **Do NOT store agent config in code.** Use database tables so config is per-workspace and editable from UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent message processing | Custom processing pipeline | SomnioEngine.processMessage() | Already handles full flow: intent, orchestration, tools, state |
| Session management | Custom session tracking | SessionManager.getOrCreateSession() | Already handles create/get with optimistic locking |
| WhatsApp message sending | Direct 360dialog calls | MessageSequencer -> executeToolFromAgent | Already handles delays, interruptions, error handling |
| Timer workflows | Custom setTimeout/cron | Inngest timer functions (already defined) | Already handles data collection, promos, ingest timeouts |
| Round-robin assignment | Custom algorithm | Query team_members ORDER BY last_assigned_at ASC | Table already has last_assigned_at + is_online columns |
| Agent config persistence | localStorage/state | New DB table workspace_agent_config | Needs to persist across sessions, shared by team |
| Metrics aggregation | Complex queries | Simple COUNT/SUM on agent_turns + agent_sessions | Tables already track tokens_used, tools_called, status |

**Key insight:** 95% of the agent logic exists. This phase is integration wiring, not new algorithm development.

## Common Pitfalls

### Pitfall 1: Webhook Timeout on Vercel

**What goes wrong:** Agent processing (intent + orchestration = 2 Claude calls) takes 5-15 seconds. Vercel serverless has 60s default timeout but webhook should return quickly to avoid 360dialog retries.
**Why it happens:** 360dialog retries if webhook doesn't respond in ~30 seconds.
**How to avoid:** Return 200 immediately, process agent response asynchronously. Two options:
  1. Use `waitUntil()` (Next.js 15 supports this) to keep the function alive after responding
  2. Send the message to Inngest as an event and process in a durable function
**Warning signs:** Duplicate messages from 360dialog retries.
**Recommended approach:** Use Inngest event `agent/whatsapp.message_received` -> process in durable function. This also gives retry capability if agent processing fails.

### Pitfall 2: Race Condition on Concurrent Messages

**What goes wrong:** Customer sends two messages quickly. Both trigger agent processing. Sessions get version conflicts or duplicate responses.
**Why it happens:** Webhook handler processes each message independently. Two messages for the same conversation can run simultaneously.
**How to avoid:** Use a queue/lock per conversation. Options:
  1. Inngest idempotency key on conversationId (one function at a time)
  2. Supabase advisory lock per conversation
  3. Simple deduplication: check last_activity_at and skip if within 2 seconds
**Warning signs:** Version conflict errors in SessionManager, duplicate agent messages.
**Recommended approach:** Use Inngest with concurrency limit per conversation (`concurrency: [{key: 'event.data.conversationId', limit: 1}]`). This queues messages for the same conversation.

### Pitfall 3: Agent Enabled Check Stale After Toggle

**What goes wrong:** Manager toggles agent OFF, but a message already in processing still sends an agent response.
**Why it happens:** Agent enabled check happens at webhook time. Processing takes seconds. Toggle happens between check and response.
**How to avoid:** Check agent enabled status AGAIN right before sending the WhatsApp response (not just at the start).
**Warning signs:** Agent responds after being toggled off.

### Pitfall 4: Handoff Toggle Only Disables Conversational, CRM Stays Active

**What goes wrong:** Developer toggles ALL agent behavior off during handoff instead of just conversational.
**Why it happens:** The distinction between conversational and CRM agents is not obvious.
**How to avoid:** Two separate columns: `agent_conversational` and `agent_crm` on conversations table. Handoff sets `agent_conversational = false` only.
**Warning signs:** CRM agent stops creating orders after handoff.

### Pitfall 5: Messages Table Lacks Agent Attribution

**What goes wrong:** UI shows all outbound messages the same. No way to distinguish human-sent from agent-sent messages.
**Why it happens:** The messages table has no `sent_by_agent` column.
**How to avoid:** Add `sent_by_agent BOOLEAN DEFAULT false` to messages table. Set to true when agent sends via MessageSequencer.
**Warning signs:** No robot badge on agent messages in inbox.

### Pitfall 6: Contact Not Linked = No Session

**What goes wrong:** SomnioEngine requires contactId for session creation. New conversations may not have a linked contact.
**Why it happens:** Conversations can exist without a contact (unknown phone numbers).
**How to avoid:** In the webhook-to-agent routing, handle contactless conversations:
  1. Auto-create a contact from WhatsApp profile name + phone (agent needs a contact to work)
  2. Or use a placeholder contactId and create the real contact when agent collects data
**Warning signs:** Agent fails to create session, no response sent.
**Recommended approach:** Auto-create a minimal contact (phone + profile_name) when agent is enabled and conversation has no contact.

### Pitfall 7: Sandbox and Production Config Divergence

**What goes wrong:** Agent works differently in sandbox vs production because sandbox uses in-memory state while production uses DB.
**Why it happens:** SandboxEngine is a separate implementation from SomnioEngine.
**How to avoid:** This is already handled. SomnioEngine (production) uses SessionManager with DB. SandboxEngine uses in-memory state. Both share the same core components (IntentDetector, SomnioOrchestrator, IngestManager, MessageClassifier). The agent behavior is identical -- only the state persistence differs.
**Warning signs:** None expected, architecture is already correct.

## Code Examples

### Example 1: Webhook to Agent Routing

```typescript
// src/lib/agents/production/webhook-processor.ts
import { SomnioEngine } from '@/lib/agents/somnio/somnio-engine'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('webhook-processor')

interface AgentProcessInput {
  conversationId: string
  contactId: string | null
  messageContent: string
  workspaceId: string
  phone: string
}

export async function processMessageWithAgent(input: AgentProcessInput): Promise<void> {
  const supabase = createAdminClient()

  // 1. Check global agent config
  const { data: config } = await supabase
    .from('workspace_agent_config')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .single()

  if (!config?.agent_enabled) return

  // 2. Check per-conversation override
  const { data: conv } = await supabase
    .from('conversations')
    .select('agent_conversational, contact_id')
    .eq('id', input.conversationId)
    .single()

  if (conv?.agent_conversational === false) return

  // 3. Ensure contact exists (auto-create if needed)
  let contactId = conv?.contact_id ?? input.contactId
  if (!contactId) {
    contactId = await autoCreateContact(input.workspaceId, input.phone)
  }

  // 4. Process through SomnioEngine
  const engine = new SomnioEngine(input.workspaceId)
  const result = await engine.processMessage({
    conversationId: input.conversationId,
    contactId,
    messageContent: input.messageContent,
    workspaceId: input.workspaceId,
    phoneNumber: input.phone,
  })

  // 5. Handle handoff if needed
  if (result.newMode === 'handoff') {
    await executeHandoff(input.conversationId, input.workspaceId, config)
  }

  logger.info({
    conversationId: input.conversationId,
    success: result.success,
    messagesSent: result.messagesSent,
  }, 'Agent processing complete')
}
```

### Example 2: Database Schema for Agent Config

```sql
-- Workspace-level agent configuration
CREATE TABLE workspace_agent_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Global toggle
  agent_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Agent selection (code-defined agent ID)
  conversational_agent_id TEXT NOT NULL DEFAULT 'somnio-sales-v1',

  -- CRM agent toggles (JSONB for flexibility)
  crm_agents_enabled JSONB NOT NULL DEFAULT '{"order-manager": true}',

  -- Handoff configuration
  handoff_message TEXT NOT NULL DEFAULT 'Regalame 1 min, ya te comunico con un asesor',

  -- Timer presets
  timer_preset TEXT NOT NULL DEFAULT 'real' CHECK (timer_preset IN ('real', 'rapido', 'instantaneo')),

  -- Response speed (delay multiplier, 1.0 = normal)
  response_speed NUMERIC(3,1) NOT NULL DEFAULT 1.0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Per-conversation agent overrides
ALTER TABLE conversations
  ADD COLUMN agent_conversational BOOLEAN DEFAULT NULL,  -- NULL = inherit global
  ADD COLUMN agent_crm BOOLEAN DEFAULT NULL;             -- NULL = inherit global

CREATE INDEX idx_conversations_agent ON conversations(workspace_id)
  WHERE agent_conversational IS NOT NULL OR agent_crm IS NOT NULL;
```

### Example 3: Round-Robin Assignment for Handoff

```typescript
// src/lib/agents/production/handoff-handler.ts
async function getNextAvailableAgent(workspaceId: string): Promise<{ user_id: string } | null> {
  const supabase = createAdminClient()

  // Find online team members, ordered by least recently assigned
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, last_assigned_at, teams!inner(workspace_id)')
    .eq('teams.workspace_id', workspaceId)
    .eq('is_online', true)
    .order('last_assigned_at', { ascending: true, nullsFirst: true })
    .limit(1)

  if (!members || members.length === 0) return null

  // Update last_assigned_at for the selected member
  await supabase
    .from('team_members')
    .update({ last_assigned_at: new Date().toISOString() })
    .eq('user_id', members[0].user_id)

  return { user_id: members[0].user_id }
}
```

### Example 4: Metrics Query for Dashboard

```typescript
// src/lib/agents/production/metrics.ts
interface AgentMetrics {
  totalConversations: number
  totalOrders: number
  conversionRate: number
  totalHandoffs: number
  resolvedWithoutHuman: number
  avgResponseTimeMs: number
  totalTokensUsed: number
  costPerConversation: number
}

async function getAgentMetrics(workspaceId: string, startDate: string, endDate: string): Promise<AgentMetrics> {
  const supabase = createAdminClient()

  // Count sessions in period
  const { count: totalConversations } = await supabase
    .from('agent_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  // Count handoffs
  const { count: totalHandoffs } = await supabase
    .from('agent_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'handed_off')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  // Sum tokens
  const { data: tokenData } = await supabase
    .from('agent_turns')
    .select('tokens_used, agent_sessions!inner(workspace_id)')
    .eq('agent_sessions.workspace_id', workspaceId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  const totalTokensUsed = tokenData?.reduce((sum, t) => sum + (t.tokens_used ?? 0), 0) ?? 0

  return {
    totalConversations: totalConversations ?? 0,
    totalOrders: 0, // Count from orders table with agent_session_id
    conversionRate: 0, // orders / conversations
    totalHandoffs: totalHandoffs ?? 0,
    resolvedWithoutHuman: (totalConversations ?? 0) - (totalHandoffs ?? 0),
    avgResponseTimeMs: 0, // From agent_turns timestamp deltas
    totalTokensUsed,
    costPerConversation: totalConversations ? totalTokensUsed / totalConversations * 0.000003 : 0, // Rough estimate
  }
}
```

### Example 5: "Bot escribiendo..." Indicator

```typescript
// Use Supabase Realtime presence or a temporary messages entry
// Option A: Insert a temporary "typing" system message (simplest)
async function setAgentTyping(conversationId: string, isTyping: boolean) {
  if (isTyping) {
    // Broadcast via Supabase Realtime channel
    const channel = supabase.channel(`conversation:${conversationId}`)
    channel.send({
      type: 'broadcast',
      event: 'agent_typing',
      payload: { isTyping: true }
    })
  }
}

// In ChatView component, subscribe to typing events
useEffect(() => {
  const channel = supabase.channel(`conversation:${conversationId}`)
    .on('broadcast', { event: 'agent_typing' }, (payload) => {
      setIsAgentTyping(payload.payload.isTyping)
    })
    .subscribe()
  return () => { channel.unsubscribe() }
}, [conversationId])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| n8n for agent workflows | In-code SomnioEngine + Inngest timers | Phase 12-15 | All agent logic now in codebase |
| Sandbox-only agent | Production-wired agent | Phase 16 (this phase) | Agent works on real WhatsApp |
| No agent config UI | Global + per-chat toggles | Phase 16 (this phase) | Manager controls agent activation |
| Manual handoff | Automated handoff with task creation | Phase 16 (this phase) | Agent detects and executes handoff |

**Deprecated/outdated:**
- n8n Proactive Timer: Replaced by Inngest timer functions in Phase 13
- External agent orchestration: Everything is in-code since Phase 12-15

## Open Questions

1. **Inngest vs waitUntil for webhook processing**
   - What we know: Inngest provides concurrency control and retries; waitUntil is simpler but no queue
   - What's unclear: Whether Vercel's waitUntil reliably completes 15s agent processing
   - Recommendation: Use Inngest for production reliability (concurrency per conversation, automatic retries)

2. **Bot typing indicator mechanism**
   - What we know: Supabase Realtime broadcast is available; could also use a temporary DB row
   - What's unclear: Latency of broadcast vs DB insert for realtime delivery
   - Recommendation: Use Supabase Realtime broadcast (no DB write needed, lower latency)

3. **Agent metrics cost calculation**
   - What we know: Token usage is tracked per turn. Claude pricing is per-token.
   - What's unclear: Exact pricing for Haiku vs Sonnet per token at current rates
   - Recommendation: Store raw token counts, calculate costs with configurable rate constants. Exact prices can be updated without code changes.

4. **Auto-contact creation policy**
   - What we know: Agent needs contactId for sessions. Some conversations have no linked contact.
   - What's unclear: Whether auto-creating contacts is desired for all conversations or only agent-enabled ones
   - Recommendation: Auto-create only when agent processes the message (not on every webhook). Use phone + WhatsApp profile name.

## Sources

### Primary (HIGH confidence)
- Codebase investigation: `src/lib/agents/` - Full agent engine, registry, session manager, types
- Codebase investigation: `src/lib/agents/somnio/` - SomnioEngine, config, orchestrator, message sequencer
- Codebase investigation: `src/lib/whatsapp/` - Webhook handler, API client, types
- Codebase investigation: `src/inngest/` - Client, events, timer functions
- Codebase investigation: `supabase/migrations/` - All table schemas (conversations, messages, agent_sessions, tasks, teams)
- Codebase investigation: `src/app/(dashboard)/whatsapp/components/` - All inbox UI components
- Codebase investigation: `src/components/layout/sidebar.tsx` - Navigation structure

### Secondary (MEDIUM confidence)
- Prior decisions in STATE.md and 16-CONTEXT.md - User-confirmed architecture choices

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All code exists in codebase, no new libraries needed
- Architecture: HIGH - Clear integration points identified from codebase investigation
- Pitfalls: HIGH - Identified from understanding actual code flow and known issues (Bug #6 race condition from Phase 15.8)

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable, internal codebase patterns)

---

## Appendix: Key File Inventory

### Files to MODIFY

| File | What Changes | Why |
|------|-------------|-----|
| `src/lib/whatsapp/webhook-handler.ts` | Add agent routing hook after message storage | Wire incoming messages to agent |
| `src/app/api/webhooks/whatsapp/route.ts` | Add agent processing (via Inngest event) | Trigger agent for incoming text messages |
| `src/app/(dashboard)/whatsapp/components/chat-header.tsx` | Add 2 toggle buttons (conversational + CRM) | Per-chat agent control |
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | Add bot avatar overlay icon | Visual indicator when agent active |
| `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` | Add bot badge for agent messages | Distinguish agent from human messages |
| `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` | Add agent config slider panel | Global agent configuration |
| `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` | Allow slider to replace it | Slider overlays contact panel |
| `src/app/(dashboard)/whatsapp/components/chat-view.tsx` | Add "Bot escribiendo..." indicator | Show when agent is processing |
| `src/components/layout/sidebar.tsx` | Add "Agentes" nav item | New module in navigation |
| `src/components/layout/mobile-nav.tsx` | Add "Agentes" nav item | Mobile navigation parity |
| `src/inngest/events.ts` | Add `agent/whatsapp.message_received` event | New event for production routing |
| `src/inngest/functions/agent-timers.ts` | Add production message handler function | Process agent messages via Inngest |

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/agents/production/webhook-processor.ts` | Routes webhook messages to SomnioEngine |
| `src/lib/agents/production/agent-config.ts` | Workspace agent config CRUD operations |
| `src/lib/agents/production/handoff-handler.ts` | Handoff workflow (message + task + toggle OFF) |
| `src/lib/agents/production/metrics.ts` | Metrics aggregation queries for dashboard |
| `src/app/(dashboard)/agentes/page.tsx` | Agentes module: Dashboard tab |
| `src/app/(dashboard)/agentes/config/page.tsx` | Agentes module: Config tab |
| `src/app/(dashboard)/agentes/layout.tsx` | Agentes module layout with tabs |
| `src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` | Dashboard cards + charts |
| `src/app/(dashboard)/agentes/components/config-panel.tsx` | Advanced config form |
| `src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx` | Inbox slider overlay panel |
| `src/app/actions/agent-config.ts` | Server actions for agent config CRUD |
| `supabase/migrations/YYYYMMDD_agent_production.sql` | workspace_agent_config table + conversation columns |

### Files UNCHANGED (reused as-is)

| File | What It Does |
|------|-------------|
| `src/lib/agents/somnio/somnio-engine.ts` | Full agent message processing |
| `src/lib/agents/session-manager.ts` | Session CRUD with optimistic locking |
| `src/lib/agents/engine.ts` | Generic AgentEngine base |
| `src/lib/agents/somnio/message-sequencer.ts` | Delayed message sending |
| `src/lib/agents/somnio/ingest-manager.ts` | Silent data accumulation |
| `src/lib/agents/somnio/message-classifier.ts` | Message classification (datos/pregunta/mixto) |
| `src/lib/agents/somnio/somnio-orchestrator.ts` | Flow logic and template selection |
| `src/lib/agents/somnio/config.ts` | Agent config (somnio-sales-v1) |
| `src/lib/agents/crm/crm-orchestrator.ts` | CRM agent routing |
| `src/lib/whatsapp/api.ts` | 360dialog API client |
| `src/inngest/client.ts` | Inngest client |
| `src/inngest/functions/agent-timers.ts` | Existing timer functions |

### Database Tables (Existing)

| Table | Relevance |
|-------|-----------|
| `conversations` | Add agent_conversational, agent_crm columns |
| `messages` | Add sent_by_agent column |
| `agent_sessions` | Session tracking (already has conversation_id, workspace_id) |
| `agent_turns` | Turn tracking with tokens_used (for metrics) |
| `session_state` | Agent state persistence |
| `tasks` | Handoff task creation (conversation_id link already supported) |
| `teams` + `team_members` | Round-robin agent assignment (already has is_online, last_assigned_at) |

### Database Tables (New)

| Table | Purpose |
|-------|---------|
| `workspace_agent_config` | Global agent settings per workspace |
