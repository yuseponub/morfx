---
phase: bold-payment-link
plan: 02
subsystem: payments
tags: [bold, payment-link, railway, playwright, integrations]
dependency-graph:
  requires: ["bold-01"]
  provides: ["bold-config-ui", "bold-payment-link-action", "bold-chat-button"]
  affects: []
tech-stack:
  added: []
  patterns: ["server-action-with-shared-auth-helpers", "robot-http-client-with-timeout", "self-hiding-button-component"]
key-files:
  created:
    - src/lib/bold/types.ts
    - src/lib/bold/client.ts
    - src/app/actions/bold.ts
    - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
    - src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx
  modified:
    - .env.example
    - src/app/actions/integrations.ts
    - src/app/(dashboard)/configuracion/integraciones/page.tsx
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
decisions:
  - id: bold-02-01
    decision: "Reuse getIntegrationAuthContext + canManageIntegrations via export instead of duplicating"
    rationale: "Single source of truth for integration auth pattern"
  - id: bold-02-02
    decision: "BoldPaymentLinkButton self-hides via getBoldIntegration() check on mount"
    rationale: "Zero visual regression for workspaces without BOLD configured"
  - id: bold-02-03
    decision: "60s timeout on robot fetch with AbortController"
    rationale: "Robot takes ~30s typical, 60s covers slow scenarios without hanging indefinitely"
metrics:
  duration: ~15min
  completed: 2026-04-10
---

# Standalone bold-payment-link Plan 02: Integration UI + Chat Button Summary

**One-liner:** BOLD credentials config UI in integraciones page + "Cobrar con BOLD" button+modal in WhatsApp chat header calling Railway Playwright robot

## What Was Done

### Task 1+2: Env var + Types + HTTP client
- Added `BOLD_ROBOT_URL` to `.env.example`
- Created `src/lib/bold/types.ts` with `BoldConfig`, `CreatePaymentLinkInput`, `CreatePaymentLinkResponse`, `BoldRobotError`
- Created `src/lib/bold/client.ts` with `callBoldRobot()` — fetch POST to `/api/create-link` with 60s AbortController timeout

### Task 3: Export auth helpers
- Exported `getIntegrationAuthContext()` and `canManageIntegrations()` from `integrations.ts` — previously private, now reusable by `bold.ts`

### Task 4: Server actions
- `saveBoldIntegration(username, password)` — upsert to `integrations` table with `type='bold'`
- `getBoldIntegration()` — reads config, masks password (`****XXXX`)
- `createPaymentLinkAction(amount, description)` — loads credentials from DB, calls `callBoldRobot`, returns URL

### Task 5: Config UI
- `BoldForm` component following exact `twilio-form.tsx` pattern: useForm, load existing, save, masked password, eye toggle, badge status
- Added BOLD tab to integraciones page (Shopify | Twilio | BOLD)

### Task 6: Chat header button + modal
- `BoldPaymentLinkButton` — self-hides if BOLD not configured (checks on mount)
- Modal with amount (COP) + description inputs
- Loading state with "~30 segundos" message
- Success state shows URL with copy button + external link
- Error state shows robot error message legibly
- Inserted in `chat-header.tsx` between agent toggles and GoDentist button

## Commits

| Hash | Message |
|------|---------|
| be257ec | feat(bold): tipos + cliente HTTP para robot Playwright en Railway |
| b3994de | refactor(integrations): exportar helpers de auth para reuso |
| e646486 | feat(bold): server actions saveBoldIntegration, getBoldIntegration, createPaymentLinkAction |
| c583cfd | feat(bold): UI de configuracion en /configuracion/integraciones |
| 4fa8d62 | feat(bold): boton + modal Cobrar con BOLD en header de conversacion WhatsApp |

## Verification

- `tsc --noEmit` clean (only pre-existing vitest test errors, zero in new/modified files)
- All server actions use `createAdminClient()` + `workspace_id` filter (Regla 3 compliant)
- Auth gated via `getIntegrationAuthContext` + `canManageIntegrations` (Owner/Admin only for config)
- BoldPaymentLinkButton self-hides — zero regression for non-BOLD workspaces

## Deviations from Plan

None — plan executed exactly as written.
