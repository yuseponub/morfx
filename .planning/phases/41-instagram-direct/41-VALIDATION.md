---
phase: 41
slug: instagram-direct
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-05
planned: 2026-06-05
plans: TBD
waves: TBD
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sibling of Phase 40 (Facebook Messenger Direct) — IG clones the FB test shape.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (repo root) |
| **Quick run command** | `npx vitest run src/lib/instagram/ src/lib/meta/__tests__/instagram-api.test.ts src/lib/channels/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30s (quick), full suite minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (target the touched module).
- **After every plan wave:** Run `npx vitest run` (full suite — Regla 6 regression guard).
- **Before `/gsd-verify-work`:** Full suite green + a LIVE smoke (real IG DM round-trip in/out against the test IG account) must pass.
- **Max feedback latency:** ~30 seconds for the quick run.

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| IG-01 | `object==='instagram'` branch parses `entry[].messaging[]`, routes by `entry.id`, skips `is_echo` | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/instagram-branch.test.ts` | ❌ Wave 0 | ⬜ pending |
| IG-01 / IG-03 | handler resolves contact by `ig-${igsid}`, self-heals `IG-` placeholder, no fuzzy phone/email match | unit | `npx vitest run src/lib/instagram/__tests__/webhook-handler.test.ts` | ❌ Wave 0 | ⬜ pending |
| IG-02 | Send text/image hits `POST /{page_id}/messages` with `recipient:{id:igsid}` (no `messaging_product`) | unit | `npx vitest run src/lib/meta/__tests__/instagram-api.test.ts` | ❌ Wave 0 | ⬜ pending |
| IG-02 / MIG-02 | domain `instagram` arm branches on `instagram_provider`; manychat sub-arm byte-identical | unit | `npx vitest run src/lib/domain/__tests__/messages-instagram.test.ts` | ❌ Wave 0 | ⬜ pending |
| IG-05 | outside-24h → block decision (reused `window-gate.ts`) | unit | covered by existing `window-gate` FB tests (REUSE — no new file) | ✅ (FB tests) | ⬜ pending |
| MIG-02 / Regla 6 | default `manychat`; meta IG sender NOT in channel-keyed map; `godentist-fb-ig` 0-diff | unit + grep | `npx vitest run` + grep assertions (Pitfall 4) | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/webhooks/meta/__tests__/instagram-branch.test.ts` — IG-01 (sample IG payload from RESEARCH §Code Examples)
- [ ] `src/lib/instagram/__tests__/webhook-handler.test.ts` — IG-01 / IG-03 (IGSID identity + self-heal)
- [ ] `src/lib/meta/__tests__/instagram-api.test.ts` — IG-02 (Send API shape)
- [ ] `src/lib/domain/__tests__/messages-instagram.test.ts` — IG-02 / MIG-02 + Regla 6 manychat byte-identity
- [ ] Regla 6 grep assertions (Pitfall 4): meta IG sender absent from channel-keyed map; `godentist-fb-ig` IG path untouched
- (window-gate: REUSE existing FB tests — no new file)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real IG DM round-trip (inbound DM → inbox; outbound text+image → IG) | IG-01/02/03/04 | Needs a real IG Professional account + live Meta webhook delivery | Connect the test IG account (Varixcenter/Pruebas Morfx Page), send a DM from a personal IG → verify it lands in the inbox with name + "Instagram" indicator; reply text + image from the inbox → verify delivery on IG |
| **A1 linchpin:** webhook `entry.id` == stored `ig_account_id` | IG-01 | Only confirmable against live Meta delivery | Wave-0 smoke: log inbound `entry.id`, compare to the `ig_account_id` resolved from `instagram_business_account{id}` at connect time |
| **A2 linchpin:** IG DM delivery via existing Page `subscribed_apps` vs per-account IG subscribe | IG-01 | Subscription behavior only verifiable live | Wave-0 smoke: after connect, send a DM and confirm webhook fires; if not, add the per-account IG subscribe and re-test |
| 24h window block UX (send disabled outside window) | IG-05 | HUMAN_AGENT not approved → must backdate window to test | Backdate `last_customer_message_at` to −25h via SQL; verify send blocks with the Spanish window-closed message |

---

## Validation Sign-Off

- [ ] All tasks have an automated verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING test files
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick run)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
