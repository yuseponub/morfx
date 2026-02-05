# Phase 12: Action DSL Real - Research

**Researched:** 2026-02-05 (re-researched with full codebase audit)
**Domain:** Real Tool Handler Implementation (CRM + WhatsApp) with Forensic Logging
**Confidence:** HIGH

## Summary

This phase replaces placeholder handlers from Phase 3 with real implementations that operate on the existing Supabase database (contacts, orders) and 360dialog WhatsApp API. A full codebase audit confirms that **all infrastructure is already in place** -- the tool registry, executor, schemas, validation, logging, API routes, and middleware are fully implemented from Phase 3. The existing server actions (`src/app/actions/contacts.ts`, `src/app/actions/orders.ts`, `src/app/actions/messages.ts`) contain battle-tested Supabase query patterns that can be directly adapted for tool handlers.

The re-research uncovered **one critical bug** in the existing infrastructure: the `tool-logger.ts` imports `createClient` from `@/lib/supabase/server` (cookie-based). This WILL FAIL when tool handlers are invoked from API routes or agent contexts that don't have cookie-based auth. The logger must be updated to use `createAdminClient()` from `@/lib/supabase/admin` so logging works regardless of invocation context.

The key insight remains: **This is not a greenfield implementation.** Phase 12 bridges existing query patterns from server actions into the existing tool handler interface. The main new work is: (1) fixing the tool-logger client, (2) adding `ToolResult<T>` response wrapper types, (3) error classification with `retryable` flag, (4) rate limiting, (5) timeout enforcement, (6) enhanced forensic logging with `agent_session_id`, and (7) implementing all 16 real handlers.

**Primary recommendation:** Implement handlers by adapting existing server action patterns (NOT reimplementing from scratch). Use `createAdminClient()` from `src/lib/supabase/admin.ts` for tool handlers since they run in server context without cookie-based auth. Fix the tool-logger to also use `createAdminClient()`. Add a thin `ToolResult<T>` wrapper for the response contract. Use in-memory `Map` with sliding window for rate limiting. Use PostgreSQL RPC function for atomic order creation with rollback.

## Standard Stack

### Core (Already Installed -- Verified)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@supabase/supabase-js` | ^2.93.1 | Database operations (contacts, orders) | Installed, verified |
| `@supabase/ssr` | ^0.8.0 | Server-side Supabase client | Installed, verified |
| `ajv` | ^8.17.1 | Input validation (already in registry) | Installed, verified |
| `ajv-formats` | ^3.0.1 | Format validation (email, uuid, etc.) | Installed, verified |
| `pino` | ^10.3.0 | Forensic logging | Installed, verified |
| `jose` | ^6.1.3 | API key auth in Edge middleware | Installed, verified |
| `date-fns` | ^4.1.0 | Date calculations (used in messages.ts) | Installed, verified |
| `libphonenumber-js` | installed | Phone normalization (used in phone.ts) | Installed, verified |

### Core (Already Implemented -- Verified with Line Numbers)

| Component | Location | What It Does | Verified |
|-----------|----------|--------------|----------|
| Tool Types | `src/lib/tools/types.ts` (366 lines) | ToolHandler, ExecutionContext, ToolExecutionResult, etc. | YES |
| Tool Registry | `src/lib/tools/registry.ts` (328 lines) | Singleton, Ajv validation, tool discovery | YES |
| Tool Executor | `src/lib/tools/executor.ts` (371 lines) | `executeTool()`, `executeToolFromAgent()`, `executeToolFromAPI()`, `executeToolFromWebhook()` | YES |
| Tool Init | `src/lib/tools/init.ts` (93 lines) | `initializeTools()` -- registers all schemas + handlers | YES |
| CRM Schemas | `src/lib/tools/schemas/crm.tools.ts` (498 lines) | 9 tool schemas: contact CRUD, tag add/remove, order create/updateStatus | YES |
| WhatsApp Schemas | `src/lib/tools/schemas/whatsapp.tools.ts` (364 lines) | 7 tool schemas: message send/list, template send/list, conversation list/assign/close | YES |
| CRM Handlers | `src/lib/tools/handlers/crm/index.ts` (111 lines) | **PLACEHOLDER** -- all return `_placeholder: true` | YES |
| WhatsApp Handlers | `src/lib/tools/handlers/whatsapp/index.ts` (87 lines) | **PLACEHOLDER** -- all return `_placeholder: true` | YES |
| Tool Logger | `src/lib/audit/tool-logger.ts` (200 lines) | Logs to Pino + Supabase `tool_executions` table (**BUG: uses cookie-based client**) | YES |
| Base Logger | `src/lib/audit/logger.ts` (99 lines) | Pino logger with PII redaction | YES |
| API Route (tool exec) | `src/app/api/v1/tools/[toolName]/route.ts` (194 lines) | POST/GET endpoints for tool execution | YES |
| API Route (discovery) | `src/app/api/v1/tools/route.ts` (52 lines) | GET endpoint listing all tools | YES |
| Middleware | `middleware.ts` (64 lines) | API key auth for `/api/v1/tools/*` via `x-workspace-id` header | YES |
| Admin Client | `src/lib/supabase/admin.ts` (21 lines) | `createAdminClient()` -- service_role key, bypasses RLS | YES |
| Server Client | `src/lib/supabase/server.ts` (47 lines) | `createClient()` (cookie-based) + `createAdminClient()` (service_role) | YES |
| 360dialog API | `src/lib/whatsapp/api.ts` (313 lines) | `sendTextMessage()`, `sendTemplateMessage()`, `sendMediaMessage()`, `sendButtonMessage()` | YES |
| 360dialog Templates | `src/lib/whatsapp/templates-api.ts` (209 lines) | `listTemplates360()`, `getTemplateByName360()` | YES |
| Phone Utils | `src/lib/utils/phone.ts` (117 lines) | `normalizePhone()`, `formatPhoneDisplay()`, `isValidColombianPhone()` | YES |

### New Dependencies Required

None. All required libraries are already installed and verified.

### No Alternatives to Consider

All technology decisions were locked in Phase 3. This phase uses the established stack exclusively.

## Architecture Patterns

### Recommended Changes to Existing Structure

```
src/lib/tools/
+-- types.ts              # MODIFY: Add ToolResult<T>, ToolError, ToolSuccess types
+-- registry.ts           # NO CHANGES
+-- executor.ts           # MODIFY: Add timeout wrapping, rate limit check
+-- rate-limiter.ts       # NEW: In-memory sliding window rate limiter
+-- handlers/
|   +-- crm/index.ts      # REPLACE: Placeholder -> 9 real handler implementations
|   +-- whatsapp/index.ts  # REPLACE: Placeholder -> 7 real handler implementations
+-- ...

src/lib/audit/
+-- tool-logger.ts        # FIX: Change createClient -> createAdminClient (CRITICAL BUG)
|                         # ENHANCE: Add agent_session_id support
+-- ...

supabase/migrations/
+-- YYYYMMDD_tool_logs_enhanced.sql  # NEW: Add agent_session_id column + index
+-- YYYYMMDD_create_order_rpc.sql    # NEW: Atomic order+products creation function
```

### CRITICAL BUG: Tool Logger Uses Cookie-Based Client

**What:** `src/lib/audit/tool-logger.ts` line 10 imports `createClient` from `@/lib/supabase/server` (cookie-based).
**Why this is a bug:** Tool handlers are invoked from API routes and agent contexts where cookies are NOT available. The `createClient()` function calls `await cookies()` which will throw or return an empty session when invoked outside a React Server Component or Server Action context.
**Impact:** Tool execution logging SILENTLY FAILS when invoked from API route or agent. The `try/catch` in `logToolExecution()` swallows the error.
**Fix:** Replace `import { createClient } from '@/lib/supabase/server'` with `import { createAdminClient } from '@/lib/supabase/admin'` and update the logging function to use `createAdminClient()` instead.
**Confidence:** HIGH -- verified by reading actual source code.

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
**When to use:** All tool handlers AND the tool logger
**Confidence:** HIGH -- verified from existing codebase patterns

Two `createAdminClient()` functions exist in the codebase:
1. `src/lib/supabase/admin.ts` -- standalone file (21 lines)
2. `src/lib/supabase/server.ts` -- alongside cookie-based `createClient()` (47 lines)

Both create identical clients using `SUPABASE_SERVICE_ROLE_KEY`. Use the one from `admin.ts` in tool handlers for clarity.

```typescript
// Tool handlers are invoked from:
// 1. API route (API key auth via middleware, no cookies)
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
    })
    .select()
    .single()
}
```

### Pattern 3: Existing Query Patterns (Reuse, Don't Reinvent)

**What:** Server actions contain proven Supabase query patterns to adapt
**When to use:** Every handler
**Confidence:** HIGH -- verified from existing code with exact line numbers

| Tool | Source Pattern | File | Key Logic |
|------|--------------|------|-----------|
| `crm.contact.create` | `createContact()` | `contacts.ts:196` | insert + normalizePhone + 23505 duplicate check |
| `crm.contact.update` | `updateContactFromForm()` | `contacts.ts:330` | update + partial fields + 23505 duplicate check |
| `crm.contact.read` | `getContact()` | `contacts.ts:141` | select + tags join via contact_tags |
| `crm.contact.list` | `getContacts()` | `contacts.ts:38` | select + tags join + pagination |
| `crm.contact.delete` | `deleteContact()` | `contacts.ts:393` | delete by id |
| `crm.tag.add` | `addTagToContact()` | `contacts.ts:451` | insert contact_tag + 23505 (already exists = success) |
| `crm.tag.remove` | `removeTagFromContact()` | `contacts.ts:480` | delete contact_tag |
| `crm.order.create` | `createOrder()` | `orders.ts:307` | insert order + insert products + manual rollback |
| `crm.order.updateStatus` | `moveOrderToStage()` | `orders.ts:475` | update stage_id + WIP limit check |
| `whatsapp.message.send` | `sendMessage()` | `messages.ts:97` | 24h window check + sendTextMessage + insert message |
| `whatsapp.message.list` | `getMessages()` | `messages.ts:33` | select messages + cursor pagination |
| `whatsapp.template.send` | `sendTemplateMessage()` | `messages.ts:440` | template lookup + components + sendTemplate360 |
| `whatsapp.template.list` | `getTemplates()` | `templates.ts:26` | select from whatsapp_templates |
| `whatsapp.conversation.list` | `getConversations()` | `conversations.ts:21` | select + contact join + tags |
| `whatsapp.conversation.assign` | `assignConversation()` | `assignment.ts:37` | update assigned_to |
| `whatsapp.conversation.close` | `archiveConversation()` | `conversations.ts:242` | update status='archived' |

### Pattern 4: WhatsApp API Key Resolution

**What:** Get 360dialog API key from workspace settings, fallback to env var
**When to use:** All WhatsApp handlers
**Confidence:** HIGH -- verified from existing `messages.ts` pattern (lines 141-148)

```typescript
// Source: src/app/actions/messages.ts:141-148
async function getWhatsAppApiKey(supabase: SupabaseClient, workspaceId: string): Promise<string> {
  const { data } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const apiKey = data?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    return toolError('external_api_error', 'WHATSAPP_NOT_CONFIGURED',
      'API key de WhatsApp no configurada',
      'Configure la API key en Configuracion > WhatsApp', false)
  }
  return apiKey
}
```

### Pattern 5: In-Memory Rate Limiter (Sliding Window)

**What:** Per-workspace rate limit using in-memory Map with sliding window
**When to use:** All tool executions, checked in executor before handler invocation
**Confidence:** MEDIUM -- well-documented pattern, default values are estimates

```typescript
class ToolRateLimiter {
  private windows: Map<string, number[]> = new Map()

  constructor() {
    // Periodic cleanup every 5 minutes to prevent memory leaks
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 5 * 60 * 1000)
    }
  }

  check(workspaceId: string, module: 'crm' | 'whatsapp' | 'system'): {
    allowed: boolean; remaining: number; resetMs: number
  } {
    const config = DEFAULTS[module] || DEFAULTS.crm
    const key = `${workspaceId}:${module}`
    const now = Date.now()

    const timestamps = (this.windows.get(key) || []).filter(t => now - t < config.windowMs)

    if (timestamps.length >= config.limit) {
      const oldest = timestamps[0]
      return { allowed: false, remaining: 0, resetMs: oldest + config.windowMs - now }
    }

    timestamps.push(now)
    this.windows.set(key, timestamps)
    return { allowed: true, remaining: config.limit - timestamps.length, resetMs: config.windowMs }
  }

  private cleanup() {
    const now = Date.now()
    const maxWindow = 60_000
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

**Default values (Claude's discretion):**
- CRM tools: 120 calls/minute per workspace
- WhatsApp tools: 30 calls/minute per workspace (360dialog has its own limits)
- Rate limit configurable via `workspace.settings` in the future

### Pattern 6: Timeout Enforcement

**What:** Wrap handler execution with `Promise.race` for domain-specific timeouts
**When to use:** Every tool execution in the executor
**Confidence:** HIGH -- standard JavaScript pattern

```typescript
const TIMEOUTS: Record<string, number> = {
  crm: 5_000,       // 5 seconds for DB operations
  whatsapp: 15_000,  // 15 seconds for external API
  system: 10_000,    // 10 seconds default
}

async function executeWithTimeout<T>(
  handler: () => Promise<T>,
  module: string,
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
**Confidence:** HIGH -- the existing `createOrder()` in orders.ts manually does rollback (line 367: `await supabase.from('orders').delete().eq('id', order.id)`), which is fragile. An RPC function is more robust.

```sql
-- Source: Supabase docs + improving existing orders.ts pattern
CREATE OR REPLACE FUNCTION create_order_with_products(
  p_workspace_id UUID,
  p_contact_id UUID,
  p_pipeline_id UUID,
  p_stage_id UUID,
  p_products JSONB,
  p_description TEXT DEFAULT NULL,
  p_shipping_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_product JSONB;
  v_result JSONB;
BEGIN
  -- Create the order
  INSERT INTO orders (workspace_id, contact_id, pipeline_id, stage_id, description, shipping_address)
  VALUES (p_workspace_id, p_contact_id, p_pipeline_id, p_stage_id, p_description, p_shipping_address)
  RETURNING id INTO v_order_id;

  -- Insert products
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

### Pattern 8: Tag Operations by Name (Not ID)

**What:** The `crm.tag.add` schema accepts a `tag` string (tag name), NOT a tag ID. But the existing `addTagToContact()` server action accepts `tagId`.
**When to use:** `crm.tag.add` and `crm.tag.remove` handlers
**Confidence:** HIGH -- verified from schema definition in crm.tools.ts

The handler must:
1. Look up the tag by name within the workspace
2. If tag doesn't exist for `crm.tag.add`, create it (schema description says "Creates the tag if it does not exist")
3. Then link/unlink via `contact_tags` table

```typescript
// For crm.tag.add: find-or-create tag by name, then link
const { data: existingTag } = await supabase
  .from('tags')
  .select('id')
  .eq('workspace_id', context.workspaceId)
  .eq('name', input.tag)
  .single()

let tagId = existingTag?.id
if (!tagId) {
  const { data: newTag } = await supabase
    .from('tags')
    .insert({ workspace_id: context.workspaceId, name: input.tag, color: '#6366f1' })
    .select('id')
    .single()
  tagId = newTag?.id
}

// Link tag to contact
const { error } = await supabase
  .from('contact_tags')
  .insert({ contact_id: input.contactId, tag_id: tagId })
```

### Pattern 9: Conversation Close Maps to Archive

**What:** The `whatsapp.conversation.close` schema says "Close a conversation (mark as resolved)" but the database uses `status: 'archived'` not 'closed'.
**When to use:** `whatsapp.conversation.close` handler
**Confidence:** HIGH -- verified from conversation schema (status CHECK IN ('active', 'archived')) and `archiveConversation()` in conversations.ts

The handler maps "close" to `status: 'archived'`. The schema's `resolution` field should be stored in a note or metadata.

### Anti-Patterns to Avoid

- **Reimplementing Supabase queries from scratch:** Adapt existing server action patterns. They handle edge cases (duplicate phones, cascade deletes) that are easy to miss.
- **Using `createClient()` (cookie-based) in tool handlers:** Tool handlers run without user session. Use `createAdminClient()` and manually filter by `workspace_id`.
- **Forgetting workspace isolation with admin client:** Admin client bypasses RLS. Every query MUST include `.eq('workspace_id', context.workspaceId)`.
- **Calling `revalidatePath()` from tool handlers:** Server actions use `revalidatePath()` for Next.js cache. Tool handlers run from API routes/agents, not from React Server Components. Cache revalidation is not needed and would error in non-RSC contexts.
- **Retry logic in handlers:** User decided "handler NO reintenta." Always fail immediately and let the agent decide.
- **Tools calling other tools:** User decided "tools atomicos." Each tool does ONE thing. The agent orchestrates sequences.
- **Using `date-fns` in handlers:** The existing `messages.ts` uses `differenceInHours` from date-fns, but for tool handlers, simple arithmetic (`(Date.now() - timestamp) / (1000 * 60 * 60)`) is cleaner and avoids an import dependency in the tools module.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone normalization | Custom regex | `normalizePhone()` from `src/lib/utils/phone.ts` | Already handles E.164, Colombian formats via libphonenumber-js |
| Input validation | Manual if/else | Ajv compiled validators (already in registry) | Schema is source of truth, Phase 3 validated this |
| Supabase client for handlers | Custom auth | `createAdminClient()` from `src/lib/supabase/admin.ts` | Already exists, bypasses RLS as needed |
| 360dialog text messages | Raw fetch | `sendTextMessage()` from `src/lib/whatsapp/api.ts` | Already implemented, handles auth headers and error parsing |
| 360dialog template messages | Raw fetch | `sendTemplateMessage()` from `src/lib/whatsapp/api.ts` | Already implemented with component support |
| 360dialog template listing | Raw fetch | `listTemplates360()` from `src/lib/whatsapp/templates-api.ts` | Already implemented |
| Audit logging | Custom insert | `logToolExecution()` from `src/lib/audit/tool-logger.ts` (after fix) | Already handles Pino + Supabase dual logging |
| Error redaction | Manual | Pino's built-in `redact` config in `src/lib/audit/logger.ts` | Already configured for PII |
| API key auth | Custom middleware | Existing `middleware.ts` + `api-key.ts` | Already working from Phase 3 |
| UUID generation | `uuid` library | `crypto.randomUUID()` | Native, no dependency needed |
| Default pipeline resolution | Custom query | Adapt `getOrCreateDefaultPipeline()` from `orders.ts:100` | Already handles creation if none exists |

**Key insight:** This phase has remarkably little new infrastructure to build. The Phase 3 tool system and Phase 4-8 server actions provide nearly everything. The work is primarily adaptation and wiring, plus fixing the tool-logger bug.

## Common Pitfalls

### Pitfall 1: Tool Logger Uses Wrong Supabase Client (EXISTING BUG)

**What goes wrong:** Tool execution logs silently fail to persist to database when invoked from API routes or agent contexts.
**Why it happens:** `src/lib/audit/tool-logger.ts` line 10 imports `createClient` from `@/lib/supabase/server`, which is cookie-based. When called from API/agent context, `cookies()` fails or returns empty.
**How to avoid:** Change to `import { createAdminClient } from '@/lib/supabase/admin'` and replace `await createClient()` with `createAdminClient()` in the `logToolExecution()` function.
**Warning signs:** Tool logs appear in Pino console output but NOT in the `tool_executions` database table.

### Pitfall 2: Workspace Isolation Bypass with Admin Client

**What goes wrong:** Tool handler queries return data from other workspaces, or worse, modify data across workspaces.
**Why it happens:** `createAdminClient()` bypasses RLS. If you forget `.eq('workspace_id', context.workspaceId)`, queries hit ALL workspaces.
**How to avoid:** Every single Supabase query in a tool handler MUST include workspace_id filter. Code review checklist item: "Does every query filter by workspace_id?"
**Warning signs:** Tests showing data from wrong workspace, tool executions affecting multiple workspaces.

### Pitfall 3: Duplicate Phone on Contact Create

**What goes wrong:** Contact creation fails with a cryptic Supabase error code `23505`.
**Why it happens:** `contacts` table has `UNIQUE(workspace_id, phone)`. Attempting to create a contact with an existing phone returns a constraint violation.
**How to avoid:** Catch error code `23505`, translate to a user-friendly `ToolError` with `type: 'duplicate'`, `code: 'PHONE_DUPLICATE'`, and `suggestion: 'Use crm.contact.read para buscar el contacto existente'`.
**Warning signs:** Raw Supabase errors reaching the agent instead of structured ToolError.

### Pitfall 4: WhatsApp 24h Window Enforcement

**What goes wrong:** `whatsapp.message.send` fails because the 24h customer service window is closed.
**Why it happens:** WhatsApp requires a customer-initiated message within the last 24 hours before a business can send a free-form message. Outside this window, only templates are allowed.
**How to avoid:** Check `conversation.last_customer_message_at` and calculate hours since. If >= 24h, return structured error with `suggestion: 'Use whatsapp.template.send para enviar fuera de la ventana de 24h'`. This pattern exists in `src/app/actions/messages.ts:126-138`.
**Warning signs:** 360dialog API returning errors about closed windows, instead of our tool catching it first.

### Pitfall 5: Order Creation Partial Failure

**What goes wrong:** Order is created but products fail to insert, leaving an order with $0 total.
**Why it happens:** Without a transaction, order insert succeeds but product insert fails (e.g., invalid product data), resulting in an orphan order.
**How to avoid:** Use PostgreSQL RPC function (`create_order_with_products`) to ensure atomicity. If product insert fails, the entire operation rolls back. This is explicitly required by user decision: "Rollback automatico: si una operacion compuesta falla a mitad, se revierte todo."
**Warning signs:** Orders with $0 total, orders without products, orphan records in the database.

### Pitfall 6: Missing Contact for WhatsApp Send

**What goes wrong:** `whatsapp.message.send` receives a `contactId` but needs a phone number and conversation to send via 360dialog.
**Why it happens:** The tool schema accepts `contactId`, but 360dialog needs the phone number and there must be an existing conversation.
**How to avoid:** Handler must: (1) look up contact by ID to get phone, (2) find existing conversation for that contact, (3) check 24h window, (4) send message. This is a multi-step lookup within a single atomic tool call.
**Warning signs:** Null phone errors, conversation not found errors.

### Pitfall 7: Rate Limiter Memory Leak

**What goes wrong:** In-memory rate limiter's Map grows unbounded, consuming server memory.
**Why it happens:** Old timestamp entries are never cleaned up if workspaces become inactive.
**How to avoid:** Run a periodic cleanup (every 5 minutes) that removes entries older than the window size. Guard `setInterval` with `typeof setInterval !== 'undefined'` for edge runtime compatibility.
**Warning signs:** Increasing memory usage over time, Node.js OOM errors.

### Pitfall 8: Timeout Not Cancelling the Operation

**What goes wrong:** A tool times out but the underlying database operation still completes, creating an inconsistent state where the tool reports failure but the data was actually modified.
**Why it happens:** `Promise.race` resolves the timeout, but the original promise continues running in the background.
**How to avoid:** For CRM tools, this is acceptable -- the operation either completes or not, and the next read will show the actual state. For WhatsApp tools, log the timeout but don't retry (user decision: handler does NOT retry). The forensic log captures both the timeout and any delayed completion.
**Warning signs:** Tool reports timeout but data was actually changed.

### Pitfall 9: Tag Add Uses Name But DB Uses IDs

**What goes wrong:** The `crm.tag.add` handler tries to insert a tag name into `contact_tags` which requires tag IDs.
**Why it happens:** The schema specifies a `tag` field as a string (name), but the `contact_tags` join table uses `tag_id` (UUID).
**How to avoid:** Handler must: (1) find tag by name in workspace, (2) if not found, create the tag, (3) then insert the contact_tag relationship.
**Warning signs:** Foreign key constraint violations, "tag not found" errors.

### Pitfall 10: Conversation Close Status Mismatch

**What goes wrong:** Handler tries to set `status: 'closed'` but the database CHECK constraint only allows `'active'` or `'archived'`.
**Why it happens:** The tool schema says "close" but the database schema uses `'archived'` for closed conversations.
**How to avoid:** Map "close" to `status: 'archived'` in the handler. Verified from migration `20260130000002_whatsapp_conversations.sql:21`: `CHECK (status IN ('active', 'archived'))`.
**Warning signs:** Supabase CHECK constraint violation error.

## Code Examples

### CRM Contact Create Handler (Real Implementation)

```typescript
// Source: Adapted from src/app/actions/contacts.ts:196
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/utils/phone'
import type { ExecutionContext } from '../../types'

async function handleCreateContact(
  input: { name: string; phone: string; email?: string; address?: string; city?: string; tags?: string[]; notes?: string },
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<ContactResource>> {
  const supabase = createAdminClient()

  // Normalize phone (reuse existing utility)
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
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/whatsapp/api'

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
    .select('id, phone, phone_number_id, last_customer_message_at, status')
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
        message: 'Ventana de 24h cerrada - no hay mensaje previo del cliente',
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

### Fixed Tool Logger (Using Admin Client)

```typescript
// FIX for src/lib/audit/tool-logger.ts
// BEFORE (broken):
// import { createClient } from '@/lib/supabase/server'  // Cookie-based - fails in API/agent

// AFTER (fixed):
import { createAdminClient } from '@/lib/supabase/admin'  // Service role - works everywhere

export async function logToolExecution(execution: ToolExecutionInput): Promise<string | null> {
  const executionId = crypto.randomUUID()

  // 1. Log to console (immediate, never fails)
  toolLogger.info({
    event: 'tool_execution',
    execution_id: executionId,
    tool_name: execution.tool_name,
    status: execution.status,
    duration_ms: execution.duration_ms,
    workspace_id: execution.workspace_id,
    source: execution.request_context.source,
  })

  // 2. Persist to database (async, may fail)
  try {
    const supabase = createAdminClient()  // NOT await createClient()

    const { error } = await supabase.from('tool_executions').insert({
      id: executionId,
      workspace_id: execution.workspace_id,
      tool_name: execution.tool_name,
      inputs: execution.inputs,
      outputs: execution.outputs,
      status: execution.status,
      error_message: execution.error_message,
      error_stack: execution.error_stack,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      duration_ms: execution.duration_ms,
      user_id: execution.user_id,
      session_id: execution.session_id,
      request_context: execution.request_context,
      // NEW: agent_session_id for tracing
      agent_session_id: execution.request_context.source === 'agent'
        ? execution.session_id
        : null,
    })

    if (error) {
      toolLogger.error({ event: 'log_persist_error', execution_id: executionId, error: error.message })
      return null
    }

    return executionId
  } catch (err) {
    toolLogger.error({ event: 'log_persist_exception', execution_id: executionId, error: err instanceof Error ? err.message : 'Unknown' })
    return null
  }
}
```

### Enhanced Forensic Log Migration (agent_session_id)

```sql
-- Migration: Add agent_session_id to tool_executions
ALTER TABLE tool_executions
  ADD COLUMN agent_session_id UUID;

-- Index for reconstructing agent conversations
CREATE INDEX idx_tool_executions_agent_session
  ON tool_executions(agent_session_id)
  WHERE agent_session_id IS NOT NULL;

COMMENT ON COLUMN tool_executions.agent_session_id IS
  'Agent session ID for tracing tool calls within a conversation. Populated when source=agent.';
```

## State of the Art

| Old Approach (Phase 3) | Current Approach (Phase 12) | Impact |
|------------------------|----------------------------|--------|
| Placeholder handlers returning `_placeholder: true` | Real handlers executing Supabase queries and 360dialog API | Tools actually work |
| No rate limiting | In-memory sliding window per workspace per module | Protection against agent loops |
| No timeouts | Domain-specific timeouts (5s CRM, 15s WhatsApp) | Predictable execution times |
| Generic error messages | Typed errors with `retryable` flag and suggestions | Agents make better decisions |
| `session_id` as generic string | `agent_session_id` as UUID column with dedicated index | Complete audit trail |
| Tool logger uses cookie-based client | Tool logger uses admin client | Logging works from all contexts |
| Manual order rollback in server action | PostgreSQL RPC for atomic operations | True transactional integrity |

## Open Questions

### 1. Sync vs Async Execution (Resolved)

**Decision: Synchronous.**

All tool executions should be synchronous (wait for result before returning). Reasons:
- User decided "Servicio externo caido: fallo claro e inmediato. Sin cola diferida."
- Agent needs the result to continue its conversation flow.
- Async would add complexity (polling, callbacks) without user-requested benefits.
- Timeouts handle the "taking too long" case.

### 2. WhatsApp message.send Schema Mismatch (Resolved)

**Decision: Keep `contactId` in schema, handler performs lookup.**

The current schema accepts `contactId`, but the actual 360dialog API needs a phone number and conversation context. Keep `contactId` in the schema (agent-friendly, no phone exposure). Handler performs the multi-step lookup internally. This aligns with tool abstraction -- the agent says "send to this contact" not "send to this phone number."

### 3. Order Create: Pipeline/Stage Resolution (Resolved)

**Decision: Auto-select default pipeline and first stage.**

If no pipeline/stage is specified, use the workspace's default pipeline and its first stage (position 0). This matches how `getOrCreateDefaultPipeline()` works in `src/app/actions/orders.ts:100`. The handler must adapt this pattern to use `createAdminClient()` instead of cookie-based auth.

### 4. Rate Limit Configuration Storage (Resolved)

**Decision: In-memory defaults only, for now.**

Start with in-memory defaults (120/min CRM, 30/min WhatsApp). Add DB-configurable limits later when the UI for configuration exists. The `rateLimiter.check()` can be easily extended to read from `workspace.settings` in the future.

### 5. Handler File Organization (NEW)

**What we know:** Current placeholder handlers are in single files (`handlers/crm/index.ts` with 111 lines for 9 tools). Real implementations will be significantly larger.
**Recommendation:** Keep all CRM handlers in `handlers/crm/index.ts` and all WhatsApp handlers in `handlers/whatsapp/index.ts`. The original placeholder code comments say "Do NOT create new handler files - modify this file directly. The registry in init.ts imports from this file." While these files will grow larger, the init.ts import contract should be preserved. If files become unwieldy, internal helper files can be added alongside but the main export must remain in `index.ts`.

### 6. WhatsApp Template Send: Template Lookup by Name vs ID (NEW)

**What we know:** The `whatsapp.template.send` schema has `templateName` (string) but the existing `sendTemplateMessage()` in messages.ts uses `templateId` (UUID from DB). The 360dialog API sends by template name.
**Recommendation:** The handler should: (1) look up the template by name in `whatsapp_templates` table (or by `templateName` directly), (2) verify status is 'APPROVED', (3) build components, (4) send via `sendTemplateMessage()` from `api.ts` using the template name directly. This avoids requiring the agent to know DB IDs.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/lib/tools/` -- Tool registry (328 lines), executor (371 lines), types (366 lines), schemas, handlers
- Existing codebase: `src/app/actions/contacts.ts` (843 lines) -- Contact CRUD patterns
- Existing codebase: `src/app/actions/orders.ts` (735 lines) -- Order CRUD with products patterns
- Existing codebase: `src/app/actions/messages.ts` (587 lines) -- WhatsApp send patterns with 360dialog
- Existing codebase: `src/app/actions/conversations.ts` -- Conversation query patterns with filters
- Existing codebase: `src/app/actions/assignment.ts` -- Conversation assignment patterns
- Existing codebase: `src/app/actions/tags.ts` (269 lines) -- Tag CRUD patterns
- Existing codebase: `src/app/actions/templates.ts` -- Template query and send patterns
- Existing codebase: `src/lib/whatsapp/api.ts` (313 lines) -- 360dialog API client (sendTextMessage, sendTemplateMessage, sendMediaMessage)
- Existing codebase: `src/lib/whatsapp/templates-api.ts` (209 lines) -- 360dialog template management
- Existing codebase: `src/lib/supabase/admin.ts` (21 lines) -- Admin client for server-side operations
- Existing codebase: `src/lib/supabase/server.ts` (47 lines) -- Cookie-based + admin clients
- Existing codebase: `src/lib/utils/phone.ts` (117 lines) -- Phone normalization via libphonenumber-js
- Existing codebase: `src/lib/audit/tool-logger.ts` (200 lines) -- Tool execution logging (BUG identified)
- Existing codebase: `src/lib/audit/logger.ts` (99 lines) -- Pino logger with PII redaction
- Existing codebase: `middleware.ts` (64 lines) -- API key auth for /api/v1/tools
- Existing codebase: `supabase/migrations/20260128000002_tool_executions.sql` -- tool_executions table schema
- Existing codebase: `supabase/migrations/20260129000001_contacts_and_tags.sql` -- contacts, tags, contact_tags schemas
- Existing codebase: `supabase/migrations/20260130000002_whatsapp_conversations.sql` -- conversations schema (status CHECK)

### Tertiary (LOW confidence)
- Rate limit default values (120/min CRM, 30/min WhatsApp) -- No specific benchmark, reasonable estimates based on typical usage patterns. Should be validated after deployment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already installed and verified with exact versions.
- Architecture: HIGH -- Adapting existing proven patterns from server actions. Tool system infrastructure from Phase 3 is complete.
- Handler implementation: HIGH -- Direct adaptation of working server action code with verified line numbers.
- Rate limiting: MEDIUM -- In-memory approach is well-documented but default values are estimated.
- Pitfalls: HIGH -- Identified 10 specific pitfalls from analysis of actual code, including one existing bug (tool-logger).
- Database schema: HIGH -- Verified all relevant tables and constraints from migration files.

**Research date:** 2026-02-05 (re-researched)
**Valid until:** 2026-04-05 (60 days -- stable domain, no external API changes expected)

---

## Research Notes

**Key discoveries (re-research):**
1. **CRITICAL BUG: Tool logger uses cookie-based client.** `tool-logger.ts` imports `createClient` from `server.ts` which requires cookies. This fails silently when invoked from API/agent contexts. Must fix to `createAdminClient`.
2. **Two admin client files exist.** Both `src/lib/supabase/admin.ts` and `src/lib/supabase/server.ts` export `createAdminClient()` with identical behavior. Use the one from `admin.ts` in tool handlers for clarity.
3. **Tag operations work by name, not ID.** The `crm.tag.add` schema accepts a tag name string, but the database uses tag IDs. Handler must find-or-create the tag by name.
4. **Conversation "close" maps to "archived" status.** The database CHECK constraint only allows `'active'` or `'archived'`, not `'closed'`.
5. **No RPC function for order creation exists yet.** The existing `createOrder()` does manual rollback on failure. A proper PostgreSQL RPC function is needed for atomicity.
6. **WhatsApp template send needs adaptation.** The schema uses `templateName` but existing code uses `templateId`. Handler must bridge this by looking up template by name.
7. **16 total handlers to implement.** 9 CRM (contact CRUD x5, tag x2, order x2) + 7 WhatsApp (message x2, template x2, conversation x3).
8. **The `conversations` table has `phone_number_id` field.** This is the 360dialog phone number ID, not the recipient's phone. It may need to be included when constructing outbound messages.

**What makes this phase unique:**
- Not a greenfield build -- it's wiring existing pieces together
- The biggest risk is not technical but consistency: ensuring every handler follows the same error contract, workspace isolation, and logging patterns
- WhatsApp handlers have more complexity (multi-step lookups, external API, 24h window) than CRM handlers (single DB operation)
- The tool-logger bug must be fixed FIRST, before implementing handlers, otherwise none of the execution logs will persist

**Implementation risks:**
- LOW: CRM handlers (simple DB operations, patterns already proven)
- LOW: Error contract (new types but straightforward)
- MEDIUM: WhatsApp handlers (external API, multi-step lookups, window enforcement)
- MEDIUM: Rate limiting (in-memory works for single-process, may need Redis for multi-process later)
- LOW: Forensic logging enhancement (adding one column + one index)
- **HIGH: Tool logger bug fix** (must be done first -- without this, all subsequent handler testing appears to succeed but logs don't persist)
