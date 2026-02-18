---
phase: standalone/whatsapp-phone-resilience
plan: 02
type: execute
wave: 2
depends_on: ["wp-resilience-01"]
files_modified:
  - src/lib/automations/action-executor.ts
autonomous: true

must_haves:
  truths:
    - "WhatsApp automation actions find conversations via secondary phone when primary phone has no conversation"
    - "Contacts with existing conversations via contact_id are unaffected (primary path unchanged)"
    - "Contacts without custom_fields.secondary_phone follow the exact same flow as before"
    - "Secondary phone conversation lookup is scoped by workspace_id"
    - "When no conversation exists for either phone, a new conversation is created with the primary phone (existing behavior)"
  artifacts:
    - path: "src/lib/automations/action-executor.ts"
      provides: "Phone fallback chain in resolveWhatsAppContext"
      contains: "secondary_phone"
  key_links:
    - from: "src/lib/automations/action-executor.ts"
      to: "contacts.custom_fields"
      via: "select custom_fields from contacts, read secondary_phone"
      pattern: "custom_fields.*secondary_phone"
    - from: "src/lib/automations/action-executor.ts"
      to: "conversations table"
      via: "phone-based conversation lookup for secondary phone"
      pattern: "eq.*phone.*secondaryPhone"
---

<objective>
Add phone fallback chain to `resolveWhatsAppContext()` in the action executor so that WhatsApp automation actions try a secondary phone conversation when the primary contact has no existing conversation.

Purpose: Complete the WhatsApp phone resilience feature by consuming the secondary_phone data stored by Plan 01 at action execution time.
Output: One file modified — `action-executor.ts` with fallback chain in `resolveWhatsAppContext`.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-phone-resilience/RESEARCH.md
@.planning/standalone/whatsapp-phone-resilience/wp-resilience-01-SUMMARY.md
@src/lib/automations/action-executor.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add phone fallback chain to resolveWhatsAppContext</name>
  <files>src/lib/automations/action-executor.ts</files>
  <action>
  Modify the `resolveWhatsAppContext` function (around line 530-596) to implement a 3-step fallback chain.

  **Step 1: Expand contact query to include custom_fields**

  Change the contact select from:
  ```typescript
  .select('phone')
  ```
  to:
  ```typescript
  .select('phone, custom_fields')
  ```

  **Step 2: Add secondary phone fallback between existing conversation lookup and conversation creation**

  The current flow is:
  1. Get contact phone
  2. Find conversation by contact_id
  3. If no conversation, create one

  Change to:
  1. Get contact phone + custom_fields
  2. Find conversation by contact_id (UNCHANGED - primary path)
  3. **NEW:** If no conversation found, check `custom_fields.secondary_phone`
  4. **NEW:** If secondary phone exists, find conversation by that phone (scoped by workspace_id)
  5. **NEW:** If secondary conversation found, log and return it
  6. If still no conversation, create one with primary phone (UNCHANGED - existing behavior)

  **Implementation detail for Step 3-5:**

  After the existing `if (existingConversation)` block returns, and BEFORE the `if (!conversation)` block that creates a new conversation, insert:

  ```typescript
  // Step 2: Try secondary phone from Shopify note_attributes (Releasit COD form)
  if (!conversation) {
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
        conversation = secondaryConv
      }
    }
  }
  ```

  **Important constraints:**
  - The `let conversation = existingConversation` pattern already exists in the current code. The secondary phone lookup assigns to the same `conversation` variable.
  - Do NOT auto-link the contact to the secondary conversation (per research recommendation for v1).
  - Do NOT create a new conversation with the secondary phone. If secondary phone has no conversation, fall through to step 6 which creates with primary phone.
  - The secondary phone lookup MUST include `.eq('workspace_id', workspaceId)` for data isolation.
  - The `.single()` call is safe because `conversations` has `UNIQUE(workspace_id, phone)`.
  - The `contact.custom_fields` type cast needs no new imports -- it's `Record<string, unknown>` which is inline.
  </action>
  <verify>
  Run `npx tsc --noEmit` to verify no type errors. Grep for `secondary_phone` in action-executor.ts to confirm fallback logic exists. Grep for `custom_fields` in the resolveWhatsAppContext function to confirm contact query was expanded.
  </verify>
  <done>
  - `resolveWhatsAppContext` queries contact with `phone, custom_fields`
  - Secondary phone fallback lookup runs only when primary conversation not found
  - Secondary phone conversation lookup is scoped by workspace_id
  - Contacts without secondary_phone skip the fallback and proceed to create conversation (unchanged)
  - Contacts with existing conversations via contact_id are completely unaffected
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify end-to-end type safety and build</name>
  <files></files>
  <action>
  Run full TypeScript compilation to verify all changes across both plans are type-safe and don't introduce regressions.

  1. Run `npx tsc --noEmit` from the project root
  2. If any errors related to the modified files, fix them
  3. Verify the dev server starts without errors: `npm run dev` (briefly, just check it compiles)

  Also verify that the three WhatsApp action callers (`executeSendWhatsAppTemplate`, `executeSendWhatsAppText`, `executeSendWhatsAppMedia`) still call `resolveWhatsAppContext` with the same signature `(contactId, workspaceId)` -- no signature change should be needed.
  </action>
  <verify>
  `npx tsc --noEmit` exits with code 0. No type errors in any file.
  </verify>
  <done>
  - Full project compiles without TypeScript errors
  - No signature changes to `resolveWhatsAppContext` (backward compatible)
  - All three WhatsApp action types use the same function without modification
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `resolveWhatsAppContext` has 3-step fallback: contact_id conversation -> secondary phone conversation -> create new
3. The fallback is purely additive -- contacts without secondary_phone follow the identical path as before
4. All three WhatsApp action types (`send_whatsapp_template`, `send_whatsapp_text`, `send_whatsapp_media`) work through the same updated `resolveWhatsAppContext`
5. No new imports beyond what's already in the file
</verification>

<success_criteria>
- WhatsApp automation actions successfully find conversations via secondary phone when primary contact has no conversation
- Existing contacts with conversations are completely unaffected
- Contacts without custom_fields.secondary_phone follow the exact same flow as today
- Full TypeScript compilation succeeds
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-phone-resilience/wp-resilience-02-SUMMARY.md`
</output>
