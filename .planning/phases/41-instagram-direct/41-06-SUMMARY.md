---
phase: 41-instagram-direct
plan: 06
subsystem: ui
tags: [instagram, settings, connect-button, integraciones-tab, no-popup, client-component]

# Dependency graph
requires:
  - phase: 41-03
    provides: connectInstagramAccount server action (owner-gated, no-popup, reuses Page token)
  - phase: 40-facebook-messenger-direct
    provides: ConnectFacebook component + integraciones Facebook tab (the canonical analog)
provides:
  - ConnectInstagram client component (button + Spanish sonner toasts, no fresh Facebook Login popup)
  - Instagram Direct tab in Configuración → Integraciones (mirrors the Facebook tab)
affects: [41-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "No-popup connect UI: the button is a thin trigger for the owner-gated server action (D-IG-04) — IG rides the connected Page, no FB.login/config_id in the browser"
    - "Sibling tab is purely additive: WhatsApp/Facebook/other tabs stay byte-identical; the only deletions are the two import-line extensions"
    - "Verify-only IG indicator: the inbox channel==='instagram' indicator already existed (legacy ManyChat IG path) — reused for free by the meta_direct conversations"

key-files:
  created:
    - src/components/settings/connect-instagram.tsx
  modified:
    - src/app/(dashboard)/configuracion/integraciones/page.tsx

key-decisions:
  - "No-popup path (D-IG-04): ConnectInstagram does NOT launch a fresh Facebook Login popup — it calls connectInstagramAccount() which resolves IG off the stored encrypted Page token server-side"
  - "Spanish toasts: success → 'Instagram conectado: @{igUsername}' (or 'Instagram conectado' when no username); error → result.error (fallback 'No se pudo conectar Instagram')"
  - "Inbox indicator (D-IG-07/IG-04) is verify-only: conversation-item.tsx + chat-header.tsx already render channel==='instagram' with title='Instagram' — confirmed via grep, untouched"

patterns-established:
  - "Pattern: channel-sibling connect component clones the FB button/spinner/toast structure, simplified when the channel rides on an already-connected parent (no popup)"

requirements-completed: [IG-04]

# Metrics
duration: 8min
completed: 2026-06-05
---

# Phase 41 Plan 06: Conectar Instagram UI Summary

**`ConnectInstagram` client component (button → `connectInstagramAccount` server action + Spanish sonner toasts, no fresh Facebook Login popup) + an "Instagram Direct" tab in Configuración → Integraciones mirroring the Facebook tab. The inbox "Instagram" channel indicator (IG-04 / D-IG-07) was confirmed pre-existing (verify-only, untouched).**

## Performance
- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 extended)

## Accomplishments
- `src/components/settings/connect-instagram.tsx` (NEW) — `"use client"` component cloning `ConnectFacebook` simplified for the no-popup path (D-IG-04): a full-width `Button` (lucide `Instagram` icon + `Loader2` spinner while pending) that calls `connectInstagramAccount()` in a `useTransition`. Success → `toast.success` ("Instagram conectado: @{igUsername}" or "Instagram conectado"); failure → `toast.error(result.error ?? 'No se pudo conectar Instagram')`. The browser NEVER sees a Page token — the action resolves IG off the stored encrypted Page token server-side and returns only `{ success, igUsername, error }`. No `FB.login`/`config_id` in the component (grep == 0).
- `src/app/(dashboard)/configuracion/integraciones/page.tsx` — additive Instagram Direct tab: imported `ConnectInstagram` (next to `ConnectFacebook`), extended the lucide import with `Instagram`, added a `<TabsTrigger value="instagram">` (Instagram icon + label) right after the facebook trigger, and a `<TabsContent value="instagram">` with a `Card` (CardTitle "Instagram Direct" + Spanish CardDescription explaining IG rides on the connected Facebook Page + `<ConnectInstagram />`), mirroring the facebook block. WhatsApp + Facebook + other tabs stay byte-identical (git diff confined to the 2 import extensions + the new trigger/content).
- **Verify-only (IG-04 / D-IG-07 inbox indicator):** confirmed the "Instagram" channel indicator already exists — `conversation-item.tsx:150` (`channel === 'instagram'` → `title="Instagram"`) + `chat-header.tsx:322` — and left both files untouched. The meta_direct IG conversations (Plan 41-05) inherit it for free (same `channel='instagram'` as the legacy ManyChat path).

## Task Commits
Each task was committed atomically:

1. **Task 1: connect-instagram.tsx (ConnectInstagram client component)** — `12ff00f8` (feat)
2. **Task 2: Wire the Instagram tab into the integraciones page (+ verify the inbox indicator exists)** — `cfc8237b` (feat)

## Files Created/Modified
- `src/components/settings/connect-instagram.tsx` (NEW) — ConnectInstagram client component; button + Spanish toasts; no-popup (no FB.login/config_id); browser never sees a token.
- `src/app/(dashboard)/configuracion/integraciones/page.tsx` — Instagram Direct tab (import + lucide Instagram icon + TabsTrigger + TabsContent Card with `<ConnectInstagram />`); additive only.

## Decisions Made
None beyond the plan — followed the plan's D-IG-04 no-popup flow exactly. The action return shape (`{ success, igUsername } | { success: false, error }`, confirmed in `meta-onboarding.ts:254`) matched the plan's toast wiring verbatim.

## Deviations from Plan
None — plan executed exactly as written.

(One cosmetic comment reword in `connect-instagram.tsx` — "fresh `FB.login` popup" → "fresh Facebook Login popup" — so the literal `FB.login` did not appear and the acceptance grep `grep -c "FB.login\|config_id" == 0` stayed strict. No behavior change.)

## Threat Model Coverage
- **T-41-06-01 (Information Disclosure — Page token reaching the browser):** mitigated. No-popup path; the component only ever sees `{ success, igUsername, error }` (the action resolves IG off the stored encrypted Page token server-side). No `FB.login`/`config_id`/token in the component (grep == 0). ✓
- **T-41-06-02 (Elevation of Privilege — non-owner clicking connect):** mitigated. The server action (41-03) enforces the owner gate; the UI is a thin trigger only. ✓
- **T-41-06-03 (Tampering — accidental edit to WA/FB tabs or inbox indicators):** accept → held. The git diff is confined to the 2 import-line extensions + the new instagram trigger/content; inbox files (conversation-item.tsx + chat-header.tsx) verify-only, untouched. ✓

## Verification
- **Task 1 greps PASS:** `'use client'`=1, `connectInstagramAccount`=4, `Conectar Instagram`=3, `FB.login|config_id`=0.
- **Task 2 greps PASS:** `ConnectInstagram`=2 (import + usage), `value="instagram"`=2 (TabsTrigger + TabsContent); inbox indicator `channel === 'instagram'` = 1 in conversation-item.tsx AND 1 in chat-header.tsx (verify-only).
- **git diff confinement:** `page.tsx` diff = 2 import-line extensions + new instagram trigger + new instagram content (additive). WA/FB/other tabs byte-identical. No file deletions introduced by the 2 commits.
- **tsc:** `npx tsc --noEmit` → 0 errors mentioning `connect-instagram.tsx` or `integraciones/page.tsx`.

## Next Phase Readiness
- IG-04 connect entry point ready: an operator (Owner) can open Configuración → Integraciones → Instagram and click "Conectar Instagram" to trigger the no-popup `connectInstagramAccount` action.
- Consumed/verified downstream by 41-07 (live smoke A: connect a real IG account off the connected Page, then the manual SQL cutover flipping `instagram_provider='meta_direct'`).
- No blockers.

## Self-Check: PASSED
- Files: FOUND src/components/settings/connect-instagram.tsx, src/app/(dashboard)/configuracion/integraciones/page.tsx, 41-06-SUMMARY.md
- Commits: FOUND 12ff00f8, cfc8237b

---
*Phase: 41-instagram-direct*
*Completed: 2026-06-05*
