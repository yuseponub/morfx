---
phase: standalone-debounce-interruption-system-v2
plan: 04
subsystem: runner-integration
tags: [v4-production-runner, messaging-adapter, ckpt-0, ckpt-6, ckpt-7, heartbeat, lock-release, fencing-token, regla-6, redis, observability, vitest]

# Dependency graph
requires:
  - phase: standalone-debounce-interruption-system-v2 / plan 00
    provides: "@upstash/redis@1.38.0 installed, env vars provisioned, LOCK_TTL_S=45, HEARTBEAT_MS=5000, keepTtl SUPPORTED verdict (Plan 00 Task 0.5b §REVISION W7 line 198)"
  - phase: standalone-debounce-interruption-system-v2 / plan 01
    provides: "lock primitives (acquireLock, releaseLockIfOwner, startHeartbeat, renewLockTTL, LockHandle, LOCK_TTL_S), observability emitter (emitLockEvent + 14-label union including msg_aborted_path_a_combined + msg_aborted_path_b_solo + lock_released_normal + pending_list_combined + zombie_lambda_exit + redis_unavailable_fallback_failed)"
  - phase: standalone-debounce-interruption-system-v2 / plan 02
    provides: "checkpoint(ckptId, handle, ws, channel, identifier, opts?) helper + CheckpointId union (8 D-18 values) + CheckpointResult interface, removeOwnEntry(byte-exact LREM), readAndClearPending(atomic multi.del.exec)"
  - phase: standalone-debounce-interruption-system-v2 / plan 03
    provides: "6 OPTIONAL event.data fields (lockHolderUuid, lockKey, ownPendingEntryJson, lockChannel, lockIdentifier, agentId) populated by WhatsApp + ManyChat webhook handlers in HOLDER path; v4-gated"
provides:
  - "src/lib/agents/engine/types.ts — EngineInput extended with 4 OPTIONAL fields (lockHandle?: LockHandle | null, ownPendingEntryJson?: string | null, lockChannel?: 'whatsapp'|'facebook'|'instagram' | null, lockIdentifier?: string | null). Type-only import via `import('@/lib/agents/interruption-system-v2/lock').LockHandle` avoids runtime circular imports."
  - "src/lib/agents/somnio-v4/types.ts — V4AgentInput extended with same 4 OPTIONAL fields (threaded from runner → agent in Plan 05)."
  - "src/lib/agents/engine-adapters/production/messaging.ts — ProductionMessagingAdapter refactored: hasNewInboundMessage visibility relaxed (private→protected), 4 fields visibility relaxed (private→protected), 2 new protected hooks (shouldAbortBeforeTemplate + onFirstSendCompleted) extracted from send() loop. Parent class behavior PRESERVED VERBATIM for non-v4 consumers (Regla 6)."
  - "src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts — NEW V4MessagingAdapter extends ProductionMessagingAdapter. Overrides shouldAbortBeforeTemplate to call checkpoint('ckpt_7_pre_template') instead of Phase 31 hasNewInboundMessage (D-08 option-a). Overrides onFirstSendCompleted to do D-16 LREM-self + D-15 has_sent_anything flip via keepTtl SUPPORTED branch (REVISION W7). LostLockError exception class for D-15 zombie defense propagation."
  - "src/lib/agents/engine/v4-production-runner.ts — CKPT-0 inserted post-session-resolution, CKPT-6 inserted twice (before pending-templates path B resume + before main send block). Heartbeat + try/finally lock release lifecycle (D-09 layers 1+2). LostLockError catch handler emits zombie_lambda_exit. REVISION W3: consumes input.lockChannel + input.lockIdentifier directly — NO createAdminClient added."
  - "src/lib/agents/production/webhook-processor.ts — ProcessMessageInput extended with 5 OPTIONAL fields. v4 branch (and ONLY v4 branch) instantiates V4MessagingAdapter, reconstructs LockHandle from event.data, threads 4 lock fields into EngineInput. All other agent branches UNCHANGED (Regla 6)."
  - "src/inngest/functions/agent-production.ts — invokePipeline() closure threads the 5 lock-correlation fields from event.data → processMessageWithAgent. Pre-v4 callers get null defaults."
  - "src/inngest/functions/__tests__/agent-production-lock-event.test.ts — 2 new tests (Plan 04 Task 4.4 describe) asserting the 5 fields propagate correctly on v4 and pre-v4 paths."
  - "src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts — NEW 11 unit tests across 2 describes covering parent-class Regla 6 preservation (3 tests) + V4MessagingAdapter override semantics (8 tests including LostLockError throw, D-16 LREM-self, keepTtl flip, fail-open paths)."

affects:
  - Plan 05 — somnio-v4-agent.ts will add CKPT-1, CKPT-2 (post-comprehension, post-state-machine). sub-loop/index.ts will add CKPT-3, CKPT-4, CKPT-5 (post-tooling, post-generation, post-compliance). The V4AgentInput.lockHandle + lockChannel + lockIdentifier + ownPendingEntryJson are already threaded — Plan 05 just consumes them.
  - Plan 06 — cron sweep runs INDEPENDENT of Plan 04 (no consumer relationship). Plan 06 will emit `lock_orphan_swept_by_cron` when stale lock keys are found.
  - Plan 07 — E2E scenarios validate the full holder-follower round-trip against real Upstash including CKPT-0 + CKPT-6 + CKPT-7 firing + Path A/B detection + lock_released_normal lifecycle event.

# Tech tracking
tech-stack:
  added: []  # No new deps. Module from Plans 00-02; webhook fields from Plan 03.
  patterns:
    - "Subclass-overridable protected hooks for per-template work in messaging adapter: extracted shouldAbortBeforeTemplate + onFirstSendCompleted from the send() loop. Parent class still works as before (default impls preserve Phase 31 + no-op). V4MessagingAdapter overrides both. Pattern reusable when you need an agent-specific variant of an existing adapter without forking the whole class."
    - "Type-only import via inline `import('...').Type` syntax for break-the-cycle backward compatibility: src/lib/agents/engine/types.ts imports LockHandle as `import('@/lib/agents/interruption-system-v2/lock').LockHandle` rather than a top-level static import. Engine types are loaded by many modules in many orderings; the inline type-only import avoids creating a runtime circular dependency edge while still giving full type safety."
    - "Nested try/catch + try/finally for layered resource lifecycle: V4ProductionRunner.processMessage wraps existing try/catch in outer try { try { existing } catch (error) { existing+LostLockError } } finally { stopHeartbeat + releaseLockIfOwner }. The inner try/catch keeps its established semantics (VersionConflictError retry, V4_ENGINE_ERROR fallback). The outer try/finally guarantees the lock is always released, even on success path AND on caught error path. Pattern reusable when adding a new resource-lifecycle layer around legacy error handling."
    - "Resource-acquire-at-top + nullable-skip pattern: when the new resource (lockHandle) is OPTIONAL per the contract, the acquire/release symmetric ops are gated on `if (input.lockHandle)` — both at startHeartbeat (acquire) and inside finally for release. Pre-v4 callers naturally skip the whole new layer; v4 + fail-open path naturally activates. Cleaner than introducing a feature flag (D-08 + Regla 6 dormancy gate IS the flag)."
    - "Adapter-bundle override pattern: webhook-processor's v4 branch builds `const v4Adapters = { ...adapters, messaging: v4MessagingAdapter }` rather than passing a flag into createProductionAdapters. This isolates the v4 selection to a single branch and preserves the createProductionAdapters factory's existing contract. Pattern reusable when one of several call sites needs a custom variant of one adapter from a multi-adapter bundle."
    - "REVISION W3 — webhook-side field resolution to eliminate downstream DB lookups: the webhook handler already knows the conversation channel + identifier; passing them through event.data → EngineInput means the runner doesn't need a Supabase conversations-table query. Saves a round-trip per turn and keeps the runner Regla-3-pure (no createAdminClient at the wrapper layer). Pattern reusable for any 'multi-step pipeline where the upstream component has the data the downstream component needs'."
    - "LostLockError as a typed throw signal between adapter and runner: V4MessagingAdapter throws a custom error class for the D-15 lostLock case; the runner's outer catch identifies it via `instanceof LostLockError`, emits a specific observability event (zombie_lambda_exit), and returns a typed failure WITHOUT retrying. Pattern reusable when an adapter detects an unrecoverable invariant violation that must surface as a distinct outcome from regular errors (which DO retry)."

key-files:
  created:
    - src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts
    - src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts
  modified:
    - src/lib/agents/engine/types.ts (EngineInput +4 fields)
    - src/lib/agents/somnio-v4/types.ts (V4AgentInput +4 fields)
    - src/lib/agents/engine-adapters/production/messaging.ts (parent refactor — visibility relaxed + 2 new protected hooks)
    - src/lib/agents/engine/v4-production-runner.ts (+CKPT-0, +CKPT-6a, +CKPT-6b, +heartbeat lifecycle, +try/finally, +LostLockError handler)
    - src/lib/agents/production/webhook-processor.ts (ProcessMessageInput +5 fields; v4 branch instantiates V4MessagingAdapter + threads lock fields into EngineInput)
    - src/inngest/functions/agent-production.ts (invokePipeline closure threads 5 lock fields to processMessageWithAgent)
    - src/inngest/functions/__tests__/agent-production-lock-event.test.ts (+1 describe, +2 tests for Task 4.4 threading)

key-decisions:
  - "ProductionMessagingAdapter parent class behavior PRESERVED VERBATIM externally. The refactor is structural-only: the send() per-template loop body now calls two protected hooks (shouldAbortBeforeTemplate + onFirstSendCompleted) whose default implementations are Phase 31 hasNewInboundMessage + no-op respectively. Three Regla 6 hand-trace tests assert this preservation."
  - "V4MessagingAdapter REPLACES (not augments) Phase 31 for v4 path per D-08 option-a verdict. The override of shouldAbortBeforeTemplate does NOT call super.shouldAbortBeforeTemplate in the happy path — it calls checkpoint('ckpt_7_pre_template') exclusively. The only time it defers to super is the fail-open path (lockHandle null) — preserving the v4 path's resilience to Redis unavailability per RESEARCH Open Question 5."
  - "REVISION W3 honored — NO createAdminClient added to v4-production-runner.ts. The grep on the file shows 2 matches but BOTH are in JSDoc comments documenting the W3 decision. The runner reads input.lockChannel + input.lockIdentifier directly from EngineInput, which are populated by Plan 03's webhook handler."
  - "REVISION W7 keepTtl SUPPORTED branch — V4MessagingAdapter.onFirstSendCompleted writes the new lock value with `redis.set(key, newValue, { keepTtl: true } as { keepTtl: true })`. The `as` assertion is required because SetCommandOptions type does not list keepTtl despite the SDK accepting it at runtime (00-MEASUREMENTS.md §REVISION W7 line 201). The fallback read-then-set branch is NOT in the codebase."
  - "CKPT-0 Path A early-return persists `_v3:pendingUserMessage` to session_state.datos_capturados using the existing convention from v4-production-runner line 75. The same key the existing Path A flow already reads at the top of the next turn. No new schema, no new migration."
  - "CKPT-6a (pending-templates resume) only emits msg_aborted_path_a_combined because nothing has been sent in THIS turn yet (sentCount=0). CKPT-6b (main send block) branches: if any pending templates from a prior turn were sent above (actuallySentIds.length > 0) it's Path B; otherwise Path A. The path determination is local to each CKPT placement; the runner does not maintain a 'globally has sent anything' flag."
  - "Lock release order in finally: stopHeartbeat() BEFORE releaseLockIfOwner(). If we released first and the heartbeat fired one last renewal between our DEL and the next holder's SET NX, the next holder's lock would have its TTL extended by an out-of-band heartbeat from a stale lambda — leaving the lock in an inconsistent state. Stopping the heartbeat first eliminates this race."
  - "ProductionMessagingAdapter visibility relaxed (private → protected) for 4 fields (conversationId, workspaceId, phoneNumber, responseSpeed) and hasNewInboundMessage. This is a public-API change in the sense that subclasses can now read these — but TypeScript subclasses are the only consumers and V4MessagingAdapter is the only subclass. Pattern parallels Node's standard library where many 'private' fields are actually protected for testability."

patterns-established:
  - "Adapter subclass for agent-specific variant of one operation: when an agent (v4) needs a different behavior in ONE method of a multi-method adapter, create a subclass that overrides ONLY that method. Don't fork the entire adapter file. V4MessagingAdapter extends ProductionMessagingAdapter and overrides 2 protected hooks; the other 9 methods are inherited byte-identical."
  - "Type-only imports via inline `import('...')` for breaking circular deps in shared interfaces: when a shared types module needs to reference a type from a deep module that may transitively re-import the shared types, use `field?: import('...').Type | null` rather than a top-level static import. TypeScript still type-checks, but no runtime edge is created."
  - "Layered resource lifecycle via nested try/catch + try/finally: when adding a new resource-cleanup layer around legacy error handling, wrap rather than refactor. The legacy try/catch keeps its established semantics; the new try/finally adds the cleanup guarantee at a layer above. Easier to review (legacy paths unchanged) and easier to rollback if needed."

requirements-completed: [LOCK-05, LOCK-07]

# Metrics
duration: 50 min
completed: 2026-05-26
---

# Plan 04 Wave 4 — V4ProductionRunner integration (CKPT-0, CKPT-6, CKPT-7 + heartbeat + lock release)

**V4-only checkpoint instrumentation in the production runner + a v4-only messaging adapter that replaces the Phase 31 DB-poll with the Redis-based checkpoint at the per-template send loop. Lock lifecycle (heartbeat + try/finally release) wraps every v4 turn. All non-v4 agent paths (v3 / godentist / godentist-fb-ig / somnio-recompra / somnio-pw-confirmation) remain byte-identical to pre-Plan-04 behavior (Regla 6).**

## Performance

- **Duration:** ~50 min (Task 4.1 + 4.2 + 4.3 + 4.4 sequential, 1 small re-write of test mocks for the vi.mock hoisting trap)
- **Started:** 2026-05-26T09:30Z (post Plan 03 HEAD `2a004b7a`)
- **Completed:** 2026-05-26T09:55Z
- **Tasks:** 4 (all autonomous, Task 4.2 was TDD-style with tests covering both parent preservation and V4 override semantics)
- **Files modified:** 7 (2 new + 5 modified)

## Accomplishments

- **EngineInput + V4AgentInput types extended** with 4 OPTIONAL fields each: `lockHandle?: LockHandle | null`, `ownPendingEntryJson?: string | null`, `lockChannel?: 'whatsapp'|'facebook'|'instagram' | null`, `lockIdentifier?: string | null`. Type-only import via inline `import('@/lib/agents/interruption-system-v2/lock').LockHandle` avoids runtime circular import edges (engine/types is loaded before interruption-system-v2 in some adapter paths).
- **ProductionMessagingAdapter refactored** without behavior change: extracted the per-template Phase 31 check + the post-first-send concerns into two protected hooks (`shouldAbortBeforeTemplate`, `onFirstSendCompleted`) that subclasses can override. Default implementations preserve Phase 31 + no-op respectively. Four fields visibility relaxed (`private` → `protected`) so the subclass can read them.
- **V4MessagingAdapter created** (`src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts`):
  - Overrides `shouldAbortBeforeTemplate` to call `checkpoint('ckpt_7_pre_template', this.lockHandle, this.workspaceId, channel, recipientIdentifier, { templateIndex, hasSentAnything })` per D-08 option-a (replaces, NOT augments, Phase 31 for v4 path).
  - On `checkpoint.lostLock: true` → throws `LostLockError` (NEW exception class), propagated up to the runner's outer catch.
  - On `checkpoint.interrupted` → returns `{ abort: true, reason: 'ckpt7_interrupted' }` causing send() to return `{ messagesSent, interrupted: true, interruptedAtIndex: i }`.
  - Fail-open: when `lockHandle === null` (sandbox or webhook fail-open path), defers to `super.shouldAbortBeforeTemplate` so Phase 31 still fires — v4 is never WORSE than pre-v4 when Redis is unavailable.
  - Overrides `onFirstSendCompleted` to do D-16 LREM-self (`removeOwnEntry(workspaceId, channel, identifier, this.ownPendingEntryJson)` with byte-exact JSON match per Pitfall 4) + flip `has_sent_anything=true` in the lock value via `redis.set(key, newValue, { keepTtl: true } as { keepTtl: true })` per REVISION W7 SUPPORTED branch.
  - Both hooks emit `redis_unavailable_fallback_failed` observability on transient Upstash errors and continue (fail-open).
- **V4ProductionRunner instrumented** (`src/lib/agents/engine/v4-production-runner.ts`):
  - CKPT-0 `ckpt_0_post_acquire` inserted after `setSessionId` line ~71 (RESEARCH line 845). On interrupt: Path A only (no sends possible yet); emits `msg_aborted_path_a_combined` + `pending_list_combined`; persists combined message to `_v3:pendingUserMessage`.
  - CKPT-6a `ckpt_6_pre_send_loop` inserted before the pending-templates Path B resume block (~line 318). On interrupt: Path A (`sentCount=0` because we haven't sent in THIS turn yet).
  - CKPT-6b `ckpt_6_pre_send_loop` inserted before the main send block (~line 378). On interrupt: branches Path A (`sentCount=0`) vs Path B (`sentCount>0`).
  - Heartbeat lifecycle: `startHeartbeat(input.lockHandle)` called at the top of `processMessage` IF lockHandle present; stop function captured in `stopHeartbeat` variable.
  - try/finally wrapper: outer `try { try { existing } catch (error) { existing + LostLockError catch } } finally { stopHeartbeat() + releaseLockIfOwner() }`. Inner try/catch preserves existing VersionConflictError retry semantics; outer try/finally guarantees release on success AND failure paths.
  - LostLockError catch handler: emits `zombie_lambda_exit` with `my_uuid + at_step + current_holder_uuid: 'unknown'` (don't read lock value — racy per RESEARCH); returns failure with code `V4_ZOMBIE_LAMBDA_EXIT`.
  - **REVISION W3 honored**: NO `createAdminClient` added. The two `createAdminClient` grep matches in the file are both inside JSDoc comments documenting the W3 decision. Channel + identifier come from `input.lockChannel` + `input.lockIdentifier` directly.
- **webhook-processor.ts v4 branch wired** to:
  - Reconstruct LockHandle from `input.lockHolderUuid + input.lockKey` (both must be present; null on Redis-unavailable fail-open path).
  - Instantiate V4MessagingAdapter with the reconstructed handle + `input.ownPendingEntryJson`. Replaces `adapters.messaging` in the bundle for v4 ONLY (`const v4Adapters = { ...adapters, messaging: v4MessagingAdapter }`). Other agents continue using the standard ProductionMessagingAdapter from `createProductionAdapters`.
  - Thread `lockHandle + ownPendingEntryJson + lockChannel + lockIdentifier` into `runner.processMessage`'s EngineInput.
- **agent-production.ts invokePipeline closure** updated to forward the 5 lock-correlation fields from event.data destructure to `processMessageWithAgent`. Pre-v4 callers (v3/godentist/recompra/pw-confirmation/godentist-fb-ig) get `null` defaults — Regla 6 backward compat enforced by the lock-event-test assertions.
- **Test suite extended**:
  - 11 new tests in `v4-messaging-adapter.test.ts` (refactored parent preservation × 3 + V4 override semantics × 8 including LostLockError throw + D-16 LREM-self + keepTtl flip + fail-open paths) — all PASS.
  - 2 new tests in `agent-production-lock-event.test.ts` (`Plan 04 Task 4.4` describe) asserting the 5 field threading on v4 + pre-v4 paths — all PASS.
  - Plan 1+2 tests (36/36): still PASS (no regression).
  - Plan 03 tests (8/8 → 10/10 after Task 4.4 additions): still PASS.

## Actual line numbers used for CKPT insertions

Plan 04 spec referenced RESEARCH line numbers from a 2026-05-25 snapshot. The actual line numbers in the live file (post-edits + with my added imports + try/catch scaffolding) are:

| CKPT | RESEARCH spec line | Actual insertion site (anchor) |
|---|---|---|
| CKPT-0 `ckpt_0_post_acquire` | "after line 71 (setSessionId)" | After `setSessionId` call (~current line 81 — moved by my added scaffolding above it) |
| CKPT-6a `ckpt_6_pre_send_loop` (pending-templates) | "before line 206" | Before `if (this.adapters.storage.getPendingTemplates)` (~current line 318 — moved by my added comments + CKPT-0 block above it) |
| CKPT-6b `ckpt_6_pre_send_loop` (main send) | "before line 267" | Before `if (output.templates && output.templates.length > 0)` (~current line 442 — moved by all prior insertions) |
| CKPT-7 `ckpt_7_pre_template` (in V4MessagingAdapter) | "inside per-template loop" | In `V4MessagingAdapter.shouldAbortBeforeTemplate` — called from `messaging.ts` send loop on each template iteration via the protected hook |

All CKPT placements honored the structural anchors stated in the plan ("right after setSessionId", "right before getPendingTemplates", "right before output.templates check"). The literal line numbers shifted due to my added comments + try/finally scaffolding.

## keepTtl verdict consumption

Per `00-MEASUREMENTS.md §REVISION W7` (line 198): `@upstash/redis 1.38.0` supports `{ keepTtl: true }` at runtime even though the published `SetCommandOptions` type does not list it. The code in `V4MessagingAdapter.onFirstSendCompleted` uses the SDK-direct branch:

```ts
await redis.set(this.lockHandle.key, newValue, { keepTtl: true } as { keepTtl: true })
```

The fallback read-then-set branch (`const ttl = await redis.ttl(key); await redis.set(key, newValue, { ex: Math.max(ttl, 5) })`) is **NOT** in the codebase. If a future SDK upgrade breaks `keepTtl`, re-run the probe documented in 00-MEASUREMENTS.md §REVISION W7 and reintroduce the fallback.

## REVISION W3 — channel/identifier from EngineInput vs the originally-planned conversations query

The originally-planned approach (before REVISION W3) was: V4ProductionRunner queries `conversations` table via `createAdminClient` to look up channel + external_subscriber_id, then passes them to checkpoint() calls. REVISION W3 changed this: the webhook handler already knows channel + identifier at request time (Plan 03), so it threads them through event.data → EngineInput → runner directly. The runner consumes them from `input.lockChannel` + `input.lockIdentifier`.

**Implementation observation:** this was actually MORE ergonomic than the originally-planned conversations query. The runner code reads:

```ts
const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
  ? { channel: input.lockChannel, identifier: input.lockIdentifier }
  : null
```

— one ternary at the top, then `lockCtx.channel` + `lockCtx.identifier` reused at 3 sites (CKPT-0, CKPT-6a, CKPT-6b). The conversations-query approach would have required an `await supabase.from('conversations').select(...).single()` round-trip per turn + error handling for the (rare) case where the conversation row doesn't exist. REVISION W3 saves the round-trip AND keeps the runner Regla 3-pure (no createAdminClient at the wrapper layer).

**Defensive contract:** if lockHandle is non-null but lockChannel/lockIdentifier is null (should be impossible since Plan 03 always populates all three or none), the runner throws with `[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated`. This makes contract violations loud rather than silent.

## Regla 6 hand-trace (CRITICAL — confirms parent ProductionMessagingAdapter byte-identical behavior for all non-v4 agents)

For each non-v4 agent, the messaging-adapter flow:

**v3 (`somnio-sales-v3` — resolved from `conversational_agent_id='somnio-sales-v3'`):**
- `agentId = 'somnio-sales-v3'`
- webhook-processor v3 branch: `new V3ProductionRunner(adapters, { workspaceId })` — uses the standard `adapters` bundle from `createProductionAdapters` which contains `new ProductionMessagingAdapter(...)`.
- V3ProductionRunner.processMessage calls `this.adapters.messaging.send(...)`.
- ProductionMessagingAdapter.send loops templates → each iteration calls `this.shouldAbortBeforeTemplate(...)` → default implementation runs `if (params.triggerTimestamp) const hasNew = await this.hasNewInboundMessage(...); if (hasNew) return { abort: true, reason: 'phase31_new_inbound' }` — byte-identical to pre-Plan-04 Phase 31 check.
- On successful first send: `this.onFirstSendCompleted(...)` → default no-op. No Redis ops, no observability event.
- Status: **byte-identical** to pre-Plan-04 production behavior. checkpoint() never called. removeOwnEntry() never called. redis.set() never called.

**godentist (`godentist` — resolved from `conversational_agent_id='godentist'`):**
- Same path as v3 (V3ProductionRunner with agentModule='godentist', standard ProductionMessagingAdapter). Status: **byte-identical**.

**godentist-fb-ig (`godentist-fb-ig` — sibling routed via channel fact):**
- Same path as v3 (V3ProductionRunner with agentModule='godentist-fb-ig', standard ProductionMessagingAdapter). Status: **byte-identical**.

**somnio-recompra (`somnio-recompra-v1` / `somnio-recompra` — routed via lifecycle):**
- Falls into the "else" (V1 UnifiedEngine) branch in webhook-processor, OR into another existing branch — the standard `adapters` bundle from `createProductionAdapters` flows through. The factory function `createProductionAdapters` is unchanged; the v4 branch creates its own `v4Adapters = { ...adapters, messaging: v4MessagingAdapter }` LOCALLY, leaving the original `adapters.messaging` (= `ProductionMessagingAdapter`) untouched for everyone else. Status: **byte-identical**.

**somnio-sales-v3-pw-confirmation (`somnio-sales-v3-pw-confirmation`):**
- Routed via lifecycle router → INSIDE webhook-processor → goes through whichever existing branch handles pw-confirmation (it uses its own in-process dispatch chain that eventually calls `processMessageWithAgent` again). The lock fields are threaded but the pw-confirmation branch's adapter is the standard ProductionMessagingAdapter (only the v4 branch swaps it). Status: **byte-identical** from the messaging adapter perspective.

**Conclusion:** Plan 04 introduces ZERO behavior change for v3 / godentist / godentist-fb-ig / somnio-recompra / somnio-pw-confirmation because:
1. createProductionAdapters factory output is unchanged (produces standard ProductionMessagingAdapter).
2. ProductionMessagingAdapter refactor is structural-only — send() now calls protected hooks, but default impls preserve Phase 31 + no-op.
3. V4MessagingAdapter is only instantiated in webhook-processor's `agentId === 'somnio-sales-v4'` branch.
4. V4ProductionRunner is only constructed in the same v4 branch.
5. V4 is currently DORMANT in production (no workspace has `conversational_agent_id='somnio-sales-v4'`). Even when activated, only the v4 workspace sees the new code path.

Three unit tests in `v4-messaging-adapter.test.ts` describe `ProductionMessagingAdapter (refactored parent — Regla 6 byte-identical behavior)` codify this preservation in code so future refactors can't silently break the contract.

## Path A vs Path B emission label confirmation

The 4 emission labels used in v4-production-runner.ts match the canonical `LockEventLabel` union from observability.ts:

| Used in runner | Union label | Match |
|---|---|---|
| `msg_aborted_path_a_combined` | `msg_aborted_path_a_combined` | ✓ |
| `msg_aborted_path_b_solo` | `msg_aborted_path_b_solo` | ✓ |
| `lock_released_normal` | `lock_released_normal` | ✓ |
| `pending_list_combined` | `pending_list_combined` | ✓ |
| `zombie_lambda_exit` | `zombie_lambda_exit` | ✓ |
| `redis_unavailable_fallback_failed` | `redis_unavailable_fallback_failed` | ✓ |

All 6 labels are valid `LockEventLabel` union members. `emitLockEvent` would have failed type-check otherwise.

## Task Commits

Each task was committed atomically on branch `exec/debounce-v2-wave4`:

1. **Task 4.1: EngineInput + V4AgentInput +4 OPTIONAL fields (REVISION W3)** — `3cfa3fb1` (feat)
2. **Task 4.2: refactor ProductionMessagingAdapter + add V4MessagingAdapter + 11 tests** — `44366f11` (refactor)
3. **Task 4.3: CKPT-0 + CKPT-6 + heartbeat + try/finally in V4ProductionRunner** — `dfbf38b1` (feat)
4. **Task 4.4: wire V4MessagingAdapter in webhook-processor + thread lock fields + 2 tests** — `6f2a68cc` (feat)

Plan-metadata commit (this SUMMARY) lands separately so per-task commits stay clean diff-units.

## Files Created/Modified

**Created (2):**
- `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` — 175 lines including JSDoc + LostLockError class + V4MessagingAdapter class (constructor + 2 overridden protected hooks).
- `src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` — 387 lines, 11 tests across 2 describes.

**Modified (5):**
- `src/lib/agents/engine/types.ts` — `EngineInput` extended with 4 OPTIONAL fields (~30 lines added including JSDoc).
- `src/lib/agents/somnio-v4/types.ts` — `V4AgentInput` extended with same 4 OPTIONAL fields (~25 lines added).
- `src/lib/agents/engine-adapters/production/messaging.ts` — `hasNewInboundMessage` + 4 fields visibility relaxed (private → protected); 2 new protected hooks `shouldAbortBeforeTemplate` + `onFirstSendCompleted`; send() loop body refactored to call them. Net change: ~50 lines, structural-only.
- `src/lib/agents/engine/v4-production-runner.ts` — 6 new imports; CKPT-0 + CKPT-6a + CKPT-6b blocks (~50 lines each); LostLockError catch in outer catch handler (~20 lines); try/finally wrapper around existing body (~30 lines). Net add: ~290 lines.
- `src/lib/agents/production/webhook-processor.ts` — `ProcessMessageInput` extended with 5 OPTIONAL fields (~25 lines); v4 branch reconstructs LockHandle + instantiates V4MessagingAdapter + threads 4 fields into EngineInput (~40 lines).
- `src/inngest/functions/agent-production.ts` — invokePipeline closure extended with 5 field forwarding (~15 lines added in the existing closure).
- `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — 1 new describe with 2 tests; 2 new vi.mock declarations for `processMediaGate` + `processMessageWithAgent` (the latter is new — was deep-stubbed via step.run before). Net add: ~80 lines.

## Decisions Made

- **Adapter-bundle override pattern.** When the v4 branch needs a custom messaging adapter but the rest of the adapter bundle is unchanged, build `const v4Adapters = { ...adapters, messaging: v4MessagingAdapter }` LOCALLY in the v4 branch. Don't change the `createProductionAdapters` factory function (which is shared by all agent branches). Isolates the v4 selection to a single branch and preserves the factory's existing contract.
- **Subclass override of protected hooks rather than ad-hoc swappable functions.** Could have used a callback pattern (`new ProductionMessagingAdapter({ checkAbort: customFn })`) but TypeScript class inheritance gives us better type-checking + clearer semantics + cleaner test surface. V4MessagingAdapter has its own `extends` declaration that documents the relationship to the parent.
- **LostLockError as a typed class, not a magic string.** `instanceof LostLockError` is checkable at compile time; a magic string would have required defensive `if (err.code === 'LOST_LOCK')` checks scattered across the codebase. The class is exported from `v4-messaging-adapter.ts` and imported by `v4-production-runner.ts` — explicit cross-module dependency that's visible in `import` statements.
- **REVISION W3 wins over the originally-planned conversations query.** Threading the channel + identifier from webhook → event.data → EngineInput → runner is more ergonomic AND avoids the createAdminClient anti-pattern in the runner. The originally-planned conversations query would have been more code (await + error handling) for less benefit.
- **CKPT-0 / CKPT-6 Path A persists via `_v3:pendingUserMessage` in session_state.datos_capturados.** Reuses the existing convention from v4-production-runner line 75 (the next-turn pickup path). No new schema, no new migration, no new key to maintain. The Plan 05 author handling CKPT-1..CKPT-5 will use the same convention.
- **Lock release order in finally: stopHeartbeat() BEFORE releaseLockIfOwner().** The reverse order would race: releasing first then stopping the heartbeat could let one final renewal fire between our DEL and the next holder's SET NX, extending the next holder's lock TTL out-of-band. Stopping the heartbeat first eliminates this race.
- **Path B detection is per-CKPT, not globally tracked.** Each CKPT placement reads the local `actuallySentIds.length` (CKPT-6) or its own context (CKPT-0 = always Path A since no sends possible yet) to decide Path A vs Path B. No global "hasSentAnything" flag is maintained at the runner level — the runner's own `templatesSentCount` is used only for the `lock_released_normal` event's `templates_sent` payload.
- **keepTtl SUPPORTED branch with `as` cast.** Per 00-MEASUREMENTS.md §REVISION W7 the SDK accepts `{ keepTtl: true }` at runtime even though the published TypeScript type doesn't list it. The `as { keepTtl: true }` assertion is the documented workaround.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] vi.mock hoisting trap in v4-messaging-adapter.test.ts**
- **Found during:** Task 4.2 first `npx vitest run` invocation.
- **Issue:** Initial test draft used `const mockX = vi.fn()` at module top + referenced `mockX` from inside `vi.mock(...)` factories. vi.mock factories are HOISTED to the top of the file (before the const declarations), causing `ReferenceError: Cannot access 'mockSendTextMessage' before initialization`.
- **Fix:** Rewrote using the same async-factory + post-import retrieval pattern that Plans 01-03 already established (lock.test.ts, pending.test.ts, agent-production-lock-event.test.ts). Each `vi.mock` factory declares its own `vi.fn()` and we retrieve the mock via the `as ReturnType<typeof vi.fn>` cast on the static import.
- **Files modified:** `__tests__/v4-messaging-adapter.test.ts` (test only).
- **Verification:** All 11 tests pass.
- **Committed in:** `44366f11` (Task 4.2 commit — fix landed inline before commit).

### Pragmatic adjustments documented

- **Plan 04 spec said "agent-production.ts instantiates V4MessagingAdapter" but the actual instantiation site is webhook-processor.ts.** Per the existing webhook-processor structure (the v4 branch lives there alongside v3 / godentist / godentist-fb-ig branches), wiring the adapter there matches the codebase's existing routing structure. agent-production.ts threads the lock fields into `processMessageWithAgent`, which calls into webhook-processor.ts where the v4 branch finally instantiates V4MessagingAdapter. This is a 2-step plumbing chain that the plan's prose flattened — the implementation matches the codebase, not the prose. The acceptance criteria (`grep -c "V4MessagingAdapter" src/inngest/functions/agent-production.ts >= 2`) was not satisfied verbatim, but the equivalent grep on `webhook-processor.ts` returns 5 matches (import + instantiation + 3 comments), which validates the same invariant in the actual instantiation site.
- **`startedAt` reconstruction in webhook-processor's v4 branch uses `new Date().toISOString()` not the webhook's actual startedAt.** The plan explicitly accepted this imprecision (used only in `lock_released_normal.duration_ms` payload — minor observability noise, not correctness impact).

---

**Total deviations:** 1 Rule 1 auto-fix (test mocks); 2 pragmatic adjustments (instantiation site location + startedAt imprecision). No scope creep.

**Impact on plan:** All `must_haves.truths` honored. The plan's `acceptance_criteria` grep counts are satisfied except the `V4MessagingAdapter`-in-`agent-production.ts` count, which is satisfied EQUIVALENTLY by the count in `webhook-processor.ts` (the actual instantiation site per the codebase's existing routing pattern). All `verify` blocks pass.

## Issues Encountered

None beyond the vi.mock hoisting trap (Rule 1 auto-fix above). The same pattern from Plans 01-03 worked verbatim once the mocks were rewritten using the async-factory + post-import retrieval idiom.

## User Setup Required

None — Plan 04 is code-only. The full code path activates ONLY when:
1. A workspace has `conversational_agent_id='somnio-sales-v4'` (no workspace has this today — v4 is dormant per Plan 00 Task 0.5 attestation).
2. AND the WhatsApp / ManyChat webhook handler successfully acquires the lock + populates the 6 event.data fields (Plan 03).

When (1) is flipped on for a workspace via SQL `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>';`, the next inbound message to that workspace enters the v4 path → webhook acquires lock → Inngest event carries the 6 fields → agent-production.ts forwards them → webhook-processor.ts v4 branch reconstructs LockHandle + instantiates V4MessagingAdapter + threads fields into EngineInput → V4ProductionRunner.processMessage fires CKPT-0, CKPT-6a, CKPT-6b, CKPT-7.N + heartbeat + finally-release.

## Self-Check

**Files exist:**
- `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` — FOUND
- `src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` — FOUND
- `src/lib/agents/engine/types.ts` — FOUND + modified
- `src/lib/agents/somnio-v4/types.ts` — FOUND + modified
- `src/lib/agents/engine-adapters/production/messaging.ts` — FOUND + modified
- `src/lib/agents/engine/v4-production-runner.ts` — FOUND + modified
- `src/lib/agents/production/webhook-processor.ts` — FOUND + modified
- `src/inngest/functions/agent-production.ts` — FOUND + modified
- `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — FOUND + modified

**Commits exist on `exec/debounce-v2-wave4`:**
- `3cfa3fb1` — Task 4.1 (feat) — FOUND
- `44366f11` — Task 4.2 (refactor) — FOUND
- `dfbf38b1` — Task 4.3 (feat) — FOUND
- `6f2a68cc` — Task 4.4 (feat) — FOUND

**Verification gates:**
- `npx vitest run src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` — 11/11 PASS
- `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` — 10/10 PASS (was 8/8, +2 for Task 4.4)
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` — 36/36 PASS (Wave 1+2 regression)
- `npx tsc --noEmit -p tsconfig.json` — 0 NEW errors (6 pre-existing in .next/dev/types/validator.ts + conversations.test.ts unrelated to Plan 04 changes)
- `git diff exec/debounce-v2-wave4~4..HEAD -- src/lib/agents/interruption-system-v2/` — empty (Plans 01+02 source files untouched)
- `git diff exec/debounce-v2-wave4~4..HEAD -- src/lib/whatsapp/webhook-handler.ts src/lib/manychat/webhook-handler.ts src/lib/agents/registry-helpers.ts` — empty (Plan 03 source files untouched)

**Acceptance-criteria greps (from PLAN.md):**

Task 4.1:
- `grep -c "lockHandle" src/lib/agents/engine/types.ts` → 1 ✓
- `grep -c "lockHandle" src/lib/agents/somnio-v4/types.ts` → 1 ✓
- `grep -c "ownPendingEntryJson" src/lib/agents/engine/types.ts` → 1 ✓
- `grep -c "ownPendingEntryJson" src/lib/agents/somnio-v4/types.ts` → 1 ✓
- `grep -c "lockChannel" src/lib/agents/engine/types.ts` → 1 ✓
- `grep -c "lockIdentifier" src/lib/agents/engine/types.ts` → 1 ✓
- `grep -c "lockChannel" src/lib/agents/somnio-v4/types.ts` → 1 ✓
- `grep -c "lockIdentifier" src/lib/agents/somnio-v4/types.ts` → 1 ✓
- tsc: 0 NEW errors ✓

Task 4.2:
- `grep -c "shouldAbortBeforeTemplate" messaging.ts` → 3 (declaration + call + JSDoc) ✓ (≥2 required)
- `grep -c "protected async hasNewInboundMessage" messaging.ts` → 1 ✓
- `grep -c "extends ProductionMessagingAdapter" v4-messaging-adapter.ts` → 1 ✓
- `grep -c "checkpoint('ckpt_7_pre_template'" v4-messaging-adapter.ts` → 1 ✓
- `grep -c "class LostLockError" v4-messaging-adapter.ts` → 1 ✓
- `grep -c "onFirstSendCompleted" v4-messaging-adapter.ts` → 2 (override + JSDoc) ✓
- `grep -c "removeOwnEntry" v4-messaging-adapter.ts` → 2 (import + call) ✓
- vitest: 11/11 PASS ✓
- tsc: 0 NEW errors ✓

Task 4.3:
- `grep -c "checkpoint('ckpt_0_post_acquire'" v4-production-runner.ts` → 1 ✓
- `grep -c "checkpoint('ckpt_6_pre_send_loop'" v4-production-runner.ts` → 2 (CKPT-6a + CKPT-6b) ✓
- `grep -c "startHeartbeat(" v4-production-runner.ts` → 1 ✓
- `grep -c "releaseLockIfOwner(" v4-production-runner.ts` → 1 ✓
- `grep -c "msg_aborted_path_a_combined" v4-production-runner.ts` → 4 (3 emit sites + comment) ✓
- `grep -c "msg_aborted_path_b_solo" v4-production-runner.ts` → 1 ✓
- `grep -c "lock_released_normal" v4-production-runner.ts` → 3 (emit + 2 JSDoc) ✓
- `grep -c "zombie_lambda_exit" v4-production-runner.ts` → 1 ✓
- `grep -c "pending_list_combined" v4-production-runner.ts` → 4 (3 emits + 1 comment) ✓
- `grep -c "LostLockError" v4-production-runner.ts` → 7 (1 import + 5 throws + 1 instanceof check) ✓
- `grep -c "} finally {" v4-production-runner.ts` → 1 ✓
- `grep -c "input.lockChannel" v4-production-runner.ts` → 4 (3 reads + 1 JSDoc) ✓ (≥1 required)
- `grep -c "input.lockIdentifier" v4-production-runner.ts` → 4 ✓
- `grep -c "createAdminClient" v4-production-runner.ts` → 2 (BOTH in JSDoc comments — no actual usage) ✓ (REVISION W3 — purity preserved)
- tsc: 0 NEW errors in v4-production-runner.ts ✓

Task 4.4:
- `grep -c "V4MessagingAdapter" webhook-processor.ts` → 5 (import dynamic + instantiation + 3 in JSDoc) ✓ (plan said agent-production.ts ≥2, but the actual instantiation site is webhook-processor.ts per codebase routing structure — equivalence noted in deviations)
- `grep -c "agentId === 'somnio-sales-v4'" webhook-processor.ts` → 1 ✓
- `grep -c "lockHandle:" webhook-processor.ts` → 1 (EngineInput construction) ✓
- `grep -c "ownPendingEntryJson" webhook-processor.ts` → 4 (1 interface field + 3 usages) ✓
- `grep -c "lockChannel" webhook-processor.ts` → 3 (interface + usage + JSDoc) ✓
- `grep -c "lockIdentifier" webhook-processor.ts` → 3 ✓
- `grep -c "lockHolderUuid\|lockKey\|ownPendingEntryJson\|lockChannel\|lockIdentifier" agent-production.ts` → 23 (was 18 pre-Plan-04; +5 from invokePipeline closure) ✓
- `grep -c "step.run" agent-production.ts` does NOT show new wrappers around `runner.processMessage` (the existing process-message step.run is from Phase 42.1, NOT added by Plan 04) ✓
- `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` → 10/10 PASS (was 8/8, +2 for Task 4.4 describe) ✓
- tsc: 0 NEW errors ✓

## Self-Check: PASSED

## Threat Flags

None — Plan 04 is integration-only. No new HTTP endpoints (extends existing webhook-processor + Inngest function flow), no new auth paths (the webhook layer already authenticated upstream), no new DB schema (no migration). The added Redis ops in V4MessagingAdapter.onFirstSendCompleted (`removeOwnEntry` + `redis.set` with `keepTtl: true`) are scoped to the lock key (already in the Plan 01-02 threat model) — no new Redis surface.

## Next Plan Readiness — Plan 05 (somnio-v4-agent.ts + sub-loop/index.ts)

Plan 05 author should read these implementation specifics from Plan 04:

1. **CheckpointId values remaining unwired:** Plans 04 wired 4 of 8 — `ckpt_0_post_acquire`, `ckpt_6_pre_send_loop`, `ckpt_7_pre_template`. The 4 remaining for Plan 05:
   - `ckpt_1_post_comprehension` — in somnio-v4-agent.ts, after the Haiku comprehension call returns.
   - `ckpt_2_post_state_machine` — in somnio-v4-agent.ts, after the state machine transition resolves.
   - `ckpt_3_post_tooling` — in sub-loop/index.ts, after generation tools (kb_search etc.) complete (RAG path only).
   - `ckpt_4_post_generation` — in sub-loop/index.ts, after Gemini Flash redacts the response (RAG path only).
   - `ckpt_5_post_compliance` — in sub-loop/index.ts, after compliance / safety checks (RAG path only).

   The conventional (non-sub-loop) path only fires CKPT-0, 1, 2, 6, 7.N (5 of 8). Sub-loop RAG path fires all 8. Sub-loop legacy fires 0, 1, 2, 3+4+5-combined, 6, 7.N. See `checkpoints.ts` line 17-25 path coverage matrix comment.

2. **V4AgentInput already has `lockHandle + ownPendingEntryJson + lockChannel + lockIdentifier`.** Plan 05 just consumes them in `somnio-v4-agent.ts` (CKPT-1, CKPT-2 fire at the agent layer) and threads them into sub-loop (CKPT-3, 4, 5 at the sub-loop layer). No new type plumbing needed.

3. **`readAndClearPending` at acquire-time for Path A combination (D-16).** When CKPT-1 detects an interrupt with `sentCount=0`, the agent should call `readAndClearPending(workspaceId, channel, identifier)` to get follower entries + combine with the holder's own message into a single comprehension input for the next turn. The runner already does this at CKPT-0; Plan 05 will need to do the same at CKPT-1 and CKPT-2.

4. **LostLockError propagation pattern.** Plan 05's CKPT-1 / CKPT-2 / CKPT-3 / CKPT-4 / CKPT-5 sites should THROW LostLockError when `checkpoint.lostLock === true`. The runner's outer catch already handles it (emits `zombie_lambda_exit` + returns `V4_ZOMBIE_LAMBDA_EXIT` failure code). Plan 05 just needs to throw — don't try to handle it locally.

5. **No new DB migrations or env vars.** Plan 05 is pure code, reusing the same Redis-backed primitives from Plans 01-02.

6. **Concurrency clause LOCKED at limit=1.** Plan 05 should NOT modify it.

7. **REVISION W3 still applies.** Plan 05 must consume `lockChannel + lockIdentifier` from V4AgentInput / sub-loop input — do NOT add `createAdminClient` to somnio-v4-agent.ts or sub-loop/index.ts for the purpose of resolving channel/identifier.

8. **Plan 04 left `ckpt_6_pre_send_loop_pending_templates` and `ckpt_6_pre_send_loop_main` as runtime-disambiguated checkpoint IDs.** The base CheckpointId union is `ckpt_6_pre_send_loop` — runtime emits with an `at_step` suffix in the payload for disambiguation. Plan 05 can do the same if it has multiple CKPT-3 / CKPT-4 / CKPT-5 placements within the sub-loop (unlikely, but the pattern is established if needed).

9. **No new observability labels needed.** All Path A/B/lock-released events are already in the 14-label union from Plan 01. Plan 05 reuses them (`msg_aborted_path_a_combined` + `msg_aborted_path_b_solo` + `interrupt_detected_at_ckpt_N` + `zombie_lambda_exit`).

---
*Phase: standalone-debounce-interruption-system-v2*
*Completed: 2026-05-26*
