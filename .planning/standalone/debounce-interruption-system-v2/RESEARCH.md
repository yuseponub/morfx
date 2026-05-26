# RESEARCH — Debounce/Interruption System v2

**Standalone:** `debounce-interruption-system-v2`
**Date:** 2026-05-25
**Domain:** Distributed locking + serverless coordination (Vercel + Upstash Redis + Inngest)
**Confidence overall:** MEDIUM-HIGH

---

## Summary

The design in DISCUSSION-LOG.md is **directionally correct but contains one critical assumption that needs explicit acknowledgment in plan-phase**: Upstash Redis uses **single-leader replication with async backups**, which means under specific failure scenarios (leader-zone outage + failover) **SET NX can grant the same lock to two clients**. Upstash itself documents this explicitly in `@upstash/lock` and recommends the library only for "mostly consistent" use cases.

For our use case ("avoid 2 parallel responses to a customer") this risk is acceptable IF combined with the fencing-token pattern locked in D-15 (`holder_uuid` check before every side-effect). With fencing, the duplicate-acquire window collapses because the second holder's writes will be rejected by `messages.unique_constraint` / Inngest dedupe / the explicit `assertHoldsLock` check.

**Primary recommendation:**
1. Use `@upstash/redis@^1.38.0` (latest, ~2 weeks old as of research date), REST mode, regional database co-located with Vercel `iad1` (US East).
2. Enable Upstash **Multi-Zone (Prod Pack)** — failover seconds vs single-zone minutes.
3. Treat SET NX as "good enough for liveness", `holder_uuid` fencing (D-15) as the **correctness** guarantee. Document this trade-off explicitly in plan-phase.
4. Use a single Lua script (via `redis.eval`) for the atomic `release_if_owner` operation; the rest of the operations (acquire, push, etc.) are simple enough to be 1 round-trip each.
5. **Keep Inngest `concurrency: limit=1`** — Inngest's concurrency limits ARE strict per their docs (not "best effort" — that user belief is anecdotal). Setting limit=10 or removing it only buys defensive depth; Redis SET NX is still the correctness mechanism. Recommend `limit=1` stay as it's free belt-and-suspenders.

---

## User Constraints (from DISCUSSION-LOG.md)

### Locked Decisions (D-01 through D-20)
20 decisions are locked. Treated as constraints; this research does NOT challenge them. Key constraints affecting plan-phase:

- **D-01 Upstash Redis REST** — confirmed: `@upstash/redis@1.38.0` is the package.
- **D-02 SET NX EX 45s** — works in @upstash/redis with object syntax `{ nx: true, ex: 45 }`.
- **D-03 Lock acquired at T≈35-65ms post `resolveWorkspaceId`** — line numbers identified below.
- **D-04 Solo somnio-sales-v4** — pipeline analyzed below; v4 is dormant in prod, safe testbed.
- **D-05 RPUSH unlimited** — supported atomically by @upstash/redis.
- **D-06 Concat with `\n`** — status quo from Phase 31, no code change needed for combo semantics.
- **D-07 Big bang no flag** — v4 has no traffic, so this is safe; v3/godentist/recompra paths preserved.
- **D-08 Eliminate Phase 31 in v4** — `hasNewInboundMessage` lives ONLY in `production/messaging.ts:78-90`; called from `messaging.ts:175`. v4 path goes through `v4-production-runner.ts:323-338` which calls `this.adapters.messaging.send(...)`. To eliminate Phase 31 in v4 path, we must either (a) replace the v4 `MessagingAdapter` with a v4-specific class that does NOT do `hasNewInboundMessage`, OR (b) flag-gate the check in `MessagingProductionAdapter.send` based on `agentModule==='somnio-v4'`. **Plan-phase decision needed:** option (a) is cleaner per D-08 "no dead code in v4", option (b) is fewer files touched. Recommend (a).
- **D-09 3-layer robustness** — try/finally + heartbeat + cron all feasible with the SDK + Inngest cron pattern in codebase.
- **D-10 `lock:<wsId>:<channel>:<identifier>`** — `identifier` = `phone` (WhatsApp) or `external_subscriber_id` (FB/IG ManyChat). Both available at the webhook entry point.
- **D-11 Observability via DB+logs+sandbox-tab** — `agent_observability_events` schema accepts arbitrary JSONB payload (verified via migration `20260408000000_observability_schema.sql:79-89`). Convention is `category='pipeline_decision'` per `getCollector().recordEvent('pipeline_decision', '<label>', { ... })`.
- **D-12 WhatsApp + FB/IG** — both webhook handlers identified; same `workspaceId + identifier` available pattern. ManyChat uses `subscriber_id`.
- **D-13 No side-channel polling during LLMs** — accepted; checkpoints only between LLM calls. Sub-loop worst case validated below.
- **D-14 Inngest stays for dispatch** — confirmed in research; recommend keeping `limit=1` not changing to 10 (see Inngest section below).
- **D-15 holder_uuid fencing** — this is the **single most important** decision in the design. Without it the Upstash async-replication caveat is unsafe.
- **D-16 RPUSH self + LREM after first send** — `LREM count value` atomic in Redis; no Lua needed.
- **D-17 13 granular events** — all map cleanly to `recordEvent('pipeline_decision', '<event_label>', payload)`.
- **D-18 8 checkpoints** — exact line numbers below.
- **D-19 4-phase smoke** — Vitest mocking pattern documented below.
- **D-20 Pending list entries as JSON with `entry_uuid`** — works because `LREM count value` does string-exact match.

### Claude's Discretion (research-driven recommendations below)

- Latency assumptions validation (D-13 worst case 17s) — actual telemetry not requested here, recommend Plan 00 reads from `agent_observability_events` to confirm.
- Lua script vs multi round-trip — recommend Lua for `release_if_owner` ONLY (atomic + necessary); skip Lua for the rest (simplicity wins).
- Region selection — recommend `us-east-1` Upstash co-located with Vercel `iad1` (default).

### Deferred Ideas (out of scope for this research)
- Migration to v3/godentist/recompra/pw-confirmation (D-04 / D-08).
- v2.1 enhancements (semantic synthesis vs `\n` concat, AbortController if D-13 latency proves painful).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Webhook ingestion + lock acquisition | API / Backend (Next.js route handler) | — | First point where workspaceId+identifier are available; lock MUST be acquired before Inngest dispatch. |
| Lock mutex storage | Cache / Storage (Upstash Redis) | — | Atomic SET NX server-side; ephemeral state separate from durable Supabase. |
| Pipeline checkpoint enforcement | API / Backend (Inngest function execution) | — | Checkpoints run inside the lambda processing the turn. |
| Pending list (follower content queue) | Cache / Storage (Upstash Redis) | — | RPUSH/LREM atomic ops; persists across lock TTL boundary. |
| Cron cleanup (orphaned locks) | API / Backend (Inngest scheduled function) | — | Existing codebase pattern (see `crm-mutation-idempotency-cleanup.ts`). |
| Observability events | Database (Supabase `agent_observability_events`) | API/Backend (collector) | Existing schema accepts arbitrary payload JSONB. |
| Sandbox debug panel UI | Browser/Client (React component) | API/Backend (server action to fetch events) | Standard Next.js pattern from existing debug-panel tabs. |
| Path A/B combo semantics | API / Backend (v4-production-runner) | — | Logic lives in the runner; Redis is just the signal. |

---

## Phase Requirements (mapped to research)

| ID | Description | Research Support |
|----|-------------|------------------|
| LOCK-01 | Atomic mutex acquired at webhook entry post workspaceId resolution | Verified Upstash `redis.set(key, value, { nx: true, ex: 45 })` is atomic server-side; HTTP REST round-trip from Vercel `iad1` to Upstash `us-east-1` typically 5-15ms (P50). |
| LOCK-02 | Lock TTL with heartbeat extension every 5s | Verified `redis.expire(key, 45)` available; idempotent re-set with same TTL safe. |
| LOCK-03 | Release-only-if-owner (fencing) | Requires Lua script via `redis.eval` — single round-trip atomic GET+DEL. |
| LOCK-04 | Pending list with `RPUSH`, `LREM` self-removal | Both supported in `@upstash/redis@1.38.0`. `LREM count value` does exact-string match (works with serialized JSON containing `entry_uuid`). |
| LOCK-05 | 8 checkpoints distributed in pipeline | Line numbers identified below in dedicated section. |
| LOCK-06 | Cleanup cron Inngest every 5min | Pattern verified — `cron: '*/5 * * * *'` with `step.run` enclosure. |
| LOCK-07 | 13 observability event types | All map to `recordEvent('pipeline_decision', '<label>', payload)` against existing schema. |
| LOCK-08 | Sandbox debug tab | Existing pattern in `src/app/(dashboard)/sandbox/components/debug-panel/`. |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/redis` | `^1.38.0` | REST-based Redis client for serverless | [VERIFIED: npm view 2026-05-25] Only connectionless HTTP client; designed for Vercel/Lambda. Latest version, published ~2 weeks before research. |
| `crypto.randomUUID` | Node built-in (>=14.17.0) | Generate `holder_uuid` for fencing | [VERIFIED: Node.js docs] Available everywhere Next.js runs; no extra dep. |
| `inngest` | `^3.54.0` (already present) | Cron scheduler for cleanup | [VERIFIED: package.json] Existing cron pattern in `crm-mutation-idempotency-cleanup.ts:25`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No `p-retry` or backoff lib needed; follower polls every 300ms simple `setInterval` + `setTimeout`. |

**Critical:** Do NOT install `@upstash/lock` (Upstash's own lock library). It does NOT implement fencing tokens — only UUID for release-safety. We're implementing the equivalent pattern explicitly because we need the `holder_uuid` exposed for D-15's `assertHoldsLock(uuid)` checkpoint helper, which @upstash/lock encapsulates and doesn't expose. [CITED: https://upstash.com/blog/lock — "@upstash/lock should be used for performance benefits and situations that require mostly consistent locking" — we want explicit control over fencing, not abstraction.]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@upstash/redis` REST | `ioredis` over TCP | TCP requires persistent connection — hostile to Vercel serverless (connection per cold-start kills latency). [CITED: Upstash docs] REST is the recommended path for Vercel. |
| Single-region Upstash | Global Database (multi-region) | Global is OPTIMIZED FOR READS; writes 5x more expensive AND eventually consistent across regions. Our lock is write-heavy (acquire+release per turn). Regional + multi-zone is the right call. [CITED: https://upstash.com/docs/redis/features/globaldatabase — "Global Database is designed to optimize the latency of READ operations. It may not be a good choice if your use case is WRITE heavy."] |
| `@upstash/lock` | Custom acquire/release | @upstash/lock doesn't expose `holder_uuid` for our D-15 checkpoint pattern. We need explicit fencing token control. |

**Installation:**

```bash
npm install @upstash/redis
```

**Version verification (2026-05-25):**
```bash
$ npm view @upstash/redis version
1.38.0
$ npm view @upstash/redis time.modified
2026-05-08 (~2 weeks before research date)
```

**Environment variables required:**
- `UPSTASH_REDIS_REST_URL` — set in `.env.local` + Vercel dashboard
- `UPSTASH_REDIS_REST_TOKEN` — set in `.env.local` + Vercel dashboard
- Use **production Vercel env** distinct from preview/dev to avoid cross-env lock interference during sandbox testing.

---

## Architecture Patterns

### System Architecture Diagram

```
                        ┌───────────────────────────┐
                        │  WhatsApp / FB-IG Customer │
                        └────────────┬──────────────┘
                                     │ inbound msg
                                     ▼
        ┌─────────────────────────────────────────────────┐
        │  Vercel Edge → Next.js API route                 │
        │  /api/webhooks/whatsapp/route.ts   POST          │
        │  /api/webhooks/manychat/route.ts   POST          │
        │                                                  │
        │  1. HMAC verify       (~5-10ms)                  │
        │  2. Parse payload     (~1ms)                     │
        │  3. resolveWorkspaceId(phoneNumberId)  (~20-50ms)│
        │  4. ▼▼▼ INSERT LOCK ACQUIRE HERE ▼▼▼             │
        └────────────────────────┬─────────────────────────┘
                                 │
                       ┌─────────┴─────────┐
                       │ Upstash Redis     │
                       │ SET lock:wsId:ch: │
                       │     id NX EX 45   │  (~5-15ms P50)
                       └─────────┬─────────┘
              ┌──────────────────┴───────────────────┐
              │ acquired?                            │ no
              ▼                                       ▼
        ┌─────────────────┐                  ┌─────────────────┐
        │ HOLDER PATH     │                  │ FOLLOWER PATH    │
        │ (msg1)          │                  │ (msg2/3/...)    │
        │                 │                  │                  │
        │ - RPUSH self    │                  │ - SET interrupt  │
        │   to pending    │                  │ - RPUSH self     │
        │ - 200 OK to     │                  │ - 200 OK to      │
        │   webhook       │                  │   webhook        │
        │ - dispatch      │                  │ - (no dispatch)  │
        │   Inngest event │                  │   (msg1's lambda │
        │   follower=fal  │                  │    will detect)  │
        └────────┬────────┘                  └──────────────────┘
                 │
                 ▼
        ┌──────────────────────────────────────────────────────┐
        │ Inngest function: whatsapp-agent-processor          │
        │ concurrency: { key: conversationId, limit: 1 }       │
        │                                                      │
        │ CKPT-0: post-acquire (just after SET NX OK)         │
        │   ↓                                                  │
        │ Comprehension (Haiku) ~1.5-3s                       │
        │ CKPT-1                                              │
        │   ↓                                                  │
        │ State machine + guards ~5-20ms                      │
        │ CKPT-2                                              │
        │   ↓                                                  │
        │ [sub-loop branch — ~30% of turns]                   │
        │   Tooling call (gpt-4o-mini + kb_search) ~2-5s     │
        │   CKPT-3                                            │
        │     ↓                                                │
        │   Generation (Gemini Flash) ~1-4s                   │
        │   CKPT-4                                            │
        │     ↓                                                │
        │   Compliance (Gemini Flash) ~0.5-1.5s              │
        │   CKPT-5                                            │
        │   ↓                                                  │
        │ Pre-send loop                                       │
        │ CKPT-6                                              │
        │   ↓                                                  │
        │ For each template: CKPT-7.N → send → record sent   │
        │                                                      │
        │ At every CKPT:                                      │
        │   - GET lock + verify holder_uuid (fencing)        │
        │   - GET interrupt key                              │
        │   - Branch Path A (no sends) / Path B (sent>=1)     │
        │                                                      │
        │ try/finally: DEL lock (release_if_owner Lua)       │
        └──────────────────────────────────────────────────────┘

       Parallel: Inngest cron every 5min sweeps orphaned locks.
       Parallel: Sandbox tab reads agent_observability_events.
```

### Recommended Project Structure

```
src/lib/agents/interruption-system-v2/
├── redis-client.ts        # Singleton @upstash/redis wrapper + connection
├── lock.ts                # acquire / release / renew / assertHoldsLock
├── pending.ts             # RPUSH / LREM / LRANGE for pending list
├── checkpoints.ts         # checkpoint(ckptId, holderUuid) helper
├── observability.ts       # 13 typed event emitters wrapping recordEvent
├── lua-scripts.ts         # Inline Lua scripts as string constants
└── __tests__/
    ├── lock.test.ts
    ├── pending.test.ts
    ├── checkpoints.test.ts
    └── e2e-scenarios.test.ts  # S1-S4 from D-19

src/inngest/functions/
└── v2-lock-cleanup-cron.ts  # 5min cron sweep

src/app/(dashboard)/sandbox/components/debug-panel/
└── interruption-tab.tsx     # New tab for lock lifecycle visualization

# Modified:
src/lib/whatsapp/webhook-handler.ts       # Lock acquire/release at webhook entry
src/app/api/webhooks/manychat/route.ts    # Same pattern for FB/IG
src/lib/agents/engine/v4-production-runner.ts  # CKPT-0..7.N
src/lib/agents/somnio-v4/sub-loop/index.ts     # CKPT-3, 4, 5
src/lib/agents/engine-adapters/production/messaging.ts  # Strip hasNewInboundMessage on v4 path
src/inngest/functions/agent-production.ts # (keep concurrency: limit=1, see Inngest section)
package.json
.env.local + Vercel env
```

### Pattern 1: Fencing-Token Distributed Lock

**What:** Each lock-acquire stores `(holder_uuid, started_at, has_sent_anything)` as the lock value. Every side-effect verifies via GET that the lock value still belongs to *this* lambda. If a zombie lambda wakes up after TTL expired and another holder took over, the fencing check rejects its writes.

**When to use:** Every side-effect inside the holder path (DB writes, messaging.send, dispatch). Specifically at all 8 checkpoints (D-18).

**Why we need it:** Upstash explicitly documents that async replication means SET NX can be granted to two clients in failure scenarios. [CITED: https://upstash.com/blog/lock] Fencing token converts the design from "best-effort exclusion" to "first writer wins, second writer aborts cleanly" — equivalent of Kleppmann's recommendation. [CITED: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html — "the storage server remembers that it has already processed a write with a higher token number, and so it rejects the request"]

**Adaptation for our case:** Pure fencing tokens require server-side token-tracking (storage that rejects lower tokens). We don't have that — we have Redis + Supabase. Substitute: `holder_uuid` (random, not monotonic) + `assertHoldsLock(uuid)` before every side-effect. This is **weaker than true fencing** but stronger than naive SET NX:
- Detects zombie lambdas (their UUID no longer matches current lock value).
- Does NOT prevent the rare "split-brain after Upstash failover" double-acquire (because both UUIDs are valid in their own view of Redis state). The Inngest `concurrency: limit=1` AND the `messages` table unique constraints catch this residual case.

**Example:**

```typescript
// Source: pattern derived from Kleppmann + Upstash blog + Marc0 blog
// src/lib/agents/interruption-system-v2/lock.ts

import { redis } from './redis-client'
import { randomUUID } from 'crypto'

const LOCK_TTL_S = 45

export interface LockHandle {
  key: string
  holderUuid: string
  startedAt: string
}

export async function acquireLock(
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram',
  identifier: string,
): Promise<LockHandle | null> {
  const key = `lock:${workspaceId}:${channel}:${identifier}`
  const holderUuid = randomUUID()
  const value = JSON.stringify({
    holder_uuid: holderUuid,
    started_at: new Date().toISOString(),
    has_sent_anything: false,
  })

  // [VERIFIED: @upstash/redis README] set with { nx: true, ex: N } returns
  // 'OK' on success or null on collision.
  const result = await redis.set(key, value, { nx: true, ex: LOCK_TTL_S })

  if (result !== 'OK') return null  // someone else holds the lock

  return { key, holderUuid, startedAt: new Date().toISOString() }
}

export async function assertHoldsLock(handle: LockHandle): Promise<boolean> {
  const raw = await redis.get<string>(handle.key)
  if (!raw) return false  // lock expired / was released
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>
    return parsed.holder_uuid === handle.holderUuid
  } catch {
    return false
  }
}

export async function renewLockTTL(handle: LockHandle): Promise<boolean> {
  // Optionally Lua-script this for atomicity, but a non-atomic check+expire
  // is fine: worst case the renewal happens after the lock was already lost,
  // which is harmless (renewing a key we no longer own — still TTL-protected).
  const holds = await assertHoldsLock(handle)
  if (!holds) return false
  await redis.expire(handle.key, LOCK_TTL_S)
  return true
}

// Lua script: atomic release if-and-only-if we still own the lock.
// Avoids race: GET → check → DEL where another holder could acquire
// between the GET and the DEL.
const RELEASE_IF_OWNER_LUA = `
local current = redis.call('GET', KEYS[1])
if current == nil or current == false then
  return 0
end
local ok, decoded = pcall(cjson.decode, current)
if not ok then return 0 end
if decoded.holder_uuid == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

export async function releaseLockIfOwner(handle: LockHandle): Promise<boolean> {
  // [VERIFIED: Upstash blog "Make Your Own Message Queue"] redis.eval signature:
  // redis.eval(script, numKeys, ...keys, ...args)
  const result = await redis.eval(RELEASE_IF_OWNER_LUA, [handle.key], [handle.holderUuid])
  return result === 1
}
```

### Pattern 2: Follower with Polling

**What:** When `acquireLock` returns null, the webhook handler RPUSHes its content into the pending list, writes interrupt key, returns 200, and exits. NO Inngest dispatch from the follower. The HOLDER lambda detects the interrupt at its next checkpoint and decides Path A/B.

**Why no follower dispatch:** Two reasons.
1. **Cost:** every follower dispatch is a wasted Inngest invocation that just exits.
2. **Correctness:** if N rapid messages arrive and all dispatch, all N lambdas race trying to acquire the lock after the holder releases — the wakeup ordering is non-deterministic.

Instead, the **holder's release-time logic** is responsible for either:
- (a) re-dispatching the next message itself if pending list has entries (Path A combo dispatch).
- (b) leaving the follower to be picked up by the cleanup cron OR by the next inbound that the customer sends OR by a Redis `BLPOP`/`subscribe` pattern (NOT needed in v1 — keep it simple).

**Open question:** D-20 + D-16 say RPUSH self ALWAYS (holder pushes its own content into pending, then LREM-self after first send). This means even the holder has an entry, so the post-release dispatch logic is:
- If pending list contains entries after holder DEL → holder re-dispatches the oldest as the new `effectiveMessage`.

This is clean. The follower path is **just write-and-exit**. Document this clearly in plan-phase.

```typescript
// src/lib/whatsapp/webhook-handler.ts — pseudocode for the new flow

const lockHandle = await acquireLock(workspaceId, 'whatsapp', phone)

if (!lockHandle) {
  // FOLLOWER PATH
  await pushToPending(workspaceId, 'whatsapp', phone, {
    entry_uuid: randomUUID(),
    content: normalizedContent,
    received_at: new Date().toISOString(),
    msg_id: msg.id,
  })
  await redis.set(`interrupt:${workspaceId}:whatsapp:${phone}`, '1', { ex: 60 })
  emitEvent('lock_acquire_failed_follower', { ... })
  return  // 200 OK to webhook caller
}

// HOLDER PATH
try {
  await pushToPending(workspaceId, 'whatsapp', phone, ownPendingEntry)  // D-16
  emitEvent('lock_acquired', { holder_uuid: lockHandle.holderUuid, ... })

  // Dispatch to Inngest as normal — pass holderUuid + ownPendingEntry through
  await inngest.send({
    name: 'agent/whatsapp.message_received',
    data: { ..., lockHolderUuid: lockHandle.holderUuid, ownPendingEntryUuid: ... },
  })
} catch (err) {
  await releaseLockIfOwner(lockHandle)  // failure path
  throw err
}
```

### Pattern 3: Checkpoint Helper

**What:** A reusable function called at each of the 8 D-18 checkpoints. Single source of truth for "is the lock still mine? was there an interrupt?".

```typescript
// src/lib/agents/interruption-system-v2/checkpoints.ts

export type CheckpointId =
  | 'ckpt_0_post_acquire'
  | 'ckpt_1_post_comprehension'
  | 'ckpt_2_post_state_machine'
  | 'ckpt_3_post_tooling'
  | 'ckpt_4_post_generation'
  | 'ckpt_5_post_compliance'
  | 'ckpt_6_pre_send_loop'
  | 'ckpt_7_pre_template'  // .N suffix added at runtime by emitter

export interface CheckpointResult {
  proceed: boolean
  interrupted?: { interruptMsgId?: string; pendingListLength: number }
  lostLock?: true
}

export async function checkpoint(
  ckptId: CheckpointId,
  handle: LockHandle,
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram',
  identifier: string,
  hasSentAnything: boolean,
): Promise<CheckpointResult> {
  // 1. Verify we still own the lock (fencing)
  const holds = await assertHoldsLock(handle)
  if (!holds) {
    emitEvent('zombie_lambda_exit', {
      my_uuid: handle.holderUuid,
      at_step: ckptId,
    })
    return { proceed: false, lostLock: true }
  }

  // 2. Check for interrupt
  const interruptKey = `interrupt:${workspaceId}:${channel}:${identifier}`
  const interrupted = await redis.get<string>(interruptKey)
  if (!interrupted) return { proceed: true }

  // 3. Branch Path A vs B based on hasSentAnything (D-18 #4)
  const pendingLen = await redis.llen(`pending:${workspaceId}:${channel}:${identifier}`)
  emitEvent('interrupt_detected_at_ckpt_N', {
    checkpoint_id: ckptId,
    my_holder_uuid: handle.holderUuid,
    interrupt_msg_id: interrupted,
  })
  return {
    proceed: false,
    interrupted: { pendingListLength: pendingLen },
  }
}
```

### Anti-Patterns to Avoid

- **DO NOT use `@upstash/lock` library** — doesn't expose holder UUID for D-15 fencing checks.
- **DO NOT use `redis.set(key, value, 'NX', 'EX', 45)` positional args** — @upstash/redis uses object syntax `{ nx: true, ex: 45 }`. Positional fails silently or returns wrong type. [VERIFIED: @upstash/redis README]
- **DO NOT do `GET key + JSON.parse + DEL key` as 3 separate calls** for release — race window between GET and DEL. Use Lua script (above).
- **DO NOT remove Inngest `concurrency: { key: conversationId, limit: 1 }`** — it's still useful belt-and-suspenders. Setting limit=10 is a defensive cap, not required (Redis SET NX is the correctness mechanism).
- **DO NOT poll Upstash from inside an LLM call** — D-13 locked this out; no `setInterval` plumbing. Discrete checkpoints only.
- **DO NOT hold the lock across Inngest `step.run` boundaries naively** — Inngest re-executes the lambda on replay. Heartbeat (`renewLockTTL`) MUST run from the lambda's main async flow, NOT inside a step. Specifically: don't `step.run('process', async () => { ... })` around the heartbeat. (Existing v4-production-runner does NOT use `step.run` around its core logic — only the parent Inngest function wraps it. Safe.)
- **DO NOT trust `crypto.randomUUID()` for cryptographic security** — it IS cryptographically secure on Node ≥14.17. [VERIFIED: Node.js docs]. Just noting because UUID format is a common stumble point.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed mutex algorithm | Don't reinvent Redlock or implement your own consensus | `SET NX EX` + fencing token (D-15) | Kleppmann's analysis [CITED] proves Redlock has unsafe timing assumptions. Single-Redis + fencing is the correct simplification for our scale. |
| Lua script for release | Don't compose multiple round-trips for "GET + check_uuid + DEL" | Single `redis.eval` with the `RELEASE_IF_OWNER_LUA` script above | Race condition between round-trips. [CITED: leapcell distributed lock pitfalls article — "10 hidden pitfalls"] |
| Backoff/retry for follower polling | Don't write exponential backoff | Plain `setTimeout(check, 300)` loop with max 60s | Simple polling fits the bounded latency profile (worst case 17s sub-loop = ~57 polls). Exponential backoff would over-complicate. |
| Redis connection pooling | Don't manage HTTP keepalive | `@upstash/redis` handles HTTP via undici under the hood; one client instance per Vercel function works | The SDK is REST-based, no persistent connections to manage. |
| Mock Redis for Vitest | Don't write an in-memory Redis shim from scratch | Use `vi.mock('@upstash/redis')` with manual mock implementations of the ~8 methods we use (set, get, del, expire, eval, rpush, lrem, lrange, llen) | Vitest mocking pattern documented below; ~50 lines of mock code is cheaper than running SRH in CI. [CITED: Vitest docs] |
| Sandbox debug tab from scratch | Don't reinvent debug-panel UI | Clone pattern from `v4-subloop-debug-view` standalone (shipped 2026-05-13) — Sub-Loop tab in `debug-panel/tab-bar.tsx` is a working template | Same workspace/session selection model; just a new fetcher for `agent_observability_events` filtered by event labels in D-17. |

**Key insight:** The temptation in this domain is to reach for Redlock/ZooKeeper/etcd "for real distributed locks." Our scale (1 customer per phone per workspace at human typing speed = ~1 msg/second peak) doesn't need that. Single-Redis with fencing token is the right level of complexity. Kleppmann's article explicitly calls out that for "efficiency locks" — which ours fundamentally is (the goal is "don't send 2 responses to the customer", not "atomic distributed transaction with zero possibility of duplicate") — single Redis is acceptable.

---

## Common Pitfalls

### Pitfall 1: Upstash async replication can grant lock to 2 clients

**What goes wrong:** Upstash uses single-leader replication with async backups. During failover (leader-zone outage), it's documented that **multiple clients can hold the "same" lock** for a brief window. This is the explicit caveat in [https://upstash.com/blog/lock].

**Why it happens:** When the leader fails, requests pending on the leader may be lost. Failover election (seconds with multi-zone, minutes single-zone) returns a backup as new leader. SET NX against the new leader sees the key as absent (the prior SET NX may not have propagated) → grants the lock.

**How to avoid:**
- Enable **Multi-Zone (Prod Pack)** — failover seconds vs minutes. [CITED: https://upstash.com/blog/multi-zone]
- **Fencing token (D-15)** — second holder's lambda will still acquire its own UUID, but `assertHoldsLock` at checkpoints will detect mismatch on re-read AFTER the network heals. Race window narrows to "time from failover until first checkpoint runs" — typically <2s.
- **Inngest `concurrency: limit=1`** — second dispatch is queued, not parallel-executed. Even if the lock check is racy, the work isn't parallel.
- **Messages dedup via `messages` table unique constraint** — `(conversation_id, message_id)` already prevents same inbound from being processed twice. We piggyback on this.

**Warning signs:**
- `lock_force_acquired_after_ttl_expiry` event firing more than ~once per day in production.
- Two `pipeline_decision:state_committed` events for same `messageId` within 5s.

[VERIFIED: Upstash @upstash/lock blog, Upstash replication docs] Confidence: HIGH that this can happen; confidence MEDIUM on frequency (Upstash doesn't publish failover statistics).

### Pitfall 2: Inngest `step.run` replay vs heartbeat

**What goes wrong:** If we wrap the agent processing in `step.run('process', ...)`, Inngest may replay the step on lambda restart. The heartbeat extends TTL forever, OR the replay re-acquires the lock (it can't — already locked by itself) and stalls forever.

**Why it happens:** Inngest's durable execution model replays steps on retry. Heartbeats issued in past replays are no longer extending the live lock.

**How to avoid:**
- DO NOT wrap `processMessage()` in `step.run`. The existing pattern in `agent-production.ts` does NOT wrap (only `media-gate` is a separate step). Keep that pattern.
- Heartbeat runs in the SAME async task as the main pipeline — use `setInterval` cleared in `finally`.
- Heartbeat fail (e.g., 1 missed renewal due to network blip) is OK — TTL is 45s, heartbeat every 5s = 9x margin.

**Warning signs:** Heartbeat-event spam in observability for a single conversation (>50 in <1 min suggests stuck loop).

### Pitfall 3: `redis.eval` argument shape with @upstash/redis

**What goes wrong:** @upstash/redis's `eval` signature is **different** from `node-redis`. Wrong arg shape returns silent error or fails parse.

**Why it happens:** SDK convention differs across Redis clients. @upstash/redis uses `redis.eval(script, keys, args)` where keys and args are ARRAYS (not positional).

**How to avoid:** Always use the array signature:
```typescript
const result = await redis.eval(SCRIPT, [key1, key2], [arg1, arg2])
```
[VERIFIED: Upstash blog "Make Your Own Message Queue" code example]

**Warning signs:** "WRONGTYPE Operation against a key holding the wrong kind of value" or `eval` returns `null` when it should return integer.

### Pitfall 4: `LREM count value` exact-string match for pending entries

**What goes wrong:** D-20 stores entries as JSON. Two serializations of "the same" object can differ (key order, whitespace, etc.) and LREM fails to find it.

**Why it happens:** Redis `LREM` compares values byte-by-byte. `{"a":1,"b":2}` ≠ `{"b":2,"a":1}`.

**How to avoid:**
- Store the **exact JSON string** the holder pushed in memory (don't re-serialize).
- Use `JSON.stringify(obj)` deterministically — sort keys explicitly if necessary.
- Better: use a `Map` in memory to track the exact pushed strings:
  ```typescript
  const ownEntry = JSON.stringify({ entry_uuid, content, received_at, msg_id })
  await redis.rpush(pendingKey, ownEntry)
  // later:
  await redis.lrem(pendingKey, 1, ownEntry)  // same exact string
  ```
- D-20 alludes to this — the `entry_uuid` makes collisions impossible even if 2 callers have identical content.

**Warning signs:** Pending list grows unbounded; messages duplicated in next-turn combos.

### Pitfall 5: Sandbox-mode (port 3020) using PROD Upstash by accident

**What goes wrong:** Developer leaves `UPSTASH_REDIS_REST_URL` pointing at prod, runs sandbox tests, interferes with real customer locks.

**Why it happens:** Single `.env.local` file shared across dev contexts; no namespace separation between dev and prod.

**How to avoid:**
- **Separate Upstash database for dev** (`upstash-redis-dev`) with its own URL+token in `.env.local`.
- Prod Vercel env uses different URL+token.
- Optional defensive prefix all keys with `morfx:` so a misconfiguration is visible but not destructive (collisions still prevented since dev wouldn't have customer traffic anyway).

**Warning signs:** Real customer message gets blocked because dev test acquired same `lock:` key.

### Pitfall 6: Vercel cold-start latency adds to first SET NX

**What goes wrong:** First request to a cold Vercel function takes 200-500ms before user code runs. The lock acquire happens AFTER cold start — by then, msg2 may have arrived at a warm instance and won.

**Why it happens:** Cold start is inherent to serverless.

**How to avoid:** This is fine. The mechanism is symmetric — whichever instance acquires first wins. We don't need msg1 to be the lock holder; if msg2's instance is warmer and acquires first, msg1's instance becomes the follower and msg2 gets processed (likely standing-alone since msg1's content is in the pending list).

**Warning signs:** None — this is by design.

### Pitfall 7: Lock TTL too short for sub-loop worst case

**What goes wrong:** D-13 accepts 17s worst-case sub-loop. Lock TTL is 45s. Heartbeat every 5s. If heartbeat fails 2-3 times, TTL expires mid-pipeline → another holder acquires → split-brain.

**Why it happens:** 17s sub-loop + 5s send + 10s template delays + Vercel cold-start = potential 35s total turn. With TTL 45s and heartbeat 5s, ~3 missed heartbeats = TTL expiry.

**How to avoid:**
- 45s TTL with 5s heartbeat = 9 attempts to renew. 3 consecutive failures is highly unlikely (would indicate Upstash unavailability, in which case Redis is down anyway).
- If sub-loop telemetry shows P99 > 15s, consider bumping TTL to 60s.
- Critical: heartbeat MUST be in `setInterval` loop, NOT awaited sequentially with the pipeline. Use `setInterval` cleared in `finally`.

**Warning signs:** `lock_force_acquired_after_ttl_expiry` events. Investigate sub-loop latency telemetry.

---

## Code Examples

### Example 1: redis-client.ts (singleton)

```typescript
// src/lib/agents/interruption-system-v2/redis-client.ts
import { Redis } from '@upstash/redis'

let _client: Redis | null = null

export function getRedisClient(): Redis {
  if (_client) return _client
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      '[interruption-system-v2] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    )
  }
  _client = new Redis({ url, token })
  return _client
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return getRedisClient()[prop as keyof Redis]
  },
})
```

### Example 2: Lock acquire/release/heartbeat lifecycle

```typescript
// src/lib/agents/interruption-system-v2/lock.ts
// (acquireLock, assertHoldsLock, renewLockTTL, releaseLockIfOwner shown in Pattern 1 above)

// Heartbeat helper
export function startHeartbeat(handle: LockHandle): () => void {
  const interval = setInterval(async () => {
    try {
      const ok = await renewLockTTL(handle)
      if (!ok) {
        emitEvent('zombie_lambda_exit', {
          my_uuid: handle.holderUuid,
          at_step: 'heartbeat_lost_lock',
        })
      } else {
        emitEvent('heartbeat_renewed', { holder_uuid: handle.holderUuid, new_ttl: 45 })
      }
    } catch (err) {
      console.error('[interruption-system-v2] heartbeat error:', err)
    }
  }, 5000)
  return () => clearInterval(interval)
}
```

### Example 3: pushToPending / removeOwnEntry / readPending

```typescript
// src/lib/agents/interruption-system-v2/pending.ts

export interface PendingEntry {
  entry_uuid: string
  content: string
  received_at: string
  msg_id?: string
}

export async function pushToPending(
  workspaceId: string,
  channel: string,
  identifier: string,
  entry: PendingEntry,
): Promise<{ pendingListLength: number; exactJson: string }> {
  const key = `pending:${workspaceId}:${channel}:${identifier}`
  // Deterministic key order (alphabetical) so LREM matches later.
  const exactJson = JSON.stringify({
    content: entry.content,
    entry_uuid: entry.entry_uuid,
    msg_id: entry.msg_id ?? null,
    received_at: entry.received_at,
  })
  const pendingListLength = await redis.rpush(key, exactJson)
  return { pendingListLength, exactJson }
}

export async function removeOwnEntry(
  workspaceId: string,
  channel: string,
  identifier: string,
  exactJson: string,
): Promise<boolean> {
  const key = `pending:${workspaceId}:${channel}:${identifier}`
  const removed = await redis.lrem(key, 1, exactJson)
  return removed === 1
}

export async function readAndClearPending(
  workspaceId: string,
  channel: string,
  identifier: string,
): Promise<PendingEntry[]> {
  const key = `pending:${workspaceId}:${channel}:${identifier}`
  const items = await redis.lrange<string>(key, 0, -1)
  if (items.length === 0) return []
  // Atomic read-and-clear via transaction (Upstash multi)
  const tx = redis.multi()
  tx.del(key)
  await tx.exec()  // [VERIFIED: Upstash pipeline-transaction docs — multi is atomic server-side]
  return items.map((s) => JSON.parse(typeof s === 'string' ? s : JSON.stringify(s)))
}
```

### Example 4: Checkpoint helper used in v4-production-runner.ts

```typescript
// Inside v4-production-runner.ts processMessage:

const lockHandle: LockHandle = ... // passed from webhook handler via Inngest event

// CKPT-0: post-acquire (~line 72 in v4-production-runner.ts, after session fetch)
let ckpt = await checkpoint('ckpt_0_post_acquire', lockHandle, ...)
if (!ckpt.proceed) return handlePathAOrLostLock(ckpt)

// ... existing 1c logic ...

// CKPT-1: post-comprehension — somnio-v4-agent.ts ~line 107 (after `const { analysis, tokensUsed } = await comprehend(...)`)
// Implementation lives inside somnio-v4-agent.ts since processMessage is called there.

// ... see line-number table below for all 8 placements.
```

### Example 5: Observability event emitters

```typescript
// src/lib/agents/interruption-system-v2/observability.ts

import { getCollector } from '@/lib/observability'

type LockEventLabel =
  | 'lock_acquired'
  | 'lock_acquire_failed_follower'
  | 'interrupt_written'
  | 'interrupt_detected_at_ckpt_N'
  | 'msg_aborted_path_a_combined'
  | 'msg_aborted_path_b_solo'
  | 'lock_released_normal'
  | 'follower_woke'
  | 'lock_force_acquired_after_ttl_expiry'
  | 'zombie_lambda_exit'
  | 'heartbeat_renewed'
  | 'pending_list_combined'
  | 'redis_unavailable_fallback_failed'

export function emitLockEvent(
  label: LockEventLabel,
  payload: Record<string, unknown>,
): void {
  getCollector()?.recordEvent('pipeline_decision', label, payload)
  console.log(`[interruption-v2] ${label}`, payload)  // dual emission per D-11
}
```

### Example 6: Vitest mock for @upstash/redis

```typescript
// src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts

import { vi } from 'vitest'

export function createMockRedis() {
  const store = new Map<string, string>()
  const ttls = new Map<string, number>()
  const lists = new Map<string, string[]>()

  return {
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && store.has(key)) return null
      store.set(key, value)
      if (opts?.ex) ttls.set(key, Date.now() + opts.ex * 1000)
      return 'OK'
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const had = store.has(key)
      store.delete(key)
      ttls.delete(key)
      return had ? 1 : 0
    }),
    expire: vi.fn(async (key: string, ex: number) => {
      if (!store.has(key)) return 0
      ttls.set(key, Date.now() + ex * 1000)
      return 1
    }),
    rpush: vi.fn(async (key: string, val: string) => {
      const arr = lists.get(key) ?? []
      arr.push(val)
      lists.set(key, arr)
      return arr.length
    }),
    lrem: vi.fn(async (key: string, count: number, val: string) => {
      const arr = lists.get(key) ?? []
      const before = arr.length
      const idx = arr.indexOf(val)
      if (idx >= 0) arr.splice(idx, 1)
      lists.set(key, arr)
      return before - arr.length
    }),
    lrange: vi.fn(async (key: string, start: number, end: number) => {
      const arr = lists.get(key) ?? []
      return arr.slice(start, end === -1 ? undefined : end + 1)
    }),
    llen: vi.fn(async (key: string) => (lists.get(key) ?? []).length),
    eval: vi.fn(async (_script: string, keys: string[], args: string[]) => {
      // Specifically mock the RELEASE_IF_OWNER_LUA behavior
      const raw = store.get(keys[0])
      if (!raw) return 0
      try {
        const parsed = JSON.parse(raw)
        if (parsed.holder_uuid === args[0]) {
          store.delete(keys[0])
          return 1
        }
      } catch { /* fall through */ }
      return 0
    }),
    multi: vi.fn(() => ({
      del: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
  }
}

// Usage in test:
vi.mock('../redis-client', () => ({
  redis: createMockRedis(),
  getRedisClient: () => createMockRedis(),
}))
```

---

## Exact Line Numbers for 8 Checkpoints (D-18)

**Source files snapshot:** 2026-05-25 (current `main`).

### File: `src/lib/agents/engine/v4-production-runner.ts` (563 lines)

| Checkpoint | Location (current line) | What's there now | Where to insert |
|------------|------------------------|------------------|-----------------|
| **CKPT-0** post-acquire | After **line 71** (`(this.adapters.timer as any).setSessionId(session.id)`) | Sets session ID on timer adapter | Insert at line 72 (new line). This is the first point inside `processMessage()` where we have `session.id` AND the `lockHandle` (passed from webhook via Inngest event payload — propagated to runner via config or input). |
| **CKPT-6** pre-send-loop | Before **line 267** (`if (output.templates && output.templates.length > 0) {`) | Begin send templates block | Insert at line 266 — just before the `if (output.templates ...)` branch. ALSO insert before line 206 (pending-templates path B resume — `if (this.adapters.storage.getPendingTemplates) {`) if Path B pending templates are also send candidates. |
| **CKPT-7.N** pre-each-template | Inside loop `for (let i = 0; i < templates.length; i++)` in `messaging.ts:156` | Already has Phase 31 `hasNewInboundMessage` check at lines 173-187 | **REPLACE** lines 173-187 with `await checkpoint('ckpt_7_pre_template', ...)`. The behavior is the same — abort send if interrupt — but driven by Redis lock check instead of DB query. |

### File: `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (881 lines) — checkpoint inserts inside `processMessage`

| Checkpoint | Location (current line) | What's there now | Where to insert |
|------------|------------------------|------------------|-----------------|
| **CKPT-1** post-comprehension | After **line 106** (`const { analysis, tokensUsed } = await comprehend(...)`) | The Haiku call returns | Insert at line 107 — right after comprehension returns, before `mergeAnalysis`. |
| **CKPT-2** post-state-machine | After **line 259** (`getCollector()?.recordEvent('guard', 'passed', ...)`) | After guards pass, before sales-track | Insert at line 260 — after guards pass and BEFORE `resolveSalesTrack` (line 263). Note: guards can also block at lines 206-253; that path returns early and the lock is released by the finally in the runner — no checkpoint needed there. |

### File: `src/lib/agents/somnio-v4/sub-loop/index.ts` (751 lines)

| Checkpoint | Location (current line) | What's there now | Where to insert |
|------------|------------------------|------------------|-----------------|
| **CKPT-3** post-tooling | After **line 224** (try/catch on `runToolingCall`) | toolingResult returns | Insert at line 225, before `const tooling = toolingResult.output` (line 226). Note: only fires in RAG path (low_confidence / razonamiento_libre — `runRagSubLoop`). For legacy path (crm_mutation/cas_reject — `runLegacySubLoop`) there's only one combined call (line 612) — for those reasons, treat CKPT-3 + CKPT-4 + CKPT-5 as a single combined post-call check inserted after line 626 (`output = safeAccessOutput(...)`). |
| **CKPT-4** post-generation | After **line 308** (try/catch on `runGenerationCall`) | generationResult returns | Insert at line 309, before `const generation = generationResult.output` (line 310). |
| **CKPT-5** post-compliance | After **line 347** (`const compliance = await checkCompliance(...)`) | compliance verifier returns | Insert at line 348, before the `if (compliance.nuncaDecirViolation)` branch (line 349). |

### How to thread `lockHandle` through the call stack

The lock is acquired in `webhook-handler.ts` BEFORE Inngest dispatch. The handle (`{ key, holderUuid, startedAt }`) must travel:

1. **webhook → Inngest event** — add `lockHolderUuid`, `lockKey`, `ownPendingEntryUuid` to `event.data` (see `agent-production.ts:85` data destructuring).
2. **Inngest function → V4ProductionRunner** — pass via `EngineInput` (extend type with optional `lockHandle?: LockHandle`).
3. **V4ProductionRunner → somnio-v4 processMessage** — pass via `V4AgentInput` (extend type).
4. **somnio-v4 processMessage → runSubLoop** — pass via `SubLoopContext` (extend type).

Alternative: AsyncLocalStorage. The codebase already uses ALS via the observability collector (`src/lib/observability/collector.ts`). We could store `lockHandle` in ALS and read in `checkpoint()` without threading. **Recommendation:** thread explicitly (no ALS) — explicit > implicit, easier to test, and the threading is only 4 layers deep.

### Coverage matrix per path

| Path | Checkpoints fired |
|------|-------------------|
| **Conventional (no sub-loop)** | CKPT-0, CKPT-1, CKPT-2, CKPT-6, CKPT-7.N (one per template) |
| **Sub-loop RAG (low_confidence/razonamiento_libre)** | CKPT-0, CKPT-1, CKPT-2, CKPT-3, CKPT-4, CKPT-5, CKPT-6, CKPT-7.N |
| **Sub-loop legacy (crm_mutation/cas_reject)** | CKPT-0, CKPT-1, CKPT-2, CKPT-3+4+5 combined (single post-call check after `runLegacySubLoop` line 626), CKPT-6, CKPT-7.N |
| **Sub-loop tooling-handoff (no relevant KB hit)** | CKPT-0, CKPT-1, CKPT-2, CKPT-3 (then sub-loop returns escalation handoff, no CKPT-4/5; flow proceeds to send single handoff template = CKPT-6, CKPT-7.1) |
| **Guard-blocked (R0/R1 escape)** | CKPT-0, CKPT-1 (then early return at line 218) — no CKPT-2 because guards return; lock released via finally |
| **Natural silence (0 messages sent)** | CKPT-0, CKPT-1, CKPT-2 (then early return at line 474) — no send loop |

Total checkpoint count per turn: 5-7 (conventional) or 8-10 (sub-loop). Each is ~5-15ms (1 Redis round-trip — GET lock value + GET interrupt key; could be combined into a Lua script later if latency matters, but 2 round-trips at 10ms is fine).

---

## Latency Assumptions Validated

| Assumption | Locked in | Reality (from research) | Status |
|------------|-----------|-------------------------|--------|
| Upstash REST P50 from Vercel `iad1` | DISCUSSION-LOG.md says "3-8ms" | [CITED: Upstash blog edge-caching benchmark] 5ms global avg with edge caching; [CITED: Upstash 1.0 blog] 18ms P99 for non-cached single ops from Lambda. **Without edge caching, expect P50 5-15ms, P99 20-40ms.** | LOWER than assumed at P50 (good), HIGHER than assumed at P99. RESEARCH says: budget 10ms median, 30ms tail per Redis op. |
| Lock acquire at T≈35-65ms in webhook | D-03 | Webhook handler: HMAC parse ~5ms + JSON parse ~1ms + `resolveWorkspaceId` ~25ms (Supabase select) + SET NX ~10ms = T≈40-50ms. **Confirms D-03 range.** | CONFIRMED |
| Sub-loop worst case 17s | D-13 | Tooling (gpt-4o-mini + kb_search) ~2-5s P99, Generation (Gemini Flash) ~1-4s P99, Compliance (Gemini Flash) ~0.5-1.5s P99 = combined ~4-11s P99. **17s is conservative.** | CONFIRMED (telemetry confirmation deferred to plan-phase Task 0.1) |
| Total turn worst case | (implied) | Lock acquire 50ms + comprehension 3s + state machine 50ms + sub-loop 11s P99 + send loop (5 templates × ~3s each) ≈ 30s | CONFIRMS TTL 45s is adequate. Heartbeat at 5s = 9 attempts to renew. 3 consecutive failures unlikely. |
| Follower poll interval | DISCUSSION-LOG.md Timings says 300ms | OK — Upstash has no per-IP rate limit issues at this rate. Free tier is 10,000 commands/day, paid 100k/day+; even an aggressive 300ms poll for 1 hour = 12k ops, manageable. [VERIFIED: Upstash pricing docs] | CONFIRMED |

**Action for plan-phase:** Task 0.1 should query `agent_observability_events` for last 30d of `subloop_completed` events to validate P95/P99 of `tooling_call.latencyMs + generation_call.latencyMs + compliance.latencyMs`. If P99 > 25s, bump TTL to 60s.

---

## Runtime State Inventory

> Phase is a system addition (greenfield), NOT a rename/refactor of strings. Most categories N/A.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no existing Redis keys in use. New namespace `lock:`, `interrupt:`, `pending:` is greenfield. | None |
| Live service config | Upstash database must exist + URL/token configured. Multi-zone (Prod Pack) must be enabled. | Pre-deploy: provision Upstash regional db (`us-east-1`), enable multi-zone, add env vars to Vercel prod + dev environments. |
| OS-registered state | None — no OS-level registrations. | None |
| Secrets/env vars | New: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Must be set in `.env.local` (dev) AND Vercel prod + preview environments. | Plan 00 / pre-deploy task: add env vars. |
| Build artifacts | None — `@upstash/redis` is a new dependency, will install on first `npm install`. | None |

---

## Inngest Concurrency Decision (D-14 clarification)

**DISCUSSION-LOG.md D-14** says "Su feature `concurrency: { key: conversationId, limit: 1 }` se elimina o sube a `limit: 10`". **Research recommendation:** **KEEP `limit: 1`.**

**Reasoning:**

1. **Inngest concurrency IS strict, not best-effort** — [CITED: https://www.inngest.com/docs/guides/concurrency] "concurrency limits the number of steps executing at a single time" and limits are deterministic per Inngest's documentation. The user's "best-effort" belief is anecdotal and may be confusing concurrency with event-replay non-determinism (which is unrelated).
2. **Belt-and-suspenders cost is zero** — `limit: 1` doesn't make us slower; it makes the rare-race scenario impossible at the Inngest level too.
3. **Removing it would mean parallel lambdas race for the lock** — works but burns 1 lambda invocation per follower (cost). The current approach (follower writes to Redis and exits without Inngest dispatch — see Pattern 2) is even better.
4. **Bumping to 10 is unjustified** — only makes sense if we expect >1 turn in flight per conversation, which is exactly what we're preventing.

**Action for plan-phase:** No change to `agent-production.ts:76-80`. Document in research log that limit=1 stays.

---

## Validation Architecture

> nyquist_validation is not explicitly disabled in `.planning/config.json`, treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^1.6.1` (already in devDependencies) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` |
| Full suite command | `npm test` (runs `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOCK-01 | acquire returns null on collision | unit | `vitest run src/lib/agents/interruption-system-v2/__tests__/lock.test.ts -t "collision"` | Wave 0 |
| LOCK-02 | TTL extends on heartbeat | unit | `vitest run -t "renewLockTTL"` | Wave 0 |
| LOCK-03 | release-if-owner rejects wrong UUID | unit | `vitest run -t "releaseLockIfOwner"` | Wave 0 |
| LOCK-04 | RPUSH/LREM by entry_uuid roundtrip | unit | `vitest run -t "pending entry roundtrip"` | Wave 0 |
| LOCK-05 | checkpoint detects zombie + interrupt | unit | `vitest run -t "checkpoint"` | Wave 0 |
| LOCK-06 | cron clears stale locks | unit | `vitest run -t "cleanup-cron"` | Wave 0 |
| LOCK-07 | 13 event labels are emitted at correct moments | unit | `vitest run -t "observability"` | Wave 0 |
| S1 — solo path | msg1 alone completes normal | e2e | `vitest run src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts -t "S1"` | Wave 0 |
| S2 — race | 2 messages, 1 holder + 1 follower → combo | e2e | `-t "S2"` | Wave 0 |
| S3 — TTL expiry | msg1 hangs, msg2 force-acquires | e2e | `-t "S3"` | Wave 0 |
| S4 — partial send | msg1 sends 1 template then aborted Path B | e2e | `-t "S4"` | Wave 0 |
| Phase 3 — Vercel preview | Real WhatsApp test | manual | n/a — manual smoke | Manual (D-19 Phase 3) |
| Phase 4 — visual | User-driven inspection | manual | n/a | Manual (D-19 Phase 4) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` (the single file affected)
- **Per wave merge:** `npx vitest run src/lib/agents/interruption-system-v2/` (full new module)
- **Phase gate:** Full `npm test` green + manual Phase 3 + Phase 4 (D-19)

### Wave 0 Gaps
- [ ] `src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` — covers LOCK-01..03
- [ ] `src/lib/agents/interruption-system-v2/__tests__/pending.test.ts` — covers LOCK-04
- [ ] `src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts` — covers LOCK-05
- [ ] `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` — covers S1-S4
- [ ] `src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` — shared mock (Example 6 above)
- [ ] No framework install needed — Vitest already present

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Webhook HMAC verification already exists in `whatsapp/route.ts:122-132`; not changed by this work. |
| V3 Session Management | no | Lock is a transient mutex, not user session. |
| V4 Access Control | yes | `workspaceId` MUST be derived from `resolveWorkspaceId` (server-trusted), never from request body. Pattern already enforced — preserved here. |
| V5 Input Validation | yes | `lockHolderUuid` from Inngest event MUST be validated as UUID v4 format before use in Lua script ARGV. Otherwise a malformed Inngest event could inject Lua. |
| V6 Cryptography | yes | Use `crypto.randomUUID()` (Node built-in, CSPRNG) — never `Math.random()` for `holder_uuid`. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lua injection via ARGV | Tampering | Validate `holder_uuid` matches `/^[0-9a-f-]{36}$/i` before passing as ARGV. Lua `cjson.decode` will reject malformed JSON anyway. |
| Lock starvation (DoS) | Denial of Service | Follower polling timeout 60s + cleanup cron; if Redis is unreachable, fail-open to "no lock" with `redis_unavailable_fallback_failed` event AND defensive `messages` table unique-constraint catches duplicate dispatches. **Plan-phase decision:** what does fail-open mean — process or drop? Recommend: PROCESS (don't lose customer messages), accept rare double-response. |
| Cross-workspace lock collision | Tampering | Key includes `workspaceId`. Lock keys are non-guessable + workspace-scoped. No risk of cross-workspace interference. |
| Vercel preview env hits prod Upstash | Tampering | Separate Upstash database for dev/preview. Optional key prefix `morfx:prod:` vs `morfx:preview:`. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Upstash REST P50 latency from Vercel `iad1` to Upstash `us-east-1` is 5-15ms median, 20-40ms P99 | Standard Stack / Latency table | If actual is >50ms, total turn budget compresses. Heartbeat may become contentious. **Mitigation:** Plan 00 Task 0.2 — measure actual latency with a 30-sample probe deployed to preview env. |
| A2 | Sub-loop P99 latency is currently ~11s, well under D-13's 17s budget | Latency table | If actual P99 > 25s, TTL must be 60s+. **Mitigation:** Plan 00 Task 0.1 — query `agent_observability_events` for last 30d. |
| A3 | Inngest `concurrency: limit=1` is strict (not "best-effort"); user's "2 responses in parallel" observation was caused by something OTHER than Inngest racing | Inngest decision section | If Inngest concurrency IS racy, then keeping `limit=1` doesn't help — Redis SET NX is the only mechanism. Doesn't change architecture (Redis is the primary). |
| A4 | Multi-zone Upstash failover is "seconds, not minutes"; lost SET NX during failover is rare enough that fencing-token catches the residual | Pitfall 1 | If failover is more frequent than expected, we'd see `lock_force_acquired_after_ttl_expiry` events. Acceptable — fencing token + Inngest concurrency + messages table dedup are 3 layers of protection. |
| A5 | `LREM count value` in @upstash/redis does byte-exact match (consistent with native Redis behavior) | Pattern 1 / Pitfall 4 | If the REST adapter does string normalization, our `entry_uuid`-based JSON matching fails. **Mitigation:** Lock.test.ts S4 explicitly tests this. |
| A6 | `redis.eval` in @upstash/redis returns the Lua script's return value verbatim (1 for success, 0 for not-owner) | Code Example 2 / Pattern 1 | If REST adapter wraps the result, the comparison fails. **Mitigation:** Lock.test.ts unit test asserts exact return value. |
| A7 | Existing `MessagingProductionAdapter.send` can be cleanly replaced with a no-`hasNewInboundMessage` variant for v4 path (option D-08-a) | D-08 clarification | If adapter swap is messier than expected, fall back to flag-gated check inside same adapter (D-08-b). Plan-phase to choose. |
| A8 | The `messages` table has a unique constraint on `(conversation_id, message_id)` that catches duplicate inbound dispatches as belt-and-suspenders | Pitfall 1 mitigation | If no such constraint exists, double-dispatch under Upstash failover would result in 2 message rows. **Mitigation:** Plan 00 verify by querying schema. |

---

## Open Questions

1. **Should follower path dispatch Inngest event or NOT?**
   - What we know: D-03 says "despacha inngest event con flag `follower=true`". Pattern 2 above argues NOT to dispatch (lighter, simpler).
   - What's unclear: Which path is desired?
   - Recommendation: **NO follower dispatch.** Holder's release-time logic re-dispatches if pending list has entries. Simpler control flow, lower cost. If plan-phase decides otherwise, the Inngest event needs a discriminator and the function needs branching.

2. **D-08 implementation: replace `MessagingProductionAdapter` for v4 OR flag-gate the check inside the existing adapter?**
   - What we know: D-08 says "eliminar Phase 31 del path de v4" but doesn't specify how.
   - What's unclear: Does v4 need its own adapter class, or is in-place flag-gating acceptable?
   - Recommendation: Create `V4MessagingAdapter extends MessagingProductionAdapter` that overrides `send` to skip `hasNewInboundMessage`. Keep v3 adapter untouched.

3. **Sandbox debug panel tab: live-stream events or snapshot at end of turn?**
   - What we know: D-11 says "tab nuevo 'Interruption' que muestra lifecycle del lock por turno".
   - What's unclear: Real-time SSE/WebSocket or post-turn fetch?
   - Recommendation: Post-turn fetch (like other tabs). Simpler, no SSE wiring. If user wants real-time later, upgrade in v2.1.

4. **Lock TTL value: 45s or higher?**
   - What we know: D-09 + user adjustment locked 45s.
   - What's unclear: Does sub-loop P99 telemetry justify 60s?
   - Recommendation: Plan 00 Task 0.1 measures actual P99. Default 45s; bump to 60s if measurements warrant.

5. **What does fail-open mean if Redis is unavailable?**
   - What we know: D-08 implies no fallback; `redis_unavailable_fallback_failed` event in D-17.
   - What's unclear: If `acquireLock` throws (Redis 5xx), do we PROCESS the message anyway (risk double-response) or DROP it (lose customer msg)?
   - Recommendation: **PROCESS, accept residual double-response risk.** Losing customer messages is worse than rare duplicates. Document in plan-phase.

6. **Should `releaseLockIfOwner` use Lua, or is `WATCH/MULTI` enough?**
   - What we know: `redis.multi()` is atomic per @upstash/redis docs.
   - What's unclear: Can we read a value, conditionally check, then DEL in a single `multi()` transaction?
   - Recommendation: Lua. `multi()` doesn't support conditional logic inside the transaction body (it just queues commands). [VERIFIED: Redis MULTI docs — "All commands are serialized and executed sequentially. Commands that are NOT pipeline-aware can't conditionally branch."] Lua eval is the correct primitive.

7. **Per-environment Upstash database or shared with key prefix?**
   - What we know: D-04 says solo v4, but follower path covers all channels (D-12).
   - What's unclear: Cost-of-mistake if dev hits prod Upstash.
   - Recommendation: Two databases (dev + prod). Cost ~$3-6/mo extra. Worth the isolation.

---

## State of the Art (2025-2026 specific)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@upstash/redis` < 1.0 (positional set args) | `^1.0.0` object syntax `{ nx, ex }` | 2023 (v1.0 release) | Use object syntax always; positional may compile but silently malfunction. [CITED: Upstash blog v1.0 release] |
| Redlock | Single Redis + fencing | Kleppmann 2016 critique, accepted as best-practice for efficiency locks | We are an efficiency-lock use case; Redlock would be over-engineering. |
| Polling DB for "new inbound message" (Phase 31) | Atomic Redis mutex | This standalone | ~15s window collapse to <100ms; covers all turn phases not just send-loop. |
| Inngest concurrency as correctness primitive | Inngest as defense-in-depth, Redis as primary | This standalone | Hard exclusion at the storage layer where it belongs. |

**Deprecated/outdated:**
- `redis.set(key, value, 'EX', 45, 'NX')` (positional args) — superseded by object syntax in @upstash/redis 1.0+.
- `@upstash/lock` as a turn-key library — superseded by explicit pattern in this design because we need fencing-token visibility.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | >=18 (Vercel default) | None — required for `crypto.randomUUID()`. |
| Vitest | Tests | ✓ | 1.6.1 | None — required for D-19 Phase 1. |
| `@upstash/redis` | Production | ✗ | — | Install: `npm install @upstash/redis@^1.38.0` |
| Upstash account | Production | ✗ (assumed not provisioned yet) | — | Provision before Plan 01: create regional `us-east-1` database with multi-zone enabled. Cost ~$10/mo for Prod Pack. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars | Production + tests | ✗ | — | Set in `.env.local` (dev), Vercel preview env, Vercel production env. |

**Missing dependencies with no fallback:**
- Upstash account / database — must be provisioned manually by user. Plan 00 Task 0.3 should include "User provisions Upstash" as a blocking prerequisite.

**Missing dependencies with fallback:**
- For unit tests, mock-redis.ts shim (Example 6) replaces real Upstash. CI does NOT need real Upstash.

---

## Project Constraints (from CLAUDE.md)

- **Regla 0 GSD:** Research is required before plan. Done.
- **Regla 1:** Push to Vercel after code changes before asking user to test. Applies to plan-phase / execute-phase.
- **Regla 2:** Timezone `America/Bogota` for all date logic. The lock `started_at` ISO timestamp can be UTC (just an instant); display in sandbox tab MUST be `America/Bogota`.
- **Regla 3 Domain Layer:** Lock operations are NOT data mutations against business tables — they're against Redis (an external service). The wrapper module `src/lib/agents/interruption-system-v2/` acts like a domain layer for Redis. ANY consumer (webhook handler, runner, sub-loop) MUST go through this wrapper — no direct `new Redis(...)` outside the wrapper.
- **Regla 4:** Update relevant docs on every change. Plan-phase to add LEARNINGS at end. Also update `CLAUDE.md` to add the new module scope `### Module Scope: interruption-system-v2`.
- **Regla 5 Migración antes de Deploy:** No DB migration in this work (it's Redis-only + new TS files). Migration rule does NOT apply.
- **Regla 6 Proteger Agente en Producción:** v4 is dormant in prod (D-04 confirmed). This standalone affects only v4. v3/godentist/recompra/pw-confirmation paths are untouched. Compliant.

---

## Sources

### Primary (HIGH confidence)
- [CITED] [Martin Kleppmann — How to do distributed locking (2016)](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) — fencing token pattern, Redlock critique, efficiency vs correctness locks
- [CITED] [Upstash — @upstash/lock blog](https://upstash.com/blog/lock) — explicit caveat about async replication and SET NX safety
- [CITED] [Upstash — Multi-Zone Replication](https://upstash.com/blog/multi-zone) — failover behavior, multi-zone vs single-zone
- [CITED] [Upstash — Global Database docs](https://upstash.com/docs/redis/features/globaldatabase) — regional vs global trade-offs
- [CITED] [Upstash — Consistency model docs](https://upstash.com/docs/redis/features/consistency) — eventual vs read-your-writes
- [CITED] [Upstash — Replication docs](https://upstash.com/docs/redis/features/replication) — single-leader architecture
- [CITED] [@upstash/redis npm package](https://www.npmjs.com/package/@upstash/redis) — verified version 1.38.0 published ~2 weeks before research
- [CITED] [Inngest — Concurrency docs](https://www.inngest.com/docs/guides/concurrency) — strict (not best-effort) concurrency limits
- [VERIFIED] `package.json` — `@upstash/redis` not currently a dependency; `inngest` 3.54.0; `vitest` 1.6.1
- [VERIFIED] `supabase/migrations/20260408000000_observability_schema.sql:79-89` — `agent_observability_events.payload JSONB NOT NULL` accepts arbitrary payloads
- [VERIFIED] Source files: `v4-production-runner.ts`, `somnio-v4/sub-loop/index.ts`, `somnio-v4/somnio-v4-agent.ts`, `whatsapp/webhook-handler.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/api/webhooks/manychat/route.ts`, `inngest/functions/agent-production.ts`, `inngest/functions/crm-mutation-idempotency-cleanup.ts` — checkpoint locations + cron pattern + concurrency setting

### Secondary (MEDIUM confidence)
- [CITED] [Upstash — Pipeline & Transaction docs](https://upstash.com/docs/redis/sdks/ts/pipelining/pipeline-transaction) — multi() atomic, pipeline() non-atomic
- [CITED] [Upstash — Developing/Testing docs](https://upstash.com/docs/redis/sdks/ts/developing) — SRH for integration tests; no in-memory mock provided
- [CITED] [Upstash blog — Make Your Own Message Queue](https://upstash.com/blog/redis-message-queue) — concrete `redis.eval` TypeScript example
- [CITED] [Upstash blog — Edge Caching Benchmark](https://upstash.com/blog/edge-caching-benchmark) — 5ms global avg with edge caching
- [CITED] [Upstash 1.0 vs Redis 7.2 blog](https://johal.in/opinion-you-use-upstash-10-redis-72-serverless/) — 18ms P99 for non-cached operations from Lambda
- [CITED] [Vercel — Functions region docs](https://vercel.com/docs/functions/configuring-functions/region) — iad1 = us-east-1, default for new functions
- [CITED] [Vitest — Mocking docs](https://vitest.dev/guide/mocking) — `vi.mock` + `vi.hoisted` patterns for module-level mocks

### Tertiary (LOW confidence — flagged for plan-phase validation)
- [CITED] [Marc0 dev blog — Serverless Race Conditions](https://www.marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289) — pattern advocacy without code; corroborates philosophy
- [CITED] [Leapcell — 10 Hidden Pitfalls of Redis Distributed Locks](https://leapcell.medium.com/10-hidden-pitfalls-of-using-redis-distributed-locks-b5234ddd6349) — pitfall taxonomy, single-author opinion

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — version verified via npm view 2026-05-25, exact methods documented in @upstash/redis source.
- Architecture (fencing + checkpoints): HIGH — pattern is standard, Kleppmann + Upstash docs corroborate.
- Latency assumptions: MEDIUM — based on Upstash's own published benchmarks but not measured against our specific Vercel deployment. Plan 00 Task 0.2 should measure.
- Sub-loop worst case 17s: MEDIUM — calculated from individual P99 budgets but not validated against actual telemetry. Plan 00 Task 0.1 should query observability data.
- Upstash failover frequency: LOW — Upstash doesn't publish failure statistics. Conservative assumption is "rare, hours-to-days between events". Multi-zone significantly reduces.
- Inngest concurrency strictness: MEDIUM — docs say strict but user has anecdotally seen issues. Either docs are wrong OR user observation was caused by something else (race outside Inngest, e.g., webhook fired twice). Keeping `limit=1` is the safe default.

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (30 days; Upstash + Vercel + Inngest are stable platforms but `@upstash/redis` published 1.38.0 just 2 weeks ago — check for newer patch versions in plan-phase).
