# UAT — debounce-interruption-system-v2

**Date:** 2026-05-26
**Approver:** Jose Romero (joseromerorincon041100@gmail.com)
**Standalone status:** APPROVED to merge to main with explicit Phase 3 + Phase 4 deferrals
**Plans shipped:** 00, 01, 02, 03, 04, 05, 06, 07 (8 plans)

This document records the user acceptance gates for D-19 (the locked 4-phase ship criterion
from `DISCUSSION-LOG.md` line 185: "Criterio de ship: las 4 fases pasan sin issues. Si Fase
3 o 4 falla, no se promueve a prod."). REVISION W4 adds an explicit, BLOCKING sign-off
entry for the S3 deferral.

This document supersedes the implicit "Phase 3 + Phase 4 must run on Vercel preview" reading
of D-19. With this UAT signed off, the standalone ships with v4 DORMANT, and the manual
smokes are deferred per the user's decision recorded on 2026-05-26.

---

## D-19 Phase 1 (Unit Tests — Vitest)

**Scope:** All primitives in `src/lib/agents/interruption-system-v2/` exercised by their
respective test files, plus the consumer-side test files added by Plans 03+04+06.

- [x] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 — covers
  LOCK-01 (lock.ts), LOCK-02 (pending.ts), LOCK-03 (checkpoints.ts), LOCK-05 (observability.ts),
  LOCK-07 (lock-event union).
- [x] 40/40 vitest tests across the module:
  - `lock.test.ts` — 12 tests (LOCK-01, LOCK-07 — Lua RELEASE_IF_OWNER + fencing token).
  - `observability.test.ts` — 6 tests (LOCK-05 — 14 D-17-extended label union, dual emission).
  - `pending.test.ts` — 10 tests (LOCK-02 — Pitfall 4 byte-exact LREM negative case).
  - `checkpoints.test.ts` — 8 tests (LOCK-03 — all 8 D-18 CheckpointId values, proceed /
    zombie / interrupted-A / interrupted-B paths).
  - `e2e-scenarios.test.ts` — 4 tests (Phase 2 — see below).
- [x] 10 Plan 03 lock-event tests in `src/inngest/functions/__tests__/agent-production-lock-event.test.ts`
  (D-14 concurrency invariant + 6 OPTIONAL event.data fields propagation + backward compat).
- [x] 11 Plan 04 V4MessagingAdapter tests in `src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts`
  (3 parent Regla 6 preservation + 8 V4 override semantics — Path A / Path B / LREM-self / fencing).
- [x] 12 Plan 06 cron tests in `src/inngest/functions/__tests__/v2-lock-cleanup-cron.test.ts`
  (SCAN cursor loop, active-session filter, MAX_TURN_AGE_S boundary, `lock_orphan_swept_by_cron`
  emission, REVISION B1 `active_sessions_checked` in output shape).

**Total interruption-system-related tests: 73 green.**

**Result: PASSED.**

---

## D-19 Phase 2 (E2E Scenarios — Vitest mock-redis)

**Scope:** `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` exercises
the full S1-S4 scenario matrix end-to-end using the `createMockRedis` helper from Plan 01
plus the production code paths in `lock.ts`, `pending.ts`, and `checkpoints.ts`.

- [x] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts`
  exits 0 — 4 scenarios pass:
  - **S1 (solo path):** msg1 processes alone. Asserts `lock_acquired` +
    `lock_released_normal` emitted (≥ 2 events).
  - **S2 (race):** msg1 holds, msg2 fails to acquire and writes interrupt. Holder runs
    `ckpt_1_post_comprehension`, detects interrupt, returns Path A combined. Asserts
    `lock_acquired` + `lock_acquire_failed_follower` + `interrupt_written` +
    `msg_aborted_path_a_combined` + `pending_list_combined` + `lock_released_normal`
    (≥ 6 events).
  - **S3 (TTL expiry / zombie lambda):** Holder1 acquires, mock simulates TTL expiry via
    `mockRedis.__simulateTtlExpiry`, Holder2 force-acquires (new UUID), Holder1's
    `assertHoldsLock` returns false → `zombie_lambda_exit`. Asserts
    `lock_force_acquired_after_ttl_expiry` + `zombie_lambda_exit` (≥ 2 events).
  - **S4 (Path B solo):** Holder sends 1 template (lock value patched to
    `has_sent_anything=true`), interrupt arrives, `ckpt_7_pre_template` returns
    `proceed:false`, holder emits `msg_aborted_path_b_solo`, releases normally. Asserts
    `interrupt_written` + `msg_aborted_path_b_solo` + `lock_released_normal` (≥ 4 events).
- [x] All 4 label-assertion sets match the locked 14-value `LockEventLabel` union
  (REVISION B1 — includes `lock_orphan_swept_by_cron`).
- [x] Sanity sweep: full module test directory exits 0 (no regression in Plans 01+02 tests
  from the e2e additions).

**Result: PASSED.**

---

## D-19 Phase 3 (Vercel preview + real WhatsApp smoke) — **DEFERRED**

**Status:** DEFERRED to fecha de activación real de v4 (per user decision recorded
2026-05-26).

**User decision rationale:** When a specific workspace is eventually flipped to
`conversational_agent_id='somnio-sales-v4'` via the activation SQL documented in
`HANDOFF.md`, the smoke will run against that workspace's preview (or the production
deployment immediately post-flip) at that exact moment. Running the smoke now against a
synthetic FORCE_V4_FOR_PHONE override on a preview branch would:

1. Require shipping temporary override code (`FORCE_V4_FOR_PHONE` env-var hack proposed in
   `07-PLAN.md` Task 7.3 option (b)) that must be removed before merge — net negative for
   merge cleanliness and a Pitfall 5 risk (preview/prod env-var bleed-over).
2. Not exercise any prod traffic path that's different from the eventual real activation
   path (same code, same env vars in Production env).
3. Defer the same exercise by only days/weeks — the activation moment is the natural smoke
   window.

**Confidence basis:**

- **Phase 1+2 coverage:** 73 tests across the module + Plans 03+04+06 cover every
  primitive and every emission site. The full S1-S4 matrix passes against mock-redis with
  byte-identical contracts to real Upstash (`SET NX`, Lua `RELEASE_IF_OWNER`, `keepTtl`,
  list operations).
- **Regla 6 hand-trace verified across all 5 non-v4 agents** (HANDOFF.md table — `v3`,
  `godentist`, `godentist-fb-ig`, `recompra`, `pw-confirmation` all unchanged adapter +
  unchanged runner + `byte-identical` status). The webhook handler v4 gate (`if
  (resolvedAgentId === 'somnio-sales-v4')`) skips the lock-system entirely for non-v4
  traffic.
- **v4 is DORMANT in prod:** 0 workspaces have `conversational_agent_id='somnio-sales-v4'`.
  No `lock:*` keys exist in Upstash today; no `agent_observability_events` rows with the 14
  new labels exist. The cron `v2-lock-cleanup-cron` sweeps nothing.
- **Rollback is trivial:** if S1-S4 misbehave at activation time, the SQL
  `UPDATE workspace_agent_config SET conversational_agent_id='<previous>' WHERE workspace_id='<uuid>';`
  reverts the workspace in <1s. Recovery time bounded by the routing cache TTL.

**Resume signal placeholder (to be filled at activation):**
`approved Phase 3 — <ws-uuid> activated <date> — S1 ✓ S2 ✓ S3 skipped per REVISION W4
plan S4 ✓ — no errors`.

---

## D-19 Phase 4 (Visual smoke — sandbox + Inngest + Vercel logs) — **DEFERRED**

**Status:** DEFERRED to a follow-up standalone provisionally named
`debounce-v2-sandbox-integration` (yet to be created).

**Why "deferred to follow-up" and not "checked off as-is":** The sandbox surface added by
Plan 06 (Interruption tab in `/sandbox` debug panel + `/api/observability/events` route)
is structurally complete but ONLY meaningful when the sandbox engine actually executes the
lock-system. Today the sandbox runs through `SomnioV4Engine` — a lighter wrapper distinct
from production's `V4ProductionRunner` — and:

1. `SomnioV4Engine` does NOT call `acquireLock` / `startHeartbeat` / `releaseLockIfOwner`.
   The sandbox never holds a lock, never writes pending entries, never emits any of the
   14 lock events.
2. The checkpoints wired into `somnio-v4-agent.ts` (CKPT-1, CKPT-2) and
   `sub-loop/index.ts` (CKPT-3, CKPT-4, CKPT-5) are guarded with
   `if (ctx.lockHandle != null) checkpoint(...)` — they are **skipped** when the sandbox
   invokes them because the sandbox never threads a `lockHandle` into `SubLoopContext`.
3. As a result, "visual smoke in sandbox" as planned in Task 7.4 of `07-PLAN.md` would
   confirm only that the tab renders an empty state — it would not exercise the
   lock-system at all.

The proposed follow-up standalone `debounce-v2-sandbox-integration` will:

- Wire `acquireLock` + `releaseLockIfOwner` into `SomnioV4Engine` (sandbox-scoped Upstash
  keys to avoid sandbox/prod collision: `lock:sandbox:<session-id>:...` namespace).
- Thread `lockHandle` into the `SubLoopContext` passed from `SomnioV4Engine` to
  `runRagSubLoop` / `runLegacySubLoop`.
- Surface a `SANDBOX_MODE` env-var or flag on the engine so the lock-system can degrade
  gracefully (no real interrupt cross-talk between sandbox sessions).
- Then re-run the visual smoke in the sandbox Interruption tab to assert the 14-event
  lifecycle is observable.

Until then, the sandbox Interruption tab remains present (Plan 06 ship) but inert from a
testing perspective — exactly what the v4-dormant-in-prod state mirrors.

**Resume signal placeholder (to be filled after follow-up standalone):**
`approved Phase 4 — sandbox integration follow-up standalone shipped <date> — Interruption
tab observed lifecycle events S1 ✓ S2 ✓ S4 ✓`.

---

## REVISION W4 — Explicit S3 Deferral Acknowledgment (BLOCKING)

Scenario S3 (TTL expiry / zombie lambda) is covered by Vitest E2E mock-redis test ONLY.
Manual reproduction on Vercel preview is DEFERRED because it would require artificial hang
induction in production code (e.g., a temporary debug endpoint that holds a lock past
TTL), which we explicitly do NOT want shipped even to preview.

**Confidence: HIGH that S3 path works.**

Coverage breakdown:

- **Unit tests:** `assertHoldsLock` returns false on UUID mismatch (`lock.test.ts` — 4
  cases: same uuid + same key passes; same uuid + different key fails; different uuid +
  same key fails; missing key fails).
- **Unit tests:** Lua `RELEASE_IF_OWNER` does NOT delete a foreign lock — owner mismatch
  returns 0, key remains (`lock.test.ts`).
- **Unit tests:** force-acquire succeeds when the prior key has expired
  (`__simulateTtlExpiry` in `mock-redis.ts` — second `acquireLock` returns a fresh UUID
  with the key newly set).
- **E2E test:** full S3 sequence in `e2e-scenarios.test.ts` S3 case asserts
  `lock_force_acquired_after_ttl_expiry` + `zombie_lambda_exit` event emission order with
  correct payloads (previous_holder_uuid + current_holder_uuid mismatch).

`S3 deferral acknowledged: 2026-05-26 by user (Jose Romero) — covered by Vitest e2e-scenarios.test.ts S3 case; manual reproduction on Vercel preview deferred indefinitely per D-19 line 185 ship criterion interpretation accepted.`

- [x] **REVISION W4 ACKNOWLEDGMENT:** User acknowledges S3 is covered by Vitest E2E only;
  manual reproduction deferred; HIGH confidence accepted.

---

## Pre-merge blockers cleared

- [x] No temporary `FORCE_V4_FOR_PHONE` override or similar test-only flag introduced in
  any of the 8 plans. Phase 3 deferral means this code was never written. `git diff main`
  shows only the per-plan diffs.
- [x] No diagnostic routes leftover. `src/app/api/_diagnostics/` absent.
- [x] Vercel Production env vars `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  populated with PROD Upstash creds (Plan 00 Task 0.3).
- [x] Vercel Preview env vars `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  populated with DEV Upstash creds (Pitfall 5 isolation).
- [x] **REVISION B4:** `src/lib/agents/registry-helpers.ts` exists and exports
  `resolveAgentIdForWorkspace`. Webhook handlers (`src/lib/whatsapp/webhook-handler.ts`,
  `src/lib/manychat/webhook-handler.ts`) STATIC-import from it (no `await import(...)`
  dynamic-import circular risk).
- [x] **REVISION W3:** `grep -c "createAdminClient" src/lib/agents/engine/v4-production-runner.ts`
  returns 0 — no new `createAdminClient` introduced. Channel/identifier threaded via
  `input.lockChannel` + `input.lockIdentifier` on `EngineInput`.
- [x] **REVISION B1:** `LockEventLabel` union has 14 entries (includes
  `lock_orphan_swept_by_cron`). `agent_observability_events` payload preserved on dual
  emission (console + collector).
- [x] **REVISION B2:** Plan 06 `depends_on` correctly lists `[01, 02, 04, 05]` in its
  frontmatter; cron + sandbox-tab ship was correctly Wave 5 not Wave 4.
- [x] **REVISION W7:** `00-MEASUREMENTS.md` records `keepTtl SUPPORTED` verdict; Plan 04
  `V4MessagingAdapter.onFirstSendCompleted` uses `{ keepTtl: true }` to update lock value
  without resetting TTL (no race between heartbeat renewal and "first send done"
  side-write).
- [x] CheckpointId names are spec-locked (8 D-18 values — `ckpt_0_post_acquire` through
  `ckpt_7_pre_template`); divergent draft names in Plan 02 orchestrator prompt were
  correctly ignored by the executor in favor of the locked spec.
- [x] All 8 D-18 CheckpointId placements wired across Plans 04+05 (CKPT-0 + CKPT-6 in
  runner; CKPT-1 + CKPT-2 in agent; CKPT-3 + CKPT-4 + CKPT-5 in RAG sub-loop; CKPT-7.N
  in V4MessagingAdapter override).

---

## Ship verdict

**APPROVED to merge to main** with the following EXPLICIT DEFERRALS:

1. **D-19 Phase 3** (Vercel preview + real WhatsApp smoke) — deferred to v4 activation
   moment per workspace. User decision 2026-05-26.
2. **D-19 Phase 4** (sandbox visual smoke) — deferred to follow-up standalone
   `debounce-v2-sandbox-integration`. The current sandbox engine
   (`SomnioV4Engine`) does not exercise the lock-system; the follow-up will wire
   `acquireLock` + `releaseLockIfOwner` + thread `lockHandle` into the sandbox engine so
   the surface added by Plan 06 (Interruption tab + observability events route) is
   actually meaningful in dev.
3. **REVISION W4 S3 deferral** — Vitest-only coverage accepted; manual reproduction
   permanently deferred (no operational benefit without artificial hang-induction).

Risks deferred forward-looking (already in `HANDOFF.md`):

- Multi-Zone HA at Upstash: re-evaluate at v4 flip-to-active.
- FB/IG inbound dedup gap: `messages` lacks UNIQUE on FB/IG message ID — closes when v4
  begins serving FB/IG (separate standalone).
- In-region Vercel→Upstash latency unvalidated: WSL-local upper-bound numbers only.
  Phase 42.1 observability work closes this.

## Sign-off

Approved to merge: 2026-05-26 — Jose Romero (joseromerorincon041100@gmail.com)
