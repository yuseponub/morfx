---
phase: standalone-debounce-interruption-system-v2
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/lib/agents/registry-helpers.ts
  - src/lib/whatsapp/webhook-handler.ts
  - src/lib/manychat/webhook-handler.ts
  - src/inngest/functions/agent-production.ts
  - src/inngest/functions/__tests__/agent-production-lock-event.test.ts
autonomous: true
requirements:
  - LOCK-01  # acquire at webhook entry (D-03)
  - LOCK-04  # RPUSH self on holder + follower paths (D-16)
  - LOCK-07  # emit lock_acquired, lock_acquire_failed_follower, interrupt_written, redis_unavailable_fallback_failed

must_haves:
  truths:
    - "A NEW shared module `src/lib/agents/registry-helpers.ts` exports `resolveAgentIdForWorkspace(workspaceId: string): Promise<AgentId>` — extracted verbatim from `src/inngest/functions/agent-production.ts:39` (REVISION B4 — avoids dynamic-import circular-import risk in webhook layer)."
    - "`src/inngest/functions/agent-production.ts` no longer defines `resolveAgentIdForWorkspace` locally — instead `import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'` at the top of the file. Behavior unchanged for v3/godentist/recompra/pw-confirmation callers (Regla 6)."
    - "WhatsApp inbound webhook calls acquireLock immediately after resolving workspaceId; on HOLDER success, RPUSHes its own entry to pending and dispatches Inngest with lockHolderUuid + lockKey + ownPendingEntryJson + lockChannel + lockIdentifier + agentId in event.data (D-03, D-16; REVISION W3 + W2 — channel/identifier/agentId threaded through event.data instead of re-resolved downstream)."
    - "WhatsApp inbound webhook on FOLLOWER (acquireLock returns null) RPUSHes its entry, SETs interrupt key (TTL 60s), returns 200, and does NOT dispatch Inngest (RESEARCH Pattern 2 + Open Question 1)."
    - "ManyChat inbound webhook follows the same HOLDER/FOLLOWER pattern using `external_subscriber_id` as identifier and channel='facebook' or 'instagram' (D-10, D-12). Webhook STATICALLY imports `resolveAgentIdForWorkspace` from `@/lib/agents/registry-helpers` (NO `await import(...)`) per REVISION B4."
    - "If acquireLock throws (Redis unavailable), webhook FAILS-OPEN: dispatches Inngest as if acquire succeeded (with `lockHolderUuid: null` and `lockKey: null` and channel/identifier still populated), emits 'redis_unavailable_fallback_failed' event; accepting residual double-response risk (RESEARCH Open Question 5)."
    - "Inngest event `agent/whatsapp.message_received` schema accepts NEW optional fields: `lockHolderUuid?: string`, `lockKey?: string`, `ownPendingEntryJson?: string`, `lockChannel?: 'whatsapp'|'facebook'|'instagram'`, `lockIdentifier?: string`, `agentId?: AgentId` — backward-compatible (existing v3 callers omit, behave as before; v4 always populates all six)."
    - "Inngest function `whatsapp-agent-processor` reads these fields from event.data and forwards them into the EngineInput passed to the runner — channel/identifier eliminate the need for Plan 04 to query the `conversations` table inside the runner (REVISION W3)."
    - "Inngest concurrency setting `{ key: 'event.data.conversationId', limit: 1 }` UNCHANGED (RESEARCH Inngest section + D-14 confirmed by research recommendation to KEEP, not bump to 10)."
    - "REVISION W6 alignment: if Task 0.4 found FB/IG dedup gap, Plan 03 SUMMARY documents it as forward-looking risk (v4 doesn't serve FB/IG today) — does NOT block this phase."
  artifacts:
    - path: "src/lib/agents/registry-helpers.ts"
      provides: "Shared export `resolveAgentIdForWorkspace(workspaceId): Promise<AgentId>` — single home for routing-resolution logic"
      contains: "resolveAgentIdForWorkspace"
    - path: "src/lib/whatsapp/webhook-handler.ts"
      provides: "Lock acquire/follower path integrated into processIncomingMessage; Inngest event payload extended with 6 lock+routing fields"
      contains: "acquireLock"
    - path: "src/lib/manychat/webhook-handler.ts"
      provides: "Same lock pattern adapted for FB/IG channel; STATIC import of registry-helpers"
      contains: "acquireLock"
    - path: "src/inngest/functions/agent-production.ts"
      provides: "event.data destructuring accepts lockHolderUuid/lockKey/ownPendingEntryJson/lockChannel/lockIdentifier/agentId; resolveAgentIdForWorkspace imported from registry-helpers (no longer defined locally)"
      contains: "lockHolderUuid"
    - path: "src/inngest/functions/__tests__/agent-production-lock-event.test.ts"
      provides: "Unit test asserting the Inngest event accepts (and propagates) the 6 new fields"
      contains: "lockHolderUuid"
  key_links:
    - from: "src/lib/whatsapp/webhook-handler.ts + src/lib/manychat/webhook-handler.ts"
      to: "src/lib/agents/registry-helpers.ts"
      via: "STATIC import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers' (REVISION B4 — no dynamic import)"
      pattern: "from '@/lib/agents/registry-helpers'"
    - from: "src/lib/whatsapp/webhook-handler.ts"
      to: "src/lib/agents/interruption-system-v2/lock.ts + pending.ts + observability.ts"
      via: "import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'"
      pattern: "@/lib/agents/interruption-system-v2"
    - from: "src/inngest/functions/agent-production.ts"
      to: "src/lib/whatsapp/webhook-handler.ts"
      via: "Inngest event payload extended with 6 lock+routing fields, threaded through event.data"
      pattern: "lockHolderUuid"
---

<objective>
Wave 3 — Webhook integration. Modify both inbound webhook handlers (WhatsApp 360dialog + ManyChat for FB/IG) so they acquire the lock immediately after resolving workspaceId (D-03), branch HOLDER vs FOLLOWER per RESEARCH Pattern 2 (lines 351-400), and extend the Inngest event payload with SIX fields downstream plans need (`lockHolderUuid`, `lockKey`, `ownPendingEntryJson`, `lockChannel`, `lockIdentifier`, `agentId`). Plan 04 will consume these in the runner; this plan only PRODUCES them.

REVISION B4: extract `resolveAgentIdForWorkspace` from `agent-production.ts:39` into a NEW shared module `src/lib/agents/registry-helpers.ts` BEFORE the webhook handlers consume it — avoids dynamic-import circular-import risk (webhook → agent-production → Inngest client → webhook utilities). Webhook handlers use STATIC `import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'`.

REVISION W3 + W2: thread `lockChannel` + `lockIdentifier` + `agentId` through event.data so Plan 04's runner does NOT need to introduce `createAdminClient` for a conversations-table lookup AND so the agentId resolved at webhook entry matches exactly what the Inngest function will use (eliminates a race window where routing could change between webhook and Inngest dispatch).

Purpose: this is the most security-critical wave. Getting the webhook entry wrong means either (a) HOLDER never gets the lock and Plans 04+05 are dead-on-arrival, or (b) FOLLOWER over-dispatches Inngest and the cost/correctness math breaks. RESEARCH Open Question 1 is resolved: NO follower dispatch.

Output: 5 changes — new registry-helpers.ts module, both webhook handlers wired with lock + pending push, agent-production.ts event destructuring extended + helper-import refactor, one targeted unit test asserting the event shape.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md
@.planning/standalone/debounce-interruption-system-v2/RESEARCH.md
@.planning/standalone/debounce-interruption-system-v2/01-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/02-SUMMARY.md

<interfaces>
<!-- From Plan 01 + 02 -->
From src/lib/agents/interruption-system-v2/:
```typescript
// lock.ts
export async function acquireLock(workspaceId: string, channel: 'whatsapp' | 'facebook' | 'instagram', identifier: string): Promise<LockHandle | null>
export async function releaseLockIfOwner(handle: LockHandle): Promise<boolean>
export interface LockHandle { key: string; holderUuid: string; startedAt: string }

// pending.ts
export async function pushToPending(workspaceId, channel, identifier, entry: PendingEntry): Promise<{ pendingListLength: number; exactJson: string }>
export interface PendingEntry { entry_uuid: string; content: string; received_at: string; msg_id?: string }

// observability.ts
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void

// redis-client.ts
export const redis: Redis  // for direct interrupt key SET in webhook (RESEARCH line 381)
```

<!-- NEW shared helper (this plan creates it — Task 3.0) -->
From src/lib/agents/registry-helpers.ts (NEW — REVISION B4):
```typescript
import type { AgentId } from '@/lib/agents/registry'
export async function resolveAgentIdForWorkspace(workspaceId: string): Promise<AgentId>
// Behavior: queries workspace_agent_config.conversational_agent_id and normalizes:
//   'somnio-sales-v3' -> 'somnio-v3'
//   'godentist' -> 'godentist'
//   'somnio-recompra' | 'somnio-recompra-v1' -> 'somnio-recompra'
//   anything else -> 'somnio-v2'
// Defensive fallback: returns 'somnio-v2' on any error (matches existing fallback per Regla 6).
```

<!-- Existing webhook handler signature -->
From src/lib/whatsapp/webhook-handler.ts:
```typescript
async function processIncomingMessage(msg: IncomingMessage, value: WebhookValue, workspaceId: string, phoneNumberId: string): Promise<void>
// Dispatches inngest event at line ~314: inngest.send({ name: 'agent/whatsapp.message_received', data: { conversationId, contactId, messageContent, workspaceId, phone, messageId, messageTimestamp, messageType, mediaUrl, mediaMimeType } })
```

<!-- Existing Inngest function (after Task 3.0 helper extraction, the local function definition at line 39 is REMOVED and replaced with import) -->
From src/inngest/functions/agent-production.ts:
```typescript
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'  // REVISION B4 NEW

export const whatsappAgentProcessor = inngest.createFunction(
  { id: 'whatsapp-agent-processor', retries: 2, concurrency: [{ key: 'event.data.conversationId', limit: 1 }] },
  { event: 'agent/whatsapp.message_received' },
  async ({ event, step }) => {
    const { conversationId, contactId, messageContent, workspaceId, phone, messageId, messageTimestamp } = event.data
    // ... 400+ lines of processing; line ~110 calls await resolveAgentIdForWorkspace(workspaceId)
  }
)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 3.0: REVISION B4 — Extract resolveAgentIdForWorkspace into shared registry-helpers.ts (eliminates dynamic-import circular risk)</name>
  <read_first>
    - src/inngest/functions/agent-production.ts lines 35-55 (the existing `async function resolveAgentIdForWorkspace` body, currently NOT exported)
    - src/lib/agents/production/agent-config.ts (the `getWorkspaceAgentConfig` it depends on)
    - src/lib/agents/registry.ts (the `AgentId` type union — must match exactly)
  </read_first>
  <behavior>
    - A new file `src/lib/agents/registry-helpers.ts` exists exporting `resolveAgentIdForWorkspace(workspaceId: string): Promise<AgentId>` with IDENTICAL behavior to the current local function in `agent-production.ts:39`.
    - `src/inngest/functions/agent-production.ts` no longer defines the function locally; instead imports it via `import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'` at the top (NOT dynamic).
    - Existing callers of the local function continue to work without behavior change (the call site at line ~110 referencing `await resolveAgentIdForWorkspace(workspaceId)` resolves to the imported helper).
    - Both webhook handlers (WhatsApp + ManyChat) can now `import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'` STATICALLY without circular-import issues.
  </behavior>
  <action>
    1. Create `src/lib/agents/registry-helpers.ts`:
       ```ts
       /**
        * Shared helpers around the agent registry.
        *
        * Standalone: debounce-interruption-system-v2 / Plan 03 / REVISION B4.
        * Extracted from src/inngest/functions/agent-production.ts so webhook
        * handlers (whatsapp + manychat) can STATIC-import without pulling in
        * the entire Inngest functions tree (circular-import risk).
        */

       import type { AgentId } from '@/lib/agents/registry'

       /**
        * Resolve which agent module should handle a workspace's traffic.
        *
        * Returns the canonical AgentId expected by the runner / collector /
        * observability layers. Defaults to 'somnio-v2' on any error so the
        * wrapper never throws (Regla 6).
        */
       export async function resolveAgentIdForWorkspace(workspaceId: string): Promise<AgentId> {
         try {
           const { getWorkspaceAgentConfig } = await import('@/lib/agents/production/agent-config')
           const config = await getWorkspaceAgentConfig(workspaceId)
           const id = config?.conversational_agent_id ?? 'somnio-sales-v1'
           if (id === 'somnio-sales-v3') return 'somnio-v3'
           if (id === 'godentist') return 'godentist'
           if (id === 'somnio-recompra' || id === 'somnio-recompra-v1') return 'somnio-recompra'
           // somnio-sales-v4 normalization (REVISION B4 — webhooks need to detect v4 path):
           // Decide AT IMPLEMENTATION TIME whether the runner's existing routing returns
           // 'somnio-sales-v4' verbatim or a normalized bucket. If the existing local function
           // dropped v4 into 'somnio-v2', preserve that mapping here AND add a separate
           // exported helper `isV4Workspace(workspaceId)` that the webhook can use.
           // Otherwise return 'somnio-sales-v4' as its own bucket.
           return 'somnio-v2'
         } catch {
           return 'somnio-v2'
         }
       }
       ```

    2. Open `src/inngest/functions/agent-production.ts`. At line ~39 DELETE the local `async function resolveAgentIdForWorkspace` definition. Add an import at the top of the file:
       ```ts
       import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'
       ```
       The existing call sites (line ~110 inside the Inngest function body) remain unchanged — they now resolve to the imported helper.

    3. **CRITICAL — v4 detection for webhook gating:** the webhook needs to know whether the workspace will route to `somnio-sales-v4`. The current `resolveAgentIdForWorkspace` doesn't return `'somnio-sales-v4'` as its own bucket; it normalizes unknown values to `'somnio-v2'`. Two options:
       (a) Extend `resolveAgentIdForWorkspace` to ALSO recognize `'somnio-sales-v4'` from `config.conversational_agent_id` and return it verbatim. (PREFERRED — single source of truth.)
       (b) Add a SEPARATE helper `export async function isV4Workspace(workspaceId: string): Promise<boolean>` that reads `getWorkspaceAgentConfig` and returns `config?.conversational_agent_id === 'somnio-sales-v4'`.

       **Use (a) by default.** Update the helper:
       ```ts
       if (id === 'somnio-sales-v4') return 'somnio-sales-v4' as AgentId
       ```
       If `AgentId` union doesn't include `'somnio-sales-v4'`, ADD it to the union in `src/lib/agents/registry.ts` (verify with grep first: `grep -n "type AgentId\|export type AgentId" src/lib/agents/registry.ts`). This is a 1-line type extension; backward-compatible.

    4. Verify NO non-comment match for `await import(.*agent-production.*resolveAgentIdForWorkspace)` anywhere in the codebase after this extraction. Specifically: `grep -rn "await import" src/lib/whatsapp/webhook-handler.ts src/lib/manychat/webhook-handler.ts | grep -i "agent-production\|registry-helpers"` returns 0 — webhooks use STATIC imports only.
  </action>
  <verify>
    <automated>test -f src/lib/agents/registry-helpers.ts && grep -c "export.*resolveAgentIdForWorkspace" src/lib/agents/registry-helpers.ts && grep -c "import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'" src/inngest/functions/agent-production.ts && grep -cE "^async function resolveAgentIdForWorkspace" src/inngest/functions/agent-production.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "src/lib/agents/registry-helpers|src/inngest/functions/agent-production"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/registry-helpers.ts` succeeds.
    - `grep -c "export.*resolveAgentIdForWorkspace" src/lib/agents/registry-helpers.ts` == 1.
    - `grep -c "import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'" src/inngest/functions/agent-production.ts` >= 1.
    - `grep -cE "^async function resolveAgentIdForWorkspace" src/inngest/functions/agent-production.ts` == 0 (local definition removed).
    - `grep -c "'somnio-sales-v4'" src/lib/agents/registry-helpers.ts` >= 1 (v4 detection added).
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors in registry-helpers.ts or agent-production.ts.
  </acceptance_criteria>
  <done>Shared helper module exists; webhook handlers can now STATIC-import; agent-production.ts simplified.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3.1: Integrate lock acquire + holder/follower paths into WhatsApp webhook-handler.ts (D-03 + D-10 + D-16 + RESEARCH Pattern 2)</name>
  <read_first>
    - src/lib/whatsapp/webhook-handler.ts (full file — lines 1-348; specifically lines 151-345 processIncomingMessage where Inngest dispatch happens at line 314)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 351-400 (Pattern 2 — Follower with Polling: NO follower dispatch)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 1015-1024 (Open Question 1 — resolved: NO follower dispatch)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-03 webhook entry timing T≈35-65ms; D-10 lock key shape; D-16 RPUSH self ALWAYS + LREM-self after first send)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 569-577 (Pitfall 6 — cold-start by-design)
    - 03 Task 3.0 (above) — registry-helpers.ts now exists with `resolveAgentIdForWorkspace`
  </read_first>
  <behavior>
    - When `acquireLock(workspaceId, 'whatsapp', phone)` returns a LockHandle, the existing Inngest dispatch path runs UNCHANGED except event.data is extended with `lockHolderUuid`, `lockKey`, `ownPendingEntryJson`, `lockChannel`, `lockIdentifier`, `agentId` (6 new fields). The holder ALSO RPUSHes its own entry to pending BEFORE the dispatch (D-16 — self-included so cascade scenarios are correctly resolved).
    - When `acquireLock` returns null, the follower path runs: RPUSH its entry to pending, SET `interrupt:<wsId>:whatsapp:<phone>` to msg.id with `ex: 60`, emit `lock_acquire_failed_follower` event, return without dispatching Inngest (Pattern 2 line 354-361).
    - When `acquireLock` THROWS (Redis 5xx / network), fail-open: emit `redis_unavailable_fallback_failed`, dispatch Inngest with `lockHolderUuid: null` + `lockKey: null` + `ownPendingEntryJson: null` (downstream runner detects nulls and skips checkpoints — accepts residual double-response risk per Open Question 5). channel/identifier/agentId STILL populated on fail-open.
    - REVISION B4: webhook uses STATIC `import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'` (no `await import(...)` anywhere in this file's lock-integration code).
  </behavior>
  <action>
    1. Open `src/lib/whatsapp/webhook-handler.ts`. The function `processIncomingMessage` (currently lines 151-345 — re-check current line numbers as the file may have shifted since RESEARCH; use `grep -n "processIncomingMessage\|inngest.send\|workspaceId" src/lib/whatsapp/webhook-handler.ts` to map). The current Inngest dispatch is at line ~314.

    2. Add the new imports at the top of the file (ALL STATIC per REVISION B4):
       ```ts
       import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
       import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'
       import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'
       import { randomUUID } from 'crypto'
       ```

       **CRITICAL — no `await import(...)` for these.** All 6 imports are TOP-LEVEL STATIC. This is the explicit REVISION B4 fix.

    3. Inside `processIncomingMessage`, locate the section where `messageTimestamp`, `normalizedContent`, `phone`, `workspaceId`, `conversationId`, `contactId`, `msg.id` are all available AND the Inngest dispatch hasn't happened yet. This is right BEFORE the existing `if (AGENT_PROCESSABLE_TYPES.has(msg.type))` block (around line 297).

    4. Insert the HOLDER/FOLLOWER branch BEFORE the existing dispatch logic, per RESEARCH Pattern 2 (lines 368-399) verbatim with the v4-only guard:

       **CRITICAL:** Per D-04 + D-08 this lock logic must apply ONLY when the message will be routed to v4 (`somnio-sales-v4`). For other agents (v3, godentist, recompra, pw-confirmation), the lock acquire is a no-op so we preserve Phase 31 behavior unchanged.

       **How to gate on v4:** STATIC-import `resolveAgentIdForWorkspace` (already imported at top of file per step 2). Call it at webhook entry to peek the routing. If the resolved agent is NOT `somnio-sales-v4`, SKIP the lock acquire entirely and let the existing flow continue (preserving Regla 6).

       **Sketch (REVISION W3 + W2 — note channel/identifier/agentId threaded into event.data):**
       ```ts
       const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
       const v4Path = resolvedAgentId === 'somnio-sales-v4'

       let lockHandle: { key: string; holderUuid: string; startedAt: string } | null = null
       let ownPendingEntryJson: string | null = null

       // REVISION W3 + W2: channel + identifier resolved here ONCE; threaded into event.data
       // so Plan 04 runner does NOT need a conversations-table lookup.
       const lockChannel: 'whatsapp' = 'whatsapp'
       const lockIdentifier = phone

       if (v4Path && AGENT_PROCESSABLE_TYPES.has(msg.type)) {
         try {
           lockHandle = await acquireLock(workspaceId, lockChannel, lockIdentifier)
           const entryUuid = randomUUID()
           const pendingEntry = {
             entry_uuid: entryUuid,
             content: normalizedContent,
             received_at: new Date().toISOString(),
             msg_id: msg.id,
           }

           if (!lockHandle) {
             // FOLLOWER PATH (D-03 second arm + RESEARCH Pattern 2)
             const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
             await redis.set(`interrupt:${workspaceId}:${lockChannel}:${lockIdentifier}`, msg.id, { ex: 60 })
             emitLockEvent('lock_acquire_failed_follower', {
               existing_holder_uuid: 'unknown', // we don't read lock value here — too racy
               my_msg_id: msg.id,
               key: `lock:${workspaceId}:${lockChannel}:${lockIdentifier}`,
             })
             emitLockEvent('interrupt_written', {
               msg_id: msg.id,
               pending_list_length: push.pendingListLength,
             })
             return  // 200 OK to webhook caller — NO Inngest dispatch (Pattern 2)
           }

           // HOLDER PATH (D-16 — RPUSH self ALWAYS)
           const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
           ownPendingEntryJson = push.exactJson
           emitLockEvent('lock_acquired', {
             holder_uuid: lockHandle.holderUuid,
             msg_id: msg.id,
             key: lockHandle.key,
             ttl: 45, // or LOCK_TTL_S — import constant
             started_at: lockHandle.startedAt,
           })
         } catch (lockErr) {
           // Fail-open per RESEARCH Open Question 5
           emitLockEvent('redis_unavailable_fallback_failed', {
             error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
           })
           lockHandle = null
           ownPendingEntryJson = null
         }
       }
       ```

       Place this BEFORE the existing `if (AGENT_PROCESSABLE_TYPES.has(msg.type))` block. The follower path's `return` exits early — bypassing the existing Inngest dispatch.

    5. Inside the existing `inngest.send({ name: 'agent/whatsapp.message_received', data: { ... } })` block (around line 314), extend `data` with the SIX new fields (REVISION W3 + W2):
       ```ts
       data: {
         ...existing fields,
         lockHolderUuid: lockHandle?.holderUuid ?? null,
         lockKey: lockHandle?.key ?? null,
         ownPendingEntryJson,  // null if fail-open path
         lockChannel,           // REVISION W3 — always 'whatsapp' here
         lockIdentifier,        // REVISION W3 — phone
         agentId: resolvedAgentId,  // REVISION W2 — pass resolved agentId to eliminate race
       }
       ```

    6. Note `processAgentInline` (line 334 + 340) is the inline-fallback path. It also runs the agent. For v4 path it should also receive lockHandle. Inspect — if `processAgentInline` does NOT call the V4ProductionRunner (only v3-runner), it's safe to NOT pass lockHandle to it (v3 doesn't consume the lock). Document inline that v4 path requires `USE_INNGEST_PROCESSING=true` (which is already the convention). Add a `console.warn` if v4Path + !useInngest: "v4 path requires Inngest dispatch — lock infrastructure inactive in inline mode."
  </action>
  <verify>
    <automated>grep -c "acquireLock\|pushToPending" src/lib/whatsapp/webhook-handler.ts && grep -c "lockHolderUuid\|lockChannel\|lockIdentifier\|agentId" src/lib/whatsapp/webhook-handler.ts && grep -c "lock_acquire_failed_follower\|lock_acquired\|interrupt_written\|redis_unavailable_fallback_failed" src/lib/whatsapp/webhook-handler.ts && grep -cE "import \{ resolveAgentIdForWorkspace \} from '@/lib/agents/registry-helpers'" src/lib/whatsapp/webhook-handler.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/whatsapp/webhook-handler" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "acquireLock" src/lib/whatsapp/webhook-handler.ts` ≥ 1.
    - `grep -c "pushToPending" src/lib/whatsapp/webhook-handler.ts` ≥ 1.
    - `grep -c "lockHolderUuid" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (event.data extension).
    - `grep -c "lockKey" src/lib/whatsapp/webhook-handler.ts` ≥ 1.
    - `grep -c "ownPendingEntryJson" src/lib/whatsapp/webhook-handler.ts` ≥ 1.
    - `grep -c "lockChannel" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (REVISION W3).
    - `grep -c "lockIdentifier" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (REVISION W3).
    - `grep -c "agentId: resolvedAgentId" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (REVISION W2 — race elimination).
    - `grep -c "lock_acquire_failed_follower" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (follower event emitted).
    - `grep -c "lock_acquired" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (holder event emitted).
    - `grep -c "interrupt_written" src/lib/whatsapp/webhook-handler.ts` ≥ 1.
    - `grep -c "redis_unavailable_fallback_failed" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (fail-open event).
    - `grep -c "somnio-sales-v4" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (v4 gating per D-04 + Regla 6).
    - `grep -cE "import \{ resolveAgentIdForWorkspace \} from '@/lib/agents/registry-helpers'" src/lib/whatsapp/webhook-handler.ts` == 1 (REVISION B4 — STATIC import).
    - `grep -c "await import" src/lib/whatsapp/webhook-handler.ts` does NOT increase relative to baseline (no NEW dynamic imports for lock code).
    - `grep -c "redis.set(\`interrupt:" src/lib/whatsapp/webhook-handler.ts` ≥ 1 (follower writes interrupt key per Pattern 2).
    - The follower path does NOT call `inngest.send` — verified by: confirm only ONE `inngest.send` call in the file by `grep -c "inngest.send" src/lib/whatsapp/webhook-handler.ts` ≤ 2 (the existing call + maybe the safety-net fallback — no NEW follower dispatch).
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors in `src/lib/whatsapp/webhook-handler.ts`.
  </acceptance_criteria>
  <done>WhatsApp webhook acquires lock + branches HOLDER/FOLLOWER + extends Inngest event with 6 lock+routing fields; v4-gated for Regla 6; STATIC import per REVISION B4.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3.2: Integrate same pattern into ManyChat webhook-handler.ts for FB/IG (D-12 + D-10) + REVISION W6 forward-looking FB/IG dedup stance</name>
  <read_first>
    - src/lib/manychat/webhook-handler.ts (full file — find processIncomingMessage equivalent for ManyChat payload shape)
    - src/app/api/webhooks/manychat/route.ts (lines 1-80 — how workspace is resolved and handler invoked)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-10 identifier = external_subscriber_id for FB/IG; D-12 system lives in webhook layer to cover all channels)
    - 00-MEASUREMENTS.md (FB/IG dedup verdict from Task 0.4 — REVISION W6: gap is ACCEPTED forward-looking risk, not blocker)
  </read_first>
  <behavior>
    - ManyChat webhook applies same HOLDER/FOLLOWER pattern using:
      - `channel = 'facebook' | 'instagram'` (determined from the ManyChat payload `data.channel` or `subscriber.channel` field — inspect the actual payload shape).
      - `identifier = external_subscriber_id` (per D-10).
    - **REVISION W6 stance:** Per Task 0.4 audit, if FB/IG dedup constraint is missing, document and accept residual risk (v4 doesn't currently serve FB/IG anyway per Memory; this is forward-looking integration per D-12). Do NOT block this phase on FB/IG dedup gap. Document in 03-SUMMARY.md as a follow-up for when v4 actually serves FB/IG traffic.
    - Per Task 3.1 reasoning: only acquire the lock when the resolved agent for the workspace is `somnio-sales-v4`. For godentist-fb-ig (currently inactive — see CLAUDE.md scope), the lock acquire is skipped.
    - REVISION B4: STATIC `import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'` (NO dynamic import).
  </behavior>
  <action>
    1. Open `src/lib/manychat/webhook-handler.ts`. Find the function equivalent to `processIncomingMessage` (the function that dispatches the Inngest event). Use `grep -n "inngest.send\|workspaceId\|external_subscriber_id" src/lib/manychat/webhook-handler.ts` to locate. The dispatch likely uses event name `agent/whatsapp.message_received` (shared event since channel is in conversation row) or a separate `agent/manychat.message_received`. Inspect and follow whichever convention exists.

    2. Add STATIC imports at the top of the file (REVISION B4):
       ```ts
       import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
       import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'
       import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'
       import { randomUUID } from 'crypto'
       ```

    3. Determine the `channel` value from the ManyChat payload. ManyChat exposes `subscriber.last_input_text` (the message) and a subscriber object that includes the originating page. The conversation row in our DB has `channel: 'facebook' | 'instagram'`. If the handler already queries the conversation, use `conv.channel` directly. Otherwise, infer from payload.

    4. Apply the same HOLDER/FOLLOWER pattern as Task 3.1, with the SIX event.data fields (REVISION W3 + W2):
       - `channel` = `conv.channel as 'facebook' | 'instagram'`.
       - `identifier` = `conv.external_subscriber_id` (the ManyChat subscriber id) — per D-10.
       - Same v4-gating check (`resolveAgentIdForWorkspace(workspaceId) === 'somnio-sales-v4'`).
       - Same 6 new event.data fields appended to the Inngest dispatch:
         ```ts
         lockHolderUuid: lockHandle?.holderUuid ?? null,
         lockKey: lockHandle?.key ?? null,
         ownPendingEntryJson,
         lockChannel: conv.channel as 'facebook' | 'instagram',
         lockIdentifier: conv.external_subscriber_id,
         agentId: resolvedAgentId,
         ```

    5. If the ManyChat dispatch sends a DIFFERENT event name (e.g., `agent/manychat.message_received`), Plan 04 will also need to extend that event's handler. Document in `03-SUMMARY.md` whether the events are shared or split — Plan 04 reads this.

    6. **Test sanity** — confirm by reading the file that there is exactly ONE `inngest.send` call in the path (not many). If multiple, each is gated by the same v4 check and each gets the same 6 event.data fields.

    7. **REVISION W6 documentation:** In `03-SUMMARY.md` (created at end of execution), add an explicit section "FB/IG dedup residual risk (REVISION W6)" stating: "Plan 00 Task 0.4 audit recorded `<verdict>`. v4 currently serves WhatsApp ONLY. FB/IG dedup gap (if any) is accepted as forward-looking risk per REVISION W6. Migration path: when v4 begins serving FB/IG traffic (a future standalone), revisit and add the dedup constraint via Regla 5 migration."
  </action>
  <verify>
    <automated>grep -c "acquireLock\|pushToPending" src/lib/manychat/webhook-handler.ts && grep -c "lockHolderUuid\|lockChannel\|lockIdentifier" src/lib/manychat/webhook-handler.ts && grep -c "external_subscriber_id" src/lib/manychat/webhook-handler.ts && grep -cE "import \{ resolveAgentIdForWorkspace \} from '@/lib/agents/registry-helpers'" src/lib/manychat/webhook-handler.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "acquireLock" src/lib/manychat/webhook-handler.ts` ≥ 1.
    - `grep -c "external_subscriber_id" src/lib/manychat/webhook-handler.ts` ≥ 1 (D-10 identifier).
    - `grep -c "lockHolderUuid" src/lib/manychat/webhook-handler.ts` ≥ 1.
    - `grep -c "lockChannel" src/lib/manychat/webhook-handler.ts` ≥ 1 (REVISION W3).
    - `grep -c "lockIdentifier" src/lib/manychat/webhook-handler.ts` ≥ 1 (REVISION W3).
    - `grep -c "agentId: resolvedAgentId" src/lib/manychat/webhook-handler.ts` ≥ 1 (REVISION W2).
    - `grep -c "facebook\|instagram" src/lib/manychat/webhook-handler.ts` ≥ 1 (channel arg passed correctly).
    - `grep -c "somnio-sales-v4" src/lib/manychat/webhook-handler.ts` ≥ 1 (v4 gating).
    - `grep -cE "import \{ resolveAgentIdForWorkspace \} from '@/lib/agents/registry-helpers'" src/lib/manychat/webhook-handler.ts` == 1 (REVISION B4 STATIC).
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors in `src/lib/manychat/webhook-handler.ts`.
  </acceptance_criteria>
  <done>ManyChat webhook wired with same lock pattern, v4-gated, STATIC imports per REVISION B4, ready for future v4-on-FB/IG; FB/IG dedup gap accepted as forward-looking per REVISION W6.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3.3: Extend agent-production.ts event destructuring + add unit test (D-14: KEEP concurrency limit=1)</name>
  <read_first>
    - src/inngest/functions/agent-production.ts (lines 71-91 — function definition + event destructuring at line 85)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-14 — Inngest stays; concurrency setting elimination/raise considered)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 918-929 (Inngest Concurrency Decision — KEEP limit=1, do NOT raise to 10 or remove)
  </read_first>
  <behavior>
    - `event.data` destructuring accepts the 6 new fields (lockHolderUuid, lockKey, ownPendingEntryJson, lockChannel, lockIdentifier, agentId) without breaking when callers omit them (e.g., v3 callers, sandbox event injection).
    - The function logs them in the `turn_started` collector event so observability can correlate webhook lock acquisition with the Inngest function execution.
    - Concurrency setting `{ key: 'event.data.conversationId', limit: 1 }` UNCHANGED (RESEARCH line 920 — research recommends KEEP; D-14 ambiguity resolved).
    - Plan 04 (next wave) reads these fields and threads them into V4ProductionRunner. THIS plan only ensures the fields are present and propagated — no consumption logic yet.
    - REVISION W2 race elimination: when both `agentId` (from event.data) and the locally-resolved `await resolveAgentIdForWorkspace(workspaceId)` agree, use the event.data one (it's the SAME agent the webhook gated the lock on). When they disagree (rare — routing changed between webhook and Inngest dispatch), emit a `pipeline_decision:agent_id_mismatch_webhook_vs_inngest` warning event and use the event.data value (Regla 6 — preserve the webhook's intent).
  </behavior>
  <action>
    1. Open `src/inngest/functions/agent-production.ts`. At line ~85 the destructuring:
       ```ts
       const { conversationId, contactId, messageContent, workspaceId, phone, messageId, messageTimestamp } = event.data
       ```

       Extend to:
       ```ts
       const {
         conversationId,
         contactId,
         messageContent,
         workspaceId,
         phone,
         messageId,
         messageTimestamp,
         // Standalone: debounce-interruption-system-v2 (D-03 + D-14)
         // Optional — populated by webhook for v4 path only. v3 callers omit (undefined).
         lockHolderUuid,
         lockKey,
         ownPendingEntryJson,
         // REVISION W3 + W2: channel/identifier/agentId threaded via webhook so runner doesn't need DB query
         lockChannel,
         lockIdentifier,
         agentId: agentIdFromWebhook,  // alias — local resolve below still runs for v3 path
       } = event.data as typeof event.data & {
         lockHolderUuid?: string | null
         lockKey?: string | null
         ownPendingEntryJson?: string | null
         lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
         lockIdentifier?: string | null
         agentId?: AgentId | null
       }
       ```

    2. At the existing call site for `resolveAgentIdForWorkspace(workspaceId)` (line ~110, used to build the collector), preserve it as fallback but PREFER `agentIdFromWebhook` when present (REVISION W2):
       ```ts
       const agentId = agentIdFromWebhook ?? await resolveAgentIdForWorkspace(workspaceId)
       // REVISION W2: emit warning if webhook + local-resolve disagree
       if (agentIdFromWebhook) {
         const localAgentId = await resolveAgentIdForWorkspace(workspaceId)
         if (localAgentId !== agentIdFromWebhook) {
           // routing changed between webhook and Inngest dispatch — extremely rare
           // honor webhook's choice (it gated the lock); emit warning for ops
           // Use existing collector or logger.warn — keep payload minimal.
           logger.warn({
             agentIdFromWebhook,
             localAgentId,
             conversationId,
             workspaceId,
           }, '[interruption-v2] agent_id_mismatch_webhook_vs_inngest — using webhook value')
         }
       }
       ```

    3. Add to the `turn_started` recordEvent call (around line 119-124) the new fields:
       ```ts
       collector?.recordEvent('session_lifecycle', 'turn_started', {
         action: 'turn_started',
         conversationId,
         messageId,
         messageType: event.data.messageType ?? 'text',
         // debounce-interruption-system-v2 correlation:
         lockHolderUuid: lockHolderUuid ?? null,
         lockKey: lockKey ?? null,
         lockChannel: lockChannel ?? null,
         lockIdentifier: lockIdentifier ?? null,
         hasOwnPendingEntry: !!ownPendingEntryJson,
         agentIdSource: agentIdFromWebhook ? 'webhook' : 'inngest_local_resolve',
       })
       ```

    4. **DO NOT change** the `concurrency: [{ key: 'event.data.conversationId', limit: 1 }]` setting. Add a code comment above the concurrency block citing RESEARCH lines 918-929: "// D-14 + RESEARCH Inngest section: KEEP limit=1 — Inngest's concurrency is strict per docs; this is belt-and-suspenders to the Redis SET NX in interruption-system-v2. Do NOT raise to 10 or remove."

    5. The runner invocation (somewhere downstream — likely in a `step.run` or inline call to `processV4OrV3`) receives these fields. **Plan 04 wires them into the runner constructor.** For now, pass them through by extending whichever object is the engine input. If the codebase already has a `EngineInput` object built here, append:
       ```ts
       lockHandle: lockHolderUuid && lockKey
         ? { key: lockKey, holderUuid: lockHolderUuid, startedAt: new Date().toISOString() }
         : null,
       ownPendingEntryJson: ownPendingEntryJson ?? null,
       lockChannel: lockChannel ?? null,
       lockIdentifier: lockIdentifier ?? null,
       ```
       Plan 04 will type-check this when it extends `EngineInput`.

    6. Create `src/inngest/functions/__tests__/agent-production-lock-event.test.ts`:
       - Mock Inngest function execution by calling the `whatsappAgentProcessor.fn` (the inner handler) directly with a fabricated event.
       - Assert that when event.data includes `lockHolderUuid: 'u-1'`, `lockKey: 'lock:ws:whatsapp:+57...'`, `ownPendingEntryJson: '{"...}'`, `lockChannel: 'whatsapp'`, `lockIdentifier: '+57...'`, `agentId: 'somnio-sales-v4'`, the destructuring runs without throwing and the `turn_started` recordEvent payload includes those fields.
       - Assert that when event.data OMITS those fields (v3 caller), destructuring still works (no throw) and recordEvent payload includes `lockHolderUuid: null`, etc. + `agentIdSource: 'inngest_local_resolve'`.
       - REVISION W2: add a test that when `agentIdFromWebhook='somnio-sales-v4'` but local resolve returns `'somnio-v2'` (mismatch), the warning logger fires (use `vi.spyOn(logger, 'warn')`).
  </action>
  <verify>
    <automated>grep -c "lockHolderUuid" src/inngest/functions/agent-production.ts && grep -c "lockChannel\|lockIdentifier" src/inngest/functions/agent-production.ts && grep -c "agentIdFromWebhook" src/inngest/functions/agent-production.ts && grep -c "key: 'event.data.conversationId'" src/inngest/functions/agent-production.ts && grep -c "limit: 1" src/inngest/functions/agent-production.ts && npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "lockHolderUuid" src/inngest/functions/agent-production.ts` ≥ 2 (destructuring + observability payload).
    - `grep -c "lockKey" src/inngest/functions/agent-production.ts` ≥ 1.
    - `grep -c "ownPendingEntryJson" src/inngest/functions/agent-production.ts` ≥ 1.
    - `grep -c "lockChannel" src/inngest/functions/agent-production.ts` ≥ 2 (destructuring + recordEvent).
    - `grep -c "lockIdentifier" src/inngest/functions/agent-production.ts` ≥ 2.
    - `grep -c "agentIdFromWebhook" src/inngest/functions/agent-production.ts` ≥ 2 (destructuring alias + REVISION W2 mismatch check).
    - `grep -c "limit: 1" src/inngest/functions/agent-production.ts` ≥ 1 (concurrency UNCHANGED — D-14 + RESEARCH).
    - `grep -c "D-14\|RESEARCH" src/inngest/functions/agent-production.ts` ≥ 1 (comment cited).
    - `grep -c "agent_id_mismatch_webhook_vs_inngest" src/inngest/functions/agent-production.ts` ≥ 1 (REVISION W2 warning).
    - `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` exits 0.
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors in `src/inngest/functions/agent-production.ts`.
  </acceptance_criteria>
  <done>Inngest event extended with 6 new fields; concurrency setting documented as KEPT; REVISION W2 mismatch warning + test asserts shape.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for all 5 modified files (registry-helpers.ts NEW + agent-production.ts + 2 webhook handlers + 1 test file).
2. `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` exits 0.
3. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` still exits 0 (Wave 1+2 regression check).
4. WhatsApp webhook follower path has zero `inngest.send` calls (verified by hand-reading the diff).
5. Inngest concurrency limit=1 preserved.
6. REVISION B4: `grep -c "await import" .planning/standalone/debounce-interruption-system-v2/03-PLAN.md` == 0 (no dynamic imports planned).
7. REVISION B4: `grep -c "export.*resolveAgentIdForWorkspace" src/lib/agents/registry-helpers.ts` == 1.
8. REVISION W3: `grep -c "createAdminClient" .planning/standalone/debounce-interruption-system-v2/04-PLAN.md` == 0 (Plan 04 no longer needs it because Plan 03 threads channel/identifier).
</verification>

<success_criteria>
- Both webhook handlers (WhatsApp + ManyChat) integrate lock acquire with HOLDER/FOLLOWER branches.
- New shared `src/lib/agents/registry-helpers.ts` module exists (REVISION B4 — extracted from agent-production.ts:39).
- Inngest event payload carries 6 new fields: lockHolderUuid/lockKey/ownPendingEntryJson + lockChannel/lockIdentifier/agentId (REVISION W3 + W2).
- v4 gating ensures Phase 31 paths (v3/godentist/recompra/pw-confirmation) are untouched (Regla 6).
- Fail-open behavior documented + emitted on Redis errors.
- FB/IG dedup gap accepted as forward-looking risk per REVISION W6.
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/03-SUMMARY.md` documenting: which event name was used for ManyChat (shared or separate from WhatsApp), the exact agent-production.ts destructuring shape, confirmation that `resolveAgentIdForWorkspace` now lives in `src/lib/agents/registry-helpers.ts` (REVISION B4), the 6 lock+routing fields shape, FB/IG dedup verdict from Task 0.4 (REVISION W6 forward-looking risk), and confirmation that all imports are STATIC (no `await import` for lock or registry-helpers).
</output>
