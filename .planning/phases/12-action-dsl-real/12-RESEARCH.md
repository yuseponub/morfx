# Phase 12: Action DSL Real - Research

**Researched:** 2026-02-05
**Domain:** Real Tool Handler Implementation (CRM + WhatsApp) with Forensic Logging
**Confidence:** HIGH

## Summary

This phase replaces placeholder handlers from Phase 3 with real implementations that operate on the existing Supabase database (contacts, orders) and 360dialog WhatsApp API. The research reveals that **all infrastructure is already in place** -- the tool registry, executor, schemas, validation, logging, API routes, and middleware are fully implemented from Phase 3. The existing server actions (`src/app/actions/contacts.ts`, `src/app/actions/orders.ts`, `src/app/actions/messages.ts`) contain battle-tested Supabase query patterns that can be directly adapted for tool handlers.

The key insight: **This is not a greenfield implementation.** The Phase 3 infrastructure (registry, executor, schemas, logging, API routes) is complete and working. The Phase 4-8 server actions provide proven Supabase query patterns. Phase 12 is the bridge -- taking existing query patterns from server actions and wiring them into the existing tool handler interface. The main new work is: (1) the response contract wrapper, (2) error classification with `retryable` flag, (3) rate limiting, (4) timeout enforcement, and (5) enhanced forensic logging with `agent_session_id`.

**Primary recommendation:** Implement handlers by adapting existing server action patterns (NOT reimplementing from scratch). Use `createAdminClient()` for tool handlers since they run in server context without cookie-based auth. Add a thin `ToolResult<T>` wrapper for the response contract. Use in-memory `Map` with sliding window for rate limiting. Use PostgreSQL RPC functions for atomic order creation with rollback.

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@supabase/supabase-js` | 2.93+ | Database operations (contacts, orders) | Installed |
| `ajv` + `ajv-formats` | 8.17+ | Input validation (already in registry) | Installed |
| `pino` | 10.3+ | Forensic logging | Installed |
| `jose` | 6.1+ | API key auth in Edge middleware | Installed |

### Core (Already Implemented)

| Component | Location | What It Does |
|-----------|----------|--------------|
| Tool Registry | `src/lib/tools/registry.ts` | Singleton, Ajv validation, tool discovery |
| Tool Executor | `src/lib/tools/executor.ts` | `executeTool()`, `executeToolFromAgent()`, `executeToolFromAPI()` |
| CRM Schemas | `src/lib/tools/schemas/crm.tools.ts` | 9 tool schemas with JSON Schema validation |
| WhatsApp Schemas | `src/lib/tools/schemas/whatsapp.tools.ts` | 7 tool schemas with JSON Schema validation |
| CRM Handlers | `src/lib/tools/handlers/crm/index.ts` | **PLACEHOLDER** -- all return `_placeholder: true` |
| WhatsApp Handlers | `src/lib/tools/handlers/whatsapp/index.ts` | **PLACEHOLDER** -- all return `_placeholder: true` |
| Tool Logger | `src/lib/audit/tool-logger.ts` | Logs to Pino + Supabase `tool_executions` table |
| API Routes | `src/app/api/v1/tools/[toolName]/route.ts` | POST/GET endpoints for external invocation |
| Middleware | `middleware.ts` | API key auth for `/api/v1/tools/*` |
| 360dialog API | `src/lib/whatsapp/api.ts` | `sendTextMessage()`, `sendTemplateMessage()`, etc. |

### New Dependencies Required

None. All required libraries are already installed.

### No Alternatives to Consider

All technology decisions were locked in Phase 3. This phase uses the established stack exclusively.

## Architecture Patterns

### Recommended Changes to Existing Structure

```
src/lib/tools/
├── types.ts              # ADD: ToolResult<T>, ToolError types
├── registry.ts           # NO CHANGES
├── executor.ts           # MINOR: Add timeout wrapping
├── rate-limiter.ts       # NEW: In-memory sliding window rate limiter
├── handlers/
│   ├── crm/index.ts      # REPLACE: Placeholder -> real implementations
│   └── whatsapp/index.ts # REPLACE: Placeholder -> real implementations
└── ...

src/lib/audit/
├── tool-logger.ts        # ENHANCE: Add agent_session_id support
└── ...

supabase/migrations/
└── YYYYMMDD_tool_logs_enhanced.sql  # NEW: Add agent_session_id column + rate_limits table
```

### Pattern 1: Tool Result Contract (Response Wrapper)

**What:** Standardized response envelope for all tool handlers
**When to use:** Every handler must return this structure
**Confidence:** HIGH -- based on user decisions in CONTEXT.md

```typescript
// Source: User decisions (12-CONTEXT.md) -- successful response includes full resource
interface ToolSuccess<T> {
  success: true
  data: T                              // Full resource (contact, order, etc.)
  resource_url?: string                // For CRM: `/crm/contactos/{id}`
  message_id?: string                  // For WhatsApp: 360dialog wamid
}

interface ToolError {
  success: false
  error: {
    type: 'validation_error' | 'not_found' | 'duplicate' | 'external_api_error'
          | 'permission_denied' | 'rate_limited' | 'timeout' | 'internal_error'
    code: string                       // e.g., 'PHONE_DUPLICATE', 'CONTACT_NOT_FOUND'
    message: string                    // Human-readable in Spanish
    suggestion?: string                // e.g., "Use crm.contact.read para buscar primero"
    retryable: boolean                 // Agent knows if retry makes sense
  }
}

type ToolResult<T> = ToolSuccess<T> | ToolError
```

### Pattern 2: Admin Client for Tool Handlers

**What:** Tool handlers use `createAdminClient()` because they run without cookie-based user session
**When to use:** All tool handlers
**Confidence:** HIGH -- verified from existing codebase patterns

```typescript
// Tool handlers are invoked from:
// 1. API route (API key auth, no cookies)
// 2. Agent (no user session)
// 3. Webhook (no user session)
//
// Therefore they CANNOT use createClient() (requires cookies).
// They MUST use createAdminClient() which bypasses RLS.
// CRITICAL: Workspace isolation must be enforced manually via .eq('workspace_id', ...)

import { createAdminClient } from '@/lib/supabase/admin'

async function handler(input: CreateContactInput, context: ExecutionContext, dryRun: boolean) {
  const supabase = createAdminClient()

  // ALWAYS filter by workspace_id -- RLS is bypassed!
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: context.workspaceId,  // From ExecutionContext
      name: input.name,
      phone: input.phone,
      ...
    })
    .select()
    .single()
}
```

### Pattern 3: Existing Query Patterns (Reuse, Don't Reinvent)

**What:** Server actions contain proven Supabase query patterns to adapt
**When to use:** Every CRM handler
**Confidence:** HIGH -- verified from existing code

| Tool | Source Pattern | File |
|------|--------------|------|
| `crm.contact.create` | `createContact()` | `src/app/actions/contacts.ts:196` |
| `crm.contact.update` | `updateContactFromForm()` | `src/app/actions/contacts.ts:330` |
| `crm.contact.read` | `getContact()` | `src/app/actions/contacts.ts:141` |
| `crm.contact.list` | `getContacts()` | `src/app/actions/contacts.ts:38` |
| `crm.contact.delete` | `deleteContact()` | `src/app/actions/contacts.ts:393` |
| `crm.tag.add` | `addTagToContact()` | `src/app/actions/contacts.ts:451` |
| `crm.tag.remove` | `removeTagFromContact()` | `src/app/actions/contacts.ts:480` |
| `crm.order.create` | `createOrder()` | `src/app/actions/orders.ts:307` |
| `crm.order.updateStatus` | `moveOrderToStage()` | `src/app/actions/orders.ts:475` |
| `whatsapp.message.send` | `sendMessage()` | `src/app/actions/messages.ts:97` |
| `whatsapp.template.send` | `sendTemplateMessage()` | `src/app/actions/messages.ts:440` |

### Pattern 4: WhatsApp API Key Resolution

**What:** Get 360dialog API key from workspace settings, fallback to env var
**When to use:** All WhatsApp handlers
**Confidence:** HIGH -- verified from existing `messages.ts` pattern

```typescript
// Source: src/app/actions/messages.ts:147
async function getWhatsAppApiKey(supabase: SupabaseClient, workspaceId: string): Promise<string> {
  const { data } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const apiKey = data?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    throw new ToolExecutionError('external_api_error', 'WHATSAPP_NOT_CONFIGURED',
      'API key de WhatsApp no configurada',
      'Configure la API key en Configuracion > WhatsApp', false)
  }
  return apiKey
}
```

### Pattern 5: In-Memory Rate Limiter (Sliding Window)

**What:** Per-workspace rate limit using in-memory Map with sliding window
**When to use:** All tool executions
**Confidence:** MEDIUM -- based on Vercel's recommended LRU cache pattern

```typescript
// Source: Vercel official example + user decision (configurable per workspace)
class ToolRateLimiter {
  private windows: Map<string, number[]> = new Map()

  isAllowed(workspaceId: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const key = workspaceId
    const timestamps = this.windows.get(key) || []

    // Remove expired entries
    const valid = timestamps.filter(t => now - t < windowMs)

    if (valid.length >= limit) {
      return false
    }

    valid.push(now)
    this.windows.set(key, valid)
    return true
  }
}
```

**Default values (Claude's discretion):**
- CRM tools: 120 calls/minute per workspace
- WhatsApp tools: 30 calls/minute per workspace (360dialog has its own limits)
- Rate limit configurable via `workspace_limits` or new `tool_rate_limits` config

### Pattern 6: Timeout Enforcement

**What:** Wrap handler execution with `Promise.race` for domain-specific timeouts
**When to use:** Every tool execution in the executor
**Confidence:** HIGH -- standard JavaScript pattern

```typescript
// Source: Standard Promise.race pattern
const TIMEOUTS = {
  crm: 5_000,       // 5 seconds for DB operations
  whatsapp: 15_000,  // 15 seconds for external API
  system: 10_000,    // 10 seconds default
}

async function executeWithTimeout<T>(
  handler: () => Promise<T>,
  module: ToolModule,
  toolName: string
): Promise<T> {
  const timeout = TIMEOUTS[module] || TIMEOUTS.system

  const result = await Promise.race([
    handler(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(toolName, timeout)), timeout)
    )
  ])

  return result
}
```

### Pattern 7: Atomic Order Creation with PostgreSQL RPC

**What:** Use PostgreSQL function for atomic order + order_products creation
**When to use:** `crm.order.create` handler
**Confidence:** HIGH -- verified from Supabase docs and existing codebase pattern

```sql
-- Source: Supabase docs + existing pattern in orders.ts
CREATE OR REPLACE FUNCTION create_order_with_products(
  p_workspace_id UUID,
  p_contact_id UUID,
  p_pipeline_id UUID,
  p_stage_id UUID,
  p_products JSONB,
  p_description TEXT DEFAULT NULL,
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_total DECIMAL(12, 2) := 0;
  v_product JSONB;
  v_result JSONB;
BEGIN
  -- Create the order
  INSERT INTO orders (workspace_id, contact_id, pipeline_id, stage_id, description, shipping_address)
  VALUES (p_workspace_id, p_contact_id, p_pipeline_id, p_stage_id, p_description, p_shipping_address)
  RETURNING id INTO v_order_id;

  -- Insert products and calculate total
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    INSERT INTO order_products (order_id, sku, title, unit_price, quantity)
    VALUES (
      v_order_id,
      v_product->>'name',
      v_product->>'name',
      (v_product->>'price')::DECIMAL,
      (v_product->>'quantity')::INTEGER
    );
  END LOOP;

  -- Get the full order with auto-calculated total
  SELECT jsonb_build_object(
    'id', o.id,
    'workspace_id', o.workspace_id,
    'contact_id', o.contact_id,
    'total_value', o.total_value,
    'stage_id', o.stage_id,
    'pipeline_id', o.pipeline_id,
    'created_at', o.created_at
  ) INTO v_result
  FROM orders o WHERE o.id = v_order_id;

  RETURN v_result;
  -- If any error above, entire transaction rolls back automatically
END;
$$;
```

### Anti-Patterns to Avoid

- **Reimplementing Supabase queries from scratch:** Adapt existing server action patterns. They handle edge cases (duplicate phones, cascade deletes) that are easy to miss.
- **Using `createClient()` (cookie-based) in tool handlers:** Tool handlers run without user session. Use `createAdminClient()` and manually filter by `workspace_id`.
- **Forgetting workspace isolation with admin client:** Admin client bypasses RLS. Every query MUST include `.eq('workspace_id', context.workspaceId)`.
- **Calling `revalidatePath()` from tool handlers:** Server actions use `revalidatePath()` for Next.js cache. Tool handlers run from API routes/agents, not from React Server Components. Cache revalidation is not needed and would error.
- **Retry logic in handlers:** User decided "handler NO reintenta." Always fail immediately and let the agent decide.
- **Tools calling other tools:** User decided "tools atomicos." Each tool does ONE thing. The agent orchestrates sequences.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone normalization | Custom regex | `normalizePhone()` from `src/lib/utils/phone.ts` | Already handles E.164, Colombian formats |
| Input validation | Manual if/else | Ajv compiled validators (already in registry) | Schema is source of truth, Phase 3 validated this |
| Supabase client for handlers | Custom auth | `createAdminClient()` from `src/lib/supabase/admin.ts` | Already exists, bypasses RLS as needed |
| 360dialog API calls | Raw fetch | `sendTextMessage()`, `sendTemplateMessage()` from `src/lib/whatsapp/api.ts` | Already implemented and tested in Phase 7 |
| Audit logging | Custom insert | `logToolExecution()` from `src/lib/audit/tool-logger.ts` | Already handles Pino + Supabase dual logging |
| Error redaction | Manual | Pino's built-in `redact` config in `src/lib/audit/logger.ts` | Already configured for PII |
| API key auth | Custom middleware | Existing `middleware.ts` + `api-key.ts` | Already working from Phase 3 |
| UUID generation | `uuid` library | `crypto.randomUUID()` | Native, no dependency needed |

**Key insight:** This phase has remarkably little new infrastructure to build. The Phase 3 tool system and Phase 4-8 server actions provide nearly everything. The work is primarily adaptation and wiring.

## Common Pitfalls

### Pitfall 1: Workspace Isolation Bypass with Admin Client

**What goes wrong:** Tool handler queries return data from other workspaces, or worse, modify data across workspaces.
**Why it happens:** `createAdminClient()` bypasses RLS. If you forget `.eq('workspace_id', context.workspaceId)`, queries hit ALL workspaces.
**How to avoid:** Every single Supabase query in a tool handler MUST include workspace_id filter. Code review checklist item: "Does every query filter by workspace_id?"
**Warning signs:** Tests showing data from wrong workspace, tool executions affecting multiple workspaces.

### Pitfall 2: Duplicate Phone on Contact Create

**What goes wrong:** Contact creation fails with a cryptic Supabase error code `23505`.
**Why it happens:** `contacts` table has `UNIQUE(workspace_id, phone)`. Attempting to create a contact with an existing phone returns a constraint violation.
**How to avoid:** Catch error code `23505`, translate to a user-friendly `ToolError` with `type: 'duplicate'`, `code: 'PHONE_DUPLICATE'`, and `suggestion: 'Use crm.contact.read para buscar el contacto existente'`.
**Warning signs:** Raw Supabase errors reaching the agent instead of structured ToolError.

### Pitfall 3: WhatsApp 24h Window Enforcement

**What goes wrong:** `whatsapp.message.send` fails because the 24h customer service window is closed.
**Why it happens:** WhatsApp requires a customer-initiated message within the last 24 hours before a business can send a free-form message. Outside this window, only templates are allowed.
**How to avoid:** Check `conversation.last_customer_message_at` and calculate hours since. If >= 24h, return structured error with `suggestion: 'Use whatsapp.template.send para enviar fuera de la ventana de 24h'`. This pattern already exists in `src/app/actions/messages.ts:126-138`.
**Warning signs:** 360dialog API returning errors about closed windows, instead of our tool catching it first.

### Pitfall 4: Order Creation Partial Failure

**What goes wrong:** Order is created but products fail to insert, leaving an order with $0 total.
**Why it happens:** Without a transaction, order insert succeeds but product insert fails (e.g., invalid product data), resulting in an orphan order.
**How to avoid:** Use PostgreSQL RPC function (`create_order_with_products`) to ensure atomicity. If product insert fails, the entire operation rolls back. This is explicitly required by user decision: "Rollback automatico: si una operacion compuesta falla a mitad, se revierte todo."
**Warning signs:** Orders with $0 total, orders without products, orphan records in the database.

### Pitfall 5: Missing Contact for WhatsApp Send

**What goes wrong:** `whatsapp.message.send` receives a `contactId` but needs a phone number and conversation to send via 360dialog.
**Why it happens:** The tool schema accepts `contactId`, but 360dialog needs the phone number and there must be an existing conversation.
**How to avoid:** Handler must: (1) look up contact by ID to get phone, (2) find or create conversation for that phone, (3) check 24h window, (4) send message. This is a multi-step lookup within a single atomic tool call.
**Warning signs:** Null phone errors, conversation not found errors.

### Pitfall 6: Rate Limiter Memory Leak

**What goes wrong:** In-memory rate limiter's Map grows unbounded, consuming server memory.
**Why it happens:** Old timestamp entries are never cleaned up if workspaces become inactive.
**How to avoid:** Run a periodic cleanup (every 5 minutes) that removes entries older than the window size. Use `setInterval` in the module initialization, or clean up on every check.
**Warning signs:** Increasing memory usage over time, Node.js OOM errors.

### Pitfall 7: Timeout Not Cancelling the Operation

**What goes wrong:** A tool times out but the underlying database operation still completes, creating an inconsistent state where the tool reports failure but the data was actually modified.
**Why it happens:** `Promise.race` resolves the timeout, but the original promise continues running in the background.
**How to avoid:** For CRM tools, this is acceptable -- the operation either completes or not, and the next read will show the actual state. For WhatsApp tools, log the timeout but don't retry (user decision: handler does NOT retry). The forensic log captures both the timeout and any delayed completion.
**Warning signs:** Tool reports timeout but data was actually changed.

## Code Examples

### CRM Contact Create Handler (Real Implementation)

```typescript
// Source: Adapted from src/app/actions/contacts.ts:196
async function handleCreateContact(
  input: { name: string; phone: string; email?: string; address?: string; city?: string; tags?: string[]; notes?: string },
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<ContactResource>> {
  const supabase = createAdminClient()

  // Normalize phone
  const normalizedPhone = normalizePhone(input.phone)
  if (!normalizedPhone) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'INVALID_PHONE',
        message: 'Numero de telefono invalido',
        suggestion: 'Use formato E.164: +573001234567',
        retryable: false,
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        id: 'dry_run_preview',
        workspace_id: context.workspaceId,
        name: input.name,
        phone: normalizedPhone,
        email: input.email || null,
        address: input.address || null,
        city: input.city || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _dry_run: true,
      },
      resource_url: '/crm/contactos/dry_run_preview',
    }
  }

  // Real execution
  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: context.workspaceId,
      name: input.name,
      phone: normalizedPhone,
      email: input.email || null,
      address: input.address || null,
      city: input.city || null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: {
          type: 'duplicate',
          code: 'PHONE_DUPLICATE',
          message: 'Ya existe un contacto con este numero de telefono',
          suggestion: 'Use crm.contact.read para buscar el contacto existente',
          retryable: false,
        }
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'DB_INSERT_FAILED',
        message: `Error al crear contacto: ${error.message}`,
        retryable: true,
      }
    }
  }

  return {
    success: true,
    data: contact,
    resource_url: `/crm/contactos/${contact.id}`,
  }
}
```

### WhatsApp Send Message Handler (Real Implementation)

```typescript
// Source: Adapted from src/app/actions/messages.ts:97
async function handleSendMessage(
  input: { contactId: string; message: string; replyToMessageId?: string },
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<WhatsAppSendResult>> {
  const supabase = createAdminClient()

  // 1. Look up contact to get phone
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (contactError || !contact) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'CONTACT_NOT_FOUND',
        message: 'Contacto no encontrado',
        suggestion: 'Verifique el contactId o use crm.contact.list',
        retryable: false,
      }
    }
  }

  // 2. Find conversation for this contact
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, phone, last_customer_message_at, status')
    .eq('contact_id', input.contactId)
    .eq('workspace_id', context.workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  if (!conversation) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'CONVERSATION_NOT_FOUND',
        message: 'No hay conversacion activa con este contacto',
        suggestion: 'El contacto debe enviar un mensaje primero para iniciar la conversacion',
        retryable: false,
      }
    }
  }

  // 3. Check 24h window
  if (!conversation.last_customer_message_at) {
    return {
      success: false,
      error: {
        type: 'external_api_error',
        code: 'WINDOW_CLOSED',
        message: 'Ventana de 24h cerrada',
        suggestion: 'Use whatsapp.template.send para enviar fuera de la ventana',
        retryable: false,
      }
    }
  }

  const hoursSince = (Date.now() - new Date(conversation.last_customer_message_at).getTime()) / (1000 * 60 * 60)
  if (hoursSince >= 24) {
    return {
      success: false,
      error: {
        type: 'external_api_error',
        code: 'WINDOW_CLOSED',
        message: 'Ventana de 24h cerrada',
        suggestion: 'Use whatsapp.template.send para enviar fuera de la ventana',
        retryable: false,
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        message_id: 'dry_run_preview',
        sent: true,
        timestamp: new Date().toISOString(),
        _dry_run: true,
      }
    }
  }

  // 4. Get API key
  const apiKey = await getWhatsAppApiKey(supabase, context.workspaceId)

  // 5. Send via 360dialog
  const response = await sendTextMessage(apiKey, conversation.phone, input.message)
  const wamid = response.messages[0]?.id

  // 6. Save message to DB
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    workspace_id: context.workspaceId,
    wamid,
    direction: 'outbound',
    type: 'text',
    content: { body: input.message },
    status: 'sent',
    timestamp: new Date().toISOString(),
  })

  // 7. Update conversation metadata
  const preview = input.message.length > 100 ? input.message.slice(0, 100) + '...' : input.message
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
    })
    .eq('id', conversation.id)

  return {
    success: true,
    data: {
      message_id: wamid,
      sent: true,
      timestamp: new Date().toISOString(),
    },
    message_id: wamid,
  }
}
```

### Rate Limiter Implementation

```typescript
// Source: Based on Vercel's official Next.js rate-limiting example
const DEFAULTS = {
  crm: { limit: 120, windowMs: 60_000 },       // 120/min
  whatsapp: { limit: 30, windowMs: 60_000 },    // 30/min
}

class ToolRateLimiter {
  private windows: Map<string, number[]> = new Map()

  constructor() {
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  check(workspaceId: string, module: 'crm' | 'whatsapp' | 'system'): { allowed: boolean; remaining: number; resetMs: number } {
    const config = DEFAULTS[module] || DEFAULTS.crm
    const key = `${workspaceId}:${module}`
    const now = Date.now()

    const timestamps = (this.windows.get(key) || []).filter(t => now - t < config.windowMs)

    if (timestamps.length >= config.limit) {
      const oldest = timestamps[0]
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldest + config.windowMs - now,
      }
    }

    timestamps.push(now)
    this.windows.set(key, timestamps)

    return {
      allowed: true,
      remaining: config.limit - timestamps.length,
      resetMs: config.windowMs,
    }
  }

  private cleanup() {
    const now = Date.now()
    const maxWindow = 60_000 // 1 minute
    for (const [key, timestamps] of this.windows) {
      const valid = timestamps.filter(t => now - t < maxWindow)
      if (valid.length === 0) {
        this.windows.delete(key)
      } else {
        this.windows.set(key, valid)
      }
    }
  }
}

export const rateLimiter = new ToolRateLimiter()
```

### Enhanced Forensic Log (agent_session_id)

```sql
-- Migration: Add agent_session_id to tool_executions
ALTER TABLE tool_executions
  ADD COLUMN agent_session_id UUID;

-- Index for reconstructing agent conversations
CREATE INDEX idx_tool_executions_agent_session
  ON tool_executions(agent_session_id)
  WHERE agent_session_id IS NOT NULL;

COMMENT ON COLUMN tool_executions.agent_session_id IS
  'Agent session ID for tracing. NOT NULL when invoked by agent.';
```

## State of the Art

| Old Approach (Phase 3) | Current Approach (Phase 12) | Impact |
|------------------------|----------------------------|--------|
| Placeholder handlers returning `_placeholder: true` | Real handlers executing Supabase queries and 360dialog API | Tools actually work |
| No rate limiting | In-memory sliding window per workspace per module | Protection against agent loops |
| No timeouts | Domain-specific timeouts (5s CRM, 15s WhatsApp) | Predictable execution times |
| Generic error messages | Typed errors with `retryable` flag and suggestions | Agents make better decisions |
| `session_id` as generic string | `agent_session_id` as UUID for full conversation tracing | Complete audit trail |

## Open Questions

### 1. Sync vs Async Execution (Claude's Discretion)

**Decision: Synchronous.**

All tool executions should be synchronous (wait for result before returning). Reasons:
- User decided "Servicio externo caido: fallo claro e inmediato. Sin cola diferida."
- Agent needs the result to continue its conversation flow.
- Async would add complexity (polling, callbacks) without user-requested benefits.
- Timeouts handle the "taking too long" case.

### 2. WhatsApp message.send Schema Mismatch

**What we know:** The current schema accepts `contactId`, but the actual 360dialog API needs a phone number and conversation context.
**What's unclear:** Whether the schema should be updated to accept phone directly, or if the handler should perform the lookup internally.
**Recommendation:** Keep `contactId` in the schema (agent-friendly, no phone exposure). Handler performs lookup internally. This aligns with tool abstraction -- the agent says "send to this contact" not "send to this phone number."

### 3. Order Create: Pipeline/Stage Resolution

**What we know:** `crm.order.create` schema requires `contactId` and `products`. But the database requires `pipeline_id` and `stage_id`.
**What's unclear:** Should the tool auto-select the default pipeline and first stage?
**Recommendation:** Yes. If no pipeline/stage is specified, use the workspace's default pipeline and its first stage (position 0). This matches how `getOrCreateDefaultPipeline()` works in `src/app/actions/orders.ts`. The agent can optionally specify a stage if needed, but doesn't have to.

### 4. Rate Limit Configuration Storage

**What we know:** User wants rate limits configurable per workspace.
**What's unclear:** Should we add a DB table now or use in-memory defaults?
**Recommendation:** Start with in-memory defaults. Add a `workspace_tool_config` table or column in `workspaces.settings` only when the UI for configuration exists. For now, defaults are sufficient. The `rateLimiter.check()` can be easily extended to read from DB later.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/lib/tools/` -- Tool registry, executor, schemas, handlers
- Existing codebase: `src/app/actions/contacts.ts` -- Contact CRUD patterns
- Existing codebase: `src/app/actions/orders.ts` -- Order CRUD with products patterns
- Existing codebase: `src/app/actions/messages.ts` -- WhatsApp send patterns with 360dialog
- Existing codebase: `src/lib/whatsapp/api.ts` -- 360dialog API client
- Existing codebase: `src/lib/supabase/admin.ts` -- Admin client for server-side operations
- Existing codebase: `supabase/migrations/` -- Complete database schema

### Secondary (MEDIUM confidence)
- [Vercel Next.js rate-limiting example](https://nextjs-rate-limit.vercel.app/) -- In-memory LRU cache pattern
- [freeCodeCamp: How to Build an In-Memory Rate Limiter in Next.js](https://www.freecodecamp.org/news/how-to-build-an-in-memory-rate-limiter-in-nextjs/) -- Sliding window implementation
- [Supabase Transactions via RPC](https://github.com/orgs/supabase/discussions/4562) -- PostgreSQL function atomicity
- [Supabase RPC Atomicity Guide](https://openillumi.com/en/en-supabase-transaction-rpc-atomicity/) -- Transaction patterns

### Tertiary (LOW confidence)
- Rate limit default values (120/min CRM, 30/min WhatsApp) -- No specific benchmark, reasonable estimates based on typical usage patterns. Should be validated after deployment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already installed and in use. Zero new dependencies.
- Architecture: HIGH -- Adapting existing proven patterns from server actions. Tool system infrastructure from Phase 3 is complete.
- Handler implementation: HIGH -- Direct adaptation of working server action code.
- Rate limiting: MEDIUM -- In-memory approach is well-documented but default values are estimated.
- Pitfalls: HIGH -- Identified from analysis of existing code patterns and user decisions.

**Research date:** 2026-02-05
**Valid until:** 2026-04-05 (60 days -- stable domain, no external API changes expected)

---

## Research Notes

**Key discoveries:**
1. **Zero new dependencies needed.** Every library required is already installed.
2. **Server actions are the blueprint.** Each tool handler can be directly adapted from existing, battle-tested server actions.
3. **`createAdminClient()` is mandatory** for tool handlers. Cookie-based `createClient()` won't work in API/agent/webhook contexts.
4. **Workspace isolation is critical** when using admin client -- RLS is bypassed, so every query must manually filter by `workspace_id`.
5. **360dialog API client is ready to use.** `src/lib/whatsapp/api.ts` already has `sendTextMessage()`, `sendTemplateMessage()`, `sendMediaMessage()`.
6. **Order creation needs atomicity.** PostgreSQL RPC function ensures order + products are created as a single transaction.

**What makes this phase unique:**
- Not a greenfield build -- it's wiring existing pieces together
- The biggest risk is not technical but consistency: ensuring every handler follows the same error contract, workspace isolation, and logging patterns
- WhatsApp handlers have more complexity (multi-step lookups, external API, 24h window) than CRM handlers (single DB operation)

**Implementation risks:**
- LOW: CRM handlers (simple DB operations, patterns already proven)
- LOW: Error contract (new types but straightforward)
- MEDIUM: WhatsApp handlers (external API, multi-step lookups, window enforcement)
- MEDIUM: Rate limiting (in-memory works for single-process, may need Redis for multi-process later)
- LOW: Forensic logging enhancement (adding one column + one index)
