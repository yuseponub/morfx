# Phase 17: CRM Automations Engine - Research

**Researched:** 2026-02-12
**Domain:** Event-driven automation engine (triggers + conditions + actions) over CRM, WhatsApp, and Tasks modules
**Confidence:** HIGH (most findings verified against codebase and official Inngest docs)

## Summary

Phase 17 builds a configurable automations engine where users create rules with triggers, conditions, and actions across CRM (orders, contacts, tags, pipelines), WhatsApp (messages), and Tasks modules. The engine must evaluate conditions in real-time when triggers fire, execute action sequences with optional delays, support cascading (max 3 levels), and log everything to a detailed execution history.

The codebase already has most building blocks: Inngest v3.51 for durable functions with `step.run()`, `step.sleep()`, and fan-out; a mature Action DSL with tool registry, schemas, and handlers for CRM and WhatsApp operations; Supabase with RLS, DB triggers for activity logging, and JSONB columns; and a sidebar/page structure following Next.js 15 App Router conventions.

**Primary recommendation:** Build the automation engine as an event-driven system where DB triggers and server actions emit Inngest events for trigger detection. Inngest durable functions evaluate conditions and execute action sequences with retry/delay support. Store automation definitions as JSONB in Supabase with a clean TypeScript type system for conditions (AND/OR groups) and actions. Reuse existing Action DSL tool handlers (`executeToolFromWebhook`) for CRM/WhatsApp actions.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Inngest | ^3.51.0 | Durable function execution for automation runs | Already used for agent timers; provides step.run, step.sleep, fan-out, retry, cancelOn |
| Supabase | ^2.93.1 | DB, RLS, triggers, JSONB storage | Already the data layer; DB triggers emit events for automation triggers |
| Zod | ^4.3.6 | Schema validation for automation definitions | Already used in server actions for validation |
| Ajv | ^8.17.1 | JSON Schema validation in tool registry | Already used; automations can validate action params against tool schemas |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | (project) | UI styling for automation builder | Wizard UI, condition builder, history panel |
| shadcn/ui | (project) | UI components | Buttons, forms, selects, badges, dialogs |
| Lucide React | (project) | Icons | Trigger/action type icons, status indicators |

### No New Dependencies Needed
The project already has everything required. No new npm packages are needed for this phase.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── automations/
│       ├── types.ts              # All automation type definitions
│       ├── constants.ts          # Limits, available triggers/actions/variables catalog
│       ├── condition-evaluator.ts # AND/OR condition group evaluator
│       ├── variable-resolver.ts   # {{variable}} template resolution
│       ├── trigger-emitter.ts     # Functions that emit automation events from app code
│       └── action-executor.ts     # Execute automation actions using existing tool handlers
├── inngest/
│   ├── events.ts                  # (extend) Add automation event types
│   └── functions/
│       └── automation-runner.ts   # Inngest function that processes automation runs
├── app/
│   ├── actions/
│   │   └── automations.ts         # Server actions for CRUD
│   └── (dashboard)/
│       └── automatizaciones/
│           ├── page.tsx           # List view
│           └── components/
│               ├── automation-list.tsx
│               ├── automation-wizard.tsx    # Multi-step builder
│               ├── trigger-step.tsx
│               ├── conditions-step.tsx
│               ├── actions-step.tsx
│               ├── execution-history.tsx
│               └── variable-picker.tsx
└── supabase/
    └── migrations/
        └── 2026MMDD_automations.sql  # Tables + triggers + RLS
```

### Pattern 1: Event-Driven Trigger Detection
**What:** When CRM operations happen (stage change, tag assigned, order created, etc.), the code emits Inngest events. Inngest fan-out triggers all matching automation runner functions.
**When to use:** For every trigger type except DB-level triggers.
**Implementation approach:**

The trigger flow has two paths:

**Path A: Server Action triggers (UI-driven changes)**
Server actions like `moveOrderToStage`, `createOrder`, `updateOrder`, `createTag` already exist. After the DB operation succeeds, emit an Inngest event with the change data. This is the simplest and most reliable approach -- add event emission to existing server actions.

**Path B: DB Trigger → Supabase Webhook → Inngest (for changes from any source)**
For changes that can happen outside server actions (e.g., admin client, agent, webhook), use Supabase DB triggers that call `pg_net` to emit events via an API endpoint, which then sends to Inngest.

**Recommendation:** Use Path A (server action emission) as the primary approach. It's simpler, more debuggable, and covers all current use cases. The codebase already does this pattern -- the WhatsApp webhook handler emits `agent/whatsapp.message_received` Inngest events after storing messages. Path B can be added later if needed for external integrations.

**Example:**
```typescript
// In src/app/actions/orders.ts - moveOrderToStage
// After successful stage update:
await inngest.send({
  name: 'automation/order.stage_changed',
  data: {
    workspaceId,
    orderId,
    previousStageId: order.stage_id,
    newStageId,
    pipelineId: order.pipeline_id,
    contactId: order.contact_id,
  }
})
```

### Pattern 2: JSONB Condition Groups (AND/OR Evaluator)
**What:** Conditions stored as JSONB with nested AND/OR groups, evaluated in TypeScript at runtime.
**When to use:** For all automation condition evaluation.

```typescript
// Condition type system
type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'not_exists'

interface Condition {
  field: string         // e.g., 'order.stage_id', 'order.tags', 'contact.city'
  operator: ConditionOperator
  value: unknown        // The value to compare against
}

interface ConditionGroup {
  logic: 'AND' | 'OR'
  conditions: (Condition | ConditionGroup)[]  // Recursive for nested groups
}

// Evaluator function
function evaluateConditionGroup(group: ConditionGroup, context: Record<string, unknown>): boolean {
  const results = group.conditions.map(c => {
    if ('logic' in c) return evaluateConditionGroup(c, context)
    return evaluateCondition(c, context)
  })
  return group.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}
```

**Key design decision:** Evaluate conditions in the Inngest function (TypeScript), NOT in SQL. This keeps the logic testable, debuggable, and avoids complex Supabase queries. The trigger event carries all context data needed for evaluation.

### Pattern 3: Sequential Action Execution with Delays
**What:** Actions execute sequentially within an Inngest function, using `step.run()` for each action and `step.sleep()` for delays.
**When to use:** For all automation action sequences.

```typescript
// In automation-runner Inngest function
for (let i = 0; i < automation.actions.length; i++) {
  const action = automation.actions[i]

  // Optional delay before action
  if (action.delayMs && action.delayMs > 0) {
    await step.sleep(`delay-${i}`, `${action.delayMs}ms`)
  }

  // Execute action with retry
  const result = await step.run(`action-${i}-${action.type}`, async () => {
    return executeAutomationAction(action, triggerContext)
  })

  // If action failed, stop sequence (per CONTEXT.md error handling)
  if (!result.success) {
    await step.run(`log-failure-${i}`, async () => {
      await logExecutionFailure(executionId, i, result.error)
    })
    return { status: 'failed', failedAt: i, error: result.error }
  }
}
```

### Pattern 4: Cascade Protection
**What:** When an automation action triggers another automation (e.g., assigning a tag that triggers a tag-based automation), track cascade depth and stop at max 3 levels.
**When to use:** Whenever emitting trigger events from automation actions.

```typescript
// Include cascade depth in every automation trigger event
interface AutomationTriggerEvent {
  // ... trigger data
  cascadeDepth: number  // 0 for user-initiated, incremented on each cascade
}

// In trigger emitter: skip if depth >= 3
if (cascadeDepth >= MAX_CASCADE_DEPTH) {
  logger.warn({ automationId, cascadeDepth }, 'Max cascade depth reached, skipping')
  return
}
```

### Pattern 5: Variable Template Resolution
**What:** Action parameters can include `{{variable}}` placeholders that resolve from trigger context.
**When to use:** In message texts, task titles, webhook payloads, etc.

```typescript
// Simple Mustache-style resolver (no need for a library)
function resolveVariables(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path.trim())
    return value !== undefined ? String(value) : match
  })
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined
    return (current as Record<string, unknown>)[key]
  }, obj as unknown)
}

// Usage: resolveVariables("Hola {{contacto.nombre}}, tu pedido en {{orden.pipeline}} cambio a {{orden.stage}}", context)
```

### Pattern 6: Reuse Existing Action DSL for CRM/WhatsApp Actions
**What:** Automation actions that create orders, assign tags, send messages etc. should reuse the existing tool handlers via `executeToolFromWebhook`.
**When to use:** For all CRM and WhatsApp automation actions.

The project already has:
- `crm.contact.create`, `crm.contact.update` handlers
- `crm.order.create`, `crm.order.updateStatus` handlers
- `crm.tag.add`, `crm.tag.remove` handlers
- `whatsapp.message.send`, `whatsapp.template.send` handlers

These handlers handle validation, DB operations, and logging. Automations should use them via `executeToolFromWebhook()` rather than writing new DB logic.

### Anti-Patterns to Avoid
- **Polling for trigger detection:** Do NOT poll DB for changes. Use event emission from server actions.
- **Complex SQL condition evaluation:** Evaluate conditions in TypeScript, not in Supabase queries. JSONB is for storage, not execution.
- **Global singleton for automation registry:** Store automation definitions in DB, not in memory. Load on demand in Inngest functions.
- **Synchronous trigger evaluation:** All trigger processing must be async via Inngest. Never block the request/response cycle.
- **Building custom retry/delay logic:** Use Inngest's built-in `step.run()` (auto-retry) and `step.sleep()` (durable delay).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable execution with retry | Custom retry loops with setTimeout | Inngest `step.run()` with retries config | Survives restarts, has exponential backoff, observable |
| Delayed execution | setTimeout or cron jobs | Inngest `step.sleep()` | Persists across restarts, exact timing, observable |
| Fan-out (one event, multiple functions) | Custom event bus | Inngest fan-out (same event name, multiple functions) | Built-in, no coordination needed |
| Variable template resolution | Full template engine (Handlebars, etc.) | Simple regex `{{path}}` replacer | Context is flat/shallow, no loops/conditionals needed |
| Condition evaluation | SQL WHERE clauses on JSONB | TypeScript evaluator function | Testable, debuggable, no DB round-trips |
| CRM operations (create order, tag, etc.) | Direct Supabase inserts | Existing Action DSL handlers (`executeToolFromWebhook`) | Validation, logging, error handling already built |
| WhatsApp sending | Direct 360dialog API calls | Existing `whatsapp.message.send` tool handler | API key resolution, message storage, conversation update already handled |

**Key insight:** This phase is primarily about ORCHESTRATION, not about building new CRUD operations. The CRUD already exists in the tool handlers and server actions. The automation engine coordinates when and how to call them.

## Common Pitfalls

### Pitfall 1: Infinite Cascade Loops
**What goes wrong:** Automation A assigns tag "VIP", which triggers Automation B that changes a stage, which triggers Automation A again.
**Why it happens:** Actions of automations emit the same trigger events as manual actions.
**How to avoid:** Track `cascadeDepth` in every trigger event. Increment on each cascade. Hard stop at depth 3. Log and alert when stopped.
**Warning signs:** Test with a simple A-triggers-B-triggers-A scenario during development.

### Pitfall 2: Race Conditions on Rapid Stage Changes
**What goes wrong:** User quickly moves order through 3 stages. Three automations fire for each stage change, but by the time the first evaluates conditions, the order is already in the third stage.
**Why it happens:** Inngest functions are async. By the time they read the DB, the state may have changed.
**How to avoid:** Include ALL relevant state in the trigger event data (previous stage, new stage, etc.). Evaluate conditions against the EVENT data, not current DB state. The event is the snapshot of truth.
**Warning signs:** Conditions that reference "current" state instead of "event" state.

### Pitfall 3: Blocking Server Actions with Event Emission
**What goes wrong:** Adding `await inngest.send()` to every server action makes the UI slower.
**Why it happens:** `inngest.send()` is an HTTP call to Inngest's API.
**How to avoid:** Use `inngest.send()` without await (fire-and-forget) for trigger events. The automation can fail silently without affecting the user's action. Alternatively, batch events with `inngest.send([...])`.
**Warning signs:** User-facing latency increase after adding trigger emission.

### Pitfall 4: Tool Registry Not Initialized in Inngest Context
**What goes wrong:** Automation actions fail because tool handlers aren't registered.
**Why it happens:** The tool registry initializes in `instrumentation.ts`, but Inngest functions may run in cold-start contexts where initialization hasn't happened.
**How to avoid:** Call `initializeTools()` at the start of the automation runner function, just like `OrderCreator` does in production. The function is idempotent (checks `initialized` flag).
**Warning signs:** `ToolNotFoundError` in Inngest function logs.

### Pitfall 5: RLS Blocking Automation DB Operations
**What goes wrong:** Automations can't read/write data because Supabase RLS policies require an authenticated user.
**Why it happens:** Inngest functions run without a user session.
**How to avoid:** Use `createAdminClient()` (service role key, bypasses RLS) for all automation DB operations. This is the same pattern used by agent timers and webhook handlers.
**Warning signs:** "permission denied" or empty query results in automation runner logs.

### Pitfall 6: Stale Automation Definitions During Execution
**What goes wrong:** User disables an automation while it's mid-execution, but actions continue.
**Why it happens:** Automation definition was loaded at the start and cached.
**How to avoid:** Check `is_enabled` before EACH action in the sequence (not just at the start). Short-circuit if disabled.
**Warning signs:** Users reporting that disabled automations still execute actions.

### Pitfall 7: Missing Workspace Isolation
**What goes wrong:** Automation in workspace A accidentally processes events from workspace B.
**Why it happens:** Events don't include workspaceId or matcher doesn't filter.
**How to avoid:** Always include `workspaceId` in trigger events. Always filter automations by `workspace_id` when loading. Use Inngest's `match` or `if` expression for workspace-scoped processing.
**Warning signs:** Cross-workspace data leaks in staging/testing.

## Code Examples

### DB Schema: Automations Table
```sql
-- Core automations table
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Trigger configuration
  trigger_type TEXT NOT NULL,  -- 'order.stage_changed', 'tag.assigned', 'contact.created', etc.
  trigger_config JSONB NOT NULL DEFAULT '{}',  -- Pipeline filter, keyword match, etc.

  -- Conditions (AND/OR groups)
  conditions JSONB,  -- ConditionGroup or null (no conditions = always match)

  -- Actions (sequential array)
  actions JSONB NOT NULL DEFAULT '[]',  -- AutomationAction[]

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Execution history table
CREATE TABLE automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_event JSONB NOT NULL,  -- Snapshot of the trigger event data
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
  actions_log JSONB NOT NULL DEFAULT '[]',  -- Per-action results: [{index, type, status, result, duration_ms}]
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  cascade_depth INTEGER NOT NULL DEFAULT 0
);
```

### Inngest Event Types
```typescript
// Extend AllAgentEvents with automation events
export type AutomationEvents = {
  'automation/order.stage_changed': {
    data: {
      workspaceId: string
      orderId: string
      previousStageId: string
      newStageId: string
      pipelineId: string
      contactId: string | null
      cascadeDepth: number
    }
  }
  'automation/tag.assigned': {
    data: {
      workspaceId: string
      entityType: 'contact' | 'order' | 'conversation'
      entityId: string
      tagId: string
      tagName: string
      cascadeDepth: number
    }
  }
  'automation/contact.created': {
    data: {
      workspaceId: string
      contactId: string
      contactName: string
      contactPhone: string
      cascadeDepth: number
    }
  }
  'automation/order.created': {
    data: {
      workspaceId: string
      orderId: string
      pipelineId: string
      stageId: string
      contactId: string | null
      totalValue: number
      cascadeDepth: number
    }
  }
  'automation/whatsapp.message_received': {
    data: {
      workspaceId: string
      conversationId: string
      contactId: string | null
      messageContent: string
      phone: string
      cascadeDepth: number
    }
  }
  'automation/task.completed': {
    data: {
      workspaceId: string
      taskId: string
      contactId: string | null
      orderId: string | null
      cascadeDepth: number
    }
  }
  'automation/task.overdue': {
    data: {
      workspaceId: string
      taskId: string
      contactId: string | null
      orderId: string | null
      cascadeDepth: number
    }
  }
}
```

### Automation Runner (Inngest Function)
```typescript
// Pattern for a single automation trigger type
export const orderStageChangedRunner = inngest.createFunction(
  {
    id: 'automation-order-stage-changed',
    name: 'Automation: Order Stage Changed',
    retries: 2,
    concurrency: [{ key: 'event.data.workspaceId', limit: 5 }],
  },
  { event: 'automation/order.stage_changed' },
  async ({ event, step }) => {
    const { workspaceId, cascadeDepth } = event.data

    // 1. Load matching automations for this workspace
    const automations = await step.run('load-automations', async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('automations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('trigger_type', 'order.stage_changed')
        .eq('is_enabled', true)
      return data ?? []
    })

    // 2. For each matching automation, evaluate conditions and execute
    for (const automation of automations) {
      // Build trigger context from event data
      const context = buildTriggerContext(event.data)

      // Check trigger config filter (e.g., specific pipeline)
      if (!matchesTriggerConfig(automation.trigger_config, event.data)) continue

      // Evaluate conditions
      if (automation.conditions && !evaluateConditionGroup(automation.conditions, context)) continue

      // 3. Execute action sequence
      const executionId = await step.run(`create-execution-${automation.id}`, async () => {
        return createExecution(automation.id, workspaceId, event.data, cascadeDepth)
      })

      for (let i = 0; i < automation.actions.length; i++) {
        const action = automation.actions[i]

        // Check if automation still enabled
        const stillEnabled = await step.run(`check-enabled-${automation.id}-${i}`, async () => {
          const supabase = createAdminClient()
          const { data } = await supabase
            .from('automations')
            .select('is_enabled')
            .eq('id', automation.id)
            .single()
          return data?.is_enabled ?? false
        })
        if (!stillEnabled) break

        // Optional delay
        if (action.delay_ms > 0) {
          await step.sleep(`delay-${automation.id}-${i}`, `${action.delay_ms}ms`)
        }

        // Execute action
        const result = await step.run(`action-${automation.id}-${i}`, async () => {
          return executeAction(action, context, workspaceId, cascadeDepth)
        })

        // Log action result
        await step.run(`log-${automation.id}-${i}`, async () => {
          await logActionResult(executionId, i, action.type, result)
        })

        // Stop on failure
        if (!result.success) {
          await step.run(`fail-${automation.id}`, async () => {
            await markExecutionFailed(executionId, i, result.error)
          })
          break
        }
      }

      // Mark execution complete
      await step.run(`complete-${automation.id}`, async () => {
        await markExecutionSuccess(executionId)
      })
    }
  }
)
```

### Trigger Emitter (Added to Server Actions)
```typescript
// src/lib/automations/trigger-emitter.ts
import { inngest } from '@/inngest/client'

const MAX_CASCADE_DEPTH = 3

export async function emitOrderStageChanged(data: {
  workspaceId: string
  orderId: string
  previousStageId: string
  newStageId: string
  pipelineId: string
  contactId: string | null
  cascadeDepth?: number
}) {
  const depth = data.cascadeDepth ?? 0
  if (depth >= MAX_CASCADE_DEPTH) return

  // Fire-and-forget (don't await to avoid blocking server action)
  inngest.send({
    name: 'automation/order.stage_changed',
    data: { ...data, cascadeDepth: depth },
  }).catch(err => console.error('[trigger-emitter] Failed to emit:', err))
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DB triggers + pg_notify for real-time events | Server action event emission + Inngest | Current in this project | More control, debuggable, no Supabase Realtime dependency |
| Cron jobs for delayed actions | Inngest step.sleep() | 2024+ | Durable, exact timing, survives restarts |
| Custom queue systems (BullMQ, etc.) | Inngest durable functions | 2024+ | No infrastructure to manage, built-in UI |
| Hardcoded auto-tag trigger (DB function) | Configurable automations engine | Phase 17 | User-configurable, visible, multiple trigger types |

**Note on existing auto_tag_cliente_on_ganado:** The project already has a hardcoded DB trigger that auto-tags contacts as "Cliente" when an order reaches "Ganado" stage. Phase 17 replaces this pattern with user-configurable automations. The existing DB trigger should remain for backward compatibility but could be removed once users migrate to the automations engine.

## Open Questions

### 1. Single vs. Multiple Inngest Functions for Trigger Types
**What we know:** Each trigger type (stage_changed, tag_assigned, etc.) needs its own Inngest function because triggers are defined by event name. The fan-out pattern naturally supports this.
**What's unclear:** Whether to create one function per trigger type (7-8 functions) or one generic function that handles all trigger types.
**Recommendation:** One function per trigger type. It's cleaner, each has its own concurrency settings, and matches the existing project pattern (separate timer functions per event type). Register all in the route.ts serve() call.

### 2. Connected Orders: Bidirectional Sync Implementation
**What we know:** CONTEXT.md specifies `source_order_id` for referencing the parent order, 1-to-many relationships, and configurable bidirectional field sync.
**What's unclear:** The exact mechanism for bidirectional sync -- should it be a separate automation that fires on field changes, or a built-in engine feature?
**Recommendation:** Implement connected orders as a FIRST-CLASS feature of the "create order" action (not a separate automation). The `source_order_id` column already exists as `linked_order_id` in the orders table. Bidirectional sync can be implemented via DB triggers or automation triggers on field changes. Start with the connection tracking and related orders UI, defer full bidirectional sync to a follow-up if needed.

### 3. Webhook Action: Security Considerations
**What we know:** CONTEXT.md specifies outbound webhooks with custom headers and JSON payload templates.
**What's unclear:** Rate limiting for outbound webhooks, timeout handling, and whether to support retry on webhook failure.
**Recommendation:** Implement with sensible defaults: 10s timeout, 3 retries with exponential backoff (handled by Inngest step.run retry), rate limit of 100 webhook calls per workspace per hour. Store webhook responses in the execution log for debugging.

### 4. Task Overdue Detection
**What we know:** "tarea vencida" is a trigger type.
**What's unclear:** How to detect overdue tasks in real-time without polling.
**Recommendation:** Use an Inngest cron function that runs every 15 minutes, queries tasks where `due_date < NOW() AND status = 'pending'`, and emits `automation/task.overdue` events. Mark tasks as "overdue_notified" to avoid duplicate triggers. This is simpler than DB triggers and acceptable for the expected volume.

### 5. Max Actions Per Automation
**What we know:** CONTEXT.md says to define a reasonable limit (10-20).
**What's unclear:** The exact number.
**Recommendation:** Start with 10 actions per automation. This is generous enough for real workflows but prevents abuse. Document as a constant in `constants.ts` for Phase 18 to read.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct reading of all Inngest files, Action DSL, DB migrations, server actions, engine types
  - `src/inngest/` - Client, events, functions (agent-timers, agent-production)
  - `src/lib/tools/` - Registry, executor, schemas (CRM + WhatsApp), init
  - `src/lib/agents/engine/` - UnifiedEngine, types, adapters
  - `src/lib/agents/somnio/order-creator.ts` - Production order creation via tools
  - `src/app/actions/orders.ts` - moveOrderToStage, updateOrder, createOrder
  - `src/app/actions/tags.ts` - Tag CRUD operations
  - `src/app/actions/activity.ts` - Activity logging pattern
  - `supabase/migrations/` - All relevant table schemas (orders, pipelines, stages, tasks, tags, contacts, activity)
  - `src/components/layout/sidebar.tsx` - Navigation structure
- **Inngest v3 official docs** - Events/triggers, step.run, step.sleep, fan-out, createFunction API
  - https://www.inngest.com/docs/features/events-triggers
  - https://www.inngest.com/docs/reference/functions/step-run
  - https://www.inngest.com/docs/reference/functions/step-sleep
  - https://www.inngest.com/docs/guides/fan-out-jobs
  - https://www.inngest.com/docs/guides/step-parallelism
  - https://www.inngest.com/docs/reference/functions/create

### Secondary (MEDIUM confidence)
- **CONTEXT.md decisions** - User decisions from `/gsd:discuss-phase` (all locked decisions)
- **Existing project patterns** - DB triggers (contact_activity, auto_tag_cliente_on_ganado), RLS policies, JSONB columns

### Tertiary (LOW confidence)
- None. All findings are verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; everything verified in package.json and codebase
- Architecture: HIGH - Patterns directly derived from existing codebase (Inngest usage, Action DSL, DB schema)
- Pitfalls: HIGH - Most pitfalls derived from existing codebase bugs and patterns documented in LEARNINGS.md files
- Condition evaluator: HIGH - Simple recursive evaluator, well-understood pattern
- Variable resolver: HIGH - Simple regex replacement, no library needed
- Connected orders: MEDIUM - The `linked_order_id` column exists but bidirectional sync details need validation during implementation

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (stable domain, no fast-moving dependencies)
