---
phase: shopify-contact-resolution
plan: 03
subsystem: contact-management
tags: [api, next.js, whatsapp, 360dialog, templates, contact-review]
dependency-graph:
  requires: ["shopify-contact-resolution-01", "shopify-contact-resolution-02"]
  provides: ["contact-review-resolution-endpoint", "contact-review-confirmation-page", "pending-template-replay"]
  affects: []
tech-stack:
  added: []
  patterns: ["token-based-auth", "auto-fire-on-mount", "suspense-boundary"]
key-files:
  created:
    - src/app/api/contact-review/[token]/route.ts
    - src/app/contact-review/[token]/page.tsx
  modified:
    - src/lib/domain/contact-reviews.ts
decisions:
  - id: "scr03-01"
    decision: "Token-based auth (no session required)"
    reason: "Host clicks link from WhatsApp — requiring login would break the flow"
  - id: "scr03-02"
    decision: "Auto-fire POST on page mount instead of requiring button click"
    reason: "Single-click resolution from WhatsApp link — action param in URL determines behavior"
  - id: "scr03-03"
    decision: "Suspense boundary wrapping useSearchParams"
    reason: "Next.js 15 requires Suspense when using useSearchParams in client components"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-18"
---

# Shopify Contact Resolution Plan 03: Resolution API + Confirmation Page Summary

**One-liner:** POST endpoint resolves merge/ignore reviews with pending template replay via 360dialog, standalone confirmation page with auto-fire on mount.

## What Was Built

### sendPendingTemplate Helper (domain/contact-reviews.ts)
- Reads workspace API key and contact phone fresh from DB
- Builds 360dialog template components from stored PendingTemplate variables
- Supports body parameters and header media (images)
- Uses dynamic import of `@/lib/whatsapp/api` sendTemplateMessage
- Phone is read after resolution, so merge updates are reflected

### POST /api/contact-review/[token] (API Route)
- Validates action is 'merge' or 'ignore' (400 otherwise)
- Checks review exists (404) and is still pending (409 if already resolved)
- Calls resolveContactReview from domain layer
- Replays all pending templates via sendPendingTemplate with error isolation per template
- Returns success with action, contactId, and templatesSent array

### /contact-review/[token]?action=merge|ignore (Confirmation Page)
- Client component with auto-fire POST on mount
- Four states: loading (spinner), success (green check), already_resolved (yellow warning), error (red X)
- Shows template send results on success
- Suspense boundary for Next.js 15 SSR compatibility
- Standalone page (no auth, no navigation, no layout dependency)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 8e5617f | feat(shopify-contact-resolution-03): sendPendingTemplate helper + API endpoint |
| 2 | dc99510 | feat(shopify-contact-resolution-03): confirmation page for contact review |

## Verification

- [x] `npx tsc --noEmit` passes (no new errors)
- [x] POST endpoint validates action parameter (400 for invalid)
- [x] Handles not-found (404) and already-resolved (409) cases
- [x] sendPendingTemplate exported from contact-reviews.ts
- [x] Templates sent to correct phone based on fresh DB read
- [x] Page renders with Suspense boundary for SSR safety

## Next Phase Readiness

The Shopify Contact Resolution standalone phase is now complete (3/3 plans):
- Plan 01: DB schema + domain CRUD + phone proximity detection
- Plan 02: Close-phone detection in resolveOrCreateContact + template blocking + host notification
- Plan 03: Resolution API + confirmation page + template replay

The full flow is: Shopify order arrives -> phone proximity detected -> review created + templates blocked -> host notified via WhatsApp -> host clicks link -> review resolved + templates replayed.
