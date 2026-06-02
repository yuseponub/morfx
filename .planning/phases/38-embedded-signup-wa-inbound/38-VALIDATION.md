---
phase: 38
slug: embedded-signup-wa-inbound
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 38-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (project standard — used across `src/lib/agents/**/__tests__/`) |
| **Config file** | project root (existing vitest config) |
| **Quick run command** | `npx vitest run src/app/api/webhooks/meta/ src/lib/meta/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5-15 seconds (scoped); full suite longer |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/app/api/webhooks/meta/ src/lib/meta/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite green + manual smoke (D-13)
- **Max feedback latency:** ~15 seconds (scoped)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-W0 | — | 0 | HOOK-02 | T-38-spoof | Valid sig passes; tampered/length-mismatch returns false (no throw) | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/hmac.test.ts` | ❌ W0 | ⬜ pending |
| 38-W0 | — | 0 | HOOK-01 | — | GET echoes `hub.challenge` on correct verify_token; 403 otherwise | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/handshake.test.ts` | ❌ W0 | ⬜ pending |
| 38-W0 | — | 0 | HOOK-04 | T-38-replay | Duplicate wamid → no second DB row | integration | exercise `processWebhook` twice with same wamid | ❌ W0 (may be covered) | ⬜ pending |
| 38 | — | — | WA-05 | — | Meta payload → message in inbox identical to 360dialog | integration | `npx vitest run src/lib/whatsapp/__tests__/` | ✅ existing | ⬜ pending |
| 38-W0 | — | 0 | SIGNUP-02 | T-38-secret-leak | code→BISUAT builds correct URL, parses access_token, unauthenticated (no Bearer) | unit | `npx vitest run src/lib/meta/__tests__/embedded-signup.test.ts` | ❌ W0 | ⬜ pending |
| 38-W0 | — | 0 | SIGNUP-03 | — | subscribeWaba POSTs to `/{waba}/subscribed_apps`, throws if not success | unit | `npx vitest run src/lib/meta/__tests__/embedded-signup.test.ts` | ❌ W0 | ⬜ pending |
| 38 | — | — | Regla 6 | — | 360dialog route + processWebhook byte-identical for non-meta workspaces | regression | `git diff` on webhook-handler.ts = 0 + existing tests green | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/webhooks/meta/__tests__/hmac.test.ts` — covers HOOK-02 (valid/tampered/length-mismatch)
- [ ] `src/app/api/webhooks/meta/__tests__/handshake.test.ts` — covers HOOK-01 (challenge echo + 403)
- [ ] `src/lib/meta/__tests__/embedded-signup.test.ts` — covers SIGNUP-02/03 (exchange URL shape + subscribe contract; mock `fetch`)
- [ ] Confirm existing `processWebhook` dedup test covers HOOK-04 (Meta retry); if not, add one
- [ ] No framework install needed (Vitest present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GET handshake responds `hub.challenge` to Meta | HOOK-01 | Requires live Meta webhook config in dashboard | Configure webhook URL in Meta App, confirm "Verified" green check |
| Real inbound message visible in inbox | WA-05 / D-13 | Requires Live mode + real number off 360dialog | Send WhatsApp from real number → confirm message in MorfX inbox identical to 360dialog |
| Dedup confirmed (Meta retry no dup) | HOOK-04 / D-13 | Requires real Meta retry behavior | Observe Meta retry → confirm single `messages` row |
| Somnio 100% operational on 360dialog | Regla 6 / D-13 | Production agent must stay intact | Confirm Somnio still receives/responds on 360dialog post-deploy |
| Embedded Signup popup → token stored | SIGNUP-01/02/03 | Requires live FB SDK popup + Meta auth | Click "Conectar WhatsApp" → authorize → confirm encrypted row in `workspace_meta_accounts` + subscription active |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
