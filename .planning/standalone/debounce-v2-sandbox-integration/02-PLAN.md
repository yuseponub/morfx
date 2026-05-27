---
phase: standalone-debounce-v2-sandbox-integration
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/app/api/sandbox/process/route.ts
  - src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
  - src/lib/observability/types.ts
autonomous: true
requirements:
  - D-01  # Scope: ONLY somnio-sales-v4 branch modified; v1/v2/v3/recompra/pw-confirmation byte-identical (Regla 6)
  - D-02  # Lock key shape: channel='whatsapp' (literal existing) + identifier='sandbox-{sandboxSessionId}' (Option C)
  - D-03  # sandboxSessionId source: client generates via generateSessionId() in React useState (runtime-only, not localStorage); threads via POST body
  - D-04  # CKPT-1..5 fire by populating V4AgentInput lock fields — happens automatically via Plan 01 engine threading
  - D-06  # HOLDER/FOLLOWER pattern at route entry; FOLLOWER returns deferred=true immediately; HOLDER processes restart-loop in engine
  - D-07  # FOLLOWER response shape: { success: true, deferred: true, reason: 'follower_appended_to_pending', pendingListLength: N } HTTP 200; long-poll endpoint at /api/sandbox/lock-result/[id]
  - D-09  # Isolation between sandbox tabs of same workspace: each tab has its own runtime sandboxLockSessionId (Pitfall 6 — NOT in localStorage)
  - D-10  # Isolation sandbox vs prod: identifier prefix 'sandbox-' guarantees lock keys never collide with real WhatsApp phone numbers
  - D-12  # Sin migración DB (acceptance: zero SQL files added)
  - D-13  # Sin feature flag (acceptance: v4 branch opt-in via dropdown only)
  - D-15  # Out of scope — interruption-system-v2 module untouched; cron untouched

must_haves:
  truths:
    - "src/app/api/sandbox/process/route.ts adds a NEW lock-acquisition block INSIDE the existing `if (agentId === 'somnio-sales-v4')` branch (currently lines 133-174). All edits are CONFINED to the v4 branch — v1/v2/v3/recompra branches show ZERO diff (D-01 + Regla 6)."
    - "The route extracts `sandboxSessionId` from the POST body. If missing, returns HTTP 400 with `{ error: 'sandboxSessionId required for v4 sandbox' }`."
    - "Lock key shape: `lockChannel = 'whatsapp' as const` (D-02 Option C — uses existing LockChannel union without extending it) + `lockIdentifier = `sandbox-${sandboxSessionId}` ` (prefix `sandbox-` isolates from real WhatsApp phones)."
    - "Workspace id fallback: `const wsId = workspaceId ?? 'sandbox-workspace'` (existing pattern at line 141 of route.ts; preserved)."
    - "Route imports lock primitives via DYNAMIC import (`await import('@/lib/agents/interruption-system-v2/lock')`) — same pattern as existing v4 engine dynamic import at line 134 of route.ts (avoids cold-start cost when agentId is not v4)."
    - "Route calls `acquireLock(wsId, lockChannel, lockIdentifier)` inside a try/catch. On exception (Redis unavailable), emits `redis_unavailable_fallback_failed` event via emitLockEvent and falls through with `lockHandle = null` (engine skip-guards on null — D-04 fail-open)."
    - "When `acquireLock` returns a non-null LockHandle (HOLDER): route calls `pushToPending` to add own entry to the pending list, emits `lock_acquired` event with payload including `holder_uuid`, `msg_id`, `key`, `ttl: 45`, `started_at`."
    - "When `acquireLock` returns null (FOLLOWER): route calls `pushToPending`, calls `redis.set('interrupt:{wsId}:{lockChannel}:{lockIdentifier}', entryUuid, { ex: 60 })`, emits `lock_acquire_failed_follower` + `interrupt_written` events, returns JSON `{ success: true, deferred: true, sandboxSessionId, reason: 'follower_appended_to_pending', pendingListLength: N }` HTTP 200 WITHOUT calling the engine (D-07)."
    - "Route wraps the engine call with `runWithCollector(collector, () => v4Engine.processMessage(...))` from `@/lib/observability` (Pitfall 3 — without this wrap, every emitLockEvent is a silent no-op and Interruption tab stays empty)."
    - "`ObservabilityCollector` instantiated with: `workspaceId: wsId`, `conversationId: sandboxSessionId`, `agentId: 'somnio-sales-v4'`, `triggerKind: 'api'`. NOTE: Task 2.0 extends `TriggerKind` in `src/lib/observability/types.ts` to add the `'sandbox'` literal so the collector init becomes `triggerKind: 'sandbox'`. The edit is SCOPED to types.ts (sibling infra module) and is OUTSIDE the D-15-locked `src/lib/agents/interruption-system-v2/` scope; D-15 protects the locking module only."
    - "Engine call now passes the 5 new lock fields (matching Plan 01's V4EngineInput shape): `lockHandle, lockChannel, lockIdentifier, ownPendingEntryJson, sandboxSessionId`."
    - "NEW file `src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` is a Next.js dynamic-route GET handler that long-polls `redis.get('sandbox-result:{id}')` every 300ms for up to 30s, returns `{ ready: true, result: <parsed-engine-output> }` on hit (and DELs the key) or `{ ready: false, timeout: true }` on timeout. Requires Supabase auth."
    - "Sandbox UI (`sandbox-layout.tsx`) adds a runtime-only React state `sandboxLockSessionId` via `useState(() => generateSessionId())` — NOT persisted to localStorage (Pitfall 6 — localStorage is origin-scoped; same value shared across tabs would defeat D-09 isolation)."
    - "Sandbox UI threads `sandboxSessionId: sandboxLockSessionId` into the POST body to `/api/sandbox/process` (D-03)."
    - "Sandbox UI disables the existing in-browser Path A/B simulation for v4: line 334's `agentIdRef.current === 'somnio-sales-v3'` check stays unchanged; v4 path never adds to `queuedMessages` because the server lock owns interruption now (RESEARCH §Implementation note 842-846). Verifiable: `grep -n \"queuedMessages\" sandbox-layout.tsx` shows NO new v4 reference."
    - "Sandbox UI handles the `{ deferred: true, sandboxSessionId, ... }` response shape: when received, kicks off a long-poll fetch to `/api/sandbox/lock-result/{sandboxSessionId}` and renders the eventual result (or a timeout message)."
    - "Regla 6: ALL non-v4 branches in `route.ts` (v2 at lines 82-92, v3 at lines 97-108, recompra at lines 113-125, default v1 at lines 178-220) are byte-identical to main. Verifiable by `git diff` line-range inspection."
    - "D-12: Zero new SQL migration files."
    - "D-13: Zero new feature flags."
    - "D-15: `git diff --stat main -- src/lib/agents/interruption-system-v2/ src/inngest/functions/v2-lock-cleanup-cron.ts src/lib/agents/engine/v4-production-runner.ts src/lib/whatsapp/webhook-handler.ts` returns ZERO lines (module + cron + production runner + production webhook all untouched). Note: `src/lib/observability/types.ts` is NOT in D-15's locked scope — it is a sibling infra module."
  artifacts:
    - path: "src/app/api/sandbox/process/route.ts"
      provides: "v4-only lock-acquisition branch with HOLDER/FOLLOWER discriminator + collector-wrapped engine call + threaded lock fields"
      contains: "agentId === 'somnio-sales-v4'"
    - path: "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts"
      provides: "Long-poll endpoint serving sandbox-result:{id} Redis key writes (Pitfall 5) — FOLLOWER long-polls here for HOLDER's combined response"
      contains: "sandbox-result:"
    - path: "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx"
      provides: "Runtime sandboxLockSessionId React state; POST body includes sandboxSessionId; deferred-response long-poll handler"
      contains: "sandboxLockSessionId"
    - path: "src/lib/observability/types.ts"
      provides: "Extend TriggerKind union with 'sandbox' literal (single-line edit; sibling infra module — outside D-15 module-lock scope)"
      contains: "'sandbox'"
  key_links:
    - from: "src/app/api/sandbox/process/route.ts (v4 branch)"
      to: "src/lib/agents/somnio-v4/engine-v4.ts (V4EngineInput from Plan 01)"
      via: "Route populates the 5 new optional lock fields when calling v4Engine.processMessage(...)"
      pattern: "lockHandle: lockHandle ?? null"
    - from: "src/app/api/sandbox/process/route.ts (v4 branch)"
      to: "src/lib/agents/interruption-system-v2/lock.ts (acquireLock)"
      via: "Dynamic import + acquireLock(wsId, 'whatsapp', `sandbox-${sandboxSessionId}`)"
      pattern: "acquireLock\\(.*'whatsapp'.*sandbox-"
    - from: "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx (UI)"
      to: "src/app/api/sandbox/process/route.ts (POST body)"
      via: "fetch body includes sandboxSessionId: sandboxLockSessionId"
      pattern: "sandboxSessionId: sandboxLockSessionId"
    - from: "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts"
      to: "src/lib/agents/interruption-system-v2/redis-client.ts (redis.get)"
      via: "redis.get<string>(`sandbox-result:${sandboxSessionId}`) every 300ms up to 30s"
      pattern: "sandbox-result:"
    - from: "src/lib/observability/types.ts (TriggerKind union)"
      to: "src/app/api/sandbox/process/route.ts (ObservabilityCollector init)"
      via: "triggerKind: 'sandbox' literal flows through the type-narrowed init"
      pattern: "TriggerKind.*sandbox"
---

<objective>
Wave 2 — Wire Plan 01's extended SomnioV4Engine into the actual sandbox HTTP path. Four files: (0) `src/lib/observability/types.ts` extends `TriggerKind` union with `'sandbox'` literal (single-line edit; documented decision per WARNING 1); (1) `route.ts` v4 branch grows the HOLDER/FOLLOWER lock-acquisition logic + collector wrap + threaded engine call; (2) NEW long-poll endpoint at `/api/sandbox/lock-result/[id]` so FOLLOWER's UI can await HOLDER's combined response; (3) `sandbox-layout.tsx` adds runtime `sandboxLockSessionId` state + sends it in POST body + handles deferred response.

Purpose: when a user opens `/sandbox` with `agentId='somnio-sales-v4'` selected and sends a message, the server now acquires a Redis lock with `key=lock:{ws}:whatsapp:sandbox-{id}` (D-02 Option C — channel='whatsapp' literal + identifier prefix 'sandbox-'). If another inflight request holds the lock for the same key (e.g., user spammed msg2 before msg1 finished), the FOLLOWER request returns `deferred=true` HTTP 200 immediately and the UI long-polls `/api/sandbox/lock-result/{id}` for the HOLDER's eventual combined response. HOLDER processes through Plan 01's restart-loop engine — when CKPT-0 catches msg2 in pending, drains + combines + continues in the same lambda. All Regla 6 anchors maintained: v1/v2/v3/recompra branches byte-identical.

Output: 3 files edited + 1 NEW file, ~+156/-1 LOC. Tests in Plan 04.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@./.claude/rules/code-changes.md
@.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md
@.planning/standalone/debounce-v2-sandbox-integration/01-PLAN.md
@.planning/standalone/debounce-v2-sandbox-integration/01-SUMMARY.md

<interfaces>
<!-- Plan 01's extended V4EngineInput (already shipped at point of Plan 02 execution) -->
From `src/lib/agents/somnio-v4/engine-v4.ts` (post Plan 01):
```typescript
export interface V4EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  // Plan 01 additions:
  lockHandle?: LockHandle | null
  lockChannel?: LockChannel | null  // 'whatsapp' | 'facebook' | 'instagram'
  lockIdentifier?: string | null
  ownPendingEntryJson?: string | null
  sandboxSessionId?: string
}
```

<!-- Already-shipped module API (D-15 forbids touching) -->
From `src/lib/agents/interruption-system-v2/lock.ts`:
```typescript
export async function acquireLock(
  workspaceId: string,
  channel: LockChannel,
  identifier: string,
): Promise<LockHandle | null>
```

From `src/lib/agents/interruption-system-v2/pending.ts`:
```typescript
export async function pushToPending(
  workspaceId: string,
  channel: LockChannel,
  identifier: string,
  entry: PendingEntry,
): Promise<{ exactJson: string; pendingListLength: number }>
```

From `src/lib/agents/interruption-system-v2/observability.ts`:
```typescript
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void
```

From `src/lib/agents/interruption-system-v2/redis-client.ts`:
```typescript
export const redis: import('@upstash/redis').Redis
// redis.set(key, value, { ex: number }) — set with TTL seconds
// redis.get<T>(key) — get with optional type annotation
// redis.del(key) — delete
```

<!-- Observability collector wrapping pattern (mirror from CRM reader route) -->
From `src/app/api/v1/crm-bots/reader/route.ts` lines 193-201:
```typescript
import { runWithCollector, ObservabilityCollector } from '@/lib/observability'

const collector = new ObservabilityCollector({
  workspaceId: wsId,
  conversationId: <some-conversation-id>,
  agentId: '<agent-id>',
  triggerKind: '<some-kind>',
  turnStartedAt: new Date(),
})

const result = await runWithCollector(collector, () => doWork(...))
```

<!-- Current TriggerKind union (CONFIRMED 2026-05-27 via Read of src/lib/observability/types.ts line 45): -->
```typescript
// PRE-Plan-02 state:
export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api'
// POST-Task-2.0 state (extended):
export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api' | 'sandbox'
```
The literal `'sandbox'` is NOT in the pre-Plan-02 union; Task 2.0 adds it.

<!-- Sandbox session-id generator (already shipped) -->
From `src/lib/sandbox/sandbox-session.ts`:
```typescript
export function generateSessionId(): string {
  return `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}
```

<!-- Existing route.ts v4 branch (currently lines 133-174 — must remain SHAPE-COMPATIBLE on the outside; only the INSIDE of the branch grows) -->
Current shape:
```typescript
if (agentId === 'somnio-sales-v4') {
  const { SomnioV4Engine } = await import('@/lib/agents/somnio-v4/engine-v4')
  const v4Engine = new SomnioV4Engine()
  const v4Result = await v4Engine.processMessage({ message, state, history, turnNumber, workspaceId, systemEvent })
  // ... TEMP DEBUG block (~25 lines, lines 145-171) ...
  return NextResponse.json(v4Result)
}
```

<!-- Existing sandbox-layout.tsx fetch body (line 360-372) -->
```typescript
const response = await fetch('/api/sandbox/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: content,
    state: stateRef.current,
    history,
    turnNumber,
    crmAgents: enabledCrmAgents,
    workspaceId: workspaceRef.current?.id,
    agentId: agentIdRef.current,
  }),
})
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 2.0: Extend TriggerKind union with 'sandbox' literal (resolves WARNING 1)</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/observability/types.ts FULL FILE (202 lines — confirm union shape at line 45)
  </read_first>
  <action>
    **Context (WARNING 1 from checker, resolved 2026-05-27 via direct Read of types.ts):**

    The current `TriggerKind` union at `src/lib/observability/types.ts:45` is:
    ```typescript
    export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api'
    ```
    The literal `'sandbox'` is NOT in the union. Plan 02 Task 2.1 needs to pass `triggerKind: 'sandbox'` to the ObservabilityCollector so observability rows tag sandbox-originated turns distinguishably from production turns.

    **Decision (per WARNING 1 fix):** Extend the union by adding `'sandbox'` as a new literal. This is a single-line edit in `src/lib/observability/types.ts`. It is OUTSIDE D-15's locked scope (D-15 protects `src/lib/agents/interruption-system-v2/` ONLY; `src/lib/observability/` is a sibling infra module). No downstream code break expected because the union is read at write-time (string literal matched at construction sites), and no consumer of `TriggerKind` exhaustively switch/case on the existing 4 members in a way that would force a new case-handler (verifiable by Step 3 grep).

    **Steps:**

    1. Open `src/lib/observability/types.ts`. Locate line 45:
       ```typescript
       export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api'
       ```

    2. Change to:
       ```typescript
       /** What initiated a turn.
        *  - 'sandbox' added by standalone debounce-v2-sandbox-integration Plan 02 Task 2.0
        *    (2026-05-27) so the observability collector tags /sandbox-originated turns
        *    distinguishably from production-originated turns (WARNING 1 fix).
        */
       export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api' | 'sandbox'
       ```

    3. **Sanity check — no exhaustive switch/case break:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       grep -rn "TriggerKind" src/ | grep -v "types\.ts" | head -20
       # Inspect each match: if any is an exhaustive `switch (triggerKind)` or `if/else if`
       # chain that maps to a typed union member without a default branch, the new 'sandbox'
       # literal could cause an unhandled-case TypeScript error.
       # Expected: most usages are `triggerKind: 'user_message'`-style construction sites
       # (string literal at write time) which the new union member does not affect.
       ```
       If any exhaustive consumer breaks, EITHER add a default branch with a comment "treats 'sandbox' as if it were 'api'" OR revert to using `triggerKind: 'api'` in Task 2.1 (document the substitution in 02-SUMMARY).

    4. **TypeScript compile check:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "TriggerKind|trigger_kind" | head -20
       ```
       MUST report zero new errors.

    5. **D-15 boundary check (sandbox-only module unchanged):**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l   # MUST be 0
       ```
       (D-15 covers `interruption-system-v2/` module-lock only; `src/lib/observability/types.ts` is a sibling — not subject to D-15.)
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "'sandbox'" src/lib/observability/types.ts && grep -c "TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api' | 'sandbox'" src/lib/observability/types.ts && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "types\.ts.*TriggerKind|TriggerKind.*types\.ts") && (git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l)</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api' | 'sandbox'" src/lib/observability/types.ts` ≥ 1 (single-line union extension landed).
    - `grep -c "'sandbox'" src/lib/observability/types.ts` ≥ 1 (literal present in file).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "types\.ts.*TriggerKind|TriggerKind.*types\.ts"` reports ZERO new errors (no downstream exhaustive consumer breaks).
    - `git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l` returns 0 (D-15 module-lock unviolated — this edit is in a SIBLING infra module, not the locked module).
    - `git diff --stat main -- src/lib/observability/types.ts | wc -l` ≥ 1 (the file was actually edited).
  </acceptance_criteria>
  <done>TriggerKind union now includes 'sandbox' literal. types.ts edited; D-15 module-lock unviolated; TypeScript clean.</done>
  <atomic_commit>feat(observability-types): add 'sandbox' literal to TriggerKind union (Plan 02 WARNING 1 fix)</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 2.1: Extend the v4 branch in /api/sandbox/process/route.ts with HOLDER/FOLLOWER lock-acquisition + collector wrap + threaded engine call</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/sandbox/process/route.ts FULL FILE (234 lines)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/lock.ts (acquireLock signature)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/pending.ts (pushToPending signature + PendingEntry shape)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/observability.ts (emitLockEvent + LockEventLabel union)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/v1/crm-bots/reader/route.ts lines 1-210 (collector wrap pattern — runWithCollector + ObservabilityCollector ctor)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/observability/types.ts (post-Task-2.0: confirm 'sandbox' is in TriggerKind union)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/whatsapp/webhook-handler.ts lines 322-419 (HOLDER/FOLLOWER pattern to mirror)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Pattern 1 (lines 225-318) — full HOLDER/FOLLOWER code example
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/01-SUMMARY.md (line numbers for V4EngineInput shape post Plan 01)
  </read_first>
  <action>
    1. Open `src/app/api/sandbox/process/route.ts`. Locate the v4 branch (currently lines 133-174 — `if (agentId === 'somnio-sales-v4') { ... }`).

    2. Add `sandboxSessionId` to the destructured body fields at line 43-53 (the existing `body as { ... }` type assertion). Add to BOTH the runtime destructuring AND the type cast:

       ```typescript
       const body = await request.json()
       const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent, agentId, systemEvent, sandboxSessionId } = body as {
         message: string
         state: SandboxState
         history: { role: 'user' | 'assistant'; content: string }[]
         turnNumber: number
         crmAgents?: { agentId: string; mode: 'dry-run' | 'live' }[]
         workspaceId?: string
         forceIntent?: string
         agentId?: string
         systemEvent?: SystemEvent
         sandboxSessionId?: string  // NEW — D-03 (added by sandbox UI per Plan 02 Task 2.3)
       }
       ```

       This addition is OUTSIDE the v4 branch but is a NEUTRAL extension (destructuring a possibly-undefined field affects NO existing branch — Regla 6 is not violated because the var is unused in non-v4 paths).

    3. REPLACE the entire body of the existing v4 branch (lines 133-174) with the new HOLDER/FOLLOWER + collector-wrap shape. The branch BOUNDARY (`if (agentId === 'somnio-sales-v4') {` and its closing `}` before the v1 branch) MUST remain — do not change the condition, do not move the boundary.

       Replacement body:

       ```typescript
       if (agentId === 'somnio-sales-v4') {
         // ============================================================
         // Standalone: debounce-v2-sandbox-integration / Plan 02
         // (D-01 + D-02 Option C + D-04 + D-06 + D-07 + D-09 + D-10).
         // Wires shipped interruption-system-v2 primitives into the sandbox
         // v4 path so behavior is paridad with WhatsApp production.
         // - Lock key: lock:{ws}:whatsapp:sandbox-{sandboxSessionId} (Option C).
         // - HOLDER processes restart-loop in engine (Plan 01).
         // - FOLLOWER returns deferred=true; UI long-polls sandbox-result:{id}.
         // ============================================================

         if (!sandboxSessionId) {
           return NextResponse.json(
             { error: 'sandboxSessionId required for v4 sandbox' },
             { status: 400 },
           )
         }

         const wsId = workspaceId ?? 'sandbox-workspace'

         // D-02 Option C: channel literal stays 'whatsapp' (existing union member, no module change);
         // identifier prefix 'sandbox-' isolates lock keys from real WhatsApp phones (D-09 + D-10).
         const lockChannel = 'whatsapp' as const
         const lockIdentifier = `sandbox-${sandboxSessionId}`

         // Dynamic imports (mirror existing v4 engine dynamic import pattern at this branch):
         const [
           { acquireLock },
           { pushToPending },
           { emitLockEvent },
           { redis },
           { randomUUID },
         ] = await Promise.all([
           import('@/lib/agents/interruption-system-v2/lock'),
           import('@/lib/agents/interruption-system-v2/pending'),
           import('@/lib/agents/interruption-system-v2/observability'),
           import('@/lib/agents/interruption-system-v2/redis-client'),
           import('crypto'),
         ])

         const { runWithCollector, ObservabilityCollector } = await import('@/lib/observability')

         let lockHandle: import('@/lib/agents/interruption-system-v2/lock').LockHandle | null = null
         let ownPendingEntryJson: string | null = null
         const entryUuid = randomUUID()
         const pendingEntry = {
           entry_uuid: entryUuid,
           content: message,
           received_at: new Date().toISOString(),
           msg_id: entryUuid,
         }

         try {
           lockHandle = await acquireLock(wsId, lockChannel, lockIdentifier)

           if (!lockHandle) {
             // ============================================================
             // FOLLOWER PATH (D-06 + D-07)
             // ============================================================
             const push = await pushToPending(wsId, lockChannel, lockIdentifier, pendingEntry)
             await redis.set(
               `interrupt:${wsId}:${lockChannel}:${lockIdentifier}`,
               entryUuid,
               { ex: 60 },
             )
             emitLockEvent('lock_acquire_failed_follower', {
               existing_holder_uuid: 'unknown',
               my_msg_id: entryUuid,
               key: `lock:${wsId}:${lockChannel}:${lockIdentifier}`,
             })
             emitLockEvent('interrupt_written', {
               msg_id: entryUuid,
               pending_list_length: push.pendingListLength,
             })
             return NextResponse.json({
               success: true,
               deferred: true,
               sandboxSessionId,
               reason: 'follower_appended_to_pending',
               pendingListLength: push.pendingListLength,
             })
           }

           // ============================================================
           // HOLDER PATH (D-06)
           // ============================================================
           const push = await pushToPending(wsId, lockChannel, lockIdentifier, pendingEntry)
           ownPendingEntryJson = push.exactJson
           emitLockEvent('lock_acquired', {
             holder_uuid: lockHandle.holderUuid,
             msg_id: entryUuid,
             key: lockHandle.key,
             ttl: 45,
             started_at: lockHandle.startedAt,
           })
         } catch (lockErr) {
           // Fail-open: Redis unavailable → emit event + fall through with lockHandle=null.
           // Engine skip-guards on null (D-04 — pre-this-standalone behavior preserved when Redis down).
           emitLockEvent('redis_unavailable_fallback_failed', {
             error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
             at_step: 'route_acquire_lock',
           })
           lockHandle = null
           ownPendingEntryJson = null
         }

         // ============================================================
         // Wrap engine call with ObservabilityCollector so emitLockEvent
         // writes to agent_observability_events (Pitfall 3 — without the
         // wrap, all event emits are silent no-ops).
         // triggerKind: 'sandbox' relies on Task 2.0's TriggerKind union extension
         // in src/lib/observability/types.ts (WARNING 1 fix landed in Wave 2).
         // ============================================================
         const collector = new ObservabilityCollector({
           workspaceId: wsId,
           conversationId: sandboxSessionId,  // sandbox: session ≡ conversation (Pitfall 4 RESOLVED — agent_observability_turns.conversation_id is UUID NOT NULL without FK)
           agentId: 'somnio-sales-v4',
           triggerKind: 'sandbox',  // Task 2.0 extended TriggerKind union with this literal.
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
           lockHandle,
           lockChannel,
           lockIdentifier,
           ownPendingEntryJson,
           sandboxSessionId,
         }))

         // PRESERVE the existing TEMP DEBUG block (lines 145-171 of pre-Plan-02 route.ts).
         // It is observability for v4-runtime-wiring smoke; not changed by this plan.
         try {
           const truncate = (s: string, n = 250) => s.length > n ? s.slice(0, n) + '...' : s
           const recentBotMsgs = (history ?? [])
             .filter((h) => h.role === 'assistant')
             .slice(-2)
             .map((h) => truncate(h.content))
           console.log('[V4 TURN] ' + JSON.stringify({
             ts: new Date().toISOString(),
             turn: turnNumber ?? 1,
             inMessage: message,
             inHistoryLength: (history ?? []).length,
             inHistory: (history ?? []).map((h) => ({ role: h.role, content: truncate(h.content) })),
             inSystemEvent: systemEvent ?? null,
             recentBotMsgs,
             outIntent: v4Result.debugTurn?.intent ?? null,
             outMessages: v4Result.messages?.map(truncate) ?? [],
             outAction: v4Result.debugTurn?.salesTrack?.accion ?? null,
             outNewMode: v4Result.newState?.currentMode ?? null,
             outIntentsVistos: v4Result.newState?.intentsVistos ?? [],
             outTemplatesEnviados: v4Result.newState?.templatesEnviados ?? [],
             outTimerSignal: v4Result.timerSignal ?? null,
             outError: v4Result.error ?? null,
             // NEW: lock state surfaced for smoke debugging
             lockAcquired: lockHandle !== null,
             sandboxSessionId,
           }))
         } catch (logErr) {
           console.log('[V4 TURN ERROR] failed to serialize debug log:', logErr)
         }

         return NextResponse.json(v4Result)
       }
       ```

    4. **Do NOT modify** any code outside the `if (agentId === 'somnio-sales-v4') { ... }` block. Lines 82-92 (v2), 97-108 (v3), 113-125 (recompra), 178-220 (default v1) MUST be byte-identical to main.

    5. **Sanity check before commit:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep "sandbox/process/route\.ts" | head -10
       ```
       MUST report zero new errors. With Task 2.0's TriggerKind extension landed, `triggerKind: 'sandbox'` is type-safe.

    6. **Regla 6 anchor sanity check (CRITICAL — D-01):**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       # Inspect: the diff against main should show edits ONLY inside the v4 branch and the body-destructure.
       git diff main -- src/app/api/sandbox/process/route.ts | grep -E "^[+-]" | grep -v "^[+-]{3}" | head -100
       ```
       Visually confirm: every `+` and `-` line is either (a) inside the `if (agentId === 'somnio-sales-v4') { ... }` block, OR (b) part of the `const { ... } = body as { ... }` destructuring at line ~43 (which adds the optional `sandboxSessionId` field — neutral to non-v4 branches).
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "agentId === 'somnio-sales-v4'" src/app/api/sandbox/process/route.ts && grep -c "acquireLock(wsId, lockChannel, lockIdentifier)" src/app/api/sandbox/process/route.ts && grep -c "lockChannel = 'whatsapp' as const" src/app/api/sandbox/process/route.ts && grep -c "sandbox-\\\${sandboxSessionId}" src/app/api/sandbox/process/route.ts && grep -c "runWithCollector(collector," src/app/api/sandbox/process/route.ts && grep -c "deferred: true" src/app/api/sandbox/process/route.ts && grep -c "lock_acquired" src/app/api/sandbox/process/route.ts && grep -c "lock_acquire_failed_follower" src/app/api/sandbox/process/route.ts && grep -c "follower_appended_to_pending" src/app/api/sandbox/process/route.ts && grep -c "redis_unavailable_fallback_failed" src/app/api/sandbox/process/route.ts && grep -c "channel: 'sandbox'" src/app/api/sandbox/process/route.ts && grep -c "sandboxSessionId required for v4 sandbox" src/app/api/sandbox/process/route.ts && grep -c "triggerKind: 'sandbox'" src/app/api/sandbox/process/route.ts && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "sandbox/process/route\.ts") && (git diff --stat main -- src/lib/agents/interruption-system-v2/ src/inngest/functions/v2-lock-cleanup-cron.ts src/lib/agents/engine/v4-production-runner.ts src/lib/whatsapp/webhook-handler.ts | wc -l)</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "agentId === 'somnio-sales-v4'" src/app/api/sandbox/process/route.ts` == 1 (branch shape preserved).
    - `grep -c "acquireLock(wsId, lockChannel, lockIdentifier)" src/app/api/sandbox/process/route.ts` ≥ 1.
    - `grep -c "lockChannel = 'whatsapp' as const" src/app/api/sandbox/process/route.ts` == 1 (D-02 Option C — channel literal).
    - `grep -c "sandbox-\${sandboxSessionId}" src/app/api/sandbox/process/route.ts` ≥ 1 (D-02 Option C — identifier prefix).
    - `grep -c "channel: 'sandbox'" src/app/api/sandbox/process/route.ts` == 0 (D-02 AMENDED Option C — NO literal 'sandbox' channel anywhere — note: this is about LOCK channel, distinct from `triggerKind: 'sandbox'` which is a different concept).
    - `grep -c "triggerKind: 'sandbox'" src/app/api/sandbox/process/route.ts` ≥ 1 (relies on Task 2.0's union extension).
    - `grep -c "LockChannel = 'sandbox'\|'sandbox' as LockChannel" src/app/api/sandbox/process/route.ts` == 0 (anti-Pitfall 1 — no Option B residue).
    - `grep -c "runWithCollector(collector," src/app/api/sandbox/process/route.ts` ≥ 1 (Pitfall 3 — collector wrap present).
    - `grep -c "deferred: true" src/app/api/sandbox/process/route.ts` ≥ 1 (D-07 FOLLOWER response shape).
    - `grep -c "follower_appended_to_pending" src/app/api/sandbox/process/route.ts` ≥ 1 (D-07 reason string).
    - `grep -c "lock_acquired\b" src/app/api/sandbox/process/route.ts` ≥ 1 (HOLDER event).
    - `grep -c "lock_acquire_failed_follower" src/app/api/sandbox/process/route.ts` ≥ 1 (FOLLOWER event).
    - `grep -c "interrupt_written" src/app/api/sandbox/process/route.ts` ≥ 1 (FOLLOWER event).
    - `grep -c "redis_unavailable_fallback_failed" src/app/api/sandbox/process/route.ts` ≥ 1 (fail-open).
    - `grep -c "sandboxSessionId required for v4 sandbox" src/app/api/sandbox/process/route.ts` ≥ 1 (400 validation).
    - `grep -c "lockHandle: lockHandle ?? null\|lockHandle," src/app/api/sandbox/process/route.ts` ≥ 1 (lockHandle threaded to engine).
    - `grep -c "sandboxSessionId,\|sandboxSessionId:" src/app/api/sandbox/process/route.ts` ≥ 2 (extracted from body + threaded to engine).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "sandbox/process/route\.ts"` reports ZERO new errors.
    - **D-15 zero-diff gate:** `git diff --stat main -- src/lib/agents/interruption-system-v2/ src/inngest/functions/v2-lock-cleanup-cron.ts src/lib/agents/engine/v4-production-runner.ts src/lib/whatsapp/webhook-handler.ts | wc -l` returns 0.
    - **Regla 6 anti-leak audit (Pitfall 7):** `git diff main -- src/app/api/sandbox/process/route.ts | grep -E "^[+-]" | grep -vE "(somnio-sales-v4|sandboxSessionId|lock|interruption|collector|runWithCollector|emitLockEvent|acquireLock|releaseLockIfOwner|pushToPending|startHeartbeat|sandbox-result|interrupt:|deferred|follower_appended|redis_unavailable|holder_uuid|whatsapp.*as const|TURN.*JSON\.stringify|lockAcquired|triggerKind)" | grep -cE "^[+-][^+-]"` returns 0 (every edit outside Plan-02 keywords is anomalous; visually re-verify each remaining match is OK).
  </acceptance_criteria>
  <done>Sandbox /api/sandbox/process v4 branch is HOLDER/FOLLOWER-aware; threads lock fields into engine; collector-wrapped with triggerKind='sandbox'; non-v4 branches byte-identical.</done>
  <atomic_commit>feat(sandbox-route): wire interruption-v2 HOLDER/FOLLOWER into v4 branch (D-01 + D-06 + D-07)</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 2.2: Create new long-poll endpoint at /api/sandbox/lock-result/[sandboxSessionId]/route.ts</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/sandbox/process/route.ts lines 30-40 (Supabase auth pattern — createClient + supabase.auth.getUser)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/redis-client.ts (redis.get + redis.del signatures)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Pattern 3 (lines 446-482) — full long-poll endpoint code example
    - Check Next.js 15 dynamic route param shape: `ctx.params` is now `Promise<{ [key]: string }>` (must `await`)
  </read_first>
  <action>
    1. Create directory `src/app/api/sandbox/lock-result/[sandboxSessionId]/`. Verify parent exists:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       ls -d src/app/api/sandbox/
       mkdir -p src/app/api/sandbox/lock-result/\[sandboxSessionId\]
       ```

       (Bracket in path is correct for Next.js dynamic-route directory name. Quote/escape per shell.)

    2. Create file `src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` with the following content:

       ```typescript
       /**
        * Sandbox lock-result long-poll endpoint
        *
        * Standalone: debounce-v2-sandbox-integration / Plan 02 (D-07 + Pitfall 5).
        *
        * FOLLOWER UI long-polls this endpoint after receiving { deferred: true } from
        * /api/sandbox/process v4 branch. We block server-side up to 30s checking the
        * Redis key `sandbox-result:{sandboxSessionId}` (which the HOLDER engine writes
        * BEFORE its finally block releases the lock — Pitfall 5). On hit, parse + DEL
        * + return the result. On timeout, return ready=false.
        *
        * Module interruption-system-v2/ is NOT modified (D-15). We only consume the
        * already-exported `redis` proxy.
        */
       import { NextRequest, NextResponse } from 'next/server'
       import { createClient } from '@/lib/supabase/server'
       import { redis } from '@/lib/agents/interruption-system-v2/redis-client'

       const POLL_INTERVAL_MS = 300
       const POLL_TIMEOUT_MS = 30_000

       export async function GET(
         req: NextRequest,
         ctx: { params: Promise<{ sandboxSessionId: string }> },
       ) {
         // Security: auth required (mirrors /api/sandbox/process)
         const supabase = await createClient()
         const { data: { user } } = await supabase.auth.getUser()
         if (!user) {
           return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
         }

         const { sandboxSessionId } = await ctx.params
         if (!sandboxSessionId) {
           return NextResponse.json({ error: 'sandboxSessionId required' }, { status: 400 })
         }

         const key = `sandbox-result:${sandboxSessionId}`
         const start = Date.now()

         while (Date.now() - start < POLL_TIMEOUT_MS) {
           let raw: string | null = null
           try {
             raw = await redis.get<string>(key)
           } catch (err) {
             // Redis unavailable — return error immediately rather than poll-loop-on-failure.
             return NextResponse.json(
               { ready: false, error: 'Redis unavailable', message: err instanceof Error ? err.message : String(err) },
               { status: 503 },
             )
           }

           if (raw) {
             // Best-effort DEL — if it fails we still return the result; key has TTL 60s.
             try { await redis.del(key) } catch { /* ignore */ }
             try {
               const result = typeof raw === 'string' ? JSON.parse(raw) : raw
               return NextResponse.json({ ready: true, result })
             } catch (parseErr) {
               return NextResponse.json(
                 { ready: false, error: 'Invalid result payload', message: parseErr instanceof Error ? parseErr.message : String(parseErr) },
                 { status: 500 },
               )
             }
           }

           await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
         }

         return NextResponse.json({ ready: false, timeout: true }, { status: 200 })
       }
       ```

    3. **Sanity check:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep "lock-result" | head -10
       ```
       MUST report zero errors.

    4. **D-15 zero-diff check:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l   # MUST be 0
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "sandbox-result:" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "POLL_INTERVAL_MS\|POLL_TIMEOUT_MS" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "Authentication required" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "redis.get<string>" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "redis.del" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "ready: true" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && grep -c "timeout: true" "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts" && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "lock-result") && (git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l)</automated>
  </verify>
  <acceptance_criteria>
    - `test -f "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts"` succeeds (file exists at exact dynamic-route path).
    - `grep -c "sandbox-result:" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1 (Redis key prefix matches Plan 01 engine write).
    - `grep -c "POLL_INTERVAL_MS = 300" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1.
    - `grep -c "POLL_TIMEOUT_MS = 30_000\|POLL_TIMEOUT_MS = 30000" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1.
    - `grep -c "Authentication required" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1 (401 unauthed).
    - `grep -c "redis.get<string>" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1.
    - `grep -c "redis.del" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1 (DEL on hit).
    - `grep -c "ready: true" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1.
    - `grep -c "timeout: true" src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts` ≥ 1.
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "lock-result"` reports ZERO errors.
    - `git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l` returns 0 (D-15).
  </acceptance_criteria>
  <done>Long-poll endpoint exists; auth-gated; reads sandbox-result:{id}; 300ms poll; 30s timeout; module untouched.</done>
  <atomic_commit>feat(sandbox-route): long-poll endpoint /api/sandbox/lock-result/[id] for FOLLOWER (D-07 + Pitfall 5)</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 2.3: Thread sandboxLockSessionId through sandbox-layout.tsx — add runtime useState, send in POST body, handle deferred response</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/sandbox-layout.tsx FULL FILE (612 lines — to lock in line numbers for the useState add point, the fetch body, and the deferred-response handler)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/sandbox-session.ts lines 118-120 (generateSessionId export — already in scope from existing import at line 26 of sandbox-layout.tsx)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Pitfall 6 (lines 592-601) — Why NOT localStorage; React useState runtime-only
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Implementation note (lines 842-846) — disable in-browser Path A/B sim for v4
  </read_first>
  <action>
    1. Open `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx`.

    2. Add import of `generateSessionId` if not already present (line 26 already imports `getLastAgentId, setLastAgentId` from same module). Update to:
       ```typescript
       import { getLastAgentId, setLastAgentId, generateSessionId } from '@/lib/sandbox/sandbox-session'
       ```

    3. Add runtime-only `sandboxLockSessionId` React state. Locate the existing `useState` block (around line 56-83 — the existing `const [queuedMessages, setQueuedMessages] = useState<string[]>([])` and surrounding state declarations). Add after the `queuedMessages` state:

       ```typescript
       // Standalone: debounce-v2-sandbox-integration / Plan 02 (D-03 + D-09 + Pitfall 6).
       // Runtime-only sandbox session id used as the LOCK identifier (lock:{ws}:whatsapp:sandbox-{id}).
       // NOT persisted to localStorage — localStorage is origin-scoped and Tab A + Tab B of
       // the same workspace would share it, breaking D-09 (independence between sandbox tabs).
       // Each tab generates its own id on mount via React useState lazy init.
       // localStorage is still used for SavedSandboxSession (conversation save/reload UX) —
       // that is a SEPARATE concern from the lock id.
       const [sandboxLockSessionId] = useState(() => generateSessionId())
       ```

    4. Update the POST fetch body to include `sandboxSessionId: sandboxLockSessionId`. Locate the existing fetch call (around lines 360-372):

       ```typescript
       const response = await fetch('/api/sandbox/process', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           message: content,
           state: stateRef.current,
           history,
           turnNumber,
           crmAgents: enabledCrmAgents,
           workspaceId: workspaceRef.current?.id,
           agentId: agentIdRef.current,
           sandboxSessionId: sandboxLockSessionId,  // NEW — Plan 02 D-03
         }),
       })
       ```

    5. Handle `deferred: true` response. Locate the existing `const result: SandboxEngineResult = await response.json()` line (around line 374). Wrap with a deferred-check branch BEFORE the existing logic:

       ```typescript
       const rawJson = await response.json() as
         | SandboxEngineResult
         | { success: true; deferred: true; sandboxSessionId: string; reason: string; pendingListLength: number }

       let result: SandboxEngineResult

       if ('deferred' in rawJson && rawJson.deferred === true) {
         // ============================================================
         // Standalone: debounce-v2-sandbox-integration / Plan 02 (D-07).
         // FOLLOWER path: this request was queued via pushToPending; the HOLDER
         // (a previous inflight request for the same lock key) will process
         // both messages combined and write the result to
         // sandbox-result:{sandboxLockSessionId}. Long-poll the lock-result
         // endpoint up to 30s.
         // ============================================================
         try {
           const pollResp = await fetch(`/api/sandbox/lock-result/${rawJson.sandboxSessionId}`)
           const pollJson = await pollResp.json() as
             | { ready: true; result: SandboxEngineResult }
             | { ready: false; timeout?: true; error?: string }

           if ('ready' in pollJson && pollJson.ready === true && pollJson.result) {
             result = pollJson.result
           } else {
             // Timeout or Redis error — surface as a chat-visible error.
             setIsTyping(false)
             const errorNote: SandboxMessage = {
               id: `msg-${Date.now()}-system-deferred-timeout`,
               role: 'assistant',
               content: `[SANDBOX V4: respuesta combinada no llegó en 30s — el HOLDER puede seguir procesando o se cayó. Reintentar enviando un nuevo mensaje.]`,
               timestamp: new Date().toISOString(),
             }
             setMessages(prev => [...prev, errorNote])
             return  // bail; nothing to render in result
           }
         } catch (pollErr) {
           setIsTyping(false)
           const errorNote: SandboxMessage = {
             id: `msg-${Date.now()}-system-deferred-error`,
             role: 'assistant',
             content: `[SANDBOX V4: error en long-poll — ${pollErr instanceof Error ? pollErr.message : String(pollErr)}]`,
             timestamp: new Date().toISOString(),
           }
           setMessages(prev => [...prev, errorNote])
           return
         }
       } else {
         result = rawJson as SandboxEngineResult
       }
       ```

       This block REPLACES the single `const result: SandboxEngineResult = await response.json()` line (currently line 374). All downstream logic (`const clientLatencyMs = ...`, `if (result.debugTurn) {...}`, the template send-with-delays loop, etc.) operates on the now-typed `result` variable and is UNCHANGED.

    6. **Do NOT change** the in-browser Path A/B simulation at line 334 (`if (isTyping && agentIdRef.current === 'somnio-sales-v3')`). Per RESEARCH §Implementation note 842-846, the v3 condition stays, and v4 NEVER enters this branch because the condition strictly matches `'somnio-sales-v3'`. The v4 server lock owns interruption now — adding v4 to this client-side branch would double-handle. The acceptance criterion `grep "somnio-sales-v4" sandbox-layout.tsx` MUST show NO match inside the queuedMessages branch.

    7. **Sanity check:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep "sandbox-layout\.tsx" | head -10
       ```
       MUST report zero new errors.

    8. **Pitfall 6 verification:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       # Verify sandboxLockSessionId is in React useState, NOT in localStorage.
       grep -nE "localStorage.*sandboxLockSessionId|sandboxLockSessionId.*localStorage" src/app/\(dashboard\)/sandbox/components/sandbox-layout.tsx
       # Expected: 0 matches.
       ```

    9. **Regla 6 — verify the v3 queuedMessages branch is unchanged:**
       ```bash
       grep -n "agentIdRef.current === 'somnio-sales-v" src/app/\(dashboard\)/sandbox/components/sandbox-layout.tsx
       # Expected: line 334 should show 'somnio-sales-v3' literal; NO new line with 'somnio-sales-v4' inside queuedMessages branch.
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "sandboxLockSessionId" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -c "useState(() => generateSessionId())" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -c "sandboxSessionId: sandboxLockSessionId" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -c "'deferred' in rawJson" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -c "/api/sandbox/lock-result/" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -cE "localStorage.*sandboxLockSessionId|sandboxLockSessionId.*localStorage" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -c "agentIdRef.current === 'somnio-sales-v4'" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && grep -c "import.*generateSessionId.*from '@/lib/sandbox/sandbox-session'" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "sandbox-layout\.tsx")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "sandboxLockSessionId" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ≥ 3 (declaration + body field + state-read-on-mount).
    - `grep -c "useState(() => generateSessionId())" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` == 1 (lazy init — Pitfall 6).
    - `grep -c "sandboxSessionId: sandboxLockSessionId" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ≥ 1 (POST body includes it — D-03).
    - `grep -c "'deferred' in rawJson" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ≥ 1 (deferred handling — D-07).
    - `grep -c "/api/sandbox/lock-result/" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ≥ 1 (long-poll URL).
    - **Pitfall 6 anti-localStorage gate:** `grep -cE "localStorage.*sandboxLockSessionId|sandboxLockSessionId.*localStorage" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` == 0.
    - **Regla 6 in-browser sim gate:** `grep -c "agentIdRef.current === 'somnio-sales-v4'" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` == 0 (v4 NEVER enters the v3 queuedMessages branch).
    - `grep -c "import.*generateSessionId.*from '@/lib/sandbox/sandbox-session'" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ≥ 1 (import added).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "sandbox-layout\.tsx"` reports ZERO new errors.
  </acceptance_criteria>
  <done>Sandbox UI generates runtime sandboxLockSessionId on mount, sends it in every POST body, handles deferred=true response by long-polling /api/sandbox/lock-result/[id], shows timeout/error notes. v3 client-side path-A sim untouched (Regla 6).</done>
  <atomic_commit>feat(sandbox-ui): runtime sandboxLockSessionId + deferred response long-poll (D-03 + D-07 + Pitfall 6)</atomic_commit>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for all 4 modified files (types.ts + route.ts + sandbox-layout.tsx + lock-result/[id]/route.ts).
2. **Regla 6 + D-15 byte-identity gates:**
   ```bash
   git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l                              # MUST be 0
   git diff --stat main -- src/inngest/functions/v2-lock-cleanup-cron.ts | wc -l                       # MUST be 0
   git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts | wc -l                       # MUST be 0
   git diff --stat main -- src/lib/whatsapp/webhook-handler.ts src/lib/manychat/webhook-handler.ts | wc -l   # MUST be 0
   git diff --stat main -- src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts | wc -l   # MUST be 0
   ```
3. **D-12 sin migración:**
   ```bash
   git diff --stat main -- supabase/migrations/ | wc -l  # MUST be 0
   ```
4. **D-13 sin feature flag:**
   ```bash
   git diff main -- src/app/api/sandbox/process/route.ts | grep -iE "feature.flag|platform_config" | wc -l  # MUST be 0
   ```
5. **D-02 Option C compliance (no LockChannel union extension):**
   ```bash
   grep -rn "channel: 'sandbox'\|LockChannel = 'sandbox'\|'sandbox' as LockChannel" src/app/api/sandbox/ src/app/\(dashboard\)/sandbox/ src/lib/agents/somnio-v4/  # MUST return 0 matches
   ```
6. **TriggerKind extension landed (WARNING 1):**
   ```bash
   grep -c "'sandbox'" src/lib/observability/types.ts  # MUST be ≥ 1
   ```
7. **Existing interruption-v2 unit tests still green:**
   ```bash
   npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -5  # exits 0; 6 suites green
   ```
8. **Smoke compile sanity:**
   ```bash
   pnpm next build 2>&1 | tail -30  # exits 0; new route /api/sandbox/lock-result/[sandboxSessionId] appears in build output
   ```
</verification>

<success_criteria>
- 3 files edited (types.ts + route.ts + sandbox-layout.tsx) + 1 NEW file (lock-result/[id]/route.ts).
- TriggerKind union extended with 'sandbox' literal (Task 2.0 — WARNING 1 fix).
- v4 branch in route.ts performs HOLDER/FOLLOWER discrimination + collector wrap (triggerKind: 'sandbox') + threads 5 lock fields to engine.
- New long-poll endpoint auth-gated, polls Redis 300ms, 30s timeout.
- Sandbox UI generates runtime-only sandboxLockSessionId, sends in body, handles deferred response.
- D-01 + D-02 Option C + D-03 + D-06 + D-07 + D-09 + D-10 + D-12 + D-13 + D-15 all green.
- Regla 6 byte-identity preserved on all non-v4 branches of route.ts + on production webhook + production runner + module.
</success_criteria>

<push_to_vercel>
After all 4 atomic commits land, push (Regla 1):
```bash
git push origin HEAD:main
```
The change is sandbox-only — production WhatsApp path is byte-identical. v4 is DORMANT in prod (0 workspaces flipped). Sandbox traffic in prod = 1-2 internal users testing manually = zero risk surface for real clients.
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-sandbox-integration/02-SUMMARY.md` documenting:
- Exact line numbers used for: route.ts v4 branch (new shape), lock-result endpoint, sandbox-layout useState placement, fetch body update, deferred response handler.
- Confirmation that Task 2.0's TriggerKind extension landed cleanly and `triggerKind: 'sandbox'` is now type-safe at the Task 2.1 collector init site.
- Final LOC delta (target ~+156/-1 across 4 files).
- Confirmation that Regla 6 + D-15 + D-12 + D-13 zero-diff gates all passed.
- Confirmation that pnpm next build compiles cleanly with the new dynamic route.
- Cross-reference to Plan 03 (debug-panel wiring of sandboxSessionId) + Plan 04 (vitest tests for HOLDER/FOLLOWER, including L1/L2 long-poll endpoint tests added per WARNING 2).
</output>
</content>
