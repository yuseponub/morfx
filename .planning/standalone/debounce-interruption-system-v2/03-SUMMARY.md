---
phase: standalone-debounce-interruption-system-v2
plan: 03
subsystem: webhook-integration
tags: [webhook, inngest, lock, holder-follower, v4-gated, regla-6, redis, observability]

# Dependency graph
requires:
  - phase: standalone-debounce-interruption-system-v2 / plan 01
    provides: "lock primitives (acquireLock, releaseLockIfOwner, LockHandle, LockChannel, LOCK_TTL_S), observability emitter (emitLockEvent + 14-label union), redis Proxy client"
  - phase: standalone-debounce-interruption-system-v2 / plan 02
    provides: "pending list ops (pushToPending with {pendingListLength, exactJson} tuple, removeOwnEntry byte-exact LREM, readAndClearPending atomic multi().del().exec()), PendingEntry interface, CheckpointId union + checkpoint() helper"
provides:
  - "src/lib/agents/registry-helpers.ts — NEW shared module exporting resolveAgentIdForWorkspace (extracted from agent-production.ts:39 verbatim + 'somnio-sales-v4' additive mapping). REVISION B4 — eliminates circular-import risk for webhook handlers."
  - "src/lib/whatsapp/webhook-handler.ts — v4-gated HOLDER/FOLLOWER lock branch integrated into processIncomingMessage. STATIC imports of lock/pending/redis/observability/registry-helpers (NO `await import(...)` for lock code per REVISION B4)."
  - "src/lib/manychat/webhook-handler.ts — same HOLDER/FOLLOWER pattern adapted for FB/IG with channel='facebook'|'instagram' + identifier=external_subscriber_id (raw subscriberId, NOT mc-prefixed)."
  - "src/inngest/functions/agent-production.ts — event.data destructure extended with 6 OPTIONAL fields (lockHolderUuid, lockKey, ownPendingEntryJson, lockChannel, lockIdentifier, agentId aliased as agentIdFromWebhook). REVISION W2 mismatch warning + turn_started recordEvent extended with the 6 correlation fields."
  - "src/inngest/functions/__tests__/agent-production-lock-event.test.ts — 8 unit tests asserting (1) D-14 concurrency invariant literal, (2) event-shape backward compat with pre-v4 callers, (3) REVISION W2 mismatch warning."
affects:
  - Plan 04 — V4ProductionRunner consumes the 6 new event.data fields (lockHandle reconstruction from lockHolderUuid+lockKey; lockChannel/lockIdentifier eliminate conversations-table lookup; ownPendingEntryJson threaded through V4AgentInput → V4MessagingAdapter.onFirstSendCompleted for LREM-self per D-16)
  - Plan 05 — somnio-v4-runner consumes ownPendingEntryJson and channel/identifier to combine pre-acquire pending entries (D-16) at acquire-time via readAndClearPending
  - Plan 07 — E2E scenarios will validate webhook HOLDER/FOLLOWER round-trip against real Upstash (covers the unit-test mocking gap)

# Tech tracking
tech-stack:
  added: []  # No new deps. @upstash/redis from Plan 00; primitives from Plans 01-02.
  patterns:
    - "v4-gated integration: ALL new behavior gated on `resolvedAgentId === 'somnio-sales-v4'`. For non-v4 paths (v3/godentist/recompra/pw-confirmation), the gated block is skipped entirely and the existing code path runs byte-identical to pre-Plan-03 behavior (Regla 6). Pattern reusable for any future architectural rollout where a new subsystem must coexist with N legacy paths."
    - "STATIC import of shared helper to break circular-import risk: registry-helpers.ts is intentionally a leaf module that webhook handlers can STATIC-import. The helper itself may dynamic-import its dependencies (agent-config). Webhook handlers MUST NOT dynamic-import the helper. REVISION B4 — pattern reusable for any 'webhook calls into deep service' case."
    - "Optional fields in Inngest event.data for backward compatibility: 6 new fields are all `field?: T | null` in the destructure cast. Pre-v4 callers that omit them work unchanged; v4 callers populate all 6. Pattern reusable for any event-schema evolution where a subset of callers needs to opt-into new behavior without forcing a synchronous migration."
    - "Race-window elimination via webhook-side resolution + payload propagation: REVISION W2 resolves agentId at webhook entry and passes it through event.data, so the Inngest function destructure can prefer it over a local re-resolve. The mismatch path (extremely rare) logs a warning and honors the webhook's choice (it gated the lock). Pattern reusable when a routing decision happens at request-time but a downstream component might re-resolve and disagree."

key-files:
  created:
    - src/lib/agents/registry-helpers.ts
    - src/inngest/functions/__tests__/agent-production-lock-event.test.ts
  modified:
    - src/inngest/functions/agent-production.ts (local resolveAgentIdForWorkspace removed + extended destructure + W2 mismatch + extended turn_started payload)
    - src/lib/whatsapp/webhook-handler.ts (5 static lock-module imports + v4-gated HOLDER/FOLLOWER branch + 6 new event.data fields)
    - src/lib/manychat/webhook-handler.ts (5 static lock-module imports + v4-gated HOLDER/FOLLOWER branch + 6 new event.data fields)

key-decisions:
  - "ManyChat uses SHARED Inngest event `agent/whatsapp.message_received` — NOT a separate `agent/manychat.message_received`. This was the pre-existing convention; Plan 03 preserves it. Plan 04 runner reads ONE event handler regardless of channel; `lockChannel` discriminates downstream."
  - "ManyChat identifier is the RAW `subscriberId` (the external_subscriber_id from ManyChat) — NOT the `mc-`-prefixed `phoneIdentifier` used for conversation lookup. Per D-10 the lock key is per-subscriber. The `phoneIdentifier` is conversation-scoped (so the conversation row in DB can be found), the lock identifier is subscriber-scoped (so concurrent messages from the same FB/IG subscriber collide on the same lock)."
  - "v4 dormancy attestation honored (Plan 00 Task 0.5): v4 currently DORMANT in production. ALL Plan 03 changes are inert in prod TODAY because the v4 gate evaluates to false for every workspace. The new code path activates only when v4 is flipped on by a separate decision. Regla 6 satisfied without a feature flag — the gate IS the flag."
  - "Critical correction to plan text honored: (1) `AgentId` imported from `@/lib/observability` (not `@/lib/agents/registry`); (2) `'somnio-sales-v4'` was already in the AgentId union — only the mapping line was added; src/lib/observability/types.ts NOT touched."
  - "REVISION W2 mismatch warning path is purely additive — pre-v4 callers (no agentIdFromWebhook) bypass the double-resolve entirely (zero perf cost for v3/godentist/recompra/pw-confirmation). The mismatch is logged via the existing pino logger (label inline so log readers can grep)."
  - "Concurrency setting UNCHANGED per D-14 + RESEARCH lines 918-929: `[{ key: 'event.data.conversationId', limit: 1 }]`. Inline comment added above the clause citing the source. Plan 03 explicitly does NOT raise to 10 or remove. The lock subsystem is the inter-lambda mutex; this clause handles same-lambda replay-storm cases."

patterns-established:
  - "Shared helper module to break circular-import risk: when a deep service component (Inngest function) and a shallow component (webhook handler) need the same logic, extract to a leaf module that both can STATIC-import. The leaf may dynamic-import its own dependencies. Pattern: registry-helpers.ts."
  - "Optional event-schema evolution: add new fields as `field?: T | null` in the destructure cast, set safe defaults inline (`field ?? null`). Old callers work unchanged; new callers populate. Coupled with an event-shape contract test (literal config + populated + omitted cases) for compile-time enforcement of backward compat."
  - "v4-gated rollout WITHOUT feature flag: when an agent is dormant in prod, the agent-id check itself functions as the gate. Skips the feature-flag-management overhead and the false-positive risk of operator misconfiguration."

requirements-completed: [LOCK-01, LOCK-04, LOCK-07]

# Metrics
duration: 30 min
completed: 2026-05-26
---

# Plan 03 Wave 3 — Webhook integration (HOLDER/FOLLOWER lock at webhook entry, v4-gated)

**Both inbound webhook handlers (WhatsApp 360dialog + ManyChat FB/IG) now acquire the lock immediately after resolving workspaceId, branch HOLDER vs FOLLOWER per RESEARCH Pattern 2 (NO follower dispatch — Open Question 1 resolved), and extend the Inngest event with 6 new optional fields. All behavior is v4-gated; v3/godentist/recompra/pw-confirmation paths are byte-identical to pre-Plan-03 behavior (Regla 6).**

## Performance

- **Duration:** ~30 min (Task 3.0 + 3.1 + 3.2 + 3.3 sequential, all autonomous, every task passed verification gates on first run)
- **Started:** 2026-05-26T22:55Z
- **Completed:** 2026-05-26T23:15Z
- **Tasks:** 4 (all autonomous, all single-shot — no deviations beyond what the executor prompt corrected up-front)
- **Files modified:** 5 (2 new + 3 modified)

## Accomplishments

- `src/lib/agents/registry-helpers.ts` (NEW — REVISION B4) exports `resolveAgentIdForWorkspace(workspaceId): Promise<AgentId>`. Extracted verbatim from `src/inngest/functions/agent-production.ts:39` with ONE additive change: `'somnio-sales-v4'` is now recognized as its own bucket so the webhook layer can gate the new lock-based interruption system on the v4 path only. The internal `await import('@/lib/agents/production/agent-config')` is retained inside the helper (allowed — REVISION B4 only forbids dynamic imports FROM webhook handlers).
- `src/lib/whatsapp/webhook-handler.ts` now hosts a v4-gated HOLDER/FOLLOWER block immediately before the existing `useInngest` dispatch:
  - HOLDER: `acquireLock` returns a `LockHandle` → `pushToPending` (RPUSH self ALWAYS per D-16, capture `exactJson`) → emit `lock_acquired` → dispatch Inngest with the 6 new fields populated.
  - FOLLOWER: `acquireLock` returns `null` → `pushToPending` → `redis.set` interrupt key (TTL 60s) → emit `lock_acquire_failed_follower` + `interrupt_written` → `return` WITHOUT dispatching Inngest (Open Question 1 resolved).
  - FAIL-OPEN: `acquireLock` throws (Redis 5xx) → emit `redis_unavailable_fallback_failed` → dispatch Inngest with `lockHolderUuid/lockKey/ownPendingEntryJson = null` but `lockChannel/lockIdentifier/agentId` still populated (accepts residual double-response risk per Open Question 5).
- `src/lib/manychat/webhook-handler.ts` mirrors the same pattern for FB/IG. Channel is `'facebook' | 'instagram'` (computed from `payload.channel`). Identifier is the RAW `subscriberId` (the external_subscriber_id from ManyChat), NOT the `mc-`-prefixed `phoneIdentifier` used for conversation lookup — per D-10 the lock is per-subscriber so concurrent messages from the same FB/IG subscriber collide on the same lock.
- `src/inngest/functions/agent-production.ts` destructure extended with 6 OPTIONAL fields (Regla 6 backward compat). REVISION W2 mismatch warning fires when `agentIdFromWebhook` and the local resolve disagree (extremely rare — workspace routing changed between webhook lock acquire and Inngest dispatch); the webhook's choice is honored. `turn_started` recordEvent payload extended with the 6 correlation fields + `agentIdSource: 'webhook' | 'inngest_local_resolve'` so observability can join webhook lock acquisition with Inngest function execution.
- New test `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — 8 tests across 3 describes asserting (1) D-14 concurrency invariant literal, (2) event-shape backward compat with pre-v4 callers, (3) REVISION W2 mismatch warning fires when both present and disagree but skips entirely when `agentIdFromWebhook` is undefined.
- Total module + new test suite: **44/44 vitest PASS** (36 from Waves 1+2 + 8 new). Zero new tsc errors in any of the 5 modified files.

## Task Commits

Each task was committed atomically on branch `exec/debounce-v2-wave3`:

1. **Task 3.0: REVISION B4 — extract resolveAgentIdForWorkspace to registry-helpers.ts** — `99e4736b` (refactor)
2. **Task 3.1: WhatsApp webhook HOLDER/FOLLOWER lock integration (v4-gated)** — `0b1782a4` (feat)
3. **Task 3.2: ManyChat webhook HOLDER/FOLLOWER lock integration (v4-gated, FB/IG)** — `3062598c` (feat)
4. **Task 3.3: Inngest event destructure extension + agent-production-lock-event.test.ts (D-14 + W2)** — `f96f7f0d` (feat)

Plan-metadata commit (this SUMMARY) lands separately so the per-task commits stay clean diff-units.

## Files Created/Modified

**Created (2):**
- `src/lib/agents/registry-helpers.ts` — 52 lines including JSDoc. Single export: `resolveAgentIdForWorkspace(workspaceId): Promise<AgentId>`. Internal dynamic-import to `@/lib/agents/production/agent-config` retained (allowed by REVISION B4 — only forbidden FROM webhook handlers).
- `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — 332 lines. 8 tests across 3 describes. Mocks: `registry-helpers`, `observability`, `audit/logger`, `inngest/client`, `agents/media`. Pattern mirrors `recompra-preload-context.test.ts`.

**Modified (3):**
- `src/inngest/functions/agent-production.ts` — local `resolveAgentIdForWorkspace` deleted (replaced with static import from registry-helpers). Destructure extended with 6 optional fields. REVISION W2 mismatch warning added. `turn_started` recordEvent payload extended with the 6 correlation fields. Concurrency clause UNCHANGED (D-14 + RESEARCH cited inline).
- `src/lib/whatsapp/webhook-handler.ts` — 5 new STATIC lock-module imports + `randomUUID`. New v4-gated HOLDER/FOLLOWER block (~80 lines) inserted before the existing `useInngest` dispatch. The existing `inngest.send` data extended with 6 new fields. Warning emitted if v4Path + !useInngest (inline path doesn't consume lock infrastructure).
- `src/lib/manychat/webhook-handler.ts` — same 5 new STATIC imports + `randomUUID`. New v4-gated HOLDER/FOLLOWER block (~80 lines). Follower path returns `{ stored: true }` early (200 OK to ManyChat, NO Inngest dispatch).

## Decisions Made

- **ManyChat uses SHARED Inngest event `agent/whatsapp.message_received`, NOT a separate event name.** This was the pre-existing convention (line 154 of the original file). Plan 03 preserves it. Plan 04 runner reads ONE event handler regardless of channel; `lockChannel` discriminates downstream. If Plan 04 author needs to know: yes, the same event handler receives both WhatsApp and FB/IG events; the `lockChannel` field tells you which.
- **ManyChat lock identifier is the raw `subscriberId`, NOT the `mc-`-prefixed `phoneIdentifier`.** The `phoneIdentifier = mc-<subscriberId>` is used to find/create the conversation row in DB (where it lives in `conversations.phone`). The lock identifier per D-10 is the `external_subscriber_id` (the raw ManyChat ID) — this aligns with the FB/IG conversation row's `external_subscriber_id` column and ensures concurrent messages from the same subscriber collide on the same Redis lock key.
- **v4 gate IS the feature flag.** v4 is currently DORMANT in production (Plan 00 Task 0.5 attested 0 active routing rules reference v4, 0 turns globally). Every workspace's `resolveAgentIdForWorkspace` evaluates to something other than `'somnio-sales-v4'`, so the gated block is skipped entirely. When v4 is flipped on by a separate decision (workspace_agent_config.conversational_agent_id='somnio-sales-v4'), the gate goes live for that workspace. No `lifecycle_routing_enabled`-style feature flag needed; the gate avoids the operator-misconfiguration risk that a separate flag would carry.
- **REVISION W2 double-resolve path is short-circuited for pre-v4 callers.** When `agentIdFromWebhook` is undefined (v3/godentist/recompra/pw-confirmation callers), the W2 mismatch check returns early WITHOUT running a second resolve — zero perf cost for the legacy paths. The local resolve runs exactly once, just like before. The double-resolve only happens on v4 events (extremely rare to disagree).
- **Concurrency clause UNCHANGED per D-14 + RESEARCH lines 918-929.** Inline comment added above the clause citing the source. NOT raised to 10, NOT removed. The lock subsystem (Plans 01-02 + this plan) is the inter-lambda mutex; this clause handles the same-lambda replay-storm case (cheaper for Inngest than spinning N replicas just to discover the lock is held).

## Regla 6 hand-trace (CRITICAL — confirms byte-identical behavior for v3/godentist/recompra/pw-confirmation paths)

For each non-v4 agent, here's the trace through the modified webhook code paths:

**v3 (`somnio-v3` — resolved from `conversational_agent_id='somnio-sales-v3'`):**
- `resolvedAgentId = 'somnio-v3'`
- `v4Path = false`
- `if (v4Path) { ... }` block at `src/lib/whatsapp/webhook-handler.ts` line 350 is SKIPPED ENTIRELY — no `acquireLock`, no `pushToPending`, no `redis.set`, no `emitLockEvent`.
- Flow falls through to the existing `if (useInngest) { inngest.send({...}) }` block UNCHANGED.
- The `inngest.send.data` payload includes the 6 new fields with these values: `lockHolderUuid: null, lockKey: null, ownPendingEntryJson: null, lockChannel: 'whatsapp', lockIdentifier: phone, agentId: 'somnio-v3'`.
- The Inngest function (`whatsappAgentProcessor`) destructures these 6 fields safely — they're optional, defaults are `?? null`.
- REVISION W2 double-resolve path: `agentIdFromWebhook = 'somnio-v3'`, local resolve = `'somnio-v3'` → no mismatch, no warning.
- `turn_started` recordEvent payload includes the 6 correlation fields with the null/whatsapp/phone/v3 values + `agentIdSource: 'webhook'` (a NEW field — pre-Plan-03 the field didn't exist; this is additive observability, not a behavior change).
- Status: **byte-identical to current production behavior** because (a) no Redis ops attempted, (b) Inngest function destructure is backward-compatible, (c) downstream pipeline ignores the new fields (Plan 04 will consume them, but Plan 04 isn't shipped yet).

**godentist (`godentist` — resolved from `conversational_agent_id='godentist'`):**
- `resolvedAgentId = 'godentist'`, `v4Path = false`. Same trace as v3. Status: **byte-identical**.

**recompra (`somnio-recompra` / `somnio-recompra-v1` — resolved to `'somnio-recompra'`):**
- `resolvedAgentId = 'somnio-recompra'`, `v4Path = false`. Same trace as v3. Status: **byte-identical**.

**pw-confirmation (`somnio-sales-v3-pw-confirmation` — resolved to `'somnio-v3'` since the routing maps `somnio-sales-v3` → `somnio-v3` and pw-confirmation routing is via `routing_rules`, not via `conversational_agent_id`):**
- `resolvedAgentId = 'somnio-v3'`, `v4Path = false`. Same trace as v3. The pw-confirmation routing decision happens INSIDE the existing webhook-processor flow (downstream of Plan 03's gate), so Plan 03's gate doesn't affect pw-confirmation routing at all. Status: **byte-identical**.

**godentist-fb-ig (FB/IG agent — resolved from agent_lifecycle_router via `channel` fact):**
- The `godentist-fb-ig` agent isn't selected via `conversational_agent_id` directly; it's chosen by the lifecycle router rule that matches on `channel ∈ {facebook, instagram}`. So `resolveAgentIdForWorkspace(workspaceId)` returns whatever the WORKSPACE's `conversational_agent_id` says (typically `'godentist'` for the GoDentist Valoraciones workspace, normalized to `'godentist'`). v4Path = false. Same trace as v3 from the lock-block perspective. The downstream agent selection happens in webhook-processor.ts, unaffected by Plan 03's gate. Status: **byte-identical**.

**Conclusion:** Plan 03 introduces ZERO behavior change for v3/godentist/recompra/pw-confirmation/godentist-fb-ig because the v4 gate evaluates to false for every workspace today. The only new code that runs is (a) one extra `resolveAgentIdForWorkspace` call at the top of the v4 gate, (b) populating 6 fields with null/already-computed values in the `inngest.send` data, (c) the `turn_started` recordEvent adds 6 nullable correlation fields + `agentIdSource: 'inngest_local_resolve'`. None of these alter agent behavior.

## FB/IG dedup residual risk (REVISION W6)

Plan 00 Task 0.4 audit recorded: **WhatsApp dedup COVERED (`messages_wamid_unique UNIQUE (wamid)`), FB/IG dedup GAP** (the `messages` table lacks a UNIQUE constraint on FB/IG message IDs). Per REVISION W6 this gap is accepted forward-looking risk because:
- **v4 currently serves WhatsApp ONLY** (Plan 00 Task 0.5 §v4 dormancy attestation confirms 0 active routing rules reference v4 across all workspaces).
- **godentist-fb-ig is INACTIVE in production** (per `.claude/rules/agent-scope.md`: "Sibling INACTIVO en prod hasta usuario cree routing rule manual" — no FB/IG traffic flowing today).
- **The lock subsystem itself does not require dedup at the DB layer** — it dedups via the Redis SET NX mutex per (`workspaceId, channel, identifier`). DB-side dedup is an independent integrity property; its absence on FB/IG today does NOT affect Plan 03's correctness.

**Migration path:** when v4 begins serving FB/IG traffic (a future standalone — outside the scope of debounce-interruption-system-v2), revisit and add the dedup constraint via a Regla 5 migration (apply in prod BEFORE pushing code that depends on it). Documented as forward-looking risk in `00-MEASUREMENTS.md §Messages dedup constraint inventory`.

## Deviations from Plan

### Auto-fixed Issues

None. Every task passed its verification gates on the first run after editing. The executor prompt pre-corrected two errors in the plan text up-front (AgentId import path + the already-present `'somnio-sales-v4'` AgentId union member), so the implementation honored the corrected version directly without surfacing them as inline deviations.

### Pragmatic adjustments documented

- **`existing_holder_uuid: 'unknown'` in the follower's `lock_acquire_failed_follower` event payload.** The plan sketch suggests reading the lock value to surface the holder UUID in the event. The implementation deliberately does NOT (matches the plan's own comment: "we don't read lock value here — too racy"). Cost: ops can't immediately see WHO held the lock from this single event; they can correlate via the matching `lock_acquired` event (emitted by the holder, same key, recent timestamp). Benefit: zero extra Redis round-trip on the follower path, no race window.
- **TTL constant inlined as `45` rather than imported from `lock.ts`.** Both webhook files emit `ttl: 45` in the `lock_acquired` event payload as a literal. Rationale: importing `LOCK_TTL_S` from `@/lib/agents/interruption-system-v2/lock` for one annotation would add an import-tree dependency the webhook doesn't otherwise need (it doesn't call `acquireLock` with a custom TTL — the lock module owns the TTL internally). The literal `45` is documented inline with a comment pointing at `LOCK_TTL_S`. If the TTL ever changes, the search will find both call sites. Low-cost tradeoff.

---

**Total deviations:** 0 auto-fixes; 2 pragmatic adjustments (documented above).
**Impact on plan:** No scope creep. All acceptance criteria from the plan's `<verify>` blocks satisfied verbatim.

## Issues Encountered

None. The 4-task sequence ran clean.

The pre-existing pattern from `recompra-preload-context.test.ts` (vi.mock async-factory + `__mock` retrieval) was reused for the new test file — zero re-debugging of the hoisting trap that Plan 01 had already paid for.

## User Setup Required

None — Plan 03 is code-only. Upstash + env vars are provisioned (Plan 00). Lock primitives + pending ops + observability emitter are shipped (Plans 01-02). The v4 gate is currently inert in prod because no workspace has `conversational_agent_id='somnio-sales-v4'`.

When the operator decides to activate v4 for a specific workspace, the flip is a single SQL statement:
```sql
UPDATE workspace_agent_config
SET conversational_agent_id = 'somnio-sales-v4'
WHERE workspace_id = '<target-workspace-uuid>';
```
After this, the next inbound WhatsApp/FB/IG message to that workspace will enter the v4-gated HOLDER/FOLLOWER lock flow. Plan 04 (V4ProductionRunner) consumes the resulting event.data fields.

## Self-Check

**Files exist:**
- `src/lib/agents/registry-helpers.ts` — FOUND
- `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — FOUND
- `src/lib/whatsapp/webhook-handler.ts` — FOUND + modified
- `src/lib/manychat/webhook-handler.ts` — FOUND + modified
- `src/inngest/functions/agent-production.ts` — FOUND + modified

**Commits exist on `exec/debounce-v2-wave3`:**
- `99e4736b` — Task 3.0 (refactor) — FOUND
- `0b1782a4` — Task 3.1 (feat) — FOUND
- `3062598c` — Task 3.2 (feat) — FOUND
- `f96f7f0d` — Task 3.3 (feat) — FOUND

**Verification gates:**
- `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — 8/8 PASS
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` — 36/36 PASS (Waves 1+2 regression)
- `npx vitest run` on both together — 44/44 PASS
- `npx tsc --noEmit -p tsconfig.json` — 0 errors in any of the 5 Plan-03-modified files
- `git diff exec/debounce-v2-wave3~4..HEAD -- src/lib/observability/types.ts` — empty (file NOT touched per executor prompt)
- `git diff exec/debounce-v2-wave3~4..HEAD -- src/lib/agents/interruption-system-v2/` — empty (Plan 01+02 source files untouched)

**Acceptance-criteria greps (from PLAN.md):**

Task 3.0:
- `grep -c "export.*resolveAgentIdForWorkspace" src/lib/agents/registry-helpers.ts` → 1 ✓
- `grep -c "import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'" src/inngest/functions/agent-production.ts` → 1 ✓
- `grep -cE "^async function resolveAgentIdForWorkspace" src/inngest/functions/agent-production.ts` → 0 ✓ (local def removed)
- `grep -Fc "'somnio-sales-v4'" src/lib/agents/registry-helpers.ts` → 3 ✓ (≥1 required)

Task 3.1:
- acquireLock=2, pushToPending=3, lockHolderUuid=2, lockKey=2, ownPendingEntryJson=5, lockChannel=8, lockIdentifier=8, agentId: resolvedAgentId=1, somnio-sales-v4=3, 4 lifecycle events emitted, STATIC registry-helpers import=1, inngest.send=1 (unchanged), interrupt SET=1 ✓
- No new `await import` for lock code (only pre-existing `await import('@/inngest/client')` + `processMessageWithAgent` retained) ✓

Task 3.2:
- acquireLock=2, external_subscriber_id=2 (in comments), lockHolderUuid=1, lockChannel=8, lockIdentifier=8, agentId: resolvedAgentId=1, facebook|instagram=6, somnio-sales-v4=3, STATIC registry-helpers import=1 ✓

Task 3.3:
- lockHolderUuid=4, lockKey=4, ownPendingEntryJson=4, lockChannel=4, lockIdentifier=4, agentIdFromWebhook=7, limit: 1=1, key: event.data.conversationId=1, D-14|RESEARCH=3, agent_id_mismatch=2 ✓
- `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` exits 0 ✓

## Self-Check: PASSED

## Next Plan Readiness — Plan 04 (V4ProductionRunner integration)

Plan 04 author should read these implementation specifics from Plan 03:

1. **Event handler is SHARED across channels.** Both WhatsApp and FB/IG events arrive at `whatsappAgentProcessor` via `agent/whatsapp.message_received`. Plan 04 will read `lockChannel` from `event.data` to discriminate WhatsApp vs FB/IG inside the runner; do NOT introduce a separate Inngest function.

2. **6 new event.data fields are OPTIONAL — handle the null case.** For pre-v4 callers, all 6 are absent (undefined → null after destructure). Plan 04's runner MUST check `lockHolderUuid && lockKey` before invoking checkpoint helpers; when null, skip the checkpoint logic and accept residual double-response risk (fail-open path from webhook).

3. **`ownPendingEntryJson` MUST be threaded END-TO-END to V4MessagingAdapter.** Per Plan 02's `pushToPending` contract (Pitfall 4 byte-exact LREM), re-serializing the entry object at LREM time is NOT guaranteed to match. Plan 04 extends `V4AgentInput` with `ownPendingEntryJson: string | null` and passes it to `V4MessagingAdapter.onFirstSendCompleted` which calls `removeOwnEntry(workspaceId, channel, identifier, exactJson)`.

4. **`lockChannel + lockIdentifier` eliminate a conversations-table lookup.** Plan 04's runner does NOT need to query `conversations` to discover the channel/identifier (REVISION W3 — no `createAdminClient` needed for that purpose).

5. **`agentId` is the SAME as what the webhook locked on.** REVISION W2 — if the runner needs to re-resolve, the local fallback is `await resolveAgentIdForWorkspace(workspaceId)` from `@/lib/agents/registry-helpers`. But prefer `agentIdFromWebhook` (already destructured as `agentId` in agent-production.ts). The mismatch warning has already fired upstream if they disagree.

6. **Concurrency clause is LOCKED at limit=1.** Plan 04 should NOT modify it. If the runner becomes a bottleneck, the fix is to (a) reduce per-turn latency, NOT (b) raise concurrency limits. The lock subsystem enforces correctness across all replicas; bumping limit=10 would create the cross-lambda races the lock was designed to prevent.

7. **No DB migrations needed** — pure Redis-backed primitives, no Postgres touch. v4 activation is a single `UPDATE workspace_agent_config` SET as documented in User Setup Required.

8. **`startHeartbeat + releaseLockIfOwner` lifecycle is Plan 05's job, not Plan 04's.** Plan 04 reconstructs the `LockHandle` from the event.data fields; Plan 05 wraps the pipeline body with the heartbeat + finally-block release.

## Threat Flags

None — Plan 03 is integration-only. No new HTTP endpoints (extends existing webhook handlers), no new auth paths (the webhooks already authenticated upstream), no new DB schema. The `redis.set` for the interrupt key is the only new Redis surface from webhook layer, scoped to a 60s TTL and per-(workspace, channel, identifier) — within the threat model already established by Plans 01-02.

---
*Phase: standalone-debounce-interruption-system-v2*
*Completed: 2026-05-26*
