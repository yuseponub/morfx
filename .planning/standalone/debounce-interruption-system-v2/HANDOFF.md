# debounce-interruption-system-v2 — Handoff State

Last updated: 2026-05-25 (post Plan 02 ship — Wave 2 complete)

## Quick start next session

```
/clear
/gsd-execute-phase debounce-interruption-system-v2 --wave 3
```

The orchestrator finds `00..02-SUMMARY.md` → skips Plans 00–02 → starts Plan 03.

If the orchestrator stumbles on standalone discovery (this phase is in
`.planning/standalone/` not `.planning/phases/`), point it manually at
`.planning/standalone/debounce-interruption-system-v2/03-PLAN.md` and
let `gsd-executor` take it from there.

**Branch note for next session:** Plans 01 + 02 were executed on local branches
`exec/debounce-v2-wave1` and `exec/debounce-v2-wave2` (created because orphan
worktree `agent-a385e9ef` still holds `main` locked). Commits were pushed via
`git push origin HEAD:main` (fast-forward, non-destructive). The orphan worktree
problem is still unsolved — next session will need the same workaround unless
the worktree gets unlocked/removed first.

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

## Where Plan 02 left things (snapshot)

### Commits on main (most recent → oldest, last 10)

| SHA       | Subject                                                                            |
|-----------|------------------------------------------------------------------------------------|
| 5711d8a3  | docs(debounce-v2 plan-02): SUMMARY.md — Wave 2 pending+checkpoint complete         |
| 06e48b62  | feat(debounce-v2 plan-02): checkpoints.ts helper + CheckpointId union + 8 tests    |
| 01cd7ab1  | feat(debounce-v2 plan-02): pending.ts RPUSH/LREM/LRANGE + 10 tests (LOCK-04)       |
| f7380068  | docs(debounce-v2 plan-01): HANDOFF.md — Wave 1 complete                            |
| b97a6b15  | docs(debounce-v2 plan-01): SUMMARY.md — Wave 1 primitives complete                 |
| c5587e6c  | feat(debounce-v2 plan-01): observability.ts 14-label typed emitter + tests         |
| 617d3fc8  | feat(debounce-v2 plan-01): lock primitives + mock-redis helper + lock.test.ts      |
| 28a2ebde  | feat(debounce-v2 plan-01): redis-client singleton + RELEASE_IF_OWNER_LUA           |
| 3c04e709  | docs(debounce-v2 plan-00): HANDOFF.md for next-session resume                      |
| 3972ea70  | docs(debounce-v2 plan-00): SUMMARY.md — Wave 0 foundation complete                 |

All pushed to `origin/main`. Latest: `5711d8a3`.

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

## Plans 03–07 dependency graph (from plan frontmatter)

```
Wave 0 → 00 ✅ DONE
Wave 1 → 01 ✅ DONE
Wave 2 → 02 ✅ DONE
Wave 3 → 03 (depends on: 02)   ← NEXT
Wave 4 → 04 (depends on: 03)
Wave 5 → 05 (depends on: 04)
       └ 06 (depends on: 01, 02, 04, 05)
Wave 6 → 07 (depends on: 04, 05, 06)  ← autonomous: false (Tasks 7.3 + 7.4 are human checkpoints)
```

Wave 5 (Plan 05 + Plan 06) — Plan 06 depends on Plan 05, so they run sequentially within
the wave regardless of parallelization setting.

## Imports Plan 03 will consume from Waves 1+2

When Plan 03 (webhook integration) runs, expect it to import:
- `acquireLock` from `./lock` — returns null when the lock is held by another lambda
- `pushToPending`, `removeOwnEntry` (caller stores the returned `exactJson`!), `PendingEntry` from `./pending`
- `emitLockEvent` (labels: `interrupt_written`, `lock_busy_enqueue_pending`, etc.) from `./observability`
- `redis` from `./redis-client` — for the `SET interrupt:<ws>:<channel>:<identifier> <msg_id>` interrupt-key write
- `createMockRedis` from `./__tests__/_helpers/mock-redis` (test-only)

Plan 03 webhook follower path (per spec): `acquireLock` returns null → `pushToPending(entry)` → `SET interrupt:...` → emit `interrupt_written` → 200 OK.

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
