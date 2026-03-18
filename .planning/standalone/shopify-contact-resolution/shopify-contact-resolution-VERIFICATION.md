---
phase: shopify-contact-resolution
verified: 2026-03-18T02:08:28Z
status: passed
score: 15/15 must-haves verified
---

# Phase: shopify-contact-resolution Verification Report

**Phase Goal:** Reemplazar el fuzzy matching actual (que vincula contactos por nombre sin validar teléfono) con una lógica inteligente que: 1) Siempre use el teléfono de Shopify como fuente de verdad, 2) Detecte teléfonos "cercanos" (posible error de digitación) y pida aprobación al host, 3) Nunca vincule a un contacto con teléfono completamente diferente solo por nombre similar.
**Verified:** 2026-03-18T02:08:28Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | contact_reviews table exists with token, contact IDs, order ID, phones, status, and pending_templates columns | VERIFIED | `supabase/migrations/20260318000000_contact_reviews.sql` — all columns present, ON DELETE SET NULL on contact_new_id, CHECK constraint on status |
| 2 | Levenshtein distance function correctly detects phones 1-2 digits apart | VERIFIED | `src/lib/shopify/phone-distance.ts:33-61` — full DP implementation; `findClosePhone` filters `dist >= 1 && dist <= 2` (line 113), skips dist=0 (exact match) |
| 3 | Domain functions create, resolve (merge/ignore), and query contact reviews | VERIFIED | `src/lib/domain/contact-reviews.ts` exports: `createContactReview`, `getContactReviewByToken`, `resolveContactReview`, `addPendingTemplate`, `sendPendingTemplate` (all 5 functions present, 491 lines) |
| 4 | Exact phone match uses existing contact (no behavior change) | VERIFIED | `action-executor.ts:1323` — exact phone match returns `{ contactId: data.id, pendingReview: false }` immediately |
| 5 | No phone match and no close phone creates new contact (no behavior change) | VERIFIED | `action-executor.ts:1385-1397` — falls through to `domainCreateContact` with `pendingReview: false` when `findClosePhone` returns null |
| 6 | Close phone detected: creates new contact, creates review record, tags order, notifies host, blocks templates | VERIFIED | `action-executor.ts:1353-1382` — `findClosePhone` called, new contact created, `pendingReview: true` returned; post-`create_order` hook at line 121 calls `handlePendingContactReview` which tags + notifies |
| 7 | Template/text/SMS actions are skipped when pendingContactReview flag is set | VERIFIED | `action-executor.ts:177-213` — `send_whatsapp_template`, `send_whatsapp_text`, `send_sms`, `send_sms_onurix` all check `context.pendingContactReview` and return `{ skipped: true }` |
| 8 | Skipped template data is stored in contact_review's pending_templates for later replay | VERIFIED | `action-executor.ts:178-191` — when `context._reviewToken` is set, calls `addPendingTemplate` with full template data before skipping; safety net console.warn if token missing |
| 9 | Host receives WhatsApp at +573137549286 with MERGE/IGNORE links when close phone is detected | VERIFIED | `action-executor.ts:1258,1273-1278` — `hostPhone = '+573137549286'`, sends `informacion_general` template with MERGE/IGNORE URLs embedded in body parameter |
| 10 | Host can click MERGE link and existing contact gets updated phone + order reassigned + templates sent | VERIFIED | `contact-reviews.ts:249-321` — merge path: status updated first, then `updateContact` (phone), `updateOrder` (contact_id), `deleteContact` (temp contact), `removeOrderTag`; API route replays templates |
| 11 | Host can click IGNORE link and new contact is kept + templates sent to Shopify phone | VERIFIED | `contact-reviews.ts:322-354` — ignore path: status updated, `removeOrderTag`, returns `contactId: review.contact_new_id`; API route replays templates to that contact |
| 12 | After resolution, REVISAR-CONTACTO tag is removed from the order | VERIFIED | Both merge (line 308) and ignore (line 341) paths call `removeOrderTag(ctx, { orderId, tagName: 'REVISAR-CONTACTO' })` |
| 13 | Pending templates stored by Plan 02 are replayed to the correct phone after resolution | VERIFIED | `route.ts:67-78` — iterates `review.pendingTemplates`, calls `sendPendingTemplate(review.workspaceId, result.data.contactId, tmpl)` — contactId is correct for both merge (existing) and ignore (new) |
| 14 | Confirmation page shows clear result of the action taken | VERIFIED | `page.tsx:59-161` — renders loading spinner, green success card with template results list, yellow "ya procesada" card, red error card — all with distinct UI states |
| 15 | Double-clicking a resolved review shows 'already resolved' message | VERIFIED | `route.ts:50-55` — returns 409 `{ error: 'Already resolved', status }` when `review.status !== 'pending'`; page.tsx:42-44 handles this and shows "Esta revision ya fue procesada" |

**Score:** 15/15 truths verified

---

### Required Artifacts

| Artifact | Lines | Status | Details |
|----------|-------|--------|---------|
| `supabase/migrations/20260318000000_contact_reviews.sql` | 33 | VERIFIED | All columns, constraints, indexes present. ON DELETE SET NULL on contact_new_id. |
| `src/lib/shopify/phone-distance.ts` | 150 | VERIFIED | Exports `findClosePhone` with full Levenshtein DP + Fuse.js name matching. |
| `src/lib/domain/contact-reviews.ts` | 491 | VERIFIED | Exports `createContactReview`, `getContactReviewByToken`, `resolveContactReview`, `addPendingTemplate`, `sendPendingTemplate`. |
| `src/lib/automations/action-executor.ts` | — | VERIFIED | Contains `findClosePhone` import, `createContactReview` import, close-phone detection in `resolveOrCreateContact`, `handlePendingContactReview` helper, template blocking in `executeByType`. |
| `src/lib/automations/types.ts` | — | VERIFIED | `TriggerContext` extended with `pendingContactReview?`, `_reviewToken?`, `_reviewData?`. |
| `src/app/api/contact-review/[token]/route.ts` | 86 | VERIFIED | Exports `POST`. Validates action, checks status, resolves, replays templates. 404/409/400/500 handled. |
| `src/app/contact-review/[token]/page.tsx` | 180 | VERIFIED | Client component. On mount: validates action, POSTs to API, renders result state. Wrapped in Suspense. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `action-executor.ts` | `phone-distance.ts` | `import { findClosePhone }` | WIRED | Line 30: imported; called at line 1353 in resolveOrCreateContact |
| `action-executor.ts` | `contact-reviews.ts` | `import { createContactReview, addPendingTemplate }` | WIRED | Line 31: both imported; createContactReview called at line 1233, addPendingTemplate at line 180 |
| `action-executor.ts` (post-create_order) | `handlePendingContactReview` | direct function call | WIRED | Lines 121-130: fires after create_order when pendingContactReview=true |
| `route.ts` | `contact-reviews.ts` | `resolveContactReview(token, action)` | WIRED | Line 58: called with token and validated action |
| `route.ts` | `contact-reviews.ts` | `sendPendingTemplate` per template | WIRED | Lines 70-77: loops pending templates, calls sendPendingTemplate |
| `contact-reviews.ts (sendPendingTemplate)` | `whatsapp/api.ts` | dynamic import `sendTemplateMessage` | WIRED | Line 437: `await import('@/lib/whatsapp/api')` then `send360Template` called |
| `page.tsx` | `route.ts` | `fetch POST /api/contact-review/${token}` | WIRED | Lines 27-56: fetch call on mount with action in body, result handled |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `contact-reviews.ts:362-374` | Comment header for `addPendingTemplate` appears before `sendPendingTemplate` — cosmetic ordering issue | Info | No functional impact. `addPendingTemplate` is fully implemented at line 453 with correct export. |

No blockers or warnings found.

---

### Human Verification Required

The following cannot be verified programmatically:

#### 1. End-to-end close-phone flow

**Test:** Trigger a Shopify webhook with a phone that is 1 digit different from an existing contact's phone, and the customer name matches. Confirm an order is created with REVISAR-CONTACTO tag, a WhatsApp message arrives at +573137549286 with MERGE and IGNORE links.
**Expected:** New contact created, order tagged, host notified via WhatsApp within seconds of webhook processing.
**Why human:** Requires live Shopify webhook + WhatsApp account + actual contacts in DB.

#### 2. MERGE link resolves correctly

**Test:** Click the MERGE link from the host notification. Confirm the existing contact's phone is updated to the Shopify phone, the order is reassigned, and the blocked templates are sent.
**Expected:** Confirmation page shows green "Contactos Unidos" with templates listed. Existing contact phone updated in CRM.
**Why human:** Requires live DB state after close-phone detection + WhatsApp template delivery to confirm.

#### 3. IGNORE link resolves correctly

**Test:** Click the IGNORE link from the host notification. Confirm the new contact is kept with Shopify phone, blocked templates are sent, REVISAR-CONTACTO tag removed.
**Expected:** Confirmation page shows green "Contactos Separados" with templates listed. New contact visible in CRM.
**Why human:** Same as above.

---

### Gaps Summary

No gaps. All 15 must-haves are structurally verified:

- The database migration is complete and correct (ON DELETE SET NULL preserved for audit trail, pending_templates JSONB present).
- The phone distance utility implements Levenshtein correctly, filters dist 1-2, combines with Fuse.js name matching at threshold 0.3.
- The domain layer covers the full review lifecycle: create, query, merge resolution, ignore resolution, pending template storage, and template replay.
- The action executor correctly detects close phones before contact creation, flags context with `pendingContactReview`, blocks template/text/SMS actions, and fires the post-create_order hook to create the review + notify the host using direct property mutation (not spread) to persist context across action calls.
- The API endpoint and confirmation page are complete: 404 for missing review, 409 for already-resolved, template replay after resolution, clear UI for all states.

The only notable cosmetic issue is misplaced comment headers in `contact-reviews.ts` (lines 362-374), which has no functional impact.

TypeScript errors from `npx tsc --noEmit` are pre-existing failures in unrelated test files (`somnio/__tests__/`) about missing `vitest` module declarations — not introduced by this phase.

---

_Verified: 2026-03-18T02:08:28Z_
_Verifier: Claude (gsd-verifier)_
