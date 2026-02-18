# WhatsApp Phone Resilience - Research

**Researched:** 2026-02-17
**Domain:** WhatsApp automation phone fallback / Shopify note_attributes extraction
**Confidence:** HIGH (codebase analysis) / MEDIUM (Shopify note_attributes format) / LOW (Releasit-specific attribute names)

## Summary

This research investigates how to add phone fallback logic to WhatsApp automation actions. When `send_whatsapp_text`, `send_whatsapp_template`, or `send_whatsapp_media` fire via automation and the primary contact phone has no existing WhatsApp conversation, the system should try a secondary phone (extracted from Shopify `note_attributes` via Releasit COD form) before failing.

The core change is surgical: modify `resolveWhatsAppContext()` in `action-executor.ts` (the single function all 3 WhatsApp actions call) to implement a phone fallback chain. Secondary phone storage goes in the existing `custom_fields` JSONB column on `contacts` -- NOT a new column -- because it's workspace-specific metadata from an external plugin, not a universal CRM field. Extraction happens at Shopify webhook ingestion time in `webhook-handler.ts`.

**Primary recommendation:** Extract secondary phone from Shopify `note_attributes` at webhook processing time, store in `contacts.custom_fields.secondary_phone`, and add fallback logic to `resolveWhatsAppContext()` with chain: primary phone conversation -> secondary phone conversation -> create new conversation with primary phone (templates only) -> error.

## Standard Stack

No new libraries required. This feature uses existing infrastructure exclusively.

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| libphonenumber-js | existing | Phone normalization for secondary phone | Already used in `phone-normalizer.ts` |
| @supabase/supabase-js | existing | DB operations via `createAdminClient()` | Domain layer pattern |

### Supporting (Already in Codebase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| normalizeShopifyPhone | N/A (internal) | Normalize secondary phone from Shopify | At extraction time in webhook handler |
| normalizePhone | N/A (internal) | Normalize phone for contact matching | At resolution time in action executor |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `custom_fields` JSONB | New `secondary_phone` column | Column is cleaner but requires migration, schema change, and updates to ALL contact-related code. `custom_fields` is already indexed with GIN and works with existing domain/custom-fields infrastructure |
| Extract at webhook time | Extract at action execution time | Extracting at execution time would require storing raw `note_attributes` somewhere, adds latency to every WhatsApp action, and couples action executor to Shopify knowledge |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Where Changes Go (Surgical Edit Map)

```
src/
  lib/
    shopify/
      types.ts                    # ADD note_attributes to ShopifyOrderWebhook
      webhook-handler.ts          # ADD extractSecondaryPhone + store in custom_fields
    automations/
      action-executor.ts          # MODIFY resolveWhatsAppContext for phone fallback
```

Total: 3 files modified. No new files.

### Pattern 1: Extract-at-Ingestion (Shopify Webhook Handler)

**What:** Extract secondary phone from `note_attributes` when Shopify webhook arrives, normalize it, and store on the contact's `custom_fields.secondary_phone`.

**When to use:** Every Shopify order webhook that creates/updates a contact.

**Why at ingestion time:**
- The `note_attributes` data is only available in the Shopify webhook payload
- Storing it immediately means WhatsApp actions never need to know about Shopify
- Follows existing pattern: `extractPhoneFromOrder` already runs at webhook time

**Example:**
```typescript
// In webhook-handler.ts, after resolveContact() or createContact()
// Extract secondary phone from note_attributes
function extractSecondaryPhone(
  order: ShopifyOrderWebhook
): string | null {
  if (!order.note_attributes || !Array.isArray(order.note_attributes)) {
    return null
  }

  // Releasit COD form stores phone-like data in note_attributes
  // Common attribute names (case-insensitive matching):
  // "Phone", "Telefono", "Celular", "WhatsApp", "Secondary Phone"
  const phoneAttributeNames = [
    'phone', 'telefono', 'celular', 'whatsapp',
    'secondary_phone', 'secondary phone',
    'phone_number', 'phone number',
    'numero', 'numero_telefono',
  ]

  for (const attr of order.note_attributes) {
    const name = (attr.name || '').toLowerCase().trim()
    if (phoneAttributeNames.includes(name)) {
      const normalized = normalizeShopifyPhone(attr.value)
      if (normalized) return normalized
    }
  }

  return null
}
```

### Pattern 2: Phone Fallback Chain in resolveWhatsAppContext

**What:** Modify `resolveWhatsAppContext()` to try multiple phones in priority order when looking for a conversation.

**When to use:** Every WhatsApp automation action execution.

**Fallback chain:**
1. Find conversation by `contact_id` (existing behavior -- keeps working for contacts WITH conversations)
2. If no conversation found, check `custom_fields.secondary_phone`
3. If secondary phone exists, find conversation by that phone
4. If still no conversation AND action is template: create conversation with primary phone (templates don't need 24h window)
5. If still no conversation AND action is text/media: throw error (24h window required, no conversation exists)

**Example:**
```typescript
async function resolveWhatsAppContext(
  contactId: string,
  workspaceId: string
): Promise<{
  conversation: { id: string; phone: string; last_customer_message_at: string | null }
  apiKey: string
}> {
  const supabase = createAdminClient()

  // Get contact phone + custom_fields
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, custom_fields')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!contact?.phone) throw new Error('Contact phone not found')

  // 1. Try finding conversation by contact_id (primary path)
  const { data: existingConversation } = await supabase
    .from('conversations')
    .select('id, phone, last_customer_message_at')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  if (existingConversation) {
    return { conversation: existingConversation, apiKey: await getApiKey(supabase, workspaceId) }
  }

  // 2. Try secondary phone (from Shopify note_attributes / Releasit)
  const customFields = (contact.custom_fields as Record<string, unknown>) || {}
  const secondaryPhone = customFields.secondary_phone as string | undefined

  if (secondaryPhone) {
    const { data: secondaryConversation } = await supabase
      .from('conversations')
      .select('id, phone, last_customer_message_at')
      .eq('phone', secondaryPhone)
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .single()

    if (secondaryConversation) {
      // Link contact to this conversation if not linked
      if (!secondaryConversation.contact_id) {
        // ... link contact
      }
      return { conversation: secondaryConversation, apiKey: await getApiKey(supabase, workspaceId) }
    }
  }

  // 3. No conversation found at all -- create one (for templates)
  // Existing behavior: create conversation with primary phone
  const { data: newConv, error: convError } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      phone: contact.phone,
      status: 'open',
      last_message_at: new Date().toISOString(),
      last_message_preview: '[Template]',
    })
    .select('id, phone, last_customer_message_at')
    .single()

  if (convError || !newConv) {
    throw new Error(`Failed to create conversation: ${convError?.message}`)
  }

  return { conversation: newConv, apiKey: await getApiKey(supabase, workspaceId) }
}
```

### Pattern 3: Type Extension for note_attributes

**What:** Add `note_attributes` to `ShopifyOrderWebhook` type.

**Example:**
```typescript
// In src/lib/shopify/types.ts
export interface ShopifyOrderWebhook {
  // ... existing fields ...

  /** Order note from customer */
  note: string | null

  /** Additional attributes from cart/checkout (key-value pairs) */
  note_attributes: Array<{ name: string; value: string }> | null
}
```

### Anti-Patterns to Avoid
- **DO NOT add a `secondary_phone` column to the contacts table:** This is plugin-specific metadata, not a universal CRM field. Using `custom_fields` JSONB keeps the schema clean.
- **DO NOT query Shopify API at action execution time:** The note_attributes data must be extracted and stored at webhook ingestion. The action executor should never know about Shopify.
- **DO NOT try ALL note_attributes as phone numbers:** Only match against a known list of phone-related attribute names. Blindly normalizing every attribute wastes time and could produce false positives.
- **DO NOT break existing behavior for contacts without secondary phones:** The fallback chain must be additive. If no secondary phone exists, the existing flow (create conversation with primary phone for templates, error for text/media) must remain unchanged.
- **DO NOT search conversations by phone without workspace_id:** Always scope conversation lookups by workspace_id to maintain data isolation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone normalization | Custom regex | `normalizeShopifyPhone()` from `phone-normalizer.ts` | Handles international formats, CO fallback, edge cases |
| Contact custom field updates | Direct DB update | `domainUpdateCustomFieldValues()` from `domain/custom-fields.ts` | Handles JSONB merge, emits field.changed trigger |
| Conversation creation | Manual insert | Existing pattern in `resolveWhatsAppContext` | Already handles race conditions, required fields |
| Phone format validation | Regex check | `parsePhoneNumber` from `libphonenumber-js` (via normalizeShopifyPhone) | Proper E.164 validation |

**Key insight:** Every component needed for this feature already exists in the codebase. The only new code is the extraction function and the fallback logic. Everything else is wiring existing pieces together.

## Common Pitfalls

### Pitfall 1: Breaking Existing Conversations

**What goes wrong:** Adding phone fallback logic breaks the path for contacts that already have conversations via their primary phone.
**Why it happens:** The current `resolveWhatsAppContext` finds conversations by `contact_id`, not by phone. Changing to phone-based lookup could find wrong conversations.
**How to avoid:** Keep `contact_id`-based lookup as the PRIMARY path (step 1). Only fall back to phone-based lookup for secondary phone (step 2). The existing flow where conversation exists by contact_id must be untouched.
**Warning signs:** Existing automation tests start failing; messages go to wrong conversations.

### Pitfall 2: Duplicate Conversations for Same Contact

**What goes wrong:** A contact has conversations for both their primary and secondary phone, creating confusion in the inbox.
**Why it happens:** The secondary phone conversation was created by an incoming WhatsApp message from a different number. Now both conversations exist but only one is linked to the contact.
**How to avoid:** When finding a conversation via secondary phone, link the contact to that conversation (if not already linked). Log a warning so operators know a secondary phone was used. Do NOT create a new conversation for the secondary phone -- only find existing ones.
**Warning signs:** Same contact appears to have multiple conversations in the inbox.

### Pitfall 3: Stale Secondary Phone Data

**What goes wrong:** A contact's secondary phone was extracted from an old Shopify order. The customer has since changed their WhatsApp number.
**Why it happens:** `custom_fields.secondary_phone` was set once and never updated.
**How to avoid:** On every Shopify webhook for the same contact, re-extract and update the secondary phone. The `domainUpdateCustomFieldValues` function handles JSONB merge correctly. If the new order has no note_attributes phone, do NOT clear the existing secondary_phone (it might still be valid).
**Warning signs:** WhatsApp messages go to old phone numbers that no longer respond.

### Pitfall 4: Contacts Without Shopify Data

**What goes wrong:** Manually-created contacts (no Shopify order) have no `secondary_phone` in custom_fields. Code crashes or behaves unexpectedly.
**Why it happens:** The extraction only runs for Shopify webhooks. Manual contacts never go through that path.
**How to avoid:** The fallback chain must gracefully handle `null`/`undefined` secondary_phone. If `custom_fields.secondary_phone` doesn't exist, skip step 2 entirely and proceed to step 3 (existing behavior).
**Warning signs:** WhatsApp actions fail for manually-created contacts.

### Pitfall 5: Phone Normalization Mismatch

**What goes wrong:** Secondary phone from Shopify is stored as "+573001234567" but the conversation has phone "573001234567" (without +) or vice versa.
**Why it happens:** Different normalization paths. Shopify uses `normalizeShopifyPhone`, WhatsApp webhook uses `normalizePhone` from `utils/phone.ts`.
**How to avoid:** Both normalizers output E.164 format (with + prefix). Verify that `normalizeShopifyPhone` and `normalizePhone` produce identical output for the same input. The conversation lookup uses `eq('phone', secondaryPhone)` so formats MUST match exactly.
**Warning signs:** Secondary phone exists in custom_fields but conversation lookup finds nothing despite conversation existing.

### Pitfall 6: note_attributes Attribute Name Variability

**What goes wrong:** Releasit (or other COD apps) uses attribute names that don't match our hardcoded list.
**Why it happens:** Releasit allows custom field labels. A store might use "Telefono de contacto" instead of "Telefono". Different apps use different naming conventions.
**How to avoid:** Use broad case-insensitive matching with substring checks. Also log unmatched note_attributes at DEBUG level so we can discover new patterns. Consider making the attribute name configurable in the Shopify integration settings (`ShopifyConfig.phone_attribute_names`).
**Warning signs:** Shopify orders come in with note_attributes containing phone data, but secondary_phone is never extracted.

## Code Examples

### Example 1: Shopify note_attributes JSON Structure (from Shopify REST API)

```json
{
  "id": 450789469,
  "name": "#1001",
  "note": "Customer note",
  "note_attributes": [
    { "name": "Phone", "value": "3001234567" },
    { "name": "City", "value": "Bogota" },
    { "name": "Delivery Notes", "value": "Leave at door" }
  ],
  "phone": "+573101234567",
  "customer": { "phone": "+573101234567" },
  "shipping_address": { "phone": "+573101234567" }
}
```

**Confidence:** HIGH for the `Array<{ name: string; value: string }>` format. This is confirmed by [Shopify REST API Order docs](https://shopify.dev/docs/api/admin-rest/latest/resources/order) and multiple third-party sources.

**Confidence:** LOW for Releasit-specific attribute names ("Phone", "Telefono", "Celular"). Could not access Releasit's internal documentation. The attribute names depend on store configuration and locale. RECOMMENDATION: Inspect actual webhook payloads from production (check `webhook_events` table) to discover the real attribute names used by the specific Releasit installation.

### Example 2: Type Extension

```typescript
// src/lib/shopify/types.ts - ADD to ShopifyOrderWebhook interface
export interface ShopifyOrderWebhook {
  // ... existing fields ...

  /** Additional attributes from cart/checkout */
  note_attributes: Array<{ name: string; value: string }> | null
}

// Also add to ShopifyDraftOrderWebhook
export interface ShopifyDraftOrderWebhook {
  // ... existing fields ...

  /** Additional attributes from draft order */
  note_attributes: Array<{ name: string; value: string }> | null
}
```

### Example 3: Extraction Function

```typescript
// src/lib/shopify/phone-normalizer.ts - ADD new function

/**
 * Extract secondary phone from Shopify note_attributes.
 * COD form apps (Releasit, CodMonster, etc.) store customer phone
 * in note_attributes with various naming conventions.
 *
 * Returns the FIRST valid phone found, normalized to E.164.
 * Returns null if no phone-like attribute exists or all are invalid.
 */
export function extractSecondaryPhoneFromNoteAttributes(
  noteAttributes: Array<{ name: string; value: string }> | null | undefined,
  primaryPhone: string | null
): string | null {
  if (!noteAttributes || !Array.isArray(noteAttributes)) return null

  const phonePatterns = [
    'phone', 'telefono', 'celular', 'whatsapp',
    'secondary_phone', 'secondary phone',
    'phone_number', 'phone number',
    'numero', 'numero_telefono', 'numero telefono',
    'tel', 'movil', 'mobile',
  ]

  for (const attr of noteAttributes) {
    const name = (attr.name || '').toLowerCase().trim()
    // Check if attribute name matches any phone pattern
    const isPhoneAttribute = phonePatterns.some(pattern =>
      name === pattern || name.includes(pattern)
    )

    if (!isPhoneAttribute) continue

    const normalized = normalizeShopifyPhone(attr.value)
    if (!normalized) continue

    // Skip if same as primary phone (not a secondary)
    if (normalized === primaryPhone) continue

    return normalized
  }

  return null
}
```

### Example 4: Storing Secondary Phone on Contact

```typescript
// In webhook-handler.ts processShopifyWebhook, after resolveContact()
const primaryPhone = extractPhoneFromOrder(order)
const secondaryPhone = extractSecondaryPhoneFromNoteAttributes(
  order.note_attributes,
  primaryPhone
)

if (secondaryPhone && contactId) {
  const ctx: DomainContext = { workspaceId, source: 'webhook' }
  await domainUpdateCustomFieldValues(ctx, {
    contactId,
    fields: { secondary_phone: secondaryPhone },
  })
}
```

### Example 5: Modified resolveWhatsAppContext Fallback

```typescript
// In action-executor.ts - REPLACE resolveWhatsAppContext

async function resolveWhatsAppContext(
  contactId: string,
  workspaceId: string
): Promise<{
  conversation: { id: string; phone: string; last_customer_message_at: string | null }
  apiKey: string
}> {
  const supabase = createAdminClient()

  // Get contact phone + custom_fields for secondary phone
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, custom_fields')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!contact?.phone) throw new Error('Contact phone not found')

  // Step 1: Find existing conversation by contact_id (primary path)
  const { data: existingConversation } = await supabase
    .from('conversations')
    .select('id, phone, last_customer_message_at')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  if (existingConversation) {
    const apiKey = await resolveApiKey(supabase, workspaceId)
    return { conversation: existingConversation, apiKey }
  }

  // Step 2: Try secondary phone conversation lookup
  const customFields = (contact.custom_fields as Record<string, unknown>) || {}
  const secondaryPhone = customFields.secondary_phone as string | undefined

  if (secondaryPhone) {
    const { data: secondaryConv } = await supabase
      .from('conversations')
      .select('id, phone, last_customer_message_at')
      .eq('phone', secondaryPhone)
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .single()

    if (secondaryConv) {
      console.log(
        `[action-executor] Using secondary phone conversation for contact ${contactId}: ${secondaryPhone}`
      )
      const apiKey = await resolveApiKey(supabase, workspaceId)
      return { conversation: secondaryConv, apiKey }
    }
  }

  // Step 3: No conversation found -- create one with primary phone
  // (Templates can be sent without existing conversation; text/media
  //  will fail at the 24h window check in the caller)
  const { data: newConv, error: convError } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      phone: contact.phone,
      status: 'open',
      last_message_at: new Date().toISOString(),
      last_message_preview: '[Template]',
    })
    .select('id, phone, last_customer_message_at')
    .single()

  if (convError || !newConv) {
    throw new Error(`Failed to create conversation for contact: ${convError?.message || 'unknown error'}`)
  }

  const apiKey = await resolveApiKey(supabase, workspaceId)
  return { conversation: newConv, apiKey }
}

// Extract API key resolution into helper (DRY)
async function resolveApiKey(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): string {
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const settings = workspace?.settings as any
  const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) throw new Error('WhatsApp API key not configured')
  return apiKey
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single phone per contact | Contact has primary phone + `custom_fields.secondary_phone` | This phase | Enables phone resilience |
| `resolveWhatsAppContext` uses only `contact_id` lookup | Fallback chain: contact_id -> secondary phone -> create new | This phase | More messages delivered successfully |
| Shopify `note_attributes` ignored | Extracted at webhook time, stored on contact | This phase | Captures Releasit COD phone data |

**Not deprecated/outdated:**
- The Shopify REST API (including webhooks with `note_attributes`) is still functional despite REST being "legacy" as of Oct 2024. Shopify webhooks continue to deliver REST-format payloads.

## Data Model Analysis

### Current contacts table schema:
```sql
contacts (
  id UUID PK,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,           -- Primary phone, E.164
  email TEXT,
  address TEXT,
  city TEXT,
  department TEXT,
  custom_fields JSONB DEFAULT '{}',  -- GIN indexed
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(workspace_id, phone)
)
```

### Where secondary_phone lives:
```json
// contacts.custom_fields
{
  "secondary_phone": "+573001234567",
  // ... other custom fields
}
```

**Why custom_fields instead of a new column:**
1. **No migration needed** -- `custom_fields` JSONB already exists with GIN index
2. **Not universal** -- Only contacts from Shopify+Releasit have secondary phones
3. **Already indexed** -- GIN index on custom_fields supports JSONB queries
4. **Domain layer exists** -- `domainUpdateCustomFieldValues()` handles merge + triggers
5. **Consistent** -- Other workspace-specific metadata already lives in custom_fields

### conversations table (relevant fields):
```sql
conversations (
  phone TEXT NOT NULL,              -- E.164, used for secondary phone lookup
  contact_id UUID,                  -- Primary lookup path
  workspace_id UUID NOT NULL,
  UNIQUE(workspace_id, phone)       -- One conversation per phone per workspace
)
```

### Key constraint: `UNIQUE(workspace_id, phone)` on conversations
This means each phone number can only have ONE conversation per workspace. If a contact's secondary phone already has a conversation (from an incoming WhatsApp message), we find it. We never create a duplicate.

## Impact Analysis

### Files Modified (3 total):

1. **`src/lib/shopify/types.ts`** -- Add `note_attributes` field to `ShopifyOrderWebhook` and `ShopifyDraftOrderWebhook`
2. **`src/lib/shopify/webhook-handler.ts`** -- Extract secondary phone from note_attributes, store on contact
3. **`src/lib/automations/action-executor.ts`** -- Modify `resolveWhatsAppContext` fallback chain

### Optionally Modified (1 file):

4. **`src/lib/shopify/phone-normalizer.ts`** -- Add `extractSecondaryPhoneFromNoteAttributes()` function (keeps extraction logic with other phone normalization code)

### What Does NOT Change:
- `domain/contacts.ts` -- No changes to contact creation/update
- `domain/messages.ts` -- No changes to message sending
- `domain/conversations.ts` -- No changes to conversation management
- `whatsapp/webhook-handler.ts` -- No changes to incoming message handling
- `whatsapp/api.ts` -- No changes to 360dialog API calls
- Database schema -- No migrations needed

### What Could Break:
- **Nothing in existing flow** if implemented correctly. The fallback chain is purely additive:
  - Step 1 (find by contact_id) is identical to current behavior
  - Step 2 (secondary phone) only runs if Step 1 finds nothing
  - Step 3 (create conversation) is identical to current behavior
- Contacts without custom_fields.secondary_phone follow the exact same path as today

## Open Questions

1. **Exact Releasit attribute names**
   - What we know: Releasit COD form allows custom field labels. Common Spanish names include "Telefono", "Celular", "WhatsApp"
   - What's unclear: The EXACT attribute names used by the specific Releasit installation in the client's Shopify stores
   - Recommendation: Check `webhook_events` table in production for recent Shopify payloads. The `payload` JSONB column stores the full webhook. Query: `SELECT payload->'note_attributes' FROM webhook_events WHERE topic = 'orders/create' LIMIT 5`. If no data available, implement broad matching and add logging to discover patterns.

2. **Should secondary phone be configurable per workspace?**
   - What we know: The attribute names are hardcoded in the extraction function
   - What's unclear: Whether different workspaces use different COD apps with different attribute names
   - Recommendation: For v1, hardcode a broad list of patterns. If needed later, add a `phone_attribute_names: string[]` field to `ShopifyConfig` to make it configurable per integration.

3. **What about draft orders?**
   - What we know: `processShopifyDraftOrder()` currently does NOT create contacts (trigger-only mode)
   - What's unclear: Whether draft orders from Releasit also have note_attributes with phone data
   - Recommendation: Add `note_attributes` to `ShopifyDraftOrderWebhook` type for completeness, but skip secondary phone extraction for draft orders in v1 (no contact to update).

4. **Should we link contact to secondary phone conversation?**
   - What we know: When we find a conversation via secondary phone, that conversation may not be linked to the contact
   - What's unclear: Whether linking the contact might confuse the inbox (conversation phone != contact.phone)
   - Recommendation: Do NOT auto-link in v1. Just use the conversation for sending. Linking can be added later if needed. This avoids the edge case where a conversation is linked to the wrong contact.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- Full read of `action-executor.ts`, `webhook-handler.ts`, `phone-normalizer.ts`, `domain/contacts.ts`, `domain/messages.ts`, `domain/conversations.ts`, `domain/custom-fields.ts`, `types.ts`
- **Database migrations** -- `20260129000001_contacts_and_tags.sql`, `20260129000002_custom_fields_notes_activity.sql`, `20260130000002_whatsapp_conversations.sql`, `20260217000000_real_fields.sql`
- [Shopify Order REST API](https://shopify.dev/docs/api/admin-rest/latest/resources/order) -- `note_attributes` field is `Array<{ name: string; value: string }>`

### Secondary (MEDIUM confidence)
- [Highview Apps - Importing Note Attributes](https://www.highviewapps.com/kb/importing-note-attributes-and-line-item-properties/) -- Confirmed `note_attributes` JSON format as array of `{name, value}` objects
- [Shopify Community - note_attributes](https://community.shopify.com/t/what-does-the-note-attributes-field-mean-in-order-exports/227090) -- Confirmed note_attributes appears in order exports and webhook payloads

### Tertiary (LOW confidence)
- Releasit app documentation -- Could not access technical docs about specific attribute names. The [Releasit COD Form app](https://apps.shopify.com/releasit-cod-order-form) page confirms it collects phone data and does OTP verification, but does not document how data is stored in Shopify orders.
- Attribute name patterns -- Based on common COD app conventions in Latin America. Needs validation against actual webhook payloads.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries, all existing infrastructure
- Architecture (fallback chain): HIGH -- Clear surgical modification to one function
- Architecture (extraction): MEDIUM -- note_attributes format is confirmed, but Releasit-specific names are uncertain
- Pitfalls: HIGH -- Based on deep codebase analysis of data flow
- Releasit attribute names: LOW -- Could not verify, recommend inspecting production data

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable -- no fast-moving dependencies)
