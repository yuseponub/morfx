# debounce-interruption-system-v2 — Handoff State

Last updated: 2026-05-26 (Plan 07 closed — **STANDALONE CLOSED**)

## ⏹ Standalone CLOSED 2026-05-26

8 plans shipped (00..07). All commits on `origin/main` (latest `c02453fd`).

**Deferrals captured in `UAT.md`:**
- D-19 Phase 3 (Vercel preview + real WhatsApp smoke) → deferred to v4
  activation-time (per-workspace smoke when `conversational_agent_id` is flipped
  to `somnio-sales-v4`).
- D-19 Phase 4 (sandbox visual smoke) → deferred to follow-up standalone
  `debounce-v2-sandbox-integration` (cable lock-system into `SomnioV4Engine`
  so sandbox behaves like WhatsApp real).

**Ship verdict:** APPROVED to merge to main with the deferrals above
(see `UAT.md` line 230+ for sign-off + REVISION W4 acknowledgment).

**Reusable artifacts produced** (see `LEARNINGS.md` for full list):
- 14-label `LockEventLabel` typed-union pattern
- 8-value `CheckpointId` typed-union with skip-guard at every call site
- V4-only gate at webhook entry pattern (Regla 6 preservation for non-v4 agents)
- Strategy-pattern refactor on shared adapter base classes
- `vi.mock + await import + __mock` anti-hoisting test pattern

## Next standalone (follow-up)

`debounce-v2-sandbox-integration` — cable the lock-system into `SomnioV4Engine`
so the sandbox exercises the same `acquireLock` / `pushToPending` / checkpoint
behavior as the WhatsApp webhook path in production. Lets you test the
interruption system iteratively without WhatsApp / 360dialog / Vercel preview.

**Branch note for next session:** Plans 01-06 were executed on local branches
`exec/debounce-v2-wave1..5` (created because orphan worktree `agent-a385e9ef`
still holds `main` locked). Commits were pushed via `git push origin HEAD:main`
(fast-forward, non-destructive). The orphan worktree problem is still unsolved.

**Wave 5 push note:** A parallel session's commit `6768f594 docs(crm-duplicate-
order-products-integrity): standalone discuss-phase complete` landed on the
working branch between Plan 05 and Plan 06 — content was 2 planning docs + 7
debug-doralba scripts, zero overlap with debounce-v2. User chose to push it
together with Plans 05+06 as one fast-forward (recorded for next-session awareness).

**v4 dormancy attestation post-Wave 5:** Plans 03 + 04 + 05 + 06 added new code
paths ALL gated on `resolvedAgentId === 'somnio-sales-v4'` (Plans 03+04) or
file-scope V4-only (Plans 05 under `src/lib/agents/somnio-v4/**`). Plan 06 added
an Inngest cron `v2-lock-cleanup-cron` that sweeps `lock:*` keys — but only v4
creates locks, so the cron is INERT until v4 is flipped on. v4 currently set on
ZERO workspaces. All 5 non-v4 agents (v3, godentist, recompra, pw-confirmation,
godentist-fb-ig) run byte-identical to pre-Plan-03 behavior. Activate v4
per-workspace via:
`UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>';`

**CheckpointId names locked (8 values — spec-verbatim from RESEARCH Pattern 3
+ DISCUSSION-LOG D-18):** Plans 04 + 05 + 07 MUST use these exact strings,
which now live in `src/lib/agents/interruption-system-v2/checkpoints.ts`:

```
ckpt_0_post_acquire
ckpt_1_post_comprehension
ckpt_2_post_state_machine
ckpt_3_post_tooling
ckpt_4_post_generation
ckpt_5_post_compliance
ckpt_6_pre_send_loop
ckpt_7_pre_template
```

(The Plan 02 orchestrator prompt initially listed divergent names like
`ckpt_1_after_persist` / `ckpt_2_pre_router` / `ckpt_4_pre_subloop` — the
executor correctly ignored those and went with the locked spec. Future
plan prompts: pattern-match the union from `checkpoints.ts` directly.)

## Where Plan 06 left things (snapshot)

### Commits on main (most recent → oldest, last 10)

| SHA       | Subject                                                                            |
|-----------|------------------------------------------------------------------------------------|
| ee601742  | docs(debounce-v2 plan-06): SUMMARY.md — Wave 5 cron+sandbox tab complete           |
| bccf783f  | feat(debounce-v2 plan-06): sandbox Interruption tab + observability events API     |
| 3acf80b5  | feat(debounce-v2 plan-06): Inngest cron v2-lock-cleanup — D-09 layer 3 orphan sweep|
| 6768f594  | docs(crm-duplicate-order-products-integrity): standalone discuss-phase complete    |
| 68401229  | docs(debounce-v2 plan-05): SUMMARY.md — Wave 5 agent+sub-loop CKPT wiring complete |
| 1438381e  | feat(debounce-v2 plan-05): CKPT-3 + CKPT-4 + CKPT-5 in RAG sub-loop + combined     |
| 2b7250d7  | feat(debounce-v2 plan-05): CKPT-1 + CKPT-2 in somnio-v4-agent + lock fields plumb  |
| 89916918  | docs(debounce-v2 plan-04): HANDOFF.md — Wave 4 complete                            |
| 92c9a6b9  | docs(debounce-v2 plan-04): SUMMARY.md — Wave 4 runner integration complete         |
| 6f2a68cc  | feat(debounce-v2 plan-04): wire V4MessagingAdapter + thread lock fields (Task 4.4) |

All pushed to `origin/main`. Latest: `ee601742`. (`6768f594` is unrelated user
work for the `crm-duplicate-order-products-integrity` standalone — documented above.)

### Wave 5 deliverables (Plans 05 + 06)

**Plan 05** — 3 files (V4-only by file scope under `src/lib/agents/somnio-v4/**`):

- **EDIT** `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — CKPT-1
  `ckpt_1_post_comprehension` at line 130 (throw 136) + CKPT-2
  `ckpt_2_post_state_machine` at line 328 (throw 334). `lockHandle/lockChannel/
  lockIdentifier` threaded into `SubLoopContext` for both `runRagSubLoop` +
  `runLegacySubLoop` call sites.
- **EDIT** `src/lib/agents/somnio-v4/sub-loop/index.ts` — `SubLoopContext`
  extended with 3 OPTIONAL lock fields. Module-scoped helper `ckptInSubLoop()`
  (line 112) centralizes skip-guard + LostLockError throw. CKPT-3
  `ckpt_3_post_tooling` line 291, CKPT-4 `ckpt_4_post_generation` line 396,
  CKPT-5 `ckpt_5_post_compliance` line 454 — all in `runRagSubLoop`. Combined
  CKPT at line 762 in `runLegacySubLoop` (per coverage matrix line 881).
- **EDIT** `src/lib/agents/somnio-v4/types.ts` — REVISION W1 verify (no-op:
  Plan 04 already added the 4 lock fields per grep).
- `LostLockError` imported from `../engine-adapters/production/v4-messaging-adapter`
  (existing export from Plan 04; no new export added).
- **Inter-task tsc dependency** disclosed: Task 5.1 commit alone fails tsc;
  Task 5.2 commit fixes it. Both must land together (bisect hazard noted in
  SUMMARY).

**Plan 06** — 7 files (cron + sandbox UI + observability API route):

- **NEW** `src/inngest/functions/v2-lock-cleanup-cron.ts` — Inngest cron
  `id: 'v2-lock-cleanup-cron'`, schedule `TZ=America/Bogota */5 * * * *`. Uses
  `redis.scan` cursor loop (NOT `redis.keys` — verified gate). Compares against
  `agent_sessions WHERE status='active'` (per actual schema — D-09 verbatim
  with comment citing migration `20260205000000_agent_sessions.sql` line 14).
  DELs orphans + emits `lock_orphan_swept_by_cron` (14th label per REVISION B1).
  Defense-in-depth ag-out: sweeps locks older than `MAX_TURN_AGE_S=60s` even when
  session is active. Wrapped in `step.run` for Inngest retry safety.
- **EDIT** `src/app/api/inngest/route.ts` — register `v2LockCleanupCron` in the
  `functions: [...]` array (additive).
- **NEW** `src/app/api/observability/events/route.ts` — GET endpoint. Auth
  mirrors `src/app/api/sandbox/process/route.ts` (`createClient()` server +
  `auth.getUser()` + 401 anonymous). Uses `createRawAdminClient()` for reads.
  2-step resolution: session → conversation → turn_ids (because
  `agent_observability_events` is partitioned by `recorded_at` and carries only
  `turn_id`). Accepts `session_id`, `conversation_id`, `labels` (CSV), `limit`
  (default 200) query params.
- **EDIT** `src/lib/sandbox/types.ts` — `DebugPanelTabId` union +
  `'interruption'` (10th value).
- **EDIT** `src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx` —
  `interruption: Lock` added to exhaustive `TAB_ICONS: Record<...>` (anti-Pitfall
  6 — TS catches missing entries).
- **NEW** `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx`
  — React client component. Fetches the 14 D-17-extended events from the new
  API route. Renders a lifecycle timeline (lock_acquired → checkpoints →
  lock_released_normal / msg_aborted_path_*). NO live SSE (Open Question 3 —
  post-turn fetch only). Sandbox tab currently mounted with `null` props
  (placeholder visible; future dashboard inspector can mount with real IDs).
- **EDIT** `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx`
  + `panel-container.tsx` — wire `<InterruptionTab .../>` into tab content.

Test totals: **69/69 PASS** (12 new cron + 11 V4 adapter + 10 Plan 03/04 lock-event
+ 36 Wave 1-2). `npx tsc --noEmit` clean for all modified files.

### All 14 LockEventLabel values now wired end-to-end across Plans 03-06

| Label | Emitted by | Plan |
|---|---|---|
| `lock_acquired` | webhook (holder), V4MessagingAdapter | 03, 04 |
| `lock_busy_enqueue_pending` | webhook (follower) | 03 |
| `lock_acquire_failed_follower` | webhook (follower) | 03 |
| `interrupt_written` | webhook (follower) | 03 |
| `redis_unavailable_fallback_failed` | webhook (fail-open) | 03 |
| `interrupt_detected_at_ckpt_0..7` | `checkpoint()` itself | 02 (one of 8 ckpt IDs) |
| `zombie_lambda_exit` | V4ProductionRunner outer catch (LostLockError) | 04 |
| `lock_released_normal` | V4ProductionRunner finally | 04 |
| `msg_aborted_path_a_combined` | V4MessagingAdapter / V4ProductionRunner | 04 |
| `msg_aborted_path_b_solo` | V4MessagingAdapter | 04 |
| `pending_list_combined` | V4MessagingAdapter LREM-self | 04 |
| `lock_orphan_swept_by_cron` | v2-lock-cleanup-cron | 06 |

### Regla 6 hand-trace (still verified, end-to-end)

| Agent | Adapter | Runner | Behavior |
|---|---|---|---|
| `somnio-sales-v3` | `ProductionMessagingAdapter` (parent) | V3 production runner | byte-identical |
| `godentist` | `ProductionMessagingAdapter` (parent) | godentist runner | byte-identical |
| `godentist-fb-ig` | `ProductionMessagingAdapter` (parent) | godentist-fb-ig runner | byte-identical |
| `somnio-recompra-v1` | `ProductionMessagingAdapter` (parent) | recompra runner | byte-identical |
| `somnio-sales-v3-pw-confirmation` | `ProductionMessagingAdapter` (parent) | pw-confirmation runner | byte-identical |
| `somnio-sales-v4` | `V4MessagingAdapter` (Plan 04) | `V4ProductionRunner` w/ CKPT-0..7 wired | **DORMANT in prod** |

Cron `v2-lock-cleanup-cron`: scans `lock:*` every 5 min. Only v4 creates locks
→ today the cron sweeps nothing (no lock keys exist). Inert by default.

### Wave 4 deliverables (Plan 04)

6 files modified + 1 NEW adapter + 2 NEW test files:

- **EDIT** `src/lib/agents/engine/types.ts` — `EngineInput` +4 OPTIONAL fields:
  `lockHandle? | ownPendingEntryJson? | lockChannel? | lockIdentifier?` (REVISION W3).
- **EDIT** `src/lib/agents/somnio-v4/types.ts` — `V4AgentInput` +same 4 OPTIONAL fields.
- **EDIT** `src/lib/agents/engine-adapters/production/messaging.ts` — strategy-pattern
  refactor: `hasNewInboundMessage` private → protected; 2 new protected extension
  points extracted (`shouldAbortBeforeTemplate`, `onFirstSendCompleted`). Parent
  `send()` calls them in same order — non-v4 agents byte-identical (3 Regla 6 tests
  codify the contract).
- **NEW** `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` —
  `V4MessagingAdapter extends ProductionMessagingAdapter`. Overrides
  `shouldAbortBeforeTemplate` to call `checkpoint('ckpt_7_pre_template', ...)`
  instead of Phase 31 `hasNewInboundMessage`. Overrides `onFirstSendCompleted`
  to call `removeOwnEntry(ownPendingEntryJson)` for D-16 LREM-self. Emits Path A
  (`msg_aborted_path_a_combined`) or Path B (`msg_aborted_path_b_solo`) on interrupt.
- **EDIT** `src/lib/agents/engine/v4-production-runner.ts` — inserted CKPT-0
  `ckpt_0_post_acquire` after session resolution; CKPT-6 `ckpt_6_pre_send_loop`
  before main templates loop. `startHeartbeat(input.lockHandle)` at top, stop in
  finally. `releaseLockIfOwner(input.lockHandle)` in finally (D-09 layers 1+2).
  **No `createAdminClient` added** — channel/identifier read from
  `input.lockChannel` + `input.lockIdentifier` (REVISION W3 — verified via grep).
- **EDIT** `src/inngest/functions/agent-production.ts` — threads the 5 lock-correlation
  fields (`lockHolderUuid`, `lockKey`, `ownPendingEntryJson`, `lockChannel`,
  `lockIdentifier`) from event.data → `processMessageWithAgent` → webhook-processor.
  Concurrency limit=1 UNCHANGED.
- **EDIT** `src/lib/agents/production/webhook-processor.ts` — v4 branch (`agentId ===
  'somnio-sales-v4'`, around line 819) instantiates `V4MessagingAdapter` via dynamic
  import (matches existing pattern on line 231 for somnio-v4 module load).
  Reconstructs `LockHandle` from `lockHolderUuid + lockKey` (only when both present).
  Passes lock fields into `EngineInput`.
- **NEW** `src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts`
  — 11 tests (3 parent-Regla 6 preservation + 8 V4 override semantics).
- **EDIT** `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` —
  +2 tests for Task 4.4 threading (was 8/8 → 10/10 PASS).

Module test totals: **57/57 PASS** (11 V4 adapter + 10 lock-event extended + 36 Wave 1-2
regression). `npx tsc --noEmit` clean for all modified files.

### Regla 6 hand-trace (verified)

| Agent | Adapter | Runner | Behavior |
|---|---|---|---|
| `somnio-sales-v3` | `ProductionMessagingAdapter` (parent) | V3 production runner | byte-identical |
| `godentist` | `ProductionMessagingAdapter` (parent) | godentist runner | byte-identical |
| `godentist-fb-ig` | `ProductionMessagingAdapter` (parent) | godentist-fb-ig runner | byte-identical |
| `somnio-recompra-v1` | `ProductionMessagingAdapter` (parent) | recompra runner | byte-identical |
| `somnio-sales-v3-pw-confirmation` | `ProductionMessagingAdapter` (parent) | pw-confirmation runner | byte-identical |
| `somnio-sales-v4` | `V4MessagingAdapter` (new) | `V4ProductionRunner` | new lock+CKPT path — DORMANT in prod |

V4 = 0 workspaces today → V4MessagingAdapter never instantiates in prod.

### Plan 04 pragmatic deviations (test-only or structural; production code semantically aligned)

1. **V4MessagingAdapter instantiation lives in `webhook-processor.ts`, not
   `agent-production.ts`.** The v4 routing branch already lived in
   webhook-processor.ts (line 819+); this is its natural home. The plan's
   `files_modified` listed agent-production.ts; in practice both files were
   modified — agent-production.ts threads the 5 fields TO webhook-processor.ts,
   which instantiates V4MessagingAdapter.
2. **`LockHandle.startedAt` reconstruction** uses `new Date().toISOString()` in
   webhook-processor.ts (not the original webhook timestamp) — minor observability
   noise in `lock_released_normal.duration_ms`. Acceptable per plan.
3. **`vi.mock` hoisting trap** in initial v4-messaging-adapter.test.ts draft —
   rewrote with async-factory + post-import retrieval (Plans 01-03 LEARNING pattern).
   Test-only fix; 11/11 PASS after.

### Wave 3 deliverables (Plan 03)

1 NEW shared module + 3 EDITED live production files + 1 NEW test file:

- **NEW** `src/lib/agents/registry-helpers.ts` — exports
  `resolveAgentIdForWorkspace(workspaceId): Promise<AgentId>` (REVISION B4 — webhooks
  can now STATIC-import this without dynamic-import circular risk). Recognizes
  `'somnio-sales-v4'` as its own bucket (additive). `AgentId` type union ALREADY
  contained `'somnio-sales-v4'` (no schema change needed).
- **EDIT** `src/lib/whatsapp/webhook-handler.ts` — added STATIC imports for
  `acquireLock` + `pushToPending` + `redis` + `emitLockEvent` + `resolveAgentIdForWorkspace`
  + `randomUUID`. Inside `processIncomingMessage`, added gated branch
  `if (resolvedAgentId === 'somnio-sales-v4')` covering HOLDER, FOLLOWER, and fail-open
  paths per RESEARCH Pattern 2. Non-v4 traffic: branch skipped, existing flow runs.
- **EDIT** `src/lib/manychat/webhook-handler.ts` — same pattern with
  `channel='facebook'|'instagram'` and `identifier=external_subscriber_id` (D-12).
  Static imports. v4-gated. v4 currently serves WhatsApp only so this code is
  doubly-inert for godentist-fb-ig (its `conversational_agent_id` is `'godentist'`).
- **EDIT** `src/inngest/functions/agent-production.ts` — REMOVED the local
  `resolveAgentIdForWorkspace` definition (now imported from registry-helpers).
  EXTENDED `event.data` destructure with 6 OPTIONAL fields:
  `lockHolderUuid?`, `lockKey?`, `ownPendingEntryJson?`, `lockChannel?`,
  `lockIdentifier?`, `agentId?` — all backward-compatible (pre-v4 events that
  omit these fields continue working). **Concurrency limit UNCHANGED at
  `[{ key: 'event.data.conversationId', limit: 1 }]`** (D-14 invariant).
- **NEW** `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` —
  8 tests asserting (a) concurrency literal value (D-14 invariant), (b) function
  accepts events with all 6 fields populated AND propagates them, (c) function
  still accepts events WITHOUT them (backward compatibility).

Module test totals: **44/44 PASS** (8 new agent-production tests + 36 Wave 1+2 regression).
`npx tsc --noEmit` clean for all 5 modified files.

### Regla 6 hand-trace (verified, byte-identical for all non-v4 agents)

| Agent | resolved | v4Path | Status |
|---|---|---|---|
| v3 (`somnio-sales-v3`) | `'somnio-v3'` | false | byte-identical |
| godentist | `'godentist'` | false | byte-identical |
| recompra (v0/v1) | `'somnio-recompra'` | false | byte-identical |
| pw-confirmation (routed via `routing_rules`, not via `conversational_agent_id`) | `'somnio-v3'` | false | byte-identical |
| godentist-fb-ig (routed by lifecycle router on `channel` fact) | `'godentist'` | false | byte-identical |

v4 = ZERO workspaces in prod today (verified at deploy time). Plan 03's new code
path is INERT in production until v4 is flipped on per-workspace by an explicit
operator action.

### Two pragmatic deviations documented in 03-SUMMARY.md (production code correct)

1. `existing_holder_uuid: 'unknown'` in follower events — skip extra `redis.get`
   roundtrip; UUID can be correlated via the matching `lock_acquired` event from
   the same lock key.
2. `ttl: 45` inlined as literal in `lock_acquired` payload — avoids dragging
   `LOCK_TTL_S` import into webhook handlers for a single annotation. Inline
   comment points at `lock.ts` as source.

### Wave 2 deliverables (Plan 02)

4 new files under `src/lib/agents/interruption-system-v2/`:

- `pending.ts` — `pushToPending` (returns `{pendingListLength, exactJson}`),
  `removeOwnEntry` (byte-exact match Pitfall 4), `readAndClearPending`
  (atomic `multi().del().exec()`), `PendingEntry` interface.
  Deterministic JSON serialization with alphabetical keys
  (`content, entry_uuid, msg_id, received_at`).
- `checkpoints.ts` — `checkpoint(ckptId, handle, ...)` helper combining
  D-15 fencing (`assertHoldsLock` → `zombie_lambda_exit` + `lostLock:true`)
  + interrupt detection (`interrupt_detected_at_ckpt_N` + `interrupted: {pendingListLength}`).
  `CheckpointId` typed union (8 D-18 values — see locked names above).
- `__tests__/pending.test.ts` — 10 tests including Pitfall 4 negative
  (reversed-key-order JSON fails to LREM).
- `__tests__/checkpoints.test.ts` — 8 tests covering proceed / zombie / interrupted-A / interrupted-B + all 8 CheckpointId values.

Module total now: **36/36 vitest PASS** (4 files: lock + observability + pending + checkpoints).
`npx tsc --noEmit` clean for all 11 new files in the module.

### Module public surface (complete after Plan 02 — Plans 03–07 only consume)

Plans 03–07 import exclusively from `@/lib/agents/interruption-system-v2/{lock,pending,checkpoints,observability,redis-client}`. No further primitives needed.

| Export | From | Consumers |
|--------|------|-----------|
| `acquireLock`, `releaseLockIfOwner`, `startHeartbeat`, `assertHoldsLock`, `LockHandle`, `LOCK_TTL_S`, `HEARTBEAT_MS` | `lock.ts` | Plans 04 (runner), 06 (cron), 07 (E2E) |
| `pushToPending`, `removeOwnEntry`, `readAndClearPending`, `PendingEntry` | `pending.ts` | Plans 03 (webhook), 04 (runner), 05 (adapter) |
| `checkpoint`, `CheckpointId`, `CheckpointResult` | `checkpoints.ts` | Plans 04 (runner), 05 (agent integration) |
| `emitLockEvent`, `LockEventLabel` | `observability.ts` | Plans 03–07 (all) |
| `redis` | `redis-client.ts` | All — but prefer typed helpers above |
| `createMockRedis` | `__tests__/_helpers/mock-redis.ts` | Test files in Plans 03–07 |

### Plan 04 caveat — thread `exactJson` end-to-end

`pushToPending` returns a tuple `{pendingListLength, exactJson}`. Plan 04
(V4MessagingAdapter `onFirstSendCompleted` D-16 LREM-self) MUST thread
`exactJson` through `V4AgentInput` type from runner → adapter, then pass
it back to `removeOwnEntry`. Re-serializing the entry object at LREM time
is NOT byte-guaranteed to match (Pitfall 4). Flag this when planning Plan 04.

### Deviations during Plan 02 (both test-only auto-fixes; production code correct)

1. `pending.test.ts` atomic-clear assertion — mock-redis `multi()` stub
   doesn't back-port `tx.del()` to lists Map (Plan 01 mock kept untouched
   per critical_constraints). Adjusted test to assert call-shape (`multi`
   called, `tx.del(key)` scheduled, `tx.exec()` awaited). Plan 07
   integration tests will validate end-to-end against real Upstash.
2. `checkpoints.test.ts` Path A assertion — `.toEqual` exact-shape failed
   because implementation correctly returns `interrupted.interruptMsgId`
   per RESEARCH spec. Switched to field-by-field asserts (more precise
   + catches `lostLock: undefined` invariant).

### Infrastructure state

- **Upstash Redis** (sa-east-1, São Paulo):
  - `morfx-interruption-prod` → `excited-dogfish-66405.upstash.io` (Pay-as-you-go, single-zone)
  - `morfx-interruption-dev`  → `deep-gator-136538.upstash.io` (Free tier)
- **Vercel** project `morfx` env vars (4 total):
  - Production env: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (PROD creds)
  - Preview env:    `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (DEV creds — Pitfall 5 isolation)
- **`.env.local`**: UPSTASH_REDIS_REST_URL/TOKEN pointing at DEV DB.
- **`.env.example`** (line ~38): UPSTASH block documented (committed).
- **`@upstash/redis@1.38.0`** in both `package.json` and `pnpm-lock.yaml`.

### Locked decisions / constants

| Constant            | Locked value | Source                                                                                      |
|---------------------|--------------|---------------------------------------------------------------------------------------------|
| `LOCK_TTL_S`        | 45 seconds   | DISCUSSION-LOG D-09; Task 0.1 N=0 → fallback rule (00-MEASUREMENTS.md §Sub-loop)             |
| `HEARTBEAT_MS`      | 5000         | RESEARCH A1 ratio (~9x against TTL); preserved by `{ keepTtl: true }` per W7 verdict        |
| `keepTtl` SDK option| SUPPORTED    | Task 0.5b empirical probe (00-MEASUREMENTS.md §REVISION W7)                                 |
| WhatsApp dedup      | COVERED      | `messages_wamid_unique UNIQUE (wamid)` — Task 0.4 (00-MEASUREMENTS.md §Messages dedup)      |
| `agent_id` for prod | `'somnio-v3'`| Task 0.1 discovery — NOT `'somnio-sales-v3'` (plan text was inaccurate). Apply to Plans 04-07. |

### Risks deferred (forward-looking)

1. **Multi-Zone HA**: not activated at provisioning ($200/mo declined). Re-evaluate at v4 flip-to-active. Single-zone tolerated while v4 dormant.
2. **FB/IG inbound dedup**: `messages` table lacks UNIQUE on FB/IG message ID. v4 serves WhatsApp only today; gap closes whenever v4 onboards FB/IG (separate standalone). Plan 03 SUMMARY re-affirms acceptance.
3. **In-region Vercel→Upstash latency unvalidated**: Vercel Auth team-level gated the preview probe; WSL-local pivot captured upper-bound numbers only. Plan 05 E2E smoke + Phase 42.1 observability will close this.
4. **Orphan Claude-Code worktrees**: ~14 stale `.claude/worktrees/agent-*` debris (one had `main` checked out + locked, blocked our checkout flow this session — used `update-ref` workaround). Out of scope for this standalone; consider a cleanup pass before resuming heavy parallel execution.

## Plan 07 dependency graph (from plan frontmatter)

```
Wave 0 → 00 ✅ DONE
Wave 1 → 01 ✅ DONE
Wave 2 → 02 ✅ DONE
Wave 3 → 03 ✅ DONE (v4-gated; prod inert until v4 flip-on)
Wave 4 → 04 ✅ DONE (v4-gated; prod inert)
Wave 5 → 05 ✅ DONE (v4-only by file scope)
       └ 06 ✅ DONE (cron + sandbox tab; cron inert while v4 dormant)
Wave 6 → 07 (depends on: 04, 05, 06)  ← NEXT — autonomous: false (Tasks 7.3 + 7.4 are human checkpoints)
```

## Wave 6 planning constraints — surfaced from Wave 5 execution

Plan 07 is the final wave: E2E integration tests + activation gates. Module
public surface is COMPLETE end-to-end (Plans 01-06 shipped, all 14 LockEventLabel
emission sites wired). Things Plan 07's author MUST know:

### Plan 07 (E2E + activation — autonomous: false)

1. **TWO human checkpoints** (Tasks 7.3 + 7.4 are blocking — non-autonomous).
   Orchestrator pauses for user input. These typically gate v4 activation per-workspace.

2. **Activation SQL** (single command — no migration needed):
   ```sql
   UPDATE workspace_agent_config
     SET conversational_agent_id='somnio-sales-v4'
     WHERE workspace_id='<uuid>';
   ```
   Rollback: same UPDATE with the previous agent_id value.

3. **Cron is INERT in production until v4 activation.** v4 = 0 workspaces today
   → no `lock:*` keys exist → `v2-lock-cleanup-cron` sweeps nothing. Plan 07
   Task 7.3 visual checkpoint can include "open `/sandbox`, click Interruption
   tab in tab bar, confirm placeholder renders" as a 30-second smoke. Tab is dev-only.

4. **HTTP endpoint available** — Plan 07 E2E can hit `/api/observability/events`
   directly:
   ```
   GET /api/observability/events?conversation_id=<uuid>&labels=lock_acquired,lock_released_normal
   ```
   Auth-gated (mirrors `sandbox/process` pattern).

5. **All 14 LockEventLabel values are wired end-to-end** (Plans 03-06). Plan 07
   coverage matrix can grep:
   ```
   grep -rn "emitLockEvent" src/
   ```
   to confirm all label values appear in production code.

6. **`MAX_TURN_AGE_S = 60` constant** in `src/inngest/functions/v2-lock-cleanup-cron.ts`.
   Plan 07 baseline should confirm real v4 turn latency stays well below this.
   Bump to 90s or 120s with a measurement citation if 95th percentile approaches 60s.

### Architectural facts unchanged

- **Concurrency setting LOCKED** at `[{ key: 'event.data.conversationId', limit: 1 }]`
  (Plan 03's `agent-production-lock-event.test.ts` asserts the literal value).
- **Single Inngest function** handles both WhatsApp and FB/IG via `lockChannel`.
- **`resolveAgentIdForWorkspace` lives in `@/lib/agents/registry-helpers`**
  (Plan 03 REVISION B4).
- **No DB migrations** needed in this entire phase.
- **8 CheckpointId values are spec-locked** in `checkpoints.ts` — pattern-match
  directly from source, not from planner prompts.

## Useful commands when resuming

```bash
# Confirm phase state
ls .planning/standalone/debounce-interruption-system-v2/

# Verify env wiring is still alive (after possible Vercel redeploys)
vercel env ls | grep UPSTASH        # → expect 4 rows (URL/TOKEN × Production/Preview)
grep UPSTASH .env.local              # → expect 2 rows (DEV creds)

# Verify @upstash/redis still installed
node -e "require('@upstash/redis')"  # → exit 0

# Smoke-test Upstash reachability before Plan 01 starts
node -e "
import('dotenv').then(d => d.config({ path: '.env.local' })).then(async () => {
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  const t0 = performance.now();
  await r.set('handoff-smoke', '1', { ex: 5 });
  await r.del('handoff-smoke');
  console.log('Upstash round-trip ms:', performance.now() - t0);
});
"
```

## Pointers to authoritative artifacts

- **What was built (per task)**: `00-SUMMARY.md` ← in same directory.
- **Measurements and decisions**: `00-MEASUREMENTS.md` ← in same directory.
- **Locked discussions (30 D's)**: `DISCUSSION-LOG.md` ← in same directory.
- **Research and pitfalls**: `RESEARCH.md` ← in same directory.
- **Plan files**: `01-PLAN.md` through `07-PLAN.md` ← in same directory.
