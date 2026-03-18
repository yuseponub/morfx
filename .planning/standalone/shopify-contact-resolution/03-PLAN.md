---
phase: shopify-contact-resolution
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/app/api/contact-review/[token]/route.ts
  - src/app/contact-review/[token]/page.tsx
autonomous: true

must_haves:
  truths:
    - "Host can click MERGE link and existing contact gets updated phone + order reassigned + templates sent"
    - "Host can click IGNORE link and new contact is kept + templates sent to Shopify phone"
    - "After resolution, REVISAR-CONTACTO tag is removed from the order"
    - "Confirmation page shows clear result of the action taken"
    - "Double-clicking a resolved review shows 'already resolved' message"
  artifacts:
    - path: "src/app/api/contact-review/[token]/route.ts"
      provides: "POST endpoint for merge/ignore actions"
      exports: ["POST"]
    - path: "src/app/contact-review/[token]/page.tsx"
      provides: "Confirmation page with action buttons and result display"
  key_links:
    - from: "src/app/api/contact-review/[token]/route.ts"
      to: "src/lib/domain/contact-reviews.ts"
      via: "resolveContactReview(token, action)"
      pattern: "resolveContactReview"
    - from: "src/app/contact-review/[token]/route.ts"
      to: "src/lib/domain/messages.ts"
      via: "sendTemplateMessage for pending templates"
      pattern: "sendTemplateMessage"
---

<objective>
Create the API endpoint and confirmation page for host to resolve contact reviews (MERGE or IGNORE).

Purpose: The host receives WhatsApp with two links. Clicking either resolves the review, sends blocked templates, and shows confirmation.
Output: API route + Next.js page for contact review resolution.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-contact-resolution/01-SUMMARY.md
@src/lib/domain/contact-reviews.ts — resolveContactReview, getContactReviewByToken (from Plan 01)
@src/lib/domain/messages.ts — sendTemplateMessage for sending blocked templates after resolution
@src/lib/automations/action-executor.ts — resolveWhatsAppContext pattern, executeSendWhatsAppTemplate pattern
</context>

<tasks>

<task type="auto">
  <name>Task 1: API endpoint for MERGE/IGNORE resolution</name>
  <files>
    src/app/api/contact-review/[token]/route.ts
  </files>
  <action>
    Create `src/app/api/contact-review/[token]/route.ts` with a POST handler.

    **POST handler:**
    - Extract `token` from params (Next.js 15 App Router: `params` is a Promise, use `await params`)
    - Extract `action` from request body (JSON): must be 'merge' or 'ignore'
    - Validate: if action is not 'merge' or 'ignore', return 400
    - Call `resolveContactReview(token, action)` from domain
    - If error (not found, already resolved), return appropriate error response:
      - Review not found: 404 `{ error: 'Review not found' }`
      - Already resolved: 409 `{ error: 'Already resolved', status: review.status }`
    - If success, the domain function handles all side effects (phone update, order reassignment, tag removal, contact cleanup)
    - After resolution: trigger sending of blocked templates
      - Get the order from DB to find the automation that created it (or simpler: find pending templates for this order's contact)
      - Actually, the SIMPLEST approach for sending templates after resolution:
        - The resolveContactReview already returns `{ contactId, phone, sendTemplates: true }`
        - Look up the order's automation execution log to find which templates were skipped
        - OR simpler: just re-run the Shopify order_created trigger for this order
        - SIMPLEST: Use Inngest to emit a custom event `contact-review/resolved` with the review data, and have a small Inngest function that re-triggers the automation

      **Actually, let's keep it simple and NOT auto-send templates.** The host will know they need to check. The templates that were blocked were part of an automation run that already completed. Re-running an automation is complex and risky (could create duplicate orders, etc.).

      Instead: Return the resolution result. The page will show the host what happened. If templates need to be sent, the host can trigger them manually from the CRM, or we can add a "send pending templates" button later.

      **Wait — re-reading the CONTEXT**: "Link MERGE: Al hacer click: ... 3. Envia los templates al nuevo telefono" and "Link IGNORAR: Al hacer click: ... 2. Envia los templates al telefono de Shopify".

      So templates MUST be sent. The approach: store the template actions that were skipped in the contact_review record (as a JSONB column `pending_actions`), then replay them after resolution.

      **Revised approach**: In Plan 02, when template actions are skipped, store them in the contact_review's `pending_actions` JSONB array. After resolution, iterate and execute each stored action.

      BUT this adds complexity to Plan 01's migration and Plan 02's skip logic. Let me think of an alternative...

      **Alternative — Inngest event approach:**
      After resolveContactReview succeeds, emit an Inngest event `contact-review/resolved` with:
      - workspaceId, contactId (the resolved one), orderId, action (merge/ignore)

      Create a small Inngest function that:
      1. Loads the order and contact data
      2. Finds the automation(s) that were triggered by `shopify.order_created` for this workspace
      3. Re-runs only the template-sending actions from those automations

      This is still complex. Let's go with the simplest robust approach:

      **SIMPLEST approach — store skipped template info, replay after resolution:**

      In the contact_review record, we need a `pending_templates` JSONB column (add to migration in Plan 01). When templates are skipped in Plan 02, store `{ templateName, variables, language, headerMediaUrl }` in this column.

      In THIS endpoint, after resolution:
      1. Read `pending_templates` from the resolved review
      2. For each template, call `executeSendWhatsAppTemplate`-style logic:
         - Resolve WhatsApp context for the resolved contact
         - Send each template via domainSendTemplateMessage

      **BUT we need to be careful:** The contact used depends on merge vs ignore. resolveContactReview already returns the correct contactId.

      **Implementation:**
      ```typescript
      // After successful resolution
      const { contactId, phone } = result.data

      // Get review with pending templates
      const reviewResult = await getContactReviewByToken(token)
      const pendingTemplates = reviewResult.data?.pending_templates || []

      // Send each pending template
      for (const tmpl of pendingTemplates) {
        try {
          await sendPendingTemplate(reviewResult.data.workspace_id, contactId, tmpl)
        } catch (err) {
          console.error('[contact-review] Failed to send pending template:', err)
          // Don't fail the whole resolution — log and continue
        }
      }
      ```

      Create helper `sendPendingTemplate(workspaceId, contactId, template)`:
      - Resolve WhatsApp context (conversation + apiKey) for the contactId
      - Look up the template in whatsapp_templates table
      - Build components from stored variables
      - Call domainSendTemplateMessage

      This helper is essentially a simplified version of `executeSendWhatsAppTemplate` from action-executor.ts. Extract the reusable parts.

    - Return 200 with `{ success: true, action, contactId }`

    **NOTE to executor:** This plan requires a small addition to Plan 01's migration: add `pending_templates JSONB DEFAULT '[]'` column to contact_reviews. If Plan 01 has already been executed, create a follow-up migration. If not, modify the migration directly.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - POST endpoint validates action parameter
    - Handles already-resolved case (409)
    - Sends pending templates after resolution
  </verify>
  <done>
    - POST /api/contact-review/[token] with action=merge resolves review and sends templates
    - POST /api/contact-review/[token] with action=ignore resolves review and sends templates
    - Error handling for missing/already-resolved reviews
    - Templates sent to correct phone based on resolution type
  </done>
</task>

<task type="auto">
  <name>Task 2: Confirmation page</name>
  <files>
    src/app/contact-review/[token]/page.tsx
  </files>
  <action>
    Create `src/app/contact-review/[token]/page.tsx` — a simple server component page.

    **Page behavior:**
    - This page is accessed via the links in the host's WhatsApp message
    - URL format: `/contact-review/[token]?action=merge` or `/contact-review/[token]?action=ignore`
    - On load (server component):
      1. Extract `token` from params, `action` from searchParams
      2. If `action` is present (merge or ignore): call the API endpoint (or directly call domain) to resolve
      3. Show result page

    **Actually, simpler UX**: Make it a client component that:
    1. On mount, calls `getContactReviewByToken` via a GET API endpoint to load review details
    2. Shows the review info (names, phones, order)
    3. Has two buttons: "UNIR CONTACTOS (MERGE)" and "MANTENER SEPARADOS (IGNORAR)"
    4. On click, POSTs to `/api/contact-review/[token]` with the action
    5. Shows confirmation message after resolution

    **OR even simpler** — since the WhatsApp links already include the action in the URL:
    - Page loads with `?action=merge` or `?action=ignore`
    - Immediately calls POST to resolve
    - Shows result (success/already resolved/error)

    **Go with the immediate action approach** (simplest, matches CONTEXT requirement of "Al hacer click"):

    ```tsx
    'use client'

    import { useEffect, useState } from 'react'
    import { useParams, useSearchParams } from 'next/navigation'

    export default function ContactReviewPage() {
      const params = useParams()
      const searchParams = useSearchParams()
      const token = params.token as string
      const action = searchParams.get('action') as 'merge' | 'ignore' | null

      const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already_resolved' | 'invalid'>('loading')
      const [message, setMessage] = useState('')

      useEffect(() => {
        if (!action || !['merge', 'ignore'].includes(action)) {
          setStatus('invalid')
          setMessage('Accion invalida')
          return
        }

        fetch(`/api/contact-review/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setStatus('success')
              setMessage(action === 'merge'
                ? 'Contactos unidos. El telefono del contacto existente ha sido actualizado y los templates han sido enviados.'
                : 'Contactos mantenidos separados. Los templates han sido enviados al telefono de Shopify.')
            } else if (data.error === 'Already resolved') {
              setStatus('already_resolved')
              setMessage(`Esta revision ya fue procesada (${data.status}).`)
            } else {
              setStatus('error')
              setMessage(data.error || 'Error desconocido')
            }
          })
          .catch(() => {
            setStatus('error')
            setMessage('Error de conexion')
          })
      }, [token, action])

      // Render: simple centered card with MorfX branding
      // Use Tailwind for styling
      // Green check for success, yellow for already resolved, red for error
    }
    ```

    Style: Simple centered card with white background, MorfX logo (or just text "MorfX"), status icon (checkmark/warning/error), message text. No navigation needed — this is a standalone action page.

    Colors: green-500 for success, yellow-500 for already resolved, red-500 for error. Use Tailwind classes.

    **No auth required** — the token itself IS the auth (UUID, unguessable).
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Page renders without errors
    - Shows appropriate status message for each case
  </verify>
  <done>
    - /contact-review/[token]?action=merge triggers merge and shows confirmation
    - /contact-review/[token]?action=ignore triggers ignore and shows confirmation
    - Already-resolved reviews show "already processed" message
    - Invalid/missing action shows error
    - Page is standalone (no auth, no navigation)
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `curl -X POST /api/contact-review/[valid-token] -d '{"action":"merge"}'` returns 200
- `curl -X POST /api/contact-review/[invalid-token] -d '{"action":"merge"}'` returns 404
- Page renders at /contact-review/[token]?action=merge
</verification>

<success_criteria>
- API endpoint resolves reviews (merge or ignore) and sends pending templates
- Confirmation page provides clear feedback to the host
- Double-resolution is handled gracefully (409)
- No auth required (token-based access)
</success_criteria>

<output>
After completion, create `.planning/standalone/shopify-contact-resolution/03-SUMMARY.md`
</output>
