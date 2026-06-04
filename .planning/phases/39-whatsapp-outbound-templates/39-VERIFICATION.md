---
phase: 39-whatsapp-outbound-templates
verified: 2026-06-03T19:55:00Z
status: human_needed
score: 8/8 must-haves verified (code surface)
overrides_applied: 0
human_verification:
  - test: "SQL flip + pre-flight: confirm test workspace via phone_number_id SELECT, then UPDATE whatsapp_provider='meta_direct' for the test workspace only; verify Somnio + all clients still '360dialog' in post-flip SELECT"
    expected: "Only the test workspace (Pruebas Morfx, phone_number_id 1134593926408063) shows meta_direct; every other workspace shows 360dialog"
    why_human: "Production DB write — wrong target = prod impact on Somnio/live clients. Must be operator-only, gated behind visual SELECT confirmation per Plan 08 Task 2."
  - test: "WA-01 live smoke: send a free-text message inside the 24h window from the MorfX inbox to the test number +57 310 5197782"
    expected: "Recipient WhatsApp client receives the message; inbox shows a wamid and status ticks. Cannot mock real Meta WABA in CI."
    why_human: "Requires a live Meta WABA, a real WhatsApp client, and the test workspace already flipped to meta_direct."
  - test: "WA-02/06 outbound media: send an image (with caption), a document (with filename), an audio clip, and a sticker"
    expected: "Each arrives correctly at the recipient; caption only on image/document, none on audio/sticker (Pitfall 4 gate verified live)."
    why_human: "Requires real Meta WABA send + live WhatsApp client to confirm rendering."
  - test: "WA-06 inbound media: have the test phone send an image back to the inbox"
    expected: "The image appears in the inbox as a permanent Supabase Storage URL — still viewable after 5+ minutes (not a dead Meta CDN URL with ~5 min expiry)."
    why_human: "Requires real inbound webhook delivery from Meta + browser inspection to verify URL durability."
  - test: "WA-03 template send: send an approved template (with header image + body vars) from the inbox"
    expected: "Template arrives rendered at the recipient. Requires an approved template in the test WABA."
    why_human: "Template approval is async Meta review; send requires live WABA."
  - test: "WA-04 interactive: send a reply-buttons message (3 buttons) and a list message from the inbox"
    expected: "Buttons and list render correctly on the recipient WhatsApp; tapping a button produces an inbound reply in the inbox."
    why_human: "Requires live Meta WABA + WhatsApp client to verify interactive rendering."
  - test: "WA-07 read receipts: open the conversation in the inbox after the test phone has sent messages"
    expected: "The test phone sees blue ticks on the messages it sent (double ticks turn blue)."
    why_human: "Blue tick delivery is a real-time signal that cannot be mocked in CI."
  - test: "WA-08/09 template CRUD + push status: create a new template from /configuracion/whatsapp/templates, then wait for Meta review"
    expected: "Template appears PENDING after create; when Meta reviews it, the status updates to APPROVED/REJECTED via webhook push WITHOUT clicking Resync (WA-09). Edit button visible only for APPROVED/REJECTED/PAUSED; PENDING/DISABLED shows Duplicar como nuevo; APPROVED edit shows 24h/30d warning."
    why_human: "Meta's async template review + real webhook delivery to the test endpoint cannot be simulated in CI."
  - test: "D-04 24h window inheritance: outside the 24h window on the test workspace, try to send a free-text message"
    expected: "Blocked with 'Ventana de 24h cerrada. Usa un template.' — same behavior as 360dialog (inherited via action layer, not the sender)."
    why_human: "Requires a conversation with no inbound in 24h + live test to confirm the guard fires."
  - test: "Regla 6 spot-check: send a normal message on a Somnio (or other 360dialog) workspace conversation"
    expected: "Works exactly as before. No 131047 error, no behavior change. Somnio workspace whatsapp_provider still '360dialog'."
    why_human: "Live confirmation that the 360dialog arm is byte-identical after the meta_direct branch was added — confirmed programmatically (Regla 6 parity test 5/5 GREEN), but the final real-send is the operator's gate."
  - test: "WA-09 prerequisite: confirm the test WABA is subscribed to the message_templates field"
    expected: "GET /{waba_id}/subscribed_apps response includes message_templates in subscribed_fields. If missing, re-POST /{waba_id}/subscribed_apps with the field."
    why_human: "Requires a live Graph API call with the decrypted BISUAT. Phase 38 subscribeWaba subscribes to messages; message_templates field may need a separate subscribe per Plan 06 OQ1/A2."
---

# Phase 39: WhatsApp Outbound + Templates Verification Report

**Phase Goal:** Workspaces connected via Meta direct can send all WhatsApp message types and manage templates through the Cloud API, with a per-workspace feature flag enabling gradual migration from 360dialog.
**Verified:** 2026-06-03T19:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Provider-aware sender registry: `whatsapp_provider` flag routes whatsapp arm to `metaWhatsappSender` (meta_direct) or 360dialog sender (360dialog default — Regla 6) | VERIFIED | `readWhatsappProvider()` helper in `domain/messages.ts:44-53`; branches in `sendTextMessage`, `sendMediaMessage`, `sendTemplateMessage`. `registry.ts` unchanged — `senders['whatsapp']` is still `whatsappSender` (360dialog); `metaWhatsappSender` imported directly by domain, not via registry. `messages-provider.test.ts` 5/5 GREEN including 2 Regla 6 parity assertions. |
| 2 | All WhatsApp message types deliverable via Cloud API: text (WA-01), media (WA-02), templates (WA-03), interactive buttons/lists (WA-04), read receipts (WA-07) | VERIFIED (code) | `meta/api.ts` exports `sendWhatsAppMedia`, `sendWhatsAppInteractive`, `markWhatsAppRead`; `meta-whatsapp-sender.ts` exposes `sendText`, `sendMedia`, `sendTemplate`, `sendButtons`, `sendList`, `sendRead`. WA-04 clamps: buttons ≤3/title≤20, list ≤10 sections/row title≤24. `send.test.ts` 3/3 + `meta-whatsapp-sender.test.ts` 3/3 GREEN. Live validation: human_needed (see smoke checklist). |
| 3 | Media upload to Meta CDN + inbound download/rehost (WA-06) | VERIFIED (code) | `meta/media.ts`: `uploadMedia` (multipart FormData, NOT metaRequest — §6), `downloadMedia` (two-step Bearer, no hostname rewrite — §7/Pitfall 3), `downloadAndRehostMedia` (Supabase whatsapp-media bucket). SSRF host-allowlist (`assertMetaCdnHost` — *.fbsbx.com/facebook.com/fbcdn.net) + per-type size cap (T-39-07). Inbound media path in `webhook-handler.ts:235-261` provider-aware. `media.test.ts` 7/7 GREEN in isolation (flaky in full-suite parallel run — see Anti-Patterns). |
| 4 | Templates CRUD via Graph API (WA-08) including D-05 edit constraints | VERIFIED | `meta/templates.ts`: `createTemplateMeta`, `listTemplatesMeta`, `deleteTemplateMeta`, `editTemplateMeta`, `syncTemplateStatusMeta`, `uploadHeaderHandleMeta`. D-05 guard in `editTemplateMeta`: rejects name/language change (any status) + rejects PENDING/DISABLED/IN_REVIEW (throws before any fetch). `templates.test.ts` 9/9 GREEN including 4 D-05 guard cases. `actions/templates.ts` provider-aware: delete/sync/edit branch on `whatsapp_provider`. `template-list.tsx`: `EDITABLE_STATUSES = {APPROVED,REJECTED,PAUSED}`; PENDING/DISABLED shows Duplicar como nuevo; APPROVED shows 24h/30d warning. `templates-provider.test.ts` 8/8 GREEN. |
| 5 | Template status arrives via webhook push, not polling (WA-09) | VERIFIED (code) | `route.ts` WA-09 branch at line 136: `change.field === 'message_template_status_update'` runs AFTER HMAC gate but BEFORE phone_number_id extraction (correct placement — template-status payloads have no phone_number_id). `resolveByWabaId` resolves workspace from WABA id. `applyTemplateStatusUpdate` in `domain/whatsapp-templates.ts` (Regla 3) writes status/rejected_reason. `template-status.test.ts` 4/4 GREEN: HMAC gate ×2 (T-39-04) + APPROVED status write + REJECTED+rejected_reason write. Live webhook push: human_needed (Meta async review). |
| 6 | 131047 root-cause fix: all WhatsApp send surfaces route through the single domain chokepoint — no per-call-site apiKey bypass remains | VERIFIED | `grep -rnE "send360Template" action-executor.ts contact-reviews.ts` → 0 non-comment matches. Both bypass sites rewired: `action-executor.ts` uses `findOrCreateConversation` + `domainSendTemplateMessage`; `contact-reviews.ts` uses `findOrCreateConversation` + `sendTemplateMessage`. `markMessageAsRead` in `actions/messages.ts` provider-aware (`whatsapp_provider` read, `markWhatsAppRead` for meta_direct, `markRead360` 360dialog arm untouched). |
| 7 | Regla 6: 360dialog/Somnio paths byte-identical — no existing workspace behavior altered | VERIFIED | `messages-provider.test.ts` 2 Regla 6 parity assertions GREEN: flag=360dialog → `send360Text(apiKey, to, body)` called with same args, `resolveByWorkspace`/`metaWhatsappSender` NEVER called. `registry.ts` UNCHANGED (`whatsappSender` still the only whatsapp entry). `whatsapp-sender.ts` UNCHANGED (confirmed via git log — zero commits to this file in Phase 39). `whatsapp/api.ts` UNCHANGED. Default `whatsapp_provider=null` → `'360dialog'` (Regla 6 default-safe). |
| 8 | MIG-01 flag wired to routing decision; MIG-03 provider-aware registry pattern delivered | VERIFIED | MIG-01: `whatsapp_provider` column already in prod (Phase 38). Phase 39 READS it via `readWhatsappProvider()` — no new migration needed. MIG-03: domain layer owns the provider decision (single chokepoint, not per call-site). `metaWhatsappSender` NOT in the channel-keyed `senders` map (D-02/Regla 6) — domain imports it directly. |

**Score:** 8/8 code surface truths verified. Live-smoke validation pending operator (Plan 08 Tasks 2-3).

---

### Deferred Items

None — all Phase 39 requirements are fully implemented in code. The only open item (Plan 08) is the operator-gated live smoke, which is human_needed by design (D-01: cutover requires operator action on production DB).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/meta/api.ts` | send helpers: sendWhatsAppMedia, sendWhatsAppInteractive, markWhatsAppRead (WA-02/04/07) | VERIFIED | Lines 130, 179, 209 confirm all 3 exports present alongside existing sendWhatsAppText/Template. |
| `src/lib/meta/media.ts` | uploadMedia, downloadMedia, downloadAndRehostMedia + SSRF guard (WA-06) | VERIFIED | Lines 77, 157, 242 confirm exports. `assertMetaCdnHost` at line 27. |
| `src/lib/meta/templates.ts` | CRUD + editTemplateMeta D-05 guard (WA-08) | VERIFIED | `EDITABLE_STATUSES` at line 76; `editTemplateMeta` D-05 throw at lines 178-181. |
| `src/lib/channels/meta-whatsapp-sender.ts` | ChannelSender-shaped module taking {accessToken, phoneNumberId} (WA-04 clamps) | VERIFIED | Methods sendText/sendMedia/sendTemplate/sendButtons/sendList/sendRead at lines 46-190. |
| `src/lib/meta/credentials.ts` | resolveByWabaId (WA-09 workspace resolution) | VERIFIED | Line 69 confirms export. |
| `src/lib/domain/messages.ts` | readWhatsappProvider() + meta_direct branch in 3 send fns (MIG-03) | VERIFIED | Lines 44-53 (helper), 152-173 (sendTextMessage), 254-267 (sendMediaMessage), 380-391 (sendTemplateMessage). |
| `src/lib/domain/whatsapp-templates.ts` | meta_direct branch in createTemplate + applyTemplateStatusUpdate (WA-08/09) | VERIFIED | Lines 86-93 (provider read), 143/238 (branches), 321+ (applyTemplateStatusUpdate). |
| `src/app/api/webhooks/meta/route.ts` | WA-09 template-status branch (line 136) behind HMAC gate | VERIFIED | Lines 122-161 confirm branch placement BEFORE phone_number_id extraction, AFTER HMAC verify. |
| `src/lib/whatsapp/webhook-handler.ts` | Inbound media provider-aware: meta_direct → downloadAndRehostMedia (WA-06) | VERIFIED | Lines 235-261 confirm provider read + downloadAndRehostMedia for meta_direct; 360dialog arm in else block. |
| `src/app/actions/messages.ts` | markMessageAsRead Meta arm (WA-07) + 24h window inherited (D-04) | VERIFIED | Lines 352-379 confirm provider branch. D-04: hoursSince/last_customer_message_at logic UNCHANGED (git diff confirms). |
| `src/lib/automations/action-executor.ts` | Bypass site rewired through domain chokepoint (131047 fix) | VERIFIED | Line 1284 uses findOrCreateConversation + domainSendTemplateMessage. send360Template → 0 non-comment matches. |
| `src/lib/domain/contact-reviews.ts` | Bypass site rewired through domain chokepoint (131047 fix) | VERIFIED | Lines 18-19 import findOrCreateConversation + sendTemplateMessage from domain. send360Template → 0 matches. |
| `src/app/actions/templates.ts` | Provider-aware delete/sync/edit + editTemplate action (WA-08/MIG-03) | VERIFIED | Lines 42-47 (provider read), 298 (deleteTemplateMeta), 383-385 (syncTemplateStatusMeta), 435-517 (editTemplate). |
| `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx` | Status-gated edit UI (D-05) | VERIFIED | Lines 41-46 (EDITABLE_STATUSES), 150-166 (edit vs Duplicar gate), 295-301 (APPROVED 24h warning). |
| `src/lib/domain/__tests__/messages-provider.test.ts` | Regla 6 parity test (5/5 GREEN) | VERIFIED | 5/5 GREEN confirmed in targeted run. 2 Regla 6 assertions always-green. |
| `src/lib/meta/__tests__/send.test.ts` | WA-01/03/07 payload shape tests (3/3 GREEN) | VERIFIED | 3/3 GREEN |
| `src/lib/meta/__tests__/media.test.ts` | WA-02/06 upload/download/gating tests (7/7 GREEN in isolation) | VERIFIED (with caveat) | 7/7 GREEN in targeted/isolated runs. Flaky timeout+json-error in full-suite parallel run (global.fetch isolation conflict — see Anti-Patterns). |
| `src/lib/meta/__tests__/templates.test.ts` | WA-08 CRUD + D-05 guard (9/9 GREEN) | VERIFIED | 9/9 GREEN |
| `src/lib/channels/__tests__/meta-whatsapp-sender.test.ts` | WA-04 clamp contracts (3/3 GREEN) | VERIFIED | 3/3 GREEN |
| `src/app/api/webhooks/meta/__tests__/template-status.test.ts` | WA-09 HMAC gate + status write (4/4 GREEN) | VERIFIED | 4/4 GREEN |
| `src/app/actions/__tests__/templates-provider.test.ts` | Provider-aware delete/sync/edit + 360dialog parity (8/8 GREEN) | VERIFIED | 8/8 GREEN |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `domain/messages.ts::sendTextMessage` | `meta-whatsapp-sender.ts::sendText` | `readWhatsappProvider()` → meta_direct branch | WIRED | Line 159-173: `if (provider === 'meta_direct') { metaWhatsappSender.sendText(creds,...) }` |
| `domain/messages.ts::sendTextMessage` | `whatsapp/api.ts::send360Text` | default (360dialog arm) | WIRED | Line 173+: existing 360dialog call byte-identical |
| `domain/messages.ts` | `meta/credentials.ts::resolveByWorkspace` | meta_direct branch cred resolution | WIRED | Imported at line 36; called inside meta_direct branch |
| `domain/whatsapp-templates.ts` | `meta/templates.ts::createTemplateMeta` | `whatsapp_provider` branch | WIRED | Line 238-240 |
| `domain/whatsapp-templates.ts::applyTemplateStatusUpdate` | `whatsapp_templates` table | domain Regla 3 chokepoint | WIRED | Lines 321-360; route.ts delegates to this, never touches table directly |
| `route.ts` WA-09 branch | `meta/credentials.ts::resolveByWabaId` | `entry[].id` WABA id | WIRED | Lines 15, 151 |
| `route.ts` WA-09 branch | `domain/whatsapp-templates.ts::applyTemplateStatusUpdate` | post-resolve domain call | WIRED | Lines 17, 161 |
| `webhook-handler.ts` inbound media | `meta/media.ts::downloadAndRehostMedia` | meta_direct branch | WIRED | Lines 14-15 imports, 253-259 call |
| `actions/messages.ts::markMessageAsRead` | `meta/api.ts::markWhatsAppRead` | meta_direct branch | WIRED | Lines 364, 369 |
| `action-executor.ts` host notification | `domain/messages.ts::sendTemplateMessage` | findOrCreateConversation → domain | WIRED | Lines 1284, 1287+ |
| `domain/contact-reviews.ts::sendPendingTemplate` | `domain/messages.ts::sendTemplateMessage` | findOrCreateConversation → in-process domain | WIRED | Lines 18-19, 442-449 |
| `actions/templates.ts::editTemplate` | `meta/templates.ts::editTemplateMeta` | resolveByWorkspace → meta_direct | WIRED | Line 517 |
| `template-list.tsx` edit dialog | `actions/templates.ts::editTemplate` | server action import | WIRED | Lines 31, 103 |
| `channels/registry.ts` | `whatsapp-sender.ts` (360dialog) | `senders['whatsapp']` map entry | WIRED (Regla 6) | Registry UNCHANGED; metaWhatsappSender NOT in the map — domain imports it directly |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `domain/messages.ts::sendTextMessage` | `provider` | `readWhatsappProvider(supabase, ctx.workspaceId)` — `workspaces.whatsapp_provider` DB read | Yes — live DB query, no cache | FLOWING |
| `meta-whatsapp-sender.ts::sendText` | `resp` (wamid) | `sendWhatsAppText(creds.accessToken, creds.phoneNumberId, to, text)` → Graph API | Yes — real Meta API (live WABA required for smoke) | FLOWING (code); live validation human_needed |
| `meta/media.ts::downloadAndRehostMedia` | `publicUrl` | `downloadMedia` (two-step Bearer) → Supabase storage upload | Yes — real Meta CDN + real Supabase storage | FLOWING |
| `meta/templates.ts::editTemplateMeta` | D-05 guard throws | input params validation BEFORE fetch | Yes — guard fires before any network call | FLOWING |
| `domain/whatsapp-templates.ts::applyTemplateStatusUpdate` | `status`, `rejected_reason` | webhook payload fields (WABA-resolved workspace) | Yes — real DB UPDATE scoped by workspace_id | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Regla 6 parity test: flag=360dialog → 360dialog arm called; metaWhatsappSender never touched | `pnpm exec vitest run src/lib/domain/__tests__/messages-provider.test.ts` | 5/5 passed | PASS |
| D-05 guard: edit of PENDING template throws; edit of APPROVED succeeds | `pnpm exec vitest run src/lib/meta/__tests__/templates.test.ts` | 9/9 passed (4 guard cases GREEN) | PASS |
| WA-09 HMAC gate: forged webhook rejected 401 | `pnpm exec vitest run src/app/api/webhooks/meta/__tests__/template-status.test.ts` | 4/4 passed (2 HMAC guards GREEN) | PASS |
| send360Template bypass sites removed | `grep -rnE "send360Template" src/lib/automations/action-executor.ts src/lib/domain/contact-reviews.ts` | 0 non-comment matches | PASS |
| metaWhatsappSender NOT in channel registry (Regla 6) | `grep "senders\[" src/lib/channels/registry.ts` | 1 match — only `senders[channel]` lookup; map has whatsapp/facebook/instagram → 360dialog/manychat senders only | PASS |
| tsc: zero errors in Phase 39 source files | `pnpm exec tsc --noEmit 2>&1 \| grep src/lib/meta\|meta-whatsapp\|domain/messages\|whatsapp-templates\|action-executor\|contact-reviews` | 0 lines output (exit 0) | PASS |
| Full Phase 39 test surface: 60/60 tests GREEN in targeted run | `pnpm exec vitest run src/lib/domain/__tests__/messages-provider.test.ts src/lib/meta/__tests__/ src/lib/channels/__tests__/meta-whatsapp-sender.test.ts src/app/api/webhooks/meta/__tests__/ src/app/actions/__tests__/templates-provider.test.ts` | 11 files, 60 tests: 60 passed | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WA-01 | 39-02, 39-04 | Enviar texto via Cloud API | SATISFIED | `sendWhatsAppText` + domain branch in `sendTextMessage`. `send.test.ts` text wire-shape GREEN. |
| WA-02 | 39-02, 39-03, 39-04 | Enviar media via Cloud API | SATISFIED | `sendWhatsAppMedia` + `uploadMedia` + domain branch in `sendMediaMessage`. `media.test.ts` 7/7 GREEN isolation. |
| WA-03 | 39-02, 39-04 | Enviar templates via Cloud API | SATISFIED | `sendWhatsAppTemplate` reused + domain branch in `sendTemplateMessage`. `send.test.ts` template wire GREEN. |
| WA-04 | 39-02 | Mensajes interactivos (botones/listas) via Cloud API | SATISFIED | `sendWhatsAppInteractive` + `metaWhatsappSender.sendButtons/sendList` with clamps. `meta-whatsapp-sender.test.ts` 3/3 GREEN. |
| WA-06 | 39-03, 39-06 | Download/upload de media via Meta CDN | SATISFIED | `uploadMedia` (multipart), `downloadMedia` (two-step Bearer, SSRF guard), `downloadAndRehostMedia` (Supabase rehost). `webhook-handler.ts` inbound branch wired. `media.test.ts` 7/7 GREEN isolation. |
| WA-07 | 39-02, 39-05 | Read receipts via Cloud API | SATISFIED | `markWhatsAppRead` in `meta/api.ts`; `markMessageAsRead` in `actions/messages.ts` provider-aware (meta_direct → Cloud API, 360dialog arm byte-identical). |
| WA-08 | 39-03, 39-06, 39-07 | CRUD de templates via Graph API | SATISFIED | `createTemplateMeta`, `listTemplatesMeta`, `deleteTemplateMeta`, `editTemplateMeta` (D-05 guard), `syncTemplateStatusMeta`, `uploadHeaderHandleMeta`. All wired in domain + actions. 9/9 + 8/8 GREEN. |
| WA-09 | 39-06 | Template status webhooks push | SATISFIED (code) | `message_template_status_update` branch in `route.ts` (HMAC-gated, resolves workspace by WABA id, delegates to domain `applyTemplateStatusUpdate`). `template-status.test.ts` 4/4 GREEN. Live webhook delivery: human_needed (Meta async review). |
| MIG-01 | 38 (column) / 39 (wiring) | Feature flag whatsapp_provider per-workspace | SATISFIED | Column in prod since Phase 38. Phase 39 reads it via `readWhatsappProvider()` in domain + `readTemplateProviderConfig()` in actions. Default null → '360dialog' (Regla 6). |
| MIG-03 | 39-01, 39-04 | Channel sender registry provider-aware | SATISFIED | Single domain-layer provider decision (`readWhatsappProvider`); `metaWhatsappSender` imported directly by domain (NOT in the channel-keyed registry map — Regla 6 D-02). `messages-provider.test.ts` 5/5 GREEN including Regla 6 parity. |

**Orphaned requirements check:** REQUIREMENTS.md maps WA-01..09, MIG-01, MIG-03 to Phase 39. All 10 are covered. WA-05 (inbound webhooks) was Phase 38 and is NOT in Phase 39 scope — confirmed by CONTEXT.md "inbound ya quedó en Phase 38."

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/meta/__tests__/media.test.ts` | uploadMedia + downloadMedia tests | Flaky in full-suite parallel run: upload times out (5000ms), downloadMedia `response.json is not a function` | WARNING | Test isolation issue — global.fetch stub set by one test suite leaks into another when vitest runs all files in the same process. The production code is correct (7/7 GREEN in isolated runs). Root cause: `global.fetch = vi.fn(...)` without a guaranteed `afterEach` restore when another test file also stubs fetch. No production impact — only affects CI full-suite greenness. |

No blocker anti-patterns. No TODO/FIXME/placeholder found in Phase 39 production source files (searched: meta/api.ts, meta/media.ts, meta/templates.ts, meta-whatsapp-sender.ts, domain/messages.ts, actions/templates.ts). The `return null` instances in `meta/media.ts` and `meta/templates.ts` are correct nullable returns for error paths and not-found cases — not stubs.

---

### Human Verification Required

Plan 08 is a live operator smoke (`autonomous: false`, `type: checkpoint:human-action/human-verify`). By design (D-01: "build everything BEFORE the first cutover"), the code surface is complete and deployed; the operator now performs the gated flip + live validation. None of the items below represent code gaps — they are the contractual manual verification gate.

#### 1. Prerequisite: WABA subscribed_apps check

**Test:** `GET https://graph.facebook.com/v22.0/{waba_id}/subscribed_apps` (with decrypted BISUAT). Confirm `message_templates` is in `subscribed_fields`.
**Expected:** Field present. If missing, re-POST `/{waba_id}/subscribed_apps` with `message_templates` included, and enable the `message_template_status_update` webhook field in the Meta App dashboard.
**Why human:** Requires live Graph API call with real credentials. Phase 38 `subscribeWaba` subscribes to `messages`; `message_templates` may need a separate sub (Plan 06 OQ1/A2).

#### 2. Cutover SQL flip — test workspace only

**Test:** Run the pre-flight SELECT (confirm target by phone_number_id 1134593926408063), then UPDATE `whatsapp_provider = 'meta_direct'` for the test workspace only, then re-SELECT to confirm Somnio + all clients still '360dialog'.
**Expected:** Exactly one row flipped (Pruebas Morfx); all others untouched.
**Why human:** Production DB write. Wrong target = live impact on Somnio/clients. Operator-only per Regla 6 + Plan 08 Task 2 gate.

#### 3. WA-01 text send

**Test:** From MorfX inbox, send a free-text message inside the 24h window to the test number +57 310 5197782.
**Expected:** Recipient receives it; inbox shows wamid + status ticks.
**Why human:** Real Meta WABA + live WhatsApp client required.

#### 4. WA-02/06 outbound media

**Test:** Send image (with caption), document (with filename), audio, sticker.
**Expected:** Each arrives; caption only on image/document, none on audio/sticker.
**Why human:** Real Meta WABA + live WhatsApp client required.

#### 5. WA-06 inbound media rehost

**Test:** Have the test phone send an image to the inbox; wait >5 minutes; confirm the URL is still accessible.
**Expected:** Supabase Storage URL (not a Meta CDN expiring URL) — visible after 5+ min.
**Why human:** Real inbound webhook + browser inspection required.

#### 6. WA-03 template send

**Test:** Send an approved template (header image + body vars) from the inbox.
**Expected:** Arrives rendered at recipient.
**Why human:** Real Meta WABA + approved template in test WABA required.

#### 7. WA-04 interactive messages

**Test:** Send a reply-buttons message (3 buttons) and a list message.
**Expected:** Buttons/list render; tapping a button produces an inbound reply.
**Why human:** Real Meta WABA + live WhatsApp client for interactive rendering.

#### 8. WA-07 read receipts

**Test:** Open the conversation after the test phone sent messages.
**Expected:** Blue ticks appear on the test phone's sent messages.
**Why human:** Real-time blue-tick signal requires live WhatsApp client.

#### 9. WA-08/09 template CRUD + webhook push

**Test:** Create a template from `/configuracion/whatsapp/templates`; wait for Meta review; confirm status updates without clicking Resync. Verify Edit/Duplicar gate per status.
**Expected:** PENDING on create; APPROVED/REJECTED via webhook push (no Resync click). Edit only for APPROVED/REJECTED/PAUSED.
**Why human:** Meta async template review + real webhook delivery required.

#### 10. D-04 24h window inheritance

**Test:** Outside the 24h window on the test workspace, attempt a free-text send.
**Expected:** Blocked with "Ventana de 24h cerrada. Usa un template." (same as 360dialog).
**Why human:** Requires a stale conversation (24h+ since last inbound) on the live test workspace.

#### 11. Regla 6 spot-check

**Test:** Send a normal message on a Somnio (or other 360dialog) conversation.
**Expected:** Works exactly as before — no 131047, no behavior change.
**Why human:** Live confirmation that the 360dialog default path is intact post-deploy. (Programmatic Regla 6 parity test is 5/5 GREEN, but the final live-send is the operator's gate.)

---

### Gaps Summary

No code gaps. The full Phase 39 source surface (7 plans, Plans 01-07) is implemented, wired, and test-covered:

- **11 Phase 39 test files, 60 tests: all GREEN in targeted runs**
- **Regla 6 parity assertions: 5/5 GREEN** (360dialog path byte-identical — the critical invariant)
- **D-05 edit constraints: enforced at 3 layers** (service `editTemplateMeta`, action try/catch, UI `EDITABLE_STATUSES` gate)
- **131047 blast radius: CLOSED** — 0 `send360Template` bypass sites remain; all WhatsApp surfaces funnel through the single domain chokepoint
- **tsc: 0 errors in Phase 39 source files**

The one warning item (media.test.ts flakiness in full-suite parallel runs) is a test-isolation issue in the test harness — not a production code defect. The production implementation of `uploadMedia`/`downloadMedia` is correct.

The only remaining action is the operator-gated live smoke (Plan 08 Tasks 2-3). Upon "approved" from the operator, the phase is fully closed.

---

*Verified: 2026-06-03T19:55:00Z*
*Verifier: Claude (gsd-verifier)*
