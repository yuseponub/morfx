---
phase: 39
slug: whatsapp-outbound-templates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 39 — Validation Strategy

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
- **After every plan wave:** Run `npx vitest run` (full suite — confirm Regla 6: 360dialog/Somnio paths byte-identical)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Filled by the planner per task. Every task maps to a requirement, an automated command, and (where applicable) a threat ref. Regla 6 parity tests are first-class verification rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | MIG-03 | — | provider routing resolves correct sender; 360dialog `send(apiKey,...)` byte-identical | unit | `npx vitest run src/lib/channels/__tests__/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for the provider-routing chokepoint (360dialog parity + meta_direct path) — MIG-03
- [ ] Test stubs for `metaWhatsappSender` payload shapes (text, media, template, interactive) — WA-01..04
- [ ] Test stubs for Meta CDN media upload-then-send + inbound download/rehost — WA-02/WA-06
- [ ] Test stubs for template CRUD + status-webhook handler + edit-constraints guard — WA-08/WA-09
- [ ] Existing vitest infrastructure covers the rest (framework present — no install needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end live send/receive on test number +57 310 5197782 | WA-01..09 | Requires real Meta WABA + live WhatsApp client; cannot be mocked in CI | After full surface built, flip test number to `meta_direct` via SQL, send each message type from inbox, confirm recipient receives identically to 360dialog |
| Template approval status arriving via webhook push | WA-09 | Depends on Meta's async review + real webhook delivery | Create a template, observe `message_template_status_update` webhook updates status without polling |

*Refined by the planner; live cutover validation is gated behind the full-surface build (D-01).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] Regla 6 parity test present (360dialog/Somnio byte-identical) and green
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
