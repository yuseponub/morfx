# RESEARCH — debounce-v2-sandbox-integration

**Standalone:** `debounce-v2-sandbox-integration`
**Date:** 2026-05-26
**Domain:** Wiring an already-shipped distributed-lock primitive into a sandbox UI path.
**Confidence overall:** HIGH on the data flow + threading; **MEDIUM** on D-02 vs D-15 contradiction, **MEDIUM** on D-07 FOLLOWER waiting mechanism. Both are flagged below as user checkpoints before planning.

---

## Summary

The parent standalone `debounce-interruption-system-v2` shipped a complete distributed-lock primitive (`@/lib/agents/interruption-system-v2/*`) and wired it end-to-end into the production WhatsApp/FB-IG path: 8 checkpoints, 14 typed observability labels, Inngest cron sweep, sandbox debug-panel tab, all gated on `resolvedAgentId === 'somnio-sales-v4'` for Regla 6 protection. v4 is DORMANT in production (0 workspaces), so the entire system is inert until per-workspace flip.

The sandbox v4 path today **shares the same `processMessage` function** (`somnio-v4/somnio-v4-agent.ts` + `sub-loop/index.ts`) as production, which means **CKPT-1..5 already exist in source code** — they just never fire in sandbox because every site is skip-gated on `lockHandle && lockChannel && lockIdentifier` being non-null, and the sandbox engine wrapper (`SomnioV4Engine` at `engine-v4.ts`) does not pass these fields. The work is therefore narrower than the parent: extend `SomnioV4Engine.processMessage` to acquire/release the lock around the existing `processMessage` call (mirror `V4ProductionRunner.processMessage` lines 71-853), thread `lockHandle`/`lockChannel`/`lockIdentifier` through, and add HOLDER/FOLLOWER branch logic in `/api/sandbox/process/route.ts`.

**Primary recommendation:**
1. Resolve the **D-02 vs D-15 contradiction** with the user before planning (see Open Questions resolved §1). Recommend **Option C** (use `channel='whatsapp'` + identifier prefix `sandbox-{sandboxSessionId}` — no module changes, no cron false-positives, full isolation via prefix). Decline D-02's literal `channel='sandbox'` because it forces 6+ files in the shipped module to change and breaks the cron's whitelist (line 57 of `v2-lock-cleanup-cron.ts`).
2. Implement HOLDER/FOLLOWER in `/api/sandbox/process/route.ts` (~80 LOC) as a v4-only branch wrapping the existing line 133 `if (agentId === 'somnio-sales-v4')` block.
3. Mirror `V4ProductionRunner` lock lifecycle (acquire/heartbeat/CKPT-0/CKPT-6/release in finally) inside `SomnioV4Engine.processMessage` (~120 LOC delta). CKPT-1..5 propagate automatically because the agent + sub-loop already honor the optional fields.
4. Wire `ObservabilityCollector` via `runWithCollector` in the v4 sandbox branch so `emitLockEvent` writes to `agent_observability_events` and the existing Interruption tab shows real events.
5. Decline CKPT-7 paridad strict (D-04). The sandbox does not call `V4MessagingAdapter.send` — it returns `output.messages` directly and the client UI simulates send via `setTimeout`. Implementing CKPT-7 in sandbox would require either (a) replicating `MessagingProductionAdapter.send` in sandbox (out of scope) or (b) a synthetic loop inside `SomnioV4Engine` that calls `checkpoint('ckpt_7_pre_template', ...)` once per `output.messages[i]` before yielding it. Recommend (b) — minimal cost, true paridad.

---

## User Constraints (from DISCUSSION-LOG.md)

### Locked Decisions (D-01 through D-15)

15 decisions are locked in DISCUSSION-LOG.md. Treated as constraints; research does NOT challenge them except where they internally contradict (see Open Questions resolved §1).

Key constraints affecting plan-phase:

- **D-01 Solo `somnio-sales-v4`** — already enforced by route.ts line 133 branch; no change needed.
- **D-02 Lock key `channel='sandbox'` literal** — **CONFLICTS with D-15** (see §1).
- **D-03 Reuse `sandboxSessionId` from `SandboxSession`** — verified: `loadSandboxSessions()` + `generateSessionId()` in `src/lib/sandbox/sandbox-session.ts:118-120`. Client-side `localStorage` source of truth. Server needs to receive it in the payload (currently NOT sent — gap).
- **D-04 8 checkpoints paridad total** — CKPT-1..5 already in-source (skip-guarded). CKPT-0 + CKPT-6 to be added to `SomnioV4Engine` (mirror runner lines 122-183 + 320-492). CKPT-7 paridad needs an explicit synthetic call site in `SomnioV4Engine` (sandbox does not invoke `MessagingProductionAdapter.send`).
- **D-05 Heartbeat** — `startHeartbeat(handle)` already exported from `lock.ts:199`. Import + invoke in `SomnioV4Engine.processMessage` try block, stop in finally. Mirror `v4-production-runner.ts:99-102`.
- **D-06 HOLDER/FOLLOWER in route handler** — new branch in `/api/sandbox/process/route.ts` lines 130-175. Mirror `webhook-handler.ts:338-419` adapted for sync request/response (no Inngest dispatch).
- **D-07 FOLLOWER response shape** — `{ success: true, deferred: true, reason: 'follower_appended_to_pending', pendingListLength: N }` HTTP 200. **UI mechanism for the FOLLOWER waiting for HOLDER's combined response is an Open Question** — see §3.
- **D-08 Interruption tab → real data** — `panel-container.tsx:84` currently passes `conversationId={null} sessionId={null}`. Wire props from `sandbox-layout.tsx` state. **BUT:** the `/api/observability/events` GET route resolves `session_id → conversation_id → turn_ids` via `agent_sessions` table — sandbox does not create rows there. See §2 for resolution.
- **D-09 Aislamiento entre tabs** — guaranteed by `lock:{ws}:{channel}:{sandboxSessionId}` shape (unique per tab).
- **D-10 Aislamiento sandbox vs prod** — guaranteed by either `channel='sandbox'` (D-02 literal — requires module changes) or `identifier='sandbox-{id}'` (Option C). Both prevent collision.
- **D-11 Cron sweep option (c)** — accept default cron behavior. **BUT:** cron parseLockKey at `v2-lock-cleanup-cron.ts:57` REJECTS unknown channels, sweeping them as `malformed_value` every 5 min. If D-02 literal is chosen, MUST extend the whitelist. If Option C, no change.
- **D-12 Sin migración SQL** — locked. Has implication: cannot create real `agent_sessions` rows for sandbox without migrating schema. Therefore Interruption tab needs alternative event query path (see §2).
- **D-13 Sin feature flag** — locked. Acceptable: v4-only by branch + agent dropdown opt-in.
- **D-14 Tests S1/S2/S3** — unit tests for the new SomnioV4Engine wrapper + manual smoke from `/sandbox` UI.
- **D-15 Out of scope** — webhook handlers, V4ProductionRunner, V4MessagingAdapter, interruption-system-v2 module, cron all locked as untouched. **CONFLICTS with D-02** (see §1).

### Claude's Discretion (research-driven)

- The exact FOLLOWER waiting mechanism — recommend **server-side blocking GET (long-poll)** because it requires zero new infrastructure (no SSE, no WebSocket, no Redis pub/sub) — see §3.
- CKPT-7 implementation strategy in sandbox — recommend synthetic per-message checkpoint call inside `SomnioV4Engine` mapping loop.
- Observability collector wiring — recommend `runWithCollector` wrapper in v4 sandbox branch (mirror reader/writer route pattern at `src/app/api/v1/crm-bots/reader/route.ts:193-201`).

### Deferred Ideas (OUT OF SCOPE)

Per DISCUSSION-LOG.md D-15:
- Touching `interruption-system-v2/` primitives (acquireLock, releaseLockIfOwner, etc.).
- Touching `V4ProductionRunner` / `V4MessagingAdapter` / webhook handlers.
- Extending to v3/godentist/recompra/pw-confirmation sandbox paths.
- Modifying `v2-lock-cleanup-cron`.

---

## Phase Requirements (mapped to research)

| ID | Description | Research Support |
|----|-------------|------------------|
| SBX-01 | Sandbox v4 path acquires Redis lock at entry, releases in finally | New code in `SomnioV4Engine.processMessage` + new branch in route.ts. Reuses shipped `acquireLock`/`releaseLockIfOwner`/`startHeartbeat`. |
| SBX-02 | CKPT-0..7 fire in sandbox identically to prod | CKPT-1..5 already skip-guarded in source — auto-fire when fields populated. CKPT-0+6 added to SomnioV4Engine wrapper. CKPT-7 synthetic per-message in mapping loop. |
| SBX-03 | HOLDER/FOLLOWER discrimination at sandbox API entry | New branch mirroring `webhook-handler.ts:338-419`, adapted for sync request/response. |
| SBX-04 | FOLLOWER waits for HOLDER's combined response | Server-side long-poll via new GET endpoint `/api/sandbox/lock-result/:sandboxSessionId` (Recommended; alternatives explored §3). |
| SBX-05 | Interruption tab in `/sandbox` shows real events for current session | Wire `sessionId` prop from `sandbox-layout.tsx` to `panel-container.tsx → InterruptionTab`. Events route needs an alternative resolution path that doesn't depend on `agent_sessions` row existence. |
| SBX-06 | All 5 non-v4 agents byte-identical behavior in sandbox | Guarantee: only the `agentId === 'somnio-sales-v4'` branch is modified; v1/v2/v3/recompra branches untouched. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lock acquire/release at sandbox entry | API / Backend (`/api/sandbox/process/route.ts`) | Cache (Upstash Redis) | First point where `workspaceId + sandboxSessionId` available; lock MUST be acquired before invoking the engine. |
| FOLLOWER response shape + queueing | API / Backend (route.ts) | Cache (pending list) | Sync request/response — no Inngest dispatch; UI receives `deferred: true`. |
| FOLLOWER → HOLDER result correlation | API / Backend (new long-poll endpoint) | Cache (Redis pub/sub or short-lived key) | Sandbox has no Inngest; needs sync coordination. |
| Checkpoint dispatch through pipeline | Library (somnio-v4-agent + sub-loop) | — | ALREADY WIRED — skip-guarded on lock fields. |
| Observability event persistence | DB (Supabase `agent_observability_events`) | API (observability collector) | Already shipped. Sandbox path must wrap with `runWithCollector` (currently does not). |
| Interruption tab event fetching | Browser (React) | API (events GET endpoint) | Existing endpoint at `/api/observability/events` resolves session → conversation → turns; sandbox needs alternative because no real session row. |

---

## Standard Stack

### Core (all already installed — DO NOT install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/redis` | `^1.38.0` | Redis client for lock + pending list | [VERIFIED: parent RESEARCH §Stack] Already in `package.json` from parent standalone. |
| `crypto.randomUUID` | Node built-in | Pending entry UUIDs | Used identically to webhook path. |
| `@/lib/agents/interruption-system-v2/*` | (in-repo) | Lock + checkpoints + observability primitives | Shipped 2026-05-26. **Import only — never modify.** |

### Supporting (no new deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | Long-poll for FOLLOWER waiting uses native `setTimeout` + `redis.get`. |

**Installation:** `pnpm install` (no new packages) — verified by checking `RESEARCH.md` parent §Stack and grepping `package.json`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Long-poll for FOLLOWER waiting | Server-Sent Events (SSE) | SSE requires a streaming response; the current sandbox UI uses `fetch().then(r => r.json())` — converting to SSE is more UI changes than long-poll. |
| Long-poll | Redis pub/sub via `subscribe` | Upstash REST does not support persistent SUBSCRIBE connections. Would require `@upstash/redis` SDK upgrade or alternative client. |
| Server-side coordinator | Client-side polling | Client polling = N round-trips; server long-poll = 1 round-trip pinned for ≤30s. Strictly better UX. |

---

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────────────────┐
                │  User in /sandbox (browser tab)  │
                │  agentId='somnio-sales-v4'       │
                │  sandboxSessionId (localStorage) │
                └──────────────┬───────────────────┘
                               │ POST /api/sandbox/process
                               │ body now includes sandboxSessionId
                               ▼
        ┌───────────────────────────────────────────────────┐
        │  route.ts v4 branch (existing lines 133-174)      │
        │                                                    │
        │  1. extract sandboxSessionId from body (NEW)       │
        │  2. acquireLock(workspaceId, 'whatsapp',           │
        │       'sandbox-{sandboxSessionId}')                │
        │     - Returns LockHandle or null                   │
        │  3. Push own entry to pending (D-16)               │
        │  4. Branch on acquired vs null:                    │
        └────────┬──────────────────────┬───────────────────┘
                 │ HOLDER (lock owned) │ FOLLOWER (null)
                 ▼                      ▼
        ┌─────────────────────┐ ┌─────────────────────────┐
        │ runWithCollector    │ │ pushToPending           │
        │   wrap below        │ │ SET interrupt key       │
        │                     │ │ emit lock_acquire_      │
        │ new SomnioV4Engine  │ │   failed_follower       │
        │ .processMessage({   │ │ emit interrupt_written  │
        │   …,                │ │                          │
        │   lockHandle,       │ │ Return:                  │
        │   lockChannel,      │ │ { success: true,         │
        │   lockIdentifier,   │ │   deferred: true,        │
        │   ownPendingEntry,  │ │   reason: 'follower...', │
        │ })                  │ │   pendingListLength: N } │
        │                     │ │                          │
        │ Inside SomnioV4Engine: │  HTTP 200                │
        │   try {                                            │
        │     startHeartbeat()                              │
        │     CKPT-0 (post-acquire)  ─┐                     │
        │     processMessage(...) ────┤ CKPT-1..5            │
        │     CKPT-6 (pre-send-loop) ─┤ fire via            │
        │     for msg in output:      │ skip-guarded         │
        │       CKPT-7.N synthetic    │ helpers              │
        │     return mapped result   ─┘                     │
        │   } finally {                                      │
        │     stopHeartbeat()                                │
        │     releaseLockIfOwner()                           │
        │     emit lock_released_normal                      │
        │   }                                                │
        │                     │                              │
        │ JSON response       │                              │
        └─────────────────────┘                              │
                 ▼                                            ▼
        Sandbox UI receives:                Sandbox UI sees deferred=true
        - HOLDER: normal result             - Polls GET /api/sandbox/
        - FOLLOWER's content was combined     lock-result/{sandboxSessionId}
          into HOLDER's processing via         until lock-released event
          readAndClearPending at CKPT-0        observed (timeout 30s)
                                            - Server-side long-poll: waits
                                              for HOLDER's lock release,
                                              then returns HOLDER's result
                                              from short-lived Redis key

       Parallel: existing /api/observability/events GET — Interruption tab
       polls every render (already wired, currently passes null).
       BUT: events route resolves session → conversation → turns; sandbox
       doesn't create those rows. Need alternate path (see §2).
```

### Recommended Project Structure (after this standalone)

```
src/
├── app/
│   ├── api/
│   │   └── sandbox/
│   │       ├── process/
│   │       │   ├── route.ts                  # EDIT — new lock branch in v4 path
│   │       │   └── __tests__/
│   │       │       └── route-v4-lock.test.ts # NEW — unit tests for HOLDER/FOLLOWER
│   │       └── lock-result/
│   │           └── [sandboxSessionId]/
│   │               └── route.ts              # NEW — long-poll endpoint for FOLLOWER
│   └── (dashboard)/
│       └── sandbox/
│           └── components/
│               ├── sandbox-layout.tsx        # EDIT — pass sessionId to DebugPanel
│               └── debug-panel/
│                   └── panel-container.tsx   # EDIT — wire sessionId to InterruptionTab
└── lib/
    └── agents/
        └── somnio-v4/
            ├── engine-v4.ts                  # EDIT — wrap with lock lifecycle
            └── __tests__/
                └── engine-v4-lock.test.ts    # NEW — unit tests for CKPT-0/6/7 wiring
```

### Pattern 1: HOLDER/FOLLOWER adapted for sync request/response

**What:** The webhook HOLDER/FOLLOWER pattern dispatches an Inngest event from HOLDER and exits 200; FOLLOWER writes to pending list and exits 200. In sandbox, both HOLDER and FOLLOWER are **synchronous request/response handlers** — no background dispatch. HOLDER must process inline and return a JSON response; FOLLOWER must either (a) wait for HOLDER's result or (b) signal the UI to retry.

**Recommendation:** FOLLOWER returns immediately with `{ deferred: true, sandboxSessionId, pendingListLength }`. UI sees `deferred: true` and starts a long-poll against a new endpoint `/api/sandbox/lock-result/:sandboxSessionId`. The endpoint blocks up to 30s checking a Redis key `sandbox-result:{sandboxSessionId}` that HOLDER writes (TTL=60s) just before its finally block releases the lock. When poll sees the key, returns the HOLDER's result and DELs the key. UI renders normally.

**Code example (sandbox/process/route.ts v4 branch):**

```typescript
// Source: mirrors webhook-handler.ts:338-419 adapted for sync.
// ============================================================================
if (agentId === 'somnio-sales-v4') {
  // NEW — extract sandboxSessionId from body (added by D-03)
  const sandboxSessionId = body.sandboxSessionId as string | undefined
  if (!sandboxSessionId) {
    return NextResponse.json({ error: 'sandboxSessionId required for v4 sandbox' }, { status: 400 })
  }

  // NEW — lock attempt. Note channel='whatsapp' + prefix on identifier (Option C).
  const { acquireLock } = await import('@/lib/agents/interruption-system-v2/lock')
  const { pushToPending } = await import('@/lib/agents/interruption-system-v2/pending')
  const { redis } = await import('@/lib/agents/interruption-system-v2/redis-client')
  const { emitLockEvent } = await import('@/lib/agents/interruption-system-v2/observability')
  const { randomUUID } = await import('crypto')

  const wsId = workspaceId ?? 'sandbox-workspace'
  const lockChannel = 'whatsapp' as const          // Option C: do not extend module
  const lockIdentifier = `sandbox-${sandboxSessionId}` // prefix prevents prod collision

  let lockHandle: { key: string; holderUuid: string; startedAt: string } | null = null
  let ownPendingEntryJson: string | null = null

  try {
    lockHandle = await acquireLock(wsId, lockChannel, lockIdentifier)
    const entryUuid = randomUUID()
    const pendingEntry = { entry_uuid: entryUuid, content: message, received_at: new Date().toISOString(), msg_id: entryUuid }

    if (!lockHandle) {
      // FOLLOWER PATH
      const push = await pushToPending(wsId, lockChannel, lockIdentifier, pendingEntry)
      await redis.set(`interrupt:${wsId}:${lockChannel}:${lockIdentifier}`, entryUuid, { ex: 60 })
      emitLockEvent('lock_acquire_failed_follower', { existing_holder_uuid: 'unknown', my_msg_id: entryUuid, key: `lock:${wsId}:${lockChannel}:${lockIdentifier}` })
      emitLockEvent('interrupt_written', { msg_id: entryUuid, pending_list_length: push.pendingListLength })
      return NextResponse.json({
        success: true,
        deferred: true,
        sandboxSessionId,
        reason: 'follower_appended_to_pending',
        pendingListLength: push.pendingListLength,
      })
    }

    // HOLDER PATH — RPUSH self
    const push = await pushToPending(wsId, lockChannel, lockIdentifier, pendingEntry)
    ownPendingEntryJson = push.exactJson
    emitLockEvent('lock_acquired', {
      holder_uuid: lockHandle.holderUuid, msg_id: entryUuid, key: lockHandle.key, ttl: 45, started_at: lockHandle.startedAt,
    })
  } catch (lockErr) {
    emitLockEvent('redis_unavailable_fallback_failed', { error_message: lockErr instanceof Error ? lockErr.message : String(lockErr) })
    lockHandle = null
    ownPendingEntryJson = null
    // fall through — engine handles null gracefully (skip-guarded checkpoints)
  }

  // Existing engine call, now with lock fields + collector wrap:
  const { runWithCollector, ObservabilityCollector } = await import('@/lib/observability')
  const collector = new ObservabilityCollector({
    workspaceId: wsId,
    conversationId: sandboxSessionId,  // sandbox: session ≡ conversation (D-08 implication)
    agentId: 'somnio-sales-v4',
    triggerKind: 'sandbox',
    turnStartedAt: new Date(),
  })

  const { SomnioV4Engine } = await import('@/lib/agents/somnio-v4/engine-v4')
  const v4Engine = new SomnioV4Engine()
  const v4Result = await runWithCollector(collector, () => v4Engine.processMessage({
    message,
    state,
    history: history ?? [],
    turnNumber: turnNumber ?? 1,
    workspaceId: wsId,
    systemEvent,
    // NEW fields (additions to V4EngineInput):
    lockHandle,
    lockChannel,
    lockIdentifier,
    ownPendingEntryJson,
    sandboxSessionId,  // for HOLDER-writes-result-to-Redis-for-follower mechanism
  }))

  // HOLDER must persist its result for any waiting FOLLOWER (long-poll mechanism)
  if (lockHandle) {
    await redis.set(`sandbox-result:${sandboxSessionId}`, JSON.stringify(v4Result), { ex: 60 })
  }

  return NextResponse.json(v4Result)
}
```

### Pattern 2: SomnioV4Engine — mirror V4ProductionRunner lifecycle

**What:** `SomnioV4Engine.processMessage` currently calls `processMessage(agentInput)` once and maps the result. To achieve D-04 paridad, wrap the existing body with the same `try { startHeartbeat; CKPT-0; processMessage; CKPT-6; for msg in messages: CKPT-7; } catch { LostLockError } finally { stopHeartbeat; releaseLockIfOwner; emit lock_released_normal }` pattern as `v4-production-runner.ts:71-853`.

**Where to mirror:**
- Heartbeat: `v4-production-runner.ts:99-102` (start) + `:831` (stop).
- CKPT-0 post-acquire: `:122-183` (Path A combo logic — different in sandbox because there's no `session.state.datos_capturados['_v3:pendingUserMessage']` persistence; instead combine in-memory and re-process synchronously OR return a `combined: true` marker to UI).
- CKPT-6 pre-send-loop: `:330-373` + `:444-492` (we have no pending-templates pre-send case in sandbox, so only the main CKPT-6b call is needed).
- CKPT-7 per-template synthetic call: NEW. Sandbox does not call `MessagingProductionAdapter.send`, so we inject the checkpoint as a loop wrapper around `output.messages` before returning to the route handler.
- LostLockError catch: `:783-797`.
- Release in finally: `:818-851`.

**Code example (engine-v4.ts excerpt — additions only):**

```typescript
// Source: clone of v4-production-runner.ts:71-853, simplified for sandbox.

import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import { releaseLockIfOwner, startHeartbeat, type LockHandle } from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending } from '@/lib/agents/interruption-system-v2/pending'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { LostLockError } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'

export interface V4EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  // NEW (Plan XX):
  lockHandle?: LockHandle | null
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
  lockIdentifier?: string | null
  ownPendingEntryJson?: string | null
  sandboxSessionId?: string
}

export class SomnioV4Engine {
  async processMessage(input: V4EngineInput): Promise<V4EngineOutput> {
    const timestamp = new Date().toISOString()
    const startMs = Date.now()
    const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
      ? { channel: input.lockChannel, identifier: input.lockIdentifier }
      : null

    let stopHeartbeat: (() => void) | null = null
    if (input.lockHandle) stopHeartbeat = startHeartbeat(input.lockHandle)
    let templatesSentCount = 0
    let effectiveMessage = input.message

    try {
      // CKPT-0 post-acquire — read pending list, combine with current message
      if (input.lockHandle && lockCtx) {
        const ck0 = await checkpoint('ckpt_0_post_acquire', input.lockHandle, input.workspaceId, lockCtx.channel, lockCtx.identifier)
        if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
        if (!ck0.proceed && ck0.interrupted) {
          // Path A — pending has entries, combine + still process in-band (sandbox is sync)
          const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
          emitLockEvent('msg_aborted_path_a_combined', { at_step: 'ckpt_0_post_acquire', combined_msg_count: pending.length + 1, total_chars: pending.reduce((s, p) => s + p.content.length, 0) + input.message.length })
          emitLockEvent('pending_list_combined', { at_step: 'ckpt_0_post_acquire', entries_count: pending.length, total_chars: pending.reduce((s, p) => s + p.content.length, 0) })
          effectiveMessage = [...pending.map(p => p.content), input.message].join('\n')
          // Note: unlike production, sandbox continues processing the combined message
          // synchronously rather than returning empty and waiting for next dispatch.
        }
      }

      // Existing call (now with effectiveMessage + lock fields threaded into agent input)
      const output = await processMessage({
        message: effectiveMessage,
        // ... existing field mapping ...
        // NEW:
        lockHandle: input.lockHandle ?? null,
        lockChannel: input.lockChannel ?? null,
        lockIdentifier: input.lockIdentifier ?? null,
      })

      // CKPT-6 pre-send-loop
      if (input.lockHandle && lockCtx) {
        const ck6 = await checkpoint('ckpt_6_pre_send_loop', input.lockHandle, input.workspaceId, lockCtx.channel, lockCtx.identifier, { hasSentAnything: false })
        if (ck6.lostLock) throw new LostLockError('ckpt_6_pre_send_loop')
        if (!ck6.proceed && ck6.interrupted) {
          emitLockEvent('msg_aborted_path_a_combined', { at_step: 'ckpt_6_pre_send_loop', templates_sent_before_abort: 0 })
          return { /* empty result with messages=[] */ } as V4EngineOutput
        }
      }

      // CKPT-7.N per-template synthetic — sandbox does not call MessagingAdapter.send,
      // so we synthesize the per-message abort gate here.
      const finalMessages: string[] = []
      for (let i = 0; i < output.messages.length; i++) {
        if (input.lockHandle && lockCtx) {
          const ck7 = await checkpoint('ckpt_7_pre_template', input.lockHandle, input.workspaceId, lockCtx.channel, lockCtx.identifier, { templateIndex: i, hasSentAnything: i > 0 })
          if (ck7.lostLock) throw new LostLockError(`ckpt_7_pre_template_${i}`)
          if (!ck7.proceed && ck7.interrupted) {
            const eventLabel = i === 0 ? 'msg_aborted_path_a_combined' : 'msg_aborted_path_b_solo'
            emitLockEvent(eventLabel, { at_step: `ckpt_7_pre_template_${i}`, templates_sent_before_abort: i })
            break
          }
        }
        finalMessages.push(output.messages[i])
      }
      templatesSentCount = finalMessages.length
      // ... existing newState + debugTurn mapping, but with finalMessages instead of output.messages ...
      return { success: output.success, messages: finalMessages, newState, debugTurn, timerSignal }
    } catch (error) {
      if (error instanceof LostLockError) {
        emitLockEvent('zombie_lambda_exit', { my_uuid: input.lockHandle?.holderUuid ?? 'unknown', current_holder_uuid: 'unknown', at_step: error.ckptId })
        return { success: false, messages: [], newState: input.state, error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message } } as V4EngineOutput
      }
      // existing catch
    } finally {
      if (stopHeartbeat) stopHeartbeat()
      if (input.lockHandle) {
        try {
          const released = await releaseLockIfOwner(input.lockHandle)
          if (released) emitLockEvent('lock_released_normal', { holder_uuid: input.lockHandle.holderUuid, duration_ms: Date.now() - startMs, templates_sent: templatesSentCount })
        } catch (releaseError) {
          emitLockEvent('redis_unavailable_fallback_failed', { error_message: releaseError instanceof Error ? releaseError.message : String(releaseError), at_step: 'release_lock_in_finally' })
        }
      }
    }
  }
}
```

### Pattern 3: FOLLOWER long-poll endpoint

**What:** Sandbox-only sync coordination. FOLLOWER's response told UI to wait; UI then does `fetch('/api/sandbox/lock-result/{id}')` which blocks server-side for up to 30s checking `redis.get('sandbox-result:{id}')` every 300ms. When the key appears (set by HOLDER's tail), returns it and DELs.

**Code example (NEW `/api/sandbox/lock-result/[sandboxSessionId]/route.ts`):**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'

const POLL_INTERVAL_MS = 300
const POLL_TIMEOUT_MS = 30_000

export async function GET(req: NextRequest, ctx: { params: Promise<{ sandboxSessionId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { sandboxSessionId } = await ctx.params
  if (!sandboxSessionId) return NextResponse.json({ error: 'sandboxSessionId required' }, { status: 400 })

  const key = `sandbox-result:${sandboxSessionId}`
  const start = Date.now()

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const raw = await redis.get<string>(key)
    if (raw) {
      await redis.del(key)
      return NextResponse.json({ ready: true, result: typeof raw === 'string' ? JSON.parse(raw) : raw })
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }

  return NextResponse.json({ ready: false, timeout: true }, { status: 200 })
}
```

### Anti-Patterns to Avoid

- **DO NOT modify `interruption-system-v2/` primitives** (lock.ts, pending.ts, checkpoints.ts, observability.ts, redis-client.ts, lua-scripts.ts). D-15 is explicit. If `LockChannel` union must change, escalate to user as a contract change.
- **DO NOT add `'sandbox'` to the cron's parseLockKey whitelist** without an explicit module-change discussion. The cron is locked OOS by D-15.
- **DO NOT call `acquireLock` outside the v4 branch** in route.ts. v1/v2/v3/recompra paths MUST be byte-identical (Regla 6).
- **DO NOT poll Redis from the engine while LLM calls run** — same constraint as prod (D-13 parent). Use discrete checkpoints only.
- **DO NOT skip `runWithCollector` wrap** in sandbox v4 path — without it, every `emitLockEvent` call is a silent no-op and the Interruption tab stays empty.
- **DO NOT use `step.run` to wrap engine processing in sandbox** — Inngest is not in the request path. The runner-specific Inngest concern does not apply, but the heartbeat pattern (setInterval + clearInterval in finally) is identical.
- **DO NOT use the same `sandboxSessionId` for `conversationId` AND `sessionId` in `ObservabilityCollector`** without verifying the events route can resolve them — see §2.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed mutex | Don't reinvent — `acquireLock` already shipped | `import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'` | Fencing-token logic + Lua release + Redis SET NX shape already verified end-to-end. |
| Checkpoint helper | Don't write a sandbox-specific check function | `import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'` | The 8 CheckpointId values are spec-locked; observability contract depends on them. |
| Observability event emission | Don't `console.log` your own format | `import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'` | 14-label typed union compile-enforces contract with Interruption tab. |
| HOLDER/FOLLOWER pattern from scratch | Don't design new semantics | Mirror `webhook-handler.ts:338-419` line-by-line (adapted for sync) | Pattern is battle-tested; deviation = bugs. |
| Heartbeat | Don't write `setInterval` manually | `startHeartbeat(handle)` returns a stop fn | Already handles error swallowing + interval lifecycle. |
| Long-poll coordinator | Don't reach for SSE/WebSocket | Plain `setInterval(check, 300)` with 30s max | Bounded latency + zero new infra. Sandbox traffic is 1 user/tab — no scale concern. |
| Sandbox session id generation | Don't generate server-side | `generateSessionId()` already in `src/lib/sandbox/sandbox-session.ts:118` | Client persists it; server receives it from payload. |

**Key insight:** This standalone is fundamentally "wire shipped primitives." 90% of the new LOC is glue + type plumbing. Resist the temptation to "improve" the lock module or refactor while integrating.

---

## Runtime State Inventory

Not applicable — this is a wiring change, not a rename/refactor/migration. No data is moved, no DB column renamed, no env var changed. Continue.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Upstash Redis | Lock + pending list | ✓ | `@upstash/redis@1.38.0` | Fail-open: catch error in acquire path, set lockHandle=null, engine skips all checkpoints (existing behavior verified at `engine-v4.ts:177-206` exception handling). |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` env vars | Redis client | ✓ in dev + prod (per parent HANDOFF.md §Infrastructure state) | — | Same fail-open as above. |
| Supabase | Observability collector writes | ✓ | existing | If collector flush fails, events go to console.log only (existing behavior). |

Nothing missing. Recommended pre-flight check before plan-phase: `node -e "require('@upstash/redis')"` exit 0 (verifies install).

---

## Common Pitfalls

### Pitfall 1: D-02 vs D-15 contradiction (USER CHECKPOINT NEEDED)

**What goes wrong:** DISCUSSION-LOG D-02 says "`channel='sandbox'` como literal nuevo agregado al union `LockChannel`" while D-15 says "No tocar módulo `interruption-system-v2/`." These cannot both be satisfied.

**Why it happens:** Documentation drift between MINIMAL discuss-phase decisions.

**How to avoid:** Escalate to user before plan-phase begins. Recommend **Option C** (use `channel='whatsapp'` + identifier prefix `sandbox-{sandboxSessionId}`). Rationale:
- Option C respects D-15 fully (no module changes).
- Option C respects D-09/D-10 fully (lock keys isolated via prefix).
- Option C requires NO changes to cron whitelist (no `malformed_value` sweeps).
- Cost: minor semantic impurity — `channel='whatsapp'` for a non-WhatsApp test path. Acceptable; lock keys are not surfaced to operators.

**Warning signs:** If user picks D-02 literal, plan-phase must add Plan tasks for module changes — bumps scope from ~3 plans to ~5 plans.

### Pitfall 2: Cron sweeps sandbox locks as orphans (only if D-02 literal chosen)

**What goes wrong:** `v2-lock-cleanup-cron.ts:51-57` rejects unknown channels in `parseLockKey`. If `channel='sandbox'`, the lock key fails parse → swept as `malformed_value` every 5 min via line 186-204.

**Why it happens:** Cron was written assuming `LockChannel = 'whatsapp' | 'facebook' | 'instagram'` permanently.

**How to avoid:** Choose Option C (no cron change). If user insists on D-02 literal, ALSO add a Plan task to extend the cron's allow-list — but D-15 prohibits cron changes, deepening the contradiction.

**Warning signs:** Sandbox lock disappears mid-turn → `lock_orphan_swept_by_cron` events with `reason='malformed_value'` for `lock:{ws}:sandbox:...` keys.

### Pitfall 3: `emitLockEvent` silently no-ops when collector unbound

**What goes wrong:** `emitLockEvent → getCollector()?.recordEvent(...)`. If `runWithCollector` is not invoked, `getCollector()` returns null and the event is only `console.log`'d — Interruption tab stays empty.

**Why it happens:** Sandbox route.ts today (line 30-234) never wraps with `runWithCollector`. The reader/writer routes (`/api/v1/crm-bots/reader/route.ts:193-201`) show the correct pattern.

**How to avoid:** In the new v4 sandbox branch, instantiate `ObservabilityCollector` + wrap engine call with `runWithCollector(collector, () => v4Engine.processMessage(...))`. Pass `agentId='somnio-sales-v4'`, `triggerKind='sandbox'` (verify `triggerKind` accepts this — see CollectorInit type).

**Verification step in plan:** Add unit test `route-v4-lock.test.ts: emitLockEvent path → mockedCollector.recordEvent called with 'pipeline_decision' + 'lock_acquired'`.

### Pitfall 4: Interruption tab cannot resolve sandbox session → events

**What goes wrong:** `/api/observability/events:79-93` resolves `session_id → agent_sessions row → conversation_id → agent_observability_turns rows → events`. Sandbox creates NEITHER `agent_sessions` rows NOR `agent_observability_turns` rows (sandbox is in-memory only).

**Why it happens:** Events route was designed for the production turn flow where `agent_sessions` exists.

**How to avoid:** Three options:
- (a) **Have the collector flush write a real `agent_observability_turns` row** with `conversation_id=sandboxSessionId` (no `agent_sessions` row needed — events route's session-resolution step short-circuits when session_id is absent, and we pass `conversation_id=sandboxSessionId` instead). VERIFY at line 94-95 of events route.
- (b) **Modify the events route** to accept a synthetic `sandbox=true` query param that skips the session→conversation resolution. D-15 spirit (don't touch the route) suggests AVOID.
- (c) **Build a sandbox-specific observability fetcher** that reads from the in-memory collector before flush. Doesn't show post-turn state in a separate component; defeats the tab's purpose.

**Recommend (a):** Pass `conversationId=sandboxSessionId` to `ObservabilityCollector` ctor + verify the flush writes `agent_observability_turns` rows successfully WITHOUT a referenced `agent_sessions` row (the events route at line 94 accepts `conversation_id` directly without joining sessions). The Interruption tab consumes `conversation_id` first (line 156-162 `panel-container.tsx → InterruptionTab`).

**Caveat to verify in plan:** `agent_observability_turns.conversation_id` may be FK to `conversations` table — if so, sandbox would fail insert. Verify by checking migration or attempting a manual insert in dev. The flush call at `src/lib/observability/flush.ts:111-139` does NOT seem to enforce FK at the application layer, so the question is purely "does the DB schema require a real conversation row?"

### Pitfall 5: Lock release races sandbox-result key write

**What goes wrong:** FOLLOWER long-polls `sandbox-result:{id}`. HOLDER must write the result key BEFORE releasing the lock, otherwise:
- HOLDER releases lock → FOLLOWER's next inbound triggers a NEW acquire (becomes HOLDER itself) → never sees the previous HOLDER's result.

**Why it happens:** Order-of-operations bug.

**How to avoid:** In `SomnioV4Engine.processMessage`, write `redis.set('sandbox-result:{id}', JSON.stringify(result), { ex: 60 })` BEFORE the `finally` block executes. Cleanest: write in the try block right before returning; the finally block then releases the lock.

**Warning signs:** UI receives `timeout: true` from long-poll despite HOLDER having processed the FOLLOWER's content.

### Pitfall 6: Multiple browser tabs share localStorage `sandboxSessionId`

**What goes wrong:** D-09 says tabs of same user same workspace should NOT block each other. But `localStorage.getItem(LAST_AGENT_KEY)` and `loadSandboxSessions()` are shared across tabs of same origin. If two tabs of same workspace pick the SAME `sandboxSessionId`, they'd share a lock — not D-09 compliant.

**Why it happens:** localStorage is origin-scoped, not tab-scoped.

**How to avoid:** Each tab generates a fresh in-memory `sandboxSessionId` on mount (via `generateSessionId()`) and does NOT persist it to localStorage for the LOCK semantics. localStorage stays as the **history-save** mechanism for `SavedSandboxSession` (saving conversations for later reload). The id used for the LOCK is a separate runtime-only value. Recommend: store the lock-id in React state (`useState(() => generateSessionId())`) — survives renders within the tab, regenerated on full reload.

**Warning signs:** Two tabs of same workspace see follower behavior when they should be independent.

### Pitfall 7: SandboxV1/V2/V3 paths regressed by accident

**What goes wrong:** A planning/execution slip touches code shared between v4 branch and v1/v2/v3 branches in `route.ts`, breaking Regla 6 byte-identical guarantee.

**Why it happens:** Common factor extraction temptation ("look, both branches do auth check").

**How to avoid:** Plan tasks STRICTLY scope edits to the `if (agentId === 'somnio-sales-v4')` block. Add a Regla 6 verification gate: `git diff` of route.ts must show ZERO line changes outside the v4 branch.

**Verification step in plan:** Plan checker adds `git show <commit> -- src/app/api/sandbox/process/route.ts | grep -v "^[+-]" | wc -l` should match outside-branch context-line count.

---

## Runtime State Inventory

N/A — wiring change, no DB state.

---

## Code Examples

### Example 1: Diff shape for `SomnioV4Engine.processMessage`

```typescript
// File: src/lib/agents/somnio-v4/engine-v4.ts
// Diff against current 208-line file. ~120 LOC added.

// + imports
import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import { releaseLockIfOwner, startHeartbeat, type LockHandle } from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending } from '@/lib/agents/interruption-system-v2/pending'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { LostLockError } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'

// V4EngineInput interface — add 5 OPTIONAL fields
export interface V4EngineInput {
  message: string
  state: SandboxState
  // ... existing fields ...
+ lockHandle?: LockHandle | null
+ lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
+ lockIdentifier?: string | null
+ ownPendingEntryJson?: string | null
+ sandboxSessionId?: string
}

// processMessage — wrap existing body
async processMessage(input: V4EngineInput): Promise<V4EngineOutput> {
  const timestamp = new Date().toISOString()
+ const startMs = Date.now()
+ const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
+   ? { channel: input.lockChannel, identifier: input.lockIdentifier }
+   : null
+ let stopHeartbeat: (() => void) | null = null
+ if (input.lockHandle) stopHeartbeat = startHeartbeat(input.lockHandle)
+ let templatesSentCount = 0
+ let effectiveMessage = input.message
+
+ try {
    try {
+     // CKPT-0 post-acquire (mirror v4-production-runner.ts:122-183)
+     if (input.lockHandle && lockCtx) {
+       const ck0 = await checkpoint('ckpt_0_post_acquire', input.lockHandle, input.workspaceId, lockCtx.channel, lockCtx.identifier)
+       if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
+       if (!ck0.proceed && ck0.interrupted) {
+         const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
+         emitLockEvent('msg_aborted_path_a_combined', { ... })
+         emitLockEvent('pending_list_combined', { ... })
+         effectiveMessage = [...pending.map(p => p.content), input.message].join('\n')
+       }
+     }
+
      const output = await processMessage({
-       message: input.message,
+       message: effectiveMessage,
        // ... rest unchanged ...
+       lockHandle: input.lockHandle ?? null,
+       lockChannel: input.lockChannel ?? null,
+       lockIdentifier: input.lockIdentifier ?? null,
      })

+     // CKPT-6 pre-send-loop (mirror v4-production-runner.ts:444-492)
+     if (input.lockHandle && lockCtx) {
+       const ck6 = await checkpoint('ckpt_6_pre_send_loop', input.lockHandle, input.workspaceId, lockCtx.channel, lockCtx.identifier, { hasSentAnything: false })
+       if (ck6.lostLock) throw new LostLockError('ckpt_6_pre_send_loop')
+       if (!ck6.proceed && ck6.interrupted) {
+         emitLockEvent('msg_aborted_path_a_combined', { ... })
+         return { /* empty result */ } as V4EngineOutput
+       }
+     }
+
+     // CKPT-7.N per-template synthetic (no real send loop in sandbox)
+     const finalMessages: string[] = []
+     for (let i = 0; i < output.messages.length; i++) {
+       if (input.lockHandle && lockCtx) {
+         const ck7 = await checkpoint('ckpt_7_pre_template', input.lockHandle, input.workspaceId, lockCtx.channel, lockCtx.identifier, { templateIndex: i, hasSentAnything: i > 0 })
+         if (ck7.lostLock) throw new LostLockError(`ckpt_7_pre_template_${i}`)
+         if (!ck7.proceed && ck7.interrupted) {
+           emitLockEvent(i === 0 ? 'msg_aborted_path_a_combined' : 'msg_aborted_path_b_solo', { ... })
+           break
+         }
+       }
+       finalMessages.push(output.messages[i])
+     }
+     templatesSentCount = finalMessages.length
+
      const newState: SandboxState = { ... }
      // ... existing mapping ...
      return {
        success: output.success,
-       messages: output.messages,
+       messages: finalMessages,
        newState,
        timerSignal: lastTimerSignal,
        debugTurn: { ... },
      }
    } catch (error) {
+     if (error instanceof LostLockError) {
+       emitLockEvent('zombie_lambda_exit', { my_uuid: input.lockHandle?.holderUuid ?? 'unknown', current_holder_uuid: 'unknown', at_step: error.ckptId })
+       return { success: false, messages: [], newState: input.state, debugTurn: { ... }, error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message } }
+     }
      // ... existing catch ...
    }
+ } finally {
+   if (stopHeartbeat) stopHeartbeat()
+   if (input.lockHandle) {
+     try {
+       const released = await releaseLockIfOwner(input.lockHandle)
+       if (released) emitLockEvent('lock_released_normal', { holder_uuid: input.lockHandle.holderUuid, duration_ms: Date.now() - startMs, templates_sent: templatesSentCount })
+     } catch (releaseError) {
+       emitLockEvent('redis_unavailable_fallback_failed', { error_message: ..., at_step: 'release_lock_in_finally' })
+     }
+   }
+ }
}
```

### Example 2: Route v4 branch diff

Already shown in Pattern 1 above.

### Example 3: Interruption tab wiring diff

```typescript
// File: src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
// Line 84 today:
- return <InterruptionTab conversationId={null} sessionId={null} />
// After:
+ return <InterruptionTab conversationId={props.sandboxSessionId ?? null} sessionId={null} />

// File: src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
// Add useState + thread to DebugPanel:
+ const [sandboxLockSessionId] = useState(() => generateSessionId())  // runtime-only, NOT in localStorage
// ... in fetch body:
  body: JSON.stringify({
    ...,
+   sandboxSessionId: sandboxLockSessionId,
  }),
// ... pass to debug panel:
  <DebugPanel
    ...existingProps
+   sandboxSessionId={sandboxLockSessionId}
  />
```

---

## File Touch List

Estimated total LOC delta: **~330 lines new + ~5 lines edited**. Spread across 6 files.

| File | Action | LOC est. | Description |
|------|--------|---------:|-------------|
| `src/app/api/sandbox/process/route.ts` | EDIT | +85 / -1 | New v4 lock branch (acquire/follower/holder/collector wrap). Replaces line 133-174 v4 if-block. |
| `src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` | NEW | +60 | Long-poll endpoint for FOLLOWER waiting on HOLDER's combined result. |
| `src/lib/agents/somnio-v4/engine-v4.ts` | EDIT | +120 / -2 | Wrap existing processMessage body with lock lifecycle (CKPT-0 + CKPT-6 + CKPT-7 + heartbeat + finally release + LostLockError catch). V4EngineInput +5 OPTIONAL fields. |
| `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` | EDIT | +10 / -0 | useState for sandboxLockSessionId; thread to fetch body + DebugPanel; pass FOLLOWER long-poll trigger. |
| `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` | EDIT | +2 / -1 | Pass `conversationId={props.sandboxSessionId ?? null}` to InterruptionTab (line 84). Add `sandboxSessionId` prop to PanelContainerProps. |
| `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` (or sibling that owns PanelContainer call) | EDIT | +2 / -0 | Thread sandboxLockSessionId prop down to PanelContainer. |
| `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` | NEW | +180 | Unit tests: CKPT-0 happy path, CKPT-6 interrupt → empty result, CKPT-7 per-msg, LostLockError catch, finally always releases, heartbeat starts/stops. ~8 tests. |
| `src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` | NEW | +220 | Unit tests: HOLDER acquires + processes + writes sandbox-result. FOLLOWER returns deferred=true. emitLockEvent path → collector.recordEvent called. Regla 6 anchor: non-v4 agentId leaves route untouched. ~10 tests. |

**Verification grep gates:**
- `grep -c "acquireLock\|releaseLockIfOwner\|startHeartbeat\|checkpoint(" src/lib/agents/somnio-v4/engine-v4.ts` should be **≥7** (1 acquire? no, only via route, but engine has 1 release + 1 heartbeat + 3 checkpoint calls = 5; plus emitLockEvent for 5 events = 5; total 10 — concrete number per implementation).
- `grep -c "agentId === 'somnio-sales-v4'" src/app/api/sandbox/process/route.ts` should be **1** (untouched branch shape).
- `git diff src/app/api/sandbox/process/route.ts | grep -E "^[+-]" | grep -v "===.*'somnio-sales-v4'" | grep -B5 -A0 "agentId === 'somnio-sales-v" | head -20` — verify edits constrained to v4 branch.
- `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/engine-v4.ts src/app/api/sandbox/process/route.ts` should be **0 new matches** outside the existing collector/route ones (Regla 3 wrapper purity — sandbox engine should not introduce new direct Supabase access).

---

## Test Strategy

### Unit tests (vitest)

**`src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts`** (~8 tests):
1. happy path: `lockHandle` present + all CKPTs proceed → returns `messages.length === processMessage.output.messages.length`, emits `lock_released_normal`.
2. CKPT-0 interrupted with pending → combines pending into effectiveMessage; agent receives combined.
3. CKPT-6 interrupted → returns empty messages, no CKPT-7 fires.
4. CKPT-7 interrupted at i=0 → emits `msg_aborted_path_a_combined`, messages=[].
5. CKPT-7 interrupted at i=1 → emits `msg_aborted_path_b_solo`, messages=[first msg].
6. LostLockError at CKPT-0 → emits `zombie_lambda_exit`, returns error.code='V4_ZOMBIE_LAMBDA_EXIT'.
7. lockHandle null (sandbox fail-open) → no checkpoint calls, no emit, behaves like pre-this-standalone.
8. heartbeat starts + stops on success path; stops also on throw path.

**`src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts`** (~10 tests):
1. HOLDER: acquireLock returns handle → routes to engine.
2. FOLLOWER: acquireLock returns null → pushToPending called + interrupt key set + response shape `{ deferred: true, ... }`.
3. HOLDER writes `sandbox-result:{id}` to Redis before returning.
4. emitLockEvent emits through collector when wrapped (mock collector.recordEvent assertions).
5. Regla 6 anchor: `agentId='somnio-sales-v3'` → zero lock calls (mock `acquireLock` should NOT be called).
6. Regla 6 anchor: `agentId='somnio-sales-v2'` → zero lock calls.
7. Regla 6 anchor: `agentId` missing or v1 → zero lock calls.
8. fail-open: acquireLock throws → emits `redis_unavailable_fallback_failed`, falls through to engine with lockHandle=null.
9. sandboxSessionId missing in body → 400 response.
10. workspaceId missing → still proceeds with fallback `'sandbox-workspace'` (existing behavior).

**Long-poll route test** (optional, low priority — endpoint is thin):
- Returns ready=true when key set before timeout.
- Returns ready=false + timeout=true after 30s.
- 401 when unauthed.

### Manual smoke (per D-14)

In `/sandbox` with `agentId='somnio-sales-v4'` selected:

**S1 — Happy path (1 msg, lock+release):**
1. Open `/sandbox`, pick v4 agent.
2. Send msg "hola" → wait response.
3. Open Debug Panel → Interruption tab.
4. Expected: `lock_acquired` event + `lock_released_normal` event in timeline. CKPT events for 1, 2, (3/4/5 if sub-loop), 6, 7.N depending on path taken.

**S2 — Path A combo (msg1 + msg2 fast):**
1. Send msg1 "hola".
2. Within 100ms (before bot finishes), send msg2 "tienes promos?".
3. Expected: Interruption tab shows `lock_acquired` (msg1), `lock_acquire_failed_follower` + `interrupt_written` (msg2), `interrupt_detected_at_ckpt_N` (msg1 at some early CKPT), `msg_aborted_path_a_combined`, `pending_list_combined`, then bot processes the combined "hola\ntienes promos?" and replies once.

**S3 — Path B solo (msg1 + msg2 after 1 template sent):**
1. Send msg1 "hola".
2. After bot sends FIRST template (visible in chat) but BEFORE delay between subsequent templates completes, send msg2 "espera, ya pensé".
3. Expected: `lock_acquired` (msg1), bot sends 1 template, then `interrupt_detected_at_ckpt_N` (msg1 at CKPT-7.1), `msg_aborted_path_b_solo`, FOLLOWER msg2 processed independently as new turn (its own lock_acquired etc.).

### Implementation note about S2/S3 with sync sandbox

The current sandbox UI's queued-message logic at `sandbox-layout.tsx:333-340` and `:401-417` performs an **in-browser** Path A/B simulation. Once we wire the real Redis lock, the in-browser simulation should be **disabled when `agentId === 'somnio-sales-v4'`** to avoid double-handling. Otherwise the client interruption fires its synthetic Path A flow simultaneously with the server's real Path A flow → confusing behavior.

**Recommend:** In `sandbox-layout.tsx:334` change condition from `agentIdRef.current === 'somnio-sales-v3'` to `agentIdRef.current === 'somnio-sales-v3'` (no change for v3) AND make v4 use server-side queue exclusively (no `setQueuedMessages` for v4). Sending a 2nd msg while v4 is processing sends a fresh HTTP request → server lock branch decides FOLLOWER/HOLDER.

---

## State of the Art

Not applicable — this is a wiring task using a primitive shipped two days ago. No external library landscape to survey.

---

## Open Questions resolved

### 1. OQ-1: Sandbox session id source — RESOLVED

**Question:** Does `SandboxSession` emit a persistent sessionId that travels to the route handler?

**Answer:** YES, partially. `src/lib/sandbox/sandbox-session.ts:118-120` exports `generateSessionId()` returning `sandbox-${Date.now()}-${random}` and `SavedSandboxSession.id` (line 266 of `types.ts`) holds it. However, the current `POST /api/sandbox/process` body (line 42-52 of `route.ts`) does NOT include `sandboxSessionId`. The client `sandbox-layout.tsx:363-371` builds the body without it.

**Implication:** Plan must add `sandboxSessionId` to the request payload. UI generates one per-tab on mount (recommend NOT reusing localStorage's `SavedSandboxSession.id` — see Pitfall 6 for rationale; use a separate runtime-only id for locking purposes).

### 2. OQ-2: Observability collector in sandbox — RESOLVED

**Question:** Does the sandbox API currently wrap with `runWithCollector`?

**Answer:** NO. Grep `runWithCollector` in `src/app/api/sandbox/` returns zero matches. The CRM Reader/Writer routes do (`/api/v1/crm-bots/{reader,writer}/route.ts:193-201`); sandbox does not. As a result, `emitLockEvent` calls today would only `console.log` (the `getCollector()` returns null branch in `observability.ts:80-83`).

**Implication:** Plan MUST add `ObservabilityCollector` instantiation + `runWithCollector(collector, () => v4Engine.processMessage(...))` wrap in the v4 sandbox branch. Pattern to clone: `src/app/api/v1/crm-bots/reader/route.ts:193-201`. Pass `conversationId=sandboxSessionId` so the events route (line 94-95) can resolve via `conversation_id` filter directly.

**Sub-question (Pitfall 4):** Will `agent_observability_turns` accept a `conversation_id` that does not exist in the `conversations` table? **Needs verification at plan-phase time** — Plan 01 should include a Wave-0 check: attempt insert with synthetic conversation_id in dev, verify success. If FK constraint exists, Plan needs an additional task (a) generate a real conversation row for sandbox testing OR (b) modify events route to bypass session-resolution for sandbox. Recommend (a) lazily — `INSERT INTO conversations` once per sandbox session in the v4 branch (small cost; reuses real schema; no events-route change).

### 3. OQ-3: FOLLOWER waiting mechanism — RESOLVED (recommendation: long-poll)

**Question:** Is there existing polling/streaming for sandbox responses that we can reuse for D-07?

**Answer:** NO existing mechanism. Sandbox uses straight `fetch().then(json)`. Options:
- (a) **Server-side long-poll** (new endpoint `/api/sandbox/lock-result/[id]/route.ts`) — recommend. ~60 LOC.
- (b) **Client-side polling** — `setInterval(check, 300)` from UI. Slightly more UI changes.
- (c) **Server-Sent Events (SSE)** — `Response` with streaming body. Most modern UX but requires UI refactor.
- (d) **Synthetic "wait for follower content in pending"** — UI sends `msg2`, server pushes to pending + returns deferred=true, UI does nothing and waits for `msg1`'s response (HOLDER) to arrive. The HOLDER's response includes the combined output (since CKPT-0 read+cleared pending). UI then displays HOLDER's response as the combined turn. This is the simplest: zero new endpoints.

**Recommended: Option (d).** Reasoning:
- Zero new endpoints.
- Matches webhook semantics: webhook FOLLOWER never gets a response; the HOLDER's combined output IS the FOLLOWER's response.
- UI just needs to know "msg2's turn was combined into msg1's reply; do not show a separate response for msg2." The existing in-browser Path A simulation already handles this UX (lines 455-475 of sandbox-layout.tsx).

**For (d) to work:** UI receives `{ deferred: true }` from FOLLOWER response and shows "Mensaje encolado, esperando respuesta..." inline. The PREVIOUS request (msg1's HOLDER) is still inflight; when its response arrives, the UI knows that response covers both messages (CKPT-0 combined them server-side). No additional poll required.

**Plan task:** Remove the new long-poll endpoint from File Touch List if user adopts (d). New scope: only `route.ts` + `engine-v4.ts` + sandbox-layout UI tweak (don't show 2nd response loader; rely on the inflight 1st response).

### 4. OQ-4: Existing sandbox v4 tests — RESOLVED

**Question:** Are there tests under `src/app/api/sandbox/process/__tests__/` covering the v4 branch?

**Answer:** NO. Directory `src/app/api/sandbox/process/` contains only `route.ts` — no `__tests__/` subdirectory. Plan must create the directory + first test file (route-v4-lock.test.ts).

### 5. OQ-5: Cron sweep impact on sandbox — RESOLVED

**Question:** Confirm sandbox v4 path does NOT create `agent_sessions` rows; if it does, D-11 changes.

**Answer:** Sandbox path does NOT create rows in `agent_sessions`. The sandbox uses `SandboxAdapters.storage` (in-memory) for v1, but v4 path (`SomnioV4Engine` at `engine-v4.ts`) does NOT have a storage adapter at all — it processes purely in-memory and returns the result. Therefore the cron's session-existence check `agent_sessions.status='active'` will never find a row for a sandbox lock. The cron will sweep sandbox locks as `no_active_session`. With LOCK_TTL_S=45 + sandbox turn typically <30s, this is fine 99% of the time. Edge case: a sandbox turn that exceeds 60s (MAX_TURN_AGE_S) WILL be force-swept while still legitimately running. Acceptable per D-11 option (c).

**Pitfall noted, not blocker:** Sandbox turns exceeding 60s → lock swept by cron → `assertHoldsLock` fails at next checkpoint → LostLockError → `zombie_lambda_exit` event → engine returns error. UX: user sees "[Error v4] zombie lambda — lost lock at ckpt_X." Acceptable for now; if v4 sub-loop latency exceeds 60s in practice, raise MAX_TURN_AGE_S as part of a follow-up.

---

## Open Questions for user before plan-phase

### CHECKPOINT 1: D-02 vs D-15 contradiction

The DISCUSSION-LOG says BOTH:
- D-02: `channel='sandbox'` literal added to `LockChannel` union.
- D-15: Module `interruption-system-v2/` not to be touched.

**Cannot satisfy both.** Decision needed:

- **Option A — Pick D-02 literal:** Modify 4 files in the locked module (`lock.ts`, `pending.ts`, `checkpoints.ts`, plus extending the cron's whitelist). Adds ~5 plan tasks. Cleanest semantics.
- **Option B — Pick D-15 strict:** Use existing `channel='whatsapp'` literal. Either prefix identifier or pick a synthetic workspaceId.
- **Option C (recommended) — Prefix identifier:** `channel='whatsapp'` + `identifier='sandbox-{sandboxSessionId}'`. Zero module changes. Lock keys NEVER collide with prod (no real WhatsApp phone matches `sandbox-...` shape).

**Recommend Option C.** Confirm before plan-phase.

### CHECKPOINT 2: FOLLOWER waiting strategy (OQ-3)

Implicit in D-07 is a mechanism for UI to receive HOLDER's combined response after msg2 went FOLLOWER. Two valid approaches:

- **Option A — Long-poll endpoint** (~60 LOC new): explicit FOLLOWER request → server blocks → returns when HOLDER's result-key appears.
- **Option B (recommended) — In-flight HOLDER's response IS the combo:** FOLLOWER returns `{ deferred: true }` immediately, UI shows queued indicator, UI does NOT make a 2nd fetch — instead it waits for the FIRST request's response (msg1's HOLDER) to arrive, which by then includes the combined output. ~0 new endpoints, ~5 LOC UI tweak.

**Recommend Option B.** Matches webhook semantics; minimal complexity. Confirm before plan-phase.

### CHECKPOINT 3: agent_observability_turns FK constraint (sub-question of OQ-2/Pitfall 4)

Does `agent_observability_turns.conversation_id` have an FK to `conversations(id)`? If yes, sandbox cannot insert turn rows with a synthetic `conversationId=sandboxSessionId`. Resolution options:

- **Option A — Insert a real conversation row** (one per sandbox session, optionally cleaned up later).
- **Option B — Modify events route to accept synthetic IDs** (violates D-15 spirit).
- **Option C — Defer**: Interruption tab shows console.log events only, not DB events; tab feature becomes degraded for sandbox. Acceptable if dev-only.

**Recommend Option A** if FK exists, otherwise no action. Plan Wave 0 = verify FK status (1-line SQL) before proceeding.

---

## Sources

### Primary (HIGH confidence — verified by reading source)

- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md` — 15 D-XX + 5 OQ.
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-interruption-system-v2/HANDOFF.md` — parent state, 14 LockEventLabel mapping, 8 CheckpointId source-of-truth lock.
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-interruption-system-v2/RESEARCH.md` lines 1-590 — Pattern 1 (fencing-token lock), Pattern 2 (HOLDER/FOLLOWER), Pattern 3 (checkpoint helper), Pitfalls 1-7.
- `src/lib/agents/somnio-v4/engine-v4.ts` lines 1-208 — current sandbox engine, target for modification.
- `src/lib/agents/engine/v4-production-runner.ts` lines 71-855 — production runner, mirror source for sandbox.
- `src/app/api/sandbox/process/route.ts` lines 1-234 — current sandbox route, target for v4 branch modification.
- `src/lib/whatsapp/webhook-handler.ts` lines 322-419 — HOLDER/FOLLOWER pattern to mirror.
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` lines 115-156 (CKPT-1) + 326-340 (CKPT-2) — lock fields already plumbed in agent.
- `src/lib/agents/somnio-v4/sub-loop/index.ts` lines 77-121 (ckptInSubLoop helper) + 287-305 (CKPT-3) + 396 (CKPT-4) + 454 (CKPT-5) — sub-loop checkpoints already plumbed.
- `src/lib/agents/somnio-v4/types.ts` lines 142-188 — V4AgentInput with 4 optional lock fields.
- `src/lib/agents/engine/types.ts` lines 87-114 — EngineInput with 4 optional lock fields.
- `src/lib/agents/interruption-system-v2/lock.ts` lines 1-209 — module API (LockChannel = whatsapp/facebook/instagram; LockHandle shape; LOCK_TTL_S/HEARTBEAT_MS).
- `src/lib/agents/interruption-system-v2/checkpoints.ts` lines 1-120 — checkpoint() signature + CheckpointId union.
- `src/lib/agents/interruption-system-v2/observability.ts` lines 1-86 — 14 LockEventLabel union, dual-emission pattern, getCollector silent-no-op.
- `src/lib/agents/interruption-system-v2/pending.ts` lines 1-80 — PendingChannel union + pushToPending/removeOwnEntry/readAndClearPending.
- `src/inngest/functions/v2-lock-cleanup-cron.ts` lines 33-220 — cron parseLockKey whitelist (line 57) + MAX_TURN_AGE_S (line 33) + sweep logic.
- `src/lib/agents/production/webhook-processor.ts` lines 855-919 — V4MessagingAdapter instantiation + V4LockHandle reconstruction (reference for collector wrap pattern).
- `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` lines 1-185 — LostLockError export + CKPT-7 implementation reference.
- `src/lib/sandbox/sandbox-session.ts` lines 1-120 — generateSessionId + SavedSandboxSession persistence.
- `src/lib/sandbox/types.ts` lines 260-275 — SavedSandboxSession + ActiveSandboxSession shapes.
- `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` lines 320-501 — current sandbox UI flow, queuedMessages handling, Path A/B simulation.
- `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx` lines 76-200 — tab fetches `/api/observability/events?session_id&conversation_id`; placeholder when both null.
- `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` line 84 — current `null/null` props to InterruptionTab.
- `src/app/api/observability/events/route.ts` lines 1-132 — events resolution flow: session → conversation → turns. Confirms direct `conversation_id` filter works (line 94-95) when session_id is absent.
- `src/lib/observability/flush.ts` lines 85-150 — agent_observability_turns insert; FK status not visible in code, needs schema verification.
- `src/app/api/v1/crm-bots/reader/route.ts` lines 193-201 — `runWithCollector` reference pattern.

### Secondary (MEDIUM confidence — inference from code)

- Sandbox v4 path does NOT create `agent_sessions` rows: inference from `SomnioV4Engine.processMessage` having no `adapters.storage` parameter; production runner takes adapters but sandbox engine processes purely in-memory.
- localStorage being origin-scoped (Pitfall 6): web platform standard.
- Long-poll vs SSE tradeoff (alternatives section): general web-platform knowledge; either approach works.

### Tertiary (LOW confidence — needs verification at plan-phase)

- Exact FK constraint on `agent_observability_turns.conversation_id` — needs SQL query to confirm. Plan Wave 0.
- Whether `triggerKind` field of `ObservabilityCollectorInit` accepts `'sandbox'` as a valid value — needs grep of `src/lib/observability/types.ts:179` ObservabilityCollectorInit shape. If not, may need adding to union (which is a 1-line addition outside the locked module — acceptable).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all imports already in repo, no new deps.
- Architecture: HIGH for HOLDER/FOLLOWER pattern (mirror exists), MEDIUM for CKPT-7 sandbox synthetic (novel decision), HIGH for engine lifecycle.
- Pitfalls: HIGH — surfaced from real source-code reading.
- D-02 contradiction: MEDIUM — needs user resolution; recommendation Option C has HIGH confidence in feasibility.
- FOLLOWER waiting: MEDIUM — recommended approach (Option B) is simplest but assumes the UI's existing in-flight tracking handles a longer-than-usual response cleanly. Alternative (Option A long-poll) is concrete fallback.

**Research date:** 2026-05-26
**Valid until:** 2026-06-09 (14 days — domain is fast-moving with parent standalone fresh; re-verify if not consumed within 2 weeks)

---

## RESEARCH COMPLETE

**Summary block:**
- Wiring task — 90% glue code over shipped primitives.
- ~330 LOC new + ~15 edited across 6 files (2 NEW, 4 EDIT).
- CKPT-1..5 already in source (skip-guarded); only CKPT-0, CKPT-6, CKPT-7 (synthetic), heartbeat, release need new code in `SomnioV4Engine`.
- HOLDER/FOLLOWER pattern adapts cleanly to sync request/response via Option B (no new endpoint).
- 3 user-checkpoint items surfaced (D-02 contradiction; FOLLOWER waiting strategy; FK constraint on observability turns table) — recommend Option C / Option B / verify-at-Wave-0 respectively.

**Recommended next step:**

1. **User confirms 3 checkpoints** (Option C for channel; Option B for FOLLOWER; defer FK verification to Plan Wave 0).
2. `/gsd:plan-phase debounce-v2-sandbox-integration` produces 2-3 plans:
   - **Plan 01:** Wave 0 — FK verification + `runWithCollector` triggerKind compatibility check. Then edit `route.ts` v4 branch + `engine-v4.ts` lock lifecycle.
   - **Plan 02:** Wire UI (sandbox-layout + panel-container + debug-tabs) + tests (engine + route).
   - **Plan 03 (optional):** Manual smoke S1/S2/S3 + LEARNINGS.md.

Ready for planning.
