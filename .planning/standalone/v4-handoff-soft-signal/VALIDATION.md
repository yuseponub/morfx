---
phase: v4-handoff-soft-signal
slug: v4-handoff-soft-signal
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-13
---

# v4-handoff-soft-signal — Validation Strategy

> Per-standalone validation contract for feedback sampling during execution.
> Derived from RESEARCH.md § Validation Architecture. No new test FILES are needed —
> existing v4 / engine / interruption suites cover the behavior; Plan 01 UPDATES existing
> assertions (storage.handoff no longer called on v4 handoff).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/engine/__tests__/ src/lib/agents/interruption-system-v2/__tests__/` |
| **Estimated runtime** | ~60–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` (tsc=0 predicts green Vercel deploy — build memory)
- **After every plan wave:** Run the full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green + tsc=0
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement (D-) | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|------------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 1 | D-03/D-04 (EngineOutput fields) | T-hs-01 | handoffSuggested set internally only; no external spoof path | type | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 01-02 | 01 | 1 | D-04 (suppress storage.handoff; set signal) | T-hs-03 | session stays active in soft mode | type | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 01-03 | 01 | 1 | D-01/D-02/D-08 (emit handoff_suggested; R0/R1 ack; exclude interrupt) | T-hs-02 | audit event written w/ sessionId/turnId | unit | `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts` | ✅ | ⬜ pending |
| 01-04 | 01 | 1 | D-04/D-07 (gate executeHandoff on !handoffSuggested; flip assertions) | T-hs-03 | existing agents call executeHandoff unchanged (Regla 6) | unit | `npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/engine/__tests__/ src/lib/agents/interruption-system-v2/__tests__/` | ✅ | ⬜ pending |
| 03-01 | 03 | 1 | D-06 (zombie suppression — Inngest path) | — | only V4_ZOMBIE+ckpt_0 suppressed; other errors visible | unit | `npx vitest run src/inngest/functions/__tests__/ 2>/dev/null || npx tsc --noEmit` | ✅ | ⬜ pending |
| 03-02 | 03 | 1 | D-06 (zombie suppression — inline path) | — | only V4_ZOMBIE+ckpt_0 suppressed; later/incomplete zombies visible | unit | `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` | ✅ | ⬜ pending |
| 02-01 | 02 | 2 | D-05 (inbox note insert) | T-hs-02 | direction:'outbound' note, NOT sent to customer; admin client (no silent 0-row) | type | `npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all behaviors.* No new test files needed:
- Plan 01 UPDATES existing assertions (the v4/engine suites that asserted `storage.handoff` / `handoffSession` was called on a v4 handoff outcome flip to assert it is NOT called + `handoffSuggested === true`). RESEARCH § Validation Architecture confirms this is an assertion edit, not a new file.
- Plan 03 (zombie suppression) is a narrowly-scoped conditional skip — no new test file (RESEARCH § Wave 0 gaps).
- Plan 02 (inbox note) is verified by tsc + the Regla-3 admin-client check (A1) already in the plan's read_first.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inbox note renders as `⚠ HANDOFF SUGERIDO — motivo: X` (not sent to customer) | D-05 | v4 is DORMANT in prod — no live traffic to assert against until activation; UI render is visual | After activation (or sandbox), trigger a content-gap handoff (e.g. low_confidence) and confirm an `direction:'outbound'` note appears in the inbox conversation WITHOUT a corresponding WhatsApp send |
| Zombie `ckpt_0` no longer shows `[ERROR AGENTE]` in inbox; observability event still present | D-06 | requires back-to-back inbound messages to produce a zombie lambda; benign-case is timing-dependent | Send 2 rapid messages to a v4 conversation; confirm no `[ERROR AGENTE] V4_ZOMBIE_LAMBDA_EXIT` note in inbox, but `zombie_lambda_exit` event still in `agent_observability_events` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has tsc and/or vitest)
- [x] Wave 0 covers all MISSING references (none — existing infra)
- [x] No watch-mode flags (all `vitest run`, not `vitest`)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-13
