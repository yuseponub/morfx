---
phase: standalone-debounce-interruption-system-v2
plan: 04
type: execute
wave: 4
depends_on: [03]
files_modified:
  - src/lib/agents/engine/types.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/engine-adapters/production/messaging.ts
  - src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/inngest/functions/agent-production.ts
autonomous: true
requirements:
  - LOCK-05  # CKPT-0 + CKPT-6 + CKPT-7.N placed in v4-production-runner.ts
  - LOCK-07  # emit msg_aborted_path_a_combined / msg_aborted_path_b_solo / lock_released_normal / pending_list_combined

must_haves:
  truths:
    - "EngineInput type extended with FOUR optional fields: `lockHandle?: LockHandle | null`, `ownPendingEntryJson?: string | null`, `lockChannel?: 'whatsapp'|'facebook'|'instagram' | null`, `lockIdentifier?: string | null` — all backward-compatible (sandbox + tests pass undefined). REVISION W3: channel/identifier threaded via webhook → event.data → EngineInput so the runner does NOT need a Supabase conversations-table lookup."
    - "V4AgentInput type extended with same FOUR optional fields (threaded from runner to agent)."
    - "A new class `V4MessagingAdapter extends MessagingProductionAdapter` exists in `engine-adapters/production/v4-messaging-adapter.ts`, overrides `send()` to skip `hasNewInboundMessage` (D-08 option-a per RESEARCH Open Question 2 + A7)."
    - "agent-production.ts uses V4MessagingAdapter when the resolved agent is `somnio-sales-v4`; uses the existing MessagingProductionAdapter otherwise (v3/godentist/recompra/pw-confirmation paths UNCHANGED — Regla 6 + D-08)."
    - "V4ProductionRunner.processMessage signature accepts the lockHandle from EngineInput and threads it explicitly (NOT via AsyncLocalStorage — RESEARCH line 873)."
    - "CKPT-0 fires immediately after session resolution in v4-production-runner.ts (RESEARCH line 845 — after current line 71). Uses `input.lockChannel` + `input.lockIdentifier` directly (REVISION W3 — NO createAdminClient lookup)."
    - "CKPT-6 fires before the main `for templates` send loop (RESEARCH line 846 — before current line 267). Same channel/identifier source."
    - "CKPT-7.N fires inside the V4MessagingAdapter.send loop BEFORE each template send — REPLACING the existing Phase 31 `hasNewInboundMessage` check (D-08 + RESEARCH line 847)."
    - "On CKPT-* interrupt detection, the runner branches Path A (no sends) or Path B (≥1 sent) and emits the correct `msg_aborted_path_a_combined` or `msg_aborted_path_b_solo` event."
    - "A try/finally in V4ProductionRunner.processMessage releases the lock via releaseLockIfOwner at the end of every successful AND failed turn (D-09 layer 1)."
    - "Heartbeat startHeartbeat() is invoked at start of turn and its stop() is called in the finally — heartbeat lives in the main async flow, NOT inside step.run (RESEARCH Pitfall 2)."
    - "REVISION W3: `src/lib/agents/engine/v4-production-runner.ts` does NOT import `createAdminClient` for the purpose of resolving lock channel/identifier. The runner reads `input.lockChannel` + `input.lockIdentifier` (populated by Plan 03 webhook + agent-production.ts event.data pass-through)."
  artifacts:
    - path: "src/lib/agents/engine/types.ts"
      provides: "EngineInput.lockHandle + ownPendingEntryJson + lockChannel + lockIdentifier optional fields (4 total — REVISION W3)"
      contains: "lockChannel"
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "V4AgentInput.lockHandle + ownPendingEntryJson + lockChannel + lockIdentifier optional fields (4 total — REVISION W3)"
      contains: "lockChannel"
    - path: "src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts"
      provides: "V4MessagingAdapter class — extends MessagingProductionAdapter; overrides send() to use ckpt_7_pre_template instead of hasNewInboundMessage"
      contains: "extends MessagingProductionAdapter"
    - path: "src/lib/agents/engine-adapters/production/messaging.ts"
      provides: "Existing class refactored so hasNewInboundMessage check can be skipped by subclasses (extract the for-loop body into a protected method)"
      contains: "hasNewInboundMessage"
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "CKPT-0, CKPT-6 inserted; heartbeat lifecycle wrapped in try/finally; reads input.lockChannel + input.lockIdentifier directly (REVISION W3 — no createAdminClient)"
      contains: "input.lockChannel"
    - path: "src/inngest/functions/agent-production.ts"
      provides: "V4MessagingAdapter instantiated when agentId is somnio-sales-v4; lockHandle + lockChannel + lockIdentifier reconstructed from event.data and passed to runner via EngineInput"
      contains: "V4MessagingAdapter"
  key_links:
    - from: "src/lib/agents/engine/v4-production-runner.ts"
      to: "src/lib/agents/interruption-system-v2/checkpoints.ts + lock.ts"
      via: "import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'; import { releaseLockIfOwner, startHeartbeat, renewLockTTL } from '@/lib/agents/interruption-system-v2/lock'"
      pattern: "@/lib/agents/interruption-system-v2"
    - from: "src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts"
      to: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      via: "Calls await checkpoint('ckpt_7_pre_template', handle, ws, ch, id, { templateIndex: i, hasSentAnything: sentCount > 0 })"
      pattern: "ckpt_7_pre_template"
    - from: "src/inngest/functions/agent-production.ts"
      to: "src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts"
      via: "new V4MessagingAdapter(...) when agent === 'somnio-sales-v4'"
      pattern: "V4MessagingAdapter"
---

<objective>
Wave 4 — Integrate the lock and checkpoint infrastructure into the V4 production runner. This is the highest-impact plan: it (a) extends the EngineInput/V4AgentInput types so handles AND channel/identifier can be threaded through the call stack (REVISION W3 — 4 new fields, not 2), (b) creates a v4-only messaging adapter that REPLACES the Phase 31 `hasNewInboundMessage` check at the per-template send loop with our new `checkpoint('ckpt_7_pre_template', ...)`, (c) inserts CKPT-0 (post-session-resolution) and CKPT-6 (pre-send-loop) in v4-production-runner.ts reading channel/identifier from `input.lockChannel`/`input.lockIdentifier` directly (REVISION W3 — NO `createAdminClient` introduced), and (d) wraps the entire turn in a try/finally that releases the lock via `releaseLockIfOwner` and a heartbeat lifecycle (D-09 layer 1+2).

Purpose: this plan resolves RESEARCH Open Question 2 by implementing option-a (V4MessagingAdapter subclass) per recommendation. It also commits to explicit threading of `lockHandle` AND `lockChannel` AND `lockIdentifier` (NOT AsyncLocalStorage — RESEARCH line 873) because explicit is testable, traceable in code review, and only 4 layers deep. REVISION W3: by threading channel/identifier via EngineInput (sourced from Plan 03 webhook → event.data), the runner does NOT need to introduce `createAdminClient` for a conversations lookup — preserving Regla 3 wrapper purity.

Output: 6 files. After this plan, a v4 turn-in-flight has CKPT-0, CKPT-6, CKPT-7.N firing; Plan 05 will add CKPT-1, CKPT-2 (in somnio-v4-agent.ts) and CKPT-3..5 (in sub-loop/index.ts).
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
@.planning/standalone/debounce-interruption-system-v2/03-SUMMARY.md

<interfaces>
<!-- From Plan 01+02 -->
From src/lib/agents/interruption-system-v2/:
```typescript
// lock.ts
export interface LockHandle { key: string; holderUuid: string; startedAt: string }
export async function releaseLockIfOwner(handle: LockHandle): Promise<boolean>
export async function renewLockTTL(handle: LockHandle): Promise<boolean>
export function startHeartbeat(handle: LockHandle): () => void  // returns stop function

// checkpoints.ts
export async function checkpoint(
  ckptId: CheckpointId,
  handle: LockHandle,
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram',
  identifier: string,
  opts?: { templateIndex?: number; hasSentAnything?: boolean },
): Promise<CheckpointResult>

// pending.ts
export async function readAndClearPending(workspaceId, channel, identifier): Promise<PendingEntry[]>
export async function removeOwnEntry(workspaceId, channel, identifier, exactJson: string): Promise<boolean>

// observability.ts
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void
```

<!-- From Plan 03 (already shipped event.data extension) -->
Inngest event `agent/whatsapp.message_received` now carries:
```typescript
{
  // ...existing fields
  lockHolderUuid?: string | null
  lockKey?: string | null
  ownPendingEntryJson?: string | null
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null  // REVISION W3
  lockIdentifier?: string | null                                // REVISION W3 (phone or external_subscriber_id)
  agentId?: AgentId | null                                       // REVISION W2
}
```

<!-- Existing types we extend -->
From src/lib/agents/engine/types.ts:
```typescript
export interface EngineInput {
  sessionId: string
  conversationId: string
  contactId: string
  message: string
  workspaceId: string
  history: { role, content }[]
  forceIntent?: string
  turnNumber?: number
  phoneNumber?: string
  messageTimestamp?: string
  // NEW (this plan, REVISION W3): lockHandle? + ownPendingEntryJson? + lockChannel? + lockIdentifier?
}
```

From src/lib/agents/somnio-v4/types.ts:
```typescript
export interface V4AgentInput {
  message: string
  history: { role, content }[]
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas?: AccionRegistrada[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  sessionId?: string
  // NEW (this plan, REVISION W3): lockHandle? + ownPendingEntryJson? + lockChannel? + lockIdentifier?
}
```

<!-- Existing messaging adapter shape (RESEARCH line 847 + messaging.ts:98-108 actual) -->
From src/lib/agents/engine-adapters/production/messaging.ts:
```typescript
// NOTE (REVISION W8): grep confirmed lines 15, 40, 82, 132 reference createAdminClient.
// Line 132 IS used to look up conversation channel for FB/IG vs WhatsApp routing
// (verified during revision). This existing pattern is OUTSIDE the scope of REVISION W3 —
// REVISION W3 ONLY blocks NEW createAdminClient usage inside v4-production-runner.ts.
// The messaging adapter's existing pattern is preserved unchanged.
export class MessagingProductionAdapter {
  constructor(workspaceId, conversationId, phoneNumber, responseSpeed = 1.0) {}
  private async hasNewInboundMessage(conversationId, afterTimestamp): Promise<boolean>
  async send(params: { sessionId, conversationId, messages, templates?, intent?, workspaceId, contactId?, phoneNumber?, triggerTimestamp? }): Promise<{ messagesSent, interrupted?, interruptedAtIndex? }>
}
```

<!-- Existing v4 runner shape (lines 60-72, 195-267) -->
From src/lib/agents/engine/v4-production-runner.ts:
```typescript
export class V4ProductionRunner {
  constructor(adapters: EngineAdapters, config: EngineConfig)
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput>
}
// Line ~71: (this.adapters.timer as any).setSessionId(session.id) — CKPT-0 inserts AFTER this
// Line ~267: if (output.templates && output.templates.length > 0) — CKPT-6 inserts BEFORE this
// Line ~206: pending-templates Path B resume — CKPT-6 ALSO inserts BEFORE this if both paths are send-candidates
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 4.1: Extend EngineInput + V4AgentInput types with lockHandle + ownPendingEntryJson + lockChannel + lockIdentifier (REVISION W3 — 4 fields, not 2)</name>
  <read_first>
    - src/lib/agents/engine/types.ts (lines 60-90 — EngineInput definition)
    - src/lib/agents/somnio-v4/types.ts (lines 142-163 — V4AgentInput definition)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 864-873 (How to thread lockHandle — explicit recommended, NOT AsyncLocalStorage)
    - 03-SUMMARY.md (confirms event.data shape from Plan 03 — 6 fields including lockChannel + lockIdentifier)
  </read_first>
  <action>
    1. Open `src/lib/agents/engine/types.ts`. Add to the `EngineInput` interface, after `messageTimestamp?: string`:
       ```ts
       /**
        * Standalone: debounce-interruption-system-v2 (D-03 + RESEARCH line 866).
        * Populated by the webhook handler when v4 path is detected; null on:
        * (a) non-v4 agents (preserved Phase 31 behavior — Regla 6),
        * (b) Redis-unavailable fail-open path (RESEARCH Open Question 5).
        * Sandbox engine + test fixtures may omit (undefined).
        */
       lockHandle?: import('@/lib/agents/interruption-system-v2/lock').LockHandle | null
       /**
        * Standalone: debounce-interruption-system-v2 (D-16 — RPUSH self ALWAYS).
        * The exact JSON string the webhook RPUSHed into pending for this turn's own message.
        * Runner uses this to LREM-self after the first successful template send.
        */
       ownPendingEntryJson?: string | null
       /**
        * REVISION W3 — channel resolved at webhook entry, threaded through event.data → EngineInput
        * so the runner does NOT need a Supabase conversations-table lookup.
        * Sourced from webhook payload (Plan 03). Null on non-v4 path (matches lockHandle nullability).
        */
       lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
       /**
        * REVISION W3 — identifier (phone for WhatsApp, external_subscriber_id for FB/IG).
        * Same source + nullability semantics as lockChannel.
        */
       lockIdentifier?: string | null
       ```

       Use the type-only import via `import('...').LockHandle` to avoid runtime circular imports if `engine/types.ts` is loaded before the interruption-system-v2 module.

    2. Open `src/lib/agents/somnio-v4/types.ts`. Add to `V4AgentInput`, after `sessionId?: string` (around line 162-163), the SAME FOUR fields with the SAME doc-comments. The agent module receives them from the runner and passes them down to sub-loop in Plan 05.

    3. **Sandbox compatibility check:** grep `src/lib/agents/engine-adapters/sandbox/` and `src/app/(dashboard)/sandbox/` for any place where `EngineInput` or `V4AgentInput` is constructed by hand. Confirm those callers either (a) omit the new optional fields (now allowed since all are `?`) or (b) explicitly pass `null`. No sandbox file should need modification — all four new fields are optional.

    4. `npx tsc --noEmit -p tsconfig.json` MUST stay clean. If any non-test caller now errors because of strict object literal checks, **the caller is incorrectly typed** — fix by adding the optional fields. Do not work around by widening types.
  </action>
  <verify>
    <automated>grep -c "lockHandle\|lockChannel\|lockIdentifier" src/lib/agents/engine/types.ts && grep -c "lockHandle\|lockChannel\|lockIdentifier" src/lib/agents/somnio-v4/types.ts && grep -c "ownPendingEntryJson" src/lib/agents/engine/types.ts && grep -c "ownPendingEntryJson" src/lib/agents/somnio-v4/types.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS" | head -1</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "lockHandle" src/lib/agents/engine/types.ts` ≥ 1.
    - `grep -c "lockHandle" src/lib/agents/somnio-v4/types.ts` ≥ 1.
    - `grep -c "ownPendingEntryJson" src/lib/agents/engine/types.ts` ≥ 1.
    - `grep -c "ownPendingEntryJson" src/lib/agents/somnio-v4/types.ts` ≥ 1.
    - `grep -c "lockChannel" src/lib/agents/engine/types.ts` ≥ 1 (REVISION W3).
    - `grep -c "lockIdentifier" src/lib/agents/engine/types.ts` ≥ 1 (REVISION W3).
    - `grep -c "lockChannel" src/lib/agents/somnio-v4/types.ts` ≥ 1 (REVISION W3 — WARNING 1 fix).
    - `grep -c "lockIdentifier" src/lib/agents/somnio-v4/types.ts` ≥ 1 (REVISION W3 — WARNING 1 fix).
    - `npx tsc --noEmit -p tsconfig.json` reports zero new errors (count of `error TS` lines unchanged from baseline).
  </acceptance_criteria>
  <done>Type plumbing for lockHandle + lockChannel + lockIdentifier ready in both EngineInput and V4AgentInput (REVISION W3 — 4 fields each).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4.2: Refactor MessagingProductionAdapter to enable subclass override + create V4MessagingAdapter (D-08 option-a)</name>
  <read_first>
    - src/lib/agents/engine-adapters/production/messaging.ts (full file — focus lines 78-90 hasNewInboundMessage + lines 156-187 send loop with Phase 31 check)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 37-38 + 1020-1023 (Open Question 2 — recommend option-a: V4MessagingAdapter subclass)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-08 — "eliminar Phase 31 del path de v4")
    - .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md (REVISION W7 — keepTtl support verdict from Plan 00 Task 0.2 or 0.5)
  </read_first>
  <behavior>
    - Existing `MessagingProductionAdapter` behavior preserved verbatim for non-v4 paths (Regla 6).
    - A protected method extracted from the per-template loop allows subclasses to swap the per-template "should we abort" check.
    - New class `V4MessagingAdapter` extends `MessagingProductionAdapter`:
      - Constructor accepts an additional `lockHandle: LockHandle | null` and `ownPendingEntryJson: string | null` (passed at construction time by Plan 04 Task 4.4).
      - Overrides the per-template abort check: instead of `hasNewInboundMessage(convId, triggerTimestamp)`, it calls `await checkpoint('ckpt_7_pre_template', this.lockHandle, this.workspaceId, channel, recipientIdentifier, { templateIndex: i, hasSentAnything: sentCount > 0 })`.
      - On checkpoint result `proceed: false, interrupted: { pendingListLength }`: returns `{ messagesSent: sentCount, interrupted: true, interruptedAtIndex: i }` (same shape as Phase 31 — Plan 04 Task 4.3 + Plan 05 read this).
      - On checkpoint result `proceed: false, lostLock: true`: throws a `LostLockError` (NEW exception class — caught in runner's outer try/catch, emits zombie_lambda_exit).
      - On checkpoint `proceed: true`: continue with the existing template send code.
      - After the first successful template send (sentCount transitions 0 → 1): calls `removeOwnEntry(workspaceId, channel, identifier, this.ownPendingEntryJson)` per D-16 — and updates the lock value's `has_sent_anything` flag in Redis (REVISION W7 — choose between `keepTtl` and TTL-read-then-set per Plan 00 SUMMARY verdict). Emits no event for this — implicit in next CKPT.
    - If `lockHandle` is null (fail-open path or sandbox), V4MessagingAdapter falls back to the parent's `hasNewInboundMessage` check (so the v4 path is not WORSE than the v3 path when Redis is down — RESEARCH Open Question 5 fail-open).
  </behavior>
  <action>
    1. Open `src/lib/agents/engine-adapters/production/messaging.ts`. Refactor the existing `send` method's per-template loop so the abort-check is a protected method:
       ```ts
       protected async shouldAbortBeforeTemplate(
         params: { conversationId, triggerTimestamp?, sentCount: number },
         opts: { templateIndex: number; channel: ChannelType; recipientIdentifier: string }
       ): Promise<{ abort: false } | { abort: true; reason: 'phase31_new_inbound' | string }> {
         if (params.triggerTimestamp) {
           const hasNew = await this.hasNewInboundMessage(params.conversationId, params.triggerTimestamp)
           if (hasNew) return { abort: true, reason: 'phase31_new_inbound' }
         }
         return { abort: false }
       }
       ```
       Replace lines ~172-187 (the Phase 31 check) with a call to `this.shouldAbortBeforeTemplate({ conversationId: convId, triggerTimestamp: params.triggerTimestamp, sentCount }, { templateIndex: i, channel, recipientIdentifier: recipientId })`. Same return shape on abort: `{ messagesSent: sentCount, interrupted: true, interruptedAtIndex: i }`.

       Make `hasNewInboundMessage` protected (was private) so subclasses can also call it.

       This is a pure refactor — no behavior change. `npx vitest` if there are existing tests for MessagingProductionAdapter MUST still pass (find them with `grep -rln "MessagingProductionAdapter" src/`).

    2. Create `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts`:
       ```ts
       import { MessagingProductionAdapter } from './messaging'
       import { checkpoint, type CheckpointResult } from '@/lib/agents/interruption-system-v2/checkpoints'
       import { removeOwnEntry } from '@/lib/agents/interruption-system-v2/pending'
       import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import type { LockHandle } from '@/lib/agents/interruption-system-v2/lock'

       export class LostLockError extends Error {
         constructor(public ckptId: string) {
           super(`[interruption-v2] zombie lambda — lost lock at ${ckptId}`)
           this.name = 'LostLockError'
         }
       }

       /**
        * D-08 + RESEARCH Open Question 2 option-a: v4-only adapter that REPLACES
        * the Phase 31 hasNewInboundMessage DB query with the Redis-based
        * checkpoint('ckpt_7_pre_template', ...) — RESEARCH Pitfall 3 propagation
        * applies: lostLock throws (not returns) to the outer runner.
        */
       export class V4MessagingAdapter extends MessagingProductionAdapter {
         constructor(
           workspaceId: string,
           conversationId: string,
           phoneNumber: string,
           responseSpeed: number,
           private readonly lockHandle: LockHandle | null,
           private readonly ownPendingEntryJson: string | null,
         ) {
           super(workspaceId, conversationId, phoneNumber, responseSpeed)
         }

         protected async shouldAbortBeforeTemplate(
           params: { conversationId: string; triggerTimestamp?: string; sentCount: number },
           opts: { templateIndex: number; channel: 'whatsapp' | 'facebook' | 'instagram'; recipientIdentifier: string }
         ): Promise<{ abort: false } | { abort: true; reason: string }> {
           // Fail-open: if lock infrastructure is missing (Redis down at webhook), fall back to Phase 31 parent behavior.
           if (!this.lockHandle) return super.shouldAbortBeforeTemplate(params, opts)

           const ckpt = await checkpoint(
             'ckpt_7_pre_template',
             this.lockHandle,
             this.workspaceId,
             opts.channel,
             opts.recipientIdentifier,
             { templateIndex: opts.templateIndex, hasSentAnything: params.sentCount > 0 }
           )

           if (ckpt.lostLock) throw new LostLockError(`ckpt_7_pre_template_${opts.templateIndex}`)
           if (!ckpt.proceed && ckpt.interrupted) return { abort: true, reason: 'ckpt7_interrupted' }
           return { abort: false }
         }

         // Hook called by the runner after the first successful send transitions sentCount 0 → 1.
         // D-16 + lock value mutation per D-15: also flip has_sent_anything in the lock value so
         // subsequent checkpoints see the right Path A/B branch.
         async onFirstSendCompleted(opts: { channel: 'whatsapp' | 'facebook' | 'instagram'; identifier: string }): Promise<void> {
           if (!this.lockHandle || !this.ownPendingEntryJson) return
           await removeOwnEntry(this.workspaceId, opts.channel, opts.identifier, this.ownPendingEntryJson)
           // Re-write lock value with has_sent_anything=true.
           // REVISION W7: read Plan 00 SUMMARY for keepTtl verdict.
           //   - If SUPPORTED: redis.set(key, newValue, { keepTtl: true } as any)
           //   - If NOT SUPPORTED: const ttl = await redis.ttl(key); await redis.set(key, newValue, { ex: Math.max(ttl, 5) })
           // Race tolerance: the heartbeat (5s frequency) renews TTL via assertHoldsLock+expire,
           // so even a brief TTL gap from the read-then-set pattern is bounded.
           const newValue = JSON.stringify({
             holder_uuid: this.lockHandle.holderUuid,
             started_at: this.lockHandle.startedAt,
             has_sent_anything: true,
           })
           // ---- BEGIN keepTtl branch (consult Plan 00 SUMMARY) ----
           // Pseudocode — implementer picks branch:
           //   await redis.set(this.lockHandle.key, newValue, { keepTtl: true } as { keepTtl: true })
           // OR:
           //   const remainingTtl = await redis.ttl(this.lockHandle.key)
           //   await redis.set(this.lockHandle.key, newValue, { ex: Math.max(remainingTtl, 5) })
           // ---- END ----
           // Implementation: read Plan 00 00-SUMMARY.md (specifically the REVISION W7 keepTtl test result) and pick the branch. Document choice with a code comment citing the SUMMARY section.
         }
       }
       ```

       **Note on `keepTtl` (REVISION W7):** Plan 00 Task 0.5 (or extension of Task 0.2) tests `keepTtl` against the actual Upstash dev DB and records the verdict in 00-SUMMARY.md. The implementation here MUST consult that SUMMARY and pick the branch deterministically (no runtime detection). Document choice with code comment.

       Where the runner needs to inject the post-send hook: the existing `send()` method returns `{ messagesSent, interrupted?, interruptedAtIndex? }` — Plan 04 Task 4.3 calls `onFirstSendCompleted()` from V4ProductionRunner AFTER `pendingSendResult.messagesSent > 0` transitions for the first time. Alternative: trigger it inside the parent's per-template loop after each successful send + check internal flag for first-time. Simpler from outside.
  </action>
  <verify>
    <automated>grep -c "shouldAbortBeforeTemplate" src/lib/agents/engine-adapters/production/messaging.ts && grep -c "class V4MessagingAdapter" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts && grep -c "checkpoint('ckpt_7_pre_template'" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts && grep -c "LostLockError" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "src/lib/agents/engine-adapters/production"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "shouldAbortBeforeTemplate" src/lib/agents/engine-adapters/production/messaging.ts` ≥ 2 (declaration + call site).
    - `grep -c "protected async hasNewInboundMessage\|protected hasNewInboundMessage" src/lib/agents/engine-adapters/production/messaging.ts` ≥ 1 (visibility relaxed from private).
    - `grep -c "extends MessagingProductionAdapter" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` ≥ 1.
    - `grep -c "checkpoint('ckpt_7_pre_template'" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` ≥ 1.
    - `grep -c "class LostLockError" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` ≥ 1.
    - `grep -c "onFirstSendCompleted" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` ≥ 1.
    - `grep -c "removeOwnEntry" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` ≥ 1 (D-16 LREM-self).
    - `npx tsc --noEmit -p tsconfig.json` zero new errors in those two files.
    - If existing `MessagingProductionAdapter` tests exist, they pass: `grep -rln "MessagingProductionAdapter" src/lib/agents/engine-adapters/production/__tests__/` and run them.
  </acceptance_criteria>
  <done>V4MessagingAdapter ready; parent refactored without behavior change; keepTtl branch chosen per Plan 00 verdict.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.3: Insert CKPT-0 + CKPT-6 into v4-production-runner.ts + heartbeat + try/finally release (D-09 layers 1+2) — REVISION W3: reads input.lockChannel + input.lockIdentifier (NO createAdminClient)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (full file — focus lines 61-95 processMessage entry; lines 195-267 send loop; line 71 setSessionId; line 206 pending-templates Path B; line 266-267 main send block)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 843-848 (Exact Line Numbers for CKPT-0, CKPT-6 in v4-production-runner.ts)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 509-520 (Pitfall 2 — heartbeat in main async, NOT inside step.run)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 580-590 (Pitfall 7 — TTL adequacy + heartbeat interval)
    - .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md (confirm LOCK_TTL_S = 45 or 60)
  </read_first>
  <action>
    **IMPORTANT — re-verify line numbers before editing.** The line numbers cited in RESEARCH (lines 843-848) are a snapshot of 2026-05-25. If the file has shifted, find the equivalent insertion points by structural anchors:
    - CKPT-0: right after `(this.adapters.timer as any).setSessionId(session.id)` line, BEFORE `const currentDatos = session.state.datos_capturados`.
    - CKPT-6 (pending templates Path B path): right BEFORE `if (this.adapters.storage.getPendingTemplates) {`.
    - CKPT-6 (main send path): right BEFORE `if (output.templates && output.templates.length > 0) {`.

    1. Add imports at the top of `src/lib/agents/engine/v4-production-runner.ts`:
       ```ts
       import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
       import { releaseLockIfOwner, renewLockTTL, startHeartbeat, type LockHandle } from '@/lib/agents/interruption-system-v2/lock'
       import { readAndClearPending } from '@/lib/agents/interruption-system-v2/pending'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { LostLockError } from '../engine-adapters/production/v4-messaging-adapter'
       ```

       **REVISION W3 — DO NOT add `import { createAdminClient } from '@/lib/supabase/admin'`.** The channel/identifier come from `input.lockChannel` and `input.lockIdentifier`, populated by Plan 03 webhook → event.data → EngineInput. The runner stays pure (Regla 3 wrapper).

    2. Wrap the entire `processMessage` body in a try/finally that:
       - Reads `input.lockHandle` (may be null — fail-open path).
       - If non-null, starts heartbeat: `const stopHeartbeat = startHeartbeat(input.lockHandle)`.
       - At the END of the function (finally block):
         ```ts
         finally {
           if (input.lockHandle) {
             stopHeartbeat()
             const released = await releaseLockIfOwner(input.lockHandle)
             if (released) {
               emitLockEvent('lock_released_normal', {
                 holder_uuid: input.lockHandle.holderUuid,
                 duration_ms: Date.now() - startMs,
                 templates_sent: actuallySentIds.length, // accessible if scoped right
               })
             }
           }
         }
         ```
         Add `const startMs = Date.now()` near the top of processMessage.

    3. **Insert CKPT-0 after `setSessionId` call:**
       ```ts
       // REVISION W3: channel + identifier come from EngineInput (sourced from webhook event.data),
       // NOT from a Supabase conversations query. This preserves the runner's purity (Regla 3 wrapper).
       const lockCtx = (input.lockHandle && input.lockChannel && input.lockIdentifier)
         ? { channel: input.lockChannel, identifier: input.lockIdentifier }
         : null

       if (input.lockHandle && lockCtx) {
         const ck0 = await checkpoint('ckpt_0_post_acquire', input.lockHandle, this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
         if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
         if (!ck0.proceed && ck0.interrupted) {
           // Path A — no sends yet at CKPT-0. Read pending list and combine for next turn.
           const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
           emitLockEvent('msg_aborted_path_a_combined', {
             combined_msg_count: pending.length + 1, // self + others
             total_chars: pending.reduce((s, p) => s + p.content.length, 0) + input.message.length,
           })
           emitLockEvent('pending_list_combined', {
             entries_count: pending.length,
             total_chars: pending.reduce((s, p) => s + p.content.length, 0),
           })
           // Persist combined for next turn. Existing logic uses `_v3:pendingUserMessage` in session.state.datos_capturados (line 75 currently). Match that pattern: combine + save.
           const combined = [...pending.map(p => p.content), input.message].join('\n')
           // Save to session state — adapt to existing storage adapter API (storage.savePendingUserMessage? or storage.saveSession?). Inspect.
           // ...
           return { success: false, /* output empty */ }
         }
       }
       ```

       **REVISION W3 explicit assertion:** there is NO `createAdminClient` call in this runner file for the purpose of resolving channel/identifier. The implementation MUST consume `input.lockChannel` + `input.lockIdentifier` directly. If at code-review time the executor finds a case where these fields are missing AND non-fail-open (i.e., lockHandle present but channel/identifier missing — should be impossible since Plan 03 always populates), fail loud with `throw new Error('[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated')`.

    4. **Insert CKPT-6 (pending-templates Path B resume path) before line ~206:**
       ```ts
       if (input.lockHandle && lockCtx) {
         const ck6a = await checkpoint('ckpt_6_pre_send_loop', input.lockHandle, this.config.workspaceId, lockCtx.channel, lockCtx.identifier, { hasSentAnything: actuallySentIds.length > 0 })
         if (ck6a.lostLock) throw new LostLockError('ckpt_6_pre_send_loop_pending_templates')
         if (!ck6a.proceed && ck6a.interrupted) {
           // sentCount=0 yet here (Path B resume hasn't sent) — but if pending-templates exist from prior turn we count those as sent.
           // Decision: if actuallySentIds.length === 0 → Path A; else Path B (sentCount > 0).
           const sentCount = actuallySentIds.length
           const eventLabel = sentCount === 0 ? 'msg_aborted_path_a_combined' : 'msg_aborted_path_b_solo'
           emitLockEvent(eventLabel, { templates_sent_before_abort: sentCount })
           return { success: false, /* short-circuit */ }
         }
       }
       ```

    5. **Insert CKPT-6 (main send block) before line ~267:** same pattern as 4, lockCtx reused.

    6. **Path B short-circuit on CKPT detection during V4MessagingAdapter.send():** the adapter returns `{ messagesSent, interrupted: true, interruptedAtIndex }` (per Task 4.2). The runner already handles this at line ~248-256 (the existing Phase 31 interruption-handling code for the Path B resume block). The same handling applies to the main send block. The `LostLockError` thrown by V4MessagingAdapter propagates through `await this.adapters.messaging.send(...)` and lands in the outer catch — caught and treated as a zombie exit (release lock if still ours, emit `zombie_lambda_exit`, return failure).

    7. Add an outer `catch (err)` that detects `LostLockError`:
       ```ts
       } catch (err) {
         if (err instanceof LostLockError) {
           emitLockEvent('zombie_lambda_exit', {
             my_uuid: input.lockHandle?.holderUuid,
             current_holder_uuid: 'unknown',
             at_step: err.ckptId,
           })
           return { success: false, /* output empty */ } as EngineOutput
         }
         throw err  // re-throw other errors to Inngest retry layer
       }
       ```

    8. Verify NO `step.run` wraps `processMessage` body — RESEARCH Pitfall 2 strict. The existing pattern in `agent-production.ts` does NOT wrap processMessage in step.run; Plan 04 Task 4.4 ensures it stays that way.
  </action>
  <verify>
    <automated>grep -c "checkpoint('ckpt_0_post_acquire'\|checkpoint('ckpt_6_pre_send_loop'" src/lib/agents/engine/v4-production-runner.ts && grep -c "releaseLockIfOwner\|startHeartbeat" src/lib/agents/engine/v4-production-runner.ts && grep -c "msg_aborted_path_a_combined\|msg_aborted_path_b_solo\|lock_released_normal\|zombie_lambda_exit\|pending_list_combined" src/lib/agents/engine/v4-production-runner.ts && grep -c "LostLockError" src/lib/agents/engine/v4-production-runner.ts && grep -c "input.lockChannel\|input.lockIdentifier" src/lib/agents/engine/v4-production-runner.ts && grep -c "createAdminClient" src/lib/agents/engine/v4-production-runner.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "v4-production-runner"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "checkpoint('ckpt_0_post_acquire'" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "checkpoint('ckpt_6_pre_send_loop'" src/lib/agents/engine/v4-production-runner.ts` ≥ 2 (pending-templates path + main send path).
    - `grep -c "startHeartbeat(" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "releaseLockIfOwner(" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "msg_aborted_path_a_combined" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "msg_aborted_path_b_solo" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "lock_released_normal" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "zombie_lambda_exit" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "pending_list_combined" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "LostLockError" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "} finally {" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (D-09 layer 1).
    - `grep -c "input.lockChannel" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (REVISION W3 — consumes EngineInput field, not DB).
    - `grep -c "input.lockIdentifier" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (REVISION W3).
    - `grep -c "createAdminClient" src/lib/agents/engine/v4-production-runner.ts` == 0 (REVISION W3 — purity preserved; if existing usage predates this plan, count must NOT INCREASE).
    - `npx tsc --noEmit -p tsconfig.json` zero new errors in v4-production-runner.ts.
  </acceptance_criteria>
  <done>CKPT-0, CKPT-6 (both paths), heartbeat + try/finally release, LostLockError handler all in v4-production-runner.ts; channel/identifier sourced from EngineInput (REVISION W3 — no createAdminClient introduced).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4.4: Wire V4MessagingAdapter selection in agent-production.ts + reconstruct lockHandle from event.data + thread lockChannel + lockIdentifier into EngineInput</name>
  <read_first>
    - src/inngest/functions/agent-production.ts (full file — focus where MessagingProductionAdapter is instantiated, likely 200-400 range)
    - 03-SUMMARY.md (to confirm how lockHolderUuid/lockKey/ownPendingEntryJson/lockChannel/lockIdentifier are wired in event.data)
  </read_first>
  <action>
    1. Find where `MessagingProductionAdapter` is currently `new MessagingProductionAdapter(...)`. Use `grep -n "new MessagingProductionAdapter" src/inngest/functions/agent-production.ts`. Likely there's a single instantiation site somewhere in the message-processing path.

    2. Add a branch: when `agentId === 'somnio-sales-v4'` (use the already-resolved `agentId` from Plan 03 Task 3.3 — preferring `agentIdFromWebhook` when present), instantiate `V4MessagingAdapter` instead, threading the lockHandle:
       ```ts
       const messagingAdapter = agentId === 'somnio-sales-v4'
         ? new V4MessagingAdapter(
             workspaceId,
             conversationId,
             phone,
             /* responseSpeed */ 1.0,
             lockHolderUuid && lockKey ? { key: lockKey, holderUuid: lockHolderUuid, startedAt: new Date().toISOString() } : null,
             ownPendingEntryJson ?? null,
           )
         : new MessagingProductionAdapter(workspaceId, conversationId, phone, /* responseSpeed */ 1.0)
       ```
       The `startedAt` reconstruction is approximate (we don't have the webhook's exact startedAt; this is only used for emitting `lock_released_normal` duration — accept imprecision).

    3. Add the new import: `import { V4MessagingAdapter } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'`.

    4. Where `processMessage(input)` is called on the runner, build the EngineInput with the FOUR new optional fields (REVISION W3):
       ```ts
       const engineInput: EngineInput = {
         ...existing fields,
         lockHandle: lockHolderUuid && lockKey
           ? { key: lockKey, holderUuid: lockHolderUuid, startedAt: new Date().toISOString() }
           : null,
         ownPendingEntryJson: ownPendingEntryJson ?? null,
         lockChannel: lockChannel ?? null,         // REVISION W3 — from event.data destructuring (Plan 03 Task 3.3)
         lockIdentifier: lockIdentifier ?? null,   // REVISION W3 — from event.data destructuring (Plan 03 Task 3.3)
       }
       ```

    5. **Test:** extend `src/inngest/functions/__tests__/agent-production-lock-event.test.ts` (from Plan 03 Task 3.3) with a new test asserting that when `agentId === 'somnio-sales-v4'`, the V4MessagingAdapter constructor receives the lockHandle and ownPendingEntryJson, AND the engineInput passed to runner.processMessage includes `lockChannel: 'whatsapp'` + `lockIdentifier: '+57...'`. Use `vi.spyOn` on the V4MessagingAdapter constructor or assert via a side-effect (e.g., a known method call signature).

    6. **Verify Pitfall 2 compliance:** confirm no `step.run` wrapping the `runner.processMessage(...)` call. The existing pattern (per RESEARCH line 516-517) does NOT wrap; preserve that.
  </action>
  <verify>
    <automated>grep -c "V4MessagingAdapter" src/inngest/functions/agent-production.ts && grep -c "lockHandle: lockHolderUuid" src/inngest/functions/agent-production.ts && grep -c "lockChannel: lockChannel\|lockChannel ?? null" src/inngest/functions/agent-production.ts && grep -c "lockIdentifier: lockIdentifier\|lockIdentifier ?? null" src/inngest/functions/agent-production.ts && npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "V4MessagingAdapter" src/inngest/functions/agent-production.ts` ≥ 2 (import + instantiation).
    - `grep -c "agentId === 'somnio-sales-v4'" src/inngest/functions/agent-production.ts` ≥ 1.
    - `grep -c "lockHandle:" src/inngest/functions/agent-production.ts` ≥ 1 (engine input construction).
    - `grep -c "ownPendingEntryJson" src/inngest/functions/agent-production.ts` ≥ 1.
    - `grep -c "lockChannel" src/inngest/functions/agent-production.ts` ≥ 2 (REVISION W3 — destructuring + engineInput).
    - `grep -c "lockIdentifier" src/inngest/functions/agent-production.ts` ≥ 2 (REVISION W3 — destructuring + engineInput).
    - `npx vitest run src/inngest/functions/__tests__/agent-production-lock-event.test.ts` exits 0.
    - `grep -c "step.run" src/inngest/functions/agent-production.ts` does NOT show new wrappers around `runner.processMessage` (compare to baseline by inspecting diff).
    - `npx tsc --noEmit -p tsconfig.json` zero new errors.
  </acceptance_criteria>
  <done>V4MessagingAdapter wired in Inngest function; lockHandle + lockChannel + lockIdentifier threaded through EngineInput (REVISION W3).</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for all 6 modified files.
2. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (no regression from Wave 1+2).
3. `npx vitest run src/inngest/functions/__tests__/` exits 0.
4. `grep -c "checkpoint(" src/lib/agents/engine/v4-production-runner.ts` ≥ 3 (CKPT-0 + 2× CKPT-6).
5. `grep -c "checkpoint(" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` ≥ 1 (CKPT-7.N inside loop).
6. `grep -c "hasNewInboundMessage" src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` = 0 (Phase 31 truly replaced in v4 path per D-08).
7. REVISION W3 assertion: `grep -c "createAdminClient" .planning/standalone/debounce-interruption-system-v2/04-PLAN.md` == 0 (no NEW createAdminClient introduced in v4-production-runner.ts).
8. REVISION W3 assertion: `grep -c "input.lockChannel" .planning/standalone/debounce-interruption-system-v2/04-PLAN.md` ≥ 1.
</verification>

<success_criteria>
- 4 of 8 checkpoints fire in v4 turn: CKPT-0, CKPT-6 (×2 paths), CKPT-7.N.
- Heartbeat + try/finally release lifecycle wraps every turn.
- V4MessagingAdapter cleanly replaces Phase 31 behavior for v4 path without touching v3/godentist/etc.
- REVISION W3: runner consumes lockChannel/lockIdentifier from EngineInput; NO createAdminClient introduced.
- Plan 05 next adds CKPT-1, CKPT-2 (in somnio-v4-agent), CKPT-3..5 (in sub-loop).
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/04-SUMMARY.md` documenting: actual line numbers used for CKPT insertions (may differ from RESEARCH 2026-05-25 snapshot), whether `keepTtl` worked or fallback used for lock value update (REVISION W7 — references Plan 00 SUMMARY verdict), and any unexpected ergonomics from consuming lockChannel/lockIdentifier from EngineInput vs the originally-planned conversations query (REVISION W3 — confirms no createAdminClient introduced).
</output>
