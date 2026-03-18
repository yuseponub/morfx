---
phase: shopify-contact-resolution
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/automations/action-executor.ts
  - src/lib/automations/types.ts
autonomous: true

must_haves:
  truths:
    - "Exact phone match uses existing contact (no behavior change)"
    - "No phone match and no close phone creates new contact (no behavior change)"
    - "Close phone detected: creates new contact, creates review record, tags order, notifies host, blocks templates"
    - "Template/text/SMS actions are skipped when pendingContactReview flag is set"
    - "Skipped template data is stored in contact_review's pending_templates for later replay"
  artifacts:
    - path: "src/lib/automations/action-executor.ts"
      provides: "Modified resolveOrCreateContact with close-phone detection + template blocking"
      contains: "findClosePhone"
    - path: "src/lib/automations/types.ts"
      provides: "pendingContactReview and _reviewData fields on TriggerContext"
      contains: "pendingContactReview"
  key_links:
    - from: "src/lib/automations/action-executor.ts"
      to: "src/lib/shopify/phone-distance.ts"
      via: "import findClosePhone"
      pattern: "findClosePhone"
    - from: "src/lib/automations/action-executor.ts"
      to: "src/lib/domain/contact-reviews.ts"
      via: "import createContactReview, addPendingTemplate"
      pattern: "createContactReview"
---

<objective>
Modify the `resolveOrCreateContact` function to detect close phones, and wire up the post-order-creation review flow + template blocking.

Purpose: This is the core behavioral change — intercept the contact resolution flow to prevent wrong-contact template delivery.
Output: Modified action-executor.ts with close-phone detection, review creation after order, and template blocking.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-contact-resolution/01-SUMMARY.md
@src/lib/automations/action-executor.ts — Current resolveOrCreateContact (lines 1161-1217) and executeAction (lines 72-130), executeByType (lines 136-160), executeSendWhatsAppTemplate (lines 747-857)
@src/lib/automations/types.ts — TriggerContext type
@src/lib/shopify/phone-distance.ts — findClosePhone (created in Plan 01)
@src/lib/domain/contact-reviews.ts — createContactReview, addPendingTemplate (created in Plan 01)
@src/lib/domain/orders.ts — addOrderTag, updateOrder
@src/lib/domain/messages.ts — sendTemplateMessage for host notification
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend TriggerContext type</name>
  <files>
    src/lib/automations/types.ts
  </files>
  <action>
    Add three optional fields to the `TriggerContext` interface:

    ```typescript
    /** Set when close-phone match detected — blocks template/text/SMS actions */
    pendingContactReview?: boolean
    /** Token of the contact_review record (for storing skipped templates) */
    _reviewToken?: string
    /** Close-phone match data for post-order-creation processing */
    _reviewData?: {
      contactNewId: string
      contactExistingId: string
      existingPhone: string
      existingContactName: string
      shopifyPhone: string
    }
    ```

    These fields are prefixed with `_` (except pendingContactReview) to indicate they are internal transport fields, not user-facing trigger context.
  </action>
  <verify>`npx tsc --noEmit` passes</verify>
  <done>TriggerContext has pendingContactReview, _reviewToken, and _reviewData fields</done>
</task>

<task type="auto">
  <name>Task 2: Modify resolveOrCreateContact + executeAction + template blocking</name>
  <files>
    src/lib/automations/action-executor.ts
  </files>
  <action>
    Three changes to this file:

    **Change 1 — resolveOrCreateContact** (lines 1166-1217):

    Change return type from `Promise<string | null>` to `Promise<{ contactId: string; pendingReview: boolean; reviewData?: { contactNewId: string; contactExistingId: string; existingPhone: string; existingContactName: string; shopifyPhone: string } } | null>`.

    New logic flow:
    1. Exact phone match (existing): return `{ contactId: data.id, pendingReview: false }`
    2. Email match (existing): return `{ contactId: data.id, pendingReview: false }`
    3. **NEW** — If phone exists, BEFORE creating a new contact, search for close phone:
       - Query contacts: `supabase.from('contacts').select('id, name, phone').eq('workspace_id', workspaceId).not('phone', 'is', null).limit(2000)`
       - Call `findClosePhone(phone, contacts, name || '')` from `@/lib/shopify/phone-distance`
       - If match found:
         a. Create new contact with Shopify phone (existing domainCreateContact code)
         b. Return `{ contactId: newContactId, pendingReview: true, reviewData: { contactNewId: newContactId, contactExistingId: match.contactId, existingPhone: match.existingPhone, existingContactName: match.contactName, shopifyPhone: phone } }`
    4. No match: create new contact, return `{ contactId, pendingReview: false }`

    **Change 2 — executeAction** (lines 82-95 caller site):

    Update the resolveOrCreateContact call site:
    ```typescript
    if (!context.contactId && (context.contactPhone || context.contactEmail)) {
      const resolved = await resolveOrCreateContact(
        workspaceId,
        context.contactPhone,
        context.contactEmail,
        context.contactName,
        (context.shippingCity as string) || undefined,
      )
      if (resolved) {
        context = {
          ...context,
          contactId: resolved.contactId,
          pendingContactReview: resolved.pendingReview,
          _reviewData: resolved.reviewData,
        }
      }
    }
    ```

    Then, AFTER the `executeByType` call (after line 111), add post-action hook:
    ```typescript
    // Post-action: create contact review after order is created
    if (action.type === 'create_order' && context.pendingContactReview && context._reviewData) {
      const orderId = (result as { orderId?: string })?.orderId
      if (orderId) {
        const reviewResult = await handlePendingContactReview(
          workspaceId, orderId, context._reviewData, cascadeDepth
        )
        if (reviewResult?.token) {
          context = { ...context, _reviewToken: reviewResult.token }
        }
      }
    }
    ```

    **Change 3 — Template/text/SMS blocking in executeByType** (lines 136-160):

    Add early return for template, text, and SMS actions when `pendingContactReview` is true:

    For `send_whatsapp_template`:
    ```typescript
    case 'send_whatsapp_template':
      if (context.pendingContactReview) {
        // Store skipped template data for later replay
        if (context._reviewToken) {
          try {
            await addPendingTemplate(context._reviewToken, {
              templateName: String(params.templateName || ''),
              variables: (params.variables || {}) as Record<string, string>,
              language: String(params.language || 'es'),
              headerMediaUrl: params.headerMediaUrl ? String(params.headerMediaUrl) : undefined,
            })
          } catch (err) {
            console.error('[action-executor] Failed to store pending template:', err)
          }
        }
        console.log('[action-executor] Skipping template send — pending contact review')
        return { skipped: true, reason: 'pending_contact_review' }
      }
      return executeSendWhatsAppTemplate(params, context, workspaceId)
    ```

    For `send_whatsapp_text`: same pattern but no need to store (text messages aren't critical).
    For `send_sms`: same pattern.

    **New helper function — handlePendingContactReview:**

    ```typescript
    async function handlePendingContactReview(
      workspaceId: string,
      orderId: string,
      reviewData: NonNullable<TriggerContext['_reviewData']>,
      cascadeDepth: number,
    ): Promise<{ token: string } | null> {
      const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth }

      // 1. Create contact_review record (NOW we have the orderId)
      const reviewResult = await createContactReview(ctx, {
        contactNewId: reviewData.contactNewId,
        contactExistingId: reviewData.contactExistingId,
        orderId,
        shopifyPhone: reviewData.shopifyPhone,
        existingPhone: reviewData.existingPhone,
      })

      if (!reviewResult.success || !reviewResult.data) {
        console.error('[action-executor] Failed to create contact review:', reviewResult.error)
        return null
      }

      const { token } = reviewResult.data

      // 2. Tag order with REVISAR-CONTACTO
      await domainAddOrderTag(ctx, { orderId, tagName: 'REVISAR-CONTACTO' })

      // 3. Update order description with duplicate info
      await domainUpdateOrder(ctx, {
        orderId,
        description: `POSIBLE DUPLICADO: ${reviewData.existingContactName} tel: ${reviewData.existingPhone}. Tel Shopify: ${reviewData.shopifyPhone}`,
      })

      // 4. Send WhatsApp notification to host
      const hostPhone = '+573137549286'
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://morfx.app'

      try {
        const { conversation, apiKey } = await resolveWhatsAppContext(
          /* We need a contactId for the host. Find or use a known contact. */
          /* Since host might not be a contact, we need to handle this differently. */
          /* Use direct template send via the WhatsApp API instead of domain. */
        )
        // Actually: resolveWhatsAppContext requires a contactId. The host (+573137549286) may or may not be a contact.
        // Better approach: find conversation by phone, or send directly via 360dialog API.

        // Find workspace API key
        const supabase = createAdminClient()
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('whatsapp_api_key')
          .eq('id', workspaceId)
          .single()

        if (workspace?.whatsapp_api_key) {
          // Find or create conversation for the host phone
          let { data: hostConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('phone', hostPhone)
            .single()

          if (!hostConv) {
            // Find or create host contact first
            let { data: hostContact } = await supabase
              .from('contacts')
              .select('id')
              .eq('workspace_id', workspaceId)
              .eq('phone', hostPhone)
              .single()

            if (!hostContact) {
              // Host isn't a contact — send directly via 360dialog API without conversation
              const { sendTemplateMessage: send360Template } = await import('@/lib/whatsapp/api')
              await send360Template(workspace.whatsapp_api_key, hostPhone, 'informacion_general', 'es', [
                { type: 'body', parameters: [
                  { type: 'text', text: 'Admin' },
                  { type: 'text', text: `Posible duplicado detectado. Cliente: ${reviewData.existingContactName}, Tel Shopify: ${reviewData.shopifyPhone}, Tel existente: ${reviewData.existingPhone}. MERGE: ${baseUrl}/contact-review/${token}?action=merge -- IGNORAR: ${baseUrl}/contact-review/${token}?action=ignore` },
                ]}
              ])
              console.log('[action-executor] Sent contact review notification to host via direct API')
              return { token }
            }

            // Create conversation for existing host contact
            const { data: newConv } = await supabase
              .from('conversations')
              .insert({ workspace_id: workspaceId, contact_id: hostContact.id, phone: hostPhone })
              .select('id')
              .single()
            hostConv = newConv
          }

          if (hostConv) {
            const domCtx: DomainContext = { workspaceId, source: 'automation' }
            await domainSendTemplateMessage(domCtx, {
              conversationId: hostConv.id,
              contactPhone: hostPhone,
              templateName: 'informacion_general',
              templateLanguage: 'es',
              components: [{
                type: 'body',
                parameters: [
                  { type: 'text', text: 'Admin' },
                  { type: 'text', text: `Posible duplicado detectado. Cliente: ${reviewData.existingContactName}, Tel Shopify: ${reviewData.shopifyPhone}, Tel existente: ${reviewData.existingPhone}. MERGE: ${baseUrl}/contact-review/${token}?action=merge -- IGNORAR: ${baseUrl}/contact-review/${token}?action=ignore` },
                ],
              }],
              renderedText: `Posible duplicado: ${reviewData.existingContactName}`,
              apiKey: workspace.whatsapp_api_key,
            })
            console.log('[action-executor] Sent contact review notification to host')
          }
        }
      } catch (err) {
        // Non-fatal: review is created, just notification failed
        console.error('[action-executor] Failed to send host notification:', err)
      }

      return { token }
    }
    ```

    **Import additions** at the top of action-executor.ts:
    - `import { findClosePhone } from '@/lib/shopify/phone-distance'`
    - `import { createContactReview, addPendingTemplate } from '@/lib/domain/contact-reviews'`

    **CRITICAL NOTE about context mutation**: The `context` variable in `executeAction` is reassigned with spread (`context = { ...context, ... }`). This is important because `executeAction` is called once PER action by the automation-runner. Each action gets its own `executeAction` call with the SAME original triggerContext. So `pendingContactReview` set during one action's executeAction call does NOT automatically carry to the next action.

    Looking at automation-runner.ts line 290: `executeAction(action, triggerContext, ...)` — the `triggerContext` is built once and reused for all actions. So if we mutate it in executeAction, it WILL persist across actions since it's the same object reference. BUT line 93 does `context = { ...context, contactId: resolved }` which creates a new local variable, not mutating the original.

    **Solution**: We need to mutate the ORIGINAL triggerContext object (not create a copy) for the pendingContactReview flag to persist across action calls. Modify the mutation to use `Object.assign(context, { pendingContactReview: true, _reviewToken: ... })` instead of spread assignment. OR, better: check in automation-runner.ts — the triggerContext is passed by reference. We need to mutate it directly:

    ```typescript
    // Instead of: context = { ...context, contactId: resolved.contactId, pendingContactReview: resolved.pendingReview }
    // Do:
    if (resolved) {
      context.contactId = resolved.contactId
      if (resolved.pendingReview) {
        context.pendingContactReview = true
        context._reviewData = resolved.reviewData
      }
    }
    ```

    Wait, but `context` is already a parameter copy. Let me re-read the automation-runner flow:

    automation-runner.ts line 290: `executeAction(action, triggerContext, ...)` — triggerContext is the same JS object passed to all actions.

    executeAction line 74: `context: TriggerContext` — this is passed by value (reference). Line 93: `context = { ...context, contactId: resolved }` — this reassigns the LOCAL variable, not the original object. So the original triggerContext is NOT mutated.

    This means: `pendingContactReview` set during the `create_order` action won't be visible during the `send_whatsapp_template` action.

    **Fix**: Instead of reassigning `context`, mutate the original object:
    ```typescript
    if (resolved) {
      context.contactId = resolved.contactId
      if (resolved.pendingReview) {
        context.pendingContactReview = true
        context._reviewData = resolved.reviewData
      }
    }
    ```

    And for the review token (after handlePendingContactReview):
    ```typescript
    if (reviewResult?.token) {
      context._reviewToken = reviewResult.token
    }
    ```

    This way, the mutations to `context` persist across action calls since it's the same object reference.

    Also change line 93 from `context = { ...context, contactId: resolved }` to `context.contactId = resolved.contactId` for consistency. But be careful — the existing line 93 was `context = { ...context, contactId: resolved }` where `resolved` was a string. Now it needs to be `context.contactId = resolved.contactId`.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - resolveOrCreateContact returns enriched result with pendingReview flag
    - Template/text/SMS actions check for pendingContactReview and skip (storing template data)
    - Post-create_order hook creates review, tags order, updates description, sends host notification
    - Context mutations use direct property assignment (not spread) to persist across action calls
  </verify>
  <done>
    - Exact phone match: unchanged behavior
    - No match: unchanged behavior (creates new contact, templates send normally)
    - Close phone match: new contact created, review created after order, order tagged REVISAR-CONTACTO, host notified via WhatsApp, templates BLOCKED and stored
    - pendingContactReview flag persists across action calls via direct object mutation
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- Test mentally: Shopify webhook with phone +573001234567, existing contact has +573001234568 (1 digit diff) and similar name -> should create review, block templates, store pending templates
- Test mentally: Shopify webhook with phone +573001234567, exact match exists -> should use existing contact, no review, templates send normally
- Test mentally: Shopify webhook with phone +573009999999, no close match -> should create new contact, no review, templates send normally
</verification>

<success_criteria>
- resolveOrCreateContact detects close phones using findClosePhone
- Template actions are skipped when pendingContactReview is true, and template data is stored for replay
- After create_order action, review record is created, order is tagged, host is notified
- All existing automation behavior unchanged for exact match and no-match cases
- Context mutations persist across action calls (object mutation, not spread reassignment)
</success_criteria>

<output>
After completion, create `.planning/standalone/shopify-contact-resolution/02-SUMMARY.md`
</output>
