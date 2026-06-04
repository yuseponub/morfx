---
phase: 40
slug: facebook-messenger-direct
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
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

> Filled by the planner per task. Every task maps to a requirement, an automated command, and (where applicable) a threat ref. Regla 6 parity tests (flag=`manychat` leaves the ManyChat path untouched) are first-class verification rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _(planner fills)_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> The planner declares the RED test files for the Meta Messenger surface here. Likely targets (mirror P39 Wave 0):
> - `src/lib/channels/__tests__/meta-facebook-sender.test.ts` — text + image send, 24h-window gate, HUMAN_AGENT tag clamping
> - `src/lib/domain/__tests__/messages-provider-messenger.test.ts` — `readMessengerProvider` chokepoint branch (meta_direct vs manychat), Regla 6 parity
> - `src/app/api/webhooks/meta/__tests__/messenger-inbound.test.ts` — `object==='page'` routing by page_id, PSID string preservation
> - PSID→contact create-or-get idempotency by `(page_id, PSID)`

*If existing infrastructure covers a requirement, the planner notes it instead of a new file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FB Embedded Signup connect + Page token store | SIGNUP-04 | Requires real Meta popup + a real Facebook Page; no headless path | Operator clicks "Conectar Facebook", authorizes, confirms `workspace_meta_accounts` row with `page_id` + page token |
| Live inbound Messenger message → inbox | FB-01, FB-04 | Requires a real message sent to the connected Page | Send a Messenger message to the Page, confirm it appears in the MorfX inbox with "Messenger" indicator |
| Live outbound text + image send | FB-02 | Requires a live Messenger thread inside the 24h window | Reply text + image from inbox, confirm delivery on Messenger |
| HUMAN_AGENT tag send outside 24h | FB-02 (D-09) | Requires >24h-old thread + the Human Agent feature granted | Attempt a send >24h after last inbound; confirm tag-send succeeds (if granted) or clear block message (if not) |

*Live Meta behaviors mirror the Phase 39 pattern: primitives + clamping are unit-tested; end-to-end send/receive is operator UAT.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
