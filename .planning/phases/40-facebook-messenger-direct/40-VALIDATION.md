---
phase: 40
slug: facebook-messenger-direct
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
planned: 2026-06-04
plans: 9
waves: 5
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (repo root) |
| **Quick run command** | `npx vitest run <target-path>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full); <10s per targeted file |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched-test-path>`
- **After every plan wave:** Run `npx vitest run` (full suite — confirm Regla 6: `manychatFacebookSender` + `godentist-fb-ig` paths byte-identical)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Every task maps to a requirement, an automated command, and (where applicable) a threat ref. Regla 6 parity tests (flag=`manychat` leaves the ManyChat path untouched) are first-class verification rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-00-T1 | 00 | 1 | MIG-02 | T-40-00-01/02 | messenger_provider migration default 'manychat', Regla 5 header | file | `grep "messenger_provider TEXT NOT NULL DEFAULT 'manychat'" supabase/migrations/*_add_messenger_provider.sql` | ❌ creates | ⬜ pending |
| 40-00-T2 | 00 | 1 | MIG-02 | T-40-00-01 | column applied to prod before provider-reading code (Regla 5) | manual | operator SQL apply + `SELECT messenger_provider,count(*) FROM workspaces GROUP BY 1` | n/a | ⬜ checkpoint |
| 40-01-T1 | 01 | 1 | FB-02 | T-40-01-03 | RED: text/image/tag/PSID-string send-shape | unit (RED) | `npx vitest run src/lib/meta/__tests__/messenger-api.test.ts src/lib/channels/__tests__/meta-facebook-sender.test.ts` (non-zero) | ❌ creates | ⬜ pending |
| 40-01-T2 | 01 | 1 | MIG-02, FB-01/03/04 | T-40-01-01 | RED: provider chokepoint + Regla 6 parity + inbound | unit (RED) | `npx vitest run src/lib/domain/__tests__/messenger-provider.test.ts src/lib/messenger/__tests__/webhook-handler.test.ts` (non-zero) | ❌ creates | ⬜ pending |
| 40-01-T3 | 01 | 1 | SIGNUP-04 | T-40-01-02/03 | RED: connect + D-09 window/tag gate | unit (RED) | `npx vitest run src/app/actions/__tests__/connect-facebook.test.ts src/app/actions/__tests__/messenger-window.test.ts` (non-zero) | ❌ creates | ⬜ pending |
| 40-02-T1 | 02 | 2 | FB-02 | T-40-02-01/02/03 | sendMessengerText/Image/profile, PSID string, HUMAN_AGENT-only | unit | `npx vitest run src/lib/meta/__tests__/messenger-api.test.ts` | ✅ (40-01) | ⬜ pending |
| 40-02-T2 | 02 | 2 | FB-02 | T-40-02-04 | metaFacebookSender creds-object + image-followup + NOT in registry | unit + diff | `npx vitest run src/lib/channels/__tests__/meta-facebook-sender.test.ts` + `git diff --stat registry.ts manychat-sender.ts` empty | ✅ (40-01) | ⬜ pending |
| 40-03-T1 | 03 | 2 | SIGNUP-04 | T-40-03-02/05 | long-lived → Page token → per-Page subscribe (server-only) | unit | `npx vitest run src/app/actions/__tests__/connect-facebook.test.ts` | ✅ (40-01) | ⬜ pending |
| 40-03-T2 | 03 | 2 | SIGNUP-04 | T-40-03-01 | upsertMetaAccount channel='facebook' + pageId (Regla 3) | grep | `grep -c pageId src/lib/domain/meta-accounts.ts` ≥1 | ✅ existing | ⬜ pending |
| 40-03-T3 | 03 | 2 | SIGNUP-04 | T-40-03-01/03/04 | connectFacebookPage owner-gate, no provider flip | unit | `npx vitest run src/app/actions/__tests__/connect-facebook.test.ts` | ✅ (40-01) | ⬜ pending |
| 40-04-T1 | 04 | 3 | MIG-02, FB-02 | T-40-04-01/02/03 | readMessengerProvider + facebook meta_direct arm, manychat byte-identical | unit + diff | `npx vitest run src/lib/domain/__tests__/messenger-provider.test.ts` + registry/manychat diff empty | ✅ (40-01) | ⬜ pending |
| 40-05-T1 | 05 | 4 | FB-01/03/04 | T-40-05-03/04/05 | processMessengerWebhook PSID-string create-or-get, no fuzzy, no agent dispatch | unit | `npx vitest run src/lib/messenger/__tests__/webhook-handler.test.ts` | ✅ (40-01) | ⬜ pending |
| 40-05-T2 | 05 | 4 | FB-01 | T-40-05-01/02 | object==='page' branch, route by page_id, HMAC reuse, ack-drop unknown | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/` | ✅ existing | ⬜ pending |
| 40-06-T1 | 06 | 4 | FB-02 (D-09) | T-40-06-01/02/03 | window gate RESPONSE/HUMAN_AGENT/BLOCK, meta_direct-only | unit | `npx vitest run src/app/actions/__tests__/messenger-window.test.ts` | ✅ (40-01) | ⬜ pending |
| 40-07-T1 | 07 | 4 | SIGNUP-04 | T-40-07-01/03 | ConnectFacebook FB.login pages_messaging (+IG forward-compat) | file + tsc | `grep pages_messaging src/components/settings/connect-facebook.tsx` + `tsc --noEmit` clean | ❌ creates | ⬜ pending |
| 40-07-T2 | 07 | 4 | SIGNUP-04, FB-04 | T-40-07-02 | ConnectFacebook surfaced in integrations; FB indicator already shipped | grep + tsc | `grep -c ConnectFacebook .../integraciones/page.tsx` ≥1 | ✅ existing | ⬜ pending |
| 40-08-T1 | 08 | 5 | all | T-40-08-01 | full suite green + Regla 6 + godentist-fb-ig byte-identical + push | suite + diff | `npx vitest run <6 phase tests>` + `git diff --stat registry/manychat` empty | ✅ | ⬜ pending |
| 40-08-T2 | 08 | 5 | all | T-40-08-01/02/03 | live connect + 1-workspace flip + inbound/outbound/window smoke | manual | operator UAT (Steps A–F) | n/a | ⬜ checkpoint |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Regla 6 parity rows (first-class):** 40-01-T2 (RED parity assertion: manychat arm never calls resolveByWorkspace/metaFacebookSender), 40-02-T2 + 40-04-T1 + 40-08-T1 (`git diff --stat registry.ts manychat-sender.ts` empty), 40-08 (godentist-fb-ig workspace stays manychat).

---

## Wave 0 (Wave 1 here) RED Test Files — declared

All six pinned in Plan 01 (`type: tdd`, wave 1):
- [x] `src/lib/meta/__tests__/messenger-api.test.ts` — FB-02 send payloads (RESPONSE + MESSAGE_TAG/HUMAN_AGENT) + image (no caption field) + profile fetch
- [x] `src/lib/channels/__tests__/meta-facebook-sender.test.ts` — FB-02 metaFacebookSender creds-object + image-as-followup
- [x] `src/lib/domain/__tests__/messenger-provider.test.ts` — MIG-02 chokepoint (meta_direct vs manychat) + Regla 6 parity (first-class)
- [x] `src/lib/messenger/__tests__/webhook-handler.test.ts` — FB-01 routing by page_id + FB-03 PSID `(page_id, PSID)` create-or-get (no fuzzy) + FB-04 channel='facebook'
- [x] `src/app/actions/__tests__/connect-facebook.test.ts` — SIGNUP-04 connect stores Page token + page_id + subscribe, no provider flip
- [x] `src/app/actions/__tests__/messenger-window.test.ts` — D-09 window gate RESPONSE/HUMAN_AGENT/BLOCK

**Existing infrastructure reused (no new file):**
- FB-04 "Messenger channel indicator" — ALREADY rendered for `channel === 'facebook'` in `conversation-item.tsx:143` + `chat-header.tsx:319` (no new UI/test needed; verified via live UAT in Plan 08).
- HMAC verify, `resolveByPageId`, `workspace_meta_accounts.page_id` UNIQUE, `findOrCreateConversation` channel-aware, `last_customer_message_at` window field — all pre-existing (RESEARCH §Don't Hand-Roll).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| messenger_provider migration applied in prod | MIG-02 | Regla 5 — schema change before deploy | Plan 00 checkpoint: operator runs the ALTER in prod, confirms all workspaces default 'manychat' |
| FB connect + Page token store | SIGNUP-04 | Requires real Meta popup + real Facebook Page | Plan 08 Step A: click "Conectar Facebook", authorize, confirm `workspace_meta_accounts` row with page_id |
| Live inbound Messenger → inbox | FB-01, FB-03, FB-04 | Requires a real message to the connected Page | Plan 08 Step C: send a Messenger message, confirm it appears with the Messenger indicator + (page_id, PSID) contact |
| Live outbound text + image (inside 24h) | FB-02 | Requires a live Messenger thread inside 24h | Plan 08 Step D: reply text + image, confirm delivery (caption as follow-up text) |
| HUMAN_AGENT / BLOCK outside 24h | FB-02 (D-09) | Requires >24h thread + Human Agent feature status | Plan 08 Step E: attempt a >24h send; HUMAN_AGENT if granted, else clear BLOCK message |
| godentist-fb-ig unaffected (Regla 6) | MIG-02 | Requires a live manychat agent run | Plan 08 Step F: confirm a manychat FB/IG agent still works unchanged |

*Live Meta behaviors mirror the Phase 39 pattern: primitives + tag/window logic are unit-tested; end-to-end send/receive is operator UAT. Human Agent feature may be time-gated on App Review (like P39 WA-09) → record as deferred UAT, not failure.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 1 RED dependencies (checkpoints excepted: 40-00-T2, 40-08-T2)
- [x] Sampling continuity: no 3 consecutive auto tasks without automated verify
- [x] Wave 1 covers all MISSING references (six RED files)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (pending execution)
