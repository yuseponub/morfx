# debounce-interruption-system-v2 — Handoff State

Last updated: 2026-05-25 (post Plan 03 ship — Wave 3 complete; v4-gated, prod safe)

## Quick start next session

```
/clear
/gsd-execute-phase debounce-interruption-system-v2 --wave 4
```

The orchestrator finds `00..03-SUMMARY.md` → skips Plans 00–03 → starts Plan 04.

If the orchestrator stumbles on standalone discovery (this phase is in
`.planning/standalone/` not `.planning/phases/`), point it manually at
`.planning/standalone/debounce-interruption-system-v2/04-PLAN.md` and
let `gsd-executor` take it from there.

**Branch note for next session:** Plans 01-03 were executed on local branches
`exec/debounce-v2-wave1`, `exec/debounce-v2-wave2`, `exec/debounce-v2-wave3`
(created because orphan worktree `agent-a385e9ef` still holds `main` locked).
Commits were pushed via `git push origin HEAD:main` (fast-forward, non-destructive).
The orphan worktree problem is still unsolved — next session will need the same
workaround unless the worktree gets unlocked/removed first.

**v4 dormancy attestation post-Plan 03:** All new lock behavior in WhatsApp +
ManyChat webhooks + agent-production Inngest is gated behind
`resolvedAgentId === 'somnio-sales-v4'`. v4 is currently set on ZERO workspaces
(`SELECT COUNT(*) FROM workspace_agent_config WHERE conversational_agent_id='somnio-sales-v4'`
returns 0). Non-v4 traffic (v3, godentist, recompra, pw-confirmation, godentist-fb-ig)
runs byte-identical to pre-Plan 03 behavior. Activate v4 per-workspace via:
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

## Where Plan 03 left things (snapshot)

### Commits on main (most recent → oldest, last 10)

| SHA       | Subject                                                                            |
|-----------|------------------------------------------------------------------------------------|
| fae95acd  | docs(debounce-v2 plan-03): SUMMARY.md — Wave 3 webhook integration complete        |
| f96f7f0d  | feat(debounce-v2 plan-03): extend Inngest event destructure + lock-event test      |
| 3062598c  | feat(debounce-v2 plan-03): wire HOLDER/FOLLOWER lock into ManyChat webhook (v4)    |
| 0b1782a4  | feat(debounce-v2 plan-03): wire HOLDER/FOLLOWER lock into WhatsApp webhook (v4)    |
| 99e4736b  | refactor(debounce-v2 plan-03): extract resolveAgentIdForWorkspace (REVISION B4)    |
| efae64f1  | docs(debounce-v2 plan-02): HANDOFF.md — Wave 2 complete                            |
| 5711d8a3  | docs(debounce-v2 plan-02): SUMMARY.md — Wave 2 pending+checkpoint complete         |
| 06e48b62  | feat(debounce-v2 plan-02): checkpoints.ts helper + CheckpointId union + 8 tests    |
| 01cd7ab1  | feat(debounce-v2 plan-02): pending.ts RPUSH/LREM/LRANGE + 10 tests                 |
| f7380068  | docs(debounce-v2 plan-01): HANDOFF.md — Wave 1 complete                            |

All pushed to `origin/main`. Latest: `fae95acd`.

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

## Plans 04–07 dependency graph (from plan frontmatter)

```
Wave 0 → 00 ✅ DONE
Wave 1 → 01 ✅ DONE
Wave 2 → 02 ✅ DONE
Wave 3 → 03 ✅ DONE (v4-gated; prod inert until v4 flip-on)
Wave 4 → 04 (depends on: 03)   ← NEXT
Wave 5 → 05 (depends on: 04)
       └ 06 (depends on: 01, 02, 04, 05)
Wave 6 → 07 (depends on: 04, 05, 06)  ← autonomous: false (Tasks 7.3 + 7.4 are human checkpoints)
```

Wave 5 (Plan 05 + Plan 06) — Plan 06 depends on Plan 05, so they run sequentially within
the wave regardless of parallelization setting.

## Plan 04 planning constraints — surfaced from Wave 3 execution

Plan 04 wires the V4 production runner to consume the 6 event fields Plan 03 added.
Things Plan 04's author MUST know:

1. **6 event.data fields are OPTIONAL** — runner MUST check `lockHolderUuid && lockKey`
   before invoking checkpoint helpers. When null (pre-v4 callers OR fail-open path),
   skip the checkpoint logic and accept residual double-response risk.

2. **`ownPendingEntryJson` MUST be threaded END-TO-END** to
   `V4MessagingAdapter.onFirstSendCompleted` for D-16 LREM-self. Plan 04 extends
   `V4AgentInput` with `ownPendingEntryJson: string | null`. Per Plan 02's
   `pushToPending` contract (Pitfall 4 byte-exact LREM), re-serializing the entry
   object at LREM time is NOT guaranteed to match.

3. **`lockChannel + lockIdentifier` eliminate a conversations-table lookup** in
   the runner (REVISION W3 — no `createAdminClient` needed for that purpose).

4. **Concurrency setting is LOCKED at `[{ key: 'event.data.conversationId', limit: 1 }]`**.
   Plan 04 must NOT modify it. The new test
   `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` asserts
   the literal value as an invariant.

5. **Single Inngest function handles both WhatsApp and FB/IG** — both channels
   arrive at `whatsappAgentProcessor` via `agent/whatsapp.message_received`.
   Plan 04 reads `lockChannel` from `event.data` to discriminate. Do NOT
   introduce a separate Inngest function for FB/IG.

6. **`resolveAgentIdForWorkspace` is now in `@/lib/agents/registry-helpers`** —
   Plan 04's runner can import it directly if needed. Call shape unchanged:
   `await resolveAgentIdForWorkspace(workspaceId): Promise<AgentId>`. Plan 04
   will primarily read `agentIdFromWebhook` from `event.data` per REVISION W2 to
   skip the re-resolve.

7. **CheckpointId names locked** — see the 8 names at the top of this file. Plan 04
   passes these strings to the `checkpoint(ckptId, handle, ...)` helper from
   `checkpoints.ts`. Pattern-match the union directly from source, not from any
   planner prompt.

8. **No DB migrations needed for Plan 03**. v4 activation per workspace is one SQL UPDATE.

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
