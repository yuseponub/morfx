---
phase: standalone/whatsapp-phone-resilience
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/shopify/types.ts
  - src/lib/shopify/phone-normalizer.ts
  - src/lib/shopify/webhook-handler.ts
autonomous: true

must_haves:
  truths:
    - "Shopify order webhooks with note_attributes containing phone data extract and store secondary_phone on the contact"
    - "Secondary phone is normalized to E.164 using existing normalizeShopifyPhone"
    - "Secondary phone is skipped if it matches the primary phone"
    - "Contacts without note_attributes or without phone-like attributes are unaffected"
    - "Secondary phone is stored in contacts.custom_fields.secondary_phone via domainUpdateCustomFieldValues"
  artifacts:
    - path: "src/lib/shopify/types.ts"
      provides: "note_attributes field on ShopifyOrderWebhook and ShopifyDraftOrderWebhook"
      contains: "note_attributes"
    - path: "src/lib/shopify/phone-normalizer.ts"
      provides: "extractSecondaryPhoneFromNoteAttributes function"
      exports: ["extractSecondaryPhoneFromNoteAttributes"]
    - path: "src/lib/shopify/webhook-handler.ts"
      provides: "Secondary phone extraction and storage at webhook ingestion time"
      contains: "extractSecondaryPhoneFromNoteAttributes"
  key_links:
    - from: "src/lib/shopify/webhook-handler.ts"
      to: "src/lib/shopify/phone-normalizer.ts"
      via: "import extractSecondaryPhoneFromNoteAttributes"
      pattern: "extractSecondaryPhoneFromNoteAttributes"
    - from: "src/lib/shopify/webhook-handler.ts"
      to: "src/lib/domain/custom-fields.ts"
      via: "domainUpdateCustomFieldValues to store secondary_phone"
      pattern: "domainUpdateCustomFieldValues.*secondary_phone"
---

<objective>
Add note_attributes type support, secondary phone extraction function, and webhook handler integration so that Shopify orders with COD form phone data (Releasit, etc.) store a secondary_phone on the contact at ingestion time.

Purpose: Enable the fallback chain in Plan 02 by making secondary phone data available on contacts before any WhatsApp automation fires.
Output: Three files modified — types extended, extraction function added, webhook handler wired.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-phone-resilience/RESEARCH.md
@src/lib/shopify/types.ts
@src/lib/shopify/phone-normalizer.ts
@src/lib/shopify/webhook-handler.ts
@src/lib/domain/custom-fields.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add note_attributes type + extraction function</name>
  <files>src/lib/shopify/types.ts, src/lib/shopify/phone-normalizer.ts</files>
  <action>
  **File 1: `src/lib/shopify/types.ts`**

  Add `note_attributes` field to BOTH `ShopifyOrderWebhook` and `ShopifyDraftOrderWebhook` interfaces. Place it after the existing `note` field in each interface.

  ```typescript
  /** Additional attributes from cart/checkout (e.g. Releasit COD form fields) */
  note_attributes: Array<{ name: string; value: string }> | null
  ```

  **File 2: `src/lib/shopify/phone-normalizer.ts`**

  Add a new exported function `extractSecondaryPhoneFromNoteAttributes` at the end of the file. This function:

  1. Takes `noteAttributes: Array<{ name: string; value: string }> | null | undefined` and `primaryPhone: string | null` as params
  2. Returns `string | null` (E.164 normalized phone or null)
  3. Defines a `phonePatterns` array of lowercase attribute name patterns:
     `['phone', 'telefono', 'celular', 'whatsapp', 'secondary_phone', 'secondary phone', 'phone_number', 'phone number', 'numero', 'numero_telefono', 'numero telefono', 'tel', 'movil', 'mobile']`
  4. Iterates `noteAttributes`, for each attribute:
     - Lowercases and trims `attr.name`
     - Checks if name matches any pattern (exact match OR `name.includes(pattern)`)
     - If match: normalizes `attr.value` using existing `normalizeShopifyPhone`
     - If normalized result equals `primaryPhone`, skip it (not a secondary)
     - If normalized and different from primary, return it
  5. Returns null if no valid secondary phone found

  Use the existing `normalizeShopifyPhone` from the same file (no new imports needed).
  </action>
  <verify>
  Run `npx tsc --noEmit` to verify no type errors. Grep for `extractSecondaryPhoneFromNoteAttributes` in phone-normalizer.ts to confirm export exists. Grep for `note_attributes` in types.ts to confirm both interfaces updated.
  </verify>
  <done>
  - `ShopifyOrderWebhook.note_attributes` field exists with type `Array<{ name: string; value: string }> | null`
  - `ShopifyDraftOrderWebhook.note_attributes` field exists with same type
  - `extractSecondaryPhoneFromNoteAttributes` exported from phone-normalizer.ts
  - Function handles null/undefined input, skips primary phone matches, normalizes via `normalizeShopifyPhone`
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire secondary phone extraction into webhook handler</name>
  <files>src/lib/shopify/webhook-handler.ts</files>
  <action>
  Modify `src/lib/shopify/webhook-handler.ts` to extract and store secondary phone after contact resolution.

  **Step 1: Add imports**

  Add `extractSecondaryPhoneFromNoteAttributes` to the existing import from `./phone-normalizer`:
  ```typescript
  import { extractPhoneFromOrder, extractSecondaryPhoneFromNoteAttributes } from './phone-normalizer'
  ```

  Add `updateCustomFieldValues as domainUpdateCustomFieldValues` import from `@/lib/domain/custom-fields`:
  ```typescript
  import { updateCustomFieldValues as domainUpdateCustomFieldValues } from '@/lib/domain/custom-fields'
  ```

  **Step 2: Add secondary phone extraction in `processShopifyWebhook` AUTO-SYNC block**

  After `resolveContact()` returns and BEFORE `mapShopifyOrder()` (around line 91), add:

  ```typescript
  // Extract secondary phone from note_attributes (Releasit COD form, etc.)
  if (contactId) {
    const primaryPhone = extractPhoneFromOrder(order)
    const secondaryPhone = extractSecondaryPhoneFromNoteAttributes(
      order.note_attributes,
      primaryPhone
    )
    if (secondaryPhone) {
      const cfCtx: DomainContext = { workspaceId, source: 'webhook' }
      await domainUpdateCustomFieldValues(cfCtx, {
        contactId,
        fields: { secondary_phone: secondaryPhone },
      })
      console.log(`[webhook-handler] Stored secondary phone ${secondaryPhone} for contact ${contactId}`)
    }
  }
  ```

  **Important constraints:**
  - Only run when `contactId` is available (contact was matched or created)
  - Only run in the AUTO-SYNC block (where contacts are resolved)
  - Do NOT add this to the TRIGGER-ONLY block (no contact is created there)
  - Do NOT add this to `processShopifyOrderUpdated` or `processShopifyDraftOrder` in v1
  - Use `domainUpdateCustomFieldValues` which handles JSONB merge correctly
  - The `DomainContext` import already exists in the file
  </action>
  <verify>
  Run `npx tsc --noEmit` to verify no type errors. Grep for `extractSecondaryPhoneFromNoteAttributes` in webhook-handler.ts to confirm it's called. Grep for `domainUpdateCustomFieldValues` in webhook-handler.ts to confirm custom field update is wired.
  </verify>
  <done>
  - `processShopifyWebhook` extracts secondary phone from `order.note_attributes` after contact resolution
  - Secondary phone stored via `domainUpdateCustomFieldValues` on the contact's `custom_fields.secondary_phone`
  - Only runs when contactId is available and secondaryPhone is found
  - Does not affect trigger-only mode, order updates, or draft orders
  - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `note_attributes` field exists on both `ShopifyOrderWebhook` and `ShopifyDraftOrderWebhook`
3. `extractSecondaryPhoneFromNoteAttributes` is exported from `phone-normalizer.ts`
4. `webhook-handler.ts` imports and calls the extraction function
5. `webhook-handler.ts` stores secondary phone via domain custom fields
6. Existing webhook processing flow is unmodified (additive changes only)
</verification>

<success_criteria>
- Shopify order webhooks with note_attributes containing phone data will extract and store secondary_phone on the matched/created contact
- Orders without note_attributes or without phone-like attributes follow the exact same path as before
- No new files created, no new dependencies added, no database migrations needed
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-phone-resilience/wp-resilience-01-SUMMARY.md`
</output>
