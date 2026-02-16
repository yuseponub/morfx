# Phase 20: Integration Automations (Twilio + Shopify) - Research

**Researched:** 2026-02-16
**Domain:** Twilio SMS integration + Shopify webhook expansion for the CRM automations engine
**Confidence:** HIGH

## Summary

Phase 20 extends the existing CRM automations engine (Phase 17) with two integration capabilities: Twilio SMS as a new action type (`send_sms`), and three new Shopify trigger types (`shopify.order_created`, `shopify.draft_order_created`, `shopify.order_updated`). The existing architecture -- constants catalog, action executor, trigger emitter, Inngest runners, variable resolver, wizard UI, and AI builder -- is designed for exactly this kind of extension. Every extension point follows a consistent pattern that has been validated across 10 triggers and 11 actions already.

The Twilio integration requires the `twilio` npm package (v5.x), per-workspace credential storage in the existing `integrations` table (type='twilio'), a new `sms_messages` tracking table for usage/cost data, and a simple 3-field config form. The Shopify extension requires modifying the existing webhook route to handle `orders/updated` and `draft_orders/create` topics (currently only `orders/create`), adding a new `ShopifyDraftOrderWebhook` type, and implementing the dual-behavior toggle (auto-sync vs trigger-only) in the Shopify config.

**Primary recommendation:** Follow the existing extension patterns exactly -- add to TRIGGER_CATALOG/ACTION_CATALOG constants, add emitter functions, add executor handler, create Inngest runners, update AI builder system prompt, and extend wizard UI with new categories. The architecture is proven and the patterns are mechanical.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| twilio | 5.x | Twilio REST API client (SMS send + usage records) | Official Node.js SDK, 2.4M+ weekly npm downloads, maintained by Twilio |
| inngest | 3.51.x | Already installed, durable execution for automation runners | Existing pattern: factory creates runners per trigger type |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| recharts | 3.7.x | Already installed, charts for SMS usage dashboard | Reuse WhatsApp costs chart pattern for Twilio usage |
| react-hook-form | 7.71.x | Already installed, Twilio credentials form | Same pattern as Shopify config form |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| twilio npm | Direct REST API (fetch) | SDK provides type safety, automatic pagination for usage records, and handles auth. Worth the ~2MB bundle cost since it runs server-side only. |
| Storing SMS cost in DB | Query Twilio API each time | DB storage gives historical tracking, faster dashboard loads, and works even if Twilio API is down. Store after each send. |

**Installation:**
```bash
npm install twilio
```

## Architecture Patterns

### Extension Points (Existing, Proven)

The codebase has 6 files that need mechanical updates for each new trigger/action. This pattern has been executed 10 times for triggers and 11 times for actions:

```
src/lib/automations/
  constants.ts      -> Add to TRIGGER_CATALOG, ACTION_CATALOG, VARIABLE_CATALOG
  types.ts          -> Extend TriggerType, ActionType, TriggerConfig unions
  trigger-emitter.ts -> Add emitShopify* functions (3 new)
  action-executor.ts -> Add executeSendSms handler (1 new)
  variable-resolver.ts -> Add shopify.* namespace mapping in buildTriggerContext

src/inngest/
  events.ts         -> Add 3 new Shopify automation event types
  functions/automation-runner.ts -> Add 3 new runners + EVENT_TO_TRIGGER entries

src/lib/builder/
  system-prompt.ts  -> Auto-updates from catalogs (no manual change needed!)
  tools.ts          -> validateActionParams auto-reads ACTION_CATALOG (no change needed!)
  validation.ts     -> Add send_sms to ACTION_TO_TRIGGER_MAP (empty array)

src/app/(dashboard)/automatizaciones/components/
  trigger-step.tsx  -> Add 'Shopify' category to CATEGORY_CONFIG + CATEGORIES
  actions-step.tsx  -> Add 'Twilio' category (action params UI for send_sms)

src/app/(dashboard)/configuracion/integraciones/
  page.tsx          -> Add Twilio tab alongside existing Shopify tab
```

### Pattern 1: Adding a New Action Type (send_sms)

**What:** Follow the exact same pattern as the existing WhatsApp actions (`send_whatsapp_text`, `send_whatsapp_template`).

**Key difference from WhatsApp:** SMS uses Twilio SDK instead of 360dialog API, and does NOT require a 24h window check. SMS can be sent to any phone number at any time.

**Steps (mechanical):**
1. Add `send_sms` to `ACTION_CATALOG` in `constants.ts` with params: `to` (optional, defaults to contact phone), `body` (required, supportsVariables), `mediaUrl` (optional, for MMS)
2. Add `'send_sms'` to `ActionType` union in `types.ts`
3. Add `case 'send_sms': return executeSendSms(...)` in `action-executor.ts`
4. Implement `executeSendSms` that:
   - Loads Twilio credentials from `integrations` table (type='twilio')
   - Initializes `twilio(accountSid, authToken)` client
   - Calls `client.messages.create({ body, from: twilioNumber, to: contactPhone, mediaUrl? })`
   - Stores SMS record in `sms_messages` table with cost (fetched from message.price after send)
   - Returns `{ messageSid, status, sent: true }`

**Example:**
```typescript
// In action-executor.ts
async function executeSendSms(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const body = String(params.body || '')
  if (!body) throw new Error('body is required for send_sms')

  // Resolve recipient phone
  const to = params.to ? String(params.to) : context.contactPhone
  if (!to) throw new Error('No phone number available for SMS')

  // Load Twilio credentials from integrations table
  const supabase = createAdminClient()
  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('workspace_id', workspaceId)
    .eq('type', 'twilio')
    .eq('is_active', true)
    .single()

  if (!integration) throw new Error('Twilio no configurado en este workspace')

  const config = integration.config as {
    account_sid: string
    auth_token: string
    phone_number: string
  }

  // Send SMS via Twilio SDK
  const twilio = require('twilio')
  const client = twilio(config.account_sid, config.auth_token)

  const messageParams: Record<string, unknown> = {
    body,
    from: config.phone_number,
    to,
  }

  // Optional MMS media
  if (params.mediaUrl) {
    messageParams.mediaUrl = [String(params.mediaUrl)]
  }

  const message = await client.messages.create(messageParams)

  // Store SMS record for usage tracking
  await supabase.from('sms_messages').insert({
    workspace_id: workspaceId,
    twilio_sid: message.sid,
    from_number: config.phone_number,
    to_number: to,
    body,
    status: message.status,
    direction: 'outbound',
    // Price may not be available immediately; will be updated later
    price: message.price ? parseFloat(message.price) : null,
    price_unit: message.priceUnit || 'USD',
    segments: message.numSegments ? parseInt(message.numSegments) : 1,
  })

  return { messageSid: message.sid, status: message.status, sent: true }
}
```

### Pattern 2: Adding New Trigger Types (Shopify)

**What:** Follow the exact same pattern as existing CRM triggers, but emit from the Shopify webhook handler instead of domain functions.

**Steps (mechanical per trigger):**
1. Add to `TRIGGER_CATALOG` in `constants.ts` with category 'Shopify' and Shopify-specific configFields
2. Add to `TriggerType` union in `types.ts`
3. Add `emitShopifyOrderCreated`, `emitShopifyDraftOrderCreated`, `emitShopifyOrderUpdated` to `trigger-emitter.ts`
4. Add Shopify-specific variables to `VARIABLE_CATALOG` in `constants.ts`
5. Add `shopify.*` namespace to `buildTriggerContext` in `variable-resolver.ts`
6. Add Inngest event types to `events.ts`
7. Create runners via `createAutomationRunner` factory in `automation-runner.ts`
8. Modify Shopify webhook route to handle new topics and call emitters

**Trigger config fields for Shopify triggers:**
- `shopify.order_created`: no required config (maybe optional filter by financial_status)
- `shopify.draft_order_created`: no required config
- `shopify.order_updated`: no required config (maybe optional filter by changed field)

### Pattern 3: Dual-Behavior Shopify Toggle

**What:** The Shopify webhook handler currently always creates orders. With the toggle:
- Toggle ON (default, backward-compatible): auto-create contact+order via domain AND emit trigger
- Toggle OFF: only emit trigger, automations decide what to do

**Implementation:**
```typescript
// In webhook-handler.ts (modified processShopifyWebhook)
const autoSync = config.auto_sync_orders !== false // Default: true (backward-compatible)

if (autoSync) {
  // Existing behavior: create contact + order via domain
  const { contactId, contactCreated } = await resolveContact(...)
  const orderId = await createOrderWithProducts(...)
  // ALSO emit trigger (new)
  emitShopifyOrderCreated({ workspaceId, orderId, contactId, shopifyPayload, ... })
} else {
  // New behavior: only emit trigger, let automations decide
  emitShopifyOrderCreated({ workspaceId, shopifyPayload, ... })
}
```

### Pattern 4: Twilio Credentials Storage

**What:** Reuse the existing `integrations` table (same as Shopify) with type='twilio'.

**Config JSONB structure:**
```json
{
  "account_sid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "auth_token": "********************************",
  "phone_number": "+15017122661"
}
```

**Masking:** Auth token masked in UI after save (show only last 4 chars). Same pattern as Shopify access_token.

### Pattern 5: SMS Usage Tracking

**What:** New `sms_messages` table to track every SMS sent, with cost tracking.

**Schema:**
```sql
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  twilio_sid TEXT NOT NULL UNIQUE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT NOT NULL,  -- queued, sending, sent, delivered, failed, undelivered
  price DECIMAL(10, 6),  -- Cost in price_unit currency
  price_unit TEXT DEFAULT 'USD',
  segments INTEGER DEFAULT 1,
  media_url TEXT,  -- For MMS
  automation_execution_id UUID,  -- Link to automation execution that triggered it
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

**Cost retrieval:** Twilio `message.price` may be null immediately after send. Two strategies:
1. **Optimistic:** Store null price on send, update later via Twilio status callback or periodic fetch
2. **Fetch after delay:** After sending, wait ~2 seconds and fetch `client.messages(sid).fetch()` to get price

**Recommendation:** Use approach 1 (optimistic + status callback). Add a Twilio status callback URL that updates the `sms_messages` table with final status and price. This is the standard Twilio pattern and avoids blocking the automation execution.

### Recommended Project Structure (Changes)
```
src/
  lib/
    automations/
      constants.ts        # +3 triggers, +1 action, +3 variable catalogs
      types.ts            # +3 trigger types, +1 action type
      trigger-emitter.ts  # +3 emitter functions
      action-executor.ts  # +1 executeSendSms handler
      variable-resolver.ts # +shopify namespace
    twilio/
      client.ts           # Twilio client factory (per-workspace credentials)
      types.ts            # TwilioConfig, SmsMessage types
    shopify/
      types.ts            # +ShopifyDraftOrderWebhook type
      webhook-handler.ts  # Modified: dual-behavior + trigger emission
  inngest/
    events.ts             # +3 Shopify automation event types
    functions/
      automation-runner.ts # +3 runners (factory pattern)
  app/
    api/
      webhooks/
        shopify/route.ts  # Modified: handle orders/updated + draft_orders/create
        twilio/
          status/route.ts # NEW: Twilio status callback endpoint
    (dashboard)/
      configuracion/
        integraciones/
          page.tsx        # Add Twilio tab
          components/
            twilio-form.tsx       # NEW: Twilio credentials form
            twilio-usage.tsx      # NEW: SMS usage dashboard
      automatizaciones/
        components/
          trigger-step.tsx  # Add Shopify category
          actions-step.tsx  # Add Twilio category + send_sms params UI
```

### Anti-Patterns to Avoid
- **Don't create a new Twilio client per SMS send.** Cache or re-create from credentials per request, but don't keep a global singleton (credentials are per-workspace).
- **Don't block automation execution waiting for SMS price.** The price arrives asynchronously; use status callback pattern.
- **Don't break the existing Shopify auto-sync.** The toggle must default to ON for backward compatibility. Existing workspaces should see no behavior change.
- **Don't add Shopify triggers to the existing domain layer.** Shopify triggers emit from the webhook handler, not from domain functions. Domain functions emit CRM triggers (order.created, contact.created, etc.).
- **Don't forget to add `send_sms` to ACTION_TO_TRIGGER_MAP** in `validation.ts` with an empty array (SMS doesn't produce any trigger events).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMS sending | Raw Twilio REST API calls with fetch | `twilio` npm package | SDK handles auth, retries, pagination for usage records, type definitions |
| Usage chart | Custom chart component | Existing `recharts` + copy WhatsApp `UsageChart` pattern | Already have the pattern in `/configuracion/whatsapp/costos/` |
| Credential form | Build from scratch | Copy `shopify-form.tsx` pattern with react-hook-form | Same pattern: 3 fields, test connection button, masked secrets |
| Webhook HMAC verification | Custom crypto | Existing `verifyShopifyHmac` pattern (already proven) | Shopify uses the same HMAC-SHA256 pattern |
| Variable resolution | New template engine | Existing `resolveVariables` + `buildTriggerContext` | Just add shopify.* namespace mapping |

**Key insight:** This phase is primarily about extending proven patterns, not building new architecture. The 6-file extension pattern (constants, types, emitter, executor, variable-resolver, events) has been validated across 10 triggers and 11 actions.

## Common Pitfalls

### Pitfall 1: Twilio Price Not Available Immediately
**What goes wrong:** SMS message.price is null right after `client.messages.create()`. Dashboard shows $0.00 for recent messages.
**Why it happens:** Twilio determines price asynchronously after carrier delivery.
**How to avoid:**
1. Store null price on creation
2. Add Twilio status callback URL (`statusCallback` param in `messages.create()`)
3. Status callback endpoint updates `sms_messages.price` and `sms_messages.status`
4. Dashboard aggregates from DB, showing "Pendiente" for null prices
**Warning signs:** All SMS costs showing as $0.00

### Pitfall 2: MMS Geographic Limitations
**What goes wrong:** MMS (media) fails for international numbers.
**Why it happens:** Twilio MMS is only supported in US and Canada. Colombia numbers cannot receive MMS.
**How to avoid:**
- For Colombian numbers (the primary user base), `mediaUrl` will be silently ignored by Twilio or cause an error
- Add a validation warning in the wizard: "MMS solo disponible para numeros de US/Canada"
- Consider storing the media URL as a link in the SMS body instead
**Warning signs:** Media attachments failing silently

### Pitfall 3: Shopify Webhook 5-Second Timeout
**What goes wrong:** Adding trigger emission to the Shopify webhook handler could push response time past Shopify's 5-second limit.
**Why it happens:** If auto-sync + trigger emission + Inngest event send all happen synchronously.
**How to avoid:** Trigger emission is already fire-and-forget (non-blocking). The `fireAndForget` helper in `trigger-emitter.ts` calls `inngest.send()` without awaiting. This pattern is safe.
**Warning signs:** Shopify retrying webhooks (duplicate processing)

### Pitfall 4: Draft Order Payload Differs from Order Payload
**What goes wrong:** Using `ShopifyOrderWebhook` type for draft orders and getting null fields.
**Why it happens:** Draft orders have a different structure (e.g., `status` field instead of `financial_status`, line_items may have different pricing structure).
**How to avoid:** Create a separate `ShopifyDraftOrderWebhook` type or use a union type with shared fields. Test with real draft order payloads.
**Warning signs:** Null pointer errors in trigger context building

### Pitfall 5: Breaking the Exhaustive Switch in action-executor.ts
**What goes wrong:** TypeScript compile error after adding `send_sms` to `ActionType` union.
**Why it happens:** The `executeByType` function has an exhaustive switch with `const _exhaustive: never = type`.
**How to avoid:** Add the `case 'send_sms':` handler to the switch BEFORE the default case. This is a feature, not a bug -- it ensures all action types are handled.
**Warning signs:** TypeScript error: "Type 'send_sms' is not assignable to type 'never'"

### Pitfall 6: UNIQUE Constraint on integrations(workspace_id, type)
**What goes wrong:** Trying to create a second Twilio integration for the same workspace.
**Why it happens:** The `integrations` table has `UNIQUE(workspace_id, type)`.
**How to avoid:** This is correct -- one Twilio config per workspace. The form should upsert (update if exists, insert if not), same pattern as Shopify form with `saveShopifyIntegration`.
**Warning signs:** Postgres unique constraint violation

### Pitfall 7: RLS Policy Requires Owner Role for Integrations
**What goes wrong:** Admin users can't configure Twilio.
**Why it happens:** Current RLS policies restrict integration insert/update/delete to owners only.
**How to avoid:** Per the CONTEXT.md decision, Owner + Admin should be able to configure. Requires updating the RLS policies (or the `is_workspace_owner` function) to also check for 'admin' role. Alternatively, use domain layer with `createAdminClient()` (bypasses RLS) for all integration writes, validating role in the server action.
**Warning signs:** "permission denied" for admin users

### Pitfall 8: Inngest Event Type Registration
**What goes wrong:** New Shopify events not being picked up by runners.
**Why it happens:** Forgetting to add events to `AllAgentEvents` type or not registering runners in `route.ts`.
**How to avoid:** Checklist:
1. Add event types to `events.ts` in `AutomationEvents`
2. Add runners to `automationFunctions` export in `automation-runner.ts`
3. Verify `route.ts` already spreads `...automationFunctions` (it does -- no change needed)
**Warning signs:** Events sent but no runners execute

## Code Examples

### Twilio SMS Action Catalog Entry
```typescript
// Source: constants.ts pattern from existing WhatsApp actions
{
  type: 'send_sms',
  label: 'Enviar SMS',
  category: 'Twilio',
  description: 'Envia un mensaje SMS al contacto via Twilio',
  params: [
    { name: 'body', label: 'Mensaje', type: 'textarea', required: true, supportsVariables: true },
    { name: 'to', label: 'Telefono destino (opcional)', type: 'text', required: false, supportsVariables: true },
    { name: 'mediaUrl', label: 'URL de media (MMS)', type: 'text', required: false },
  ],
}
```

### Shopify Trigger Catalog Entries
```typescript
// Source: constants.ts pattern from existing CRM triggers
{
  type: 'shopify.order_created',
  label: 'Orden de Shopify creada',
  category: 'Shopify',
  description: 'Se dispara cuando llega una orden nueva desde Shopify',
  configFields: [],
  variables: [
    'shopify.order_number', 'shopify.total', 'shopify.financial_status',
    'shopify.email', 'shopify.phone', 'shopify.note',
    'shopify.productos', 'shopify.direccion_envio', 'shopify.tags',
    'contacto.nombre', 'contacto.telefono',
  ],
},
{
  type: 'shopify.draft_order_created',
  label: 'Borrador de Shopify creado',
  category: 'Shopify',
  description: 'Se dispara cuando se crea un borrador de orden en Shopify',
  configFields: [],
  variables: [
    'shopify.order_number', 'shopify.total', 'shopify.status',
    'shopify.email', 'shopify.phone', 'shopify.note',
    'shopify.productos', 'shopify.direccion_envio',
    'contacto.nombre', 'contacto.telefono',
  ],
},
{
  type: 'shopify.order_updated',
  label: 'Orden de Shopify actualizada',
  category: 'Shopify',
  description: 'Se dispara cuando una orden existente de Shopify se actualiza',
  configFields: [],
  variables: [
    'shopify.order_number', 'shopify.total', 'shopify.financial_status',
    'shopify.fulfillment_status', 'shopify.email', 'shopify.phone',
    'shopify.note', 'shopify.productos', 'shopify.direccion_envio',
    'shopify.tags',
    'contacto.nombre', 'contacto.telefono',
  ],
},
```

### Twilio Emitter for Shopify Triggers
```typescript
// Source: trigger-emitter.ts pattern
export function emitShopifyOrderCreated(data: {
  workspaceId: string
  shopifyOrderId: number
  shopifyOrderNumber: string
  total: string
  financialStatus: string
  email: string | null
  phone: string | null
  note: string | null
  products: Array<{ sku: string; title: string; quantity: number; price: string }>
  shippingAddress: string | null
  shippingCity: string | null
  tags: string | null
  // If auto-sync created these:
  contactId?: string
  contactName?: string
  contactPhone?: string
  orderId?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('shopify.order_created', data.workspaceId, depth)) return
  fireAndForget(
    'automation/shopify.order_created',
    { ...data, cascadeDepth: depth },
    'shopify.order_created',
    data.workspaceId
  )
}
```

### Variable Context Builder Extension
```typescript
// Source: variable-resolver.ts buildTriggerContext - add shopify namespace
// --- shopify ---
const shopify: Record<string, unknown> = {}
if (eventData.shopifyOrderNumber !== undefined) shopify.order_number = eventData.shopifyOrderNumber
if (eventData.shopifyTotal !== undefined) shopify.total = eventData.shopifyTotal
if (eventData.shopifyFinancialStatus !== undefined) shopify.financial_status = eventData.shopifyFinancialStatus
if (eventData.shopifyFulfillmentStatus !== undefined) shopify.fulfillment_status = eventData.shopifyFulfillmentStatus
if (eventData.shopifyEmail !== undefined) shopify.email = eventData.shopifyEmail
if (eventData.shopifyPhone !== undefined) shopify.phone = eventData.shopifyPhone
if (eventData.shopifyNote !== undefined) shopify.note = eventData.shopifyNote
if (eventData.shopifyProducts !== undefined) shopify.productos = eventData.shopifyProducts
if (eventData.shopifyShippingAddress !== undefined) shopify.direccion_envio = eventData.shopifyShippingAddress
if (eventData.shopifyTags !== undefined) shopify.tags = eventData.shopifyTags
if (eventData.shopifyStatus !== undefined) shopify.status = eventData.shopifyStatus
if (Object.keys(shopify).length > 0) context.shopify = shopify
```

### Wizard Category Extension
```typescript
// Source: trigger-step.tsx CATEGORY_CONFIG pattern
// Add to CATEGORY_CONFIG:
Shopify: { icon: ShoppingBag, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50' },

// Add to CATEGORIES:
const CATEGORIES: TriggerCategory[] = ['CRM', 'WhatsApp', 'Tareas', 'Shopify']

// For actions-step.tsx - add Twilio category:
Twilio: { icon: Phone, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50' },
```

### Twilio Status Callback Endpoint
```typescript
// Source: new file - src/app/api/webhooks/twilio/status/route.ts
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const messageSid = formData.get('MessageSid') as string
  const messageStatus = formData.get('MessageStatus') as string
  const price = formData.get('Price') as string | null
  const priceUnit = formData.get('PriceUnit') as string | null
  const errorCode = formData.get('ErrorCode') as string | null

  if (!messageSid) {
    return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 })
  }

  const supabase = createAdminClient()
  await supabase
    .from('sms_messages')
    .update({
      status: messageStatus,
      price: price ? Math.abs(parseFloat(price)) : null,
      price_unit: priceUnit || 'USD',
      error_code: errorCode || null,
    })
    .eq('twilio_sid', messageSid)

  return NextResponse.json({ received: true })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shopify webhook only processes orders/create | Will process orders/create, orders/updated, draft_orders/create | Phase 20 | 3 new trigger types available |
| Shopify webhook always auto-creates orders | Toggle: auto-sync OR trigger-only mode | Phase 20 | Users control whether Shopify orders auto-create in CRM |
| Only CRM/WhatsApp/Task trigger categories | +Shopify trigger category | Phase 20 | Wizard and builder show 4 trigger categories |
| Only CRM/WhatsApp/Task/Integration action categories | +Twilio action category | Phase 20 | Wizard and builder show 5 action categories |
| integrations table: only type='shopify' | +type='twilio' | Phase 20 | Second integration type in the platform |

**Deprecated/outdated:**
- The Shopify API version in `connection-test.ts` is hardcoded to `2024-01`. Should update to a more recent stable version (`2025-01` or later) during this phase.
- The `is_workspace_owner` RLS function only checks for 'owner' role. Per CONTEXT decision, Admin should also manage integrations.

## Open Questions

1. **Draft order payload structure**
   - What we know: Shopify draft orders use topic `draft_orders/create` and have similar fields to orders (line_items, customer, addresses) but with some differences (e.g., `status` instead of `financial_status`, different lifecycle)
   - What's unclear: The exact JSON payload structure for draft_orders/create webhook. Shopify docs don't provide a sample payload inline.
   - Recommendation: Use the DraftOrder REST API resource documentation fields, or test with a real webhook. Create a `ShopifyDraftOrderWebhook` type that extends the common fields and adds draft-specific ones. Use a permissive type initially and tighten after testing.

2. **Twilio phone number format**
   - What we know: Twilio requires E.164 format (+country code + number). MorfX contacts may have various phone formats.
   - What's unclear: How reliably are contact phone numbers stored in E.164 in the DB?
   - Recommendation: Use the existing `phone-normalizer.ts` pattern from Shopify integration. Add phone normalization before Twilio API calls.

3. **SMS cost currency for Colombian users**
   - What we know: Twilio prices in USD, Colombian users think in COP.
   - What's unclear: Should the usage dashboard show USD or convert to COP?
   - Recommendation: Show in USD (Twilio's native currency). The cost comes directly from Twilio API and conversion rates fluctuate. Display as "Costo (USD)" in the dashboard.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Complete review of all 6 extension points (constants, types, emitter, executor, variable-resolver, events), plus Inngest runner factory, wizard UI, builder tools/system-prompt, Shopify webhook handler, integrations schema
- [Twilio Messages Resource](https://www.twilio.com/docs/sms/api/message-resource) - Message properties: sid, status, price, priceUnit, errorCode, numSegments, statusCallback
- [Twilio SMS Quickstart Node.js](https://www.twilio.com/docs/sms/quickstart/node) - SDK initialization, messages.create() API, MMS mediaUrl param
- [Twilio Usage Records API](https://www.twilio.com/docs/usage/api/usage-record) - Usage category filtering, date ranges, price/count/usage fields
- [Twilio npm package](https://www.npmjs.com/package/twilio) - v5.11.2, 2.4M+ weekly downloads
- [Shopify Webhook Topics](https://shopify.dev/docs/api/admin-rest/latest/resources/webhook) - orders/create, orders/updated, draft_orders/create, draft_orders/update, draft_orders/delete

### Secondary (MEDIUM confidence)
- [Twilio MMS Guide](https://www.twilio.com/en-us/blog/how-to-send-an-mms-with-node-js) - MMS only supported in US/Canada, mediaUrl must be publicly accessible
- [Twilio Message Delivery Tracking](https://www.twilio.com/docs/sms/tutorials/how-to-confirm-delivery-node-js) - statusCallback URL pattern for delivery confirmation + pricing

### Tertiary (LOW confidence)
- Draft order webhook payload structure - inferred from Order resource structure, not directly verified with sample payload

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - twilio npm is the canonical choice, all other deps already installed
- Architecture: HIGH - extension patterns are proven across 10 triggers and 11 actions in existing codebase
- Twilio SMS integration: HIGH - well-documented API, simple messages.create() pattern
- Twilio usage/cost tracking: MEDIUM - price availability timing confirmed, status callback pattern is standard but needs testing
- Shopify trigger extension: HIGH - webhook handler and Inngest patterns are mechanical extensions
- Draft order types: MEDIUM - similar to order types but exact payload not verified against live webhook
- Pitfalls: HIGH - identified from codebase analysis + known Twilio limitations (MMS geography, async pricing)

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain, Twilio SDK and Shopify APIs change slowly)
