---
phase: 39
slug: whatsapp-outbound-templates
status: draft
nyquist_compliant: true
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
| 39-01-01 | 01 | 1 | MIG-03 | T-39-02 | provider routing resolves creds from ctx.workspaceId; 360dialog `send(apiKey,...)` byte-identical (Regla 6 parity) | unit (RED scaffold) | `npx vitest run src/lib/domain/__tests__/messages-provider.test.ts 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | WA-01, WA-02, WA-03, WA-04, WA-06, WA-07 | — | send/media/interactive payload contracts pinned; caption/filename gating; clamp limits | unit (RED scaffold) | `npx vitest run src/lib/meta/__tests__/send.test.ts src/lib/meta/__tests__/media.test.ts src/lib/channels/__tests__/meta-whatsapp-sender.test.ts 2>&1 \| tail -25` | ❌ W0 | ⬜ pending |
| 39-01-03 | 01 | 1 | WA-08, WA-09 | T-39-04 | template CRUD + D-05 edit guard + WA-09 status-update + HMAC gate pinned | unit (RED scaffold) | `npx vitest run src/lib/meta/__tests__/templates.test.ts src/app/api/webhooks/meta/__tests__/template-status.test.ts 2>&1 \| tail -25` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | WA-01, WA-02, WA-03, WA-07 | T-39-01 | media/interactive/read-receipt helpers; caption gated by type; token never logged | unit (tdd) | `npx vitest run src/lib/meta/__tests__/send.test.ts 2>&1 \| tail -15 && npx tsc --noEmit 2>&1 \| grep -E "meta/api" \|\| echo "no new tsc errors in meta/api"` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 2 | WA-04, MIG-03 | T-39-05 | metaWhatsappSender clamps buttons/title/sections/rows; not registered in channel-keyed map | unit (tdd) | `npx vitest run src/lib/channels/__tests__/meta-whatsapp-sender.test.ts 2>&1 \| tail -15 && grep -c "senders\[" src/lib/channels/registry.ts` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 2 | WA-06 | T-39-07 | multipart upload (not metaRequest); two-step Bearer download; SSRF host check + size cap | unit (tdd) | `npx vitest run src/lib/meta/__tests__/media.test.ts 2>&1 \| tail -15` | ❌ W0 | ⬜ pending |
| 39-03-02 | 03 | 2 | WA-08 | T-39-08 | template CRUD shapes; D-05 edit guard (name/language immutable + status-gated) | unit (tdd) | `npx vitest run src/lib/meta/__tests__/templates.test.ts 2>&1 \| tail -15` | ❌ W0 | ⬜ pending |
| 39-04-01 | 04 | 3 | WA-01, WA-02, WA-03, MIG-03 | T-39-02 | domain chokepoint provider branch; meta_direct routes to metaWhatsappSender; 360dialog byte-identical | unit (tdd) | `npx vitest run src/lib/domain/__tests__/messages-provider.test.ts 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 39-04-02 | 04 | 3 | WA-08, MIG-01, MIG-03 | T-39-09 | template create routes to createTemplateMeta (meta_direct) / createTemplate360 (360dialog unchanged) | unit (tdd) | `npx vitest run src/lib/meta/__tests__/templates.test.ts 2>&1 \| tail -10 && npx tsc --noEmit 2>&1 \| grep -E "whatsapp-templates" \|\| echo "no new tsc errors"` | ❌ W0 | ⬜ pending |
| 39-05-01 | 05 | 4 | WA-07, MIG-03 | T-39-01 | markMessageAsRead meta_direct arm; 360dialog markRead360 byte-identical; token never logged | grep + tsc | `grep -nE "whatsapp_provider\|markWhatsAppRead\|markRead360" src/app/actions/messages.ts && (npx tsc --noEmit 2>&1 \| grep -E "actions/messages" \|\| echo "no new tsc errors")` | ❌ W0 | ⬜ pending |
| 39-05-02 | 05 | 4 | WA-03, MIG-03 | T-39-02 | both send360Template bypass sites rewired through domain via findOrCreateConversation; 131047 closed | grep + unit | `(grep -rnE "send360Template" src/lib/automations/action-executor.ts src/lib/domain/contact-reviews.ts \| grep -vE "^\s*//" \|\| echo "0 direct bypass imports remain") && grep -nE "findOrCreateConversation\|sendTemplateMessage" src/lib/automations/action-executor.ts src/lib/domain/contact-reviews.ts && npx vitest run src/lib/domain/__tests__/messages-provider.test.ts 2>&1 \| tail -8` | ❌ W0 | ⬜ pending |
| 39-06-01 | 06 | 4 | WA-09 | T-39-04 | template-status webhook updates local row; REJECTED writes rejected_reason; HMAC gates forged/unsigned | unit (tdd) | `npx vitest run src/app/api/webhooks/meta/__tests__/template-status.test.ts 2>&1 \| tail -15` | ❌ W0 | ⬜ pending |
| 39-06-02 | 06 | 4 | WA-06 | T-39-07 | inbound Meta media routes through downloadAndRehostMedia (Bearer); 360dialog inbound byte-identical | grep + full suite | `grep -nE "downloadAndRehostMedia\|resolveByWorkspace" src/lib/whatsapp/webhook-handler.ts && npx vitest run 2>&1 \| tail -6` | ❌ W0 | ⬜ pending |
| 39-07-01 | 07 | 4 | WA-08, MIG-03 | T-39-08 | provider-aware delete/list/sync + editTemplate action; D-05 enforced; creds from ctx | grep + tsc | `grep -nE "whatsapp_provider\|editTemplateMeta\|deleteTemplateMeta\|syncTemplateStatusMeta" src/app/actions/templates.ts && (npx tsc --noEmit 2>&1 \| grep -E "actions/templates" \|\| echo "no new tsc errors")` | ❌ W0 | ⬜ pending |
| 39-07-02 | 07 | 4 | WA-08 | T-39-08 | status-gated edit UI (Edit only APPROVED/REJECTED/PAUSED); name/language never editable; 24h/30d warning | grep + tsc | `grep -nE "APPROVED\|PENDING\|DISABLED\|editTemplate\|Duplicar\|24h" "src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx" && (npx tsc --noEmit 2>&1 \| grep -E "template-list" \|\| echo "no new tsc errors")` | ❌ W0 | ⬜ pending |
| 39-08-01 | 08 | 5 | WA-01..09, MIG-01, MIG-03 | T-39-09 | phase gate: full suite green + tsc clean + deploy BEFORE any flip | full suite | `npx vitest run 2>&1 \| tail -8` | ✅ (suite exists) | ⬜ pending |
| 39-08-02 | 08 | 5 | MIG-01 | T-39-10 | cutover SQL flip — operator-only, single test workspace; confirm target before UPDATE | manual (checkpoint:human-action) | MANUAL — operator runs single-workspace SQL flip + SELECT confirmation (no automated cmd; gated by Task 1 full-suite green) | n/a | ⬜ pending |
| 39-08-03 | 08 | 5 | WA-01..09 | T-39-09 | live smoke all message types on test number; Regla 6 spot-check on 360dialog | manual (checkpoint:human-verify) | MANUAL — live send/receive on +57 310 5197782 per Manual-Only Verifications (no automated cmd; CI cannot mock real Meta WABA) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Note: 39-08-02 and 39-08-03 are the only tasks without an `<automated>` command — both are `checkpoint:human-action`/`checkpoint:human-verify` live-cutover tasks (real Meta WABA cannot be mocked in CI, per Manual-Only Verifications + D-01). They follow 39-08-01 (full automated suite) in the same wave, so there are never 3 consecutive tasks without an automated verify.

---

## Wave 0 Requirements

- [ ] Test stubs for the provider-routing chokepoint (360dialog parity + meta_direct path) — MIG-03 (39-01-01)
- [ ] Test stubs for `metaWhatsappSender` payload shapes (text, media, template, interactive) — WA-01..04 (39-01-02)
- [ ] Test stubs for Meta CDN media upload-then-send + inbound download/rehost — WA-02/WA-06 (39-01-02)
- [ ] Test stubs for template CRUD + status-webhook handler + edit-constraints guard — WA-08/WA-09 (39-01-03)
- [ ] Existing vitest infrastructure covers the rest (framework present — no install needed)

> Wave 0 = Plan 39-01 (all six RED test files). It covers every MISSING `<automated>` reference consumed by Waves 2-4. `wave_0_complete` flips to `true` only when those six suites are committed (RED-on-assertion) during execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end live send/receive on test number +57 310 5197782 | WA-01..09 | Requires real Meta WABA + live WhatsApp client; cannot be mocked in CI | After full surface built, flip test number to `meta_direct` via SQL, send each message type from inbox, confirm recipient receives identically to 360dialog (Plan 08 Task 3) |
| Template approval status arriving via webhook push | WA-09 | Depends on Meta's async review + real webhook delivery | Create a template, observe `message_template_status_update` webhook updates status without polling (Plan 08 Task 3 §7) |
| Single-workspace cutover SQL flip | MIG-01 | Production DB write; wrong target = prod impact (Regla 6) — operator-only | Confirm target via phone_number_id SELECT, UPDATE the test workspace only, verify Somnio + clients still 360dialog (Plan 08 Task 2) |

*Refined by the planner; live cutover validation is gated behind the full-surface build (D-01).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (only the 2 live-cutover checkpoints in Plan 08 are manual — by design, real Meta WABA)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (39-08-01 automated precedes the 2 manual checkpoints)
- [x] Wave 0 covers all MISSING references (Plan 39-01 ships all six RED test files Waves 2-4 verify against)
- [x] No watch-mode flags (all commands are `npx vitest run`, non-watch)
- [ ] Feedback latency < 120s (full suite ~60-120s — confirmed at execution)
- [x] Regla 6 parity test present (360dialog/Somnio byte-identical) — `messages-provider.test.ts`, authored 39-01-01, goes GREEN 39-04-01
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plan-set design APPROVED (nyquist-compliant). `wave_0_complete` + per-task `Status` flip to green during `/gsd-execute-phase`.
