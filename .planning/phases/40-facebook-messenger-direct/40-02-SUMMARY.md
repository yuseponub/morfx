---
phase: 40-facebook-messenger-direct
plan: 02
subsystem: api
tags: [meta, messenger, graph-api, channel-sender, fb-02, tdd]

# Dependency graph
requires:
  - phase: 40-01
    provides: "RED contract tests (messenger-api.test.ts + meta-facebook-sender.test.ts) pinning FB-02 wire shapes"
  - phase: 39-whatsapp-outbound-templates
    provides: "metaRequest transport (src/lib/meta/api.ts) + metaWhatsappSender structural mirror"
provides:
  - "sendMessengerText / sendMessengerimage / getMessengerUserProfile Graph Send-API helpers (messenger-api.ts)"
  - "metaFacebookSender creds-object ChannelSender (meta-facebook-sender.ts), domain-imported, NOT in registry map"
affects: [40-04, 40-05, 40-06, 40-07, 40-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Messenger Send API edge mirrors WhatsApp send edge over the shared metaRequest transport (v22.0 pinned)"
    - "PSID-as-string end-to-end (never Number-coerced — Pitfall 5)"
    - "Image-as-followup: image attachment has no caption; caption sent as a separate text"
    - "Provider sender domain-imported only — NOT registered in the channel-keyed senders map (Regla 6)"

key-files:
  created:
    - src/lib/meta/messenger-api.ts
    - src/lib/channels/meta-facebook-sender.ts
  modified: []

key-decisions:
  - "messaging_type RESPONSE inside 24h; MESSAGE_TAG + HUMAN_AGENT (the only emittable tag) outside"
  - "getMessengerUserProfile is best-effort: try/catch → {} on failure, never throws"
  - "metaFacebookSender NOT added to registry.ts senders map — Plan 04 imports it directly when messenger_provider === 'meta_direct'"

patterns-established:
  - "Messenger creds-object MetaPageCreds { accessToken, pageId } mirrors MetaCreds { accessToken, phoneNumberId }"
  - "unwrap reads response.message_id (Messenger shape) vs response.messages?.[0]?.id (WhatsApp shape)"

requirements-completed: []  # FB-02 consumed end-to-end by the cutover smoke in Plan 40-08 — keep Pending until then

# Metrics
duration: 12min
completed: 2026-06-04
---

# Phase 40 Plan 02: FB-02 Messenger Send Edge Summary

**Graph v22.0 Messenger Send-API helpers (text RESPONSE/HUMAN_AGENT, image is_reusable no-caption, best-effort profile) plus the metaFacebookSender creds-object ChannelSender — both built over the existing metaRequest transport, with the ManyChat path left byte-identical (Regla 6).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-04T10:05:00Z
- **Completed:** 2026-06-04T10:17:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `src/lib/meta/messenger-api.ts` (137 lines): `sendMessengerText` / `sendMessengerImage` / `getMessengerUserProfile` POST/GET to `/{pageId}/messages` and `/{psid}` via the shared `metaRequest` (Bearer = Page token, v22.0 pinned — no hand-rolled fetch).
- `src/lib/channels/meta-facebook-sender.ts` (77 lines): `metaFacebookSender` creds-object sender mirroring `meta-whatsapp-sender.ts`, unwrapping `message_id` and implementing image-as-followup caption parity with `manychatFacebookSender`.
- The two Wave-1 RED files from Plan 40-01 are now GREEN: `messenger-api.test.ts` 9/9 + `meta-facebook-sender.test.ts` 6/6 = **15/15**.
- Regla 6 preserved end-to-end: `metaFacebookSender` is domain-imported only (NOT in the channel-keyed `senders` map); `git diff --stat src/lib/channels/registry.ts src/lib/channels/manychat-sender.ts` is EMPTY.

## Task Commits

Each task was committed atomically:

1. **Task 1: GREEN — messenger-api.ts (FB-02 send edge)** - `6fd44075` (feat)
2. **Task 2: GREEN — meta-facebook-sender.ts (metaFacebookSender)** - `57701ef0` (feat)

_Note: This is a `type: tdd` GREEN plan — the RED was Plan 40-01; here each task is a single feat commit turning its RED file GREEN (no separate test commit, no refactor needed)._

## Files Created/Modified
- `src/lib/meta/messenger-api.ts` - Messenger Send API edge: text (RESPONSE / MESSAGE_TAG+HUMAN_AGENT), image (attachment `{type:'image', payload:{url, is_reusable:true}}`, no caption field), best-effort user-profile fetch (try/catch → `{}`). PSID forwarded as a string verbatim; reuses `metaRequest`.
- `src/lib/channels/meta-facebook-sender.ts` - `MetaPageCreds { accessToken, pageId }` + `metaFacebookSender` with `sendText` / `sendImage`; `unwrap` reads `message_id` → `externalMessageId`; image-as-followup caption text; HUMAN_AGENT tag forwarded to both image and follow-up. Header comment states it is NOT in the registry senders map.

## Decisions Made
- None beyond the plan — followed the FB-02 contract and the WhatsApp analogs exactly.

## Deviations from Plan

None — plan executed exactly as written.

(Minor: a header-comment that literally named the three dead message tags was reworded so the acceptance gate `grep -E "CONFIRMED_EVENT_UPDATE|ACCOUNT_UPDATE|POST_PURCHASE_UPDATE" == 0` passes — no code/behavior change, the tags were only ever in a negative documentation note.)

## Issues Encountered
- None. Both RED files turned GREEN on first implementation; `tsc --noEmit` reported 0 errors in the two new files.

## Verification

- `npx vitest run src/lib/meta/__tests__/messenger-api.test.ts src/lib/channels/__tests__/meta-facebook-sender.test.ts` → **Test Files 2 passed (2), Tests 15 passed (15)**.
- Acceptance gates: `grep -c metaRequest messenger-api.ts` = 8 (≥1); `grep -c is_reusable` = 2 (≥1); dead-tags grep = 0; `grep -c "Number("` = 0; `grep -c MetaPageCreds` = 3; `grep -c message_id meta-facebook-sender.ts` = 4.
- **Regla 6:** `git diff --stat src/lib/channels/registry.ts src/lib/channels/manychat-sender.ts` → EMPTY.
- No new package installed; no migration.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FB-02 send primitives ready for the domain provider chokepoint (Plan 40-04 `readMessengerProvider`) to route `meta_direct` workspaces to `metaFacebookSender` while `manychat` stays on the byte-identical `getChannelSender('facebook')` path.
- `getMessengerUserProfile` ready for the inbound create-or-get contact path (Plan 40-05).
- FB-02 requirement remains Pending — consumed end-to-end by the gated cutover smoke (Plan 40-08).

## Self-Check: PASSED
- `src/lib/meta/messenger-api.ts` — FOUND
- `src/lib/channels/meta-facebook-sender.ts` — FOUND
- Commit `6fd44075` — FOUND
- Commit `57701ef0` — FOUND

---
*Phase: 40-facebook-messenger-direct*
*Completed: 2026-06-04*
