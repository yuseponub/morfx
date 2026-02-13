# Phase 18: Domain Layer Foundation - Research

**Researched:** 2026-02-13
**Domain:** Internal refactoring — Domain/Service Layer pattern for mutation unification
**Confidence:** HIGH (codebase-driven, no external dependencies)

## Summary

This phase is a **pure internal refactoring** — no new libraries, no new external dependencies. The research focuses entirely on mapping the existing codebase to understand what exists, what needs to move, and what the target architecture looks like.

The codebase has **94+ mutation functions across 32+ files** with 5 distinct caller types (server actions, tool handlers, action executor, webhooks, engine adapters). Currently, **16 tool handlers emit zero triggers**, the Shopify webhook creates contacts and orders with no trigger emission, the action executor's `create_task` misses its trigger, and 2 triggers are completely dead (`whatsapp.keyword_match`, `task.overdue`). The domain layer will consolidate all mutation logic into `src/lib/domain/` organized by entity, ensuring every mutation emits its corresponding trigger.

**Primary recommendation:** Migrate entity-by-entity in order of highest duplication (Orders first, then Contacts+Tags, Messages/WhatsApp, Tasks, Notes, Custom Fields, Conversations), making each entity 100% complete (domain function + all callers wired + new tool handlers) before moving to the next.

## Standard Stack

This is a refactoring phase. No new libraries needed. All tools already exist in the project.

### Core (Existing, No Changes)
| Library | Purpose | Used By |
|---------|---------|---------|
| `@supabase/supabase-js` | DB client | All layers |
| `createAdminClient()` | Bypass-RLS admin client | Domain layer (always) |
| `createClient()` | Cookie-based RLS client | Server actions (auth only) |
| `inngest` | Event emission for triggers | `trigger-emitter.ts` |

### Key Files Being Refactored (NOT Replaced)
| File | Current Role | After Refactoring |
|------|-------------|-------------------|
| `src/lib/automations/trigger-emitter.ts` | 10 emit functions called by server actions | Called by domain functions instead |
| `src/lib/automations/action-executor.ts` | 11 action types with direct DB | Becomes thin adapter calling domain |
| `src/lib/tools/handlers/crm/index.ts` | 9 CRM tool handlers with direct DB | Becomes thin adapter calling domain |
| `src/lib/tools/handlers/whatsapp/index.ts` | 7 WhatsApp tool handlers with direct DB | Becomes thin adapter calling domain |
| `src/lib/shopify/webhook-handler.ts` | Direct DB for contacts + orders | Becomes thin adapter calling domain |
| `src/lib/whatsapp/webhook-handler.ts` | Direct DB for messages + conversations | Becomes thin adapter calling domain |
| `src/lib/agents/engine-adapters/production/orders.ts` | OrderCreator direct DB | Becomes thin adapter calling domain |
| `src/lib/agents/engine-adapters/production/messaging.ts` | Direct 360dialog API + DB | Becomes thin adapter calling domain |

## Architecture Patterns

### Target Project Structure

```
src/lib/domain/
  index.ts              # Re-exports all domain modules
  types.ts              # DomainContext, DomainResult, shared types
  contacts.ts           # createContact, updateContact, deleteContact, bulkCreate, etc.
  orders.ts             # createOrder, updateOrder, deleteOrder, moveToStage, duplicateOrder, etc.
  tags.ts               # assignTag, removeTag (for both contacts and orders)
  messages.ts           # sendTextMessage, sendMediaMessage, sendTemplateMessage, receiveMessage
  tasks.ts              # createTask, updateTask, completeTask, deleteTask
  notes.ts              # createNote, updateNote, deleteNote (contact + task notes)
  custom-fields.ts      # updateCustomFields, readCustomFields
  conversations.ts      # assignConversation, closeConversation, archiveConversation, linkContact
```

### Pattern 1: Domain Function Signature

Every domain function follows this contract:

```typescript
// src/lib/domain/types.ts

export interface DomainContext {
  workspaceId: string
  /** Who initiated this: 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter' */
  source: string
  /** For cascade trigger depth tracking */
  cascadeDepth?: number
}

export interface DomainResult<T> {
  success: boolean
  data?: T
  error?: string
}
```

```typescript
// Example: src/lib/domain/orders.ts

export async function createOrder(
  ctx: DomainContext,
  params: {
    contactId: string
    pipelineId: string
    stageId?: string
    // ... other params
  }
): Promise<DomainResult<{ orderId: string }>> {
  const supabase = createAdminClient()  // ALWAYS admin client

  // 1. Validate params
  // 2. Execute DB mutation with workspace_id filter
  // 3. Emit trigger (fire-and-forget)
  // 4. Return result
}
```

### Pattern 2: Thin Adapter Pattern

Each caller becomes a thin adapter that validates auth, extracts params, and delegates to domain:

```typescript
// Server Action adapter (src/app/actions/orders.ts)
'use server'
export async function createOrder(formData: ...) {
  const { workspaceId } = await getAuthContext()  // Auth validation
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await domain.createOrder(ctx, { ... })  // Delegate
  revalidatePath('/crm/pipeline')  // UI concern (adapter only)
  return result
}

// Tool Handler adapter (src/lib/tools/handlers/crm/index.ts)
// workspaceId pre-validated by agent session
const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
const result = await domain.createOrder(ctx, { ... })
return result.success ? { success: true, data: result.data } : { success: false, error: ... }

// Action Executor adapter (src/lib/automations/action-executor.ts)
const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth }
const result = await domain.createOrder(ctx, { ... })

// Webhook adapter (src/lib/shopify/webhook-handler.ts)
const ctx: DomainContext = { workspaceId, source: 'webhook' }
const result = await domain.createOrder(ctx, { ... })
```

### Pattern 3: Trigger Emission Inside Domain

```typescript
// Domain function ALWAYS emits trigger — no exceptions
export async function createOrder(ctx: DomainContext, params: CreateOrderParams): Promise<DomainResult<...>> {
  const supabase = createAdminClient()

  // ... mutation logic ...

  // Fire-and-forget trigger emission
  emitOrderCreated({
    workspaceId: ctx.workspaceId,
    orderId: order.id,
    pipelineId: params.pipelineId,
    stageId: targetStageId,
    contactId: params.contactId,
    totalValue: order.total_value ?? 0,
    cascadeDepth: ctx.cascadeDepth ?? 0,
  })

  return { success: true, data: { orderId: order.id } }
}
```

### Anti-Patterns to Avoid

- **DO NOT call `createClient()` (cookie-based) from domain functions** — domain always uses `createAdminClient()`. Auth happens in the adapter layer.
- **DO NOT call `revalidatePath()` or `cookies()` from domain functions** — these are Next.js server action concerns, adapter-only.
- **DO NOT catch trigger emission errors in domain** — `fireAndForget()` already handles this. Domain just calls the emit function.
- **DO NOT add `workspace_id` validation in domain** — the domain assumes the caller already validated auth and passes a valid `workspaceId`.

## Complete Mutation Map by Entity

### Entity 1: ORDERS (4+ code paths — highest duplication)

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions | `src/app/actions/orders.ts` | `createOrder`, `updateOrder`, `moveOrderToStage`, `deleteOrder`, `deleteOrders`, `addOrderTag`, `removeOrderTag`, `duplicateOrder` | YES (create, stage_changed, field_changed, tag.assigned, tag.removed) — but NOT delete |
| Tool Handler | `src/lib/tools/handlers/crm/index.ts` | `crm.order.create`, `crm.order.updateStatus` | NO |
| Action Executor | `src/lib/automations/action-executor.ts` | `create_order`, `duplicate_order`, `change_stage`, `update_field`, `assign_tag`, `remove_tag` | YES (cascade triggers) |
| Shopify Webhook | `src/lib/shopify/webhook-handler.ts` | `createOrderWithProducts` | NO |
| Engine Adapter | `src/lib/agents/engine-adapters/production/orders.ts` | `createOrder` via `OrderCreator` | NO |

**Missing Tool Handlers:** `crm.order.update` (fields), `crm.order.delete`, `crm.order.duplicate`, `crm.order.list`

**Domain functions needed:**
- `createOrder(ctx, params)` — replaces 5 code paths
- `updateOrder(ctx, params)` — replaces 2 code paths
- `moveOrderToStage(ctx, params)` — replaces 2 code paths
- `deleteOrder(ctx, params)` — replaces 1 code path (no trigger currently)
- `duplicateOrder(ctx, params)` — replaces 2 code paths
- `addOrderTag(ctx, params)` — replaces 2 code paths
- `removeOrderTag(ctx, params)` — replaces 2 code paths

### Entity 2: CONTACTS + TAGS (3+ code paths)

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions | `src/app/actions/contacts.ts` | `createContact`, `createContactFromForm`, `updateContactFromForm`, `deleteContact`, `deleteContacts`, `addTagToContact`, `removeTagFromContact`, `bulkAddTag`, `bulkRemoveTag`, `bulkCreateContacts` | PARTIAL (create, field_changed, tag.assigned, tag.removed — NOT delete) |
| Tool Handler | `src/lib/tools/handlers/crm/index.ts` | `crm.contact.create`, `crm.contact.update`, `crm.contact.read`, `crm.contact.list`, `crm.contact.delete`, `crm.tag.add`, `crm.tag.remove` | NO |
| Shopify Webhook | `src/lib/shopify/webhook-handler.ts` | `resolveContact` (creates contacts) | NO |
| Action Executor | `src/lib/automations/action-executor.ts` | `assign_tag`, `remove_tag`, `update_field` | YES (cascade triggers) |

**Missing Tool Handlers:** None for contacts (already have CRUD). Tags already have add/remove.

**Domain functions needed:**
- `createContact(ctx, params)` — replaces 3 code paths
- `updateContact(ctx, params)` — replaces 2 code paths
- `deleteContact(ctx, params)` — replaces 1 code path
- `bulkCreateContacts(ctx, params)` — replaces 1 code path
- `assignTag(ctx, params)` — replaces 3 code paths (contact + order scope)
- `removeTag(ctx, params)` — replaces 3 code paths

### Entity 3: MESSAGES / WHATSAPP (3 code paths)

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions | `src/app/actions/messages.ts` | `sendMessage`, `sendMediaMessage`, `sendTemplateMessage` | NO |
| Tool Handler | `src/lib/tools/handlers/whatsapp/index.ts` | `whatsapp.message.send`, `whatsapp.template.send` | NO |
| Action Executor | `src/lib/automations/action-executor.ts` | `send_whatsapp_text` (via tool), `send_whatsapp_template` (via tool), `send_whatsapp_media` (direct API) | NO |
| Engine Adapter | `src/lib/agents/engine-adapters/production/messaging.ts` | `send()` via direct 360dialog API | NO |
| Webhook Handler | `src/lib/whatsapp/webhook-handler.ts` | `processIncomingMessage` (receive + store) | PARTIAL (`whatsapp.message_received` YES, `whatsapp.keyword_match` NO) |

**Missing Tool Handlers:** None critical — existing handlers cover send/list/template.

**Domain functions needed:**
- `sendTextMessage(ctx, params)` — replaces 4 code paths
- `sendMediaMessage(ctx, params)` — replaces 2 code paths
- `sendTemplateMessage(ctx, params)` — replaces 2 code paths
- `receiveMessage(ctx, params)` — replaces 1 code path (webhook handler)

**Special:** `receiveMessage` must also check keywords for `whatsapp.keyword_match` trigger (currently dead).

### Entity 4: TASKS

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions | `src/app/actions/tasks.ts` | `createTask`, `updateTask`, `deleteTask` | PARTIAL (`task.completed` only when status='completed') |
| Action Executor | `src/lib/automations/action-executor.ts` | `create_task` | NO (trigger gap!) |

**Missing Tool Handlers:** `task.create`, `task.update`, `task.complete`, `task.list`

**Domain functions needed:**
- `createTask(ctx, params)` — replaces 2 code paths
- `updateTask(ctx, params)` — replaces 1 code path
- `completeTask(ctx, params)` — extracted from updateTask
- `deleteTask(ctx, params)` — replaces 1 code path

### Entity 5: NOTES (Contact + Task)

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions (contacts) | `src/app/actions/notes.ts` | `createNote`, `updateNote`, `deleteNote` | NO (also logs to `contact_activity`) |
| Server Actions (tasks) | `src/app/actions/task-notes.ts` | `createTaskNote`, `updateTaskNote`, `deleteTaskNote` | NO (also logs to `task_activity`) |

**Missing Tool Handlers:** `note.create`, `note.list`, `note.delete`

**Domain functions needed:**
- `createNote(ctx, params)` — contact note + activity log
- `updateNote(ctx, params)` — contact note
- `deleteNote(ctx, params)` — contact note
- `createTaskNote(ctx, params)` — task note + activity log
- `updateTaskNote(ctx, params)` — task note
- `deleteTaskNote(ctx, params)` — task note

### Entity 6: CUSTOM FIELDS

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions | `src/app/actions/custom-fields.ts` | `createCustomFieldDefinition`, `updateCustomFieldDefinition`, `deleteCustomFieldDefinition`, `updateContactCustomFields` | NO (should emit `field.changed` for value updates) |
| Action Executor | `src/lib/automations/action-executor.ts` | `update_field` (handles custom fields via JSONB merge) | YES (cascade) |

**Missing Tool Handlers:** `custom-field.update`, `custom-field.read`

**Domain functions needed:**
- `updateCustomFieldValues(ctx, params)` — replaces 2 code paths, emits `field.changed`
- `readCustomFieldValues(ctx, params)` — new, for tool handler

**Note:** Custom field *definitions* (CRUD of the schema) remain in server actions — they are admin configuration, not CRM mutations.

### Entity 7: CONVERSATIONS

| Caller | File | Functions | Emits Triggers? |
|--------|------|-----------|-----------------|
| Server Actions | `src/app/actions/conversations.ts` | `assignConversation`, `archiveConversation`, `unarchiveConversation`, `linkContactToConversation`, `unlinkContactFromConversation`, `startNewConversation`, conversation tag ops | NO |
| Server Actions | `src/app/actions/assignment.ts` | `assignConversation`, `assignToNextAvailable` | NO |
| Tool Handler | `src/lib/tools/handlers/whatsapp/index.ts` | `whatsapp.conversation.list`, `whatsapp.conversation.assign`, `whatsapp.conversation.close` | NO |
| Webhook Handler | `src/lib/whatsapp/webhook-handler.ts` | `findOrCreateConversation`, `linkConversationToContact` | NO |

**Missing Tool Handlers:** Already have assign + close + list. May want `conversation.list` with filters.

**Domain functions needed:**
- `assignConversation(ctx, params)` — replaces 3 code paths
- `archiveConversation(ctx, params)` — replaces 1 code path
- `linkContactToConversation(ctx, params)` — replaces 2 code paths
- `findOrCreateConversation(ctx, params)` — replaces 1 code path

## Trigger Gap Analysis

### Currently Working Triggers (emitted by server actions)
| Trigger | Emitting Caller | Gap |
|---------|----------------|-----|
| `order.stage_changed` | Server actions, action executor | Tool handlers bypass |
| `tag.assigned` | Server actions, action executor | Tool handlers bypass |
| `tag.removed` | Server actions, action executor | Tool handlers bypass |
| `contact.created` | Server actions | Tool handlers, Shopify webhook bypass |
| `order.created` | Server actions, action executor | Tool handlers, Shopify webhook, engine adapter bypass |
| `field.changed` | Server actions, action executor | Tool handlers, custom-fields server action bypass |
| `whatsapp.message_received` | Webhook handler | Working correctly |
| `task.completed` | Server actions (updateTask) | Action executor's create_task lacks trigger |

### Dead Triggers (exist in code but never fire)
| Trigger | Why Dead | Fix |
|---------|----------|-----|
| `whatsapp.keyword_match` | Function exists in trigger-emitter but nobody calls it | Domain `receiveMessage` must check keywords against automation configs and call `emitWhatsAppKeywordMatch` |
| `task.overdue` | Function exists but no cron/scheduler invokes it | Create Inngest cron that queries overdue tasks and calls `emitTaskOverdue` per task |

### Trigger Gaps per Caller
| Caller Type | # Mutations | # With Triggers | Gap |
|-------------|-------------|-----------------|-----|
| Server Actions | ~45 write functions | ~15 emit triggers | ~30 missing (deletes, notes, conversations, etc.) |
| Tool Handlers (16) | 16 | 0 | 16/16 — ALL bypass triggers |
| Action Executor | 11 | 9 | 2 (`create_task`, `send_whatsapp_media`) |
| Shopify Webhook | 2 (contact + order) | 0 | 2/2 |
| Engine Adapters | 2 (order + messaging) | 0 | 2/2 |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB client for domain | New Supabase wrapper | `createAdminClient()` from `src/lib/supabase/admin.ts` | Already exists, proven in production |
| Trigger emission | New event system | `fireAndForget()` + emit functions from `src/lib/automations/trigger-emitter.ts` | Already handles cascade depth, error suppression |
| Tool handler types | New type system | `ToolResult<T>`, `ToolSuccess<T>`, `ToolError` from `src/lib/tools/types.ts` | Already defined, used by 16 handlers |
| Cascade protection | Custom depth tracking | `MAX_CASCADE_DEPTH` + `isCascadeSuppressed()` from `trigger-emitter.ts` | Already proven in Phase 17 |
| WhatsApp API calls | Direct fetch to 360dialog | `sendTextMessage`, `sendMediaMessage` from `src/lib/whatsapp/api.ts` | Already handles auth, formatting, error handling |
| Audit trigger SQL | Complex trigger logic | Simple `AFTER INSERT/UPDATE/DELETE` trigger per table | Postgres standard pattern (see Code Examples below) |

## Common Pitfalls

### Pitfall 1: Breaking Server Action Re-exports
**What goes wrong:** Server actions use `'use server'` directive and are imported by React components. If domain functions accidentally get pulled into client bundles, builds break.
**Why it happens:** Domain functions import `createAdminClient()` which uses `SUPABASE_SERVICE_ROLE_KEY` — a server-only env var.
**How to avoid:** Domain functions are pure server-side. Server action files keep `'use server'` at the top. Server actions call domain functions — this is safe because server actions already run server-side.
**Warning signs:** Build errors about "server-only" code in client bundles.

### Pitfall 2: Circular Dependencies with Trigger Emitter
**What goes wrong:** Domain imports trigger-emitter, trigger-emitter might import domain (for type sharing).
**Why it happens:** Action executor already uses lazy import `await import('./trigger-emitter')` to avoid this.
**How to avoid:** Domain types go in `domain/types.ts` with zero project imports. Trigger emitter types stay separate. Domain imports trigger-emitter directly (one-way dependency). Constants live in `automations/constants.ts` (zero imports).
**Warning signs:** Build-time circular dependency warnings, runtime `undefined` values.

### Pitfall 3: Auth Regression from Switching to createAdminClient
**What goes wrong:** Domain always uses `createAdminClient()` (bypasses RLS). If workspace_id filtering is missed, cross-workspace data leaks.
**Why it happens:** Previous server actions used `createClient()` with RLS as primary defense. Now RLS is defense-in-depth, not primary.
**How to avoid:** EVERY query in domain MUST include `.eq('workspace_id', ctx.workspaceId)`. The DB audit trigger (mutation_audit table) catches violations via weekly cron.
**Warning signs:** Data from wrong workspace appearing; mutation_audit mismatches.

### Pitfall 4: Server Actions Losing revalidatePath
**What goes wrong:** Moving mutation logic to domain but forgetting `revalidatePath()` calls in the server action adapter.
**Why it happens:** Domain functions should NOT call `revalidatePath()` (it's a Next.js concern). But server actions must call it after domain returns.
**How to avoid:** Each server action adapter: (1) validate auth, (2) call domain, (3) revalidatePath, (4) return.
**Warning signs:** UI not updating after mutations until manual refresh.

### Pitfall 5: Trigger Emission Duplication During Migration
**What goes wrong:** During incremental migration, both the old server action AND the new domain function emit triggers, causing duplicate automation executions.
**Why it happens:** Migrating one caller at a time — if a server action still has its old trigger emission code AND now calls domain (which also emits), triggers fire twice.
**How to avoid:** When migrating a server action, REMOVE the trigger emission from the server action at the same time you add the domain call. Never have both active.
**Warning signs:** Automations running twice per event; duplicate Inngest events.

### Pitfall 6: Action Executor Already Has Triggers — Don't Double-Emit
**What goes wrong:** The action executor already emits cascade triggers (with `cascadeDepth + 1`). If domain functions also emit, you get double triggers.
**Why it happens:** Action executor was built with inline trigger emission because domain layer didn't exist yet.
**How to avoid:** When migrating action executor to use domain, REMOVE its inline trigger code. Domain's trigger emission replaces it. Pass `cascadeDepth` through `DomainContext`.
**Warning signs:** Same as Pitfall 5 — duplicate automations.

### Pitfall 7: Keyword Match Implementation Complexity
**What goes wrong:** `whatsapp.keyword_match` trigger needs to check incoming messages against ALL active automations that use keyword triggers. Naive implementation queries DB for every message.
**Why it happens:** Keywords are stored in automation trigger configs, not in a dedicated lookup table.
**How to avoid:** In domain's `receiveMessage`, after storing the message, query active automations with `trigger_type = 'whatsapp.keyword_match'` for the workspace, check message content against each automation's keywords config, emit `emitWhatsAppKeywordMatch` per match.
**Warning signs:** High DB query count per incoming message; missing keyword matches.

### Pitfall 8: OrderCreator Has Its Own Patterns
**What goes wrong:** `OrderCreator` in `src/lib/agents/somnio/order-creator.ts` is a CLASS with methods for creating contacts and orders with Shopify-like logic (product mapping, price calculation). Simply replacing with domain calls may miss business logic.
**Why it happens:** OrderCreator was built for the AI agent's specific flow (captured data -> contact + order).
**How to avoid:** Study OrderCreator's logic carefully. The production adapter (`ProductionOrdersAdapter`) already wraps it. After domain migration, the adapter should call domain functions, and OrderCreator-specific logic (data mapping, price calculation, auto-tagging) stays in the adapter.
**Warning signs:** AI agent orders missing products, wrong prices, missing WPP tag.

## Code Examples

### Domain Function Template
```typescript
// Source: Derived from existing action-executor.ts patterns
import { createAdminClient } from '@/lib/supabase/admin'
import { emitOrderCreated } from '@/lib/automations/trigger-emitter'
import type { DomainContext, DomainResult } from './types'

export async function createOrder(
  ctx: DomainContext,
  params: {
    contactId: string
    pipelineId: string
    stageId?: string
    shippingAddress?: string
    description?: string
    products?: Array<{ title: string; sku: string; unitPrice: number; quantity: number }>
  }
): Promise<DomainResult<{ orderId: string; stageId: string }>> {
  const supabase = createAdminClient()

  // Resolve target stage if not provided
  let targetStageId = params.stageId
  if (!targetStageId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', params.pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single()
    if (!firstStage) return { success: false, error: 'No stages found in pipeline' }
    targetStageId = firstStage.id
  }

  // Insert order
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      workspace_id: ctx.workspaceId,
      contact_id: params.contactId,
      pipeline_id: params.pipelineId,
      stage_id: targetStageId,
      shipping_address: params.shippingAddress,
      description: params.description,
    })
    .select('id, total_value')
    .single()

  if (error || !order) {
    return { success: false, error: `Failed to create order: ${error?.message}` }
  }

  // Insert products if provided
  if (params.products && params.products.length > 0) {
    await supabase.from('order_products').insert(
      params.products.map(p => ({
        order_id: order.id,
        title: p.title,
        sku: p.sku,
        unit_price: p.unitPrice,
        quantity: p.quantity,
      }))
    )
  }

  // ALWAYS emit trigger — no exceptions
  emitOrderCreated({
    workspaceId: ctx.workspaceId,
    orderId: order.id,
    pipelineId: params.pipelineId,
    stageId: targetStageId,
    contactId: params.contactId,
    totalValue: order.total_value ?? 0,
    cascadeDepth: ctx.cascadeDepth ?? 0,
  })

  return { success: true, data: { orderId: order.id, stageId: targetStageId } }
}
```

### Thin Adapter Example (Server Action)
```typescript
// Source: Pattern from existing src/app/actions/orders.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createOrder as domainCreateOrder } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

export async function createOrder(formData: FormData) {
  // 1. AUTH (adapter concern)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('workspace_id')?.value
  if (!workspaceId) return { error: 'No workspace' }

  // 2. DELEGATE to domain
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await domainCreateOrder(ctx, {
    contactId: formData.get('contact_id') as string,
    pipelineId: formData.get('pipeline_id') as string,
    // ... extract params from formData
  })

  // 3. UI CONCERN (adapter only)
  if (result.success) {
    revalidatePath('/crm/pipeline')
  }

  return result
}
```

### Thin Adapter Example (Tool Handler)
```typescript
// Source: Pattern from existing src/lib/tools/handlers/crm/index.ts
import { createOrder as domainCreateOrder } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

// Inside handler function for 'crm.order.create':
async execute(params, context) {
  const ctx: DomainContext = {
    workspaceId: context.workspaceId,
    source: 'tool-handler',
  }

  const result = await domainCreateOrder(ctx, {
    contactId: params.contactId,
    pipelineId: params.pipelineId,
    stageId: params.stageId,
  })

  if (!result.success) {
    return { success: false, error: { type: 'internal_error', message: result.error } }
  }

  return { success: true, data: result.data }
}
```

### Postgres Audit Trigger (DB Safety Net)
```sql
-- Source: Standard Postgres audit trigger pattern (verified via WebSearch)

-- 1. Create audit table
CREATE TABLE mutation_audit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL,  -- INSERT, UPDATE, DELETE
  row_id uuid,
  workspace_id uuid,
  occurred_at timestamptz DEFAULT timezone('America/Bogota', NOW()),
  old_data jsonb,
  new_data jsonb
);

-- Create index for weekly cron queries
CREATE INDEX idx_mutation_audit_occurred ON mutation_audit (occurred_at);
CREATE INDEX idx_mutation_audit_workspace ON mutation_audit (workspace_id);

-- 2. Create trigger function
CREATE OR REPLACE FUNCTION audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO mutation_audit (table_name, operation, row_id, workspace_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Attach to critical tables
CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_messages AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_contact_tags AFTER INSERT OR DELETE ON contact_tags
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_order_tags AFTER INSERT OR DELETE ON order_tags
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_conversations AFTER INSERT OR UPDATE OR DELETE ON conversations
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();
```

### Task Overdue Cron (Inngest)
```typescript
// Source: Pattern from existing Inngest functions in the project
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitTaskOverdue } from '@/lib/automations/trigger-emitter'

export const taskOverdueCron = inngest.createFunction(
  { id: 'task-overdue-cron', name: 'Check Overdue Tasks' },
  { cron: '*/15 * * * *' },  // Every 15 minutes
  async ({ step }) => {
    const supabase = createAdminClient()

    const { data: overdueTasks } = await step.run('find-overdue-tasks', async () => {
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, workspace_id, contact_id, order_id')
        .eq('status', 'pending')
        .lt('due_date', now)
        .not('due_date', 'is', null)
      return data || []
    })

    for (const task of overdueTasks) {
      emitTaskOverdue({
        workspaceId: task.workspace_id,
        taskId: task.id,
        taskTitle: task.title,
        dueDate: task.due_date!,
        contactId: task.contact_id,
        orderId: task.order_id,
      })
    }

    return { checked: overdueTasks.length }
  }
)
```

## Migration Order and Dependencies

Based on CONTEXT.md decisions, the entity migration order is:

```
Wave 1: Orders (4 code paths — most duplicated)
  depends on: nothing

Wave 2: Contacts + Tags (3 code paths, tags shared with orders)
  depends on: Tags domain (shared by orders and contacts)

Wave 3: Messages/WhatsApp (3 code paths)
  depends on: Conversations domain (needed for message operations)

Wave 4: Tasks
  depends on: nothing (independent entity)

Wave 5: Notes (contact + task)
  depends on: nothing (independent entity)

Wave 6: Custom Fields
  depends on: Contacts domain (custom fields are on contacts/orders)

Wave 7: Conversations
  depends on: Contacts domain (conversation-contact linking)
```

**Cross-cutting work (do first or alongside Wave 1):**
1. Create `src/lib/domain/types.ts` with `DomainContext`, `DomainResult`
2. Create `src/lib/domain/index.ts` barrel export
3. DB migration: `mutation_audit` table + triggers
4. Update CLAUDE.md with domain layer rule
5. Inngest cron for `task.overdue` (can be Wave 4)
6. Keyword match wiring in WhatsApp receive (Wave 3)

## New Tool Handlers Inventory

From CONTEXT.md, these tool handlers must be created:

| Entity | Tool Name | Operation | Bot Permission |
|--------|-----------|-----------|----------------|
| Tasks | `task.create` | Create task | YES |
| Tasks | `task.update` | Update task fields | YES |
| Tasks | `task.complete` | Mark as completed | YES |
| Tasks | `task.list` | List/filter tasks | YES |
| Orders | `crm.order.update` | Update order fields | YES |
| Orders | `crm.order.delete` | Delete order | NO (bot cannot delete) |
| Orders | `crm.order.duplicate` | Duplicate to pipeline | YES |
| Orders | `crm.order.list` | List/filter orders | YES |
| Notes | `note.create` | Create contact note | YES |
| Notes | `note.list` | List contact notes | YES |
| Notes | `note.delete` | Delete note | NO (bot cannot delete) |
| Custom Fields | `custom-field.update` | Update field values | YES |
| Custom Fields | `custom-field.read` | Read field values | YES |
| Conversations | `conversation.assign` | Assign to agent | YES (already exists as `whatsapp.conversation.assign`) |
| Conversations | `conversation.close` | Archive/close | YES (already exists as `whatsapp.conversation.close`) |
| Conversations | `conversation.list` | List conversations | YES (already exists as `whatsapp.conversation.list`) |

**Note:** 3 conversation tool handlers already exist under `whatsapp.*` namespace. Evaluate whether to keep them there or create `conversation.*` aliases.

**Bot permission rule:** Bot can CREATE, READ, UPDATE. Bot CANNOT DELETE. Automations CAN execute deletes.

## State of the Art

| Old Approach (current) | New Approach (Phase 18) | Impact |
|------------------------|------------------------|--------|
| Server actions own mutation logic + trigger emission | Domain functions own mutation logic + trigger emission | Single source of truth |
| Tool handlers do direct DB, skip triggers | Tool handlers call domain, triggers automatic | Bot actions trigger automations |
| Action executor duplicates CRM logic | Action executor calls domain | No logic duplication |
| Shopify webhook does direct DB | Shopify webhook calls domain | Shopify orders trigger automations |
| Engine adapter uses OrderCreator directly | Engine adapter calls domain | AI orders trigger automations |
| `createClient()` in server actions | `createAdminClient()` in domain + manual workspace_id | Unified auth model |
| No audit trail for mutations | Postgres audit triggers + weekly cron | Bypass detection |

## Open Questions

1. **Conversation tool handler namespace**
   - What we know: 3 conversation handlers exist as `whatsapp.conversation.*`
   - What's unclear: Should we rename to `conversation.*` or keep `whatsapp.*`?
   - Recommendation: Keep existing `whatsapp.*` names (no breaking change), ensure they call domain functions. If needed, add `conversation.*` aliases later.

2. **OrderCreator class refactoring depth**
   - What we know: `OrderCreator` is a class with specific business logic (data mapping, price calculation, product lookup). `ProductionOrdersAdapter` wraps it.
   - What's unclear: How much of OrderCreator's logic moves into domain vs stays in the adapter?
   - Recommendation: Domain owns the generic `createContact` + `createOrder` calls. OrderCreator-specific mapping (datosCapturados -> contact params, pack -> products) stays in the adapter. OrderCreator class can be simplified to just do the mapping and then call domain.

3. **Activity logging in Notes**
   - What we know: `notes.ts` and `task-notes.ts` server actions log to `contact_activity` and `task_activity` tables.
   - What's unclear: Should activity logging be part of the domain function or stay in the adapter?
   - Recommendation: Activity logging is a domain concern (it's business logic, not UI). Move it into the domain function.

4. **Bulk operations performance**
   - What we know: CONTEXT.md says bulk = per-item triggers (50 contacts = 50 events).
   - What's unclear: For `bulkCreateContacts` (CSV import of hundreds), emitting hundreds of Inngest events sequentially could be slow.
   - Recommendation: Emit triggers in batches. Inngest supports batch sends. Still per-item triggers but sent efficiently.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all 30 server action files in `src/app/actions/`
- Direct codebase analysis of `src/lib/tools/handlers/crm/index.ts` (9 handlers, 1429 lines)
- Direct codebase analysis of `src/lib/tools/handlers/whatsapp/index.ts` (7 handlers, 902 lines)
- Direct codebase analysis of `src/lib/automations/action-executor.ts` (11 action types, 944 lines)
- Direct codebase analysis of `src/lib/automations/trigger-emitter.ts` (10 emit functions, 302 lines)
- Direct codebase analysis of `src/lib/shopify/webhook-handler.ts` (312 lines)
- Direct codebase analysis of `src/lib/whatsapp/webhook-handler.ts` (547 lines)
- Direct codebase analysis of `src/lib/agents/engine-adapters/production/` (orders 167 lines, messaging 175 lines)
- Direct codebase analysis of `src/lib/automations/constants.ts` (341 lines)
- Direct codebase analysis of `src/lib/supabase/admin.ts` (22 lines)

### Secondary (MEDIUM confidence)
- WebSearch: "Postgres audit trigger pattern INSERT UPDATE DELETE" — standard AFTER trigger pattern confirmed across multiple sources
- Project CONTEXT.md decisions (user-locked)

### Tertiary (LOW confidence)
- Inngest batch send capability for bulk operations — needs verification against current Inngest version

## Metadata

**Confidence breakdown:**
- Mutation map: HIGH — every file was read and analyzed
- Architecture pattern: HIGH — derived from existing codebase patterns + user decisions in CONTEXT.md
- Trigger gap analysis: HIGH — complete cross-reference of all callers vs trigger emissions
- Pitfalls: HIGH — derived from real patterns observed in codebase
- Postgres audit trigger: MEDIUM — standard pattern, verified via WebSearch but SQL not tested
- Migration order: HIGH — follows CONTEXT.md decisions

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (stable — internal refactoring, no external deps to change)
